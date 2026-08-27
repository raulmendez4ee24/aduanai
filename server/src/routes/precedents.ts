import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { lookupPrecedents, hasActiveLitigation, PRECEDENT_CORPUS_VERIFIED, precedentesPorFraccion } from '../services/precedent-lookup';

export const precedentsRouter = Router();

// GET /api/precedents — listado paginado con filtros
precedentsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const type = req.query.type ? String(req.query.type) : undefined;
    const topic = req.query.topic ? String(req.query.topic) : undefined;
    const fraction = req.query.fraction ? String(req.query.fraction).replace(/[^0-9]/g, '') : undefined;
    const yearFrom = req.query.yearFrom ? Number(req.query.yearFrom) : undefined;
    const litigated = req.query.litigated === 'true' ? true : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isVigente: true };
    if (type) where.type = type;
    if (topic) where.topic = topic;
    if (yearFrom) where.yearPublished = { gte: yearFrom };
    if (litigated !== undefined) where.litigated = litigated;
    if (fraction && fraction.length === 8) {
      where.OR = [
        { fractionCodes: { has: fraction } },
        { chapterCodes: { has: fraction.slice(0, 2) } },
      ];
    }
    if (search) {
      const existingOR = (where.OR as Record<string, unknown>[] | undefined) ?? [];
      where.OR = [
        ...existingOR,
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Falla cerrado (Fase 2.3): corpus sintético no citable — lista vacía hasta cotejo real.
    if (!PRECEDENT_CORPUS_VERIFIED) {
      return res.json({
        status: 'ok',
        data: [],
        pagination: { page, limit, total: 0 },
        notice: 'Corpus de precedentes en verificación contra fuentes oficiales (TFJA/SAT) — no disponible por ahora.',
      });
    }

    const [items, total] = await Promise.all([
      prisma.legalPrecedent.findMany({
        where,
        orderBy: [{ yearPublished: 'desc' }, { litigated: 'desc' }],
        take: limit,
        skip,
      }),
      prisma.legalPrecedent.count({ where }),
    ]);

    res.json({ status: 'ok', data: items, pagination: { page, limit, total } });
  } catch (err) { next(err); }
});

// GET /api/precedents/por-fraccion/:code — Ola 2: "esta fracción tiene N
// criterios y M tesis". Solo precedentes con fuente oficial y corpus
// verificado; con el flag apagado devuelve { verificados: 0, mensaje } honesto.
precedentsRouter.get('/por-fraccion/:code', authenticate, async (req, res, next) => {
  try {
    res.json({ status: 'ok', data: await precedentesPorFraccion(String(req.params.code)) });
  } catch (err) { next(err); }
});

// GET /api/precedents/:id
precedentsRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    if (!PRECEDENT_CORPUS_VERIFIED) {
      return res.status(404).json({ status: 'error', message: 'Corpus de precedentes en verificación — no disponible por ahora.' });
    }
    const item = await prisma.legalPrecedent.findUnique({ where: { id: String(req.params.id) } });
    if (!item) return res.status(404).json({ status: 'error', message: 'Precedente no encontrado' });
    res.json({ status: 'ok', data: item });
  } catch (err) { next(err); }
});

// POST /api/precedents/lookup — buscar precedentes relevantes para un producto
precedentsRouter.post('/lookup', authenticate, async (req, res, next) => {
  try {
    const body = req.body as { fractionCode?: string; chapter?: string; topics?: string[]; keywords?: string[]; limit?: number };
    const matches = await lookupPrecedents(body);
    const litigation = body.fractionCode ? await hasActiveLitigation(body.fractionCode) : { has: false, precedents: [] };
    res.json({ status: 'ok', data: { precedents: matches, litigation } });
  } catch (err) { next(err); }
});
