import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

export const statsRouter = Router();

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
