import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { construirFicha, navegarArbol } from '../services/fraction-ficha';

export const fractionsRouter = Router();

// Buscar fracciones arancelarias
fractionsRouter.get('/search', authenticate, async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    if (q.length < 2) {
      return res.json({ status: 'ok', data: [] });
    }

    const fractions = await prisma.fraction.findMany({
      where: {
        OR: [
          { code: { contains: q.replace(/\./g, '') } },
          { codeFormatted: { contains: q } },
          { description: { contains: q, mode: 'insensitive' } },
          { keywords: { hasSome: q.toLowerCase().split(' ').filter(w => w.length > 2) } },
        ],
      },
      select: {
        code: true,
        codeFormatted: true,
        description: true,
        tariffNMF: true,
        tariffTMEC: true,
        unit: true,
        noms: true,
        requiresPermit: true,
        permitType: true,
      },
      take: 20,
    });

    res.json({ status: 'ok', data: fractions });
  } catch (err) {
    next(err);
  }
});

// Ola 3 — árbol perezoso: ?nodo= '' | 'XVI' | '84' | '8471' | '847130'
fractionsRouter.get('/arbol', authenticate, async (req, res, next) => {
  try {
    const nodo = String(req.query.nodo ?? '');
    res.json({ status: 'ok', data: await navegarArbol(nodo) });
  } catch (err) {
    next(err);
  }
});

// Ola 3 — ficha completa: cada bloque con fuente/fechaDOF y vacío honesto
fractionsRouter.get('/:code/ficha', authenticate, async (req, res, next) => {
  try {
    const ficha = await construirFicha(String(req.params.code));
    if (!ficha) return res.status(404).json({ status: 'error', message: 'Fracción no encontrada' });
    res.json({ status: 'ok', data: ficha });
  } catch (err) {
    next(err);
  }
});

// Detalle de una fracción
fractionsRouter.get('/:code', authenticate, async (req, res, next) => {
  try {
    const code = String(req.params.code).replace(/\./g, '');

    const fraction = await prisma.fraction.findFirst({
      where: { code },
      include: {
        subheading: {
          include: {
            heading: {
              include: {
                chapter: {
                  include: { section: true },
                },
              },
            },
          },
        },
      },
    });

    if (!fraction) {
      return res.status(404).json({ status: 'error', message: 'Fracción no encontrada' });
    }

    res.json({ status: 'ok', data: fraction });
  } catch (err) {
    next(err);
  }
});
