/**
 * CORPUS ÍNTEGRO · VALIDADOR DE SEED (plan aprobado 19-ago, §4 "reglas duras")
 *
 * Puerta única de entrada al corpus de texto íntegro. Principio rector:
 * texto VERBATIM de fuente oficial con URL + fecha de cotejo, o NO entra.
 *
 * Reglas (cualquier fallo rechaza el DOCUMENTO; un documento rechazado
 * rechaza el LOTE completo — no se siembran lotes a medias):
 *  1. `reference` debe ser parseable por citas-legales.parseReferencia() —
 *     garantiza que el matcher fail-closed del Copilot (3a) podrá cruzar
 *     las citas contra este corpus desde el día uno.
 *  2. `content` no vacío (≥40 chars) y sin frases delatoras de síntesis
 *     ("en resumen", "esto significa que", "en otras palabras", "básicamente")
 *     — cero resúmenes LLM disfrazados de texto legal.
 *  3. `officialUrl` obligatoria y VIVA (HTTP 200/301/302; check inyectable
 *     para tests y cacheado por URL — no se martillea a Diputados).
 *  4. `fechaCotejo` y `publishedDate` obligatorias; cotejo no-futuro.
 *  5. `claseTexto` debe ser 'texto_integro' (los resúmenes no pasan por aquí).
 *  6. `source` y `title` no vacíos. El title es el ÚNICO campo redactado
 *     (descriptor de navegación) — nunca se presenta como texto legal.
 *
 * La validación de dimensiones (1024) NO vive aquí: la hace el guard
 * existente assertCorpusEmbedding en el momento del embed (lib/embeddings).
 */

import { parseReferencia } from '../services/citas-legales';

export interface DocCorpusIntegro {
  source: string;        // "Ley_Aduanera"
  reference: string;     // "Art. 54 LA" — formato parseable
  title: string;         // descriptor (único campo redactado)
  content: string;       // VERBATIM de la fuente oficial
  officialUrl: string;
  publishedDate: string; // ISO — DOF de última reforma del artículo/ley
  fechaCotejo: string;   // ISO — cuándo se cotejó contra la fuente ('' SOLO con vigenciaCondicionada)
  claseTexto: 'texto_integro';
  /** Instrumento de procedencia ("RGCE 2026 DOF 27-12-2025" | "Reformada por
   *  1a RM DOF 14-05-2026") — obligatorio cuando el corpus se compila de
   *  varios instrumentos (orden Raúl 20-ago). */
  version?: string;
  /** Modificación con vigencia condicionada NO resuelta contra el DOF: el doc
   *  entra con el texto base, fechaCotejo NULA (sin_verificar a nivel dato) y
   *  la condición descrita aquí. Se reporta a Raúl — jamás se resuelve por
   *  criterio propio. */
  vigenciaCondicionada?: string;
  type: string;          // "ley" | "reglamento" | "rgce" | "tratado"
  topics: string[];
  keywords?: string[];
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[]; // "Art. 54 LA: referencia no parseable", …
}

const FRASES_SINTESIS = [
  'en resumen',
  'esto significa que',
  'en otras palabras',
  'básicamente',
  'dicho de otro modo',
  'lo que quiere decir',
];

export type UrlCheck = (url: string) => Promise<number>; // → HTTP status

/** Check real con HEAD, cacheado por URL para no martillear la fuente. */
export function urlCheckHttp(): UrlCheck {
  const cache = new Map<string, number>();
  return async (url: string) => {
    if (cache.has(url)) return cache.get(url)!;
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(20000) });
      cache.set(url, res.status);
      return res.status;
    } catch {
      cache.set(url, 0);
      return 0;
    }
  };
}

export async function validarDocumento(doc: DocCorpusIntegro, urlCheck: UrlCheck): Promise<string[]> {
  const errores: string[] = [];
  const ref = doc.reference?.trim() ?? '';
  const etiqueta = ref || '(sin referencia)';

  if (!ref || !parseReferencia(ref)) {
    errores.push(`${etiqueta}: referencia no parseable por citas-legales (el matcher no podrá cruzarla)`);
  }
  if (doc.claseTexto !== 'texto_integro') {
    errores.push(`${etiqueta}: claseTexto debe ser 'texto_integro' (los resúmenes no pasan por este seed)`);
  }
  const content = (doc.content ?? '').trim();
  if (content.length < 40) {
    errores.push(`${etiqueta}: content vacío o demasiado corto (${content.length} chars)`);
  }
  const lower = content.toLowerCase();
  for (const frase of FRASES_SINTESIS) {
    if (lower.includes(frase)) {
      errores.push(`${etiqueta}: content contiene "${frase}" — huele a síntesis, no a verbatim`);
    }
  }
  if (!doc.source?.trim()) errores.push(`${etiqueta}: source vacío`);
  if (!doc.title?.trim()) errores.push(`${etiqueta}: title vacío`);
  if (!doc.publishedDate || isNaN(Date.parse(doc.publishedDate))) {
    errores.push(`${etiqueta}: publishedDate ausente o inválida`);
  }
  if (doc.vigenciaCondicionada) {
    if (doc.fechaCotejo) errores.push(`${etiqueta}: vigenciaCondicionada exige fechaCotejo VACÍA (el dato queda sin_verificar)`);
    if (!doc.version) errores.push(`${etiqueta}: vigenciaCondicionada exige version con el instrumento`);
  } else if (!doc.fechaCotejo || isNaN(Date.parse(doc.fechaCotejo))) {
    errores.push(`${etiqueta}: fechaCotejo ausente o inválida`);
  } else if (Date.parse(doc.fechaCotejo) > Date.now()) {
    errores.push(`${etiqueta}: fechaCotejo en el futuro`);
  }
  if (!doc.officialUrl?.startsWith('https://')) {
    errores.push(`${etiqueta}: officialUrl ausente o no-https`);
  } else {
    const status = await urlCheck(doc.officialUrl);
    if (![200, 301, 302].includes(status)) {
      errores.push(`${etiqueta}: officialUrl no responde (HTTP ${status})`);
    }
  }
  return errores;
}

/** Valida el LOTE completo. Un documento inválido rechaza el lote entero. */
export async function validarLote(docs: DocCorpusIntegro[], urlCheck: UrlCheck): Promise<ResultadoValidacion> {
  const errores: string[] = [];
  if (docs.length === 0) errores.push('lote vacío');

  // Referencias duplicadas dentro del lote
  const vistas = new Map<string, number>();
  for (const d of docs) {
    const k = (d.reference ?? '').trim().toLowerCase();
    vistas.set(k, (vistas.get(k) ?? 0) + 1);
  }
  for (const [k, n] of vistas) {
    if (n > 1) errores.push(`referencia duplicada en el lote: "${k}" (${n} veces)`);
  }

  for (const d of docs) {
    errores.push(...await validarDocumento(d, urlCheck));
  }
  return { ok: errores.length === 0, errores };
}
