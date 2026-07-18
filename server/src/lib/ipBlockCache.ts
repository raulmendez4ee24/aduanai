/**
 * Cache defensivo para consultas de IPs bloqueadas.
 *
 * Este módulo no conoce Prisma para que el lookup sea inyectable y se pueda
 * probar sin abrir conexiones a la base de datos.
 */

export const DEFAULT_IPBLOCK_CACHE_TTL_MS = 45_000;
export const DEFAULT_IPBLOCK_DB_TIMEOUT_MS = 800;
export const IPBLOCK_CACHE_MAX_ENTRIES = 10_000;

export interface IPBlockCacheConfig {
  cacheTtlMs: number;
  dbTimeoutMs: number;
  maxEntries: number;
}

export type IPBlockLookup = (ip: string) => Promise<boolean>;
export type IPBlockWarningHandler = (message: string, error: unknown) => void;

export interface IPBlockChecker {
  isBlocked(ip: string): Promise<boolean>;
  invalidate(ip: string): void;
}

interface CacheEntry {
  blocked: boolean;
  expiresAt: number;
}

interface PendingLookup {
  promise: Promise<boolean>;
  token: LookupToken;
}

interface LookupToken {
  invalidated: boolean;
}

class IPBlockLookupTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`La consulta de IP bloqueada excedió ${timeoutMs}ms`);
    this.name = 'IPBlockLookupTimeoutError';
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Configuración pura y testeable; no muta process.env. */
export function buildIPBlockCacheConfig(
  env: NodeJS.ProcessEnv = process.env,
): IPBlockCacheConfig {
  return {
    cacheTtlMs: positiveInteger(env.IPBLOCK_CACHE_TTL_MS, DEFAULT_IPBLOCK_CACHE_TTL_MS),
    dbTimeoutMs: positiveInteger(env.IPBLOCK_DB_TIMEOUT_MS, DEFAULT_IPBLOCK_DB_TIMEOUT_MS),
    maxEntries: IPBLOCK_CACHE_MAX_ENTRIES,
  };
}

function defaultWarningHandler(message: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[ipBlockCache] ${message}: ${reason}`);
}

/**
 * Crea un checker con cache positivo/negativo, timeout y fail-open.
 * `config` permite TTLs cortos en tests; el máximo nunca supera 10,000.
 */
export function createIPBlockChecker(
  lookup: IPBlockLookup,
  config: Partial<IPBlockCacheConfig> = {},
  onWarning: IPBlockWarningHandler = defaultWarningHandler,
): IPBlockChecker {
  const defaults = buildIPBlockCacheConfig();
  const cacheTtlMs = positiveInteger(String(config.cacheTtlMs ?? ''), defaults.cacheTtlMs);
  const dbTimeoutMs = positiveInteger(String(config.dbTimeoutMs ?? ''), defaults.dbTimeoutMs);
  const maxEntries = Math.min(
    IPBLOCK_CACHE_MAX_ENTRIES,
    positiveInteger(String(config.maxEntries ?? ''), defaults.maxEntries),
  );
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, PendingLookup>();
  let lastWarningAt = Number.NEGATIVE_INFINITY;

  const cacheResult = (ip: string, blocked: boolean, now: number): void => {
    if (cache.has(ip)) cache.delete(ip);
    while (cache.size >= maxEntries) {
      const oldestIP = cache.keys().next().value as string | undefined;
      if (oldestIP === undefined) break;
      cache.delete(oldestIP);
    }
    cache.set(ip, { blocked, expiresAt: now + cacheTtlMs });
  };

  const runLookup = async (ip: string, token: LookupToken): Promise<boolean> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const blocked = await Promise.race([
        lookup(ip),
        new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new IPBlockLookupTimeoutError(dbTimeoutMs)),
            dbTimeoutMs,
          );
        }),
      ]);
      if (!token.invalidated) {
        cacheResult(ip, blocked, Date.now());
      }
      return blocked;
    } catch (error) {
      const failedAt = Date.now();
      if (failedAt - lastWarningAt >= cacheTtlMs) {
        lastWarningAt = failedAt;
        try {
          onWarning(
            `Consulta de BlockedIP falló; se permite la IP y se cachea el resultado por ${cacheTtlMs}ms`,
            error,
          );
        } catch {
          // Un logger defectuoso tampoco debe bloquear el request.
        }
      }
      if (!token.invalidated) {
        cacheResult(ip, false, failedAt);
      }
      return false;
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  };

  const isBlocked = async (ip: string): Promise<boolean> => {
    const now = Date.now();
    const cached = cache.get(ip);
    if (cached) {
      if (cached.expiresAt > now) return cached.blocked;
      cache.delete(ip);
    }

    const inFlight = pending.get(ip);
    if (inFlight) return inFlight.promise;

    const token: LookupToken = { invalidated: false };
    const lookupPromise = runLookup(ip, token);
    const pendingLookup: PendingLookup = { promise: lookupPromise, token };
    pending.set(ip, pendingLookup);
    try {
      return await lookupPromise;
    } finally {
      if (pending.get(ip) === pendingLookup) pending.delete(ip);
    }
  };

  return {
    isBlocked,
    invalidate(ip: string): void {
      cache.delete(ip);
      const inFlight = pending.get(ip);
      if (inFlight) inFlight.token.invalidated = true;
      pending.delete(ip);
    },
  };
}
