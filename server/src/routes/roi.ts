import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { computeROISummary, computeComplianceScore } from '../services/roi-service';

export const roiRouter = Router();

// GET /api/roi/summary?days=30
roiRouter.get('/summary', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const data = await computeROISummary(req.tenantId!, days);
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// GET /api/roi/compliance-score
roiRouter.get('/compliance-score', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const data = await computeComplianceScore(req.tenantId!);
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});
