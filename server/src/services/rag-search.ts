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

// Mapeo de palabras clave de la query a topics del corpus.
// Cuando la pregunta contiene términos de un dominio (auto, textil, etc.),
// los docs cuyo topics[] no toca ese dominio se penalizan fuertemente.
const TOPIC_KEYWORDS: Record<string, string[]> = {
  automotriz: ['automotriz', 'auto', 'autos', 'vehiculo', 'vehículo', 'vehiculos', 'vehículos', 'coche', 'camion', 'camión', 'autopart', 'autopartes', '8703', '8708'],
  textil: ['textil', 'textiles', 'tela', 'telas', 'prenda', 'prendas', 'ropa', 'algodon', 'algodón', 'confeccion', 'confección', 'hilado', 'hilados', 'yarn'],
  immex: ['immex', 'maquila', 'maquiladora', 'temporal', 'iva-ieps', 'ivaIeps', 'aaa', 'certificacion'],
  valoracion: ['valoracion', 'valoración', 'valor aduana', 'garantia', 'garantía', 'subvaluacion', 'subvaluación', 'precio estimado', 'transaccion', 'transacción', 'vinculacion', 'vinculación', 'incrementables'],
  antidumping: ['antidumping', 'cuota compensatoria', 'dumping', 'upci', 'compensatoria'],
  origen: ['origen', 'tmec', 'tlcuem', 'cptpp', 'rvc', 'lvc', 'yarn-forward', 'preferencial'],
  clasificacion: ['clasificacion', 'clasificación', 'fraccion', 'fracción', 'partida', 'subpartida', 'gri', 'arancelaria'],
  padrones: ['padron', 'padrón', 'anexo 10', 'sectorial', 'sector'],
  sanciones: ['multa', 'multas', 'sancion', 'sanción', 'pama', 'infraccion', 'infracción', 'embargo'],
  inventarios: ['inventario', 'inventarios', 'descargo', 'descargos', 'anexo 24', 'anexo 30'],
  pedimento: ['pedimento', 'anexo 22', 'a1', 'in', 'rt', 'mve', 'manifestacion', 'manifestación'],
  noms: ['nom', 'noms', 'anexo 2.4.1', 'etiquetado'],
};

// Mapa inverso country → tratado correcto (para evitar que el Copilot
// diga "TMEC" cuando el país es UE, japonés, chino, etc.)
const COUNTRY_TO_TREATY: Record<string, string> = {
  // TMEC
  'mx': 'TMEC', 'us': 'TMEC', 'usa': 'TMEC', 'eua': 'TMEC', 'ca': 'TMEC', 'mexico': 'TMEC',
  'estados unidos': 'TMEC', 'canada': 'TMEC', 'canadá': 'TMEC',
  // TLCUEM
  'de': 'TLCUEM', 'fr': 'TLCUEM', 'it': 'TLCUEM', 'es': 'TLCUEM', 'nl': 'TLCUEM',
  'alemania': 'TLCUEM', 'francia': 'TLCUEM', 'italia': 'TLCUEM', 'espana': 'TLCUEM', 'españa': 'TLCUEM',
  // CPTPP
  'jp': 'CPTPP', 'au': 'CPTPP', 'nz': 'CPTPP', 'vn': 'CPTPP', 'sg': 'CPTPP',
  'japon': 'CPTPP', 'japón': 'CPTPP', 'vietnam': 'CPTPP',
};

export function detectQueryTopics(query: string): string[] {
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hits: string[] = [];
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      const kwn = kw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (q.includes(kwn)) { hits.push(topic); break; }
    }
  }
  return hits;
}

export function detectCountryTreaty(query: string): string | null {
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [country, treaty] of Object.entries(COUNTRY_TO_TREATY)) {
    const cn = country.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (q.includes(' ' + cn) || q.includes(cn + ' ') || q.startsWith(cn) || q.endsWith(cn)) {
      return treaty;
    }
  }
  return null;
}

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
  const detectedTopics = detectQueryTopics(query);

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

    // Topic relevance: si la query tiene topics detectados, el doc debe
    // tocar al menos uno. Si no, penalización del 80% (efectivamente lo
    // saca del top-K). Esto evita que pregunta de auto traiga textiles.
    let topicMultiplier = 1.0;
    if (detectedTopics.length > 0) {
      const docTopics = new Set(d.topics ?? []);
      const overlap = detectedTopics.filter(t => docTopics.has(t)).length;
      if (overlap === 0) topicMultiplier = 0.2;        // off-topic
      else if (overlap === detectedTopics.length) topicMultiplier = 1.15; // todos los topics → boost
    }

    // Score combinado: 70% similitud vectorial + 30% keyword, ajustado por topic
    const baseScore = similarity * 0.7 + keywordScore * 0.3;
    const finalScore = Math.min(1, baseScore * topicMultiplier);

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
