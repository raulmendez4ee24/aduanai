/**
 * Test de la FRONTERA CANÓNICA — Fase 1a (productor + reconciliación).
 *
 * Ejecutar:  npx tsx src/tests/frontera-canonica.test.ts
 *
 * Cubre:
 *  1. Invariantes de los constructores DatoLegal (imposible fabricar verdes).
 *  2. Productor: jamás importa un LLM; verificado con fuente para fracción
 *     real; error explícito para fracción inexistente.
 *  3. Reconciliación: sustitución (no comparación), discrepancias registradas,
 *     alternativas inexistentes eliminadas, política NICO.
 *  4. ANTI-REINCIDENCIA DE TC CONSTANTE: ningún archivo de services/ ni
 *     routes/ multiplica un campo de valor por un entero literal ≥10
 *     (el `* 17` de glosa y los `* 18` de alert-generator no pueden volver,
 *     ni ninguno nuevo).
 *  5. alert-generator consume tipoCambioMXN() del productor.
 */

import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import {
  datoVerificado, datoSinVerificar, datoDeclarado, datoNoDisponible, datoNoRevisado,
} from '../lib/dato-legal';
import { datosCanonicosFraccion, tipoCambioMXN } from '../services/frontera-canonica';
import { reconciliarClasificacion } from '../services/clasificador-reconciliacion';
import type { ClassificationResult } from '../services/classifier';

const FRACCION = '73181599';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

const FUENTE = { nombre: 'Prueba', url: null, version: null, fechaPublicacion: null };

function resultadoFalso(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    fraction: { code: FRACCION, description: 'descripción inventada por el LLM', chapter: '73', section: 'XV' },
    nico: '99',
    confidence: 92,
    griApplied: ['1', '6'],
    tariffs: { nmf: 3, preferential: { TMEC: 0, CHINA: 5 } },
    regulations: { rrna: ['permiso inventado'], noms: ['NOM-INVENTADA-2020'], sectoralRegistry: true },
    alternatives: [
      { code: '73181501', description: 'desc LLM alt', confidence: 60, reason: 'alterna real' },
      { code: '99999998', description: 'no existe', confidence: 40, reason: 'alterna fantasma' },
    ],
    explanation: { simple: 's', technical: 't' },
    legalBasis: { griApplied: [], legalNotes: [], discardedFractions: [] },
    useBasedAnalysis: null,
    disclaimer: 'd',
    ...overrides,
  };
}

async function main() {
  console.log('\n== FRONTERA CANÓNICA — Fase 1a ==');

  // ── 1. Invariantes de constructores ──
  await test('invariantes: verificado exige fuente y fechaCotejo; no_revisado exige nota', () => {
    assert.throws(() => datoVerificado(5, { ...FUENTE, nombre: '' }, '2026-01-01', 'catalogo'));
    assert.throws(() => datoVerificado(5, FUENTE, '', 'catalogo'));
    assert.throws(() => datoNoRevisado(''));
    assert.throws(() => datoSinVerificar(null as never, 'catalogo'));
    const d = datoDeclarado(10);
    assert.equal(d.estado, 'sin_verificar'); // lo declarado JAMÁS es verde
    assert.equal(datoNoDisponible('catalogo').valor, null);
    assert.equal(datoVerificado(5, FUENTE, '2026-01-01', 'tabla').estado, 'verificado');
  });

  // ── 2. Productor ──
  await test('productor: cero imports de LLM (regla dura §2.3)', () => {
    const src = readFileSync(join(__dirname, '../services/frontera-canonica.ts'), 'utf8');
    assert.ok(!/from '.*\/llm'/.test(src), 'importa lib/llm');
    assert.ok(!/anthropic/i.test(src), 'referencia a anthropic');
  });

  await test('productor: fracción real → fraccion/nmf con fuente y estado honesto', async () => {
    const canon = await datosCanonicosFraccion(FRACCION);
    assert.equal(canon.fraccion.estado, 'verificado');
    assert.equal(canon.fraccion.valor!.code, FRACCION);
    assert.ok(canon.fraccion.fuente!.nombre.includes('SNICE'));
    assert.ok(canon.fraccion.fechaCotejo, 'fechaCotejo obligatoria en verificado');
    assert.ok(['verificado', 'no_disponible'].includes(canon.tarifas.nmf.estado));
    if (canon.tarifas.nmf.estado === 'no_disponible') assert.equal(canon.tarifas.nmf.valor, null);
    assert.ok(['verificado', 'sin_verificar', 'no_disponible', 'no_revisado'].includes(canon.regulaciones.noms.estado));
    assert.equal(canon.integridad.completo, true);
    assert.ok(canon.versiones.tigie.length > 0);
  });

  await test('productor: fracción inexistente → error explícito, jamás relleno', async () => {
    await assert.rejects(() => datosCanonicosFraccion('99999998'), /inválida/);
  });

  await test('tipoCambioMXN: devuelve DatoLegal (verificado/sin_verificar/no_revisado), nunca constante', async () => {
    const tc = await tipoCambioMXN();
    assert.ok(['verificado', 'sin_verificar', 'no_revisado'].includes(tc.estado));
    if (tc.estado === 'no_revisado') assert.equal(tc.valor, null);
    else assert.ok(typeof tc.valor === 'number' && tc.valor > 0);
  });

  // ── 3. Reconciliación ──
  await test('reconciliación: descripción/tarifas/regulaciones SUSTITUIDAS y discrepancias registradas', async () => {
    const bruto = resultadoFalso();
    const { resultado, datosCanonicos, discrepancias } = await reconciliarClasificacion(bruto);
    // descripción canónica, no la del LLM
    assert.equal(resultado.fraction.description, datosCanonicos.fraccion.valor!.description);
    assert.notEqual(resultado.fraction.description, 'descripción inventada por el LLM');
    // nmf canon (número o null si no_disponible) — jamás el 3 del LLM salvo coincidencia
    if (datosCanonicos.tarifas.nmf.valor !== 3) {
      assert.notEqual(resultado.tariffs.nmf as unknown, 3);
      assert.ok(discrepancias.some(d => d.campo === 'tariffs.nmf'));
    }
    // preferential: solo tratados canónicos (CHINA inventada no puede sobrevivir)
    assert.ok(!('CHINA' in resultado.tariffs.preferential));
    // noms/rrna canon (los inventados no sobreviven)
    assert.ok(!resultado.regulations.noms.includes('NOM-INVENTADA-2020'));
    assert.ok(!resultado.regulations.rrna.includes('permiso inventado'));
    assert.ok(discrepancias.some(d => d.campo === 'regulations.noms'));
    // el original NO se mutó (telemetría conserva lo que dijo el LLM)
    assert.equal(bruto.fraction.description, 'descripción inventada por el LLM');
  });

  await test('reconciliación: alternativa inexistente ELIMINADA; la real con descripción canónica', async () => {
    const { resultado, discrepancias } = await reconciliarClasificacion(resultadoFalso());
    assert.equal(resultado.alternatives.length, 1);
    assert.equal(resultado.alternatives[0]!.code, '7318.15.01');
    assert.notEqual(resultado.alternatives[0]!.description, 'desc LLM alt');
    assert.ok(discrepancias.some(d => d.campo === 'alternatives[1].code' && d.valorCanonico === null));
  });

  await test('reconciliación: política NICO — el del LLM solo sobrevive si es canónico', async () => {
    const fila = await prisma.fraction.findUnique({ where: { code: FRACCION }, select: { nico: true, nicos: true } });
    const nicosCanon = fila!.nicos.length > 0 ? fila!.nicos : (fila!.nico ? [fila!.nico] : []);
    const { resultado, datosCanonicos, discrepancias } = await reconciliarClasificacion(resultadoFalso({ nico: '99' }));
    if (nicosCanon.length === 0) {
      assert.equal(datosCanonicos.nico.estado, 'no_disponible');
      assert.equal(resultado.nico, '');
    } else if (nicosCanon.includes('99')) {
      assert.equal(resultado.nico, '99');
    } else {
      assert.notEqual(resultado.nico, '99');
      assert.ok(discrepancias.some(d => d.campo === 'nico'));
    }
  });

  await test('reconciliación post-1b: campos NO emitidos por el LLM no generan discrepancia', async () => {
    const bruto = resultadoFalso({
      nico: '',
      tariffs: { nmf: null as unknown as number, preferential: {} },
      regulations: { rrna: [], noms: [], sectoralRegistry: false },
      alternatives: [],
    });
    const { discrepancias } = await reconciliarClasificacion(bruto);
    const campos = discrepancias.map(d => d.campo);
    for (const c of ['nico', 'tariffs.nmf', 'tariffs.preferential', 'regulations.noms', 'regulations.rrna', 'regulations.sectoralRegistry']) {
      assert.ok(!campos.includes(c), `ausencia del LLM no es contradicción — no debe anotar ${c}`);
    }
  });

  // ── 4. Anti-reincidencia: TC constante prohibido en services/ y routes/ ──
  await test('ningún campo de valor se multiplica por un entero literal ≥10 (TC constante)', () => {
    const dirs = [join(__dirname, '../services'), join(__dirname, '../routes')];
    // Regla: identificador que termina en value/Value(USD|MXN) × entero de 2+
    // dígitos. Tasas (× 0.16) y contadores (i × 17) no disparan.
    const patronEstricto = /\b\w*[Vv]alue(?:USD|MXN)?\s*\*\s*\d{2,}\b/;
    const violaciones: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.ts')) continue;
        const src = readFileSync(join(dir, f), 'utf8');
        src.split('\n').forEach((linea, i) => {
          const sinComentario = linea.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
          if (patronEstricto.test(sinComentario)) violaciones.push(`${f}:${i + 1} → ${linea.trim()}`);
        });
      }
    }
    assert.deepEqual(violaciones, [], `TC constante detectado:\n${violaciones.join('\n')}`);
  });

  // ── 5. alert-generator consume el productor ──
  await test('alert-generator importa tipoCambioMXN (los * 18 no pueden volver)', () => {
    const src = readFileSync(join(__dirname, '../services/alert-generator.ts'), 'utf8');
    assert.ok(/import \{ tipoCambioMXN \} from '\.\/frontera-canonica'/.test(src));
    assert.equal((src.match(/tipoCambioMXN\(\)/g) ?? []).length >= 2, true, 'ambos generadores deben usarlo');
  });

  console.log(`\n${passed} pasaron, ${failed} fallaron\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
