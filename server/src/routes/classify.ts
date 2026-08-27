import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { classifyProduct, type IndustrialSector, type ImporterType } from '../services/classifier';
import { validateClassifyInput, createClassifyInputError } from '../services/classify-input';
import { verifyConsult } from '../services/traceability';
import { reconciliarClasificacion } from '../services/clasificador-reconciliacion';
import { createClassificationJob, JOB_RUNNING_TIMEOUT_MS, type ClassificationJobInputs } from '../services/classification-job-runner';
import { prisma } from '../lib/prisma';
import { sinGuardaDeTenant } from '../lib/tenant-guard';

export const classifyRouter = Router();
export const classifyVerifyRouter = Router();

// GET /verify/classify/:hash — público (sin auth) para verificación SAT/auditor
classifyVerifyRouter.get('/:hash', async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return res.status(400).json({ status: 'error', message: 'Hash inválido (SHA-256 64 hex)' });
    }
    // Verificación PÚBLICA por hash: cross-tenant por diseño (el hash es la credencial).
    const c = await sinGuardaDeTenant(() => prisma.classification.findFirst({
      where: { consultHash: hash },
      select: {
        id: true, fractionCode: true, fractionDescription: true,
        confidence: true, tigieVersion: true, ligieVersion: true,
        consultedAt: true, inputDescription: true,
        tenant: { select: { name: true, rfc: true } },
      },
    }));
    if (!c) {
      return res.json({
        status: 'ok',
        data: { found: false, message: 'Hash no encontrado. La clasificación pudo haber sido alterada o no fue emitida por ADUANAI.' },
      });
    }
    res.json({
      status: 'ok',
      data: {
        found: true,
        verified: true,
        classification: {
          fractionCode: c.fractionCode,
          fractionDescription: c.fractionDescription,
          confidence: c.confidence,
          tigieVersion: c.tigieVersion,
          ligieVersion: c.ligieVersion,
          consultedAt: c.consultedAt?.toISOString(),
          inputDescription: c.inputDescription,
          tenantName: c.tenant.name,
          tenantRFC: c.tenant.rfc,
        },
        message: 'Hash válido — la clasificación está registrada con la versión TIGIE/LIGIE consultada.',
      },
    });
  } catch (err) { next(err); }
});

// POST /api/classify/demo — sin auth, 10 por IP por hora
const demoClassifyLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { status: 'error', message: 'Límite de clasificaciones demo alcanzado. Regístrate para uso ilimitado.' },
});

classifyRouter.post('/demo', demoClassifyLimit, async (req, res, next) => {
  try {
    const { description: rawDescription } = req.body ?? {};
    const description = typeof rawDescription === 'string' ? rawDescription : '';

    if (description.length > 200) {
      return res.status(400).json({
        status: 'error',
        message: 'Descripción demasiado larga para demo (máximo 200 caracteres)',
      });
    }

    const bruto = await classifyProduct(description);
    // Frontera Canónica §3: la reconciliación corre EN LA RUTA (también en la
    // demo) — ningún camino interno del clasificador puede esquivarla.
    const { resultado: result, datosCanonicos } = await reconciliarClasificacion(bruto);

    res.json({ status: 'ok', data: { ...result, datosCanonicos } });
  } catch (err) {
    next(err);
  }
});

// POST /api/classify — asíncrono (BUG-1/BUG-2, 24-ago-2026): valida el input
// de inmediato (422 síncrono, mismo contrato de siempre para texto basura),
// crea un ClassificationJob y responde 202 con el jobId en <1s. El pipeline
// completo corre en services/classification-job-runner.ts; la UI hace polling
// a GET /api/classify/jobs/:id. Así el gateway nunca corta la petición larga
// (502) y el trabajo en vuelo sobrevive a la navegación.
classifyRouter.post('/', authenticate, requirePermission('classifier', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { description: rawDescription, context, countryOfOrigin, declaredValueUSD, declaredQuantity, useCase, sector, importerType } = (req.body ?? {}) as {
      description?: string;
      context?: string;
      countryOfOrigin?: string;
      declaredValueUSD?: number;
      declaredQuantity?: number;
      useCase?: string;
      sector?: IndustrialSector;
      importerType?: ImporterType;
    };
    const description = typeof rawDescription === 'string' ? rawDescription : '';

    // Validación barata ANTES de crear el job: el texto basura sigue
    // recibiendo su 422 inmediato, no un job que muere después.
    const inputValidation = validateClassifyInput(description);
    if (!inputValidation.ok) {
      throw createClassifyInputError(inputValidation.reason);
    }

    const inputs: ClassificationJobInputs = {
      description,
      context,
      countryOfOrigin,
      declaredValueUSD,
      declaredQuantity,
      useCase,
      sector,
      importerType,
      userRole: req.userRole,
    };

    const { jobId, reused, description: activeDescription } = await createClassificationJob({
      tenantId: req.tenantId!,
      userId: req.userId!,
      inputs,
    });

    // Si se reutilizó un job activo, `description` trae la descripción de ESE
    // job — la UI la compara con lo que el usuario tecleó para no asociar el
    // resultado del producto A con el texto del producto B (revisión 24-ago).
    res.status(202).json({ status: 'ok', jobId, reused, description: reused ? activeDescription ?? null : null });
  } catch (err) {
    next(err);
  }
});

// GET /api/classify/jobs/:id — polling del job. Scoped por tenant (el id de
// otro tenant devuelve 404, no 403 — no filtra existencia). Cuando termina,
// `result` trae el payload completo que la ruta síncrona devolvía en `data`.
classifyRouter.get('/jobs/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const job = await prisma.classificationJob.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!job) {
      return res.status(404).json({ status: 'error', message: 'Clasificación no encontrada (pudo haber expirado — se conservan 7 días).' });
    }

    // Watchdog perezoso: un job "corriendo" desde hace >15 min es una promesa
    // colgada o un proceso que murió sin marcar nada — se declara timeout.
    // Transición CONDICIONAL (updateMany con status/startedAt en el where):
    // si el runner terminó entre el findFirst y este update, count=0 y no se
    // pisa el 'done' — el estado que se responde es el que quedó en la DB.
    if (job.status === 'running' && job.startedAt && Date.now() - job.startedAt.getTime() > JOB_RUNNING_TIMEOUT_MS) {
      const timeoutError = { code: 'TIMEOUT', message: 'La clasificación tardó demasiado y se canceló. Intenta de nuevo.', retriable: true };
      const cutoff = new Date(Date.now() - JOB_RUNNING_TIMEOUT_MS);
      const marked = await prisma.classificationJob.updateMany({
        where: { id: job.id, status: 'running', startedAt: { lt: cutoff } },
        data: { status: 'error', finishedAt: new Date(), error: timeoutError as unknown as object },
      });
      if (marked.count === 1) {
        job.status = 'error';
        job.finishedAt = new Date();
        job.error = timeoutError as unknown as typeof job.error;
      } else {
        // El runner ganó la carrera: re-leer el estado real.
        const fresh = await prisma.classificationJob.findFirst({ where: { id: job.id, tenantId: req.tenantId! } });
        if (fresh) Object.assign(job, fresh);
      }
    }

    res.json({
      status: 'ok',
      job: {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        // La descripción original permite reconstruir la conversación en la
        // UI cuando el usuario vuelve al módulo con el job aún en vuelo.
        description: (job.inputs as { description?: string } | null)?.description ?? null,
        error: job.error ?? null,
        classificationId: job.classificationId ?? null,
        result: job.status === 'done' ? job.result : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

classifyRouter.get('/history', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const search = String(req.query.search || '');
    const page = String(req.query.page || '1');
    const limit = String(req.query.limit || '20');
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (search) {
      where.OR = [
        { inputDescription: { contains: search, mode: 'insensitive' } },
        { fractionCode: { contains: search } },
      ];
    }

    const [classifications, total] = await Promise.all([
      prisma.classification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip,
      }),
      prisma.classification.count({ where }),
    ]);

    res.json({
      status: 'ok',
      data: classifications,
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (err) {
    next(err);
  }
});

// Feedback en una clasificación
classifyRouter.patch('/:id/feedback', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { feedback, feedbackNote } = req.body;

    if (!['correct', 'incorrect', 'partial'].includes(feedback)) {
      return res.status(400).json({
        status: 'error',
        message: 'Feedback debe ser: correct, incorrect, o partial',
      });
    }

    // SCOPE por tenant: sin esto, cualquier usuario dejaba feedback (y leía la
    // fila completa) de una clasificación de OTRO tenant. Mismo patrón que /approve.
    const owned = await prisma.classification.findFirst({
      where: { id, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ status: 'error', message: 'Clasificación no encontrada' });
    const classification = await prisma.classification.update({
      where: { id: owned.id },
      data: { feedback, feedbackNote },
    });

    // Feedback loop: clasificación incorrecta → crea caso unverified en knowledge base
    if (feedback === 'incorrect') {
      const chapter = classification.fractionCode.replace(/[.\-\s]/g, '').substring(0, 2);
      const keywords = classification.inputDescription
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 10);
      await prisma.classificationKnowledge.create({
        data: {
          type: 'CASO_CLASIFICACION',
          fractionCode: classification.fractionCode,
          chapterCode: chapter,
          title: `Caso con feedback negativo: ${classification.inputDescription.slice(0, 80)}`,
          content: `Producto declarado: ${classification.inputDescription}\n\nLa IA clasificó en: ${classification.fractionCode}\nEl usuario marcó esta clasificación como INCORRECTA.\n${feedbackNote ? `\nNota del usuario: ${feedbackNote}` : ''}\n\nREVISAR: determinar la fracción correcta, documentar el razonamiento, y verificar este caso para que el clasificador aprenda del error.`,
          source: `Feedback usuario ${req.userId ?? 'desconocido'} — clasificación ${id}`,
          keywords,
          priority: 7,
          verified: false,
          // Bloque 3: la fila es del tenant; solo él la consume hasta que staff la verifique.
          tenantId: req.tenantId!,
        },
      });
    }

    res.json({ status: 'ok', data: classification });
  } catch (err) {
    next(err);
  }
});

// POST /api/classify/:id/approve — VALIDATOR aprueba clasificación creada por CLASSIFIER
classifyRouter.post('/:id/approve', authenticate, requirePermission('classifier', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.classification.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!existing) return res.status(404).json({ status: 'error', message: 'Clasificación no encontrada' });
    if (existing.status === 'approved') {
      return res.status(400).json({ status: 'error', message: 'La clasificación ya está aprobada' });
    }

    const updated = await prisma.classification.update({
      where: { id },
      data: { status: 'approved', approvedAt: new Date(), approvedById: req.userId! },
    });

    // SOD: si el aprobador es el mismo que creó, dejarlo registrado en audit OEA
    if (existing.userId === req.userId) {
      await prisma.permissionAuditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.userId!,
          action: 'SELF_APPROVAL_SOD',
          targetUserId: existing.userId,
          details: { module: 'classifier', resource: 'classification', resourceId: id, fractionCode: existing.fractionCode },
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });
    }

    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});
