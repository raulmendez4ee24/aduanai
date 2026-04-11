import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

export const analyticsRouter = Router();

analyticsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const daysBack = Number(req.query.days || 30);
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    // Parallel queries
    const [
      totalClassifications,
      totalQuotes,
      totalCopilot,
      recentClassifications,
      recentQuotes,
      topFractions,
      topOrigins,
      feedbackStats,
      operationStats,
    ] = await Promise.all([
      // Totals
      prisma.classification.count({ where: { tenantId } }),
      prisma.quote.count({ where: { tenantId } }),
      prisma.copilotMessage.count({ where: { tenantId, role: 'user' } }),

      // Recent classifications by day
      prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM classifications
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
      ` as Promise<{ date: Date; count: number }[]>,

      // Recent quotes by day
      prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM quotes
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
      ` as Promise<{ date: Date; count: number }[]>,

      // Top fractions classified
      prisma.$queryRaw`
        SELECT "fractionCode", COUNT(*)::int as count
        FROM classifications
        WHERE "tenantId" = ${tenantId}
        GROUP BY "fractionCode"
        ORDER BY count DESC
        LIMIT 10
      ` as Promise<{ fractionCode: string; count: number }[]>,

      // Top origins in quotes
      prisma.$queryRaw`
        SELECT origin, COUNT(*)::int as count
        FROM quotes
        WHERE "tenantId" = ${tenantId}
        GROUP BY origin
        ORDER BY count DESC
        LIMIT 10
      ` as Promise<{ origin: string; count: number }[]>,

      // Feedback stats
      prisma.$queryRaw`
        SELECT
          feedback,
          COUNT(*)::int as count
        FROM classifications
        WHERE "tenantId" = ${tenantId} AND feedback IS NOT NULL
        GROUP BY feedback
      ` as Promise<{ feedback: string; count: number }[]>,

      // Operations stats
      prisma.$queryRaw`
        SELECT
          status,
          COUNT(*)::int as count,
          AVG(completeness)::float as avg_completeness
        FROM operations
        WHERE "tenantId" = ${tenantId}
        GROUP BY status
      ` as Promise<{ status: string; count: number; avg_completeness: number }[]>,
    ]);

    // Average confidence
    const avgConfidence = await prisma.classification.aggregate({
      where: { tenantId },
      _avg: { confidence: true },
    });

    // Total landed cost from quotes
    const quoteTotals = await prisma.$queryRaw`
      SELECT
        COUNT(*)::int as total_quotes,
        COALESCE(SUM("customsValue"), 0)::float as total_value,
        COALESCE(AVG("customsValue"), 0)::float as avg_value
      FROM quotes
      WHERE "tenantId" = ${tenantId}
    ` as { total_quotes: number; total_value: number; avg_value: number }[];

    res.json({
      status: 'ok',
      data: {
        summary: {
          totalClassifications,
          totalQuotes,
          totalCopilot,
          avgConfidence: Math.round((avgConfidence._avg.confidence || 0) * 10) / 10,
          totalCustomsValue: quoteTotals[0]?.total_value || 0,
          avgCustomsValue: Math.round((quoteTotals[0]?.avg_value || 0) * 100) / 100,
        },
        timeline: {
          classifications: recentClassifications,
          quotes: recentQuotes,
        },
        topFractions,
        topOrigins,
        feedbackStats,
        operationStats,
      },
    });
  } catch (err) {
    next(err);
  }
});
