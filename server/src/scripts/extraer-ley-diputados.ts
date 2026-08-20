/**
 * CORPUS ÍNTEGRO · EXTRACTOR DE LEYES DE DIPUTADOS (plan §2, reusable por lote)
 *
 * Ejecutar:
 *   npx tsx src/scripts/extraer-ley-diputados.ts \
 *     --txt <ley.txt> --source Ley_Aduanera --cuerpo LA --tipo ley \
 *     --url https://... --fechaOriginal 1995-12-15 --cotejo 2026-08-19 \
 *     --out prisma/seed/corpus-integro/lote1-ley-aduanera.json \
 *     [--transitoriosDOF 19-11-2025]
 *
 * Entrada: TXT convertido del DOC oficial de Diputados (textutil -convert txt).
 * Salida: JSON de DocCorpusIntegro[] — TODO verbatim:
 *  - un doc por artículo (header "ARTICULO N." / "N-A" / "N bis M");
 *  - artículos monstruo (>8,000 chars con ≥3 fracciones romanas) → un doc por
 *    fracción, content = encabezado del artículo + fracción (ambos verbatim);
 *  - publishedDate POR ARTÍCULO = última fecha DOF de sus anotaciones de
 *    reforma ("Artículo reformado DOF ..."), fallback fecha original de la ley;
 *  - title = primeras palabras del artículo (verbatim truncado — CERO redacción);
 *  - topics = escaneo determinista contra TOPIC_KEYWORDS del retrieval;
 *  - opcional: un doc "Transitorios DOF <fecha> <cuerpo>" con el bloque del
 *    decreto de reforma indicado.
 *
 * El extractor NO escribe a DB: produce el JSON que valida corpus-validador
 * y siembra seed-corpus-integro. Cadena completa fail-closed.
 */

import * as fs from 'fs';
import { TOPIC_KEYWORDS } from '../services/rag-search';
import { parseReferencia } from '../services/citas-legales';
import type { DocCorpusIntegro } from '../lib/corpus-validador';

function arg(nombre: string, def?: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (def !== undefined) return def;
  console.error(`Falta --${nombre}`);
  process.exit(1);
}

const HEADER_RE = /^ART[IÍ]CULO\s+(\d+(?:o\.)?(?:\s*(?:[Bb]is|[Tt]er|[Qq]u[aá]ter)(?:\s+\d+)?)?(?:-[A-Z])?)\s*[.\-–]*\s*(.*)$/;
// includes() y no regex: la Í del DOC puede venir como combinante (I+U+0301)
const esFinCuerpo = (l: string) => l.normalize('NFC').includes('TRANSITORIOS DE DECRETOS DE REFORMA');
const FRACCION_RE = /^([IVXLC]+)\.\s/;
const DOF_RE = /DOF\s+(\d{2})-(\d{2})-(\d{4})/g;
const UMBRAL_MONSTRUO = 8000;

function normalizarNumero(raw: string): string {
  // "1o." → "1"; "9o.-A" → "9-A"; "58" → "58"; "137 bis 1" queda textual
  // (el reference usa la forma textual; parseReferencia normaliza ambos lados).
  return raw.replace(/o\.(?=-|$)/, '').replace(/\.$/, '').trim();
}

function fechaDeChunk(texto: string, fallback: string): string {
  let max = '';
  for (const m of texto.matchAll(DOF_RE)) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (iso > max) max = iso;
  }
  return max || fallback;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function topicsDe(texto: string): string[] {
  // Frontera de palabra: 'iva' NO debe matchear "derivadas" (el escaneo es
  // metadata determinista, pero un topic falso envenena el hard-filter).
  const lower = texto.toLowerCase();
  const topics: string[] = [];
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    const hit = kws.some(k =>
      new RegExp(`(^|[^a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f10-9])${escapeRe(k.toLowerCase())}($|[^a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f10-9])`).test(lower));
    if (hit) topics.push(topic);
  }
  return topics;
}

function tituloVerbatim(cuerpoArt: string): string {
  const primera = cuerpoArt.trim().split('\n')[0] ?? '';
  return primera.length > 90 ? `${primera.slice(0, 90).trimEnd()}…` : (primera || '(sin texto inicial)');
}

function main() {
  const txtPath = arg('txt');
  const source = arg('source');
  const cuerpo = arg('cuerpo');
  const tipo = arg('tipo');
  const url = arg('url');
  const fechaOriginal = arg('fechaOriginal');
  const cotejo = arg('cotejo');
  const out = arg('out');
  const transitoriosDOF = arg('transitoriosDOF', '');

  const lineas = fs.readFileSync(txtPath, 'utf8').split('\n');

  // ── Cuerpo: [primer header .. FIN_CUERPO) ──
  const headers: { idx: number; numero: string }[] = [];
  let finCuerpo = lineas.length;
  for (let i = 0; i < lineas.length; i++) {
    if (esFinCuerpo(lineas[i]!)) { finCuerpo = i; break; }
    const m = HEADER_RE.exec(lineas[i]!);
    if (m) headers.push({ idx: i, numero: normalizarNumero(m[1]!) });
  }
  console.log(`Cuerpo: ${headers.length} artículos (fin del cuerpo en línea ${finCuerpo})`);

  const docs: DocCorpusIntegro[] = [];
  for (let h = 0; h < headers.length; h++) {
    const ini = headers[h]!.idx;
    const fin = h + 1 < headers.length ? headers[h + 1]!.idx : finCuerpo;
    const numero = headers[h]!.numero;
    const chunk = lineas.slice(ini, fin).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const reference = `Art. ${numero} ${cuerpo}`;
    if (!parseReferencia(reference)) {
      console.error(`✗ referencia no parseable, se ABORTA: "${reference}" (línea ${ini + 1})`);
      process.exit(1);
    }
    const base = {
      source, type: tipo, officialUrl: url,
      publishedDate: fechaDeChunk(chunk, fechaOriginal),
      fechaCotejo: cotejo,
      claseTexto: 'texto_integro' as const,
    };

    // Artículo monstruo → un doc por fracción romana
    const cuerpoSinHeader = chunk.split('\n').slice(0, 1).join('') === lineas[ini] ? chunk : chunk;
    const lineasChunk = chunk.split('\n');
    const idxFracciones = lineasChunk
      .map((l, i) => ({ l, i }))
      .filter(x => FRACCION_RE.test(x.l.trim()));
    const romanos = idxFracciones.map(x => FRACCION_RE.exec(x.l.trim())![1]!);
    const seriesUnicas = new Set(romanos).size === romanos.length;
    // Series repetidas (dos apartados con fracción I…) → NO se trocea: doc entero.
    if (chunk.length > UMBRAL_MONSTRUO && idxFracciones.length >= 3 && seriesUnicas) {
      const intro = lineasChunk.slice(0, idxFracciones[0]!.i).join('\n').trim();
      for (let f = 0; f < idxFracciones.length; f++) {
        const fIni = idxFracciones[f]!.i;
        const fFin = f + 1 < idxFracciones.length ? idxFracciones[f + 1]!.i : lineasChunk.length;
        const romano = FRACCION_RE.exec(lineasChunk[fIni]!.trim())![1]!;
        const fraccionTexto = lineasChunk.slice(fIni, fFin).join('\n').trim();
        const refF = `Art. ${numero} fracción ${romano} ${cuerpo}`;
        if (!parseReferencia(refF)) {
          console.error(`✗ referencia de fracción no parseable, se ABORTA: "${refF}"`);
          process.exit(1);
        }
        docs.push({
          ...base,
          reference: refF,
          title: tituloVerbatim(fraccionTexto.replace(FRACCION_RE, '')),
          // Verbatim contiguo: encabezado del artículo + la fracción.
          content: `${intro}\n\n${fraccionTexto}`,
          topics: topicsDe(`${intro} ${fraccionTexto}`),
        });
      }
      console.log(`  Art. ${numero}: monstruo (${chunk.length} chars) → ${idxFracciones.length} docs por fracción`);
    } else {
      docs.push({
        ...base,
        reference,
        title: tituloVerbatim(chunk.replace(HEADER_RE, '$2')),
        content: chunk,
        topics: topicsDe(chunk),
      });
    }
    void cuerpoSinHeader;
  }

  // ── Transitorios del decreto indicado (un doc) ──
  if (transitoriosDOF) {
    const [dd, mm, yyyy] = transitoriosDOF.split('-');
    const fechaLarga = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`)
      .toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const idxPub = lineas.findIndex((l, i) => i >= finCuerpo && l.includes(fechaLarga) && /Publicad[oa]s? en el Diario Oficial/.test(l));
    if (idxPub < 0) {
      console.error(`✗ no encontré el bloque de transitorios del DOF ${transitoriosDOF} ("${fechaLarga}") — se ABORTA`);
      process.exit(1);
    }
    let iniBloque = idxPub;
    for (let i = idxPub; i > finCuerpo; i--) {
      if (/^(DECRETO|LEY|REGLAS|ACUERDO)\b/.test(lineas[i]!.trim())) { iniBloque = i; break; }
    }
    let finBloque = lineas.length;
    for (let i = idxPub + 1; i < lineas.length; i++) {
      if (/^(DECRETO|LEY|REGLAS|ACUERDO)\b/.test(lineas[i]!.trim()) && /Publicad/.test(lineas.slice(i, i + 6).join(' '))) { finBloque = i; break; }
    }
    const bloque = lineas.slice(iniBloque, finBloque).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const refT = `Transitorios DOF ${transitoriosDOF} ${cuerpo}`;
    if (!parseReferencia(refT)) { console.error(`✗ "${refT}" no parseable`); process.exit(1); }
    docs.push({
      source, type: tipo, officialUrl: url,
      publishedDate: `${yyyy}-${mm}-${dd}`,
      fechaCotejo: cotejo,
      claseTexto: 'texto_integro',
      reference: refT,
      title: tituloVerbatim(bloque),
      content: bloque,
      topics: topicsDe(bloque),
    });
    console.log(`  Transitorios DOF ${transitoriosDOF}: líneas ${iniBloque + 1}-${finBloque} (${bloque.length} chars)`);
  }

  fs.writeFileSync(out, JSON.stringify(docs, null, 1));
  const monstruos = docs.filter(d => d.reference.includes('fracción')).length;
  console.log(`Salida: ${out} — ${docs.length} docs (${monstruos} por-fracción) · ${Math.round(docs.reduce((s, d) => s + d.content.length, 0) / 1024)} KB verbatim`);
}

main();
