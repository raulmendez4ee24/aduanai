/**
 * Matriz de movimiento entre dos corridas del accuracy runner (2ª Ola 2.3).
 *
 * Ejecutar:  npx tsx src/tests/compare-baselines.ts <antes.json> <despues.json>
 *
 * Reporta: aciertos mantenidos, PERDIDOS (caso por caso — criterio del usuario:
 * verlos individualmente antes de dar por buena la etapa), fallos convertidos
 * en acierto, y fallos persistentes con su cambio de tipo.
 */
import * as fs from 'fs';

interface Row { id: number; description: string; expected: string; predicted: string | null; confidence: number | null; hit: boolean; errorType: string | null }

const [, , beforePath, afterPath] = process.argv;
const A = JSON.parse(fs.readFileSync(beforePath!, 'utf8'));
const B = JSON.parse(fs.readFileSync(afterPath!, 'utf8'));
const bById = new Map<number, Row>((B.rows as Row[]).map(r => [r.id, r]));

const kept: number[] = [];
const lost: { a: Row; b: Row }[] = [];
const converted: { a: Row; b: Row }[] = [];
const still: { a: Row; b: Row }[] = [];

for (const a of A.rows as Row[]) {
  const b = bById.get(a.id);
  if (!b) continue;
  if (a.hit && b.hit) kept.push(a.id);
  else if (a.hit && !b.hit) lost.push({ a, b });
  else if (!a.hit && b.hit) converted.push({ a, b });
  else still.push({ a, b });
}

console.log('══════ MATRIZ DE MOVIMIENTO ══════');
console.log(`ANTES:   ${A.summary.top1} | DESPUÉS: ${B.summary.top1}`);
console.log(`Mantenidos: ${kept.length} | PERDIDOS: ${lost.length} | Convertidos: ${converted.length} | Siguen fallando: ${still.length}`);

console.log('\n── PERDIDOS (caso por caso) ──');
for (const { a, b } of lost) {
  console.log(`#${a.id} "${a.description.slice(0, 55)}"`);
  console.log(`   antes: ✅ ${a.predicted} (conf ${a.confidence}) → ahora: ❌ [${b.errorType}] ${b.predicted ?? '—'} (conf ${b.confidence ?? '—'}) exp=${a.expected}`);
}

console.log('\n── CONVERTIDOS (resumen) ──');
for (const { a, b } of converted) console.log(`#${a.id} [antes ${a.errorType}] → ✅ ${b.predicted} (conf ${b.confidence}) "${a.description.slice(0, 45)}"`);

const typeShift: Record<string, number> = {};
for (const { a, b } of still) typeShift[`${a.errorType} → ${b.errorType}`] = (typeShift[`${a.errorType} → ${b.errorType}`] ?? 0) + 1;
console.log('\n── FALLOS PERSISTENTES: cambio de tipo ──');
console.log(JSON.stringify(typeShift, null, 2));

console.log('\n── DESGLOSE DESPUÉS ──');
console.log(JSON.stringify(B.summary.erroresPorTipo, null, 2));
const shown = (s: Record<string, number>) => (s['especifica_incorrecta'] ?? 0) + (s['residual_incorrecta'] ?? 0) + (s['capitulo_equivocado'] ?? 0);
console.log(`ERRORES MOSTRADOS AL USUARIO — antes: ${shown(A.summary.erroresPorTipo)} | después: ${shown(B.summary.erroresPorTipo)} (criterio: ≤ antes)`);
console.log(`Confianza aciertos/errores — antes: ${A.summary.confianzaPromedioAciertos}/${A.summary.confianzaPromedioErrores} | después: ${B.summary.confianzaPromedioAciertos}/${B.summary.confianzaPromedioErrores}`);
