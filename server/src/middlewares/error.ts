import { Request, Response, NextFunction } from 'express';
import { tipoDeErrorAnthropic, type TipoErrorAnthropic } from '../lib/anthropic';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Sin capacidad de IA (crédito/cuota): el usuario recibe un 503 con causa clara
// (nunca un 500 genérico ni una clasificación inventada) y se dispara alerta:
// SystemLog CRITICAL + SystemIncident, con throttle para no crear un incidente
// por request durante una caída sostenida.
const MENSAJE_IA: Record<TipoErrorAnthropic, string> = {
  credito:
    'El servicio de IA no está disponible: el crédito de la API de Anthropic se agotó. ' +
    'El equipo ya fue alertado. Tu solicitud NO fue procesada; inténtalo más tarde.',
  cuota:
    'El servicio de IA no está disponible por límite de uso de la API (rate limit). ' +
    'Tu solicitud NO fue procesada; inténtalo en unos minutos.',
};

const ALERTA_CADA_MS = 15 * 60 * 1000;
const ultimaAlertaIA: Record<TipoErrorAnthropic, number> = { credito: 0, cuota: 0 };

async function alertarSinCapacidadIA(tipo: TipoErrorAnthropic, err: Error, endpoint: string): Promise<void> {
  const ahora = Date.now();
  if (ahora - ultimaAlertaIA[tipo] < ALERTA_CADA_MS) return;
  ultimaAlertaIA[tipo] = ahora;
  logger.critical(`API de Anthropic sin capacidad (${tipo}): ${err.message}`, {
    action: tipo === 'credito' ? 'anthropic_credit_exhausted' : 'anthropic_quota_exhausted',
    endpoint,
    errorMessage: err.message,
  });
  await prisma.systemIncident.create({
    data: {
      title: tipo === 'credito' ? 'Crédito de la API de Anthropic agotado' : 'Cuota de la API de Anthropic agotada',
      severity: 'critical',
      status: 'identified',
      components: ['ai'],
      description:
        `Las llamadas a la API de Anthropic fallan (${tipo}). Las clasificaciones y demás ` +
        `funciones de IA responden 503 hasta que se restablezca. Detalle: ${err.message.slice(0, 300)}`,
      updates: [],
    },
  });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const tipoIA = tipoDeErrorAnthropic(err);
  if (tipoIA) {
    alertarSinCapacidadIA(tipoIA, err, req.originalUrl).catch(e =>
      console.error('[errorHandler] no se pudo registrar la alerta de IA:', e instanceof Error ? e.message : e)
    );
    return res.status(503).json({ status: 'error', message: MENSAJE_IA[tipoIA] });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  console.error('Unhandled error:', err.message, err.stack);
  return res.status(500).json({
    status: 'error',
    message: 'Error interno del servidor',
  });
}
