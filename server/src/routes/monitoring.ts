/**
 * Endpoints del panel de monitoreo /admin/monitoring.
 *
 * - GET overview                    : KPIs principales
 * - GET logs?level=&endpoint=...    : stream de logs paginado
 * - GET errors                      : errores agrupados por mensaje
 * - GET ai-costs?range=             : tokens y USD por modelo/operación/tenant
 * - GET business                    : DAU/WAU/MAU + funnel de conversión
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

export const monitoringRouter = Router();

const adminOnly = [authenticate, requireRole('SUPERADMIN')];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ──────────────────────────────────────────────────────────────────────
// GET /api/admin/monitoring/overview
// ──────────────────────────────────────────────────────────────────────

monitoringRouter.get('/overview', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const lastHour = new Date(now.getTime() - HOUR);
    const lastDay = new Date(now.getTime() - DAY);
    const lastWeek = new Date(now.getTime() - 7 * DAY);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      requestsHour, requestsDay, requestsWeek,
      errorsHour, errorsDay,
      avgLatencyDay,
      aiTokensMonth, aiCostMonth,
      topEndpoints, topErrors,
    ] = await Promise.all([
      prisma.systemLog.count({ where: { timestamp: { gte: lastHour }, statusCode: { not: null } } }),
      prisma.systemLog.count({ where: { timestamp: { gte: lastDay }, statusCode: { not: null } } }),
      prisma.systemLog.count({ where: { timestamp: { gte: lastWeek }, statusCode: { not: null } } }),
      prisma.systemLog.count({ where: { timestamp: { gte: lastHour }, level: { in: ['ERROR', 'CRITICAL'] } } }),
      prisma.systemLog.count({ where: { timestamp: { gte: lastDay }, level: { in: ['ERROR', 'CRITICAL'] } } }),
      prisma.systemLog.aggregate({
        where: { timestamp: { gte: lastDay }, latencyMs: { not: null } },
        _avg: { latencyMs: true },
      }),
      prisma.aIUsageLog.aggregate({
        where: { timestamp: { gte: monthStart } },
        _sum: { totalTokens: true, costUSD: true },
      }),
      prisma.aIUsageLog.aggregate({
        where: { timestamp: { gte: monthStart } },
        _sum: { costUSD: true },
      }),
      prisma.systemLog.groupBy({
        by: ['endpoint'],
        where: { timestamp: { gte: lastDay }, endpoint: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { endpoint: 'desc' } },
        take: 10,
      }),
      prisma.systemLog.groupBy({
        by: ['errorMessage'],
        where: { timestamp: { gte: lastDay }, level: { in: ['ERROR', 'CRITICAL'] }, errorMessage: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { errorMessage: 'desc' } },
        take: 10,
      }),
    ]);

    const errorRateHour = requestsHour > 0 ? (errorsHour / requestsHour) * 100 : 0;
    const errorRateDay = requestsDay > 0 ? (errorsDay / requestsDay) * 100 : 0;

    // Sparkline de latencia: últimas 24 horas en buckets de 1h
    const buckets: { ts: string; avg: number; count: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const from = new Date(now.getTime() - (i + 1) * HOUR);
      const to = new Date(now.getTime() - i * HOUR);
      const agg = await prisma.systemLog.aggregate({
        where: { timestamp: { gte: from, lt: to }, latencyMs: { not: null } },
        _avg: { latencyMs: true },
        _count: { _all: true },
      });
      buckets.push({ ts: from.toISOString(), avg: Math.round(agg._avg.latencyMs ?? 0), count: agg._count._all });
    }

    res.json({
      status: 'ok',
      data: {
        requests: { hour: requestsHour, day: requestsDay, week: requestsWeek },
        errors: { hour: errorsHour, day: errorsDay, rateHour: Math.round(errorRateHour * 10) / 10, rateDay: Math.round(errorRateDay * 10) / 10 },
        latency: {
          avgMsDay: Math.round(avgLatencyDay._avg.latencyMs ?? 0),
          sparkline: buckets,
        },
        ai: {
          tokensMonth: aiTokensMonth._sum.totalTokens ?? 0,
          costUSDMonth: Math.round((aiCostMonth._sum.costUSD ?? 0) * 100) / 100,
        },
        topEndpoints: topEndpoints.map(e => ({ endpoint: e.endpoint, count: e._count._all })),
        topErrors: topErrors.map(e => ({ message: e.errorMessage, count: e._count._all })),
      },
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────
// GET /api/admin/monitoring/logs
// ──────────────────────────────────────────────────────────────────────

monitoringRouter.get('/logs', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const level = req.query.level ? String(req.query.level) : undefined;
    const endpoint = req.query.endpoint ? String(req.query.endpoint) : undefined;
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 24 * HOUR);
    const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 100));
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    const where: Record<string, unknown> = { timestamp: { gte: since } };
    if (level) where.level = level;
    if (endpoint) where.endpoint = endpoint;
    if (tenantId) where.tenantId = tenantId;
    if (userId) where.userId = userId;

    const rows = await prisma.systemLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });

    const nextCursor = rows.length > limit ? rows[limit].id : null;
    const items = rows.slice(0, limit);

    res.json({ status: 'ok', data: items, nextCursor });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────
// GET /api/admin/monitoring/errors
// ──────────────────────────────────────────────────────────────────────

monitoringRouter.get('/errors', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 7 * DAY);

    const rows = await prisma.systemLog.findMany({
      where: { level: { in: ['ERROR', 'CRITICAL'] }, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: 1000,
      select: {
        id: true, errorMessage: true, errorStack: true, endpoint: true,
        statusCode: true, tenantId: true, userId: true, timestamp: true, requestId: true,
      },
    });

    // Agrupar por errorMessage
    const groups = new Map<string, { message: string; count: number; lastSeen: string; tenants: Set<string>; users: Set<string>; sample: typeof rows[0] }>();
    for (const r of rows) {
      const k = r.errorMessage ?? '<sin mensaje>';
      const g = groups.get(k);
      if (g) {
        g.count++;
        if (r.timestamp.toISOString() > g.lastSeen) g.lastSeen = r.timestamp.toISOString();
        if (r.tenantId) g.tenants.add(r.tenantId);
        if (r.userId) g.users.add(r.userId);
      } else {
        groups.set(k, {
          message: k,
          count: 1,
          lastSeen: r.timestamp.toISOString(),
          tenants: new Set(r.tenantId ? [r.tenantId] : []),
          users: new Set(r.userId ? [r.userId] : []),
          sample: r,
        });
      }
    }

    const out = [...groups.values()]
      .map(g => ({
        message: g.message,
        count: g.count,
        lastSeen: g.lastSeen,
        affectedTenants: g.tenants.size,
        affectedUsers: g.users.size,
        sample: g.sample,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    res.json({ status: 'ok', data: out });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────
// GET /api/admin/monitoring/ai-costs
// ──────────────────────────────────────────────────────────────────────

monitoringRouter.get('/ai-costs', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const range = String(req.query.range ?? 'month');
    const now = new Date();
    let since: Date;
    if (range === 'day') since = new Date(now.getTime() - DAY);
    else if (range === 'week') since = new Date(now.getTime() - 7 * DAY);
    else if (range === 'year') since = new Date(now.getFullYear(), 0, 1);
    else since = new Date(now.getFullYear(), now.getMonth(), 1);

    const [byModel, byOp, byTenant, daily, totals] = await Promise.all([
      prisma.aIUsageLog.groupBy({
        by: ['model'],
        where: { timestamp: { gte: since } },
        _sum: { totalTokens: true, costUSD: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['operation'],
        where: { timestamp: { gte: since } },
        _sum: { totalTokens: true, costUSD: true },
        _count: { _all: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['tenantId'],
        where: { timestamp: { gte: since } },
        _sum: { totalTokens: true, costUSD: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ day: Date; tokens: bigint; cost: number }>>`
        SELECT DATE_TRUNC('day', "timestamp") as day,
               SUM("totalTokens")::bigint as tokens,
               SUM("costUSD") as cost
        FROM ai_usage_logs
        WHERE "timestamp" >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.aIUsageLog.aggregate({
        where: { timestamp: { gte: since } },
        _sum: { totalTokens: true, costUSD: true },
        _count: { _all: true },
      }),
    ]);

    // Proyección de costo mensual (cuando range='month')
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / DAY));
    const daysInPeriod = range === 'month' ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() : daysElapsed;
    const totalCost = totals._sum.costUSD ?? 0;
    const projection = range === 'month' ? (totalCost / daysElapsed) * daysInPeriod : null;

    res.json({
      status: 'ok',
      data: {
        range,
        since: since.toISOString(),
        totals: {
          calls: totals._count._all,
          tokens: totals._sum.totalTokens ?? 0,
          costUSD: Math.round((totals._sum.costUSD ?? 0) * 100) / 100,
          projectionUSD: projection != null ? Math.round(projection * 100) / 100 : null,
        },
        byModel: byModel.map(r => ({
          model: r.model,
          calls: r._count._all,
          inputTokens: r._sum.inputTokens ?? 0,
          outputTokens: r._sum.outputTokens ?? 0,
          totalTokens: r._sum.totalTokens ?? 0,
          costUSD: Math.round((r._sum.costUSD ?? 0) * 100) / 100,
        })),
        byOperation: byOp.map(r => ({
          operation: r.operation,
          calls: r._count._all,
          tokens: r._sum.totalTokens ?? 0,
          costUSD: Math.round((r._sum.costUSD ?? 0) * 100) / 100,
        })),
        byTenant: byTenant.map(r => ({
          tenantId: r.tenantId,
          calls: r._count._all,
          tokens: r._sum.totalTokens ?? 0,
          costUSD: Math.round((r._sum.costUSD ?? 0) * 100) / 100,
        })),
        daily: daily.map(d => ({ day: d.day.toISOString().slice(0, 10), tokens: Number(d.tokens), costUSD: Math.round(d.cost * 100) / 100 })),
      },
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────
// GET /api/admin/monitoring/business — DAU/WAU/MAU + funnel
// ──────────────────────────────────────────────────────────────────────

monitoringRouter.get('/business', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - DAY);
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const monthAgo = new Date(now.getTime() - 30 * DAY);
    const sixtyAgo = new Date(now.getTime() - 60 * DAY);

    const [dau, wau, mau, classifsDay, classifsWeek, leads, demoSched, demoDone, pilots, converted, churned] = await Promise.all([
      prisma.user.count({ where: { lastLoginAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: monthAgo } } }),
      prisma.classification.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.classification.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.lead.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.lead.count({ where: { createdAt: { gte: monthAgo }, status: 'demo_scheduled' } }),
      prisma.lead.count({ where: { createdAt: { gte: monthAgo }, status: 'demo_done' } }),
      prisma.lead.count({ where: { createdAt: { gte: monthAgo }, status: 'pilot' } }),
      prisma.lead.count({ where: { createdAt: { gte: monthAgo }, status: 'converted' } }),
      prisma.tenant.count({ where: { status: 'CHURNED', updatedAt: { gte: sixtyAgo } } }),
    ]);

    // LTV estimado por tenant: suma de monthlyPrice × duración promedio
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE', monthlyPrice: { not: null } },
      select: { monthlyPrice: true, contractStartedAt: true, contractEndsAt: true },
    });
    const ltvAvg = tenants.length > 0
      ? Math.round(tenants.reduce((s, t) => s + (t.monthlyPrice ?? 0) * 12, 0) / tenants.length)
      : 0;

    res.json({
      status: 'ok',
      data: {
        users: { dau, wau, mau },
        activity: { classificationsDay: classifsDay, classificationsWeek: classifsWeek },
        funnel: {
          leads30d: leads,
          demoScheduled: demoSched,
          demoDone: demoDone,
          pilots,
          converted,
        },
        churn: { last60Days: churned, rateMonthly: tenants.length > 0 ? Math.round((churned / Math.max(1, tenants.length)) * 1000) / 10 : 0 },
        ltvAvgMXN: ltvAvg,
        activeTenants: tenants.length,
      },
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────
// Retención: purga programada (idempotente, llamable por cron)
// ──────────────────────────────────────────────────────────────────────

monitoringRouter.post('/retention/purge', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = Date.now();
    const result = await runRetentionPurge(now);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

export async function runRetentionPurge(nowMs = Date.now()): Promise<{ debugInfo: number; warnError: number; aiUsageKept: number }> {
  const c1 = new Date(nowMs - 30 * DAY);
  const c2 = new Date(nowMs - 90 * DAY);
  const c3 = new Date(nowMs - 365 * DAY);

  const [debugInfo, warnError, criticalOld] = await Promise.all([
    prisma.systemLog.deleteMany({ where: { level: { in: ['DEBUG', 'INFO'] }, timestamp: { lt: c1 } } }),
    prisma.systemLog.deleteMany({ where: { level: { in: ['WARN', 'ERROR'] }, timestamp: { lt: c2 } } }),
    prisma.systemLog.deleteMany({ where: { level: 'CRITICAL', timestamp: { lt: c3 } } }),
  ]);

  // AIUsageLog se conserva siempre para análisis financiero histórico
  const aiUsageKept = await prisma.aIUsageLog.count();

  return {
    debugInfo: debugInfo.count,
    warnError: warnError.count + criticalOld.count,
    aiUsageKept,
  };
}
