import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { regenerateAlerts } from '../services/alert-generator';

export const alertsRouter = Router();

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Listar alertas activas del tenant — ordenadas por severidad y vencimiento
alertsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const includeResolved = req.query.includeResolved === 'true';
    const includeIgnored = req.query.includeIgnored === 'true';
    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (!includeResolved) where.resolvedAt = null;
    if (!includeIgnored) where.ignored = false;
    // Filtra snoozed: si snoozedUntil > now, no mostrar
    const now = new Date();
    where.OR = [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }];

    const rows = await prisma.alert.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });

    // Recalcular daysToDue dinámico antes de enviar (para precisión)
    const alerts = rows
      .map(a => ({
        ...a,
        daysToDue: a.dueDate
          ? Math.ceil((a.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }))
      .sort((a, b) => {
        const sa = SEVERITY_ORDER[a.severity] ?? 9;
        const sb = SEVERITY_ORDER[b.severity] ?? 9;
        if (sa !== sb) return sa - sb;
        const da = a.daysToDue ?? 9999;
        const db = b.daysToDue ?? 9999;
        return da - db;
      });

    res.json({ status: 'ok', data: alerts });
  } catch (err) {
    next(err);
  }
});

// Marcar alerta como leída — SCOPE por tenant (updateMany + guarda de conteo:
// una alerta de otro tenant no existe para ti → 404, sin revelar existencia).
alertsRouter.patch('/:id/read', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// Marcar todas como leídas
alertsRouter.post('/read-all', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await prisma.alert.updateMany({
      where: { tenantId: req.tenantId!, read: false },
      data: { read: true },
    });

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// Acknowledge / snooze / resolve / ignore — acciones inteligentes
alertsRouter.patch('/:id/acknowledge', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { acknowledged: true, acknowledgedAt: new Date(), read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

alertsRouter.patch('/:id/snooze', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const days = Math.max(1, Math.min(30, Number(req.body?.days) || 7));
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { snoozedUntil: until, read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok', data: { snoozedUntil: until } });
  } catch (err) { next(err); }
});

alertsRouter.patch('/:id/resolve', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { resolvedAt: new Date(), read: true, acknowledged: true, acknowledgedAt: new Date() },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

alertsRouter.patch('/:id/ignore', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { ignored: true, read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

// Regenerar alertas inteligentes para el tenant — calcula impacto sobre datos reales
alertsRouter.post('/regenerate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await regenerateAlerts(req.tenantId!, false);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

// Limpiar alertas spam + regenerar inteligentes. Borra las alertas legacy
// (texto plantilla "Revisa el detalle..." sin estimatedImpactMXN ni
// affectedFraction específico) y vuelve a calcular con datos reales del
// tenant. Idempotente: si todas las alertas ya tienen impacto, sólo
// regenera.
alertsRouter.post('/clean-and-regenerate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.tenantId!;
    // Borra alertas SPAM legacy: sin estimatedImpactMXN, sin fingerprint
    // útil, o con content que contenga la plantilla genérica.
    const spamPatterns = [
      'Revisa el detalle en el módulo de Actualizaciones',
      'Revisa el detalle',
    ];
    const orClauses = [
      { estimatedImpactMXN: null, affectedFraction: null, type: { not: 'watch' } } as const,
      ...spamPatterns.map(p => ({ content: { contains: p } } as const)),
    ];
    const deleted = await prisma.alert.deleteMany({
      where: { tenantId, OR: orClauses as unknown as object[] },
    });

    const result = await regenerateAlerts(tenantId, false);
    res.json({
      status: 'ok',
      data: {
        deletedSpam: deleted.count,
        ...result,
      },
    });
  } catch (err) { next(err); }
});

// Contar alertas sin leer
alertsRouter.get('/unread-count', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const count = await prisma.alert.count({
      where: { tenantId: req.tenantId!, read: false },
    });

    res.json({ status: 'ok', data: { count } });
  } catch (err) {
    next(err);
  }
});

// Fracciones monitoreadas — listar
alertsRouter.get('/watched', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        tenantId: req.tenantId!,
        type: 'watch',
      },
      select: { id: true, fractionCodes: true, createdAt: true },
    });

    // Flatten all watched fractions
    const watchedCodes = alerts.flatMap(a => a.fractionCodes);
    const uniqueCodes = [...new Set(watchedCodes)];

    // Get fraction details
    const fractions = await prisma.fraction.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true, codeFormatted: true, description: true, tariffNMF: true },
    });

    res.json({ status: 'ok', data: fractions });
  } catch (err) {
    next(err);
  }
});

// Agregar fracción a monitoreo
alertsRouter.post('/watch', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode } = req.body;
    if (!fractionCode) {
      return res.status(400).json({ status: 'error', message: 'Fracción requerida' });
    }

    // Check if already watching
    const existing = await prisma.alert.findFirst({
      where: {
        tenantId: req.tenantId!,
        type: 'watch',
        fractionCodes: { has: fractionCode },
      },
    });

    if (existing) {
      return res.json({ status: 'ok', message: 'Ya estás monitoreando esta fracción' });
    }

    // Find or create watch alert
    let watchAlert = await prisma.alert.findFirst({
      where: { tenantId: req.tenantId!, type: 'watch' },
    });

    if (watchAlert) {
      await prisma.alert.update({
        where: { id: watchAlert.id },
        data: { fractionCodes: { push: fractionCode } },
      });
    } else {
      await prisma.alert.create({
        data: {
          tenantId: req.tenantId!,
          channel: 'IN_APP',
          type: 'watch',
          title: 'Fracciones monitoreadas',
          content: 'Lista de fracciones bajo monitoreo',
          fractionCodes: [fractionCode],
        },
      });
    }

    res.json({ status: 'ok', message: 'Fracción agregada al monitoreo' });
  } catch (err) {
    next(err);
  }
});

// Quitar fracción de monitoreo
alertsRouter.delete('/watch/:code', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const code = String(req.params.code);

    const watchAlert = await prisma.alert.findFirst({
      where: { tenantId: req.tenantId!, type: 'watch' },
    });

    if (watchAlert) {
      const updated = watchAlert.fractionCodes.filter(c => c !== code);
      await prisma.alert.update({
        where: { id: watchAlert.id },
        data: { fractionCodes: updated },
      });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});
