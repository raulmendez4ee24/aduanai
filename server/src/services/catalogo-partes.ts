/**
 * CATÁLOGO MAESTRO DE PARTES (Ola 1, Operación 2026-08).
 *
 * La parte (`Product`) es EL objeto central: cliente → número de parte →
 * descripción → fracción → NICO → NOMs → dictamen, construido una vez y
 * reutilizado. La clasificación vive versionada en
 * `ProductClassificationVersion`: se PROPONE (propuesta) y se APRUEBA
 * (vigente); la anterior queda 'reemplazada'. Nunca se sobreescribe una
 * fracción vigente sin justificación — la consistencia es la defensa legal.
 *
 * Todo `where` lleva tenantId (guard estricto). `ProductClassificationVersion`
 * no tiene tenantId: SIEMPRE se llega a ella a través de su Product del tenant.
 */
import * as XLSX from 'xlsx';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAudit } from './audit-service';
import { validarClienteDelTenant } from '../lib/cliente-contexto';

// ──────────────────────────────────────────────────────────────────
// Errores con código (la ruta los traduce a HTTP)
// ──────────────────────────────────────────────────────────────────

export type CodigoCatalogo =
  | 'NO_ENCONTRADA' | 'JUSTIFICACION_REQUERIDA' | 'FRACCION_INVALIDA' | 'ESTADO_INVALIDO'
  | 'SIN_CAMBIO' | 'FEEDBACK_REQUERIDO' | 'DATOS_INVALIDOS' | 'DUPLICADA' | 'CLIENTE_INVALIDO';

export class CatalogoError extends Error {
  constructor(public readonly codigo: CodigoCatalogo, message: string) {
    super(message);
    this.name = 'CatalogoError';
  }
  get http(): number {
    switch (this.codigo) {
      case 'NO_ENCONTRADA': return 404;
      case 'DUPLICADA': return 409;
      default: return 400;
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// Normalización
// ──────────────────────────────────────────────────────────────────

export const USOS_DESTINO = ['INSUMO_IMMEX', 'VENTA_DIRECTA', 'ACTIVO_FIJO'] as const;
export type UsoDestino = (typeof USOS_DESTINO)[number];
export const FUENTES_VERSION = ['manual', 'clasificador', 'historial', 'lote'] as const;
export type FuenteVersion = (typeof FUENTES_VERSION)[number];

/** Minúsculas, sin acentos, espacios colapsados. Es la llave de "misma descripción". */
export function normalizarDescripcion(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 8 dígitos sin puntos, o null si no es una fracción bien formada. */
export function normalizarFraccion(s: string | null | undefined): string | null {
  const d = String(s ?? '').replace(/[.\-\s]/g, '');
  return /^\d{8}$/.test(d) ? d : null;
}

export function formatearFraccion(code: string | null | undefined): string {
  const d = normalizarFraccion(code);
  return d ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : (code ?? '');
}

function normalizarNico(s: unknown): string | null {
  if (s === null || s === undefined || s === '') return null;
  const d = String(s).trim().replace(/\D/g, '');
  if (d.length === 0) return null;
  return d.padStart(2, '0').slice(-2);
}

function normalizarUso(s: unknown): UsoDestino | null {
  if (s === null || s === undefined || String(s).trim() === '') return null;
  const u = String(s).trim().toUpperCase().replace(/\s+/g, '_');
  if ((USOS_DESTINO as readonly string[]).includes(u)) return u as UsoDestino;
  throw new CatalogoError('DATOS_INVALIDOS', `usoDestino inválido "${s}" (válidos: ${USOS_DESTINO.join(', ')})`);
}

function texto(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

// ──────────────────────────────────────────────────────────────────
// Tipos de salida
// ──────────────────────────────────────────────────────────────────

export interface VersionDTO {
  id: string;
  version: number;
  fractionCode: string;
  nico: string | null;
  justificacion: string | null;
  fuente: string;
  classificationId: string | null;
  estado: string;
  propuestoPor: string;
  propuestoPorNombre: string | null;
  aprobadoPor: string | null;
  aprobadoPorNombre: string | null;
  aprobadoAt: Date | null;
  tigieVersion: string | null;
  createdAt: Date;
}

export interface ParteResumen {
  id: string;
  productCode: string;
  description: string;
  unit: string;
  fractionCode: string | null;
  nico: string | null;
  noms: unknown;
  usoDestino: string | null;
  paisOrigen: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  versionVigente: number;
  versiones: number;
  propuestasPendientes: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParteDetalle extends Omit<ParteResumen, 'versiones'> {
  totalVersiones: number;
  versiones: VersionDTO[];
}

type ProductRow = Prisma.ProductGetPayload<{ include: { _count: { select: { versiones: true } } } }>;

async function nombresDeUsuarios(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (unicos.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { tenantId, id: { in: unicos } }, select: { id: true, name: true, email: true } });
  return new Map(users.map(u => [u.id, u.name || u.email]));
}

async function nombresDeClientes(tenantId: string, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unicos.length === 0) return new Map();
  const cs = await prisma.cliente.findMany({ where: { tenantId, id: { in: unicos } }, select: { id: true, razonSocial: true, rfc: true } });
  return new Map(cs.map(c => [c.id, `${c.razonSocial} (${c.rfc})`]));
}

// ──────────────────────────────────────────────────────────────────
// Listado / detalle
// ──────────────────────────────────────────────────────────────────

/** Alcance por cliente listo para el where: id concreto o `{ in: [...] }` (usuario restringido a varios). */
export type FiltroClienteId = string | { in: string[] } | null | undefined;

export interface FiltrosListado {
  clienteId?: FiltroClienteId;
  q?: string;
  capitulo?: string;
  dictamen?: 'con' | 'sin';
  usoDestino?: string;
  incluirInactivas?: boolean;
  page?: number;
  limit?: number;
}

function whereListado(tenantId: string, f: FiltrosListado): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { tenantId };
  if (!f.incluirInactivas) where.active = true;
  if (f.clienteId) where.clienteId = f.clienteId;
  if (f.usoDestino) where.usoDestino = f.usoDestino;
  if (f.dictamen === 'con') where.versionVigente = { gt: 0 };
  if (f.dictamen === 'sin') where.versionVigente = 0;
  if (f.capitulo) {
    const cap = f.capitulo.replace(/\D/g, '').slice(0, 2);
    if (cap.length === 2) where.fractionCode = { startsWith: cap };
  }
  const q = (f.q ?? '').trim();
  if (q) {
    const or: Prisma.ProductWhereInput[] = [
      { productCode: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
    const digits = q.replace(/[.\-\s]/g, '');
    if (/^\d{2,8}$/.test(digits)) or.push({ fractionCode: { startsWith: digits } });
    where.OR = or;
  }
  return where;
}

async function aResumen(tenantId: string, rows: ProductRow[]): Promise<ParteResumen[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const pendientes = await prisma.productClassificationVersion.groupBy({
    by: ['productId'], where: { productId: { in: ids }, estado: 'propuesta' }, _count: { _all: true },
  });
  const pendMap = new Map(pendientes.map(p => [p.productId, p._count._all]));
  const clientes = await nombresDeClientes(tenantId, rows.map(r => r.clienteId));
  return rows.map(r => ({
    id: r.id, productCode: r.productCode, description: r.description, unit: r.unit,
    fractionCode: r.fractionCode, nico: r.nico, noms: r.noms, usoDestino: r.usoDestino, paisOrigen: r.paisOrigen,
    clienteId: r.clienteId, clienteNombre: r.clienteId ? clientes.get(r.clienteId) ?? null : null,
    versionVigente: r.versionVigente, versiones: r._count.versiones,
    propuestasPendientes: pendMap.get(r.id) ?? 0,
    active: r.active, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }));
}

export async function listarPartes(tenantId: string, f: FiltrosListado) {
  const page = Math.max(1, Number(f.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(f.limit) || 25));
  const where = whereListado(tenantId, f);
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, include: { _count: { select: { versiones: true } } }, orderBy: [{ updatedAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.product.count({ where }),
  ]);
  return { data: await aResumen(tenantId, rows), pagination: { page, limit, total } };
}

async function parteDelTenant(tenantId: string, id: string) {
  const p = await prisma.product.findFirst({ where: { id, tenantId }, include: { _count: { select: { versiones: true } } } });
  if (!p) throw new CatalogoError('NO_ENCONTRADA', 'Parte no encontrada');
  return p;
}

export async function obtenerParte(tenantId: string, id: string): Promise<ParteDetalle> {
  const p = await parteDelTenant(tenantId, id);
  const [resumen] = await aResumen(tenantId, [p]);
  const vs = await prisma.productClassificationVersion.findMany({ where: { productId: p.id }, orderBy: { version: 'desc' } });
  const nombres = await nombresDeUsuarios(tenantId, vs.flatMap(v => [v.propuestoPor, v.aprobadoPor ?? '']));
  const versiones: VersionDTO[] = vs.map(v => ({
    id: v.id, version: v.version, fractionCode: v.fractionCode, nico: v.nico, justificacion: v.justificacion,
    fuente: v.fuente, classificationId: v.classificationId, estado: v.estado,
    propuestoPor: v.propuestoPor, propuestoPorNombre: nombres.get(v.propuestoPor) ?? null,
    aprobadoPor: v.aprobadoPor, aprobadoPorNombre: v.aprobadoPor ? nombres.get(v.aprobadoPor) ?? null : null,
    aprobadoAt: v.aprobadoAt, tigieVersion: v.tigieVersion, createdAt: v.createdAt,
  }));
  const { versiones: totalVersiones, ...resto } = resumen!;
  return { ...resto, totalVersiones, versiones };
}

// ──────────────────────────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────────────────────────

export interface DatosParte {
  productCode: string;
  description: string;
  unit?: string;
  clienteId?: string | null;
  usoDestino?: string | null;
  paisOrigen?: string | null;
  noms?: unknown;
  /** Opcional: fracción inicial → versión 1 (vigente si `puedeAprobar`, si no propuesta). */
  fractionCode?: string | null;
  nico?: string | null;
  justificacion?: string | null;
}

export interface OpcionesActor { puedeAprobar: boolean; fuente?: FuenteVersion; ip?: string | null }

async function resolverCliente(tenantId: string, clienteId: string | null | undefined): Promise<string | null> {
  if (!clienteId) return null;
  const ok = await validarClienteDelTenant(tenantId, clienteId);
  if (!ok) throw new CatalogoError('CLIENTE_INVALIDO', 'El cliente no existe o no pertenece a tu empresa');
  return ok;
}

export async function crearParte(tenantId: string, userId: string, d: DatosParte, op: OpcionesActor) {
  const productCode = texto(d.productCode);
  const description = texto(d.description);
  if (!productCode) throw new CatalogoError('DATOS_INVALIDOS', 'productCode es obligatorio');
  if (!description) throw new CatalogoError('DATOS_INVALIDOS', 'description es obligatoria');
  const clienteId = await resolverCliente(tenantId, d.clienteId);
  const usoDestino = normalizarUso(d.usoDestino);
  const dup = await prisma.product.findFirst({ where: { tenantId, productCode }, select: { id: true } });
  if (dup) throw new CatalogoError('DUPLICADA', `Ya existe la parte ${productCode} en tu catálogo`);

  const p = await prisma.product.create({ data: {
    tenantId, productCode, description, unit: texto(d.unit) || 'Pza', clienteId, usoDestino,
    paisOrigen: texto(d.paisOrigen) || null,
    noms: d.noms === undefined ? undefined : (d.noms as Prisma.InputJsonValue),
  } });
  await recordAudit({ tenantId, userId, action: 'CATALOGO_PARTE_CREADA', entity: 'Product', entityId: p.id, after: { productCode, description, clienteId }, ipAddress: op.ip ?? null });

  if (d.fractionCode) {
    const v = await proponerVersion(tenantId, userId, p.id, { fractionCode: d.fractionCode, nico: d.nico, fuente: op.fuente ?? 'manual', justificacion: d.justificacion ?? null }, op.ip);
    if (op.puedeAprobar) await aprobarVersion(tenantId, userId, p.id, v.version, op.ip);
  }
  return prisma.product.findFirstOrThrow({ where: { id: p.id, tenantId } });
}

export async function actualizarParte(tenantId: string, userId: string, id: string, d: Partial<Omit<DatosParte, 'productCode' | 'fractionCode' | 'nico' | 'justificacion'>> & { active?: boolean }, ip?: string | null) {
  const p = await parteDelTenant(tenantId, id);
  const data: Prisma.ProductUpdateInput = {};
  if (d.description !== undefined) { const t = texto(d.description); if (!t) throw new CatalogoError('DATOS_INVALIDOS', 'description no puede quedar vacía'); data.description = t; }
  if (d.unit !== undefined) data.unit = texto(d.unit) || 'Pza';
  if (d.usoDestino !== undefined) data.usoDestino = normalizarUso(d.usoDestino);
  if (d.paisOrigen !== undefined) data.paisOrigen = texto(d.paisOrigen) || null;
  if (d.noms !== undefined) data.noms = d.noms === null ? Prisma.JsonNull : (d.noms as Prisma.InputJsonValue);
  if (d.clienteId !== undefined) data.clienteId = await resolverCliente(tenantId, d.clienteId);
  if (d.active !== undefined) data.active = !!d.active;
  const upd = await prisma.product.update({ where: { id: p.id }, data });
  await recordAudit({ tenantId, userId, action: 'CATALOGO_PARTE_ACTUALIZADA', entity: 'Product', entityId: p.id, before: p, after: upd, ipAddress: ip ?? null });
  return upd;
}

/** Baja lógica: la parte deja de listarse pero conserva su expediente. */
export async function desactivarParte(tenantId: string, userId: string, id: string, ip?: string | null) {
  return actualizarParte(tenantId, userId, id, { active: false }, ip);
}

// ──────────────────────────────────────────────────────────────────
// Versiones
// ──────────────────────────────────────────────────────────────────

export interface DatosVersion {
  fractionCode: string;
  nico?: string | null;
  justificacion?: string | null;
  fuente: FuenteVersion | string;
  classificationId?: string | null;
  tigieVersion?: string | null;
}

export async function proponerVersion(tenantId: string, userId: string, productId: string, d: DatosVersion, ip?: string | null) {
  const p = await parteDelTenant(tenantId, productId);
  const fractionCode = normalizarFraccion(d.fractionCode);
  if (!fractionCode) throw new CatalogoError('FRACCION_INVALIDA', `Fracción inválida "${d.fractionCode}" (8 dígitos)`);
  // NICO omitido (undefined) hereda el vigente; '' o null lo limpian explícitamente.
  const nico = d.nico === undefined ? (p.versionVigente > 0 ? p.nico ?? null : null) : normalizarNico(d.nico);
  const fuente = (FUENTES_VERSION as readonly string[]).includes(d.fuente) ? d.fuente : 'manual';
  const justificacion = texto(d.justificacion) || null;

  if (p.versionVigente > 0) {
    if (p.fractionCode === fractionCode && (p.nico ?? null) === nico) {
      throw new CatalogoError('SIN_CAMBIO', 'La fracción y el NICO propuestos son los que ya están vigentes');
    }
    if (!justificacion) {
      throw new CatalogoError('JUSTIFICACION_REQUERIDA', `La parte ${p.productCode} ya tiene una clasificación vigente (${formatearFraccion(p.fractionCode)}). Reclasificar exige justificación.`);
    }
  }
  if (d.classificationId) {
    const c = await prisma.classification.findFirst({ where: { id: d.classificationId, tenantId }, select: { id: true } });
    if (!c) throw new CatalogoError('NO_ENCONTRADA', 'Clasificación no encontrada');
  }

  const ultima = await prisma.productClassificationVersion.aggregate({ where: { productId: p.id }, _max: { version: true } });
  const version = (ultima._max.version ?? 0) + 1;
  const v = await prisma.productClassificationVersion.create({ data: {
    productId: p.id, version, fractionCode, nico, justificacion, fuente,
    classificationId: d.classificationId ?? null, estado: 'propuesta', propuestoPor: userId,
    tigieVersion: d.tigieVersion ?? null,
  } });
  await recordAudit({ tenantId, userId, action: 'CATALOGO_VERSION_PROPUESTA', entity: 'Product', entityId: p.id, after: { version, fractionCode, nico, fuente, justificacion }, ipAddress: ip ?? null });
  return v;
}

export async function aprobarVersion(tenantId: string, userId: string, productId: string, version: number, ip?: string | null) {
  const p = await parteDelTenant(tenantId, productId);
  const v = await prisma.productClassificationVersion.findFirst({ where: { productId: p.id, version } });
  if (!v) throw new CatalogoError('NO_ENCONTRADA', `Versión ${version} no encontrada`);
  if (v.estado !== 'propuesta') throw new CatalogoError('ESTADO_INVALIDO', `La versión ${version} está en estado "${v.estado}"; solo se aprueba una propuesta`);

  const ahora = new Date();
  const aprobada = await prisma.$transaction(async tx => {
    await tx.productClassificationVersion.updateMany({ where: { productId: p.id, estado: 'vigente' }, data: { estado: 'reemplazada' } });
    const a = await tx.productClassificationVersion.update({ where: { id: v.id }, data: { estado: 'vigente', aprobadoPor: userId, aprobadoAt: ahora } });
    await tx.product.update({ where: { id: p.id }, data: { fractionCode: a.fractionCode, nico: a.nico, versionVigente: a.version } });
    return a;
  });
  await recordAudit({
    tenantId, userId, action: 'CATALOGO_VERSION_APROBADA', entity: 'Product', entityId: p.id,
    before: { fractionCode: p.fractionCode, nico: p.nico, versionVigente: p.versionVigente },
    after: { fractionCode: aprobada.fractionCode, nico: aprobada.nico, versionVigente: aprobada.version },
    metadata: { justificacion: aprobada.justificacion, fuente: aprobada.fuente, propuestoPor: aprobada.propuestoPor },
    ipAddress: ip ?? null,
  });
  return aprobada;
}

export async function rechazarVersion(tenantId: string, userId: string, productId: string, version: number, motivo?: string | null, ip?: string | null) {
  const p = await parteDelTenant(tenantId, productId);
  const v = await prisma.productClassificationVersion.findFirst({ where: { productId: p.id, version } });
  if (!v) throw new CatalogoError('NO_ENCONTRADA', `Versión ${version} no encontrada`);
  if (v.estado !== 'propuesta') throw new CatalogoError('ESTADO_INVALIDO', `Solo se rechaza una propuesta (estado actual: ${v.estado})`);
  const r = await prisma.productClassificationVersion.update({ where: { id: v.id }, data: { estado: 'rechazada', aprobadoPor: userId, aprobadoAt: new Date() } });
  await recordAudit({ tenantId, userId, action: 'CATALOGO_VERSION_RECHAZADA', entity: 'Product', entityId: p.id, metadata: { version, motivo: motivo ?? null }, ipAddress: ip ?? null });
  return r;
}

// ──────────────────────────────────────────────────────────────────
// Promover desde Historial
// ──────────────────────────────────────────────────────────────────

function codigoAutomatico(descripcionNormalizada: string): string {
  return 'SIN-SKU-' + crypto.createHash('sha256').update(descripcionNormalizada).digest('hex').slice(0, 10).toUpperCase();
}

/** Busca una parte del tenant (y cliente, si viene) cuya descripción normalizada sea idéntica. */
async function parteConMismaDescripcion(tenantId: string, description: string, clienteId?: FiltroClienteId) {
  const norm = normalizarDescripcion(description);
  if (!norm) return null;
  const candidatas = await prisma.product.findMany({
    where: { tenantId, active: true, description: { equals: description.trim(), mode: 'insensitive' }, ...(clienteId ? { clienteId } : {}) },
    take: 20,
  });
  let hit = candidatas.find(c => normalizarDescripcion(c.description) === norm) ?? null;
  if (!hit) {
    // Segundo intento: acentos/espacios distintos — filtra por la primera palabra significativa.
    // Varias palabras ancla (Postgres `contains` es sensible a acentos: basta que una coincida).
    const palabras = norm.split(' ').filter(w => w.length >= 4).slice(0, 6);
    if (palabras.length > 0) {
      const mas = await prisma.product.findMany({ where: { tenantId, active: true, OR: palabras.map(w => ({ description: { contains: w, mode: 'insensitive' as const } })), ...(clienteId ? { clienteId } : {}) }, take: 200 });
      hit = mas.find(c => normalizarDescripcion(c.description) === norm) ?? null;
    }
  }
  return hit;
}

export async function promoverDesdeClasificacion(
  tenantId: string, userId: string, classificationId: string,
  d: { productCode?: string | null; clienteId?: string | null; unit?: string | null; usoDestino?: string | null; justificacion?: string | null },
  op: OpcionesActor,
) {
  const c = await prisma.classification.findFirst({ where: { id: classificationId, tenantId } });
  if (!c) throw new CatalogoError('NO_ENCONTRADA', 'Clasificación no encontrada');
  if (c.feedback !== 'correct') {
    throw new CatalogoError('FEEDBACK_REQUERIDO', 'Antes de promover al catálogo confirma con ✓ que la clasificación es correcta (feedback del Historial).');
  }
  const fractionCode = normalizarFraccion(c.fractionCode);
  if (!fractionCode) throw new CatalogoError('FRACCION_INVALIDA', `La clasificación tiene una fracción no válida (${c.fractionCode})`);
  const clienteId = await resolverCliente(tenantId, d.clienteId ?? c.clienteId ?? null);

  let parte = null as Awaited<ReturnType<typeof parteDelTenant>> | null;
  let creada = false;
  const code = texto(d.productCode);
  if (code) {
    const found = await prisma.product.findFirst({ where: { tenantId, productCode: code }, include: { _count: { select: { versiones: true } } } });
    parte = found;
  } else {
    const found = await parteConMismaDescripcion(tenantId, c.inputDescription, clienteId);
    parte = found ? await parteDelTenant(tenantId, found.id) : null;
  }
  if (!parte) {
    const p = await prisma.product.create({ data: {
      tenantId, productCode: code || codigoAutomatico(normalizarDescripcion(c.inputDescription)),
      description: c.inputDescription.trim(), unit: texto(d.unit) || 'Pza', clienteId,
      usoDestino: normalizarUso(d.usoDestino), paisOrigen: c.inputCountryOfOrigin ?? null,
    } });
    creada = true;
    await recordAudit({ tenantId, userId, action: 'CATALOGO_PARTE_CREADA', entity: 'Product', entityId: p.id, after: { productCode: p.productCode, description: p.description, desdeClasificacion: c.id }, ipAddress: op.ip ?? null });
    parte = await parteDelTenant(tenantId, p.id);
  }

  // Misma fracción+NICO ya vigente → no duplica versión.
  if (parte.versionVigente > 0 && parte.fractionCode === fractionCode) {
    const vig = await prisma.productClassificationVersion.findFirst({ where: { productId: parte.id, estado: 'vigente' } });
    if (vig) {
      if (!vig.classificationId) await prisma.productClassificationVersion.update({ where: { id: vig.id }, data: { classificationId: c.id } });
      return { creada, parte: await obtenerParte(tenantId, parte.id), version: vig, sinCambio: true as const };
    }
  }
  // Ya existe una propuesta idéntica pendiente → se devuelve esa.
  const pend = await prisma.productClassificationVersion.findFirst({ where: { productId: parte.id, estado: 'propuesta', fractionCode } });
  if (pend) return { creada, parte: await obtenerParte(tenantId, parte.id), version: pend, sinCambio: true as const };

  const justificacion = texto(d.justificacion) || (parte.versionVigente > 0 ? null : `Promovida desde Historial (clasificación ${c.id})`);
  let v = await proponerVersion(tenantId, userId, parte.id, {
    fractionCode, fuente: 'historial', classificationId: c.id, justificacion, tigieVersion: c.tigieVersion ?? null,
  }, op.ip);
  if (op.puedeAprobar) v = await aprobarVersion(tenantId, userId, parte.id, v.version, op.ip);
  return { creada, parte: await obtenerParte(tenantId, parte.id), version: v, sinCambio: false as const };
}

// ──────────────────────────────────────────────────────────────────
// Consulta desde el Clasificador
// ──────────────────────────────────────────────────────────────────

export interface CatalogoHit {
  productId: string;
  productCode: string;
  description: string;
  fractionCode: string;
  nico: string | null;
  version: number;
  aprobadoAt: Date | null;
  aprobadoPor: string | null;
  aprobadoPorNombre: string | null;
  clienteId: string | null;
}

async function hitDe(tenantId: string, p: { id: string; productCode: string; description: string; fractionCode: string | null; nico: string | null; versionVigente: number; clienteId: string | null }): Promise<CatalogoHit | null> {
  if (p.versionVigente <= 0 || !p.fractionCode) return null;
  const v = await prisma.productClassificationVersion.findFirst({ where: { productId: p.id, estado: 'vigente' } });
  const nombres = v?.aprobadoPor ? await nombresDeUsuarios(tenantId, [v.aprobadoPor]) : new Map<string, string>();
  return {
    productId: p.id, productCode: p.productCode, description: p.description,
    fractionCode: p.fractionCode, nico: p.nico, version: p.versionVigente,
    aprobadoAt: v?.aprobadoAt ?? null, aprobadoPor: v?.aprobadoPor ?? null,
    aprobadoPorNombre: v?.aprobadoPor ? nombres.get(v.aprobadoPor) ?? null : null,
    clienteId: p.clienteId,
  };
}

/**
 * Antes de correr el modelo: si hay productCode con versión vigente → `reutilizar`
 * (misma respuesta, sin IA: consistencia = defensa legal). Si no, pero la
 * descripción es idéntica (normalizada) a una parte vigente → `sugerido`.
 */
export async function consultarCatalogoParaClasificar(
  tenantId: string, d: { productCode?: string | null; description: string; clienteId?: string | null },
): Promise<{ reutilizar: CatalogoHit | null; sugerido: CatalogoHit | null; parteSinDictamen: { productId: string; productCode: string } | null }> {
  const code = texto(d.productCode);
  let parteSinDictamen: { productId: string; productCode: string } | null = null;
  if (code) {
    const p = await prisma.product.findFirst({ where: { tenantId, productCode: code, active: true, ...(d.clienteId ? { clienteId: d.clienteId } : {}) } });
    if (p) {
      const hit = await hitDe(tenantId, p);
      if (hit) return { reutilizar: hit, sugerido: null, parteSinDictamen: null };
      parteSinDictamen = { productId: p.id, productCode: p.productCode };
    }
  }
  const misma = await parteConMismaDescripcion(tenantId, d.description ?? '', d.clienteId);
  const sugerido = misma ? await hitDe(tenantId, misma) : null;
  return { reutilizar: null, sugerido, parteSinDictamen };
}

export async function buscarPorDescripcion(tenantId: string, q: string, clienteId?: FiltroClienteId, limit = 10) {
  const texto_ = (q ?? '').trim();
  if (!texto_) return { exacta: null, similares: [] as ParteResumen[] };
  const exactaRow = await parteConMismaDescripcion(tenantId, texto_, clienteId);
  const palabras = normalizarDescripcion(texto_).split(' ').filter(w => w.length >= 3).slice(0, 6);
  const rows = palabras.length === 0 ? [] : await prisma.product.findMany({
    where: { tenantId, active: true, ...(clienteId ? { clienteId } : {}), AND: palabras.map(w => ({ description: { contains: w, mode: 'insensitive' as const } })) },
    include: { _count: { select: { versiones: true } } }, take: limit, orderBy: { updatedAt: 'desc' },
  });
  const similares = await aResumen(tenantId, rows);
  const exacta = exactaRow ? (similares.find(s => s.id === exactaRow.id) ?? (await aResumen(tenantId, [await parteDelTenant(tenantId, exactaRow.id)]))[0]!) : null;
  return { exacta, similares };
}

// ──────────────────────────────────────────────────────────────────
// Excel: export / import
// ──────────────────────────────────────────────────────────────────

export const COLUMNAS_IMPORT = ['productCode', 'description', 'fractionCode', 'nico', 'unit', 'usoDestino', 'paisOrigen'] as const;

export async function exportarPartesXlsx(tenantId: string, f: FiltrosListado): Promise<Buffer> {
  const rows = await prisma.product.findMany({ where: whereListado(tenantId, { ...f, incluirInactivas: f.incluirInactivas }), include: { _count: { select: { versiones: true } } }, orderBy: { productCode: 'asc' }, take: 20000 });
  const resumen = await aResumen(tenantId, rows);
  const filas = resumen.map(r => ({
    productCode: r.productCode,
    description: r.description,
    fractionCode: r.fractionCode ? formatearFraccion(r.fractionCode) : '',
    nico: r.nico ?? '',
    unit: r.unit,
    usoDestino: r.usoDestino ?? '',
    paisOrigen: r.paisOrigen ?? '',
    cliente: r.clienteNombre ?? '',
    versionVigente: r.versionVigente,
    propuestasPendientes: r.propuestasPendientes,
    actualizado: r.updatedAt.toISOString().slice(0, 10),
  }));
  const ws = XLSX.utils.json_to_sheet(filas, { header: [...COLUMNAS_IMPORT, 'cliente', 'versionVigente', 'propuestasPendientes', 'actualizado'] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export interface ReporteImport {
  total: number;
  creadas: number;
  actualizadas: number;
  versionesPropuestas: number;
  errores: { fila: number; productCode: string; mensaje: string }[];
  ids: string[];
}

function leerFilas(archivoBase64: string, nombreArchivo?: string): Record<string, unknown>[] {
  const esCsv = /\.csv$/i.test(nombreArchivo ?? '');
  const wb = esCsv
    ? XLSX.read(Buffer.from(archivoBase64, 'base64').toString('utf8'), { type: 'string' })
    : XLSX.read(archivoBase64, { type: 'base64' });
  const hoja = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!hoja) return [];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
  // Encabezados tolerantes: "Número de parte" → productCode, "Descripción" → description, etc.
  const alias: Record<string, (typeof COLUMNAS_IMPORT)[number]> = {
    productcode: 'productCode', codigo: 'productCode', 'codigo de parte': 'productCode', 'numero de parte': 'productCode', sku: 'productCode', parte: 'productCode',
    description: 'description', descripcion: 'description',
    fractioncode: 'fractionCode', fraccion: 'fractionCode', 'fraccion arancelaria': 'fractionCode',
    nico: 'nico', unit: 'unit', unidad: 'unit', umc: 'unit',
    usodestino: 'usoDestino', 'uso destino': 'usoDestino', 'uso/destino': 'usoDestino', uso: 'usoDestino',
    paisorigen: 'paisOrigen', 'pais origen': 'paisOrigen', 'pais de origen': 'paisOrigen', origen: 'paisOrigen',
  };
  return filas.map(f => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      const key = alias[normalizarDescripcion(k)] ?? k;
      out[key] = v;
    }
    return out;
  });
}

export async function importarPartes(
  tenantId: string, userId: string,
  d: { archivoBase64: string; nombreArchivo?: string; clienteId?: string | null },
  op: OpcionesActor,
): Promise<ReporteImport> {
  if (!d.archivoBase64 || typeof d.archivoBase64 !== 'string') throw new CatalogoError('DATOS_INVALIDOS', 'archivoBase64 es obligatorio');
  let filas: Record<string, unknown>[];
  try { filas = leerFilas(d.archivoBase64, d.nombreArchivo); }
  catch (e) { throw new CatalogoError('DATOS_INVALIDOS', `No se pudo leer el archivo: ${e instanceof Error ? e.message : 'formato no reconocido'}`); }
  const clienteId = await resolverCliente(tenantId, d.clienteId);
  const rep: ReporteImport = { total: filas.length, creadas: 0, actualizadas: 0, versionesPropuestas: 0, errores: [], ids: [] };
  const vistos = new Set<string>();

  for (let i = 0; i < filas.length; i++) {
    const fila = i + 2; // 1 = encabezado
    const f = filas[i]!;
    const productCode = texto(f.productCode);
    try {
      if (!productCode) throw new CatalogoError('DATOS_INVALIDOS', 'productCode vacío');
      if (vistos.has(productCode)) throw new CatalogoError('DUPLICADA', `productCode ${productCode} repetido en el archivo`);
      vistos.add(productCode);
      const description = texto(f.description);
      const fracTexto = texto(f.fractionCode);
      const fractionCode = fracTexto ? normalizarFraccion(fracTexto) : null;
      if (fracTexto && !fractionCode) throw new CatalogoError('FRACCION_INVALIDA', `fracción inválida "${fracTexto}" (8 dígitos)`);
      const usoDestino = normalizarUso(f.usoDestino);
      const nico = normalizarNico(f.nico);

      const existente = await prisma.product.findFirst({ where: { tenantId, productCode } });
      if (!existente) {
        if (!description) throw new CatalogoError('DATOS_INVALIDOS', 'description vacía');
        const p = await crearParte(tenantId, userId, {
          productCode, description, unit: texto(f.unit) || 'Pza', clienteId, usoDestino, paisOrigen: texto(f.paisOrigen) || null,
          fractionCode, nico,
        }, { ...op, fuente: 'lote' });
        rep.creadas++; rep.ids.push(p.id);
        if (fractionCode) rep.versionesPropuestas += op.puedeAprobar ? 0 : 1;
      } else {
        const cambios: Parameters<typeof actualizarParte>[3] = {};
        if (description && description !== existente.description) cambios.description = description;
        if (texto(f.unit) && texto(f.unit) !== existente.unit) cambios.unit = texto(f.unit);
        if (usoDestino && usoDestino !== existente.usoDestino) cambios.usoDestino = usoDestino;
        if (texto(f.paisOrigen) && texto(f.paisOrigen) !== existente.paisOrigen) cambios.paisOrigen = texto(f.paisOrigen);
        if (clienteId && clienteId !== existente.clienteId) cambios.clienteId = clienteId;
        if (Object.keys(cambios).length > 0) await actualizarParte(tenantId, userId, existente.id, cambios, op.ip);
        if (fractionCode && !(existente.fractionCode === fractionCode && (existente.nico ?? null) === (nico ?? existente.nico ?? null))) {
          const yaPropuesta = await prisma.productClassificationVersion.findFirst({ where: { productId: existente.id, estado: 'propuesta', fractionCode } });
          if (!yaPropuesta) {
            // Con vigente distinta, la importación NO la pisa: deja una propuesta con la justificación del archivo.
            const v = await proponerVersion(tenantId, userId, existente.id, {
              fractionCode, nico, fuente: 'lote',
              justificacion: existente.versionVigente > 0 ? `Importación ${d.nombreArchivo ?? 'de archivo'} (fila ${fila})` : null,
            }, op.ip);
            if (op.puedeAprobar && existente.versionVigente === 0) await aprobarVersion(tenantId, userId, existente.id, v.version, op.ip);
            else rep.versionesPropuestas++;
          }
        }
        rep.actualizadas++; rep.ids.push(existente.id);
      }
    } catch (e) {
      rep.errores.push({ fila, productCode, mensaje: e instanceof Error ? e.message : String(e) });
    }
  }
  await recordAudit({ tenantId, userId, action: 'CATALOGO_IMPORTACION', entity: 'Product', metadata: { archivo: d.nombreArchivo ?? null, total: rep.total, creadas: rep.creadas, actualizadas: rep.actualizadas, errores: rep.errores.length }, ipAddress: op.ip ?? null });
  return rep;
}
