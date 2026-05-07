/**
 * Health check enriquecido: verifica DB, latencia, y opcionalmente APIs externas.
 * Devuelve siempre 200 (operativo) o 503 si alguna dependencia crítica está caída.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const healthRouter = Router();

interface CheckResult { ok: boolean; latencyMs?: number; error?: string }

async function checkDB(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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

healthRouter.get('/', async (_req, res) => {
  const [db, anthropic, resend] = await Promise.all([checkDB(), checkAnthropic(), checkResend()]);
  const allCritical = db.ok; // solo DB es crítico para el flag global
  res.status(allCritical ? 200 : 503).json({
    status: allCritical ? 'ok' : 'degraded',
    service: 'aduanai-api',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    nodeVersion: process.version,
    checks: {
      database: db,
      anthropic_api: anthropic,
      resend_email: resend,
    },
  });
});
