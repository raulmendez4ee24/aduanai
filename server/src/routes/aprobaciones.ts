/**
 * /api/aprobaciones — bandeja de pendientes y aprobar/rechazar con motivo.
 * Operación 2026-08, Ola 1. Lógica en services/aprobaciones.ts.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middlewares/auth';
import { filtroCliente } from '../lib/cliente-contexto';
import { aprobar, rechazar, proponer, pendientes, conteoPendientes, esTipoAprobacion } from '../services/aprobaciones';

export const aprobacionesRouter = Router();
aprobacionesRouter.use(authenticate);

aprobacionesRouter.get('/pendientes', async (req: AuthRequest, res, next) => {
  try {
    const data = await pendientes(req.tenantId!, filtroCliente(req));
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

aprobacionesRouter.get('/conteo', async (req: AuthRequest, res, next) => {
  try {
    const data = await conteoPendientes(req.tenantId!, filtroCliente(req));
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

const motivoSchema = z.object({ motivo: z.string().max(1000).optional() }).strict();
const rechazoSchema = z.object({ motivo: z.string().min(3).max(1000) }).strict();

function tipoDe(req: AuthRequest): 'clasificacion' | 'cotizacion' | null {
  const t = String(req.params.tipo);
  return esTipoAprobacion(t) ? t : null;
}

aprobacionesRouter.post('/:tipo/:id/aprobar', async (req: AuthRequest, res, next) => {
  try {
    const tipo = tipoDe(req);
    if (!tipo) return res.status(400).json({ status: 'error', message: 'Tipo inválido (clasificacion | cotizacion)' });
    const { motivo } = motivoSchema.parse(req.body ?? {});
    const data = await aprobar(tipo, String(req.params.id), req.tenantId!, req.userId!, {
      motivo, legacyRole: req.userRole, ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null,
    });
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

aprobacionesRouter.post('/:tipo/:id/rechazar', async (req: AuthRequest, res, next) => {
  try {
    const tipo = tipoDe(req);
    if (!tipo) return res.status(400).json({ status: 'error', message: 'Tipo inválido (clasificacion | cotizacion)' });
    const { motivo } = rechazoSchema.parse(req.body ?? {});
    const data = await rechazar(tipo, String(req.params.id), req.tenantId!, req.userId!, motivo, {
      legacyRole: req.userRole, ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null,
    });
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

// Re-proponer (p. ej. un rechazado corregido vuelve a la bandeja).
aprobacionesRouter.post('/:tipo/:id/proponer', async (req: AuthRequest, res, next) => {
  try {
    const tipo = tipoDe(req);
    if (!tipo) return res.status(400).json({ status: 'error', message: 'Tipo inválido (clasificacion | cotizacion)' });
    const { motivo } = motivoSchema.parse(req.body ?? {});
    const data = await proponer(tipo, String(req.params.id), req.tenantId!, req.userId!, { motivo, ip: req.ip ?? null });
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});
