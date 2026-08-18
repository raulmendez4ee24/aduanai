/**
 * Generador inteligente de alertas — calcula impacto REAL por tenant
 * (no plantillas genéricas).
 *
 * Tipos de alertas:
 *   - import_expiring    → TemporaryImport próxima a vencer (IMMEX)
 *   - credit_expiring    → TaxCredit próximo a vencer
 *   - guarantee_expiring → Guarantee próxima a vencer
 *   - tariff_change      → cambio de arancel preferencial impacta operaciones del tenant
 *   - antidumping_new    → nueva cuota compensatoria afecta importaciones recientes
 *   - subvaluation_risk  → operación con valor bajo precio estimado SAT
 *
 * Convenciones:
 *   - severity: 'critical' | 'high' | 'medium' | 'low'
 *   - estimatedImpactMXN positivo = ahorro, negativo = costo, 0 = riesgo neutro
 *   - fingerprint: hash determinista para deduplicar (tenantId|type|key)
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { formatCuota } from '../lib/cuota-format';
import { tipoCambioMXN } from './frontera-canonica';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertImpactType = 'savings' | 'cost' | 'risk';

export interface SuggestedAction {
  type: 'recalculate_quotes' | 'review_operation' | 'renew_guarantee' | 'discharge_credit' | 'notify_client' | 'view_fraction' | 'open_module';
  label: string;
  payload?: Record<string, unknown>;
}

export interface AlertSpec {
  type: string;
  channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP';
  severity: AlertSeverity;
  title: string;
  content: string;
  affectedFraction?: string | null;
  affectedOperations?: string[];
  estimatedImpactMXN?: number | null;
  impactType?: AlertImpactType | null;
  actionRequired?: string | null;
  suggestedAction?: SuggestedAction | null;
  dueDate?: Date | null;
  fractionCodes?: string[];
  isDemoData?: boolean;
  /** Componentes únicos para construir el fingerprint dedup */
  fingerprintParts: string[];
}

const fingerprintOf = (tenantId: string, type: string, parts: string[]): string =>
  crypto.createHash('sha256')
    .update([tenantId, type, ...parts].join('|'))
    .digest('hex')
    .slice(0, 32);

const daysBetween = (from: Date, to: Date): number =>
  Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

function severityForDays(daysToDue: number): AlertSeverity {
  if (daysToDue <= 7) return 'critical';
  if (daysToDue <= 30) return 'high';
  if (daysToDue <= 90) return 'medium';
  return 'low';
}

function severityForImpact(absMXN: number, daysToDue?: number): AlertSeverity {
  if (daysToDue != null && daysToDue <= 7) return 'critical';
  if (absMXN >= 100000 || (daysToDue != null && daysToDue <= 30)) return 'high';
  if (absMXN >= 10000) return 'medium';
  return 'low';
}

const formatMXN = (n: number): string =>
  Math.round(n).toLocaleString('es-MX');

// ──────────────────────────────────────────────────────────────────────
// Generadores por categoría — calculan sobre datos REALES del tenant
// ──────────────────────────────────────────────────────────────────────

export async function generateImportExpiringAlerts(tenantId: string, isDemoData = false): Promise<AlertSpec[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const imports = await prisma.temporaryImport.findMany({
    where: {
      tenantId,
      status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] },
      expirationDate: { gte: now, lte: cutoff },
    },
    orderBy: { expirationDate: 'asc' },
    take: 30,
  });

  // Frontera Canónica: TC real con procedencia — el `* 18` constante queda
  // prohibido (test anti-reincidencia). Sin valueMXN capturado y sin TC del
  // día, el monto NO se estima: la alerta sale sin cifra, no con una inventada.
  const tc = await tipoCambioMXN();

  return imports.map(imp => {
    const days = daysBetween(now, imp.expirationDate);
    const remaining = imp.quantity - imp.quantityDischarged;
    const valueMXN = imp.valueMXN ?? (tc.valor != null ? imp.customsValue * tc.valor : null);
    const remainingValueMXN = valueMXN != null ? valueMXN * (remaining / imp.quantity) : null;
    const severity = severityForDays(days);
    return {
      type: 'import_expiring',
      channel: 'IN_APP' as const,
      severity,
      title: `Importación temporal vence en ${days} día${days === 1 ? '' : 's'} — ${imp.fractionCode}`,
      content: `Pedimento ${imp.pedimento} (fracción ${imp.fractionCode}) tiene saldo no descargado de ${remaining.toFixed(2)} ${imp.unit}. ` +
        `Si no se retorna, vende nacionalmente o regulariza antes del ${imp.expirationDate.toISOString().slice(0, 10)}, ` +
        `procede cambio de régimen con pago de IGI + IVA + recargos${remainingValueMXN != null ? ` sobre ~$${formatMXN(remainingValueMXN)} MXN de valor pendiente` : ' (valor pendiente no estimable: TC del día no disponible)'}.`,
      affectedFraction: imp.fractionCode,
      affectedOperations: [imp.id],
      estimatedImpactMXN: remainingValueMXN != null ? -Math.round(remainingValueMXN * 0.30) : null, // costo aprox: arancel + IVA + recargos
      impactType: 'cost',
      actionRequired: severity === 'critical' ? 'Acción inmediata: descargar, retornar o cambiar régimen' : 'Plan de descargo o retorno',
      suggestedAction: {
        type: 'review_operation',
        label: 'Ver inventario IMMEX',
        payload: { importId: imp.id, route: '/inventario' },
      },
      dueDate: imp.expirationDate,
      fractionCodes: [imp.fractionCode],
      isDemoData,
      fingerprintParts: ['import_expiring', imp.id],
    };
  });
}

export async function generateCreditExpiringAlerts(tenantId: string, isDemoData = false): Promise<AlertSpec[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const credits = await prisma.taxCredit.findMany({
    where: {
      tenantId,
      status: { in: ['ACTIVE', 'PARTIALLY_USED'] },
      dischargeDeadline: { gte: now, lte: cutoff },
      remaining: { gt: 0 },
    },
    orderBy: { dischargeDeadline: 'asc' },
    take: 20,
  });

  return credits.map(c => {
    const days = daysBetween(now, c.dischargeDeadline);
    const severity = severityForDays(days);
    return {
      type: 'credit_expiring',
      channel: 'IN_APP' as const,
      severity,
      title: `Crédito IVA/IEPS expira en ${days} día${days === 1 ? '' : 's'} — fracción ${c.fractionCode}`,
      content: `Crédito ${c.pedimento} con saldo de $${formatMXN(c.remaining)} MXN vence el ${c.dischargeDeadline.toISOString().slice(0, 10)}. ` +
        `Si no se descarga (retorno o virtual), el saldo se considera irregular y se pierde como recuperable.`,
      affectedFraction: c.fractionCode,
      affectedOperations: [c.id],
      estimatedImpactMXN: -Math.round(c.remaining),
      impactType: 'cost',
      actionRequired: severity === 'critical' ? 'Aplicar descargo de crédito esta semana' : 'Programar descargo en próximas operaciones',
      suggestedAction: {
        type: 'discharge_credit',
        label: 'Aplicar descargo',
        payload: { creditId: c.id, route: '/fiscal' },
      },
      dueDate: c.dischargeDeadline,
      fractionCodes: [c.fractionCode],
      isDemoData,
      fingerprintParts: ['credit_expiring', c.id],
    };
  });
}

export async function generateGuaranteeExpiringAlerts(tenantId: string, isDemoData = false): Promise<AlertSpec[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const guarantees = await prisma.guarantee.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      expiryDate: { gte: now, lte: cutoff },
    },
    orderBy: { expiryDate: 'asc' },
    take: 20,
  });

  return guarantees.map(g => {
    const days = daysBetween(now, g.expiryDate);
    const severity = severityForDays(days);
    return {
      type: 'guarantee_expiring',
      channel: 'IN_APP' as const,
      severity,
      title: `Garantía ${g.type} vence en ${days} día${days === 1 ? '' : 's'}`,
      content: `Garantía con ${g.institution} (${g.referenceNumber ?? 's/n'}) por $${formatMXN(g.amount)} MXN vence el ${g.expiryDate.toISOString().slice(0, 10)}. ` +
        `Sin renovación se pierde la cobertura sobre operaciones IMMEX/Anexo 31; gestiona renovación al menos 15 días antes.`,
      affectedOperations: [g.id],
      estimatedImpactMXN: -Math.round(g.amount * 0.05), // costo de oportunidad si caduca
      impactType: 'risk',
      actionRequired: severity === 'critical' ? 'Renovación inmediata' : 'Iniciar trámite de renovación',
      suggestedAction: {
        type: 'renew_guarantee',
        label: 'Ver garantías',
        payload: { guaranteeId: g.id, route: '/fiscal' },
      },
      dueDate: g.expiryDate,
      fractionCodes: [],
      isDemoData,
      fingerprintParts: ['guarantee_expiring', g.id],
    };
  });
}

export async function generateTariffChangeAlerts(tenantId: string, isDemoData = false): Promise<AlertSpec[]> {
  // Para fracciones con importaciones recientes del tenant, evaluar si hay
  // beneficio TMEC/TLCUEM no aplicado o reducciones previstas.
  const recentFractions = await prisma.temporaryImport.groupBy({
    by: ['fractionCode'],
    where: { tenantId, entryDate: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
    _count: { _all: true },
    _sum: { customsValue: true },
    orderBy: { _count: { fractionCode: 'desc' } },
    take: 8,
  });
  if (recentFractions.length === 0) return [];

  const fracDetails = await prisma.fraction.findMany({
    where: { code: { in: recentFractions.map(f => f.fractionCode) } },
    select: { code: true, codeFormatted: true, description: true, tariffNMF: true, tariffTMEC: true, tariffTLCUE: true, tariffCPTPP: true },
  });
  const detailMap = new Map(fracDetails.map(f => [f.code, f]));

  // TC real (Frontera Canónica): sin TC del día no se proyectan ahorros en MXN
  // — la alerta de oportunidad se omite antes que estimarla con una constante.
  const tcAhorro = await tipoCambioMXN();
  if (tcAhorro.valor == null) return [];
  const tcMXN = tcAhorro.valor;

  const out: AlertSpec[] = [];
  const now = new Date();
  for (const grp of recentFractions) {
    const f = detailMap.get(grp.fractionCode);
    if (!f || f.tariffNMF == null) continue;
    const operations = grp._count._all;
    const totalValueUSD = grp._sum.customsValue ?? 0;
    const avgValueUSD = operations > 0 ? totalValueUSD / operations : 0;

    // Proyección: si tariffTMEC o TLCUE es menor y hay operaciones similares próximas, calcular ahorro
    const candidates: { treaty: string; rate: number; saving: number }[] = [];
    if (f.tariffTMEC != null && f.tariffTMEC < f.tariffNMF) {
      const annualSavingMXN = avgValueUSD * tcMXN * ((f.tariffNMF - f.tariffTMEC) / 100) * operations;
      if (annualSavingMXN > 5000) candidates.push({ treaty: 'TMEC', rate: f.tariffTMEC, saving: annualSavingMXN });
    }
    if (f.tariffTLCUE != null && f.tariffTLCUE < f.tariffNMF) {
      const annualSavingMXN = avgValueUSD * tcMXN * ((f.tariffNMF - f.tariffTLCUE) / 100) * operations;
      if (annualSavingMXN > 5000) candidates.push({ treaty: 'TLCUEM', rate: f.tariffTLCUE, saving: annualSavingMXN });
    }
    if (candidates.length === 0) continue;
    const best = candidates.sort((a, b) => b.saving - a.saving)[0];
    const severity = severityForImpact(best.saving);

    out.push({
      type: 'tariff_change',
      channel: 'IN_APP',
      severity,
      title: `Reducción ${best.treaty} para ${f.codeFormatted} — ahorro estimado $${formatMXN(best.saving)} MXN/año`,
      content: `Tienes ${operations} importaciones de ${f.codeFormatted} (${f.description}). ` +
        `Aplicando ${best.treaty} (${best.rate}% IGI vs ${f.tariffNMF}% NMF) ahorrarías ~$${formatMXN(best.saving)} MXN al año. ` +
        `Verifica origen elegible y certificado de origen vigente antes de re-cotizar.`,
      affectedFraction: grp.fractionCode,
      estimatedImpactMXN: Math.round(best.saving),
      impactType: 'savings',
      actionRequired: 'Recalcular cotizaciones con tratado preferencial',
      suggestedAction: {
        type: 'recalculate_quotes',
        label: 'Recalcular cotizaciones',
        payload: { fractionCode: grp.fractionCode, treaty: best.treaty, route: '/cotizador' },
      },
      dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      fractionCodes: [grp.fractionCode],
      isDemoData,
      fingerprintParts: ['tariff_change', grp.fractionCode, best.treaty],
    });
  }
  return out;
}

export async function generateAntidumpingAlerts(tenantId: string, isDemoData = false): Promise<AlertSpec[]> {
  const recentImports = await prisma.temporaryImport.findMany({
    where: { tenantId, entryDate: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
    select: { fractionCode: true, originCountry: true, customsValue: true, valueMXN: true },
    take: 200,
  });
  // TC real (Frontera Canónica). Si no hay TC, los imports sin valueMXN
  // capturado NO suman al agregado (exposición subestimada honesta, no
  // inflada con una constante inventada).
  const tcAd = await tipoCambioMXN();
  const fracCountryPairs = new Map<string, { count: number; valueMXN: number }>();
  for (const imp of recentImports) {
    if (!imp.originCountry) continue;
    const k = `${imp.fractionCode}|${imp.originCountry.toUpperCase().slice(0, 2)}`;
    const existing = fracCountryPairs.get(k) ?? { count: 0, valueMXN: 0 };
    existing.count++;
    const mxn = imp.valueMXN ?? (tcAd.valor != null ? imp.customsValue * tcAd.valor : null);
    if (mxn != null) existing.valueMXN += mxn;
    fracCountryPairs.set(k, existing);
  }
  if (fracCountryPairs.size === 0) return [];

  const antidumpings = await prisma.antidumpingDuty.findMany({
    where: { active: true },
    select: { fractionCode: true, countryOfOrigin: true, rate: true, rateType: true, rateUnit: true, decree: true, publishDate: true, notes: true },
  });

  const out: AlertSpec[] = [];
  for (const ad of antidumpings) {
    const k = `${ad.fractionCode}|${ad.countryOfOrigin}`;
    const matching = fracCountryPairs.get(k);
    if (!matching) continue;
    // Formateo de la cuota: SIEMPRE vía el helper único (antes asumía %).
    const cuotaLabel = formatCuota(ad.rateType, ad.rate, ad.rateUnit);
    // La exposición en MXN solo es calculable directo para cuotas ad valorem (%).
    // Para específicas (USD/kg, USD/unidad) depende del peso/unidades, que NO tenemos
    // en este agregado de pedimentos → no inventamos un monto (antes multiplicaba
    // rate/100 y daba un número incorrecto para cuotas USD/kg).
    const exposureMXN = ad.rateType === 'percentage' ? matching.valueMXN * (ad.rate / 100) : null;
    const severity = exposureMXN != null ? severityForImpact(exposureMXN) : 'medium';
    out.push({
      type: 'antidumping_new',
      channel: 'IN_APP',
      severity,
      title: `Cuota compensatoria ${cuotaLabel} activa — ${ad.fractionCode} origen ${ad.countryOfOrigin}`,
      content: `Tienes ${matching.count} importación(es) recientes de ${ad.fractionCode} desde ${ad.countryOfOrigin}. ` +
        `Aplica cuota compensatoria de ${cuotaLabel} (decreto ${ad.decree ?? 's/n'}). ` +
        (exposureMXN != null
          ? `Exposición estimada acumulada: $${formatMXN(exposureMXN)} MXN. `
          : `La exposición depende del peso/unidades importados — calcúlala en el Cotizador. `) +
        `Considera cambiar de origen o documentar transformación sustancial.`,
      affectedFraction: ad.fractionCode,
      estimatedImpactMXN: exposureMXN != null ? -Math.round(exposureMXN) : null,
      impactType: 'cost',
      actionRequired: 'Evaluar cambio de origen o documentación reforzada',
      suggestedAction: {
        type: 'view_fraction',
        label: 'Ver cuotas compensatorias',
        payload: { fractionCode: ad.fractionCode, route: '/fracciones' },
      },
      fractionCodes: [ad.fractionCode],
      isDemoData,
      fingerprintParts: ['antidumping_new', ad.fractionCode, ad.countryOfOrigin],
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Persistencia con upsert por fingerprint (deduplicación)
// ──────────────────────────────────────────────────────────────────────

export async function upsertAlerts(tenantId: string, specs: AlertSpec[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  const now = new Date();

  for (const s of specs) {
    const fingerprint = fingerprintOf(tenantId, s.type, s.fingerprintParts);
    const daysToDue = s.dueDate ? daysBetween(now, s.dueDate) : null;

    const existing = await prisma.alert.findFirst({
      where: { tenantId, fingerprint },
      select: { id: true, ignored: true, resolvedAt: true, snoozedUntil: true },
    });

    if (existing && (existing.ignored || existing.resolvedAt)) {
      // Respeta el estado del usuario; no sobreescribir
      continue;
    }

    if (existing) {
      // Actualiza el contenido si cambió el contexto
      await prisma.alert.update({
        where: { id: existing.id },
        data: {
          title: s.title,
          content: s.content,
          severity: s.severity,
          affectedFraction: s.affectedFraction ?? null,
          affectedOperations: s.affectedOperations ?? [],
          estimatedImpactMXN: s.estimatedImpactMXN ?? null,
          impactType: s.impactType ?? null,
          actionRequired: s.actionRequired ?? null,
          suggestedAction: (s.suggestedAction as unknown as object) ?? null,
          dueDate: s.dueDate ?? null,
          daysToDue,
          fractionCodes: s.fractionCodes ?? [],
          channel: s.channel,
        },
      });
      updated++;
    } else {
      await prisma.alert.create({
        data: {
          tenantId,
          channel: s.channel,
          type: s.type,
          severity: s.severity,
          title: s.title,
          content: s.content,
          affectedFraction: s.affectedFraction ?? null,
          affectedOperations: s.affectedOperations ?? [],
          estimatedImpactMXN: s.estimatedImpactMXN ?? null,
          impactType: s.impactType ?? null,
          actionRequired: s.actionRequired ?? null,
          suggestedAction: (s.suggestedAction as unknown as object) ?? null,
          dueDate: s.dueDate ?? null,
          daysToDue,
          fractionCodes: s.fractionCodes ?? [],
          fingerprint,
          isDemoData: s.isDemoData ?? false,
        },
      });
      inserted++;
    }
  }

  return { inserted, updated };
}

// ──────────────────────────────────────────────────────────────────────
// Padrones SAT — vencimiento + intentos de operar sin padrón vigente
// ──────────────────────────────────────────────────────────────────────

export async function generatePadronAlerts(tenantId: string, isDemoData = false): Promise<AlertSpec[]> {
  const now = new Date();
  const specs: AlertSpec[] = [];

  // 1. Padrones próximos a vencer o ya vencidos
  const statuses = await prisma.tenantPadronStatus.findMany({
    where: { tenantId, status: 'active' },
    include: { padron: true },
  });
  for (const s of statuses) {
    if (!s.expirationDate) continue;
    const days = daysBetween(now, s.expirationDate);
    const padronLabel = s.padron.type === 'general'
      ? 'Padrón General de Importadores'
      : `Padrón Sectorial ${s.padron.sectorialCode} (${s.padron.sectorialName})`;

    if (days < 0) {
      specs.push({
        type: 'padron_expired',
        channel: 'IN_APP',
        severity: 'critical',
        title: `${padronLabel} VENCIDO`,
        content: `Tu inscripción venció el ${s.expirationDate.toLocaleDateString('es-MX')} (hace ${Math.abs(days)} días). El SAT puede embargar la mercancía y aplicar multa 130-150% del valor (Art. 151, 178 LA).`,
        actionRequired: 'Renovar inscripción de inmediato — bloquea operaciones',
        dueDate: s.expirationDate,
        suggestedAction: { type: 'open_module', label: 'Ir a Padrones', payload: { path: '/settings/padrones' } },
        fingerprintParts: [s.padronId, 'expired'],
        isDemoData,
      });
    } else if (days <= 7) {
      specs.push({
        type: 'padron_expiring',
        channel: 'IN_APP',
        severity: 'critical',
        title: `${padronLabel} vence en ${days} días`,
        content: `Tu inscripción vence el ${s.expirationDate.toLocaleDateString('es-MX')}. Sin padrón vigente no podrás importar.`,
        actionRequired: 'Iniciar trámite de renovación HOY',
        dueDate: s.expirationDate,
        suggestedAction: { type: 'open_module', label: 'Ir a Padrones', payload: { path: '/settings/padrones' } },
        fingerprintParts: [s.padronId, 'expiring_7d'],
        isDemoData,
      });
    } else if (days <= 30) {
      specs.push({
        type: 'padron_expiring',
        channel: 'IN_APP',
        severity: 'high',
        title: `${padronLabel} vence en ${days} días`,
        content: `Tu inscripción vence el ${s.expirationDate.toLocaleDateString('es-MX')}. Programa la renovación con anticipación.`,
        actionRequired: 'Iniciar renovación dentro de los próximos 15 días',
        dueDate: s.expirationDate,
        suggestedAction: { type: 'open_module', label: 'Ir a Padrones', payload: { path: '/settings/padrones' } },
        fingerprintParts: [s.padronId, 'expiring_30d'],
        isDemoData,
      });
    }
  }

  // 2. Intentos recientes de operar sin padrón vigente (clasificaciones / cotizaciones)
  const since = new Date(Date.now() - 14 * 86400000);
  const blockedChecks = await prisma.padronCheck.findMany({
    where: { tenantId, canOperate: false, checkedAt: { gte: since } },
    orderBy: { checkedAt: 'desc' },
    take: 200,
  });
  if (blockedChecks.length > 0) {
    const fractionCounts = new Map<string, number>();
    const allMissingByFraction = new Map<string, Set<string>>();
    for (const c of blockedChecks) {
      fractionCounts.set(c.fractionCode, (fractionCounts.get(c.fractionCode) ?? 0) + 1);
      const blocking = (c.blockingPadrones as unknown as Array<{ sectorialName: string }>) ?? [];
      const set = allMissingByFraction.get(c.fractionCode) ?? new Set<string>();
      blocking.forEach(b => set.add(b.sectorialName));
      allMissingByFraction.set(c.fractionCode, set);
    }
    for (const [fraction, count] of fractionCounts) {
      const missing = Array.from(allMissingByFraction.get(fraction) ?? new Set<string>());
      specs.push({
        type: 'padron_blocked_attempts',
        channel: 'IN_APP',
        severity: count >= 5 ? 'high' : 'medium',
        title: `${count} intento(s) de operar fracción ${fraction} sin padrón vigente`,
        content: `Has intentado clasificar/cotizar la fracción ${fraction} ${count} veces en los últimos 14 días sin estar inscrito en: ${missing.join(', ')}. Si llegan a pedimento real, hay riesgo de embargo + multa 130-150%.`,
        affectedFraction: fraction,
        actionRequired: `Inscribir al padrón antes de operar ${fraction}`,
        suggestedAction: { type: 'open_module', label: 'Ir a Padrones', payload: { path: '/settings/padrones' } },
        fingerprintParts: [fraction, 'blocked'],
        isDemoData,
      });
    }
  }

  return specs;
}

/** Genera y persiste todas las categorías de alertas inteligentes para un tenant. */
export async function regenerateAlerts(tenantId: string, isDemoData = false): Promise<{ inserted: number; updated: number; specs: number }> {
  const [imports, credits, guarantees, tariffs, antidumpings, padrones] = await Promise.all([
    generateImportExpiringAlerts(tenantId, isDemoData),
    generateCreditExpiringAlerts(tenantId, isDemoData),
    generateGuaranteeExpiringAlerts(tenantId, isDemoData),
    generateTariffChangeAlerts(tenantId, isDemoData),
    generateAntidumpingAlerts(tenantId, isDemoData),
    generatePadronAlerts(tenantId, isDemoData),
  ]);
  const all = [...imports, ...credits, ...guarantees, ...tariffs, ...antidumpings, ...padrones];
  const result = await upsertAlerts(tenantId, all);
  return { ...result, specs: all.length };
}
