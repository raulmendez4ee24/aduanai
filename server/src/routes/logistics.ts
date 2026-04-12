import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import {
  CONTAINER_SPECS,
  calculateCubicage,
  optimizeLoad,
  analyzeCosts,
} from '../services/logistics-optimizer';

export const logisticsRouter = Router();

// ============================================
// Contenedores estándar
// ============================================

logisticsRouter.get('/containers', authenticate, async (_req: AuthRequest, res) => {
  const containers = Object.entries(CONTAINER_SPECS).map(([type, spec]) => ({
    type,
    ...spec,
    volumeM3: ((spec.length * spec.width * spec.height) / 1_000_000).toFixed(1),
  }));
  res.json({ status: 'ok', data: containers });
});

// ============================================
// CRUD Load Plans
// ============================================

logisticsRouter.post('/plans', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { name, containerType, containerLength, containerWidth, containerHeight, maxWeight } = req.body;

    if (!name || !containerType) {
      return res.status(400).json({ status: 'error', message: 'Campos requeridos: name, containerType' });
    }

    // Use standard specs or custom
    const spec = CONTAINER_SPECS[containerType];
    const plan = await prisma.loadPlan.create({
      data: {
        name,
        containerType,
        containerLength: containerLength ? Number(containerLength) : (spec?.length || 0),
        containerWidth: containerWidth ? Number(containerWidth) : (spec?.width || 0),
        containerHeight: containerHeight ? Number(containerHeight) : (spec?.height || 0),
        maxWeight: maxWeight ? Number(maxWeight) : (spec?.maxWeight || 0),
        tenantId: req.tenantId!,
      },
      include: { items: true },
    });

    res.status(201).json({ status: 'ok', data: plan });
  } catch (err) {
    next(err);
  }
});

logisticsRouter.get('/plans', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const plans = await prisma.loadPlan.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { id: true, description: true, quantity: true } } },
    });
    res.json({ status: 'ok', data: plans });
  } catch (err) {
    next(err);
  }
});

logisticsRouter.get('/plans/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const plan = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!plan) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });
    res.json({ status: 'ok', data: plan });
  } catch (err) {
    next(err);
  }
});

logisticsRouter.patch('/plans/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });

    const { name, containerType, containerLength, containerWidth, containerHeight, maxWeight } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (containerType !== undefined) {
      data.containerType = containerType;
      const spec = CONTAINER_SPECS[containerType];
      if (spec && !containerLength) {
        data.containerLength = spec.length;
        data.containerWidth = spec.width;
        data.containerHeight = spec.height;
        data.maxWeight = spec.maxWeight;
      }
    }
    if (containerLength !== undefined) data.containerLength = Number(containerLength);
    if (containerWidth !== undefined) data.containerWidth = Number(containerWidth);
    if (containerHeight !== undefined) data.containerHeight = Number(containerHeight);
    if (maxWeight !== undefined) data.maxWeight = Number(maxWeight);

    const updated = await prisma.loadPlan.update({
      where: { id: existing.id },
      data,
      include: { items: true },
    });
    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});

logisticsRouter.delete('/plans/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!existing) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });

    await prisma.loadPlan.delete({ where: { id: existing.id } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Items
// ============================================

logisticsRouter.post('/plans/:id/items', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const plan = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!plan) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });

    const { description, quantity, length, width, height, weight, stackable, fragile } = req.body;
    if (!description || !quantity || !length || !width || !height || !weight) {
      return res.status(400).json({ status: 'error', message: 'Campos requeridos: description, quantity, length, width, height, weight' });
    }

    const item = await prisma.loadItem.create({
      data: {
        description,
        quantity: Number(quantity),
        length: Number(length),
        width: Number(width),
        height: Number(height),
        weight: Number(weight),
        stackable: stackable !== false,
        fragile: fragile === true,
        loadPlanId: plan.id,
      },
    });

    res.status(201).json({ status: 'ok', data: item });
  } catch (err) {
    next(err);
  }
});

logisticsRouter.delete('/plans/:id/items/:itemId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const plan = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!plan) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });

    await prisma.loadItem.delete({ where: { id: String(req.params.itemId) } });
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Calculate, Optimize, Costs
// ============================================

logisticsRouter.post('/plans/:id/calculate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const plan = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { items: true },
    });
    if (!plan) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });

    const result = calculateCubicage(
      { length: plan.containerLength, width: plan.containerWidth, height: plan.containerHeight, maxWeight: plan.maxWeight },
      plan.items,
    );

    await prisma.loadPlan.update({
      where: { id: plan.id },
      data: {
        totalItems: result.totalPieces,
        totalVolume: result.itemsVolume,
        totalWeight: result.totalWeight,
        volumeUsed: result.volumeUsedPct,
        weightUsed: result.weightUsedPct,
        status: 'calculated',
      },
    });

    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

logisticsRouter.post('/plans/:id/optimize', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const plan = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { items: true },
    });
    if (!plan) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });

    const cubicage = calculateCubicage(
      { length: plan.containerLength, width: plan.containerWidth, height: plan.containerHeight, maxWeight: plan.maxWeight },
      plan.items,
    );

    const optimization = await optimizeLoad(plan.containerType, {
      length: plan.containerLength,
      width: plan.containerWidth,
      height: plan.containerHeight,
      maxWeight: plan.maxWeight,
    }, plan.items, cubicage);

    await prisma.loadPlan.update({
      where: { id: plan.id },
      data: { aiOptimization: optimization as object, status: 'optimized' },
    });

    res.json({ status: 'ok', data: optimization });
  } catch (err) {
    next(err);
  }
});

logisticsRouter.post('/plans/:id/costs', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const plan = await prisma.loadPlan.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      include: { items: true },
    });
    if (!plan) return res.status(404).json({ status: 'error', message: 'Plan no encontrado' });

    const { origin, destination } = req.body;
    const costs = await analyzeCosts(plan.items, origin, destination);

    await prisma.loadPlan.update({
      where: { id: plan.id },
      data: { costAnalysis: costs as object },
    });

    res.json({ status: 'ok', data: costs });
  } catch (err) {
    next(err);
  }
});
