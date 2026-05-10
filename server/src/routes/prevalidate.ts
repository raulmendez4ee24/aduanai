import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prevalidatePedimento } from '../services/prevalidator';
import { validatePedimento, type PedimentoInput } from '../services/prevalidator-v2';
import { prisma } from '../lib/prisma';

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

    const { checkRequiredPadrones } = await import('../services/padron-checker');
    const padronCheck = await checkRequiredPadrones(req.tenantId!, fractionCode, 'prevalidate');

    // Inyectar PEDIMENTO_PADRON_MISSING como error bloqueante por cada padrón faltante
    const padronErrors = padronCheck.blocking.map(b => ({
      code: 'PEDIMENTO_PADRON_MISSING',
      severity: 'error' as const,
      field: 'importerRFC',
      message: `Padrón ${b.type === 'general' ? 'General de Importadores' : `Sectorial ${b.sectorialCode} (${b.sectorialName})`} no vigente. Sin esta inscripción el SAT puede embargar la mercancía y aplicar multa 70-100% del valor.`,
      rule: `${b.legalBasis} · Art. 144 LA · Art. 178 LA`,
    }));

    const blockingValid = padronErrors.length === 0 && result.valid;
    const blockingScore = padronErrors.length > 0 ? Math.min(result.score, 30) : result.score;

    res.json({
      status: 'ok',
      data: {
        ...result,
        valid: blockingValid,
        score: blockingScore,
        errors: [...result.errors, ...padronErrors],
        padronCheck,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── PEDIMENTO V2 ────────────────────────────────────────────────────────

// Validar sin guardar (solo correr las reglas)
prevalidateRouter.post('/pedimento/validate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { pedimento, aiCheck } = req.body as { pedimento: PedimentoInput; aiCheck?: boolean };
    if (!pedimento) {
      return res.status(400).json({ status: 'error', message: 'pedimento requerido' });
    }
    const result = await validatePedimento(pedimento, { aiCheck: !!aiCheck });
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// Crear / actualizar pedimento + correr validación
prevalidateRouter.post('/pedimento', authenticate, requirePermission('expedientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { pedimento, aiCheck } = req.body as { pedimento: PedimentoInput; aiCheck?: boolean };
    if (!pedimento) {
      return res.status(400).json({ status: 'error', message: 'pedimento requerido' });
    }

    // RFC del importador NO puede ser genérico ni inválido en operaciones formales
    const { validateRFC } = await import('../lib/rfc-validator');
    const rfcCheck = validateRFC(pedimento.rfcImportador, { allowGeneric: false });
    if (!rfcCheck.valid) {
      return res.status(400).json({
        status: 'error',
        message: rfcCheck.reason === 'GENERIC_RFC'
          ? 'RFC genérico no permitido para operaciones formales. Use el RFC del importador real.'
          : `RFC del importador inválido: ${rfcCheck.message}`,
        details: { field: 'rfcImportador', reason: rfcCheck.reason },
      });
    }

    const validation = await validatePedimento(pedimento, { aiCheck: !!aiCheck });

    const status = validation.errorsCount > 0 ? 'WITH_ERRORS' : 'VALIDATED';

    const created = await prisma.pedimento.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        numero: pedimento.numero,
        clave: pedimento.clave,
        aduana: pedimento.aduana,
        patenteAduanal: pedimento.patenteAduanal,
        rfcImportador: pedimento.rfcImportador,
        curp: pedimento.curp,
        tipoOperacion: pedimento.tipoOperacion,
        regimen: pedimento.regimen,
        destino: pedimento.destino,
        origen: pedimento.origen,
        pesoBruto: pedimento.pesoBruto,
        pesoNeto: pedimento.pesoNeto,
        bultos: pedimento.bultos,
        valorAduana: pedimento.valorAduana,
        valorComercial: pedimento.valorComercial,
        valorDolares: pedimento.valorDolares,
        tipoCambio: pedimento.tipoCambio,
        incoterm: pedimento.incoterm,
        transporte: pedimento.transporte,
        medioTransporte: pedimento.medioTransporte,
        factura: pedimento.factura,
        cove: pedimento.cove,
        bl: pedimento.bl,
        errors: validation.issues.filter(i => i.severity === 'error') as unknown as object,
        warnings: validation.issues.filter(i => i.severity === 'warning') as unknown as object,
        aiNotes: validation.aiNotes as unknown as object,
        status,
        partidas: {
          create: pedimento.partidas.map(p => ({
            numeroPartida: p.numeroPartida,
            fraccion: p.fraccion.replace(/\./g, ''),
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            unidadMedida: p.unidadMedida,
            unidadMedidaCom: p.unidadMedidaCom,
            valorUnitario: p.valorUnitario,
            valorAduana: p.valorAduana,
            pais: p.pais,
            paisVendedor: p.paisVendedor,
            igi: p.igi,
            dta: p.dta,
            iva: p.iva,
            ieps: p.ieps,
            permisos: (p.permisos ?? []) as unknown as object,
            identificadores: (p.identificadores ?? []) as unknown as object,
            vinculacion: p.vinculacion ?? false,
            vinculacionDesc: p.vinculacionDesc,
          })),
        },
      },
      include: { partidas: true },
    });

    res.status(201).json({ status: 'ok', data: { pedimento: created, validation } });
  } catch (err) {
    next(err);
  }
});

// Listar pedimentos del tenant
prevalidateRouter.get('/pedimento', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const status = String(req.query.status || '');
    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (status) where.status = status;
    const data = await prisma.pedimento.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        partidas: { select: { id: true, numeroPartida: true, fraccion: true, valorAduana: true } },
        _count: { select: { partidas: true } },
      },
    });
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// Detalle de pedimento
prevalidateRouter.get('/pedimento/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const ped = await prisma.pedimento.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { partidas: { orderBy: { numeroPartida: 'asc' } } },
    });
    if (!ped) return res.status(404).json({ status: 'error', message: 'Pedimento no encontrado' });
    res.json({ status: 'ok', data: ped });
  } catch (err) {
    next(err);
  }
});

// Eliminar
prevalidateRouter.delete('/pedimento/:id', authenticate, requirePermission('expedientes', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    const ped = await prisma.pedimento.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!ped) return res.status(404).json({ status: 'error', message: 'Pedimento no encontrado' });
    await prisma.pedimento.delete({ where: { id: ped.id } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});
