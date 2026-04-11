import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prevalidatePedimento } from '../services/prevalidator';

export const prevalidateRouter = Router();

prevalidateRouter.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode, origin, customsValue, currency, incoterm, operationType, regime, customsBroker, importerRFC, exchangeRate, grossWeight, netWeight, packages, invoiceNumber } = req.body;

    if (!fractionCode) {
      return res.status(400).json({ status: 'error', message: 'Fracción arancelaria requerida' });
    }

    const result = await prevalidatePedimento({
      fractionCode,
      origin: origin || '',
      customsValue: Number(customsValue) || 0,
      currency: currency || 'USD',
      incoterm: incoterm || 'CIF',
      operationType: operationType || 'IMPORT',
      regime: regime || 'definitivo',
      customsBroker,
      importerRFC,
      exchangeRate: exchangeRate ? Number(exchangeRate) : undefined,
      grossWeight: grossWeight ? Number(grossWeight) : undefined,
      netWeight: netWeight ? Number(netWeight) : undefined,
      packages: packages ? Number(packages) : undefined,
      invoiceNumber,
    });

    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});
