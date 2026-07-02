import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

export const knowledgeRouter = Router();

knowledgeRouter.use(authenticate);
knowledgeRouter.use(requireRole('SUPERADMIN'));

const KNOWLEDGE_TYPES = [
  'CASO_CLASIFICACION', 'CRITERIO_SAT', 'RESOLUCION_SCJN', 'NOTA_EXPLICATIVA_OMA',
  'NOTA_LEGAL', 'REGLA_SECTOR', 'ERROR_COMUN', 'PRECEDENTE', 'CONSULTA_SAT',
] as const;
type KType = typeof KNOWLEDGE_TYPES[number];

function isKnowledgeType(v: unknown): v is KType {
  return typeof v === 'string' && (KNOWLEDGE_TYPES as readonly string[]).includes(v);
}

// GET /api/knowledge — list with filters
knowledgeRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, chapter, verified, search } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof type === 'string' && isKnowledgeType(type)) where.type = type;
    if (typeof chapter === 'string' && chapter) where.chapterCode = chapter;
    if (verified === 'true') where.verified = true;
    if (verified === 'false') where.verified = false;
    if (typeof search === 'string' && search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { fractionCode: { contains: search } },
      ];
    }

    const items = await prisma.classificationKnowledge.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

// POST /api/knowledge — create
knowledgeRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!isKnowledgeType(b.type)) {
      return res.status(400).json({ status: 'error', message: 'type inválido' });
    }
    if (!b.title || !b.content || !b.source) {
      return res.status(400).json({ status: 'error', message: 'title, content y source son obligatorios' });
    }
    const keywords = Array.isArray(b.keywords) ? b.keywords : [];
    const products = Array.isArray(b.products) ? b.products : undefined;

    const created = await prisma.classificationKnowledge.create({
      data: {
        type: b.type,
        fractionCode: b.fractionCode || null,
        chapterCode: b.chapterCode || null,
        sectionCode: b.sectionCode || null,
        title: b.title,
        content: b.content,
        source: b.source,
        sourceDate: b.sourceDate ? new Date(b.sourceDate) : null,
        keywords,
        products,
        priority: typeof b.priority === 'number' ? b.priority : 5,
        verified: !!b.verified,
        verifiedBy: b.verified ? (req.userId ?? null) : null,
      },
    });
    res.json({ status: 'ok', data: created });
  } catch (err) { next(err); }
});

// PATCH /api/knowledge/:id — update
knowledgeRouter.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const b = req.body;
    const data: Record<string, unknown> = {};
    if (isKnowledgeType(b.type)) data.type = b.type;
    if (b.title !== undefined) data.title = b.title;
    if (b.content !== undefined) data.content = b.content;
    if (b.source !== undefined) data.source = b.source;
    if (b.fractionCode !== undefined) data.fractionCode = b.fractionCode || null;
    if (b.chapterCode !== undefined) data.chapterCode = b.chapterCode || null;
    if (b.sectionCode !== undefined) data.sectionCode = b.sectionCode || null;
    if (b.sourceDate !== undefined) data.sourceDate = b.sourceDate ? new Date(b.sourceDate) : null;
    if (Array.isArray(b.keywords)) data.keywords = b.keywords;
    if (Array.isArray(b.products)) data.products = b.products;
    if (typeof b.priority === 'number') data.priority = b.priority;

    const updated = await prisma.classificationKnowledge.update({ where: { id }, data });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

// POST /api/knowledge/:id/verify — mark as verified
knowledgeRouter.post('/:id/verify', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const updated = await prisma.classificationKnowledge.update({
      where: { id },
      data: { verified: true, verifiedBy: req.userId ?? 'admin' },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/knowledge/:id
knowledgeRouter.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.classificationKnowledge.delete({ where: { id: String(req.params.id) } });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

// POST /api/knowledge/import — bulk import JSON array
knowledgeRouter.post('/import', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ status: 'error', message: 'items debe ser un array' });
    }
    let created = 0;
    const errors: string[] = [];
    for (const [i, raw] of items.entries()) {
      if (!isKnowledgeType(raw.type) || !raw.title || !raw.content || !raw.source) {
        errors.push(`Fila ${i + 1}: falta type/title/content/source`);
        continue;
      }
      try {
        await prisma.classificationKnowledge.create({
          data: {
            type: raw.type,
            fractionCode: raw.fractionCode || null,
            chapterCode: raw.chapterCode || null,
            sectionCode: raw.sectionCode || null,
            title: raw.title,
            content: raw.content,
            source: raw.source,
            keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
            products: Array.isArray(raw.products) ? raw.products : undefined,
            priority: typeof raw.priority === 'number' ? raw.priority : 5,
            verified: !!raw.verified,
            verifiedBy: raw.verified ? (req.userId ?? null) : null,
          },
        });
        created++;
      } catch (e) {
        errors.push(`Fila ${i + 1}: ${e instanceof Error ? e.message : 'error desconocido'}`);
      }
    }
    res.json({ status: 'ok', created, errors });
  } catch (err) { next(err); }
});

// GET /api/knowledge/accuracy — accuracy per chapter with alerts
knowledgeRouter.get('/accuracy', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const classifications = await prisma.classification.findMany({
      where: { feedback: { in: ['correct', 'incorrect'] } },
      select: { fractionCode: true, feedback: true },
    });

    const stats = new Map<string, { total: number; correct: number }>();
    for (const c of classifications) {
      const chapter = c.fractionCode.replace(/[.\-\s]/g, '').substring(0, 2);
      const s = stats.get(chapter) ?? { total: 0, correct: 0 };
      s.total++;
      if (c.feedback === 'correct') s.correct++;
      stats.set(chapter, s);
    }

    const rows = [...stats.entries()]
      .map(([chapter, s]) => ({
        chapter,
        total: s.total,
        correct: s.correct,
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
        alert: s.total >= 5 && (s.correct / s.total) < 0.5
          ? `Cap ${chapter}: ${Math.round((s.correct / s.total) * 100)}% de aciertos según feedback de usuarios. Agregar más casos.`
          : null,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    res.json({ status: 'ok', data: rows });
  } catch (err) { next(err); }
});
