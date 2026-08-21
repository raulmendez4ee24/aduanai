// Guard anti-reincidencia D7 (auditoría 21-ago-2026): ninguna fila de
// glosa_risk_rules puede recomendar cambiar de aduana/puerto/patente para
// bajar la probabilidad de Reconocimiento Aduanero — es la conducta exacta
// que el SAT perfila (aduana-shopping), incompatible con un producto de
// cumplimiento.
//
// Uso local:  node prisma/seed/verify-no-aduana-shopping.mjs   (desde server/)
// Uso prod:   railway ssh → node /app/server/prisma/seed/verify-no-aduana-shopping.mjs
//
// Solo LEE. No hace ningún UPDATE — la corrección vive en la migración
// idempotente (prisma/migrations/<timestamp>_no_aduana_shopping_glosa_risk_rules/).
//
// Falla cerrada: exit 1 si CUALQUIER fila (activa o no) matchea el patrón.
// Este mismo script sirve para el censo pre-migración (se espera que falle,
// ahí está el reporte de qué filas tocar) y para el verificador post-deploy
// (debe salir en 0).
//
// Este script es .mjs standalone (corre con `node` solo, sin tsx) y no puede
// importar TS directamente, así que toma el patrón del build ya compilado en
// vez de duplicarlo — fuente única: server/src/lib/aduana-shopping-guard.ts
// (que además es lo que src/tests/no-aduana-shopping.test.ts usa para barrer
// el árbol de código fuente, no solo la DB).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const dotenv = require('dotenv');
const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, '..', '..', '.env') });

const { ADUANA_SHOPPING_PATTERN } = require(path.join(HERE, '..', '..', 'dist', 'lib', 'aduana-shopping-guard.js'));

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const { rows } = await c.query(
  'SELECT "ruleCode", description, recommendation, active FROM glosa_risk_rules ORDER BY "ruleCode"',
);
await c.end();

console.log(`glosa_risk_rules: ${rows.length} filas censadas\n`);

const offenders = [];
for (const r of rows) {
  const hits = [];
  if (ADUANA_SHOPPING_PATTERN.test(r.description)) hits.push('description');
  if (ADUANA_SHOPPING_PATTERN.test(r.recommendation)) hits.push('recommendation');
  if (hits.length) offenders.push({ ...r, hits });
}

if (offenders.length === 0) {
  console.log('✓ 0 filas con lenguaje de aduana/puerto/patente alterna');
} else {
  console.log(`✗ ${offenders.length} fila(s) con lenguaje de aduana/puerto/patente alterna:\n`);
  for (const o of offenders) {
    console.log(`  ${o.ruleCode} (active=${o.active}) — campos: ${o.hits.join(', ')}`);
    for (const field of o.hits) {
      console.log(`    ${field}: "${o[field]}"`);
    }
  }
}

console.log(offenders.length === 0 ? '\nVERIFICADO' : `\nFALLÓ: ${offenders.length} fila(s) con lenguaje prohibido`);
process.exit(offenders.length === 0 ? 0 : 1);
