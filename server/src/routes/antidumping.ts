/**
 * Endpoints de cuotas compensatorias antidumping.
 *
 *   POST /api/antidumping/check       — verifica cuota aplicable (auth)
 *   GET  /api/antidumping/exposure    — exposición del tenant (auth)
 *   GET  /api/admin/antidumping        — listado completo (admin)
 *   GET  /api/admin/antidumping/expiring — próximas a expirar (admin)
 *   POST /api/admin/antidumping       — crear/actualizar resolución (admin)
 *   PATCH /api/admin/antidumping/:id  — actualizar status (admin)
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { checkAntidumpingDuty, calculateExposure } from '../services/antidumping';

export const antidumpingRouter = Router();
export const antidumpingAdminRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];

// ─────────────────────── Usuario ───────────────────────

antidumpingRouter.post('/check', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fractionCode, countryOfOrigin, valueUSD, weightKg, units } = req.body as {
      fractionCode?: string; countryOfOrigin?: string;
      valueUSD?: number; weightKg?: number; units?: number;
    };
    if (!fractionCode || !countryOfOrigin) {
      return res.status(400).json({ status: 'error', message: 'fractionCode y countryOfOrigin requeridos' });
    }
    const results = await checkAntidumpingDuty({ fractionCode, countryOfOrigin, valueUSD, weightKg, units });
    res.json({ status: 'ok', data: results });
  } catch (err) { next(err); }
});

antidumpingRouter.get('/exposure', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await calculateExposure(req.tenantId!);
    res.json({ status: 'ok', data: report });
  } catch (err) { next(err); }
});

// ─────────────────────── Admin ───────────────────────

antidumpingAdminRouter.get('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const country = req.query.country ? String(req.query.country) : undefined;
    const fraction = req.query.fraction ? String(req.query.fraction) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = {};
    if (country) where.countryOfOrigin = country;
    if (fraction) where.fractionCode = { contains: fraction };
    if (status) where.status = status;
    const items = await prisma.antidumpingDuty.findMany({
      where, orderBy: [{ status: 'asc' }, { publishDateDOF: 'desc' }], take: 500,
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

antidumpingAdminRouter.get('/expiring', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const items = await prisma.antidumpingDuty.findMany({
      where: { status: 'vigente', expiryDate: { gte: now, lte: in90 } },
      orderBy: { expiryDate: 'asc' },
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

antidumpingAdminRouter.post('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Partial<{
      resolutionType: string; resolutionNumber: string; expedienteUPCI: string;
      fractionCode: string; countryOfOrigin: string; productDesc: string;
      specificProducer: string; rateType: string; rate: number; rateUnit: string;
      publishDateDOF: string; effectiveDate: string; expiryDate: string;
      status: string; investigationType: string; dofUrl: string; notes: string;
    }>;
    const required: (keyof typeof body)[] = ['fractionCode', 'countryOfOrigin', 'rateType', 'rate', 'rateUnit'];
    for (const k of required) {
      if (body[k] == null) return res.status(400).json({ status: 'error', message: `Campo requerido: ${k}` });
    }
    const data = {
      resolutionType: body.resolutionType ?? 'definitiva',
      resolutionNumber: body.resolutionNumber,
      expedienteUPCI: body.expedienteUPCI,
      fractionCode: body.fractionCode!,
      countryOfOrigin: body.countryOfOrigin!,
      productDesc: body.productDesc,
      specificProducer: body.specificProducer,
      rateType: body.rateType!,
      rate: Number(body.rate),
      rateUnit: body.rateUnit!,
      publishDateDOF: body.publishDateDOF ? new Date(body.publishDateDOF) : null,
      effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      status: body.status ?? 'vigente',
      investigationType: body.investigationType,
      dofUrl: body.dofUrl,
      notes: body.notes,
    };
    const created = await prisma.antidumpingDuty.create({ data });
    res.status(201).json({ status: 'ok', data: created });
  } catch (err) { next(err); }
});

antidumpingAdminRouter.patch('/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const data = req.body as Record<string, unknown>;
    const allowed = ['status', 'expiryDate', 'rate', 'rateType', 'rateUnit', 'notes', 'active'];
    const update: Record<string, unknown> = {};
    for (const k of allowed) if (data[k] !== undefined) update[k] = data[k];
    if (update.expiryDate && typeof update.expiryDate === 'string') update.expiryDate = new Date(update.expiryDate);
    const updated = await prisma.antidumpingDuty.update({ where: { id }, data: update });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

antidumpingAdminRouter.get('/exposure-by-tenant', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'tenantId requerido' });
    const report = await calculateExposure(tenantId);
    res.json({ status: 'ok', data: report });
  } catch (err) { next(err); }
});
