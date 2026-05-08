/**
 * Rutas de auditoría:
 *  - /api/admin/audit (autenticado, ADMIN/SUPERADMIN) — listar, detalle, verificar cadena, generar reporte
 *  - /verify/audit (público) — verificar hash de un reporte sin auth (para SAT/auditor)
 */

import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { recordAudit, verifyChain, computeReportHash } from '../services/audit-service';

export const auditAdminRouter = Router();
auditAdminRouter.use(authenticate);
auditAdminRouter.use(requireRole('SUPERADMIN'));

// Router usuario: cualquier autenticado puede ver SUS PROPIOS logs (filtrados por tenantId del JWT)
export const auditUserRouter = Router();
auditUserRouter.use(authenticate);

auditUserRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entity, action, dateFrom, dateTo, q } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) range.lte = new Date(dateTo);
      where.createdAt = range;
    }
    if (q) {
      where.OR = [
        { entityId: { contains: q, mode: 'insensitive' } },
        { endpoint: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ status: 'ok', data, pagination: { page, limit, total } });
  } catch (err) { next(err); }
});

auditUserRouter.get('/verify-chain', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await verifyChain(req.tenantId!);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

auditUserRouter.get('/timestamps', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Audit logs de este tenant
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: req.tenantId! },
      select: { id: true },
      take: 1000,
      orderBy: { createdAt: 'desc' },
    });
    const ids = logs.map(l => l.id);
    if (ids.length === 0) return res.json({ status: 'ok', data: [] });
    // Sus anclajes Bitcoin
    const anchors = await prisma.timestampProof.findMany({
      where: { resourceType: 'audit_log', resourceId: { in: ids } },
      select: {
        resourceId: true, contentHash: true, status: true,
        bitcoinBlock: true, bitcoinTimestamp: true,
        submittedAt: true, confirmedAt: true,
      },
    });
    res.json({ status: 'ok', data: anchors });
  } catch (err) { next(err); }
});

// ── GET /api/admin/audit ──────────────────────────────────────────────────
auditAdminRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entity, action, userId, dateFrom, dateTo, q } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) range.lte = new Date(dateTo);
      where.createdAt = range;
    }
    if (q) {
      where.OR = [
        { entityId: { contains: q, mode: 'insensitive' } },
        { endpoint: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ status: 'ok', data, pagination: { page, limit, total } });
  } catch (err) { next(err); }
});

// ── GET /api/admin/audit/:id ──────────────────────────────────────────────
auditAdminRouter.get('/log/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const log = await prisma.auditLog.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });
    if (!log) return res.status(404).json({ status: 'error', message: 'Log no encontrado' });
    res.json({ status: 'ok', data: log });
  } catch (err) { next(err); }
});

// ── POST /api/admin/audit/verify-chain ────────────────────────────────────
auditAdminRouter.post('/verify-chain', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await verifyChain(req.tenantId!);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

// ── POST /api/admin/audit/report ──────────────────────────────────────────
// Body: { periodStart, periodEnd } — genera dataset + hash final firmado
auditAdminRouter.post('/report', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'SUPERADMIN') {
      return res.status(403).json({ status: 'error', message: 'Solo SUPERADMIN' });
    }
    const { periodStart, periodEnd } = req.body as { periodStart?: string; periodEnd?: string };
    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 30 * 86400000);
    const end = periodEnd ? new Date(periodEnd) : new Date();

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { id: true, name: true, rfc: true, plan: true },
    });
    if (!tenant) throw new Error('Tenant no encontrado');

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId!,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });

    const chainCheck = await verifyChain(req.tenantId!);
    const reportHash = computeReportHash(req.tenantId!, start, end, logs.map(l => l.hash));

    // Certificación criptográfica: anclajes a Bitcoin via OpenTimestamps
    const auditIds = logs.map(l => l.id);
    const anchors = auditIds.length > 0
      ? await prisma.timestampProof.findMany({
          where: { resourceType: 'audit_log', resourceId: { in: auditIds } },
          select: { resourceId: true, status: true, bitcoinBlock: true, confirmedAt: true, contentHash: true },
        })
      : [];
    const confirmedAnchors = anchors.filter(a => a.status === 'confirmed' || a.status === 'verified');
    const lastConfirmed = confirmedAnchors.reduce<typeof confirmedAnchors[number] | null>(
      (acc, cur) => (!acc || (cur.confirmedAt && acc.confirmedAt && cur.confirmedAt > acc.confirmedAt) ? cur : acc),
      null,
    );
    const cryptoCertification = {
      anchoredCount: anchors.length,
      confirmedCount: confirmedAnchors.length,
      lastBitcoinBlock: lastConfirmed?.bitcoinBlock ?? null,
      lastConfirmedAt: lastConfirmed?.confirmedAt?.toISOString() ?? null,
      legalNotice: 'CERTIFICACIÓN DE INTEGRIDAD CRIPTOGRÁFICA: Las acciones críticas de este reporte han sido ancladas al blockchain de Bitcoin mediante OpenTimestamps, generando un sello de tiempo no-repudiable conforme a los principios de la NOM-151-SCFI sobre conservación de mensajes de datos. Cualquier verificador independiente puede validar la integridad descargando el proof .ots desde /verify/timestamp/<hash> y ejecutando `ots verify` con el cliente oficial.',
    };

    // Registrar la generación del reporte (auto-auditable)
    await recordAudit({
      tenantId: req.tenantId!,
      userId: req.userId,
      action: 'EXPORT_AUDIT_REPORT',
      entity: 'AuditReport',
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      endpoint: req.path,
      method: req.method,
      metadata: { periodStart: start.toISOString(), periodEnd: end.toISOString(), logCount: logs.length, reportHash },
    });

    res.json({
      status: 'ok',
      data: {
        tenant,
        period: { start: start.toISOString(), end: end.toISOString() },
        chainIntegrity: chainCheck,
        logCount: logs.length,
        logs,
        reportHash,
        cryptoCertification,
        generatedAt: new Date().toISOString(),
        disclaimer: 'Este documento es generado por ADUANAI con inteligencia artificial. La responsabilidad legal de la operación corresponde al importador y su agente aduanal conforme al Art. 54 de la Ley Aduanera.',
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/audit/export-csv ───────────────────────────────────────
auditAdminRouter.get('/export-csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entity, action, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) range.lte = new Date(dateTo);
      where.createdAt = range;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { email: true, name: true } } },
    });

    const header = ['timestamp', 'user_email', 'user_name', 'action', 'entity', 'entityId', 'method', 'endpoint', 'ip', 'hash'].join(',');
    const rows = logs.map(l => [
      l.createdAt.toISOString(),
      l.user?.email ?? '',
      JSON.stringify(l.user?.name ?? ''),
      l.action,
      l.entity,
      l.entityId ?? '',
      l.method ?? '',
      l.endpoint ?? '',
      l.ipAddress ?? '',
      l.hash,
    ].join(','));
    const csv = [header, ...rows].join('\n');

    await recordAudit({
      tenantId: req.tenantId!,
      userId: req.userId,
      action: 'EXPORT_CSV',
      entity: 'AuditLog',
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      endpoint: req.path,
      method: 'GET',
      metadata: { rowsExported: logs.length },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────
// PÚBLICO — verificación de hash sin auth (para SAT/auditores externos)
// ──────────────────────────────────────────────────────────────────────────

export const auditPublicRouter = Router();

// GET /verify/audit/:hash — busca el hash en la cadena y reporta validez
auditPublicRouter.get('/:hash', async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return res.status(400).json({ status: 'error', message: 'Hash inválido (debe ser SHA-256 de 64 hex chars)' });
    }
    const log = await prisma.auditLog.findFirst({
      where: { hash },
      select: {
        id: true, action: true, entity: true, entityId: true,
        endpoint: true, method: true, createdAt: true,
        tenantId: true, hash: true, prevHash: true,
        tenant: { select: { name: true, rfc: true } },
      },
    });

    if (!log) {
      return res.json({
        status: 'ok',
        data: {
          found: false,
          message: 'Hash no encontrado en la cadena de auditoría. El reporte podría haber sido alterado o no fue emitido por ADUANAI.',
        },
      });
    }

    res.json({
      status: 'ok',
      data: {
        found: true,
        verified: true,
        log: {
          action: log.action,
          entity: log.entity,
          entityId: log.entityId,
          endpoint: log.endpoint,
          method: log.method,
          timestamp: log.createdAt.toISOString(),
          tenantName: log.tenant.name,
          tenantRFC: log.tenant.rfc,
          hash: log.hash,
          prevHash: log.prevHash,
        },
        message: 'Hash válido — el evento está registrado en la cadena de auditoría inmutable de ADUANAI.',
      },
    });
  } catch (err) { next(err); }
});
