/**
 * BOM service: descargo automático de componentes al registrar un ensamble,
 * FIFO sobre TemporaryImport, y reverse-trace de qué imports se consumieron.
 */

import { prisma } from '../lib/prisma';

export interface RecordAssemblyInput {
  tenantId: string;
  productId: string;        // Producto terminado a ensamblar
  quantity: number;         // Unidades a ensamblar
  assemblyDate?: Date;
  reference?: string;
  notes?: string;
  isDemoData?: boolean;
}

export interface RecordAssemblyResult {
  assemblyId: string;
  consumptions: {
    componentCode: string;
    fractionCode: string | null;
    quantityWithScrap: number;
    unit: string;
    importsConsumed: { importId: string; pedimento: string; deducted: number }[];
    shortage: number;       // Si > 0, no había suficiente saldo
  }[];
}

/**
 * Registra un ensamble y descuenta los componentes del inventario IMMEX.
 *
 * Reglas:
 *  - Por cada componente del BOM: required = quantity * BOM.quantity
 *  - withScrap = required × (1 + scrapPercent/100)
 *  - Si componente tiene fractionCode: descontar de TemporaryImport del mismo
 *    tenant + fracción, en orden FIFO (entryDate ASC), saldos vivos.
 *  - Si no hay saldo suficiente: registrar shortage (no bloquea el ensamble
 *    en demo; en producción se podría hacer transaccional con rollback).
 */
export async function recordAssembly(input: RecordAssemblyInput): Promise<RecordAssemblyResult> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: input.tenantId },
    include: { components: { include: { component: true } } },
  });
  if (!product) throw new Error('Producto no encontrado');
  if (!product.isFinished) throw new Error('Solo se pueden ensamblar productos terminados');
  if (product.components.length === 0) throw new Error('El producto no tiene BOM definido');

  const assemblyDate = input.assemblyDate ?? new Date();

  return prisma.$transaction(async (tx) => {
    const assembly = await tx.assembly.create({
      data: {
        tenantId: input.tenantId,
        productId: product.id,
        quantity: input.quantity,
        assemblyDate,
        reference: input.reference,
        notes: input.notes,
        isDemoData: input.isDemoData ?? false,
      },
    });

    const consumptions: RecordAssemblyResult['consumptions'] = [];

    for (const bomLine of product.components) {
      const required = bomLine.quantity * input.quantity;
      const withScrap = required * (1 + bomLine.scrapPercent / 100);

      const importIds: string[] = [];
      const importsConsumed: { importId: string; pedimento: string; deducted: number }[] = [];
      let remaining = withScrap;
      const componentFraction = bomLine.component.fractionCode;

      // Descontar FIFO solo si el componente tiene fracción asignada
      if (componentFraction) {
        const liveImports = await tx.temporaryImport.findMany({
          where: {
            tenantId: input.tenantId,
            fractionCode: componentFraction,
            status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] },
          },
          orderBy: { entryDate: 'asc' },
        });

        for (const imp of liveImports) {
          if (remaining <= 0) break;
          const available = imp.quantity - imp.quantityDischarged;
          if (available <= 0) continue;
          const deduct = Math.min(remaining, available);
          const newDischarged = imp.quantityDischarged + deduct;
          const newStatus = newDischarged >= imp.quantity
            ? 'FULLY_DISCHARGED' as const
            : 'PARTIALLY_DISCHARGED' as const;

          await tx.temporaryImport.update({
            where: { id: imp.id },
            data: { quantityDischarged: newDischarged, status: newStatus },
          });

          importIds.push(imp.id);
          importsConsumed.push({ importId: imp.id, pedimento: imp.pedimento, deducted: deduct });
          remaining -= deduct;
        }
      }

      await tx.assemblyConsumption.create({
        data: {
          assemblyId: assembly.id,
          componentId: bomLine.componentId,
          componentCode: bomLine.component.productCode,
          fractionCode: componentFraction,
          quantityRequired: required,
          quantityWithScrap: withScrap,
          unit: bomLine.unit,
          importIds,
        },
      });

      consumptions.push({
        componentCode: bomLine.component.productCode,
        fractionCode: componentFraction,
        quantityWithScrap: withScrap,
        unit: bomLine.unit,
        importsConsumed,
        shortage: Math.max(0, remaining),
      });
    }

    return { assemblyId: assembly.id, consumptions };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Trazabilidad: qué se hizo con esta importación temporal
// ──────────────────────────────────────────────────────────────────────────

export interface ImportTraceability {
  importId: string;
  pedimento: string;
  fractionCode: string;
  description: string;
  quantityImported: number;
  quantityDischarged: number;
  balance: number;
  unit: string;
  consumedInAssemblies: {
    assemblyId: string;
    productCode: string;
    productDescription: string;
    quantityProduced: number;
    assemblyDate: string;
    componentDeducted: number;
  }[];
  totalConsumedInProduction: number;
}

export async function traceImport(tenantId: string, importId: string): Promise<ImportTraceability | null> {
  const imp = await prisma.temporaryImport.findFirst({
    where: { id: importId, tenantId },
  });
  if (!imp) return null;

  // Buscar todas las consumptions cuyo importIds[] contiene este id
  const consumptions = await prisma.assemblyConsumption.findMany({
    where: {
      importIds: { has: importId },
      assembly: { tenantId },
    },
    include: {
      assembly: { include: { product: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Para cada consumption resolver cuánto se descontó específicamente
  // de ESTA importación. Como importIds es un array de strings sin desglose,
  // usamos una distribución proporcional como aproximación.
  // Nota: con N> consumos diferenciados por import, mejor cambiar a JSON detallado.
  const consumed: ImportTraceability['consumedInAssemblies'] = [];
  let totalConsumed = 0;

  for (const c of consumptions) {
    // Si solo hay 1 import, el descuento entero fue contra él. Si hay varios,
    // estimamos partes iguales (aproximación para demo).
    const share = c.quantityWithScrap / Math.max(1, c.importIds.length);
    consumed.push({
      assemblyId: c.assemblyId,
      productCode: c.assembly.product.productCode,
      productDescription: c.assembly.product.description,
      quantityProduced: c.assembly.quantity,
      assemblyDate: c.assembly.assemblyDate.toISOString(),
      componentDeducted: share,
    });
    totalConsumed += share;
  }

  return {
    importId: imp.id,
    pedimento: imp.pedimento,
    fractionCode: imp.fractionCode,
    description: imp.description,
    quantityImported: imp.quantity,
    quantityDischarged: imp.quantityDischarged,
    balance: imp.quantity - imp.quantityDischarged,
    unit: imp.unit,
    consumedInAssemblies: consumed,
    totalConsumedInProduction: totalConsumed,
  };
}
