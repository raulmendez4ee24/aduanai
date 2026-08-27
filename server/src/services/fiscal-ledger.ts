import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';

const EPSILON = 1e-9;
const OPEN_CREDIT_STATUSES = new Set(['ACTIVE', 'PARTIALLY_USED']);

export interface ApplyTaxCreditInput {
  creditId: string;
  tenantId: string;
  pedimentoDescargo: string;
  ivaApplied: number;
  iepsApplied: number;
  usageDate: Date;
}

async function lockTaxCredit(
  tx: Prisma.TransactionClient,
  creditId: string,
  tenantId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM tax_credits
    WHERE id = ${creditId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new AppError('Credito no encontrado', 404);
}

export async function applyTaxCreditAtomic(input: ApplyTaxCreditInput) {
  return prisma.$transaction(async (tx) => {
    await lockTaxCredit(tx, input.creditId, input.tenantId);
    const credit = await tx.taxCredit.findFirst({ where: { id: input.creditId, tenantId: input.tenantId } });
    if (!credit) throw new AppError('Credito no encontrado', 404);
    if (!OPEN_CREDIT_STATUSES.has(credit.status)) {
      throw new AppError(`El crédito no admite aplicaciones en estado ${credit.status}`, 409);
    }

    const applyAmount = input.ivaApplied + input.iepsApplied;
    if (applyAmount - credit.remaining > EPSILON) {
      throw new AppError(`Monto excede saldo disponible. Disponible: $${credit.remaining.toLocaleString()} MXN`, 409);
    }

    // The parent lock serializes every usage. Component sums prevent an IEPS
    // application from consuming an IVA-only credit (or vice versa).
    const used = await tx.creditUsage.aggregate({
      where: { creditId: credit.id },
      _sum: { ivaApplied: true, iepsApplied: true },
    });
    const ivaAvailable = credit.ivaAmount - (used._sum.ivaApplied ?? 0);
    const iepsAvailable = credit.iepsAmount - (used._sum.iepsApplied ?? 0);
    if (input.ivaApplied - ivaAvailable > EPSILON) {
      throw new AppError(`IVA aplicado excede saldo IVA disponible. Disponible: $${Math.max(0, ivaAvailable).toLocaleString()} MXN`, 409);
    }
    if (input.iepsApplied - iepsAvailable > EPSILON) {
      throw new AppError(`IEPS aplicado excede saldo IEPS disponible. Disponible: $${Math.max(0, iepsAvailable).toLocaleString()} MXN`, 409);
    }

    const rawRemaining = credit.remaining - applyAmount;
    const nextRemaining = Math.abs(rawRemaining) <= EPSILON ? 0 : rawRemaining;
    const nextDischarged = credit.discharged + applyAmount;
    const usage = await tx.creditUsage.create({
      data: {
        pedimentoDescargo: input.pedimentoDescargo,
        ivaApplied: input.ivaApplied,
        iepsApplied: input.iepsApplied,
        usageDate: input.usageDate,
        creditId: credit.id,
        tenantId: input.tenantId,
      },
    });

    await tx.taxCredit.update({
      where: { id: credit.id },
      data: {
        discharged: nextDischarged,
        remaining: nextRemaining,
        status: nextRemaining <= EPSILON ? 'FULLY_USED' : 'PARTIALLY_USED',
      },
    });
    return usage;
  }, { maxWait: 5_000, timeout: 15_000 });
}
