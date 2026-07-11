/**
 * PostgreSQL integration test for concurrent inventory/fiscal ledger writes.
 *
 * This test MUTATES isolated fixtures and removes them in finally. It refuses
 * to run unless explicitly enabled on a test database:
 *   ALLOW_LEDGER_INTEGRATION_TEST=test DATABASE_URL=postgresql://.../aduanai_test \
 *     node --import tsx src/tests/ledger-concurrency.test.ts
 * An isolated production verification is only available manually from the
 * deployed Railway service with ALLOW_LEDGER_INTEGRATION_TEST=isolated-production.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { createDischargeAtomic, deleteDischargeAtomic } from '../services/inventory-ledger';
import { applyTaxCreditAtomic } from '../services/fiscal-ledger';

function assertSafeTestDatabase(): void {
  const raw = process.env.DATABASE_URL;
  let database = '';
  try { database = raw ? new URL(raw).pathname.slice(1) : ''; } catch { /* handled below */ }
  const mode = process.env.ALLOW_LEDGER_INTEGRATION_TEST;
  const testDatabase = mode === 'test' && /test/i.test(database);
  const isolatedRailwayProduction = mode === 'isolated-production'
    && process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
    && process.env.RAILWAY_SERVICE_NAME === 'kanaduana';
  if (!testDatabase && !isolatedRailwayProduction) {
    throw new Error('REFUSED: use mode=test on a test DB, or isolated-production inside kanaduana/production');
  }
}

type Captured<T> = { ok: true; value: T } | { ok: false; error: unknown };
function capture<T>(promise: Promise<T>): Promise<Captured<T>> {
  return promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  );
}

function assertOneConflict(results: Captured<unknown>[]): void {
  assert.equal(results.filter(result => result.ok).length, 1);
  const rejected = results.find(result => !result.ok);
  assert.ok(rejected && rejected.error instanceof AppError);
  assert.equal(rejected.error.statusCode, 409);
}

async function main(): Promise<void> {
  assertSafeTestDatabase();
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tenantId: string | undefined;

  try {
    const tenant = await prisma.tenant.create({ data: { name: `__ledger_concurrency_test__ ${nonce}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        email: `ledger-${nonce}@example.test`,
        password: 'not-a-real-password',
        name: 'Ledger Concurrency Test',
        tenantId: tenant.id,
      },
    });

    const imp = await prisma.temporaryImport.create({
      data: {
        pedimento: '26 00 0000 0000001', fractionCode: '73181599', description: 'Race fixture',
        quantity: 100, unit: 'kg', customsValue: 1000,
        entryDate: new Date('2026-01-01'), expirationDate: new Date('2027-07-01'),
        tenantId: tenant.id, userId: user.id, isDemoData: true,
      },
    });

    const dischargeRace = await Promise.all([
      capture(createDischargeAtomic({
        temporaryImportId: imp.id, tenantId: tenant.id, userId: user.id,
        type: 'RETURN_EXPORT', quantity: 60, unit: 'kg', dischargeDate: new Date('2026-07-10'),
        pedimento: '26 00 0000 0000002',
      })),
      capture(createDischargeAtomic({
        temporaryImportId: imp.id, tenantId: tenant.id, userId: user.id,
        type: 'RETURN_EXPORT', quantity: 60, unit: 'kg', dischargeDate: new Date('2026-07-10'),
        pedimento: '26 00 0000 0000003',
      })),
    ]);
    assertOneConflict(dischargeRace);
    let freshImport = await prisma.temporaryImport.findUniqueOrThrow({ where: { id: imp.id } });
    let discharges = await prisma.discharge.findMany({ where: { temporaryImportId: imp.id } });
    assert.equal(discharges.reduce((sum, row) => sum + row.quantity, 0), 60);
    assert.equal(freshImport.quantityDischarged, 60);
    assert.equal(freshImport.status, 'PARTIALLY_DISCHARGED');

    const second = await createDischargeAtomic({
      temporaryImportId: imp.id, tenantId: tenant.id, userId: user.id,
      type: 'RETURN_EXPORT', quantity: 40, unit: 'kg', dischargeDate: new Date('2026-07-10'),
      pedimento: '26 00 0000 0000004',
    });
    const first = discharges[0]!;
    await Promise.all([
      deleteDischargeAtomic(first.id, tenant.id),
      deleteDischargeAtomic(second.id, tenant.id),
    ]);
    freshImport = await prisma.temporaryImport.findUniqueOrThrow({ where: { id: imp.id } });
    discharges = await prisma.discharge.findMany({ where: { temporaryImportId: imp.id } });
    assert.equal(discharges.length, 0);
    assert.equal(freshImport.quantityDischarged, 0);
    assert.equal(freshImport.status, 'ACTIVE');

    const credit = await prisma.taxCredit.create({
      data: {
        pedimento: '26 00 0000 0000005', fractionCode: '73181599',
        ivaAmount: 100, iepsAmount: 0, creditDate: new Date('2026-01-01'),
        dischargeDeadline: new Date('2027-01-01'), remaining: 100, tenantId: tenant.id,
        isDemoData: true,
      },
    });
    const fiscalRace = await Promise.all([
      capture(applyTaxCreditAtomic({
        creditId: credit.id, tenantId: tenant.id, pedimentoDescargo: '26 00 0000 0000006',
        ivaApplied: 60, iepsApplied: 0, usageDate: new Date('2026-07-10'),
      })),
      capture(applyTaxCreditAtomic({
        creditId: credit.id, tenantId: tenant.id, pedimentoDescargo: '26 00 0000 0000007',
        ivaApplied: 60, iepsApplied: 0, usageDate: new Date('2026-07-10'),
      })),
    ]);
    assertOneConflict(fiscalRace);
    const [freshCredit, usages] = await Promise.all([
      prisma.taxCredit.findUniqueOrThrow({ where: { id: credit.id } }),
      prisma.creditUsage.findMany({ where: { creditId: credit.id } }),
    ]);
    assert.equal(usages.reduce((sum, row) => sum + row.ivaApplied + row.iepsApplied, 0), 60);
    assert.equal(freshCredit.discharged, 60);
    assert.equal(freshCredit.remaining, 40);
    assert.equal(freshCredit.status, 'PARTIALLY_USED');

    console.log('ledger concurrency: 3 passed, 0 failed');
  } finally {
    if (tenantId) {
      await prisma.creditUsage.deleteMany({ where: { tenantId } });
      await prisma.taxCredit.deleteMany({ where: { tenantId } });
      await prisma.discharge.deleteMany({ where: { tenantId } });
      await prisma.temporaryImport.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  }
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
