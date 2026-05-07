/**
 * Búsqueda híbrida (vector + keyword) sobre LegalDocument para alimentar al Copilot.
 *
 * Pipeline:
 *   1. Genera embedding de la query
 *   2. Carga LegalDocuments activos (paginado en memoria — funciona hasta ~5k docs)
 *   3. Calcula cosine similarity contra cada uno
 *   4. Re-ranking con boost por keyword match en topics/keywords/fractionRefs
 *   5. Devuelve top-K con score combinado
 */

import { prisma } from '../lib/prisma';
import { generateEmbedding, cosineSimilarity } from '../lib/embeddings';

export interface RetrievedDoc {
  id: string;
  type: string;
  source: string;
  title: string;
  reference: string;
  content: string;
  excerpt: string;
  officialUrl: string | null;
  effectiveDate: string | null;
  topics: string[];
  fractionRefs: string[];
  similarity: number;
  keywordScore: number;
  finalScore: number;
}

const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'que', 'y', 'a', 'en', 'al', 'del', 'es', 'son', 'se', 'su', 'con', 'por', 'para']);

function extractTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9áéíóúñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function makeExcerpt(content: string, query: string, maxLen = 280): string {
  const tokens = extractTokens(query);
  const lower = content.toLowerCase();
  let bestIdx = 0;
  let bestHits = 0;
  for (let i = 0; i < lower.length; i += 50) {
    const window = lower.slice(i, i + maxLen);
    const hits = tokens.reduce((s, t) => s + (window.includes(t) ? 1 : 0), 0);
    if (hits > bestHits) { bestHits = hits; bestIdx = i; }
  }
  const excerpt = content.slice(bestIdx, bestIdx + maxLen).trim();
  return (bestIdx > 0 ? '…' : '') + excerpt + (bestIdx + maxLen < content.length ? '…' : '');
}

export async function searchLegalDocuments(query: string, opts: { topK?: number; topics?: string[]; types?: string[] } = {}): Promise<RetrievedDoc[]> {
  const topK = opts.topK ?? 5;
  const queryEmbedding = await generateEmbedding(query);
  const queryTokens = extractTokens(query);

  // Filtros opcionales
  const where: Record<string, unknown> = { isActive: true };
  if (opts.topics && opts.topics.length > 0) where.topics = { hasSome: opts.topics };
  if (opts.types && opts.types.length > 0) where.type = { in: opts.types };

  const docs = await prisma.legalDocument.findMany({
    where,
    select: {
      id: true, type: true, source: true, title: true, reference: true,
      content: true, officialUrl: true, effectiveDate: true,
      topics: true, fractionRefs: true, keywords: true, embedding: true,
    },
  });

  const scored: RetrievedDoc[] = docs.map(d => {
    const similarity = d.embedding && d.embedding.length === queryEmbedding.length
      ? cosineSimilarity(queryEmbedding, d.embedding)
      : 0;

    // Keyword score: hits en title + reference + topics + keywords + fractionRefs
    const haystack = [
      d.title, d.reference,
      ...(d.topics ?? []),
      ...(d.keywords ?? []),
      ...(d.fractionRefs ?? []),
    ].join(' ').toLowerCase();
    let kwHits = 0;
    for (const t of queryTokens) if (haystack.includes(t)) kwHits++;
    const keywordScore = queryTokens.length > 0 ? kwHits / queryTokens.length : 0;

    // Score combinado: 70% similitud vectorial + 30% keyword (favor a precisión semántica)
    const finalScore = similarity * 0.7 + keywordScore * 0.3;

    return {
      id: d.id,
      type: d.type,
      source: d.source,
      title: d.title,
      reference: d.reference,
      content: d.content,
      excerpt: makeExcerpt(d.content, query),
      officialUrl: d.officialUrl,
      effectiveDate: d.effectiveDate?.toISOString() ?? null,
      topics: d.topics,
      fractionRefs: d.fractionRefs,
      similarity,
      keywordScore,
      finalScore,
    };
  });

  return scored.sort((a, b) => b.finalScore - a.finalScore).slice(0, topK);
}
