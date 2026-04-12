import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import {
  getInventoryBalances,
  getExpiringImports,
  detectInconsistencies,
  generateAnnex24Report,
  getAnnex30Account,
  getInventoryStats,
} from '../services/inventory';

export const inventoryRouter = Router();

// ============================================
// IMPORTACIONES TEMPORALES — CRUD
// ============================================

// Crear importación temporal
inventoryRouter.post('/imports', authenticate, async (req: AuthRequest, res, next) => {
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

    const entry = new Date(entryDate);
    const months = expirationMonths || 18;
    const expiration = new Date(entry);
    expiration.setMonth(expiration.getMonth() + months);

    const imp = await prisma.temporaryImport.create({
      data: {
        pedimento,
        fractionCode,
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

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
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
inventoryRouter.patch('/imports/:id', authenticate, async (req: AuthRequest, res, next) => {
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
inventoryRouter.delete('/imports/:id', authenticate, async (req: AuthRequest, res, next) => {
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
inventoryRouter.post('/discharges', authenticate, async (req: AuthRequest, res, next) => {
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

    // Verificar que la importación existe y pertenece al tenant
    const imp = await prisma.temporaryImport.findFirst({
      where: { id: temporaryImportId, tenantId: req.tenantId! },
    });
    if (!imp) {
      return res.status(404).json({ status: 'error', message: 'Importación temporal no encontrada' });
    }

    // Validar que no exceda la cantidad disponible
    const available = imp.quantity - imp.quantityDischarged;
    if (Number(quantity) > available) {
      return res.status(400).json({
        status: 'error',
        message: `Cantidad excede disponible. Disponible: ${available} ${imp.unit}`,
      });
    }

    const discharge = await prisma.discharge.create({
      data: {
        type,
        pedimento,
        quantity: Number(quantity),
        unit,
        customsValue: customsValue ? Number(customsValue) : null,
        dischargeDate: new Date(dischargeDate),
        destinationCountry,
        buyerName,
        taxesPaid: taxesPaid ? Number(taxesPaid) : null,
        notes,
        temporaryImportId,
        tenantId: req.tenantId!,
        userId: req.userId!,
      },
    });

    // Actualizar cantidad descargada y status de la importación
    const newDischarged = imp.quantityDischarged + Number(quantity);
    const newStatus = newDischarged >= imp.quantity ? 'FULLY_DISCHARGED' : 'PARTIALLY_DISCHARGED';

    await prisma.temporaryImport.update({
      where: { id: temporaryImportId },
      data: {
        quantityDischarged: newDischarged,
        status: newStatus,
      },
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
inventoryRouter.delete('/discharges/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const discharge = await prisma.discharge.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!discharge) {
      return res.status(404).json({ status: 'error', message: 'Descargo no encontrado' });
    }

    // Revertir la cantidad descargada en la importación
    const imp = await prisma.temporaryImport.findUnique({
      where: { id: discharge.temporaryImportId },
    });
    if (imp) {
      const newDischarged = Math.max(0, imp.quantityDischarged - discharge.quantity);
      await prisma.temporaryImport.update({
        where: { id: imp.id },
        data: {
          quantityDischarged: newDischarged,
          status: newDischarged === 0 ? 'ACTIVE' : 'PARTIALLY_DISCHARGED',
        },
      });
    }

    await prisma.discharge.delete({ where: { id: String(req.params.id) } });
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
