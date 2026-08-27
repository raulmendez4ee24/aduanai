/**
 * Candado distribuido para jobs periódicos (Operación 2026-08, revisión).
 * Con >1 réplica cada proceso corría el mismo tick y el patrón
 * findFirst(fingerprint)→create duplicaba alertas/digests. Se usa un
 * advisory lock de Postgres con una clave estable por nombre de job; si otra
 * réplica lo tiene, este tick se salta (no espera).
 *
 * Revisión C: el lock vive DENTRO de una transacción interactiva
 * (pg_try_advisory_xact_lock). Prisma usa un pool: con pg_try_advisory_lock
 * de sesión, la conexión volvía al pool mientras corría `fn`, otra llamada
 * podía caer en la MISMA sesión (el lock es reentrante → dos ticks corrían) y
 * el unlock podía ejecutarse en otra conexión (lock huérfano hasta cerrar la
 * sesión). La transacción fija una conexión y libera el lock al terminar,
 * pase lo que pase. `fn` corre con el cliente global (sus queries usan otras
 * conexiones del pool); la transacción solo sostiene el candado.
 */
import { prisma } from './prisma';
import { logger } from './logger';

/** Tiempo máximo que un job puede sostener el candado (ms). */
const TIMEOUT_JOB_MS = Math.max(60_000, parseInt(process.env.JOB_LOCK_TIMEOUT_MS ?? '', 10) || 2 * 60 * 60_000);

export function claveDe(nombre: string): number {
  let h = 2166136261;
  for (const ch of nombre) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h | 0; // int32 firmado para pg_try_advisory_xact_lock(bigint)
}

export async function conCandadoJob<T>(nombre: string, fn: () => Promise<T>): Promise<T | null> {
  const clave = claveDe(nombre);
  let tomado = false;
  let resultado: T | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const r = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${clave}::bigint) AS ok`;
      if (r[0]?.ok !== true) return; // otra réplica lo tiene: este tick se salta
      tomado = true;
      resultado = await fn();
    }, { maxWait: 5_000, timeout: TIMEOUT_JOB_MS });
  } catch (e) {
    if (tomado) throw e; // el error es de fn (o del cierre tras correr): sube para que el tick lo loguee
    // Sin candado disponible (DB caída, pool saturado): mejor no correr el job que duplicarlo.
    logger.warn(`candado-job: no se pudo tomar el candado de ${nombre}`, { errorMessage: e instanceof Error ? e.message : String(e) });
    return null;
  }
  return tomado ? resultado : null;
}
