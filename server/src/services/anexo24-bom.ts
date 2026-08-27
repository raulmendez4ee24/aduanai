/**
 * Retorno desde BOM con mermas (Anexo 24 · Ola 1, 27-ago-2026).
 *
 * Dado un producto terminado que se retorna/transfiere (RT/V1), se explota su
 * BOM (`ProductComponent.quantity` + `scrapPercent`), se calcula el consumo
 * real de cada componente (con merma) y se descarga PEPS cada componente en
 * UNA transacción, registrando `Assembly` + `AssemblyConsumption` y colgando
 * cada `Discharge.assemblyId`. La merma declarada queda documentada en
 * `quantityWithScrap - quantityRequired` y en el reporte de mermas.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { descargarPepsEnTx, tipoDescargoDe, type DescargoPepsResultado } from './anexo24-peps';
import { assertPeriodoAbierto } from './anexo24-cierre';
import { whereAlcance, filaEnAlcance, type AlcanceFiltro } from '../lib/cliente-contexto';

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface LineaBom {
  componentId: string;
  componentCode: string;
  fractionCode: string | null;
  quantity: number;      // por unidad de producto terminado
  scrapPercent: number;  // %
  unit: string;
}

export interface ConsumoCalculado {
  componentId: string;
  componentCode: string;
  fractionCode: string | null;
  unit: string;
  scrapPercent: number;
  quantityRequired: number;
  quantityWithScrap: number;
  merma: number;
}

/** Explosión pura del BOM: consumo neto, con merma y merma absoluta por componente. */
export function calcularConsumoBom(lineas: LineaBom[], cantidadTerminado: number): ConsumoCalculado[] {
  if (!Number.isFinite(cantidadTerminado) || cantidadTerminado <= 0) throw new AppError('La cantidad de producto terminado debe ser mayor a cero', 400);
  return lineas.map(l => {
    if (l.scrapPercent < 0 || l.scrapPercent >= 100) throw new AppError(`scrapPercent inválido (${l.scrapPercent}%) en ${l.componentCode}`, 400);
    const required = r6(l.quantity * cantidadTerminado);
    const withScrap = r6(required * (1 + l.scrapPercent / 100));
    return {
      componentId: l.componentId,
      componentCode: l.componentCode,
      fractionCode: l.fractionCode,
      unit: l.unit,
      scrapPercent: l.scrapPercent,
      quantityRequired: required,
      quantityWithScrap: withScrap,
      merma: r6(withScrap - required),
    };
  });
}

export interface RetornoDesdeBomInput {
  tenantId: string;
  userId: string;
  productId: string;          // producto terminado
  cantidad: number;
  tipo?: string;              // RT (default) | V1
  pedimento?: string | null;  // pedimento RT / V1
  constanciaTransferencia?: string | null;
  fecha: Date;
  referencia?: string | null;
  notas?: string | null;
  clienteId?: string | null;
  /** Alcance del usuario (filtroCliente(req)): el producto y los lotes deben caer en él. */
  alcance?: AlcanceFiltro | null;
}

export interface RetornoDesdeBomResultado {
  assemblyId: string;
  producto: { id: string; productCode: string; description: string };
  cantidad: number;
  consumos: Array<ConsumoCalculado & { descargo: DescargoPepsResultado }>;
  mermas: { totalPorComponente: Array<{ componentCode: string; unit: string; merma: number; scrapPercent: number }>; };
}

export async function retornoDesdeBom(input: RetornoDesdeBomInput): Promise<RetornoDesdeBomResultado> {
  const producto = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: input.tenantId, ...whereAlcance(input.alcance) },
    include: { components: { include: { component: true } } },
  });
  if (!producto) throw new AppError('Producto terminado no encontrado', 404);
  if (!producto.isFinished) throw new AppError('Solo un producto terminado (isFinished) se retorna desde BOM', 400);
  if (producto.components.length === 0) throw new AppError(`El producto ${producto.productCode} no tiene BOM definido`, 400);
  const tipo = input.tipo ?? 'RT';
  tipoDescargoDe(tipo); // valida temprano

  const consumos = calcularConsumoBom(
    producto.components.map(c => ({
      componentId: c.componentId,
      componentCode: c.component.productCode,
      fractionCode: c.component.fractionCode,
      quantity: c.quantity,
      scrapPercent: c.scrapPercent,
      unit: c.unit,
    })),
    input.cantidad,
  );

  return prisma.$transaction(async (tx) => {
    await assertPeriodoAbierto(tx, input.tenantId, input.fecha, 'registrar un retorno desde BOM');

    const assembly = await tx.assembly.create({
      data: {
        tenantId: input.tenantId,
        productId: producto.id,
        quantity: input.cantidad,
        assemblyDate: input.fecha,
        reference: input.referencia ?? input.pedimento ?? null,
        notes: input.notas ?? (input.constanciaTransferencia ? `Constancia ${input.constanciaTransferencia}` : null),
      },
    });

    const resultados: RetornoDesdeBomResultado['consumos'] = [];
    for (const c of consumos) {
      // Descargo PEPS por parte (productId del componente); si el componente
      // no tiene lotes ligados a la parte, se intenta por fracción.
      let descargo: DescargoPepsResultado;
      const base = {
        tenantId: input.tenantId,
        userId: input.userId,
        cantidad: c.quantityWithScrap,
        tipo,
        pedimentoDescargo: input.pedimento ?? null,
        constanciaTransferencia: input.constanciaTransferencia ?? null,
        fecha: input.fecha,
        clienteId: input.clienteId ?? null,
        assemblyId: assembly.id,
        notes: `Retorno desde BOM ${producto.productCode} × ${input.cantidad}: ${c.componentCode} neto ${c.quantityRequired} + merma ${c.merma} (${c.scrapPercent}%)`,
      };
      const porParte = await tx.temporaryImport.count({ where: { tenantId: input.tenantId, productId: c.componentId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } } });
      if (porParte > 0) {
        descargo = await descargarPepsEnTx(tx, { ...base, productId: c.componentId });
      } else if (c.fractionCode) {
        descargo = await descargarPepsEnTx(tx, { ...base, fractionCode: c.fractionCode });
      } else {
        throw new AppError(`El componente ${c.componentCode} no tiene importaciones temporales ligadas ni fracción para descargar`, 409);
      }

      await tx.assemblyConsumption.create({
        data: {
          assemblyId: assembly.id,
          componentId: c.componentId,
          componentCode: c.componentCode,
          fractionCode: c.fractionCode,
          quantityRequired: c.quantityRequired,
          quantityWithScrap: c.quantityWithScrap,
          unit: c.unit,
          importIds: descargo.descargos.map(d => d.temporaryImportId),
        },
      });
      resultados.push({ ...c, descargo });
    }

    return {
      assemblyId: assembly.id,
      producto: { id: producto.id, productCode: producto.productCode, description: producto.description },
      cantidad: input.cantidad,
      consumos: resultados,
      mermas: {
        totalPorComponente: resultados.map(r => ({ componentCode: r.componentCode, unit: r.unit, merma: r.merma, scrapPercent: r.scrapPercent })),
      },
    } satisfies RetornoDesdeBomResultado;
  }, { maxWait: 5_000, timeout: 30_000 });
}

/** Mermas/desperdicios declarados en un rango (para el reporte Anexo 24). */
export async function mermasEnRango(tenantId: string, inicio: Date, fin: Date, alcance?: AlcanceFiltro | null) {
  const where: Prisma.AssemblyConsumptionWhereInput = {
    assembly: { tenantId, assemblyDate: { gte: inicio, lte: fin } },
  };
  const consumos = await prisma.assemblyConsumption.findMany({
    where,
    include: { assembly: { include: { product: { select: { productCode: true, description: true, clienteId: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return consumos
    .filter(c => filaEnAlcance(alcance, c.assembly.product.clienteId))
    .map(c => ({
      assemblyId: c.assemblyId,
      fecha: c.assembly.assemblyDate.toISOString().slice(0, 10),
      productoTerminado: c.assembly.product.productCode,
      cantidadTerminado: c.assembly.quantity,
      componentCode: c.componentCode,
      fractionCode: c.fractionCode,
      unit: c.unit,
      quantityRequired: c.quantityRequired,
      quantityWithScrap: c.quantityWithScrap,
      merma: r6(c.quantityWithScrap - c.quantityRequired),
      referencia: c.assembly.reference,
    }));
}
