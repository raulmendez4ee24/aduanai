/**
 * Endpoints user-side de Settings (datos del propio tenant).
 *
 *   GET   /api/settings/empresa  — datos del tenant del usuario
 *   PATCH /api/settings/empresa  — editar nombre / RFC del tenant (solo ADMIN del tenant o SUPERADMIN)
 *
 * El tenantId siempre se toma del JWT — un usuario nunca puede ver otro tenant.
 */

import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get('/empresa', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: {
        id: true, name: true, rfc: true, plan: true, status: true,
        pilotStartedAt: true, pilotEndsAt: true, classificationLimit: true, userLimit: true,
        contractStartedAt: true, contractEndsAt: true, monthlyPrice: true, contractModules: true,
        lastActivityAt: true, healthScore: true, createdAt: true, updatedAt: true,
      },
    });
    if (!tenant) return res.status(404).json({ status: 'error', message: 'Tenant no encontrado' });
    const userCount = await prisma.user.count({ where: { tenantId: req.tenantId! } });
    const classificationCount = await prisma.classification.count({ where: { tenantId: req.tenantId! } });
    const quoteCount = await prisma.quote.count({ where: { tenantId: req.tenantId! } });
    res.json({ status: 'ok', data: { ...tenant, userCount, classificationCount, quoteCount } });
  } catch (err) { next(err); }
});

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  rfc: z.string().min(12).max(13).regex(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/i).optional(),
});

settingsRouter.patch('/empresa', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'ADMIN' && req.userRole !== 'SUPERADMIN') {
      return res.status(403).json({ status: 'error', message: 'Solo administradores pueden editar datos de la empresa' });
    }
    const body = updateSchema.parse(req.body);
    const updated = await prisma.tenant.update({
      where: { id: req.tenantId! },
      data: { ...body, rfc: body.rfc?.toUpperCase() },
      select: { id: true, name: true, rfc: true, plan: true, status: true },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

settingsRouter.get('/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId! },
      select: { id: true, email: true, name: true, role: true, status: true, emailVerified: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ status: 'ok', data: users });
  } catch (err) { next(err); }
});
