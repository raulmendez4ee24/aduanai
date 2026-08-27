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

  await test('matcher: el doc "GRI 1-6 LIGIE" respalda "Regla General 3", "Regla General 3 a) (RGI)" y "RGI 3" (rango)', () => {
    // Prod 27-ago (estricta): "Explica la GRI 3" se DEGRADABA porque el doc del
    // corpus se llama "GRI 1-6 LIGIE" y parseReferencia no le daba clave.
    const doc = parseReferencia('GRI 1-6 LIGIE');
    assert.ok(doc && doc.tipo === 'rgi', 'GRI 1-6 LIGIE debe parsear como rgi');
    const r = cruzarCitas('Conforme a la Regla General 3 a) (RGI) y la Regla General 3, ver también RGI 6.', ['GRI 1-6 LIGIE']);
    assert.deepEqual(r.noRespaldadas, []);
    const fuera = cruzarCitas('Según la Regla General 7 (RGI).', ['GRI 1-6 LIGIE']);
    assert.deepEqual(fuera.noRespaldadas, ['Regla General 7 (RGI)']);
    // Un rango NO respalda un artículo ni un doc de otro cuerpo
    assert.ok(cruzarCitas('Art. 3 LA', ['GRI 1-6 LIGIE']).noRespaldadas.length === 1);
  });

  await test('matcher: docs con referencia compuesta (rango, lista, doble, sufijo) sí respaldan citas', () => {
    // Censo 27-ago: 8/45 docs activos no obtenían clave → toda cita a ellos era
    // "fantasma" y estricta degradaba respuestas correctas.
    const r = cruzarCitas(
      'Ver Art. 75 LCE y Art. 89 LCE; la Regla 7.1.2 RGCE 2026; Art. 28-A LIVA y Art. 86-A LA; el Anexo 4-B TMEC.',
      ['Art. 73-89 LCE', 'Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026', 'Art. 28-A párr. final LIVA · Art. 86-A fr. I LA', 'TMEC Anexo 4-B (automotriz)'],
    );
    assert.deepEqual(r.noRespaldadas, []);
    // Fuera de rango / lista → sigue siendo fantasma
    const f = cruzarCitas('Art. 90 LCE y Regla 7.1.4 RGCE 2026.', ['Art. 73-89 LCE', 'Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026']);
    assert.deepEqual(f.noRespaldadas, ['Art. 90 LCE', 'Regla 7.1.4 RGCE 2026']);
    assert.deepEqual(cruzarCitas('Ver TMEC Cap. 4.', ['TMEC Capítulo 4 — Textiles']).noRespaldadas, []);
    // "Art. 28-A" NO es rango 28..A
    assert.equal(cruzarCitas('Art. 28 LIVA', ['Art. 28-A LIVA']).noRespaldadas.length, 1);
  });

  await test('cruzarCitas: cita sin cuerpo — único match respalda, ambigüedad NO', () => {
    const unico = cruzarCitas('Ver el Art. 54.', ['Art. 54 LA', 'Art. 27 LIVA']);
    assert.equal(unico.noRespaldadas.length, 0);
    const ambiguo = cruzarCitas('Ver el Art. 54.', ['Art. 54 LA', 'Art. 54 LIVA']);
    assert.equal(ambiguo.noRespaldadas.length, 1, 'ambigüedad = no respaldada');
  });

  // Formas conocidas de falso positivo del matcher (misión cierre 25-ago-2026):
  // corregidas ANTES de encender COPILOT_CITA_ESTRICTA=estricta en prod.
  await test('matcher: cuerpo genérico "de la Ley" no es un cuerpo — cruza como sin-cuerpo', () => {
    // Caso real de prod (cmt7i7r81…): "Art. 49 de la Ley" con doc "Art. 49 LFD"
    // quedaba fantasma porque "Ley" se normalizaba al cuerpo literal "LEY".
    const fp = cruzarCitas('La tasa del DTA la fija el Art. 49 de la Ley.', ['Art. 49 LFD']);
    assert.equal(fp.noRespaldadas.length, 0, 'genérico + único candidato = respaldada');
    // La ambigüedad sigue fail-closed:
    const amb = cruzarCitas('La tasa la fija el Art. 49 de la Ley.', ['Art. 49 LFD', 'Art. 49 LA']);
    assert.equal(amb.noRespaldadas.length, 1, 'genérico + 2 candidatos = no respaldada');
  });

  await test('matcher: "Capítulo 5 del T-MEC" se extrae en ambos órdenes', () => {
    const inverso = cruzarCitas('Conforme al Capítulo 5 del T-MEC procede la certificación.', ['TMEC Cap. 5']);
    assert.equal(inverso.citadas.length, 1, 'el orden "Capítulo N del T-MEC" debe extraerse');
    assert.equal(inverso.noRespaldadas.length, 0);
    const directo = cruzarCitas('Conforme al TMEC Cap. 5 procede.', ['Capítulo 5 del T-MEC']);
    assert.equal(directo.noRespaldadas.length, 0);
    // Sin respaldo sigue siendo fantasma:
    const sin = cruzarCitas('Conforme al Capítulo 7 T-MEC.', ['TMEC Cap. 5']);
    assert.equal(sin.noRespaldadas.length, 1);
  });

  await test('matcher: "Arts. 54 y 162 LA" expande la lista con el cuerpo compartido', () => {
    const r = cruzarCitas('Según los Arts. 54 y 162 LA responde el agente.', ['Art. 54 LA', 'Art. 162 LA']);
    assert.equal(r.citadas.length, 2, 'la lista debe producir una clave por artículo');
    assert.equal(r.noRespaldadas.length, 0);
    const parcial = cruzarCitas('Según los Arts. 54 y 162 LA responde el agente.', ['Art. 54 LA']);
    assert.equal(parcial.noRespaldadas.length, 1, 'el 162 sin doc sigue fantasma');
    const conDeLa = cruzarCitas('Los Artículos 36, 54 y 162 de la LA obligan.', ['Art. 36 LA', 'Art. 54 LA', 'Art. 162 LA']);
    assert.equal(conDeLa.noRespaldadas.length, 0);
    // Un número suelto tras "y" SIN plural ni cuerpo no inventa citas:
    const suelto = cruzarCitas('El Art. 54 y 30 días de plazo.', ['Art. 54 LA']);
    assert.deepEqual(suelto.citadas.map(c => c.clave.numero), ['54']);
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
