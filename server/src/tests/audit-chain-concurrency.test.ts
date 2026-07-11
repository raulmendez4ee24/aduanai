/**
 * PostgreSQL integration test for concurrent AuditLog chain appends.
 *
 * This test MUTATES one isolated tenant and removes it in finally. It refuses
 * to run unless explicitly enabled on a test database:
 *   ALLOW_AUDIT_CHAIN_INTEGRATION_TEST=test DATABASE_URL=postgresql://.../aduanai_test \
 *     node --import tsx src/tests/audit-chain-concurrency.test.ts
 * An isolated production verification is only available manually from the
 * deployed Railway service with
 * ALLOW_AUDIT_CHAIN_INTEGRATION_TEST=isolated-production.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { recordAudit, verifyChain } from '../services/audit-service';

function assertSafeTestDatabase(): void {
  const raw = process.env.DATABASE_URL;
  let database = '';
  try { database = raw ? new URL(raw).pathname.slice(1) : ''; } catch { /* handled below */ }
  const mode = process.env.ALLOW_AUDIT_CHAIN_INTEGRATION_TEST;
  const testDatabase = mode === 'test' && /test/i.test(database);
  const isolatedRailwayProduction = mode === 'isolated-production'
    && process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
    && process.env.RAILWAY_SERVICE_NAME === 'kanaduana';
  if (!testDatabase && !isolatedRailwayProduction) {
    throw new Error('REFUSED: use mode=test on a test DB, or isolated-production inside kanaduana/production');
  }
}

async function main(): Promise<void> {
  assertSafeTestDatabase();
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const eventCount = 32;
  let tenantId: string | undefined;

  try {
    const tenant = await prisma.tenant.create({
      data: { name: `__audit_chain_concurrency_test__ ${nonce}` },
    });
    tenantId = tenant.id;

    const results = await Promise.all(
      Array.from({ length: eventCount }, (_, index) => recordAudit({
        tenantId: tenant.id,
        action: 'AUDIT_CHAIN_CONCURRENCY_TEST',
        entity: 'AuditChainTest',
        entityId: `${nonce}-${index}`,
        method: 'TEST',
        endpoint: '/test/audit-chain-concurrency',
        metadata: { index, nonce },
      })),
    );
    assert.equal(results.filter(Boolean).length, eventCount, 'ningún append concurrente debe perderse');

    const logs = await prisma.auditLog.findMany({
      where: { tenantId: tenant.id, hash: { not: '' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    assert.equal(logs.length, eventCount);
    assert.equal(logs[0]?.prevHash, null, 'debe existir una sola génesis');

    const hashes = new Set<string>();
    const parentUse = new Map<string, number>();
    for (let index = 0; index < logs.length; index++) {
      const current = logs[index]!;
      assert.ok(!hashes.has(current.hash), `hash duplicado en posición ${index}`);
      hashes.add(current.hash);

      if (index > 0) {
        const previous = logs[index - 1]!;
        assert.equal(current.prevHash, previous.hash, `enlace roto en posición ${index}`);
        assert.ok(
          current.createdAt.getTime() > previous.createdAt.getTime(),
          `timestamp no monotónico en posición ${index}`,
        );
      }
      if (current.prevHash) {
        parentUse.set(current.prevHash, (parentUse.get(current.prevHash) ?? 0) + 1);
      }
    }
    assert.ok([...parentUse.values()].every(count => count === 1), 'ningún padre debe tener más de un hijo');

    const verification = await verifyChain(tenant.id);
    assert.deepEqual(verification, { valid: true, checkedCount: eventCount });

    console.log('audit chain concurrency: 1 passed, 0 failed');
  } finally {
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  }
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
