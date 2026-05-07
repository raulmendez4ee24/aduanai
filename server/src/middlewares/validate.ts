/**
 * Middleware de validación de payloads con Zod.
 *
 * Uso:
 *   import { validate, schemas } from '../middlewares/validate';
 *   router.post('/x', validate(schemas.classify), handler);
 *
 * Si la validación falla → 400 con array de issues en `details`.
 * El payload validado se asigna a req.body (typed).
 */

import { z, ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Datos inválidos',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────
// Schemas reutilizables
// ─────────────────────────────────────────────────────────────────────

export const schemas = {
  classify: z.object({
    description: z.string().trim().min(3, 'descripción mínima 3 chars').max(2000, 'descripción máxima 2000 chars'),
    context: z.string().max(2000).optional(),
    countryOfOrigin: z.string().max(100).optional(),
    declaredValueUSD: z.number().nonnegative().max(1e10).optional(),
    useCase: z.string().max(500).optional(),
    sector: z.enum([
      'automotive_terminal', 'automotive_parts', 'aeronautic', 'consumer_electronics',
      'medical_pharma', 'construction', 'textile_apparel', 'food_beverage',
      'industrial_machinery', 'agriculture', 'oil_gas', 'chemicals', 'general',
    ]).optional(),
    importerType: z.enum(['IMMEX', 'DEFINITIVO', 'PERSONA_FISICA']).optional(),
  }),

  classifyDemo: z.object({
    description: z.string().trim().min(3).max(200),
  }),

  login: z.object({
    email: z.string().email().max(200),
    password: z.string().min(1).max(200),
    rememberMe: z.boolean().optional(),
    // Honeypot — campo invisible que bots llenan; usuarios reales lo dejan vacío
    _hp: z.string().max(0).optional(),
    // Tiempo de llenado en ms — bots envían < 3000
    _formStartedAt: z.number().int().positive().optional(),
  }),

  register: z.object({
    email: z.string().email().max(200),
    password: z.string().min(8).max(200),
    name: z.string().trim().min(2).max(150),
    companyName: z.string().trim().min(2).max(200),
    phone: z.string().max(30).optional(),
    rfc: z.string().max(15).optional(),
    _hp: z.string().max(0).optional(),
    _formStartedAt: z.number().int().positive().optional(),
  }),

  lead: z.object({
    name: z.string().trim().min(2).max(150),
    company: z.string().max(200).optional(),
    email: z.string().email().max(200),
    phone: z.string().min(7).max(30),
    message: z.string().max(2000).optional(),
    source: z.string().max(50).optional(),
    rfc: z.string().max(15).optional(),
    industry: z.string().max(100).optional(),
    monthlyOps: z.string().max(50).optional(),
    hasIMMEX: z.boolean().optional(),
    currentSoftware: z.string().max(200).optional(),
    problems: z.array(z.string().max(100)).max(20).optional(),
    referralSource: z.string().max(200).optional(),
    _hp: z.string().max(0).optional(),
    _formStartedAt: z.number().int().positive().optional(),
  }),

  copilot: z.object({
    message: z.string().trim().min(1).max(4000),
    conversationId: z.string().max(50).optional(),
  }),

  forgotPassword: z.object({
    email: z.string().email().max(200),
    _hp: z.string().max(0).optional(),
  }),

  resetPassword: z.object({
    resetToken: z.string().min(10).max(500),
    newPassword: z.string().min(8).max(200),
  }),

  verifyEmail: z.object({
    code: z.string().min(4).max(10),
  }),
};

/**
 * Helper para validar honeypot + tiempo de llenado en formularios públicos.
 * Devuelve `null` si pasa, o un mensaje de error si falla.
 */
export function checkAntiBotFields(payload: { _hp?: string; _formStartedAt?: number }): { reason: string } | null {
  if (typeof payload._hp === 'string' && payload._hp.length > 0) {
    return { reason: 'honeypot_triggered' };
  }
  if (typeof payload._formStartedAt === 'number') {
    const elapsed = Date.now() - payload._formStartedAt;
    if (elapsed < 3000) return { reason: 'form_too_fast' };
  }
  return null;
}
