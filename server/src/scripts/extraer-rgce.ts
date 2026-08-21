/**
 * CORPUS ÍNTEGRO · EXTRACTOR RGCE 2026 + COMPILACIÓN 1a RM (lote 2)
 *
 * Ejecutar:
 *   npx tsx src/scripts/extraer-rgce.ts --base <rgce2026.txt> --rm1 <1arm.txt> \
 *     --cotejo 2026-08-20 --out prisma/seed/corpus-integro/lote2-rgce-2026.json
 *
 * NO existe consolidado oficial de las RGCE 2026 con la 1a RM aplicada: este
 * extractor COMPILA base (DOF 27-dic-2025, PDF SAT) + 1a RM (DOF 14-may-2026,
 * nota 5787425) con FUSIONES ANCLADAS fail-closed — cualquier ancla que no
 * matchee EXACTO aborta el lote. Reglas de la orden (Raúl 20-ago):
 *  - cada doc lleva en `version` el instrumento del que viene;
 *  - regla modificada = TEXTO VIGENTE con nota del instrumento — jamás las
 *    dos versiones mezcladas;
 *  - ambigüedad de compilación no resoluble contra el DOF → el doc entra con
 *    texto base + `vigenciaCondicionada` (fechaCotejo nula = sin_verificar) y
 *    se reporta — NUNCA se resuelve por criterio propio.
 *
 * Modificaciones de la 1a RM (tabla completa, cotejada contra el DOF):
 *  1. Regla 1.4.14  — REFORMADA (texto íntegro nuevo en la RM).
 *  2. Regla 1.5.1   — reforma fr. VII inciso d); adiciona inciso e) y segundo
 *                     párrafo; footer de referencias actualizado.
 *  3. Regla 4.8.2   — deroga segundo párrafo… PERO Transitorio Tercero de la
 *                     RM condiciona la vigencia a la publicación DOF de la
 *                     modificación al Anexo 29 (NO confirmada al cotejo) →
 *                     entra TEXTO BASE con vigenciaCondicionada.
 *  4. Regla 4.8.4   — adiciona segundo párrafo… misma condición → ídem.
 *  5. Transitorio Décimo Primero — REFORMADO (prórroga manif. de valor
 *                     31-mar-2026 → 31-may-2026).
 *  6. Anexos 5, 22, 29 — fuera de este lote (anexos van en su propio lote).
 *  Glosario — fuera (no es regla; referencia no modelada). Se reporta.
 */

import * as fs from 'fs';
import { topicsDeTexto } from '../services/rag-search';
import { parseReferencia } from '../services/citas-legales';
import type { DocCorpusIntegro } from '../lib/corpus-validador';

const URL_BASE = 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf';
const URL_1ARM = 'https://dof.gob.mx/nota_detalle.php?codigo=5787425&fecha=14/05/2026';
const VER_BASE = 'RGCE 2026 (DOF 27-12-2025)';
const VER_1ARM = 'Texto vigente compilado: reformada por la 1a RM RGCE 2026 (DOF 14-05-2026)';
const COND_ANEXO29 = 'Trans. Tercero 1a RM (DOF 14-05-2026): la modificación a esta regla entra en vigor hasta la publicación en DOF de la modificación al Anexo 29 — publicación NO confirmada al cotejo (20-ago-2026); se conserva el texto base.';

function arg(nombre: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  console.error(`Falta --${nombre}`);
  process.exit(1);
}

function abortar(msg: string): never {
  console.error(`✗ ${msg} — LOTE ABORTADO`);
  process.exit(1);
}

const topicsDe = topicsDeTexto;

/** Fusión anclada: el ancla debe aparecer EXACTAMENTE una vez (normalizada
 *  por espacios) o se aborta. Opera sobre texto con espacios normalizados. */
function fusionar(texto: string, ancla: string, reemplazo: string, etiqueta: string): string {
  const idx = texto.indexOf(ancla);
  if (idx < 0) abortar(`ancla no encontrada en ${etiqueta}: "${ancla.slice(0, 70)}…"`);
  if (texto.indexOf(ancla, idx + 1) >= 0) abortar(`ancla AMBIGUA (aparece 2+ veces) en ${etiqueta}`);
  return texto.slice(0, idx) + reemplazo + texto.slice(idx + ancla.length);
}

const norm = (t: string) => t.split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');

function main() {
  const basePath = arg('base');
  const rm1Path = arg('rm1');
  const cotejo = arg('cotejo');
  const out = arg('out');

  // ── 1. Base: limpiar furniture de página y partir en reglas ──
  const lineasRaw = fs.readFileSync(basePath, 'utf8').split('\n');
  const lineas = lineasRaw.filter(l => !l.includes('DIARIO OFICIAL'));

  // Indent 0-8: cinco reglas de la publicación vienen sangradas (1.1.1, 4.6.1,
// 7.1.11, 7.1.12, 7.2.1) — exigir columna 0 las perdía (bug lote 2 v1).
const HEADER = /^\s{0,8}(\d+\.\d+\.\d+)\.\s+\S/;
  const headers: { idx: number; num: string }[] = [];
  let iniTransitorios = -1;
  for (let i = 0; i < lineas.length; i++) {
    if (iniTransitorios < 0 && /^\s+Transitorios\s*$/.test(lineas[i]!) && headers.length > 500) { iniTransitorios = i; break; }
    const m = HEADER.exec(lineas[i]!);
    if (m) headers.push({ idx: i, num: m[1]! });
  }
  if (iniTransitorios < 0) abortar('no encontré el bloque Transitorios tras las reglas');
  let finTransitorios = lineas.length;
  for (let i = iniTransitorios + 1; i < lineas.length; i++) {
    if (/^\s*(ANEXO|Anexo)\s+13\b/.test(lineas[i]!)) { finTransitorios = i; break; }
  }
  console.log(`Base: ${headers.length} reglas · Transitorios en línea ${iniTransitorios} · Anexo 13 (excluido) en ${finTransitorios}`);

  // Frontera de cada regla: retrocede sobre el bloque de título descriptivo
  // (líneas cortas, pocas cifras, sin arranque de referencias) y la línea
  // "Capítulo N.N." si precede. Partición CONTIGUA: cobertura total del cuerpo.
  const esRef = (l: string) => /^\s*(Ley\b|CFF\b|RGCE\b|RMF\b|Reglamento\b|Decreto\b|LIGIE\b|LFPIORPI\b|LFD\b|LIVA\b|LIEPS\b|LISAN\b|LFDC\b|Anexo\s+\d|Resoluci[oó]n\b|Acuerdo\b|C[oó]digos?\b|Convenci[oó]n\b|Tratados?\b|CPTPP\b|T-MEC\b|TMEC\b)/.test(l);
  const esTitulo = (l: string) => {
    const t = l.trim();
    if (!t || t.length > 130) return false;
    if (/^Cap[ií]tulo\s+\d/.test(t) || /^T[ií]tulo\s*:?\s*\d/.test(t)) return true;
    if (esRef(l)) return false;
    const digitos = (t.match(/\d/g) ?? []).length;
    return digitos / t.length < 0.16;
  };
  const iniDe = (h: number): number => {
    let ini = headers[h]!.idx;
    let retro = 0;
    while (ini - 1 > (h > 0 ? headers[h - 1]!.idx : 0) && retro < 4) {
      const prev = lineas[ini - 1]!;
      if (!prev.trim()) { ini--; continue; } // los vacíos se absorben
      if (esTitulo(prev)) { ini--; retro++; continue; }
      break;
    }
    return ini;
  };

  const inicios = headers.map((_, h) => iniDe(h));
  const docs: DocCorpusIntegro[] = [];
  for (let h = 0; h < headers.length; h++) {
    const ini = inicios[h]!;
    const fin = h + 1 < headers.length ? inicios[h + 1]! : iniTransitorios;
    const num = headers[h]!.num;
    const chunk = lineas.slice(ini, fin).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    const reference = `Regla ${num} RGCE 2026`;
    if (!parseReferencia(reference)) abortar(`referencia no parseable: "${reference}"`);
    const tituloLineas = lineas.slice(ini, headers[h]!.idx).map(l => l.trim()).filter(t => t && !/^Cap[ií]tulo|^T[ií]tulo/.test(t));
    const title = tituloLineas.join(' ') || chunk.trim().split('\n')[0]!.slice(0, 90);
    docs.push({
      source: 'RGCE_2026',
      type: 'rgce',
      reference,
      title: title.length > 140 ? `${title.slice(0, 140)}…` : title,
      content: chunk,
      officialUrl: URL_BASE,
      publishedDate: '2025-12-27',
      fechaCotejo: cotejo,
      claseTexto: 'texto_integro',
      version: VER_BASE,
      topics: topicsDe(chunk),
    });
  }

  // Verificación de PARTICIÓN TOTAL: la unión de chunks == cuerpo de reglas.
  const cuerpo = norm(lineas.slice(inicios[0]!, iniTransitorios).join('\n'));
  const union = norm(docs.map(d => d.content).join('\n'));
  if (cuerpo !== union) abortar(`partición NO total: cuerpo ${cuerpo.length} chars vs unión ${union.length} — hay texto perdido o duplicado`);
  console.log(`Partición total verificada: ${cuerpo.length} chars cubiertos sin pérdida.`);

  // ── 2. Compilación 1a RM (fusiones ancladas sobre texto normalizado) ──
  const rm = fs.readFileSync(rm1Path, 'utf8').split('\n');
  const buscar = (ref: string) => {
    const d = docs.find(x => x.reference === `Regla ${ref} RGCE 2026`);
    if (!d) abortar(`la regla ${ref} no está en la base`);
    return d;
  };

  // 2.1 — 1.4.14 REFORMADA: texto íntegro de la RM (línea del título hasta su footer de refs)
  const iniRM = rm.findIndex(l => l.includes('Expediente que debe integrar el agente aduanal'));
  const finRM = rm.findIndex(l => l.trim().startsWith('Ley 68, 162, CFF 49 Bis'));
  if (iniRM < 0 || finRM < 0) abortar('anclas del texto 1.4.14 en la 1a RM no encontradas');
  const d1414 = buscar('1.4.14');
  d1414.content = rm.slice(iniRM, finRM + 1).join('\n').trim();
  d1414.publishedDate = '2026-05-14';
  d1414.officialUrl = URL_1ARM;
  d1414.version = VER_1ARM;
  d1414.topics = topicsDe(d1414.content);
  console.log('Compilada 1.4.14 (reforma íntegra 1a RM).');

  // 2.2 — 1.5.1: inciso d) reformado + inciso e) y segundo párrafo adicionados + footer nuevo
  const d151 = buscar('1.5.1');
  let t151 = norm(d151.content);
  t151 = fusionar(
    t151,
    'd) Se trate de las importaciones temporales señaladas en el artículo 106,\nfracciones II, incisos a), c) y d), III, incisos a) y e) o IV, inciso b) de la Ley.',
    'd) Se trate de las importaciones temporales señaladas en el artículo 106, fracciones II, incisos a), c) y d), III o IV, inciso b) de la Ley.\ne) Se trate del pedimento global complementario, a que se refiere la regla 6.2.1.\nEn aquellas operaciones en las que la introducción se efectúe mediante documento aduanero distinto del pedimento o en las que no sea necesario hacer la transmisión a que se refieren las reglas 1.9.16. y 1.9.17., la información y documentación correspondiente al valor de la mercancía declarado deberá entregarse a requerimiento de la autoridad aduanera, en términos del artículo 59, fracción III, primer párrafo de la Ley.',
    'Regla 1.5.1 (inciso d + adiciones)',
  );
  t151 = fusionar(
    t151,
    'Ley 59, 59-A, 59-B, 64, 103, 106, 116, 162, 185, CFF 30, Reglamento 68, 81, 220, RGCE\n4.5.30., 6.1.1., Anexo 1',
    'Ley 59, 59-A, 59-B, 64, 103, 106, 116, 162, 185, CFF 30, Reglamento 68, 81, 220, RGCE 1.9.16., 1.9.17., 4.5.30., 6.1.1., 6.2.1., Anexo 1',
    'Regla 1.5.1 (footer de referencias)',
  );
  d151.content = t151;
  d151.publishedDate = '2026-05-14';
  d151.officialUrl = URL_1ARM;
  d151.version = VER_1ARM;
  d151.topics = topicsDe(t151);
  console.log('Compilada 1.5.1 (fusión anclada d/e/párrafo/footer).');

  // 2.3 — 4.8.2 y 4.8.4: vigencia CONDICIONADA no resuelta → texto base + flag
  for (const ref of ['4.8.2', '4.8.4']) {
    const d = buscar(ref);
    d.vigenciaCondicionada = COND_ANEXO29;
    d.fechaCotejo = '';
    d.version = VER_BASE;
  }
  console.log('4.8.2 y 4.8.4: texto base con vigenciaCondicionada (Anexo 29 sin DOF confirmado).');

  // 2.4 — Transitorios base con Décimo Primero VIGENTE (reformado por la RM)
  const transitorios = lineas.slice(iniTransitorios, finTransitorios).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  let tTrans = norm(transitorios);
  tTrans = fusionar(
    tTrans,
    'hasta el 31 de marzo\nde 2026',
    'hasta el 31 de mayo de 2026',
    'Transitorio Décimo Primero (prórroga 1a RM)',
  );
  docs.push({
    source: 'RGCE_2026', type: 'rgce',
    reference: 'Transitorios DOF 27-12-2025 RGCE',
    title: 'Transitorios de las RGCE 2026 (texto vigente: Décimo Primero reformado por la 1a RM)',
    content: tTrans,
    officialUrl: URL_BASE,
    publishedDate: '2026-05-14',
    fechaCotejo: cotejo,
    claseTexto: 'texto_integro',
    version: `${VER_BASE} · Décimo Primero reformado por 1a RM (DOF 14-05-2026)`,
    topics: topicsDe(tTrans),
  });

  // 2.5 — Transitorios propios de la 1a RM (verbatim)
  const iniTransRM = rm.findIndex(l => /^Transitorios\s*$/.test(l.trim()));
  const finTransRM = rm.findIndex(l => l.trim().startsWith('Atentamente'));
  if (iniTransRM < 0 || finTransRM < 0) abortar('transitorios de la 1a RM no encontrados');
  const transRM = rm.slice(iniTransRM, finTransRM).join('\n').trim();
  docs.push({
    source: 'RGCE_2026', type: 'rgce',
    reference: 'Transitorios DOF 14-05-2026 RGCE',
    title: 'Transitorios de la 1a Resolución de Modificaciones a las RGCE 2026',
    content: transRM,
    officialUrl: URL_1ARM,
    publishedDate: '2026-05-14',
    fechaCotejo: cotejo,
    claseTexto: 'texto_integro',
    version: '1a RM RGCE 2026 (DOF 14-05-2026)',
    topics: topicsDe(transRM),
  });

  // ── 3. Glosario por apartado (orden Raúl 20-ago: tipo propio en el matcher) ──
  const iniGlos = lineas.findIndex(l => /^\s*Glosario\s*$/.test(l) && lineas.indexOf(l) > 40);
  const finGlos = inicios[0]!; // hasta la primera regla (1.1.1)
  if (iniGlos < 0 || iniGlos >= finGlos) abortar('Glosario no encontrado antes de la primera regla');
  const glosLineas = lineas.slice(iniGlos, finGlos);
  const apartados: { rom: string; idx: number }[] = [];
  for (let i = 0; i < glosLineas.length; i++) {
    const m = /^\s{0,8}([IVX]+)\.\s+[A-ZÁÉ]/.exec(glosLineas[i]!);
    if (m) apartados.push({ rom: m[1]!, idx: i });
  }
  if (apartados.length === 0) abortar('Glosario sin apartados romanos');
  for (let a = 0; a < apartados.length; a++) {
    const ini = a === 0 ? 0 : apartados[a]!.idx;
    const fin = a + 1 < apartados.length ? apartados[a + 1]!.idx : glosLineas.length;
    const contenido = glosLineas.slice(ini, fin).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const refG = `Glosario apartado ${apartados[a]!.rom} RGCE 2026`;
    if (!parseReferencia(refG)) abortar(`referencia de glosario no parseable: "${refG}"`);
    docs.push({
      source: 'RGCE_2026', type: 'rgce',
      reference: refG,
      title: `Glosario RGCE 2026 — apartado ${apartados[a]!.rom} (${(glosLineas[apartados[a]!.idx] ?? '').trim().replace(/^[IVX]+\.\s*/, '').slice(0, 60) || 'acrónimos y definiciones'})`,
      content: contenido,
      officialUrl: URL_BASE,
      publishedDate: '2025-12-27',
      fechaCotejo: cotejo,
      claseTexto: 'texto_integro',
      version: VER_BASE,
      topics: topicsDe(contenido),
    });
  }
  console.log(`Glosario: ${apartados.length} apartados (${apartados.map(x => x.rom).join(', ')}).`);

  fs.writeFileSync(out, JSON.stringify(docs, null, 1));
  const compiladas = docs.filter(d => d.version === VER_1ARM).length;
  const condicionadas = docs.filter(d => d.vigenciaCondicionada).length;
  console.log(`Salida: ${out} — ${docs.length} docs (${compiladas} compiladas 1a RM, ${condicionadas} con vigencia condicionada) · ${Math.round(docs.reduce((s, d) => s + d.content.length, 0) / 1024)} KB verbatim`);
}

main();
