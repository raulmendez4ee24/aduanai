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

export async function generateEmbedding(
  text: string,
  inputType: 'query' | 'document' | null = null,
): Promise<number[]> {
  // 1) Voyage AI (preferido)
  if (process.env.VOYAGE_API_KEY) {
    try {
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
      });
      if (!res.ok) {
        throw new Error(`Voyage ${res.status}: ${await res.text().catch(() => '')}`);
      }
      const data = await res.json() as { data: { embedding: number[] }[] };
      return data.data[0]!.embedding;
    } catch (err) {
      logger.warn('Embedding Voyage fallback to hashed', {
        action: 'embedding_fallback', errorMessage: err instanceof Error ? err.message : String(err),
      });
      return fallbackEmbedding(text);
    }
  }

  // 2) OpenAI (compatibilidad)
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
      });
      if (!res.ok) {
        throw new Error(`OpenAI ${res.status}: ${await res.text().catch(() => '')}`);
      }
      const data = await res.json() as { data: { embedding: number[] }[] };
      return data.data[0]!.embedding;
    } catch (err) {
      logger.warn('Embedding OpenAI fallback to hashed', {
        action: 'embedding_fallback', errorMessage: err instanceof Error ? err.message : String(err),
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
