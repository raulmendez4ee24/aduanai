/**
 * Flujo de aprobación genérico — "el junior propone, el señor con patente
 * aprueba" (Operación 2026-08, Ola 1).
 *
 * Usa los campos `status / approvedAt / approvedById` que YA tienen
 * Classification y Quote (status: 'approved' | 'pending_approval' | 'rejected').
 * Cada transición deja rastro en el audit trail encadenado (AuditLog vía
 * recordAudit) con el motivo; la auto-aprobación (mismo usuario que creó)
 * además se marca SELF_APPROVAL_SOD en PermissionAuditLog, igual que las
 * rutas /approve existentes.
 *
 * Añadir un tipo nuevo = una entrada en `TIPOS` (modelo + módulo de permiso).
 */
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { recordAudit } from './audit-service';
import { getUserPermissions, hasPermission, type ModuleName } from './permissions';

export const TIPOS_APROBACION = ['clasificacion', 'cotizacion'] as const;
export type TipoAprobacion = (typeof TIPOS_APROBACION)[number];

interface DefTipo {
  entidad: 'Classification' | 'Quote';
  modulo: ModuleName;
}

const TIPOS: Record<TipoAprobacion, DefTipo> = {
  clasificacion: { entidad: 'Classification', modulo: 'classifier' },
  cotizacion: { entidad: 'Quote', modulo: 'quoter' },
};

export function esTipoAprobacion(x: string): x is TipoAprobacion {
  return (TIPOS_APROBACION as readonly string[]).includes(x);
}

interface FilaAprobable {
  id: string;
  tenantId: string;
  userId: string;
  clienteId: string | null;
  status: string;
  approvedAt: Date | null;
  approvedById: string | null;
}

interface Delegado {
  findFirst: (a: { where: { id: string; tenantId: string }; select: Record<string, boolean> }) => Promise<FilaAprobable | null>;
  updateMany: (a: { where: { id: string; tenantId: string; status?: string }; data: Record<string, unknown> }) => Promise<{ count: number }>;
}

const SELECT_FILA = { id: true, tenantId: true, userId: true, clienteId: true, status: true, approvedAt: true, approvedById: true };

function delegado(tipo: TipoAprobacion): Delegado {
  return (tipo === 'clasificacion' ? prisma.classification : prisma.quote) as unknown as Delegado;
}

async function cargar(tipo: TipoAprobacion, id: string, tenantId: string): Promise<FilaAprobable> {
  const fila = await delegado(tipo).findFirst({ where: { id, tenantId }, select: SELECT_FILA });
  if (!fila) throw new AppError('Recurso no encontrado', 404);
  return fila;
}

/** ¿El usuario puede aprobar en este módulo? (misma regla que requirePermission). */
export async function puedeAprobar(tipo: TipoAprobacion, userId: string, tenantId: string, legacyRole?: string): Promise<boolean> {
  const perms = await getUserPermissions(userId, tenantId, legacyRole);
  return hasPermission(perms, TIPOS[tipo].modulo, 'approve');
}

/**
 * Propone: deja el recurso en `pending_approval` (limpia approvedAt/By).
 * Sirve para re-proponer un rechazado o para degradar un aprobado (con motivo).
 *
 * Ownership (revisión B, P1): solo el autor del recurso o quien tiene `approve`
 * en el módulo. Degradar un APROBADO (borrar approvedAt/By) queda reservado a
 * quien puede aprobar — un junior no deshace el dictamen del validador.
 */
export async function proponer(tipo: TipoAprobacion, recursoId: string, tenantId: string, userId: string, opts: { motivo?: string; legacyRole?: string; ip?: string | null } = {}) {
  const antes = await cargar(tipo, recursoId, tenantId);
  if (antes.status === 'pending_approval') return antes;
  const aprobador = await puedeAprobar(tipo, userId, tenantId, opts.legacyRole);
  if (antes.userId !== userId && !aprobador) {
    throw new AppError('Solo el autor del recurso o un validador puede proponerlo', 403);
  }
  if (antes.status === 'approved' && !aprobador) {
    throw new AppError('Ya está aprobado: solo un validador puede regresarlo a pendiente', 403);
  }
  const r = await delegado(tipo).updateMany({
    where: { id: recursoId, tenantId },
    data: { status: 'pending_approval', approvedAt: null, approvedById: null },
  });
  if (r.count === 0) throw new AppError('Recurso no encontrado', 404);
  const despues = { ...antes, status: 'pending_approval', approvedAt: null, approvedById: null };
  await recordAudit({
    tenantId, userId,
    action: 'APPROVAL_PROPOSED',
    entity: TIPOS[tipo].entidad,
    entityId: recursoId,
    before: { status: antes.status, approvedById: antes.approvedById },
    after: { status: 'pending_approval', approvedById: null },
    ipAddress: opts.ip ?? null,
    metadata: { tipo, motivo: opts.motivo ?? null, clienteId: antes.clienteId },
  });
  return despues;
}

/** Aprueba un recurso pendiente. Exige permiso `approve` del módulo. */
export async function aprobar(tipo: TipoAprobacion, recursoId: string, tenantId: string, userId: string, opts: { motivo?: string; legacyRole?: string; ip?: string | null; userAgent?: string | null } = {}) {
  if (!(await puedeAprobar(tipo, userId, tenantId, opts.legacyRole))) {
    throw new AppError('No tienes permiso para aprobar en este módulo', 403);
  }
  const antes = await cargar(tipo, recursoId, tenantId);
  if (antes.status === 'approved') throw new AppError('Ya está aprobado', 400);
  const ahora = new Date();
  // Transición condicional: solo si sigue pendiente/rechazado (evita doble aprobación en carrera).
  const r = await delegado(tipo).updateMany({
    where: { id: recursoId, tenantId, status: antes.status },
    data: { status: 'approved', approvedAt: ahora, approvedById: userId },
  });
  if (r.count === 0) throw new AppError('El recurso cambió de estado; recarga la bandeja', 409);
  await recordAudit({
    tenantId, userId,
    action: 'APPROVAL_GRANTED',
    entity: TIPOS[tipo].entidad,
    entityId: recursoId,
    before: { status: antes.status, approvedById: antes.approvedById },
    after: { status: 'approved', approvedById: userId },
    ipAddress: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
    metadata: { tipo, motivo: opts.motivo ?? null, clienteId: antes.clienteId, propuestoPor: antes.userId },
  });
  if (antes.userId === userId) {
    await prisma.permissionAuditLog.create({
      data: {
        tenantId, userId,
        action: 'SELF_APPROVAL_SOD',
        targetUserId: antes.userId,
        details: { module: TIPOS[tipo].modulo, resource: TIPOS[tipo].entidad, resourceId: recursoId, via: 'aprobaciones' },
        ipAddress: opts.ip ?? null,
        userAgent: opts.userAgent ?? null,
      },
    });
  }
  return { ...antes, status: 'approved', approvedAt: ahora, approvedById: userId };
}

/** Rechaza un recurso pendiente con motivo obligatorio. Exige `approve`. */
export async function rechazar(tipo: TipoAprobacion, recursoId: string, tenantId: string, userId: string, motivo: string, opts: { legacyRole?: string; ip?: string | null; userAgent?: string | null } = {}) {
  if (!motivo || motivo.trim().length < 3) throw new AppError('El motivo del rechazo es obligatorio', 400);
  if (!(await puedeAprobar(tipo, userId, tenantId, opts.legacyRole))) {
    throw new AppError('No tienes permiso para rechazar en este módulo', 403);
  }
  const antes = await cargar(tipo, recursoId, tenantId);
  if (antes.status === 'rejected') throw new AppError('Ya está rechazado', 400);
  const r = await delegado(tipo).updateMany({
    where: { id: recursoId, tenantId, status: antes.status },
    data: { status: 'rejected', approvedAt: null, approvedById: null },
  });
  if (r.count === 0) throw new AppError('El recurso cambió de estado; recarga la bandeja', 409);
  await recordAudit({
    tenantId, userId,
    action: 'APPROVAL_REJECTED',
    entity: TIPOS[tipo].entidad,
    entityId: recursoId,
    before: { status: antes.status, approvedById: antes.approvedById },
    after: { status: 'rejected', approvedById: null },
    ipAddress: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
    metadata: { tipo, motivo: motivo.trim(), clienteId: antes.clienteId, propuestoPor: antes.userId },
  });
  return { ...antes, status: 'rejected', approvedAt: null, approvedById: null };
}

// ──────────────────────────────────────────────────────────────────
// Bandeja
// ──────────────────────────────────────────────────────────────────

export interface PendienteAprobacion {
  tipo: TipoAprobacion;
  id: string;
  titulo: string;
  detalle: string;
  fractionCode: string;
  clienteId: string | null;
  cliente: { rfc: string; razonSocial: string } | null;
  propuestoPor: { id: string; name: string; email: string } | null;
  createdAt: string;
}

export async function pendientes(tenantId: string, filtroCliente: { clienteId?: string | { in: string[] } } = {}): Promise<PendienteAprobacion[]> {
  const where = { tenantId, status: 'pending_approval', ...filtroCliente };
  const [cls, quo] = await Promise.all([
    prisma.classification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, inputDescription: true, fractionCode: true, fractionDescription: true, confidence: true, clienteId: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, name: true, client: true, fractionCode: true, customsValue: true, currency: true, origin: true, clienteId: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const clienteIds = Array.from(new Set([...cls, ...quo].map(x => x.clienteId).filter((x): x is string => !!x)));
  const clientes = clienteIds.length
    ? await prisma.cliente.findMany({ where: { tenantId, id: { in: clienteIds } }, select: { id: true, rfc: true, razonSocial: true } })
    : [];
  const mapC = new Map(clientes.map(c => [c.id, { rfc: c.rfc, razonSocial: c.razonSocial }]));
  const out: PendienteAprobacion[] = [
    ...cls.map(c => ({
      tipo: 'clasificacion' as const,
      id: c.id,
      titulo: c.inputDescription.slice(0, 120),
      detalle: `${c.fractionCode} · ${(c.fractionDescription ?? "").slice(0, 80)} · confianza ${Math.round(c.confidence * 100)}%`,
      fractionCode: c.fractionCode,
      clienteId: c.clienteId,
      cliente: c.clienteId ? mapC.get(c.clienteId) ?? null : null,
      propuestoPor: c.user,
      createdAt: c.createdAt.toISOString(),
    })),
    ...quo.map(q => ({
      tipo: 'cotizacion' as const,
      id: q.id,
      titulo: q.name ?? q.client ?? `Cotización ${q.fractionCode}`,
      detalle: `${q.fractionCode} · ${q.customsValue.toLocaleString('es-MX')} ${q.currency} · origen ${q.origin || '—'}`,
      fractionCode: q.fractionCode,
      clienteId: q.clienteId,
      cliente: q.clienteId ? mapC.get(q.clienteId) ?? null : null,
      propuestoPor: q.user,
      createdAt: q.createdAt.toISOString(),
    })),
  ];
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export async function conteoPendientes(tenantId: string, filtroCliente: { clienteId?: string | { in: string[] } } = {}): Promise<{ clasificaciones: number; cotizaciones: number; total: number }> {
  const where = { tenantId, status: 'pending_approval', ...filtroCliente };
  const [c, q] = await Promise.all([prisma.classification.count({ where }), prisma.quote.count({ where })]);
  return { clasificaciones: c, cotizaciones: q, total: c + q };
}
