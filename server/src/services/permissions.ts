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
import { Prisma } from '@prisma/client';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────

const MODULE_NAMES = [
  'classifier', 'quoter', 'autoMVE', 'inventory', 'expedientes',
  'fiscalGuardian', 'payment',
  // ── OPERACIÓN 2026-08 ── módulos nuevos (Ola 1: multi-cliente y roles)
  'preglosa', 'risk', 'origin', 'catalogo', 'calendario', 'clientes',
] as const;

export type ModuleName = (typeof MODULE_NAMES)[number];

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

export const MODULE_ACTION_KEYS = [
  'view', 'create', 'approve', 'delete', 'sign', 'adjust', 'discharge',
  'archive', 'authorize', 'generateReport', 'acknowledgeAlert',
] as const satisfies readonly (keyof ModulePermissions)[];

export const FEATURE_KEYS = [
  'exportData', 'bulkOperations', 'apiAccess', 'auditTrail', 'settings',
] as const satisfies readonly (keyof FeaturePermissions)[];

type AssertNoMissingKeys<T extends never> = T;
type _AllModuleActionKeysCovered = AssertNoMissingKeys<
  Exclude<keyof ModulePermissions, (typeof MODULE_ACTION_KEYS)[number]>
>;
type _AllFeatureKeysCovered = AssertNoMissingKeys<
  Exclude<keyof FeaturePermissions, (typeof FEATURE_KEYS)[number]>
>;

export interface RolePermissions {
  modules: Partial<Record<ModuleName, ModulePermissions>>;
  features: FeaturePermissions;
  limits?: {
    classificationsPerDay?: number | null;
    quotesPerDay?: number | null;
    valueMaxMXN?: number | null;
  };
}

const modulePermissionShape = Object.fromEntries(
  MODULE_ACTION_KEYS.map(action => [action, z.boolean().optional()]),
) as Record<(typeof MODULE_ACTION_KEYS)[number], z.ZodOptional<z.ZodBoolean>>;

const modulePermissionsSchema = z.object(modulePermissionShape).strict();

const modulesShape = Object.fromEntries(
  MODULE_NAMES.map(module => [module, modulePermissionsSchema.optional()]),
) as Record<ModuleName, z.ZodOptional<typeof modulePermissionsSchema>>;

const featureShape = Object.fromEntries(
  FEATURE_KEYS.map(feature => [feature, z.boolean().optional()]),
) as Record<(typeof FEATURE_KEYS)[number], z.ZodOptional<z.ZodBoolean>>;

export const rolePermissionsSchema = z.object({
  modules: z.object(modulesShape).strict(),
  features: z.object(featureShape).strict(),
  limits: z.object({
    classificationsPerDay: z.number().nullable().optional(),
    quotesPerDay: z.number().nullable().optional(),
    valueMaxMXN: z.number().nullable().optional(),
  }).strict().optional(),
}).strict();

export function validateRolePermissions(input: unknown): RolePermissions {
  return rolePermissionsSchema.parse(input);
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
        preglosa: { view: true, create: true, approve: true, archive: true },
        risk: { view: true, create: true, generateReport: true },
        origin: { view: true, create: true, approve: true },
        catalogo: { view: true, create: true, approve: true, delete: true },
        calendario: { view: true, create: true, acknowledgeAlert: true },
        clientes: { view: true, create: true, delete: true },
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
        preglosa: { view: true, create: true, approve: false, archive: false },
        risk: { view: true, create: true, generateReport: false },
        origin: { view: true, create: true, approve: false },
        catalogo: { view: true, create: true, approve: false, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: false },
        clientes: { view: true, create: false, delete: false },
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
        preglosa: { view: true, create: false, approve: true, archive: false },
        risk: { view: true, create: false, generateReport: false },
        origin: { view: true, create: false, approve: true },
        catalogo: { view: true, create: false, approve: true, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: true },
        clientes: { view: true, create: false, delete: false },
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
        preglosa: { view: true, create: false, approve: false, archive: false },
        risk: { view: true, create: false, generateReport: true },
        origin: { view: true, create: false, approve: false },
        catalogo: { view: true, create: false, approve: false, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: false },
        clientes: { view: true, create: false, delete: false },
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
        preglosa: { view: true, create: false, approve: false, archive: true },
        risk: { view: true, create: false, generateReport: true },
        origin: { view: true, create: false, approve: false },
        catalogo: { view: true, create: false, approve: false, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: false },
        clientes: { view: true, create: false, delete: false },
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
        preglosa: { view: true, create: false, approve: false, archive: false },
        risk: { view: true, create: false, generateReport: false },
        origin: { view: true, create: false, approve: false },
        catalogo: { view: true, create: false, approve: false, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: false },
        clientes: { view: true, create: false, delete: false },
      },
      features: { exportData: false, bulkOperations: false, apiAccess: false, auditTrail: false, settings: false },
    },
    conflictsWith: [],
  },
  // ── OPERACIÓN 2026-08 ── roles operativos de agencia (Ola 1)
  // "El junior propone, el señor con patente aprueba": CAPTURISTA crea, no aprueba.
  {
    code: 'CAPTURISTA',
    name: 'Capturista',
    description: 'Captura clasificaciones, cotizaciones y operaciones; todo nace pendiente de aprobación. No aprueba, no firma, no configura.',
    permissions: {
      modules: {
        classifier: { view: true, create: true, approve: false, delete: false },
        quoter: { view: true, create: true, approve: false },
        autoMVE: { view: true, create: true, sign: false },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: true, sign: false, archive: false },
        fiscalGuardian: { view: true, generateReport: false, acknowledgeAlert: false },
        payment: { view: false, authorize: false },
        preglosa: { view: true, create: true, approve: false, archive: false },
        risk: { view: true, create: true, generateReport: false },
        origin: { view: true, create: true, approve: false },
        catalogo: { view: true, create: true, approve: false, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: false },
        clientes: { view: true, create: false, delete: false },
      },
      features: { exportData: false, bulkOperations: true, apiAccess: false, auditTrail: false, settings: false },
    },
    conflictsWith: ['GLOSADOR'],
  },
  {
    code: 'GLOSADOR',
    name: 'Glosador',
    description: 'Revisa: pre-glosa, pre-validador y expedientes. Aprueba glosa y las clasificaciones/cotizaciones propuestas por capturistas.',
    permissions: {
      modules: {
        classifier: { view: true, create: false, approve: true, delete: false },
        quoter: { view: true, create: false, approve: true },
        autoMVE: { view: true, create: false, sign: true },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: true, sign: true, archive: false },
        fiscalGuardian: { view: true, generateReport: false, acknowledgeAlert: true },
        payment: { view: false, authorize: false },
        preglosa: { view: true, create: true, approve: true, archive: true },
        risk: { view: true, create: true, generateReport: false },
        origin: { view: true, create: false, approve: true },
        catalogo: { view: true, create: false, approve: true, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: true },
        clientes: { view: true, create: false, delete: false },
      },
      features: { exportData: true, bulkOperations: false, apiAccess: false, auditTrail: true, settings: false },
    },
    conflictsWith: ['CAPTURISTA'],
  },
  {
    code: 'GERENTE',
    name: 'Gerente de operaciones',
    description: 'Ve todo, aprueba todo y genera reportes. No toca la configuración de la empresa ni autoriza pagos.',
    permissions: {
      modules: {
        classifier: { view: true, create: true, approve: true, delete: false },
        quoter: { view: true, create: true, approve: true },
        autoMVE: { view: true, create: true, sign: true },
        inventory: { view: true, adjust: true, discharge: true },
        expedientes: { view: true, create: true, sign: true, archive: true },
        fiscalGuardian: { view: true, generateReport: true, acknowledgeAlert: true },
        payment: { view: true, authorize: false },
        preglosa: { view: true, create: true, approve: true, archive: true },
        risk: { view: true, create: true, generateReport: true },
        origin: { view: true, create: true, approve: true },
        catalogo: { view: true, create: true, approve: true, delete: false },
        calendario: { view: true, create: true, acknowledgeAlert: true },
        clientes: { view: true, create: true, delete: false },
      },
      features: { exportData: true, bulkOperations: true, apiAccess: false, auditTrail: true, settings: false },
    },
    conflictsWith: [],
  },
  {
    code: 'CLIENTE_CONSULTA',
    name: 'Cliente (consulta)',
    description: 'Portal del importador: solo ve los datos de sus propios RFC (restricción de alcance por cliente). No crea nada.',
    permissions: {
      modules: {
        classifier: { view: true, create: false, approve: false, delete: false },
        quoter: { view: true, create: false, approve: false },
        autoMVE: { view: true, create: false, sign: false },
        inventory: { view: true, adjust: false, discharge: false },
        expedientes: { view: true, create: false, sign: false, archive: false },
        fiscalGuardian: { view: true, generateReport: false, acknowledgeAlert: false },
        payment: { view: false, authorize: false },
        preglosa: { view: true, create: false, approve: false, archive: false },
        risk: { view: true, create: false, generateReport: false },
        origin: { view: true, create: false, approve: false },
        catalogo: { view: true, create: false, approve: false, delete: false },
        calendario: { view: true, create: false, acknowledgeAlert: false },
        clientes: { view: false, create: false, delete: false },
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

// Auto-asignar TENANT_ADMIN explícito al admin inicial de un tenant nuevo.
// Idempotente: si ya existe el rol asignado, sólo lo reactiva.
export async function autoAssignTenantAdmin(userId: string, tenantId: string): Promise<void> {
  const adminRole = await prisma.tenantRole.findUnique({
    where: { tenantId_code: { tenantId, code: 'TENANT_ADMIN' } },
  });
  if (!adminRole) return;
  await prisma.userTenantRole.upsert({
    where: { userId_tenantId_roleId: { userId, tenantId, roleId: adminRole.id } },
    create: {
      userId, tenantId, roleId: adminRole.id,
      assignedBy: userId,
      reason: 'initial_tenant_admin',
      active: true,
    },
    update: { active: true, effectiveUntil: null },
  });
  await prisma.permissionAuditLog.create({
    data: {
      tenantId, userId,
      action: 'ROLE_AUTO_ASSIGNED',
      targetUserId: userId,
      roleId: adminRole.id,
      details: { reason: 'initial_tenant_admin' } as unknown as object,
      ipAddress: null,
    },
  });
}

// Migración una-sola-vez: para cada tenant sin ningún UserTenantRole de
// TENANT_ADMIN activo, asignar TENANT_ADMIN al usuario ADMIN/SUPERADMIN más
// antiguo del tenant. Idempotente: si ya hay un TENANT_ADMIN asignado, saltar.
export async function migrateTenantsWithoutAdmin(): Promise<{ tenants: number; migrated: number; skippedExisting: number; skippedNoUser: number }> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let migrated = 0;
  let skippedExisting = 0;
  let skippedNoUser = 0;
  for (const t of tenants) {
    const adminRole = await prisma.tenantRole.findUnique({
      where: { tenantId_code: { tenantId: t.id, code: 'TENANT_ADMIN' } },
    });
    if (!adminRole) { skippedNoUser++; continue; }
    const existing = await prisma.userTenantRole.findFirst({
      where: { tenantId: t.id, roleId: adminRole.id, active: true },
    });
    if (existing) { skippedExisting++; continue; }
    const initialAdmin = await prisma.user.findFirst({
      where: { tenantId: t.id, role: { in: ['ADMIN', 'SUPERADMIN'] }, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!initialAdmin) { skippedNoUser++; continue; }
    try {
      await prisma.userTenantRole.create({
        data: {
          userId: initialAdmin.id, tenantId: t.id, roleId: adminRole.id,
          assignedBy: initialAdmin.id,
          reason: 'migration:initial_tenant_admin',
          active: true,
        },
      });
    } catch (err) {
      // Carrera entre réplicas en el arranque: otra instancia ganó el create.
      // El unique (userId,tenantId,roleId) garantiza una sola asignación.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        skippedExisting++;
        continue;
      }
      throw err;
    }
    await prisma.permissionAuditLog.create({
      data: {
        tenantId: t.id, userId: initialAdmin.id,
        action: 'ROLE_AUTO_ASSIGNED',
        targetUserId: initialAdmin.id,
        roleId: adminRole.id,
        details: { migration: true, reason: 'initial_tenant_admin' } as unknown as object,
        ipAddress: null,
      },
    });
    migrated++;
  }
  return { tenants: tenants.length, migrated, skippedExisting, skippedNoUser };
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
  if ((FEATURE_KEYS as readonly string[]).includes(action)) {
    return permissions.features[action as keyof FeaturePermissions] === true;
  }
  if (!(MODULE_ACTION_KEYS as readonly string[]).includes(action)) return false;
  return permissions.modules[module]?.[action as keyof ModulePermissions] === true;
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

// ──────────────────────────────────────────────────────────────────
// Last-admin lockout guard
// Asegura que la operación no deje al tenant sin ningún usuario con
// permiso settings (perdiendo la capacidad de gestionar roles).
// ──────────────────────────────────────────────────────────────────

function rolesProvideSettings(perms: RolePermissions[], legacyRole?: string): boolean {
  if (perms.length === 0) return legacyRole === 'ADMIN' || legacyRole === 'SUPERADMIN';
  return mergePermissions(perms).features.settings === true;
}

async function tenantStillHasAdminAfterChange(
  tenantId: string,
  changedUserId: string,
  changedUserWillHaveSettings: boolean,
): Promise<boolean> {
  if (changedUserWillHaveSettings) return true;
  const others = await prisma.user.findMany({
    where: { tenantId, active: true, id: { not: changedUserId } },
    select: { id: true, role: true },
  });
  for (const u of others) {
    const perms = await getUserPermissions(u.id, tenantId, u.role);
    if (perms.features.settings === true) return true;
  }
  return false;
}

export async function assignRole(input: {
  userId: string;
  tenantId: string;
  roleCode: string;
  assignedBy: string;
  actorLegacyRole?: string;
  reason?: string;
  forceOverrideConflict?: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<
  | { ok: true; userRoleId: string; conflict?: SODConflict }
  | { ok: false; conflict: SODConflict }
  | { ok: false; lockout: true }
> {
  const role = await prisma.tenantRole.findUnique({
    where: { tenantId_code: { tenantId: input.tenantId, code: input.roleCode } },
  });
  if (!role) throw new Error(`Rol ${input.roleCode} no existe en este tenant`);

  const conflict = await checkConflicts(input.userId, input.tenantId, input.roleCode);
  if (conflict.hasConflict && !input.forceOverrideConflict) {
    return { ok: false, conflict };
  }

  // Lockout guard: si la asignación dejaría al usuario sin settings y nadie
  // más del tenant tiene settings, bloquear (SUPERADMIN se salta el guard).
  if (input.actorLegacyRole !== 'SUPERADMIN') {
    const targetUser = await prisma.user.findUnique({
      where: { id: input.userId }, select: { role: true },
    });
    const currentRoles = await prisma.userTenantRole.findMany({
      where: { userId: input.userId, tenantId: input.tenantId, active: true },
      include: { role: true },
    });
    const futurePerms: RolePermissions[] = [];
    let alreadyHas = false;
    for (const ur of currentRoles) {
      futurePerms.push(ur.role.permissions as unknown as RolePermissions);
      if (ur.roleId === role.id) alreadyHas = true;
    }
    if (!alreadyHas) futurePerms.push(role.permissions as unknown as RolePermissions);
    const willHaveSettings = rolesProvideSettings(futurePerms, targetUser?.role);
    const safe = await tenantStillHasAdminAfterChange(input.tenantId, input.userId, willHaveSettings);
    if (!safe) return { ok: false, lockout: true };
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
  actorLegacyRole?: string;
  reason?: string;
  ipAddress?: string;
}): Promise<{ ok: true } | { ok: false; lockout: true }> {
  if (input.actorLegacyRole !== 'SUPERADMIN') {
    const targetUser = await prisma.user.findUnique({
      where: { id: input.userId }, select: { role: true },
    });
    const currentRoles = await prisma.userTenantRole.findMany({
      where: { userId: input.userId, tenantId: input.tenantId, active: true },
      include: { role: true },
    });
    const futurePerms = currentRoles
      .filter(ur => ur.roleId !== input.roleId)
      .map(ur => ur.role.permissions as unknown as RolePermissions);
    const willHaveSettings = rolesProvideSettings(futurePerms, targetUser?.role);
    const safe = await tenantStillHasAdminAfterChange(input.tenantId, input.userId, willHaveSettings);
    if (!safe) return { ok: false, lockout: true };
  }

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
  return { ok: true };
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
