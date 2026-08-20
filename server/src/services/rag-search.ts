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
import { parseReferencia } from './citas-legales';
import { generateEmbedding, cosineSimilarity } from '../lib/embeddings';
import { llmGenerate } from '../lib/llm';
import { logger } from '../lib/logger';

export interface RetrievedDoc {
  id: string;
  type: string;
  /** 'texto_integro' (verbatim con cotejo) | 'resumen' (síntesis operativa). */
  claseTexto: string;
  source: string;
  title: string;
  reference: string;
  content: string;
  excerpt: string;
  officialUrl: string | null;
  effectiveDate: string | null;
  topics: string[];
  keywords: string[];
  fractionRefs: string[];
  similarity: number;
  keywordScore: number;
  finalScore: number;
}

const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'que', 'y', 'a', 'en', 'al', 'del', 'es', 'son', 'se', 'su', 'con', 'por', 'para']);

// Mapeo de palabras clave de la query a topics del corpus.
// Cuando la pregunta contiene términos de un dominio (auto, textil, etc.),
// los docs cuyo topics[] no toca ese dominio se penalizan fuertemente.
//
// IMPORTANTE: el corpus usa 'inmex' (typo histórico) y también 'immex' por
// inconsistencia entre seeds. El detector emite AMBAS variantes vía
// TOPIC_ALIASES más abajo para que el filtro funcione.
export const TOPIC_KEYWORDS: Record<string, string[]> = {
  automotriz: ['automotriz', 'auto', 'autos', 'vehiculo', 'vehículo', 'vehiculos', 'vehículos', 'coche', 'camion', 'camión', 'autopart', 'autopartes', '8703', '8708'],
  textil: ['textil', 'textiles', 'tela', 'telas', 'prenda', 'prendas', 'ropa', 'algodon', 'algodón', 'confeccion', 'confección', 'hilado', 'hilados', 'yarn'],
  immex: ['immex', 'maquila', 'maquiladora', 'temporal', 'iva-ieps', 'ivaIeps', 'aaa', 'certificacion', 'modalidad a', 'modalidad aa', 'modalidad aaa', 'anexo 24', 'anexo 30', 'anexo 31'],
  valoracion: [
    'valoracion', 'valoración', 'valor aduana', 'valor en aduana',
    'garantia', 'garantía', 'subvaluacion', 'subvaluación',
    'precio estimado', 'transaccion', 'transacción',
    'vinculacion', 'vinculación', 'incrementables',
    'art. 64', 'art. 65', 'art. 71', 'art. 78', 'art. 84-a',
    'articulo 64', 'articulo 65', 'articulo 71', 'articulo 78',
    'flete', 'seguro', 'comisiones', 'regalias', 'regalías',
    'metodo de valoracion', 'método de valoración', 'base gravable',
  ],
  antidumping: ['antidumping', 'cuota compensatoria', 'dumping', 'upci', 'compensatoria', 'elusion', 'elusión', 'res-'],
  origen: [
    'origen', 'tmec', 'tlcuem', 'cptpp', 'rvc', 'lvc',
    'yarn-forward', 'yarn forward', 'preferencial', 'certificado de origen',
    'wholly obtained', 'capitulo 4', 'capítulo 4',
    'build-up', 'build-down', 'cambio de partida', 'cambio arancelario',
    'transformacion sustancial', 'transformación sustancial',
  ],
  clasificacion: [
    'clasificacion', 'clasificación', 'fraccion', 'fracción', 'partida', 'subpartida',
    'gri', 'arancelaria', 'nico', 'capitulo', 'capítulo', 'reclasificacion', 'reclasificación',
  ],
  padrones: ['padron', 'padrón', 'anexo 10', 'sectorial', 'sector', 'art. 59', 'articulo 59', 'inscripcion', 'inscripción', 'permiso', 'permisos'],
  pama: ['pama', 'art. 152', 'art. 155', 'art. 144', 'articulo 152', 'articulo 155', 'embargo', 'embargo precautorio', 'reconocimiento aduanero', 'acta circunstanciada', 'procedimiento administrativo'],
  sanciones: ['multa', 'multas', 'sancion', 'sanción', 'infraccion', 'infracción', 'art. 184', 'art. 185', 'art. 178'],
  inventarios: ['inventario', 'inventarios', 'descargo', 'descargos', 'anexo 24', 'anexo 30'],
  pedimento: ['pedimento', 'anexo 22', 'a1', 'mve', 'manifestacion', 'manifestación', 'cove'],
  iva: [
    'iva', 'iva-ieps', 'acreditamiento', 'art. 24 liva', 'art. 26 liva',
    'art. 28-a', 'art. 28a', 'art. 5 liva', 'art. 27 liva',
    'credito fiscal', 'crédito fiscal', 'iva al despacho',
  ],
  iva_ieps: [
    'iva-ieps', 'certificacion iva', 'certificación iva',
    'modalidad a', 'modalidad aa', 'modalidad aaa',
    'crédito iva', 'credito iva',
  ],
  fiscal: ['fiscal', 'credito', 'crédito', 'descargo', 'cuenta aduanera', 'tax credit', 'recargos'],
  isan: ['isan', 'automovil nuevo', 'automóvil nuevo', 'vehiculo nuevo', 'vehículo nuevo', 'art. 1 lisan', 'art. 2 lisan', 'lisan'],
  ieps: ['ieps', 'art. 1 lieps', 'lieps', 'alcohol', 'tabaco', 'refresco', 'combustible', 'plaguicida'],
  noms: ['nom', 'noms', 'anexo 2.4.1', 'etiquetado'],
  rrnas: ['rrna', 'rrnas', 'permiso', 'permisos', 'regulacion no arancelaria', 'regulación no arancelaria', 'autorizacion', 'autorización', 'permiso previo'],
  garantias: ['garantia', 'garantía', 'fianza', 'cuenta aduanera', 'anexo 31', 'carta de credito', 'carta de crédito'],
  dta: [
    'dta', 'derecho de tramite', 'derecho de trámite', 'tramite aduanero', 'trámite aduanero',
    'art. 49 lfd', 'articulo 49 lfd', 'artículo 49 lfd', 'ley federal de derechos', 'lfd',
    '8 al millar', '1.76 al millar',
  ],
};

// Aliases: cuando el detector emite topic X, también buscar estos topics en
// los docs. Cubre typos históricos del seed (inmex/immex) y solapamientos
// semánticos (iva_ieps ↔ iva, garantias ↔ fiscal).
const TOPIC_ALIASES: Record<string, string[]> = {
  textil: ['textil', 'textiles'],
  textiles: ['textiles', 'textil'],
  immex: ['immex', 'inmex'],
  inmex: ['inmex', 'immex'],
  iva: ['iva', 'iva_ieps', 'fiscal'],
  iva_ieps: ['iva_ieps', 'iva', 'certificacion', 'fiscal'],
  fiscal: ['fiscal', 'iva', 'iva_ieps'],
  garantias: ['garantias', 'cuenta_aduanera', 'fiscal'],
  pama: ['pama', 'sanciones'],
  sanciones: ['sanciones', 'pama'],
  valoracion: ['valoracion', 'incrementables', 'base_gravable', 'subvaluacion'],
  origen: ['origen', 'automotriz', 'textiles'],
  clasificacion: ['clasificacion', 'reclasificacion', 'uso_destinado'],
  padrones: ['padrones', 'regimen'],
  pedimento: ['pedimento', 'regimen'],
  dta: ['dta', 'pedimento', 'fiscal'],
};

/** Expande topics con sus aliases. */
function expandTopicsWithAliases(topics: string[]): string[] {
  const expanded = new Set<string>();
  for (const t of topics) {
    expanded.add(t);
    for (const a of TOPIC_ALIASES[t] ?? []) expanded.add(a);
  }
  return [...expanded];
}

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
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9áéíóúñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

  // Alias bidireccional mínimo: el corpus usa RGI y los usuarios también GRI.
  const aliases: Record<string, string> = { gri: 'rgi', rgi: 'gri' };
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const alias = aliases[token];
    if (alias) expanded.add(alias);

    // Despluralización ligera: conserva el token y agrega variantes singulares.
    if (token.length > 3 && token.endsWith('s')) expanded.add(token.slice(0, -1));
    const withoutEs = token.slice(0, -2);
    if (token.endsWith('es') && withoutEs.length > 3) expanded.add(withoutEs);
  }
  return [...expanded];
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

export async function searchLegalDocuments(query: string, opts: { topK?: number; topics?: string[]; types?: string[]; hardFilter?: boolean } = {}): Promise<RetrievedDoc[]> {
  const topK = opts.topK ?? 5;
  const queryEmbedding = await generateEmbedding(query, 'query');
  const queryTokens = extractTokens(query);
  const detectedTopics = detectQueryTopics(query);
  const expandedTopics = expandTopicsWithAliases(detectedTopics);

  // Filtros opcionales
  const where: Record<string, unknown> = { isActive: true };
  if (opts.topics && opts.topics.length > 0) where.topics = { hasSome: opts.topics };
  if (opts.types && opts.types.length > 0) where.type = { in: opts.types };

  // Hard filter por topic — solo cuando hay topics detectados Y no se pasó
  // un topics override explícito. Reduce los candidatos ANTES del cálculo
  // de embeddings/keyword scoring. Si quedan < 3 candidatos, se desactiva
  // el filtro para evitar respuestas vacías por sobre-restricción.
  const hardFilter = opts.hardFilter !== false; // default true
  if (hardFilter && expandedTopics.length > 0 && !opts.topics) {
    const topicCandidatesCount = await prisma.legalDocument.count({
      where: { ...where, topics: { hasSome: expandedTopics } },
    });
    if (topicCandidatesCount >= 3) {
      where.topics = { hasSome: expandedTopics };
    }
  }

  const docs = await prisma.legalDocument.findMany({
    where,
    select: {
      id: true, type: true, claseTexto: true, source: true, title: true, reference: true,
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
    // tocar al menos uno (incluyendo aliases). Si no, penalización del
    // 80%. Cuando el hard filter ya cribó por topic, esto ya no es
    // necesario, pero se mantiene para queries con hardFilter=false.
    let topicMultiplier = 1.0;
    if (expandedTopics.length > 0) {
      const docTopics = new Set(d.topics ?? []);
      const overlap = expandedTopics.filter(t => docTopics.has(t)).length;
      if (overlap === 0) topicMultiplier = 0.2;        // off-topic
      else if (overlap >= detectedTopics.length) topicMultiplier = 1.15; // cubre todos los topics del query → boost
    }

    // Score combinado: 70% similitud vectorial + 30% keyword, ajustado por topic
    const baseScore = similarity * 0.7 + keywordScore * 0.3;
    const finalScore = Math.min(1, baseScore * topicMultiplier);

    return {
      id: d.id,
      type: d.type,
      claseTexto: d.claseTexto,
      source: d.source,
      title: d.title,
      reference: d.reference,
      content: d.content,
      excerpt: makeExcerpt(d.content, query),
      officialUrl: d.officialUrl,
      effectiveDate: d.effectiveDate?.toISOString() ?? null,
      topics: d.topics,
      keywords: d.keywords,
      fractionRefs: d.fractionRefs,
      similarity,
      keywordScore,
      finalScore,
    };
  });

  return priorizarTextoIntegro(scored).slice(0, topK);
}

// ─────────────────────────────────────────────────────────────────────────
// CORPUS ÍNTEGRO (plan §3): el texto verbatim manda sobre el resumen
// ─────────────────────────────────────────────────────────────────────────

/**
 * Prioriza texto íntegro para citas (plan aprobado 19-ago §3):
 *  1. Boost +15% al finalScore de 'texto_integro' (cap 1.0) — el resumen ya
 *     no puede "ganarle" la cita al texto real por afinidad de keywords.
 *  2. Dedup por referencia: si el íntegro y el resumen del MISMO reference
 *     compiten, el resumen se EXCLUYE (el modelo no necesita dos versiones).
 * Pura y exportada para test directo.
 */
export function priorizarTextoIntegro(docs: RetrievedDoc[]): RetrievedDoc[] {
  const boosted = docs.map(d => d.claseTexto === 'texto_integro'
    ? { ...d, finalScore: Math.min(1, d.finalScore * 1.15) }
    : d);
  // Dedup por CLAVE PARSEADA (lote 2 paso 0): "Art. 151 Ley Aduanera" (resumen
  // viejo) y "Art. 151 LA" (íntegro) son el MISMO artículo aunque el string
  // difiera. Referencia no parseable → fallback al string (rangos, criterios).
  const claveDe = (ref: string): string => {
    const p = parseReferencia(ref);
    return p ? `${p.tipo}|${p.numero}|${p.cuerpo ?? '*'}` : `str|${ref.trim().toLowerCase()}`;
  };
  const integrosPorClave = new Set(
    boosted.filter(d => d.claseTexto === 'texto_integro').map(d => claveDe(d.reference)),
  );
  return boosted
    .filter(d => d.claseTexto === 'texto_integro' || !integrosPorClave.has(claveDe(d.reference)))
    .sort((a, b) => b.finalScore - a.finalScore);
}

// ─────────────────────────────────────────────────────────────────────────
// LLM Reranker (Haiku) — sobre candidatos del retrieval híbrido
// ─────────────────────────────────────────────────────────────────────────

export interface RerankedDoc extends RetrievedDoc {
  llmScore: number;
  llmRelevant: boolean;
  llmReason: string;
}

const RERANK_SYSTEM = `Eres un evaluador de relevancia para un RAG legal mexicano (comercio exterior). Tu trabajo es decidir, para cada documento candidato, si responde DIRECTAMENTE a la pregunta del usuario o si solo coincide en palabras clave superficiales.

Reglas:
- relevant=true SOLO si el documento contiene la respuesta material a la pregunta o un componente necesario (definición, regla, plazo, monto, sujeto, etc.).
- relevant=false si el documento toca el tema pero NO responde lo preguntado (ej. pregunta es sobre Art. 65 LA pero el doc habla del Art. 52 LA).
- score 0-100. Reserva 80+ para docs que claramente responden la pregunta.
- reason: 1 oración. No inventes citas.

Responde EXCLUSIVAMENTE con JSON válido. Sin prosa, sin markdown.`;

/**
 * Pide a Haiku que evalúe relevancia doc-por-doc contra la query. Filtra
 * candidatos por llmScore >= scoreThreshold y llmRelevant=true. Devuelve top-K
 * ordenados por llmScore.
 *
 * Si el LLM falla o el JSON es inválido, fallback: devuelve los candidatos
 * originales ordenados por finalScore (no rompe la búsqueda).
 */
export async function rerankWithLLM(
  query: string,
  candidates: RetrievedDoc[],
  opts: { topK?: number; scoreThreshold?: number; tenantId?: string; userId?: string } = {},
): Promise<RerankedDoc[]> {
  const topK = opts.topK ?? 5;
  const scoreThreshold = opts.scoreThreshold ?? 55;
  if (candidates.length === 0) return [];

  // Usa una ventana centrada en los términos de la query para que el reranker
  // vea el pasaje relevante sin inflar innecesariamente el prompt.
  const docList = candidates.map((c, i) => {
    const snippet = makeExcerpt(c.content, query, 500);
    return `[${i + 1}] ${c.reference} — ${c.title}\nTopics: ${c.topics.join(', ')}\nKeywords: ${(c.keywords ?? []).join(', ')}\nExcerpt: ${snippet}`;
  }).join('\n\n');

  const userPrompt = `Pregunta del usuario:
"${query}"

Documentos candidatos:
${docList}

Devuelve un array JSON con un objeto por documento, en el mismo orden. Cada objeto:
{ "index": <int 1..N>, "relevant": <bool>, "score": <int 0..100>, "reason": "<≤120 chars>" }

Ejemplo: [{"index":1,"relevant":true,"score":85,"reason":"responde directamente"},{"index":2,"relevant":false,"score":15,"reason":"menciona pero distinto"}]`;

  let raw: string;
  try {
    raw = await llmGenerate({
      model: 'fast',
      maxTokens: 1500,
      temperature: 0,
      system: RERANK_SYSTEM,
      user: userPrompt,
      log: { operation: 'rag_rerank', tenantId: opts.tenantId, userId: opts.userId },
    });
  } catch (err) {
    logger.warn('LLM reranker failed; falling back a similarity-only', {
      action: 'rag_rerank_fail',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return candidates.slice(0, topK).map(c => ({ ...c, llmScore: Math.round(c.finalScore * 100), llmRelevant: true, llmReason: 'fallback similarity' }));
  }

  // JSON parse robusto: el modelo a veces envuelve en ```json ... ```
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: { index: number; relevant: boolean; score: number; reason?: string }[];
  try {
    const j = JSON.parse(cleaned);
    parsed = Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);
  } catch {
    logger.warn('LLM reranker returned invalid JSON; fallback', {
      action: 'rag_rerank_parse_fail',
      metadata: { rawPreview: raw.slice(0, 200) },
    });
    return candidates.slice(0, topK).map(c => ({ ...c, llmScore: Math.round(c.finalScore * 100), llmRelevant: true, llmReason: 'parse fallback' }));
  }

  const scoresByIdx = new Map<number, { score: number; relevant: boolean; reason: string }>();
  for (const r of parsed) {
    if (typeof r?.index === 'number') {
      scoresByIdx.set(r.index, {
        score: Math.max(0, Math.min(100, Math.round(r.score ?? 0))),
        relevant: !!r.relevant,
        reason: String(r.reason ?? '').slice(0, 120),
      });
    }
  }

  const reranked: RerankedDoc[] = candidates.map((c, i) => {
    const s = scoresByIdx.get(i + 1);
    return {
      ...c,
      llmScore: s?.score ?? 0,
      llmRelevant: s?.relevant ?? false,
      llmReason: s?.reason ?? '',
    };
  });

  return reranked
    .filter(d => d.llmRelevant && d.llmScore >= scoreThreshold)
    .sort((a, b) => b.llmScore - a.llmScore)
    .slice(0, topK);
}

// ─────────────────────────────────────────────────────────────────────────
// Smart retrieval — pipeline completo (topic filter + hybrid + LLM rerank)
// ─────────────────────────────────────────────────────────────────────────

export interface SmartRetrievalResult {
  docs: RerankedDoc[];
  shouldRespond: boolean;
  reason: 'ok' | 'insufficient_relevant_docs' | 'no_candidates';
  averageRelevance: number;
  detectedTopics: string[];
}

/**
 * Pipeline completo de retrieval para Copilot RAG.
 *  1. Detectar topics del query y filtrar candidatos (F1 + F2)
 *  2. Retrieval híbrido (embedding + keyword + topic boost) → ~10 candidatos
 *  3. Reranker Haiku evalúa cada candidato y filtra < threshold
 *  4. Si quedan < 2 docs relevantes → shouldRespond=false (Copilot dirá "no info")
 *
 * Opcional: pasar tenantId/userId para que el reranker quede logueado.
 */
export async function smartRetrieval(
  query: string,
  opts: { topK?: number; rerank?: boolean; tenantId?: string; userId?: string } = {},
): Promise<SmartRetrievalResult> {
  const topK = opts.topK ?? 5;
  const rerank = opts.rerank !== false; // default true

  // 1+2: retrieval híbrido con topic filter
  const candidates = await searchLegalDocuments(query, { topK: 12, hardFilter: true });
  const detectedTopics = detectQueryTopics(query);

  if (candidates.length === 0) {
    return { docs: [], shouldRespond: false, reason: 'no_candidates', averageRelevance: 0, detectedTopics };
  }

  // 3: reranking con Haiku (skippable para tests / fallback)
  let docs: RerankedDoc[];
  if (rerank) {
    docs = await rerankWithLLM(query, candidates, { topK, tenantId: opts.tenantId, userId: opts.userId });
  } else {
    docs = candidates.slice(0, topK).map(c => ({ ...c, llmScore: Math.round(c.finalScore * 100), llmRelevant: true, llmReason: 'rerank=off' }));
  }

  // 4: gate de respuesta. Para queries legales puntuales (ej. "Art. 65 LA")
  // a menudo hay UN doc que responde. No requerimos ≥2 docs si el único
  // tiene score alto (≥75). Sin docs (0) → siempre gate.
  if (docs.length === 0) {
    return { docs, shouldRespond: false, reason: 'insufficient_relevant_docs', averageRelevance: 0, detectedTopics };
  }
  if (docs.length === 1 && docs[0]!.llmScore < 75) {
    return { docs, shouldRespond: false, reason: 'insufficient_relevant_docs', averageRelevance: docs[0]!.llmScore, detectedTopics };
  }

  const avg = docs.reduce((s, d) => s + d.llmScore, 0) / docs.length;
  return { docs, shouldRespond: true, reason: 'ok', averageRelevance: Math.round(avg), detectedTopics };
}
