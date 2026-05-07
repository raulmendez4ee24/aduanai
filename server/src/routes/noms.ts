import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { lookupCompliance } from '../services/compliance-lookup';
import {
  evaluateNOMs,
  generateCartaNoComercializacionHTML,
  type NOMOperationContext,
  type CartaNoComercializacionInput,
} from '../services/nom-exception-evaluator';

export const nomsRouter = Router();

// POST /api/noms/evaluate
//   { fractionCode, countryOfOrigin?, context: NOMOperationContext, noms?: [{code, authority?, description?}] }
// Si no se envía `noms`, se buscan automáticamente con compliance-lookup.
nomsRouter.post('/evaluate', authenticate, async (req, res, next) => {
  try {
    const body = req.body as {
      fractionCode?: string;
      countryOfOrigin?: string;
      context?: NOMOperationContext;
      noms?: { code: string; authority?: string; description?: string }[];
    };

    if (!body.fractionCode && !body.noms) {
      return res.status(400).json({ status: 'error', message: 'fractionCode o noms[] son requeridos' });
    }

    let noms = body.noms ?? [];
    if (!noms.length && body.fractionCode) {
      const compliance = await lookupCompliance(body.fractionCode, body.countryOfOrigin ?? '');
      noms = compliance.regulations
        .filter(r => r.type === 'NOM')
        .map(r => ({ code: r.code, authority: r.authority, description: r.description }));
    }

    const context = body.context ?? {};
    const evaluations = await evaluateNOMs(noms, context);

    res.json({ status: 'ok', data: { fractionCode: body.fractionCode, context, evaluations } });
  } catch (err) { next(err); }
});

// POST /api/noms/carta-no-comercializacion
//   Devuelve HTML imprimible (el cliente lo abre en nueva pestaña / Cmd+P)
nomsRouter.post('/carta-no-comercializacion', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as Partial<CartaNoComercializacionInput>;
    const required: (keyof CartaNoComercializacionInput)[] = [
      'empresa', 'rfc', 'representanteLegal', 'fractionCode', 'productDescription', 'noms', 'destination', 'exceptionCode',
    ];
    for (const k of required) {
      if (body[k] == null || (Array.isArray(body[k]) && (body[k] as unknown[]).length === 0)) {
        return res.status(400).json({ status: 'error', message: `Campo requerido: ${k}` });
      }
    }
    const html = generateCartaNoComercializacionHTML(body as CartaNoComercializacionInput);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="carta-no-comercializacion.html"');
    res.send(html);
  } catch (err) { next(err); }
});
