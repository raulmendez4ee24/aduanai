/**
 * Bloque 3 — ClassificationKnowledge sin contaminación entre tenants.
 *
 * Antes: el feedback "incorrecta" creaba filas GLOBALES no verificadas
 * (verified=false, sin tenant) y el retrieval del clasificador las consumía
 * para TODOS los tenants por la rama `chapterCode IN probables` (que no
 * exigía verified). Un usuario podía sesgar el clasificador de otros.
 *
 * Ahora: las filas de feedback llevan tenantId y el retrieval solo consume
 * (a) conocimiento verificado por staff o (b) filas del MISMO tenant.
 * Puro (sin DB) + inspección estática.
 *   npm run test:knowledge-tenant
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { construirFiltroConocimiento } from '../services/classifier';

let pasan = 0, fallan = 0;
function caso(nombre: string, fn: () => void) {
  try { fn(); pasan++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallan++; console.log(`  ✗ ${nombre}\n    ${(e as Error).message}`); }
}

/** Evalúa el filtro Prisma (subset: OR de AND/verified/tenantId/chapterCode.in) contra una fila. */
type Fila = { verified: boolean; tenantId: string | null; chapterCode: string | null };
function cumple(where: Record<string, unknown>, f: Fila): boolean {
  const or = where.OR as Record<string, unknown>[] | undefined;
  if (or) return or.some(c => cumple(c, f));
  const and = where.AND as Record<string, unknown>[] | undefined;
  if (and) return and.every(c => cumple(c, f));
  if ('verified' in where && f.verified !== where.verified) return false;
  if ('tenantId' in where && f.tenantId !== where.tenantId) return false;
  if ('chapterCode' in where) {
    const cc = where.chapterCode as { in: string[] };
    if (!f.chapterCode || !cc.in.includes(f.chapterCode)) return false;
  }
  return true;
}

console.log('Knowledge retrieval: filtro por tenant');
const filtroA = construirFiltroConocimiento(['85', '84'], 'tenant-A');
caso('fila NO verificada de OTRO tenant en capítulo probable → EXCLUIDA (el bug)', () => {
  assert.equal(cumple(filtroA, { verified: false, tenantId: 'tenant-B', chapterCode: '85' }), false);
});
caso('fila NO verificada GLOBAL (sin tenant, legado) en capítulo probable → EXCLUIDA', () => {
  assert.equal(cumple(filtroA, { verified: false, tenantId: null, chapterCode: '85' }), false);
});
caso('fila NO verificada del MISMO tenant en capítulo probable → incluida', () => {
  assert.equal(cumple(filtroA, { verified: false, tenantId: 'tenant-A', chapterCode: '85' }), true);
});
caso('fila verificada (staff) de cualquier origen → incluida', () => {
  assert.equal(cumple(filtroA, { verified: true, tenantId: null, chapterCode: '01' }), true);
  assert.equal(cumple(filtroA, { verified: true, tenantId: 'tenant-B', chapterCode: '85' }), true);
});
caso('sin tenant (demo pública) → SOLO verificado, nunca feedback ajeno', () => {
  const demo = construirFiltroConocimiento(['85']);
  assert.equal(cumple(demo, { verified: false, tenantId: 'tenant-B', chapterCode: '85' }), false);
  assert.equal(cumple(demo, { verified: false, tenantId: null, chapterCode: '85' }), false);
  assert.equal(cumple(demo, { verified: true, tenantId: null, chapterCode: '85' }), true);
});
caso('fila del mismo tenant fuera de capítulos probables → excluida (misma regla de antes)', () => {
  assert.equal(cumple(filtroA, { verified: false, tenantId: 'tenant-A', chapterCode: '01' }), false);
});

const raiz = join(__dirname, '..', '..');
const ruta = readFileSync(join(raiz, 'src', 'routes', 'classify.ts'), 'utf8');
caso('feedback incorrecto: la fila creada en ClassificationKnowledge lleva tenantId', () => {
  const i = ruta.indexOf("if (feedback === 'incorrect')");
  const bloque = ruta.slice(i, ruta.indexOf('res.json', i));
  assert.ok(/classificationKnowledge\.create/.test(bloque));
  assert.ok(/tenantId:\s*req\.tenantId/.test(bloque), 'create sin tenantId');
});
const schema = readFileSync(join(raiz, 'prisma', 'schema.prisma'), 'utf8');
caso('schema: ClassificationKnowledge tiene tenantId opcional (global = verificado por staff)', () => {
  const m = schema.slice(schema.indexOf('model ClassificationKnowledge'), schema.indexOf('@@map("classification_knowledge")'));
  assert.ok(/^\s+tenantId\s+String\?/m.test(m));
});
const runner = readFileSync(join(raiz, 'src', 'services', 'classification-job-runner.ts'), 'utf8');
caso('runner de jobs pasa tenantId al clasificador', () => {
  assert.ok(/classifyProduct\([^)]*tenantId/.test(runner));
});

console.log(`\n${pasan} passed, ${fallan} failed`);
if (fallan > 0) process.exit(1);
