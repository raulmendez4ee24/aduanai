/**
 * ORIGEN T-MEC — "lo que hace real una determinación" (Ola 2, Operación 2026-08).
 *
 * Este módulo completa al analizador (`origin-analyzer.ts`, que ya calcula el
 * VCR bien) con lo que un dictamen de origen necesita para sostenerse:
 *
 *   1. SALTO ARANCELARIO por material (CC / CTH / CTSH) a partir del BOM del
 *      catálogo (`Product` + `ProductComponent`): cada material no originario
 *      se compara contra la fracción del bien final. Sin fracción del material
 *      → "no determinable: falta fracción del material" (nunca se asume).
 *   2. DE MINIMIS (Art. 4.12 T-MEC): los materiales no originarios que NO
 *      cumplen el salto pueden ignorarse si su valor ≤ X % del valor de
 *      transacción. El corpus legal del producto NO contiene el texto del
 *      Art. 4.12 (cotejado 27-ago-2026 contra `LegalDocument.reference`), así
 *      que el porcentaje es un PARÁMETRO editable (default 10) y el resultado
 *      lleva `cotejo: 'pendiente'` visible. Excepciones del tratado (textiles
 *      caps. 50-63 por peso, ciertos agroalimentarios) NO se evalúan aquí:
 *      se señalan como no evaluadas.
 *   3. ACUMULACIÓN (Art. 4.11): un material originario de MX/US/CA cuenta como
 *      originario (`esMiembroTMEC` de `lib/treaties.ts`, fuente única).
 *   4. AUTOMOTRIZ (Anexo 4-B): LVC y acero/aluminio — se evalúan cuando la
 *      regla trae umbral; si la regla no lo trae, se muestra el faltante.
 *   5. PIPELINE de carga de reglas específicas (Excel/CSV) con validación y
 *      `cotejo` por fila, y REPORTE DE COBERTURA (qué capítulos/partidas tienen
 *      regla cargada y cuáles no). No siembra reglas nuevas: la plantilla y el
 *      reporte son el camino para cargar el Anexo 4-B con fuente.
 *
 * Funciones puras arriba (testeables sin DB); acceso a datos abajo.
 */

import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { esMiembroTMEC } from '../lib/treaties';
import { lookupOriginRule, type OriginRuleMatch } from './origin-analyzer';

// ─────────────────────────── Tipos ───────────────────────────

export type CodigoSalto = 'CC' | 'CTH' | 'CTSH';
export const CODIGOS_SALTO: readonly CodigoSalto[] = ['CC', 'CTH', 'CTSH'];

export interface MaterialBOM {
  /** id del Product componente (si viene del catálogo). */
  productId?: string | null;
  productCode?: string | null;
  descripcion: string;
  /** 8 dígitos sin puntos; null = el material no tiene fracción en el catálogo. */
  fractionCode: string | null;
  /** ISO-2 / nombre; null = origen no capturado. */
  paisOrigen: string | null;
  /** Valor USD del material por unidad de bien final (opcional: de minimis lo necesita). */
  valorUSD?: number | null;
  cantidad?: number | null;
  unidad?: string | null;
}

export interface EvaluacionMaterial {
  material: MaterialBOM;
  /** true = cuenta como originario por acumulación (MX/US/CA). */
  originario: boolean;
  /** 'cumple' | 'no_cumple' | 'no_determinable' | 'no_aplica' (originario). */
  salto: 'cumple' | 'no_cumple' | 'no_determinable' | 'no_aplica';
  motivo: string;
  /** Enlace al catálogo para completar el dato (cuando falta fracción). */
  enlaceCatalogo?: string;
}

export interface ResultadoSalto {
  codigo: CodigoSalto;
  fraccionFinal: string;
  resultado: 'cumple' | 'no_cumple' | 'no_determinable';
  porMaterial: EvaluacionMaterial[];
  resumen: { total: number; originarios: number; noOriginarios: number; cumplen: number; noCumplen: number; noDeterminables: number };
  mensaje: string;
}

export interface ResultadoDeMinimis {
  aplica: boolean | null;
  porcentajeUmbral: number;
  porcentajeCalculado: number | null;
  valorNoCumplenUSD: number;
  valorTransaccionUSD: number | null;
  fundamento: string;
  /** El corpus no trae el Art. 4.12: el umbral es un parámetro y se dice. */
  cotejo: 'pendiente';
  aviso: string;
  excepcionesNoEvaluadas: string[];
}

export interface ResultadoAutomotriz {
  aplica: boolean;
  categoria: string | null;
  lvc: { requerido: number | null; calculado: number | null; cumple: boolean | null; faltante: string | null };
  aceroAluminio: { requerido: number | null; calculado: number | null; cumple: boolean | null; faltante: string | null };
}

// ─────────────────────── 1. Salto arancelario ───────────────────────

const limpiar = (f: string | null | undefined) => (f ?? '').replace(/[^0-9]/g, '');

/** ¿El material (fracción) cumple el cambio de clasificación exigido respecto al bien final? */
export function cumpleSalto(fraccionFinal: string, fraccionMaterial: string, codigo: CodigoSalto): boolean {
  const a = limpiar(fraccionFinal), b = limpiar(fraccionMaterial);
  const n = codigo === 'CC' ? 2 : codigo === 'CTH' ? 4 : 6;
  if (a.length < n || b.length < n) return false;
  return a.slice(0, n) !== b.slice(0, n);
}

/** Etiqueta legible del nivel exigido. */
export function nivelDeSalto(codigo: CodigoSalto): string {
  return codigo === 'CC' ? 'capítulo (2 dígitos)' : codigo === 'CTH' ? 'partida (4 dígitos)' : 'subpartida (6 dígitos)';
}

/**
 * Deriva el código de salto de una regla. Si `tariffShiftCode` no está cargado
 * se intenta inferir de la descripción del cambio; si no se puede, null (la
 * UI pide cargar la regla, no se asume).
 */
export function codigoSaltoDeRegla(rule: Pick<OriginRuleMatch, 'tariffShiftCode' | 'tariffShift'> | null): CodigoSalto | null {
  if (!rule) return null;
  const c = (rule.tariffShiftCode ?? '').toUpperCase().trim();
  if (CODIGOS_SALTO.includes(c as CodigoSalto)) return c as CodigoSalto;
  const t = (rule.tariffShift ?? '').toLowerCase();
  if (/subpartida/.test(t)) return 'CTSH';
  if (/cap[ií]tulo/.test(t) && !/partida/.test(t.replace(/cap[ií]tulo/g, ''))) return 'CC';
  if (/partida/.test(t)) return 'CTH';
  return null;
}

export function evaluarSaltoArancelario(args: {
  fraccionFinal: string;
  materiales: MaterialBOM[];
  codigo: CodigoSalto;
}): ResultadoSalto {
  const { codigo } = args;
  const fraccionFinal = limpiar(args.fraccionFinal);
  const porMaterial: EvaluacionMaterial[] = args.materiales.map(m => {
    const originario = !!m.paisOrigen && esMiembroTMEC(m.paisOrigen);
    if (originario) {
      return { material: m, originario: true, salto: 'no_aplica', motivo: `Originario por acumulación (${m.paisOrigen!.toUpperCase()} es parte del T-MEC, Art. 4.11): no requiere salto.` };
    }
    const frac = limpiar(m.fractionCode);
    if (frac.length < 6) {
      return {
        material: m, originario: false, salto: 'no_determinable',
        motivo: frac.length === 0
          ? 'No determinable: falta la fracción del material. Cárgala en el catálogo de partes.'
          : `No determinable: la fracción "${m.fractionCode}" del material no tiene al menos 6 dígitos.`,
        enlaceCatalogo: m.productId ? `/catalogo?productId=${encodeURIComponent(m.productId)}` : '/catalogo',
      };
    }
    const ok = cumpleSalto(fraccionFinal, frac, codigo);
    const origenTxt = m.paisOrigen ? m.paisOrigen.toUpperCase() : 'origen no capturado (se trata como no originario)';
    return {
      material: m, originario: false, salto: ok ? 'cumple' : 'no_cumple',
      motivo: ok
        ? `${frac.slice(0, 6)} → ${fraccionFinal.slice(0, 6)}: cambia de ${nivelDeSalto(codigo)} (${origenTxt}).`
        : `${frac.slice(0, 6)} → ${fraccionFinal.slice(0, 6)}: misma ${nivelDeSalto(codigo).split(' ')[0]} — NO cumple ${codigo} (${origenTxt}).`,
    };
  });
  const resumen = {
    total: porMaterial.length,
    originarios: porMaterial.filter(p => p.originario).length,
    noOriginarios: porMaterial.filter(p => !p.originario).length,
    cumplen: porMaterial.filter(p => p.salto === 'cumple').length,
    noCumplen: porMaterial.filter(p => p.salto === 'no_cumple').length,
    noDeterminables: porMaterial.filter(p => p.salto === 'no_determinable').length,
  };
  let resultado: ResultadoSalto['resultado'];
  let mensaje: string;
  if (resumen.noCumplen > 0) {
    resultado = 'no_cumple';
    mensaje = `${resumen.noCumplen} material(es) no originario(s) NO cumple(n) el cambio ${codigo}. Revisa de minimis o la alternativa por VCR.`;
  } else if (resumen.noDeterminables > 0) {
    resultado = 'no_determinable';
    mensaje = `${resumen.noDeterminables} material(es) sin fracción: el salto no se puede determinar hasta capturarla en el catálogo.`;
  } else if (resumen.noOriginarios === 0 && resumen.total > 0) {
    resultado = 'cumple';
    mensaje = 'Todos los materiales son originarios (acumulación): no hay material no originario que evaluar.';
  } else if (resumen.total === 0) {
    resultado = 'no_determinable';
    mensaje = 'El BOM no tiene componentes: no hay materiales que evaluar.';
  } else {
    resultado = 'cumple';
    mensaje = `Todos los materiales no originarios (${resumen.noOriginarios}) cumplen el cambio ${codigo}.`;
  }
  return { codigo, fraccionFinal, resultado, porMaterial, resumen, mensaje };
}

// ─────────────────────── 2. De minimis ───────────────────────

export const DE_MINIMIS_DEFAULT_PCT = 10;
export const DE_MINIMIS_FUNDAMENTO = 'Art. 4.12 T-MEC (de minimis) — texto NO disponible en el corpus del producto; umbral como parámetro.';

export function evaluarDeMinimis(args: {
  valorTransaccionUSD: number | null | undefined;
  /** Materiales no originarios que NO cumplen el salto. */
  materialesQueNoCumplen: MaterialBOM[];
  porcentajeUmbral?: number;
  fraccionFinal?: string;
}): ResultadoDeMinimis {
  const pct = Number.isFinite(args.porcentajeUmbral) && (args.porcentajeUmbral as number) > 0 && (args.porcentajeUmbral as number) <= 100
    ? (args.porcentajeUmbral as number) : DE_MINIMIS_DEFAULT_PCT;
  const sinValor = args.materialesQueNoCumplen.filter(m => m.valorUSD == null || !Number.isFinite(m.valorUSD));
  const valorNoCumplen = args.materialesQueNoCumplen.reduce((s, m) => s + (Number.isFinite(m.valorUSD as number) ? (m.valorUSD as number) : 0), 0);
  const tv = args.valorTransaccionUSD != null && Number.isFinite(args.valorTransaccionUSD) && args.valorTransaccionUSD > 0 ? args.valorTransaccionUSD : null;
  const excepciones: string[] = [];
  const cap = limpiar(args.fraccionFinal).slice(0, 2);
  if (cap && Number(cap) >= 50 && Number(cap) <= 63) excepciones.push('Textiles (caps. 50-63): el de minimis del T-MEC se mide por PESO de fibras/hilados, no por valor — no evaluado aquí.');
  if (cap && ['04', '15', '17', '18', '19', '20', '21', '22'].includes(cap)) excepciones.push('Ciertos agroalimentarios (caps. 4, 15-22) tienen exclusiones de de minimis — no evaluado aquí.');

  const base = {
    porcentajeUmbral: pct, valorNoCumplenUSD: Math.round(valorNoCumplen * 100) / 100, valorTransaccionUSD: tv,
    fundamento: DE_MINIMIS_FUNDAMENTO, cotejo: 'pendiente' as const, excepcionesNoEvaluadas: excepciones,
    aviso: `Umbral ${pct}% ${pct === DE_MINIMIS_DEFAULT_PCT ? '(default)' : '(editado por el usuario)'} — pendiente de cotejo contra el texto oficial del Art. 4.12.`,
  };
  if (args.materialesQueNoCumplen.length === 0) {
    return { ...base, aplica: null, porcentajeCalculado: 0, aviso: 'No hay materiales que fallen el salto: de minimis no es necesario.' };
  }
  if (!tv) return { ...base, aplica: null, porcentajeCalculado: null, aviso: 'No determinable: falta el valor de transacción del bien final.' };
  if (sinValor.length > 0) {
    return { ...base, aplica: null, porcentajeCalculado: null, aviso: `No determinable: ${sinValor.length} material(es) que fallan el salto no tienen valor USD capturado.` };
  }
  const calc = Math.round((valorNoCumplen / tv) * 1000) / 10;
  return { ...base, aplica: calc <= pct, porcentajeCalculado: calc };
}

// ─────────────────────── 3. Automotriz (LVC / acero-aluminio) ───────────────────────

export function evaluarAutomotriz(rule: OriginRuleMatch | null, input: {
  productValue?: number | null;
  highWageLaborCost?: number | null;
  totalSteelAluminumValue?: number | null;
  northAmericanSteelAluminumValue?: number | null;
}): ResultadoAutomotriz {
  if (!rule?.isAutomotive) {
    return {
      aplica: false, categoria: null,
      lvc: { requerido: null, calculado: null, cumple: null, faltante: null },
      aceroAluminio: { requerido: null, calculado: null, cumple: null, faltante: null },
    };
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  // LVC
  let lvcCalc: number | null = null;
  let lvcFalt: string | null = null;
  if (input.highWageLaborCost == null) lvcFalt = 'Falta el costo de mano de obra pagada a ≥ $16 USD/hr.';
  else if (!input.productValue || input.productValue <= 0) lvcFalt = 'Falta el valor del bien final para calcular el LVC.';
  else lvcCalc = r1((input.highWageLaborCost / input.productValue) * 100);
  if (rule.laborValueContent == null) lvcFalt = (lvcFalt ? lvcFalt + ' ' : '') + 'La regla cargada no trae umbral LVC (Anexo 4-B, Apéndice automotriz): cárgalo con fuente.';
  const lvcCumple = lvcCalc != null && rule.laborValueContent != null ? lvcCalc >= rule.laborValueContent : null;
  // Acero/aluminio
  let saCalc: number | null = null;
  let saFalt: string | null = null;
  if (input.totalSteelAluminumValue == null || input.northAmericanSteelAluminumValue == null) saFalt = 'Faltan las compras totales de acero/aluminio y las de origen norteamericano.';
  else if (input.totalSteelAluminumValue <= 0) saFalt = 'Las compras totales de acero/aluminio deben ser > 0.';
  else saCalc = r1((input.northAmericanSteelAluminumValue / input.totalSteelAluminumValue) * 100);
  if (rule.steelAluminumPercent == null) saFalt = (saFalt ? saFalt + ' ' : '') + 'La regla cargada no trae el % de acero/aluminio norteamericano: cárgalo con fuente.';
  const saCumple = saCalc != null && rule.steelAluminumPercent != null ? saCalc >= rule.steelAluminumPercent : null;
  return {
    aplica: true, categoria: rule.autoCategory,
    lvc: { requerido: rule.laborValueContent, calculado: lvcCalc, cumple: lvcCumple, faltante: lvcFalt },
    aceroAluminio: { requerido: rule.steelAluminumPercent, calculado: saCalc, cumple: saCumple, faltante: saFalt },
  };
}

// ─────────────────────── 4. Determinación integral desde el BOM ───────────────────────

export interface DeterminacionBOM {
  producto: { id: string; productCode: string; description: string; fractionCode: string | null; paisOrigen: string | null; clienteId: string | null };
  tratado: string;
  regla: OriginRuleMatch | null;
  codigoSalto: CodigoSalto | null;
  salto: ResultadoSalto | null;
  deMinimis: ResultadoDeMinimis | null;
  acumulacion: { originarios: MaterialBOM[]; nota: string };
  automotriz: ResultadoAutomotriz;
  veredicto: 'cumple' | 'cumple_de_minimis' | 'no_cumple' | 'no_determinable' | 'sin_regla' | 'sin_fraccion';
  motivo: string;
  faltantes: string[];
  disclaimer: string;
}

export const DISCLAIMER_BOM = 'Determinación preliminar sobre el BOM del catálogo. El de minimis usa un umbral parametrizado pendiente de cotejo; la alternativa por VCR se calcula en la pestaña Calculadora con los valores de cada material.';

export async function determinarOrigenDesdeBOM(args: {
  tenantId: string;
  productId: string;
  tratado?: string;
  porcentajeDeMinimis?: number;
  valorTransaccionUSD?: number | null;
  /** Valores USD por componente (id → USD) capturados en la UI cuando el catálogo no los tiene. */
  valores?: Record<string, number>;
  highWageLaborCost?: number | null;
  totalSteelAluminumValue?: number | null;
  northAmericanSteelAluminumValue?: number | null;
}): Promise<DeterminacionBOM | null> {
  const tratado = args.tratado ?? 'TMEC';
  const p = await prisma.product.findFirst({
    where: { id: args.productId, tenantId: args.tenantId },
    include: { components: { include: { component: { select: { id: true, productCode: true, description: true, fractionCode: true, paisOrigen: true, unit: true } } } } },
  });
  if (!p) return null;
  const producto = { id: p.id, productCode: p.productCode, description: p.description, fractionCode: p.fractionCode, paisOrigen: p.paisOrigen, clienteId: p.clienteId };
  const materiales: MaterialBOM[] = p.components.map(c => ({
    productId: c.component.id,
    productCode: c.component.productCode,
    descripcion: c.component.description,
    fractionCode: c.component.fractionCode,
    paisOrigen: c.component.paisOrigen,
    valorUSD: args.valores?.[c.component.id] ?? null,
    cantidad: c.quantity,
    unidad: c.unit,
  }));
  const faltantes: string[] = [];
  const acumulacion = {
    originarios: materiales.filter(m => m.paisOrigen && esMiembroTMEC(m.paisOrigen)),
    nota: 'Acumulación (Art. 4.11 T-MEC): los materiales originarios de México, Estados Unidos o Canadá cuentan como originarios sin evaluar salto.',
  };
  const base = { producto, tratado, acumulacion, disclaimer: DISCLAIMER_BOM };
  if (!p.fractionCode) {
    return { ...base, regla: null, codigoSalto: null, salto: null, deMinimis: null, automotriz: evaluarAutomotriz(null, {}), veredicto: 'sin_fraccion', motivo: 'El producto terminado no tiene fracción en el catálogo.', faltantes: ['Fracción del producto terminado'] };
  }
  const regla = await lookupOriginRule(p.fractionCode, tratado);
  const automotriz = evaluarAutomotriz(regla, {
    productValue: args.valorTransaccionUSD, highWageLaborCost: args.highWageLaborCost,
    totalSteelAluminumValue: args.totalSteelAluminumValue, northAmericanSteelAluminumValue: args.northAmericanSteelAluminumValue,
  });
  if (automotriz.lvc.faltante) faltantes.push(`LVC: ${automotriz.lvc.faltante}`);
  if (automotriz.aceroAluminio.faltante) faltantes.push(`Acero/aluminio: ${automotriz.aceroAluminio.faltante}`);
  if (!regla) {
    return { ...base, regla: null, codigoSalto: null, salto: null, deMinimis: null, automotriz, veredicto: 'sin_regla', motivo: `Sin regla específica cargada para ${p.fractionCode} bajo ${tratado}. Carga el Anexo 4-B con fuente (Admin → Origen → Importar reglas).`, faltantes: [...faltantes, `Regla específica de producto para ${p.fractionCode} (${tratado})`] };
  }
  const codigo = codigoSaltoDeRegla(regla);
  if (!codigo) {
    const motivo = regla.ruleType === 'wholly_obtained'
      ? 'La regla es "totalmente obtenido": no aplica salto arancelario; verifica que TODOS los materiales sean originarios.'
      : regla.ruleType === 'rvc'
        ? 'La regla es solo por VCR: no hay salto arancelario que evaluar; usa la Calculadora con los valores.'
        : `La regla cargada no trae código de salto (CC/CTH/CTSH) determinable: "${regla.tariffShift ?? regla.description}".`;
    const veredicto: DeterminacionBOM['veredicto'] = regla.ruleType === 'wholly_obtained'
      ? (materiales.length > 0 && acumulacion.originarios.length === materiales.length ? 'cumple' : 'no_determinable')
      : 'no_determinable';
    return { ...base, regla, codigoSalto: null, salto: null, deMinimis: null, automotriz, veredicto, motivo, faltantes: [...faltantes, ...(regla.ruleType === 'combined' || regla.ruleType === 'tariff_shift' ? ['Código de salto (tariffShiftCode) en la regla'] : [])] };
  }
  const salto = evaluarSaltoArancelario({ fraccionFinal: p.fractionCode, materiales, codigo });
  const fallan = salto.porMaterial.filter(m => m.salto === 'no_cumple').map(m => m.material);
  const deMinimis = evaluarDeMinimis({ valorTransaccionUSD: args.valorTransaccionUSD, materialesQueNoCumplen: fallan, porcentajeUmbral: args.porcentajeDeMinimis, fraccionFinal: p.fractionCode });
  for (const m of salto.porMaterial) if (m.salto === 'no_determinable') faltantes.push(`Fracción del material ${m.material.productCode ?? m.material.descripcion}`);

  let veredicto: DeterminacionBOM['veredicto'];
  let motivo: string;
  if (salto.resultado === 'cumple') { veredicto = 'cumple'; motivo = salto.mensaje; }
  else if (salto.resultado === 'no_determinable') { veredicto = 'no_determinable'; motivo = salto.mensaje; }
  else if (deMinimis.aplica === true) {
    veredicto = 'cumple_de_minimis';
    motivo = `${salto.mensaje} Los materiales que fallan valen ${deMinimis.porcentajeCalculado}% del valor de transacción ≤ ${deMinimis.porcentajeUmbral}% (de minimis, ${deMinimis.cotejo === 'pendiente' ? 'umbral pendiente de cotejo' : 'cotejado'}).`;
  } else if (deMinimis.aplica === false) {
    veredicto = 'no_cumple';
    motivo = `${salto.mensaje} De minimis no alcanza: ${deMinimis.porcentajeCalculado}% > ${deMinimis.porcentajeUmbral}%.${regla.rvcRequired != null ? ` Alternativa: VCR ≥ ${regla.rvcRequired}% (Calculadora).` : ''}`;
  } else {
    veredicto = 'no_determinable';
    motivo = `${salto.mensaje} ${deMinimis.aviso}`;
    faltantes.push('Valor de transacción y valor USD de los materiales que fallan el salto (para de minimis)');
  }
  // Automotriz: si aplica y algún requisito falla, el veredicto positivo no se sostiene.
  if ((veredicto === 'cumple' || veredicto === 'cumple_de_minimis') && automotriz.aplica) {
    if (automotriz.lvc.cumple === false || automotriz.aceroAluminio.cumple === false) {
      veredicto = 'no_cumple';
      motivo += ' Falla un requisito automotriz del Anexo 4-B (LVC o acero/aluminio).';
    } else if (automotriz.lvc.cumple === null || automotriz.aceroAluminio.cumple === null) {
      veredicto = 'no_determinable';
      motivo += ' Requisitos automotrices (LVC / acero-aluminio) sin evaluar: ver faltantes.';
    }
  }
  return { ...base, regla, codigoSalto: codigo, salto, deMinimis, automotriz, veredicto, motivo, faltantes };
}

// ─────────────────────── 5. Cobertura de reglas ───────────────────────

export interface ReglaMinima { fractionCode: string; matchType: string; agreement: string; ruleType: string; tariffShiftCode: string | null; active?: boolean }

export type NivelCobertura = 'fraccion' | 'subpartida' | 'partida' | 'capitulo' | 'sin_regla';

export interface CoberturaFraccion {
  fraccion: string;
  nivel: NivelCobertura;
  regla: ReglaMinima | null;
  mensaje: string;
}

/** Misma precedencia que `lookupOriginRule`: exacta 8 → prefijo 6 → 4 → 2. Pura. */
export function coberturaDeFraccion(reglas: ReglaMinima[], fraccion: string, tratado = 'TMEC'): CoberturaFraccion {
  const f = limpiar(fraccion);
  const activas = reglas.filter(r => r.agreement === tratado && r.active !== false);
  const buscar = (code: string, matchType: string) => activas.find(r => r.fractionCode === code && r.matchType === matchType) ?? null;
  if (f.length >= 8) {
    const ex = buscar(f.slice(0, 8), 'exact');
    if (ex) return { fraccion: f, nivel: 'fraccion', regla: ex, mensaje: `Regla exacta para ${f}.` };
  }
  const niveles: [number, NivelCobertura][] = [[6, 'subpartida'], [4, 'partida'], [2, 'capitulo']];
  for (const [n, nivel] of niveles) {
    if (f.length >= n) {
      const r = buscar(f.slice(0, n), 'prefix');
      if (r) return { fraccion: f, nivel, regla: r, mensaje: `Regla a nivel ${nivel} (${f.slice(0, n)}) — ${nivel === 'capitulo' ? 'GENÉRICA de capítulo, no específica de producto' : 'específica'}.` };
    }
  }
  return { fraccion: f, nivel: 'sin_regla', regla: null, mensaje: `Sin regla cargada para ${f || fraccion} bajo ${tratado}.` };
}

export interface CoberturaCapitulo { capitulo: string; reglas: number; niveles: { capitulo: number; partida: number; subpartida: number; fraccion: number }; partidasConRegla: string[] }

export function coberturaPorCapitulo(reglas: ReglaMinima[], tratado = 'TMEC'): { tratado: string; totalReglas: number; capitulosConRegla: number; capitulosSinRegla: string[]; capitulos: CoberturaCapitulo[] } {
  const activas = reglas.filter(r => r.agreement === tratado && r.active !== false);
  const map = new Map<string, CoberturaCapitulo>();
  for (const r of activas) {
    const cap = r.fractionCode.slice(0, 2);
    const c = map.get(cap) ?? { capitulo: cap, reglas: 0, niveles: { capitulo: 0, partida: 0, subpartida: 0, fraccion: 0 }, partidasConRegla: [] };
    c.reglas++;
    const len = r.matchType === 'exact' ? 8 : r.fractionCode.length;
    if (len >= 8) c.niveles.fraccion++; else if (len >= 6) c.niveles.subpartida++; else if (len >= 4) c.niveles.partida++; else c.niveles.capitulo++;
    if (len >= 4) { const part = r.fractionCode.slice(0, 4); if (!c.partidasConRegla.includes(part)) c.partidasConRegla.push(part); }
    map.set(cap, c);
  }
  const capitulos = Array.from(map.values()).sort((a, b) => a.capitulo.localeCompare(b.capitulo));
  const todos = Array.from({ length: 97 }, (_, i) => String(i + 1).padStart(2, '0'));
  const capitulosSinRegla = todos.filter(c => !map.has(c));
  return { tratado, totalReglas: activas.length, capitulosConRegla: capitulos.length, capitulosSinRegla, capitulos };
}

export async function reporteCobertura(tratado = 'TMEC', fracciones: string[] = []): Promise<{
  resumen: ReturnType<typeof coberturaPorCapitulo>;
  consultas: CoberturaFraccion[];
  cotejo: { reglasConFuente: number; reglasSinFuente: number; nota: string };
}> {
  const reglas = await prisma.originRule.findMany({ where: { agreement: tratado }, select: { fractionCode: true, matchType: true, agreement: true, ruleType: true, tariffShiftCode: true, active: true, notes: true } });
  const resumen = coberturaPorCapitulo(reglas, tratado);
  const consultas = fracciones.map(f => coberturaDeFraccion(reglas, f, tratado));
  const conFuente = reglas.filter(r => /fuente:\s*https?:\/\//i.test(r.notes ?? '') || /cotejad[oa]/i.test(r.notes ?? '')).length;
  return {
    resumen, consultas,
    cotejo: { reglasConFuente: conFuente, reglasSinFuente: reglas.length - conFuente, nota: 'OriginRule no tiene columna de fuente/cotejo (SCHEMA REQUERIDO); mientras tanto se detecta "Fuente: http…" o "cotejado" en notes.' },
  };
}

// ─────────────────────── 6. Importación de reglas (Excel/CSV) ───────────────────────

export const COLUMNAS_REGLAS = [
  'fractionCode', 'matchType', 'agreement', 'ruleType', 'description', 'tariffShiftCode', 'tariffShift',
  'rvcRequired', 'rvcRequiredNetCost', 'rvcMethod', 'annex', 'isAutomotive', 'autoCategory', 'laborValueContent', 'steelAluminumPercent', 'notes', 'fuente',
] as const;

const RULE_TYPES = ['wholly_obtained', 'tariff_shift', 'rvc', 'specific_process', 'combined'];
const RVC_METHODS = ['transaction_value', 'net_cost', 'either', 'build_up', 'build_down'];
const AGREEMENTS = ['TMEC', 'TLCUEM', 'CPTPP', 'ALADI', 'AAP'];

export interface FilaReglaValidada {
  fila: number;
  ok: boolean;
  errores: string[];
  cotejo: 'ok' | 'pendiente';
  data: {
    fractionCode: string; matchType: 'exact' | 'prefix'; agreement: string; ruleType: string; description: string;
    tariffShiftCode: string | null; tariffShift: string | null; rvcRequired: number | null; rvcRequiredNetCost: number | null; rvcMethod: string | null;
    annex: string | null; isAutomotive: boolean; autoCategory: string | null; laborValueContent: number | null; steelAluminumPercent: number | null; notes: string | null;
  } | null;
}

const txt = (v: unknown) => (v == null ? '' : String(v)).trim();
const num = (v: unknown): number | null => { const s = txt(v); if (!s) return null; const n = Number(s.replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/** Valida una fila (pura). `cotejo: 'ok'` SOLO si trae fuente http(s). */
export function validarFilaRegla(f: Record<string, unknown>, fila: number): FilaReglaValidada {
  const errores: string[] = [];
  const fractionCode = txt(f.fractionCode).replace(/[^0-9]/g, '');
  const matchTypeRaw = txt(f.matchType).toLowerCase() || (fractionCode.length === 8 ? 'exact' : 'prefix');
  const agreement = (txt(f.agreement) || 'TMEC').toUpperCase();
  const ruleType = txt(f.ruleType).toLowerCase();
  const description = txt(f.description);
  const tariffShiftCode = txt(f.tariffShiftCode).toUpperCase() || null;
  const rvcMethod = txt(f.rvcMethod).toLowerCase() || null;
  const fuente = txt(f.fuente);

  if (!fractionCode || ![2, 4, 6, 8].includes(fractionCode.length)) errores.push('fractionCode debe tener 2, 4, 6 u 8 dígitos');
  if (!['exact', 'prefix'].includes(matchTypeRaw)) errores.push('matchType debe ser exact o prefix');
  if (matchTypeRaw === 'exact' && fractionCode.length !== 8) errores.push('matchType exact exige 8 dígitos');
  if (!AGREEMENTS.includes(agreement)) errores.push(`agreement inválido (${AGREEMENTS.join('/')})`);
  if (!RULE_TYPES.includes(ruleType)) errores.push(`ruleType inválido (${RULE_TYPES.join('/')})`);
  if (!description) errores.push('description vacía');
  if (tariffShiftCode && !CODIGOS_SALTO.includes(tariffShiftCode as CodigoSalto)) errores.push('tariffShiftCode debe ser CC, CTH o CTSH');
  if ((ruleType === 'tariff_shift' || ruleType === 'combined') && !tariffShiftCode) errores.push('tariff_shift/combined exige tariffShiftCode');
  const rvcRequired = num(f.rvcRequired), rvcRequiredNetCost = num(f.rvcRequiredNetCost), lvc = num(f.laborValueContent), sa = num(f.steelAluminumPercent);
  for (const [k, v] of [['rvcRequired', rvcRequired], ['rvcRequiredNetCost', rvcRequiredNetCost], ['laborValueContent', lvc], ['steelAluminumPercent', sa]] as const) {
    if (v != null && (Number.isNaN(v) || v < 0 || v > 100)) errores.push(`${k} debe ser un porcentaje 0-100`);
  }
  if ((ruleType === 'rvc' || ruleType === 'combined') && rvcRequired == null) errores.push('rvc/combined exige rvcRequired');
  if (rvcMethod && !RVC_METHODS.includes(rvcMethod)) errores.push(`rvcMethod inválido (${RVC_METHODS.join('/')})`);
  if (fuente && !/^https?:\/\//i.test(fuente)) errores.push('fuente debe ser una URL http(s) (DOF/SE/USITC) o quedar vacía');
  const cotejo: 'ok' | 'pendiente' = fuente && /^https?:\/\//i.test(fuente) ? 'ok' : 'pendiente';
  const isAutomotive = /^(1|true|s[ií]|x|yes)$/i.test(txt(f.isAutomotive));
  const notesBase = txt(f.notes);
  const notes = [notesBase, fuente ? `Fuente: ${fuente}` : null, `cotejo: ${cotejo}`].filter(Boolean).join(' | ') || null;
  if (errores.length > 0) return { fila, ok: false, errores, cotejo, data: null };
  return {
    fila, ok: true, errores: [], cotejo,
    data: {
      fractionCode, matchType: matchTypeRaw as 'exact' | 'prefix', agreement, ruleType, description,
      tariffShiftCode, tariffShift: txt(f.tariffShift) || null, rvcRequired, rvcRequiredNetCost, rvcMethod,
      annex: txt(f.annex) || null, isAutomotive, autoCategory: txt(f.autoCategory) || null, laborValueContent: lvc, steelAluminumPercent: sa, notes,
    },
  };
}

export function leerFilasReglas(archivoBase64: string, nombreArchivo?: string): Record<string, unknown>[] {
  const esCsv = /\.csv$/i.test(nombreArchivo ?? '');
  const wb = esCsv
    ? XLSX.read(Buffer.from(archivoBase64, 'base64').toString('utf8'), { type: 'string' })
    : XLSX.read(archivoBase64, { type: 'base64' });
  const hoja = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!hoja) return [];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
  const alias: Record<string, string> = {
    fraccion: 'fractionCode', 'fraccion o prefijo': 'fractionCode', prefijo: 'fractionCode', fractioncode: 'fractionCode',
    tipo: 'matchType', matchtype: 'matchType', tratado: 'agreement', agreement: 'agreement',
    ruletype: 'ruleType', 'tipo de regla': 'ruleType', descripcion: 'description', description: 'description',
    tariffshiftcode: 'tariffShiftCode', salto: 'tariffShiftCode', 'codigo salto': 'tariffShiftCode', tariffshift: 'tariffShift', 'texto salto': 'tariffShift',
    rvcrequired: 'rvcRequired', vcr: 'rvcRequired', 'vcr vt': 'rvcRequired', rvcrequirednetcost: 'rvcRequiredNetCost', 'vcr cn': 'rvcRequiredNetCost',
    rvcmethod: 'rvcMethod', metodo: 'rvcMethod', anexo: 'annex', annex: 'annex', notas: 'notes', notes: 'notes', fuente: 'fuente', source: 'fuente', url: 'fuente',
    isautomotive: 'isAutomotive', automotriz: 'isAutomotive', autocategory: 'autoCategory', laborvaluecontent: 'laborValueContent', lvc: 'laborValueContent',
    steelaluminumpercent: 'steelAluminumPercent', 'acero aluminio': 'steelAluminumPercent',
  };
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return filas.map(f => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) out[alias[norm(k)] ?? k] = v;
    return out;
  });
}

export function plantillaReglasXlsx(): Buffer {
  const ejemplo = {
    fractionCode: '8544.30', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Ejemplo — cambio a la subpartida 8544.30 desde cualquier otra subpartida fuera del grupo 8544.11-8544.60; o VCR 60% VT / 50% CN',
    tariffShiftCode: 'CTSH', tariffShift: 'Cambio a la subpartida desde cualquier subpartida fuera del grupo', rvcRequired: 60, rvcRequiredNetCost: 50, rvcMethod: 'either',
    annex: '4-B', isAutomotive: '', autoCategory: '', laborValueContent: '', steelAluminumPercent: '', notes: 'BORRA esta fila de ejemplo antes de importar', fuente: 'https://hts.usitc.gov (General Note 11)',
  };
  const ws = XLSX.utils.json_to_sheet([ejemplo], { header: [...COLUMNAS_REGLAS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'reglas');
  const doc = XLSX.utils.aoa_to_sheet([
    ['Columna', 'Obligatoria', 'Valores'],
    ['fractionCode', 'sí', '2/4/6 dígitos (prefijo) u 8 (exacta); con o sin puntos'],
    ['matchType', 'no', 'exact | prefix (default por longitud)'],
    ['agreement', 'no', 'TMEC (default) | TLCUEM | CPTPP | ALADI | AAP'],
    ['ruleType', 'sí', 'wholly_obtained | tariff_shift | rvc | specific_process | combined'],
    ['description', 'sí', 'texto de la regla como aparece en el anexo'],
    ['tariffShiftCode', 'si tariff_shift/combined', 'CC | CTH | CTSH'],
    ['rvcRequired / rvcRequiredNetCost', 'si rvc/combined', '% 0-100 (VT / CN)'],
    ['rvcMethod', 'no', 'transaction_value | net_cost | either | build_up | build_down'],
    ['fuente', 'no, pero decide el cotejo', 'URL http(s) oficial (DOF/SE/USITC). Sin fuente la regla queda "pendiente de cotejo".'],
  ]);
  XLSX.utils.book_append_sheet(wb, doc, 'instrucciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export interface ReporteImportReglas {
  total: number; validas: number; invalidas: number; creadas: number; actualizadas: number;
  cotejadas: number; pendientesCotejo: number; dryRun: boolean;
  filas: { fila: number; fractionCode: string | null; ok: boolean; errores: string[]; cotejo: 'ok' | 'pendiente'; accion: 'creada' | 'actualizada' | 'rechazada' | 'validada' }[];
}

/** Importa reglas: valida todas; con `dryRun` no escribe. Upsert por (fractionCode, matchType, agreement). */
export async function importarReglasOrigen(d: { archivoBase64: string; nombreArchivo?: string; dryRun?: boolean }): Promise<ReporteImportReglas> {
  if (!d.archivoBase64) throw new Error('archivoBase64 es obligatorio');
  const filas = leerFilasReglas(d.archivoBase64, d.nombreArchivo);
  const rep: ReporteImportReglas = { total: filas.length, validas: 0, invalidas: 0, creadas: 0, actualizadas: 0, cotejadas: 0, pendientesCotejo: 0, dryRun: !!d.dryRun, filas: [] };
  const vistos = new Set<string>();
  for (let i = 0; i < filas.length; i++) {
    const v = validarFilaRegla(filas[i]!, i + 2);
    if (v.ok && v.data) {
      const clave = `${v.data.fractionCode}|${v.data.matchType}|${v.data.agreement}`;
      if (vistos.has(clave)) { v.ok = false; v.errores.push('fila duplicada en el archivo'); }
      vistos.add(clave);
    }
    if (!v.ok || !v.data) {
      rep.invalidas++;
      rep.filas.push({ fila: v.fila, fractionCode: txt(filas[i]!.fractionCode) || null, ok: false, errores: v.errores, cotejo: v.cotejo, accion: 'rechazada' });
      continue;
    }
    rep.validas++;
    if (v.cotejo === 'ok') rep.cotejadas++; else rep.pendientesCotejo++;
    if (d.dryRun) { rep.filas.push({ fila: v.fila, fractionCode: v.data.fractionCode, ok: true, errores: [], cotejo: v.cotejo, accion: 'validada' }); continue; }
    const existente = await prisma.originRule.findFirst({ where: { fractionCode: v.data.fractionCode, matchType: v.data.matchType, agreement: v.data.agreement } });
    if (existente) {
      await prisma.originRule.update({ where: { id: existente.id }, data: { ...v.data, active: true } });
      rep.actualizadas++;
      rep.filas.push({ fila: v.fila, fractionCode: v.data.fractionCode, ok: true, errores: [], cotejo: v.cotejo, accion: 'actualizada' });
    } else {
      await prisma.originRule.create({ data: { ...v.data, active: true } });
      rep.creadas++;
      rep.filas.push({ fila: v.fila, fractionCode: v.data.fractionCode, ok: true, errores: [], cotejo: v.cotejo, accion: 'creada' });
    }
  }
  return rep;
}
