/**
 * Test transversal Pre-Glosa — misión CIERRE TOTAL 25-ago-2026 (Bloque 1).
 *
 * Contrato: NINGUNA regla puede disparar por un dato que el formulario no
 * captura. Una regla sin dato de entrada (o con historial insuficiente) queda
 * `no_evaluado` con motivo visible en `revision.reglasNoEvaluadas` — jamás
 * dispara por defecto ni cuenta como revisada.
 *
 * Cubre los cinco bugs de regla:
 *  - CLA_001: solo reclasificaciones REALES (tenant + ventana 12m + mínimo 5).
 *  - CLA_002: exige productDescription capturada; sin ella → no_evaluado.
 *  - REG_001: texto del seed coherente con IN/AF (muere "A4"/"diferir IVA").
 *  - ORI_002: exige captura real de documents.originCertificate.
 *  - appliesTMEC: valida membresía IMPORTANDO la lista del Cotizador.
 *
 * Ejecutar:  npx tsx src/tests/glosa-reglas-capturadas.test.ts
 * (usa la DB local para validateFraction y la tabla de reglas, como el resto
 * de la suite de glosa; tenant sintético con limpieza al final)
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import {
  simulateGlosa,
  type GlosaFuentes,
  type GlosaSimulationInput,
} from '../services/glosa-simulator';
import { TMEC_PAISES, esMiembroTMEC } from '../lib/treaties';

/** Bloques de texto del seed de reglas por ruleCode (lectura estática — el
 *  seed vive fuera de rootDir y no puede importarse desde src). */
function bloqueSeedRegla(ruleCode: string): string {
  const src = readFileSync(join(__dirname, '../../prisma/seed/glosa-risk-rules.ts'), 'utf8');
  const inicio = src.indexOf(`ruleCode: '${ruleCode}'`);
  assert.ok(inicio >= 0, `no se encontró ${ruleCode} en el seed`);
  const fin = src.indexOf('ruleCode:', inicio + 10);
  return src.slice(inicio, fin === -1 ? undefined : fin);
}

const TEST_TENANT = 'test-reglas-capturadas';
const TEST_USER = 'test-reglas-capturadas-user';
const FRACCION_VALIDA = '73181599';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

/** EXACTAMENTE lo que el formulario de GlosaSimulator.tsx captura hoy con
 *  todo en su valor por defecto (checkboxes apagados, texto vacío omitido).
 *  Si una regla dispara sobre esto con fuentes benignas, dispara por un dato
 *  que el usuario nunca proporcionó. */
function payloadUIMinimo(): GlosaSimulationInput {
  return {
    fractionCode: FRACCION_VALIDA,
    countryOrigin: 'US',
    countryProvider: 'US',
    customsCode: '07', // fuera de HIGH_RISK_CUSTOMS
    regimenCode: 'A1',
    unitValueUSD: 10,
    weightKg: 100,
    totalValueUSD: 1000,
    declaresAntidumping: false,
    appliesTMEC: false,
    hasTMECCertificate: false,
    declaresNOMs: false,
    hasIVAIEPSCertification: false,
    declaresLink: false,
    documents: { originCertificate: false },
  };
}

function fuentesBenignas(): GlosaFuentes {
  return {
    precioEstimado: async () => null,
    cuotas: async () => [],
    padrones: async () => ({ canOperate: true, blocking: [], warnings: [], required: [] }) as never,
    historicoValores: async () => [],
    historicoRA: async () => ({ raRate: 0, total: 0 }),
    nomsRequeridas: async () => [],
    reclasificaciones: async () => ({ total: 0, reclasificadas: 0 }),
    tipoCambio: async () => ({
      rate: 18.5, source: 'banxico' as const, asOf: new Date('2026-08-25T00:00:00Z'),
      isOfficial: true, warning: null,
    }),
  };
}

const sim = (input: GlosaSimulationInput, fuentes: Partial<GlosaFuentes> = {}) =>
  simulateGlosa(TEST_TENANT, TEST_USER, input, { ...fuentesBenignas(), ...fuentes });

const codigos = (r: Awaited<ReturnType<typeof simulateGlosa>>) => r.flags.map(f => f.ruleCode);
const noEval = (r: Awaited<ReturnType<typeof simulateGlosa>>) =>
  r.revision.reglasNoEvaluadas.map(x => x.ruleCode);

async function main() {
  console.log('\n== Pre-Glosa: reglas vs campos capturados (transversal) ==');

  // ── TRANSVERSAL: la operación mínima de la UI con fuentes benignas no
  //    dispara NINGUNA regla ──
  await test('payload mínimo de la UI + fuentes benignas → CERO flags', async () => {
    const r = await sim(payloadUIMinimo());
    assert.deepEqual(codigos(r), [], `dispararon por defecto: ${codigos(r).join(', ')}`);
  });

  await test('payload legado SIN productDescription ni documents (UI vieja) → CERO flags; CLA_002 y CLA_001 no_evaluado', async () => {
    const viejo = payloadUIMinimo();
    delete (viejo as Partial<GlosaSimulationInput>).documents;
    delete (viejo as Partial<GlosaSimulationInput>).productDescription;
    const r = await sim(viejo);
    assert.deepEqual(codigos(r), [], `dispararon: ${codigos(r).join(', ')}`);
    assert.ok(noEval(r).includes('CLA_002'), 'CLA_002 debe quedar no_evaluado sin descripción');
    assert.ok(noEval(r).includes('CLA_001'), 'CLA_001 debe quedar no_evaluado sin historial');
  });

  // ── CLA_002: exige captura; con captura evalúa de verdad ──
  await test('CLA_002: descripción vacía → no_evaluado, jamás flag', async () => {
    const r = await sim({ ...payloadUIMinimo(), productDescription: '   ' });
    assert.ok(!codigos(r).includes('CLA_002'));
    assert.ok(noEval(r).includes('CLA_002'));
  });
  await test('CLA_002: descripción genérica capturada → SÍ dispara', async () => {
    const r = await sim({ ...payloadUIMinimo(), productDescription: 'artículos varios' });
    assert.ok(codigos(r).includes('CLA_002'));
    assert.ok(!noEval(r).includes('CLA_002'));
  });
  await test('CLA_002: descripción específica → no dispara ni queda no_evaluado', async () => {
    const r = await sim({
      ...payloadUIMinimo(),
      productDescription: 'Tornillo de acero al carbono rosca métrica M8 x 40mm cabeza hexagonal DIN 933 para ensamble de chasis automotriz',
    });
    assert.ok(!codigos(r).includes('CLA_002'));
    assert.ok(!noEval(r).includes('CLA_002'));
  });

  // ── CLA_001: solo señal real (tenant + ventana + mínimo) ──
  await test('CLA_001: historial insuficiente (<5) → no_evaluado, jamás flag', async () => {
    const r = await sim(payloadUIMinimo(), { reclasificaciones: async () => ({ total: 4, reclasificadas: 4 }) });
    assert.ok(!codigos(r).includes('CLA_001'));
    assert.ok(noEval(r).includes('CLA_001'));
  });
  await test('CLA_001: 2/10 marcadas incorrectas (20% ≥ 15%) → dispara con la cifra real', async () => {
    const r = await sim(payloadUIMinimo(), { reclasificaciones: async () => ({ total: 10, reclasificadas: 2 }) });
    assert.ok(codigos(r).includes('CLA_001'));
    const flag = r.flags.find(f => f.ruleCode === 'CLA_001')!;
    assert.ok(/2 de 10/.test(flag.reason), `razón sin cifras reales: ${flag.reason}`);
  });
  await test('CLA_001: 1/10 (10% < 15%) → no dispara', async () => {
    const r = await sim(payloadUIMinimo(), { reclasificaciones: async () => ({ total: 10, reclasificadas: 1 }) });
    assert.ok(!codigos(r).includes('CLA_001'));
    assert.ok(!noEval(r).includes('CLA_001'));
  });

  // ── ORI_002: captura real del certificado vinculado ──
  const conTMEC = (): GlosaSimulationInput => ({
    ...payloadUIMinimo(), appliesTMEC: true, hasTMECCertificate: true,
  });
  await test('ORI_002: documents sin capturar (undefined) → no_evaluado, jamás flag', async () => {
    const input = conTMEC();
    delete (input as Partial<GlosaSimulationInput>).documents;
    const r = await sim(input);
    assert.ok(!codigos(r).includes('ORI_002'));
    assert.ok(noEval(r).includes('ORI_002'));
  });
  await test('ORI_002: capturado NO vinculado → SÍ dispara', async () => {
    const r = await sim({ ...conTMEC(), documents: { originCertificate: false } });
    assert.ok(codigos(r).includes('ORI_002'));
  });
  await test('ORI_002: capturado y vinculado → no dispara', async () => {
    const r = await sim({ ...conTMEC(), documents: { originCertificate: true } });
    assert.ok(!codigos(r).includes('ORI_002'));
    assert.ok(!noEval(r).includes('ORI_002'));
  });

  // ── appliesTMEC: membresía importada del Cotizador ──
  await test('appliesTMEC con origen NO miembro (CN) → ORI_002 y DOC_001 no_evaluado con motivo de membresía', async () => {
    const r = await sim({ ...payloadUIMinimo(), countryOrigin: 'CN', appliesTMEC: true, hasTMECCertificate: false });
    assert.ok(!codigos(r).includes('DOC_001'), 'DOC_001 no debe disparar con preferencia inaplicable');
    assert.ok(!codigos(r).includes('ORI_002'));
    const motivos = r.revision.reglasNoEvaluadas.filter(x => x.ruleCode === 'DOC_001' || x.ruleCode === 'ORI_002');
    assert.equal(motivos.length, 2);
    assert.ok(motivos.every(x => /no es parte del tratado/.test(x.motivo)));
  });
  await test('appliesTMEC con origen miembro (US) sin certificado → DOC_001 SÍ dispara', async () => {
    const r = await sim({ ...payloadUIMinimo(), appliesTMEC: true, hasTMECCertificate: false });
    assert.ok(codigos(r).includes('DOC_001'));
  });
  await test('la lista T-MEC se IMPORTA del Cotizador (lib/treaties), no se copia', () => {
    assert.ok(TMEC_PAISES.includes('US') && TMEC_PAISES.includes('CA') && TMEC_PAISES.includes('MX'));
    assert.ok(esMiembroTMEC('us') && esMiembroTMEC(' CA ') && !esMiembroTMEC('CN'));
    const src = readFileSync(join(__dirname, '../services/glosa-simulator.ts'), 'utf8');
    assert.ok(/esMiembroTMEC/.test(src) && /from '\.\.\/lib\/treaties'/.test(src),
      'glosa-simulator debe importar la membresía de lib/treaties');
    assert.ok(!/'US','USA'/.test(src), 'glosa-simulator no debe tener copia local de la lista');
  });

  // ── REG_001: texto del seed coherente IN/AF ──
  await test('seed REG_001: muere "A4" y "diferir IVA"; describe IN/AF y pago/garantía', () => {
    const bloque = bloqueSeedRegla('REG_001');
    const campos = bloque.match(/(?:description|recommendation|legalBasis|name):[^\n]+/g)!.join(' ');
    assert.ok(!/\bA4\b/.test(campos), 'REG_001 aún menciona A4 en un campo visible');
    assert.ok(!/diferir el IVA|diferimiento/.test(campos), 'REG_001 aún promete diferimiento');
    assert.ok(/IN\/AF|claves IN/.test(campos), 'REG_001 debe nombrar IN/AF');
    assert.ok(/paga o se garantiza|pago o garant/i.test(campos), 'REG_001 debe describir pago/garantía');
  });
  await test('seed CLA_001: ya no promete datos del SAT; declara señal interna por tenant', () => {
    const bloque = bloqueSeedRegla('CLA_001');
    const desc = bloque.match(/description:[^\n]+/)![0];
    assert.ok(!/por el SAT/.test(desc), 'CLA_001 aún promete reclasificación del SAT');
    assert.ok(/señal interna/.test(desc));
  });

  // Limpieza
  const del = await prisma.glosaSimulation.deleteMany({ where: { tenantId: TEST_TENANT } });
  console.log(`\n  (limpieza: ${del.count} simulaciones de prueba eliminadas)`);

  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
