/**
 * Tests de configuración y timeout del pool PostgreSQL.
 *
 * Ejecutar:  npm run test:pool
 */

import { strict as assert } from 'node:assert';
import { Pool } from 'pg';
import { buildPoolConfig } from '../lib/prisma';

async function main(): Promise<void> {
  const defaults = buildPoolConfig({});
  assert.deepEqual(defaults, {
    connectionString: 'postgresql://aduanai:aduanai123@localhost:5433/aduanai',
    max: 10,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 60000,
    statement_timeout: 30000,
    query_timeout: 35000,
    keepAlive: true,
  });
  console.log('  ✓ buildPoolConfig usa los defaults exactos');

  const overrides = buildPoolConfig({
    DATABASE_URL: 'postgresql://test:test@db.example.test:5432/testdb',
    PG_POOL_MAX: '21',
    PG_CONNECT_TIMEOUT_MS: '1234',
    PG_IDLE_TIMEOUT_MS: '56789',
    PG_STATEMENT_TIMEOUT_MS: '23456',
    PG_QUERY_TIMEOUT_MS: '34567',
  });
  assert.deepEqual(overrides, {
    connectionString: 'postgresql://test:test@db.example.test:5432/testdb',
    max: 21,
    connectionTimeoutMillis: 1234,
    idleTimeoutMillis: 56789,
    statement_timeout: 23456,
    query_timeout: 34567,
    keepAlive: true,
  });
  console.log('  ✓ buildPoolConfig respeta los overrides');

  const pool = new Pool({
    host: '10.255.255.1',
    port: 5432,
    user: 'test',
    password: 'test',
    database: 'test',
    max: 1,
    connectionTimeoutMillis: 3000,
  });
  const startedAt = Date.now();
  let rejected = false;

  try {
    await pool.query('SELECT 1');
  } catch {
    rejected = true;
  } finally {
    await pool.end();
  }

  const elapsedMs = Date.now() - startedAt;
  assert.equal(rejected, true, 'La consulta a la DB pausada debía rechazar');
  assert.ok(elapsedMs < 10_000, `La consulta tardó ${elapsedMs} ms; debía rechazar en menos de 10000 ms`);
  console.log(`  ✓ DB pausada sintética rechazó en ${elapsedMs} ms (< 10000 ms)`);

  console.log(`\nResumen: 3/3 pruebas pasaron. Timeout medido: ${elapsedMs} ms.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
