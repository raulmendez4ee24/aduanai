/**
 * Migración runtime una-sola-vez: registros AntidumpingDuty con
 * publishDate/effectiveDate=null pero con un campo `decree` tipo
 * "DOF-YYYY-MM-DD" se reparan extrayendo la fecha del decree.
 *
 * Idempotente: solo toca registros con fecha null.
 */

import { prisma } from '../lib/prisma';

export async function backfillAntidumpingDates(): Promise<{ updated: number; total: number }> {
  const records = await prisma.antidumpingDuty.findMany({
    where: { OR: [{ publishDate: null }, { effectiveDate: null }] },
    select: { id: true, decree: true, publishDate: true, publishDateDOF: true, effectiveDate: true, expiryDate: true },
  });
  let updated = 0;
  for (const r of records) {
    const match = (r.decree ?? '').match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) continue;
    const date = new Date(match[1] + 'T00:00:00Z');
    if (isNaN(date.getTime())) continue;
    // effectiveDate = publishDate + 1 día (estándar DOF)
    const eff = new Date(date.getTime() + 86400000);
    // expiryDate por defecto: 5 años después si no existe (típico de
    // resoluciones definitivas antidumping en México).
    const exp = new Date(date.getTime() + 5 * 365 * 86400000);
    await prisma.antidumpingDuty.update({
      where: { id: r.id },
      data: {
        publishDate: r.publishDate ?? date,
        publishDateDOF: r.publishDateDOF ?? date,
        effectiveDate: r.effectiveDate ?? eff,
        expiryDate: r.expiryDate ?? exp,
      },
    });
    updated++;
  }
  return { updated, total: records.length };
}
