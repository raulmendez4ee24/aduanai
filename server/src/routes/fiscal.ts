import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import {
  getFiscalAccount,
  getFiscalDashboard,
  detectFiscalRisks,
  simulateCertificationLoss,
  getGuaranteeAlerts,
} from '../services/fiscal-guardian';

export const fiscalRouter = Router();

// ============================================
// CRÉDITOS FISCALES
// ============================================

// Registrar crédito
fiscalRouter.post('/credits', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const {
      pedimento, fractionCode, ivaAmount, iepsAmount,
      creditDate, dischargeDeadline, relatedImportId, notes,
    } = req.body;

    if (!pedimento || !fractionCode || ivaAmount === undefined || !creditDate || !dischargeDeadline) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: pedimento, fractionCode, ivaAmount, creditDate, dischargeDeadline',
      });
    }

    const total = Number(ivaAmount) + (Number(iepsAmount) || 0);

    const credit = await prisma.taxCredit.create({
      data: {
        pedimento,
        fractionCode,
        ivaAmount: Number(ivaAmount),
        iepsAmount: Number(iepsAmount) || 0,
        creditDate: new Date(creditDate),
        dischargeDeadline: new Date(dischargeDeadline),
        remaining: total,
        relatedImportId,
        notes,
        tenantId: req.tenantId!,
      },
    });

    res.status(201).json({ status: 'ok', data: credit });
  } catch (err) {
    next(err);
  }
});

// Listar créditos
fiscalRouter.get('/credits', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const status = String(req.query.status || '');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (status && ['ACTIVE', 'PARTIALLY_USED', 'FULLY_USED', 'EXPIRED', 'IRREGULAR'].includes(status)) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      prisma.taxCredit.findMany({
        where,
        orderBy: { dischargeDeadline: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          usages: { orderBy: { usageDate: 'desc' } },
        },
      }),
      prisma.taxCredit.count({ where }),
    ]);

    res.json({ status: 'ok', data, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

// Detalle de crédito
fiscalRouter.get('/credits/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const credit = await prisma.taxCredit.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { usages: { orderBy: { usageDate: 'desc' } } },
    });

    if (!credit) {
      return res.status(404).json({ status: 'error', message: 'Credito no encontrado' });
    }

    res.json({ status: 'ok', data: credit });
  } catch (err) {
    next(err);
  }
});

// Registrar uso de crédito
fiscalRouter.post('/credits/:id/use', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const creditId = String(req.params.id);
    const { pedimentoDescargo, ivaApplied, iepsApplied, usageDate } = req.body;

    if (!pedimentoDescargo || ivaApplied === undefined || !usageDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: pedimentoDescargo, ivaApplied, usageDate',
      });
    }

    const credit = await prisma.taxCredit.findFirst({
      where: { id: creditId, tenantId: req.tenantId! },
    });
    if (!credit) {
      return res.status(404).json({ status: 'error', message: 'Credito no encontrado' });
    }

    const applyAmount = Number(ivaApplied) + (Number(iepsApplied) || 0);
    if (applyAmount > credit.remaining) {
      return res.status(400).json({
        status: 'error',
        message: `Monto excede saldo disponible. Disponible: $${credit.remaining.toLocaleString()} MXN`,
      });
    }

    const usage = await prisma.creditUsage.create({
      data: {
        pedimentoDescargo,
        ivaApplied: Number(ivaApplied),
        iepsApplied: Number(iepsApplied) || 0,
        usageDate: new Date(usageDate),
        creditId,
        tenantId: req.tenantId!,
      },
    });

    const newDischarged = credit.discharged + applyAmount;
    const newRemaining = credit.remaining - applyAmount;
    const totalCredit = credit.ivaAmount + credit.iepsAmount;
    const newStatus = newRemaining <= 0 ? 'FULLY_USED' : newDischarged > 0 ? 'PARTIALLY_USED' : 'ACTIVE';

    await prisma.taxCredit.update({
      where: { id: creditId },
      data: {
        discharged: newDischarged,
        remaining: Math.max(0, newRemaining),
        status: newStatus,
      },
    });

    res.status(201).json({ status: 'ok', data: usage });
  } catch (err) {
    next(err);
  }
});

// Eliminar crédito
fiscalRouter.delete('/credits/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const credit = await prisma.taxCredit.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!credit) {
      return res.status(404).json({ status: 'error', message: 'Credito no encontrado' });
    }

    const usageCount = await prisma.creditUsage.count({ where: { creditId: credit.id } });
    if (usageCount > 0) {
      return res.status(400).json({
        status: 'error',
        message: `No se puede eliminar: tiene ${usageCount} usos registrados.`,
      });
    }

    await prisma.taxCredit.delete({ where: { id: credit.id } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// ESTADO DE CUENTA Y DASHBOARD
// ============================================

fiscalRouter.get('/account', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const account = await getFiscalAccount(req.tenantId!);
    res.json({ status: 'ok', data: account });
  } catch (err) {
    next(err);
  }
});

fiscalRouter.get('/dashboard', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const dashboard = await getFiscalDashboard(req.tenantId!);
    res.json({ status: 'ok', data: dashboard });
  } catch (err) {
    next(err);
  }
});

// ============================================
// IA — RIESGOS Y SIMULACIÓN
// ============================================

fiscalRouter.get('/risks', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await detectFiscalRisks(req.tenantId!);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

fiscalRouter.post('/simulate-loss', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await simulateCertificationLoss(req.tenantId!);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// ============================================
// GARANTÍAS — CRUD
// ============================================

fiscalRouter.post('/guarantees', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { type, amount, institution, referenceNumber, issueDate, expiryDate, notes } = req.body;

    if (!type || !amount || !institution || !issueDate || !expiryDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos requeridos: type, amount, institution, issueDate, expiryDate',
      });
    }

    const guarantee = await prisma.guarantee.create({
      data: {
        type,
        amount: Number(amount),
        institution,
        referenceNumber,
        issueDate: new Date(issueDate),
        expiryDate: new Date(expiryDate),
        notes,
        tenantId: req.tenantId!,
      },
    });

    res.status(201).json({ status: 'ok', data: guarantee });
  } catch (err) {
    next(err);
  }
});

fiscalRouter.get('/guarantees', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const data = await getGuaranteeAlerts(req.tenantId!);
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

fiscalRouter.patch('/guarantees/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.guarantee.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Garantia no encontrada' });
    }

    const { status, amount, expiryDate, notes, referenceNumber } = req.body;
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (amount) data.amount = Number(amount);
    if (expiryDate) data.expiryDate = new Date(expiryDate);
    if (notes !== undefined) data.notes = notes;
    if (referenceNumber !== undefined) data.referenceNumber = referenceNumber;

    const updated = await prisma.guarantee.update({
      where: { id: existing.id },
      data,
    });

    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});

fiscalRouter.delete('/guarantees/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.guarantee.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Garantia no encontrada' });
    }

    await prisma.guarantee.delete({ where: { id: existing.id } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// CERTIFICACIÓN
// ============================================

fiscalRouter.get('/certification', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const cert = await prisma.certificationProfile.findUnique({
      where: { tenantId: req.tenantId! },
    });
    res.json({ status: 'ok', data: cert });
  } catch (err) {
    next(err);
  }
});

fiscalRouter.put('/certification', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { modality, certNumber, issueDate, expiryDate, renewalDeadline, status, notes } = req.body;

    if (!modality) {
      return res.status(400).json({ status: 'error', message: 'Modalidad requerida' });
    }

    const cert = await prisma.certificationProfile.upsert({
      where: { tenantId: req.tenantId! },
      create: {
        tenantId: req.tenantId!,
        modality,
        certNumber,
        issueDate: issueDate ? new Date(issueDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        renewalDeadline: renewalDeadline ? new Date(renewalDeadline) : null,
        status: status || 'ACTIVE',
        notes,
      },
      update: {
        modality,
        certNumber,
        issueDate: issueDate ? new Date(issueDate) : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        renewalDeadline: renewalDeadline ? new Date(renewalDeadline) : undefined,
        status: status || undefined,
        notes,
      },
    });

    res.json({ status: 'ok', data: cert });
  } catch (err) {
    next(err);
  }
});
