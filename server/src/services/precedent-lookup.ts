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
