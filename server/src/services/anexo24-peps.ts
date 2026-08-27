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
import type { DischargeType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { createDischargeInTx, lockTemporaryImport } from './inventory-ledger';
import { assertPeriodoAbierto } from './anexo24-cierre';

const EPSILON = 1e-9;
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
    const toma = Math.min(restante, lote.disponible);
    asignaciones.push({ id: lote.id, pedimento: lote.pedimento, cantidad: toma, entryDate: lote.entryDate });
    restante -= toma;
  }
  const disponibleTotal = orden.reduce((s, l) => s + l.disponible, 0);
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
  input: Pick<DescargarPepsInput, 'tenantId' | 'productId' | 'fractionCode' | 'clienteId'>,
) {
  if (!input.productId && !input.fractionCode) throw new AppError('Indique productId (parte) o fractionCode', 400);
  const where: Prisma.TemporaryImportWhereInput = {
    tenantId: input.tenantId,
    status: { in: [...ABIERTAS] },
    tipo: 'INSUMO',
    ...(input.productId ? { productId: input.productId } : { fractionCode: input.fractionCode! }),
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
  };
  const candidatos = await tx.temporaryImport.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } });
  // Mismo protocolo de lock que el ledger y bom-service: orden global por id.
  for (const c of candidatos) await lockTemporaryImport(tx, c.id, input.tenantId);
  return tx.temporaryImport.findMany({
    where: { id: { in: candidatos.map(c => c.id) }, tenantId: input.tenantId },
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

// ── Saldos por parte con sus lotes (vista PEPS) ───────────────────────────

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
  lotes: Array<{
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
  }>;
}

export async function saldosPorParte(tenantId: string, opts: { clienteId?: string | null; tipo?: 'INSUMO' | 'ACTIVO_FIJO' } = {}): Promise<ParteConLotes[]> {
  const imports = await prisma.temporaryImport.findMany({
    where: {
      tenantId,
      status: { in: [...ABIERTAS] },
      ...(opts.tipo ? { tipo: opts.tipo } : {}),
      ...(opts.clienteId ? { clienteId: opts.clienteId } : {}),
    },
    include: { product: { select: { id: true, productCode: true, description: true } }, ubicacion: { select: { id: true, nombre: true, tipo: true } } },
    orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
  });
  const mapa = new Map<string, ParteConLotes>();
  for (const imp of imports) {
    const clave = `${imp.tipo}:${imp.product ? `P:${imp.product.id}` : `F:${imp.fractionCode}`}`;
    const p = mapa.get(clave) ?? {
      parteId: imp.product?.id ?? null,
      parteCodigo: imp.product?.productCode ?? null,
      fractionCode: imp.fractionCode,
      descripcion: imp.product?.description ?? imp.description,
      unit: imp.unit,
      tipo: imp.tipo,
      importado: 0, descargado: 0, saldo: 0,
      proximoVencimiento: null,
      lotes: [],
    };
    const disponible = imp.quantity - imp.quantityDischarged;
    const vigencia = imp.tipo === 'ACTIVO_FIJO' || imp.expirationDate.getUTCFullYear() >= 9999;
    p.importado += imp.quantity;
    p.descargado += imp.quantityDischarged;
    p.saldo += disponible;
    if (!vigencia && (!p.proximoVencimiento || imp.expirationDate.toISOString() < p.proximoVencimiento)) {
      p.proximoVencimiento = imp.expirationDate.toISOString();
    }
    p.lotes.push({
      temporaryImportId: imp.id,
      pedimento: imp.pedimento,
      pedimentoPartidaId: imp.pedimentoPartidaId,
      entryDate: imp.entryDate.toISOString(),
      expirationDate: vigencia ? null : imp.expirationDate.toISOString(),
      quantity: imp.quantity,
      quantityDischarged: imp.quantityDischarged,
      disponible,
      ordenPeps: p.lotes.length + 1,
      ubicacion: imp.ubicacion,
    });
    mapa.set(clave, p);
  }
  return Array.from(mapa.values()).sort((a, b) => {
    if (a.proximoVencimiento && b.proximoVencimiento) return a.proximoVencimiento.localeCompare(b.proximoVencimiento);
    if (a.proximoVencimiento) return -1;
    if (b.proximoVencimiento) return 1;
    return (a.parteCodigo ?? a.fractionCode).localeCompare(b.parteCodigo ?? b.fractionCode);
  });
}
