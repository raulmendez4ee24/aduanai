/**
 * Cliente/RFC activo en la petición (Operación 2026-08).
 * El shell manda `X-Cliente-Id`; los módulos lo usan para filtrar y persistir
 * `clienteId`. Devuelve null si no hay cliente activo. NUNCA sustituye al
 * tenantId: el cliente es una dimensión DENTRO del tenant y se valida que le
 * pertenezca antes de usarlo en escrituras (ver `validarClienteDelTenant`).
 *
 * Ola 1 (multi-cliente y roles): honra la restricción de alcance que deja
 * `middlewares/clienteScope.ts` en `req.clienteIdsPermitidos`:
 *   - sin X-Cliente-Id y restringido a UN cliente → ese cliente (creaciones).
 *   - sin X-Cliente-Id y restringido a varios → `clienteId IN (...)` (listados).
 */
import type { Request } from 'express';
import { prisma } from './prisma';

type ReqConAlcance = Request & { clienteIdsPermitidos?: string[] | null };

function permitidos(req: Request): string[] | null {
  const p = (req as ReqConAlcance).clienteIdsPermitidos;
  return Array.isArray(p) ? p : null;
}

export function clienteIdDe(req: Request): string | null {
  const h = req.headers['x-cliente-id'];
  const v = Array.isArray(h) ? h[0] : h;
  const q = typeof req.query?.clienteId === 'string' ? req.query.clienteId : null;
  const id = (q ?? v ?? '').trim();
  if (id.length > 0) return id;
  const p = permitidos(req);
  return p && p.length === 1 ? p[0]! : null;
}

/** Filtro Prisma listo para spreadear: `{ ...filtroCliente(req) }`. */
export function filtroCliente(req: Request): { clienteId?: string | { in: string[] } } {
  const id = clienteIdDe(req);
  if (id) return { clienteId: id };
  const p = permitidos(req);
  return p ? { clienteId: { in: p } } : {};
}

/** Para escrituras: el cliente debe existir y ser del tenant; si no, null. */
export async function validarClienteDelTenant(tenantId: string, clienteId: string | null): Promise<string | null> {
  if (!clienteId) return null;
  const c = await prisma.cliente.findFirst({ where: { id: clienteId, tenantId, activo: true }, select: { id: true } });
  return c ? c.id : null;
}
