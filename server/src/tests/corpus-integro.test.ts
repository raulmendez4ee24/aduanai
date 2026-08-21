/**
 * Test del CORPUS ÍNTEGRO — lote 0 (infraestructura + validador).
 *
 * Ejecutar:  npx tsx src/tests/corpus-integro.test.ts
 *
 * Criterio de salida del plan (§4 lote 0): el validador rechaza referencia
 * no parseable, URL rota, contenido vacío y síntesis disfrazada; la
 * priorización del retrieval hace que el texto íntegro mande sobre el
 * resumen (boost + dedup por referencia). Sin LLM, sin red (urlCheck fake),
 * sin escrituras.
 */

import { strict as assert } from 'node:assert';
import { validarLote, validarDocumento, type DocCorpusIntegro, type UrlCheck } from '../lib/corpus-validador';
import { priorizarTextoIntegro } from '../services/rag-search';
import type { RetrievedDoc } from '../services/rag-search';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

const urlOk: UrlCheck = async () => 200;
const url404: UrlCheck = async () => 404;

function docValido(overrides: Partial<DocCorpusIntegro> = {}): DocCorpusIntegro {
  return {
    source: 'Ley_Aduanera',
    reference: 'Art. 54 LA',
    title: 'Responsabilidad del agente aduanal por la veracidad de los datos',
    content: 'El agente aduanal será responsable de la veracidad y exactitud de los datos e información suministrados, de la determinación del régimen aduanero de las mercancías y de su correcta clasificación arancelaria.',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
    publishedDate: '2025-11-19',
    fechaCotejo: '2026-08-19',
    claseTexto: 'texto_integro',
    type: 'ley',
    topics: ['agente_aduanal'],
    ...overrides,
  };
}

function rdoc(reference: string, claseTexto: string, finalScore: number, id = ''): RetrievedDoc {
  return {
    id: id || `${reference}-${claseTexto}`, type: 'ley', claseTexto, source: 'LA', title: reference,
    reference, content: 'x', excerpt: 'x', officialUrl: null, effectiveDate: null,
    topics: [], keywords: [], fractionRefs: [], similarity: 0, keywordScore: 0, finalScore,
  };
}

async function main() {
  console.log('\n== CORPUS ÍNTEGRO — lote 0 (validador + priorización) ==');

  await test('documento válido pasa sin errores', async () => {
    assert.deepEqual(await validarDocumento(docValido(), urlOk), []);
  });

  await test('rechaza referencia no parseable por el matcher', async () => {
    const errs = await validarDocumento(docValido({ reference: 'Articulo cincuenta y cuatro' }), urlOk);
    assert.ok(errs.some(e => e.includes('no parseable')));
  });

  await test('rechaza URL rota', async () => {
    const errs = await validarDocumento(docValido(), url404);
    assert.ok(errs.some(e => e.includes('HTTP 404')));
  });

  await test('rechaza contenido vacío y síntesis disfrazada de verbatim', async () => {
    assert.ok((await validarDocumento(docValido({ content: '  ' }), urlOk)).some(e => e.includes('vacío')));
    const sintesis = await validarDocumento(
      docValido({ content: 'En resumen, el artículo 54 establece que el agente aduanal es responsable de la veracidad de los datos suministrados en el despacho.' }),
      urlOk,
    );
    assert.ok(sintesis.some(e => e.includes('síntesis')));
  });

  await test('rechaza fechas ausentes, cotejo futuro y claseTexto incorrecta', async () => {
    assert.ok((await validarDocumento(docValido({ fechaCotejo: '' }), urlOk)).some(e => e.includes('fechaCotejo')));
    assert.ok((await validarDocumento(docValido({ fechaCotejo: '2030-01-01' }), urlOk)).some(e => e.includes('futuro')));
    assert.ok((await validarDocumento(docValido({ publishedDate: 'no-fecha' }), urlOk)).some(e => e.includes('publishedDate')));
    assert.ok((await validarDocumento(docValido({ claseTexto: 'resumen' as never }), urlOk)).some(e => e.includes('claseTexto')));
  });

  await test('un documento inválido rechaza el LOTE completo; duplicados también', async () => {
    const lote = await validarLote([docValido(), docValido({ reference: 'Art 999 XYZ inventado §', content: 'texto suficientemente largo para no fallar por longitud de contenido aquí' })], urlOk);
    assert.equal(lote.ok, false);
    const dup = await validarLote([docValido(), docValido()], urlOk);
    assert.ok(dup.errores.some(e => e.includes('duplicada')));
    const vacio = await validarLote([], urlOk);
    assert.ok(vacio.errores.some(e => e.includes('lote vacío')));
  });

  // ── Priorización del retrieval (plan §3) ──
  await test('boost: el íntegro con score menor le gana al resumen por +15%', () => {
    const out = priorizarTextoIntegro([
      rdoc('Art. 27 LIVA', 'resumen', 0.80, 'r1'),
      rdoc('Art. 54 LA', 'texto_integro', 0.75, 'i1'),
    ]);
    assert.equal(out[0]!.id, 'i1'); // 0.75×1.15=0.8625 > 0.80
    assert.equal(out.length, 2);    // referencias distintas: nadie se excluye
  });

  await test('dedup: el resumen del MISMO reference se excluye cuando compite el íntegro', () => {
    const out = priorizarTextoIntegro([
      rdoc('Art. 54 LA', 'resumen', 0.95, 'r54'),
      rdoc('Art. 54 LA', 'texto_integro', 0.60, 'i54'),
      rdoc('Regla 7.1.6 RGCE', 'resumen', 0.50, 'r716'),
    ]);
    assert.ok(!out.some(d => d.id === 'r54'), 'el resumen del Art. 54 debe excluirse');
    assert.ok(out.some(d => d.id === 'i54'));
    assert.ok(out.some(d => d.id === 'r716'), 'resúmenes sin íntegro competidor sobreviven');
  });

  await test('dedup por CLAVE parseada: "Art. 151 Ley Aduanera" (resumen) colapsa ante "Art. 151 LA" (íntegro)', () => {
    const out = priorizarTextoIntegro([
      rdoc('Art. 151 Ley Aduanera', 'resumen', 0.95, 'res-viejo'),
      rdoc('Art. 151 LA', 'texto_integro', 0.60, 'int-nuevo'),
    ]);
    assert.ok(!out.some(d => d.id === 'res-viejo'), 'el formato viejo del resumen no lo salva del dedup');
    assert.ok(out.some(d => d.id === 'int-nuevo'));
  });

  await test('sin íntegros no cambia nada (los 44 actuales siguen funcionando igual)', () => {
    const docs = [rdoc('Art. 54 LA', 'resumen', 0.9), rdoc('Art. 27 LIVA', 'resumen', 0.7)];
    const out = priorizarTextoIntegro(docs);
    assert.deepEqual(out.map(d => d.id), docs.map(d => d.id));
    assert.equal(out[0]!.finalScore, 0.9);
  });

  await test('glosario: tipo propio en el matcher — genérico cruza con apartado', async () => {
    const { parseReferencia, clavesIguales, cruzarCitas } = await import('../services/citas-legales');
    assert.deepEqual(parseReferencia('Glosario apartado III RGCE 2026'), { tipo: 'glosario', numero: 'III', cuerpo: 'RGCE' });
    assert.deepEqual(parseReferencia('Glosario de las RGCE'), { tipo: 'glosario', numero: '*', cuerpo: 'RGCE' });
    const a = parseReferencia('Glosario de las RGCE')!;
    const b = parseReferencia('Glosario apartado I RGCE 2026')!;
    assert.ok(clavesIguales(a, b), 'cita genérica respalda cualquier apartado');
    const cruce = cruzarCitas('Según el Glosario de las RGCE 2026, la ANAM es…', ['Glosario apartado I RGCE 2026', 'Regla 1.1.2 RGCE 2026']);
    assert.equal(cruce.noRespaldadas.length, 0);
    assert.equal(cruce.respaldadas.size, 1);
  });

  await test('taxonomía extendida: "recinto fiscalizado" ya es detectable', async () => {
    const { topicsDeTexto, detectQueryTopics } = await import('../services/rag-search');
    assert.ok(topicsDeTexto('las mercancías destinadas al régimen de recinto fiscalizado estratégico').includes('recinto_fiscalizado'));
    assert.ok(detectQueryTopics('¿qué mercancías no pueden destinarse al recinto fiscalizado estratégico?').includes('recinto_fiscalizado'));
    assert.ok(topicsDeTexto('la rectificación del pedimento procede cuando').includes('rectificacion'));
    assert.ok(topicsDeTexto('el agente aduanal integrará el expediente').includes('agente_aduanal'));
  });

  console.log(`\n${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
