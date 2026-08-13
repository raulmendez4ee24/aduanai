// DEFENSA DE CAPA contra fugas cross-tenant (IDOR).
//
// Intercepta findUnique/findFirst sobre modelos MULTI-TENANT y exige que el
// `where` incluya `tenantId`. Es el complemento de defensa-en-profundidad al
// scope explícito de cada ruta: si mañana alguien escribe
// `prisma.pedimento.findUnique({ where: { id } })` sin tenant, esto lo atrapa.
//
// Comportamiento:
//   - Con TENANT_GUARD_STRICT=1  → LANZA (dev/CI: el bug no puede repetirse).
//   - Sin el flag                → registra un aviso ruidoso y DEJA PASAR
//     (producción no se cae por una ruta no auditada; sí queda el rastro).
//
// Escape hatch legítimo: auth, login, herramientas SUPERADMIN cross-tenant y
// jobs de sistema envuelven su consulta en `sinGuardaDeTenant(() => ...)`.
// Un scope cruzado JAMÁS es accidental: se declara.

import { AsyncLocalStorage } from 'node:async_hooks';

// Modelos con columna tenantId (PascalCase, como los nombra Prisma en $extends).
// EXCLUIDO a propósito: `User`. La autenticación es inherentemente cross-tenant
// (login/registro/reset buscan por email en TODOS los tenants; el middleware
// busca por el userId del propio JWT y luego verifica `user.tenantId ===
// decoded.tenantId`). Meter User aquí generaría un aviso en CADA request y
// exigiría envolver ~13 rutas de auth. El acceso a User por id lo cubre la
// revisión de rutas (barrida y verificada limpia). Si algún día se agrega un
// endpoint "usuario por id", scópealo con tenantId como el resto.
export const MODELOS_MULTITENANT = new Set<string>([
  'AIUsageLog', 'Alert', 'Annex24Report', 'Annex30Account', 'Assembly', 'AuditLog',
  'COVE', 'CertificationProfile', 'Classification', 'ClassificationConsult',
  'CopilotConsult', 'CopilotMessage', 'CreditUsage', 'DemoAccount', 'Discharge',
  'Document', 'GlosaSimulation', 'Guarantee', 'Invitation', 'LoadPlan',
  'ManifestacionValor', 'Operation', 'OriginAnalysis', 'OriginCertificate',
  'PadronCheck', 'Pedimento', 'PermissionAuditLog', 'Product', 'Proposal', 'Quote',
  'RiskAssessment', 'SystemLog', 'TaxCredit', 'TemporaryImport', 'TenantPadronStatus',
  'TenantRole', 'UpdateNotification', 'UserTenantRole',
]);

const almacenBypass = new AsyncLocalStorage<boolean>();

/** Envuelve una operación cross-tenant LEGÍTIMA (auth, login, admin SUPERADMIN,
 *  jobs). Dentro de fn la guarda no aplica — el cruce es deliberado y explícito. */
export function sinGuardaDeTenant<T>(fn: () => T): T {
  return almacenBypass.run(true, fn);
}
function bypassActivo(): boolean {
  return almacenBypass.getStore() === true;
}

/** ¿El where acota por tenantId (directo o dentro de AND/OR)? */
export function whereTieneTenant(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;
  if ('tenantId' in w && w.tenantId != null) return true;
  for (const clave of ['AND', 'OR'] as const) {
    const v = w[clave];
    if (Array.isArray(v) && v.some(whereTieneTenant)) return true;
    if (v && typeof v === 'object' && whereTieneTenant(v)) return true;
  }
  return false;
}

function modoEstricto(): boolean {
  return process.env.TENANT_GUARD_STRICT === '1';
}

/** Núcleo verificable (sin Prisma): decide y, en estricto, lanza. */
export function verificarAcceso(op: string, model: string, where: unknown): void {
  if (bypassActivo()) return;
  if (!MODELOS_MULTITENANT.has(model)) return;
  if (whereTieneTenant(where)) return;
  const msg = `[tenant-guard] ${op} en ${model} sin tenantId en el where — posible fuga cross-tenant`;
  if (modoEstricto()) {
    throw new Error(`${msg}. Usa where:{ id, tenantId } o, si el cruce es intencional (auth/admin), envuélvelo en sinGuardaDeTenant().`);
  }
  // producción: no tumbar la app; dejar rastro ruidoso para alertar/auditar.
  console.error(msg);
}

// Un intercept por operación: verifica y delega. `query` es la ejecución real.
type Intercept = (p: { model: string; args: { where?: unknown }; query: (a: unknown) => unknown }) => unknown;
const intercept = (op: string): Intercept => ({ model, args, query }) => {
  verificarAcceso(op, model, args?.where);
  return query(args);
};

/** Extensión de cliente Prisma: aplica la guarda a las lecturas por clave.
 *  Preserva el tipo del cliente (T = PrismaClient) — el $extends se aplica en
 *  runtime pero el tipo público sigue siendo el mismo cliente. */
export function conGuardaDeTenant<T>(cliente: T): T {
  const ext = {
    name: 'tenant-guard',
    query: {
      $allModels: {
        findUnique: intercept('findUnique'),
        findUniqueOrThrow: intercept('findUniqueOrThrow'),
        findFirst: intercept('findFirst'),
        findFirstOrThrow: intercept('findFirstOrThrow'),
      },
    },
  };
  return (cliente as { $extends: (e: unknown) => unknown }).$extends(ext) as T;
}
