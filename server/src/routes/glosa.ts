/**
 * Endpoints del Simulador de Glosa.
 *
 *   POST /api/glosa/simulate           — corre una simulación
 *   GET  /api/glosa/history            — histórico del tenant
 *   POST /api/glosa/:id/outcome        — feedback real (aprendizaje continuo)
 *   GET  /api/glosa/rules              — listado de reglas activas
 *
 *   GET  /api/admin/glosa/stats        — estadísticas globales
 *   GET  /api/admin/glosa/rules        — admin: ver/editar reglas
 *   PATCH /api/admin/glosa/rules/:id   — admin: ajustar peso/severity
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import {
  simulateGlosa,
  recordOutcome,
  getSimulationStats,
  type GlosaSimulationInput,
} from '../services/glosa-simulator';
import { getActiveVersions } from '../services/traceability';
import { TARIFF_VERSION } from '../lib/tariff-version';

export const glosaRouter = Router();
export const glosaAdminRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];

const simulateSchema = z.object({
  fractionCode: z.string().min(8).max(15),
  fractionDescription: z.string().optional(),
  productDescription: z.string().max(2000).optional(),
  countryOrigin: z.string().length(2).toUpperCase(),
  countryProvider: z.string().length(2).toUpperCase(),
  customsCode: z.string().min(2).max(5),
  regimenCode: z.string().min(2).max(4),
  unitValueUSD: z.number().nonnegative(),
  unitMeasure: z.string().optional(),
  units: z.number().int().nonnegative().optional(),
  weightKg: z.number().nonnegative(),
  totalValueUSD: z.number().nonnegative(),
  totalValueMXN: z.number().nonnegative().optional(),
  declaresAntidumping: z.boolean().optional(),
  declaresLink: z.boolean().optional(),
  appliesTMEC: z.boolean().optional(),
  hasTMECCertificate: z.boolean().optional(),
  declaresNOMs: z.boolean().optional(),
  hasIVAIEPSCertification: z.boolean().optional(),
  documents: z.object({
    invoice: z.boolean().optional(),
    bl: z.boolean().optional(),
    packingList: z.boolean().optional(),
    originCertificate: z.boolean().optional(),
    mve: z.boolean().optional(),
    permits: z.boolean().optional(),
    nomCertificates: z.boolean().optional(),
  }).optional(),
});

glosaRouter.post('/simulate', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const input = simulateSchema.parse(req.body) as GlosaSimulationInput;
    const result = await simulateGlosa(req.tenantId!, req.userId!, input);
    // Frontera Canónica §5.5: la versión normativa se ECO-DEVUELVE por corrida
    // (cierra el GAP documentado en client/src/lib/corpus-version.ts — el
    // reporte deja de leer un espejo hardcodeado en el cliente).
    const versions = await getActiveVersions();
    res.json({
      status: 'ok',
      data: {
        ...result,
        versiones: {
          tigie: versions.tigie,
          ligie: versions.ligie,
          rgce: versions.rgce,
          fuenteNombre: 'Base Única SNICE · DOF',
          fuenteUrl: 'https://www.snice.gob.mx',
          fechaPublicacion: TARIFF_VERSION.publishDate,
          fechaVerificacion: TARIFF_VERSION.snapshotDate,
        },
      },
    });
  } catch (err) { next(err); }
});

glosaRouter.get('/history', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.glosaSimulation.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, fractionCode: true, countryOrigin: true, customsCode: true,
        regimenCode: true, valueUSD: true, riskScore: true, riskLevel: true,
        raProbability: true, actualOutcome: true, createdAt: true, feedbackAt: true,
        revision: true, // fail-closed: el listado distingue revisiones incompletas
      },
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

glosaRouter.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sim = await prisma.glosaSimulation.findFirst({
      where: { id: String(req.params.id ?? ''), tenantId: req.tenantId! },
    });
    if (!sim) return res.status(404).json({ status: 'error', message: 'Simulación no encontrada' });
    res.json({ status: 'ok', data: sim });
  } catch (err) { next(err); }
});

const outcomeSchema = z.object({
  outcome: z.enum(['ra_yes', 'ra_no', 'documental', 'free']),
  notes: z.string().max(2000).optional(),
});

glosaRouter.post('/:id/outcome', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = outcomeSchema.parse(req.body);
    await recordOutcome(String(req.params.id ?? ''), req.tenantId!, body.outcome, body.notes);
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

glosaRouter.get('/rules/list', authenticate, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.glosaRiskRule.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { ruleCode: 'asc' }],
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

// ─────────────────────── Admin ───────────────────────

glosaAdminRouter.get('/stats', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await getSimulationStats();
    res.json({ status: 'ok', data: stats });
  } catch (err) { next(err); }
});

glosaAdminRouter.get('/rules', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.glosaRiskRule.findMany({ orderBy: [{ category: 'asc' }, { ruleCode: 'asc' }] });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

const ruleUpdateSchema = z.object({
  weight: z.number().min(0).max(100).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  active: z.boolean().optional(),
});

glosaAdminRouter.patch('/rules/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = ruleUpdateSchema.parse(req.body);
    const updated = await prisma.glosaRiskRule.update({
      where: { id: String(req.params.id ?? '') },
      data: body,
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});
