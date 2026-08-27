/**
 * Ola 2 — Copilot en el contexto del cliente + precedentes por fracción +
 * importación de corpus/precedentes (Operación 2026-08).
 *
 *   npm run test:copilot-contexto
 *
 * Parte PURA: el bloque operativo se etiqueta, no contiene patrones de cita y
 * sin datos no existe.
 * Parte INYECTADA (sin LLM real): el bloque entra al prompt del usuario y al
 * system prompt, las citas del corpus siguen cruzando, y con contexto null el
 * prompt no lleva el bloque.
 * Parte DB (tenant propio, se limpia): construirContextoOperativo lee saldos
 * de temporales por clave y datos del cliente; otro tenant no ve nada.
 * Precedentes: por fracción devuelve estado honesto con el flag apagado.
 * Importación: valida reference/cotejo/url y dedupea por contentHash.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { askCopilotWithRAG } from '../services/copilot';
import {
  construirContextoOperativo, renderizarBloqueContexto,
  MARCA_INICIO_CONTEXTO, MARCA_FIN_CONTEXTO, type ContextoOperativo,
} from '../services/copilot-contexto';
import { cruzarCitas, parseReferencia } from '../services/citas-legales';
import type { smartRetrieval, RetrievedDoc } from '../services/rag-search';
import { precedentesPorFraccion } from '../services/precedent-lookup';
import { validarFilaLegalDoc, validarFilaPrecedente, importarLegalDocs, importarPrecedentes, parsearArchivoImportacion } from '../services/corpus-importador';

const SUFIJO = `ola2ctx${Date.now().toString(36)}`;
let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
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
const DOCS = [doc('Art. 108 LA', 'd1'), doc('Regla 4.3.1 RGCE 2026', 'd2')];
const retrievalFake = (async () => ({ docs: DOCS, shouldRespond: true, reason: 'ok', averageRelevance: 80, detectedTopics: ['aduanas'] })) as unknown as typeof smartRetrieval;

function generador(texto: string) {
  const llamadas: { system: string; user: string }[] = [];
  const fn = (async (args: { system: string; user: string }) => {
    llamadas.push({ system: args.system, user: args.user });
    return { text: texto, model: 'fake', provider: 'test', inputTokens: 0, outputTokens: 0 };
  }) as never;
  return { fn, llamadas };
}

const CTX: ContextoOperativo = {
  cliente: { rfc: 'MAQ010101AB1', razonSocial: 'Maquila Norte', programaIMMEX: 'IMMEX 1234-2020', certificacionIVAIEPS: 'AA', padronImportadores: true, padronesSectoriales: ['15'] },
  temporales: [{
    clave: 'IN', pedimentos: 3, saldoTotal: 1500,
    porVencer: [{ pedimento: '25 47 3461 4000284', fraccion: '73181501', saldo: 500, unidad: 'PZA', vence: '2026-09-15', diasRestantes: 19 }],
  }],
  padronesTenant: [],
  ultimasFracciones: ['73181501', '84713001'],
  generadoAt: '2026-08-27T00:00:00.000Z',
};

async function partePura() {
  console.log('— bloque operativo (puro) —');
  await prueba('con datos: bloque etiquetado, con pedimentos y saldos reales; sin patrones de cita legal', () => {
    const b = renderizarBloqueContexto(CTX);
    assert.ok(b.startsWith(`\n${MARCA_INICIO_CONTEXTO}`));
    assert.ok(b.trimEnd().endsWith(MARCA_FIN_CONTEXTO));
    assert.match(b, /Clave IN: 3 pedimento\(s\) con saldo, total 1500 unidades/);
    assert.match(b, /Pedimento 25 47 3461 4000284, fracción 7318\.15\.01, saldo 500 PZA, vence en 19 días/);
    assert.match(b, /modalidad AA/);
    assert.match(b, /IMMEX 1234-2020/);
    // El matcher de citas no debe encontrar NADA citable dentro del bloque.
    const cruce = cruzarCitas(b, DOCS.map(d => d.reference));
    assert.equal(cruce.noRespaldadas.length, 0, `el bloque contiene patrones de cita: ${cruce.noRespaldadas.join(', ')}`);
    assert.equal(cruce.respaldadas.size, 0);
  });
  await prueba('sin datos → cadena vacía (no se inventa un bloque)', () => {
    assert.equal(renderizarBloqueContexto(null), '');
    assert.equal(renderizarBloqueContexto({ cliente: null, temporales: [], padronesTenant: [], ultimasFracciones: [], generadoAt: 'x' }), '');
  });
  await prueba('cliente sin certificación: el bloque lo dice explícito (no asume que la tiene)', () => {
    const b = renderizarBloqueContexto({ ...CTX, cliente: { ...CTX.cliente!, certificacionIVAIEPS: null } });
    assert.match(b, /no registrada en el sistema/);
  });
}

async function parteInyectada() {
  console.log('— Copilot con contexto inyectado (sin LLM) —');
  process.env.COPILOT_CITA_ESTRICTA = 'estricta';
  const tenantId = `t-${SUFIJO}`;
  await prueba('el bloque entra al prompt del usuario y al system prompt; las citas del corpus siguen respaldadas', async () => {
    const gen = generador('Puedes transferir con V1 conforme al Art. 108 LA.\n\nDatos de tu operación\nTienes 3 pedimentos IN con saldo; el 25 47 3461 4000284 vence primero.\n\n⚖️ Esta información referencia disposiciones legales.');
    const r = await askCopilotWithRAG(
      { question: '¿Puedo transferir con V1?', tenantId, userId: 'u1', clienteId: 'c1' },
      { generar: gen.fn, recuperar: retrievalFake, contexto: async () => CTX },
    );
    assert.equal(gen.llamadas.length, 1, 'sin regeneración: la cita cruza');
    const { user, system } = gen.llamadas[0]!;
    assert.ok(user.includes(MARCA_INICIO_CONTEXTO), 'bloque en el prompt');
    assert.ok(user.includes('25 47 3461 4000284'));
    assert.ok(user.indexOf('[FIN DEL CONTEXTO]') < user.indexOf(MARCA_INICIO_CONTEXTO), 'el bloque va DESPUÉS del contexto legal, separado');
    assert.ok(system.includes('DATOS DE TU OPERACIÓN'), 'instrucción en el system prompt');
    assert.ok(system.includes('NO son fuente legal'));
    assert.deepEqual(r.citaEstricta.noRespaldadas, []);
    assert.equal(r.citations.length, 1);
    assert.equal(r.citations[0]!.reference, 'Art. 108 LA');
    assert.equal(r.citaEstricta.degradada, false);
    assert.deepEqual(r.contextoOperativo, { temporalesConSaldo: 3, clienteRfc: 'MAQ010101AB1', generadoAt: CTX.generadoAt });
  });
  await prueba('sin datos (contexto null) → el prompt NO lleva el bloque ni la instrucción', async () => {
    const gen = generador('Respuesta legal (Art. 108 LA).\n\n⚖️ disclaimer');
    const r = await askCopilotWithRAG(
      { question: '¿Puedo transferir con V1? (sin datos)', tenantId, userId: 'u1', clienteId: null },
      { generar: gen.fn, recuperar: retrievalFake, contexto: async () => null },
    );
    assert.ok(!gen.llamadas[0]!.user.includes(MARCA_INICIO_CONTEXTO));
    assert.ok(!gen.llamadas[0]!.system.includes('DATOS DE TU OPERACIÓN'));
    assert.equal(r.contextoOperativo, null);
  });
  await prueba('si la lectura del contexto truena, el Copilot responde igual (falla suave)', async () => {
    const gen = generador('Respuesta legal (Art. 108 LA).\n\n⚖️ disclaimer');
    const r = await askCopilotWithRAG(
      { question: '¿Puedo transferir con V1? (contexto roto)', tenantId, userId: 'u1' },
      { generar: gen.fn, recuperar: retrievalFake, contexto: async () => { throw new Error('db caída'); } },
    );
    assert.equal(r.contextoOperativo, null);
    assert.equal(r.citations.length, 1);
  });
  await prueba('una cita inventada en la respuesta sigue cayendo en el fail-closed aunque haya bloque operativo', async () => {
    const gen = generador('Aplica la Regla 9.9.9 RGCE 2026.\n\nDatos de tu operación\nTienes 3 pedimentos IN.\n\n⚖️ d');
    const r = await askCopilotWithRAG(
      { question: '¿Puedo transferir con V1? (inventada)', tenantId, userId: 'u1' },
      { generar: gen.fn, recuperar: retrievalFake, contexto: async () => CTX },
    );
    assert.equal(r.citaEstricta.regenerada, true);
    assert.equal(r.citaEstricta.degradada, true);
  });
  await prisma.copilotConsult.deleteMany({ where: { tenantId } });
}

async function parteDB() {
  console.log('— contexto desde la base (tenant propio) —');
  const tenant = await prisma.tenant.create({ data: { name: `Ctx ${SUFIJO}`, status: 'ACTIVE' } });
  const otro = await prisma.tenant.create({ data: { name: `Otro ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: `${SUFIJO}@test.local`, password: 'x', name: 'T', role: 'ADMIN', tenantId: tenant.id } });
  const cliente = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `RFC${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Maquila Ctx', programaIMMEX: 'IMMEX-999', certificacionIVAIEPS: 'A', padronImportadores: true, padronesSectoriales: ['15'] } });
  const ahora = new Date('2026-08-27T12:00:00Z');
  const limpiar = async () => {
    await prisma.temporaryImport.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otro.id] } } });
  };
  try {
    const base = { tenantId: tenant.id, userId: user.id, clienteId: cliente.id, description: 'x', unit: 'PZA', customsValue: 100, entryDate: new Date('2026-01-10'), status: 'ACTIVE' as const };
    await prisma.temporaryImport.createMany({ data: [
      { ...base, pedimento: '26 47 3461 6000001', fractionCode: '73181501', quantity: 1000, quantityDischarged: 400, expirationDate: new Date('2026-09-20'), claveDocumento: 'IN' },
      { ...base, pedimento: '26 47 3461 6000002', fractionCode: '73181501', quantity: 200, quantityDischarged: 0, expirationDate: new Date('2027-03-01'), claveDocumento: 'IN' },
      { ...base, pedimento: '26 47 3461 6000003', fractionCode: '84713001', quantity: 10, quantityDischarged: 10, expirationDate: new Date('2026-09-01'), claveDocumento: 'IN' }, // sin saldo: no cuenta
      { ...base, pedimento: '26 47 3461 6000004', fractionCode: '84713001', quantity: 5, quantityDischarged: 0, expirationDate: new Date('2028-01-01'), claveDocumento: 'AF' },
    ] });
    await prueba('saldos por clave: IN=2 pedimentos (600+200), AF=1; solo el que vence ≤60 días aparece en porVencer', async () => {
      const ctx = await construirContextoOperativo(tenant.id, cliente.id, ahora);
      assert.ok(ctx);
      const IN = ctx.temporales.find(t => t.clave === 'IN')!;
      const AF = ctx.temporales.find(t => t.clave === 'AF')!;
      assert.equal(IN.pedimentos, 2); assert.equal(IN.saldoTotal, 800);
      assert.equal(IN.porVencer.length, 1); assert.equal(IN.porVencer[0]!.pedimento, '26 47 3461 6000001'); assert.equal(IN.porVencer[0]!.saldo, 600);
      assert.equal(AF.pedimentos, 1); assert.equal(AF.saldoTotal, 5);
      assert.equal(ctx.cliente?.certificacionIVAIEPS, 'A');
      assert.equal(ctx.cliente?.programaIMMEX, 'IMMEX-999');
    });
    await prueba('otro tenant no ve nada → null (sin bloque)', async () => {
      assert.equal(await construirContextoOperativo(otro.id, null, ahora), null);
    });
    await prueba('cliente de otro tenant no se lee aunque se pase su id', async () => {
      const ctx = await construirContextoOperativo(otro.id, cliente.id, ahora);
      assert.equal(ctx, null);
    });
  } finally { await limpiar(); }
}

async function partePrecedentes() {
  console.log('— precedentes por fracción (flag apagado → honesto) —');
  await prueba('por fracción: verificados=0 y mensaje honesto; nunca lista tesis sin fuente', async () => {
    const r = await precedentesPorFraccion('73181501');
    assert.equal(r.verificados, 0);
    assert.equal(r.criterios, 0);
    assert.equal(r.tesis, 0);
    assert.deepEqual(r.items, []);
    assert.match(r.mensaje, /sin precedentes verificados/i);
    assert.equal(r.corpusVerificado, false);
  });
}

async function parteImportacion() {
  console.log('— importación de corpus/precedentes —');
  await prueba('fila de LegalDocument: reference sin clave parseable → rechazo; sin fechaCotejo/officialUrl → no verificado', () => {
    assert.ok(parseReferencia('Art. 54 LA'));
    const mala = validarFilaLegalDoc({ reference: 'Documento sin clave', title: 't', source: 'LA', content: 'x'.repeat(40) });
    assert.equal(mala.ok, false);
    assert.match(mala.errores.join(' '), /reference/);
    const noVer = validarFilaLegalDoc({ reference: 'Art. 54 LA', title: 'Art. 54', source: 'Ley_Aduanera', content: 'x'.repeat(40), claseTexto: 'texto_integro' });
    assert.equal(noVer.ok, true);
    assert.equal(noVer.verificado, false);
    assert.match(noVer.avisos.join(' '), /fechaCotejo|officialUrl/);
    const ver = validarFilaLegalDoc({ reference: 'Art. 54 LA', title: 'Art. 54', source: 'Ley_Aduanera', content: 'x'.repeat(40), claseTexto: 'texto_integro', fechaCotejo: '2026-08-01', officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf' });
    assert.equal(ver.verificado, true);
  });
  await prueba('fila de precedente: reference con placeholder XX o sin fuente oficial → no verificado', () => {
    const r = validarFilaPrecedente({ reference: 'Tesis V-P-2aS-XX/2023', title: 't', type: 'TFJA', topic: 'origen', summary: 's', ruling: 'r', reasoning: 'z', yearPublished: 2023 });
    assert.equal(r.ok, false);
    const r2 = validarFilaPrecedente({ reference: 'Tesis IX-P-2aS-123', title: 't', type: 'TFJA', topic: 'origen', summary: 's', ruling: 'r', reasoning: 'z', yearPublished: 2023, officialUrl: 'https://www.tfja.gob.mx/x', fechaCotejo: '2026-08-01' });
    assert.equal(r2.ok, true); assert.equal(r2.verificado, true);
  });
  await prueba('parsea CSV y JSON con las columnas documentadas', () => {
    const csv = 'reference,title,source,content\n"Art. 1 LA","Uno","Ley_Aduanera","contenido"\n';
    const filas = parsearArchivoImportacion(Buffer.from(csv).toString('base64'), 'a.csv');
    assert.equal(filas.length, 1); assert.equal(filas[0]!.reference, 'Art. 1 LA');
    const json = JSON.stringify([{ reference: 'Art. 2 LA', title: 'Dos', source: 'Ley_Aduanera', content: 'c' }]);
    assert.equal(parsearArchivoImportacion(Buffer.from(json).toString('base64'), 'a.json')[0]!.title, 'Dos');
  });
  const ref = `Art. 9999 LA`;
  const source = `TEST_${SUFIJO}`;
  const filas = [
    { reference: ref, title: 'Prueba importación', source, content: `Contenido de prueba ${SUFIJO}. `.repeat(3), claseTexto: 'resumen', officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf', fechaCotejo: '2026-08-01' },
    { reference: ref, title: 'Prueba importación', source, content: `Contenido de prueba ${SUFIJO}. `.repeat(3), claseTexto: 'resumen' }, // duplicado exacto
    { reference: 'sin clave', title: 'x', source, content: 'y' },
  ];
  try {
    await prueba('importar legal-docs: crea 1, dedupea 1 por contentHash, rechaza 1; embeddings inyectados (sin proveedor real)', async () => {
      const embed = async () => new Array(8).fill(0.1);
      const r = await importarLegalDocs(filas, { embed, validarDim: () => {} });
      assert.equal(r.creados, 1); assert.equal(r.duplicados, 1); assert.equal(r.rechazados, 1);
      assert.equal(r.filas.length, 3);
      assert.equal(r.filas[1]!.estado, 'duplicado');
      const fila = await prisma.legalDocument.findFirst({ where: { source, reference: ref } });
      assert.ok(fila); assert.equal(fila.fechaCotejo?.toISOString().slice(0, 10), '2026-08-01');
      // segunda corrida: todo duplicado (idempotente)
      const r2 = await importarLegalDocs(filas.slice(0, 1), { embed, validarDim: () => {} });
      assert.equal(r2.duplicados, 1); assert.equal(r2.creados, 0);
    });
    await prueba('importar precedentes: sin flag encendido quedan cargados pero NO se sirven; dedupe por (type, reference)', async () => {
      const fila = { reference: `Tesis IX-P-2aS-${SUFIJO}`, title: 'Tesis de prueba', type: 'TFJA', topic: 'origen', summary: 's', ruling: 'r', reasoning: 'z', yearPublished: 2025, officialUrl: 'https://www.tfja.gob.mx/x', fechaCotejo: '2026-08-01', fractionCodes: '73181501' };
      const r = await importarPrecedentes([fila, fila]);
      assert.equal(r.creados, 1); assert.equal(r.duplicados, 1);
      const pf = await precedentesPorFraccion('73181501');
      assert.equal(pf.verificados, 0, 'flag apagado: no se sirve aunque exista fila con fuente');
      await prisma.legalPrecedent.deleteMany({ where: { reference: fila.reference } });
    });
  } finally {
    await prisma.legalDocument.deleteMany({ where: { source } });
  }
}

async function main() {
  console.log('\n== Ola 2 — Copilot contexto · precedentes por fracción · importación ==');
  await partePura();
  await parteInyectada();
  await parteDB();
  await partePrecedentes();
  await parteImportacion();
  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
