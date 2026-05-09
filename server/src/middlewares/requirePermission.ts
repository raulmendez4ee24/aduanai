/**
 * Middleware de permisos granulares.
 *
 * Uso:
 *   classifyRouter.post('/', requirePermission('classifier', 'create'), handler)
 *   classifyRouter.post('/:id/approve', requirePermission('classifier', 'approve'), handler)
 *
 * Compatibilidad: si el usuario es SUPERADMIN, pasa siempre. Si es ADMIN del
 * tenant pero no tiene UserTenantRole asignado, recibe permisos de TENANT_ADMIN.
 */

import type { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { getUserPermissions, hasPermission, type ModuleName, type ModulePermissions, type FeaturePermissions } from '../services/permissions';
import { AppError } from './error';

export function requirePermission(module: ModuleName, action: keyof ModulePermissions | keyof FeaturePermissions) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userId || !req.tenantId) {
      return next(new AppError('No autenticado', 401));
    }
    try {
      const perms = await getUserPermissions(req.userId, req.tenantId, req.userRole);
      if (!hasPermission(perms, module, action)) {
        // Audit log de denegación (fire-and-forget)
        void prisma.permissionAuditLog.create({
          data: {
            tenantId: req.tenantId,
            userId: req.userId,
            action: 'PERMISSION_DENIED',
            details: { module, action, endpoint: req.path, method: req.method },
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
          },
        }).catch(() => {});
        return next(new AppError(`No tienes permiso para ${action} en ${module}`, 403));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
