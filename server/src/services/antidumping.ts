/**
 * Servicio de cuotas compensatorias antidumping — versión enriquecida.
 *
 * Soporta 3 tipos de cuota:
 *   - percentage          : aplicada sobre valor en aduana (USD)
 *   - specific_USD_kg     : aplicada sobre peso en kg
 *   - specific_USD_unit   : aplicada sobre número de piezas/pares
 *
 * Devuelve cálculo monetario explícito para integrar en cotizaciones y
 * pre-validador, y marca severidad por monto absoluto + proximidad de expiración.
 */

import { prisma } from '../lib/prisma';
import { normalizeCountry } from './compliance-lookup';
import { formatCuota } from '../lib/cuota-format';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

export interface AntidumpingCheckInput {
  fractionCode: string;
  countryOfOrigin: string;
  valueUSD?: number;
  weightKg?: number;
  units?: number;
}

export interface AntidumpingCheckResult {
  duty: {
    id: string;
    resolutionType: string;
    resolutionNumber: string | null;
    expedienteUPCI: string | null;
    fractionCode: string;
    countryOfOrigin: string;
    productDesc: string | null;
    rateType: string;
    rate: number;
    rateUnit: string;
    status: string;
    investigationType: string | null;
    publishDateDOF: string | null;
    effectiveDate: string | null;
    expiryDate: string | null;
    dofUrl: string | null;
    notes: string | null;
    /** Fase 0: tasas por exportador/productor [{ empresa, tasa, rateUnit }] (null = sin lista cargada). */
    exportadorTasas: ExportadorTasa[] | null;
    specificProducer: string | null;
  };
  calculatedAmountUSD: number | null;
  calculation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  expiringSoon: boolean;
  daysToExpiry: number | null;
  appliesToOperation: boolean;
  /** Cómo se hizo el match contra el corpus de cuotas:
   *  - exact: fracción 8 dígitos exacta
   *  - subheading: 6 dígitos (warning: verificar cobertura)
   *  - heading: 4 dígitos (warning fuerte)
   */
  matchType: 'exact' | 'subheading' | 'heading';
  /** Fracción que coincidió en el corpus (puede diferir del input cuando
   * matchType !== exact). */
  matchedFraction: string;
}

export interface ExportadorTasa { empresa: string; tasa: number; rateUnit?: string }

/** Nombre de empresa normalizado para cruce: mayúsculas, sin acentos, sin
 *  puntuación ni sufijos societarios (S.A. DE C.V., LTD, CO., INC…). */
export function normalizarEmpresa(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,;:'"()\-\/]/g, ' ')
    .replace(/\b(S\s*A\s*(DE)?\s*C\s*V|S\s*DE\s*R\s*L|SA|SAB|SRL|LTD|LIMITED|CO|CORP|CORPORATION|INC|LLC|GMBH|AG|BV|NV|PTE|PTY|CIA|COMPANY|GROUP|GRUPO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TasaResuelta {
  tasa: number;
  rateUnit: string;
  empresa: string | null;
  /** exportador = tasa específica de la empresa; general = hay lista pero la
   *  empresa no está (o no se dio nombre); general_sin_lista = la resolución
   *  no tiene tasas por empresa cargadas. */
  origen: 'exportador' | 'general' | 'general_sin_lista';
  /** Aviso cuando el nombre engancha varias empresas o solo por fragmento
   *  ambiguo: se aplicó la general para no atribuir la tasa de una ajena. */
  aviso?: string;
}

const palabras = (s: string): number => s.split(' ').filter(Boolean).length;

/** Elige la tasa por empresa cuando la resolución la tiene y el pedimento
 *  trae exportador; si no, la general — y lo dice. Match por nombre
 *  normalizado: igualdad exacta, o inclusión (en cualquier sentido) cuando el
 *  fragmento contenido tiene ≥2 palabras Y engancha UNA sola empresa. Un
 *  fragmento de una palabra ("TIANJIN") o que coincida con varias filas NO
 *  elige: se aplica la general con aviso (antes tomaba la primera fila que
 *  lo contuviera → tasa de una empresa ajena en Cotizador y Pre-Glosa). */
export function resolverTasaPorExportador(
  duty: { rate: number; rateUnit: string; exportadorTasas: ExportadorTasa[] | null; specificProducer: string | null },
  exportadorNombre?: string | null,
): TasaResuelta {
  const lista = Array.isArray(duty.exportadorTasas) ? duty.exportadorTasas.filter(e => e && typeof e.empresa === 'string' && typeof e.tasa === 'number') : [];
  if (lista.length === 0 && !duty.specificProducer) {
    return { tasa: duty.rate, rateUnit: duty.rateUnit, empresa: null, origen: 'general_sin_lista' };
  }
  const nombre = exportadorNombre ? normalizarEmpresa(exportadorNombre) : '';
  const general = (aviso?: string): TasaResuelta => ({ tasa: duty.rate, rateUnit: duty.rateUnit, empresa: null, origen: 'general', ...(aviso ? { aviso } : {}) });
  if (nombre.length < 3) return general();
  const deHit = (hit: ExportadorTasa): TasaResuelta => ({ tasa: hit.tasa, rateUnit: hit.rateUnit ?? duty.rateUnit, empresa: hit.empresa, origen: 'exportador' });
  const normalizadas = lista.map(e => ({ e, n: normalizarEmpresa(e.empresa) })).filter(x => x.n.length >= 3);
  const exactas = normalizadas.filter(x => x.n === nombre);
  if (exactas.length === 1) return deHit(exactas[0]!.e);
  if (exactas.length > 1) return general(`Exportador "${exportadorNombre}" coincide con ${exactas.length} empresas de la lista: se aplica la tasa general; revisa la resolución.`);
  const parciales = normalizadas.filter(x => (x.n.includes(nombre) && palabras(nombre) >= 2) || (nombre.includes(x.n) && palabras(x.n) >= 2));
  if (parciales.length === 1) return deHit(parciales[0]!.e);
  if (parciales.length > 1) return general(`Exportador "${exportadorNombre}" coincide parcialmente con ${parciales.length} empresas de la lista (${parciales.map(x => x.e.empresa).join(', ')}): se aplica la tasa general; captura la razón social completa.`);
  const ambiguas = normalizadas.filter(x => x.n.includes(nombre) || nombre.includes(x.n));
  if (ambiguas.length > 0) return general(`Exportador "${exportadorNombre}" solo coincide por un fragmento con ${ambiguas.map(x => x.e.empresa).join(', ')}: se aplica la tasa general; captura la razón social completa para aplicar la tasa por empresa.`);
  return general();
}

export async function checkAntidumpingDuty(input: AntidumpingCheckInput): Promise<AntidumpingCheckResult[]> {
  const cleanFraction = input.fractionCode.replace(/[^0-9]/g, '');
  const country = normalizeCountry(input.countryOfOrigin);
  const now = new Date();

  const baseWhere = {
    countryOfOrigin: country,
    status: 'vigente',
    active: true,
    OR: [
      { effectiveDate: null },
      { effectiveDate: { lte: now } },
    ],
    AND: [
      { OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] },
    ],
  };

  // SOLO match EXACTO de fracción + país. Nunca por prefijo: heredar la cuota
  // de una fracción hermana mostraría una medida que no aplica = inventar cuota.
  const duties = await prisma.antidumpingDuty.findMany({
    where: { ...baseWhere, fractionCode: cleanFraction },
    orderBy: { publishDateDOF: 'desc' },
  });
  const matchType: 'exact' | 'subheading' | 'heading' = 'exact';

  return duties.map(d => {
    let calculatedAmountUSD: number | null = null;
    let calculation = '';
    let appliesToOperation = false;

    const rateLabel = formatCuota(d.rateType, d.rate, d.rateUnit);
    if (d.rateType === 'percentage') {
      if (input.valueUSD != null) {
        calculatedAmountUSD = input.valueUSD * (d.rate / 100);
        calculation = `${rateLabel} × $${input.valueUSD.toLocaleString('en-US')} USD = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = `${rateLabel} sobre valor en aduana`;
      }
    } else if (d.rateType === 'specific_USD_kg') {
      if (input.weightKg != null) {
        calculatedAmountUSD = input.weightKg * d.rate;
        calculation = `${rateLabel} × ${input.weightKg.toLocaleString('en-US')} kg = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = rateLabel;
      }
    } else if (d.rateType === 'specific_USD_unit') {
      if (input.units != null) {
        calculatedAmountUSD = input.units * d.rate;
        calculation = `${rateLabel} × ${input.units.toLocaleString('en-US')} unidades = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = rateLabel;
      }
    }

    const daysToExpiry = d.expiryDate ? daysBetween(now, d.expiryDate) : null;
    const expiringSoon = daysToExpiry != null && daysToExpiry > 0 && daysToExpiry < 90;

    let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    if (calculatedAmountUSD != null) {
      if (calculatedAmountUSD > 10000) severity = 'critical';
      else if (calculatedAmountUSD > 1000) severity = 'high';
      else if (calculatedAmountUSD > 100) severity = 'medium';
      else severity = 'low';
    } else if (d.rateType === 'percentage' && d.rate > 50) {
      severity = 'high';
    }

    return {
      duty: {
        id: d.id,
        resolutionType: d.resolutionType,
        resolutionNumber: d.resolutionNumber,
        expedienteUPCI: d.expedienteUPCI,
        fractionCode: d.fractionCode,
        countryOfOrigin: d.countryOfOrigin,
        productDesc: d.productDesc,
        rateType: d.rateType,
        rate: d.rate,
        rateUnit: d.rateUnit,
        status: d.status,
        investigationType: d.investigationType,
        publishDateDOF: d.publishDateDOF?.toISOString() ?? null,
        effectiveDate: d.effectiveDate?.toISOString() ?? null,
        expiryDate: d.expiryDate?.toISOString() ?? null,
        dofUrl: d.dofUrl,
        notes: d.notes,
        exportadorTasas: Array.isArray(d.exportadorTasas) ? (d.exportadorTasas as unknown as ExportadorTasa[]) : null,
        specificProducer: d.specificProducer,
      },
      calculatedAmountUSD,
      calculation,
      severity,
      expiringSoon,
      daysToExpiry,
      appliesToOperation,
      matchType,
      matchedFraction: d.fractionCode,
    };
  });
}

export interface ExposureReport {
  tenantId: string;
  totalImports: number;
  totalExposureUSD: number;
  potentialMultaUSD: number;
  byResolution: {
    resolutionNumber: string | null;
    fractionCode: string;
    countryOfOrigin: string;
    productDesc: string | null;
    importsCount: number;
    exposureUSD: number;
  }[];
}

/** Reporte de exposición acumulada del tenant a cuotas no declaradas */
export async function calculateExposure(tenantId: string): Promise<ExposureReport> {
  const since = new Date(Date.now() - 365 * DAY_MS);
  const imports = await prisma.temporaryImport.findMany({
    where: { tenantId, entryDate: { gte: since } },
    select: { fractionCode: true, originCountry: true, customsValue: true, valueMXN: true, quantity: true, unit: true },
    take: 1000,
  });

  // Agrupa por fracción + país
  const groups = new Map<string, {
    fractionCode: string; countryOfOrigin: string;
    count: number; totalValueUSD: number; totalQuantity: number; unit: string | null;
  }>();
  for (const imp of imports) {
    if (!imp.originCountry) continue;
    const country = normalizeCountry(imp.originCountry);
    const key = `${imp.fractionCode}|${country}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.totalValueUSD += imp.customsValue;
      g.totalQuantity += imp.quantity;
    } else {
      groups.set(key, {
        fractionCode: imp.fractionCode,
        countryOfOrigin: country,
        count: 1,
        totalValueUSD: imp.customsValue,
        totalQuantity: imp.quantity,
        unit: imp.unit,
      });
    }
  }

  const byResolution: ExposureReport['byResolution'] = [];
  let totalExposureUSD = 0;

  for (const grp of groups.values()) {
    const duties = await prisma.antidumpingDuty.findMany({
      where: {
        fractionCode: grp.fractionCode,
        countryOfOrigin: grp.countryOfOrigin,
        status: 'vigente', active: true,
      },
    });
    for (const d of duties) {
      let exposurePerOp = 0;
      if (d.rateType === 'percentage') {
        exposurePerOp = (grp.totalValueUSD / grp.count) * (d.rate / 100);
      } else if (d.rateType === 'specific_USD_kg') {
        exposurePerOp = (grp.totalQuantity / grp.count) * d.rate;
      } else if (d.rateType === 'specific_USD_unit') {
        exposurePerOp = (grp.totalQuantity / grp.count) * d.rate;
      }
      const exposureUSD = exposurePerOp * grp.count;
      totalExposureUSD += exposureUSD;
      byResolution.push({
        resolutionNumber: d.resolutionNumber,
        fractionCode: d.fractionCode,
        countryOfOrigin: d.countryOfOrigin,
        productDesc: d.productDesc,
        importsCount: grp.count,
        exposureUSD,
      });
    }
  }

  // Multa potencial: Art. 178 LA — 130-150% de contribuciones omitidas
  const potentialMultaUSD = totalExposureUSD * 1.4;

  return {
    tenantId,
    totalImports: imports.length,
    totalExposureUSD,
    potentialMultaUSD,
    byResolution: byResolution.sort((a, b) => b.exposureUSD - a.exposureUSD),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Ola 2 (origen-cuotas): enganche único para Cotizador y Pre-Glosa + cobertura
// ═══════════════════════════════════════════════════════════════════════════

export interface FundamentoCuota {
  resolucion: string | null;
  expedienteUPCI: string | null;
  fechaDOF: string | null;
  dofUrl: string | null;
  fuenteUrl: string | null;
  /** cotejada = la fila trae cotejadoAt (cargada con fuente); pendiente = tabla sembrada/sin fuente. */
  cotejo: 'cotejada' | 'pendiente';
  cotejadoAt: string | null;
}

export interface CuotaAplicable {
  duty: AntidumpingCheckResult['duty'];
  /** Tasa elegida: por exportador si coincide, si no la general (y lo dice). */
  tasa: TasaResuelta;
  fundamento: FundamentoCuota;
  esAntielusion: boolean;
  vigencia: { desde: string | null; hasta: string | null; examenSunsetFecha: string | null; investigationType: string | null; expiraPronto: boolean; diasParaExpirar: number | null };
  /** Monto calculado con la tasa elegida (si vinieron valor/peso/unidades). */
  montoUSD: number | null;
  calculo: string;
  /** Otras resoluciones vigentes para la misma fracción+país (si hay más de una). */
  otras: number;
}

/**
 * Elige la resolución aplicable y resuelve la tasa por exportador. Pura: la
 * usan `buscarCuotaAplicable` (Cotizador) y `glosa-cruces.ts` (Pre-Glosa)
 * para que ambos digan lo mismo ante los mismos datos.
 */
export function elegirCuotaAplicable(
  cuotas: AntidumpingCheckResult[],
  exportador?: string | null,
  extra?: { esAntielusion?: boolean; examenSunsetFecha?: string | null; fuenteUrl?: string | null; cotejadoAt?: string | null; valueUSD?: number; weightKg?: number; units?: number },
): CuotaAplicable | null {
  if (!cuotas || cuotas.length === 0) return null;
  const c = cuotas[0]!;
  const tasa = resolverTasaPorExportador(c.duty, exportador);
  const rateType = c.duty.rateType;
  let montoUSD: number | null = null;
  let calculo = formatCuota(rateType, tasa.tasa, tasa.rateUnit);
  if (rateType === 'percentage' && extra?.valueUSD != null) { montoUSD = extra.valueUSD * (tasa.tasa / 100); calculo = `${calculo} × $${extra.valueUSD.toLocaleString('en-US')} USD = $${montoUSD.toFixed(2)} USD`; }
  else if (rateType === 'specific_USD_kg' && extra?.weightKg != null) { montoUSD = extra.weightKg * tasa.tasa; calculo = `${calculo} × ${extra.weightKg.toLocaleString('en-US')} kg = $${montoUSD.toFixed(2)} USD`; }
  else if (rateType === 'specific_USD_unit' && extra?.units != null) { montoUSD = extra.units * tasa.tasa; calculo = `${calculo} × ${extra.units.toLocaleString('en-US')} unidades = $${montoUSD.toFixed(2)} USD`; }
  if (tasa.origen === 'exportador') calculo += ` (tasa de ${tasa.empresa})`;
  else if (tasa.origen === 'general') calculo += tasa.aviso ? ` (tasa general: ${tasa.aviso})` : ' (tasa general: el exportador no tiene tasa específica)';
  else calculo += ' (tasa general: la resolución no tiene lista por empresa cargada)';
  const cotejadoAt = extra?.cotejadoAt ?? null;
  return {
    duty: c.duty,
    tasa,
    fundamento: {
      resolucion: c.duty.resolutionNumber, expedienteUPCI: c.duty.expedienteUPCI,
      fechaDOF: c.duty.publishDateDOF ? c.duty.publishDateDOF.slice(0, 10) : null,
      dofUrl: c.duty.dofUrl, fuenteUrl: extra?.fuenteUrl ?? null,
      cotejo: cotejadoAt ? 'cotejada' : 'pendiente', cotejadoAt,
    },
    esAntielusion: !!extra?.esAntielusion || c.duty.investigationType === 'elusion',
    vigencia: { desde: c.duty.effectiveDate, hasta: c.duty.expiryDate, examenSunsetFecha: extra?.examenSunsetFecha ?? null, investigationType: c.duty.investigationType, expiraPronto: c.expiringSoon, diasParaExpirar: c.daysToExpiry },
    montoUSD, calculo, otras: cuotas.length - 1,
  };
}

/**
 * Enganche para Cotizador/Pre-Glosa: cuota aplicable a (fracción, país,
 * exportador?). Compatible con `checkAntidumpingDuty` (mismos campos base).
 * Devuelve null si no hay cuota vigente con match EXACTO de fracción.
 */
export async function buscarCuotaAplicable(input: AntidumpingCheckInput & { exportador?: string | null }): Promise<CuotaAplicable | null> {
  const cuotas = await checkAntidumpingDuty(input);
  if (cuotas.length === 0) return null;
  const fila = await prisma.antidumpingDuty.findUnique({
    where: { id: cuotas[0]!.duty.id },
    select: { esAntielusion: true, examenSunsetFecha: true, fuenteUrl: true, cotejadoAt: true },
  });
  return elegirCuotaAplicable(cuotas, input.exportador, {
    esAntielusion: fila?.esAntielusion, examenSunsetFecha: fila?.examenSunsetFecha?.toISOString().slice(0, 10) ?? null,
    fuenteUrl: fila?.fuenteUrl ?? null, cotejadoAt: fila?.cotejadoAt?.toISOString() ?? null,
    valueUSD: input.valueUSD, weightKg: input.weightKg, units: input.units,
  });
}

export interface CoberturaCuotas {
  total: number;
  activas: number;
  inactivas: number;
  vigentes: number;
  cotejadas: number;
  pendientesCotejo: number;
  conTasasPorExportador: number;
  antielusion: number;
  conSunset: number;
  porPais: { pais: string; total: number; cotejadas: number }[];
  nota: string;
}

/** Honestidad visible: cuántas resoluciones están cotejadas contra fuente y cuántas no. */
export async function coberturaCuotas(): Promise<CoberturaCuotas> {
  const filas = await prisma.antidumpingDuty.findMany({
    select: { countryOfOrigin: true, active: true, status: true, cotejadoAt: true, exportadorTasas: true, esAntielusion: true, investigationType: true, examenSunsetFecha: true },
  });
  const porPais = new Map<string, { pais: string; total: number; cotejadas: number }>();
  let cotejadas = 0, conTasas = 0, antielusion = 0, conSunset = 0, activas = 0, vigentes = 0;
  for (const f of filas) {
    if (f.active) activas++;
    if (f.active && f.status === 'vigente') vigentes++;
    if (f.cotejadoAt) cotejadas++;
    if (Array.isArray(f.exportadorTasas) && (f.exportadorTasas as unknown[]).length > 0) conTasas++;
    if (f.esAntielusion || f.investigationType === 'elusion') antielusion++;
    if (f.examenSunsetFecha) conSunset++;
    const p = porPais.get(f.countryOfOrigin) ?? { pais: f.countryOfOrigin, total: 0, cotejadas: 0 };
    p.total++; if (f.cotejadoAt) p.cotejadas++;
    porPais.set(f.countryOfOrigin, p);
  }
  return {
    total: filas.length, activas, inactivas: filas.length - activas, vigentes, cotejadas, pendientesCotejo: filas.length - cotejadas,
    conTasasPorExportador: conTasas, antielusion, conSunset,
    porPais: Array.from(porPais.values()).sort((a, b) => b.total - a.total),
    nota: 'Una resolución cuenta como "cotejada" solo si fue cargada con fuente oficial (fuenteUrl → cotejadoAt). Las demás son estructura sembrada pendiente de cotejo contra la lista UPCI/DOF: no confirman ni descartan una cuota real.',
  };
}
