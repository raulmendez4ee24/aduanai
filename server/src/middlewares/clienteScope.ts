/**
 * Restricción de alcance por cliente (Operación 2026-08, Ola 1).
 *
 * `UserTenantRole.scopeRestrictions` admite `{ clienteIds: string[] }`. Un
 * usuario con restricción (p. ej. rol CLIENTE_CONSULTA del importador, o un
 * capturista dedicado a dos RFC) solo ve y crea sobre esos clientes:
 *
 *   - Manda `X-Cliente-Id` fuera de su lista → 403 (no filtra existencia).
 *   - No manda cliente → `filtroCliente(req)` fuerza `clienteId IN (lista)`
 *     y, si la lista tiene UN solo cliente, `clienteIdDe(req)` lo devuelve
 *     para que las creaciones queden ligadas a él.
 *
 * Se resuelve una vez por petición al final de `authenticate` (ver
 * middlewares/auth.ts) y deja el resultado en `req.clienteIdsPermitidos`:
 *   - `null`  → sin restricción (ve todos los clientes del tenant).
 *   - `[]`    → restringido a nada (asignación vacía): no ve ningún registro
 *               con cliente y no puede mandar X-Cliente-Id.
 *
 * Varias asignaciones activas: se UNEN (misma semántica que los permisos).
 * Si alguna asignación activa NO tiene restricción, el usuario no está
 * restringido (el rol amplio manda). SUPERADMIN nunca se restringe.
 */
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { AppError } from './error';

export interface ScopeRestrictions {
  clienteIds?: string[];
}

/** Lee `{ clienteIds }` de un Json de scopeRestrictions; ignora basura. */
export function clienteIdsDeRestriccion(raw: unknown): string[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ids = (raw as ScopeRestrictions).clienteIds;
  if (!Array.isArray(ids)) return null;
  return ids.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/**
 * Une las restricciones de todas las asignaciones activas del usuario.
 * `null` = sin restricción.
 */
export async function resolverClientesPermitidos(userId: string, tenantId: string, legacyRole?: string): Promise<string[] | null> {
  if (legacyRole === 'SUPERADMIN') return null;
  const asignaciones = await prisma.userTenantRole.findMany({
    where: {
      userId, tenantId, active: true,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }],
    },
    select: { scopeRestrictions: true },
  });
  if (asignaciones.length === 0) return null;
  const union = new Set<string>();
  for (const a of asignaciones) {
    const ids = clienteIdsDeRestriccion(a.scopeRestrictions);
    if (ids === null) return null; // una asignación sin restricción abre el alcance
    for (const id of ids) union.add(id);
  }
  return Array.from(union);
}

function clienteIdSolicitado(req: AuthRequest): string | null {
  const h = req.headers['x-cliente-id'];
  const v = Array.isArray(h) ? h[0] : h;
  const q = typeof req.query?.clienteId === 'string' ? req.query.clienteId : null;
  const id = (q ?? v ?? '').trim();
  return id.length > 0 ? id : null;
}

/**
 * Middleware: exige `req.userId`/`req.tenantId` ya resueltos. Deja
 * `req.clienteIdsPermitidos` y rechaza un X-Cliente-Id fuera del alcance.
 */
export async function clienteScope(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId || !req.tenantId) return next();
    const permitidos = await resolverClientesPermitidos(req.userId, req.tenantId, req.userRole);
    req.clienteIdsPermitidos = permitidos;
    if (permitidos === null) return next();
    const pedido = clienteIdSolicitado(req);
    if (pedido && !permitidos.includes(pedido)) {
      return next(new AppError('No tienes acceso a ese cliente', 403));
    }
    next();
  } catch (err) {
    next(err);
  }
}
