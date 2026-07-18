/**
 * Wrapper de embeddings — usa OpenAI text-embedding-3-small si OPENAI_API_KEY
 * está configurada. Si no, fallback a hashed bag-of-words determinista (256
 * dimensiones) que sigue produciendo similitudes razonables para keyword match
 * sin gasto externo.
 *
 * Función de cosine similarity in-process — funcional para hasta ~5,000 docs.
 * Para escala mayor, migrar a pgvector + ivfflat.
 */

import { logger } from './logger';

const EMBEDDING_DIM_FALLBACK = 256;

const stopwords = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'que', 'a', 'en', 'al',
  'se', 'su', 'sus', 'es', 'son', 'lo', 'por', 'para', 'con', 'sin', 'sobre', 'entre', 'como',
  'no', 'si', 'mi', 'tu', 'me', 'te', 'le', 'les', 'del', 'esta', 'este', 'esa', 'ese',
  'the', 'of', 'to', 'and', 'in', 'is', 'a', 'an', 'or', 'for', 'with', 'on', 'at',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9áéíóúñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Embedding fallback: bag-of-words proyectado a 256 dimensiones por hashing trick. */
function fallbackEmbedding(text: string): number[] {
  const v = new Array(EMBEDDING_DIM_FALLBACK).fill(0);
  const tokens = tokenize(text);
  for (const t of tokens) {
    const idx = hashStr(t) % EMBEDDING_DIM_FALLBACK;
    v[idx]! += 1;
  }
  // Normalizar L2
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / norm);
}

/**
 * Genera un embedding. Proveedor por env var:
 *   - VOYAGE_API_KEY  → Voyage AI (modelo en EMBEDDING_MODEL, default voyage-4, 1024 dim).
 *                       input_type ('query' | 'document') mejora el retrieval asimétrico.
 *   - OPENAI_API_KEY  → OpenAI text-embedding-3-small (1536 dim).
 *   - ninguna         → fallback hashed (256 dim).
 *
 * IMPORTANTE: al cambiar de proveedor cambia la dimensión → re-embedar TODO el corpus
 * (cosineSimilarity excluye vectores de distinta longitud).
 */
const VOYAGE_MODEL = process.env.EMBEDDING_MODEL || 'voyage-4';
const VOYAGE_DIM = 1024;
const OPENAI_DIM = 1536;
const DEFAULT_VOYAGE_TIMEOUT_MS = 10000;
const DEFAULT_VOYAGE_TOTAL_TIMEOUT_MS = 30000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface EmbeddingTimeoutConfig {
  perAttemptTimeoutMs: number;
  totalTimeoutMs: number;
}

function positiveTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  const milliseconds = Math.floor(parsed);
  return Number.isFinite(parsed) && milliseconds > 0 ? milliseconds : fallback;
}

/** Timeouts de embeddings, leídos por llamada para permitir cambios de env en tests. */
export function getEmbeddingTimeoutConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingTimeoutConfig {
  return {
    perAttemptTimeoutMs: positiveTimeout(env.VOYAGE_TIMEOUT_MS, DEFAULT_VOYAGE_TIMEOUT_MS),
    totalTimeoutMs: positiveTimeout(env.VOYAGE_TOTAL_TIMEOUT_MS, DEFAULT_VOYAGE_TOTAL_TIMEOUT_MS),
  };
}

class EmbeddingTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingTimeoutError';
  }
}

function remainingBudgetMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function totalTimeoutError(totalTimeoutMs: number): EmbeddingTimeoutError {
  return new EmbeddingTimeoutError(`Presupuesto global de embeddings agotado (${totalTimeoutMs}ms)`);
}

async function withEmbeddingFetchTimeout<T>(
  deadline: number,
  perAttemptTimeoutMs: number,
  totalTimeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const remaining = remainingBudgetMs(deadline);
  if (remaining <= 0) throw totalTimeoutError(totalTimeoutMs);

  const timeoutMs = Math.min(perAttemptTimeoutMs, remaining);
  const limitedByTotalBudget = remaining <= perAttemptTimeoutMs;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (err) {
    if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
      const scope = limitedByTotalBudget ? 'presupuesto global' : 'intento';
      throw new EmbeddingTimeoutError(`Timeout de embedding por ${scope} (${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function embeddingErrorReason(err: unknown): 'timeout' | 'error de red' | 'error' {
  if (err instanceof EmbeddingTimeoutError || (err instanceof Error && err.name === 'AbortError')) {
    return 'timeout';
  }
  return err instanceof TypeError ? 'error de red' : 'error';
}

/**
 * Dimensión esperada del embedding según el proveedor configurado. El corpus
 * DEBE ser dimensionalmente uniforme: cosineSimilarity devuelve 0 entre vectores
 * de distinta longitud, así que un doc con dim equivocada queda invisible para el
 * retrieval semántico. Los escritores del corpus deben validar contra esto.
 */
export const EMBEDDING_DIM = process.env.VOYAGE_API_KEY
  ? VOYAGE_DIM
  : process.env.OPENAI_API_KEY
    ? OPENAI_DIM
    : EMBEDDING_DIM_FALLBACK;

/**
 * Rechaza un embedding cuya dimensión no sea la esperada por el proveedor activo.
 * Pensado para los ESCRITORES del corpus (seed, endpoints de alta): mejor truene
 * visible que persistir una dim equivocada (p.ej. el fallback hashed de 256 tras
 * un 429 de Voyage) y corromper el corpus en silencio.
 */
export function assertCorpusEmbedding(embedding: number[], ctx = 'corpus'): void {
  // HUECO CERRADO (2026-07-02): sin proveedor real configurado, EMBEDDING_DIM
  // "esperado" era el fallback hashed (256) y este assert aceptaba corpus
  // envenenado como válido — así se sembraron docs a 256 en prod desde una
  // máquina sin VOYAGE_API_KEY. Los ESCRITORES del corpus requieren proveedor
  // real SIEMPRE: el hashed es solo para el path de LECTURA resiliente.
  if (!process.env.VOYAGE_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error(
      `Escritura al corpus BLOQUEADA para "${ctx}": no hay proveedor de embeddings configurado ` +
      `(falta VOYAGE_API_KEY/OPENAI_API_KEY) y el fallback hashed de ${EMBEDDING_DIM_FALLBACK} dims ` +
      `corrompería el corpus. Exporta la llave (railway variables) antes de seedear.`,
    );
  }
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding inválido para "${ctx}": dim ${embedding.length} ≠ ${EMBEDDING_DIM} esperado por el proveedor activo. ` +
      `Se RECHAZA para no corromper el corpus (probable fallback por fallo del proveedor de embeddings). ` +
      `Reintenta el seed/alta cuando Voyage responda correctamente.`,
    );
  }
}

/** Voyage con reintentos + backoff exponencial en 429 / 5xx / error de red.
 *  Lanza tras agotar los intentos (NO cae a hashed aquí; eso lo decide el caller). */
async function voyageEmbedWithRetry(
  text: string,
  inputType: 'query' | 'document' | null,
  deadline: number,
  timeoutConfig: EmbeddingTimeoutConfig,
  attempts = 6,
): Promise<number[]> {
  let lastErr: unknown;
  for (let a = 0; a < attempts; a++) {
    if (remainingBudgetMs(deadline) <= 0) {
      lastErr = totalTimeoutError(timeoutConfig.totalTimeoutMs);
      break;
    }

    try {
      const attemptResult = await withEmbeddingFetchTimeout(
        deadline,
        timeoutConfig.perAttemptTimeoutMs,
        timeoutConfig.totalTimeoutMs,
        async (signal) => {
          const res = await fetch('https://api.voyageai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
            },
            body: JSON.stringify({
              model: VOYAGE_MODEL,
              input: [text.slice(0, 30000)],
              input_type: inputType,
              output_dimension: VOYAGE_DIM,
            }),
            signal,
          });
          if (res.status === 429 || res.status >= 500) {
            return { retryStatus: res.status } as const;
          }
          // 4xx no-429 → no reintentable
          if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text().catch(() => '')}`);
          const data = await res.json() as { data: { embedding: number[] }[] };
          const embedding = data.data[0]!.embedding;
          if (embedding.length !== VOYAGE_DIM) {
            throw new Error(`Voyage devolvió dim ${embedding.length} ≠ ${VOYAGE_DIM}`);
          }
          return { embedding } as const;
        },
      );
      // 429 / 5xx → reintentable con backoff
      if ('retryStatus' in attemptResult) {
        lastErr = new Error(`Voyage ${attemptResult.retryStatus}`);
        const wait = Math.min(60000, 1000 * 2 ** a, remainingBudgetMs(deadline));
        logger.warn(`Embedding Voyage ${attemptResult.retryStatus} — backoff ${wait}ms (intento ${a + 1}/${attempts})`, {
          action: 'embedding_retry',
          metadata: { status: attemptResult.retryStatus, attempt: a + 1, reason: 'error HTTP' },
        });
        const sleepMs = Math.min(wait, remainingBudgetMs(deadline));
        if (sleepMs > 0) await sleep(sleepMs);
        continue;
      }
      return attemptResult.embedding;
    } catch (err) {
      // error de red / parse → reintentable con backoff
      lastErr = err;
      const reason = embeddingErrorReason(err);
      const wait = Math.min(60000, 1000 * 2 ** a, remainingBudgetMs(deadline));
      logger.warn(`Embedding Voyage ${reason} — backoff ${wait}ms (intento ${a + 1}/${attempts})`, {
        action: 'embedding_retry', errorMessage: err instanceof Error ? err.message : String(err),
        metadata: { attempt: a + 1, reason },
      });
      const sleepMs = Math.min(wait, remainingBudgetMs(deadline));
      if (sleepMs > 0) await sleep(sleepMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Voyage: agotados los reintentos');
}

export async function generateEmbedding(
  text: string,
  inputType: 'query' | 'document' | null = null,
): Promise<number[]> {
  const timeoutConfig = getEmbeddingTimeoutConfig();
  const deadline = Date.now() + timeoutConfig.totalTimeoutMs;

  // 1) Voyage AI (preferido) — con reintentos/backoff en 429. Solo cae al hashed
  // tras agotar los reintentos (resiliencia del path de lectura). Los ESCRITORES
  // del corpus deben validar con assertCorpusEmbedding para no persistir un fallback.
  if (process.env.VOYAGE_API_KEY) {
    try {
      return await voyageEmbedWithRetry(text, inputType, deadline, timeoutConfig);
    } catch (err) {
      logger.warn('Embedding Voyage fallback to hashed (tras agotar reintentos)', {
        action: 'embedding_fallback', errorMessage: err instanceof Error ? err.message : String(err),
      });
      return fallbackEmbedding(text);
    }
  }

  // 2) OpenAI (compatibilidad)
  if (process.env.OPENAI_API_KEY) {
    try {
      return await withEmbeddingFetchTimeout(
        deadline,
        timeoutConfig.perAttemptTimeoutMs,
        timeoutConfig.totalTimeoutMs,
        async (signal) => {
          const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
            signal,
          });
          if (!res.ok) {
            throw new Error(`OpenAI ${res.status}: ${await res.text().catch(() => '')}`);
          }
          const data = await res.json() as { data: { embedding: number[] }[] };
          return data.data[0]!.embedding;
        },
      );
    } catch (err) {
      const reason = embeddingErrorReason(err);
      logger.warn(`Embedding OpenAI fallback to hashed (${reason}, intento 1/1)`, {
        action: 'embedding_fallback', errorMessage: err instanceof Error ? err.message : String(err),
        metadata: { attempt: 1, reason },
      });
      return fallbackEmbedding(text);
    }
  }

  // 3) Fallback hashed
  return fallbackEmbedding(text);
}

/** Cosine similarity entre dos vectores. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/** True si hay un proveedor real configurado (Voyage u OpenAI). False si fallback. */
export function isRealEmbeddingProvider(): boolean {
  return !!(process.env.VOYAGE_API_KEY || process.env.OPENAI_API_KEY);
}
