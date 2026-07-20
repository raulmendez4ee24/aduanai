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
import {
  FEATURE_KEYS, getUserPermissions, hasPermission,
  type ModuleName, type ModulePermissions, type FeaturePermissions,
} from '../services/permissions';
import { AppError } from './error';

// Mensajes en español natural por (module, action). Si no hay mapeo
// específico, cae al fallback genérico.
const FRIENDLY_MODULE_MESSAGES: Record<string, string> = {
  'classifier:create': 'No tienes permiso para crear clasificaciones — pide a tu administrador asignarte el rol CLASSIFIER',
  'classifier:approve': 'Solo validadores pueden aprobar clasificaciones — pide a tu administrador asignarte VALIDATOR',
  'classifier:delete': 'No tienes permiso para eliminar clasificaciones',
  'quoter:create': 'No tienes permiso para crear cotizaciones',
  'quoter:approve': 'Solo validadores pueden aprobar cotizaciones',
  'autoMVE:create': 'No tienes permiso para crear MVE',
  'autoMVE:sign': 'Solo validadores pueden firmar MVE — pide a tu administrador asignarte VALIDATOR',
  'autoMVE:delete': 'No tienes permiso para eliminar MVE',
  'inventory:adjust': 'Solo personal autorizado puede ajustar inventario IMMEX',
  'inventory:discharge': 'Solo personal autorizado puede descargar inventario IMMEX',
  'expedientes:create': 'No tienes permiso para crear expedientes',
  'expedientes:delete': 'No tienes permiso para eliminar expedientes',
  'expedientes:sign': 'Solo validadores pueden firmar expedientes',
  'expedientes:archive': 'Solo auditores pueden archivar expedientes',
  'payment:authorize': 'Solo personal financiero puede autorizar pagos — pide rol FINANCIAL',
  'fiscalGuardian:generateReport': 'Solo personal financiero/auditor puede generar reportes fiscales',
  'fiscalGuardian:acknowledgeAlert': 'No tienes permiso para reconocer alertas fiscales',
};

const FRIENDLY_FEATURE_MESSAGES: Record<keyof FeaturePermissions, string> = {
  exportData: 'No tienes permiso para exportar datos',
  bulkOperations: 'No tienes permiso para realizar operaciones masivas',
  apiAccess: 'No tienes permiso para acceder a la API',
  auditTrail: 'No tienes permiso para consultar el historial de auditoría',
  settings: 'No tienes permiso de configuración de la empresa',
};

type PermissionAction = keyof ModulePermissions | keyof FeaturePermissions;

function isFeatureAction(action: PermissionAction): action is keyof FeaturePermissions {
  return (FEATURE_KEYS as readonly string[]).includes(action);
}

function friendlyDenialMessage(module: ModuleName, action: PermissionAction): string {
  if (isFeatureAction(action)) return FRIENDLY_FEATURE_MESSAGES[action];
  return FRIENDLY_MODULE_MESSAGES[`${module}:${action}`] ?? `No tienes permiso para ${action} en ${module}`;
}

export function requirePermission(module: ModuleName, action: PermissionAction) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userId || !req.tenantId) {
      return next(new AppError('No autenticado', 401));
    }
    try {
      const perms = await getUserPermissions(req.userId, req.tenantId, req.userRole);
      if (!hasPermission(perms, module, action)) {
        // Audit log de denegación (fire-and-forget)
        const details = isFeatureAction(action)
          ? { feature: action, endpoint: req.path, method: req.method }
          : { module, action, endpoint: req.path, method: req.method };
        void prisma.permissionAuditLog.create({
          data: {
            tenantId: req.tenantId,
            userId: req.userId,
            action: 'PERMISSION_DENIED',
            details,
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
          },
        }).catch(() => {});
        return next(new AppError(friendlyDenialMessage(module, action), 403));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
