import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { getRequiredDocuments, calculateCompleteness, getMissingDocuments } from '../services/expediente';
import { clienteIdDe, filtroCliente, validarClienteDelTenant, whereConAlcance } from '../lib/cliente-contexto';
import crypto from 'crypto';
import { extractDocument } from '../services/document-extractor';
import { recordAudit } from '../services/audit-service';
import { glosarOperacion, TOLERANCIAS_DEFAULT, type ToleranciasGlosa } from '../services/glosa-documental';
import {
  construirChecklist, calcularRetencionHasta, construirPaqueteAuditoria, PaqueteDemasiadoGrandeError, FUNDAMENTO_RETENCION, RETENCION_ANIOS,
  type ChecklistExpediente,
} from '../services/expediente-electronico';

export const operationsRouter = Router();

// Crear operación
operationsRouter.post('/', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { reference, type, description, fractionCode, origin, destination, customsValue, currency, customsBroker, operationDate } = req.body;

    if (!reference) {
      return res.status(400).json({ status: 'error', message: 'Referencia requerida' });
    }

    const opType = type || 'IMPORT';

    // Crear operación con documentos requeridos
    const requiredDocs = getRequiredDocuments(opType);

    const operation = await prisma.operation.create({
      data: {
        reference,
        type: opType,
        description,
        fractionCode,
        origin,
        destination,
        customsValue: customsValue ? Number(customsValue) : null,
        currency: currency || 'USD',
        customsBroker,
        operationDate: operationDate ? new Date(operationDate) : null,
        tenantId: req.tenantId!,
        clienteId: await validarClienteDelTenant(req.tenantId!, clienteIdDe(req)),
        userId: req.userId!,
        documents: {
          create: requiredDocs.map(doc => ({
            name: doc.name,
            type: doc.type,
            required: doc.required,
            status: 'PENDING',
          })),
        },
      },
      include: { documents: true },
    });

    res.status(201).json({ status: 'ok', data: operation });
  } catch (err) {
    next(err);
  }
});

// Listar operaciones
operationsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const status = String(req.query.status || '');

    const where: Record<string, unknown> = { tenantId: req.tenantId!, ...filtroCliente(req) };
    if (status && ['DRAFT', 'IN_PROGRESS', 'COMPLETE', 'ARCHIVED'].includes(status)) {
      where.status = status;
    }

    // Parte B: listado paginado (take ≤ 100 + cursor) y SIN documentos anidados
    // por fila: solo conteos agregados (el detalle GET /:id sí trae documentos).
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const operations = await prisma.operation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, tenantId: true, userId: true, clienteId: true, pedimentoId: true, reference: true, type: true, status: true,
        fractionCode: true, origin: true, customsValue: true, currency: true, operationDate: true, retencionHasta: true,
        completeness: true, checklist: true, glosaDocumental: true, createdAt: true, updatedAt: true,
        _count: { select: { documents: true } },
      },
    });
    const hayMas = operations.length > limit;
    const pagina = hayMas ? operations.slice(0, limit) : operations;
    // Conteos de slots requeridos/listos con UN groupBy para la página (antes: N filas × documentos completos).
    const grupos = pagina.length
      ? await prisma.document.groupBy({ by: ['operationId', 'required', 'status'], where: { operationId: { in: pagina.map(o => o.id) } }, _count: { _all: true } })
      : [];
    const conteos = new Map<string, { requeridos: number; requeridosListos: number }>();
    for (const g of grupos) {
      if (!g.operationId) continue;
      const c = conteos.get(g.operationId) ?? { requeridos: 0, requeridosListos: 0 };
      if (g.required) { c.requeridos += g._count._all; if (g.status !== 'PENDING') c.requeridosListos += g._count._all; }
      conteos.set(g.operationId, c);
    }
    res.json({
      status: 'ok',
      data: pagina.map(({ _count, ...o }) => ({
        ...o,
        documentos: { total: _count.documents, ...(conteos.get(o.id) ?? { requeridos: 0, requeridosListos: 0 }) },
        glosaDocumental: o.glosaDocumental ? { consistente: (o.glosaDocumental as { consistente?: boolean }).consistente ?? null, errores: (o.glosaDocumental as { errores?: number }).errores ?? 0 } : null,
      })),
      paginacion: { limit, siguienteCursor: hayMas ? pagina[pagina.length - 1]!.id : null },
    });
  } catch (err) {
    next(err);
  }
});

// Detalle de operación
operationsRouter.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);

    const operation = await prisma.operation.findFirst({
      where: whereConAlcance(req, { id, tenantId: req.tenantId! }),
      include: {
        documents: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!operation) {
      return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    }

    // Calcular completeness y documentos faltantes
    const missing = getMissingDocuments(operation.type, operation.documents);
    const completeness = calculateCompleteness(
      getRequiredDocuments(operation.type),
      operation.documents
    );

    // Ola 2: checklist 59-V/162-VII calculado en vivo (lo persistido guarda "no aplica").
    const noAplica = ((operation.checklist as ChecklistExpediente | null)?.noAplica) ?? [];
    const checklist = construirChecklist(operation.type, operation.documents.map(d => ({ id: d.id, name: d.name, type: d.type, docType: d.docType, status: d.status })), noAplica);

    res.json({
      status: 'ok',
      data: {
        ...operation,
        documents: operation.documents.map(d => ({ ...d, fileUrl: d.fileUrl ? `[${d.fileUrl.length} bytes]` : null })), // no volcar base64 en el listado
        completeness,
        missingDocuments: missing,
        checklist,
        retencion: { hasta: operation.retencionHasta, anios: RETENCION_ANIOS, fundamento: FUNDAMENTO_RETENCION },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Ola 2 — expediente electrónico ──────────────────────────────────────

// Revisión C: por {id, tenantId} Y alcance de cliente del usuario (whereConAlcance).
async function operacionDelTenant(req: AuthRequest, tenantId: string, id: string) {
  return prisma.operation.findFirst({ where: whereConAlcance(req, { id, tenantId }), include: { documents: { orderBy: { createdAt: 'asc' } } } });
}

async function recalcularYPersistir(tenantId: string, opId: string, opType: string, noAplica: string[]) {
  const docs = await prisma.document.findMany({ where: { operationId: opId, tenantId } });
  const checklist = construirChecklist(opType, docs.map(d => ({ id: d.id, name: d.name, type: d.type, docType: d.docType, status: d.status })), noAplica);
  const completeness = calculateCompleteness(getRequiredDocuments(opType), docs);
  await prisma.operation.update({
    where: { id: opId },
    data: {
      completeness,
      status: completeness === 100 ? 'COMPLETE' : completeness > 0 ? 'IN_PROGRESS' : 'DRAFT',
      checklist: JSON.parse(JSON.stringify(checklist)),
    },
  });
  return { checklist, completeness };
}

// POST /:id/checklist — recalcula y persiste; body { noAplica?: string[] } (ids de incisos condicionales)
operationsRouter.post('/:id/checklist', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const op = await operacionDelTenant(req, req.tenantId!, String(req.params.id));
    if (!op) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    const body = (req.body ?? {}) as { noAplica?: unknown };
    const previo = ((op.checklist as ChecklistExpediente | null)?.noAplica) ?? [];
    const noAplica = Array.isArray(body.noAplica) ? body.noAplica.filter((x): x is string => typeof x === 'string').slice(0, 20) : previo;
    const r = await recalcularYPersistir(req.tenantId!, op.id, op.type, noAplica);
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// POST /:id/documentos — sube un documento al expediente (base64). Si `type`
// coincide con un slot PENDING, lo llena; si no, crea uno nuevo. `extraer`
// (default true) corre la extracción IA para poblar datos y la glosa.
operationsRouter.post('/:id/documentos', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const op = await operacionDelTenant(req, req.tenantId!, String(req.params.id));
    if (!op) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    const body = (req.body ?? {}) as { fileName?: string; mimeType?: string; base64?: string; type?: string; extraer?: boolean; nombre?: string };
    if (!body.fileName || !body.mimeType || !body.base64) return res.status(400).json({ status: 'error', message: 'fileName, mimeType y base64 requeridos' });
    const buf = Buffer.from(body.base64, 'base64');
    if (buf.length === 0) return res.status(400).json({ status: 'error', message: 'Archivo vacío' });
    if (buf.length > 20 * 1024 * 1024) return res.status(413).json({ status: 'error', message: 'Documento máximo 20 MB' });
    const fileHash = crypto.createHash('sha256').update(buf).digest('hex');

    let extraccion: Awaited<ReturnType<typeof extractDocument>> | null = null;
    let errorExtraccion: string | null = null;
    if (body.extraer !== false) {
      try { extraccion = await extractDocument({ fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 }); }
      catch (e) { errorExtraccion = e instanceof Error ? e.message : 'extracción falló'; }
    }
    const slot = body.type ? op.documents.find(d => d.type === body.type && d.status === 'PENDING') : undefined;
    const data = {
      fileName: body.fileName, fileSize: buf.length, mimeType: body.mimeType, fileHash,
      fileUrl: buf.length <= 8 * 1024 * 1024 ? `data:${body.mimeType};base64,${body.base64}` : null,
      status: 'UPLOADED' as const,
      docType: extraccion?.docType ?? null, confidence: extraccion?.confidence ?? null,
      extractedData: extraccion ? (extraccion.fields as object) : undefined,
      rawText: extraccion?.rawText ?? null,
      aiErrors: extraccion && extraccion.errors.length > 0 ? (extraccion.errors as object) : undefined,
      processedAt: extraccion ? new Date() : null,
      notes: errorExtraccion ? `Extracción IA no disponible: ${errorExtraccion}` : undefined,
    };
    const doc = slot
      ? await prisma.document.update({ where: { id: slot.id }, data })
      : await prisma.document.create({
          data: {
            ...data, tenantId: req.tenantId!, clienteId: op.clienteId, operationId: op.id,
            name: body.nombre?.trim() || body.fileName, type: body.type || extraccion?.docType || 'otro', required: false,
          },
        });
    const noAplica = ((op.checklist as ChecklistExpediente | null)?.noAplica) ?? [];
    const r = await recalcularYPersistir(req.tenantId!, op.id, op.type, noAplica);
    await recordAudit({
      tenantId: req.tenantId!, userId: req.userId!, action: 'expediente.documento', entity: 'Operation', entityId: op.id,
      endpoint: req.originalUrl, method: req.method, metadata: { documentId: doc.id, fileHash, type: doc.type, docType: doc.docType, slot: !!slot },
    });
    res.status(slot ? 200 : 201).json({ status: 'ok', data: { document: { ...doc, fileUrl: null }, ...r, extraccion: extraccion ? { docType: extraccion.docType, confidence: extraccion.confidence, errores: extraccion.errors } : null, errorExtraccion } });
  } catch (err) { next(err); }
});

// POST /:id/glosa — glosa documental automática (factura vs pedimento vs BL vs packing) con tolerancias explícitas.
operationsRouter.post('/:id/glosa', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const op = await prisma.operation.findFirst({ where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }), select: { id: true, reference: true } });
    if (!op) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    const body = (req.body ?? {}) as { tolerancias?: Partial<ToleranciasGlosa> };
    const tol: Partial<ToleranciasGlosa> = {};
    for (const k of Object.keys(TOLERANCIAS_DEFAULT) as (keyof ToleranciasGlosa)[]) {
      const v = body.tolerancias?.[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000) tol[k] = v;
    }
    const resultado = await glosarOperacion(req.tenantId!, op.id, tol);
    await prisma.operation.update({ where: { id: op.id }, data: { glosaDocumental: JSON.parse(JSON.stringify(resultado)) } });
    await recordAudit({
      tenantId: req.tenantId!, userId: req.userId!, action: 'expediente.glosa_documental', entity: 'Operation', entityId: op.id,
      endpoint: req.originalUrl, method: req.method,
      metadata: { errores: resultado.errores, advertencias: resultado.advertencias, cruces: resultado.cruces, consistente: resultado.consistente, tolerancias: resultado.tolerancias },
    });
    res.json({ status: 'ok', data: resultado });
  } catch (err) { next(err); }
});

// POST /:id/retencion — fija retencionHasta (fecha operación + 5 años) y crea el aviso en el calendario (tipo OTRA).
operationsRouter.post('/:id/retencion', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const op = await prisma.operation.findFirst({ where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }) });
    if (!op) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    const body = (req.body ?? {}) as { fechaOperacion?: string };
    const base = body.fechaOperacion ? new Date(body.fechaOperacion) : (op.operationDate ?? op.createdAt);
    if (isNaN(base.getTime())) return res.status(400).json({ status: 'error', message: 'fechaOperacion inválida' });
    const hasta = calcularRetencionHasta(base);
    await prisma.operation.update({ where: { id: op.id }, data: { retencionHasta: hasta, ...(body.fechaOperacion && !op.operationDate ? { operationDate: base } : {}) } });
    const titulo = `Fin de retención del expediente ${op.reference}`;
    const existente = await prisma.obligacionCalendario.findFirst({ where: { tenantId: req.tenantId!, tipo: 'OTRA', titulo }, select: { id: true } });
    const datos = {
      tenantId: req.tenantId!, clienteId: op.clienteId, tipo: 'OTRA', titulo,
      descripcion: `El expediente 59-V/162-VII de la operación ${op.reference} debe conservarse hasta esta fecha (${RETENCION_ANIOS} años desde la operación). Antes de destruir, verifica facultades de comprobación abiertas.`,
      fundamento: `${FUNDAMENTO_RETENCION.articulo} — pendiente de cotejo en el corpus`,
      fechaLimite: hasta, recurrencia: 'UNICA', estado: 'pendiente',
      consecuencia: 'Sin expediente ante una revisión: imposibilidad de acreditar la operación (LA 59-V) y responsabilidad del agente (LA 162-VII).',
    };
    const obligacion = existente
      ? await prisma.obligacionCalendario.update({ where: { id: existente.id }, data: datos })
      : await prisma.obligacionCalendario.create({ data: datos });
    await recordAudit({
      tenantId: req.tenantId!, userId: req.userId!, action: 'expediente.retencion', entity: 'Operation', entityId: op.id,
      before: { retencionHasta: op.retencionHasta }, after: { retencionHasta: hasta },
      endpoint: req.originalUrl, method: req.method, metadata: { obligacionId: obligacion.id, fundamento: FUNDAMENTO_RETENCION.articulo, cotejo: FUNDAMENTO_RETENCION.cotejo },
    });
    res.json({ status: 'ok', data: { retencionHasta: hasta, fundamento: FUNDAMENTO_RETENCION, obligacionId: obligacion.id } });
  } catch (err) { next(err); }
});

// POST /:id/vincular-pedimento — enlaza el Pedimento importado (M3/Data Stage) al expediente.
operationsRouter.post('/:id/vincular-pedimento', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const op = await prisma.operation.findFirst({ where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }), select: { id: true } });
    if (!op) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    const { pedimentoId } = (req.body ?? {}) as { pedimentoId?: string | null };
    if (pedimentoId) {
      const ped = await prisma.pedimento.findFirst({ where: { id: pedimentoId, tenantId: req.tenantId! }, select: { id: true } });
      if (!ped) return res.status(404).json({ status: 'error', message: 'Pedimento no encontrado' });
    }
    await prisma.operation.update({ where: { id: op.id }, data: { pedimentoId: pedimentoId ?? null } });
    res.json({ status: 'ok', data: { pedimentoId: pedimentoId ?? null } });
  } catch (err) { next(err); }
});

// GET /:id/paquete-auditoria.zip — documentos + glosa + checklist + certificado de integridad (ZIP stored, sin dependencias).
operationsRouter.get('/:id/paquete-auditoria.zip', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existe = await prisma.operation.findFirst({ where: whereConAlcance(req, { id, tenantId: req.tenantId! }), select: { id: true } });
    if (!existe) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    let paquete: Awaited<ReturnType<typeof construirPaqueteAuditoria>>;
    try { paquete = await construirPaqueteAuditoria(req.tenantId!, id); }
    catch (e) {
      if (e instanceof PaqueteDemasiadoGrandeError) return res.status(413).json({ status: 'error', message: e.message });
      throw e;
    }
    const { zip, certificado, nombreArchivo } = paquete;
    await recordAudit({
      tenantId: req.tenantId!, userId: req.userId!, action: 'expediente.paquete_auditoria', entity: 'Operation', entityId: id,
      endpoint: req.originalUrl, method: req.method, metadata: { hashPaquete: certificado.hashPaquete, entradas: certificado.entradas.length, bytes: zip.length },
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('X-Paquete-Hash', certificado.hashPaquete);
    res.send(zip);
  } catch (err) { next(err); }
});

// Subir/marcar documento como uploaded
operationsRouter.patch('/:opId/documents/:docId', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const opId = String(req.params.opId);
    const docId = String(req.params.docId);
    const { status, fileName, fileSize, mimeType, expiresAt, notes } = req.body;

    // Verificar que la operación pertenece al tenant
    const op = await prisma.operation.findFirst({
      where: whereConAlcance(req, { id: opId, tenantId: req.tenantId! }),
    });
    if (!op) {
      return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    }

    // SCOPE: el doc debe pertenecer a ESTA operación (ya verificada del tenant).
    // Sin esto, un opId propio + un docId ajeno sobrescribía el documento de otro
    // tenant (status/fileName/verifiedBy). {id, operationId} no es unique en
    // Prisma, así que verificamos pertenencia y luego actualizamos por id.
    const owned = await prisma.document.findFirst({
      where: { id: docId, operationId: opId, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!owned) {
      return res.status(404).json({ status: 'error', message: 'Documento no encontrado' });
    }
    const doc = await prisma.document.update({
      where: { id: owned.id },
      data: {
        status: status || 'UPLOADED',
        fileName,
        fileSize,
        mimeType,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        notes,
        verifiedAt: status === 'VERIFIED' ? new Date() : undefined,
        verifiedBy: status === 'VERIFIED' ? req.userId : undefined,
      },
    });

    // Recalcular completeness
    const docs = await prisma.document.findMany({ where: { operationId: opId, tenantId: req.tenantId! } });
    const completeness = calculateCompleteness(getRequiredDocuments(op.type), docs);

    const noAplica = ((op.checklist as ChecklistExpediente | null)?.noAplica) ?? [];
    const checklist = construirChecklist(op.type, docs.map(d => ({ id: d.id, name: d.name, type: d.type, docType: d.docType, status: d.status })), noAplica);
    await prisma.operation.update({
      where: { id: opId },
      data: {
        completeness,
        status: completeness === 100 ? 'COMPLETE' : completeness > 0 ? 'IN_PROGRESS' : 'DRAFT',
        checklist: JSON.parse(JSON.stringify(checklist)),
      },
    });

    res.json({ status: 'ok', data: doc, completeness, checklist });
  } catch (err) {
    next(err);
  }
});

// Documentos vencidos o por vencer
operationsRouter.get('/alerts/expiring', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringDocs = await prisma.document.findMany({
      where: {
        operation: { tenantId: req.tenantId!, ...filtroCliente(req) },
        expiresAt: { lte: thirtyDaysFromNow },
        status: { in: ['UPLOADED', 'VERIFIED'] },
      },
      include: {
        operation: { select: { reference: true, type: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });

    res.json({ status: 'ok', data: expiringDocs });
  } catch (err) {
    next(err);
  }
});

// Eliminar operación
operationsRouter.delete('/:id', authenticate, requirePermission('expedientes', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);

    const op = await prisma.operation.findFirst({
      where: whereConAlcance(req, { id, tenantId: req.tenantId! }),
    });
    if (!op) {
      return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
    }

    await prisma.operation.delete({ where: { id } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});
