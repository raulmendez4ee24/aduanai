import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { regenerateAlerts } from '../services/alert-generator';
import { clienteIdDe, filtroCliente, validarClienteDelTenant } from '../lib/cliente-contexto';
import { requirePermission } from '../middlewares/requirePermission';
import { normalizarAccion, rutaDeAccion } from '../services/alert-acciones';
import { REGLAS_SEVERIDAD } from '../services/alert-severity';
import { armarDigest, enviarDigest, CANALES_DIGEST } from '../services/digest-semanal';
import { estadoWatchdog, correrWatchdogDOF } from '../services/dof-watchdog';

export const alertsRouter = Router();

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// BUG-7 (24-ago-2026): reescribe las frases relativas almacenadas ("vence en
// N días", "expira en N días", "hace N días") contra el daysToDue real del
// momento de servir. Una alerta ya vencida dice "venció hace N días", nunca
// "vence en 1 día" junto a la etiqueta "vencida".
const plural = (n: number) => `${n} día${n === 1 ? '' : 's'}`;
function refrescarTextoRelativo(texto: string, daysToDue: number | null): string {
  if (daysToDue == null) return texto;
  const d = daysToDue;
  return texto
    .replace(/\b(vence|expira) en \d+ d[ií]as?\b/gi, (m, verbo: string) => {
      void m;
      const v = verbo.toLowerCase();
      if (d >= 0) return `${v} en ${plural(d)}`;
      return v === 'expira' ? `expiró hace ${plural(-d)}` : `venció hace ${plural(-d)}`;
    })
    .replace(/\bhace \d+ d[ií]as\b/gi, m => (d < 0 ? `hace ${plural(-d)}` : m));
}

// Listar alertas activas del tenant — ordenadas por severidad y vencimiento
alertsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const includeResolved = req.query.includeResolved === 'true';
    const includeIgnored = req.query.includeIgnored === 'true';
    const where: Record<string, unknown> = { tenantId: req.tenantId!, ...filtroCliente(req) };
    if (!includeResolved) where.resolvedAt = null;
    if (!includeIgnored) where.ignored = false;
    // Filtra snoozed: si snoozedUntil > now, no mostrar
    const now = new Date();
    where.OR = [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }];

    const rows = await prisma.alert.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });

    // Recalcular daysToDue dinámico antes de enviar (para precisión)
    const alerts = rows
      .map(a => {
        const daysToDue = a.dueDate
          ? Math.ceil((a.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        // Operación 2026-08: acción normalizada { type, label, payload } + ruta.
        const accion = normalizarAccion({ type: a.type, suggestedAction: a.suggestedAction, affectedFraction: a.affectedFraction, affectedOperations: a.affectedOperations });
        return {
          ...a,
          suggestedAction: accion ? { ...accion, payload: { ...accion.payload, route: rutaDeAccion(accion) } } : null,
          daysToDue,
          // BUG-7 (24-ago-2026): el texto relativo se recalcula al SERVIR.
          // El almacenado quedó congelado al generarse ("vence en 30 días"
          // para siempre); aquí se reescribe contra la fecha real.
          title: refrescarTextoRelativo(a.title, daysToDue),
          content: refrescarTextoRelativo(a.content, daysToDue),
        };
      })
      .sort((a, b) => {
        const sa = SEVERITY_ORDER[a.severity] ?? 9;
        const sb = SEVERITY_ORDER[b.severity] ?? 9;
        if (sa !== sb) return sa - sb;
        const da = a.daysToDue ?? 9999;
        const db = b.daysToDue ?? 9999;
        return da - db;
      });

    res.json({ status: 'ok', data: alerts });
  } catch (err) {
    next(err);
  }
});

// Marcar alerta como leída — SCOPE por tenant (updateMany + guarda de conteo:
// una alerta de otro tenant no existe para ti → 404, sin revelar existencia).
alertsRouter.patch('/:id/read', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// Marcar todas como leídas
alertsRouter.post('/read-all', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await prisma.alert.updateMany({
      where: { tenantId: req.tenantId!, read: false },
      data: { read: true },
    });

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// Acknowledge / snooze / resolve / ignore — acciones inteligentes
alertsRouter.patch('/:id/acknowledge', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { acknowledged: true, acknowledgedAt: new Date(), read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

alertsRouter.patch('/:id/snooze', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const days = Math.max(1, Math.min(30, Number(req.body?.days) || 7));
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { snoozedUntil: until, read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok', data: { snoozedUntil: until } });
  } catch (err) { next(err); }
});

alertsRouter.patch('/:id/resolve', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { resolvedAt: new Date(), read: true, acknowledged: true, acknowledgedAt: new Date() },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

alertsRouter.patch('/:id/ignore', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { count } = await prisma.alert.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { ignored: true, read: true },
    });
    if (count === 0) return res.status(404).json({ status: 'error', message: 'Alerta no encontrada' });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

// Regenerar alertas inteligentes para el tenant — calcula impacto sobre datos reales
alertsRouter.post('/regenerate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await regenerateAlerts(req.tenantId!, false);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

// Limpiar alertas spam + regenerar inteligentes. Borra las alertas legacy
// (texto plantilla "Revisa el detalle..." sin estimatedImpactMXN ni
// affectedFraction específico) y vuelve a calcular con datos reales del
// tenant. Idempotente: si todas las alertas ya tienen impacto, sólo
// regenera.
alertsRouter.post('/clean-and-regenerate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.tenantId!;
    // Borra alertas SPAM legacy: sin estimatedImpactMXN, sin fingerprint
    // útil, o con content que contenga la plantilla genérica.
    const spamPatterns = [
      'Revisa el detalle en el módulo de Actualizaciones',
      'Revisa el detalle',
    ];
    const orClauses = [
      { estimatedImpactMXN: null, affectedFraction: null, type: { not: 'watch' } } as const,
      ...spamPatterns.map(p => ({ content: { contains: p } } as const)),
    ];
    const deleted = await prisma.alert.deleteMany({
      where: { tenantId, OR: orClauses as unknown as object[] },
    });

    const result = await regenerateAlerts(tenantId, false);
    res.json({
      status: 'ok',
      data: {
        deletedSpam: deleted.count,
        ...result,
      },
    });
  } catch (err) { next(err); }
});

// Contar alertas sin leer
alertsRouter.get('/unread-count', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const count = await prisma.alert.count({
      where: { tenantId: req.tenantId!, read: false },
    });

    res.json({ status: 'ok', data: { count } });
  } catch (err) {
    next(err);
  }
});

// Fracciones monitoreadas — listar
alertsRouter.get('/watched', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        tenantId: req.tenantId!,
        type: 'watch',
      },
      select: { id: true, fractionCodes: true, createdAt: true },
    });

    // Flatten all watched fractions
    const watchedCodes = alerts.flatMap(a => a.fractionCodes);
    const uniqueCodes = [...new Set(watchedCodes)];

    // Get fraction details
    const fractions = await prisma.fraction.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true, codeFormatted: true, description: true, tariffNMF: true },
    });

    res.json({ status: 'ok', data: fractions });
  } catch (err) {
    next(err);
  }
});

// Agregar fracción a monitoreo
alertsRouter.post('/watch', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode } = req.body;
    if (!fractionCode) {
      return res.status(400).json({ status: 'error', message: 'Fracción requerida' });
    }

    // Check if already watching
    const existing = await prisma.alert.findFirst({
      where: {
        tenantId: req.tenantId!,
        type: 'watch',
        fractionCodes: { has: fractionCode },
      },
    });

    if (existing) {
      return res.json({ status: 'ok', message: 'Ya estás monitoreando esta fracción' });
    }

    // Find or create watch alert
    let watchAlert = await prisma.alert.findFirst({
      where: { tenantId: req.tenantId!, type: 'watch' },
    });

    if (watchAlert) {
      await prisma.alert.update({
        where: { id: watchAlert.id },
        data: { fractionCodes: { push: fractionCode } },
      });
    } else {
      await prisma.alert.create({
        data: {
          tenantId: req.tenantId!,
          clienteId: await validarClienteDelTenant(req.tenantId!, clienteIdDe(req)),
          channel: 'IN_APP',
          type: 'watch',
          title: 'Fracciones monitoreadas',
          content: 'Lista de fracciones bajo monitoreo',
          fractionCodes: [fractionCode],
        },
      });
    }

    res.json({ status: 'ok', message: 'Fracción agregada al monitoreo' });
  } catch (err) {
    next(err);
  }
});

// Quitar fracción de monitoreo
alertsRouter.delete('/watch/:code', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const code = String(req.params.code);

    const watchAlert = await prisma.alert.findFirst({
      where: { tenantId: req.tenantId!, type: 'watch' },
    });

    if (watchAlert) {
      const updated = watchAlert.fractionCodes.filter(c => c !== code);
      await prisma.alert.update({
        where: { id: watchAlert.id },
        data: { fractionCodes: updated },
      });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ── OPERACIÓN 2026-08 ── severidad, digest semanal y watchdog DOF ──────────

alertsRouter.get('/severidad/reglas', authenticate, (_req, res) => {
  res.json({ status: 'ok', data: REGLAS_SEVERIDAD });
});

// Revisión C: el preview es el digest de TODO el tenant → mismo guard que
// enviar-ahora, y un usuario restringido por cliente no lo ve (403).
alertsRouter.get('/digest/preview', authenticate, requirePermission('classifier', 'settings'), async (req: AuthRequest, res, next) => {
  try {
    if (Array.isArray(req.clienteIdsPermitidos)) {
      return res.status(403).json({ status: 'error', message: 'El resumen semanal abarca toda la empresa; tu acceso está restringido por cliente' });
    }
    const [digest, tenant] = await Promise.all([
      armarDigest(req.tenantId!),
      prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { digestSemanalCanal: true, digestUltimoEnvioAt: true } }),
    ]);
    res.json({ status: 'ok', data: { digest, canal: tenant?.digestSemanalCanal ?? null, ultimoEnvioAt: tenant?.digestUltimoEnvioAt ?? null, canales: CANALES_DIGEST } });
  } catch (err) { next(err); }
});

// TENANT_ADMIN = feature `settings` (mismo guard que PATCH /settings/empresa).
alertsRouter.post('/digest/enviar-ahora', authenticate, requirePermission('classifier', 'settings'), async (req: AuthRequest, res, next) => {
  try {
    const r = await enviarDigest(req.tenantId!, { forzar: true });
    const { digest: _d, ...resto } = r;
    void _d;
    res.json({ status: 'ok', data: resto });
  } catch (err) { next(err); }
});

alertsRouter.patch('/digest/canal', authenticate, requirePermission('classifier', 'settings'), async (req: AuthRequest, res, next) => {
  try {
    const canal = req.body?.canal ?? null;
    if (canal !== null && !(CANALES_DIGEST as readonly string[]).includes(canal)) {
      return res.status(400).json({ status: 'error', message: `canal inválido (${CANALES_DIGEST.join('|')} o null)` });
    }
    const t = await prisma.tenant.update({ where: { id: req.tenantId! }, data: { digestSemanalCanal: canal }, select: { digestSemanalCanal: true, digestUltimoEnvioAt: true } });
    res.json({ status: 'ok', data: t });
  } catch (err) { next(err); }
});

alertsRouter.get('/watchdog/estado', authenticate, async (_req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await estadoWatchdog() }); } catch (err) { next(err); }
});

// Corrida manual del watchdog para el tenant (misma lógica que el job; red real).
alertsRouter.post('/watchdog/revisar-ahora', authenticate, requirePermission('classifier', 'settings'), async (req: AuthRequest, res, next) => {
  try {
    const r = await correrWatchdogDOF({ tenantIds: [req.tenantId!] });
    res.json({ status: 'ok', data: { decretos: r.decretos.map(d => ({ clave: d.clave, fechaDOF: d.fechaDOF, titulo: d.titulo, url: d.url, fracciones: d.fracciones.length })), alertasCreadas: r.alertasCreadas, alertasExistentes: r.alertasExistentes, fuentesCiegas: r.fuentesCiegas } });
  } catch (err) { next(err); }
});
