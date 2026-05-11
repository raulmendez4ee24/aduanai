/**
 * Panel admin /admin/security — eventos, IPs bloqueadas y stats de abuso.
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { unblockIP, getClientIP } from '../lib/security';
import { authLimiter } from '../middlewares/rateLimit';
import { backfillAntidumpingDates } from '../services/antidumping-backfill';

export const securityRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

securityRouter.get('/overview', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = Date.now();
    const dayAgo = new Date(now - DAY);
    const weekAgo = new Date(now - 7 * DAY);
    const monthAgo = new Date(now - 30 * DAY);

    const [
      eventsDay, eventsWeek, eventsMonth,
      blockedActive,
      blockedDay, blockedWeek,
      bySeverity, byType,
      lockedUsers, failedRecent,
    ] = await Promise.all([
      prisma.securityEvent.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.securityEvent.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.securityEvent.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.blockedIP.count({ where: { active: true, expiresAt: { gt: new Date() } } }),
      prisma.securityEvent.count({ where: { type: 'ip_blocked', createdAt: { gte: dayAgo } } }),
      prisma.securityEvent.count({ where: { type: 'ip_blocked', createdAt: { gte: weekAgo } } }),
      prisma.securityEvent.groupBy({
        by: ['severity'],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
      }),
      prisma.securityEvent.groupBy({
        by: ['type'],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
        orderBy: { _count: { type: 'desc' } },
        take: 10,
      }),
      prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      prisma.loginAttempt.findMany({
        where: { success: false, createdAt: { gte: dayAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    res.json({
      status: 'ok',
      data: {
        events: { day: eventsDay, week: eventsWeek, month: eventsMonth },
        blocks: { active: blockedActive, last24h: blockedDay, last7d: blockedWeek },
        bySeverity: bySeverity.map(s => ({ severity: s.severity, count: s._count._all })),
        byType: byType.map(t => ({ type: t.type, count: t._count._all })),
        lockedUsers,
        recentFailedLogins: failedRecent,
      },
    });
  } catch (err) { next(err); }
});

securityRouter.get('/events', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type ? String(req.query.type) : undefined;
    const severity = req.query.severity ? String(req.query.severity) : undefined;
    const ip = req.query.ip ? String(req.query.ip) : undefined;
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 7 * DAY);
    const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 100));

    const where: Record<string, unknown> = { createdAt: { gte: since } };
    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (ip) where.ip = ip;

    const events = await prisma.securityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ status: 'ok', data: events });
  } catch (err) { next(err); }
});

securityRouter.get('/blocked-ips', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ips = await prisma.blockedIP.findMany({
      where: { active: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'ok', data: ips });
  } catch (err) { next(err); }
});

securityRouter.post('/blocked-ips/:ip/unblock', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ip = String(req.params.ip);
    await unblockIP(ip, req.userId ?? 'admin');
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

securityRouter.post('/users/:id/unlock', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const reason: string = ((req.body ?? {}) as { reason?: string }).reason ?? 'manual_admin_unlock';

    const target = await prisma.user.findUnique({
      where: { id }, select: { email: true, failedLoginAttempts: true, lockedUntil: true },
    });
    if (!target) return res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });

    await prisma.user.update({
      where: { id },
      data: { lockedUntil: null, failedLoginAttempts: 0 },
    });

    await prisma.securityEvent.create({
      data: {
        type: 'user_unlocked',
        severity: 'medium',
        ip: req.ip ?? '0.0.0.0',
        userId: id,
        email: target.email,
        endpoint: '/api/admin/security/users/:id/unlock',
        details: {
          unlockedBy: req.userId,
          reason,
          previousFailedAttempts: target.failedLoginAttempts,
          previousLockedUntil: target.lockedUntil?.toISOString() ?? null,
        } as unknown as object,
      },
    });

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

securityRouter.get('/tenants-rfc', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { validateRFC } = await import('../lib/rfc-validator');
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, rfc: true, plan: true, status: true, createdAt: true },
    });
    const flagged = tenants.map(t => {
      const result = validateRFC(t.rfc, { allowGeneric: false });
      return {
        id: t.id,
        name: t.name,
        rfc: t.rfc,
        plan: t.plan,
        status: t.status,
        createdAt: t.createdAt,
        rfcValid: result.valid,
        rfcReason: result.reason ?? null,
        rfcWarning: result.warning ?? null,
        rfcMessage: result.message ?? null,
        isGeneric: result.isGeneric ?? false,
      };
    }).filter(t => !t.rfcValid || t.rfcWarning || t.isGeneric);
    res.json({ status: 'ok', data: flagged });
  } catch (err) { next(err); }
});

securityRouter.get('/locked-users', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { OR: [{ lockedUntil: { gt: new Date() } }, { failedLoginAttempts: { gte: 3 } }] },
      select: { id: true, email: true, name: true, failedLoginAttempts: true, lockedUntil: true, lastLoginIp: true },
      orderBy: { failedLoginAttempts: 'desc' },
      take: 100,
    });
    res.json({ status: 'ok', data: users });
  } catch (err) { next(err); }
});

// Trigger manual para backfill de fechas UPCI antidumping (diagnóstico).
// Devuelve {updated, total} para verificar visualmente.
securityRouter.post('/backfill-antidumping-dates', authenticate, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await backfillAntidumpingDates();
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
});

// Autodesbloqueo: cualquier usuario autenticado puede resetear el rate-limit
// de su propia IP y el contador de fails de su propio user (caso típico:
// NAT compartido bloqueado por fails de otra persona, o el propio usuario
// se logea correctamente pero la IP sigue penalizada de intentos previos).
securityRouter.post('/unlock-current', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ip = getClientIP(req as never);
    const limiter = authLimiter as unknown as { resetKey?: (key: string) => Promise<void> | void };
    if (typeof limiter.resetKey === 'function') {
      await limiter.resetKey('ip:' + ip);
    }
    await prisma.user.update({
      where: { id: req.userId! },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await prisma.securityEvent.create({
      data: {
        type: 'self_unlock',
        severity: 'low',
        ip,
        userId: req.userId,
        endpoint: '/api/admin/security/unlock-current',
        details: { triggeredBy: req.userId } as unknown as object,
      },
    });
    res.json({ status: 'ok', data: { ip, message: 'Rate limit reseteado para esta IP y user' } });
  } catch (err) { next(err); }
});
