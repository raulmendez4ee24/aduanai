import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { classifyProduct } from '../services/classifier';
import { prisma } from '../lib/prisma';

export const classifyRouter = Router();

// POST /api/classify/demo — sin auth, 3 por IP por hora
const demoClassifyLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { status: 'error', message: 'Límite de 3 clasificaciones demo por hora. Regístrate para uso ilimitado.' },
});

classifyRouter.post('/demo', demoClassifyLimit, async (req, res, next) => {
  try {
    const { description } = req.body;

    if (!description || description.trim().length < 3) {
      return res.status(400).json({
        status: 'error',
        message: 'Descripción del producto requerida (mínimo 3 caracteres)',
      });
    }

    if (description.length > 200) {
      return res.status(400).json({
        status: 'error',
        message: 'Descripción demasiado larga para demo (máximo 200 caracteres)',
      });
    }

    const result = await classifyProduct(description);

    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/classify — con auth
classifyRouter.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { description, context } = req.body;

    if (!description || description.trim().length < 3) {
      return res.status(400).json({
        status: 'error',
        message: 'Descripción del producto requerida (mínimo 3 caracteres)',
      });
    }

    const result = await classifyProduct(description, context);

    // Guardar clasificación en historial
    const record = await prisma.classification.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        inputDescription: description,
        inputContext: context,
        fractionCode: result.fraction.code,
        fractionDescription: result.fraction.description,
        confidence: result.confidence,
        griApplied: result.griApplied,
        alternatives: JSON.stringify(result.alternatives),
        fullResponse: JSON.stringify(result),
      },
    });

    res.json({ status: 'ok', data: result, classificationId: record.id });
  } catch (err) {
    next(err);
  }
});

classifyRouter.get('/history', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const search = String(req.query.search || '');
    const page = String(req.query.page || '1');
    const limit = String(req.query.limit || '20');
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = { tenantId: req.tenantId! };
    if (search) {
      where.OR = [
        { inputDescription: { contains: search, mode: 'insensitive' } },
        { fractionCode: { contains: search } },
      ];
    }

    const [classifications, total] = await Promise.all([
      prisma.classification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip,
      }),
      prisma.classification.count({ where }),
    ]);

    res.json({
      status: 'ok',
      data: classifications,
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (err) {
    next(err);
  }
});

// Feedback en una clasificación
classifyRouter.patch('/:id/feedback', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { feedback, feedbackNote } = req.body;

    if (!['correct', 'incorrect', 'partial'].includes(feedback)) {
      return res.status(400).json({
        status: 'error',
        message: 'Feedback debe ser: correct, incorrect, o partial',
      });
    }

    const classification = await prisma.classification.update({
      where: { id },
      data: { feedback, feedbackNote },
    });

    res.json({ status: 'ok', data: classification });
  } catch (err) {
    next(err);
  }
});
