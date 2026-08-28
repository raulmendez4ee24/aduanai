/**
 * Términos significativos — tokenizador ÚNICO del Clasificador.
 *
 * Vive aquí (y no en classifier.ts) para que el pase "RGI 6: específica vs
 * residual" (rgi6-especifica-residual.ts) use EXACTAMENTE el mismo criterio de
 * "palabra que discrimina" que el retrieval del clasificador — sin duplicar la
 * lista de stopwords ni la regla de raíz. `classifier.ts` lo importa; la
 * dependencia es de un solo sentido (classifier → rgi6-*), sin ciclo.
 *
 * `extractSearchTerms` se movió VERBATIM desde classifier.ts (2ª Ola Etapa 2,
 * F1): mismo filtro, mismas stopwords, mismo orden — el retrieval no cambia de
 * comportamiento por esta extracción.
 */

// 2ª Ola Etapa 2 (F1) — higiene de términos de búsqueda. El diagnóstico de los
// 37 candados de la línea base mostró que "para"/"tipo" (substring) matcheaban
// "preparaciones"/"reparación" en miles de filas y el take-30 SIN ORDEN devolvía
// filas arbitrarias (headings ganadores absurdos: 0101 caballos, 0306 crustáceos,
// 0407 huevos... para mouse, tornillos y escritorios).
export const SEARCH_STOPWORDS = new Set([
  'para', 'tipo', 'tipos', 'con', 'como', 'sobre', 'hasta', 'entre', 'cada', 'desde',
  'este', 'esta', 'estos', 'estas', 'pero', 'porque', 'cuando', 'donde', 'cual',
  'cuales', 'producto', 'productos', 'nuevo', 'nueva', 'nuevos', 'nuevas', 'uso', 'usos',
]);

/** Términos útiles: sin puntuación, sin stopwords, sin números sueltos/medidas. */
export function extractSearchTerms(description: string): string[] {
  return [...new Set(
    description
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúüñ\s-]/gi, ' ') // fuera puntuación (paréntesis, comas, %…)
      .split(/\s+/)
      .filter(w =>
        w.length > 3 &&
        !SEARCH_STOPWORDS.has(w) &&
        !/^\d/.test(w), // fuera "250cc", "500ml", "205" — medidas no discriminan partida
      ),
  )];
}

/** minúsculas sin acentos (el catálogo TIGIE sí los trae; el usuario, a veces no). */
export function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Raíz por prefijo — MISMA regla que el retrieval de findRelatedFractions
 * (palabras de 6+ caracteres se recortan 3, mínimo 5) con un paso previo de
 * SINGULARIZACIÓN. El recorte crudo separa singular y plural cuando cambian de
 * longitud ("centrífuga" → "centrif" pero "centrífugas" → "centrifu"), y en la
 * comparación texto-contra-texto de la RGI 6 eso es un falso negativo: el
 * catálogo escribe en plural ("Las demás bombas centrífugas") y el importador
 * en singular. Se quita la marca de plural ANTES de recortar.
 */
export function singular(termino: string): string {
  const t = sinAcentos(termino.toLowerCase());
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

export function raiz(termino: string): string {
  const t = singular(termino);
  return t.length >= 6 ? t.slice(0, Math.max(5, t.length - 3)) : t;
}

/**
 * Stopwords ADICIONALES del lenguaje de la TIGIE. Los textos de partida y
 * subpartida están llenos de conectores de catálogo que no discriminan nada
 * ("los demás", "incluso", "excepto"…): si contaran como coincidencia, toda
 * subpartida residual "empataría" con cualquier producto.
 */
export const STOPWORDS_TIGIE = new Set([
  'demas', 'incluso', 'excepto', 'salvo', 'aunque', 'mismo', 'misma', 'otro', 'otra',
  'otros', 'otras', 'demas.', 'comprendido', 'comprendidos', 'comprendida', 'comprendidas',
  'partida', 'partidas', 'subpartida', 'subpartidas', 'fraccion', 'fracciones',
  'capitulo', 'capitulos', 'seccion', 'nota', 'notas', 'sean', 'sus', 'esten', 'estan',
  'utilizados', 'utilizadas', 'utilizado', 'utilizada', 'demas,',
]);

/**
 * Conjunto de RAÍCES significativas de un texto (producto o texto de catálogo).
 * Reutiliza extractSearchTerms (mismo filtro que el retrieval) y añade el
 * plegado de acentos, la raíz por prefijo y las stopwords del lenguaje TIGIE.
 */
export function raicesSignificativas(texto: string | null | undefined): Set<string> {
  if (!texto) return new Set();
  const out = new Set<string>();
  for (const t of extractSearchTerms(texto)) {
    const plano = sinAcentos(t);
    if (STOPWORDS_TIGIE.has(plano)) continue;
    const r = raiz(t);
    if (STOPWORDS_TIGIE.has(r)) continue;
    out.add(r);
  }
  return out;
}

/** Raíces presentes en ambos conjuntos (orden estable para textos legibles). */
export function raicesComunes(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter(r => b.has(r)).sort();
}
