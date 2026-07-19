/**
 * Health check enriquecido: verifica DB, latencia y opcionalmente APIs externas.
 * Mientras Node pueda responder devuelve HTTP 200: `ok` con DB disponible o
 * `degraded` si falla o expira la consulta a la DB. Railway solo debe reiniciar cuando
 * el proceso no responda; reiniciarlo no corrige una degradación externa de DB/red.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const healthRouter = Router();

interface CheckResult { ok: boolean; latencyMs?: number; error?: string }

type DatabaseQuery = () => Promise<unknown>;

export const DEFAULT_HEALTH_DB_TIMEOUT_MS = 2000;

let degradedSince: string | null = null;

class HealthDBTimeoutError extends Error {}

export function getHealthDBTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.HEALTH_DB_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_HEALTH_DB_TIMEOUT_MS;
}

async function queryDatabase(): Promise<unknown> {
  return prisma.$queryRaw`SELECT 1`;
}

export async function checkDB(
  query: DatabaseQuery = queryDatabase,
  timeoutMs = getHealthDBTimeoutMs(),
): Promise<CheckResult> {
  const t0 = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new HealthDBTimeoutError(`excedió ${timeoutMs} ms`));
      }, timeoutMs);
    });

    await Promise.race([
      Promise.resolve().then(query),
      timeoutPromise,
    ]);

    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: err instanceof HealthDBTimeoutError
        ? `Timeout de base de datos: ${detail}`
        : `Fallo de base de datos: ${detail}`,
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function checkAnthropic(): Promise<CheckResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'ANTHROPIC_API_KEY no configurada' };
  return { ok: true };
}

async function checkResend(): Promise<CheckResult> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY no configurada (opcional)' };
  return { ok: true };
}

export async function buildHealthResponse(
  query: DatabaseQuery = queryDatabase,
  timeoutMs = getHealthDBTimeoutMs(),
) {
  const [db, anthropic, resend] = await Promise.all([
    checkDB(query, timeoutMs),
    checkAnthropic(),
    checkResend(),
  ]);

  if (db.ok) {
    degradedSince = null;
  } else if (degradedSince === null) {
    degradedSince = new Date().toISOString();
  }

  return {
    httpStatus: 200 as const,
    payload: {
      status: db.ok ? 'ok' as const : 'degraded' as const,
      service: 'aduanai-api',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      degradedSince,
      checks: {
        database: db,
        anthropic_api: anthropic,
        resend_email: resend,
      },
    },
  };
}

healthRouter.get('/', async (_req, res) => {
  const response = await buildHealthResponse();
  res.status(response.httpStatus).json(response.payload);
});
