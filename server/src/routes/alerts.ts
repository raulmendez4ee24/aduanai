import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

export const alertsRouter = Router();

// Listar alertas del tenant
alertsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ status: 'ok', data: alerts });
  } catch (err) {
    next(err);
  }
});

// Marcar alerta como leída
alertsRouter.patch('/:id/read', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    await prisma.alert.update({
      where: { id },
      data: { read: true },
    });

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
