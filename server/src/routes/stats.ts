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
    const [totalFractions, totalClassifications, feedbackStats] = await Promise.all([
      prisma.fraction.count({ where: { active: true } }),
      prisma.classification.count(),
      prisma.classification.groupBy({
        by: ['feedback'],
        _count: true,
        where: { feedback: { not: null } },
      }),
    ]);

    const correct = feedbackStats.find(f => f.feedback === 'correct')?._count ?? 0;
    const partial = feedbackStats.find(f => f.feedback === 'partial')?._count ?? 0;
    const totalWithFeedback = feedbackStats.reduce((sum, f) => sum + f._count, 0);
    const avgAccuracy = totalWithFeedback > 0
      ? Math.round(((correct + partial * 0.5) / totalWithFeedback) * 100)
      : 94; // default mientras no hay suficiente feedback

    res.json({
      status: 'ok',
      data: {
        totalFractions,
        totalClassifications,
        avgAccuracy,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats — con auth, por tenant
statsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const [classifications, quotes, copilotMessages, recentClassifications] = await Promise.all([
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
    ]);

    res.json({
      status: 'ok',
      data: {
        counts: { classifications, quotes, copilotMessages },
        recentClassifications,
      },
    });
  } catch (err) {
    next(err);
  }
});
