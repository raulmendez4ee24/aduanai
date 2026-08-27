/**
 * Candado distribuido para jobs periódicos (Operación 2026-08, revisión).
 * Con >1 réplica cada proceso corría el mismo tick y el patrón
 * findFirst(fingerprint)→create duplicaba alertas/digests. Se usa
 * pg_try_advisory_lock con una clave estable por nombre de job; si otra
 * réplica lo tiene, este tick se salta (no espera).
 */
import { prisma } from './prisma';
import { logger } from './logger';

function claveDe(nombre: string): number {
  let h = 2166136261;
  for (const ch of nombre) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h | 0; // int32 firmado para pg_try_advisory_lock(bigint)
}

export async function conCandadoJob<T>(nombre: string, fn: () => Promise<T>): Promise<T | null> {
  const clave = claveDe(nombre);
  let tomado = false;
  try {
    const r = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${clave}::bigint) AS ok`;
    tomado = r[0]?.ok === true;
  } catch (e) {
    // Sin candado disponible (p. ej. DB caída): mejor no correr el job que duplicarlo.
    logger.warn(`candado-job: no se pudo tomar el candado de ${nombre}`, { errorMessage: e instanceof Error ? e.message : String(e) });
    return null;
  }
  if (!tomado) return null;
  try {
    return await fn();
  } finally {
    try { await prisma.$queryRaw`SELECT pg_advisory_unlock(${clave}::bigint)`; } catch { /* la conexión se cerró: el lock se libera solo */ }
  }
}
