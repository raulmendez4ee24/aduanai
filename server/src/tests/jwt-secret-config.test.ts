/**
 * Tests del endurecimiento de JWT_SECRET (P1 + P1.1).
 * - JWT_SECRET >= 32 en TODOS los entornos (la fortaleza no depende de NODE_ENV).
 * - NODE_ENV tolerante (staging/preview/qa/desconocido/ausente) sin debilitar.
 * - Sin fallback en ningún archivo de server/src (salvo la config central).
 * - Firma/verificación correctas y sin fugas del secreto en errores.
 *
 * Ejecutar:  npm run test:jwt-config
 */

import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { loadConfig, getJwtSecret, resetConfigCache, normalizarEntorno, JWT_SECRET_MIN_LENGTH } from '../lib/config';

const SECRETO_FUERTE = 'x'.repeat(JWT_SECRET_MIN_LENGTH + 16); // >= 32
const SECRETO_CORTO = 'x'.repeat(16);                          // < 32 (no vacío)

// Los scripts test:* corren desde server/ (npm fija el cwd al paquete).
function leerFuente(rel: string): string {
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}
function listarTs(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules') continue;
    const abs = join(dir, nombre);
    if (statSync(abs).isDirectory()) out.push(...listarTs(abs));
    else if (abs.endsWith('.ts')) out.push(abs);
  }
  return out;
}

async function main(): Promise<void> {
  const src = join(process.cwd(), 'src');

  // ── 1) Matriz NODE_ENV × fortaleza. ≥32 exigido SIEMPRE; nunca se debilita. ──
  const entornos: (string | undefined)[] = [undefined, 'development', 'test', 'production', 'staging', 'preview', 'qa', 'valor-desconocido'];
  for (const NODE_ENV of entornos) {
    const env = (extra: NodeJS.ProcessEnv) => ({ ...(NODE_ENV === undefined ? {} : { NODE_ENV }), ...extra }) as NodeJS.ProcessEnv;
    // secreto ausente → bloqueado
    assert.throws(() => loadConfig(env({})), /JWT_SECRET/, `ausente+sin secreto (${NODE_ENV}) debe bloquear`);
    // secreto corto no vacío → bloqueado
    assert.throws(() => loadConfig(env({ JWT_SECRET: SECRETO_CORTO })), /JWT_SECRET/, `${NODE_ENV}+corto debe bloquear`);
    // secreto fuerte → permitido
    assert.equal(loadConfig(env({ JWT_SECRET: SECRETO_FUERTE })).JWT_SECRET, SECRETO_FUERTE, `${NODE_ENV}+fuerte debe permitir`);
  }

  // ── 2) Normalización de entorno (informativa; no afecta la validación). ──
  assert.equal(normalizarEntorno(undefined), 'development');
  assert.equal(normalizarEntorno('development'), 'development');
  assert.equal(normalizarEntorno('test'), 'test');
  for (const e of ['production', 'staging', 'preview', 'review', 'qa', 'lo-que-sea']) {
    assert.equal(normalizarEntorno(e), 'production_like', `${e} → production_like`);
  }

  // ── 3) getJwtSecret lazy + firma/verificación round-trip. ──
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
    assert.throws(() => jwt.verify(token, 'otro-secreto-distinto-de-32-caracteres!!'), /invalid signature|jwt/i);
    assert.throws(() => jwt.verify(token, 'dev-secret'), /invalid signature|jwt/i); // el viejo fallback no valida

    delete process.env.JWT_SECRET;
    resetConfigCache();
    assert.throws(() => getJwtSecret(), /JWT_SECRET/); // ausente → lanza, jamás default
  } finally {
    if (envJwtPrevio === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = envJwtPrevio;
    if (envNodePrevio === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = envNodePrevio;
    resetConfigCache();
  }

  // ── 4) Prueba de fuga: secreto inválido NO vacío no debe filtrarse en el error. ──
  const secretoSentinela = 'PREFIJO_' + 's'.repeat(9) + '_SUFIJO'; // 24 chars, < 32, distintivo
  try {
    loadConfig({ NODE_ENV: 'production', JWT_SECRET: secretoSentinela } as NodeJS.ProcessEnv);
    assert.fail('debió lanzar por longitud');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert.match(msg, /JWT_SECRET/, 'menciona la variable');
    assert.match(msg, new RegExp(`al menos ${JWT_SECRET_MIN_LENGTH}|${JWT_SECRET_MIN_LENGTH} caracteres`), 'menciona la regla de longitud');
    assert.ok(!msg.includes(secretoSentinela), 'no contiene el valor');
    assert.ok(!msg.includes('PREFIJO_'), 'no contiene el prefijo del valor');
    assert.ok(!msg.includes('_SUFIJO'), 'no contiene el sufijo del valor');
    assert.ok(!msg.includes(String(secretoSentinela.length)), 'no contiene la longitud real del valor');
    assert.ok(!msg.includes('dev-secret'), 'no menciona el fallback');
  }

  // ── 5) Guarda GLOBAL contra fallbacks en TODO server/src. ──
  // Método: se recorre server/src recursivamente; se excluye la config central
  // (única autorizada a leer process.env.JWT_SECRET) y el directorio de tests
  // (que inyecta/menciona el secreto). A cada archivo se le quitan los comentarios
  // de línea `//...` para evitar falsos positivos y se verifica el CÓDIGO restante.
  const archivos = listarTs(src).filter(f => f !== join(src, 'lib', 'config.ts') && !f.includes(`${join('src', 'tests')}`) && !f.includes('/tests/'));
  assert.ok(archivos.length > 20, 'debe escanear el árbol real de server/src');
  for (const f of archivos) {
    const codigo = readFileSync(f, 'utf8').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    const nombre = f.slice(src.length + 1);
    assert.ok(!codigo.includes('dev-secret'), `${nombre}: no debe contener 'dev-secret'`);
    assert.ok(!/process\.env\.JWT_SECRET/.test(codigo), `${nombre}: no debe leer process.env.JWT_SECRET (usa getJwtSecret)`);
    assert.ok(!/JWT_SECRET\s*(\|\||\?\?)/.test(codigo), `${nombre}: no debe tener fallback (|| / ??) de JWT_SECRET`);
    assert.ok(!/\?\s*[^:]*:\s*['"][^'"]*secret[^'"]*['"]/i.test(codigo) || !/JWT_SECRET/.test(codigo), `${nombre}: sin ternario que provea secreto alterno`);
  }

  // ── 6) Guardas de fuente en los archivos de auth + preservación de invariantes. ──
  const authMw = leerFuente('middlewares/auth.ts');
  const authRoutes = leerFuente('routes/auth.ts');
  for (const [nombre, s] of [['middlewares/auth.ts', authMw], ['routes/auth.ts', authRoutes]] as const) {
    assert.ok(s.includes('getJwtSecret'), `${nombre} debe usar getJwtSecret()`);
    assert.ok(!s.includes('dev-secret'), `${nombre} sin 'dev-secret'`);
  }
  assert.ok(authMw.includes('tokenBlacklist'), 'la blacklist de tokens debe permanecer');
  assert.ok(/user\.tenantId !== decoded\.tenantId/.test(authMw), 'la verificación de tenant debe permanecer');

  console.log('OK jwt-secret-config (P1.1): ≥32 global, NODE_ENV tolerante, sin fallback, sin fugas, invariantes intactas.');
}

main().catch(err => { console.error(err); process.exit(1); });
