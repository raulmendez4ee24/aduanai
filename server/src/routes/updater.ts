import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import {
  analyzeDecree,
  applyChanges,
  detectAffectedUsers,
  sendNotifications,
  generateWeeklyDigest,
  getChangelog,
} from '../services/tigie-updater';

export const updaterRouter = Router();

// ============================================
// ANÁLISIS DE DECRETO
// ============================================

updaterRouter.post('/analyze-decree', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { decreeText } = req.body;
    if (!decreeText || decreeText.trim().length < 50) {
      return res.status(400).json({ status: 'error', message: 'Texto del decreto requerido (minimo 50 caracteres)' });
    }

    const analysis = await analyzeDecree(decreeText);

    // Save to DB
    const update = await prisma.tIGIEUpdate.create({
      data: {
        source: analysis.source || 'DOF',
        decree: analysis.decree,
        publishDate: new Date(analysis.publishDate),
        effectiveDate: new Date(analysis.effectiveDate),
        summary: analysis.summary,
        fractionsCreated: analysis.fractionsCreated,
        fractionsModified: analysis.fractionsModified,
        fractionsSuppressed: analysis.fractionsSuppressed,
        nomsUpdated: analysis.nomsUpdated,
        changes: analysis.changes as object[],
        status: 'ANALYZED',
      },
    });

    res.status(201).json({ status: 'ok', data: { update, analysis } });
  } catch (err) {
    next(err);
  }
});

// ============================================
// APLICAR CAMBIOS
// ============================================

updaterRouter.post('/apply/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await applyChanges(String(req.params.id), req.userId!);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// ============================================
// HISTORIAL DE ACTUALIZACIONES
// ============================================

updaterRouter.get('/updates', authenticate, async (_req: AuthRequest, res, next) => {
  try {
    const updates = await prisma.tIGIEUpdate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { notifications: true } } },
    });
    res.json({ status: 'ok', data: updates });
  } catch (err) {
    next(err);
  }
});

updaterRouter.get('/updates/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const update = await prisma.tIGIEUpdate.findUnique({
      where: { id: String(req.params.id) },
      include: { notifications: { take: 50, orderBy: { createdAt: 'desc' } } },
    });
    if (!update) return res.status(404).json({ status: 'error', message: 'Update no encontrado' });
    res.json({ status: 'ok', data: update });
  } catch (err) {
    next(err);
  }
});

// ============================================
// NOTIFICACIONES
// ============================================

updaterRouter.post('/notify/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await sendNotifications(String(req.params.id));
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

updaterRouter.get('/notifications', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const notifications = await prisma.updateNotification.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { update: { select: { decree: true, source: true, effectiveDate: true } } },
    });
    res.json({ status: 'ok', data: notifications });
  } catch (err) {
    next(err);
  }
});

updaterRouter.get('/notifications/unread-count', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const count = await prisma.updateNotification.count({
      where: { tenantId: req.tenantId!, read: false },
    });
    res.json({ status: 'ok', data: { count } });
  } catch (err) {
    next(err);
  }
});

updaterRouter.patch('/notifications/:id/read', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const notif = await prisma.updateNotification.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!notif) return res.status(404).json({ status: 'error', message: 'Notificacion no encontrada' });

    await prisma.updateNotification.update({
      where: { id: notif.id },
      data: { read: true },
    });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// RESUMEN SEMANAL
// ============================================

updaterRouter.post('/weekly-digest', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const digest = await generateWeeklyDigest(req.tenantId!);
    res.json({ status: 'ok', data: digest });
  } catch (err) {
    next(err);
  }
});

// ============================================
// USUARIOS AFECTADOS
// ============================================

updaterRouter.get('/affected-users/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await detectAffectedUsers(String(req.params.id));
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// ============================================
// CHANGELOG
// ============================================

updaterRouter.get('/changelog', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const chapter = String(req.query.chapter || '');
    const entries = await getChangelog(page, 50, chapter || undefined);
    res.json({ status: 'ok', data: entries });
  } catch (err) {
    next(err);
  }
});
