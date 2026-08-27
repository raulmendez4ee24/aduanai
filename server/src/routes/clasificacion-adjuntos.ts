/**
 * Adjuntos de una clasificación (Ola 1, Operación 2026-08): ficha técnica,
 * foto, hoja de seguridad. Se guardan como `Document` con `classificationId`
 * (Fase 0), `fileHash` SHA-256 y mime — el mismo modelo/tabla que usa
 * routes/documents.ts, no un almacén aparte. El contenido va en `fileUrl`
 * como data: URI (el modelo lo prevé: "URL pública o data: URI") porque el
 * filesystem del host es efímero; ver SCHEMA REQUERIDO en el reporte para
 * migrar a una columna binaria dedicada.
 *
 *   POST /api/classify/:id/adjuntos              { nombre, mimeType, base64, tipo? }
 *   GET  /api/classify/:id/adjuntos
 *   GET  /api/classify/:id/adjuntos/:docId/archivo   (descarga)
 *
 * Nota de montaje: el body de /api/classify tiene tope 5 MB (index.ts); para
 * archivos de hasta 10 MB el mismo router se monta también bajo
 * /api/documents/clasificacion (tope 50 MB). El cliente usa esa ruta.
 */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';

export const clasificacionAdjuntosRouter = Router();
clasificacionAdjuntosRouter.use(authenticate);

export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;
export const TIPOS_ADJUNTO = ['FICHA_TECNICA', 'FOTO', 'HOJA_SEGURIDAD', 'OTRO'] as const;
const MIMES_PERMITIDOS = /^(application\/pdf|image\/(png|jpeg|jpg|webp|gif)|text\/plain|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/msword|application\/vnd\.ms-excel)$/i;

const SELECT_LISTA = {
  id: true, name: true, type: true, fileName: true, fileSize: true, mimeType: true, fileHash: true, notes: true, createdAt: true,
} as const;

async function clasificacionDelTenant(id: string, tenantId: string) {
  return prisma.classification.findFirst({ where: { id, tenantId }, select: { id: true, clienteId: true } });
}

clasificacionAdjuntosRouter.post('/:id/adjuntos', requirePermission('classifier', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const c = await clasificacionDelTenant(String(req.params.id), req.tenantId!);
    if (!c) return res.status(404).json({ status: 'error', message: 'Clasificación no encontrada.' });

    const { nombre, mimeType, base64, tipo } = (req.body ?? {}) as { nombre?: string; mimeType?: string; base64?: string; tipo?: string };
    if (!nombre || !mimeType || !base64) {
      return res.status(400).json({ status: 'error', message: 'nombre, mimeType y base64 son requeridos.' });
    }
    if (!MIMES_PERMITIDOS.test(mimeType)) {
      return res.status(400).json({ status: 'error', message: 'Tipo de archivo no permitido. Acepta PDF, imágenes (PNG/JPG/WebP), Word, Excel o texto.' });
    }
    const limpio = base64.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(limpio, 'base64');
    if (buf.length === 0) return res.status(400).json({ status: 'error', message: 'El archivo está vacío.' });
    if (buf.length > MAX_ADJUNTO_BYTES) {
      return res.status(413).json({ status: 'error', message: 'El adjunto supera 10 MB.' });
    }
    const tipoNorm = (TIPOS_ADJUNTO as readonly string[]).includes(String(tipo)) ? String(tipo) : 'OTRO';
    const fileHash = createHash('sha256').update(buf).digest('hex');

    // Mismo archivo ya adjunto a esta clasificación → no se duplica.
    const existente = await prisma.document.findFirst({
      where: { tenantId: req.tenantId!, classificationId: c.id, fileHash },
      select: SELECT_LISTA,
    });
    if (existente) return res.json({ status: 'ok', data: existente, duplicado: true });

    const doc = await prisma.document.create({
      data: {
        tenantId: req.tenantId!,
        clienteId: c.clienteId,
        classificationId: c.id,
        name: nombre.slice(0, 200),
        type: tipoNorm,
        docType: tipoNorm,
        status: 'UPLOADED',
        required: false,
        fileName: nombre.slice(0, 200),
        fileSize: buf.length,
        mimeType,
        fileHash,
        fileUrl: `data:${mimeType};base64,${limpio}`,
        notes: `Adjunto de clasificación (${tipoNorm}) subido por ${req.userId}`,
      },
      select: SELECT_LISTA,
    });
    res.status(201).json({ status: 'ok', data: doc, duplicado: false });
  } catch (err) { next(err); }
});

clasificacionAdjuntosRouter.get('/:id/adjuntos', requirePermission('classifier', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const c = await clasificacionDelTenant(String(req.params.id), req.tenantId!);
    if (!c) return res.status(404).json({ status: 'error', message: 'Clasificación no encontrada.' });
    const docs = await prisma.document.findMany({
      where: { tenantId: req.tenantId!, classificationId: c.id },
      orderBy: { createdAt: 'desc' },
      select: SELECT_LISTA,
    });
    res.json({ status: 'ok', data: docs });
  } catch (err) { next(err); }
});

clasificacionAdjuntosRouter.get('/:id/adjuntos/:docId/archivo', requirePermission('classifier', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: String(req.params.docId), tenantId: req.tenantId!, classificationId: String(req.params.id) },
      select: { fileUrl: true, mimeType: true, fileName: true },
    });
    if (!doc || !doc.fileUrl?.startsWith('data:')) return res.status(404).json({ status: 'error', message: 'Adjunto no encontrado.' });
    const coma = doc.fileUrl.indexOf(',');
    const buf = Buffer.from(doc.fileUrl.slice(coma + 1), 'base64');
    res.setHeader('Content-Type', doc.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(doc.fileName ?? 'adjunto').replace(/"/g, '')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});
