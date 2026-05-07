/**
 * Endpoints de Padrones SAT.
 *
 *   /api/padrones/list                  — catálogo público (autenticado)
 *   /api/padrones/check                 — verifica padrones para una fracción
 *   /api/padrones/me                    — status del tenant en sus padrones
 *   /api/padrones/me/declare            — autodeclarar inscripción
 *   /api/padrones/me/letter/:padronId   — descargar carta de solicitud
 *
 *   /api/admin/padrones                 — admin: status por tenant
 *   /api/admin/padrones/by-padron       — admin: agrupado por padrón
 *   /api/admin/padrones/pending         — admin: verificaciones pendientes
 *   /api/admin/padrones/:id/approve     — admin: aprobar verificación
 *   /api/admin/padrones/:id/reject      — admin: rechazar verificación
 *   /api/admin/padrones/exposure/:tenantId — admin: reporte exposición
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import {
  checkRequiredPadrones,
  generateInscriptionLetter,
} from '../services/padron-checker';

export const padronesRouter = Router();
export const padronesAdminRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];

// ─────────────────────── Tenant ───────────────────────

padronesRouter.get('/list', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type ? String(req.query.type) : undefined;
    const where: Record<string, unknown> = { active: true };
    if (type) where.type = type;
    const items = await prisma.sATPadron.findMany({
      where,
      orderBy: [{ type: 'asc' }, { sectorialCode: 'asc' }],
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

padronesRouter.get('/check', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const fractionCode = String(req.query.fraction ?? '');
    if (!fractionCode) return res.status(400).json({ status: 'error', message: 'Falta query "fraction"' });
    const result = await checkRequiredPadrones(req.tenantId!, fractionCode, 'classify');
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

padronesRouter.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const statuses = await prisma.tenantPadronStatus.findMany({
      where: { tenantId: req.tenantId! },
      include: { padron: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ status: 'ok', data: statuses });
  } catch (err) { next(err); }
});

const declareSchema = z.object({
  padronId: z.string().min(1),
  status: z.enum(['active', 'in_process', 'suspended', 'expired', 'rejected']),
  registrationDate: z.string().datetime().optional(),
  expirationDate: z.string().datetime().optional(),
  evidence: z.string().max(1_500_000).optional(), // base64 PDF/imagen, ~1MB
  notes: z.string().max(2000).optional(),
});

padronesRouter.post('/me/declare', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = declareSchema.parse(req.body);
    const padron = await prisma.sATPadron.findUnique({ where: { id: body.padronId } });
    if (!padron) return res.status(404).json({ status: 'error', message: 'Padrón no encontrado' });

    const data = {
      status: body.status,
      registrationDate: body.registrationDate ? new Date(body.registrationDate) : null,
      expirationDate: body.expirationDate ? new Date(body.expirationDate) : null,
      evidence: body.evidence ?? null,
      notes: body.notes ?? null,
      verifiedBy: 'self_declared',
      lastVerified: new Date(),
    };

    const upserted = await prisma.tenantPadronStatus.upsert({
      where: { tenantId_padronId: { tenantId: req.tenantId!, padronId: body.padronId } },
      create: { tenantId: req.tenantId!, padronId: body.padronId, ...data },
      update: data,
    });
    res.json({ status: 'ok', data: upserted });
  } catch (err) { next(err); }
});

padronesRouter.get('/me/letter/:padronId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const padron = await prisma.sATPadron.findUnique({ where: { id: String(req.params.padronId ?? '') } });
    if (!padron) return res.status(404).json({ status: 'error', message: 'Padrón no encontrado' });
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { name: true, rfc: true },
    });
    if (!tenant) return res.status(404).json({ status: 'error', message: 'Tenant no encontrado' });
    const text = generateInscriptionLetter({ padron, tenant });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="solicitud-padron-${padron.sectorialCode ?? 'general'}.txt"`);
    res.send(text);
  } catch (err) { next(err); }
});

// ─────────────────────── Admin ───────────────────────

padronesAdminRouter.get('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const items = await prisma.tenantPadronStatus.findMany({
      where, include: { padron: true }, orderBy: { updatedAt: 'desc' }, take: 500,
    });
    // Adjuntar nombre del tenant
    const tenantIds = Array.from(new Set(items.map(i => i.tenantId)));
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, rfc: true },
    });
    const tMap = new Map(tenants.map(t => [t.id, t]));
    const enriched = items.map(i => ({ ...i, tenant: tMap.get(i.tenantId) ?? null }));
    res.json({ status: 'ok', data: enriched });
  } catch (err) { next(err); }
});

padronesAdminRouter.get('/by-padron', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const padrones = await prisma.sATPadron.findMany({
      where: { active: true },
      include: { _count: { select: { tenantStatuses: true } } },
      orderBy: [{ type: 'asc' }, { sectorialCode: 'asc' }],
    });
    const byStatus = await prisma.tenantPadronStatus.groupBy({
      by: ['padronId', 'status'],
      _count: { _all: true },
    });
    const idx: Record<string, Record<string, number>> = {};
    for (const g of byStatus) {
      const key = g.padronId;
      if (!idx[key]) idx[key] = {};
      idx[key][g.status] = g._count._all;
    }
    const data = padrones.map(p => ({
      padron: p,
      total: p._count.tenantStatuses,
      breakdown: idx[p.id] ?? {},
    }));
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

padronesAdminRouter.get('/pending', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.tenantPadronStatus.findMany({
      where: { verifiedBy: 'self_declared' },
      include: { padron: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const tenantIds = Array.from(new Set(items.map(i => i.tenantId)));
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, rfc: true },
    });
    const tMap = new Map(tenants.map(t => [t.id, t]));
    res.json({ status: 'ok', data: items.map(i => ({ ...i, tenant: tMap.get(i.tenantId) ?? null })) });
  } catch (err) { next(err); }
});

padronesAdminRouter.post('/:id/approve', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.tenantPadronStatus.update({
      where: { id: String(req.params.id ?? '') },
      data: { verifiedBy: 'manual', lastVerified: new Date(), rejectionReason: null },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

padronesAdminRouter.post('/:id/reject', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const reason = String(req.body?.reason ?? 'Sin motivo especificado').slice(0, 500);
    const updated = await prisma.tenantPadronStatus.update({
      where: { id: String(req.params.id ?? '') },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        verifiedBy: 'manual',
        lastVerified: new Date(),
      },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

padronesAdminRouter.get('/exposure/:tenantId', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = String(req.params.tenantId ?? '');
    // Solo checks que NO podían operar
    const checks = await prisma.padronCheck.findMany({
      where: { tenantId, canOperate: false },
      orderBy: { checkedAt: 'desc' },
      take: 1000,
    });

    // Agrupar por fracción
    const byFraction = new Map<string, { count: number; missing: Set<string>; lastCheckedAt: Date }>();
    for (const c of checks) {
      const cur = byFraction.get(c.fractionCode);
      const blocking = (c.blockingPadrones as unknown as Array<{ sectorialName: string; sectorialCode: string | null }>) ?? [];
      if (!cur) {
        byFraction.set(c.fractionCode, {
          count: 1,
          missing: new Set(blocking.map(b => b.sectorialName)),
          lastCheckedAt: c.checkedAt,
        });
      } else {
        cur.count++;
        blocking.forEach(b => cur.missing.add(b.sectorialName));
        if (c.checkedAt > cur.lastCheckedAt) cur.lastCheckedAt = c.checkedAt;
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, rfc: true },
    });

    res.json({
      status: 'ok',
      data: {
        tenant,
        totalBlockingChecks: checks.length,
        byFraction: Array.from(byFraction.entries()).map(([fractionCode, v]) => ({
          fractionCode,
          attempts: v.count,
          missingPadrones: Array.from(v.missing),
          lastCheckedAt: v.lastCheckedAt.toISOString(),
        })).sort((a, b) => b.attempts - a.attempts),
      },
    });
  } catch (err) { next(err); }
});
