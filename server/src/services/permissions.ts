/**
 * Servicio de permisos granulares con segregación de funciones (OEA).
 *
 * Cada tenant tiene sus propios TenantRole records (sembrados al crearse).
 * Un usuario puede tener múltiples roles activos; sus permisos se UNEN
 * (cualquier rol que conceda permiso, lo otorga).
 *
 * Conflictos de SOD se evalúan al asignar un rol nuevo — un usuario con
 * rol CLASSIFIER no puede recibir VALIDATOR ni FINANCIAL sin marcar
 * conflicto explícito (auditable).
 */

import { prisma } from '../lib/prisma';

// ──────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────

export type ModuleName =
  | 'classifier' | 'quoter' | 'autoMVE' | 'inventory' | 'expedientes'
  | 'fiscalGuardian' | 'payment';

export interface ModulePermissions {
  view?: boolean;
  create?: boolean;
  approve?: boolean;
  delete?: boolean;
  sign?: boolean;
  adjust?: boolean;
  discharge?: boolean;
  archive?: boolean;
  authorize?: boolean;
  generateReport?: boolean;
  acknowledgeAlert?: boolean;
}

export interface FeaturePermissions {
  exportData?: boolean;
  bulkOperations?: boolean;
  apiAccess?: boolean;
  auditTrail?: boolean;
  settings?: boolean;
}

export interface RolePermissions {
  modules: Partial<Record<ModuleName, ModulePermissions>>;
  features: FeaturePermissions;
  limits?: {
    classificationsPerDay?: number | null;
    quotesPerDay?: number | null;
    valueMaxMXN?: number | null;
  };
}

interface RoleSeed {
  code: string;
  name: string;
  description: string;
  permissions: RolePermissions;
  conflictsWith: string[];
}

// ──────────────────────────────────────────────────────────────────
// Roles del sistema (replicados por tenant)
// ──────────────────────────────────────────────────────────────────

export const SYSTEM_ROLES: RoleSeed[] = [
  {
    code: 'TENANT_ADMIN',
    name: 'Administrador de empresa',
    description: 'Control total dentro de la empresa: clasificar, aprobar, firmar, autorizar pagos, configuración.',
    permissions: {
      modules: {
        classifier: { view: true, create: true, approve: true, delete: true },
        quoter: { view: true, create: true, approve: true },
        autoMVE: { view: true, create: true, sign: true },
        inventory: { view: true, adjust: true, discharge: true },
        expedientes: { view: true, create: true, sign: true, archive: true },
        fiscalGuardian: { view: true, generateReport: true, acknowledgeAlert: true },
        payment: { view: true, authorize: true },
      },
      features: { exportData: true, bulkOperations: true, apiAccess: true, auditTrail: true, settings: true },
    },
    conflictsWith: [],
  },
  {
    code: 'CLASSIFIER',
    name: 'Clasificador',
    description: 'Clasifica mercancías y prepara cotizaciones. No aprueba ni firma.',
    permissions: {
      modules: {
        classifier: { view: true, create: true, approve: false, delete: false },
        quoter: { view: true, create: true, approve: false },
        autoMVE: { view: true, create: true, sign: false },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: true, sign: false, archive: false },
        fiscalGuardian: { view: true, generateReport: false, acknowledgeAlert: false },
        payment: { view: false, authorize: false },
      },
      features: { exportData: false, bulkOperations: false, apiAccess: false, auditTrail: true, settings: false },
    },
    conflictsWith: ['VALIDATOR', 'FINANCIAL'],
  },
  {
    code: 'VALIDATOR',
    name: 'Validador / Aprobador',
    description: 'Revisa y aprueba clasificaciones, MVEs, pedimentos. No crea ni paga.',
    permissions: {
      modules: {
        classifier: { view: true, create: false, approve: true, delete: false },
        quoter: { view: true, create: false, approve: true },
        autoMVE: { view: true, create: false, sign: true },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: false, sign: true, archive: false },
        fiscalGuardian: { view: true, generateReport: false, acknowledgeAlert: true },
        payment: { view: false, authorize: false },
      },
      features: { exportData: false, bulkOperations: false, apiAccess: false, auditTrail: true, settings: false },
    },
    conflictsWith: ['CLASSIFIER', 'FINANCIAL'],
  },
  {
    code: 'FINANCIAL',
    name: 'Financiero / Tesorero',
    description: 'Autoriza pagos y maneja aspectos financieros. No crea ni aprueba operaciones técnicas.',
    permissions: {
      modules: {
        classifier: { view: true, create: false, approve: false, delete: false },
        quoter: { view: true, create: false, approve: false },
        autoMVE: { view: true, create: false, sign: false },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: false, sign: false, archive: false },
        fiscalGuardian: { view: true, generateReport: true, acknowledgeAlert: false },
        payment: { view: true, authorize: true },
      },
      features: { exportData: true, bulkOperations: false, apiAccess: false, auditTrail: true, settings: false },
    },
    conflictsWith: ['CLASSIFIER', 'VALIDATOR'],
  },
  {
    code: 'AUDITOR',
    name: 'Auditor / Compliance Officer',
    description: 'Solo lectura completa + audit trail + archiva expedientes. No modifica operaciones.',
    permissions: {
      modules: {
        classifier: { view: true, create: false, approve: false, delete: false },
        quoter: { view: true, create: false, approve: false },
        autoMVE: { view: true, create: false, sign: false },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: false, sign: false, archive: true },
        fiscalGuardian: { view: true, generateReport: true, acknowledgeAlert: false },
        payment: { view: true, authorize: false },
      },
      features: { exportData: true, bulkOperations: false, apiAccess: false, auditTrail: true, settings: false },
    },
    conflictsWith: [],
  },
  {
    code: 'VIEWER',
    name: 'Solo lectura',
    description: 'Solo puede consultar información en todos los módulos.',
    permissions: {
      modules: {
        classifier: { view: true, create: false, approve: false, delete: false },
        quoter: { view: true, create: false, approve: false },
        autoMVE: { view: true, create: false, sign: false },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: false, sign: false, archive: false },
        fiscalGuardian: { view: true, generateReport: false, acknowledgeAlert: false },
        payment: { view: false, authorize: false },
      },
      features: { exportData: false, bulkOperations: false, apiAccess: false, auditTrail: false, settings: false },
    },
    conflictsWith: [],
  },
];

// ──────────────────────────────────────────────────────────────────
// Sembrar roles para un tenant
// ──────────────────────────────────────────────────────────────────

export async function seedTenantRoles(tenantId: string): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const r of SYSTEM_ROLES) {
    const existing = await prisma.tenantRole.findUnique({
      where: { tenantId_code: { tenantId, code: r.code } },
    });
    const data = {
      tenantId, code: r.code, name: r.name, description: r.description,
      isSystem: true, isCustom: false,
      permissions: r.permissions as unknown as object,
      conflictsWith: r.conflictsWith,
      active: true,
    };
    if (existing) {
      await prisma.tenantRole.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.tenantRole.create({ data });
      created++;
    }
  }
  return { created, updated };
}

// Sembrar roles para TODOS los tenants existentes (idempotente)
export async function seedAllTenantsRoles(): Promise<{ tenants: number; created: number; updated: number }> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let totalCreated = 0;
  let totalUpdated = 0;
  for (const t of tenants) {
    const r = await seedTenantRoles(t.id);
    totalCreated += r.created;
    totalUpdated += r.updated;
  }
  return { tenants: tenants.length, created: totalCreated, updated: totalUpdated };
}

// ──────────────────────────────────────────────────────────────────
// Resolución de permisos
// ──────────────────────────────────────────────────────────────────

const TENANT_ADMIN_FALLBACK: RolePermissions = SYSTEM_ROLES[0]!.permissions;
// Fallback para USER legacy sin UserTenantRole asignado: CLASSIFIER (puede crear/clasificar
// pero no aprobar/firmar/pagar). Esto preserva la funcionalidad existente sin romper a los
// usuarios mientras migramos a roles granulares.
const LEGACY_USER_FALLBACK: RolePermissions = SYSTEM_ROLES[1]!.permissions;

function emptyPermissions(): RolePermissions {
  return { modules: {}, features: {} };
}

function mergeModulePerms(a: ModulePermissions, b: ModulePermissions): ModulePermissions {
  const merged: ModulePermissions = { ...a };
  for (const k of Object.keys(b) as (keyof ModulePermissions)[]) {
    if (b[k] === true) merged[k] = true;
    else if (merged[k] === undefined) merged[k] = b[k];
  }
  return merged;
}

export function mergePermissions(perms: RolePermissions[]): RolePermissions {
  if (perms.length === 0) return emptyPermissions();
  const out = emptyPermissions();
  for (const p of perms) {
    for (const [m, mp] of Object.entries(p.modules ?? {})) {
      out.modules[m as ModuleName] = mergeModulePerms(out.modules[m as ModuleName] ?? {}, mp);
    }
    for (const [f, v] of Object.entries(p.features ?? {})) {
      if (v === true) (out.features as Record<string, boolean>)[f] = true;
    }
    if (p.limits) {
      out.limits = out.limits ?? {};
      for (const [l, v] of Object.entries(p.limits)) {
        // Tomar el más permisivo: null o undefined = ilimitado
        const cur = (out.limits as Record<string, number | null | undefined>)[l];
        if (cur === undefined || cur === null) (out.limits as Record<string, number | null>)[l] = v as number | null;
        else if (v === null || v === undefined) (out.limits as Record<string, number | null>)[l] = null;
        else (out.limits as Record<string, number | null>)[l] = Math.max(cur, v as number);
      }
    }
  }
  return out;
}

/**
 * Devuelve los permisos efectivos de un usuario en un tenant.
 *
 * Compatibilidad con sistema legacy USER/ADMIN/SUPERADMIN:
 *   - SUPERADMIN: TENANT_ADMIN_FALLBACK (todo)
 *   - Si el usuario no tiene UserTenantRole asignado: VIEWER_FALLBACK
 */
export async function getUserPermissions(userId: string, tenantId: string, legacyRole?: string): Promise<RolePermissions> {
  if (legacyRole === 'SUPERADMIN') return TENANT_ADMIN_FALLBACK;

  const userRoles = await prisma.userTenantRole.findMany({
    where: {
      userId, tenantId, active: true,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }],
    },
    include: { role: true },
  });

  if (userRoles.length === 0) {
    // Backwards-compat: ADMIN legacy → TENANT_ADMIN. USER legacy → CLASSIFIER fallback.
    if (legacyRole === 'ADMIN') return TENANT_ADMIN_FALLBACK;
    return LEGACY_USER_FALLBACK;
  }

  return mergePermissions(userRoles.map(ur => ur.role.permissions as unknown as RolePermissions));
}

export function hasPermission(permissions: RolePermissions, module: ModuleName, action: keyof ModulePermissions | keyof FeaturePermissions): boolean {
  // Features
  if (action in permissions.features && (action as keyof FeaturePermissions) !== undefined) {
    const v = permissions.features[action as keyof FeaturePermissions];
    if (v === true) return true;
  }
  const mp = permissions.modules[module];
  if (!mp) return false;
  return mp[action as keyof ModulePermissions] === true;
}

// ──────────────────────────────────────────────────────────────────
// Conflictos SOD
// ──────────────────────────────────────────────────────────────────

export interface SODConflict {
  hasConflict: boolean;
  conflictingRoles: { id: string; code: string; name: string }[];
}

export async function checkConflicts(userId: string, tenantId: string, newRoleCode: string): Promise<SODConflict> {
  const newRole = await prisma.tenantRole.findUnique({
    where: { tenantId_code: { tenantId, code: newRoleCode } },
  });
  if (!newRole) return { hasConflict: false, conflictingRoles: [] };

  const existing = await prisma.userTenantRole.findMany({
    where: { userId, tenantId, active: true },
    include: { role: true },
  });

  const conflicting = existing.filter(ur =>
    newRole.conflictsWith.includes(ur.role.code) ||
    ur.role.conflictsWith.includes(newRole.code)
  );

  return {
    hasConflict: conflicting.length > 0,
    conflictingRoles: conflicting.map(c => ({ id: c.role.id, code: c.role.code, name: c.role.name })),
  };
}

// ──────────────────────────────────────────────────────────────────
// Asignar / remover roles
// ──────────────────────────────────────────────────────────────────

export async function assignRole(input: {
  userId: string;
  tenantId: string;
  roleCode: string;
  assignedBy: string;
  reason?: string;
  forceOverrideConflict?: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ ok: true; userRoleId: string; conflict?: SODConflict } | { ok: false; conflict: SODConflict }> {
  const role = await prisma.tenantRole.findUnique({
    where: { tenantId_code: { tenantId: input.tenantId, code: input.roleCode } },
  });
  if (!role) throw new Error(`Rol ${input.roleCode} no existe en este tenant`);

  const conflict = await checkConflicts(input.userId, input.tenantId, input.roleCode);
  if (conflict.hasConflict && !input.forceOverrideConflict) {
    return { ok: false, conflict };
  }

  const created = await prisma.userTenantRole.upsert({
    where: { userId_tenantId_roleId: { userId: input.userId, tenantId: input.tenantId, roleId: role.id } },
    create: {
      userId: input.userId, tenantId: input.tenantId, roleId: role.id,
      assignedBy: input.assignedBy,
      reason: input.reason ?? null,
      active: true,
    },
    update: {
      active: true,
      effectiveUntil: null,
      reason: input.reason ?? null,
    },
  });

  await prisma.permissionAuditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.assignedBy,
      action: 'ROLE_ASSIGNED',
      targetUserId: input.userId,
      roleId: role.id,
      details: {
        roleCode: input.roleCode,
        roleName: role.name,
        reason: input.reason ?? null,
        forceOverrideConflict: !!input.forceOverrideConflict,
        conflict: conflict.hasConflict ? (conflict as unknown as object) : null,
      } as unknown as object,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return { ok: true, userRoleId: created.id, conflict: conflict.hasConflict ? conflict : undefined };
}

export async function removeRole(input: {
  userId: string;
  tenantId: string;
  roleId: string;
  removedBy: string;
  reason?: string;
  ipAddress?: string;
}): Promise<void> {
  await prisma.userTenantRole.updateMany({
    where: { userId: input.userId, tenantId: input.tenantId, roleId: input.roleId },
    data: { active: false, effectiveUntil: new Date() },
  });
  await prisma.permissionAuditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.removedBy,
      action: 'ROLE_REMOVED',
      targetUserId: input.userId,
      roleId: input.roleId,
      details: { reason: input.reason ?? null },
      ipAddress: input.ipAddress ?? null,
    },
  });
}

// ──────────────────────────────────────────────────────────────────
// Reporte OEA: detectar conflictos de SOD existentes
// ──────────────────────────────────────────────────────────────────

export async function detectSODConflictsForTenant(tenantId: string): Promise<{
  usersWithConflicts: { userId: string; email: string; name: string; roles: { code: string; name: string }[]; conflicts: string[] }[];
  totalUsersChecked: number;
}> {
  const userRoles = await prisma.userTenantRole.findMany({
    where: { tenantId, active: true },
    include: { role: { select: { code: true, name: true, conflictsWith: true } } },
  });
  const byUser = new Map<string, typeof userRoles>();
  for (const ur of userRoles) {
    const list = byUser.get(ur.userId) ?? [];
    list.push(ur);
    byUser.set(ur.userId, list);
  }

  const conflictsList: { userId: string; email: string; name: string; roles: { code: string; name: string }[]; conflicts: string[] }[] = [];
  for (const [userId, roles] of byUser) {
    const codes = roles.map(r => r.role.code);
    const conflicts: string[] = [];
    for (const r of roles) {
      for (const c of r.role.conflictsWith) {
        if (codes.includes(c)) conflicts.push(`${r.role.code} ↔ ${c}`);
      }
    }
    if (conflicts.length > 0) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      conflictsList.push({
        userId, email: user?.email ?? '—', name: user?.name ?? '—',
        roles: roles.map(r => ({ code: r.role.code, name: r.role.name })),
        conflicts: Array.from(new Set(conflicts)),
      });
    }
  }
  return { usersWithConflicts: conflictsList, totalUsersChecked: byUser.size };
}
