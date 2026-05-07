/**
 * Endpoint público de validación de RFC — usado por el front en blur del input.
 * Sin auth (rate-limit por IP via publicLimiter aplicado upstream).
 */

import { Router } from 'express';
import { validateRFC } from '../lib/rfc-validator';

export const rfcRouter = Router();

rfcRouter.post('/validate', (req, res) => {
  const { rfc, allowGeneric, expectedType } = req.body as {
    rfc?: string;
    allowGeneric?: boolean;
    expectedType?: 'moral' | 'fisica';
  };
  const result = validateRFC(rfc ?? '', { allowGeneric, expectedType });
  res.json({ status: 'ok', data: result });
});
