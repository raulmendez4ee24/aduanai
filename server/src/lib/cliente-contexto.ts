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
import { AppError } from '../middlewares/error';

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

/** ¿El cliente cae dentro del alcance del usuario? (sin restricción ⇒ true; null ⇒ true: fila compartida del tenant). */
export function enAlcance(req: Request, clienteId: string | null | undefined): boolean {
  const p = permitidos(req);
  if (!p) return true;
  if (clienteId == null) return true;
  return p.includes(clienteId);
}

/** Para escrituras que traen clienteId del body: debe ser del tenant Y estar en el alcance del usuario.
 *  Devuelve el id validado, null si no se mandó, o lanza AppError 403/400. */
export async function validarClienteEnAlcance(req: Request, tenantId: string, clienteId: string | null | undefined): Promise<string | null> {
  if (!clienteId) return null;
  if (!enAlcance(req, clienteId)) throw new AppError('Cliente fuera de tu alcance', 403);
  const ok = await validarClienteDelTenant(tenantId, clienteId);
  if (!ok) throw new AppError('Cliente inválido', 400);
  return ok;
}

/** Where por id CON alcance de cliente: `{ id, tenantId, ...filtroCliente(req) }`.
 *  Las filas con clienteId null (compartidas del tenant) siguen visibles cuando hay restricción. */
export function whereConAlcance<T extends Record<string, unknown>>(req: Request, base: T): T & { OR?: Array<Record<string, unknown>> } {
  return { ...base, ...whereAlcance(filtroCliente(req)) };
}

// ── Alcance sin Request (para servicios) ─────────────────────────────────
/** Lo que devuelve `filtroCliente(req)`: `{}` sin restricción; `{ clienteId }` o `{ clienteId: { in } }` con ella. */
export type AlcanceFiltro = ReturnType<typeof filtroCliente>;

/** Ids del alcance: `null` = sin restricción (ve todo el tenant). */
export function idsDeAlcance(alcance?: AlcanceFiltro | null): string[] | null {
  const c = alcance?.clienteId;
  if (c === undefined) return null;
  return typeof c === 'string' ? [c] : c.in;
}

/** ¿La fila (por su clienteId) cae dentro del alcance? null = compartida del tenant ⇒ visible. */
export function filaEnAlcance(alcance: AlcanceFiltro | null | undefined, clienteId: string | null | undefined): boolean {
  const ids = idsDeAlcance(alcance);
  if (!ids) return true;
  if (clienteId == null) return true;
  return ids.includes(clienteId);
}

/** Fragmento `where` para servicios: `{}` sin restricción; con ella, cliente(s) del alcance O fila compartida
 *  (clienteId null). Se spreadea junto al resto del where: `{ tenantId, ...whereAlcance(alcance) }`. */
export function whereAlcance(alcance?: AlcanceFiltro | null): { OR?: Array<{ clienteId: string | { in: string[] } | null }> } {
  if (!alcance || alcance.clienteId === undefined) return {};
  return { OR: [{ clienteId: alcance.clienteId }, { clienteId: null }] };
}
/** Alcance de cliente para pasar a servicios: un cliente, varios (`{ in }`) o sin restricción (null). */
export type AlcanceCliente = string | { in: string[] } | null;
/** `filtroCliente(req)` en forma de valor, para firmas de servicio `(tenantId, alcance)`. */
export function alcanceDe(req: Request): AlcanceCliente {
  return filtroCliente(req).clienteId ?? null;
}
/** Where Prisma a partir de un alcance: `{ ...whereCliente(alcance) }`. */
export function whereCliente(alcance: AlcanceCliente): { clienteId?: string | { in: string[] } } {
  return alcance ? { clienteId: alcance } : {};
}
/** Versión pura de `whereConAlcance` para servicios que reciben el alcance como valor. */
export function whereIdConAlcance<T extends Record<string, unknown>>(alcance: AlcanceCliente, base: T): T & { OR?: Array<Record<string, unknown>> } {
  if (!alcance) return base;
  return { ...base, OR: [{ clienteId: alcance }, { clienteId: null }] };
}
