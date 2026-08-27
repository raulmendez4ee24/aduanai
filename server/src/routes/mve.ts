import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { clienteIdDe, filtroCliente, validarClienteDelTenant, alcanceDe, whereConAlcance } from '../lib/cliente-contexto';
import { logger } from '../lib/logger';
import {
  extractInvoiceData,
  generateFormatoE2,
  generateLayoutE2,
  validateMVE,
  getMVEDashboard,
  generateE2Text,
  catalogosE2,
  type ExtrasE2,
} from '../services/auto-mve';
import {
  construirDatosMVE, crearMVE, rfcDeContexto, buscarPlantilla, aplicarPlantillaAExtraccion, listarPlantillas,
  vigenciasPorProveedor, marcarTransmitidaPorUsuario, procesarLote, LOTE_MAX,
  type CuerpoMVE,
} from '../services/mve-operacion';

export const mveRouter = Router();

async function nombreTenant(tenantId: string): Promise<string | undefined> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return t?.name;
}

// ============================================
// CATÁLOGOS E2 (métodos, conceptos, formas de pago + notas de cotejo)
// ============================================

mveRouter.get('/catalogos', authenticate, (_req, res) => {
  res.json({ status: 'ok', data: catalogosE2() });
});

// ============================================
// EXTRACCIÓN IA DE FACTURA (+ plantilla del proveedor)
// ============================================

mveRouter.post('/extract-invoice', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { invoiceText } = req.body;
    if (!invoiceText || invoiceText.trim().length < 20) {
      return res.status(400).json({
        status: 'error',
        message: 'Texto de factura requerido (minimo 20 caracteres)',
      });
    }

    const extraido = await extractInvoiceData(invoiceText);
    const plantilla = await buscarPlantilla(req.tenantId!, extraido.providerName);
    const { extracted, plantillaAplicada } = aplicarPlantillaAExtraccion(extraido, plantilla);
    const rfcContexto = await rfcDeContexto(req.tenantId!, clienteIdDe(req));
    if (!extracted.rfcImportador && rfcContexto) extracted.rfcImportador = rfcContexto;
    res.json({ status: 'ok', data: extracted, plantillaAplicada, rfcContexto });
  } catch (err) {
    next(err);
  }
});

// ============================================
// PLANTILLAS / VIGENCIAS / LOTE (antes de /:id)
// ============================================

mveRouter.get('/plantillas', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json({ status: 'ok', data: await listarPlantillas(req.tenantId!) });
  } catch (err) { next(err); }
});

mveRouter.get('/vigencias', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json({ status: 'ok', data: await vigenciasPorProveedor(req.tenantId!, alcanceDe(req)) });
  } catch (err) { next(err); }
});

// Lote síncrono (máx. LOTE_MAX). El resultado se guarda en memoria y en SystemLog
// para que GET /lote/:id lo devuelva sin tabla nueva.
const lotesEnMemoria = new Map<string, { tenantId: string; creadoEn: number; resultado: unknown }>();

mveRouter.post('/lote', authenticate, requirePermission('autoMVE', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const facturas = req.body?.facturas;
    if (!Array.isArray(facturas) || facturas.length === 0) {
      return res.status(400).json({ status: 'error', message: 'facturas[] requerido ({ nombre, contenidoBase64 | texto })' });
    }
    if (facturas.length > LOTE_MAX) {
      return res.status(400).json({ status: 'error', message: `Máximo ${LOTE_MAX} facturas por lote` });
    }
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const resultado = await procesarLote({ tenantId: req.tenantId!, clienteId, tenantName: await nombreTenant(req.tenantId!), facturas });
    const log = await prisma.systemLog.create({
      data: {
        level: 'INFO', tenantId: req.tenantId!, userId: req.userId ?? null, entity: 'MVELote', action: 'LOTE_MVE',
        endpoint: '/api/mve/lote', method: 'POST', metadata: resultado as object,
      },
    });
    lotesEnMemoria.set(log.id, { tenantId: req.tenantId!, creadoEn: Date.now(), resultado });
    // Poda simple: no acumular más de 200 lotes en memoria.
    if (lotesEnMemoria.size > 200) {
      const masViejo = Array.from(lotesEnMemoria.entries()).sort((a, b) => a[1].creadoEn - b[1].creadoEn)[0];
      if (masViejo) lotesEnMemoria.delete(masViejo[0]);
    }
    res.status(201).json({ status: 'ok', loteId: log.id, data: resultado });
  } catch (err) { next(err); }
});

mveRouter.get('/lote/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const mem = lotesEnMemoria.get(id);
    if (mem && mem.tenantId === req.tenantId) {
      return res.json({ status: 'ok', loteId: id, progreso: 'completado', data: mem.resultado });
    }
    const log = await prisma.systemLog.findFirst({ where: { id, tenantId: req.tenantId!, action: 'LOTE_MVE' } });
    if (!log) return res.status(404).json({ status: 'error', message: 'Lote no encontrado' });
    res.json({ status: 'ok', loteId: id, progreso: 'completado', data: log.metadata });
  } catch (err) { next(err); }
});

// ============================================
// CRUD MVE
// ============================================

// Crear MVE
mveRouter.post('/', authenticate, requirePermission('autoMVE', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const rfc = await rfcDeContexto(req.tenantId!, clienteId);
    const cuerpo = req.body as CuerpoMVE;
    if (cuerpo?.plantillaId) {
      // La plantilla debe ser del tenant; si no, se ignora (crearMVE la deriva del proveedor).
      const pl = await prisma.mVEPlantillaProveedor.findFirst({ where: { id: String(cuerpo.plantillaId), tenantId: req.tenantId! }, select: { id: true } });
      if (!pl) return res.status(400).json({ status: 'error', message: 'plantillaId inválida: no pertenece a tu empresa' });
    }
    const datos = construirDatosMVE(cuerpo, rfc);
    const mve = await crearMVE(req.tenantId!, clienteId, datos, await nombreTenant(req.tenantId!));
    res.status(201).json({ status: 'ok', data: mve, cuadre: datos.cuadre });
  } catch (err) {
    next(err);
  }
});

// Listar MVEs
mveRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const status = String(req.query.status || '');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where: Record<string, unknown> = { tenantId: req.tenantId!, ...filtroCliente(req) };
    if (status && ['DRAFT', 'VALIDATED', 'SIGNED', 'TRANSMITTED', 'ERROR'].includes(status)) {
      where.status = status;
    }
    const proveedor = String(req.query.proveedor || '').trim();
    if (proveedor) where.providerName = { contains: proveedor, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.manifestacionValor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { coves: { select: { id: true, eDocument: true, validated: true } } },
      }),
      prisma.manifestacionValor.count({ where }),
    ]);

    res.json({ status: 'ok', data, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

// Detalle MVE
mveRouter.get('/dashboard', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const dashboard = await getMVEDashboard(req.tenantId!, alcanceDe(req));
    res.json({ status: 'ok', data: dashboard });
  } catch (err) {
    next(err);
  }
});

mveRouter.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const mve = await prisma.manifestacionValor.findFirst({
      where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }),
      include: { coves: true },
    });
    if (!mve) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }
    res.json({ status: 'ok', data: mve });
  } catch (err) {
    next(err);
  }
});

// Editar MVE
mveRouter.patch('/:id', authenticate, requirePermission('autoMVE', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.manifestacionValor.findFirst({
      where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }),
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }
    if (existing.estadoTransmision === 'transmitida_por_usuario') {
      return res.status(409).json({ status: 'error', message: 'La MVE ya fue marcada como transmitida; no se edita. Crea una nueva versión.' });
    }

    const body = req.body as Partial<CuerpoMVE> & { estadoTransmision?: unknown; status?: unknown };
    if (body.estadoTransmision !== undefined || body.status !== undefined) {
      return res.status(400).json({ status: 'error', message: 'estadoTransmision/status no se editan aquí: usa POST /:id/marcar-transmitida con folio VUCEM' });
    }

    const extrasPrev = (((existing.formatoE2 ?? {}) as Record<string, unknown>).extras as ExtrasE2 | undefined) ?? {};
    const inc = Array.isArray(existing.incrementables) ? existing.incrementables : [];
    const dec = Array.isArray(existing.decrementables) ? existing.decrementables : [];
    const usarPlanos = body.incrementables === undefined && (body.freightValue !== undefined || body.insuranceValue !== undefined || body.otherIncrements !== undefined);
    const fusionado: CuerpoMVE = {
      pedimento: body.pedimento !== undefined ? body.pedimento : existing.pedimento,
      providerName: body.providerName ?? existing.providerName,
      providerCountry: body.providerCountry ?? existing.providerCountry,
      invoiceNumber: body.invoiceNumber ?? existing.invoiceNumber,
      invoiceDate: body.invoiceDate ?? existing.invoiceDate.toISOString(),
      incoterm: body.incoterm ?? existing.incoterm,
      currency: body.currency ?? existing.currency,
      exchangeRate: body.exchangeRate !== undefined ? body.exchangeRate : existing.exchangeRate,
      invoiceValue: body.invoiceValue ?? existing.invoiceValue,
      // Si mandan planos sin conceptos, se reconstruyen los conceptos desde los planos.
      incrementables: usarPlanos ? [] : (body.incrementables ?? inc),
      freightValue: body.freightValue ?? existing.freightValue,
      insuranceValue: body.insuranceValue ?? existing.insuranceValue,
      otherIncrements: body.otherIncrements ?? existing.otherIncrements,
      decrementables: body.decrementables ?? dec,
      hasVinculacion: body.hasVinculacion ?? existing.hasVinculacion,
      vinculacionDesc: body.vinculacionDesc !== undefined ? body.vinculacionDesc : existing.vinculacionDesc,
      vinculacionAfectaPrecio: body.vinculacionAfectaPrecio !== undefined ? body.vinculacionAfectaPrecio : extrasPrev.vinculacionAfectaPrecio,
      metodoValoracion: body.metodoValoracion ?? existing.metodoValoracion,
      formaPago: body.formaPago !== undefined ? body.formaPago : existing.formaPago,
      plazoPagoDias: body.plazoPagoDias !== undefined ? body.plazoPagoDias : extrasPrev.plazoPagoDias,
      paymentTerms: body.paymentTerms !== undefined ? body.paymentTerms : extrasPrev.paymentTerms,
      rfcImportador: body.rfcImportador !== undefined ? body.rfcImportador : existing.rfcImportador,
      pesoBrutoKg: body.pesoBrutoKg !== undefined ? body.pesoBrutoKg : existing.pesoBrutoKg,
      pesoNetoKg: body.pesoNetoKg !== undefined ? body.pesoNetoKg : extrasPrev.pesoNetoKg,
      vigenciaHasta: body.vigenciaHasta !== undefined ? body.vigenciaHasta : existing.vigenciaHasta?.toISOString() ?? null,
      plantillaId: existing.plantillaId,
    };
    const datos = construirDatosMVE(fusionado, existing.rfcImportador);
    const { extras, cuadre, ...cols } = datos;
    const formatoE2 = generateFormatoE2({ ...cols, estadoTransmision: existing.estadoTransmision }, await nombreTenant(req.tenantId!), extras);

    const result = await prisma.manifestacionValor.update({
      where: { id: existing.id },
      data: {
        ...cols,
        incrementables: cols.incrementables as object[],
        decrementables: cols.decrementables as object[],
        formatoE2: formatoE2 as object,
        // Reset validation if data changed
        status: 'DRAFT',
        aiValidation: Prisma.DbNull,
        riskLevel: null,
      },
    });

    res.json({ status: 'ok', data: result, cuadre });
  } catch (err) {
    next(err);
  }
});

// Eliminar MVE
mveRouter.delete('/:id', authenticate, requirePermission('autoMVE', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.manifestacionValor.findFirst({
      where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }),
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }

    await prisma.cOVE.deleteMany({ where: { mveId: existing.id } });
    await prisma.manifestacionValor.delete({ where: { id: existing.id } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// VALIDACIÓN, FIRMA, TRANSMISIÓN (honesta)
// ============================================

mveRouter.post('/:id/validate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const visible = await prisma.manifestacionValor.findFirst({ where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }), select: { id: true } });
    if (!visible) return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    const validation = await validateMVE(String(req.params.id), req.tenantId!);
    res.json({ status: 'ok', data: validation });
  } catch (err) {
    next(err);
  }
});

mveRouter.post('/:id/sign', authenticate, requirePermission('autoMVE', 'sign'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.manifestacionValor.findFirst({
      where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }),
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }

    const updated = await prisma.manifestacionValor.update({
      where: { id: existing.id },
      data: { status: 'SIGNED', signedAt: new Date() },
    });

    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * ADUANAI NO transmite a VUCEM. El usuario transmite por su cuenta y aquí
 * registra el folio y la fecha. Es el ÚNICO camino a 'transmitida_por_usuario'.
 * El viejo POST /:id/transmit (que marcaba TRANSMITTED sin folio) queda fuera.
 */
mveRouter.post('/:id/marcar-transmitida', authenticate, requirePermission('autoMVE', 'sign'), async (req: AuthRequest, res, next) => {
  try {
    const { folioVucem, fechaTransmision } = req.body ?? {};
    if (typeof folioVucem !== 'string' || !folioVucem.trim() || !fechaTransmision) {
      return res.status(400).json({ status: 'error', message: 'folioVucem y fechaTransmision son obligatorios (transmisión hecha por el usuario en VUCEM)' });
    }
    const updated = await marcarTransmitidaPorUsuario(req.tenantId!, String(req.params.id), folioVucem, String(fechaTransmision), alcanceDe(req));
    logger.info('[mve] marcada transmitida por usuario', { entity: 'ManifestacionValor', entityId: updated.id, tenantId: req.tenantId });
    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});

mveRouter.post('/:id/transmit', authenticate, (_req, res) => {
  res.status(410).json({ status: 'error', message: 'Retirado: ADUANAI no transmite a VUCEM. Usa POST /:id/marcar-transmitida con folio y fecha.' });
});

// E2 como texto (para PDF)
mveRouter.get('/:id/pdf', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const mve = await prisma.manifestacionValor.findFirst({
      where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }),
    });
    if (!mve) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }

    const e2Text = generateE2Text(mve);
    res.json({ status: 'ok', data: { text: e2Text, mve } });
  } catch (err) {
    next(err);
  }
});

// Layout de salida (orden del formato E2). ?formato=xml descarga XML; default JSON.
mveRouter.get('/:id/layout', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const mve = await prisma.manifestacionValor.findFirst({
      where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }),
    });
    if (!mve) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }
    const extras = (((mve.formatoE2 ?? {}) as Record<string, unknown>).extras as ExtrasE2 | undefined) ?? {};
    const layout = generateLayoutE2(mve, await nombreTenant(req.tenantId!), extras);
    const formato = String(req.query.formato || 'json').toLowerCase();
    const base = `mve-${mve.invoiceNumber.replace(/[^A-Za-z0-9_-]+/g, '_')}-layout-trabajo`;
    if (formato === 'xml') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xml"`);
      return res.send(layout.xml);
    }
    res.json({ status: 'ok', data: { aviso: layout.aviso, campos: layout.campos, json: layout.json, estadoTransmision: mve.estadoTransmision } });
  } catch (err) {
    next(err);
  }
});

// ============================================
// COVEs
// ============================================

mveRouter.post('/coves', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { mveId, eDocument, invoiceNumber, providerTaxId, value, currency } = req.body;

    if (!mveId || !eDocument || !invoiceNumber || !value) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: mveId, eDocument, invoiceNumber, value',
      });
    }

    const mve = await prisma.manifestacionValor.findFirst({
      where: whereConAlcance(req, { id: mveId, tenantId: req.tenantId! }),
    });
    if (!mve) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }

    const cove = await prisma.cOVE.create({
      data: {
        eDocument,
        invoiceNumber,
        providerTaxId,
        value: Number(value),
        currency: currency || 'USD',
        mveId,
        tenantId: req.tenantId!,
      },
    });

    res.status(201).json({ status: 'ok', data: cove });
  } catch (err) {
    next(err);
  }
});

mveRouter.get('/:id/coves', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const coves = await prisma.cOVE.findMany({
      where: { mveId: String(req.params.id), tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'ok', data: coves });
  } catch (err) {
    next(err);
  }
});
