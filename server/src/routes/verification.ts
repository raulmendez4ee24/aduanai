/**
 * Endpoints de verificación profesional.
 *
 * Usuario:
 *   GET  /api/verification/me          — estado actual + lookup pre-aprobación
 *   POST /api/verification/submit      — sube datos + URLs de docs
 *   POST /api/verification/lookup      — checa una patente contra registry
 *
 * Admin (SUPERADMIN/ADMIN):
 *   GET  /api/verification/pending     — lista de submitted
 *   GET  /api/verification/all?status= — lista con filtro
 *   GET  /api/verification/expiring    — próximos 60 días
 *   POST /api/verification/:id/approve
 *   POST /api/verification/:id/reject
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { infraInfo } from '../lib/infra-info';
import {
  lookupPatente, submitVerification, approveVerification, rejectVerification,
  type ProfessionalType,
} from '../services/verification';

export const verificationRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];

// ─────────────────────── Usuario ────────────────────────

verificationRouter.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const v = await prisma.userVerification.findUnique({ where: { userId: req.userId! } });
    res.json({ status: 'ok', data: v });
  } catch (err) { next(err); }
});

verificationRouter.post('/lookup', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { patente } = req.body as { patente?: string };
    if (!patente) return res.status(400).json({ status: 'error', message: 'patente requerida' });
    const result = await lookupPatente(patente);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

verificationRouter.post('/submit', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Partial<{
      professionalType: ProfessionalType;
      agentPatente: string;
      agentSocialName: string;
      agentPort: string;
      patenteDocUrl: string;
      rfcDocUrl: string;
      cspDocUrl: string;
      notes: string;
    }>;

    if (!body.professionalType) return res.status(400).json({ status: 'error', message: 'professionalType requerido' });
    if (!['agent_customs', 'broker', 'importer', 'consultant', 'other'].includes(body.professionalType)) {
      return res.status(400).json({ status: 'error', message: 'professionalType inválido' });
    }

    // Para agentes, requiere al menos patente o documento
    if (body.professionalType === 'agent_customs' && !body.agentPatente && !body.patenteDocUrl) {
      return res.status(400).json({ status: 'error', message: 'Agentes deben proporcionar patente o documento' });
    }

    const result = await submitVerification({
      userId: req.userId!,
      professionalType: body.professionalType,
      agentPatente: body.agentPatente,
      agentSocialName: body.agentSocialName,
      agentPort: body.agentPort,
      patenteDocUrl: body.patenteDocUrl,
      rfcDocUrl: body.rfcDocUrl,
      cspDocUrl: body.cspDocUrl,
      notes: body.notes,
    });
    res.status(201).json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

// Ola 3 — "Tus datos": dónde viven, cómo se protegen (solo lo que se puede afirmar).
verificationRouter.get('/confianza', authenticate, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'ok', data: infraInfo() });
  } catch (err) { next(err); }
});

// ─────────────────────── Admin ────────────────────────

verificationRouter.get('/pending', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.userVerification.findMany({
      where: { status: 'submitted' },
      orderBy: { submittedAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true, tenantId: true, tenant: { select: { name: true, rfc: true } } } } },
      take: 100,
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

verificationRouter.get('/all', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const items = await prisma.userVerification.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { user: { select: { id: true, email: true, name: true, tenantId: true, tenant: { select: { name: true, rfc: true } } } } },
      take: 200,
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

verificationRouter.get('/expiring', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const items = await prisma.userVerification.findMany({
      where: { status: 'verified', agentExpiry: { gte: now, lte: in60 } },
      orderBy: { agentExpiry: 'asc' },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

verificationRouter.post('/:id/approve', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await approveVerification(String(req.params.id), req.userId!);
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

verificationRouter.post('/:id/reject', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ status: 'error', message: 'Razón de rechazo requerida (mínimo 5 caracteres)' });
    }
    await rejectVerification(String(req.params.id), req.userId!, reason);
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});
