import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { getUserPermissions, hasPermission } from '../services/permissions';
import { calculateQuote } from '../services/quoter';
import { calculateMultiQuote, compareScenarios, type MultiQuoteInput, type ScenarioVariant } from '../services/quoter-multi';
import { getRecentRates, seedSyntheticHistory, getOfficialRate, refreshOfficialRate } from '../services/exchange-rate';
import { prisma } from '../lib/prisma';
import { clienteIdDe, filtroCliente, validarClienteDelTenant } from '../lib/cliente-contexto';

export const quoteRouter = Router();

quoteRouter.post('/', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode, customsValue, origin, incoterm, currency, exchangeRate, igiRateOverride, quantity, weightKg, unit } = req.body;

    if (!fractionCode || !customsValue || !origin) {
      return res.status(400).json({
        status: 'error',
        message: 'Fracción arancelaria, valor y origen son requeridos',
      });
    }
    const rangoInvalidoSimple = validarRangosQuoteSimple(req.body);
    if (rangoInvalidoSimple) {
      return res.status(422).json({ status: 'error', message: rangoInvalidoSimple });
    }

    const result = await calculateQuote({
      fractionCode,
      customsValue: Number(customsValue),
      origin,
      incoterm: incoterm || 'CIF',
      currency: currency || 'USD',
      exchangeRate: exchangeRate != null ? Number(exchangeRate) : undefined,
      igiRateOverride: igiRateOverride != null ? Number(igiRateOverride) : undefined,
      // Datos para cálculo correcto de cuotas compensatorias específicas
      // (USD/kg, USD/unit). Sin estos, el resultado lleva needsWeight=true
      // en alertas y el monto de cuota queda 0.
      quantity: quantity != null ? Number(quantity) : undefined,
      weightKg: weightKg != null ? Number(weightKg) : undefined,
      unit: typeof unit === 'string' ? unit : undefined,
    });

    const perms = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
    const canApprove = hasPermission(perms, 'quoter', 'approve');
    const status = canApprove ? 'approved' : 'pending_approval';

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
        status,
        approvedAt: canApprove ? new Date() : null,
        approvedById: canApprove ? req.userId! : null,
        clienteId: await validarClienteDelTenant(req.tenantId!, clienteIdDe(req)),
      },
    });

    const { checkRequiredPadrones } = await import('../services/padron-checker');
    const padronCheck = await checkRequiredPadrones(req.tenantId!, fractionCode, 'quote', created.id);

    res.json({ status: 'ok', data: { ...result, padronCheck } });
  } catch (err) {
    next(err);
  }
});


// BUG-4 (24-ago-2026): topes de cordura del cotizador — la línea dura del
// servidor (el cliente valida lo mismo, pero una petición directa no puede
// esquivar esto). $1,000 millones USD por partida/concepto; nada negativo;
// TC override dentro de un rango plausible.
const MAX_PARTIDA_USD = 1_000_000_000;
/** Rango del cotizador simple (POST /api/quote). Prod 27-ago: una cotización
 *  con customsValue=1e23 (prueba manual) reventó Analytics (total 1e+23 USD).
 *  Mismo tope que las partidas del multi. Exportada para test. */
export function validarRangosQuoteSimple(b: { customsValue?: unknown; exchangeRate?: unknown; igiRateOverride?: unknown; quantity?: unknown; weightKg?: unknown }): string | null {
  const v = Number(b.customsValue);
  if (!(Number.isFinite(v) && v > 0 && v <= MAX_PARTIDA_USD)) {
    return 'Valor en aduana fuera de rango: debe ser mayor a 0 y a lo sumo $1,000,000,000 USD.';
  }
  if (b.exchangeRate != null && !(Number.isFinite(Number(b.exchangeRate)) && Number(b.exchangeRate) > 0 && Number(b.exchangeRate) <= 100)) {
    return 'Tipo de cambio manual fuera de rango (debe ser mayor a 0 y a lo sumo 100 MXN/USD).';
  }
  if (b.igiRateOverride != null && !(Number.isFinite(Number(b.igiRateOverride)) && Number(b.igiRateOverride) >= 0 && Number(b.igiRateOverride) <= 100)) {
    return 'Override de IGI fuera de rango (0-100%).';
  }
  for (const [k, lbl] of [['quantity', 'Cantidad'], ['weightKg', 'Peso']] as const) {
    const x = b[k];
    if (x != null && !(Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= MAX_PARTIDA_USD)) return `${lbl} fuera de rango (0 a 1,000,000,000).`;
  }
  return null;
}

function validarRangosMultiQuote(input: MultiQuoteInput): string | null {
  const noNegativo = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= MAX_PARTIDA_USD);
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    if (!(Number.isFinite(it.quantity) && Number.isFinite(it.unitValueUSD)) ||
        it.quantity < 0 || it.unitValueUSD < 0 ||
        it.unitValueUSD > MAX_PARTIDA_USD || it.quantity * it.unitValueUSD > MAX_PARTIDA_USD) {
      return `Valor fuera de rango en la partida ${i + 1}: el valor por partida no puede exceder $1,000,000,000 USD ni ser negativo.`;
    }
    if (!noNegativo(it.freightUSD) || !noNegativo(it.insuranceUSD) || !noNegativo(it.weightKg)) {
      return `Flete, seguro o peso fuera de rango en la partida ${i + 1} (0 a $1,000,000,000).`;
    }
    if (it.igiRateOverride !== undefined && !(Number.isFinite(it.igiRateOverride) && it.igiRateOverride >= 0 && it.igiRateOverride <= 100)) {
      return `Override de IGI fuera de rango en la partida ${i + 1} (0-100%).`;
    }
  }
  if (input.exchangeRate !== undefined && !(Number.isFinite(input.exchangeRate) && input.exchangeRate > 0 && input.exchangeRate <= 100)) {
    return 'Tipo de cambio manual fuera de rango (debe ser mayor a 0 y a lo sumo 100 MXN/USD).';
  }
  const d = input.dispatch;
  if (d) {
    const costos: (number | undefined)[] = [d.honorariosAgente, d.prevalidacion, d.almacenaje, d.estiba, d.fleteInterno];
    if (costos.some(c => !noNegativo(c))) return 'Costos de despacho fuera de rango (0 a $1,000,000,000).';
    if (d.otrosGastos?.some(g => !noNegativo(g.amount))) return 'Otros gastos de despacho fuera de rango (0 a $1,000,000,000).';
  }
  return null;
}

// POST /api/quote/multi — multi-partida con costos de despacho editables
quoteRouter.post('/multi', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = req.body as MultiQuoteInput;
    if (!input?.items?.length) {
      return res.status(400).json({ status: 'error', message: 'items[] requerido (al menos 1 partida)' });
    }
    const rangoInvalido = validarRangosMultiQuote(input);
    if (rangoInvalido) {
      return res.status(422).json({ status: 'error', message: rangoInvalido });
    }
    const result = await calculateMultiQuote(input);

    const permsMulti = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
    const canApproveMulti = hasPermission(permsMulti, 'quoter', 'approve');
    const statusMulti = canApproveMulti ? 'approved' : 'pending_approval';

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
        status: statusMulti,
        approvedAt: canApproveMulti ? new Date() : null,
        approvedById: canApproveMulti ? req.userId! : null,
        clienteId: await validarClienteDelTenant(req.tenantId!, clienteIdDe(req)),
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
    // BUG-4: los escenarios usan el mismo tope — sin esto era una vía de
    // bypass directa (cotizar bien, editar a un valor absurdo y "Comparar").
    const rangoInvalidoBase = validarRangosMultiQuote(base);
    if (rangoInvalidoBase) {
      return res.status(422).json({ status: 'error', message: rangoInvalidoBase });
    }
    const data = await compareScenarios(base, variants);
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// GET /api/quote/exchange-rate/current — TC oficial actual con metadatos
// Lo usan TODOS los módulos que muestran TC en UI para evitar inconsistencias
// entre cotizador, pre-validador, MVE, etc.
quoteRouter.get('/exchange-rate/current', authenticate, async (_req: AuthRequest, res, next) => {
  try {
    const data = await getOfficialRate();
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// POST /api/quote/exchange-rate/refresh — fuerza pull a Banxico (admin/debug)
quoteRouter.post('/exchange-rate/refresh', authenticate, async (_req: AuthRequest, res, next) => {
  try {
    const data = await refreshOfficialRate();
    if (!data) return res.status(503).json({ status: 'error', message: 'No se pudo obtener el TC de ningún proveedor' });
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

// POST /api/quote/:id/approve — VALIDATOR aprueba cotización creada por CLASSIFIER/CLASSIFIER
quoteRouter.post('/:id/approve', authenticate, requirePermission('quoter', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.quote.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!existing) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (existing.status === 'approved') {
      return res.status(400).json({ status: 'error', message: 'La cotización ya está aprobada' });
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: { status: 'approved', approvedAt: new Date(), approvedById: req.userId! },
    });

    if (existing.userId === req.userId) {
      await prisma.permissionAuditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.userId!,
          action: 'SELF_APPROVAL_SOD',
          targetUserId: existing.userId,
          details: { module: 'quoter', resource: 'quote', resourceId: id, fractionCode: existing.fractionCode },
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });
    }

    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});
