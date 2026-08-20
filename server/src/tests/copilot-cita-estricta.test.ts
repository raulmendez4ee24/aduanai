/**
 * Test FAIL-CLOSED de citas del Copilot — Frontera Canónica Fase 3a (§4.1-4.2).
 *
 * Ejecutar:  npx tsx src/tests/copilot-cita-estricta.test.ts
 *
 * Cubre:
 *  1. Matcher por clave normalizada: exactitud en ambas direcciones (el
 *     matcher viejo por tokens producía falsos respaldos y falsas alarmas).
 *  2. Política estricta: regenerar una vez → si persiste, DEGRADAR a la
 *     abstención canónica (el usuario JAMÁS ve la respuesta con citas
 *     fantasma); la descartada se persiste para análisis.
 *  3. Modo sombra (default): detecta y registra, no bloquea, no regenera.
 *  4. Fallback top-3 ELIMINADO: sin cruce → citations=[] y los docs van a
 *     documentosConsultados.
 *  5. Confianza determinista: mismos insumos → mismo número.
 *
 * Generador y retrieval INYECTADOS: cero LLM real, cero dependencia del
 * corpus vivo. Persistencia real en DB local bajo tenant sintético (limpieza).
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import {
  askCopilotWithRAG,
  ABSTENCION_CANONICA,
  type CopilotRAGResult,
} from '../services/copilot';
import { parseReferencia, cruzarCitas } from '../services/citas-legales';
import type { smartRetrieval, RetrievedDoc } from '../services/rag-search';

const TEST_TENANT = 'test-frontera-fase3a';
const TEST_USER = 'test-frontera-fase3a-user';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

function doc(reference: string, id: string): RetrievedDoc {
  return {
    id, type: 'ley', claseTexto: 'resumen', source: 'Diputados', title: reference, reference,
    content: `Texto de ${reference}`, excerpt: `Extracto de ${reference}`,
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
    effectiveDate: null, topics: ['aduanas'], keywords: [], fractionRefs: [],
    similarity: 0.8, keywordScore: 0.5, finalScore: 0.8,
  } as RetrievedDoc;
}

const DOCS = [doc('Art. 54 LA', 'd1'), doc('Regla 7.1.6 RGCE 2026', 'd2'), doc('Art. 27 LIVA', 'd3')];

function retrievalFake(docs: RetrievedDoc[] = DOCS): typeof smartRetrieval {
  return (async () => ({
    docs,
    shouldRespond: true,
    reason: 'ok',
    averageRelevance: 80,
    detectedTopics: ['aduanas'],
  })) as unknown as typeof smartRetrieval;
}

function generadorSecuencia(respuestas: string[]) {
  let i = 0;
  const llamadas: string[] = [];
  const fn = (async (args: { user: string }) => {
    llamadas.push(args.user);
    const text = respuestas[Math.min(i, respuestas.length - 1)]!;
    i++;
    return { text, model: 'fake-model', provider: 'test', inputTokens: 0, outputTokens: 0 };
  }) as never;
  return { fn, llamadas };
}

async function correr(respuestas: string[], modo: string): Promise<{ r: CopilotRAGResult; llamadas: string[] }> {
  process.env.COPILOT_CITA_ESTRICTA = modo;
  const gen = generadorSecuencia(respuestas);
  const r = await askCopilotWithRAG(
    { question: '¿Qué dice sobre el despacho aduanero?', tenantId: TEST_TENANT, userId: TEST_USER },
    { generar: gen.fn, recuperar: retrievalFake() },
  );
  return { r, llamadas: gen.llamadas };
}

async function main() {
  console.log('\n== Copilot FAIL-CLOSED de citas (Fase 3a) ==');

  // ── 1. Matcher por clave normalizada ──
  await test('parseReferencia: claves correctas por familia', () => {
    assert.deepEqual(parseReferencia('Art. 54 LA'), { tipo: 'articulo', numero: '54', cuerpo: 'LA' });
    assert.deepEqual(parseReferencia('Artículo 28-A de la LIVA'), { tipo: 'articulo', numero: '28-A', cuerpo: 'LIVA' });
    assert.equal(parseReferencia('Regla General 3 a) (RGI)')!.tipo, 'rgi'); // JAMÁS articulo
    assert.deepEqual(parseReferencia('Regla 7.1.6 RGCE 2026'), { tipo: 'regla', numero: '7.1.6', cuerpo: 'RGCE' });
    assert.deepEqual(parseReferencia('Anexo 22 RGCE'), { tipo: 'anexo', numero: '22', cuerpo: 'RGCE' });
  });

  await test('cruzarCitas: exacto respalda; cuerpo o sufijo distinto NO', () => {
    const refs = DOCS.map(d => d.reference);
    const ok = cruzarCitas('Según el Art. 54 LA procede el reconocimiento.', refs);
    assert.equal(ok.noRespaldadas.length, 0);
    assert.equal(ok.respaldadas.size, 1);

    const cuerpoDistinto = cruzarCitas('Según el Art. 54 LFD procede.', refs);
    assert.deepEqual(cuerpoDistinto.noRespaldadas, ['Art. 54 LFD']);

    const sufijo = cruzarCitas('Conforme al Art. 54-A LA.', refs);
    assert.equal(sufijo.noRespaldadas.length, 1);

    // El matcher viejo respaldaba esto por tokens débiles ("54", "la"):
    const reglaInventada = cruzarCitas('Aplica la Regla 5.4.1 RGCE 2026.', refs);
    assert.deepEqual(reglaInventada.noRespaldadas, ['Regla 5.4.1 RGCE 2026']);
  });

  await test('cruzarCitas: cita sin cuerpo — único match respalda, ambigüedad NO', () => {
    const unico = cruzarCitas('Ver el Art. 54.', ['Art. 54 LA', 'Art. 27 LIVA']);
    assert.equal(unico.noRespaldadas.length, 0);
    const ambiguo = cruzarCitas('Ver el Art. 54.', ['Art. 54 LA', 'Art. 54 LIVA']);
    assert.equal(ambiguo.noRespaldadas.length, 1, 'ambigüedad = no respaldada');
  });

  // ── 2. Política estricta ──
  const RESPUESTA_MALA = 'Aplica multa conforme al Art. 199 LFT y el Art. 54 LA. ⚖️ Verifica en DOF.';
  const RESPUESTA_BUENA = 'Procede conforme al Art. 54 LA. ⚖️ Verifica en DOF.';

  await test('estricta: regeneración corrige → se muestra la regenerada (no degradada)', async () => {
    const { r, llamadas } = await correr([RESPUESTA_MALA, RESPUESTA_BUENA], 'estricta');
    assert.equal(llamadas.length, 2, 'exactamente 1 regeneración');
    assert.ok(llamadas[1]!.includes('CORRECCIÓN OBLIGATORIA'));
    assert.equal(r.answer, RESPUESTA_BUENA);
    assert.equal(r.citaEstricta.regenerada, true);
    assert.equal(r.citaEstricta.degradada, false);
    assert.equal(r.citations.length, 1);
    assert.equal(r.citations[0]!.reference, 'Art. 54 LA');
  });

  await test('estricta: persiste la cita fantasma → DEGRADA a abstención y guarda la descartada', async () => {
    const { r, llamadas } = await correr([RESPUESTA_MALA, RESPUESTA_MALA], 'estricta');
    assert.equal(llamadas.length, 2, 'una sola regeneración, jamás bucle');
    assert.ok(r.answer.startsWith(ABSTENCION_CANONICA), 'el usuario ve la abstención canónica');
    assert.ok(!r.answer.includes('Art. 199 LFT'), 'la cita fantasma no llega al usuario');
    assert.equal(r.citaEstricta.degradada, true);
    assert.equal(r.citations.length, 0);
    const row = await prisma.copilotConsult.findFirst({
      where: { tenantId: TEST_TENANT, citaDegradada: true },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(row, 'consulta persistida');
    assert.ok(row!.respuestaDescartada?.includes('Art. 199 LFT'), 'la descartada se conserva para análisis');
    assert.equal(row!.citaModo, 'estricta');
  });

  // ── 3. Modo sombra (default) ──
  await test('sombra (default): detecta y reporta sin bloquear ni regenerar', async () => {
    delete process.env.COPILOT_CITA_ESTRICTA;
    const gen = generadorSecuencia([RESPUESTA_MALA]);
    const r = await askCopilotWithRAG(
      { question: 'pregunta sombra', tenantId: TEST_TENANT, userId: TEST_USER },
      { generar: gen.fn, recuperar: retrievalFake() },
    );
    assert.equal(gen.llamadas.length, 1, 'sin regeneración en sombra');
    assert.equal(r.answer, RESPUESTA_MALA, 'sombra no altera la respuesta');
    assert.equal(r.citaEstricta.modo, 'sombra');
    assert.deepEqual(r.citaEstricta.noRespaldadas, ['Art. 199 LFT']);
    assert.equal(r.citaEstricta.degradada, false);
  });

  // ── 4. Fallback top-3 eliminado ──
  await test('sin cruce: citations=[] y docs en documentosConsultados (adiós top-3)', async () => {
    const { r } = await correr(['Respuesta sin ninguna cita legal. ⚖️ Verifica en DOF.'], 'sombra');
    assert.equal(r.citations.length, 0, 'JAMÁS docs adjuntados como "referencias usadas"');
    assert.equal(r.documentosConsultados.length, DOCS.length);
    assert.ok(r.documentosConsultados.every(d => d.reference && d.source));
  });

  // ── 5. Confianza determinista ──
  await test('confianza determinista: misma entrada → mismo número (sin Math.random)', async () => {
    const a = await correr([RESPUESTA_BUENA], 'sombra');
    const b = await correr([RESPUESTA_BUENA], 'sombra');
    assert.equal(a.r.confidence, b.r.confidence);
  });

  await test('el código del Copilot ya no contiene Math.random ni el fallback top-3', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../services/copilot.ts'), 'utf8');
    assert.ok(!/Math\.random/.test(src), 'queda Math.random en la confianza');
    assert.ok(!/docs\.slice\(0,\s*3\)/.test(src), 'queda el fallback top-3');
  });

  // ── Limpieza ──
  const del = await prisma.copilotConsult.deleteMany({ where: { tenantId: TEST_TENANT } });
  console.log(`\n  (limpieza: ${del.count} consultas de prueba eliminadas)`);

  console.log(`\n${passed} pasaron, ${failed} fallaron\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
