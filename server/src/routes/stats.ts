import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

export const statsRouter = Router();

// GET /api/stats/public — sin auth, rate limited
const publicStatsLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiadas solicitudes. Intenta en 1 hora.' },
});

statsRouter.get('/public', publicStatsLimit, async (_req, res, next) => {
  try {
    const [totalFractions, totalClassifications, feedbackStats, corpusDocs, corpusFuentes] = await Promise.all([
      prisma.fraction.count({ where: { active: true } }),
      prisma.classification.count(),
      prisma.classification.groupBy({
        by: ['feedback'],
        _count: true,
        where: { feedback: { not: null } },
      }),
      // Contadores públicos EN VIVO (orden 25-ago): cada número de la página
      // pública deriva de la base real, no de un snapshot hardcodeado.
      prisma.legalDocument.count({ where: { isActive: true } }),
      prisma.legalDocument.findMany({ where: { isActive: true }, select: { source: true }, distinct: ['source'] }),
    ]);
    // Listado 69-B: conteo y corte REALES de la tabla ingerida (el corte lo
    // declara el propio CSV del SAT y viaja en importedAt).
    const sat69bMeta = await prisma.sat69B.findFirst({ orderBy: { importedAt: 'desc' }, select: { importedAt: true } });
    const sat69bCount = sat69bMeta ? await prisma.sat69B.count() : 0;

    // avgAccuracy ELIMINADA del endpoint público (25-ago): era el % de
    // clasificaciones marcadas "correctas" entre las que RECIBIERON feedback
    // (métrica sesgada) y, sin feedback, un 94 INVENTADO — servido como
    // "accuracy" a cualquiera. La métrica real y reproducible vive en
    // metricas-medidas.ts (61.6% top-1 / 81.8% capítulo, 99 casos).
    void feedbackStats;

    res.json({
      status: 'ok',
      data: {
        totalFractions,
        corpusDocumentosActivos: corpusDocs,
        corpusFuentes: corpusFuentes.length,
        totalClassifications,
        sat69B: sat69bMeta ? { rfc: sat69bCount, corte: sat69bMeta.importedAt.toISOString().slice(0, 10) } : null,
        // Medición PÚBLICA del clasificador — espejo del artefacto
        // server/src/tests/medicion-tanda-8544-2026-08-24.json (99 casos,
        // temp 0). La página pública muestra estos mismos números.
        medicion: { top1: '61.6%', capitulo: '81.8%', casos: 99, fecha: '2026-08-24', artefacto: 'medicion-tanda-8544-2026-08-24.json' },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/volume — clasificaciones por día, últimos 30 días
statsRouter.get('/volume', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const days = Math.min(Number(req.query.days || 30), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const classifications = await prisma.classification.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const quotes = await prisma.quote.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por día
    const volumeMap = new Map<string, { classifications: number; quotes: number }>();
    for (let d = 0; d < days; d++) {
      const date = new Date(since);
      date.setDate(since.getDate() + d);
      const key = date.toISOString().slice(0, 10);
      volumeMap.set(key, { classifications: 0, quotes: 0 });
    }

    for (const c of classifications) {
      const key = c.createdAt.toISOString().slice(0, 10);
      const entry = volumeMap.get(key);
      if (entry) entry.classifications++;
    }
    for (const q of quotes) {
      const key = q.createdAt.toISOString().slice(0, 10);
      const entry = volumeMap.get(key);
      if (entry) entry.quotes++;
    }

    const volume = [...volumeMap.entries()].map(([date, counts]) => ({
      date,
      ...counts,
    }));

    res.json({ status: 'ok', data: volume });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats — con auth, por tenant
statsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const [classifications, quotes, copilotMessages, recentClassifications, byFraction, allConfidences] = await Promise.all([
      prisma.classification.count({ where: { tenantId } }),
      prisma.quote.count({ where: { tenantId } }),
      prisma.copilotMessage.count({ where: { tenantId, role: 'user' } }),
      prisma.classification.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          inputDescription: true,
          fractionCode: true,
          confidence: true,
          createdAt: true,
          feedback: true,
        },
      }),
      // Fase 4.3: agregados sobre TODAS las filas del tenant. Antes Analytics
      // calculaba fracciones únicas / confianza promedio / capítulos con la
      // PÁGINA 1 del historial (20 filas) y los presentaba como globales —
      // por eso "13 fracciones únicas" con ~22 visibles. Fuente única: aquí.
      prisma.classification.groupBy({ by: ['fractionCode'], where: { tenantId }, _count: true }),
      prisma.classification.findMany({ where: { tenantId }, select: { confidence: true } }),
    ]);

    const uniqueFractions = byFraction.length;
    const chapterMap = new Map<string, number>();
    for (const f of byFraction) {
      const ch = f.fractionCode.replace(/\D/g, '').slice(0, 2) || '??';
      chapterMap.set(ch, (chapterMap.get(ch) ?? 0) + f._count);
    }
    const topChapters = [...chapterMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ch, count]) => ({ ch, count }));
    const avgConfidence = allConfidences.length > 0
      ? Math.round(allConfidences.reduce((s, c) => s + c.confidence, 0) / allConfidences.length)
      : 0;
    // Buckets: 95-100 / 85-94 / 70-84 / 50-69 / <50 (mismo esquema que la UI)
    const confidenceBuckets = [0, 0, 0, 0, 0];
    for (const { confidence: c } of allConfidences) {
      if (c >= 95) confidenceBuckets[0]++;
      else if (c >= 85) confidenceBuckets[1]++;
      else if (c >= 70) confidenceBuckets[2]++;
      else if (c >= 50) confidenceBuckets[3]++;
      else confidenceBuckets[4]++;
    }

    res.json({
      status: 'ok',
      data: {
        counts: { classifications, quotes, copilotMessages },
        recentClassifications,
        analytics: { uniqueFractions, avgConfidence, topChapters, confidenceBuckets },
      },
    });
  } catch (err) {
    next(err);
  }
});
