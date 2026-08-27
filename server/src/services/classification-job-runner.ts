/**
 * Clasificación asíncrona (BUG-1/BUG-2, auditoría 24-ago-2026).
 *
 * El pipeline completo que antes vivía inline en POST /api/classify se movió
 * aquí INTACTO (clasificar → reconciliar → alertas → trazabilidad → persistir).
 * La ruta ahora solo crea el job y responde 202; este runner lo ejecuta y deja
 * el payload de respuesta (idéntico al contrato síncrono anterior) en
 * ClassificationJob.result, para que GET /api/classify/jobs/:id lo entregue
 * aunque el usuario vuelva días después.
 *
 * Fail-closed: un error del pipeline deja el job en 'error' con un mensaje
 * normalizado ({ code, message, retriable }) — nunca un stack ni texto crudo
 * de infraestructura. Un deploy/reinicio marca los jobs en vuelo como
 * interrumpidos al arrancar (recoverInterruptedClassificationJobs), no los
 * finge vivos.
 */
import { prisma } from '../lib/prisma';
import { sinGuardaDeTenant } from '../lib/tenant-guard';
import { classifyProduct, type IndustrialSector, type ImporterType } from './classifier';
import { buildClassifierAlerts, computeConsultHash } from './classifier-alerts';
import { recordConsult, getActiveVersions } from './traceability';
import { isDomesticOrigin, DOMESTIC_ORIGIN_NOTE } from '../lib/origin';
import { reconciliarClasificacion } from './clasificador-reconciliacion';
import { getUserPermissions, hasPermission } from './permissions';
import { subpartidasHermanas } from './subpartidas-hermanas';

export interface ClassificationJobInputs {
  description: string;
  context?: string;
  countryOfOrigin?: string;
  declaredValueUSD?: number;
  declaredQuantity?: number;
  useCase?: string;
  sector?: IndustrialSector;
  importerType?: ImporterType;
  // Rol del usuario al momento de crear el job — resuelve permisos SOD dentro
  // del runner sin depender del request vivo.
  userRole?: string;
}

export interface ClassificationJobError {
  code: 'VALIDACION' | 'ERROR_INTERNO' | 'INTERRUMPIDO' | 'TIMEOUT';
  message: string;
  retriable: boolean;
}

const JOB_RETENTION_DAYS = 7;
// Momento en que arrancó ESTE proceso: el recovery de arranque solo puede
// interrumpir jobs creados ANTES (huérfanos del proceso anterior). Sin esta
// marca, una clasificación enviada en la ventana entre listen() y el paso de
// recovery del boot sería marcada interrumpida estando viva (revisión 24-ago).
const PROCESS_BOOT = new Date();
// Tope duro de un job en 'running': el pipeline real tarda 45s-2.5min (D14);
// 15 min solo puede significar una promesa colgada o un proceso muerto.
export const JOB_RUNNING_TIMEOUT_MS = 15 * 60 * 1000;

const ACTIVE_STATUSES = ['queued', 'running'];

/**
 * Crea un job para el usuario y arranca el pipeline en background.
 * Si el usuario ya tiene un job activo, devuelve ese (evita doble submit:
 * un usuario = una clasificación en vuelo).
 */
export async function createClassificationJob(params: {
  tenantId: string;
  userId: string;
  inputs: ClassificationJobInputs;
  clienteId?: string | null;
}): Promise<{ jobId: string; reused: boolean; description?: string }> {
  const { tenantId, userId, inputs } = params;

  // Borrado perezoso de jobs viejos del tenant (retención 7 días).
  const cutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.classificationJob.deleteMany({ where: { tenantId, createdAt: { lt: cutoff } } });

  const active = await prisma.classificationJob.findFirst({
    where: { tenantId, userId, status: { in: ACTIVE_STATUSES } },
    select: { id: true, inputs: true },
  });
  if (active) {
    return {
      jobId: active.id,
      reused: true,
      description: (active.inputs as { description?: string } | null)?.description,
    };
  }

  let job: { id: string };
  try {
    job = await prisma.classificationJob.create({
      data: { tenantId, userId, inputs: inputs as unknown as object, clienteId: params.clienteId ?? null },
      select: { id: true },
    });
  } catch (err) {
    // Índice único parcial (un job activo por tenant+usuario): si dos POST
    // simultáneos pasaron el findFirst, el segundo create truena aquí — se
    // devuelve el job que ganó la carrera, no se duplica el pipeline.
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      const winner = await prisma.classificationJob.findFirst({
        where: { tenantId, userId, status: { in: ACTIVE_STATUSES } },
        select: { id: true, inputs: true },
      });
      if (winner) {
        return {
          jobId: winner.id,
          reused: true,
          description: (winner.inputs as { description?: string } | null)?.description,
        };
      }
    }
    throw err;
  }

  // Fire-and-forget deliberado: el POST ya respondió 202. Cualquier error
  // del pipeline queda registrado EN el job (fail-closed), nunca sin manejar.
  void runClassificationJob(job.id).catch(err => {
    console.error(`[classification-job] runner reventó fuera del pipeline (job ${job.id}):`, err);
  });

  return { jobId: job.id, reused: false };
}

/** Ejecuta el pipeline completo de un job y persiste resultado o error. */
export async function runClassificationJob(jobId: string): Promise<void> {
  // Runner de sistema: el id viene del propio create (no de un usuario) → cruce deliberado.
  const job = await sinGuardaDeTenant(() => prisma.classificationJob.findUnique({ where: { id: jobId } }));
  if (!job || job.status !== 'queued') return;

  // Transición condicional: si el recovery de arranque (u otro camino) ya
  // movió el job fuera de 'queued', este runner no debe correr.
  const claimed = await prisma.classificationJob.updateMany({
    where: { id: jobId, status: 'queued' },
    data: { status: 'running', startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const inputs = job.inputs as unknown as ClassificationJobInputs;
  const { description, context, countryOfOrigin, declaredValueUSD, declaredQuantity, useCase, sector, importerType, userRole } = inputs;

  try {
    const bruto = await classifyProduct(description, context, { useCase, sector, importerType, tenantId: job.tenantId });

    // FRONTERA CANÓNICA §3: reconciliación tras el clasificador — ningún
    // camino interno puede esquivarla. NICO, tarifas, NOMs, RRNA y padrón
    // quedan SUSTITUIDOS por los canónicos.
    const { resultado: result, datosCanonicos, discrepancias } = await reconciliarClasificacion(bruto);

    // Origen nacional (México): se remueve lo que solo aplica a importación.
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

    const alerts = await buildClassifierAlerts({
      fractionCode: result.fraction.code,
      fractionDescription: result.fraction.description,
      description,
      context,
      countryOfOrigin,
      declaredValueUSD,
      declaredQuantity,
    });

    const versions = await getActiveVersions();
    const consultHash = computeConsultHash({
      description,
      context,
      fractionCode: result.fraction.code,
      confidence: result.confidence,
      tigieVersion: versions.tigie,
    });

    const trace = await recordConsult({
      tenantId: job.tenantId,
      userId: job.userId,
      inputs: { description, context, countryOfOrigin, declaredValueUSD, useCase, sector, importerType },
      outputs: { ...result, _trace: undefined, alerts, datosCanonicos, discrepanciasLLM: discrepancias },
      modelUsed: result._trace?.modelUsed ?? 'unknown',
      modelProvider: result._trace?.modelProvider ?? 'unknown',
      knowledgeUsed: result._trace?.knowledgeUsed ?? [],
      versions,
    });

    // SOD: si el usuario no puede aprobar, la clasificación queda pendiente.
    const perms = await getUserPermissions(job.userId, job.tenantId, userRole);
    const canApprove = hasPermission(perms, 'classifier', 'approve');
    const status = canApprove ? 'approved' : 'pending_approval';

    const record = await prisma.classification.create({
      data: {
        tenantId: job.tenantId,
        userId: job.userId,
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
        consultHash: trace.consultHash,
        consultedAt: trace.consultedAt,
        alertsJson: alerts as unknown as object,
        status,
        approvedAt: canApprove ? new Date() : null,
        approvedById: canApprove ? job.userId : null,
        clienteId: job.clienteId ?? null,
      },
    });

    await prisma.classificationConsult.update({
      where: { id: trace.id },
      data: { classificationId: record.id },
    });

    // Verificación de Padrones SAT — no aplica a origen nacional.
    const { checkRequiredPadrones } = await import('./padron-checker');
    const padronCheck = domestic ? null : await checkRequiredPadrones(job.tenantId, result.fraction.code, 'classify', record.id);

    // Ola 1 (Operación 2026-08): subpartidas hermanas de la misma partida —
    // capa de presentación/contraste desde el catálogo; nunca bloquea el job.
    const hermanas = await subpartidasHermanas(result.fraction.code).catch(() => []);

    // Payload idéntico al que la ruta síncrona devolvía en `data` (+ hermanas).
    const payload = {
      ...result,
      _trace: undefined,
      hermanas,
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
    };

    // Transición condicional running→done: si el watchdog o el recovery ya
    // marcaron error (timeout/interrupción), NO se sobreescribe — el estado
    // que el usuario ya vio se respeta; la Classification creada queda en el
    // historial de todos modos.
    const finished = await prisma.classificationJob.updateMany({
      where: { id: jobId, status: 'running' },
      data: {
        status: 'done',
        finishedAt: new Date(),
        classificationId: record.id,
        result: JSON.parse(JSON.stringify(payload)) as object,
      },
    });
    if (finished.count === 0) {
      console.warn(`[classification-job] job ${jobId} terminó pero ya estaba marcado error (watchdog/recovery) — resultado en Classification ${record.id}, job no sobrescrito`);
    }
  } catch (err) {
    console.error(`[classification-job] pipeline falló (job ${jobId}):`, err);
    const statusCode = (err as { statusCode?: number }).statusCode;
    const jobError: ClassificationJobError =
      statusCode !== undefined && statusCode < 500
        ? {
            code: 'VALIDACION',
            message: err instanceof Error ? err.message : 'La descripción no pudo clasificarse.',
            retriable: false,
          }
        : {
            code: 'ERROR_INTERNO',
            message: 'La clasificación falló por un error interno del servicio. Intenta de nuevo.',
            retriable: true,
          };
    await prisma.classificationJob.updateMany({
      where: { id: jobId, status: { in: ACTIVE_STATUSES } },
      data: { status: 'error', finishedAt: new Date(), error: jobError as unknown as object },
    }).catch(updateErr => {
      console.error(`[classification-job] no pude registrar el error del job ${jobId}:`, updateErr);
    });
  }
}

/**
 * Al arrancar el servidor: cualquier job que quedó en vuelo pertenece a un
 * proceso que ya no existe (deploy/reinicio). Se marca interrumpido —
 * fail-closed honesto, no se finge que sobrevivió.
 */
export async function recoverInterruptedClassificationJobs(): Promise<number> {
  // Purga de retención en cada arranque: el borrado perezoso al crear jobs no
  // cubre tenants que dejaron de clasificar — aquí se barre todo lo >7 días.
  const cutoffRetention = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.classificationJob.deleteMany({ where: { createdAt: { lt: cutoffRetention } } }).catch(() => {});

  const { count } = await prisma.classificationJob.updateMany({
    // Solo jobs creados ANTES de que este proceso arrancara: los del proceso
    // anterior (muerto). Un job creado por este proceso tiene runner vivo.
    where: { status: { in: ACTIVE_STATUSES }, createdAt: { lt: PROCESS_BOOT } },
    data: {
      status: 'error',
      finishedAt: new Date(),
      error: {
        code: 'INTERRUMPIDO',
        message: 'El servidor se reinició mientras corría la clasificación. Reintenta.',
        retriable: true,
      } as unknown as object,
    },
  });
  if (count > 0) console.warn(`[classification-job] ${count} job(s) en vuelo marcados como interrumpidos al arrancar`);
  return count;
}
