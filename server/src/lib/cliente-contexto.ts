/**
 * Cliente/RFC activo en la petición (Operación 2026-08).
 * El shell manda `X-Cliente-Id`; los módulos lo usan para filtrar y persistir
 * `clienteId`. Devuelve null si no hay cliente activo. NUNCA sustituye al
 * tenantId: el cliente es una dimensión DENTRO del tenant y se valida que le
 * pertenezca antes de usarlo en escrituras (ver `validarClienteDelTenant`).
 */
import type { Request } from 'express';
import { prisma } from './prisma';

export function clienteIdDe(req: Request): string | null {
  const h = req.headers['x-cliente-id'];
  const v = Array.isArray(h) ? h[0] : h;
  const q = typeof req.query?.clienteId === 'string' ? req.query.clienteId : null;
  const id = (q ?? v ?? '').trim();
  return id.length > 0 ? id : null;
}

/** Filtro Prisma listo para spreadear: `{ ...filtroCliente(req) }`. */
export function filtroCliente(req: Request): { clienteId?: string } {
  const id = clienteIdDe(req);
  return id ? { clienteId: id } : {};
}

/** Para escrituras: el cliente debe existir y ser del tenant; si no, null. */
export async function validarClienteDelTenant(tenantId: string, clienteId: string | null): Promise<string | null> {
  if (!clienteId) return null;
  const c = await prisma.cliente.findFirst({ where: { id: clienteId, tenantId, activo: true }, select: { id: true } });
  return c ? c.id : null;
}
