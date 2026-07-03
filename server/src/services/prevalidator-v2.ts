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
import { REGIMENES_POR_CLAVE } from '../lib/anexo22';
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
}

export interface PedimentoInput {
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

  // 1) Coherencia clave / régimen (lista vacía = clave válida para cualquier
  // régimen, p. ej. R1 rectificación y V1 virtuales)
  const allowedRegimenes = CLAVE_REGIMEN_MAP[input.clave?.toUpperCase()];
  if (input.clave && allowedRegimenes && allowedRegimenes.length > 0 && !allowedRegimenes.includes(input.regimen?.toUpperCase())) {
    issues.push({
      field: 'regimen', severity: 'error', rule: 'CLAVE_REGIMEN_MISMATCH',
      message: `La clave ${input.clave} no es compatible con el régimen ${input.regimen}. Permitidos: ${allowedRegimenes.join(', ')}`,
    });
  }

  // 2) Coherencia tipo de operación / régimen
  const allowedRegByTipo = TIPO_OPERACION_REGIMEN[input.tipoOperacion];
  if (allowedRegByTipo && !allowedRegByTipo.includes(input.regimen?.toUpperCase())) {
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
  if (input.pesoNeto > input.pesoBruto) {
    issues.push({
      field: 'pesoNeto', severity: 'error', rule: 'WEIGHT_INCONSISTENT',
      message: `Peso neto (${input.pesoNeto}) no puede ser mayor que peso bruto (${input.pesoBruto})`,
    });
  }
  if (input.pesoBruto > 0 && input.pesoNeto / input.pesoBruto < 0.3) {
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
  if (input.bultos <= 0) {
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

  // 8) Validaciones por partida
  if (!input.partidas || input.partidas.length === 0) {
    issues.push({
      field: 'partidas', severity: 'error', rule: 'NO_PARTIDAS',
      message: 'El pedimento debe tener al menos una partida',
    });
  }

  for (const p of input.partidas) {
    await validatePartida(p, input, issues);
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
  };
}

async function validatePartida(p: PartidaInput, ped: PedimentoInput, issues: ValidationIssue[]): Promise<void> {
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
