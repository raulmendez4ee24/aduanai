/**
 * Evaluador de umbrales operacionales — corre cada 5 min via setInterval.
 *
 * Dispara email a OPERATIONS_EMAIL si:
 *   - error rate > 10% en últimos 5 min
 *   - latencia promedio > 5000 ms en últimos 5 min
 *   - costo de IA > $50 USD acumulado en el día
 *   - cualquier log CRITICAL en últimos 5 min
 *
 * Deduplicación: registra el último envío de cada tipo en memoria
 * (procesos efímeros aceptan la duplicidad inicial post-restart).
 */

import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/email';
import { logger } from '../lib/logger';

const OPS_EMAIL = process.env.OPERATIONS_EMAIL || 'raul@aduanai.mx';
const FIVE_MIN = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000; // no spamear: max 1 alerta del mismo tipo cada 30 min

const lastSent = new Map<string, number>();

function shouldSend(key: string): boolean {
  const last = lastSent.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return false;
  lastSent.set(key, Date.now());
  return true;
}

async function notify(subject: string, body: string, key: string): Promise<void> {
  if (!shouldSend(key)) return;
  try {
    await sendEmail({
      to: OPS_EMAIL,
      subject: `[ADUANAI Alerta] ${subject}`,
      html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
    });
    logger.warn(`Threshold alert dispatched: ${subject}`, { action: 'threshold_alert', metadata: { key } });
  } catch (err) {
    logger.error('Failed to dispatch threshold alert email', {
      action: 'threshold_alert_email_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      metadata: { key },
    });
  }
}

export async function evaluateThresholds(): Promise<void> {
  const since5 = new Date(Date.now() - FIVE_MIN);
  const dayStart = new Date(Date.now() - DAY_MS);

  // 1) Error rate
  const [requests, errors] = await Promise.all([
    prisma.systemLog.count({ where: { timestamp: { gte: since5 }, statusCode: { not: null } } }),
    prisma.systemLog.count({ where: { timestamp: { gte: since5 }, level: { in: ['ERROR', 'CRITICAL'] } } }),
  ]);
  if (requests >= 20) { // ignorar ventanas con poco tráfico
    const rate = (errors / requests) * 100;
    if (rate > 10) {
      await notify(
        `Error rate ${rate.toFixed(1)}% en últimos 5 min`,
        `Se detectaron ${errors} errores sobre ${requests} requests (${rate.toFixed(1)}%) en los últimos 5 minutos. Investigar en /admin/monitoring/errors.`,
        'error_rate_high',
      );
    }
  }

  // 2) Latencia promedio
  const lat = await prisma.systemLog.aggregate({
    where: { timestamp: { gte: since5 }, latencyMs: { not: null } },
    _avg: { latencyMs: true },
    _count: { _all: true },
  });
  if ((lat._count._all ?? 0) >= 20 && (lat._avg.latencyMs ?? 0) > 5000) {
    await notify(
      `Latencia promedio ${Math.round(lat._avg.latencyMs!)}ms`,
      `La latencia promedio de los últimos 5 minutos es ${Math.round(lat._avg.latencyMs!)} ms (umbral 5000 ms). Posible saturación de DB o LLM upstream.`,
      'latency_high',
    );
  }

  // 3) Costo IA del día
  const aiCost = await prisma.aIUsageLog.aggregate({
    where: { timestamp: { gte: dayStart } },
    _sum: { costUSD: true },
  });
  const dayCost = aiCost._sum.costUSD ?? 0;
  if (dayCost > 50) {
    await notify(
      `Costo IA hoy $${dayCost.toFixed(2)} USD`,
      `El consumo de IA acumulado en las últimas 24 horas alcanzó $${dayCost.toFixed(2)} USD (umbral $50). Revisar /admin/monitoring/ai-costs por modelo y operación.`,
      'ai_cost_high',
    );
  }

  // 4) CRITICAL logs
  const criticals = await prisma.systemLog.findMany({
    where: { timestamp: { gte: since5 }, level: 'CRITICAL' },
    orderBy: { timestamp: 'desc' },
    take: 5,
    select: { errorMessage: true, endpoint: true, requestId: true, timestamp: true },
  });
  if (criticals.length > 0) {
    const list = criticals.map(c => `• ${c.timestamp.toISOString()} ${c.endpoint ?? '?'} — ${c.errorMessage ?? ''} (req ${c.requestId})`).join('\n');
    await notify(
      `${criticals.length} CRITICAL log(s) en últimos 5 min`,
      `Logs CRITICAL detectados:\n${list}`,
      'critical_logs',
    );
  }
}
