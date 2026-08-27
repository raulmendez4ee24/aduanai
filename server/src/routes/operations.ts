import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { getRequiredDocuments, calculateCompleteness, getMissingDocuments } from '../services/expediente';
import { clienteIdDe, filtroCliente, validarClienteDelTenant } from '../lib/cliente-contexto';

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

    const operations = await prisma.operation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        documents: { select: { id: true, type: true, status: true, required: true } },
      },
    });

    res.json({ status: 'ok', data: operations });
  } catch (err) {
    next(err);
  }
});

// Detalle de operación
operationsRouter.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);

    const operation = await prisma.operation.findFirst({
      where: { id, tenantId: req.tenantId! },
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

    res.json({
      status: 'ok',
      data: {
        ...operation,
        completeness,
        missingDocuments: missing,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Subir/marcar documento como uploaded
operationsRouter.patch('/:opId/documents/:docId', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const opId = String(req.params.opId);
    const docId = String(req.params.docId);
    const { status, fileName, fileSize, mimeType, expiresAt, notes } = req.body;

    // Verificar que la operación pertenece al tenant
    const op = await prisma.operation.findFirst({
      where: { id: opId, tenantId: req.tenantId! },
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
    const docs = await prisma.document.findMany({ where: { operationId: opId } });
    const completeness = calculateCompleteness(getRequiredDocuments(op.type), docs);

    await prisma.operation.update({
      where: { id: opId },
      data: {
        completeness,
        status: completeness === 100 ? 'COMPLETE' : completeness > 0 ? 'IN_PROGRESS' : 'DRAFT',
      },
    });

    res.json({ status: 'ok', data: doc, completeness });
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
        operation: { tenantId: req.tenantId! },
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
      where: { id, tenantId: req.tenantId! },
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
