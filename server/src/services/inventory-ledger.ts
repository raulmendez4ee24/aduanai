import type { DischargeType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';

const EPSILON = 1e-9;
const OPEN_IMPORT_STATUSES = new Set(['ACTIVE', 'PARTIALLY_DISCHARGED']);
const TERMINAL_IMPORT_STATUSES = new Set(['EXPIRED', 'REGULARIZED']);

export interface CreateDischargeInput {
  temporaryImportId: string;
  tenantId: string;
  userId: string;
  type: DischargeType;
  pedimento?: string | null;
  quantity: number;
  unit: string;
  customsValue?: number | null;
  dischargeDate: Date;
  destinationCountry?: string | null;
  buyerName?: string | null;
  taxesPaid?: number | null;
  notes?: string | null;
}

/**
 * Locks one inventory balance row for the lifetime of the interactive transaction.
 * Every live writer of quantityDischarged must use this lock protocol.
 */
export async function lockTemporaryImport(
  tx: Prisma.TransactionClient,
  temporaryImportId: string,
  tenantId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM temporary_imports
    WHERE id = ${temporaryImportId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new AppError('Importación temporal no encontrada', 404);
}

function sameUnit(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase('es-MX') === right.trim().toLocaleLowerCase('es-MX');
}

function openStatus(quantityDischarged: number, quantity: number): 'ACTIVE' | 'PARTIALLY_DISCHARGED' | 'FULLY_DISCHARGED' {
  if (quantityDischarged <= EPSILON) return 'ACTIVE';
  if (quantity - quantityDischarged <= EPSILON) return 'FULLY_DISCHARGED';
  return 'PARTIALLY_DISCHARGED';
}

export async function createDischargeAtomic(input: CreateDischargeInput) {
  return prisma.$transaction(async (tx) => {
    await lockTemporaryImport(tx, input.temporaryImportId, input.tenantId);
    const imp = await tx.temporaryImport.findUnique({ where: { id: input.temporaryImportId } });
    if (!imp) throw new AppError('Importación temporal no encontrada', 404);

    if (!OPEN_IMPORT_STATUSES.has(imp.status)) {
      throw new AppError(`La importación no admite descargos en estado ${imp.status}`, 409);
    }
    if (!sameUnit(input.unit, imp.unit)) {
      throw new AppError(`Unidad del descargo (${input.unit}) no coincide con la importación (${imp.unit})`, 400);
    }

    const nextDischarged = imp.quantityDischarged + input.quantity;
    if (nextDischarged - imp.quantity > EPSILON) {
      const available = Math.max(0, imp.quantity - imp.quantityDischarged);
      throw new AppError(`Cantidad excede disponible. Disponible: ${available} ${imp.unit}`, 409);
    }
    const normalizedDischarged = imp.quantity - nextDischarged <= EPSILON ? imp.quantity : nextDischarged;

    const discharge = await tx.discharge.create({
      data: {
        type: input.type,
        pedimento: input.pedimento,
        quantity: input.quantity,
        unit: imp.unit,
        customsValue: input.customsValue,
        dischargeDate: input.dischargeDate,
        destinationCountry: input.destinationCountry,
        buyerName: input.buyerName,
        taxesPaid: input.taxesPaid,
        notes: input.notes,
        temporaryImportId: imp.id,
        tenantId: input.tenantId,
        userId: input.userId,
      },
    });

    await tx.temporaryImport.update({
      where: { id: imp.id },
      data: {
        quantityDischarged: normalizedDischarged,
        status: openStatus(normalizedDischarged, imp.quantity),
      },
    });
    return discharge;
  }, { maxWait: 5_000, timeout: 15_000 });
}

export async function deleteDischargeAtomic(dischargeId: string, tenantId: string) {
  return prisma.$transaction(async (tx) => {
    // Preliminary lookup obtains the parent id. It is deliberately re-read after
    // locking the parent, so a concurrent delete cannot reuse stale data.
    const probe = await tx.discharge.findFirst({
      where: { id: dischargeId, tenantId },
      select: { temporaryImportId: true },
    });
    if (!probe) throw new AppError('Descargo no encontrado', 404);

    await lockTemporaryImport(tx, probe.temporaryImportId, tenantId);
    const discharge = await tx.discharge.findFirst({ where: { id: dischargeId, tenantId } });
    if (!discharge) throw new AppError('Descargo no encontrado', 404);
    const imp = await tx.temporaryImport.findUnique({ where: { id: discharge.temporaryImportId } });
    if (!imp) throw new AppError('Importación temporal no encontrada', 404);

    if (discharge.quantity - imp.quantityDischarged > EPSILON) {
      throw new AppError('El saldo acumulado es menor al descargo; se requiere conciliación antes de eliminar', 409);
    }
    const rawNext = imp.quantityDischarged - discharge.quantity;
    const nextDischarged = Math.abs(rawNext) <= EPSILON ? 0 : rawNext;

    await tx.discharge.delete({ where: { id: discharge.id } });
    await tx.temporaryImport.update({
      where: { id: imp.id },
      data: {
        quantityDischarged: nextDischarged,
        // Never revive legal terminal states while correcting their ledger.
        status: TERMINAL_IMPORT_STATUSES.has(imp.status)
          ? imp.status
          : openStatus(nextDischarged, imp.quantity),
      },
    });
    return discharge;
  }, { maxWait: 5_000, timeout: 15_000 });
}
