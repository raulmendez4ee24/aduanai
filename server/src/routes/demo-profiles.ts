/**
 * Endpoints admin para perfiles demo segmentados por sector industrial.
 *
 *   GET  /api/admin/demo/profiles                    — lista perfiles
 *   POST /api/admin/demo/load { profileCode, tenantId } — carga perfil en tenant
 *   POST /api/admin/demo/clear { tenantId }          — limpia demo data del tenant
 *   POST /api/admin/demo/tenants/create-all          — crea 5 tenants demo + usuarios
 */

import { Router, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { loadDemoIntoTenant, clearDemoFromTenant } from '../services/demo-loader';
import { logger } from '../lib/logger';

export const demoProfilesRouter = Router();
const adminOnly = [authenticate, requireRole('ADMIN', 'SUPERADMIN')];

demoProfilesRouter.get('/profiles', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profiles = await prisma.demoProfile.findMany({
      where: { active: true },
      orderBy: [{ isDefault: 'desc' }, { industryName: 'asc' }],
    });
    res.json({ status: 'ok', data: profiles });
  } catch (err) { next(err); }
});

demoProfilesRouter.post('/load', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { profileCode, tenantId } = req.body as { profileCode?: string; tenantId?: string };
    if (!profileCode || !tenantId) {
      return res.status(400).json({ status: 'error', message: 'profileCode y tenantId requeridos' });
    }
    const profile = await prisma.demoProfile.findUnique({ where: { industryCode: profileCode } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Perfil no encontrado' });

    // Actualizar identidad del tenant según el perfil
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: profile.companyName, rfc: profile.rfc },
    });

    const adminUser = await prisma.user.findFirst({ where: { tenantId, role: 'ADMIN' } });
    if (!adminUser) return res.status(400).json({ status: 'error', message: 'Tenant sin usuario admin' });

    await clearDemoFromTenant(prisma, tenantId);
    const result = await loadDemoIntoTenant(prisma, tenantId, adminUser.id, { profileCode });

    res.json({ status: 'ok', data: { profile: { code: profile.industryCode, name: profile.industryName }, ...result } });
  } catch (err) { next(err); }
});

demoProfilesRouter.post('/clear', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'tenantId requerido' });
    const result = await clearDemoFromTenant(prisma, tenantId);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

demoProfilesRouter.post('/tenants/create-all', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profiles = await prisma.demoProfile.findMany({ where: { active: true } });
    const password = await bcrypt.hash('demo1234', 12);
    const created: { profileCode: string; tenantId: string; email: string; userId: string }[] = [];

    for (const p of profiles) {
      const email = `demo-${p.industryCode}@aduanai.mx`;
      const tenantId = `demo-${p.industryCode}-tenant`;

      // Crear tenant si no existe
      const tenant = await prisma.tenant.upsert({
        where: { id: tenantId },
        update: { name: p.companyName, rfc: p.rfc },
        create: { id: tenantId, name: p.companyName, rfc: p.rfc, plan: 'PROFESSIONAL' },
      });

      // Crear/actualizar usuario admin
      const user = await prisma.user.upsert({
        where: { email },
        update: { password, status: 'VERIFIED', emailVerified: true, active: true, tenantId: tenant.id },
        create: {
          email, password, name: `Demo ${p.industryName}`,
          role: 'ADMIN', status: 'VERIFIED', emailVerified: true, tenantId: tenant.id,
        },
      });

      // Cargar dataset del perfil
      try {
        await clearDemoFromTenant(prisma, tenant.id);
        await loadDemoIntoTenant(prisma, tenant.id, user.id, { profileCode: p.industryCode });
      } catch (err) {
        logger.warn(`No se pudo cargar dataset demo ${p.industryCode}`, { errorMessage: err instanceof Error ? err.message : String(err) });
      }

      created.push({ profileCode: p.industryCode, tenantId: tenant.id, email, userId: user.id });
    }
    res.json({ status: 'ok', data: { created, password: 'demo1234' } });
  } catch (err) { next(err); }
});
