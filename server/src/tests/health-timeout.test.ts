/**
 * Tests del timeout y recuperación del health check de la DB.
 *
 * Ejecutar:  npm run test:health
 */

import { strict as assert } from 'node:assert';
import {
  buildHealthResponse,
  DEFAULT_HEALTH_DB_TIMEOUT_MS,
  getHealthDBTimeoutMs,
} from '../routes/health';

async function main(): Promise<void> {
  const totalStartedAt = Date.now();

  assert.equal(getHealthDBTimeoutMs({}), DEFAULT_HEALTH_DB_TIMEOUT_MS);

  const healthyStartedAt = Date.now();
  const healthy = await buildHealthResponse(async () => 1);
  const healthyElapsedMs = Date.now() - healthyStartedAt;
  assert.equal(healthy.httpStatus, 200);
  assert.equal(healthy.payload.status, 'ok');
  assert.equal(healthy.payload.degradedSince, null);
  assert.equal(healthy.payload.checks.database.ok, true);
  console.log(`  ✓ DB rápida: HTTP 200, status ok en ${healthyElapsedMs} ms`);

  const timeoutStartedAt = Date.now();
  const degraded = await buildHealthResponse(
    () => new Promise<never>(() => undefined),
    DEFAULT_HEALTH_DB_TIMEOUT_MS,
  );
  const timeoutElapsedMs = Date.now() - timeoutStartedAt;
  assert.ok(timeoutElapsedMs < 3000, `El health tardó ${timeoutElapsedMs} ms; debía responder en menos de 3000 ms`);
  assert.equal(degraded.httpStatus, 200);
  assert.equal(degraded.payload.status, 'degraded');
  assert.equal(degraded.payload.checks.database.ok, false);
  assert.match(degraded.payload.checks.database.error ?? '', /timeout/i);
  assert.ok(degraded.payload.degradedSince, 'degradedSince debía tener un timestamp');
  assert.equal(
    new Date(degraded.payload.degradedSince).toISOString(),
    degraded.payload.degradedSince,
    'degradedSince debía ser un timestamp ISO válido',
  );
  console.log(`  ✓ DB colgada: HTTP 200, status degraded por timeout en ${timeoutElapsedMs} ms (< 3000 ms)`);

  const recoveredStartedAt = Date.now();
  const recovered = await buildHealthResponse(async () => 1);
  const recoveredElapsedMs = Date.now() - recoveredStartedAt;
  assert.equal(recovered.httpStatus, 200);
  assert.equal(recovered.payload.status, 'ok');
  assert.equal(recovered.payload.degradedSince, null);
  assert.equal(recovered.payload.checks.database.ok, true);
  console.log(`  ✓ DB recuperada: HTTP 200, status ok y degradedSince null en ${recoveredElapsedMs} ms`);

  const totalElapsedMs = Date.now() - totalStartedAt;
  console.log(`\nResumen: 3/3 pruebas pasaron en ${totalElapsedMs} ms.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
