/**
 * /api/inventory/activo-fijo — Activo fijo IMMEX (Operación 2026-08).
 * Router propio (NO toca inventory.ts, que lo trabaja Anexo 24).
 *
 *   GET  /        lista TemporaryImport tipo ACTIVO_FIJO con vida útil, fecha de alta,
 *                 meses transcurridos y opciones de salida (retorno RT / cambio F5).
 *   POST /        alta manual mínima: crea TemporaryImport tipo AF. El AF importado
 *                 temporalmente por IMMEX permanece mientras el programa esté vigente
 *                 (Regla 4.3.1 RGCE 2026, en corpus) — se registra SIN vencimiento
 *                 operativo: expirationDate = entrada + vidaUtilMeses (o 120 meses
 *                 como horizonte contable) y expirationMonths = ese horizonte.
 */
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { clienteIdDe, validarClienteEnAlcance, whereConAlcance } from '../lib/cliente-contexto';
import { validateFraction, FRACTION_UNVERIFIED_MESSAGE } from '../services/fraction-validator';

export const activoFijoRouter = Router();
activoFijoRouter.use(authenticate);

export const HORIZONTE_AF_MESES = 120;

const mesesEntre = (a: Date, b: Date): number => Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()));

activoFijoRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const rows = await prisma.temporaryImport.findMany({
      where: whereConAlcance(req, { tenantId: req.tenantId!, tipo: 'ACTIVO_FIJO' }),
      orderBy: { entryDate: 'desc' }, take: 300,
      include: { ubicacion: { select: { id: true, nombre: true } } },
    });
    const ahora = new Date();
    const data = rows.map(r => {
      const transcurridos = mesesEntre(r.entryDate, ahora);
      const vidaUtil = r.vidaUtilMeses ?? null;
      return {
        id: r.id, pedimento: r.pedimento, fractionCode: r.fractionCode, description: r.description,
        quantity: r.quantity, quantityDischarged: r.quantityDischarged, unit: r.unit, customsValue: r.customsValue, valueMXN: r.valueMXN,
        supplier: r.supplier, originCountry: r.originCountry, entryDate: r.entryDate, status: r.status, clienteId: r.clienteId,
        claveDocumento: r.claveDocumento, vidaUtilMeses: vidaUtil, ubicacion: r.ubicacion,
        mesesTranscurridos: transcurridos,
        vidaUtilRestanteMeses: vidaUtil != null ? Math.max(0, vidaUtil - transcurridos) : null,
        opcionesSalida: [
          { tipo: 'RT', label: 'Retorno al extranjero (RT)', ruta: `/cambio-regimen?ids=${r.id}&tipo=RT` },
          { tipo: 'F5', label: 'Cambio de régimen a definitivo (F5) con cálculo de contribuciones', ruta: `/cambio-regimen?ids=${r.id}&tipo=F5` },
        ],
      };
    });
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

activoFijoRouter.post('/', requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const { pedimento, fractionCode, description, quantity, unit, customsValue, valueMXN, supplier, originCountry, entryDate, vidaUtilMeses, notes, ubicacionId } = req.body ?? {};
    if (!pedimento || !fractionCode || !quantity || !unit || !customsValue || !entryDate) {
      return res.status(400).json({ status: 'error', message: 'Campos requeridos: pedimento, fractionCode, quantity, unit, customsValue, entryDate' });
    }
    const fx = await validateFraction(String(fractionCode));
    if (!fx.valid) return res.status(400).json({ status: 'error', message: `Fracción "${fractionCode}" no válida (${fx.reason}). ${FRACTION_UNVERIFIED_MESSAGE}` });
    const entry = new Date(entryDate);
    if (Number.isNaN(entry.getTime())) return res.status(400).json({ status: 'error', message: 'entryDate inválida' });
    const vida = vidaUtilMeses != null && vidaUtilMeses !== '' ? Math.max(1, Math.round(Number(vidaUtilMeses))) : null;
    if (vida != null && !Number.isFinite(vida)) return res.status(400).json({ status: 'error', message: 'vidaUtilMeses inválida' });
    const horizonte = vida ?? HORIZONTE_AF_MESES;
    const expiration = new Date(entry); expiration.setMonth(expiration.getMonth() + horizonte);
    // El clienteId del body debe ser del tenant Y estar en el alcance del usuario (403/400 vía AppError).
    const clienteId = await validarClienteEnAlcance(req, req.tenantId!, req.body?.clienteId ?? clienteIdDe(req));
    if (ubicacionId) {
      const u = await prisma.ubicacion.findFirst({ where: whereConAlcance(req, { id: String(ubicacionId), tenantId: req.tenantId! }), select: { id: true } });
      if (!u) return res.status(400).json({ status: 'error', message: 'Ubicación no encontrada' });
    }
    const imp = await prisma.temporaryImport.create({
      data: {
        pedimento: String(pedimento), fractionCode: fx.code, description: String(description ?? ''), quantity: Number(quantity), unit: String(unit),
        customsValue: Number(customsValue), valueMXN: valueMXN ? Number(valueMXN) : null, supplier: supplier ?? null, originCountry: originCountry ?? null,
        entryDate: entry, expirationDate: expiration, expirationMonths: horizonte, notes: notes ?? null,
        tenantId: req.tenantId!, userId: req.userId!, clienteId,
        tipo: 'ACTIVO_FIJO', claveDocumento: 'AF', vidaUtilMeses: vida, ubicacionId: ubicacionId ? String(ubicacionId) : null,
      },
    });
    res.status(201).json({ status: 'ok', data: imp });
  } catch (err) { next(err); }
});
