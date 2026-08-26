/**
 * Test FAIL-CLOSED de Pre-Glosa (Frontera Canónica Fase 2).
 *
 * Ejecutar:  npx tsx src/tests/glosa-fail-closed.test.ts
 *
 * Criterio de salida del diseño (docs/FRONTERA_CANONICA_DESIGN.md §6 Fase 2):
 * "prueba que tira cada dependencia (mock que lanza) y verifica no_revisado +
 * riskLevelPresentacion='indeterminado'; cero catch silenciosos; 17 inexistente".
 *
 * Usa la DB local para catálogo/reglas (read-mostly) y limpia las simulaciones
 * que persiste bajo el tenant sintético TEST_TENANT.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import {
  simulateGlosa,
  DOMINIOS_GLOSA,
  type DominioGlosa,
  type GlosaFuentes,
  type GlosaSimulationInput,
} from '../services/glosa-simulator';

const TEST_TENANT = 'test-frontera-fase2';
const TEST_USER = 'test-frontera-fase2-user';
const FRACCION_VALIDA = '73181599'; // "los demás" tornillos — activa en Base Única

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

function inputBase(): GlosaSimulationInput {
  return {
    fractionCode: FRACCION_VALIDA,
    productDescription: 'Tornillo de acero inoxidable rosca métrica M8 x 40mm cabeza hexagonal para uso industrial automotriz',
    countryOrigin: 'US',
    countryProvider: 'US',
    customsCode: '07', // no está en HIGH_RISK_CUSTOMS
    regimenCode: 'A1',
    unitValueUSD: 10,
    weightKg: 100,
    totalValueUSD: 1000,
  };
}

/** Fuentes benignas: todas responden, ninguna dispara flags de consulta. */
function fuentesOK(): GlosaFuentes {
  return {
    precioEstimado: async () => null,
    cuotas: async () => [],
    padrones: async () => ({ canOperate: true, blocking: [], warnings: [], required: [] }) as never,
    historicoValores: async () => [],
    historicoRA: async () => ({ raRate: 0, total: 0 }),
    nomsRequeridas: async () => [],
    reclasificaciones: async () => ({ total: 0, reclasificadas: 0 }),
    tipoCambio: async () => ({
      rate: 18.5,
      source: 'banxico' as const,
      asOf: new Date('2026-08-17T00:00:00Z'),
      isOfficial: true,
      warning: null,
    }),
  };
}

const FUENTE_POR_DOMINIO: Record<DominioGlosa, keyof GlosaFuentes> = {
  precio_estimado: 'precioEstimado',
  historico_importador: 'historicoValores',
  cuotas_compensatorias: 'cuotas',
  padrones: 'padrones',
  noms: 'nomsRequeridas',
  reclasificacion_historica: 'reclasificaciones',
};

async function main() {
  console.log('\n== Pre-Glosa FAIL-CLOSED (Frontera Canónica Fase 2) ==');

  // ── 0. Higiene de código: cero catch silenciosos, cero TC constante ──
  await test('el código fuente no contiene catch silenciosos ni TC "* 17"', async () => {
    const src = readFileSync(join(__dirname, '../services/glosa-simulator.ts'), 'utf8');
    assert.ok(!/catch\s*\{\s*\/\*\s*silent\s*\*\//.test(src), 'queda un catch { /* silent */ }');
    assert.ok(!/catch\s*\{\s*\}/.test(src), 'queda un catch {} vacío');
    assert.ok(!/\*\s*17\b/.test(src), 'queda el TC constante * 17');
  });

  // ── 1. Entrada canónica: fracción inexistente → error explícito ──
  await test('fracción inexistente → error, jamás reporte tranquilizador', async () => {
    await assert.rejects(
      () => simulateGlosa(TEST_TENANT, TEST_USER, { ...inputBase(), fractionCode: '99999998' }, fuentesOK()),
      /no existe o no está activa/,
    );
  });

  // ── 2. Camino feliz: todo revisado → completa, nivel presentable = nivel ──
  await test('todas las consultas OK → revision.completa=true, sin dominios no revisados', async () => {
    const r = await simulateGlosa(TEST_TENANT, TEST_USER, inputBase(), fuentesOK());
    assert.equal(r.revision.completa, true);
    assert.equal(r.revision.noRevisados.length, 0);
    for (const d of DOMINIOS_GLOSA) assert.equal(r.revision.dominios[d], 'revisado');
    assert.equal(r.riskLevelPresentacion, r.riskLevel);
    assert.ok(r.tipoCambio, 'debe reportar el TC usado');
    assert.equal(r.tipoCambio!.estado, 'verificado');
    assert.equal(r.tipoCambio!.valor, 18.5);
  });

  // ── 3. Cada dominio tirado → no_revisado + indeterminado (el corazón) ──
  for (const dominio of DOMINIOS_GLOSA) {
    await test(`fallo en ${dominio} → dominio no_revisado + riskLevelPresentacion=indeterminado`, async () => {
      const fuentes = fuentesOK();
      (fuentes[FUENTE_POR_DOMINIO[dominio]] as unknown) = async () => {
        throw new Error(`fallo simulado de ${dominio}`);
      };
      const r = await simulateGlosa(TEST_TENANT, TEST_USER, inputBase(), fuentes);
      assert.equal(r.revision.dominios[dominio], 'no_revisado');
      assert.equal(r.revision.completa, false);
      assert.equal(r.riskLevelPresentacion, 'indeterminado');
      const noRev = r.revision.noRevisados.find(n => n.dominio === dominio);
      assert.ok(noRev, 'el dominio caído debe estar en noRevisados');
      assert.match(noRev!.motivo, /fallo simulado/);
      // Los demás dominios siguen revisados (degradación por dominio, no en bloque)
      for (const d of DOMINIOS_GLOSA) {
        if (d !== dominio) assert.equal(r.revision.dominios[d], 'revisado', `dominio ${d} debió seguir revisado`);
      }
    });
  }

  // ── 4. TC: fallo → valueMXN null persistido, DatoLegal no_revisado ──
  await test('TC no disponible → tipoCambio no_revisado y valueMXN null en DB (nunca constante)', async () => {
    const fuentes = fuentesOK();
    fuentes.tipoCambio = async () => { throw new Error('Banxico caído'); };
    const r = await simulateGlosa(TEST_TENANT, TEST_USER, inputBase(), fuentes);
    assert.ok(r.tipoCambio);
    assert.equal(r.tipoCambio!.estado, 'no_revisado');
    assert.equal(r.tipoCambio!.valor, null);
    // El fallo de TC no invalida la revisión de dominios de score (§5.4)
    assert.equal(r.revision.completa, true);
    const row = await prisma.glosaSimulation.findFirst({ where: { id: r.simulationId, tenantId: TEST_TENANT } });
    assert.ok(row);
    assert.equal(row!.valueMXN, null);
  });

  await test('MXN declarado por el usuario → se usa tal cual, sin TC del sistema', async () => {
    const r = await simulateGlosa(TEST_TENANT, TEST_USER, { ...inputBase(), totalValueMXN: 18432.5 }, fuentesOK());
    assert.equal(r.tipoCambio, null);
    const row = await prisma.glosaSimulation.findFirst({ where: { id: r.simulationId, tenantId: TEST_TENANT } });
    assert.equal(row!.valueMXN, 18432.5);
  });

  await test('TC OK → valueMXN derivado del TC real y persistido con procedencia', async () => {
    const r = await simulateGlosa(TEST_TENANT, TEST_USER, inputBase(), fuentesOK());
    const row = await prisma.glosaSimulation.findFirst({ where: { id: r.simulationId, tenantId: TEST_TENANT } });
    assert.equal(row!.valueMXN, 18500); // 1000 USD × 18.5
    const tc = row!.exchangeRateUsed as { estado: string; valor: number };
    assert.equal(tc.estado, 'verificado');
    assert.equal(tc.valor, 18.5);
  });

  // ── 5. declaresNOMs ya no salta la consulta (fail-open eliminado) ──
  await test('declaresNOMs=true NO salta el lookup de NOMs (solo suprime la bandera)', async () => {
    let consultada = false;
    const fuentes = fuentesOK();
    fuentes.nomsRequeridas = async () => { consultada = true; return ['NOM-001-SCFI-2018']; };
    const r = await simulateGlosa(TEST_TENANT, TEST_USER, { ...inputBase(), declaresNOMs: true }, fuentes);
    assert.equal(consultada, true, 'la consulta de NOMs debe correr aunque el usuario declare cumplimiento');
    assert.equal(r.revision.dominios.noms, 'revisado');
    assert.ok(!r.flags.some(f => f.ruleCode === 'DOC_002'), 'la declaración suprime la bandera, no la consulta');
  });

  await test('sin declaración y NOM requerida → bandera DOC_002 presente', async () => {
    const fuentes = fuentesOK();
    fuentes.nomsRequeridas = async () => ['NOM-001-SCFI-2018'];
    const r = await simulateGlosa(TEST_TENANT, TEST_USER, { ...inputBase(), declaresNOMs: false }, fuentes);
    assert.ok(r.flags.some(f => f.ruleCode === 'DOC_002'));
  });

  // ── 6. Fundamento con procedencia (DatoLegal por regla) ──
  await test('regla SIN cotejo → fundamento sin_verificar; CON cotejo → verificado', async () => {
    // CLA_002 (descripción genérica) se dispara determinísticamente con
    // productDescription corta. Primero sin cotejo, luego con cotejo, y revert.
    const rule = await prisma.glosaRiskRule.findUnique({ where: { ruleCode: 'CLA_002' } });
    if (!rule) {
      console.log('     (regla CLA_002 no sembrada en esta DB — subtest omitido)');
      return;
    }
    const inputGenerico = { ...inputBase(), productDescription: 'partes varias' };

    await prisma.glosaRiskRule.update({
      where: { ruleCode: 'CLA_002' },
      data: { fuenteNombre: null, fuenteUrl: null, fechaCotejo: null },
    });
    const sin = await simulateGlosa(TEST_TENANT, TEST_USER, inputGenerico, fuentesOK());
    const flagSin = sin.flags.find(f => f.ruleCode === 'CLA_002');
    assert.ok(flagSin, 'CLA_002 debió dispararse con descripción genérica');
    if (rule.legalBasis) {
      assert.equal(flagSin!.fundamento?.estado, 'sin_verificar');
    }

    try {
      await prisma.glosaRiskRule.update({
        where: { ruleCode: 'CLA_002' },
        data: {
          fuenteNombre: 'Ley Aduanera (Diputados)',
          fuenteUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
          fechaCotejo: new Date('2026-08-18T00:00:00Z'),
        },
      });
      const con = await simulateGlosa(TEST_TENANT, TEST_USER, inputGenerico, fuentesOK());
      const flagCon = con.flags.find(f => f.ruleCode === 'CLA_002');
      if (rule.legalBasis) {
        assert.equal(flagCon!.fundamento?.estado, 'verificado');
        assert.equal(flagCon!.fundamento?.fuente?.nombre, 'Ley Aduanera (Diputados)');
      }
    } finally {
      // Revert: la regla vuelve a su estado original (sin cotejo)
      await prisma.glosaRiskRule.update({
        where: { ruleCode: 'CLA_002' },
        data: {
          fuenteNombre: rule.fuenteNombre,
          fuenteUrl: rule.fuenteUrl,
          fechaCotejo: rule.fechaCotejo,
        },
      });
    }
  });

  // ── Limpieza ──
  const del = await prisma.glosaSimulation.deleteMany({ where: { tenantId: TEST_TENANT } });
  console.log(`\n  (limpieza: ${del.count} simulaciones de prueba eliminadas)`);

  console.log(`\n${passed} pasaron, ${failed} fallaron\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
