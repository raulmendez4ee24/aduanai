import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { calculateQuote } from '../services/quoter';
import { calculateMultiQuote, compareScenarios, type MultiQuoteInput, type ScenarioVariant } from '../services/quoter-multi';
import { getRecentRates, seedSyntheticHistory } from '../services/exchange-rate';
import { prisma } from '../lib/prisma';

export const quoteRouter = Router();

quoteRouter.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode, customsValue, origin, incoterm, currency, exchangeRate, igiRateOverride } = req.body;

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
      exchangeRate: exchangeRate != null ? Number(exchangeRate) : undefined,
      igiRateOverride: igiRateOverride != null ? Number(igiRateOverride) : undefined,
    });

    const created = await prisma.quote.create({
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

    const { checkRequiredPadrones } = await import('../services/padron-checker');
    const padronCheck = await checkRequiredPadrones(req.tenantId!, fractionCode, 'quote', created.id);

    res.json({ status: 'ok', data: { ...result, padronCheck } });
  } catch (err) {
    next(err);
  }
});

// POST /api/quote/multi — multi-partida con costos de despacho editables
quoteRouter.post('/multi', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = req.body as MultiQuoteInput;
    if (!input?.items?.length) {
      return res.status(400).json({ status: 'error', message: 'items[] requerido (al menos 1 partida)' });
    }
    const result = await calculateMultiQuote(input);

    // Persistir Quote + items
    const firstItem = input.items[0];
    const created = await prisma.quote.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        fractionCode: firstItem.fractionCode,
        customsValue: firstItem.quantity * firstItem.unitValueUSD,
        origin: input.origin ?? firstItem.countryOfOrigin ?? '',
        incoterm: input.incoterm ?? 'CIF',
        currency: input.currency ?? 'USD',
        result: JSON.stringify(result),
        name: input.name,
        client: input.client,
        destination: input.destination,
        exchangeRate: result.exchangeRate,
        exchangeRateDate: new Date(result.exchangeRateDate),
        honorariosAgente: result.dispatch.honorariosAgente,
        prevalidacion: result.dispatch.prevalidacion,
        almacenaje: result.dispatch.almacenaje,
        estiba: result.dispatch.estiba,
        fleteInterno: result.dispatch.fleteInterno,
        otrosGastos: result.dispatch.otrosGastos,
        totalLandedCost: result.totals.totalLandedCost,
        totalDispatch: result.totals.totalDispatch,
        totalAll: result.totals.totalAll,
        items: {
          create: result.items.map(it => ({
            numeroPartida: it.numeroPartida,
            fractionCode: it.fractionCode,
            description: it.description,
            countryOfOrigin: it.countryOfOrigin,
            quantity: it.quantity,
            unit: it.unit,
            unitValueUSD: it.unitValueUSD,
            totalValueUSD: it.totalValueUSD,
            freightUSD: it.freightUSD,
            insuranceUSD: it.insuranceUSD,
            customsValueUSD: it.customsValueUSD,
            customsValueMXN: it.customsValueMXN,
            igiRate: it.igiRate,
            dtaRate: it.dtaRate,
            ivaRate: it.ivaRate,
            iepsRate: it.iepsRate,
            countervailingRate: it.countervailingRate,
            igi: it.igi,
            dta: it.dta,
            ieps: it.ieps,
            countervailing: it.countervailing,
            iva: it.iva,
            totalDuties: it.totalDuties,
            totalCost: it.totalCost,
            hasAntidumping: it.hasAntidumping,
            antidumpingDecree: it.antidumpingDecree,
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json({ status: 'ok', data: { quoteId: created.id, ...result } });
  } catch (err) {
    next(err);
  }
});

// POST /api/quote/scenarios — base + variants[]
quoteRouter.post('/scenarios', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { base, variants } = req.body as { base: MultiQuoteInput; variants: ScenarioVariant[] };
    if (!base?.items?.length) {
      return res.status(400).json({ status: 'error', message: 'base.items[] requerido' });
    }
    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ status: 'error', message: 'variants[] requerido' });
    }
    const data = await compareScenarios(base, variants);
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// GET /api/quote/exchange-rate/recent?days=90
quoteRouter.get('/exchange-rate/recent', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 90));
    const data = await getRecentRates(days);
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// POST /api/quote/exchange-rate/seed-history — sembrar histórico sintético
quoteRouter.post('/exchange-rate/seed-history', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.body?.days) || 90));
    const inserted = await seedSyntheticHistory(days);
    res.json({ status: 'ok', data: { inserted } });
  } catch (err) {
    next(err);
  }
});
