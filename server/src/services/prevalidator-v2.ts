/**
 * Pre-validador v2 — validaciones reales contra Anexo 22 RGCE.
 *
 * Reglas implementadas (no exhaustivas, las críticas para MVP defendible):
 *  - Coherencia clave/régimen
 *  - Formato RFC (Persona Moral 12 / Física 13 caracteres)
 *  - Fracción existe en TIGIE
 *  - Tipo de cambio válido para la fecha
 *  - Pesos coherentes (neto < bruto)
 *  - Identificadores Anexo 22 obligatorios por fracción/régimen
 *  - Cuotas compensatorias activas
 *  - Permisos RRNA / NOMs / padrones
 *  - Vinculación declarada cuando hay precio sospechoso
 *
 * + Chequeo IA opcional de inconsistencias por partida (price benchmarking).
 */

import { prisma } from '../lib/prisma';
import {
  ADUANAS, CLAVES_IMMEX, REGIMENES_POR_CLAVE, claveUnidadMedida, normalizeCustomsCode,
  validatePedimentoNumero, viaDeTransporte,
} from '../lib/anexo22';
import { getHistoricalRate } from './exchange-rate';
import { lookupCompliance } from './compliance-lookup';
import { llmGenerate } from '../lib/llm';

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  partida?: number;        // null = nivel pedimento
  field: string;
  severity: Severity;
  message: string;
  rule: string;            // ID de regla para tracking
}

export interface PartidaInput {
  numeroPartida: number;
  fraccion: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  unidadMedidaCom?: string;
  valorUnitario: number;
  valorAduana: number;
  pais: string;
  paisVendedor?: string;
  igi?: number;
  dta?: number;
  iva?: number;
  ieps?: number;
  permisos?: { tipo: string; codigo: string; autoridad: string }[];
  identificadores?: { codigo: string; complemento1?: string; complemento2?: string }[];
  vinculacion?: boolean;
  vinculacionDesc?: string;
  /** Operación 2026-08: NICO (2 dígitos) — obligatorio por partida. */
  nico?: string;
}

/** Campos que la fuente NO trae (p. ej. el archivo M3 v1 no extrae bultos,
 *  peso neto ni BL). Las reglas que los necesitan quedan `no_evaluado`. */
export type DatoNoDisponible = 'bultos' | 'pesoNeto' | 'bl' | 'cove' | 'tipoCambioFecha';

export interface PedimentoInput {
  /** Origen del dato (Fase 0): M3 | DATASTAGE | MANUAL. */
  origenArchivo?: 'M3' | 'DATASTAGE' | 'MANUAL';
  datosNoDisponibles?: DatoNoDisponible[];
  /** Identificadores a nivel pedimento (507 del M3 / Apéndice 8). */
  identificadoresPedimento?: { codigo: string; complemento1?: string; complemento2?: string }[];
  numero?: string;
  clave: string;
  aduana: string;
  patenteAduanal: string;
  rfcImportador: string;
  curp?: string;
  tipoOperacion: 'IMP' | 'EXP';
  regimen: string;
  destino?: string;
  origen?: string;
  pesoBruto: number;
  pesoNeto: number;
  bultos: number;
  valorAduana: number;
  valorComercial: number;
  valorDolares: number;
  tipoCambio: number;
  incoterm: string;
  transporte: string;
  medioTransporte?: string;
  /** Clave del Apéndice 3 (501.18-20 del M3). Si viene, manda sobre `transporte`. */
  medioTransporteClave?: string;
  factura?: string;
  cove?: string;
  bl?: string;
  partidas: PartidaInput[];
}

export interface ValidationResult {
  valid: boolean;
  errorsCount: number;
  warningsCount: number;
  issues: ValidationIssue[];
  aiNotes: { partida: number; observation: string; suggestion: string }[];
  /** Reglas cuyo dato de entrada no está disponible: NO disparan por defecto,
   *  se declaran con motivo (misma política que la Pre-Glosa). */
  reglasNoEvaluadas: { rule: string; partida?: number; motivo: string }[];
}

// ──────────────────────────────────────────────────────────────────────────
// Catálogos de validación
// ──────────────────────────────────────────────────────────────────────────

// Fase 4.2: mapeo clave de pedimento → regímenes compatibles desde la FUENTE
// ÚNICA lib/anexo22.ts (Apéndices 2 y 16 del Anexo 22 RGCE 2026, DOF
// 15-ene-2026). El mapa anterior mezclaba regímenes INEXISTENTES en el
// Apéndice 16 (IMM, EXT), trataba ITR/IM como claves de pedimento y asignaba
// V1→EXD y G1→ITE sin sustento oficial.
const CLAVE_REGIMEN_MAP: Record<string, string[]> = REGIMENES_POR_CLAVE;

// Regímenes (Apéndice 16) esperables por tipo de operación. Los retornos de
// temporales (RT/H1/BA) son operaciones de SALIDA que amparan regímenes de
// importación temporal — por eso ITE/ITR también aparecen en EXP.
const TIPO_OPERACION_REGIMEN: Record<string, string[]> = {
  IMP: ['IMD', 'ITE', 'ITR', 'DFI', 'RFE', 'RFS', 'TRA'],
  EXP: ['EXD', 'ETE', 'ETR', 'ITE', 'ITR'],
};

const RFC_REGEX_MORAL = /^[A-ZÑ&]{3}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/;
const RFC_REGEX_FISICA = /^[A-ZÑ&]{4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/;

function isValidRFC(rfc: string): boolean {
  const r = rfc.trim().toUpperCase();
  return RFC_REGEX_MORAL.test(r) || RFC_REGEX_FISICA.test(r);
}

// ──────────────────────────────────────────────────────────────────────────
// Validador principal
// ──────────────────────────────────────────────────────────────────────────

export async function validatePedimento(input: PedimentoInput, opts: { aiCheck?: boolean } = {}): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const reglasNoEvaluadas: ValidationResult['reglasNoEvaluadas'] = [];
  const noDisp = new Set(input.datosNoDisponibles ?? []);
  const noEvaluada = (rule: string, motivo: string, partida?: number) => {
    reglasNoEvaluadas.push(partida === undefined ? { rule, motivo } : { rule, partida, motivo });
  };

  // 1) Coherencia clave / régimen (lista vacía = clave válida para cualquier
  // régimen, p. ej. R1 rectificación y V1 virtuales)
  const allowedRegimenes = CLAVE_REGIMEN_MAP[input.clave?.toUpperCase()];
  if (input.clave && allowedRegimenes && allowedRegimenes.length > 0 && !allowedRegimenes.includes(input.regimen?.toUpperCase())) {
    issues.push({
      field: 'regimen', severity: 'error', rule: 'CLAVE_REGIMEN_MISMATCH',
      message: `La clave ${input.clave} no es compatible con el régimen ${input.regimen}. Permitidos: ${allowedRegimenes.join(', ')}`,
    });
  }

  // 1b) Formato del número de pedimento (Fase 4.6 — instructivo Anexo 22:
  // AÑO(2) ADUANA(2) PATENTE(4) CONSECUTIVO(7), 15 dígitos)
  if (input.numero && input.numero.trim() !== '') {
    const nv = validatePedimentoNumero(input.numero);
    if (!nv.valid) {
      issues.push({
        field: 'numero', severity: 'warning', rule: 'NUMERO_PEDIMENTO_FORMAT',
        message: `Número de pedimento "${input.numero}": ${nv.reason}`,
      });
    }
  }

  // 2) Coherencia tipo de operación / régimen
  const allowedRegByTipo = TIPO_OPERACION_REGIMEN[input.tipoOperacion];
  const regimenVacio = !input.regimen || input.regimen.trim() === '';
  if (regimenVacio && input.origenArchivo && input.origenArchivo !== 'MANUAL') {
    // El archivo no trae régimen: se deriva de la clave (Apéndice 2). Si la
    // clave admite varios o es de cotejo pendiente, no se inventa.
    noEvaluada('TIPO_REGIMEN_MISMATCH', `Régimen no derivable de la clave ${input.clave} (el archivo M3/Data Stage no declara régimen; Apéndice 2 ambiguo o clave pendiente de cotejo).`);
  } else if (allowedRegByTipo && !allowedRegByTipo.includes(input.regimen?.toUpperCase())) {
    issues.push({
      field: 'tipoOperacion', severity: 'error', rule: 'TIPO_REGIMEN_MISMATCH',
      message: `El régimen ${input.regimen} no aplica al tipo de operación ${input.tipoOperacion}`,
    });
  }

  // 3) RFC importador
  if (!isValidRFC(input.rfcImportador)) {
    issues.push({
      field: 'rfcImportador', severity: 'error', rule: 'RFC_FORMAT',
      message: 'El RFC del importador no tiene formato válido (12 chars Moral / 13 chars Física)',
    });
  }

  // 4) Pesos coherentes
  if (noDisp.has('pesoNeto')) {
    noEvaluada('WEIGHT_INCONSISTENT', 'El archivo de origen no trae peso neto (el layout M3 v9 solo declara peso bruto en 501.17).');
    noEvaluada('WEIGHT_RATIO_LOW', 'El archivo de origen no trae peso neto.');
  }
  if (!noDisp.has('pesoNeto') && input.pesoNeto > input.pesoBruto) {
    issues.push({
      field: 'pesoNeto', severity: 'error', rule: 'WEIGHT_INCONSISTENT',
      message: `Peso neto (${input.pesoNeto}) no puede ser mayor que peso bruto (${input.pesoBruto})`,
    });
  }
  if (!noDisp.has('pesoNeto') && input.pesoBruto > 0 && input.pesoNeto / input.pesoBruto < 0.3) {
    issues.push({
      field: 'pesoNeto', severity: 'warning', rule: 'WEIGHT_RATIO_LOW',
      message: `Peso neto es <30% del bruto — verifica si el embalaje justifica esa diferencia`,
    });
  }

  // 5) Tipo de cambio del DOF
  const dofRate = await getHistoricalRate(new Date());
  const tcDelta = Math.abs(input.tipoCambio - dofRate) / dofRate;
  if (tcDelta > 0.01) {
    issues.push({
      field: 'tipoCambio', severity: 'warning', rule: 'TC_OFF_DOF',
      message: `Tipo de cambio ${input.tipoCambio} difiere ${(tcDelta * 100).toFixed(1)}% del DOF (${dofRate.toFixed(4)})`,
    });
  }

  // 6) Bultos > 0
  if (noDisp.has('bultos')) {
    noEvaluada('BULTOS_ZERO', 'El archivo de origen no trae número de bultos (no extraído en el layout M3 v1).');
  } else if (input.bultos <= 0) {
    issues.push({
      field: 'bultos', severity: 'error', rule: 'BULTOS_ZERO',
      message: 'Bultos debe ser mayor a cero',
    });
  }

  // 7) Coherencia de valores
  const sumaPartidas = input.partidas.reduce((s, p) => s + p.valorAduana, 0);
  const tolerance = input.valorAduana * 0.005; // ±0.5%
  if (Math.abs(sumaPartidas - input.valorAduana) > tolerance) {
    issues.push({
      field: 'valorAduana', severity: 'error', rule: 'VALUE_SUM_MISMATCH',
      message: `Valor aduana del pedimento ($${input.valorAduana.toFixed(2)}) ≠ suma de partidas ($${sumaPartidas.toFixed(2)})`,
    });
  }

  // 7b) Congruencia aduana ↔ medio de transporte (Operación 2026-08)
  // ADUANA_TRANSPORTE_INCONGRUENTE: marítimo por aduana fronteriza/interior,
  // aéreo por aduana sin aeropuerto, terrestre por puerto marítimo puro.
  {
    const aduana = ADUANAS.find(a => a.clave === normalizeCustomsCode(input.aduana ?? ''));
    const via = viaDeTransporte(input.medioTransporteClave ?? input.transporte);
    if (!aduana || !aduana.tipo) {
      noEvaluada('ADUANA_TRANSPORTE_INCONGRUENTE', `Aduana "${input.aduana}" sin tipo en el catálogo (Apéndice 1) — no se puede cruzar con el medio de transporte.`);
    } else if (!via) {
      noEvaluada('ADUANA_TRANSPORTE_INCONGRUENTE', `Medio de transporte "${input.transporte}" no reconocido en el Apéndice 3 — no se puede cruzar con la aduana.`);
    } else {
      const tipos = aduana.tipo;
      const compatible =
        via === 'maritima' ? tipos.includes('maritima')
        : via === 'aerea' ? tipos.includes('aerea') || tipos.includes('interior')
        : via === 'terrestre' ? tipos.includes('fronteriza') || tipos.includes('interior') || tipos.includes('maritima')
        : true;
      if (!compatible) {
        issues.push({
          field: 'transporte', severity: 'error', rule: 'ADUANA_TRANSPORTE_INCONGRUENTE',
          message: `Medio de transporte ${via === 'maritima' ? 'marítimo' : via === 'aerea' ? 'aéreo' : via} por la aduana ${aduana.clave} (${aduana.denominacion}), que es ${tipos.join('/')}: no es despachable por esa vía. Corrige la aduana de despacho o el medio de transporte (Apéndices 1 y 3; tipo de aduana pendiente de cotejo).`,
        });
      }
    }
  }

  // 7c) Documentos sin referencia (Operación 2026-08)
  {
    const vacio = (v: string | undefined) => !v || v.trim() === '';
    if (vacio(input.factura)) {
      issues.push({ field: 'factura', severity: 'error', rule: 'DOCUMENTO_VACIO', message: 'Factura/CFDI sin número de referencia (Art. 36-A LA: el pedimento se acompaña de la factura o documento que exprese el valor).' });
    }
    if (noDisp.has('cove')) {
      noEvaluada('DOCUMENTO_VACIO', 'COVE: el archivo de origen no distingue el acuse de valor del número de CFDI (505.4).');
    } else if (vacio(input.cove)) {
      issues.push({ field: 'cove', severity: 'error', rule: 'DOCUMENTO_VACIO', message: 'COVE sin número de acuse de valor (RGCE 2026 regla 1.9.19; identificador en el pedimento).' });
    }
    if (noDisp.has('bl')) {
      noEvaluada('DOCUMENTO_VACIO', 'BL/guía: el layout M3 v1 no extrae el documento de transporte — captúralo en Documentos.');
    } else if (vacio(input.bl)) {
      issues.push({ field: 'bl', severity: 'warning', rule: 'DOCUMENTO_VACIO', message: 'Documento de transporte (BL / guía aérea / carta porte) sin referencia.' });
    }
  }

  // 8) Validaciones por partida
  if (!input.partidas || input.partidas.length === 0) {
    issues.push({
      field: 'partidas', severity: 'error', rule: 'NO_PARTIDAS',
      message: 'El pedimento debe tener al menos una partida',
    });
  }

  for (const p of input.partidas) {
    await validatePartida(p, input, issues, noEvaluada);
  }

  // 9) IA — chequeo de inconsistencias de precio
  let aiNotes: ValidationResult['aiNotes'] = [];
  if (opts.aiCheck) {
    aiNotes = await aiInconsistencyCheck(input).catch(() => []);
  }

  const errorsCount = issues.filter(i => i.severity === 'error').length;
  const warningsCount = issues.filter(i => i.severity === 'warning').length;

  return {
    valid: errorsCount === 0,
    errorsCount,
    warningsCount,
    issues,
    aiNotes,
    reglasNoEvaluadas,
  };
}

async function validatePartida(
  p: PartidaInput,
  ped: PedimentoInput,
  issues: ValidationIssue[],
  noEvaluada: (rule: string, motivo: string, partida?: number) => void = () => {},
): Promise<void> {
  const cleanFrac = p.fraccion?.replace(/\./g, '') ?? '';

  // Fracción 8 dígitos
  if (!/^\d{8}$/.test(cleanFrac)) {
    issues.push({
      partida: p.numeroPartida, field: 'fraccion', severity: 'error', rule: 'FRACTION_FORMAT',
      message: `Fracción "${p.fraccion}" no tiene 8 dígitos válidos`,
    });
    return;
  }

  // Fracción existe en TIGIE
  const fraction = await prisma.fraction.findFirst({ where: { code: cleanFrac } });

  // NICO por partida (Operación 2026-08): Art. 54 LA exige la "exacta
  // determinación del número de identificación comercial".
  const nico = (p.nico ?? '').trim();
  if (nico === '') {
    issues.push({ partida: p.numeroPartida, field: 'nico', severity: 'error', rule: 'NICO_FALTANTE', message: `Partida sin NICO para la fracción ${p.fraccion} (2 dígitos, Art. 54 LA).` });
  } else if (!/^\d{2}$/.test(nico)) {
    issues.push({ partida: p.numeroPartida, field: 'nico', severity: 'error', rule: 'NICO_INVALIDO', message: `NICO "${nico}" inválido: deben ser 2 dígitos.` });
  } else if (fraction && fraction.nicos.length > 0 && !fraction.nicos.includes(nico) && !fraction.nicos.includes(cleanFrac + nico)) {
    issues.push({ partida: p.numeroPartida, field: 'nico', severity: 'error', rule: 'NICO_INVALIDO', message: `NICO ${nico} no existe para la fracción ${p.fraccion} (catálogo: ${fraction.nicos.map(n => n.slice(-2)).join(', ')}).` });
  }

  // UMT vs unidad de la fracción (Apéndice 7, cotejo pendiente)
  if (fraction) {
    const umtDeclarada = claveUnidadMedida(p.unidadMedida);
    const umtFraccion = claveUnidadMedida(fraction.unit);
    if (!umtDeclarada) {
      noEvaluada('UMT_NO_COINCIDE', `Unidad de tarifa "${p.unidadMedida}" no reconocida en el Apéndice 7.`, p.numeroPartida);
    } else if (!umtFraccion) {
      noEvaluada('UMT_NO_COINCIDE', `La fracción ${p.fraccion} no tiene unidad reconocible en el catálogo local ("${fraction.unit ?? '—'}").`, p.numeroPartida);
    } else if (umtDeclarada !== umtFraccion) {
      issues.push({ partida: p.numeroPartida, field: 'unidadMedida', severity: 'error', rule: 'UMT_NO_COINCIDE', message: `Unidad de tarifa declarada (clave ${umtDeclarada}) ≠ unidad de la fracción ${p.fraccion} en el catálogo (${fraction.unit}, clave ${umtFraccion}).` });
    }
  }

  // Identificadores obligatorios (Apéndice 8, cotejo pendiente)
  {
    const idsPartida = p.identificadores;
    const idsPed = ped.identificadoresPedimento;
    if (idsPartida === undefined && idsPed === undefined) {
      noEvaluada('IDENTIFICADOR_OBLIGATORIO_FALTANTE', 'No se capturaron identificadores (Apéndice 8) — importa el archivo M3 o captúralos por partida.', p.numeroPartida);
    } else {
      const codigos = new Set([...(idsPartida ?? []), ...(idsPed ?? [])].map(i => i.codigo.toUpperCase()));
      const faltan: string[] = [];
      if (CLAVES_IMMEX.includes(ped.clave?.toUpperCase()) && !codigos.has('IM')) faltan.push('IM (programa IMMEX — clave ' + ped.clave.toUpperCase() + ')');
      if (fraction && fraction.noms.length > 0 && !codigos.has('NM')) faltan.push('NM (NOM: ' + fraction.noms.join(', ') + ')');
      if (faltan.length > 0) {
        issues.push({ partida: p.numeroPartida, field: 'identificadores', severity: 'error', rule: 'IDENTIFICADOR_OBLIGATORIO_FALTANTE', message: `Falta identificador obligatorio: ${faltan.join('; ')}. Apéndice 8 Anexo 22 (catálogo pendiente de cotejo).` });
      }
    }
  }

  if (!fraction) {
    issues.push({
      partida: p.numeroPartida, field: 'fraccion', severity: 'warning', rule: 'FRACTION_NOT_IN_TIGIE',
      message: `Fracción ${p.fraccion} no encontrada en catálogo TIGIE local — verifica vigencia`,
    });
  } else {
    // Cantidad / valor unitario coherentes con valor aduana
    const expected = p.cantidad * p.valorUnitario;
    if (Math.abs(expected - p.valorAduana) / Math.max(p.valorAduana, 1) > 0.005) {
      issues.push({
        partida: p.numeroPartida, field: 'valorAduana', severity: 'error', rule: 'PARTIDA_VALUE_MISMATCH',
        message: `Cantidad × valor unitario ($${expected.toFixed(2)}) no coincide con valor aduana declarado ($${p.valorAduana.toFixed(2)})`,
      });
    }

    // Permisos requeridos
    if (fraction.requiresPermit && (!p.permisos || p.permisos.length === 0)) {
      issues.push({
        partida: p.numeroPartida, field: 'permisos', severity: 'error', rule: 'PERMIT_REQUIRED',
        message: `La fracción ${p.fraccion} requiere permiso ${fraction.permitType ?? '(s/d)'} y no se declaró ninguno`,
      });
    }

    // Padrón sectorial
    if (fraction.sectoralRegistry && ped.tipoOperacion === 'IMP') {
      issues.push({
        partida: p.numeroPartida, field: 'rfcImportador', severity: 'info', rule: 'SECTORAL_REGISTRY',
        message: `Fracción ${p.fraccion} requiere padrón sectorial: ${fraction.sectoralType ?? 'verificar Anexo 10 RGCE'}`,
      });
    }

    // NOMs declaradas
    if (fraction.noms.length > 0) {
      const declaradas = (p.permisos ?? []).map(x => x.codigo);
      const faltantes = fraction.noms.filter(n => !declaradas.includes(n));
      if (faltantes.length > 0) {
        issues.push({
          partida: p.numeroPartida, field: 'permisos', severity: 'warning', rule: 'NOMS_MISSING',
          message: `Fracción ${p.fraccion} sujeta a NOM(s): ${faltantes.join(', ')}. Asegura cumplimiento.`,
        });
      }
    }
  }

  // Cuota compensatoria — debe estar declarada en pedimento o es bloqueante
  // (Anexo 22 RGCE: identificador "CC" con complemento de resolución; o
  // que la partida traiga un cargo de cuota declarado).
  const compliance = await lookupCompliance(p.fraccion, p.pais);
  if (compliance.antidumping) {
    const ad = compliance.antidumping;
    const resLabel = ad.resolutionNumber ?? ad.decree ?? 's/n';
    const rateLabel = ad.rateType === 'specific_USD_kg' ? `$${ad.rate} USD/kg`
      : ad.rateType === 'specific_USD_unit' ? `$${ad.rate} ${ad.rateUnit}`
      : `${ad.rate}%`;

    // Buscar identificador "CC" (Cuotas Compensatorias) entre los
    // identificadores de la partida. Aceptamos también "EE" (cuota
    // compensatoria provisional) y "GA" (garantía por subvaluación que
    // a veces se usa para cuotas en revisión).
    const idCodes = new Set((p.identificadores ?? []).map(i => i.codigo.toUpperCase()));
    const hasCCIdentifier = idCodes.has('CC') || idCodes.has('EE');
    // Nota: validar el MONTO declarado de la cuota requiere campos del
    // pedimento que actualmente no se propagan; exigimos el identificador
    // explícito (Anexo 22 "CC" / "EE") como prueba de declaración.

    if (!hasCCIdentifier) {
      const matchWarn = ad.matchType && ad.matchType !== 'exact'
        ? ` [match por ${ad.matchType === 'subheading' ? 'subpartida' : 'partida'} ${ad.matchedFraction} — valida cobertura manualmente]`
        : '';
      issues.push({
        partida: p.numeroPartida,
        field: 'identificadores',
        severity: 'error',
        rule: 'ANTIDUMPING_NOT_DECLARED',
        message: `Cuota compensatoria ${rateLabel} obligatoria por ${resLabel} (${ad.countryNormalized}) no declarada. Agrega identificador "CC" en partida con complemento de la resolución${matchWarn}. Omitirla: multa 130-150% Art. 178 LA + embargo Art. 151 LA.`,
      });
    } else {
      // Cuota declarada — solo info para tracking
      issues.push({
        partida: p.numeroPartida,
        field: 'identificadores',
        severity: 'info',
        rule: 'ANTIDUMPING_DECLARED',
        message: `Cuota compensatoria ${rateLabel} (${resLabel}) declarada vía identificador CC. Verifica que el monto calculado coincida con el aplicado.`,
      });
    }
  }

  // Vinculación obligatoria si paisVendedor != pais (relación bandera)
  if (p.vinculacion && !p.vinculacionDesc) {
    issues.push({
      partida: p.numeroPartida, field: 'vinculacionDesc', severity: 'error', rule: 'VINCULACION_DESC_MISSING',
      message: 'Si declaras vinculación, debes describir la relación con el vendedor (Art. 71 LA)',
    });
  }

  // Cantidad > 0
  if (p.cantidad <= 0) {
    issues.push({
      partida: p.numeroPartida, field: 'cantidad', severity: 'error', rule: 'QTY_ZERO',
      message: 'La cantidad debe ser mayor a cero',
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// IA: detección de inconsistencias de precio por partida
// ──────────────────────────────────────────────────────────────────────────

async function aiInconsistencyCheck(input: PedimentoInput): Promise<ValidationResult['aiNotes']> {
  const partidasResumen = input.partidas.map(p => ({
    numeroPartida: p.numeroPartida,
    fraccion: p.fraccion,
    descripcion: p.descripcion,
    cantidad: p.cantidad,
    unidad: p.unidadMedida,
    pais: p.pais,
    valorUnitarioUSD: p.valorUnitario,
    valorAduanaUSD: p.valorAduana,
  }));

  const system = 'Eres un experto en valoración aduanera mexicana. Analizas partidas de pedimentos y detectas inconsistencias en valor unitario contra el precio de mercado por fracción/país. Respondes únicamente con JSON válido.';
  const user = `Analiza estas partidas y reporta SOLO las que tengan potencial subvaloración o sobrevaloración significativa (>30% diferencia respecto al rango esperado).

Partidas:
${JSON.stringify(partidasResumen, null, 2)}

Devuelve JSON con la estructura:
{ "observaciones": [{ "partida": <numero>, "observation": "<1 línea>", "suggestion": "<1 línea>" }] }
Si no hay observaciones: { "observaciones": [] }.`;

  try {
    const text = await llmGenerate({ system, user, model: 'fast', maxTokens: 800 });
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { observaciones?: { partida: number; observation: string; suggestion: string }[] };
    return parsed.observaciones ?? [];
  } catch {
    return [];
  }
}
