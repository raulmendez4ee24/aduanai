/**
 * Descargo PEPS por número de parte (Anexo 24 · Ola 1, 27-ago-2026).
 *
 * El control legal IMMEX se lleva por pedimento y por parte: al descargar N
 * unidades de una parte, el sistema consume primero la importación más
 * antigua (Primeras Entradas, Primeras Salidas) y sigue con las siguientes
 * hasta cubrir la cantidad. Todo ocurre en UNA transacción: si un lote falla
 * (saldo, unidad, periodo cerrado) no se descarga nada.
 *
 * El activo fijo NO se descarga por PEPS de consumo (permanece por la vigencia
 * del programa; sale por retorno o cambio de régimen explícito).
 */
import { Prisma, type DischargeType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { createDischargeInTx } from './inventory-ledger';
import { assertPeriodoAbierto } from './anexo24-cierre';
import { whereAlcance, type AlcanceFiltro } from '../lib/cliente-contexto';

const EPSILON = 1e-9;
/** Redondeo a 6 decimales: evita que 0.3 − 0.1 persista como 0.19999999999999998 en `Discharge.quantity`. */
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const ABIERTAS = ['ACTIVE', 'PARTIALLY_DISCHARGED'] as const;

/** Tipos de salida en lenguaje de operación → DischargeType. */
export const TIPO_DESCARGO: Record<string, DischargeType> = {
  RT: 'RETURN_EXPORT',       // retorno al extranjero
  V1: 'TRANSFER',            // transferencia virtual entre IMMEX (constancia)
  F4: 'REGIME_CHANGE',       // cambio de régimen (temporal → definitivo)
  F5: 'REGIME_CHANGE',
  VENTA: 'DOMESTIC_SALE',
  venta: 'DOMESTIC_SALE',
  RETURN_EXPORT: 'RETURN_EXPORT',
  TRANSFER: 'TRANSFER',
  REGIME_CHANGE: 'REGIME_CHANGE',
  DOMESTIC_SALE: 'DOMESTIC_SALE',
  WASTE: 'WASTE',
  SCRAP: 'SCRAP',
  DESTRUCTION: 'DESTRUCTION',
  DONATION: 'DONATION',
};

export function tipoDescargoDe(tipo: string): DischargeType {
  const t = TIPO_DESCARGO[tipo] ?? TIPO_DESCARGO[tipo.toUpperCase()];
  if (!t) throw new AppError(`Tipo de descargo desconocido "${tipo}" (use RT, V1, F4, venta o un DischargeType)`, 400);
  return t;
}

// ── Planificador puro (testeable sin DB) ──────────────────────────────────

export interface LoteDisponible {
  id: string;
  entryDate: Date;
  disponible: number;
  pedimento: string;
  unit: string;
}

export interface AsignacionPeps {
  id: string;
  pedimento: string;
  cantidad: number;
  entryDate: Date;
}

export interface PlanPeps {
  asignaciones: AsignacionPeps[];
  /** Cantidad no cubierta por los lotes (0 cuando alcanza). */
  faltante: number;
  disponibleTotal: number;
}

/** Ordena de más antigua a más nueva y reparte la cantidad. Sin efectos. */
export function planificarPeps(lotes: LoteDisponible[], cantidad: number): PlanPeps {
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new AppError('La cantidad a descargar debe ser mayor a cero', 400);
  const orden = [...lotes]
    .filter(l => l.disponible > EPSILON)
    .sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime() || a.id.localeCompare(b.id));
  const asignaciones: AsignacionPeps[] = [];
  let restante = cantidad;
  for (const lote of orden) {
    if (restante <= EPSILON) break;
    const toma = r6(Math.min(restante, lote.disponible));
    asignaciones.push({ id: lote.id, pedimento: lote.pedimento, cantidad: toma, entryDate: lote.entryDate });
    restante = r6(restante - toma);
  }
  const disponibleTotal = r6(orden.reduce((s, l) => s + l.disponible, 0));
  return { asignaciones, faltante: restante <= EPSILON ? 0 : restante, disponibleTotal };
}

// ── Descargo real ─────────────────────────────────────────────────────────

export interface DescargarPepsInput {
  tenantId: string;
  userId: string;
  productId?: string | null;
  fractionCode?: string | null;
  cantidad: number;
  tipo: string;                       // RT | V1 | F4 | venta | DischargeType
  pedimentoDescargo?: string | null;  // pedimento de retorno / cambio de régimen
  constanciaTransferencia?: string | null;
  fecha: Date;
  clienteId?: string | null;
  /** Alcance del usuario (filtroCliente(req)): sin cliente explícito, solo lotes de sus clientes o compartidos. */
  alcance?: AlcanceFiltro | null;
  assemblyId?: string | null;
  customsValue?: number | null;
  destinationCountry?: string | null;
  buyerName?: string | null;
  taxesPaid?: number | null;
  notes?: string | null;
}

export interface DescargoPepsResultado {
  parte: { productId: string | null; fractionCode: string | null; unit: string };
  cantidad: number;
  tipo: DischargeType;
  descargos: Array<{ dischargeId: string; temporaryImportId: string; pedimento: string; entryDate: string; cantidad: number }>;
}

/** Lotes vivos de la parte (o fracción) en orden PEPS, con lock tomado en orden de id. */
async function lotesDeLaParte(
  tx: Prisma.TransactionClient,
  input: Pick<DescargarPepsInput, 'tenantId' | 'productId' | 'fractionCode' | 'clienteId' | 'alcance'>,
) {
  if (!input.productId && !input.fractionCode) throw new AppError('Indique productId (parte) o fractionCode', 400);
  const where: Prisma.TemporaryImportWhereInput = {
    tenantId: input.tenantId,
    status: { in: [...ABIERTAS] },
    tipo: 'INSUMO',
    ...(input.productId ? { productId: input.productId } : { fractionCode: input.fractionCode! }),
    ...(input.clienteId ? { clienteId: input.clienteId } : whereAlcance(input.alcance)),
  };
  const candidatos = await tx.temporaryImport.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } });
  if (candidatos.length === 0) return [];
  const ids = candidatos.map(c => c.id);
  // Mismo protocolo de lock que el ledger y bom-service (orden global por id),
  // pero en UN solo statement: cientos de lotes IMMEX = un round-trip, no cientos.
  await tx.$queryRaw`
    SELECT id FROM temporary_imports
    WHERE id IN (${Prisma.join(ids)}) AND "tenantId" = ${input.tenantId}
    ORDER BY id FOR UPDATE
  `;
  return tx.temporaryImport.findMany({
    where: { id: { in: ids }, tenantId: input.tenantId },
    orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Descarga PEPS dentro de una transacción abierta (la usa el retorno desde BOM
 * para descargar todos los componentes de un ensamble en un solo commit).
 */
export async function descargarPepsEnTx(tx: Prisma.TransactionClient, input: DescargarPepsInput): Promise<DescargoPepsResultado> {
  const tipo = tipoDescargoDe(input.tipo);
  if (!Number.isFinite(input.cantidad) || input.cantidad <= 0) throw new AppError('La cantidad a descargar debe ser mayor a cero', 400);
  if (tipo === 'TRANSFER' && !input.constanciaTransferencia && !input.pedimentoDescargo) {
    throw new AppError('Una transferencia virtual (V1) requiere constancia de transferencia o pedimento', 400);
  }
  await assertPeriodoAbierto(tx, input.tenantId, input.fecha, 'registrar un descargo PEPS');

  const lotes = await lotesDeLaParte(tx, input);
  if (lotes.length === 0) {
    throw new AppError(
      `Sin saldo: no hay importaciones temporales activas de la parte ${input.productId ? `productId=${input.productId}` : `fracción ${input.fractionCode}`}`,
      409,
    );
  }
  const unidades = new Set(lotes.map(l => l.unit.trim().toLocaleLowerCase('es-MX')));
  if (unidades.size > 1) {
    throw new AppError(`Los lotes de la parte tienen unidades distintas (${[...unidades].join(', ')}); concilie las unidades antes de descargar PEPS`, 409);
  }
  const unit = lotes[0].unit;

  const plan = planificarPeps(
    lotes.map(l => ({ id: l.id, entryDate: l.entryDate, disponible: l.quantity - l.quantityDischarged, pedimento: l.pedimento, unit: l.unit })),
    input.cantidad,
  );
  if (plan.faltante > 0) {
    throw new AppError(
      `Saldo insuficiente para descargar ${input.cantidad} ${unit}: disponible ${plan.disponibleTotal} ${unit} en ${lotes.length} lote(s); faltan ${plan.faltante} ${unit}`,
      409,
    );
  }

  const descargos: DescargoPepsResultado['descargos'] = [];
  for (const a of plan.asignaciones) {
    const d = await createDischargeInTx(tx, {
      temporaryImportId: a.id,
      tenantId: input.tenantId,
      userId: input.userId,
      type: tipo,
      pedimento: input.pedimentoDescargo ?? null,
      quantity: a.cantidad,
      unit,
      customsValue: input.customsValue ?? null,
      dischargeDate: input.fecha,
      destinationCountry: input.destinationCountry ?? null,
      buyerName: input.buyerName ?? null,
      taxesPaid: input.taxesPaid ?? null,
      notes: input.notes ?? null,
      constanciaTransferencia: input.constanciaTransferencia ?? null,
      assemblyId: input.assemblyId ?? null,
      clienteId: input.clienteId ?? null,
    });
    descargos.push({ dischargeId: d.id, temporaryImportId: a.id, pedimento: a.pedimento, entryDate: a.entryDate.toISOString().slice(0, 10), cantidad: a.cantidad });
  }

  return {
    parte: { productId: input.productId ?? null, fractionCode: input.fractionCode ?? lotes[0].fractionCode, unit },
    cantidad: input.cantidad,
    tipo,
    descargos,
  };
}

export async function descargarPeps(input: DescargarPepsInput): Promise<DescargoPepsResultado> {
  return prisma.$transaction(tx => descargarPepsEnTx(tx, input), { maxWait: 5_000, timeout: 20_000 });
}

// ── Saldos por parte (vista PEPS) ─────────────────────────────────────────

export interface LotePeps {
  temporaryImportId: string;
  pedimento: string;
  pedimentoPartidaId: string | null;
  entryDate: string;
  expirationDate: string | null;
  quantity: number;
  quantityDischarged: number;
  disponible: number;
  ordenPeps: number;
  ubicacion: { id: string; nombre: string; tipo: string } | null;
}

export interface ParteConLotes {
  parteId: string | null;
  parteCodigo: string | null;
  fractionCode: string;
  descripcion: string;
  unit: string;
  tipo: string;
  importado: number;
  descargado: number;
  saldo: number;
  proximoVencimiento: string | null;
  /** Lotes abiertos de la parte. `saldosPorParte` devuelve `[]` (resumen agregado); se expanden con `lotesDeParte`. */
  lotes: LotePeps[];
  lotesTotal: number;
}

const esCentinela = (d: Date | null | undefined) => !d || d.getUTCFullYear() >= 9999;

/**
 * Resumen por parte con UNA agregación en base (groupBy) + un lookup de partes:
 * no carga los lotes del tenant. Los lotes se piden por parte con `lotesDeParte`.
 */
export async function saldosPorParte(tenantId: string, opts: { alcance?: AlcanceFiltro | null; tipo?: 'INSUMO' | 'ACTIVO_FIJO' } = {}): Promise<ParteConLotes[]> {
  const where: Prisma.TemporaryImportWhereInput = {
    tenantId,
    status: { in: [...ABIERTAS] },
    ...(opts.tipo ? { tipo: opts.tipo } : {}),
    ...whereAlcance(opts.alcance),
  };
  const grupos = await prisma.temporaryImport.groupBy({
    by: ['tipo', 'productId', 'fractionCode'],
    where,
    _sum: { quantity: true, quantityDischarged: true },
    _count: { _all: true },
    _min: { expirationDate: true, unit: true, description: true },
  });
  const productIds = [...new Set(grupos.map(g => g.productId).filter((x): x is string => !!x))];
  const productos = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds }, tenantId }, select: { id: true, productCode: true, description: true } })
    : [];
  const porId = new Map(productos.map(p => [p.id, p]));

  const partes: ParteConLotes[] = grupos.map(g => {
    const prod = g.productId ? porId.get(g.productId) ?? null : null;
    const importado = r6(g._sum.quantity ?? 0);
    const descargado = r6(g._sum.quantityDischarged ?? 0);
    const vence = g.tipo === 'ACTIVO_FIJO' || esCentinela(g._min.expirationDate) ? null : g._min.expirationDate!.toISOString();
    return {
      parteId: prod?.id ?? null,
      parteCodigo: prod?.productCode ?? null,
      fractionCode: g.fractionCode,
      descripcion: prod?.description ?? g._min.description ?? '',
      unit: g._min.unit ?? '',
      tipo: g.tipo,
      importado,
      descargado,
      saldo: r6(importado - descargado),
      proximoVencimiento: vence,
      lotes: [],
      lotesTotal: g._count._all,
    };
  });
  return partes.sort((a, b) => {
    if (a.proximoVencimiento && b.proximoVencimiento) return a.proximoVencimiento.localeCompare(b.proximoVencimiento);
    if (a.proximoVencimiento) return -1;
    if (b.proximoVencimiento) return 1;
    return (a.parteCodigo ?? a.fractionCode).localeCompare(b.parteCodigo ?? b.fractionCode);
  });
}

/** Lotes abiertos de UNA parte (por productId) o de una fracción sin parte, en orden PEPS. */
export async function lotesDeParte(
  tenantId: string,
  sel: { parteId?: string | null; fractionCode?: string | null; tipo?: 'INSUMO' | 'ACTIVO_FIJO'; alcance?: AlcanceFiltro | null; take?: number },
): Promise<LotePeps[]> {
  if (!sel.parteId && !sel.fractionCode) throw new AppError('Indique parteId o fractionCode', 400);
  const imports = await prisma.temporaryImport.findMany({
    where: {
      tenantId,
      status: { in: [...ABIERTAS] },
      ...(sel.tipo ? { tipo: sel.tipo } : {}),
      ...(sel.parteId ? { productId: sel.parteId } : { productId: null, fractionCode: sel.fractionCode! }),
      ...whereAlcance(sel.alcance),
    },
    select: {
      id: true, pedimento: true, pedimentoPartidaId: true, entryDate: true, expirationDate: true, quantity: true, quantityDischarged: true, tipo: true,
      ubicacion: { select: { id: true, nombre: true, tipo: true } },
    },
    orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(sel.take ?? 500, 1), 2000),
  });
  return imports.map((imp, i) => {
    const vigencia = imp.tipo === 'ACTIVO_FIJO' || esCentinela(imp.expirationDate);
    return {
      temporaryImportId: imp.id,
      pedimento: imp.pedimento,
      pedimentoPartidaId: imp.pedimentoPartidaId,
      entryDate: imp.entryDate.toISOString(),
      expirationDate: vigencia ? null : imp.expirationDate.toISOString(),
      quantity: imp.quantity,
      quantityDischarged: imp.quantityDischarged,
      disponible: r6(imp.quantity - imp.quantityDischarged),
      ordenPeps: i + 1,
      ubicacion: imp.ubicacion,
    };
  });
}
