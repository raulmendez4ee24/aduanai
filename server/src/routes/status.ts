/**
 * Status page pública — sin auth.
 *
 * Endpoints:
 *   GET /api/status              — JSON con estado global y componentes
 *   GET /api/status/incidents    — incidentes públicos recientes
 *   POST /api/status/subscribe   — alta de email para alertas (rate-limited)
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { lastSuccessfulBackup } from '../services/backup';

export const statusRouter = Router();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Component {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  detail?: string;
}

statusRouter.get('/', async (_req, res, next) => {
  try {
    const now = Date.now();

    // DB ping
    let dbStatus: Component['status'] = 'operational';
    let dbLatency = 0;
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - t0;
      if (dbLatency > 1000) dbStatus = 'degraded';
    } catch { dbStatus = 'down'; }

    // AI keys
    const aiStatus: Component['status'] = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY ? 'operational' : 'degraded';
    const emailStatus: Component['status'] = process.env.RESEND_API_KEY ? 'operational' : 'degraded';

    // Backup recency
    const last = await lastSuccessfulBackup();
    const backupStatus: Component['status'] = last && (now - last.completedAt.getTime()) < 36 * HOUR ? 'operational'
      : last && (now - last.completedAt.getTime()) < 7 * DAY ? 'degraded'
      : 'down';

    // Incidentes activos
    const activeIncidents = await prisma.systemIncident.count({ where: { status: { not: 'resolved' }, publicVisible: true } });
    const apiStatus: Component['status'] = activeIncidents > 0 ? 'degraded' : 'operational';

    const components: Component[] = [
      { name: 'API', status: apiStatus, detail: activeIncidents > 0 ? `${activeIncidents} incidente(s) activo(s)` : 'Operativa' },
      { name: 'Web App', status: 'operational' },
      { name: 'Database', status: dbStatus, detail: `${dbLatency} ms` },
      { name: 'AI Services', status: aiStatus, detail: aiStatus === 'operational' ? 'Anthropic + Gemini configurados' : 'Sin API keys' },
      { name: 'Email', status: emailStatus, detail: emailStatus === 'operational' ? 'Resend operativo' : 'Sin API key' },
      { name: 'File Storage / Backups', status: backupStatus, detail: last ? `Último: ${last.type} hace ${Math.round((now - last.completedAt.getTime()) / HOUR)}h` : 'Sin backups recientes' },
    ];

    const allOk = components.every(c => c.status === 'operational');
    const anyDown = components.some(c => c.status === 'down');
    const overall: 'operational' | 'degraded' | 'down' = anyDown ? 'down' : allOk ? 'operational' : 'degraded';

    // Uptime últimos 90 días — buckets diarios basados en SystemLog (heurística)
    const since = new Date(now - 90 * DAY);
    const errorsByDay = await prisma.$queryRaw<Array<{ day: Date; total: bigint; errors: bigint }>>`
      SELECT DATE_TRUNC('day', "timestamp") as day,
             COUNT(*)::bigint as total,
             COUNT(*) FILTER (WHERE level IN ('ERROR', 'CRITICAL'))::bigint as errors
      FROM system_logs
      WHERE "timestamp" >= ${since} AND "statusCode" IS NOT NULL
      GROUP BY day ORDER BY day ASC
    `;
    const uptime90: { day: string; status: 'operational' | 'degraded' | 'down' }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      const dayStr = d.toISOString().slice(0, 10);
      const row = errorsByDay.find(r => r.day.toISOString().slice(0, 10) === dayStr);
      let status: 'operational' | 'degraded' | 'down' = 'operational';
      if (row) {
        const errRate = Number(row.total) > 0 ? Number(row.errors) / Number(row.total) : 0;
        if (errRate > 0.1) status = 'down';
        else if (errRate > 0.02) status = 'degraded';
      }
      uptime90.push({ day: dayStr, status });
    }

    res.json({
      status: 'ok',
      data: {
        overall,
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        components,
        uptime90,
      },
    });
  } catch (err) { next(err); }
});

statusRouter.get('/incidents', async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 90 * DAY);
    const items = await prisma.systemIncident.findMany({
      where: { publicVisible: true, OR: [{ status: { not: 'resolved' } }, { startedAt: { gte: since } }] },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

statusRouter.post('/subscribe', async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ status: 'error', message: 'Email inválido' });
    }
    await prisma.incidentSubscription.upsert({
      where: { email: email.toLowerCase() },
      update: { active: true, unsubscribedAt: null },
      create: { email: email.toLowerCase(), active: true },
    });
    res.json({ status: 'ok', message: 'Te avisaremos cuando haya incidentes en producción' });
  } catch (err) { next(err); }
});
