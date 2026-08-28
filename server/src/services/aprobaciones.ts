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
 *
 * Cuarta revisión (27-ago-2026), prioridad 4 — dos hallazgos de causa:
 *  a) `status` nace en `@default("approved")` (legado del schema), así que los
 *     registros históricos están "aprobados" SIN `approvedById`. No se inventa
 *     un aprobador: se etiquetan como legado y el paquete de Defensa lo dice.
 *     `aprobar()` admite RATIFICARLOS (approved + approvedById null) para que
 *     un validador les ponga nombre y fecha reales cuando quiera.
 *  b) La bandeja se llena de registros SEMBRADOS (isDemoData) que quedaron en
 *     `pending_approval` y que nadie propuso: `regularizarAprobacionesSembradas`
 *     los devuelve a su estado sembrado dejando rastro encadenado.
 */
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { recordAudit } from './audit-service';
import { getUserPermissions, hasPermission, type ModuleName } from './permissions';

/** Acciones que esta capa escribe en el AuditLog encadenado. */
export const ACCION_PROPUESTA = 'APPROVAL_PROPOSED';
export const ACCION_APROBADA = 'APPROVAL_GRANTED';
export const ACCION_RECHAZADA = 'APPROVAL_REJECTED';
export const ACCION_SEED_RESTAURADA = 'APPROVAL_SEED_RESTORED';

/** Vocabulario histórico que también cuenta como decisión (rutas /approve previas). */
export const ACCIONES_APROBACION = [ACCION_APROBADA, 'APPROVE'] as const;
export const ACCIONES_RECHAZO = [ACCION_RECHAZADA, 'REJECT'] as const;
export const ACCIONES_DECISION = [...ACCIONES_APROBACION, ...ACCIONES_RECHAZO] as readonly string[];

export const TIPOS_APROBACION = ['clasificacion', 'cotizacion'] as const;
export type TipoAprobacion = (typeof TIPOS_APROBACION)[number];

interface DefTipo {
  entidad: 'Classification' | 'Quote';
  modulo: ModuleName;
  /** Tipo equivalente en la vista Defensa (`/defensa?tipo=…`). */
  tipoDefensa: 'classification' | 'quote';
}

const TIPOS: Record<TipoAprobacion, DefTipo> = {
  clasificacion: { entidad: 'Classification', modulo: 'classifier', tipoDefensa: 'classification' },
  cotizacion: { entidad: 'Quote', modulo: 'quoter', tipoDefensa: 'quote' },
};

/** Defensa → Aprobaciones. Devuelve null para los tipos sin flujo de aprobación. */
export function tipoAprobacionDeDefensa(tipoDefensa: string): TipoAprobacion | null {
  const par = (Object.entries(TIPOS) as [TipoAprobacion, DefTipo][]).find(([, d]) => d.tipoDefensa === tipoDefensa);
  return par ? par[0] : null;
}

/** Aprobaciones → Defensa (`/defensa?tipo=classification&id=…`). */
export function tipoDefensaDeAprobacion(tipo: TipoAprobacion): 'classification' | 'quote' {
  return TIPOS[tipo].tipoDefensa;
}

/** Nombre de entidad con que esta capa firma el AuditLog del tipo. */
export function entidadDeAprobacion(tipo: TipoAprobacion): 'Classification' | 'Quote' {
  return TIPOS[tipo].entidad;
}

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
  updateMany: (a: { where: { id: string; tenantId: string; status?: string; approvedById?: string | null }; data: Record<string, unknown> }) => Promise<{ count: number }>;
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
    action: ACCION_PROPUESTA,
    entity: TIPOS[tipo].entidad,
    entityId: recursoId,
    before: { status: antes.status, approvedById: antes.approvedById },
    after: { status: 'pending_approval', approvedById: null },
    ipAddress: opts.ip ?? null,
    metadata: { tipo, motivo: opts.motivo ?? null, clienteId: antes.clienteId },
  });
  return despues;
}

/**
 * Aprueba un recurso pendiente. Exige permiso `approve` del módulo.
 *
 * RATIFICACIÓN DE LEGADO: un registro `approved` SIN `approvedById` no fue
 * aprobado por nadie — es el `@default("approved")` del schema. Ese caso sí se
 * puede aprobar (le pone aprobador y fecha reales); uno con aprobador, no.
 * El AuditLog lo marca con `ratificacionLegado: true` para que el paquete de
 * Defensa no lo confunda con una aprobación de origen.
 */
export async function aprobar(tipo: TipoAprobacion, recursoId: string, tenantId: string, userId: string, opts: { motivo?: string; legacyRole?: string; ip?: string | null; userAgent?: string | null } = {}) {
  if (!(await puedeAprobar(tipo, userId, tenantId, opts.legacyRole))) {
    throw new AppError('No tienes permiso para aprobar en este módulo', 403);
  }
  const antes = await cargar(tipo, recursoId, tenantId);
  const ratificacionLegado = antes.status === 'approved' && !antes.approvedById;
  if (antes.status === 'approved' && !ratificacionLegado) throw new AppError('Ya está aprobado', 400);
  const ahora = new Date();
  // Transición condicional: solo si sigue pendiente/rechazado (evita doble aprobación en carrera).
  // En la ratificación el candado es `approvedById: null`: si alguien ratificó primero, count = 0.
  const r = await delegado(tipo).updateMany({
    where: ratificacionLegado
      ? { id: recursoId, tenantId, status: 'approved', approvedById: null }
      : { id: recursoId, tenantId, status: antes.status },
    data: { status: 'approved', approvedAt: ahora, approvedById: userId },
  });
  if (r.count === 0) throw new AppError('El recurso cambió de estado; recarga la bandeja', 409);
  await recordAudit({
    tenantId, userId,
    action: ACCION_APROBADA,
    entity: TIPOS[tipo].entidad,
    entityId: recursoId,
    before: { status: antes.status, approvedById: antes.approvedById },
    after: { status: 'approved', approvedById: userId },
    ipAddress: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
    metadata: { tipo, motivo: opts.motivo ?? null, clienteId: antes.clienteId, propuestoPor: antes.userId, ratificacionLegado },
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
    action: ACCION_RECHAZADA,
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
  /** Tipo equivalente en la vista Defensa, para el enlace bandeja → paquete. */
  tipoDefensa: 'classification' | 'quote';
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
      tipoDefensa: 'classification' as const,
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
      tipoDefensa: 'quote' as const,
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

// ──────────────────────────────────────────────────────────────────
// Regularización de la bandeja (cuarta revisión, prioridad 4 · punto 3)
// ──────────────────────────────────────────────────────────────────

/**
 * Diagnóstico de por qué la bandeja de un tenant tiene lo que tiene.
 *
 * `sembradosPendientes` son registros `isDemoData` que quedaron en
 * `pending_approval`: NADIE los propuso (no hay evento APPROVAL_PROPOSED),
 * son ruido del sembrado. `propuestosDeVerdad` son los que sí esperan revisión.
 * `aprobadosSinAprobador` es el legado del `@default("approved")` del schema.
 */
export interface DiagnosticoBandeja {
  tenantId: string;
  sembradosPendientes: { clasificaciones: number; cotizaciones: number };
  propuestosDeVerdad: { clasificaciones: number; cotizaciones: number };
  aprobadosSinAprobador: { clasificaciones: number; cotizaciones: number };
}

export async function diagnosticarBandeja(tenantId: string): Promise<DiagnosticoBandeja> {
  if (!tenantId) throw new AppError('tenantId requerido', 400);
  const pend = { tenantId, status: 'pending_approval' };
  const [cSem, qSem, cPend, qPend, cLeg, qLeg] = await Promise.all([
    prisma.classification.count({ where: { ...pend, isDemoData: true } }),
    prisma.quote.count({ where: { ...pend, isDemoData: true } }),
    prisma.classification.count({ where: { ...pend, isDemoData: false } }),
    prisma.quote.count({ where: { ...pend, isDemoData: false } }),
    prisma.classification.count({ where: { tenantId, status: 'approved', approvedById: null } }),
    prisma.quote.count({ where: { tenantId, status: 'approved', approvedById: null } }),
  ]);
  return {
    tenantId,
    sembradosPendientes: { clasificaciones: cSem, cotizaciones: qSem },
    propuestosDeVerdad: { clasificaciones: cPend, cotizaciones: qPend },
    aprobadosSinAprobador: { clasificaciones: cLeg, cotizaciones: qLeg },
  };
}

export interface ResultadoRegularizacion {
  tenantId: string;
  dryRun: boolean;
  clasificaciones: { candidatas: number; regularizadas: number };
  cotizaciones: { candidatas: number; regularizadas: number };
  /** Lo que queda en la bandeja después de correr (o lo que quedaría, en dryRun). */
  pendientesRestantes: number;
}

/**
 * Devuelve a `approved` los registros SEMBRADOS (isDemoData) que quedaron en
 * `pending_approval`. Acotado a UN tenant y idempotente: la segunda corrida no
 * encuentra candidatos.
 *
 * NO inventa aprobador: `approvedById`/`approvedAt` quedan en null igual que
 * cualquier registro sembrado, y cada fila recibe un evento encadenado
 * `APPROVAL_SEED_RESTORED` que documenta que el estado viene del sembrado y no
 * de una revisión humana. El paquete de Defensa lo muestra con ese texto.
 */
export async function regularizarAprobacionesSembradas(
  tenantId: string,
  opts: { dryRun?: boolean; limite?: number; userId?: string | null } = {},
): Promise<ResultadoRegularizacion> {
  if (!tenantId) throw new AppError('tenantId requerido', 400);
  const dryRun = opts.dryRun ?? false;
  const take = Math.min(Math.max(opts.limite ?? 1000, 1), 5000);
  const where = { tenantId, isDemoData: true, status: 'pending_approval' } as const;

  const [cls, quo] = await Promise.all([
    prisma.classification.findMany({ where, select: { id: true, clienteId: true, userId: true }, orderBy: { createdAt: 'asc' }, take }),
    prisma.quote.findMany({ where, select: { id: true, clienteId: true, userId: true }, orderBy: { createdAt: 'asc' }, take }),
  ]);

  const salida: ResultadoRegularizacion = {
    tenantId, dryRun,
    clasificaciones: { candidatas: cls.length, regularizadas: 0 },
    cotizaciones: { candidatas: quo.length, regularizadas: 0 },
    pendientesRestantes: 0,
  };

  if (!dryRun) {
    for (const tipo of TIPOS_APROBACION) {
      const filas = tipo === 'clasificacion' ? cls : quo;
      const cubo = tipo === 'clasificacion' ? salida.clasificaciones : salida.cotizaciones;
      for (const fila of filas) {
        const r = await delegado(tipo).updateMany({
          // El where repite tenantId + status: si otro proceso ya lo movió, count = 0.
          where: { id: fila.id, tenantId, status: 'pending_approval' },
          data: { status: 'approved', approvedAt: null, approvedById: null },
        });
        if (r.count === 0) continue;
        cubo.regularizadas += r.count;
        await recordAudit({
          tenantId, userId: opts.userId ?? null,
          action: ACCION_SEED_RESTAURADA,
          entity: TIPOS[tipo].entidad,
          entityId: fila.id,
          // `before` y `after` deben traer LAS MISMAS claves: shallowDiff mete
          // `undefined` cuando una falta, Postgres lo descarta al guardar el
          // JSONB y el rehash de verifyChain ya no coincide (cadena rota).
          before: { status: 'pending_approval', approvedById: null },
          after: { status: 'approved', approvedById: null },
          metadata: {
            tipo, clienteId: fila.clienteId, propuestoPor: fila.userId,
            origen: 'sembrado (isDemoData)',
            nota: 'Registro de demostración que quedó en la bandeja sin que nadie lo propusiera. Se devuelve a su estado sembrado; NO tiene aprobador humano.',
          },
        });
      }
    }
  }

  salida.pendientesRestantes = dryRun
    ? (await conteoPendientes(tenantId)).total - cls.length - quo.length
    : (await conteoPendientes(tenantId)).total;
  return salida;
}
