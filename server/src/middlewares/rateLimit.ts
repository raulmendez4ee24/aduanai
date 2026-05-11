/**
 * Rate limiters por tipo + middleware de IP-block global.
 *
 * Cada limiter usa los standardHeaders (X-RateLimit-*) y un keyGenerator que
 * combina IP + userId cuando hay sesión, para limitar por usuario autenticado
 * y no solo por IP compartida (corporativos detrás de NAT).
 */

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { isIPBlocked, getClientIP, recordSecurityEvent } from '../lib/security';
import type { AuthRequest } from './auth';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** keyGen híbrido: usa userId si existe, si no la IP. */
const userOrIp = (req: Request): string => {
  const ar = req as AuthRequest;
  return ar.userId ? `u:${ar.userId}` : `ip:${getClientIP(req as never)}`;
};

const baseOpts: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIp,
  validate: { xForwardedForHeader: false }, // Railway añade X-Forwarded-For
  // Cuando se sobrepasa el límite, se persiste como SecurityEvent
  handler: (req, res, _next, options) => {
    const ip = getClientIP(req as never);
    const ar = req as AuthRequest;
    void recordSecurityEvent({
      type: 'rate_limit_hit',
      severity: 'medium',
      ip,
      userId: ar.userId,
      endpoint: req.originalUrl.split('?')[0],
      details: { windowMs: options.windowMs, limit: options.max },
    });
    res.status(options.statusCode ?? 429).json(options.message);
  },
};

// ─────────────────────────────────────────────────────────────────────
// Limiters configurados según spec
// ─────────────────────────────────────────────────────────────────────

/** Login + register: 5 intentos por IP cada 15 min. Logins exitosos no
 * cuentan al contador, así NAT compartido no se autobloquea por usuarios
 * legítimos que se logean correctamente entre intentos fallidos.
 */
export const authLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * MIN,
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `ip:${getClientIP(req as never)}`,
  message: { status: 'error', message: 'Demasiados intentos de autenticación fallidos. Intenta en 15 minutos.' },
});

/** Backwards-compat: alias para llamadas existentes. */
export const authLoginLimiter = authLimiter;
export const authRegisterLimiter = authLimiter;

/** /api/classify: 100 por usuario por hora. */
export const classifierLimiter = rateLimit({
  ...baseOpts,
  windowMs: HOUR,
  max: 100,
  message: { status: 'error', message: 'Límite de clasificaciones alcanzado (100/hora). Intenta en 1 hora.' },
});

/** /api/quote: 200 por usuario por hora. */
export const quoterLimiter = rateLimit({
  ...baseOpts,
  windowMs: HOUR,
  max: 200,
  message: { status: 'error', message: 'Límite de cotizaciones alcanzado (200/hora). Intenta en 1 hora.' },
});

/** /api/copilot: 50 por usuario por hora. */
export const copilotLimiter = rateLimit({
  ...baseOpts,
  windowMs: HOUR,
  max: 50,
  message: { status: 'error', message: 'Límite de consultas Copilot alcanzado (50/hora). Intenta en 1 hora.' },
});

/** /api/leads: 3 por IP por hora (anti-spam form público). */
export const leadLimiter = rateLimit({
  ...baseOpts,
  windowMs: HOUR,
  max: 3,
  keyGenerator: (req) => `ip:${getClientIP(req as never)}`,
  message: { status: 'error', message: 'Demasiados envíos de formulario. Intenta en 1 hora.' },
});

/** Demo público: 20 por IP por minuto. */
export const publicLimiter = rateLimit({
  ...baseOpts,
  windowMs: MIN,
  max: 20,
  keyGenerator: (req) => `ip:${getClientIP(req as never)}`,
  message: { status: 'error', message: 'Demasiadas solicitudes. Intenta en 1 minuto.' },
});

/** /api/admin: 1000 por usuario por hora. */
export const adminLimiter = rateLimit({
  ...baseOpts,
  windowMs: HOUR,
  max: 1000,
  message: { status: 'error', message: 'Límite admin alcanzado. Intenta en 1 hora.' },
});

/** General fallback: 200 por minuto. */
export const generalLimiter = rateLimit({
  ...baseOpts,
  windowMs: MIN,
  max: 200,
  message: { status: 'error', message: 'Demasiadas solicitudes. Intenta en 1 minuto.' },
});

/** Forgot password: 3 cada 15 min. */
export const forgotPasswordLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * MIN,
  max: 3,
  keyGenerator: (req) => `ip:${getClientIP(req as never)}`,
  message: { status: 'error', message: 'Demasiados intentos de recuperación. Intenta en 15 minutos.' },
});

// Aliases legacy
export const classifyLimiter = classifierLimiter;
export const demoLimiter = publicLimiter;
export const leadsLimiter = leadLimiter;

// ─────────────────────────────────────────────────────────────────────
// Middleware de IP-block global — corre antes de los limiters
// ─────────────────────────────────────────────────────────────────────

export async function ipBlockGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ip = getClientIP(req as never);
    if (await isIPBlocked(ip)) {
      void recordSecurityEvent({
        type: 'blocked_ip_attempt',
        severity: 'high',
        ip,
        endpoint: req.originalUrl.split('?')[0],
      });
      res.status(403).json({ status: 'error', message: 'IP bloqueada por actividad sospechosa. Contacta soporte.' });
      return;
    }
    next();
  } catch (err) {
    // No tirar el request si el chequeo falla
    console.error('[ipBlockGuard]', err instanceof Error ? err.message : err);
    next();
  }
}
