/**
 * Endpoints admin de backups, restores e incidentes.
 *
 * Todos requieren ADMIN/SUPERADMIN salvo:
 *   GET /api/incidents/public  — usado por la status page (sin auth, en index.ts)
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import {
  performBackup, performRestore, cleanupExpiredBackups, lastSuccessfulBackup, isBackupConfigured,
  type BackupType,
} from '../services/backup';

export const backupsRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];

backupsRouter.get('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type ? String(req.query.type) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    const items = await prisma.backupRecord.findMany({
      where, orderBy: { startedAt: 'desc' }, take: 200,
    });
    // BigInt → string para serialización JSON
    const serialized = items.map(i => ({ ...i, sizeBytes: i.sizeBytes != null ? Number(i.sizeBytes) : null }));
    res.json({ status: 'ok', data: serialized });
  } catch (err) { next(err); }
});

backupsRouter.get('/config', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const config = isBackupConfigured();
    const last = await lastSuccessfulBackup();
    res.json({
      status: 'ok',
      data: {
        ...config,
        provider: process.env.BACKUP_STORAGE || 'local',
        backupDir: process.env.BACKUP_DIR || '/tmp/aduanai-backups',
        encryptionKeyConfigured: !!(process.env.BACKUP_ENCRYPTION_KEY && /^[0-9a-fA-F]{64}$/.test(process.env.BACKUP_ENCRYPTION_KEY)),
        operationsEmail: process.env.OPERATIONS_EMAIL || 'raul@aduanai.mx',
        retention: { daily: 30, weekly: 84, monthly: 365, manual: 90 },
        lastSuccessful: last,
      },
    });
  } catch (err) { next(err); }
});

backupsRouter.post('/run', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const type = (req.body?.type as BackupType) ?? 'manual';
    if (!['daily', 'weekly', 'monthly', 'manual'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'Tipo inválido' });
    }
    const result = await performBackup(type, req.userId ?? 'admin');
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

backupsRouter.post('/cleanup', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await cleanupExpiredBackups();
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

backupsRouter.post('/:id/restore', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { type, reason, confirm } = req.body as { type?: 'full' | 'partial' | 'test'; reason?: string; confirm?: string };
    const restoreType = type ?? 'test';
    if (restoreType === 'full' && confirm !== 'RESTORE_PRODUCTION') {
      return res.status(400).json({ status: 'error', message: 'Para restore full enviar confirm: "RESTORE_PRODUCTION"' });
    }
    const result = await performRestore(id, restoreType, req.userId ?? 'admin', reason);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

backupsRouter.get('/restores', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.restoreLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { backup: { select: { id: true, type: true, completedAt: true } } },
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

backupsRouter.delete('/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const b = await prisma.backupRecord.findUnique({ where: { id } });
    if (!b) return res.status(404).json({ status: 'error', message: 'No encontrado' });
    // Borra del storage si existe
    if (b.storageKey) {
      const { default: fs } = await import('node:fs');
      const path = (await import('node:path')).default;
      const local = path.join(process.env.BACKUP_DIR || '/tmp/aduanai-backups', b.storageKey);
      if (fs.existsSync(local)) fs.unlinkSync(local);
    }
    await prisma.backupRecord.delete({ where: { id } });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

// ─────────────────────── Incidents (admin) ───────────────────────

export const incidentsAdminRouter = Router();

incidentsAdminRouter.get('/', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.systemIncident.findMany({ orderBy: { startedAt: 'desc' }, take: 200 });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

incidentsAdminRouter.post('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title, description, severity, components, publicVisible } = req.body as {
      title?: string; description?: string; severity?: string; components?: string[]; publicVisible?: boolean;
    };
    if (!title || !description || !severity) return res.status(400).json({ status: 'error', message: 'title, description, severity requeridos' });
    const created = await prisma.systemIncident.create({
      data: {
        title, description, severity,
        status: 'investigating',
        components: components ?? [],
        publicVisible: publicVisible ?? true,
        createdBy: req.userId,
        updates: [{ ts: new Date().toISOString(), message: description, status: 'investigating' }] as never,
      },
    });
    res.status(201).json({ status: 'ok', data: created });
  } catch (err) { next(err); }
});

incidentsAdminRouter.patch('/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { update, status, resolution, rootCause } = req.body as { update?: string; status?: string; resolution?: string; rootCause?: string };
    const incident = await prisma.systemIncident.findUnique({ where: { id } });
    if (!incident) return res.status(404).json({ status: 'error', message: 'No encontrado' });
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (resolution) data.resolution = resolution;
    if (rootCause) data.rootCause = rootCause;
    if (status === 'resolved') data.resolvedAt = new Date();
    if (update) {
      const updates = (incident.updates as { ts: string; message: string; status: string }[]) ?? [];
      updates.push({ ts: new Date().toISOString(), message: update, status: status ?? incident.status });
      data.updates = updates as never;
    }
    const updated = await prisma.systemIncident.update({ where: { id }, data });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});
