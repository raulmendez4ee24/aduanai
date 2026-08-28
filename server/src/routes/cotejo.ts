/**
 * TABLERO DE DEUDA DE COTEJO — API (Operación 2026-08, prioridad 2).
 *
 *   GET  /api/admin/cotejo/estado                 tablero completo (SUPERADMIN)
 *   GET  /api/admin/cotejo/export.xlsx            una hoja por bloque
 *   POST /api/admin/cotejo/alertas                sincroniza alertas de deuda envejecida
 *   GET  /api/admin/cotejo/cargadores             catálogo de plantillas
 *   GET  /api/admin/cotejo/cargadores/:tipo/plantilla.xlsx
 *   POST /api/admin/cotejo/cargadores/:tipo/importar  { archivoBase64, nombreArchivo?, dryRun? }
 *
 * Todo el router exige SUPERADMIN: el tablero mezcla métricas del catálogo del
 * producto con datos de operación del tenant, y los cargadores escriben en
 * tablas globales.
 */
import { Router, type Response, type NextFunction } from 'express';
import { authenticate, requireRole, type AuthRequest } from '../middlewares/auth';
import { alcanceDe } from '../lib/cliente-contexto';
import { AppError } from '../middlewares/error';
import { logger } from '../lib/logger';
import { estadoDeCotejo, sincronizarAlertasDeDeuda, tableroAXlsx, UMBRAL_ENVEJECIMIENTO_DIAS } from '../services/cotejo-estado';
import { CARGADORES, TIPOS_CARGA, esTipoCarga, importarCarga, plantillaCargaXlsx } from '../services/cotejo-cargadores';

export const cotejoRouter = Router();
cotejoRouter.use(authenticate, requireRole('SUPERADMIN'));

function topDe(req: AuthRequest): number {
  const n = Number(req.query.top);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 200) : 20;
}

async function tableroDe(req: AuthRequest) {
  const tenantId = req.tenantId!;
  return estadoDeCotejo({
    tenantId,
    alcance: alcanceDe(req),
    top: topDe(req),
    incluirDemo: req.query.incluirDemo === '1',
  });
}

// ── GET /estado ──────────────────────────────────────────────────────────────
cotejoRouter.get('/estado', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await tableroDe(req);
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

// ── GET /export.xlsx ─────────────────────────────────────────────────────────
cotejoRouter.get('/export.xlsx', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await tableroDe(req);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="deuda-de-cotejo-${t.generadoAt.slice(0, 10)}.xlsx"`);
    res.send(tableroAXlsx(t));
  } catch (err) { next(err); }
});

// ── POST /alertas ────────────────────────────────────────────────────────────
cotejoRouter.post('/alertas', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await tableroDe(req);
    const r = await sincronizarAlertasDeDeuda(req.tenantId!, t);
    logger.info('[cotejo] alertas de deuda sincronizadas', {
      action: 'cotejo_alertas', metadata: { creadas: r.creadas, actualizadas: r.actualizadas, resueltas: r.resueltas },
    });
    res.json({ status: 'ok', data: { ...r, umbralDias: UMBRAL_ENVEJECIMIENTO_DIAS } });
  } catch (err) { next(err); }
});

// ── Cargadores ───────────────────────────────────────────────────────────────
cotejoRouter.get('/cargadores', (_req: AuthRequest, res: Response) => {
  res.json({ status: 'ok', data: TIPOS_CARGA.map(t => CARGADORES[t]) });
});

cotejoRouter.get('/cargadores/:tipo/plantilla.xlsx', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tipo = String(req.params.tipo);
    if (!esTipoCarga(tipo)) throw new AppError(`Cargador desconocido: ${tipo}`, 404);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-${tipo}.xlsx"`);
    res.send(plantillaCargaXlsx(tipo));
  } catch (err) { next(err); }
});

cotejoRouter.post('/cargadores/:tipo/importar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tipo = String(req.params.tipo);
    if (!esTipoCarga(tipo)) throw new AppError(`Cargador desconocido: ${tipo}`, 404);
    const body = req.body as { archivoBase64?: string; nombreArchivo?: string; dryRun?: boolean };
    if (!body.archivoBase64 || typeof body.archivoBase64 !== 'string') {
      throw new AppError('archivoBase64 es obligatorio (xlsx, csv o json en base64)', 400);
    }
    const r = await importarCarga(tipo, {
      archivoBase64: body.archivoBase64,
      nombreArchivo: typeof body.nombreArchivo === 'string' ? body.nombreArchivo.slice(0, 120) : undefined,
      dryRun: !!body.dryRun,
    });
    logger.info('[cotejo] importación', {
      action: 'cotejo_importar',
      metadata: { tipo, total: r.total, aceptadas: r.aceptadas, rechazadas: r.rechazadas, dryRun: r.dryRun },
    });
    res.json({
      status: 'ok', data: r,
      aviso: r.rechazadas > 0
        ? `${r.rechazadas} fila(s) rechazadas. Este cargador NO guarda filas sin cotejadoPor + fuenteUrl.`
        : null,
    });
  } catch (err) {
    if (err instanceof Error && /leer el archivo|JSON inválido|no tiene hojas|Máximo 2000/.test(err.message)) {
      return next(new AppError(err.message, 400));
    }
    next(err);
  }
});
