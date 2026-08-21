/**
 * Test anti-reincidencia (D7, auditoría 21-ago-2026).
 *
 * Ejecutar:  npx tsx src/tests/no-aduana-shopping.test.ts
 *
 * Ninguna recomendación de la Pre-Glosa (ni de ningún otro generador de
 * hallazgos) puede sugerir cambiar de aduana, puerto o patente para reducir
 * la probabilidad de Reconocimiento Aduanero. No es un bug de datos: aconsejar
 * aduana-shopping es exactamente la conducta que el SAT perfila y es
 * incompatible con un producto de cumplimiento. Este test cubre dos capas:
 *
 *  1. Todo el árbol de reglas/seed (src/services/, prisma/seed/) — se barre
 *     completo, sin lista fija de nombres de archivo, para que un generador
 *     de hallazgos nuevo quede cubierto automáticamente en vez de envejecer
 *     el guard en silencio. Patrón y barrido viven en
 *     src/lib/aduana-shopping-guard.ts (fuente única, compartida con el
 *     verificador de prod prisma/seed/verify-no-aduana-shopping.mjs vía el
 *     build en dist/).
 *  2. Las filas YA sembradas en la tabla glosa_risk_rules (activas o no) —
 *     cubre reglas insertadas por seeds antiguos, migraciones manuales o
 *     cualquier otro camino que no pase por el seed actual.
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { ADUANA_SHOPPING_PATTERN, listScanFiles, scanForAduanaShopping } from '../lib/aduana-shopping-guard';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

async function main() {
  await test('el barrido cubre el árbol de reglas/seed (evita un guard que pasa por no encontrar nada)', () => {
    const files = listScanFiles();
    assert.ok(files.length > 10, `solo se encontraron ${files.length} archivos escaneables — revisa SCAN_ROOTS en aduana-shopping-guard.ts`);
  });

  await test('árbol de reglas/seed completo (src/services/, prisma/seed/): ningún archivo sugiere cambiar de aduana/puerto/patente', () => {
    const offenders = scanForAduanaShopping();
    assert.equal(
      offenders.length, 0,
      offenders.map(o => `${o.file}:${o.line} — "${o.snippet}"`).join('\n'),
    );
  });

  await test('DB: ninguna fila de glosa_risk_rules (activa o inactiva) sugiere cambiar de aduana/puerto/patente', async () => {
    const rows = await prisma.glosaRiskRule.findMany({
      select: { ruleCode: true, recommendation: true, description: true },
    });
    const offenders = rows.filter(
      r => ADUANA_SHOPPING_PATTERN.test(r.recommendation) || ADUANA_SHOPPING_PATTERN.test(r.description),
    );
    assert.equal(
      offenders.length, 0,
      `filas en DB con recomendación/descripción de aduana-shopping: ${offenders.map(r => r.ruleCode).join(', ')}`,
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
