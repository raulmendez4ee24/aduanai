/**
 * Endpoints admin para gestión del corpus de documentos legales del Copilot.
 *
 *   GET    /api/admin/legal-docs                  — listado con filtros
 *   GET    /api/admin/legal-docs/stats            — métricas de cobertura
 *   GET    /api/admin/legal-docs/copilot-quality  — métricas del Copilot
 *   POST   /api/admin/legal-docs/reindex          — regenera embeddings
 *   POST   /api/admin/legal-docs                  — crea/actualiza
 *   DELETE /api/admin/legal-docs/:id              — desactiva (soft delete)
 */

import { Router, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { generateEmbedding } from '../lib/embeddings';

export const legalDocsRouter = Router();
const adminOnly = [authenticate, requireRole('SUPERADMIN')];

// ── Biblioteca Legal (vista usuario, solo lectura) ──
export const legalLibraryRouter = Router();
legalLibraryRouter.use(authenticate);

legalLibraryRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type ? String(req.query.type) : undefined;
    const source = req.query.source ? String(req.query.source) : undefined;
    const q = req.query.q ? String(req.query.q) : undefined;
    const where: Record<string, unknown> = { isActive: true };
    if (type) where.type = type;
    if (source) where.source = source;
    if (q) where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { reference: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
      { keywords: { has: q.toLowerCase() } },
    ];
    const items = await prisma.legalDocument.findMany({
      where,
      orderBy: [{ source: 'asc' }, { reference: 'asc' }],
      take: 200,
      select: {
        id: true, type: true, source: true, title: true, reference: true,
        officialUrl: true, publishedDate: true, effectiveDate: true,
        topics: true, keywords: true,
      },
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

legalLibraryRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.legalDocument.findFirst({
      where: { id: String(req.params.id ?? ''), isActive: true },
      select: {
        id: true, type: true, source: true, title: true, reference: true,
        content: true, officialUrl: true, publishedDate: true, effectiveDate: true,
        topics: true, keywords: true,
      },
    });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Documento no encontrado' });
    res.json({ status: 'ok', data: doc });
  } catch (err) { next(err); }
});

legalLibraryRouter.get('/sources/list', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sources = await prisma.legalDocument.groupBy({
      by: ['source'], where: { isActive: true }, _count: { _all: true },
    });
    res.json({ status: 'ok', data: sources.map(s => ({ source: s.source, count: s._count._all })) });
  } catch (err) { next(err); }
});

legalDocsRouter.get('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type ? String(req.query.type) : undefined;
    const source = req.query.source ? String(req.query.source) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (source) where.source = source;
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { reference: { contains: search, mode: 'insensitive' } },
    ];
    const items = await prisma.legalDocument.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { source: 'asc' }, { reference: 'asc' }],
      take: 500,
      select: {
        id: true, type: true, source: true, title: true, reference: true,
        officialUrl: true, publishedDate: true, effectiveDate: true, expiryDate: true,
        isActive: true, supersededBy: true, version: true, topics: true, keywords: true,
        fractionRefs: true, contentHash: true, createdAt: true, updatedAt: true,
      },
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

legalDocsRouter.get('/stats', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const total = await prisma.legalDocument.count();
    const active = await prisma.legalDocument.count({ where: { isActive: true } });
    const byType = await prisma.legalDocument.groupBy({
      by: ['type'], _count: { _all: true }, where: { isActive: true },
    });
    const bySource = await prisma.legalDocument.groupBy({
      by: ['source'], _count: { _all: true }, where: { isActive: true },
    });
    const lastUpdate = await prisma.legalDocument.findFirst({
      orderBy: { updatedAt: 'desc' }, select: { updatedAt: true },
    });
    // Cobertura por topic
    const all = await prisma.legalDocument.findMany({
      where: { isActive: true }, select: { topics: true },
    });
    const topicMap = new Map<string, number>();
    for (const d of all) for (const t of d.topics) topicMap.set(t, (topicMap.get(t) ?? 0) + 1);
    const byTopic = [...topicMap.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);

    res.json({
      status: 'ok',
      data: {
        total, active, inactive: total - active,
        byType: byType.map(t => ({ type: t.type, count: t._count._all })),
        bySource: bySource.map(s => ({ source: s.source, count: s._count._all })),
        byTopic,
        lastUpdate: lastUpdate?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

legalDocsRouter.get('/copilot-quality', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [total, helpful, unhelpful, avgConf, mostCited] = await Promise.all([
      prisma.copilotConsult.count({ where: { createdAt: { gte: since } } }),
      prisma.copilotConsult.count({ where: { createdAt: { gte: since }, helpful: true } }),
      prisma.copilotConsult.count({ where: { createdAt: { gte: since }, helpful: false } }),
      prisma.copilotConsult.aggregate({
        where: { createdAt: { gte: since } }, _avg: { confidence: true },
      }),
      prisma.copilotConsult.findMany({
        where: { createdAt: { gte: since } },
        select: { citedDocuments: true }, take: 500,
      }),
    ]);
    // Documentos más citados
    const docCount = new Map<string, number>();
    for (const c of mostCited) {
      const cites = (c.citedDocuments as { reference: string; documentId: string }[] | null) ?? [];
      for (const cit of cites) docCount.set(cit.reference, (docCount.get(cit.reference) ?? 0) + 1);
    }
    const topDocs = [...docCount.entries()]
      .map(([reference, count]) => ({ reference, count }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    // Documentos nunca citados (cuántos hay)
    const allDocs = await prisma.legalDocument.findMany({ where: { isActive: true }, select: { reference: true } });
    const neverCited = allDocs.filter(d => !docCount.has(d.reference)).length;

    const helpfulRate = total > 0 ? Math.round((helpful / Math.max(1, helpful + unhelpful)) * 100) : 0;
    res.json({
      status: 'ok',
      data: {
        period: '30d',
        totalConsults: total,
        feedback: { helpful, unhelpful, helpfulRate },
        avgConfidence: Math.round((avgConf._avg.confidence ?? 0) * 10) / 10,
        topDocsCited: topDocs,
        neverCitedCount: neverCited,
      },
    });
  } catch (err) { next(err); }
});

legalDocsRouter.post('/reindex', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const docs = await prisma.legalDocument.findMany({
      where: { isActive: true }, select: { id: true, title: true, reference: true, content: true },
    });
    let updated = 0;
    for (const d of docs) {
      const embedding = await generateEmbedding(`${d.title}\n${d.reference}\n${d.content}`);
      await prisma.legalDocument.update({ where: { id: d.id }, data: { embedding } });
      updated++;
    }
    res.json({ status: 'ok', data: { updated } });
  } catch (err) { next(err); }
});

legalDocsRouter.post('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Partial<{
      type: string; source: string; title: string; reference: string;
      content: string; officialUrl: string; publishedDate: string;
      effectiveDate: string; expiryDate: string; version: string;
      topics: string[]; keywords: string[]; fractionRefs: string[];
    }>;
    if (!body.type || !body.source || !body.title || !body.reference || !body.content) {
      return res.status(400).json({ status: 'error', message: 'type, source, title, reference, content requeridos' });
    }
    const contentHash = crypto.createHash('sha256').update(body.content).digest('hex').slice(0, 32);
    const embedding = await generateEmbedding(`${body.title}\n${body.reference}\n${body.content}`);
    const data = {
      type: body.type, source: body.source, title: body.title, reference: body.reference,
      content: body.content, officialUrl: body.officialUrl,
      publishedDate: body.publishedDate ? new Date(body.publishedDate) : null,
      effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      version: body.version,
      topics: body.topics ?? [], keywords: body.keywords ?? [], fractionRefs: body.fractionRefs ?? [],
      embedding, contentHash,
    };
    const existing = await prisma.legalDocument.findFirst({ where: { source: body.source, reference: body.reference }, select: { id: true } });
    const result = existing
      ? await prisma.legalDocument.update({ where: { id: existing.id }, data })
      : await prisma.legalDocument.create({ data });
    res.status(existing ? 200 : 201).json({ status: 'ok', data: { id: result.id, contentHash } });
  } catch (err) { next(err); }
});

legalDocsRouter.delete('/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.legalDocument.update({ where: { id: String(req.params.id) }, data: { isActive: false } });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});
