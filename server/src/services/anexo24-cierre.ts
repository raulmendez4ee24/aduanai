/**
 * Cierre mensual con candado (Anexo 24 · Ola 1, 27-ago-2026).
 *
 * Al cerrar un periodo `YYYY-MM` se congelan los saldos por parte y por
 * pedimento-partida al último día del mes, se guarda un resumen y su hash
 * SHA-256 en `CierrePeriodo`. A partir de ahí el ledger rechaza cualquier
 * movimiento (alta, descargo, eliminación de descargo) cuya fecha caiga en
 * un periodo cerrado o ANTERIOR al último cerrado: un movimiento retroactivo
 * cambiaría saldos ya sellados.
 */
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { recordAudit } from './audit-service';
import { esVigenciaPrograma } from '../lib/plazos-immex';
import { whereAlcance, type AlcanceCliente } from '../lib/cliente-contexto';

type Db = Prisma.TransactionClient | typeof prisma;

const RE_PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function periodoValido(p: string): boolean {
  return RE_PERIODO.test(p);
}

/** 'YYYY-MM' en UTC de una fecha. */
export function periodoDeFecha(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** [inicio, fin] del periodo en UTC (fin = último instante del mes). */
export function rangoDePeriodo(periodo: string): { inicio: Date; fin: Date } {
  const m = RE_PERIODO.exec(periodo);
  if (!m) throw new AppError(`Periodo inválido "${periodo}"; formato YYYY-MM`, 400);
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const inicio = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0));
  const fin = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));
  return { inicio, fin };
}

/** Último periodo cerrado del tenant (o null). */
export async function ultimoPeriodoCerrado(db: Db, tenantId: string): Promise<{ periodo: string; cerradoAt: Date; cerradoPor: string } | null> {
  const c = await db.cierrePeriodo.findFirst({
    where: { tenantId },
    orderBy: { periodo: 'desc' },
    select: { periodo: true, cerradoAt: true, cerradoPor: true },
  });
  return c;
}

/**
 * Candado: lanza 409 si `fecha` cae en un periodo cerrado o anterior al
 * último cerrado. Se llama DENTRO de la transacción del ledger para que la
 * decisión y la escritura vean el mismo estado.
 */
export async function assertPeriodoAbierto(db: Db, tenantId: string, fecha: Date, accion: string): Promise<void> {
  const ultimo = await ultimoPeriodoCerrado(db, tenantId);
  if (!ultimo) return;
  const periodoMov = periodoDeFecha(fecha);
  if (periodoMov <= ultimo.periodo) {
    throw new AppError(
      `Periodo ${periodoMov} cerrado: el inventario está sellado hasta ${ultimo.periodo} ` +
      `(cerrado el ${ultimo.cerradoAt.toISOString().slice(0, 10)}). No se puede ${accion} con fecha ${fecha.toISOString().slice(0, 10)}. ` +
      'Registre el movimiento con fecha del periodo abierto o solicite la reapertura documentada del cierre.',
      409,
    );
  }
}

// ── Cálculo de saldos al corte ─────────────────────────────────────────────

export interface SaldoParte {
  parteId: string | null;
  parteCodigo: string | null;
  fractionCode: string;
  descripcion: string;
  unit: string;
  tipo: string;
  importado: number;
  descargado: number;
  saldo: number;
  lotes: number;
}

export interface SaldoPedimentoPartida {
  temporaryImportId: string;
  pedimento: string;
  pedimentoPartidaId: string | null;
  fractionCode: string;
  parteCodigo: string | null;
  unit: string;
  tipo: string;
  entryDate: string;
  expirationDate: string | null;
  importado: number;
  descargado: number;
  saldo: number;
}

export interface ResumenCierre {
  periodo: string;
  corte: string;
  clienteId: string | null;
  totales: { lotes: number; partes: number; importado: number; descargado: number; saldo: number; activoFijoLotes: number };
  porParte: SaldoParte[];
  porPedimento: SaldoPedimentoPartida[];
}

/** JSON estable (claves ordenadas) para que el hash sea reproducible. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function hashResumen(resumen: ResumenCierre): string {
  return crypto.createHash('sha256').update(stableStringify(resumen)).digest('hex');
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Saldos por parte y por pedimento-partida al último instante del periodo.
 * Cuenta importaciones con entrada ≤ corte y descargos con fecha ≤ corte
 * (no usa `quantityDischarged` acumulado porque incluiría descargos futuros).
 */
/** `alcance`: `{ clienteId }` para un cierre por cliente (incluye lotes compartidos, clienteId null), `{}` para todo el tenant. */
export async function calcularSaldosAlCorte(db: Db, tenantId: string, periodo: string, alcance: AlcanceCliente | null): Promise<ResumenCierre> {
  const { fin } = rangoDePeriodo(periodo);
  const clienteId = typeof alcance?.clienteId === 'string' ? alcance.clienteId : null;
  const imports = await db.temporaryImport.findMany({
    where: { tenantId, entryDate: { lte: fin }, ...whereAlcance(alcance) },
    include: {
      discharges: { where: { dischargeDate: { lte: fin } }, select: { quantity: true } },
      product: { select: { id: true, productCode: true } },
    },
    orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
  });

  const porPedimento: SaldoPedimentoPartida[] = [];
  const partes = new Map<string, SaldoParte>();
  let activoFijoLotes = 0;

  for (const imp of imports) {
    const descargado = imp.discharges.reduce((s, d) => s + d.quantity, 0);
    const saldo = r6(imp.quantity - descargado);
    if (imp.tipo === 'ACTIVO_FIJO') activoFijoLotes++;
    porPedimento.push({
      temporaryImportId: imp.id,
      pedimento: imp.pedimento,
      pedimentoPartidaId: imp.pedimentoPartidaId,
      fractionCode: imp.fractionCode,
      parteCodigo: imp.product?.productCode ?? null,
      unit: imp.unit,
      tipo: imp.tipo,
      entryDate: imp.entryDate.toISOString().slice(0, 10),
      expirationDate: esVigenciaPrograma(imp) ? null : imp.expirationDate.toISOString().slice(0, 10),
      importado: imp.quantity,
      descargado: r6(descargado),
      saldo,
    });
    // Activo fijo separado del insumo aunque compartan parte/fracción.
    const clave = `${imp.tipo}:${imp.product ? `P:${imp.product.id}` : `F:${imp.fractionCode}`}`;
    const p = partes.get(clave) ?? {
      parteId: imp.product?.id ?? null,
      parteCodigo: imp.product?.productCode ?? null,
      fractionCode: imp.fractionCode,
      descripcion: imp.description,
      unit: imp.unit,
      tipo: imp.tipo,
      importado: 0, descargado: 0, saldo: 0, lotes: 0,
    };
    p.importado = r6(p.importado + imp.quantity);
    p.descargado = r6(p.descargado + descargado);
    p.saldo = r6(p.saldo + saldo);
    p.lotes++;
    partes.set(clave, p);
  }

  const porParte = Array.from(partes.values()).sort((a, b) => (a.parteCodigo ?? a.fractionCode).localeCompare(b.parteCodigo ?? b.fractionCode));
  return {
    periodo,
    corte: fin.toISOString(),
    clienteId,
    totales: {
      lotes: porPedimento.length,
      partes: porParte.length,
      importado: r6(porPedimento.reduce((s, x) => s + x.importado, 0)),
      descargado: r6(porPedimento.reduce((s, x) => s + x.descargado, 0)),
      saldo: r6(porPedimento.reduce((s, x) => s + x.saldo, 0)),
      activoFijoLotes,
    },
    porParte,
    porPedimento,
  };
}

// ── Cierre ─────────────────────────────────────────────────────────────────

export interface CerrarPeriodoInput {
  tenantId: string;
  userId: string;
  periodo: string;
  clienteId?: string | null;
  notas?: string | null;
}

export async function cerrarPeriodo(input: CerrarPeriodoInput) {
  if (!periodoValido(input.periodo)) throw new AppError(`Periodo inválido "${input.periodo}"; formato YYYY-MM`, 400);
  const { fin } = rangoDePeriodo(input.periodo);
  if (fin.getTime() > Date.now()) {
    throw new AppError(`El periodo ${input.periodo} todavía no termina; solo se cierran meses concluidos`, 400);
  }
  const ultimo = await ultimoPeriodoCerrado(prisma, input.tenantId);
  if (ultimo && input.periodo <= ultimo.periodo) {
    throw new AppError(`El periodo ${input.periodo} ya está sellado (último cierre: ${ultimo.periodo})`, 409);
  }

  const resumen = await calcularSaldosAlCorte(prisma, input.tenantId, input.periodo, input.clienteId ? { clienteId: input.clienteId } : {});
  const hash = hashResumen(resumen);

  const cierre = await prisma.cierrePeriodo.create({
    data: {
      tenantId: input.tenantId,
      clienteId: input.clienteId ?? null,
      periodo: input.periodo,
      cerradoPor: input.userId,
      hash,
      resumen: resumen as unknown as Prisma.InputJsonValue,
      notas: input.notas ?? null,
    },
  });

  await recordAudit({
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'inventory.cierre_periodo',
    entity: 'CierrePeriodo',
    entityId: cierre.id,
    after: { periodo: input.periodo, hash, totales: resumen.totales },
    metadata: { periodo: input.periodo, hash, lotes: resumen.totales.lotes, partes: resumen.totales.partes },
  });

  return { cierre, resumen };
}

export async function listarCierres(tenantId: string, alcance?: AlcanceCliente | null) {
  return prisma.cierrePeriodo.findMany({
    where: { tenantId, ...whereAlcance(alcance) },
    orderBy: { periodo: 'desc' },
    select: { id: true, periodo: true, cerradoPor: true, cerradoAt: true, hash: true, clienteId: true, notas: true, resumen: true },
  });
}
