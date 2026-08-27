/**
 * Clientes (RFC operados por el tenant) — Operación 2026-08, Ola 1.
 *
 * Una agencia aduanal opera N importadores/exportadores; cada uno es un
 * `Cliente` del tenant. Todo el CRUD va scoped por `tenantId`; el RFC se
 * valida con la misma utilidad que usa el registro (lib/rfc-validator.ts).
 *
 * También vive aquí el seed demo idempotente (`asegurarClienteDemo`) y el
 * backfill acotado por tenant: filas históricas con `clienteId = null` se
 * ligan al cliente propio del tenant (su RFC) — nunca cruza tenants.
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { validateRFC } from '../lib/rfc-validator';
import { AppError } from '../middlewares/error';

export const CERTIFICACIONES = ['A', 'AA', 'AAA'] as const;

export const clienteInputSchema = z.object({
  rfc: z.string().trim().min(1).max(20), // formato real lo valida normalizarRFC (422)
  razonSocial: z.string().min(2).max(200),
  programaIMMEX: z.string().max(50).nullable().optional(),
  certificacionIVAIEPS: z.enum(CERTIFICACIONES).nullable().optional(),
  padronImportadores: z.boolean().optional(),
  padronesSectoriales: z.array(z.string().max(80)).max(50).optional(),
  contactoNombre: z.string().max(120).nullable().optional(),
  contactoEmail: z.string().email().max(160).nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
  activo: z.boolean().optional(),
}).strict();

export type ClienteInput = z.infer<typeof clienteInputSchema>;

export function normalizarRFC(rfc: string): string {
  const r = validateRFC(rfc);
  if (!r.valid) {
    throw new AppError(`RFC inválido: ${r.message ?? r.reason ?? 'formato incorrecto'}`, 422);
  }
  return r.normalized ?? rfc.trim().toUpperCase();
}

export async function listarClientes(tenantId: string, opts: { incluirInactivos?: boolean; q?: string } = {}) {
  const where: Prisma.ClienteWhereInput = { tenantId };
  if (!opts.incluirInactivos) where.activo = true;
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { rfc: { contains: q.toUpperCase() } },
      { razonSocial: { contains: q, mode: 'insensitive' } },
    ];
  }
  return prisma.cliente.findMany({ where, orderBy: [{ activo: 'desc' }, { razonSocial: 'asc' }] });
}

export async function obtenerCliente(tenantId: string, id: string) {
  return prisma.cliente.findFirst({ where: { id, tenantId } });
}

export async function crearCliente(tenantId: string, input: ClienteInput) {
  const data = clienteInputSchema.parse(input);
  const rfc = normalizarRFC(data.rfc);
  try {
    return await prisma.cliente.create({
      data: {
        tenantId,
        rfc,
        razonSocial: data.razonSocial.trim(),
        programaIMMEX: data.programaIMMEX ?? null,
        certificacionIVAIEPS: data.certificacionIVAIEPS ?? null,
        padronImportadores: data.padronImportadores ?? false,
        padronesSectoriales: data.padronesSectoriales ?? [],
        contactoNombre: data.contactoNombre ?? null,
        contactoEmail: data.contactoEmail ?? null,
        notas: data.notas ?? null,
        activo: data.activo ?? true,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(`Ya existe un cliente con RFC ${rfc} en esta empresa`, 409);
    }
    throw err;
  }
}

export async function actualizarCliente(tenantId: string, id: string, input: Partial<ClienteInput>) {
  const existente = await prisma.cliente.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existente) throw new AppError('Cliente no encontrado', 404);
  const data = clienteInputSchema.partial().parse(input);
  const patch: Prisma.ClienteUpdateInput = {};
  if (data.rfc !== undefined) patch.rfc = normalizarRFC(data.rfc);
  if (data.razonSocial !== undefined) patch.razonSocial = data.razonSocial.trim();
  if (data.programaIMMEX !== undefined) patch.programaIMMEX = data.programaIMMEX;
  if (data.certificacionIVAIEPS !== undefined) patch.certificacionIVAIEPS = data.certificacionIVAIEPS;
  if (data.padronImportadores !== undefined) patch.padronImportadores = data.padronImportadores;
  if (data.padronesSectoriales !== undefined) patch.padronesSectoriales = data.padronesSectoriales;
  if (data.contactoNombre !== undefined) patch.contactoNombre = data.contactoNombre;
  if (data.contactoEmail !== undefined) patch.contactoEmail = data.contactoEmail;
  if (data.notas !== undefined) patch.notas = data.notas;
  if (data.activo !== undefined) patch.activo = data.activo;
  try {
    // updateMany scoped: nunca actualiza una fila de otro tenant.
    const r = await prisma.cliente.updateMany({ where: { id, tenantId }, data: patch as Prisma.ClienteUpdateManyMutationInput });
    if (r.count === 0) throw new AppError('Cliente no encontrado', 404);
    return prisma.cliente.findFirst({ where: { id, tenantId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Ya existe otro cliente con ese RFC en esta empresa', 409);
    }
    throw err;
  }
}

/** Baja lógica: los registros históricos conservan su clienteId. */
export async function desactivarCliente(tenantId: string, id: string) {
  const r = await prisma.cliente.updateMany({ where: { id, tenantId }, data: { activo: false } });
  if (r.count === 0) throw new AppError('Cliente no encontrado', 404);
}

// ──────────────────────────────────────────────────────────────────
// Resumen: conteos por cliente (solo del tenant)
// ──────────────────────────────────────────────────────────────────

export interface ResumenCliente {
  clienteId: string;
  rfc: string;
  razonSocial: string;
  activo: boolean;
  clasificaciones: number;
  cotizaciones: number;
  operaciones: number;
  importacionesTemporalesActivas: number;
  alertasAbiertas: number;
}

export async function resumenClientes(tenantId: string, clienteIds?: string[] | null): Promise<ResumenCliente[]> {
  const clientes = await prisma.cliente.findMany({
    where: { tenantId, ...(clienteIds ? { id: { in: clienteIds } } : {}) },
    orderBy: [{ activo: 'desc' }, { razonSocial: 'asc' }],
    select: { id: true, rfc: true, razonSocial: true, activo: true },
  });
  if (clientes.length === 0) return [];
  const ids = clientes.map(c => c.id);
  const base = { tenantId, clienteId: { in: ids } };
  const [cls, quo, ops, temps, alerts] = await Promise.all([
    prisma.classification.groupBy({ by: ['clienteId'], where: base, _count: { _all: true } }),
    prisma.quote.groupBy({ by: ['clienteId'], where: base, _count: { _all: true } }),
    prisma.operation.groupBy({ by: ['clienteId'], where: base, _count: { _all: true } }),
    prisma.temporaryImport.groupBy({
      by: ['clienteId'],
      where: { ...base, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } },
      _count: { _all: true },
    }),
    prisma.alert.groupBy({
      by: ['clienteId'],
      where: { ...base, resolvedAt: null, ignored: false },
      _count: { _all: true },
    }),
  ]);
  const toMap = (rows: { clienteId: string | null; _count: { _all: number } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.clienteId) m.set(r.clienteId, r._count._all);
    return m;
  };
  const mCls = toMap(cls), mQuo = toMap(quo), mOps = toMap(ops), mTemp = toMap(temps), mAl = toMap(alerts);
  return clientes.map(c => ({
    clienteId: c.id,
    rfc: c.rfc,
    razonSocial: c.razonSocial,
    activo: c.activo,
    clasificaciones: mCls.get(c.id) ?? 0,
    cotizaciones: mQuo.get(c.id) ?? 0,
    operaciones: mOps.get(c.id) ?? 0,
    importacionesTemporalesActivas: mTemp.get(c.id) ?? 0,
    alertasAbiertas: mAl.get(c.id) ?? 0,
  }));
}

// ──────────────────────────────────────────────────────────────────
// Import Excel
// ──────────────────────────────────────────────────────────────────

export interface ResultadoImport {
  creados: number;
  actualizados: number;
  errores: { fila: number; rfc: string; motivo: string }[];
}

const CABECERAS: Record<string, keyof ClienteInput> = {
  rfc: 'rfc',
  razonsocial: 'razonSocial', 'razon social': 'razonSocial', 'razón social': 'razonSocial',
  immex: 'programaIMMEX', programaimmex: 'programaIMMEX', 'programa immex': 'programaIMMEX',
  certificacion: 'certificacionIVAIEPS', 'certificación': 'certificacionIVAIEPS',
  certificacionivaieps: 'certificacionIVAIEPS', 'certificación iva/ieps': 'certificacionIVAIEPS',
  padronimportadores: 'padronImportadores', 'padrón de importadores': 'padronImportadores', 'padron de importadores': 'padronImportadores',
  padronessectoriales: 'padronesSectoriales', 'padrones sectoriales': 'padronesSectoriales',
  contacto: 'contactoNombre', contactonombre: 'contactoNombre', 'contacto nombre': 'contactoNombre',
  email: 'contactoEmail', contactoemail: 'contactoEmail', 'contacto email': 'contactoEmail', correo: 'contactoEmail',
  notas: 'notas',
};

function normalizarCabecera(h: string): keyof ClienteInput | null {
  const k = String(h ?? '').trim().toLowerCase();
  return CABECERAS[k] ?? CABECERAS[k.replace(/\s+/g, '')] ?? null;
}

/**
 * Importa clientes desde un Excel (base64 del archivo). Primera hoja;
 * cabeceras flexibles (RFC, Razón social, IMMEX, Certificación, Padrón de
 * importadores, Padrones sectoriales, Contacto, Email, Notas). Upsert por RFC.
 */
export async function importarClientesExcel(tenantId: string, base64: string): Promise<ResultadoImport> {
  const XLSX = await import('xlsx');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) throw new AppError('Archivo vacío', 400);
  if (buf.length > 5 * 1024 * 1024) throw new AppError('Archivo mayor a 5 MB', 413);
  let wb: import('xlsx').WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer' });
  } catch {
    throw new AppError('No se pudo leer el archivo (¿es .xlsx/.csv?)', 400);
  }
  const hoja = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!hoja) throw new AppError('El archivo no tiene hojas', 400);
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
  if (filas.length === 0) throw new AppError('La hoja no tiene filas', 400);
  if (filas.length > 2000) throw new AppError('Máximo 2,000 filas por importación', 413);

  const out: ResultadoImport = { creados: 0, actualizados: 0, errores: [] };
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]!;
    const input: Record<string, unknown> = {};
    for (const [h, v] of Object.entries(fila)) {
      const campo = normalizarCabecera(h);
      if (!campo) continue;
      const s = typeof v === 'string' ? v.trim() : v;
      if (campo === 'padronImportadores') {
        input[campo] = /^(1|si|sí|true|x|yes)$/i.test(String(s));
      } else if (campo === 'padronesSectoriales') {
        input[campo] = String(s).split(/[;,|]/).map(x => x.trim()).filter(Boolean);
      } else if (campo === 'certificacionIVAIEPS') {
        const c = String(s).toUpperCase();
        input[campo] = (CERTIFICACIONES as readonly string[]).includes(c) ? c : null;
      } else {
        input[campo] = s === '' ? null : String(s);
      }
    }
    const rfcCrudo = String(input.rfc ?? '').trim();
    const numFila = i + 2; // 1 = cabecera
    if (!rfcCrudo || !input.razonSocial) {
      out.errores.push({ fila: numFila, rfc: rfcCrudo, motivo: 'RFC y Razón social son obligatorios' });
      continue;
    }
    try {
      const rfc = normalizarRFC(rfcCrudo);
      const existente = await prisma.cliente.findFirst({ where: { tenantId, rfc }, select: { id: true } });
      const parsed = clienteInputSchema.parse({ ...input, rfc });
      if (existente) {
        await actualizarCliente(tenantId, existente.id, parsed);
        out.actualizados++;
      } else {
        await crearCliente(tenantId, parsed);
        out.creados++;
      }
    } catch (err) {
      const motivo = err instanceof z.ZodError
        ? err.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; ')
        : err instanceof Error ? err.message : 'Error desconocido';
      out.errores.push({ fila: numFila, rfc: rfcCrudo, motivo });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Seed demo + backfill (acotado por tenant)
// ──────────────────────────────────────────────────────────────────

/** Modelos con `clienteId` (Fase 0). El backfill toca SOLO estas tablas. */
export const MODELOS_CON_CLIENTE = [
  'classification', 'quote', 'operation', 'temporaryImport', 'pedimento',
  'glosaSimulation', 'riskAssessment', 'product', 'manifestacionValor',
  'originAnalysis', 'alert', 'classificationJob', 'taxCredit', 'document',
] as const;

export type ModeloConCliente = (typeof MODELOS_CON_CLIENTE)[number];

/**
 * Crea (si no existe) el Cliente que representa al PROPIO tenant (su RFC).
 * Idempotente: clave (tenantId, rfc). Si el tenant no tiene RFC válido, usa
 * un RFC genérico marcado como demo para no dejar el tenant sin cliente.
 */
export async function asegurarClienteDemo(tenantId: string): Promise<{ id: string; rfc: string; creado: boolean }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, rfc: true } });
  if (!tenant) throw new AppError('Tenant no encontrado', 404);
  const validado = validateRFC(tenant.rfc ?? '', { allowGeneric: true });
  const rfc = validado.valid && validado.normalized ? validado.normalized : 'XAXX010101000';
  const existente = await prisma.cliente.findFirst({ where: { tenantId, rfc }, select: { id: true } });
  if (existente) return { id: existente.id, rfc, creado: false };
  const c = await prisma.cliente.create({
    data: {
      tenantId,
      rfc,
      razonSocial: tenant.name,
      notas: 'Cliente propio (creado automáticamente a partir del RFC de la empresa).',
      isDemoData: !validado.valid,
      activo: true,
    },
    select: { id: true },
  });
  return { id: c.id, rfc, creado: true };
}

/**
 * Rellena `clienteId` en filas del tenant que lo tengan null. Acotado por
 * `tenantId` en CADA updateMany: nunca toca otro tenant. Devuelve cuántas
 * filas tocó por modelo.
 */
export async function backfillClienteDelTenant(tenantId: string, clienteId?: string): Promise<{ clienteId: string; tocadas: Record<ModeloConCliente, number> }> {
  let destino = clienteId;
  if (destino) {
    const ok = await prisma.cliente.findFirst({ where: { id: destino, tenantId }, select: { id: true } });
    if (!ok) throw new AppError('El cliente destino no pertenece a este tenant', 404);
  } else {
    destino = (await asegurarClienteDemo(tenantId)).id;
  }
  const tocadas = {} as Record<ModeloConCliente, number>;
  for (const modelo of MODELOS_CON_CLIENTE) {
    // Cada delegate expone updateMany con la misma forma; el cast evita
    // enumerar 14 firmas idénticas.
    const delegate = (prisma as unknown as Record<string, { updateMany: (a: { where: { tenantId: string; clienteId: null }; data: { clienteId: string } }) => Promise<{ count: number }> }>)[modelo]!;
    const r = await delegate.updateMany({ where: { tenantId, clienteId: null }, data: { clienteId: destino } });
    tocadas[modelo] = r.count;
  }
  return { clienteId: destino, tocadas };
}

// ──────────────────────────────────────────────────────────────────
// Alcance por cliente de un usuario (scopeRestrictions.clienteIds)
// ──────────────────────────────────────────────────────────────────

/**
 * Fija `{ clienteIds }` en TODAS las asignaciones activas del usuario en el
 * tenant. `null` = sin restricción (ve todo). Los ids se validan contra el
 * tenant: un id ajeno se rechaza.
 */
export async function asignarClientesAUsuario(tenantId: string, userId: string, clienteIds: string[] | null, actorId: string): Promise<{ asignaciones: number; clienteIds: string[] | null }> {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  if (!user) throw new AppError('Usuario no pertenece a este tenant', 404);
  let ids: string[] | null = null;
  if (clienteIds) {
    const unicos = Array.from(new Set(clienteIds.filter(x => typeof x === 'string' && x.trim())));
    const validos = await prisma.cliente.findMany({ where: { tenantId, id: { in: unicos } }, select: { id: true } });
    if (validos.length !== unicos.length) throw new AppError('Uno o más clientes no pertenecen a este tenant', 422);
    ids = validos.map(v => v.id);
  }
  const asignaciones = await prisma.userTenantRole.findMany({ where: { userId, tenantId, active: true }, select: { id: true, scopeRestrictions: true } });
  for (const a of asignaciones) {
    const previo = (a.scopeRestrictions && typeof a.scopeRestrictions === 'object' && !Array.isArray(a.scopeRestrictions))
      ? { ...(a.scopeRestrictions as Record<string, unknown>) } : {};
    if (ids === null) delete previo.clienteIds; else previo.clienteIds = ids;
    const nuevo = Object.keys(previo).length === 0 ? Prisma.DbNull : (previo as Prisma.InputJsonObject);
    await prisma.userTenantRole.update({ where: { id: a.id }, data: { scopeRestrictions: nuevo } });
  }
  await prisma.permissionAuditLog.create({
    data: {
      tenantId, userId: actorId,
      action: 'SCOPE_CLIENTES_SET',
      targetUserId: userId,
      details: { clienteIds: ids, asignaciones: asignaciones.length } as unknown as object,
      ipAddress: null,
    },
  });
  return { asignaciones: asignaciones.length, clienteIds: ids };
}
