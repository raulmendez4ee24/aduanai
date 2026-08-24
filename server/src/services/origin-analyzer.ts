/**
 * Motor completo de análisis de origen TMEC / TLCUEM / CPTPP.
 *
 * Calcula RVC por 4 métodos cuando aplican:
 *   - Transaction Value:  RVC = ((TV - VNM) / TV) × 100
 *   - Net Cost:           RVC = ((NC - VNM) / NC) × 100
 *   - Build-Down (CPTPP): igual a TV
 *   - Build-Up:           RVC = (VOM / TV) × 100
 *
 * Para vehículos y autopartes (Anexo 4-B TMEC) verifica adicionalmente:
 *   - Labor Value Content (LVC) — % mano de obra >$16 USD/hr
 *   - Steel & Aluminum Norteamericano — % materia prima NA
 *
 * IMPORTANTE: análisis preliminar. La determinación final requiere análisis
 * de cadena de suministro y documentación soporte (PPAP, contratos, BOM completo).
 */

import { prisma } from '../lib/prisma';
import crypto from 'crypto';

export const ORIGIN_DISCLAIMER =
  'El análisis de origen es preliminar. La determinación final requiere análisis ' +
  'detallado de cadena de suministro, BOM completo y documentación soporte (contratos, ' +
  'facturas, PPAP). Consulte a un especialista en origen calificador.';

export type RVCMethod = 'transaction_value' | 'net_cost' | 'build_up' | 'build_down';
export type AutoCategory = 'vehicle' | 'core_part' | 'principal_part' | 'complementary_part';

export interface MaterialItem {
  description: string;
  value: number; // USD
  fraction?: string;
  origin?: string;
}

export interface OriginRuleMatch {
  id: string;
  fractionCode: string;
  matchType: string;
  agreement: string;
  ruleType: string;
  description: string;
  rvcRequired: number | null;
  rvcRequiredNetCost: number | null;
  rvcMethod: string | null;
  tariffShift: string | null;
  tariffShiftCode: string | null;
  specificProcess: string | null;
  annex: string | null;
  isAutomotive: boolean;
  autoCategory: string | null;
  laborValueContent: number | null;
  steelAluminumPercent: number | null;
  textileRule: string | null;
  notes: string | null;
}

export interface OriginAnalysisInput {
  fractionCode: string;
  productDescription?: string;
  agreement?: string;
  productValue: number;            // TV — valor de transacción
  originatingMaterials?: MaterialItem[];
  nonOriginatingMaterials?: MaterialItem[];
  // Si no se envían arrays, se usa el agregado:
  originatingValue?: number;
  nonOriginatingValue?: number;
  laborCost?: number;
  highWageLaborCost?: number;      // pagado >$16 USD/hr (LVC)
  overheadCost?: number;
  profit?: number;
  packagingCost?: number;
  royalties?: number;
  rvcMethod?: RVCMethod;
  // Automotriz
  totalSteelAluminumValue?: number;
  northAmericanSteelAluminumValue?: number;
}

export interface OriginRecommendation {
  type: 'reduce_vnm' | 'increase_originating' | 'change_method' | 'check_specific_process' | 'tariff_shift_audit' | 'wholly_obtained' | 'increase_lvc' | 'increase_sa_na';
  message: string;
  deltaUSD?: number;
}

export interface RVCResults {
  transactionValue: number | null;
  netCost: number | null;
  buildUp: number | null;
  buildDown: number | null;
}

export interface OriginAnalysisResult {
  fractionCode: string;
  agreement: string;
  rule: OriginRuleMatch | null;

  rvc: RVCResults;
  rvcRequired: number | null;
  rvcMethodApplied: RVCMethod;

  netCost: number | null;
  totalOriginatingValue: number;
  totalNonOriginatingValue: number;

  // Automotriz
  laborValueContentPct: number | null;
  lvcRequired: number | null;
  lvcCompliance: boolean | null;
  steelAluminumNAPct: number | null;
  saRequired: number | null;
  saCompliance: boolean | null;

  // Tariff shift
  tariffShiftCompliance: boolean | null;

  qualifies: boolean;
  qualifyingMethod: string | null;
  reason: string;
  reasons: string[];
  recommendations: OriginRecommendation[];

  formula: string;
  disclaimer: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const sumValues = (items?: MaterialItem[]) => (items ?? []).reduce((s, m) => s + (m.value || 0), 0);

export async function lookupOriginRule(fractionCode: string, agreement = 'TMEC'): Promise<OriginRuleMatch | null> {
  const clean = fractionCode.replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (clean.length >= 8) {
    const exact = await prisma.originRule.findFirst({
      where: { fractionCode: clean.slice(0, 8), matchType: 'exact', agreement, active: true },
    });
    if (exact) return exact as OriginRuleMatch;
  }
  for (const len of [6, 4, 2]) {
    if (clean.length >= len) {
      const prefix = clean.slice(0, len);
      const match = await prisma.originRule.findFirst({
        where: { fractionCode: prefix, matchType: 'prefix', agreement, active: true },
        orderBy: { fractionCode: 'desc' },
      });
      if (match) return match as OriginRuleMatch;
    }
  }
  return null;
}

export async function listAgreements(): Promise<string[]> {
  const rows = await prisma.originRule.findMany({
    where: { active: true },
    select: { agreement: true },
    distinct: ['agreement'],
  });
  return rows.map(r => r.agreement);
}

// ─────────────────────── RVC calculations ───────────────────────

function computeNetCost(input: OriginAnalysisInput): number {
  const profit = input.profit ?? input.productValue * 0.10;
  const packaging = input.packagingCost ?? 0;
  const royalties = input.royalties ?? 0;
  return Math.max(0, input.productValue - profit - packaging - royalties);
}

function calculateRVC(input: OriginAnalysisInput, vom: number, vnm: number, nc: number): RVCResults {
  const tv = input.productValue;
  return {
    transactionValue: tv > 0 ? round1(((tv - vnm) / tv) * 100) : null,
    netCost: nc > 0 ? round1(((nc - vnm) / nc) * 100) : null,
    buildUp: tv > 0 ? round1((vom / tv) * 100) : null,
    buildDown: tv > 0 ? round1(((tv - vnm) / tv) * 100) : null,
  };
}

// ─────────────────────── Análisis principal ───────────────────────

export function analyzeOriginPure(args: { input: OriginAnalysisInput; rule: OriginRuleMatch | null }): OriginAnalysisResult {
  const { input, rule } = args;
  const agreement = input.agreement ?? 'TMEC';

  // Resolver totales originating/non-originating
  const totalOriginatingValue = input.originatingMaterials
    ? sumValues(input.originatingMaterials)
    : input.originatingValue ?? 0;
  const totalNonOriginatingValue = input.nonOriginatingMaterials
    ? sumValues(input.nonOriginatingMaterials)
    : input.nonOriginatingValue ?? 0;

  const nc = computeNetCost(input);
  const rvc = calculateRVC(input, totalOriginatingValue, totalNonOriginatingValue, nc);

  // LVC y SA — solo si automotriz
  let laborValueContentPct: number | null = null;
  let lvcCompliance: boolean | null = null;
  let steelAluminumNAPct: number | null = null;
  let saCompliance: boolean | null = null;

  if (rule?.isAutomotive) {
    if (input.highWageLaborCost != null && input.productValue > 0) {
      laborValueContentPct = round1((input.highWageLaborCost / input.productValue) * 100);
      if (rule.laborValueContent != null) {
        lvcCompliance = laborValueContentPct >= rule.laborValueContent;
      }
    }
    if (input.totalSteelAluminumValue != null && input.northAmericanSteelAluminumValue != null && input.totalSteelAluminumValue > 0) {
      steelAluminumNAPct = round1((input.northAmericanSteelAluminumValue / input.totalSteelAluminumValue) * 100);
      if (rule.steelAluminumPercent != null) {
        saCompliance = steelAluminumNAPct >= rule.steelAluminumPercent;
      }
    }
  }

  const reasons: string[] = [];
  const recommendations: OriginRecommendation[] = [];
  let qualifies = false;
  let qualifyingMethod: string | null = null;
  let reason = '';
  let tariffShiftCompliance: boolean | null = null;
  let rvcMethodApplied: RVCMethod = (input.rvcMethod ?? (rule?.rvcMethod === 'net_cost' ? 'net_cost' : 'transaction_value')) as RVCMethod;

  if (!rule) {
    reason = `No se encontró regla TMEC aplicable para fracción ${input.fractionCode}. Verifica el Anexo de Reglas Específicas del tratado.`;
    recommendations.push({ type: 'check_specific_process', message: 'Consulta el Anexo de Reglas Específicas de Origen del tratado.' });
  } else {
    // Evaluación según ruleType
    switch (rule.ruleType) {
      case 'wholly_obtained':
        qualifies = totalNonOriginatingValue <= 0;
        reason = qualifies
          ? 'Wholly obtained: VNM = 0 — califica.'
          : `Wholly obtained requiere VNM = 0 pero declaras $${round2(totalNonOriginatingValue)} USD. NO califica.`;
        if (!qualifies) reasons.push('VNM > 0 incompatible con wholly_obtained');
        if (qualifies) qualifyingMethod = 'wholly_obtained';
        break;

      case 'tariff_shift':
        tariffShiftCompliance = totalNonOriginatingValue < input.productValue;
        qualifies = tariffShiftCompliance;
        reason = qualifies
          ? `Tariff shift asumido cumplido (${rule.tariffShiftCode ?? rule.tariffShift ?? 'cambio de partida'}). Audita la fracción de cada material no originario.`
          : 'No se puede confirmar el cambio arancelario sin la lista detallada de materiales no originarios y sus fracciones.';
        if (qualifies) qualifyingMethod = 'tariff_shift';
        recommendations.push({ type: 'tariff_shift_audit', message: `Audita las fracciones de los materiales no originarios. Regla: ${rule.tariffShift ?? rule.tariffShiftCode ?? '—'}.` });
        break;

      case 'rvc':
      case 'combined': {
        // Probar todos los métodos permitidos por la regla
        const method = rule.rvcMethod;
        const candidates: { name: RVCMethod; value: number | null }[] = [];
        if (method === 'transaction_value' || method === 'either' || method === 'build_down') candidates.push({ name: 'transaction_value', value: rvc.transactionValue });
        if (method === 'net_cost' || method === 'either') candidates.push({ name: 'net_cost', value: rvc.netCost });
        if (method === 'build_up') candidates.push({ name: 'build_up', value: rvc.buildUp });
        if (method === 'build_down') candidates.push({ name: 'build_down', value: rvc.buildDown });
        if (candidates.length === 0) {
          // Si la regla no especifica método, probar todos
          candidates.push({ name: 'transaction_value', value: rvc.transactionValue });
          candidates.push({ name: 'net_cost', value: rvc.netCost });
        }
        // Umbral POR MÉTODO (fidelidad T-MEC): el tratado típico pide 60% por
        // valor de transacción O 50% por costo neto. rvcRequiredNetCost null
        // conserva el comportamiento previo (un solo umbral).
        const requiredFor = (name: RVCMethod) =>
          name === 'net_cost' && rule.rvcRequiredNetCost != null ? rule.rvcRequiredNetCost : rule.rvcRequired ?? 0;
        const passing = candidates.filter(c => c.value != null && c.value >= requiredFor(c.name));
        const best = candidates.reduce<{ name: RVCMethod; value: number | null } | null>((b, c) => (c.value != null && (b == null || (b.value ?? 0) < c.value)) ? c : b, null);

        if (passing.length > 0) {
          qualifies = true;
          qualifyingMethod = passing[0]!.name;
          rvcMethodApplied = passing[0]!.name;
          reason = `Cumple RVC ${passing[0]!.value}% ≥ ${requiredFor(passing[0]!.name)}% (método ${passing[0]!.name}).`;
        } else if (best?.value != null) {
          qualifies = false;
          rvcMethodApplied = best.name;
          reason = `No cumple RVC: mejor cálculo ${best.value}% (${best.name}) < ${requiredFor(best.name)}% requerido.`;
          // Recomendación: cuánto VNM bajar (con mejor método)
          const denominator = best.name === 'net_cost' ? nc : input.productValue;
          const targetVNM = denominator * (1 - requiredFor(best.name) / 100);
          const reduceVNMBy = round2(totalNonOriginatingValue - targetVNM);
          if (reduceVNMBy > 0) {
            recommendations.push({
              type: 'reduce_vnm',
              message: `Reducir VNM en $${reduceVNMBy.toLocaleString('es-MX')} USD (de $${round2(totalNonOriginatingValue)} a $${round2(targetVNM)}) para alcanzar ${requiredFor(best.name)}% RVC.`,
              deltaUSD: reduceVNMBy,
            });
            recommendations.push({
              type: 'increase_originating',
              message: `Aumentar materiales originarios en al menos $${reduceVNMBy.toLocaleString('es-MX')} USD reemplazando proveedores no originarios.`,
              deltaUSD: reduceVNMBy,
            });
          }
          if (method === 'either' && best.name !== 'net_cost' && rvc.netCost != null && rvc.netCost > (best.value ?? 0)) {
            recommendations.push({
              type: 'change_method',
              message: `Probar método net cost: arroja ${rvc.netCost}% vs ${best.value}% del actual.`,
            });
          }
        } else {
          qualifies = false;
          reason = 'No se pudo calcular RVC con datos suficientes.';
        }

        if (rule.tariffShift) {
          recommendations.push({ type: 'tariff_shift_audit', message: `Adicionalmente verifica: ${rule.tariffShift}.` });
        }
        break;
      }

      case 'specific_process':
        qualifies = false;
        reason = `Regla de proceso específico — requiere verificación documental: ${rule.specificProcess ?? rule.description}.`;
        recommendations.push({ type: 'check_specific_process', message: `Documenta evidencia de: ${rule.specificProcess ?? rule.description}.` });
        if (rule.textileRule) {
          recommendations.push({ type: 'check_specific_process', message: `Regla textil ${rule.textileRule}: el hilado/tejido debe ser originario TMEC.` });
        }
        break;

      default:
        qualifies = false;
        reason = `Tipo de regla no soportado: ${rule.ruleType}.`;
    }

    // Para combined automotriz, RVC no es suficiente — también requiere LVC + SA
    if (rule.isAutomotive && qualifies && rule.autoCategory === 'vehicle') {
      const lvcOk = lvcCompliance !== false;
      const saOk = saCompliance !== false;
      if (!lvcOk || !saOk) {
        qualifies = false;
        if (!lvcOk) reasons.push(`LVC ${laborValueContentPct}% < ${rule.laborValueContent}% requerido`);
        if (!saOk) reasons.push(`Acero/aluminio NA ${steelAluminumNAPct}% < ${rule.steelAluminumPercent}% requerido`);
        reason = `RVC cumple pero falla en requisitos automotrices Anexo 4-B: ${reasons.join('; ')}.`;
        if (lvcCompliance === false && rule.laborValueContent != null) {
          recommendations.push({
            type: 'increase_lvc',
            message: `Aumentar mano de obra >$16 USD/hr de ${laborValueContentPct}% a ${rule.laborValueContent}% del valor del producto.`,
          });
        }
        if (saCompliance === false && rule.steelAluminumPercent != null) {
          recommendations.push({
            type: 'increase_sa_na',
            message: `Aumentar acero/aluminio de origen norteamericano de ${steelAluminumNAPct}% a ${rule.steelAluminumPercent}% del total acero/aluminio.`,
          });
        }
      }
    }
  }

  const formula = rvcMethodApplied === 'net_cost'
    ? `RVC = ((NC − VNM) / NC) × 100  =  ((${round2(nc)} − ${round2(totalNonOriginatingValue)}) / ${round2(nc)}) × 100  =  ${rvc.netCost ?? '—'}%`
    : rvcMethodApplied === 'build_up'
    ? `RVC = (VOM / TV) × 100  =  (${round2(totalOriginatingValue)} / ${round2(input.productValue)}) × 100  =  ${rvc.buildUp ?? '—'}%`
    : `RVC = ((TV − VNM) / TV) × 100  =  ((${round2(input.productValue)} − ${round2(totalNonOriginatingValue)}) / ${round2(input.productValue)}) × 100  =  ${rvc.transactionValue ?? '—'}%`;

  return {
    fractionCode: input.fractionCode,
    agreement,
    rule,
    rvc,
    rvcRequired: rule?.rvcRequired ?? null,
    rvcMethodApplied,
    netCost: round2(nc),
    totalOriginatingValue: round2(totalOriginatingValue),
    totalNonOriginatingValue: round2(totalNonOriginatingValue),
    laborValueContentPct,
    lvcRequired: rule?.laborValueContent ?? null,
    lvcCompliance,
    steelAluminumNAPct,
    saRequired: rule?.steelAluminumPercent ?? null,
    saCompliance,
    tariffShiftCompliance,
    qualifies,
    qualifyingMethod,
    reason,
    reasons,
    recommendations,
    formula,
    disclaimer: ORIGIN_DISCLAIMER,
  };
}

export async function analyzeOrigin(input: OriginAnalysisInput): Promise<OriginAnalysisResult> {
  const agreement = input.agreement ?? 'TMEC';
  const rule = await lookupOriginRule(input.fractionCode, agreement);
  return analyzeOriginPure({ input: { ...input, agreement }, rule });
}

// ─────────────────────── Hash para audit ───────────────────────

export function consultHashOf(input: OriginAnalysisInput, result: OriginAnalysisResult): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ input, qualifies: result.qualifies, rvc: result.rvc, lvc: result.laborValueContentPct, sa: result.steelAluminumNAPct }))
    .digest('hex');
}
