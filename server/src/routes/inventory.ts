import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import {
  getInventoryBalances,
  getExpiringImports,
  detectInconsistencies,
  generateAnnex24Report,
  getAnnex30Account,
  getInventoryStats,
} from '../services/inventory';
import { recordAssembly, traceImport } from '../services/bom-service';
import { validateFraction, FRACTION_UNVERIFIED_MESSAGE } from '../services/fraction-validator';
import { createDischargeAtomic, deleteDischargeAtomic } from '../services/inventory-ledger';
import { clienteIdDe, filtroCliente, validarClienteDelTenant } from '../lib/cliente-contexto';

export const inventoryRouter = Router();

// ============================================
// IMPORTACIONES TEMPORALES — CRUD
// ============================================

// Crear importación temporal
inventoryRouter.post('/imports', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const {
      pedimento, fractionCode, description, quantity, unit,
      customsValue, valueMXN, supplier, originCountry,
      entryDate, expirationMonths, notes,
    } = req.body;

    if (!pedimento || !fractionCode || !quantity || !unit || !customsValue || !entryDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: pedimento, fractionCode, quantity, unit, customsValue, entryDate',
      });
    }

    // Candado: la fracción DEBE existir y estar vigente en el catálogo. Falla cerrado.
    const fx = await validateFraction(fractionCode);
    if (!fx.valid) {
      return res.status(400).json({
        status: 'error',
        message: `Fracción "${fractionCode}" no válida (${fx.reason}). ${FRACTION_UNVERIFIED_MESSAGE}`,
      });
    }

    const entry = new Date(entryDate);
    const months = expirationMonths || 18;
    const expiration = new Date(entry);
    expiration.setMonth(expiration.getMonth() + months);

    const imp = await prisma.temporaryImport.create({
      data: {
        clienteId: await validarClienteDelTenant(req.tenantId!, clienteIdDe(req)),
        pedimento,
        fractionCode: fx.code,
        description: description || '',
        quantity: Number(quantity),
        unit,
        customsValue: Number(customsValue),
        valueMXN: valueMXN ? Number(valueMXN) : null,
        supplier,
        originCountry,
        entryDate: entry,
        expirationDate: expiration,
        expirationMonths: months,
        notes,
        tenantId: req.tenantId!,
        userId: req.userId!,
      },
    });

    res.status(201).json({ status: 'ok', data: imp });
  } catch (err) {
    next(err);
  }
});

// Listar importaciones temporales
inventoryRouter.get('/imports', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const status = String(req.query.status || '');
    const fraction = String(req.query.fraction || '');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where: Record<string, unknown> = { tenantId: req.tenantId!, ...filtroCliente(req) };
    if (status && ['ACTIVE', 'PARTIALLY_DISCHARGED', 'FULLY_DISCHARGED', 'EXPIRED', 'REGULARIZED'].includes(status)) {
      where.status = status;
    }
    if (fraction) {
      where.fractionCode = { startsWith: fraction };
    }

    const [data, total] = await Promise.all([
      prisma.temporaryImport.findMany({
        where,
        orderBy: { entryDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          discharges: {
            select: { id: true, type: true, quantity: true, dischargeDate: true },
            orderBy: { dischargeDate: 'desc' },
          },
        },
      }),
      prisma.temporaryImport.count({ where }),
    ]);

    res.json({ status: 'ok', data, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

// Detalle de importación temporal
inventoryRouter.get('/imports/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const imp = await prisma.temporaryImport.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: {
        discharges: { orderBy: { dischargeDate: 'desc' } },
      },
    });

    if (!imp) {
      return res.status(404).json({ status: 'error', message: 'Importación no encontrada' });
    }

    res.json({ status: 'ok', data: imp });
  } catch (err) {
    next(err);
  }
});

// Actualizar importación temporal
inventoryRouter.patch('/imports/:id', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.temporaryImport.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Importación no encontrada' });
    }

    const { description, supplier, originCountry, notes, expirationMonths } = req.body;
    const data: Record<string, unknown> = {};
    if (description !== undefined) data.description = description;
    if (supplier !== undefined) data.supplier = supplier;
    if (originCountry !== undefined) data.originCountry = originCountry;
    if (notes !== undefined) data.notes = notes;
    if (expirationMonths) {
      data.expirationMonths = Number(expirationMonths);
      const exp = new Date(existing.entryDate);
      exp.setMonth(exp.getMonth() + Number(expirationMonths));
      data.expirationDate = exp;
    }

    const updated = await prisma.temporaryImport.update({
      where: { id: String(req.params.id) },
      data,
    });

    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});

// Eliminar importación temporal
inventoryRouter.delete('/imports/:id', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.temporaryImport.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Importación no encontrada' });
    }

    // No permitir eliminar si tiene descargos
    const dischargeCount = await prisma.discharge.count({
      where: { temporaryImportId: String(req.params.id) },
    });
    if (dischargeCount > 0) {
      return res.status(400).json({
        status: 'error',
        message: `No se puede eliminar: tiene ${dischargeCount} descargos registrados. Elimine los descargos primero.`,
      });
    }

    await prisma.temporaryImport.delete({ where: { id: String(req.params.id) } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// DESCARGOS — CRUD
// ============================================

// Crear descargo
inventoryRouter.post('/discharges', authenticate, requirePermission('inventory', 'discharge'), async (req: AuthRequest, res, next) => {
  try {
    const {
      temporaryImportId, type, pedimento, quantity, unit,
      customsValue, dischargeDate, destinationCountry,
      buyerName, taxesPaid, notes,
    } = req.body;

    if (!temporaryImportId || !type || !quantity || !unit || !dischargeDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: temporaryImportId, type, quantity, unit, dischargeDate',
      });
    }

    const dischargeQuantity = Number(quantity);
    if (!Number.isFinite(dischargeQuantity) || dischargeQuantity <= 0) {
      return res.status(400).json({ status: 'error', message: 'La cantidad del descargo debe ser mayor a cero' });
    }

    const discharge = await createDischargeAtomic({
      temporaryImportId,
      tenantId: req.tenantId!,
      userId: req.userId!,
      type,
      pedimento,
      quantity: dischargeQuantity,
      unit,
      customsValue: customsValue ? Number(customsValue) : null,
      dischargeDate: new Date(dischargeDate),
      destinationCountry,
      buyerName,
      taxesPaid: taxesPaid ? Number(taxesPaid) : null,
      notes,
    });

    res.status(201).json({ status: 'ok', data: discharge });
  } catch (err) {
    next(err);
  }
});

// Listar descargos
inventoryRouter.get('/discharges', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const type = String(req.query.type || '');
    const importId = String(req.query.importId || '');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (type) where.type = type;
    if (importId) where.temporaryImportId = importId;

    const [data, total] = await Promise.all([
      prisma.discharge.findMany({
        where,
        orderBy: { dischargeDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          temporaryImport: {
            select: { pedimento: true, fractionCode: true, description: true },
          },
        },
      }),
      prisma.discharge.count({ where }),
    ]);

    res.json({ status: 'ok', data, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

// Eliminar descargo
inventoryRouter.delete('/discharges/:id', authenticate, requirePermission('inventory', 'discharge'), async (req: AuthRequest, res, next) => {
  try {
    await deleteDischargeAtomic(String(req.params.id), req.tenantId!);
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// SALDOS, ALERTAS, INCONSISTENCIAS
// ============================================

// Saldos actuales por fracción
inventoryRouter.get('/balance', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const balances = await getInventoryBalances(req.tenantId!);
    res.json({ status: 'ok', data: balances });
  } catch (err) {
    next(err);
  }
});

// Próximos a vencer
inventoryRouter.get('/expiring', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const days = Number(req.query.days) || 90;
    const data = await getExpiringImports(req.tenantId!, days);
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// Detección de inconsistencias con IA
inventoryRouter.get('/inconsistencies', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await detectInconsistencies(req.tenantId!);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// Stats del dashboard
inventoryRouter.get('/stats', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const stats = await getInventoryStats(req.tenantId!);
    res.json({ status: 'ok', data: stats });
  } catch (err) {
    next(err);
  }
});

// ============================================
// REPORTES ANEXO 24 / ANEXO 30
// ============================================

// Generar reporte Anexo 24
inventoryRouter.post('/annex24-report', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { periodStart, periodEnd, period } = req.body;

    if (!periodStart || !periodEnd || !period) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: periodStart, periodEnd, period',
      });
    }

    const result = await generateAnnex24Report(
      req.tenantId!,
      new Date(periodStart),
      new Date(periodEnd),
      period,
    );

    res.status(201).json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// Listar reportes Anexo 24
inventoryRouter.get('/annex24-reports', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const reports = await prisma.annex24Report.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'ok', data: reports });
  } catch (err) {
    next(err);
  }
});

// Estado de cuenta Anexo 30
inventoryRouter.get('/annex30-account', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const account = await getAnnex30Account(req.tenantId!);
    res.json({ status: 'ok', data: account });
  } catch (err) {
    next(err);
  }
});

// ============================================
// PRODUCTOS Y BOM — Bill of Materials
// ============================================

// Listar productos (con BOM expandido)
inventoryRouter.get('/products', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const where: { tenantId: string; isFinished?: boolean } = { tenantId: req.tenantId! };
    if (req.query.finished === 'true') where.isFinished = true;
    if (req.query.finished === 'false') where.isFinished = false;

    const products = await prisma.product.findMany({
      where,
      include: {
        components: { include: { component: true } },
        _count: { select: { assemblies: true } },
      },
      orderBy: [{ isFinished: 'desc' }, { productCode: 'asc' }],
    });
    res.json({ status: 'ok', data: products });
  } catch (err) {
    next(err);
  }
});

// Crear producto (materia prima o terminado)
inventoryRouter.post('/products', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { productCode, description, fractionCode, unit, isFinished } = req.body as {
      productCode?: string; description?: string; fractionCode?: string; unit?: string; isFinished?: boolean;
    };
    if (!productCode || !description || !unit) {
      return res.status(400).json({ status: 'error', message: 'productCode, description y unit son requeridos' });
    }
    // Candado: si se declara fracción DEBE existir y estar vigente. Sin fracción (null) es válido.
    let normalizedFraction: string | null = null;
    if (fractionCode != null && String(fractionCode).trim() !== '') {
      const fx = await validateFraction(fractionCode);
      if (!fx.valid) {
        return res.status(400).json({
          status: 'error',
          message: `Fracción "${fractionCode}" no válida (${fx.reason}). ${FRACTION_UNVERIFIED_MESSAGE}`,
        });
      }
      normalizedFraction = fx.code;
    }
    const product = await prisma.product.create({
      data: {
        tenantId: req.tenantId!,
        productCode,
        description,
        fractionCode: normalizedFraction,
        unit,
        isFinished: !!isFinished,
      },
    });
    res.status(201).json({ status: 'ok', data: product });
  } catch (err) {
    next(err);
  }
});

// Eliminar producto
inventoryRouter.delete('/products/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!product) return res.status(404).json({ status: 'error', message: 'Producto no encontrado' });
    await prisma.product.delete({ where: { id: product.id } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// Agregar/actualizar componente del BOM
inventoryRouter.post('/products/:id/components', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const productId = String(req.params.id);
    const { componentId, quantity, unit, scrapPercent, notes } = req.body as {
      componentId?: string; quantity?: number; unit?: string; scrapPercent?: number; notes?: string;
    };
    if (!componentId || quantity == null || !unit) {
      return res.status(400).json({ status: 'error', message: 'componentId, quantity y unit son requeridos' });
    }
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: req.tenantId! } });
    if (!product) return res.status(404).json({ status: 'error', message: 'Producto no encontrado' });
    if (!product.isFinished) return res.status(400).json({ status: 'error', message: 'Solo productos terminados pueden tener BOM' });
    const component = await prisma.product.findFirst({ where: { id: componentId, tenantId: req.tenantId! } });
    if (!component) return res.status(404).json({ status: 'error', message: 'Componente no encontrado' });

    const created = await prisma.productComponent.upsert({
      where: { productId_componentId: { productId, componentId } },
      update: { quantity, unit, scrapPercent: scrapPercent ?? 0, notes: notes ?? null },
      create: { productId, componentId, quantity, unit, scrapPercent: scrapPercent ?? 0, notes: notes ?? null },
    });
    res.status(201).json({ status: 'ok', data: created });
  } catch (err) {
    next(err);
  }
});

// Eliminar componente del BOM
inventoryRouter.delete('/products/:id/components/:componentId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!product) return res.status(404).json({ status: 'error', message: 'Producto no encontrado' });
    await prisma.productComponent.delete({
      where: { productId_componentId: { productId: product.id, componentId: String(req.params.componentId) } },
    });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// Importar BOM masivo
inventoryRouter.post('/bom/import', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const rows = (req.body?.components ?? []) as Array<{
      productCode: string; componentCode: string; quantity: number; unit: string; scrapPercent?: number;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'components[] requerido' });
    }

    const codes = Array.from(new Set(rows.flatMap(r => [r.productCode, r.componentCode])));
    const products = await prisma.product.findMany({
      where: { tenantId: req.tenantId!, productCode: { in: codes } },
    });
    const byCode = new Map(products.map(p => [p.productCode, p]));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const product = byCode.get(row.productCode);
      const component = byCode.get(row.componentCode);
      if (!product || !component) {
        skipped++;
        errors.push(`SKU no encontrado: ${!product ? row.productCode : row.componentCode}`);
        continue;
      }
      if (!product.isFinished) {
        skipped++;
        errors.push(`${row.productCode} no es producto terminado`);
        continue;
      }
      await prisma.productComponent.upsert({
        where: { productId_componentId: { productId: product.id, componentId: component.id } },
        update: { quantity: row.quantity, unit: row.unit, scrapPercent: row.scrapPercent ?? 0 },
        create: { productId: product.id, componentId: component.id, quantity: row.quantity, unit: row.unit, scrapPercent: row.scrapPercent ?? 0 },
      });
      created++;
    }
    res.json({ status: 'ok', data: { created, skipped, errors } });
  } catch (err) {
    next(err);
  }
});

// Registrar ensamble — descuenta componentes del inventario IMMEX FIFO
inventoryRouter.post('/assemblies', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { productId, quantity, assemblyDate, reference, notes } = req.body as {
      productId?: string; quantity?: number; assemblyDate?: string; reference?: string; notes?: string;
    };
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ status: 'error', message: 'productId y quantity > 0 son requeridos' });
    }
    const result = await recordAssembly({
      tenantId: req.tenantId!,
      productId,
      quantity,
      assemblyDate: assemblyDate ? new Date(assemblyDate) : undefined,
      reference,
      notes,
    });
    res.status(201).json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// Listar ensambles
inventoryRouter.get('/assemblies', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const assemblies = await prisma.assembly.findMany({
      where: { tenantId: req.tenantId! },
      include: {
        product: { select: { productCode: true, description: true, unit: true } },
        consumptions: true,
      },
      orderBy: { assemblyDate: 'desc' },
      take: 100,
    });
    res.json({ status: 'ok', data: assemblies });
  } catch (err) {
    next(err);
  }
});

// Trazabilidad reverse: dado un import, qué consumió
inventoryRouter.get('/traceability/:importId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const trace = await traceImport(req.tenantId!, String(req.params.importId));
    if (!trace) return res.status(404).json({ status: 'error', message: 'Importación no encontrada' });
    res.json({ status: 'ok', data: trace });
  } catch (err) {
    next(err);
  }
});
