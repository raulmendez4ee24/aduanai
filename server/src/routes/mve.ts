import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import {
  extractInvoiceData,
  generateFormatoE2,
  validateMVE,
  getMVEDashboard,
  generateE2Text,
} from '../services/auto-mve';

export const mveRouter = Router();

// ============================================
// EXTRACCIÓN IA DE FACTURA
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

    const extracted = await extractInvoiceData(invoiceText);
    res.json({ status: 'ok', data: extracted });
  } catch (err) {
    next(err);
  }
});

// ============================================
// CRUD MVE
// ============================================

// Crear MVE
mveRouter.post('/', authenticate, requirePermission('autoMVE', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const {
      pedimento, providerName, providerCountry, invoiceNumber,
      invoiceDate, incoterm, currency, exchangeRate,
      invoiceValue, freightValue, insuranceValue, otherIncrements,
      hasVinculacion, vinculacionDesc,
    } = req.body;

    if (!providerName || !providerCountry || !invoiceNumber || !invoiceDate || !invoiceValue) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: providerName, providerCountry, invoiceNumber, invoiceDate, invoiceValue',
      });
    }

    const inv = Number(invoiceValue);
    const freight = Number(freightValue) || 0;
    const insurance = Number(insuranceValue) || 0;
    const other = Number(otherIncrements) || 0;
    const customsValue = inv + freight + insurance + other;

    const mveData = {
      pedimento,
      providerName,
      providerCountry,
      invoiceNumber,
      invoiceDate: new Date(invoiceDate),
      incoterm: incoterm || 'FOB',
      currency: currency || 'USD',
      exchangeRate: exchangeRate ? Number(exchangeRate) : null,
      invoiceValue: inv,
      freightValue: freight,
      insuranceValue: insurance,
      otherIncrements: other,
      customsValue,
      hasVinculacion: hasVinculacion || false,
      vinculacionDesc,
      tenantId: req.tenantId!,
    };

    // Generate E2 format
    const formatoE2 = generateFormatoE2({
      ...mveData,
      invoiceDate: new Date(invoiceDate),
    });

    const mve = await prisma.manifestacionValor.create({
      data: {
        ...mveData,
        formatoE2: formatoE2 as object,
      },
    });

    res.status(201).json({ status: 'ok', data: mve });
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

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (status && ['DRAFT', 'VALIDATED', 'SIGNED', 'TRANSMITTED', 'ERROR'].includes(status)) {
      where.status = status;
    }

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
    const dashboard = await getMVEDashboard(req.tenantId!);
    res.json({ status: 'ok', data: dashboard });
  } catch (err) {
    next(err);
  }
});

mveRouter.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const mve = await prisma.manifestacionValor.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
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
mveRouter.patch('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.manifestacionValor.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }

    const {
      pedimento, providerName, providerCountry, invoiceNumber,
      invoiceDate, incoterm, currency, exchangeRate,
      invoiceValue, freightValue, insuranceValue, otherIncrements,
      hasVinculacion, vinculacionDesc,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (pedimento !== undefined) data.pedimento = pedimento;
    if (providerName !== undefined) data.providerName = providerName;
    if (providerCountry !== undefined) data.providerCountry = providerCountry;
    if (invoiceNumber !== undefined) data.invoiceNumber = invoiceNumber;
    if (invoiceDate !== undefined) data.invoiceDate = new Date(invoiceDate);
    if (incoterm !== undefined) data.incoterm = incoterm;
    if (currency !== undefined) data.currency = currency;
    if (exchangeRate !== undefined) data.exchangeRate = exchangeRate ? Number(exchangeRate) : null;
    if (hasVinculacion !== undefined) data.hasVinculacion = hasVinculacion;
    if (vinculacionDesc !== undefined) data.vinculacionDesc = vinculacionDesc;

    // Recalculate customs value if any value changed
    if (invoiceValue !== undefined || freightValue !== undefined || insuranceValue !== undefined || otherIncrements !== undefined) {
      const inv = invoiceValue !== undefined ? Number(invoiceValue) : existing.invoiceValue;
      const freight = freightValue !== undefined ? Number(freightValue) : existing.freightValue;
      const insurance = insuranceValue !== undefined ? Number(insuranceValue) : existing.insuranceValue;
      const other = otherIncrements !== undefined ? Number(otherIncrements) : existing.otherIncrements;
      data.invoiceValue = inv;
      data.freightValue = freight;
      data.insuranceValue = insurance;
      data.otherIncrements = other;
      data.customsValue = inv + freight + insurance + other;
    }

    // Regenerate E2
    const updated = { ...existing, ...data };
    data.formatoE2 = generateFormatoE2({
      providerName: updated.providerName as string,
      providerCountry: updated.providerCountry as string,
      invoiceNumber: updated.invoiceNumber as string,
      invoiceDate: updated.invoiceDate as Date,
      incoterm: updated.incoterm as string,
      currency: updated.currency as string,
      exchangeRate: updated.exchangeRate as number | null,
      invoiceValue: updated.invoiceValue as number,
      freightValue: updated.freightValue as number,
      insuranceValue: updated.insuranceValue as number,
      otherIncrements: updated.otherIncrements as number,
      customsValue: updated.customsValue as number,
      hasVinculacion: updated.hasVinculacion as boolean,
      vinculacionDesc: updated.vinculacionDesc as string | null,
    }) as object;

    // Reset validation if data changed
    data.status = 'DRAFT';
    data.aiValidation = null;
    data.riskLevel = null;

    const result = await prisma.manifestacionValor.update({
      where: { id: existing.id },
      data,
    });

    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// Eliminar MVE
mveRouter.delete('/:id', authenticate, requirePermission('autoMVE', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.manifestacionValor.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
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
// VALIDACIÓN, FIRMA, TRANSMISIÓN
// ============================================

mveRouter.post('/:id/validate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const validation = await validateMVE(String(req.params.id), req.tenantId!);
    res.json({ status: 'ok', data: validation });
  } catch (err) {
    next(err);
  }
});

mveRouter.post('/:id/sign', authenticate, requirePermission('autoMVE', 'sign'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.manifestacionValor.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
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

mveRouter.post('/:id/transmit', authenticate, requirePermission('autoMVE', 'sign'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.manifestacionValor.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'MVE no encontrada' });
    }

    const updated = await prisma.manifestacionValor.update({
      where: { id: existing.id },
      data: { status: 'TRANSMITTED', transmittedAt: new Date() },
    });

    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});

// E2 como texto (para PDF)
mveRouter.get('/:id/pdf', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const mve = await prisma.manifestacionValor.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
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
      where: { id: mveId, tenantId: req.tenantId! },
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
