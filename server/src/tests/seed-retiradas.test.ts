/**
 * Seed vs fracciones retiradas — misión CIERRE TOTAL 25-ago-2026 (Bloque 1).
 *
 * Invariante: una DB limpia NO resucita 8544.42.01 ni ninguna fracción
 * retirada por migración. El seed legacy la recreaba activa porque el upsert
 * no fijaba `active` (default true del schema).
 *
 * Cobertura: (a) la lista de retiradas y su helper; (b) estáticamente, que
 * TODOS los caminos de seed que crean fracciones desde tigie-data fijan
 * `active` vía activeParaSeed — en create Y update; (c) contra la DB local
 * migrada, que re-ejecutar el upsert del seed sobre la retirada NO la
 * reactiva; (d) que el seed de precios estimados ya no referencia retiradas.
 *
 * Ejecutar:  npx tsx src/tests/seed-retiradas.test.ts
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import { RETIRADAS_TIGIE, activeParaSeed } from '../lib/retiradas-tigie';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

const seedDir = join(__dirname, '../../prisma/seed');

async function main() {
  console.log('\n== Seed: fracciones retiradas no renacen ==');

  await test('la lista cubre 8544.42.01 y el helper la marca inactiva en cualquier formato', () => {
    assert.ok(RETIRADAS_TIGIE.has('85444201'));
    assert.equal(activeParaSeed('85444201'), false);
    assert.equal(activeParaSeed('8544.42.01'), false);
    assert.equal(activeParaSeed('73181599'), true);
  });

  await test('tigie-data aún contiene la legacy (el dato histórico se conserva; el seed la neutraliza)', () => {
    const src = readFileSync(join(seedDir, 'tigie-data.ts'), 'utf8');
    assert.ok(/code:\s*'85444201'/.test(src), 'si tigie-data ya no la trae, este test y la lista pueden simplificarse');
  });

  await test('seed/index.ts fija active con activeParaSeed en create Y update del upsert de fracciones', () => {
    const src = readFileSync(join(seedDir, 'index.ts'), 'utf8');
    const usos = src.match(/active:\s*activeParaSeed\(/g) ?? [];
    assert.ok(usos.length >= 2, `esperaba ≥2 usos (create+update), hay ${usos.length}`);
    assert.ok(/retiradas-tigie/.test(src));
  });

  await test('seed-full.ts fija active con activeParaSeed al crear fracciones', () => {
    const src = readFileSync(join(seedDir, 'seed-full.ts'), 'utf8');
    assert.ok(/active:\s*activeParaSeed\(/.test(src));
    assert.ok(/retiradas-tigie/.test(src));
  });

  await test('estimated-prices no siembra precios sobre fracciones retiradas', () => {
    const src = readFileSync(join(seedDir, 'estimated-prices.ts'), 'utf8');
    for (const code of RETIRADAS_TIGIE) {
      const enLinea = new RegExp(`fractionCode:\\s*'${code}'`);
      assert.ok(!enLinea.test(src), `estimated-prices aún siembra ${code}`);
    }
  });

  // ── Integración contra la DB local migrada ──
  await test('DB: 85444201 está inactiva y re-ejecutar el upsert del seed NO la reactiva', async () => {
    const antes = await prisma.fraction.findUnique({ where: { code: '85444201' }, select: { active: true } });
    if (!antes) {
      console.log('     (DB local sin la fila 85444201 — se omite la parte de integración)');
      return;
    }
    assert.equal(antes.active, false, 'precondición: la migración 20260824234500 debe estar aplicada');
    // Réplica de la rama `update` del upsert de prisma/seed/index.ts con los
    // datos del propio registro (mismo efecto que re-correr el seed sobre él):
    const fila = await prisma.fraction.findUnique({ where: { code: '85444201' } });
    await prisma.fraction.update({
      where: { code: '85444201' },
      data: {
        description: fila!.description,
        codeFormatted: fila!.codeFormatted,
        active: activeParaSeed('85444201'),
        unit: fila!.unit,
        tariffNMF: fila!.tariffNMF,
      },
    });
    const despues = await prisma.fraction.findUnique({ where: { code: '85444201' }, select: { active: true } });
    assert.equal(despues!.active, false, 'el upsert del seed reactivó la retirada');
  });

  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
