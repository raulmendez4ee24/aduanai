/**
 * PRE-GLOSA — cruces por partida (Operación 2026-08, Ola 1).
 *
 * Reglas deterministas que cruzan la partida contra catálogos que YA existen
 * en la plataforma (no copian listas):
 *   ORIGEN_TRATADO       — origen vs tratado: motor del Cotizador (quoter.getPreferentialRates + lib/treaties)
 *   CUOTA_EXPORTADOR     — cuota compensatoria por exportador (AntidumpingDuty.exportadorTasas + specificProducer)
 *   UMC_UMT              — unidad comercial vs unidad de tarifa (Apéndice 7 + Fraction.unit)
 *   PRECIO_ESTIMADO      — precio estimado SHCP (price-validator, Art. 84-A LA)
 *   IDENTIFICADOR_AP8    — identificadores obligatorios (Apéndice 8)
 *
 * Cada cruce declara fundamento y estado `evaluado | no_evaluado` con motivo:
 * sin dato → no_evaluado, jamás dispara por defecto.
 */
import { claveUnidadMedida, factorConversion, UNIDADES_MEDIDA, CLAVES_IMMEX } from '../lib/anexo22';
import { getPreferentialRates } from './quoter';
import { resolverTasaPorExportador, type AntidumpingCheckResult } from './antidumping';
import type { EstimatedPriceMatch } from './price-validator';

export type CruceCodigo = 'ORIGEN_TRATADO' | 'CUOTA_EXPORTADOR' | 'UMC_UMT' | 'PRECIO_ESTIMADO' | 'IDENTIFICADOR_AP8';

export interface CruceGlosa {
  codigo: CruceCodigo;
  nombre: string;
  estado: 'evaluado' | 'no_evaluado';
  /** Solo con estado evaluado. */
  resultado?: 'ok' | 'observacion' | 'hallazgo';
  severidad?: 'low' | 'medium' | 'high' | 'critical';
  mensaje: string;
  fundamento: string;
  cotejoFundamento: 'verificado' | 'pendiente';
  /** Motivo cuando no_evaluado. */
  motivo?: string;
  datos?: Record<string, unknown>;
}

export interface FraccionCatalogo {
  unit: string | null;
  tariffNMF: number | null;
  tariffTMEC: number | null;
  tariffTLCUE: number | null;
  tariffCPTPP: number | null;
  noms: string[];
}

export interface CrucesInput {
  fractionCode: string;
  countryOrigin: string;
  regimenCode: string;
  unitValueUSD: number;
  appliesTMEC?: boolean;
  /** Tratado declarado explícitamente (TMEC | TLCUEM | CPTPP). Si solo viene appliesTMEC → TMEC. */
  tratadoDeclarado?: string;
  exportadorNombre?: string;
  identificadores?: { codigo: string; complemento1?: string; complemento2?: string }[];
  unidadComercial?: string;   // clave Apéndice 7 o símbolo
  unidadTarifa?: string;      // clave Apéndice 7 o símbolo
  cantidadUmc?: number;
  cantidadUmt?: number;
  declaresAntidumping?: boolean;
}

export interface CrucesContexto {
  fraccion: FraccionCatalogo | null;
  cuotas: AntidumpingCheckResult[] | null;   // null = dominio no revisado
  precioEstimado: EstimatedPriceMatch | null | undefined; // undefined = dominio no revisado
}

const LA = 'Ley Aduanera (reforma DOF 19-11-2025)';

export function evaluarCruces(input: CrucesInput, ctx: CrucesContexto): CruceGlosa[] {
  return [
    cruceOrigenTratado(input, ctx),
    cruceCuotaExportador(input, ctx),
    cruceUmcUmt(input, ctx),
    crucePrecioEstimado(input, ctx),
    cruceIdentificadoresAp8(input, ctx),
  ];
}

// ── 1. Origen vs tratado ──────────────────────────────────────────────────
export function cruceOrigenTratado(input: CrucesInput, ctx: CrucesContexto): CruceGlosa {
  const base = {
    codigo: 'ORIGEN_TRATADO' as const,
    nombre: 'Origen declarado vs tratado aplicable',
    fundamento: 'Art. 36-A fracción I inciso c) y Art. 54 LA (documentos de origen); reglas de origen del tratado; lib/treaties.ts (T-MEC, TLCUEM vigencia cotejada 2026-07-19)',
    cotejoFundamento: 'pendiente' as const,
  };
  const tratado = (input.tratadoDeclarado ?? (input.appliesTMEC ? 'TMEC' : '')).toUpperCase();
  if (!ctx.fraccion) {
    return { ...base, estado: 'no_evaluado', mensaje: 'Sin catálogo de la fracción.', motivo: 'No se pudo leer las tasas preferenciales de la fracción en el catálogo TIGIE local.' };
  }
  if (!input.countryOrigin) {
    return { ...base, estado: 'no_evaluado', mensaje: 'Sin país de origen.', motivo: 'La partida no declara país de origen.' };
  }
  const nmf = ctx.fraccion.tariffNMF ?? 0;
  const prefs = getPreferentialRates(input.countryOrigin, nmf, ctx.fraccion) ?? [];
  const disponibles = prefs.filter(p => p.available).map(p => p.treaty);
  if (tratado) {
    const hit = prefs.find(p => p.treaty === tratado);
    if (!hit) {
      return {
        ...base, estado: 'evaluado', resultado: 'hallazgo', severidad: 'high',
        mensaje: `Se declara preferencia ${tratado} con origen ${input.countryOrigin.toUpperCase()}, que NO es parte de ese tratado según el motor del Cotizador. Corrige el origen o retira la preferencia.`,
        datos: { tratado, origen: input.countryOrigin, tratadosDelOrigen: prefs.map(p => p.treaty) },
      };
    }
    if (!hit.available) {
      return {
        ...base, estado: 'evaluado', resultado: 'hallazgo', severidad: 'medium',
        mensaje: `El origen ${input.countryOrigin.toUpperCase()} sí es parte de ${tratado}, pero la preferencia no está disponible: ${hit.note ?? 'sin tasa preferencial en el catálogo para esta fracción'}.`,
        datos: { tratado, nota: hit.note },
      };
    }
    return {
      ...base, estado: 'evaluado', resultado: 'ok',
      mensaje: `Origen ${input.countryOrigin.toUpperCase()} congruente con ${tratado}: tasa preferencial ${hit.igi}% vs NMF ${nmf}%. Debe existir certificación de origen válida vinculada.`,
      datos: { tratado, igiPreferencial: hit.igi, nmf },
    };
  }
  if (disponibles.length > 0) {
    return {
      ...base, estado: 'evaluado', resultado: 'observacion', severidad: 'low',
      mensaje: `El origen ${input.countryOrigin.toUpperCase()} tiene preferencia disponible (${disponibles.join(', ')}) y la partida no la declara. Si cuenta con certificación de origen, evalúa aplicarla; si no, es correcto pagar NMF ${nmf}%.`,
      datos: { tratadosDisponibles: disponibles, nmf },
    };
  }
  return { ...base, estado: 'evaluado', resultado: 'ok', mensaje: `Origen ${input.countryOrigin.toUpperCase()} sin tratado aplicable en el motor del Cotizador: tasa NMF ${nmf}%.`, datos: { nmf } };
}

// ── 2. Cuota compensatoria por exportador ─────────────────────────────────
export function cruceCuotaExportador(input: CrucesInput, ctx: CrucesContexto): CruceGlosa {
  const base = {
    codigo: 'CUOTA_EXPORTADOR' as const,
    nombre: 'Cuota compensatoria por exportador/productor',
    fundamento: 'Arts. 62-65 LCE (cuotas compensatorias definitivas por exportador); Art. 178 LA; resoluciones UPCI/SE en DOF',
    cotejoFundamento: 'pendiente' as const,
  };
  if (ctx.cuotas === null) {
    return { ...base, estado: 'no_evaluado', mensaje: 'Cuotas no consultadas.', motivo: 'El dominio cuotas_compensatorias no pudo revisarse.' };
  }
  if (ctx.cuotas.length === 0) {
    return { ...base, estado: 'evaluado', resultado: 'ok', mensaje: `Sin cuota compensatoria vigente para ${input.fractionCode} origen ${input.countryOrigin.toUpperCase()} en el corpus (match exacto de fracción).` };
  }
  const c = ctx.cuotas[0]!;
  const res = resolverTasaPorExportador(c.duty, input.exportadorNombre);
  const declarada = input.declaresAntidumping === true;
  const sev = res.origen === 'exportador' ? 'high' : 'critical';
  const ref = c.duty.resolutionNumber ?? c.duty.expedienteUPCI ?? 's/n';
  if (res.origen === 'exportador') {
    return {
      ...base, estado: 'evaluado', resultado: declarada ? 'observacion' : 'hallazgo', severidad: declarada ? 'medium' : sev,
      mensaje: `Cuota ${ref}: el exportador "${res.empresa}" tiene tasa específica ${res.tasa} ${res.rateUnit} (la general es ${c.duty.rate} ${c.duty.rateUnit}).${declarada ? ' Verifica que el monto declarado use la tasa de la empresa.' : ' La partida NO declara cuota compensatoria.'}`,
      datos: { tasa: res.tasa, rateUnit: res.rateUnit, empresa: res.empresa, tasaGeneral: c.duty.rate, resolucion: ref },
    };
  }
  const notaGeneral = res.origen === 'general_sin_lista'
    ? 'La resolución no tiene tasas por empresa cargadas (pendiente de fuente UPCI): se aplica la tasa general.'
    : input.exportadorNombre
      ? `El exportador "${input.exportadorNombre}" no aparece con tasa específica en la resolución: se aplica la tasa general.`
      : 'La partida no trae nombre de exportador: no se pudo buscar tasa específica, se aplica la tasa general.';
  return {
    ...base, estado: 'evaluado', resultado: declarada ? 'observacion' : 'hallazgo', severidad: declarada ? 'medium' : sev,
    mensaje: `Cuota ${ref} vigente: tasa general ${c.duty.rate} ${c.duty.rateUnit}. ${notaGeneral}${declarada ? '' : ' La partida NO declara cuota compensatoria.'}`,
    datos: { tasa: res.tasa, rateUnit: res.rateUnit, origen: res.origen, resolucion: ref },
  };
}

// ── 3. UMC vs UMT ─────────────────────────────────────────────────────────
export function cruceUmcUmt(input: CrucesInput, ctx: CrucesContexto): CruceGlosa {
  const base = {
    codigo: 'UMC_UMT' as const,
    nombre: 'Unidad comercial vs unidad de tarifa',
    fundamento: 'Anexo 22 RGCE 2026, Apéndice 7 (unidades de medida, pendiente de cotejo verbatim); unidad de la fracción en LIGIE 2026',
    cotejoFundamento: 'pendiente' as const,
  };
  const umt = claveUnidadMedida(input.unidadTarifa);
  const umc = claveUnidadMedida(input.unidadComercial);
  const umtFrac = claveUnidadMedida(ctx.fraccion?.unit);
  if (!input.unidadTarifa && !input.unidadComercial) {
    return { ...base, estado: 'no_evaluado', mensaje: 'Sin unidades de medida.', motivo: 'La partida no trae UMC ni UMT (importa el archivo M3 o captúralas).' };
  }
  const nombre = (k: string | null) => k ? (UNIDADES_MEDIDA.find(u => u.clave === k)?.descripcion ?? k) : '—';
  if (umt && umtFrac && umt !== umtFrac) {
    return {
      ...base, estado: 'evaluado', resultado: 'hallazgo', severidad: 'high',
      mensaje: `La unidad de tarifa declarada (${nombre(umt)}) no coincide con la unidad de la fracción en el catálogo (${ctx.fraccion?.unit} → ${nombre(umtFrac)}).`,
      datos: { umt, umtFraccion: umtFrac },
    };
  }
  if (umc && umt && input.cantidadUmc != null && input.cantidadUmt != null) {
    const f = factorConversion(umc, umt);
    if (f === null) {
      return { ...base, estado: 'no_evaluado', mensaje: `UMC ${nombre(umc)} → UMT ${nombre(umt)}: conversión no verificable.`, motivo: `El catálogo no conoce un factor físico entre ${nombre(umc)} y ${nombre(umt)} (p. ej. piezas→kilos depende del producto).` };
    }
    const esperado = input.cantidadUmc * f;
    const tol = Math.max(0.01, esperado * 0.005);
    if (Math.abs(esperado - input.cantidadUmt) > tol) {
      return {
        ...base, estado: 'evaluado', resultado: 'hallazgo', severidad: 'medium',
        mensaje: `Cantidad en UMT (${input.cantidadUmt} ${nombre(umt)}) no corresponde a la UMC (${input.cantidadUmc} ${nombre(umc)} × ${f} = ${esperado}).`,
        datos: { umc, umt, factor: f, esperado, declarado: input.cantidadUmt },
      };
    }
    return { ...base, estado: 'evaluado', resultado: 'ok', mensaje: `UMC ${nombre(umc)} y UMT ${nombre(umt)} congruentes (${umc === umt ? 'misma unidad' : `factor ${f}`}).`, datos: { umc, umt, factor: f } };
  }
  if (!umtFrac && umt) {
    return { ...base, estado: 'no_evaluado', mensaje: `UMT declarada ${nombre(umt)}; la fracción no tiene unidad reconocible en el catálogo local.`, motivo: `Fraction.unit = "${ctx.fraccion?.unit ?? '—'}" no mapea al Apéndice 7.` };
  }
  if (umt && umtFrac) {
    return { ...base, estado: 'evaluado', resultado: 'ok', mensaje: `Unidad de tarifa ${nombre(umt)} coincide con la fracción. Sin cantidades para verificar la conversión UMC→UMT.` };
  }
  return { ...base, estado: 'no_evaluado', mensaje: 'Unidades no reconocidas.', motivo: `UMC "${input.unidadComercial ?? ''}" / UMT "${input.unidadTarifa ?? ''}" no reconocidas en el Apéndice 7.` };
}

// ── 4. Precio estimado SHCP ───────────────────────────────────────────────
export function crucePrecioEstimado(input: CrucesInput, ctx: CrucesContexto): CruceGlosa {
  const base = {
    codigo: 'PRECIO_ESTIMADO' as const,
    nombre: 'Precio estimado SHCP (Art. 84-A LA)',
    fundamento: 'Art. 84-A y 86-A LA (garantía por precios estimados); Anexo de precios estimados SHCP vigente en el corpus (price-validator)',
    cotejoFundamento: 'pendiente' as const,
  };
  if (ctx.precioEstimado === undefined) {
    return { ...base, estado: 'no_evaluado', mensaje: 'Precio estimado no consultado.', motivo: 'El dominio precio_estimado no pudo revisarse.' };
  }
  if (ctx.precioEstimado === null) {
    return { ...base, estado: 'evaluado', resultado: 'ok', mensaje: `Sin precio estimado registrado para ${input.fractionCode} / ${input.countryOrigin.toUpperCase()}: no aplica garantía por precios estimados.` };
  }
  const est = ctx.precioEstimado;
  const declared = input.unitValueUSD;
  if (!(declared > 0)) {
    return { ...base, estado: 'no_evaluado', mensaje: 'Sin valor unitario.', motivo: 'La partida no trae valor unitario > 0.' };
  }
  const ratio = declared / est.estimatedValue;
  const deltaPct = Math.round((1 - ratio) * 1000) / 10;
  const fuente = est.decree ? `${est.decree} (${est.source})` : est.source;
  if (ratio < 0.8) {
    return {
      ...base, estado: 'evaluado', resultado: 'hallazgo', severidad: 'critical',
      mensaje: `Valor unitario USD ${declared.toFixed(2)} está ${deltaPct}% por debajo del precio estimado USD ${est.estimatedValue.toFixed(2)} ${est.unit} (${fuente}): procede garantía en cuenta aduanera (Art. 84-A LA).`,
      datos: { declarado: declared, estimado: est.estimatedValue, unidad: est.unit, ratio, fuente },
    };
  }
  if (ratio < 0.95) {
    return {
      ...base, estado: 'evaluado', resultado: 'observacion', severidad: 'medium',
      mensaje: `Valor unitario USD ${declared.toFixed(2)} está ${deltaPct}% por debajo del precio estimado USD ${est.estimatedValue.toFixed(2)} ${est.unit} (${fuente}). Documenta el precio comercial.`,
      datos: { declarado: declared, estimado: est.estimatedValue, unidad: est.unit, ratio, fuente },
    };
  }
  return { ...base, estado: 'evaluado', resultado: 'ok', mensaje: `Valor unitario dentro de rango vs precio estimado (${Math.round(ratio * 100)}% del estimado USD ${est.estimatedValue.toFixed(2)} ${est.unit}).`, datos: { ratio } };
}

// ── 5. Identificadores Apéndice 8 ─────────────────────────────────────────
export function cruceIdentificadoresAp8(input: CrucesInput, ctx: CrucesContexto): CruceGlosa {
  const base = {
    codigo: 'IDENTIFICADOR_AP8' as const,
    nombre: 'Identificadores obligatorios (Apéndice 8)',
    fundamento: 'Anexo 22 RGCE 2026, Apéndice 8 (catálogo pendiente de cotejo verbatim); Art. 36-A LA',
    cotejoFundamento: 'pendiente' as const,
  };
  if (input.identificadores === undefined) {
    return { ...base, estado: 'no_evaluado', mensaje: 'Sin identificadores capturados.', motivo: 'La partida no trae identificadores (importa el archivo M3 o captúralos).' };
  }
  const codigos = new Set(input.identificadores.map(i => i.codigo.toUpperCase()));
  const faltan: string[] = [];
  if (CLAVES_IMMEX.includes(input.regimenCode.toUpperCase()) && !codigos.has('IM')) faltan.push(`IM (programa IMMEX, clave ${input.regimenCode.toUpperCase()})`);
  if ((ctx.fraccion?.noms.length ?? 0) > 0 && !codigos.has('NM')) faltan.push(`NM (NOM: ${ctx.fraccion!.noms.join(', ')})`);
  const tratado = input.tratadoDeclarado ?? (input.appliesTMEC ? 'TMEC' : '');
  if (tratado && !codigos.has('TL')) faltan.push(`TL (trato preferencial ${tratado})`);
  if (ctx.cuotas && ctx.cuotas.length > 0 && !codigos.has('CC') && !codigos.has('EE')) faltan.push('CC (cuota compensatoria vigente)');
  if (faltan.length === 0) {
    return { ...base, estado: 'evaluado', resultado: 'ok', mensaje: `Identificadores congruentes con clave/fracción (${[...codigos].join(', ') || 'ninguno requerido'}).` };
  }
  return {
    ...base, estado: 'evaluado', resultado: 'hallazgo', severidad: 'high',
    mensaje: `Faltan identificadores obligatorios: ${faltan.join('; ')}.`,
    datos: { faltan, declarados: [...codigos] },
  };
}
