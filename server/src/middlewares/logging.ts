/**
 * Middleware de logging estructurado por request.
 *
 * - Asigna `requestId` único (UUID corto)
 * - Mide latencia exacta
 * - Persiste cada request finalizado en SystemLog (level INFO si 2xx/3xx, WARN si 4xx, ERROR si 5xx)
 * - Captura errores no manejados y persiste con stack
 * - Skip de paths ruidosos (health, static, métricas)
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger';
import type { AuthRequest } from './auth';

const SKIP_PATHS = [/^\/api\/health/, /^\/api\/stats\b/, /\.(js|css|png|jpg|svg|ico|map)$/];

function shouldSkip(url: string): boolean {
  return SKIP_PATHS.some(rx => rx.test(url));
}

function levelFromStatus(status: number): 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' {
  if (status >= 500) return status >= 502 ? 'CRITICAL' : 'ERROR';
  if (status >= 400) return 'WARN';
  return 'INFO';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { requestId?: string }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = crypto.randomBytes(8).toString('hex');
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  if (shouldSkip(req.originalUrl)) return next();

  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    const status = res.statusCode;
    const level = levelFromStatus(status);
    const ar = req as AuthRequest;
    const msg = `${req.method} ${req.originalUrl} ${status}`;
    logger[level === 'CRITICAL' ? 'critical' : level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info'](msg, {
      requestId,
      method: req.method,
      endpoint: req.originalUrl.split('?')[0],
      statusCode: status,
      latencyMs,
      tenantId: ar.tenantId,
      userId: ar.userId,
      userAgent: req.headers['user-agent'] as string | undefined,
      ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? undefined,
    });
  });

  next();
}

/** Error handler que captura stack traces y los persiste antes de devolver al cliente. */
export function errorLogger(err: Error & { status?: number; statusCode?: number; isOperational?: boolean; issues?: Array<{ path: (string|number)[]; message: string; code?: string }> }, req: Request, res: Response, _next: NextFunction): void {
  const ar = req as AuthRequest;
  // ZodError → 400 con detalle de fields (no 500 "Error interno")
  if (err.name === 'ZodError' && Array.isArray(err.issues)) {
    if (!res.headersSent) {
      res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos en el payload',
        fields: err.issues.map(i => ({ path: i.path.join('.'), message: i.message, code: i.code })),
        requestId: req.requestId,
      });
    }
    logger.warn('Validation error', {
      requestId: req.requestId, method: req.method, endpoint: req.originalUrl.split('?')[0],
      statusCode: 400, tenantId: ar.tenantId, userId: ar.userId,
      errorMessage: 'ZodError',
      metadata: { issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) },
    });
    return;
  }
  // AppError usa statusCode; algunos errores externos usan status
  const status = err.statusCode ?? err.status ?? 500;
  // Solo log severo cuando es 5xx; los 4xx (auth/validación) son INFO/WARN
  const level: 'info' | 'warn' | 'error' | 'critical' =
    status >= 500 ? (status >= 502 ? 'critical' : 'error')
    : status === 401 || status === 403 ? 'warn'
    : status >= 400 ? 'warn'
    : 'info';
  logger[level](err.message || 'Unhandled error', {
    requestId: req.requestId,
    method: req.method,
    endpoint: req.originalUrl.split('?')[0],
    statusCode: status,
    tenantId: ar.tenantId,
    userId: ar.userId,
    errorMessage: err.message,
    errorStack: status >= 500 ? err.stack : undefined,
    metadata: { name: err.name },
  });
  if (!res.headersSent) {
    res.status(status).json({
      status: 'error',
      // Mostrar el mensaje real para 4xx (orienta al cliente); ocultar 5xx en prod
      message: status < 500 || process.env.NODE_ENV !== 'production' ? err.message : 'Error interno',
      requestId: req.requestId,
    });
  }
}
