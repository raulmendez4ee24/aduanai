import dotenv from 'dotenv';
dotenv.config();

// Fail-fast: valida la configuración de entorno (incl. JWT_SECRET obligatorio,
// sin fallback) antes de servir. Si falta o es inválida, el proceso termina con
// un mensaje claro y NO sensible en vez de arrancar con un secreto por defecto.
import { assertConfig } from './lib/config';
try {
  assertConfig();
} catch (err) {
  console.error(`[arranque abortado] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

import express from 'express';
import { esOrigenPermitido, parsearOrigenesPermitidos } from './lib/cors-origin';
import cors from 'cors';
import { AppError } from './middlewares/error';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { errorHandler } from './middlewares/error';
import { generalLimiter, classifyLimiter, copilotLimiter, leadsLimiter } from './middlewares/rateLimit';
import { classifyRouter, classifyVerifyRouter } from './routes/classify';
import { quoteRouter } from './routes/quote';
import { copilotRouter } from './routes/copilot';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { whatsappRouter } from './routes/whatsapp';
import { statsRouter } from './routes/stats';
import { alertsRouter } from './routes/alerts';
import { fractionsRouter } from './routes/fractions';
import { operationsRouter } from './routes/operations';
import { prevalidateRouter } from './routes/prevalidate';
import { catalogsRouter } from './routes/catalogs';
import riskRouter from './routes/risk';
import pedimentoReaderRouter from './routes/pedimento-reader';
import { analyticsRouter } from './routes/analytics';
import { inventoryRouter } from './routes/inventory';
import { fiscalRouter } from './routes/fiscal';
import { mveRouter } from './routes/mve';
import { logisticsRouter } from './routes/logistics';
import { updaterRouter } from './routes/updater';
import { leadsRouter } from './routes/leads';
import { adminRouter, processPilotLifecycle } from './routes/admin';
import { knowledgeRouter } from './routes/knowledge';
import { roiRouter } from './routes/roi';
import { auditMiddleware } from './middlewares/audit';
import { auditAdminRouter, auditPublicRouter, auditUserRouter } from './routes/audit';
import { documentsRouter } from './routes/documents';
import { originRouter } from './routes/origin';
import { nomsRouter } from './routes/noms';
import { verifyPublicRouter, dictamenRouter, complianceReportRouter, defensaRouter } from './routes/traceability';
import { precedentsRouter } from './routes/precedents';
import { monitoringRouter, runRetentionPurge } from './routes/monitoring';
import { requestLogger, errorLogger } from './middlewares/logging';
import { logger } from './lib/logger';
import { securityRouter } from './routes/security';
import { rfcRouter } from './routes/rfc';
import { verificationRouter } from './routes/verification';
import { backupsRouter, incidentsAdminRouter } from './routes/backups';
import { demoProfilesRouter } from './routes/demo-profiles';
import { legalDocsRouter } from './routes/legal-docs';
import { antidumpingRouter, antidumpingAdminRouter } from './routes/antidumping';
import { regimesRouter } from './routes/regimes';
import { verifyTimestampPublicRouter, timestampsAdminRouter } from './routes/timestamps';
import { padronesRouter, padronesAdminRouter } from './routes/padrones';
import { legalLibraryRouter } from './routes/legal-docs';
import { settingsRouter } from './routes/settings';
import { glosaRouter, glosaAdminRouter } from './routes/glosa';
import { permissionsRouter } from './routes/permissions';
import { statusRouter } from './routes/status';
import { anexo24Router } from './routes/anexo24'; // ola1/anexo24-real
import { ubicacionesRouter } from './routes/ubicaciones'; // ola1/anexo24-real
import { performBackup, cleanupExpiredBackups } from './services/backup';
import { seedAllTenantsRoles, migrateTenantsWithoutAdmin } from './services/permissions';
// ── OPERACIÓN 2026-08 ── imports nuevos (una línea por módulo)
import { clientesRouter } from './routes/clientes';
import { aprobacionesRouter } from './routes/aprobaciones';
import { catalogoRouter } from './routes/catalogo';
import { backfillAntidumpingDates } from './services/antidumping-backfill';
import { recoverInterruptedClassificationJobs } from './services/classification-job-runner';
// ── OPERACIÓN 2026-08 ── imports nuevos (una línea por módulo)
import { clasificacionLoteRouter } from './routes/clasificacion-lote';
import { clasificacionAdjuntosRouter } from './routes/clasificacion-adjuntos';
import { solicitarDictamenRouter, dictamenesRouter } from './routes/dictamenes';
import { reanudarLotesInterrumpidos } from './services/clasificacion-lote';
import {
  ipBlockGuard, authLimiter, classifierLimiter, quoterLimiter,
  copilotLimiter as copilotLim, leadLimiter, publicLimiter, adminLimiter,
} from './middlewares/rateLimit';
import { prisma } from './lib/prisma';
import { establecerReporteDeIncidentes } from './lib/tenant-guard';
// ── OPERACIÓN 2026-08 ── imports nuevos (una línea por módulo)
import { calendarioRouter } from './routes/calendario';
import { cambioRegimenRouter } from './routes/cambio-regimen';
import { activoFijoRouter } from './routes/activo-fijo';
import { originPortalRouter } from './routes/origin'; // Ola 2 origen-cuotas: portal público de proveedores
import { precedentsAdminRouter } from './routes/precedents-admin'; // ola2/copilot-risk-expedientes

// Incidentes de la guarda de tenant → logger (SystemLog), no solo stdout.
establecerReporteDeIncidentes(inc => {
  void logger.error(inc.mensaje, { endpoint: `${inc.op}:${inc.model}`, errorMessage: inc.mensaje });
});

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc: ["'self'", "https://wa.me"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.set('trust proxy', 1);
app.use(morgan('short'));

// ── Serve client static files (before CORS so module scripts aren't blocked) ──
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// ── CORS (API only) ──
// Same-origin (Origin.host === Host) siempre pasa: el servidor sirve el cliente
// y el servicio responde por varios dominios. CLIENT_URL solo para cross-origin.
const allowedOrigins = parsearOrigenesPermitidos(process.env.CLIENT_URL);
app.use('/api', (req, res, next) => {
  cors({
    origin(origin, callback) {
      if (esOrigenPermitido(origin, req.headers.host, allowedOrigins, req.protocol)) {
        callback(null, true);
      } else {
        callback(new AppError(`Origin ${origin} no permitido por CORS`, 403));
      }
    },
    credentials: true,
  })(req, res, next);
});

// ── Body size limits — default 5MB; rutas que reciben docs en base64 traen su propio limit upstream ──
app.use((req, res, next) => {
  // 50 MB para upload de documentos / PDFs en base64
  if (req.path.startsWith('/api/documents') || req.path.startsWith('/api/operations') || req.path.startsWith('/api/expedientes')) {
    return express.json({ limit: '50mb' })(req, res, next);
  }
  return express.json({ limit: '5mb' })(req, res, next);
});

// ── Request logger (asigna requestId, mide latencia, persiste a SystemLog) ──
app.use(requestLogger);

// ── IP-block guard ANTES de cualquier rate limiter ──
app.use('/api', ipBlockGuard);

// ── General rate limit on all API routes ──
app.use('/api', generalLimiter);

// ── Audit middleware (autoregistra mutaciones autenticadas) ──
app.use('/api', auditMiddleware());

// ── Audit verify público (sin auth) ──
app.use('/verify/audit', auditPublicRouter);

// ── Verify pública de clasificación legacy (sin auth) ──
app.use('/verify/classify', classifyVerifyRouter);

// ── Verify pública genérica por consultHash (sin auth) ──
app.use('/verify/timestamp', verifyTimestampPublicRouter);
app.use('/verify', verifyPublicRouter);

// ── Routes ──
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter); // Has its own per-endpoint limiters
app.use('/api/classify', classifierLimiter, classifyRouter);
app.use('/api/quote', quoterLimiter, quoteRouter);
app.use('/api/copilot', copilotLim, copilotRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/stats', statsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/fractions', fractionsRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/prevalidate', prevalidateRouter);
app.use('/api/catalogs', catalogsRouter);
app.use('/api/risk', riskRouter);
app.use('/api/pedimentos', pedimentoReaderRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/fiscal', fiscalRouter);
app.use('/api/mve', mveRouter);
app.use('/api/logistics', logisticsRouter);
app.use('/api/updater', updaterRouter);
app.use('/api/leads', leadLimiter, leadsRouter);
// NOTA: adminRouter (con requireRole SUPERADMIN global) se monta al FINAL
// para que las subrutas más específicas (/admin/security, /admin/backups,
// /admin/monitoring, etc.) puedan tener guards menos estrictos.
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/roi', roiRouter);
app.use('/api/admin/audit', auditAdminRouter);
app.use('/api/audit', auditUserRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/origin', originRouter);
app.use('/api/noms', nomsRouter);
app.use('/api/classify', dictamenRouter); // GET /:id/dictamen.html
app.use('/api/admin', complianceReportRouter);
app.use('/api/precedents', precedentsRouter);
app.use('/api/admin/monitoring', monitoringRouter);
app.use('/api/admin/security', securityRouter);
app.use('/api/validate', publicLimiter, rfcRouter);
app.use('/api/verification', verificationRouter);
app.use('/api/admin/backups', backupsRouter);
app.use('/api/admin/incidents', incidentsAdminRouter);
app.use('/api/admin/demo', demoProfilesRouter);
app.use('/api/admin/legal-docs', legalDocsRouter);
app.use('/api/antidumping', antidumpingRouter);
app.use('/api/admin/antidumping', antidumpingAdminRouter);
app.use('/api/regimes', regimesRouter);
app.use('/api/admin/timestamps', timestampsAdminRouter);
app.use('/api/padrones', padronesRouter);
app.use('/api/legal-library', legalLibraryRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/padrones', padronesAdminRouter);
app.use('/api/glosa', glosaRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/admin/glosa', glosaAdminRouter);
// Catch-all admin routes (requireRole SUPERADMIN) — debe ir DESPUÉS de
// los subrouters específicos que tienen guards propios.
app.use('/api/admin', adminLimiter, adminRouter);
app.use('/api/status', statusRouter);
// ── OPERACIÓN 2026-08 ── montajes nuevos (una línea por módulo)
app.use('/api/clasificacion-lote', clasificacionLoteRouter);
app.use('/api/classify', clasificacionAdjuntosRouter); // adjuntos ≤ ~3.5 MB (tope 5 MB del body en /api/classify)
app.use('/api/documents/clasificacion', clasificacionAdjuntosRouter); // mismo router bajo el tope de 50 MB (adjuntos hasta 10 MB)
app.use('/api/classify', solicitarDictamenRouter);
app.use('/api/dictamenes', dictamenesRouter);
void reanudarLotesInterrumpidos().catch(() => {}); // lotes que quedaron en vuelo en el proceso anterior
app.use('/api/clientes', clientesRouter);
app.use('/api/aprobaciones', aprobacionesRouter);
app.use('/api/catalogo', catalogoRouter);
app.use('/api/traceability', defensaRouter); // Ola 3 — Defensa (paquete + certificado)
app.use('/api/inventory', anexo24Router); app.use('/api/ubicaciones', ubicacionesRouter); // ola1/anexo24-real
app.use('/api/calendario', calendarioRouter);
app.use('/api/cambio-regimen', cambioRegimenRouter);
app.use('/api/inventory/activo-fijo', activoFijoRouter);
app.use('/api/origin/portal', publicLimiter, originPortalRouter); // Ola 2 origen-cuotas: sin auth, solo por token
app.use('/api/admin/precedents', precedentsAdminRouter); // ola2/copilot-risk-expedientes

// ── SPA fallback ──
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ── Error handler con logging estructurado ──
app.use(errorLogger);
app.use(errorHandler);

/**
 * Arma un timer in-process con nombre identificable: loguea el armado una vez
 * y garantiza que ninguna excepción (síncrona o asíncrona) del tick escape y
 * tumbe el proceso. Los ticks conservan sus try/catch internos; esto es el
 * backstop de última línea.
 */
function armTimer(name: string, intervalMs: number, tick: () => Promise<void> | void): void {
  logger.info(`[timer] ${name} armado — cada ${Math.round(intervalMs / 60000)} min`, {
    action: 'timer_armed',
    metadata: { name, intervalMs },
  });
  setInterval(() => {
    void (async () => {
      try {
        await tick();
      } catch (err) {
        logger.error(`[timer] ${name} falló`, {
          action: 'timer_failed',
          metadata: { name },
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, intervalMs);
}

// ── Cleanup expired blacklisted tokens every hour ──
armTimer('token_blacklist_cleanup', 3600000, async () => {
  await prisma.tokenBlacklist.deleteMany({ where: { expiresAt: { lt: new Date() } } });
});

// ── Process pilot lifecycle (15/25 day emails + 30-day suspend) every 6h ──
armTimer('pilot_lifecycle', 6 * 3600000, async () => {
  try {
    const result = await processPilotLifecycle();
    if (result.reminded15 || result.reminded25 || result.suspended) {
      console.log(`[pilot-lifecycle] reminded15=${result.reminded15} reminded25=${result.reminded25} suspended=${result.suspended}`);
    }
  } catch (err) {
    logger.error('[timer] pilot_lifecycle falló', {
      action: 'timer_failed',
      metadata: { name: 'pilot_lifecycle' },
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── Retención de logs: purga DEBUG/INFO >30d, WARN/ERROR >90d, CRITICAL >365d ──
armTimer('log_retention_purge', 24 * 3600000, async () => {
  try {
    const r = await runRetentionPurge();
    if (r.debugInfo + r.warnError > 0) {
      logger.info(`Retention purge: ${r.debugInfo} debug/info, ${r.warnError} warn/error`, {
        action: 'retention_purge',
        metadata: r,
      });
    }
  } catch (err) {
    logger.error('Retention purge failed', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
});

// ── Threshold-based alerts: error rate / latencia / costo IA / CRITICAL logs ──
armTimer('threshold_alerts', 5 * 60000, async () => {
  try {
    const { evaluateThresholds } = await import('./services/threshold-alerts');
    await evaluateThresholds();
  } catch (err) {
    logger.error('Threshold evaluation failed', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
}); // cada 5 minutos

// ── Backups: daily 03:00 UTC, weekly domingo 04:00, monthly día 1 a 05:00, cleanup 06:00 ──
let _lastBackupRun = '';
armTimer('backup_cron', 30 * 60000, async () => {
  if (process.env.BACKUP_ENABLED !== 'true') return;
  const now = new Date();
  const hourUTC = now.getUTCHours();
  const dayOfWeek = now.getUTCDay(); // 0=domingo
  const dayOfMonth = now.getUTCDate();
  const tag = `${now.toISOString().slice(0, 10)}-${hourUTC}`;
  if (tag === _lastBackupRun) return;

  try {
    if (hourUTC === 3) { _lastBackupRun = tag; await performBackup('daily', 'cron'); }
    if (hourUTC === 4 && dayOfWeek === 0) { _lastBackupRun = tag; await performBackup('weekly', 'cron'); }
    if (hourUTC === 5 && dayOfMonth === 1) { _lastBackupRun = tag; await performBackup('monthly', 'cron'); }
    if (hourUTC === 6) { _lastBackupRun = tag; await cleanupExpiredBackups(); }
  } catch (err) {
    logger.critical('Backup cron failed', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
}); // chequea cada 30 min

// ── OpenTimestamps: cron horario para upgradear proofs pendientes ──
armTimer('ots_pending_proofs', 60 * 60000, async () => {
  try {
    const { checkPendingTimestamps } = await import('./services/timestamp');
    const r = await checkPendingTimestamps();
    if (r.confirmed > 0 || r.reSubmitted > 0) {
      logger.info(`OTS check: ${r.confirmed} confirmados, ${r.reSubmitted} re-submitted (${r.checked} revisados)`, {
        action: 'ots_cron', metadata: r,
      });
    }
  } catch (err) {
    logger.error('OTS cron failed', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
}); // cada hora

// ── Verificaciones expiradas (diario) + notificación 30 días antes (semanal) ──
armTimer('verification_expiry', 24 * 3600000, async () => {
  try {
    const { markExpiredVerifications, notifyExpiringPatentes } = await import('./services/verification');
    await markExpiredVerifications();
    if (new Date().getDay() === 1) await notifyExpiringPatentes(); // lunes
  } catch (err) {
    logger.error('Verification cron failed', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
});

// ── Alertas inteligentes (diario) — regenera por tenant con datos reales ──
let _lastAlertRun = '';
armTimer('alert_regen', 30 * 60000, async () => {
  const today = new Date().toISOString().slice(0, 10);
  if (_lastAlertRun === today) return;
  const hourUTC = new Date().getUTCHours();
  if (hourUTC !== 7) return; // 7am UTC = 1am CST, ventana de poca carga
  try {
    const { regenerateAlerts } = await import('./services/alert-generator');
    const tenants = await prisma.tenant.findMany({ select: { id: true }, where: { status: { in: ['ACTIVE', 'PILOT', 'TRIAL'] } } });
    let totalInserted = 0;
    let totalUpdated = 0;
    for (const t of tenants) {
      const r = await regenerateAlerts(t.id, false).catch(() => null);
      if (r) { totalInserted += r.inserted; totalUpdated += r.updated; }
    }
    _lastAlertRun = today;
    logger.info(`Alert regen: ${tenants.length} tenants → ${totalInserted} new, ${totalUpdated} updated`, {
      action: 'alert_cron', metadata: { tenants: tenants.length, inserted: totalInserted, updated: totalUpdated },
    });
  } catch (err) {
    logger.error('Alert regen cron failed', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
}); // chequea cada 30 min; corre una vez al día a las 7 UTC

// ── TC oficial Banxico FIX (diario) — fuente de verdad para todos los módulos ──
let _lastFxRefresh = '';
armTimer('fx_refresh', 60 * 60000, async () => {
  const today = new Date().toISOString().slice(0, 10);
  if (_lastFxRefresh === today) return;
  try {
    const { refreshOfficialRate } = await import('./services/exchange-rate');
    const r = await refreshOfficialRate();
    if (r) {
      _lastFxRefresh = today;
      logger.info(`Exchange rate refreshed: ${r.rate} (${r.source}) ${r.asOf.toISOString().slice(0, 10)}`, {
        action: 'fx_refresh', metadata: { rate: r.rate, source: r.source, asOf: r.asOf },
      });
    }
  } catch (err) {
    logger.error('Exchange rate refresh failed', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
}); // chequea cada hora; sólo refresca una vez por día

// ── VIGILANTE DE DECRETOS DE TARIFA (P1, aprobado 19-ago-2026) ──
// Vigila la página de reformas de la LIGIE en Diputados y AVISA (SystemLog +
// alerta SUPERADMIN) cuando hay un decreto de tarifa posterior al cotejoDate
// del catálogo. SOLO avisa — jamás aplica cambios (regla dura con test).
let _lastVigilanteTarifa = '';
const VIGILANTE_HORAS = Math.max(1, parseInt(process.env.TARIFA_VIGILANTE_HORAS ?? '24', 10) || 24);
armTimer('tarifa_vigilante', 60 * 60000, async () => {
  const ahora = Date.now();
  const ultima = _lastVigilanteTarifa ? Date.parse(_lastVigilanteTarifa) : 0;
  if (ahora - ultima < VIGILANTE_HORAS * 3600000) return;
  _lastVigilanteTarifa = new Date().toISOString();
  try {
    const { vigilarDecretosTarifa } = await import('./services/tarifa-vigilante');
    const nuevos = await vigilarDecretosTarifa();
    if (nuevos.length > 0) {
      logger.warn(`Vigilante de tarifa: ${nuevos.length} decreto(s) nuevo(s) sin cotejar`, {
        action: 'tarifa_vigilante_resumen', metadata: { fechas: nuevos.map(n => n.fechaDOF) },
      });
    }
  } catch (err) {
    logger.error('Vigilante de tarifa falló', { errorMessage: err instanceof Error ? err.message : String(err) });
  }
}); // chequea cada hora; corre 1 vez por TARIFA_VIGILANTE_HORAS (default 24h)

// ── OPERACIÓN 2026-08 ── timers nuevos (regulatorio / calendario) ──
// Watchdog DOF real: cada 6 h (Diputados + índice DOF → alertas por catálogo del cliente).
let _lastWatchdogDOF = 0;
armTimer('dof_watchdog', 30 * 60000, async () => {
  if (Date.now() - _lastWatchdogDOF < 6 * 3600000) return;
  _lastWatchdogDOF = Date.now();
  const { correrWatchdogDOF } = await import('./services/dof-watchdog');
  await correrWatchdogDOF();
});
// Calendario de obligaciones: diario marca vencidas y crea alertas `ver_obligacion`.
let _lastCalendarioRun = '';
armTimer('calendario_vencimientos', 60 * 60000, async () => {
  const today = new Date().toISOString().slice(0, 10);
  if (_lastCalendarioRun === today) return;
  _lastCalendarioRun = today;
  const { procesarVencimientosTodos } = await import('./services/calendario-obligaciones');
  const r = await procesarVencimientosTodos();
  if (r.vencidas > 0 || r.alertas > 0) logger.info(`Calendario: ${r.tenants} tenants → ${r.vencidas} vencidas, ${r.alertas} alertas`, { action: 'calendario_cron', metadata: r });
});
// Digest semanal: lunes 13:00 UTC (7am CDMX); envía a tenants con canal configurado sin envío en 6 días.
let _lastDigestRun = '';
armTimer('digest_semanal', 30 * 60000, async () => {
  const ahora = new Date();
  const tag = ahora.toISOString().slice(0, 10);
  if (_lastDigestRun === tag || ahora.getUTCDay() !== 1 || ahora.getUTCHours() !== 13) return;
  _lastDigestRun = tag;
  const { enviarDigestsPendientes } = await import('./services/digest-semanal');
  const r = await enviarDigestsPendientes(ahora);
  logger.info(`Digest semanal: ${r.enviados}/${r.tenants} enviados`, { action: 'digest_cron', metadata: r });
});

// Ola 2 origen-cuotas: diario — vencimiento de certificados de proveedores (60/30/7) y regla de elusión por cliente.
let _lastOrigenCuotasRun = '';
armTimer('origen_cuotas_diario', 60 * 60000, async () => {
  const today = new Date().toISOString().slice(0, 10);
  if (_lastOrigenCuotasRun === today) return;
  _lastOrigenCuotasRun = today;
  const { procesarVencimientosCertificadosTodos } = await import('./services/origin-proveedores');
  const { detectarElusionTodos } = await import('./services/antidumping-elusion');
  const c = await procesarVencimientosCertificadosTodos();
  const e = await detectarElusionTodos();
  if (c.alertas > 0 || e.alertas > 0) logger.info(`Origen/cuotas: ${c.vencidos} certificados vencidos, ${c.alertas} alertas de vigencia, ${e.alertas} alertas de elusión`, { action: 'origen_cuotas_cron', metadata: { ...c, elusion: e } });
});

app.listen(PORT, () => {
  console.log(`🚀 ADUANAI server running on port ${PORT}`);
});

// Idempotent: garantiza que cada tenant tenga los 6 roles del sistema sembrados
// y que cada uno tenga al menos un TENANT_ADMIN explícito (migración una-sola-vez).
void (async () => {
  // Trys separados: un fallo en un paso de arranque no debe abortar los demás.
  try {
    const r = await seedAllTenantsRoles();
    logger.info(`[permissions] Seeded roles for ${r.tenants} tenants — ${r.created} created, ${r.updated} updated`, {
      action: 'seed_tenant_roles', metadata: r,
    });
  } catch (err) {
    logger.error('[permissions] seedAllTenantsRoles failed', {
      action: 'seed_tenant_roles_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    const m = await migrateTenantsWithoutAdmin();
    if (m.migrated > 0 || m.skippedExisting === 0) {
      logger.info(`[permissions] TENANT_ADMIN migration: ${m.migrated} migrated, ${m.skippedExisting} already had, ${m.skippedNoUser} skipped (no eligible user)`, {
        action: 'migrate_tenant_admin', metadata: m,
      });
    }
  } catch (err) {
    logger.error('[permissions] migrateTenantsWithoutAdmin failed', {
      action: 'migrate_tenant_admin_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    const bf = await backfillAntidumpingDates();
    if (bf.updated > 0) {
      logger.info(`[antidumping] Backfill UPCI dates: ${bf.updated}/${bf.total} registros actualizados`, {
        action: 'backfill_antidumping_dates', metadata: bf,
      });
    }
  } catch (err) {
    logger.error('[antidumping] backfillAntidumpingDates failed', {
      action: 'backfill_antidumping_dates_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  // BUG-12 (re-verificación 24-ago): origin_rules estaba VACÍA en prod — el
  // seed solo corría con db:seed local y ningún deploy lo ejecutaba, así que
  // Origen T-MEC decía "Sin regla específica" para TODA fracción. Siembra
  // SOLO si la tabla está vacía (el seed hace deleteMany+create; con tabla
  // poblada no se toca — actualizaciones deliberadas van por ssh/seed).
  try {
    const originRulesCount = await prisma.originRule.count();
    // Marcador de versión del seed: la regla del grupo 8544.11-8544.60 solo
    // existe desde el seed del 24-ago — una tabla poblada SIN ella viene de un
    // seed anterior y se re-siembra (el seed es atómico y solo contiene datos
    // de catálogo propios del seed, nunca datos de usuario).
    const tieneAnexo4B8544 = originRulesCount > 0
      ? await prisma.originRule.count({ where: { fractionCode: '854430', agreement: 'TMEC', active: true } })
      : 0;
    if (originRulesCount === 0 || tieneAnexo4B8544 === 0) {
      const { seedOriginRules } = await import('./lib/origin-rules-data');
      const r = await seedOriginRules(prisma);
      logger.info(`[origin] origin_rules ${originRulesCount === 0 ? 'vacía' : 'de seed anterior'} — sembradas ${r.inserted} reglas`, {
        action: 'origin_rules_seeded_on_boot', metadata: r,
      });
    }
  } catch (err) {
    logger.error('[origin] seed de origin_rules al arranque falló', {
      action: 'origin_rules_seed_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  // Clasificación asíncrona (BUG-1/BUG-2): los jobs que quedaron en vuelo
  // pertenecen al proceso anterior (deploy/reinicio) — se marcan interrumpidos
  // para que la UI muestre el error honesto con reintento, no un spinner eterno.
  try {
    const interrupted = await recoverInterruptedClassificationJobs();
    if (interrupted > 0) {
      logger.warn(`[classify-jobs] ${interrupted} job(s) interrumpidos por reinicio`, {
        action: 'classification_jobs_interrupted', metadata: { interrupted },
      });
    }
  } catch (err) {
    logger.error('[classify-jobs] recoverInterruptedClassificationJobs failed', {
      action: 'classification_jobs_recover_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
})();

export default app;
