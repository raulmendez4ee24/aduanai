/**
 * Tests del cache defensivo para consultas de IPs bloqueadas.
 *
 * Ejecutar: npm run test:ipblock
 */

import { strict as assert } from 'node:assert';
import {
  buildIPBlockCacheConfig,
  createIPBlockChecker,
} from '../lib/ipBlockCache';

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const defaults = buildIPBlockCacheConfig({});
  assert.deepEqual(defaults, {
    cacheTtlMs: 45_000,
    dbTimeoutMs: 800,
    maxEntries: 10_000,
  });
  assert.deepEqual(buildIPBlockCacheConfig({
    IPBLOCK_CACHE_TTL_MS: '1234',
    IPBLOCK_DB_TIMEOUT_MS: '321',
  }), {
    cacheTtlMs: 1234,
    dbTimeoutMs: 321,
    maxEntries: 10_000,
  });
  console.log('  ✓ configuración pura usa defaults y overrides de env');

  let cachedCalls = 0;
  const cachedChecker = createIPBlockChecker(async () => {
    cachedCalls += 1;
    return false;
  }, { cacheTtlMs: 100, dbTimeoutMs: 50 }, () => undefined);
  assert.equal(await cachedChecker.isBlocked('198.51.100.1'), false);
  assert.equal(await cachedChecker.isBlocked('198.51.100.1'), false);
  assert.equal(cachedCalls, 1);
  console.log('  ✓ segundo lookup dentro del TTL reutilizó cache (1 consulta)');

  let expiringCalls = 0;
  const expiringChecker = createIPBlockChecker(async () => {
    expiringCalls += 1;
    return false;
  }, { cacheTtlMs: 25, dbTimeoutMs: 50 }, () => undefined);
  assert.equal(await expiringChecker.isBlocked('198.51.100.2'), false);
  await wait(40);
  assert.equal(await expiringChecker.isBlocked('198.51.100.2'), false);
  assert.equal(expiringCalls, 2);
  console.log('  ✓ al expirar el TTL volvió a consultar (2 consultas)');

  let hangingCalls = 0;
  let warnings = 0;
  const hangingChecker = createIPBlockChecker(async () => {
    hangingCalls += 1;
    return new Promise<boolean>(() => undefined);
  }, { cacheTtlMs: 1_000, dbTimeoutMs: 60 }, () => {
    warnings += 1;
  });
  const timeoutStartedAt = Date.now();
  assert.equal(await hangingChecker.isBlocked('198.51.100.3'), false);
  const timeoutElapsedMs = Date.now() - timeoutStartedAt;
  assert.ok(timeoutElapsedMs < 1_000, `El fail-open tardó ${timeoutElapsedMs}ms; debía ser <1000ms`);
  assert.equal(await hangingChecker.isBlocked('198.51.100.3'), false);
  assert.equal(hangingCalls, 1, 'El resultado fail-open debía quedar cacheado');
  assert.equal(await hangingChecker.isBlocked('198.51.100.4'), false);
  assert.equal(hangingCalls, 2, 'Otra IP debía ejecutar su propio lookup');
  assert.equal(warnings, 1, 'El warning debía emitirse una sola vez en la ventana');
  console.log(`  ✓ lookup colgado hizo fail-open en ${timeoutElapsedMs} ms y quedó cacheado`);

  const blockedChecker = createIPBlockChecker(
    async ip => ip === '203.0.113.9',
    { cacheTtlMs: 100, dbTimeoutMs: 50 },
    () => undefined,
  );
  assert.equal(await blockedChecker.isBlocked('203.0.113.9'), true);
  assert.equal(await blockedChecker.isBlocked('203.0.113.10'), false);
  console.log('  ✓ una IP marcada bloqueada devuelve true (camino que el guard convierte en 403)');

  let storedBlocked = false;
  let invalidationCalls = 0;
  const invalidationChecker = createIPBlockChecker(async () => {
    invalidationCalls += 1;
    return storedBlocked;
  }, { cacheTtlMs: 1_000, dbTimeoutMs: 50 }, () => undefined);
  const invalidatedIP = '192.0.2.44';
  assert.equal(await invalidationChecker.isBlocked(invalidatedIP), false);
  storedBlocked = true;
  invalidationChecker.invalidate(invalidatedIP); // Equivale al upsert de blockIP.
  assert.equal(await invalidationChecker.isBlocked(invalidatedIP), true);
  storedBlocked = false;
  invalidationChecker.invalidate(invalidatedIP); // Equivale al update de unblockIP.
  assert.equal(await invalidationChecker.isBlocked(invalidatedIP), false);
  assert.equal(invalidationCalls, 3);
  console.log('  ✓ invalidar al bloquear y desbloquear fuerza un lookup nuevo');

  const evictionCalls = new Map<string, number>();
  const evictionChecker = createIPBlockChecker(async ip => {
    evictionCalls.set(ip, (evictionCalls.get(ip) ?? 0) + 1);
    return false;
  }, { cacheTtlMs: 1_000, dbTimeoutMs: 50, maxEntries: 2 }, () => undefined);
  await evictionChecker.isBlocked('192.0.2.1');
  await evictionChecker.isBlocked('192.0.2.2');
  await evictionChecker.isBlocked('192.0.2.3');
  await evictionChecker.isBlocked('192.0.2.1');
  assert.equal(evictionCalls.get('192.0.2.1'), 2, 'Debía evictar la entrada más vieja');
  assert.equal(evictionCalls.get('192.0.2.2'), 1);
  assert.equal(evictionCalls.get('192.0.2.3'), 1);
  console.log('  ✓ al alcanzar el máximo, el cache evicta la entrada más vieja');

  console.log(`\nResumen: 7/7 pruebas pasaron. Timeout fail-open medido: ${timeoutElapsedMs} ms.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
