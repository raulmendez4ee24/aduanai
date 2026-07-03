/**
 * Simulador de Glosa — predice probabilidad de Reconocimiento Aduanero (RA).
 *
 * El score se construye sumando los pesos de las reglas que se activan
 * sobre los datos del pedimento simulado. Cada regla se ejecuta contra
 * datos reales: precio estimado SAT, antidumping, padrones, NOMs, histórico
 * del importador y patrones de fracción/aduana/origen.
 */

import { prisma } from '../lib/prisma';
import { ADUANAS, normalizeCustomsCode } from '../lib/anexo22';
import { lookupEstimatedPrice } from './price-validator';
import { checkAntidumpingDuty } from './antidumping';
import { checkRequiredPadrones } from './padron-checker';

export interface GlosaSimulationInput {
  fractionCode: string;
  fractionDescription?: string;
  productDescription?: string; // descripción del producto en factura
  countryOrigin: string;       // ISO-2 (CN, US, VN…)
  countryProvider: string;     // ISO-2 país de embarque
  customsCode: string;         // MAN, VER, TIJ…
  regimenCode: string;         // A1, A4, F4…

  unitValueUSD: number;
  unitMeasure?: string;
  units?: number;
  weightKg: number;
  totalValueUSD: number;
  totalValueMXN?: number;

  // Banderas declarativas
  declaresAntidumping?: boolean;
  declaresLink?: boolean;       // vinculación comprador-vendedor
  appliesTMEC?: boolean;
  hasTMECCertificate?: boolean;
  declaresNOMs?: boolean;
  hasIVAIEPSCertification?: boolean;

  // Documentación adjunta
  documents?: {
    invoice?: boolean;
    bl?: boolean;
    packingList?: boolean;
    originCertificate?: boolean;
    mve?: boolean;
    permits?: boolean;
    nomCertificates?: boolean;
  };
}

export interface RiskFlag {
  ruleCode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  name: string;
  reason: string;
  recommendation: string;
  legalBasis: string | null;
  weight: number;
}

export interface GlosaSimulationResult {
  simulationId: string;
  riskScore: number;       // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  raProbability: number;   // 0-100
  cotejoProb: number;
  glosaProb: number;
  flags: RiskFlag[];
  recommendations: { priority: 'critical' | 'recommended'; items: string[] }[];
  industryAverage: number | null;
  yourHistory: number | null;
  disclaimer: string;
}

// Claves OFICIALES del Apéndice 1 Anexo 22 RGCE 2026 (Fase 4.1, cotejo DOF
// 15-ene-2026): 16 Manzanillo, 43 Veracruz, 40 Tijuana, 24 Nuevo Laredo,
// 51 Lázaro Cárdenas. Antes usaba códigos inventados de 3 letras donde 'ZLO'
// duplicaba Manzanillo bajo la etiqueta errónea "Zaragoza Coahuila".
// normalizeCustomsCode mantiene compatibilidad con registros históricos.
const HIGH_RISK_CUSTOMS = new Set(['16', '43', '40', '24', '51']);
const ASIAN_TRIANGULATION_PROVIDERS = new Set(['VN', 'MY', 'TH', 'KH', 'ID']);
const COMMON_CHINESE_FRACTION_PREFIXES = ['72', '73', '64', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '85', '94', '95'];

const DISCLAIMER = 'Este simulador estima probabilidades basado en modelos de riesgo conocidos del SAT y heurísticas calibradas con prácticas de la industria. Los resultados son orientativos. La decisión final del SAT depende de su sistema interno y criterios del personal de reconocimiento. Úselo como herramienta de prevención, no como garantía.';

function fractionLikelyChinese(fractionCode: string): boolean {
  const cleaned = fractionCode.replace(/[.\s-]/g, '');
  return COMMON_CHINESE_FRACTION_PREFIXES.some(p => cleaned.startsWith(p));
}

function descriptionIsGeneric(desc: string | undefined): boolean {
  if (!desc) return true;
  const trimmed = desc.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 10) return true;
  const vague = /\b(art[ií]culos?|equipo|accesorios?|partes?|productos?|materiales?|otros?)\b/i;
  return vague.test(trimmed) && wordCount < 15;
}

async function loadActiveRules() {
  const rules = await prisma.glosaRiskRule.findMany({ where: { active: true } });
  return new Map(rules.map(r => [r.ruleCode, r]));
}

function buildFlag(rule: { ruleCode: string; category: string; name: string; severity: string; weight: number; recommendation: string; legalBasis: string | null }, reason: string): RiskFlag {
  return {
    ruleCode: rule.ruleCode,
    severity: rule.severity as RiskFlag['severity'],
    category: rule.category,
    name: rule.name,
    reason,
    recommendation: rule.recommendation,
    legalBasis: rule.legalBasis,
    weight: rule.weight,
  };
}

async function getImporterRAHistory(tenantId: string): Promise<{ raRate: number; total: number }> {
  const sims = await prisma.glosaSimulation.findMany({
    where: { tenantId, actualOutcome: { not: null } },
    select: { actualOutcome: true },
    take: 200,
  });
  if (sims.length === 0) return { raRate: 0, total: 0 };
  const raCount = sims.filter(s => s.actualOutcome === 'ra_yes').length;
  return { raRate: Math.round((raCount / sims.length) * 100), total: sims.length };
}

async function getIndustryAverage(fractionCode: string): Promise<number | null> {
  const prefix = fractionCode.replace(/[.\s-]/g, '').slice(0, 4);
  const sims = await prisma.glosaSimulation.findMany({
    where: { actualOutcome: { not: null }, fractionCode: { startsWith: prefix.slice(0, 4) } },
    select: { actualOutcome: true },
    take: 500,
  });
  if (sims.length < 5) return null;
  const ra = sims.filter(s => s.actualOutcome === 'ra_yes').length;
  return Math.round((ra / sims.length) * 100);
}

export async function simulateGlosa(tenantId: string, userId: string, input: GlosaSimulationInput): Promise<GlosaSimulationResult> {
  const rules = await loadActiveRules();
  const flags: RiskFlag[] = [];
  let riskScore = 0;
  const addFlag = (ruleCode: string, reason: string) => {
    const r = rules.get(ruleCode);
    if (!r) return;
    flags.push(buildFlag(r, reason));
    riskScore += r.weight;
  };

  // ── 1. Precio estimado SAT ──
  try {
    const est = await lookupEstimatedPrice(input.fractionCode, input.countryOrigin);
    if (est) {
      const declared = input.unitValueUSD;
      const estimated = Number(est.estimatedValue ?? 0);
      if (estimated > 0 && declared < estimated) {
        const deltaPct = Math.round(((estimated - declared) / estimated) * 100);
        if (deltaPct >= 30) {
          addFlag('VAL_001', `Valor declarado USD ${declared.toFixed(2)} está ${deltaPct}% por debajo del estimado SAT (USD ${estimated.toFixed(2)}).`);
        }
      }
    }
  } catch { /* silent */ }

  // ── 2. Histórico del importador (variación valor) ──
  try {
    const history = await prisma.classification.findMany({
      where: { tenantId, fractionCode: input.fractionCode, inputDeclaredValueUSD: { not: null } },
      select: { inputDeclaredValueUSD: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    if (history.length >= 3) {
      const values = history.map(h => Number(h.inputDeclaredValueUSD ?? 0)).filter(v => v > 0);
      if (values.length >= 3) {
        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        const deviation = Math.abs((input.unitValueUSD - avg) / avg) * 100;
        if (deviation >= 25) {
          addFlag('VAL_002', `Variación ${Math.round(deviation)}% vs valor histórico promedio (USD ${avg.toFixed(2)}, n=${values.length}).`);
        }
      }
    }
  } catch { /* silent */ }

  // ── 3. Vinculación posible no declarada (heurística MVE) ──
  if (input.declaresLink === false) {
    // Si valor está bajo estimado Y no declara vinculación, sospecha
    const valFlag = flags.find(f => f.ruleCode === 'VAL_001');
    if (valFlag) {
      addFlag('VAL_003', 'Valor por debajo del estimado y no se declaró vinculación en MVE — patrón típico de revisión.');
    }
  }

  // ── 4. Triangulación ──
  if (
    input.countryOrigin !== input.countryProvider &&
    ASIAN_TRIANGULATION_PROVIDERS.has(input.countryProvider) &&
    fractionLikelyChinese(input.fractionCode)
  ) {
    addFlag('ORI_001', `Origen declarado ${input.countryOrigin} pero embarque desde ${input.countryProvider} para fracción típicamente china.`);
  }

  // ── 5. TMEC sin análisis de regla ──
  if (input.appliesTMEC && input.hasTMECCertificate && !input.documents?.originCertificate) {
    addFlag('ORI_002', 'Aplica TMEC pero el certificado de origen no está vinculado al pedimento.');
  }

  // ── 6. Cuota compensatoria activa no declarada ──
  try {
    const ad = await checkAntidumpingDuty({ fractionCode: input.fractionCode, countryOfOrigin: input.countryOrigin });
    if (ad.length > 0 && !input.declaresAntidumping) {
      const d = ad[0]!.duty;
      addFlag('ORI_003', `Cuota compensatoria activa: ${d.resolutionNumber ?? d.expedienteUPCI ?? '—'} (${d.rate} ${d.rateUnit}).`);
    }
  } catch { /* silent */ }

  // ── 7. Padrones SAT ──
  try {
    const padron = await checkRequiredPadrones(tenantId, input.fractionCode);
    if (!padron.canOperate) {
      const missing = padron.blocking.map(b => b.type === 'general' ? 'General' : `Sectorial ${b.sectorialCode}`).join(', ');
      addFlag('PAD_001', `Padrón requerido no inscrito: ${missing}.`);
    }
  } catch { /* silent */ }

  // ── 8. TMEC sin certificado ──
  if (input.appliesTMEC && !input.hasTMECCertificate) {
    addFlag('DOC_001', 'Se declara preferencia TMEC pero no hay certificado de origen vinculado.');
  }

  // ── 9. NOMs/permisos no declarados ──
  if (!input.declaresNOMs) {
    try {
      const cleaned = input.fractionCode.replace(/[.\s-]/g, '');
      const noms = await prisma.fractionRegulation.findMany({
        where: {
          active: true,
          type: 'NOM',
          OR: [
            { fractionCode: cleaned, matchType: 'exact' },
            { matchType: 'prefix' },
          ],
        },
        take: 10,
      });
      const matches = noms.filter(n => n.matchType === 'exact' ? cleaned === n.fractionCode : cleaned.startsWith(n.fractionCode));
      if (matches.length > 0) {
        const list = matches.map(n => n.code).slice(0, 3).join(', ');
        addFlag('DOC_002', `Fracción requiere NOM(s) ${list} pero no se declaró cumplimiento.`);
      }
    } catch { /* silent */ }
  }

  // ── 10. Reclasificación histórica ──
  try {
    const reclassified = await prisma.classification.count({
      where: { fractionCode: input.fractionCode, useBasedAnalysis: { not: undefined } },
    });
    if (reclassified > 5) {
      addFlag('CLA_001', `${reclassified} clasificaciones revisadas o reclasificadas para esta fracción en plataforma.`);
    }
  } catch { /* silent */ }

  // ── 11. Descripción genérica ──
  if (descriptionIsGeneric(input.productDescription)) {
    addFlag('CLA_002', `Descripción del producto demasiado breve o genérica${input.productDescription ? ` ("${input.productDescription.slice(0, 60)}")` : ''}.`);
  }

  // ── 12. Fracción "los demás" .99.99 ──
  if (/\.99\.99$/.test(input.fractionCode) || /9999$/.test(input.fractionCode.replace(/[.\s-]/g, ''))) {
    addFlag('CLA_003', 'Fracción residual ".99.99" (los demás) — revisada con frecuencia para verificar fracción específica.');
  }

  // ── 13. Importación temporal IMMEX sin certificación IVA-IEPS ──
  // Fase 4.2: antes revisaba la clave A4 llamándola "temporal IMMEX" — A4 es
  // INTRODUCCIÓN A DEPÓSITO FISCAL (Apéndice 2). Las claves temporales IMMEX
  // donde se causa IVA al despacho son IN (insumos) y AF (activo fijo).
  if (['IN', 'AF'].includes(input.regimenCode.toUpperCase()) && !input.hasIVAIEPSCertification) {
    addFlag('REG_001', `Importación temporal IMMEX (clave ${input.regimenCode.toUpperCase()}) sin certificación IVA-IEPS — IVA causado se paga o garantiza en el despacho (Art. 28-A LIVA).`);
  }

  // ── 14. Aduana de alto riesgo ──
  const customsClave = normalizeCustomsCode(input.customsCode);
  if (HIGH_RISK_CUSTOMS.has(customsClave)) {
    const aduana = ADUANAS.find(a => a.clave === customsClave);
    addFlag('ADU_001', `Aduana ${customsClave}${aduana ? ` (${aduana.denominacion})` : ''} con tasa histórica alta de RA.`);
  }

  // ── Score ajustado por histórico propio ──
  const ownHistory = await getImporterRAHistory(tenantId);
  if (ownHistory.total >= 5 && ownHistory.raRate > 15) {
    riskScore += 10;
  }

  riskScore = Math.max(0, Math.min(100, riskScore));
  const riskLevel: GlosaSimulationResult['riskLevel'] =
    riskScore >= 80 ? 'critical' :
    riskScore >= 60 ? 'high' :
    riskScore >= 30 ? 'medium' : 'low';

  // Probabilidades derivadas
  const raProbability = Math.min(95, Math.round(riskScore * 0.85));
  const glosaProb = Math.min(90, Math.round(riskScore * 0.7));
  const cotejoProb = Math.min(98, Math.round(40 + riskScore * 0.4)); // cotejo documental siempre alto

  // Recomendaciones
  const criticalFlags = flags.filter(f => f.severity === 'critical');
  const highFlags = flags.filter(f => f.severity === 'high');
  const recommendations: GlosaSimulationResult['recommendations'] = [];
  if (criticalFlags.length > 0) {
    recommendations.push({
      priority: 'critical',
      items: criticalFlags.map(f => f.recommendation),
    });
  }
  if (highFlags.length > 0 || riskLevel === 'high' || riskLevel === 'critical') {
    recommendations.push({
      priority: 'recommended',
      items: [
        ...highFlags.map(f => f.recommendation),
        ...(riskLevel === 'high' || riskLevel === 'critical'
          ? [
              'Tener documentación completa lista (invoice, BL, packing, COO, MVE).',
              'Considerar otorgar garantía en cuenta aduanera (Anexo 13 RGCE).',
              'Tener especialista en clasificación disponible para responder al ARA.',
            ]
          : []),
      ],
    });
  }

  const industryAverage = await getIndustryAverage(input.fractionCode);

  // Persistir
  const created = await prisma.glosaSimulation.create({
    data: {
      tenantId, userId,
      pedimentoData: input as unknown as object,
      fractionCode: input.fractionCode,
      countryOrigin: input.countryOrigin,
      countryProvider: input.countryProvider,
      customsCode: input.customsCode,
      regimenCode: input.regimenCode,
      valueUSD: input.totalValueUSD,
      valueMXN: input.totalValueMXN ?? input.totalValueUSD * 17,
      weightKg: input.weightKg,
      units: input.units ?? null,
      unitMeasure: input.unitMeasure ?? null,
      riskScore,
      riskLevel,
      raProbability,
      cotejoProb,
      glosaProb,
      riskFlags: flags as unknown as object,
      recommendations: recommendations as unknown as object,
      industryAverage: industryAverage ?? null,
      yourHistory: ownHistory.total >= 5 ? ownHistory.raRate : null,
    },
  });

  return {
    simulationId: created.id,
    riskScore,
    riskLevel,
    raProbability,
    cotejoProb,
    glosaProb,
    flags,
    recommendations,
    industryAverage,
    yourHistory: ownHistory.total >= 5 ? ownHistory.raRate : null,
    disclaimer: DISCLAIMER,
  };
}

export async function recordOutcome(simulationId: string, tenantId: string, outcome: 'ra_yes' | 'ra_no' | 'documental' | 'free', notes?: string): Promise<void> {
  await prisma.glosaSimulation.update({
    where: { id: simulationId, tenantId },
    data: {
      actualOutcome: outcome,
      feedbackAt: new Date(),
      feedbackNotes: notes ?? null,
    },
  });
}

export async function getSimulationStats(): Promise<{
  total: number;
  byLevel: { level: string; count: number }[];
  topRules: { ruleCode: string; name: string; activations: number }[];
  customsRA: { customs: string; ra: number; total: number }[];
  modelCalibration: { predictedAvg: number; actualRA: number; total: number };
}> {
  const total = await prisma.glosaSimulation.count();
  const byLevel = await prisma.glosaSimulation.groupBy({
    by: ['riskLevel'], _count: { _all: true },
  });

  // Top reglas activadas
  const allSims = await prisma.glosaSimulation.findMany({ select: { riskFlags: true }, take: 1000 });
  const ruleCounts = new Map<string, { count: number; name: string }>();
  for (const s of allSims) {
    const fs = (s.riskFlags as unknown as { ruleCode: string; name: string }[]) ?? [];
    for (const f of fs) {
      const cur = ruleCounts.get(f.ruleCode);
      if (cur) cur.count++;
      else ruleCounts.set(f.ruleCode, { count: 1, name: f.name });
    }
  }
  const topRules = Array.from(ruleCounts.entries())
    .map(([ruleCode, v]) => ({ ruleCode, name: v.name, activations: v.count }))
    .sort((a, b) => b.activations - a.activations)
    .slice(0, 10);

  // Aduanas más riesgosas
  const customsGroup = await prisma.glosaSimulation.groupBy({
    by: ['customsCode', 'actualOutcome'], _count: { _all: true },
    where: { actualOutcome: { not: null } },
  });
  const cMap = new Map<string, { ra: number; total: number }>();
  for (const g of customsGroup) {
    const cur = cMap.get(g.customsCode) ?? { ra: 0, total: 0 };
    cur.total += g._count._all;
    if (g.actualOutcome === 'ra_yes') cur.ra += g._count._all;
    cMap.set(g.customsCode, cur);
  }
  const customsRA = Array.from(cMap.entries())
    .map(([customs, v]) => ({ customs, ra: v.ra, total: v.total }))
    .filter(x => x.total >= 3)
    .sort((a, b) => (b.ra / b.total) - (a.ra / a.total))
    .slice(0, 10);

  // Calibración del modelo
  const verified = await prisma.glosaSimulation.findMany({
    where: { actualOutcome: { not: null } },
    select: { raProbability: true, actualOutcome: true },
    take: 500,
  });
  const predAvg = verified.length > 0
    ? Math.round(verified.reduce((s, v) => s + v.raProbability, 0) / verified.length)
    : 0;
  const actualRA = verified.length > 0
    ? Math.round((verified.filter(v => v.actualOutcome === 'ra_yes').length / verified.length) * 100)
    : 0;

  return {
    total,
    byLevel: byLevel.map(l => ({ level: l.riskLevel, count: l._count._all })),
    topRules,
    customsRA,
    modelCalibration: { predictedAvg: predAvg, actualRA, total: verified.length },
  };
}
