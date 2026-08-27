/**
 * Rutas del Clasificador en lote (Ola 1, Operación 2026-08).
 *
 *   POST /api/clasificacion-lote/import            { nombreArchivo, base64 }
 *   GET  /api/clasificacion-lote                   lista de lotes (tenant, ?clienteId=)
 *   GET  /api/clasificacion-lote/plantilla.xlsx
 *   GET  /api/clasificacion-lote/:id               progreso
 *   GET  /api/clasificacion-lote/:id/filas?semaforo=verde|ambar|rojo|pendiente
 *   GET  /api/clasificacion-lote/:id/export.xlsx
 *   POST /api/clasificacion-lote/:id/filas/:filaId/revisar   { fractionCode?, nota? }
 *   POST /api/clasificacion-lote/:id/reanudar      retoma un lote detenido (failed con filas pendientes) o huérfano
 *
 * Permisos: crear lote = classifier.create + features.bulkOperations; el resto
 * classifier.view. Todo scoped por tenantId (lote ajeno → 404).
 */
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { clienteIdDe, enAlcance, filtroCliente, validarClienteDelTenant } from '../lib/cliente-contexto';
import { getUserPermissions, hasPermission } from './../services/permissions';
import {
  importarLote, exportarLoteXlsx, generarPlantillaXlsx, procesarLote, ErrorLote, limpiarFraccion,
  MAX_FILAS_LOTE, UMBRAL_CONFIANZA_ALTA, UMBRAL_CONFIANZA_MEDIA, LOTE_HEARTBEAT_VENCIDO_MS,
} from '../services/clasificacion-lote';

export const clasificacionLoteRouter = Router();

clasificacionLoteRouter.use(authenticate);

const SEMAFOROS = ['verde', 'ambar', 'rojo', 'pendiente'] as const;

function manejarErrorLote(err: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (err instanceof ErrorLote) return res.status(err.statusCode).json({ status: 'error', message: err.message });
  return next(err);
}

// GET /plantilla.xlsx — antes de /:id para que no lo capture.
clasificacionLoteRouter.get('/plantilla.xlsx', (_req, res) => {
  const buf = generarPlantillaXlsx();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-clasificacion-lote.xlsx"');
  res.send(buf);
});

// POST /import
clasificacionLoteRouter.post('/import', requirePermission('classifier', 'create'), requirePermission('classifier', 'bulkOperations'), async (req: AuthRequest, res, next) => {
  try {
    const { nombreArchivo, base64 } = (req.body ?? {}) as { nombreArchivo?: string; base64?: string };
    if (typeof base64 !== 'string' || base64.length === 0) {
      return res.status(400).json({ status: 'error', message: 'base64 requerido (contenido del Excel/CSV).' });
    }
    const nombre = typeof nombreArchivo === 'string' && nombreArchivo.trim() ? nombreArchivo.trim().slice(0, 120) : 'lote.xlsx';
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const r = await importarLote({ tenantId: req.tenantId!, userId: req.userId!, clienteId, nombreArchivo: nombre, base64 });
    res.status(202).json({
      status: 'ok',
      data: { id: r.id, totalFilas: r.totalFilas, omitidas: r.omitidas, columnas: r.columnas, maxFilas: MAX_FILAS_LOTE },
    });
  } catch (err) { manejarErrorLote(err, res, next); }
});

// GET / — lista de lotes del tenant (y cliente activo si viene)
clasificacionLoteRouter.get('/', requirePermission('classifier', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const lotes = await prisma.classificationBatch.findMany({
      where: { tenantId: req.tenantId!, ...filtroCliente(req) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, nombreArchivo: true, totalFilas: true, procesadas: true, verdes: true, ambar: true, rojas: true,
        status: true, errorMsg: true, createdAt: true, startedAt: true, finishedAt: true, clienteId: true, userId: true,
      },
    });
    res.json({ status: 'ok', data: lotes, umbrales: { alta: UMBRAL_CONFIANZA_ALTA, media: UMBRAL_CONFIANZA_MEDIA } });
  } catch (err) { next(err); }
});

// GET /:id — progreso
clasificacionLoteRouter.get('/:id', requirePermission('classifier', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const lote = await prisma.classificationBatch.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      select: {
        id: true, nombreArchivo: true, totalFilas: true, procesadas: true, verdes: true, ambar: true, rojas: true,
        status: true, errorMsg: true, createdAt: true, startedAt: true, finishedAt: true, clienteId: true, userId: true,
      },
    });
    if (!lote || !enAlcance(req, lote.clienteId)) return res.status(404).json({ status: 'error', message: 'Lote no encontrado.' });
    res.json({ status: 'ok', data: { ...lote, pendientes: lote.totalFilas - lote.procesadas } });
  } catch (err) { next(err); }
});

// POST /:id/reanudar — el lote detenido por fallas del proveedor deja sus filas sin
// semáforo; aquí se retoma sin esperar un reinicio. El claim atómico de procesarLote
// decide: un lote vivo en otro proceso (heartbeat fresco) no se toca.
clasificacionLoteRouter.post('/:id/reanudar', requirePermission('classifier', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const lote = await prisma.classificationBatch.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      select: { id: true, status: true, startedAt: true, clienteId: true, _count: { select: { filas: { where: { semaforo: null, revisado: false } } } } },
    });
    if (!lote || !enAlcance(req, lote.clienteId)) return res.status(404).json({ status: 'error', message: 'Lote no encontrado.' });
    const pendientes = lote._count.filas;
    if (lote.status === 'done' || pendientes === 0) return res.status(409).json({ status: 'error', message: 'El lote no tiene filas pendientes.' });
    if (lote.status === 'running' && lote.startedAt && lote.startedAt.getTime() > Date.now() - LOTE_HEARTBEAT_VENCIDO_MS) {
      return res.status(409).json({ status: 'error', message: 'El lote sigue procesándose.' });
    }
    void procesarLote(lote.id).catch(() => {});
    res.json({ status: 'ok', data: { id: lote.id, pendientes } });
  } catch (err) { next(err); }
});

// GET /:id/filas?semaforo=
clasificacionLoteRouter.get('/:id/filas', requirePermission('classifier', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const lote = await prisma.classificationBatch.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId! }, select: { id: true, clienteId: true } });
    if (!lote || !enAlcance(req, lote.clienteId)) return res.status(404).json({ status: 'error', message: 'Lote no encontrado.' });
    const semaforo = typeof req.query.semaforo === 'string' ? req.query.semaforo : '';
    if (semaforo && !(SEMAFOROS as readonly string[]).includes(semaforo)) {
      return res.status(400).json({ status: 'error', message: `semaforo debe ser uno de: ${SEMAFOROS.join(', ')}` });
    }
    const filas = await prisma.classificationBatchRow.findMany({
      where: {
        batchId: lote.id,
        batch: { tenantId: req.tenantId! },
        ...(semaforo === 'pendiente' ? { semaforo: null } : semaforo ? { semaforo } : {}),
      },
      orderBy: { numeroFila: 'asc' },
    });
    res.json({ status: 'ok', data: filas });
  } catch (err) { next(err); }
});

// GET /:id/export.xlsx
clasificacionLoteRouter.get('/:id/export.xlsx', requirePermission('classifier', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const lote = await prisma.classificationBatch.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId! }, select: { clienteId: true } });
    if (!lote || !enAlcance(req, lote.clienteId)) return res.status(404).json({ status: 'error', message: 'Lote no encontrado.' });
    const r = await exportarLoteXlsx(req.tenantId!, String(req.params.id));
    if (!r) return res.status(404).json({ status: 'error', message: 'Lote no encontrado.' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${r.nombre.replace(/"/g, '')}"`);
    res.send(r.buffer);
  } catch (err) { next(err); }
});

// POST /:id/filas/:filaId/revisar — { fractionCode?, nota? }
// Sin fractionCode: marca revisada. Con fractionCode distinto: feedback
// 'incorrect' en la Classification original + Classification nueva con la
// fracción corregida (aprobada si el usuario puede aprobar; si no, pendiente).
clasificacionLoteRouter.post('/:id/filas/:filaId/revisar', requirePermission('classifier', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode: raw, nota } = (req.body ?? {}) as { fractionCode?: string; nota?: string };
    const fila = await prisma.classificationBatchRow.findFirst({
      where: { id: String(req.params.filaId), batchId: String(req.params.id), batch: { tenantId: req.tenantId! } },
    });
    if (!fila) return res.status(404).json({ status: 'error', message: 'Fila no encontrada.' });

    const corregida = limpiarFraccion(typeof raw === 'string' ? raw : '');
    let classificationId = fila.classificationId;
    let fractionCode = fila.fractionCode;

    if (corregida && corregida !== limpiarFraccion(fila.fractionCode)) {
      if (!/^\d{8}$/.test(corregida)) {
        return res.status(400).json({ status: 'error', message: 'La fracción debe tener 8 dígitos (ej. 7318.15.99).' });
      }
      const enCatalogo = await prisma.fraction.findFirst({ where: { code: corregida, active: true }, select: { description: true, nico: true } });
      if (!enCatalogo) {
        return res.status(422).json({ status: 'error', message: `La fracción ${corregida} no existe o no está activa en el catálogo TIGIE cargado.` });
      }
      const original = fila.classificationId
        ? await prisma.classification.findFirst({ where: { id: fila.classificationId, tenantId: req.tenantId! } })
        : null;
      if (original) {
        await prisma.classification.update({
          where: { id: original.id },
          data: { feedback: 'incorrect', feedbackNote: `Corregida en lote a ${corregida}${nota ? ` — ${nota}` : ''}` },
        });
      }
      const perms = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
      const canApprove = hasPermission(perms, 'classifier', 'approve');
      const nueva = await prisma.classification.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.userId!,
          clienteId: original?.clienteId ?? null,
          inputDescription: fila.descripcion,
          inputContext: fila.contexto,
          inputCountryOfOrigin: fila.paisOrigen,
          inputDeclaredValueUSD: fila.valorUSD,
          inputUseCase: fila.usoDestino,
          fractionCode: corregida,
          fractionDescription: enCatalogo.description,
          confidence: 100,
          griApplied: [],
          legalBasis: { origen: 'correccion_humana_lote', loteId: fila.batchId, filaId: fila.id, classificationOriginalId: original?.id ?? null, nota: nota ?? null } as object,
          feedback: 'correct',
          feedbackNote: nota ?? null,
          tigieVersion: original?.tigieVersion ?? null,
          ligieVersion: original?.ligieVersion ?? null,
          status: canApprove ? 'approved' : 'pending_approval',
          approvedAt: canApprove ? new Date() : null,
          approvedById: canApprove ? req.userId! : null,
        },
        select: { id: true },
      });
      classificationId = nueva.id;
      fractionCode = corregida;
    } else if (fila.classificationId && typeof nota === 'string' && nota.trim()) {
      await prisma.classification.updateMany({
        where: { id: fila.classificationId, tenantId: req.tenantId! },
        data: { feedback: 'correct', feedbackNote: nota.trim() },
      });
    }

    const fraccionCatalogo = fila.fraccionCatalogo ? limpiarFraccion(fila.fraccionCatalogo) : null;
    const huboCorreccion = !!corregida && corregida !== limpiarFraccion(fila.fractionCode);
    const contador = (s: string | null) => (s === 'verde' ? 'verdes' : s === 'ambar' ? 'ambar' : s === 'rojo' ? 'rojas' : null);
    const [actualizada] = await prisma.$transaction([
      prisma.classificationBatchRow.update({
        where: { id: fila.id },
        data: {
          revisado: true,
          classificationId,
          fractionCode,
          coincideCatalogo: fraccionCatalogo && fractionCode ? fraccionCatalogo === fractionCode : fila.coincideCatalogo,
          ...(huboCorreccion ? { semaforo: 'verde', error: null, confidence: 100 } : {}),
        },
      }),
      // Una corrección humana deja la fila en verde: los contadores del lote
      // se mueven con ella (si la fila no tenía semáforo, solo suma).
      ...(huboCorreccion && fila.semaforo !== 'verde'
        ? [prisma.classificationBatch.updateMany({
          where: { id: fila.batchId, tenantId: req.tenantId! },
          data: {
            verdes: { increment: 1 },
            ...(contador(fila.semaforo) ? { [contador(fila.semaforo)!]: { decrement: 1 } } : { procesadas: { increment: 1 } }),
          },
        })]
        : []),
    ]);
    res.json({ status: 'ok', data: actualizada });
  } catch (err) { next(err); }
});
