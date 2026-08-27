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
import { spawn } from 'child_process';
import path from 'path';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { checkAntidumpingDuty, calculateExposure, buscarCuotaAplicable, coberturaCuotas } from '../services/antidumping';
import { importarUPCI, plantillaUPCIXlsx, COLUMNAS_UPCI } from '../services/antidumping-importar';
import { detectarElusion } from '../services/antidumping-elusion';
import { logger } from '../lib/logger';

export const antidumpingRouter = Router();
export const antidumpingAdminRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];

// Reseed UPCI — borra y recrea todos los AntidumpingDuty desde el catálogo
// canónico (UPCI_RESOLUTIONS en antidumping-upci.ts). Necesario tras añadir
// rateType/rateUnit/resolutionNumber para que la DB tenga la estructura
// nueva. spawn tsx en proc hijo, mismo patrón que legal-docs/reseed.
antidumpingAdminRouter.post('/reseed-upci', adminOnly, async (_req: AuthRequest, res: Response) => {
  const seedScript = path.resolve(__dirname, '..', '..', 'prisma', 'seed', 'upci-only.ts');
  const cwd = path.resolve(__dirname, '..', '..');
  const child = spawn('npx', ['tsx', seedScript], { cwd, env: process.env });

  let stdout = '';
  let stderr = '';
  let resolved = false;
  const timer = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      child.kill('SIGKILL');
      res.status(504).json({ status: 'error', message: 'Reseed timed out after 120s', stdout, stderr });
    }
  }, 120_000);

  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('close', async (code) => {
    if (resolved) return;
    resolved = true;
    clearTimeout(timer);
    const count = await prisma.antidumpingDuty.count();
    res.json({
      status: code === 0 ? 'ok' : 'error',
      exitCode: code,
      dutiesInDb: count,
      stdout: stdout.slice(-2000),
      stderr: stderr.slice(-2000),
    });
  });
});

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

// Listado de cuotas vigentes — filtrable; por defecto retorna las relevantes para
// las fracciones que el tenant ha operado en los últimos 12 meses.
antidumpingRouter.get('/active', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const country = req.query.country ? String(req.query.country).toUpperCase() : undefined;
    const fraction = req.query.fraction ? String(req.query.fraction) : undefined;
    const onlyMine = req.query.scope !== 'all';

    const where: Record<string, unknown> = { status: 'vigente' };
    if (country) where.countryOfOrigin = country;
    if (fraction) where.fractionCode = { contains: fraction };

    if (onlyMine && !fraction) {
      // Deducir fracciones del tenant — clasificaciones + cotizaciones últimos 12 meses
      const since = new Date(Date.now() - 365 * 86400000);
      const [cls, qts] = await Promise.all([
        prisma.classification.findMany({
          where: { tenantId: req.tenantId!, createdAt: { gte: since } },
          select: { fractionCode: true }, take: 1000,
        }),
        prisma.quote.findMany({
          where: { tenantId: req.tenantId!, createdAt: { gte: since } },
          select: { fractionCode: true }, take: 1000,
        }),
      ]);
      const fractions = Array.from(new Set([...cls, ...qts].map(c => c.fractionCode).filter(Boolean) as string[]));
      if (fractions.length > 0) where.fractionCode = { in: fractions };
    }

    const items = await prisma.antidumpingDuty.findMany({
      where, orderBy: [{ effectiveDate: 'desc' }], take: 500,
    });
    res.json({ status: 'ok', data: items, scope: onlyMine && !fraction ? 'tenant' : 'all' });
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

// ═══════════════════════════════════════════════════════════════════════════
// Ola 2 (origen-cuotas): enganche por exportador, cobertura (honestidad
// visible), pipeline de carga UPCI y alerta de elusión.
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/antidumping/buscar — { fractionCode, countryOfOrigin, exportador?, valueUSD?, weightKg?, units? }
antidumpingRouter.post('/buscar', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body as { fractionCode?: string; countryOfOrigin?: string; exportador?: string; valueUSD?: number; weightKg?: number; units?: number };
    if (!b.fractionCode || !b.countryOfOrigin) return res.status(400).json({ status: 'error', message: 'fractionCode y countryOfOrigin requeridos' });
    const r = await buscarCuotaAplicable({ fractionCode: b.fractionCode, countryOfOrigin: b.countryOfOrigin, exportador: b.exportador, valueUSD: b.valueUSD, weightKg: b.weightKg, units: b.units });
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// GET /api/antidumping/cobertura — cotejadas vs pendientes
antidumpingRouter.get('/cobertura', authenticate, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json({ status: 'ok', data: await coberturaCuotas() }); } catch (err) { next(err); }
});

// POST /api/antidumping/elusion/detectar — corre la regla para el tenant (manual)
antidumpingRouter.post('/elusion/detectar', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json({ status: 'ok', data: await detectarElusion(req.tenantId!) }); } catch (err) { next(err); }
});

// GET /api/admin/antidumping/plantilla.xlsx
antidumpingAdminRouter.get('/plantilla.xlsx', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-cuotas-upci.xlsx"');
    res.send(plantillaUPCIXlsx());
  } catch (err) { next(err); }
});

// POST /api/admin/antidumping/importar — { archivoBase64, nombreArchivo, dryRun }
antidumpingAdminRouter.post('/importar', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body as { archivoBase64?: string; nombreArchivo?: string; dryRun?: boolean };
    if (!b.archivoBase64) return res.status(400).json({ status: 'error', message: 'archivoBase64 requerido' });
    const rep = await importarUPCI({ archivoBase64: b.archivoBase64, nombreArchivo: b.nombreArchivo, dryRun: !!b.dryRun });
    logger.info(`Cuotas UPCI importadas: ${rep.creadas} creadas, ${rep.actualizadas} actualizadas, ${rep.invalidas} rechazadas (${rep.cotejadas} cotejadas)`, { action: 'antidumping_import', userId: req.userId, metadata: { ...rep, filas: undefined } });
    res.json({ status: 'ok', data: rep });
  } catch (err) { next(err); }
});

// GET /api/admin/antidumping/columnas — documentación de la plantilla
antidumpingAdminRouter.get('/columnas', adminOnly, (_req: AuthRequest, res: Response) => {
  res.json({ status: 'ok', data: { columnas: COLUMNAS_UPCI, dedupe: ['fractionCode', 'countryOfOrigin', 'resolutionNumber'], cotejo: 'cotejadoAt solo si la fila trae fuenteUrl http(s)' } });
});
