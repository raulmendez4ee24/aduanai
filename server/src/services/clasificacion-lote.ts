/**
 * Clasificación en lote — "Excel entra, Excel sale" (Ola 1, Operación 2026-08).
 *
 * Un embarque trae 50–500 partidas; nadie teclea producto por producto. Este
 * servicio:
 *   1. Parsea Excel/CSV con columnas flexibles (solo `descripcion` obligatoria).
 *   2. Crea `ClassificationBatch` + `ClassificationBatchRow`.
 *   3. Procesa fila por fila REUTILIZANDO el pipeline real
 *      (`classification-job-runner.ts`): cada fila se encola como
 *      `ClassificationJob` y lo corre el mismo runner que POST /api/classify.
 *      No hay un segundo pipeline.
 *   4. Calcula el semáforo por fila (`semaforoDeFila`, función pura).
 *   5. Exporta el lote a Excel con todas las columnas de entrada + resultado.
 *
 * Concurrencia: el índice único parcial `classification_jobs_one_active_per_user`
 * (un job activo por tenant+usuario) impone secuencialidad — el lote corre
 * UNA fila a la vez. Es deliberado: también acota la presión sobre el
 * proveedor de IA (créditos/429). Si el proveedor falla N veces seguidas,
 * el lote se detiene en vez de quemar 500 llamadas contra un 429.
 *
 * El runner es inyectable (`DependenciasLote.correrJob`) para que los tests
 * ejerciten import/semáforo/export sin tocar el LLM.
 */
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validateClassifyInput } from './classify-input';
import { runClassificationJob, type ClassificationJobInputs, type ClassificationJobError } from './classification-job-runner';
import type { ClassifierAlertSeverity } from './classifier-alerts';

// ─────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────

/** Tope de filas por lote. */
export const MAX_FILAS_LOTE = 500;

/**
 * Umbrales de confianza — los MISMOS que ya usa el producto para colorear
 * resultados (services/whatsapp.ts: ≥80 verde, ≥60 ámbar, <60 rojo). El
 * clasificador reintenta por su cuenta bajo 70 (classifier.ts "Mejora #5");
 * aquí no se inventan números nuevos.
 */
export const UMBRAL_CONFIANZA_ALTA = 80;
export const UMBRAL_CONFIANZA_MEDIA = 60;

/** Fallas consecutivas del proveedor que detienen el lote. */
export const MAX_FALLAS_CONSECUTIVAS = 3;

export const USOS_DESTINO = ['INSUMO_IMMEX', 'VENTA_DIRECTA', 'ACTIVO_FIJO'] as const;
export type UsoDestino = typeof USOS_DESTINO[number];

export type Semaforo = 'verde' | 'ambar' | 'rojo';

// ─────────────────────────────────────────────────────────────────────────
// 1. Parseo de Excel/CSV con columnas flexibles
// ─────────────────────────────────────────────────────────────────────────

export interface FilaEntrada {
  numeroFila: number;
  productCode?: string;
  descripcion: string;
  contexto?: string;
  paisOrigen?: string;
  valorUSD?: number;
  usoDestino?: string;
}

export interface ResultadoParseo {
  filas: FilaEntrada[];
  /** Encabezado original → campo canónico detectado. */
  columnas: Record<string, CampoLote>;
  /** Filas del archivo sin descripción (se ignoran, se informan). */
  omitidas: Array<{ numeroFila: number; motivo: string }>;
}

export type CampoLote = 'descripcion' | 'productCode' | 'contexto' | 'paisOrigen' | 'valorUSD' | 'usoDestino';

/** Encabezados aceptados (normalizados: minúsculas, sin acentos ni símbolos). */
const ALIAS_COLUMNAS: Record<CampoLote, string[]> = {
  descripcion: ['descripcion', 'description', 'producto', 'descripciondelproducto', 'descripcionproducto', 'mercancia', 'descripcionmercancia', 'articulo', 'item', 'desc'],
  productCode: ['productcode', 'codigo', 'codigoproducto', 'codigodeproducto', 'sku', 'numerodeparte', 'numeroparte', 'noparte', 'parte', 'partnumber', 'clave', 'claveproducto', 'codigointerno'],
  contexto: ['contexto', 'context', 'notas', 'observaciones', 'detalle', 'detalles', 'especificaciones'],
  paisOrigen: ['paisorigen', 'paisdeorigen', 'pais', 'origen', 'countryoforigin', 'country', 'origin'],
  valorUSD: ['valorusd', 'valor', 'valorunitariousd', 'valorunitario', 'preciousd', 'precio', 'preciounitario', 'unitvalueusd', 'unitvalue', 'value', 'valorenusd'],
  usoDestino: ['usodestino', 'usoodestino', 'uso', 'destino', 'usecase', 'tipodeuso', 'regimen'],
};

export function normalizarEncabezado(h: unknown): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Mapea encabezados del archivo a campos canónicos (primer alias que coincide gana). */
export function detectarColumnas(encabezados: unknown[]): Record<string, CampoLote> {
  const mapa: Record<string, CampoLote> = {};
  const usados = new Set<CampoLote>();
  for (const h of encabezados) {
    const original = String(h ?? '').trim();
    if (!original) continue;
    const norm = normalizarEncabezado(original);
    for (const campo of Object.keys(ALIAS_COLUMNAS) as CampoLote[]) {
      if (usados.has(campo)) continue;
      if (ALIAS_COLUMNAS[campo].includes(norm)) {
        mapa[original] = campo;
        usados.add(campo);
        break;
      }
    }
  }
  return mapa;
}

function normalizarUsoDestino(v: unknown): string | undefined {
  const s = normalizarEncabezado(v).toUpperCase();
  if (!s) return undefined;
  if (s.includes('IMMEX') || s.includes('INSUMO')) return 'INSUMO_IMMEX';
  if (s.includes('ACTIVO') || s.includes('FIJO')) return 'ACTIVO_FIJO';
  if (s.includes('VENTA') || s.includes('DIRECTA') || s.includes('DEFINITIV')) return 'VENTA_DIRECTA';
  return String(v).trim();
}

function aNumero(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function aTexto(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * Parsea un Excel (.xlsx/.xls) o CSV en base64. Usa la PRIMERA hoja. La
 * primera fila es el encabezado; el orden de columnas es libre y los
 * acentos/mayúsculas no importan.
 */
export function parsearArchivoLote(base64: string, nombreArchivo?: string): ResultadoParseo {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) throw new ErrorLote('El archivo está vacío.', 400);
  const esCSV = /\.csv$/i.test(nombreArchivo ?? '');
  let wb: XLSX.WorkBook;
  try {
    wb = esCSV
      ? XLSX.read(buf.toString('utf8'), { type: 'string', raw: false })
      : XLSX.read(buf, { type: 'buffer', raw: false });
  } catch {
    throw new ErrorLote('No pude leer el archivo. Sube un .xlsx, .xls o .csv con encabezados en la primera fila.', 400);
  }
  const hoja = wb.Sheets[wb.SheetNames[0]];
  if (!hoja) throw new ErrorLote('El archivo no tiene hojas.', 400);
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: '', blankrows: false });
  if (matriz.length === 0) throw new ErrorLote('El archivo no tiene filas.', 400);

  const encabezados = matriz[0] as unknown[];
  const columnas = detectarColumnas(encabezados);
  const idxPorCampo = new Map<CampoLote, number>();
  encabezados.forEach((h, i) => {
    const campo = columnas[String(h ?? '').trim()];
    if (campo && !idxPorCampo.has(campo)) idxPorCampo.set(campo, i);
  });
  if (!idxPorCampo.has('descripcion')) {
    throw new ErrorLote(
      `Falta la columna obligatoria "descripcion". Encabezados encontrados: ${encabezados.filter(Boolean).map(String).join(', ') || '(ninguno)'}.`,
      400,
    );
  }

  const filas: FilaEntrada[] = [];
  const omitidas: ResultadoParseo['omitidas'] = [];
  const celda = (fila: unknown[], campo: CampoLote): unknown => {
    const i = idxPorCampo.get(campo);
    return i === undefined ? undefined : fila[i];
  };
  for (let r = 1; r < matriz.length; r++) {
    const fila = matriz[r] as unknown[];
    const numeroFila = r + 1; // 1-based como en Excel (fila 1 = encabezado)
    const descripcion = aTexto(celda(fila, 'descripcion'));
    if (!descripcion) {
      // Fila completamente vacía → se ignora sin ruido; con datos pero sin descripción → se informa.
      if (fila.some(c => aTexto(c))) omitidas.push({ numeroFila, motivo: 'Sin descripción' });
      continue;
    }
    filas.push({
      numeroFila,
      descripcion,
      productCode: aTexto(celda(fila, 'productCode')),
      contexto: aTexto(celda(fila, 'contexto')),
      paisOrigen: aTexto(celda(fila, 'paisOrigen'))?.toUpperCase(),
      valorUSD: aNumero(celda(fila, 'valorUSD')),
      usoDestino: normalizarUsoDestino(celda(fila, 'usoDestino')),
    });
  }
  return { filas, columnas, omitidas };
}

/** Plantilla descargable con los encabezados canónicos y una fila de ejemplo. */
export function generarPlantillaXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const hoja = XLSX.utils.aoa_to_sheet([
    ['productCode', 'descripcion', 'contexto', 'paisOrigen', 'valorUSD', 'usoDestino'],
    ['SKU-0001', 'Tornillo de acero inoxidable, cabeza hexagonal, M10x50mm, para uso industrial', 'Se usa en ensamble de bombas', 'CN', 0.12, 'INSUMO_IMMEX'],
  ]);
  hoja['!cols'] = [{ wch: 14 }, { wch: 70 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, hoja, 'Partidas');
  const instr = XLSX.utils.aoa_to_sheet([
    ['Columna', 'Obligatoria', 'Notas'],
    ['descripcion', 'Sí', 'Material, uso y características. A mayor detalle, mejor fracción.'],
    ['productCode', 'No', 'SKU / número de parte. Si existe en tu catálogo, se compara la fracción.'],
    ['contexto', 'No', 'Notas adicionales (composición, función, presentación).'],
    ['paisOrigen', 'No', 'Código ISO-2 (CN, US, DE…).'],
    ['valorUSD', 'No', 'Valor unitario en USD.'],
    ['usoDestino', 'No', 'INSUMO_IMMEX | VENTA_DIRECTA | ACTIVO_FIJO'],
    ['', '', 'El orden de las columnas es libre; acentos y mayúsculas no importan.'],
  ]);
  instr['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instr, 'Instrucciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Semáforo (función pura)
// ─────────────────────────────────────────────────────────────────────────

export interface EntradaSemaforo {
  /** Confianza autodeclarada 0–100; null/undefined si no hubo candidato. */
  confidence?: number | null;
  fractionCode?: string | null;
  /** true = igual al catálogo; false = discrepa; null = sin parte en catálogo. */
  coincideCatalogo?: boolean | null;
  /** Severidades de las alertas del clasificador (classifier-alerts). */
  alertas?: ClassifierAlertSeverity[];
  /** Error del pipeline (422, sin candidato, error interno…). */
  error?: string | null;
}

/**
 * verde  = confianza ≥ ALTA y (coincide con catálogo, o sin catálogo pero sin
 *          alertas warning/critical del clasificador).
 * ámbar  = confianza media (≥ MEDIA), o discrepancia con catálogo, o alertas.
 * rojo   = sin candidato / error / 422 / confianza < MEDIA.
 */
export function semaforoDeFila(e: EntradaSemaforo): Semaforo {
  if (e.error) return 'rojo';
  if (!e.fractionCode) return 'rojo';
  const conf = typeof e.confidence === 'number' && Number.isFinite(e.confidence) ? e.confidence : null;
  if (conf === null || conf < UMBRAL_CONFIANZA_MEDIA) return 'rojo';
  if (e.coincideCatalogo === false) return 'ambar';
  const alertasRelevantes = (e.alertas ?? []).some(s => s === 'critical' || s === 'warning');
  if (conf < UMBRAL_CONFIANZA_ALTA) return 'ambar';
  if (e.coincideCatalogo === true) return 'verde';
  // Sin parte en catálogo: verde solo si el clasificador no levantó alertas.
  return alertasRelevantes ? 'ambar' : 'verde';
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Crear lote y procesarlo
// ─────────────────────────────────────────────────────────────────────────

export class ErrorLote extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface DependenciasLote {
  /** Corre el job (por defecto el runner real). Debe dejar el job en done/error. */
  correrJob: (jobId: string) => Promise<void>;
  /** Espera entre filas (ms) — 0 en tests. */
  pausaEntreFilasMs?: number;
}

export const DEPENDENCIAS_REALES: DependenciasLote = {
  correrJob: runClassificationJob,
  pausaEntreFilasMs: 250,
};

export async function crearLote(params: {
  tenantId: string;
  userId: string;
  clienteId?: string | null;
  nombreArchivo: string;
  filas: FilaEntrada[];
}): Promise<{ id: string; totalFilas: number }> {
  const { tenantId, userId, clienteId, nombreArchivo, filas } = params;
  if (filas.length === 0) throw new ErrorLote('El archivo no tiene filas con descripción.', 400);
  if (filas.length > MAX_FILAS_LOTE) {
    throw new ErrorLote(`El lote tiene ${filas.length} filas; el máximo es ${MAX_FILAS_LOTE}. Divide el archivo.`, 400);
  }
  const batch = await prisma.classificationBatch.create({
    data: {
      tenantId,
      userId,
      clienteId: clienteId ?? null,
      nombreArchivo,
      totalFilas: filas.length,
      status: 'queued',
      filas: {
        create: filas.map(f => ({
          numeroFila: f.numeroFila,
          productCode: f.productCode ?? null,
          descripcion: f.descripcion,
          contexto: f.contexto ?? null,
          paisOrigen: f.paisOrigen ?? null,
          valorUSD: f.valorUSD ?? null,
          usoDestino: f.usoDestino ?? null,
        })),
      },
    },
    select: { id: true, totalFilas: true },
  });
  return batch;
}

/**
 * Parte vigente del catálogo para comparar: mismo tenant (y cliente si viene)
 * con `versionVigente > 0` o `fractionCode` no nulo. Se consulta `prisma.product`
 * directamente — el módulo Catálogo (otro agente) es dueño de la API.
 */
export async function fraccionDeCatalogo(params: {
  tenantId: string;
  clienteId?: string | null;
  productCode?: string | null;
}): Promise<{ productId: string; fractionCode: string | null } | null> {
  if (!params.productCode) return null;
  const p = await prisma.product.findFirst({
    where: {
      tenantId: params.tenantId,
      productCode: params.productCode,
      active: true,
      ...(params.clienteId ? { clienteId: params.clienteId } : {}),
      OR: [{ versionVigente: { gt: 0 } }, { fractionCode: { not: null } }],
    },
    select: { id: true, fractionCode: true },
  });
  return p ? { productId: p.id, fractionCode: p.fractionCode } : null;
}

export function limpiarFraccion(code: string | null | undefined): string {
  return (code ?? '').replace(/[.\s-]/g, '');
}

interface ResultadoJob {
  status: string;
  classificationId: string | null;
  result: unknown;
  error: ClassificationJobError | null;
}

/**
 * Encola UNA fila como ClassificationJob y lo corre con el runner inyectado.
 * Si el usuario tiene otro job activo (índice único parcial), espera y
 * reintenta unas veces antes de rendirse.
 */
async function ejecutarFilaComoJob(params: {
  tenantId: string;
  userId: string;
  clienteId: string | null;
  userRole?: string;
  fila: { descripcion: string; contexto: string | null; paisOrigen: string | null; valorUSD: number | null; usoDestino: string | null };
  deps: DependenciasLote;
}): Promise<{ jobId: string | null; job: ResultadoJob }> {
  const { tenantId, userId, clienteId, userRole, fila, deps } = params;
  const inputs: ClassificationJobInputs = {
    description: fila.descripcion,
    context: fila.contexto ?? undefined,
    countryOfOrigin: fila.paisOrigen ?? undefined,
    declaredValueUSD: fila.valorUSD ?? undefined,
    useCase: fila.usoDestino ?? undefined,
    importerType: fila.usoDestino === 'INSUMO_IMMEX' ? 'IMMEX' : fila.usoDestino === 'VENTA_DIRECTA' ? 'DEFINITIVO' : undefined,
    userRole,
  };

  let jobId: string | null = null;
  for (let intento = 0; intento < 20 && !jobId; intento++) {
    try {
      const job = await prisma.classificationJob.create({
        data: { tenantId, userId, clienteId, inputs: inputs as unknown as object },
        select: { id: true },
      });
      jobId = job.id;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Otro job activo del mismo usuario (p. ej. clasificación manual en
      // curso): esperar a que termine.
      await new Promise(r => setTimeout(r, deps.pausaEntreFilasMs ? 3000 : 10));
    }
  }
  if (!jobId) {
    return {
      jobId: null,
      job: { status: 'error', classificationId: null, result: null, error: { code: 'TIMEOUT', message: 'No pude encolar la fila: el usuario tiene otra clasificación en curso que no termina.', retriable: true } },
    };
  }

  await deps.correrJob(jobId);
  const job = await prisma.classificationJob.findFirst({
    where: { id: jobId, tenantId },
    select: { status: true, classificationId: true, result: true, error: true },
  });
  return {
    jobId,
    job: job
      ? { status: job.status, classificationId: job.classificationId, result: job.result, error: (job.error as ClassificationJobError | null) ?? null }
      : { status: 'error', classificationId: null, result: null, error: { code: 'ERROR_INTERNO', message: 'El job desapareció durante el procesamiento.', retriable: true } },
  };
}

interface PayloadJob {
  fraction?: { code?: string };
  confidence?: number;
  alerts?: Array<{ severity?: ClassifierAlertSeverity }>;
}

/**
 * Procesa el lote completo, fila por fila. Idempotente respecto a filas ya
 * procesadas (con semáforo) — permite reanudar tras un reinicio.
 */
export async function procesarLote(batchId: string, deps: DependenciasLote = DEPENDENCIAS_REALES): Promise<void> {
  // Worker de fondo: llega solo el id (importarLote lo encola; reanudarLotesInterrumpidos
  // lo levanta al arrancar). La primera lectura resuelve el tenant y desde ahí TODO va
  // acotado por batch.tenantId. Sin este bypass explícito, TENANT_GUARD_STRICT=1 (prod)
  // tumbaba cada lote antes de procesar una sola fila.
  const { sinGuardaDeTenant } = await import('../lib/tenant-guard');
  const batch = await sinGuardaDeTenant(() => prisma.classificationBatch.findFirst({
    where: { id: batchId },
    select: { id: true, tenantId: true, userId: true, clienteId: true, status: true },
  }));
  if (!batch) return;
  if (batch.status === 'done' || batch.status === 'failed') return;

  const claimed = await prisma.classificationBatch.updateMany({
    where: { id: batchId, tenantId: batch.tenantId, status: { in: ['queued', 'running'] } },
    data: { status: 'running', startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const usuario = await prisma.user.findFirst({ where: { id: batch.userId }, select: { role: true } });
  const userRole = usuario?.role ?? undefined;

  const filas = await prisma.classificationBatchRow.findMany({
    where: { batchId, batch: { tenantId: batch.tenantId }, semaforo: null },
    orderBy: { numeroFila: 'asc' },
  });

  let fallasConsecutivas = 0;
  let detenido: string | null = null;

  for (const fila of filas) {
    if (detenido) {
      await registrarFila(batch.tenantId, batchId, fila.id, { semaforo: 'rojo', error: detenido });
      continue;
    }

    // Validación barata: texto basura → rojo sin gastar una llamada de IA.
    const val = validateClassifyInput(fila.descripcion);
    if (!val.ok) {
      await registrarFila(batch.tenantId, batchId, fila.id, { semaforo: 'rojo', error: val.reason });
      continue;
    }

    const catalogo = await fraccionDeCatalogo({ tenantId: batch.tenantId, clienteId: batch.clienteId, productCode: fila.productCode });

    let jobId: string | null = null;
    let job: ResultadoJob;
    try {
      ({ jobId, job } = await ejecutarFilaComoJob({
        tenantId: batch.tenantId, userId: batch.userId, clienteId: batch.clienteId, userRole, fila, deps,
      }));
    } catch (err) {
      logger.error('lote: fila reventó fuera del pipeline', { tenantId: batch.tenantId, entity: 'ClassificationBatch', entityId: batchId, metadata: { filaId: fila.id, error: err instanceof Error ? err.message : String(err) } });
      job = { status: 'error', classificationId: null, result: null, error: { code: 'ERROR_INTERNO', message: 'Error interno al procesar la fila.', retriable: true } };
    }

    if (job.status === 'done' && job.result) {
      fallasConsecutivas = 0;
      const payload = job.result as PayloadJob;
      const fractionCode = limpiarFraccion(payload.fraction?.code) || null;
      const fraccionCatalogo = catalogo?.fractionCode ? limpiarFraccion(catalogo.fractionCode) : null;
      const coincideCatalogo = fraccionCatalogo && fractionCode ? fraccionCatalogo === fractionCode : null;
      const semaforo = semaforoDeFila({
        confidence: payload.confidence,
        fractionCode,
        coincideCatalogo,
        alertas: (payload.alerts ?? []).map(a => a.severity).filter((s): s is ClassifierAlertSeverity => !!s),
      });
      await registrarFila(batch.tenantId, batchId, fila.id, {
        semaforo,
        fractionCode,
        confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
        coincideCatalogo,
        fraccionCatalogo,
        classificationId: job.classificationId,
        jobId,
        productId: catalogo?.productId ?? null,
      });
      if (job.classificationId && batch.clienteId) {
        await prisma.classification.updateMany({ where: { id: job.classificationId, tenantId: batch.tenantId }, data: { clienteId: batch.clienteId } });
      }
    } else {
      const err = job.error;
      const esValidacion = err?.code === 'VALIDACION';
      if (!esValidacion) fallasConsecutivas++;
      await registrarFila(batch.tenantId, batchId, fila.id, {
        semaforo: 'rojo',
        error: err?.message ?? 'La clasificación falló.',
        jobId,
      });
      if (fallasConsecutivas >= MAX_FALLAS_CONSECUTIVAS) {
        detenido = `Lote detenido: ${MAX_FALLAS_CONSECUTIVAS} fallas consecutivas del servicio de clasificación (crédito/cuota del proveedor de IA o error interno). Las filas restantes no se procesaron — reintenta más tarde.`;
        logger.warn('lote detenido por fallas consecutivas', { tenantId: batch.tenantId, entity: 'ClassificationBatch', entityId: batchId, metadata: { fallasConsecutivas } });
      }
    }

    if (deps.pausaEntreFilasMs) await new Promise(r => setTimeout(r, deps.pausaEntreFilasMs));
  }

  await prisma.classificationBatch.updateMany({
    where: { id: batchId, tenantId: batch.tenantId },
    data: { status: detenido ? 'failed' : 'done', errorMsg: detenido, finishedAt: new Date() },
  });
}

async function registrarFila(tenantId: string, batchId: string, filaId: string, data: {
  semaforo: Semaforo;
  error?: string | null;
  fractionCode?: string | null;
  confidence?: number | null;
  coincideCatalogo?: boolean | null;
  fraccionCatalogo?: string | null;
  classificationId?: string | null;
  jobId?: string | null;
  productId?: string | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.classificationBatchRow.updateMany({
      where: { id: filaId, batchId, batch: { tenantId } },
      data: {
        semaforo: data.semaforo,
        error: data.error ?? null,
        fractionCode: data.fractionCode ?? null,
        confidence: data.confidence ?? null,
        coincideCatalogo: data.coincideCatalogo ?? null,
        fraccionCatalogo: data.fraccionCatalogo ?? null,
        classificationId: data.classificationId ?? null,
        jobId: data.jobId ?? null,
        productId: data.productId ?? null,
      },
    }),
    prisma.classificationBatch.updateMany({
      where: { id: batchId, tenantId },
      data: {
        procesadas: { increment: 1 },
        ...(data.semaforo === 'verde' ? { verdes: { increment: 1 } } : {}),
        ...(data.semaforo === 'ambar' ? { ambar: { increment: 1 } } : {}),
        ...(data.semaforo === 'rojo' ? { rojas: { increment: 1 } } : {}),
      },
    }),
  ]);
}

/** Importa (parsea + crea + arranca en background). Devuelve el lote creado. */
export async function importarLote(params: {
  tenantId: string;
  userId: string;
  clienteId?: string | null;
  nombreArchivo: string;
  base64: string;
  deps?: DependenciasLote;
  /** false en tests para no arrancar el procesamiento. */
  arrancar?: boolean;
}): Promise<{ id: string; totalFilas: number; omitidas: ResultadoParseo['omitidas']; columnas: Record<string, CampoLote> }> {
  const parseo = parsearArchivoLote(params.base64, params.nombreArchivo);
  const lote = await crearLote({
    tenantId: params.tenantId,
    userId: params.userId,
    clienteId: params.clienteId,
    nombreArchivo: params.nombreArchivo,
    filas: parseo.filas,
  });
  if (params.arrancar !== false) {
    // Fire-and-forget deliberado: el POST ya respondió. Los errores quedan en el lote.
    void procesarLote(lote.id, params.deps ?? DEPENDENCIAS_REALES).catch(err => {
      logger.error('lote: procesamiento reventó', { tenantId: params.tenantId, entity: 'ClassificationBatch', entityId: lote.id, metadata: { error: err instanceof Error ? err.message : String(err) } });
      void prisma.classificationBatch.updateMany({
        where: { id: lote.id, tenantId: params.tenantId, status: { in: ['queued', 'running'] } },
        data: { status: 'failed', errorMsg: 'El procesamiento del lote falló por un error interno.', finishedAt: new Date() },
      }).catch(() => {});
    });
  }
  return { ...lote, omitidas: parseo.omitidas, columnas: parseo.columnas };
}

/**
 * Al arrancar el servidor: los lotes que quedaron 'running' pertenecen a un
 * proceso muerto. Se reanudan (las filas ya procesadas se respetan).
 */
export async function reanudarLotesInterrumpidos(deps: DependenciasLote = DEPENDENCIAS_REALES): Promise<number> {
  const { sinGuardaDeTenant } = await import('../lib/tenant-guard');
  const pendientes = await sinGuardaDeTenant(() => prisma.classificationBatch.findMany({
    where: { status: { in: ['queued', 'running'] } },
    select: { id: true },
  }));
  for (const b of pendientes) {
    void procesarLote(b.id, deps).catch(err => logger.error('lote: reanudación falló', { entity: 'ClassificationBatch', entityId: b.id, metadata: { error: String(err) } }));
  }
  return pendientes.length;
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Export a Excel
// ─────────────────────────────────────────────────────────────────────────

export const COLUMNAS_EXPORT = [
  'Fila', 'Código', 'Descripción', 'Contexto', 'País origen', 'Valor USD', 'Uso/destino',
  'Fracción', 'NICO', 'Confianza', 'Semáforo', 'Coincide catálogo', 'Fracción catálogo',
  'Alternativas descartadas', 'Revisado', 'Error',
] as const;

export interface FilaExport {
  numeroFila: number;
  productCode: string | null;
  descripcion: string;
  contexto: string | null;
  paisOrigen: string | null;
  valorUSD: number | null;
  usoDestino: string | null;
  fractionCode: string | null;
  nico: string | null;
  confidence: number | null;
  semaforo: string | null;
  coincideCatalogo: boolean | null;
  fraccionCatalogo: string | null;
  alternativas: string;
  revisado: boolean;
  error: string | null;
}

export function formatearFraccion(code: string | null): string {
  const c = limpiarFraccion(code);
  if (c.length !== 8) return code ?? '';
  return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}`;
}

export function construirLibroExport(filas: FilaExport[]): Buffer {
  const aoa: unknown[][] = [[...COLUMNAS_EXPORT]];
  for (const f of filas) {
    aoa.push([
      f.numeroFila,
      f.productCode ?? '',
      f.descripcion,
      f.contexto ?? '',
      f.paisOrigen ?? '',
      f.valorUSD ?? '',
      f.usoDestino ?? '',
      f.fractionCode ? formatearFraccion(f.fractionCode) : '',
      f.nico ?? '',
      f.confidence ?? '',
      f.semaforo ?? 'pendiente',
      f.coincideCatalogo === null ? 'sin parte en catálogo' : f.coincideCatalogo ? 'sí' : 'no',
      f.fraccionCatalogo ? formatearFraccion(f.fraccionCatalogo) : '',
      f.alternativas,
      f.revisado ? 'sí' : 'no',
      f.error ?? '',
    ]);
  }
  const wb = XLSX.utils.book_new();
  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  hoja['!cols'] = [6, 14, 60, 30, 10, 10, 14, 12, 8, 10, 10, 18, 14, 50, 9, 50].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, hoja, 'Resultado');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Junta filas del lote con su Classification (NICO, alternativas) y arma el Excel. */
export async function exportarLoteXlsx(tenantId: string, batchId: string): Promise<{ nombre: string; buffer: Buffer } | null> {
  const batch = await prisma.classificationBatch.findFirst({
    where: { id: batchId, tenantId },
    select: { id: true, nombreArchivo: true, filas: { orderBy: { numeroFila: 'asc' } } },
  });
  if (!batch) return null;
  const ids = batch.filas.map(f => f.classificationId).filter((x): x is string => !!x);
  const clasificaciones = ids.length
    ? await prisma.classification.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, alternatives: true, fullResponse: true },
    })
    : [];
  const porId = new Map(clasificaciones.map(c => [c.id, c]));
  const filas: FilaExport[] = batch.filas.map(f => {
    const c = f.classificationId ? porId.get(f.classificationId) : undefined;
    let nico: string | null = null;
    let alternativas = '';
    if (c) {
      try {
        const full = c.fullResponse ? JSON.parse(c.fullResponse) as { nico?: string; datosCanonicos?: { nico?: { valor?: string[] } } } : null;
        nico = full?.nico || (full?.datosCanonicos?.nico?.valor?.length === 1 ? full.datosCanonicos.nico.valor[0] : null) || null;
      } catch { /* fullResponse ilegible → sin NICO */ }
      try {
        const alts = c.alternatives ? JSON.parse(c.alternatives) as Array<{ code?: string; reason?: string; confidence?: number }> : [];
        alternativas = alts.map(a => `${formatearFraccion(a.code ?? '')}${a.confidence != null ? ` (${a.confidence})` : ''}${a.reason ? `: ${a.reason}` : ''}`).join(' | ');
      } catch { /* alternativas ilegibles */ }
    }
    return {
      numeroFila: f.numeroFila,
      productCode: f.productCode,
      descripcion: f.descripcion,
      contexto: f.contexto,
      paisOrigen: f.paisOrigen,
      valorUSD: f.valorUSD,
      usoDestino: f.usoDestino,
      fractionCode: f.fractionCode,
      nico,
      confidence: f.confidence,
      semaforo: f.semaforo,
      coincideCatalogo: f.coincideCatalogo,
      fraccionCatalogo: f.fraccionCatalogo,
      alternativas,
      revisado: f.revisado,
      error: f.error,
    };
  });
  const base = batch.nombreArchivo.replace(/\.(xlsx|xls|csv)$/i, '');
  return { nombre: `${base}-clasificado.xlsx`, buffer: construirLibroExport(filas) };
}
