/**
 * ROI Service — calcula el valor entregado por ADUANAI a cada tenant
 * y un Compliance Score 0-100.
 *
 * Las constantes son estimaciones DEFENDIBLES (no infladas) basadas en:
 *  - Costo promedio de consultoría aduanal por clasificación: $2,500 MXN
 *    (mercado: $1,500 - $4,000 MXN/clasif)
 *  - Multa SAT promedio por error en saldo IMMEX vencido: $50,000 MXN
 *    (Art. 184 LA — multa hasta 130-150% del IGI omitido)
 *  - Costo de perder certificación AA: $1,200,000 MXN/año en IGI/IVA
 *    diferido + tiempo de despacho extra (estimación conservadora)
 *  - Hora de analista comex preparando cotización: $500 MXN
 *  - MVE preparada por agente externo: $1,200 MXN/u
 *  - LoadPlan optimizado (vs cubicaje manual): $3,500 MXN ahorro logístico
 */

import { prisma } from '../lib/prisma';

const CONSTANTS = {
  CLASSIFICATION_VALUE_MXN: 2500,
  ALERT_HANDLED_VALUE_MXN: 50000,
  CERT_AA_ANNUAL_VALUE_MXN: 1200000,
  QUOTE_VALUE_MXN: 500,
  MVE_VALUE_MXN: 1200,
  LOAD_PLAN_VALUE_MXN: 3500,
};

export interface ROISummary {
  tenantId: string;
  periodDays: number;
  periodStart: string;
  totalSavingsMXN: number;
  byModule: {
    classifier:    { count: number; perUnitMXN: number; savingsMXN: number; rationale: string };
    inventoryIMMEX:{ count: number; perUnitMXN: number; savingsMXN: number; rationale: string };
    fiscalGuardian:{ count: number; perUnitMXN: number; savingsMXN: number; rationale: string };
    quoter:        { count: number; perUnitMXN: number; savingsMXN: number; rationale: string };
    mve:           { count: number; perUnitMXN: number; savingsMXN: number; rationale: string };
    logistics:     { count: number; perUnitMXN: number; savingsMXN: number; rationale: string };
  };
}

export async function computeROISummary(tenantId: string, periodDays = 30): Promise<ROISummary> {
  const periodStart = new Date(Date.now() - periodDays * 86400000);

  const [
    classCount,
    alertsAttendedCount,
    cert,
    quoteCount,
    mveSignedCount,
    loadPlansCount,
  ] = await Promise.all([
    prisma.classification.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
    prisma.alert.count({ where: { tenantId, read: true, createdAt: { gte: periodStart } } }),
    prisma.certificationProfile.findUnique({ where: { tenantId } }),
    prisma.quote.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
    prisma.manifestacionValor.count({
      where: {
        tenantId,
        status: { in: ['SIGNED', 'TRANSMITTED'] },
        createdAt: { gte: periodStart },
      },
    }),
    prisma.loadPlan.count({
      where: {
        tenantId,
        status: { in: ['optimized', 'shipped'] },
        createdAt: { gte: periodStart },
      },
    }),
  ]);

  // Cert AA: prorratear el ahorro anual al periodo
  const certActive = cert?.status === 'ACTIVE';
  const certPerPeriod = certActive
    ? Math.round(CONSTANTS.CERT_AA_ANNUAL_VALUE_MXN * (periodDays / 365))
    : 0;

  const byModule = {
    classifier: {
      count: classCount,
      perUnitMXN: CONSTANTS.CLASSIFICATION_VALUE_MXN,
      savingsMXN: classCount * CONSTANTS.CLASSIFICATION_VALUE_MXN,
      rationale: `${classCount} clasificaciones × $${CONSTANTS.CLASSIFICATION_VALUE_MXN.toLocaleString('es-MX')} MXN (costo promedio de consultoría externa por clasificación)`,
    },
    inventoryIMMEX: {
      count: alertsAttendedCount,
      perUnitMXN: CONSTANTS.ALERT_HANDLED_VALUE_MXN,
      savingsMXN: alertsAttendedCount * CONSTANTS.ALERT_HANDLED_VALUE_MXN,
      rationale: `${alertsAttendedCount} alertas atendidas × $${CONSTANTS.ALERT_HANDLED_VALUE_MXN.toLocaleString('es-MX')} MXN (multa SAT promedio Art. 184 LA por saldo IMMEX vencido)`,
    },
    fiscalGuardian: {
      count: certActive ? 1 : 0,
      perUnitMXN: CONSTANTS.CERT_AA_ANNUAL_VALUE_MXN,
      savingsMXN: certPerPeriod,
      rationale: certActive
        ? `Certificación ${cert?.modality ?? 'AA'} vigente — costo evitado anualizado: $${CONSTANTS.CERT_AA_ANNUAL_VALUE_MXN.toLocaleString('es-MX')} MXN; prorrateado a ${periodDays} días.`
        : 'Sin certificación activa: ROI fiscal = $0',
    },
    quoter: {
      count: quoteCount,
      perUnitMXN: CONSTANTS.QUOTE_VALUE_MXN,
      savingsMXN: quoteCount * CONSTANTS.QUOTE_VALUE_MXN,
      rationale: `${quoteCount} cotizaciones × $${CONSTANTS.QUOTE_VALUE_MXN.toLocaleString('es-MX')} MXN (hora de analista comex)`,
    },
    mve: {
      count: mveSignedCount,
      perUnitMXN: CONSTANTS.MVE_VALUE_MXN,
      savingsMXN: mveSignedCount * CONSTANTS.MVE_VALUE_MXN,
      rationale: `${mveSignedCount} MVE firmadas × $${CONSTANTS.MVE_VALUE_MXN.toLocaleString('es-MX')} MXN (preparación por agente externo)`,
    },
    logistics: {
      count: loadPlansCount,
      perUnitMXN: CONSTANTS.LOAD_PLAN_VALUE_MXN,
      savingsMXN: loadPlansCount * CONSTANTS.LOAD_PLAN_VALUE_MXN,
      rationale: `${loadPlansCount} planes optimizados × $${CONSTANTS.LOAD_PLAN_VALUE_MXN.toLocaleString('es-MX')} MXN (ahorro logístico vs cubicaje manual)`,
    },
  };

  const totalSavingsMXN = Object.values(byModule).reduce((s, m) => s + m.savingsMXN, 0);

  return {
    tenantId,
    periodDays,
    periodStart: periodStart.toISOString(),
    totalSavingsMXN,
    byModule,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Compliance Score 0-100
// ──────────────────────────────────────────────────────────────────────────

export interface ComplianceScore {
  tenantId: string;
  score: number;          // 0-100
  status: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'DEFICIENTE';
  computedAt: string;
  breakdown: {
    expedientes:      { value: number; weight: number; detail: string };
    inventarios:      { value: number; weight: number; detail: string };
    certificacion:    { value: number; weight: number; detail: string };
    alertas:          { value: number; weight: number; detail: string };
    clasificaciones:  { value: number; weight: number; detail: string };
  };
  recommendations: string[];
}

const WEIGHTS = {
  expedientes: 0.25,
  inventarios: 0.30,
  certificacion: 0.20,
  alertas: 0.15,
  clasificaciones: 0.10,
};

export async function computeComplianceScore(tenantId: string): Promise<ComplianceScore> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const [
    operations,
    importsActive,
    importsExpiring,
    cert,
    alertsTotal,
    alertsRead,
    classTotal,
    classCorrect,
  ] = await Promise.all([
    prisma.operation.findMany({
      where: { tenantId },
      select: { completeness: true },
    }),
    prisma.temporaryImport.count({
      where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } },
    }),
    prisma.temporaryImport.count({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] },
        expirationDate: { lte: in30, gte: now },
      },
    }),
    prisma.certificationProfile.findUnique({ where: { tenantId } }),
    prisma.alert.count({ where: { tenantId } }),
    prisma.alert.count({ where: { tenantId, read: true } }),
    prisma.classification.count({ where: { tenantId, feedback: { not: null } } }),
    prisma.classification.count({ where: { tenantId, feedback: 'correct' } }),
  ]);

  // Expedientes: promedio de completeness
  const expedientesValue = operations.length === 0
    ? 100  // sin expedientes, no penaliza
    : Math.round(operations.reduce((s, o) => s + o.completeness, 0) / operations.length);

  // Inventarios: % de imports activos sin riesgo de vencimiento <30d
  const inventariosValue = importsActive === 0
    ? 100
    : Math.round(((importsActive - importsExpiring) / importsActive) * 100);

  // Certificación: ACTIVE=100, RENEWAL_PENDING=70, AT_RISK=40, otros=0
  let certValue = 0;
  let certDetail = 'Sin certificación registrada';
  if (cert) {
    if (cert.status === 'ACTIVE') { certValue = 100; certDetail = `Modalidad ${cert.modality} vigente`; }
    else if (cert.status === 'RENEWAL_PENDING') { certValue = 70; certDetail = 'Renovación pendiente'; }
    else if (cert.status === 'AT_RISK') { certValue = 40; certDetail = 'Certificación en riesgo'; }
    else { certValue = 0; certDetail = `Estado: ${cert.status}`; }
  }

  // Alertas atendidas: % leídas
  const alertasValue = alertsTotal === 0
    ? 100
    : Math.round((alertsRead / alertsTotal) * 100);

  // Clasificaciones validadas: % correct sobre clasificaciones con feedback
  const clasifValue = classTotal === 0
    ? 100  // sin retroalimentación, no penaliza
    : Math.round((classCorrect / classTotal) * 100);

  const score = Math.round(
    expedientesValue * WEIGHTS.expedientes +
    inventariosValue * WEIGHTS.inventarios +
    certValue * WEIGHTS.certificacion +
    alertasValue * WEIGHTS.alertas +
    clasifValue * WEIGHTS.clasificaciones,
  );

  let status: ComplianceScore['status'];
  if (score >= 90) status = 'EXCELENTE';
  else if (score >= 75) status = 'BUENO';
  else if (score >= 60) status = 'REGULAR';
  else status = 'DEFICIENTE';

  // Recomendaciones priorizadas por mayor impacto
  const recommendations: string[] = [];
  if (importsExpiring > 0) {
    recommendations.push(`Atiende ${importsExpiring} importación(es) que vencen en menos de 30 días`);
  }
  if (cert?.status === 'RENEWAL_PENDING' || cert?.status === 'AT_RISK') {
    recommendations.push('Inicia el proceso de renovación de certificación IVA/IEPS');
  }
  if (operations.length > 0 && expedientesValue < 80) {
    const pendientes = operations.filter(o => o.completeness < 100).length;
    recommendations.push(`Completa ${pendientes} expediente(s) con documentos pendientes`);
  }
  if (alertsTotal > 0 && alertasValue < 80) {
    recommendations.push(`Revisa ${alertsTotal - alertsRead} alerta(s) sin leer`);
  }
  if (classTotal > 5 && clasifValue < 80) {
    recommendations.push('Valida las clasificaciones recientes para mejorar la calidad del modelo');
  }

  return {
    tenantId,
    score,
    status,
    computedAt: now.toISOString(),
    breakdown: {
      expedientes: {
        value: expedientesValue,
        weight: WEIGHTS.expedientes,
        detail: operations.length === 0
          ? 'Sin expedientes registrados'
          : `Promedio de completeness sobre ${operations.length} expediente(s)`,
      },
      inventarios: {
        value: inventariosValue,
        weight: WEIGHTS.inventarios,
        detail: importsActive === 0
          ? 'Sin saldos vivos en IMMEX'
          : `${importsActive - importsExpiring} de ${importsActive} import(s) sin riesgo de vencimiento <30d`,
      },
      certificacion: {
        value: certValue,
        weight: WEIGHTS.certificacion,
        detail: certDetail,
      },
      alertas: {
        value: alertasValue,
        weight: WEIGHTS.alertas,
        detail: alertsTotal === 0
          ? 'Sin alertas pendientes'
          : `${alertsRead} de ${alertsTotal} alerta(s) leídas`,
      },
      clasificaciones: {
        value: clasifValue,
        weight: WEIGHTS.clasificaciones,
        detail: classTotal === 0
          ? 'Sin clasificaciones con retroalimentación'
          : `${classCorrect} de ${classTotal} validadas como correctas`,
      },
    },
    recommendations,
  };
}
