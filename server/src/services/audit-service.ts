/**
 * Audit Service — registro inmutable de acciones con cadena de hashes
 * estilo blockchain (cada log encadena con el anterior del mismo tenant).
 *
 * Verificación: hash = SHA-256(prevHash + JSON.stringify(content))
 * Modificar cualquier registro rompe la cadena de todos los posteriores.
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { sanitizeAuditMetadata } from '../lib/audit-sanitizer';

export interface RecordAuditInput {
  tenantId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  endpoint?: string | null;
  method?: string | null;
  metadata?: Record<string, unknown> | null;
}

const AUDITED_ENTITIES_TO_CAPTURE_AFTER = new Set([
  'Classification', 'Quote', 'QuoteItem', 'Pedimento', 'PedimentoPartida',
  'Operation', 'TemporaryImport', 'Discharge', 'TaxCredit', 'Guarantee',
  'CertificationProfile', 'ManifestacionValor', 'COVE', 'LoadPlan', 'Alert',
  'Product', 'ProductComponent', 'Assembly',
]);

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Stable JSON.stringify — ordena keys de objetos recursivamente.
 * Crucial: Postgres JSONB no preserva orden de keys; al releer y rehashear,
 * el orden puede cambiar y romper la verificación.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const obj = value as Record<string, unknown>;
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** Diff shallow: { campo: {from, to} } */
export function shallowDiff(before: unknown, after: unknown): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(before) && !isObj(after)) return diff;
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'createdAt') continue;
    const bs = JSON.stringify(b[k]);
    const as_ = JSON.stringify(a[k]);
    if (bs !== as_) diff[k] = { from: b[k], to: a[k] };
  }
  return diff;
}

/**
 * Registra un evento de auditoría con hash encadenado.
 * Fire-and-forget — los errores no bloquean al caller.
 */
export async function recordAudit(input: RecordAuditInput): Promise<{ id: string; hash: string } | null> {
  try {
    if (!input.tenantId) return null;
    const safeMetadata = sanitizeAuditMetadata(input.metadata ?? null);

    // Diff
    let diff: Record<string, { from: unknown; to: unknown }> | null = null;
    if (input.before && input.after) {
      const d = shallowDiff(input.before, input.after);
      if (Object.keys(d).length > 0) diff = d;
    }

    const lockKey = `aduanai:audit:${input.tenantId}`;
    const { created, canonicalContent } = await prisma.$transaction(async (tx) => {
      // Transaction-scoped advisory lock: serializa appenders del mismo tenant
      // incluso cuando corren en procesos/replicas Railway diferentes. El prefijo
      // evita compartir namespace accidentalmente con otros advisory locks.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lockKey}::text, 0::bigint)
        )
      `;

      // El tail se lee DESPUÉS de adquirir el lock y desde la misma transacción.
      // `id` hace determinista el orden de cualquier empate legacy.
      const prev = await tx.auditLog.findFirst({
        where: { tenantId: input.tenantId, hash: { not: '' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { hash: true, createdAt: true },
      });
      const prevHash = prev?.hash || null;

      // Debe ser clock_timestamp(), no now()/CURRENT_TIMESTAMP: estos últimos
      // reflejan el inicio de la transacción, que puede preceder la espera del lock.
      const clocks = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS now
      `;
      const dbNow = clocks[0]?.now;
      if (!(dbNow instanceof Date) || Number.isNaN(dbNow.getTime())) {
        throw new Error('No se pudo obtener clock_timestamp() para AuditLog');
      }

      // Prisma/JS trabajan a precisión de milisegundos. Forzar > tail evita que
      // dos inserts del mismo tenant empaten o retrocedan por clock skew.
      const minNextMs = prev ? prev.createdAt.getTime() + 1 : dbNow.getTime();
      const ts = new Date(Math.max(dbNow.getTime(), minNextMs));

      const nextContent = {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        diff,
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        endpoint: input.endpoint ?? null,
        method: input.method ?? null,
        metadata: safeMetadata,
        timestamp: ts.toISOString(),
      };
      const nextCanonicalContent = stableStringify(nextContent);
      const hash = sha256((prevHash ?? '') + nextCanonicalContent);

      const next = await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          before: (input.before as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          after: (input.after as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          diff: (diff as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          endpoint: input.endpoint ?? null,
          method: input.method ?? null,
          metadata: (safeMetadata as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          hash,
          prevHash,
          createdAt: ts, // idéntico al timestamp incluido en el hash
        },
      });

      return { created: next, canonicalContent: nextCanonicalContent };
    }, { maxWait: 5_000, timeout: 15_000 });

    // Anclaje a OpenTimestamps DESPUÉS del commit (fire-and-forget, no bloquea
    // ni prolonga el advisory lock).
    void (async () => {
      try {
        const { shouldAnchor, anchorContent } = await import('./timestamp');
        if (shouldAnchor(input.action)) {
          await anchorContent('audit_log', created.id, canonicalContent);
        }
      } catch (err) {
        console.error('[audit] anchor failed:', err instanceof Error ? err.message : err);
      }
    })();

    return { id: created.id, hash: created.hash };
  } catch (err) {
    // Logging audit no debe tirar el request original
    console.error('[audit] recordAudit error:', err);
    return null;
  }
}

/**
 * Verifica integridad de la cadena de hashes para un tenant.
 * Retorna el primer registro corrupto (o null si todo OK).
 */
export async function verifyChain(tenantId: string): Promise<{ valid: boolean; brokenAt?: string; checkedCount: number }> {
  // Solo verificamos logs con hash (los legacy sin hash se ignoran)
  const logs = await prisma.auditLog.findMany({
    where: { tenantId, hash: { not: '' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let prevHash: string | null = null;
  let checked = 0;
  for (const log of logs) {
    const content = {
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      before: log.before,
      after: log.after,
      diff: log.diff,
      tenantId: log.tenantId,
      userId: log.userId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      endpoint: log.endpoint,
      method: log.method,
      metadata: log.metadata,
      timestamp: log.createdAt.toISOString(),
    };
    const expected = sha256((prevHash ?? '') + stableStringify(content));
    // Normalizar prevHash null/'' en ambos lados
    const logPrev = log.prevHash || null;
    if (expected !== log.hash || logPrev !== prevHash) {
      return { valid: false, brokenAt: log.id, checkedCount: checked };
    }
    prevHash = log.hash;
    checked++;
  }
  return { valid: true, checkedCount: checked };
}

/**
 * Hash de un reporte (para verificación pública de integridad).
 * Combina período + tenantId + lista de hashes de logs.
 */
export function computeReportHash(tenantId: string, periodStart: Date, periodEnd: Date, logHashes: string[]): string {
  return sha256(JSON.stringify({
    tenantId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    count: logHashes.length,
    chain: logHashes,
  }));
}

void AUDITED_ENTITIES_TO_CAPTURE_AFTER;
