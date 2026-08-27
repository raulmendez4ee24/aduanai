/**
 * Bloque 3 — consultHash del Copilot acotado por tenant.
 *
 * Antes: `consultHash String @unique` global y hash = f(pregunta|respuesta|
 * docs|modelo). Dos tenants con la misma pregunta canónica (p.ej. la
 * abstención fija) colisionaban en el upsert: la fila del tenant B "refrescaba"
 * la del tenant A, y PATCH /feedback/:hash del tenant B escribía sobre la
 * consulta del A (cross-tenant sin scope).
 *
 * Ahora: hash incluye tenantId, unicidad compuesta (tenantId, consultHash) y
 * feedback scopeado por tenant. Puro (sin DB) + inspección estática.
 *   npm run test:consult-hash
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcularConsultHash } from '../services/copilot';

let pasan = 0, fallan = 0;
function caso(nombre: string, fn: () => void) {
  try { fn(); pasan++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallan++; console.log(`  ✗ ${nombre}\n    ${(e as Error).message}`); }
}
const base = { question: '¿Qué dice el Art. 36-A LA?', answer: 'No tengo fuente.', docIds: ['d2', 'd1'], modelUsed: 'm' };

console.log('Copilot consultHash por tenant');
caso('misma consulta en dos tenants → hashes DISTINTOS', () => {
  assert.notEqual(calcularConsultHash({ ...base, tenantId: 'A' }), calcularConsultHash({ ...base, tenantId: 'B' }));
});
caso('determinista dentro del mismo tenant (orden de docs no importa)', () => {
  const a = calcularConsultHash({ ...base, tenantId: 'A' });
  const b = calcularConsultHash({ ...base, tenantId: 'A', docIds: ['d1', 'd2'] });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});
caso('cambiar respuesta cambia el hash', () => {
  assert.notEqual(calcularConsultHash({ ...base, tenantId: 'A' }), calcularConsultHash({ ...base, tenantId: 'A', answer: 'otra' }));
});

const raiz = join(__dirname, '..', '..');
const schema = readFileSync(join(raiz, 'prisma', 'schema.prisma'), 'utf8');
const copilotConsult = schema.slice(schema.indexOf('model CopilotConsult'), schema.indexOf('@@map("copilot_consults")'));
caso('schema: CopilotConsult sin @unique global en consultHash', () => {
  assert.ok(!/consultHash\s+String\s+@unique/.test(copilotConsult), 'sigue @unique global');
});
caso('schema: CopilotConsult con @@unique([tenantId, consultHash])', () => {
  assert.ok(/@@unique\(\[tenantId,\s*consultHash\]\)/.test(copilotConsult));
});
const ruta = readFileSync(join(raiz, 'src', 'routes', 'copilot.ts'), 'utf8');
caso('ruta feedback: el where lleva tenantId (no solo consultHash)', () => {
  const bloque = ruta.slice(ruta.indexOf("'/feedback/:hash'"));
  const where = bloque.slice(bloque.indexOf('where:'), bloque.indexOf('data:'));
  assert.ok(/tenantId/.test(where), `where sin tenant: ${where.trim().slice(0, 120)}`);
});
const servicio = readFileSync(join(raiz, 'src', 'services', 'copilot.ts'), 'utf8');
caso('servicio: upsert por clave compuesta tenantId_consultHash', () => {
  assert.ok(/tenantId_consultHash/.test(servicio));
});

console.log(`\n${pasan} passed, ${fallan} failed`);
if (fallan > 0) process.exit(1);
