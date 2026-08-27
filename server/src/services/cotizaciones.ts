/**
 * Cotizaciones guardadas — herramienta de VENTA de la agencia (Ola 2).
 *
 * Guardar / listar / abrir / duplicar (versión encadenada) / editar metadatos /
 * escenarios persistidos / export Excel / folio. Todo por tenant (+ cliente).
 *
 * La entrada original del cotizador se guarda dentro de `Quote.result` bajo la
 * clave `input` (el JSON ya era libre) para poder duplicar y recalcular
 * escenarios sin columnas nuevas. Para cotizaciones anteriores a esta ola se
 * reconstruye desde `QuoteItem` + columnas de despacho (`inputDe`).
 */
import * as XLSX from 'xlsx';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { esTipoOperacionDTA, type TipoOperacionDTA } from '../lib/dta';
import type { MultiQuoteInput, MultiQuoteResult, ScenarioVariant } from './quoter-multi';

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// ── Folio ──

/** Folio `Q-<año>-<seq>`: seq = posición de la cotización dentro del año del
 *  tenant (orden de creación). Es estable porque las cotizaciones no se borran
 *  del orden (append-only); se calcula al leer, sin columna nueva. */
export async function folioDe(q: { id: string; tenantId: string; createdAt: Date }): Promise<string> {
  const year = q.createdAt.getUTCFullYear();
  const desde = new Date(Date.UTC(year, 0, 1));
  const hasta = new Date(Date.UTC(year + 1, 0, 1));
  const antes = await prisma.quote.count({
    where: { tenantId: q.tenantId, createdAt: { gte: desde, lt: hasta }, OR: [{ createdAt: { lt: q.createdAt } }, { createdAt: q.createdAt, id: { lt: q.id } }] },
  });
  return `Q-${year}-${String(antes + 1).padStart(4, '0')}`;
}

// ── Lectura ──

export interface FiltrosLista {
  clienteId?: string | { in: string[] };
  nombre?: string;
  cliente?: string;      // texto libre (Quote.client) o razón social
  desde?: string;        // ISO
  hasta?: string;        // ISO
  estado?: string;       // approved | pending_approval | rejected
  vigentes?: boolean;    // solo con vigenciaHasta >= hoy (o sin vigencia)
  page?: number;
  pageSize?: number;
}

export interface FilaCotizacion {
  id: string;
  folio: string;
  name: string | null;
  client: string | null;
  clienteId: string | null;
  clienteRazonSocial: string | null;
  fractionCode: string;
  origin: string;
  currency: string;
  status: string;
  version: number;
  parentQuoteId: string | null;
  vigenciaHasta: string | null;
  vigente: boolean;
  totalAll: number | null;
  totalLandedCost: number | null;
  exchangeRate: number | null;
  tcFechaDOF: string | null;
  partidas: number;
  tieneEscenarios: boolean;
  createdAt: string;
  createdBy: string | null;
}

function vigenteHoy(v: Date | null): boolean {
  return !v || v.getTime() >= Date.now() - 24 * 3600 * 1000;
}

export async function listarCotizaciones(tenantId: string, f: FiltrosLista): Promise<{ filas: FilaCotizacion[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(f.pageSize ?? 25)));
  const where: Prisma.QuoteWhereInput = { tenantId };
  if (f.clienteId) where.clienteId = f.clienteId;
  if (f.nombre) where.name = { contains: f.nombre.slice(0, 120), mode: 'insensitive' };
  if (f.cliente) {
    where.OR = [
      { client: { contains: f.cliente.slice(0, 120), mode: 'insensitive' } },
      { clienteId: { in: (await prisma.cliente.findMany({ where: { tenantId, razonSocial: { contains: f.cliente.slice(0, 120), mode: 'insensitive' } }, select: { id: true } })).map(c => c.id) } },
    ];
  }
  if (f.desde || f.hasta) {
    where.createdAt = {};
    if (f.desde && !isNaN(Date.parse(f.desde))) where.createdAt.gte = new Date(f.desde);
    if (f.hasta && !isNaN(Date.parse(f.hasta))) where.createdAt.lte = new Date(new Date(f.hasta).getTime() + 24 * 3600 * 1000 - 1);
  }
  if (f.estado) where.status = f.estado;
  if (f.vigentes) where.OR = [...(where.OR ?? []), { vigenciaHasta: null }, { vigenciaHasta: { gte: new Date() } }];

  const [total, rows] = await Promise.all([
    prisma.quote.count({ where }),
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, tenantId: true, name: true, client: true, clienteId: true, fractionCode: true, origin: true, currency: true, status: true,
        version: true, parentQuoteId: true, vigenciaHasta: true, totalAll: true, totalLandedCost: true, exchangeRate: true, tcFechaDOF: true,
        escenarios: true, createdAt: true, user: { select: { name: true } }, _count: { select: { items: true } },
      },
    }),
  ]);
  const clienteIds = [...new Set(rows.map(r => r.clienteId).filter((x): x is string => !!x))];
  const clientes = clienteIds.length ? await prisma.cliente.findMany({ where: { tenantId, id: { in: clienteIds } }, select: { id: true, razonSocial: true } }) : [];
  const razon = new Map(clientes.map(c => [c.id, c.razonSocial]));
  const filas: FilaCotizacion[] = [];
  for (const r of rows) {
    filas.push({
      id: r.id,
      folio: await folioDe(r),
      name: r.name, client: r.client, clienteId: r.clienteId,
      clienteRazonSocial: r.clienteId ? razon.get(r.clienteId) ?? null : null,
      fractionCode: r.fractionCode, origin: r.origin, currency: r.currency, status: r.status,
      version: r.version, parentQuoteId: r.parentQuoteId,
      vigenciaHasta: r.vigenciaHasta?.toISOString() ?? null, vigente: vigenteHoy(r.vigenciaHasta),
      totalAll: r.totalAll, totalLandedCost: r.totalLandedCost, exchangeRate: r.exchangeRate,
      tcFechaDOF: r.tcFechaDOF?.toISOString() ?? null,
      partidas: r._count.items, tieneEscenarios: !!r.escenarios,
      createdAt: r.createdAt.toISOString(), createdBy: r.user?.name ?? null,
    });
  }
  return { filas, total, page, pageSize };
}

export interface CotizacionCompleta {
  id: string;
  folio: string;
  tenantId: string;
  name: string | null;
  client: string | null;
  clienteId: string | null;
  cliente: { id: string; rfc: string; razonSocial: string } | null;
  destination: string | null;
  incoterm: string;
  currency: string;
  origin: string;
  fractionCode: string;
  status: string;
  approvedAt: string | null;
  version: number;
  parentQuoteId: string | null;
  vigenciaHasta: string | null;
  vigente: boolean;
  notas: string | null;
  escenarios: EscenariosGuardados | null;
  tcFechaDOF: string | null;
  tabuladorId: string | null;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  totalLandedCost: number | null;
  totalDispatch: number | null;
  totalAll: number | null;
  createdAt: string;
  createdBy: string | null;
  /** Resultado completo del cotizador (multi o simple). */
  result: (Partial<MultiQuoteResult> & Record<string, unknown>) | null;
  /** Entrada reconstruible para duplicar / recalcular. */
  input: MultiQuoteInput;
  versiones: { id: string; version: number; folio: string; createdAt: string; totalAll: number | null; status: string }[];
  agencia: { nombre: string; rfc: string | null };
  items: Prisma.QuoteItemGetPayload<object>[];
}

type QuoteConItems = Prisma.QuoteGetPayload<{ include: { items: true; user: { select: { name: true } } } }>;

function parseResult(raw: string): (Partial<MultiQuoteResult> & Record<string, unknown>) | null {
  try { const r = JSON.parse(raw); return r && typeof r === 'object' ? r : null; } catch { return null; }
}

/** Reconstruye la entrada del cotizador desde el JSON guardado o desde los items. */
export function inputDe(q: QuoteConItems, result: Record<string, unknown> | null): MultiQuoteInput {
  const guardado = result?.input as MultiQuoteInput | undefined;
  if (guardado && Array.isArray(guardado.items) && guardado.items.length > 0) {
    const { tabulador: _t, ...limpio } = guardado;
    return { ...limpio, name: q.name ?? limpio.name, client: q.client ?? limpio.client };
  }
  const items = [...q.items].sort((a, b) => a.numeroPartida - b.numeroPartida).map(it => ({
    fractionCode: it.fractionCode,
    description: it.description ?? undefined,
    countryOfOrigin: it.countryOfOrigin ?? q.origin,
    quantity: it.quantity,
    unit: it.unit ?? undefined,
    unitValueUSD: it.unitValueUSD,
    freightUSD: it.freightUSD,
    insuranceUSD: it.insuranceUSD,
  }));
  if (items.length === 0) {
    // Cotización simple (POST /api/quote): una partida con el valor total.
    items.push({ fractionCode: q.fractionCode, description: undefined, countryOfOrigin: q.origin, quantity: 1, unit: undefined, unitValueUSD: q.customsValue, freightUSD: 0, insuranceUSD: 0 });
  }
  const otros = Array.isArray(q.otrosGastos) ? (q.otrosGastos as { label: string; amount: number }[]) : [];
  return {
    name: q.name ?? undefined,
    client: q.client ?? undefined,
    origin: q.origin,
    destination: q.destination ?? undefined,
    incoterm: q.incoterm,
    currency: q.currency,
    exchangeRateMode: 'current',
    items,
    dispatch: {
      honorariosAgente: q.honorariosAgente ?? 0,
      prevalidacion: q.prevalidacion ?? 321,
      almacenaje: q.almacenaje ?? 0,
      estiba: q.estiba ?? 0,
      fleteInterno: q.fleteInterno ?? 0,
      otrosGastos: otros,
    },
    tipoOperacion: (result?.tipoOperacion as TipoOperacionDTA | undefined) ?? 'general',
    tabuladorId: q.tabuladorId ?? undefined,
  };
}

export async function obtenerCotizacion(tenantId: string, id: string): Promise<CotizacionCompleta> {
  const q = await prisma.quote.findFirst({ where: { id, tenantId }, include: { items: true, user: { select: { name: true } } } });
  if (!q) throw new AppError('Cotización no encontrada', 404);
  const [tenant, cliente, raiz] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, rfc: true } }),
    q.clienteId ? prisma.cliente.findFirst({ where: { id: q.clienteId, tenantId }, select: { id: true, rfc: true, razonSocial: true } }) : null,
    raizDe(q.id, tenantId),
  ]);
  const cadena = await prisma.quote.findMany({
    where: { tenantId, OR: [{ id: raiz }, { parentQuoteId: raiz }, { id: q.id }, { parentQuoteId: q.id }] },
    select: { id: true, tenantId: true, version: true, createdAt: true, totalAll: true, status: true, parentQuoteId: true },
    orderBy: { version: 'asc' },
  });
  // Cadena completa: seguir padres/hijos hasta cerrar (las versiones se
  // encadenan linealmente, pero un usuario puede ramificar).
  const vistos = new Map(cadena.map(c => [c.id, c]));
  let frontera = [...vistos.keys()];
  for (let hop = 0; hop < 20 && frontera.length > 0; hop++) {
    const mas = await prisma.quote.findMany({
      where: { tenantId, parentQuoteId: { in: frontera }, id: { notIn: [...vistos.keys()] } },
      select: { id: true, tenantId: true, version: true, createdAt: true, totalAll: true, status: true, parentQuoteId: true },
    });
    frontera = mas.map(m => m.id);
    for (const m of mas) vistos.set(m.id, m);
  }
  const versiones = [];
  for (const v of [...vistos.values()].sort((a, b) => a.version - b.version || a.createdAt.getTime() - b.createdAt.getTime())) {
    versiones.push({ id: v.id, version: v.version, folio: await folioDe(v), createdAt: v.createdAt.toISOString(), totalAll: v.totalAll, status: v.status });
  }
  const result = parseResult(q.result);
  return {
    id: q.id,
    folio: await folioDe(q),
    tenantId: q.tenantId,
    name: q.name, client: q.client, clienteId: q.clienteId, cliente,
    destination: q.destination, incoterm: q.incoterm, currency: q.currency, origin: q.origin, fractionCode: q.fractionCode,
    status: q.status, approvedAt: q.approvedAt?.toISOString() ?? null,
    version: q.version, parentQuoteId: q.parentQuoteId,
    vigenciaHasta: q.vigenciaHasta?.toISOString() ?? null, vigente: vigenteHoy(q.vigenciaHasta),
    notas: q.notas,
    escenarios: (q.escenarios as unknown as EscenariosGuardados | null) ?? null,
    tcFechaDOF: q.tcFechaDOF?.toISOString() ?? null,
    tabuladorId: q.tabuladorId,
    exchangeRate: q.exchangeRate, exchangeRateDate: q.exchangeRateDate?.toISOString() ?? null,
    totalLandedCost: q.totalLandedCost, totalDispatch: q.totalDispatch, totalAll: q.totalAll,
    createdAt: q.createdAt.toISOString(), createdBy: q.user?.name ?? null,
    result,
    input: inputDe(q, result),
    versiones,
    agencia: { nombre: tenant?.name ?? 'Agencia', rfc: tenant?.rfc ?? null },
    items: q.items,
  };
}

async function raizDe(id: string, tenantId: string): Promise<string> {
  let actual = id;
  for (let hop = 0; hop < 50; hop++) {
    const q = await prisma.quote.findFirst({ where: { id: actual, tenantId }, select: { parentQuoteId: true } });
    if (!q?.parentQuoteId) return actual;
    actual = q.parentQuoteId;
  }
  return actual;
}

// ── Duplicar (nueva versión encadenada) ──

/** Crea la versión N+1 con el MISMO contenido (editable después). Queda en
 *  `pending_approval` si el usuario no aprueba; el original no se toca. */
export async function duplicarCotizacion(tenantId: string, id: string, userId: string, opts: { puedeAprobar: boolean; nombre?: string | null }) {
  const orig = await prisma.quote.findFirst({ where: { id, tenantId }, include: { items: true } });
  if (!orig) throw new AppError('Cotización no encontrada', 404);
  const ultima = await prisma.quote.aggregate({ where: { tenantId, OR: [{ id: await raizDe(orig.id, tenantId) }, { parentQuoteId: await raizDe(orig.id, tenantId) }, { parentQuoteId: orig.id }] }, _max: { version: true } });
  const version = Math.max(orig.version, ultima._max.version ?? 0) + 1;
  const nueva = await prisma.quote.create({
    data: {
      tenantId, userId,
      fractionCode: orig.fractionCode, customsValue: orig.customsValue, origin: orig.origin, incoterm: orig.incoterm, currency: orig.currency,
      result: orig.result,
      status: opts.puedeAprobar ? 'approved' : 'pending_approval',
      approvedAt: opts.puedeAprobar ? new Date() : null,
      approvedById: opts.puedeAprobar ? userId : null,
      clienteId: orig.clienteId,
      name: opts.nombre?.trim() || orig.name, client: orig.client, destination: orig.destination,
      exchangeRate: orig.exchangeRate, exchangeRateDate: orig.exchangeRateDate,
      honorariosAgente: orig.honorariosAgente, prevalidacion: orig.prevalidacion, almacenaje: orig.almacenaje, estiba: orig.estiba, fleteInterno: orig.fleteInterno,
      otrosGastos: orig.otrosGastos ?? undefined,
      totalLandedCost: orig.totalLandedCost, totalDispatch: orig.totalDispatch, totalAll: orig.totalAll,
      version, parentQuoteId: orig.id,
      vigenciaHasta: orig.vigenciaHasta, notas: orig.notas,
      escenarios: orig.escenarios ?? undefined,
      tcFechaDOF: orig.tcFechaDOF, tabuladorId: orig.tabuladorId,
      items: {
        create: orig.items.map(({ id: _id, quoteId: _q, createdAt: _c, ...it }) => it),
      },
    },
    include: { items: true },
  });
  return nueva;
}

// ── PATCH metadatos ──

export interface PatchCotizacion { name?: unknown; notas?: unknown; vigenciaHasta?: unknown; escenarios?: unknown; clienteId?: unknown }

export function validarPatch(body: PatchCotizacion): { data: Prisma.QuoteUpdateInput; error: string | null } {
  const data: Prisma.QuoteUpdateInput = {};
  if (body.name !== undefined) {
    if (body.name !== null && typeof body.name !== 'string') return { data, error: 'name debe ser texto' };
    data.name = body.name === null ? null : String(body.name).trim().slice(0, 160);
  }
  if (body.notas !== undefined) {
    if (body.notas !== null && typeof body.notas !== 'string') return { data, error: 'notas debe ser texto' };
    if (typeof body.notas === 'string' && body.notas.length > 4000) return { data, error: 'notas: máximo 4,000 caracteres' };
    data.notas = body.notas === null ? null : String(body.notas);
  }
  if (body.vigenciaHasta !== undefined) {
    if (body.vigenciaHasta === null || body.vigenciaHasta === '') data.vigenciaHasta = null;
    else {
      const d = new Date(String(body.vigenciaHasta));
      if (isNaN(d.getTime())) return { data, error: 'vigenciaHasta inválida (usa ISO 8601)' };
      if (d.getTime() > Date.now() + 5 * 366 * 24 * 3600 * 1000) return { data, error: 'vigenciaHasta: máximo 5 años' };
      data.vigenciaHasta = d;
    }
  }
  if (body.escenarios !== undefined) {
    if (body.escenarios === null) data.escenarios = null as unknown as Prisma.InputJsonValue;
    else {
      const err = validarEscenariosGuardados(body.escenarios);
      if (err) return { data, error: err };
      data.escenarios = body.escenarios as Prisma.InputJsonValue;
    }
  }
  return { data, error: null };
}

export async function actualizarCotizacion(tenantId: string, id: string, body: PatchCotizacion) {
  const existing = await prisma.quote.findFirst({ where: { id, tenantId }, select: { id: true, status: true } });
  if (!existing) throw new AppError('Cotización no encontrada', 404);
  const { data, error } = validarPatch(body);
  if (error) throw new AppError(error, 422);
  if (body.clienteId !== undefined) {
    if (body.clienteId === null) data.clienteId = null;
    else {
      const c = await prisma.cliente.findFirst({ where: { id: String(body.clienteId), tenantId, activo: true }, select: { id: true } });
      if (!c) throw new AppError('Cliente no encontrado en este tenant', 422);
      data.clienteId = c.id;
    }
  }
  // El estado de aprobación NO se toca desde aquí (usa /approve o /api/aprobaciones).
  await prisma.quote.updateMany({ where: { id, tenantId }, data: data as Prisma.QuoteUpdateManyMutationInput });
  return obtenerCotizacion(tenantId, id);
}

// ── Escenarios guardables ──

export interface EscenarioGuardado {
  name: string;
  totalAll: number;
  totalLandedCost: number;
  totalDuties: number;
  igi: number;
  dta: number;
  countervailing: number;
  ieps: number;
  iva: number;
  deltaMXN: number;
  deltaPct: number;
  variant: ScenarioVariant;
  alertas: string[];
}

export interface EscenariosGuardados {
  calculadoEn: string;
  base: { totalAll: number; totalLandedCost: number; totalDuties: number; igi: number; dta: number; countervailing: number; ieps: number; iva: number };
  escenarios: EscenarioGuardado[];
}

/** Escenarios de venta por defecto: China definitivo vs T-MEC vs PROSEC. */
export const ESCENARIOS_VENTA: ScenarioVariant[] = [
  { name: 'China — importación definitiva (NMF)', countryOverride: 'CN', treatyOverride: null, applyPROSEC: false, tipoOperacionOverride: 'general' },
  { name: 'T-MEC — origen EUA con certificación', countryOverride: 'US', treatyOverride: 'TMEC', hasCertificadoOrigen: true, applyPROSEC: false, tipoOperacionOverride: 'tratado' },
  { name: 'PROSEC — con registro vigente ante SE', applyPROSEC: true },
];

export function validarVariantes(x: unknown): { variants: ScenarioVariant[]; error: string | null } {
  if (!Array.isArray(x) || x.length === 0) return { variants: [], error: 'variants[] requerido' };
  if (x.length > 10) return { variants: [], error: 'Máximo 10 escenarios' };
  const out: ScenarioVariant[] = [];
  for (let i = 0; i < x.length; i++) {
    const v = (x[i] ?? {}) as Record<string, unknown>;
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, 120) : '';
    if (!name) return { variants: [], error: `Escenario ${i + 1}: name requerido` };
    const num = (k: string, min: number, max: number): number | undefined | 'err' => {
      if (v[k] == null) return undefined;
      const n = Number(v[k]);
      return Number.isFinite(n) && n >= min && n <= max ? n : 'err';
    };
    const fm = num('freightMultiplier', 0, 100); const wm = num('weightMultiplier', 0, 100); const er = num('exchangeRateOverride', 0.0001, 100);
    if (fm === 'err' || wm === 'err') return { variants: [], error: `Escenario ${i + 1}: multiplicadores fuera de rango (0-100)` };
    if (er === 'err') return { variants: [], error: `Escenario ${i + 1}: TC fuera de rango (0-100)` };
    if (v.countryOverride != null && (typeof v.countryOverride !== 'string' || v.countryOverride.length > 60)) return { variants: [], error: `Escenario ${i + 1}: countryOverride inválido` };
    if (v.treatyOverride !== undefined && v.treatyOverride !== null && !['TMEC', 'TLCUEM', 'CPTPP'].includes(String(v.treatyOverride))) return { variants: [], error: `Escenario ${i + 1}: treatyOverride inválido` };
    if (v.tipoOperacionOverride != null && !esTipoOperacionDTA(v.tipoOperacionOverride)) return { variants: [], error: `Escenario ${i + 1}: tipoOperacionOverride inválido` };
    out.push({
      name,
      ...(fm !== undefined ? { freightMultiplier: fm } : {}),
      ...(wm !== undefined ? { weightMultiplier: wm } : {}),
      ...(er !== undefined ? { exchangeRateOverride: er } : {}),
      ...(typeof v.countryOverride === 'string' ? { countryOverride: v.countryOverride } : {}),
      ...(v.treatyOverride !== undefined ? { treatyOverride: v.treatyOverride as ScenarioVariant['treatyOverride'] } : {}),
      ...(v.hasCertificadoOrigen !== undefined ? { hasCertificadoOrigen: !!v.hasCertificadoOrigen } : {}),
      ...(v.applyPROSEC !== undefined ? { applyPROSEC: !!v.applyPROSEC } : {}),
      ...(v.tipoOperacionOverride != null ? { tipoOperacionOverride: v.tipoOperacionOverride as TipoOperacionDTA } : {}),
    });
  }
  return { variants: out, error: null };
}

function validarEscenariosGuardados(x: unknown): string | null {
  const e = x as EscenariosGuardados;
  if (!e || typeof e !== 'object' || !Array.isArray(e.escenarios)) return 'escenarios debe ser { calculadoEn, base, escenarios[] }';
  if (e.escenarios.length > 10) return 'Máximo 10 escenarios';
  for (const s of e.escenarios) {
    if (typeof s?.name !== 'string' || !Number.isFinite(s?.totalAll)) return 'Cada escenario requiere name y totalAll numérico';
  }
  return null;
}

/** Resume la comparación a lo que se guarda/imprime (sin los resultados completos). */
export function resumirEscenarios(cmp: { base: MultiQuoteResult; scenarios: { name: string; result: MultiQuoteResult; deltaMXN: number; deltaPct: number }[] }, variants: ScenarioVariant[]): EscenariosGuardados {
  const t = (r: MultiQuoteResult) => ({ totalAll: r.totals.totalAll, totalLandedCost: r.totals.totalLandedCost, totalDuties: r.totals.totalDuties, igi: r.totals.igi, dta: r.totals.dta, countervailing: r.totals.countervailing, ieps: r.totals.ieps, iva: r.totals.iva });
  return {
    calculadoEn: new Date().toISOString(),
    base: t(cmp.base),
    escenarios: cmp.scenarios.map((s, i) => ({ name: s.name, ...t(s.result), deltaMXN: round2(s.deltaMXN), deltaPct: s.deltaPct, variant: variants[i] ?? { name: s.name }, alertas: s.result.alertas.slice(0, 8) })),
  };
}

// ── Excel ──

export async function exportarCotizacionXlsx(tenantId: string, id: string): Promise<{ buffer: Buffer; folio: string }> {
  const c = await obtenerCotizacion(tenantId, id);
  const r = c.result;
  const items = (r?.items as MultiQuoteResult['items'] | undefined) ?? [];
  const wb = XLSX.utils.book_new();

  const resumen: (string | number | null)[][] = [
    ['Folio', c.folio], ['Versión', c.version], ['Nombre', c.name], ['Cliente', c.cliente?.razonSocial ?? c.client], ['RFC cliente', c.cliente?.rfc ?? null],
    ['Agencia', c.agencia.nombre], ['RFC agencia', c.agencia.rfc], ['Estado', c.status], ['Creada', c.createdAt.slice(0, 10)],
    ['Vigencia hasta', c.vigenciaHasta?.slice(0, 10) ?? 'sin vigencia'], ['Incoterm', c.incoterm], ['Moneda', c.currency], ['Destino', c.destination],
    ['Tipo de operación (DTA)', (r?.dta as { etiqueta?: string } | undefined)?.etiqueta ?? r?.tipoOperacion ?? 'general'],
    ['Tipo de cambio', c.exchangeRate], ['Fuente TC', (r?.exchangeRateSource as string | undefined) ?? null], ['Fecha DOF del TC', c.tcFechaDOF ? c.tcFechaDOF.slice(0, 10) : 'TC manual — sin fecha DOF'],
    ['Valor en aduana MXN', r?.totals?.valueMXN ?? null], ['IGI', r?.totals?.igi ?? null], ['DTA', r?.totals?.dta ?? null], ['IEPS', r?.totals?.ieps ?? null], ['Cuotas compensatorias', r?.totals?.countervailing ?? null], ['IVA', r?.totals?.iva ?? null], ['ISAN', r?.totals?.isan ?? null],
    ['Total contribuciones', r?.totals?.totalDuties ?? null], ['Landed cost', c.totalLandedCost], ['Despacho', c.totalDispatch], ['Honorarios', r?.dispatch?.honorariosAgente ?? null], ['TOTAL', c.totalAll],
    ['Notas', c.notas],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');

  const partidas = items.map(it => ({
    Partida: it.numeroPartida, Fracción: it.fractionCode, Descripción: it.description, País: it.countryOfOrigin, Exportador: it.exportador ?? '',
    Cantidad: it.quantity, Unidad: it.unit, 'Valor unit USD': it.unitValueUSD, 'Flete USD': it.freightUSD, 'Seguro USD': it.insuranceUSD,
    'Valor aduana USD': it.customsValueUSD, 'Valor aduana MXN': it.customsValueMXN,
    'IGI %': it.igiRate, IGI: it.igi, 'DTA %': it.dtaRate, DTA: it.dta, 'IEPS %': it.iepsRate, IEPS: it.ieps,
    'Cuota comp.': it.countervailing, Resolución: it.antidumping?.resolutionNumber ?? '', 'Tasa cuota': it.antidumping ? `${it.antidumping.rate} ${it.antidumping.rateUnit}` : '', 'Origen tasa': it.antidumping?.origenTasa ?? '',
    IVA: it.iva, ISAN: it.isan, 'Total partida': it.totalCost, Tratado: it.treaty?.applied ?? '', 'Ahorro tratado': it.treaty?.savingsMXN ?? 0,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partidas.length ? partidas : [{ Partida: '', Nota: 'Sin partidas' }]), 'Partidas');

  const d = r?.dispatch;
  const despacho = [
    ['Concepto', 'MXN'], ['Honorarios agente', d?.honorariosAgente ?? c.items.length ? d?.honorariosAgente ?? 0 : 0], ['Prevalidación', d?.prevalidacion ?? 0], ['Almacenaje', d?.almacenaje ?? 0], ['Estiba', d?.estiba ?? 0], ['Flete interno', d?.fleteInterno ?? 0],
    ...((d?.otrosGastos ?? []).map(g => [g.label, g.amount])), ['Total despacho', d?.total ?? c.totalDispatch ?? 0],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(despacho), 'Despacho');

  if (c.escenarios) {
    const filas = [['Escenario', 'Total MXN', 'Δ MXN', 'Δ %', 'IGI', 'DTA', 'Cuota comp.', 'IEPS', 'IVA'],
      ['Base', c.escenarios.base.totalAll, 0, 0, c.escenarios.base.igi, c.escenarios.base.dta, c.escenarios.base.countervailing, c.escenarios.base.ieps, c.escenarios.base.iva],
      ...c.escenarios.escenarios.map(s => [s.name, s.totalAll, s.deltaMXN, s.deltaPct, s.igi, s.dta, s.countervailing, s.ieps, s.iva])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Escenarios');
  }
  const alertas = ((r?.alertas as string[] | undefined) ?? []).map(a => [a]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Alertas y avisos'], ...(alertas.length ? alertas : [['Sin alertas']])]), 'Alertas');

  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer, folio: c.folio };
}
