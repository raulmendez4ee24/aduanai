import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { getUserPermissions, hasPermission } from '../services/permissions';
import { classifyProduct, type IndustrialSector, type ImporterType } from '../services/classifier';
import { buildClassifierAlerts, computeConsultHash } from '../services/classifier-alerts';
import { recordConsult, verifyConsult, getActiveVersions } from '../services/traceability';
import { isDomesticOrigin, DOMESTIC_ORIGIN_NOTE } from '../lib/origin';
import { reconciliarClasificacion } from '../services/clasificador-reconciliacion';
import { prisma } from '../lib/prisma';

export const classifyRouter = Router();
export const classifyVerifyRouter = Router();

// GET /verify/classify/:hash — público (sin auth) para verificación SAT/auditor
classifyVerifyRouter.get('/:hash', async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return res.status(400).json({ status: 'error', message: 'Hash inválido (SHA-256 64 hex)' });
    }
    const c = await prisma.classification.findFirst({
      where: { consultHash: hash },
      select: {
        id: true, fractionCode: true, fractionDescription: true,
        confidence: true, tigieVersion: true, ligieVersion: true,
        consultedAt: true, inputDescription: true,
        tenant: { select: { name: true, rfc: true } },
      },
    });
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

// POST /api/classify — con auth + alertas defensivas + verificabilidad
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

    const bruto = await classifyProduct(description, context, { useCase, sector, importerType });

    // FRONTERA CANÓNICA §3: reconciliación EN LA RUTA, después de que el
    // clasificador terminó (retry + candado incluidos) — ningún camino interno
    // puede esquivarla. NICO, tarifas, NOMs, RRNA y padrón quedan SUSTITUIDOS
    // por los canónicos; lo que el LLM dijo distinto queda en `discrepancias`
    // (telemetría, no UI). Alertas y regulaciones ahora beben de la misma
    // fuente → no pueden contradecirse.
    const { resultado: result, datosCanonicos, discrepancias } = await reconciliarClasificacion(bruto);

    // Origen nacional (México): la mercancía NO se importa, así que removemos
    // lo que solo aplica a importación: permisos (rrna), padrón y preferencias
    // arancelarias. Las NOM se conservan (aplican también en comercio nacional).
    // Es una regla de APLICABILIDAD sobre el dato canónico, no un cambio de fuente.
    const domestic = isDomesticOrigin(countryOfOrigin);
    if (domestic) {
      result.regulations = { ...result.regulations, rrna: [], sectoralRegistry: false };
      result.tariffs = { ...result.tariffs, preferential: {} };
      const notaDomestica = 'Origen nacional: no aplica a esta operación (no hay importación).';
      datosCanonicos.regulaciones.rrna = { ...datosCanonicos.regulaciones.rrna, valor: [], nota: notaDomestica };
      datosCanonicos.regulaciones.padronSectorial = {
        ...datosCanonicos.regulaciones.padronSectorial,
        valor: { requerido: false, sectores: [] },
        nota: notaDomestica,
      };
      datosCanonicos.tarifas.preferenciales = {
        ...datosCanonicos.tarifas.preferenciales,
        valor: { TMEC: null, TLCUEM: null, CPTPP: null },
        nota: notaDomestica,
      };
    }

    // Alertas defensivas (cuotas comp + NOMs + padrón + automotive + subvaloración)
    const alerts = await buildClassifierAlerts({
      fractionCode: result.fraction.code,
      fractionDescription: result.fraction.description,
      description,
      context,
      countryOfOrigin,
      declaredValueUSD,
      declaredQuantity,
    });

    const consultedAt = new Date();
    // FUENTE ÚNICA de versión: se resuelve una vez y alimenta TANTO el legacyHash
    // como recordConsult, de modo que ambos lean de la misma fuente (no divergen).
    const versions = await getActiveVersions();
    const consultHash = computeConsultHash({
      description,
      context,
      fractionCode: result.fraction.code,
      confidence: result.confidence,
      tigieVersion: versions.tigie,
    });

    // Registro de trazabilidad versional — captura inputs, outputs, versiones,
    // knowledge base y modelo usados, generando un consultHash auditable.
    const trace = await recordConsult({
      tenantId: req.tenantId!,
      userId: req.userId!,
      inputs: { description, context, countryOfOrigin, declaredValueUSD, useCase, sector, importerType },
      // El expediente de trazabilidad conserva el canon aplicado Y lo que el
      // LLM dijo distinto (discrepanciasLLM) — auditoría, no UI (§3.3).
      outputs: { ...result, _trace: undefined, alerts, datosCanonicos, discrepanciasLLM: discrepancias },
      modelUsed: result._trace?.modelUsed ?? 'unknown',
      modelProvider: result._trace?.modelProvider ?? 'unknown',
      knowledgeUsed: result._trace?.knowledgeUsed ?? [],
      versions, // misma fuente que el legacyHash
    });

    // SOD: si el usuario no puede aprobar, la clasificación queda pendiente.
    const perms = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
    const canApprove = hasPermission(perms, 'classifier', 'approve');
    const status = canApprove ? 'approved' : 'pending_approval';

    const record = await prisma.classification.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        inputDescription: description,
        inputContext: context,
        inputCountryOfOrigin: countryOfOrigin,
        inputDeclaredValueUSD: declaredValueUSD,
        inputUseCase: useCase,
        inputSector: sector,
        inputImporterType: importerType,
        useBasedAnalysis: result.useBasedAnalysis ? (result.useBasedAnalysis as unknown as object) : undefined,
        fractionCode: result.fraction.code,
        fractionDescription: result.fraction.description,
        confidence: result.confidence,
        griApplied: result.griApplied,
        alternatives: JSON.stringify(result.alternatives),
        legalBasis: result.legalBasis ? (result.legalBasis as unknown as object) : undefined,
        fullResponse: JSON.stringify({ ...result, datosCanonicos, discrepanciasLLM: discrepancias }),
        tigieVersion: trace.versions.tigie,
        ligieVersion: trace.versions.ligie,
        consultHash: trace.consultHash, // hash combinado de trazabilidad
        consultedAt: trace.consultedAt,
        alertsJson: alerts as unknown as object,
        status,
        approvedAt: canApprove ? new Date() : null,
        approvedById: canApprove ? req.userId! : null,
      },
    });

    // Vincular el consult al classification creado (one-shot)
    await prisma.classificationConsult.update({
      where: { id: trace.id },
      data: { classificationId: record.id },
    });

    // Verificación de Padrones SAT — bloquea operación si no está inscrito.
    // No aplica a mercancía de origen nacional (no hay importación que inscribir).
    const { checkRequiredPadrones } = await import('../services/padron-checker');
    const padronCheck = domestic ? null : await checkRequiredPadrones(req.tenantId!, result.fraction.code, 'classify', record.id);

    res.json({
      status: 'ok',
      data: {
        ...result,
        _trace: undefined,
        alerts,
        datosCanonicos,
        discrepanciasLLM: discrepancias,
        padronCheck,
        domesticOrigin: domestic,
        domesticNote: domestic ? DOMESTIC_ORIGIN_NOTE : undefined,
        meta: {
          tigieVersion: trace.versions.tigie,
          ligieVersion: trace.versions.ligie,
          rgceVersion: trace.versions.rgce,
          modelUsed: result._trace?.modelUsed,
          modelProvider: result._trace?.modelProvider,
          inputHash: trace.inputHash,
          outputHash: trace.outputHash,
          knowledgeBaseHash: trace.knowledgeBaseHash,
          legacyHash: consultHash,
          consultHash: trace.consultHash,
          consultedAt: trace.consultedAt.toISOString(),
          verifyUrl: `/verify/${trace.consultHash}`,
        },
      },
      classificationId: record.id,
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
