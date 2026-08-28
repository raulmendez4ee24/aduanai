import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { getUserPermissions, hasPermission } from '../services/permissions';
import { calculateQuote } from '../services/quoter';
import { calculateMultiQuote, compareScenarios, type MultiQuoteInput, type ScenarioVariant } from '../services/quoter-multi';
import { getRecentRates, seedSyntheticHistory, getOfficialRate, refreshOfficialRate } from '../services/exchange-rate';
import { prisma } from '../lib/prisma';
import { aprobar } from '../services/aprobaciones';
import { clienteIdDe, filtroCliente, validarClienteDelTenant, alcanceDe, whereConAlcance } from '../lib/cliente-contexto';
import { requireRole } from '../middlewares/auth';
// ── OPERACIÓN 2026-08 (Ola 2 cotizador) ──
import type { Prisma } from '@prisma/client';
import { esTipoOperacionDTA } from '../lib/dta';
import { catalogoDTARespaldado } from '../services/cotizador-dta';
import {
  listarTabuladores, obtenerTabulador, crearTabulador, actualizarTabulador, eliminarTabulador, type ReglaHonorarios,
} from '../services/tabulador-honorarios';
import {
  listarCotizaciones, obtenerCotizacion, duplicarCotizacion, actualizarCotizacion, exportarCotizacionXlsx,
  resumirEscenarios, validarVariantes, ESCENARIOS_VENTA, folioDe,
} from '../services/cotizaciones';

export const quoteRouter = Router();

quoteRouter.post('/', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { fractionCode, customsValue, origin, incoterm, currency, exchangeRate, igiRateOverride, quantity, weightKg, unit, tipoOperacion, exportador } = req.body;

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
      tipoOperacion: esTipoOperacionDTA(tipoOperacion) ? tipoOperacion : undefined,
      exportador: typeof exportador === 'string' && exportador.trim() ? exportador.trim().slice(0, 160) : undefined,
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
        exchangeRate: result.exchangeRate,
        exchangeRateDate: new Date(result.exchangeRateDate),
        tcFechaDOF: result.tcFechaDOF ? new Date(result.tcFechaDOF) : null,
      },
    });

    const { checkRequiredPadrones } = await import('../services/padron-checker');
    const padronCheck = await checkRequiredPadrones(req.tenantId!, fractionCode, 'quote', created.id);

    res.json({ status: 'ok', data: { ...result, padronCheck, quoteId: created.id } });
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
export function validarRangosQuoteSimple(b: { customsValue?: unknown; exchangeRate?: unknown; igiRateOverride?: unknown; quantity?: unknown; weightKg?: unknown; tipoOperacion?: unknown; exportador?: unknown }): string | null {
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
  // Ola 2: tipo de operación del catálogo DTA; exportador texto acotado.
  if (b.tipoOperacion != null && b.tipoOperacion !== '' && !esTipoOperacionDTA(b.tipoOperacion)) return 'Tipo de operación inválido (usa el catálogo DTA).';
  if (b.exportador != null && (typeof b.exportador !== 'string' || b.exportador.length > 160)) return 'Exportador inválido (texto, máximo 160 caracteres).';
  return null;
}

export function validarRangosMultiQuote(input: MultiQuoteInput): string | null {
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
    if (it.exportador != null && (typeof it.exportador !== 'string' || it.exportador.length > 160)) {
      return `Exportador inválido en la partida ${i + 1} (texto, máximo 160 caracteres).`;
    }
  }
  // Ola 2: tipo de operación (DTA), tabulador y honorarios.
  if (input.tipoOperacion != null && (input.tipoOperacion as string) !== '' && !esTipoOperacionDTA(input.tipoOperacion)) {
    return 'Tipo de operación inválido (usa el catálogo DTA).';
  }
  if (input.tabuladorId != null && (typeof input.tabuladorId !== 'string' || input.tabuladorId.length > 64)) {
    return 'tabuladorId inválido.';
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
    if (!input.tipoOperacion) input.tipoOperacion = 'general';
    // Ola 2: tabulador del tenant (nunca de otro) → reglas al cálculo.
    input.tabulador = null;
    if (input.tabuladorId) {
      const t = await prisma.tabuladorHonorarios.findFirst({ where: { id: input.tabuladorId, tenantId: req.tenantId!, activo: true } });
      if (!t) return res.status(422).json({ status: 'error', message: 'Tabulador de honorarios no encontrado o inactivo' });
      input.tabulador = { id: t.id, nombre: t.nombre, reglas: (Array.isArray(t.reglas) ? t.reglas : []) as unknown as ReglaHonorarios[] };
    }
    const result = await calculateMultiQuote(input);
    const { tabulador: _tab, ...inputPersistible } = input;

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
        result: JSON.stringify({ ...result, input: inputPersistible }),
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
        tcFechaDOF: result.tcFechaDOF ? new Date(result.tcFechaDOF) : null,
        tabuladorId: input.tabulador?.id ?? null,
        vigenciaHasta: typeof req.body?.vigenciaHasta === 'string' && !isNaN(Date.parse(req.body.vigenciaHasta)) ? new Date(req.body.vigenciaHasta) : null,
        notas: typeof req.body?.notas === 'string' ? String(req.body.notas).slice(0, 4000) : null,
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
    const vv = validarVariantes(variants);
    if (vv.error) return res.status(422).json({ status: 'error', message: vv.error });
    // BUG-4: los escenarios usan el mismo tope — sin esto era una vía de
    // bypass directa (cotizar bien, editar a un valor absurdo y "Comparar").
    const rangoInvalidoBase = validarRangosMultiQuote(base);
    if (rangoInvalidoBase) {
      return res.status(422).json({ status: 'error', message: rangoInvalidoBase });
    }
    base.tabulador = null;
    const data = await compareScenarios(base, vv.variants);
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
quoteRouter.post('/exchange-rate/refresh', authenticate, requireRole('SUPERADMIN'), async (_req: AuthRequest, res, next) => {
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
quoteRouter.post('/exchange-rate/seed-history', authenticate, requireRole('SUPERADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.body?.days) || 90));
    const inserted = await seedSyntheticHistory(days);
    res.json({ status: 'ok', data: { inserted } });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// OPERACIÓN 2026-08 — Ola 2: cotizador como herramienta de venta
// (rutas fijas ANTES de /:id para que no las capture el parámetro)
// ══════════════════════════════════════════════════════════════════════════

// GET /api/quote/catalogos/dta — catálogo DTA con cotejo contra el corpus
quoteRouter.get('/catalogos/dta', authenticate, async (_req: AuthRequest, res, next) => {
  try {
    const { catalogo, fuente } = await catalogoDTARespaldado();
    res.json({ status: 'ok', data: { catalogo, fuente } });
  } catch (err) { next(err); }
});

// GET /api/quote/escenarios/plantilla — escenarios de venta por defecto
quoteRouter.get('/escenarios/plantilla', authenticate, (_req: AuthRequest, res) => {
  res.json({ status: 'ok', data: ESCENARIOS_VENTA });
});

// Tabuladores de honorarios — CRUD por tenant
quoteRouter.get('/tabuladores', authenticate, requirePermission('quoter', 'view'), async (req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await listarTabuladores(req.tenantId!) }); } catch (err) { next(err); }
});
quoteRouter.post('/tabuladores', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try { res.status(201).json({ status: 'ok', data: await crearTabulador(req.tenantId!, req.body ?? {}) }); } catch (err) { next(err); }
});
quoteRouter.get('/tabuladores/:id', authenticate, requirePermission('quoter', 'view'), async (req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await obtenerTabulador(req.tenantId!, String(req.params.id)) }); } catch (err) { next(err); }
});
quoteRouter.patch('/tabuladores/:id', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await actualizarTabulador(req.tenantId!, String(req.params.id), req.body ?? {}) }); } catch (err) { next(err); }
});
quoteRouter.delete('/tabuladores/:id', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try { await eliminarTabulador(req.tenantId!, String(req.params.id)); res.json({ status: 'ok' }); } catch (err) { next(err); }
});

// GET /api/quote — lista por tenant (+ cliente activo) con filtros y paginación
quoteRouter.get('/', authenticate, requirePermission('quoter', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const q = (k: string) => (typeof req.query[k] === 'string' ? String(req.query[k]).trim() : undefined);
    const data = await listarCotizaciones(req.tenantId!, {
      ...filtroCliente(req),
      nombre: q('nombre'), cliente: q('cliente'), desde: q('desde'), hasta: q('hasta'), estado: q('estado'),
      vigentes: q('vigentes') === '1' || q('vigentes') === 'true',
      page: Number(q('page')) || 1, pageSize: Number(q('pageSize')) || 25,
    });
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

// GET /api/quote/:id — cotización completa (resultado + entrada + versiones + folio)
quoteRouter.get('/:id', authenticate, requirePermission('quoter', 'view'), async (req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await obtenerCotizacion(req.tenantId!, String(req.params.id), alcanceDe(req)) }); } catch (err) { next(err); }
});

// GET /api/quote/:id/export.xlsx
quoteRouter.get('/:id/export.xlsx', authenticate, requirePermission('quoter', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const { buffer, folio } = await exportarCotizacionXlsx(req.tenantId!, String(req.params.id), alcanceDe(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${folio}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
});

// POST /api/quote/:id/duplicar — nueva versión encadenada (version+1, parentQuoteId)
quoteRouter.post('/:id/duplicar', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const perms = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
    const nueva = await duplicarCotizacion(req.tenantId!, String(req.params.id), req.userId!, {
      puedeAprobar: hasPermission(perms, 'quoter', 'approve'),
      nombre: typeof req.body?.nombre === 'string' ? req.body.nombre.slice(0, 160) : null,
    }, alcanceDe(req));
    res.status(201).json({ status: 'ok', data: { id: nueva.id, version: nueva.version, parentQuoteId: nueva.parentQuoteId, folio: await folioDe(nueva), status: nueva.status } });
  } catch (err) { next(err); }
});

// PATCH /api/quote/:id — nombre, notas, vigenciaHasta, escenarios, clienteId (NO toca status)
quoteRouter.patch('/:id', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const b = req.body ?? {};
    if ('status' in b || 'approvedAt' in b || 'approvedById' in b) {
      return res.status(422).json({ status: 'error', message: 'El estado de aprobación se cambia con /approve o en Aprobaciones, no con PATCH.' });
    }
    res.json({ status: 'ok', data: await actualizarCotizacion(req.tenantId!, String(req.params.id), b, alcanceDe(req)) });
  } catch (err) { next(err); }
});

// POST /api/quote/:id/escenarios — recalcula escenarios sobre la entrada guardada y los persiste
quoteRouter.post('/:id/escenarios', authenticate, requirePermission('quoter', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const c = await obtenerCotizacion(req.tenantId!, String(req.params.id), alcanceDe(req));
    const variantesRaw = Array.isArray(req.body?.variants) && req.body.variants.length ? req.body.variants : ESCENARIOS_VENTA;
    const vv = validarVariantes(variantesRaw);
    if (vv.error) return res.status(422).json({ status: 'error', message: vv.error });
    const base: MultiQuoteInput = { ...c.input, tabulador: null };
    if (c.tabuladorId) {
      const t = await prisma.tabuladorHonorarios.findFirst({ where: { id: c.tabuladorId, tenantId: req.tenantId!, activo: true } });
      if (t) base.tabulador = { id: t.id, nombre: t.nombre, reglas: (Array.isArray(t.reglas) ? t.reglas : []) as unknown as ReglaHonorarios[] };
    }
    const rango = validarRangosMultiQuote(base);
    if (rango) return res.status(422).json({ status: 'error', message: rango });
    const cmp = await compareScenarios(base, vv.variants);
    const resumen = resumirEscenarios(cmp, vv.variants);
    await prisma.quote.updateMany({ where: { id: c.id, tenantId: req.tenantId! }, data: { escenarios: resumen as unknown as Prisma.InputJsonValue } });
    res.json({ status: 'ok', data: { escenarios: resumen, comparacion: cmp } });
  } catch (err) { next(err); }
});

// POST /api/quote/:id/approve — VALIDATOR aprueba cotización creada por CLASSIFIER/CLASSIFIER
quoteRouter.post('/:id/approve', authenticate, requirePermission('quoter', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    // Cuarta revisión (prioridad 4): igual que en /classify/:id/approve, esta
    // puerta no dejaba evento encadenado. Delega en services/aprobaciones.
    const id = String(req.params.id);
    const existing = await prisma.quote.findFirst({
      where: whereConAlcance(req, { id, tenantId: req.tenantId! }),
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    const bruto = (req.body as { motivo?: unknown } | undefined)?.motivo;
    const motivo = typeof bruto === 'string' ? bruto.slice(0, 1000) : undefined;
    await aprobar('cotizacion', id, req.tenantId!, req.userId!, {
      motivo, legacyRole: req.userRole, ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null,
    });
    const updated = await prisma.quote.findFirst({ where: { id, tenantId: req.tenantId! } });
    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});
