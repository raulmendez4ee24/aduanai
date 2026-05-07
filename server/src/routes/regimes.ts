/**
 * Endpoints de PROSEC, Regla 8va, IEPS, ISAN.
 *
 *   POST /api/regimes/prosec     — verifica elegibilidad PROSEC
 *   POST /api/regimes/regla-8va  — verifica regla 8va
 *   POST /api/regimes/ieps       — calcula IEPS
 *   POST /api/regimes/isan       — calcula ISAN
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { checkPROSEC, checkRegla8va, checkIEPS, calculateISAN } from '../services/regimes-programs';

export const regimesRouter = Router();

regimesRouter.post('/prosec', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode } = req.body as { fractionCode?: string };
    if (!fractionCode) return res.status(400).json({ status: 'error', message: 'fractionCode requerido' });
    const result = await checkPROSEC(fractionCode);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

regimesRouter.post('/regla-8va', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { partFraction, vehicleFraction } = req.body as { partFraction?: string; vehicleFraction?: string };
    if (!partFraction) return res.status(400).json({ status: 'error', message: 'partFraction requerida' });
    const result = await checkRegla8va(partFraction, vehicleFraction);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

regimesRouter.post('/ieps', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode, baseMXN, quantity, unit } = req.body as { fractionCode?: string; baseMXN?: number; quantity?: number; unit?: string };
    if (!fractionCode) return res.status(400).json({ status: 'error', message: 'fractionCode requerido' });
    const result = await checkIEPS({ fractionCode, baseMXN, quantity, unit });
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

regimesRouter.post('/isan', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode, priceMXN, isElectric } = req.body as { fractionCode?: string; priceMXN?: number; isElectric?: boolean };
    if (!fractionCode || priceMXN == null) return res.status(400).json({ status: 'error', message: 'fractionCode y priceMXN requeridos' });
    const result = await calculateISAN(fractionCode, priceMXN, isElectric);
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});
