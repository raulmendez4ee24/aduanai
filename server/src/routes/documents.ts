/**
 * Routes de Documents — upload batch (base64), CRUD, auto-link, cross-audit, timeline.
 *
 * Body máximo controlado por express.json(limit). Para PDFs grandes podríamos
 * subir el límite o migrar a multer + storage; aceptable para MVP.
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { processUpload, autoLinkToOperation, suggestGroups } from '../services/document-extractor';
import { runCrossAudit } from '../services/cross-audit';

export const documentsRouter = Router();

// POST /api/documents/upload-batch — body: { files: [{ name, mimeType, base64 }] }
documentsRouter.post('/upload-batch', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const files = (req.body?.files ?? []) as Array<{ name?: string; mimeType?: string; base64?: string }>;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ status: 'error', message: 'files[] requerido' });
    }
    if (files.length > 50) {
      return res.status(400).json({ status: 'error', message: 'Máximo 50 archivos por batch' });
    }

    const results: Array<{ index: number; ok: boolean; document?: unknown; cached?: boolean; linked?: boolean; operationId?: string; error?: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.name || !f.mimeType || !f.base64) {
        results.push({ index: i, ok: false, error: 'name, mimeType y base64 son requeridos' });
        continue;
      }
      try {
        const r = await processUpload({
          tenantId: req.tenantId!,
          fileName: f.name,
          mimeType: f.mimeType,
          base64: f.base64,
        });
        // Intentar auto-link a operation
        const link = await autoLinkToOperation(r.document.id);
        results.push({ index: i, ok: true, document: r.document, cached: r.cached, linked: link.linked, operationId: link.operationId });
      } catch (err) {
        results.push({ index: i, ok: false, error: err instanceof Error ? err.message : 'Error procesando' });
      }
    }
    res.json({ status: 'ok', data: { processed: results.length, results } });
  } catch (err) { next(err); }
});

// GET /api/documents — list
documentsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const operationId = req.query.operationId ? String(req.query.operationId) : undefined;
    const docType = req.query.docType ? String(req.query.docType) : undefined;
    const unlinked = req.query.unlinked === 'true';

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (operationId) where.operationId = operationId;
    if (docType) where.docType = docType;
    if (unlinked) where.operationId = null;

    const docs = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { operation: { select: { id: true, reference: true } } },
    });
    res.json({ status: 'ok', data: docs });
  } catch (err) { next(err); }
});

// GET /api/documents/:id
documentsRouter.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { operation: true },
    });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Documento no encontrado' });
    res.json({ status: 'ok', data: doc });
  } catch (err) { next(err); }
});

// PATCH /api/documents/:id — corregir extractedData manualmente
documentsRouter.patch('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Documento no encontrado' });

    const { docType, extractedData, operationId, notes } = req.body as {
      docType?: string; extractedData?: Record<string, unknown>; operationId?: string | null; notes?: string;
    };

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: {
        docType: docType ?? doc.docType,
        extractedData: extractedData
          ? (extractedData as Prisma.InputJsonValue)
          : undefined,
        operationId: operationId !== undefined ? operationId : doc.operationId,
        notes: notes ?? doc.notes,
        verifiedAt: new Date(),
        status: 'VERIFIED',
      },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

// POST /api/documents/:id/link — vincular manualmente a operation
documentsRouter.post('/:id/link', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { operationId } = req.body as { operationId?: string };
    if (!operationId) return res.status(400).json({ status: 'error', message: 'operationId requerido' });

    const doc = await prisma.document.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Documento no encontrado' });

    const op = await prisma.operation.findFirst({ where: { id: operationId, tenantId: req.tenantId! } });
    if (!op) return res.status(404).json({ status: 'error', message: 'Operation no encontrada' });

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { operationId },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

// GET /api/documents/groups/suggest — sugerencias de agrupación
documentsRouter.get('/groups/suggest', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const r = await suggestGroups(req.tenantId!);
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// GET /api/documents/cross-audit/:operationId — corre auditoría cruzada
documentsRouter.get('/cross-audit/:operationId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await runCrossAudit(req.tenantId!, String(req.params.operationId));
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});
