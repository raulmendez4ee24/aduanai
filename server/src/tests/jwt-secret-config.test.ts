/**
 * Tests del endurecimiento de JWT_SECRET (P1): configuración central fail-fast,
 * sin fallback 'dev-secret', firma/verificación correctas y sin fugas de secreto.
 *
 * Ejecutar:  npm run test:jwt-config
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { loadConfig, getJwtSecret, resetConfigCache } from '../lib/config';

const SECRETO_FUERTE = 'x'.repeat(48); // >= 32, apto para producción

// Los scripts test:* corren desde server/ (npm fija el cwd al paquete).
function leerFuente(rel: string): string {
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}

async function main(): Promise<void> {
  // 1) Sin JWT_SECRET → error en cualquier entorno (NUNCA usa fallback).
  for (const NODE_ENV of ['development', 'test', 'production'] as const) {
    assert.throws(() => loadConfig({ NODE_ENV } as NodeJS.ProcessEnv), /JWT_SECRET/,
      `debe fallar sin JWT_SECRET en ${NODE_ENV}`);
  }

  // 2) Producción con secreto demasiado corto → bloqueado.
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'corto' } as NodeJS.ProcessEnv),
    /al menos 32 caracteres/,
  );

  // 3) Producción con secreto fuerte → permitido.
  assert.equal(loadConfig({ NODE_ENV: 'production', JWT_SECRET: SECRETO_FUERTE } as NodeJS.ProcessEnv).JWT_SECRET, SECRETO_FUERTE);

  // 4) Dev/test con secreto explícito inyectado → permitido (sin fallback silencioso).
  assert.equal(loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'secreto-de-test' } as NodeJS.ProcessEnv).JWT_SECRET, 'secreto-de-test');
  assert.equal(loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'd' } as NodeJS.ProcessEnv).JWT_SECRET, 'd');

  // 5) getJwtSecret lee de process.env (lazy) y hace firma/verificación round-trip.
  const envJwtPrevio = process.env.JWT_SECRET;
  const envNodePrevio = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = SECRETO_FUERTE;
    resetConfigCache();
    assert.equal(getJwtSecret(), SECRETO_FUERTE);

    const token = jwt.sign({ userId: 'u1', tenantId: 't1' }, getJwtSecret(), { expiresIn: '8h' });
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; tenantId: string };
    assert.equal(decoded.userId, 'u1');
    assert.equal(decoded.tenantId, 't1');

    // Secreto incorrecto → rechazado.
    assert.throws(() => jwt.verify(token, 'otro-secreto-distinto'), /invalid signature|jwt/i);
    // El viejo fallback 'dev-secret' NO valida un token firmado con el secreto real.
    assert.throws(() => jwt.verify(token, 'dev-secret'), /invalid signature|jwt/i);

    // 6) Secreto ausente → getJwtSecret lanza, jamás devuelve un default.
    delete process.env.JWT_SECRET;
    resetConfigCache();
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  } finally {
    if (envJwtPrevio === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = envJwtPrevio;
    if (envNodePrevio === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = envNodePrevio;
    resetConfigCache();
  }

  // 7) El mensaje de error no filtra el secreto ni contiene fallbacks.
  try {
    loadConfig({ NODE_ENV: 'production', JWT_SECRET: '' } as NodeJS.ProcessEnv);
    assert.fail('debió lanzar');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert.match(msg, /JWT_SECRET/);
    assert.ok(!msg.includes('dev-secret'), 'el mensaje no debe mencionar el fallback');
  }

  // 8) Guardas de código fuente: no queda NINGÚN fallback 'dev-secret' y se usa
  //    la config central; tenant/blacklist/RBAC permanecen intactos.
  const authMw = leerFuente('middlewares/auth.ts');
  const authRoutes = leerFuente('routes/auth.ts');
  for (const [nombre, src] of [['middlewares/auth.ts', authMw], ['routes/auth.ts', authRoutes]] as const) {
    assert.ok(!src.includes('dev-secret'), `${nombre} no debe contener 'dev-secret'`);
    assert.ok(!/process\.env\.JWT_SECRET\s*\|\|/.test(src), `${nombre} no debe tener fallback de JWT_SECRET`);
    assert.ok(src.includes('getJwtSecret'), `${nombre} debe usar getJwtSecret()`);
  }
  // Aislamiento multi-tenant y revocación siguen presentes en el middleware.
  assert.ok(authMw.includes('tokenBlacklist'), 'la blacklist de tokens debe permanecer');
  assert.ok(/tenantId/.test(authMw), 'la verificación de tenant debe permanecer');

  console.log('OK jwt-secret-config: sin fallback, fail-fast, firma/verificación y sin fugas.');
}

main().catch(err => { console.error(err); process.exit(1); });
