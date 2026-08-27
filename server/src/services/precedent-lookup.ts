/**
 * Búsqueda de precedentes legales relevantes para una clasificación.
 *
 * Estrategia de matching:
 *   1. Match exacto por fracción 8 dígitos
 *   2. Match por capítulo (2 dígitos)
 *   3. Match por keyword en topic/title (subvaluación, reclasificación, etc.)
 *
 * Ranking: específicos > genéricos; vigentes > no vigentes; recientes > viejos.
 */

import { prisma } from '../lib/prisma';

/**
 * SWITCH (Fase 2.3 — honestidad de datos): el corpus LegalPrecedent actual es
 * SINTÉTICO — 24 filas, 0 con URL de fuente oficial, referencias con placeholder
 * ("Tesis V-P-2aS-XX/2023"). Tesis y criterios que NO existen no son citables
 * (principio: nunca fabricar datos legales).
 *
 * Mientras sea false, TODOS los consumidores reciben vacío (falla cerrado):
 * Clasificador (prompt + result.precedents + litigationAlert) y /api/precedents.
 * Las 24 filas se conservan en BD (desactivar > borrar) pendientes de cotejo
 * contra TFJA/SAT reales — ver docs/DEFERRED_WORK.md. Flip a true SOLO cuando
 * ese cotejo esté cerrado con fuentes citables.
 */
export const PRECEDENT_CORPUS_VERIFIED = false;

export interface PrecedentMatch {
  id: string;
  type: string;
  reference: string;
  title: string;
  topic: string;
  summary: string;
  ruling: string;
  reasoning: string;
  applicability: string | null;
  yearPublished: number;
  litigated: boolean;
  isVigente: boolean;
  source: string | null;
  fractionCodes: string[];
  chapterCodes: string[];
  /** Score interno de relevancia para esta consulta */
  relevanceScore: number;
}

interface LookupInput {
  fractionCode?: string;
  chapter?: string;
  topics?: string[];   // ej ['reclasificación', 'origen']
  keywords?: string[]; // de la descripción del producto
  limit?: number;
}

export async function lookupPrecedents(input: LookupInput): Promise<PrecedentMatch[]> {
  if (!PRECEDENT_CORPUS_VERIFIED) return []; // corpus sintético — no citable
  const limit = input.limit ?? 5;
  const cleanFraction = input.fractionCode?.replace(/[^0-9]/g, '');
  const chapter = input.chapter ?? cleanFraction?.slice(0, 2);

  const orFilters: Record<string, unknown>[] = [];
  if (cleanFraction && cleanFraction.length === 8) {
    orFilters.push({ fractionCodes: { has: cleanFraction } });
  }
  if (chapter) {
    orFilters.push({ chapterCodes: { has: chapter } });
  }
  if (input.topics && input.topics.length > 0) {
    orFilters.push({ topic: { in: input.topics } });
  }
  if (input.keywords && input.keywords.length > 0) {
    for (const kw of input.keywords.slice(0, 5)) {
      orFilters.push({ title: { contains: kw, mode: 'insensitive' } });
    }
  }

  if (orFilters.length === 0) return [];

  const rows = await prisma.legalPrecedent.findMany({
    where: { isVigente: true, OR: orFilters },
    take: 30,
    orderBy: { yearPublished: 'desc' },
  });

  // Score por especificidad y recencia
  const matches: PrecedentMatch[] = rows.map(p => {
    let score = 0;
    if (cleanFraction && p.fractionCodes.includes(cleanFraction)) score += 100;
    if (chapter && p.chapterCodes.includes(chapter)) score += 30;
    if (input.topics?.includes(p.topic)) score += 25;
    if (p.litigated) score += 15;
    score += Math.max(0, p.yearPublished - 2020) * 3;
    if (input.keywords) {
      const titleLower = p.title.toLowerCase();
      for (const kw of input.keywords) {
        if (titleLower.includes(kw.toLowerCase())) score += 10;
      }
    }
    return {
      id: p.id,
      type: p.type,
      reference: p.reference,
      title: p.title,
      topic: p.topic,
      summary: p.summary,
      ruling: p.ruling,
      reasoning: p.reasoning,
      applicability: p.applicability,
      yearPublished: p.yearPublished,
      litigated: p.litigated,
      isVigente: p.isVigente,
      source: p.source,
      fractionCodes: p.fractionCodes,
      chapterCodes: p.chapterCodes,
      relevanceScore: score,
    };
  });

  return matches
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

/** ¿Esta fracción/capítulo tiene precedentes con litigio activo? */
export async function hasActiveLitigation(fractionCode: string): Promise<{ has: boolean; precedents: PrecedentMatch[] }> {
  if (!PRECEDENT_CORPUS_VERIFIED) return { has: false, precedents: [] }; // corpus sintético — no citable
  const cleanFraction = fractionCode.replace(/[^0-9]/g, '');
  const chapter = cleanFraction.slice(0, 2);

  const rows = await prisma.legalPrecedent.findMany({
    where: {
      isVigente: true,
      litigated: true,
      OR: [
        { fractionCodes: { has: cleanFraction } },
        { chapterCodes: { has: chapter } },
      ],
    },
    take: 5,
    orderBy: { yearPublished: 'desc' },
  });

  const precedents: PrecedentMatch[] = rows.map(p => ({
    id: p.id,
    type: p.type,
    reference: p.reference,
    title: p.title,
    topic: p.topic,
    summary: p.summary,
    ruling: p.ruling,
    reasoning: p.reasoning,
    applicability: p.applicability,
    yearPublished: p.yearPublished,
    litigated: p.litigated,
    isVigente: p.isVigente,
    source: p.source,
    fractionCodes: p.fractionCodes,
    chapterCodes: p.chapterCodes,
    relevanceScore: 0,
  }));

  return { has: precedents.length > 0, precedents };
}

// ─────────────────────────────────────────────────────────────────────
// Ola 2 (27-ago-2026): precedentes POR FRACCIÓN para el Clasificador.
// "Esta fracción tiene N criterios y M tesis — léelos antes de firmar".
// ─────────────────────────────────────────────────────────────────────

export interface PrecedentesPorFraccion {
  fraccion: string;
  /** Precedentes servibles: con fuente oficial (URL) Y corpus verificado. */
  verificados: number;
  criterios: number; // CRITERIO_SAT + CONSULTA_SAT
  tesis: number;     // TFJA + SCJN
  otros: number;
  items: PrecedentMatch[];
  /** Filas cargadas en BD para la fracción/capítulo pero NO servibles (sin fuente o flag apagado). */
  cargadosSinVerificar: number;
  corpusVerificado: boolean;
  mensaje: string;
}

const TIPOS_CRITERIO = new Set(['CRITERIO_SAT', 'CONSULTA_SAT']);
const TIPOS_TESIS = new Set(['TFJA', 'SCJN']);

/** Un precedente solo es citable con URL de fuente oficial (http/https). */
export function precedenteTieneFuente(p: { source: string | null }): boolean {
  return typeof p.source === 'string' && /^https?:\/\//i.test(p.source.trim());
}

export async function precedentesPorFraccion(code: string): Promise<PrecedentesPorFraccion> {
  const fraccion = code.replace(/[^0-9]/g, '');
  const vacio = (mensaje: string, cargados = 0): PrecedentesPorFraccion => ({
    fraccion, verificados: 0, criterios: 0, tesis: 0, otros: 0, items: [],
    cargadosSinVerificar: cargados, corpusVerificado: PRECEDENT_CORPUS_VERIFIED, mensaje,
  });
  if (fraccion.length !== 8) return vacio('Fracción inválida: se requieren 8 dígitos.');

  const where = {
    isVigente: true,
    OR: [{ fractionCodes: { has: fraccion } }, { chapterCodes: { has: fraccion.slice(0, 2) } }],
  };
  const cargados = await prisma.legalPrecedent.count({ where });

  if (!PRECEDENT_CORPUS_VERIFIED) {
    return vacio(
      cargados > 0
        ? `Sin precedentes verificados cargados para esta fracción: hay ${cargados} fila(s) en cotejo contra TFJA/SAT que no se muestran hasta tener fuente oficial.`
        : 'Sin precedentes verificados cargados para esta fracción (corpus en cotejo contra TFJA/SAT).',
      cargados,
    );
  }

  const rows = await prisma.legalPrecedent.findMany({ where, orderBy: [{ yearPublished: 'desc' }], take: 50 });
  const conFuente = rows.filter(precedenteTieneFuente);
  const items: PrecedentMatch[] = conFuente.map(p => ({
    id: p.id, type: p.type, reference: p.reference, title: p.title, topic: p.topic,
    summary: p.summary, ruling: p.ruling, reasoning: p.reasoning, applicability: p.applicability,
    yearPublished: p.yearPublished, litigated: p.litigated, isVigente: p.isVigente, source: p.source,
    fractionCodes: p.fractionCodes, chapterCodes: p.chapterCodes,
    relevanceScore: (p.fractionCodes.includes(fraccion) ? 100 : 30) + Math.max(0, p.yearPublished - 2020) * 3,
  })).sort((a, b) => b.relevanceScore - a.relevanceScore);
  const criterios = items.filter(i => TIPOS_CRITERIO.has(i.type)).length;
  const tesis = items.filter(i => TIPOS_TESIS.has(i.type)).length;
  const otros = items.length - criterios - tesis;
  return {
    fraccion, verificados: items.length, criterios, tesis, otros, items,
    cargadosSinVerificar: rows.length - conFuente.length,
    corpusVerificado: true,
    mensaje: items.length === 0
      ? 'Sin precedentes verificados cargados para esta fracción.'
      : `Esta fracción tiene ${criterios} criterio(s) y ${tesis} tesis con fuente oficial — léelos antes de firmar.`,
  };
}
