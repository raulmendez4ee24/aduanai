import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { calculateQuote } from '../services/quoter';
import { prisma } from '../lib/prisma';

export const quoteRouter = Router();

quoteRouter.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode, customsValue, origin, incoterm, currency } = req.body;

    if (!fractionCode || !customsValue || !origin) {
      return res.status(400).json({
        status: 'error',
        message: 'Fracción arancelaria, valor y origen son requeridos',
      });
    }

    const result = await calculateQuote({
      fractionCode,
      customsValue: Number(customsValue),
      origin,
      incoterm: incoterm || 'CIF',
      currency: currency || 'USD',
    });

    await prisma.quote.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        fractionCode,
        customsValue: Number(customsValue),
        origin,
        incoterm: incoterm || 'CIF',
        currency: currency || 'USD',
        result: JSON.stringify(result),
      },
    });

    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});
