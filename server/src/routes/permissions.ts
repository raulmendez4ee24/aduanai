/**
 * Endpoints de gestión de roles y permisos por tenant.
 *
 *   GET   /api/permissions/me              — permisos efectivos del usuario actual
 *   GET   /api/permissions/roles           — roles disponibles del tenant
 *   GET   /api/permissions/users           — usuarios + sus roles asignados
 *   POST  /api/permissions/assign          — asignar rol a usuario
 *   POST  /api/permissions/remove          — remover rol
 *   POST  /api/permissions/check-conflict  — preview de conflicto SOD
 *   GET   /api/permissions/audit           — audit log de asignaciones/denegaciones
 *   GET   /api/permissions/oea-report      — reporte OEA con conflictos detectados
 *
 *   POST  /api/permissions/roles           — crear rol custom (TENANT_ADMIN)
 *   PATCH /api/permissions/roles/:id       — editar rol custom
 */

import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import {
  getUserPermissions, checkConflicts, assignRole, removeRole,
  detectSODConflictsForTenant, mergePermissions, type RolePermissions,
} from '../services/permissions';
import { requirePermission } from '../middlewares/requirePermission';

export const permissionsRouter = Router();
permissionsRouter.use(authenticate);

// Permisos efectivos del propio usuario (cualquier autenticado)
permissionsRouter.get('/me', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const perms = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
    const userRoles = await prisma.userTenantRole.findMany({
      where: { userId: req.userId!, tenantId: req.tenantId!, active: true },
      include: { role: { select: { code: true, name: true, description: true } } },
    });
    res.json({
      status: 'ok',
      data: {
        legacyRole: req.userRole,
        roles: userRoles.map(ur => ur.role),
        permissions: perms,
      },
    });
  } catch (err) { next(err); }
});

// Listar roles del tenant
permissionsRouter.get('/roles', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.tenantRole.findMany({
      where: { tenantId: req.tenantId!, active: true },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

// Listar usuarios del tenant + sus roles activos (requiere settings)
permissionsRouter.get('/users', requirePermission('classifier', 'settings'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId! },
      select: { id: true, email: true, name: true, role: true, status: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = users.map(u => u.id);
    const userRoles = await prisma.userTenantRole.findMany({
      where: { userId: { in: userIds }, tenantId: req.tenantId!, active: true },
      include: { role: { select: { id: true, code: true, name: true } } },
    });
    const byUser = new Map<string, typeof userRoles>();
    for (const ur of userRoles) {
      const list = byUser.get(ur.userId) ?? [];
      list.push(ur);
      byUser.set(ur.userId, list);
    }
    res.json({
      status: 'ok',
      data: users.map(u => ({
        ...u,
        roles: (byUser.get(u.id) ?? []).map(ur => ({
          assignmentId: ur.id, code: ur.role.code, name: ur.role.name,
          assignedAt: ur.assignedAt.toISOString(),
        })),
      })),
    });
  } catch (err) { next(err); }
});

const assignSchema = z.object({
  userId: z.string().min(1),
  roleCode: z.string().min(1),
  reason: z.string().max(500).optional(),
  forceOverrideConflict: z.boolean().optional(),
});

permissionsRouter.post('/assign', requirePermission('classifier', 'settings'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = assignSchema.parse(req.body);
    // Verifica que el usuario destino sea del mismo tenant
    const target = await prisma.user.findFirst({
      where: { id: body.userId, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!target) return res.status(404).json({ status: 'error', message: 'Usuario no pertenece a este tenant' });

    const result = await assignRole({
      userId: body.userId,
      tenantId: req.tenantId!,
      roleCode: body.roleCode,
      assignedBy: req.userId!,
      actorLegacyRole: req.userRole,
      reason: body.reason,
      forceOverrideConflict: body.forceOverrideConflict,
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    if (!result.ok) {
      if ('lockout' in result) {
        return res.status(409).json({
          status: 'error',
          code: 'LAST_ADMIN_LOCKOUT',
          message: 'Esta asignación dejaría al tenant sin ningún usuario con permisos de administración. Asigna primero TENANT_ADMIN a otro usuario antes de modificar este rol.',
          suggestion: 'Invita o asigna TENANT_ADMIN a un segundo usuario antes de continuar.',
        });
      }
      return res.status(409).json({
        status: 'conflict',
        message: 'Conflicto de segregación de funciones (SOD)',
        data: result.conflict,
      });
    }
    res.json({ status: 'ok', data: { userRoleId: result.userRoleId, conflict: result.conflict ?? null } });
  } catch (err) { next(err); }
});

const removeSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

permissionsRouter.post('/remove', requirePermission('classifier', 'settings'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = removeSchema.parse(req.body);
    const result = await removeRole({
      userId: body.userId, tenantId: req.tenantId!, roleId: body.roleId,
      removedBy: req.userId!, actorLegacyRole: req.userRole,
      reason: body.reason, ipAddress: req.ip ?? undefined,
    });
    if (!result.ok) {
      return res.status(409).json({
        status: 'error',
        code: 'LAST_ADMIN_LOCKOUT',
        message: 'Quitar este rol dejaría al tenant sin ningún usuario con permisos de administración.',
        suggestion: 'Asigna TENANT_ADMIN a otro usuario antes de remover este rol.',
      });
    }
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

permissionsRouter.post('/check-conflict', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ userId: z.string(), roleCode: z.string() }).parse(req.body);
    const c = await checkConflicts(body.userId, req.tenantId!, body.roleCode);
    res.json({ status: 'ok', data: c });
  } catch (err) { next(err); }
});

permissionsRouter.get('/audit', requirePermission('classifier', 'settings'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const action = req.query.action ? String(req.query.action) : undefined;
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (action) where.action = action;
    if (userId) where.userId = userId;
    const items = await prisma.permissionAuditLog.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 200,
    });
    // Adjuntar info de usuario y rol cuando existan
    const userIds = Array.from(new Set([...items.map(i => i.userId), ...items.map(i => i.targetUserId).filter(Boolean) as string[]]));
    const roleIds = Array.from(new Set(items.map(i => i.roleId).filter(Boolean) as string[]));
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } });
    const roles = await prisma.tenantRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, code: true, name: true } });
    const uMap = new Map(users.map(u => [u.id, u]));
    const rMap = new Map(roles.map(r => [r.id, r]));
    res.json({
      status: 'ok',
      data: items.map(i => ({
        ...i,
        actor: uMap.get(i.userId) ?? null,
        target: i.targetUserId ? uMap.get(i.targetUserId) ?? null : null,
        role: i.roleId ? rMap.get(i.roleId) ?? null : null,
      })),
    });
  } catch (err) { next(err); }
});

permissionsRouter.get('/oea-report', requirePermission('classifier', 'settings'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sod = await detectSODConflictsForTenant(req.tenantId!);
    // Total de denegaciones último mes
    const since = new Date(Date.now() - 30 * 86400000);
    const denials = await prisma.permissionAuditLog.count({
      where: { tenantId: req.tenantId!, action: 'PERMISSION_DENIED', createdAt: { gte: since } },
    });
    const assignments = await prisma.permissionAuditLog.count({
      where: { tenantId: req.tenantId!, action: 'ROLE_ASSIGNED', createdAt: { gte: since } },
    });
    const removals = await prisma.permissionAuditLog.count({
      where: { tenantId: req.tenantId!, action: 'ROLE_REMOVED', createdAt: { gte: since } },
    });

    // Distribución de roles por usuario
    const distribution = await prisma.userTenantRole.findMany({
      where: { tenantId: req.tenantId!, active: true },
      include: { role: { select: { code: true, name: true } } },
    });
    const byRole = new Map<string, number>();
    for (const ur of distribution) {
      byRole.set(ur.role.code, (byRole.get(ur.role.code) ?? 0) + 1);
    }

    res.json({
      status: 'ok',
      data: {
        generatedAt: new Date().toISOString(),
        period: { since: since.toISOString(), until: new Date().toISOString() },
        sodConflicts: sod,
        roleDistribution: Array.from(byRole.entries()).map(([code, count]) => ({ code, count })),
        activity: { permissionDenials: denials, roleAssignments: assignments, roleRemovals: removals },
        recommendations: buildOEARecommendations(sod, distribution.length),
      },
    });
  } catch (err) { next(err); }
});

function buildOEARecommendations(sod: Awaited<ReturnType<typeof detectSODConflictsForTenant>>, totalAssignments: number): string[] {
  const recs: string[] = [];
  if (sod.usersWithConflicts.length > 0) {
    recs.push(`${sod.usersWithConflicts.length} usuario(s) con conflictos SOD activos. Revisar y reasignar antes de auditoría OEA.`);
  }
  if (totalAssignments === 0) {
    recs.push('Ningún usuario tiene rol granular asignado. Recomendable migrar de rol legacy (USER/ADMIN) a roles SOD.');
  }
  if (sod.totalUsersChecked < 3) {
    recs.push('Empresa con pocos usuarios — la SOD requiere al menos 3 personas distintas para clasificar/aprobar/pagar.');
  }
  return recs;
}

const customRoleSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,30}$/),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  permissions: z.record(z.string(), z.unknown()),
  conflictsWith: z.array(z.string()).optional(),
});

permissionsRouter.post('/roles', requirePermission('classifier', 'settings'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = customRoleSchema.parse(req.body);
    const created = await prisma.tenantRole.create({
      data: {
        tenantId: req.tenantId!,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        isSystem: false, isCustom: true,
        permissions: body.permissions as unknown as object,
        conflictsWith: body.conflictsWith ?? [],
        active: true,
      },
    });
    await prisma.permissionAuditLog.create({
      data: {
        tenantId: req.tenantId!, userId: req.userId!,
        action: 'ROLE_CREATED', roleId: created.id,
        details: { code: body.code, name: body.name },
        ipAddress: req.ip ?? null,
      },
    });
    res.status(201).json({ status: 'ok', data: created });
  } catch (err) { next(err); }
});

permissionsRouter.patch('/roles/:id', requirePermission('classifier', 'settings'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id ?? '');
    const role = await prisma.tenantRole.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!role) return res.status(404).json({ status: 'error', message: 'Rol no encontrado' });
    if (role.isSystem) return res.status(400).json({ status: 'error', message: 'Los roles del sistema no son editables (créa un rol custom)' });

    const body = z.object({
      name: z.string().min(2).max(100).optional(),
      description: z.string().max(500).optional(),
      permissions: z.record(z.string(), z.unknown()).optional(),
      conflictsWith: z.array(z.string()).optional(),
      active: z.boolean().optional(),
    }).parse(req.body);

    const updated = await prisma.tenantRole.update({ where: { id }, data: body as Record<string, unknown> });
    await prisma.permissionAuditLog.create({
      data: {
        tenantId: req.tenantId!, userId: req.userId!,
        action: 'ROLE_UPDATED', roleId: id,
        details: { fields: Object.keys(body) },
        ipAddress: req.ip ?? null,
      },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

void mergePermissions; // exported for downstream consumers
