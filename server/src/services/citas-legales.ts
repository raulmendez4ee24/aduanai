/**
 * FRONTERA CANÓNICA · MATCHER DE CITAS LEGALES (Fase 3a, §4.1)
 *
 * Sustituye el matcher por tokens ("≥50% de palabras coinciden") que producía
 * falsos respaldos en ambas direcciones. Una cita está respaldada ⟺ su CLAVE
 * NORMALIZADA {tipo, numero, cuerpo} coincide EXACTAMENTE con la clave de un
 * documento recuperado. "Art. 54 LA" ≠ "Art. 54 LIVA" ≠ "Art. 54-A LA".
 */

export interface ClaveCita {
  tipo: 'articulo' | 'regla' | 'anexo' | 'rgi' | 'capitulo_tmec' | 'transitorio' | 'glosario';
  /** Número normalizado: "54", "28-A", "7.1.6", "3" (RGI). Mayúsculas. */
  numero: string;
  /** Cuerpo normativo normalizado: LA, LIVA, LIEPS, LFD, LCE, CFF, LIGIE,
   *  RGCE, TMEC, RLA… — null cuando la cita no lo especifica. */
  cuerpo: string | null;
}

const CUERPOS: Record<string, string> = {
  'la': 'LA', 'ley aduanera': 'LA',
  'liva': 'LIVA', 'lieps': 'LIEPS', 'lfd': 'LFD', 'lce': 'LCE', 'cff': 'CFF',
  'ligie': 'LIGIE', 'lisan': 'LISAN', 'rla': 'RLA',
  'rgce': 'RGCE', 'rgce 2026': 'RGCE', 'rgce 2025': 'RGCE',
  'tmec': 'TMEC', 't-mec': 'TMEC', 'tlcuem': 'TLCUEM', 'cptpp': 'CPTPP',
};

// "de la Ley", "del Reglamento", etc. no identifican un cuerpo: tratarlos como
// literal ("LEY") producía fantasmas falsos — "Art. 49 de la Ley" nunca cruzaba
// con el doc "Art. 49 LFD". Un genérico equivale a no declarar cuerpo, y la
// ambigüedad la resuelve cruzarCitas (único candidato o nada).
const CUERPOS_GENERICOS = new Set([
  'ley', 'la ley', 'reglamento', 'el reglamento', 'código', 'codigo',
  'decreto', 'el decreto', 'ordenamiento', 'misma ley', 'la misma ley',
]);

function normalizarCuerpo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const limpio = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^del?\s+/, '');
  if (CUERPOS_GENERICOS.has(limpio)) return null;
  if (CUERPOS[limpio]) return CUERPOS[limpio];
  // "RGCE 2026" etc. — quita año
  const sinAnio = limpio.replace(/\s*(19|20)\d{2}$/, '');
  return CUERPOS[sinAnio] ?? raw.trim().toUpperCase();
}

function normalizarNumero(raw: string): string {
  // "137 bis 1" → "137-BIS-1"; "88 bis/ter" → "88-BIS/-TER"; "18-H QUÁTER" →
  // "18-H-QUÁTER"; "23-Bis" → "23-BIS" (≠ "23-B").
  return raw.trim().toUpperCase()
    .replace(/\s+(BIS|TER|QU[AÁ]TER|QUINTUS)\s+(\d)/g, '-$1-$2')
    .replace(/\s+(BIS|TER|QU[AÁ]TER|QUINTUS)\b/g, '-$1')
    .replace(/\s+/g, '');
}

/** Parsea UNA referencia textual a clave. null = no es una cita reconocible. */
export function parseReferencia(texto: string): ClaveCita | null {
  const t = texto.trim();

  // RGI: "Regla General 3 a) (RGI)" / "RGI 3" / "GRI 3" — NUNCA es artículo
  let m = /(?:Regla\s+General\s+|RGI\s*|GRI\s*)(\d+)(?:\s*-\s*(\d+))?\s*([a-f]\))?/i.exec(t);
  if (m && /RGI|GRI|Regla\s+General/i.test(t)) {
    // Rango "GRI 1-6 LIGIE" (así se llama el doc del corpus): numero "1-6".
    // Una cita a una regla del rango se cruza por pertenencia (clavesIguales).
    if (m[2]) return { tipo: 'rgi', numero: `${m[1]}-${m[2]}`, cuerpo: 'LIGIE' };
    return { tipo: 'rgi', numero: normalizarNumero(m[1]! + (m[3] ? ` ${m[3]}` : '')), cuerpo: 'LIGIE' };
  }

  // Regla RGCE: "Regla 7.1.6 RGCE 2026" / "Regla 1.2.1"
  m = /Regla\s+(\d+(?:\.\d+)+)\s*(?:de\s+las?\s+)?([A-Za-z].*)?$/i.exec(t);
  if (m) return { tipo: 'regla', numero: normalizarNumero(m[1]!), cuerpo: normalizarCuerpo(m[2]) ?? 'RGCE' };

  // Anexo: "Anexo 22 RGCE 2026" / "Anexo 2.4.1"
  m = /(?:^(TMEC|T-MEC)\s+)?Anexo\s+(\d+(?:\.\d+)*(?:-[A-Z])?)\s*([A-Za-z].*)?$/i.exec(t);
  if (m) {
    // "TMEC Anexo 4-B" (prefijo, así nombra el corpus) ≡ "Anexo 4-B del T-MEC".
    // "Anexo 1-A trámites N/LA": lo que sigue al número y no es un cuerpo
    // conocido es un descriptor, no un cuerpo → RGCE (los anexos numerados
    // del ámbito aduanero son de las RGCE; los del T-MEC llevan prefijo).
    const bruto = normalizarCuerpo(m[3]);
    const conocido = bruto !== null && Object.values(CUERPOS).includes(bruto);
    const cuerpo = m[1] ? 'TMEC' : (conocido ? bruto : 'RGCE');
    return { tipo: 'anexo', numero: normalizarNumero(m[2]!), cuerpo };
  }

  // TMEC capítulo: "TMEC Cap. 4" / "Capítulo 4 del T-MEC"
  m = /(?:TMEC|T-MEC).*?Cap(?:ítulo|\.)?\s*(\d+)|Cap(?:ítulo|\.)?\s*(\d+)\s+(?:del\s+)?(?:TMEC|T-MEC)/i.exec(t);
  if (m) return { tipo: 'capitulo_tmec', numero: normalizarNumero(m[1] ?? m[2]!), cuerpo: 'TMEC' };

  // Glosario: "Glosario RGCE 2026" / "Glosario apartado III RGCE 2026" /
  // "Glosario de las RGCE". Sin apartado → numero '*' (cruza con cualquiera).
  m = /^Glosario(?:\s*,?\s*apartado\s+([IVX]+))?\s+(?:de\s+las?\s+)?([A-Za-z][A-Za-z0-9\s-]{0,25})$/i.exec(t);
  if (m) return { tipo: 'glosario', numero: m[1] ? m[1].toUpperCase() : '*', cuerpo: normalizarCuerpo(m[2]) };

  // Transitorios de un decreto: "Transitorios DOF 19-11-2025 LA". Los de una
  // VERSIÓN ANTICIPADA del Portal SAT llevan "VA-SAT" en vez de DOF
  // ("Transitorios VA-SAT 31-07-2026 RGCE") y su clave conserva el prefijo:
  // un transitorio anticipado NUNCA respalda una cita al DOF ni viceversa.
  m = /^Transitorios?\s+(?:del\s+Decreto\s+)?(DOF|VA-SAT)\s+(\d{2}-\d{2}-\d{4})\s*([A-Za-z][A-Za-z\s-]{0,25})?$/i.exec(t);
  if (m) return { tipo: 'transitorio', numero: m[1]!.toUpperCase() === 'DOF' ? m[2]! : `VA-SAT-${m[2]!}`, cuerpo: normalizarCuerpo(m[3]) };

  // Artículo en RANGO (referencia de doc): "Art. 73-89 LCE" → numero "73-89".
  m = /^Art(?:ículos?|s?\.)?\s*(\d+)\s*-\s*(\d+)\s+(?:de\s+la\s+|del\s+)?([A-Za-z][A-Za-z\s-]{0,25})$/i.exec(t);
  if (m) return { tipo: 'articulo', numero: `${m[1]}-${m[2]}`, cuerpo: normalizarCuerpo(m[3]) };

  // Artículo: "Art. 54 LA" / "Artículo 28-A de la LIVA" / "Art. 4.5 T-MEC"
  m = /Art(?:ículo|\.)?\s*(\d+(?:\.\d+)*(?:-(?:[A-ZÑ]{1,2}(?![a-zñ])|(?:[Bb]is|BIS|[Tt]er|TER|[Qq]u[aá]ter|QU[AÁ]TER|[Qq]uintus|QUINTUS)))?(?:\s+(?:[Bb]is|BIS|[Tt]er|TER|[Qq]u[aá]ter|QU[AÁ]TER|[Qq]uintus|QUINTUS)(?:\s+\d+)?)?)\s*(?:,?\s*(?:fracci[oó]n\s+[IVXLC]+\s*)?)?(?:de\s+la\s+|de\s+el\s+|del\s+)?([A-Za-z][A-Za-z\s-]{0,25})?$/.exec(t);
  if (m) {
    return { tipo: 'articulo', numero: normalizarNumero(m[1]!), cuerpo: normalizarCuerpo(m[2]) };
  }

  return null;
}

// Sufijo de artículo (28-A, 137-BIS-1, 88 bis…), compartido por el patrón
// simple y el de listas.
const SUFIJO_ART =
  String.raw`(?:-(?:[A-ZÑ]{1,2}(?![a-zñ])|(?:[Bb]is|BIS|[Tt]er|TER|[Qq]u[aá]ter|QU[AÁ]TER|[Qq]uintus|QUINTUS)))?(?:\s+(?:[Bb]is|BIS|[Tt]er|TER|[Qq]u[aá]ter|QU[AÁ]TER|[Qq]uintus|QUINTUS)(?:\s+\d+)?)?`;
const CUERPO_OPCIONAL = String.raw`(?:\s+(?:de\s+la\s+|del\s+)?[A-Z][A-Za-z-]{1,10})?`;

/** "Arts. 54 y 162 LA" / "Artículos 36, 54 y 162 de la LA": lista de artículos
 *  que comparten cuerpo. El patrón simple perdía todo ("Arts." no matchea) o
 *  perdía la cola ("Art. 54 y 162 LA" → solo "Art. 54"). */
const PATRON_LISTA_ARTS = new RegExp(
  String.raw`Art(?:s\.|\.|ículos?)?\s*\d+(?:\.\d+)*${SUFIJO_ART}(?:\s*(?:,|\s[ye])\s*\d+(?:\.\d+)*${SUFIJO_ART})+(?:\s+(?:de\s+la\s+|del\s+)?[A-Z][A-Za-z-]{1,10})?`,
  'g'
);

/** Extrae las citas del texto de una respuesta (mismas familias que antes,
 *  pero cada una parseada a clave). Las listas de artículos se expanden a una
 *  cita por número, todas con el cuerpo declarado al final de la lista. */
export function extraerCitas(answer: string): { texto: string; clave: ClaveCita }[] {
  const patrones = [
    new RegExp(String.raw`Art(?:ículo|\.)?\s*\d+(?:\.\d+)*${SUFIJO_ART}${CUERPO_OPCIONAL}`, 'g'),
    /Transitorios?\s+(?:del\s+Decreto\s+)?(?:DOF|VA-SAT)\s+\d{2}-\d{2}-\d{4}(?:\s+[A-Z][A-Za-z-]{1,10})?/g,
    /Glosario(?:\s*,?\s*apartado\s+[IVX]+)?\s+(?:de\s+las?\s+)?RGCE(?:\s+\d{4})?/g,
    /Regla\s+General\s+\d+\s*(?:[a-f]\))?\s*(?:\(RGI\))?/g,
    /Regla\s+\d+(?:\.\d+)+(?:\s+RGCE(?:\s+\d{4})?)?/g,
    // Anexo de las RGCE o del T-MEC ("Anexo 4-B del T-MEC"): sin el cuerpo
    // T-MEC, el anexo se cruzaba como RGCE y era fantasma seguro.
    /Anexo\s+\d+(?:\.\d+)*(?:-[A-Z])?(?:\s+(?:del\s+)?(?:RGCE(?:\s+\d{4})?|TMEC|T-MEC))?/g,
    // Ambos órdenes: "TMEC Cap. 5" y "Capítulo 5 del T-MEC" — el segundo era
    // invisible para el extractor (forma conocida de falso negativo).
    /(?:TMEC|T-MEC)\s+Cap(?:ítulo|\.)?\s*\d+/g,
    /Cap(?:ítulo|\.)?\s*\d+\s+(?:del\s+)?(?:TMEC|T-MEC)/g,
  ];
  const vistas = new Set<string>();
  const out: { texto: string; clave: ClaveCita }[] = [];
  // Tramos ya reclamados por la expansión de listas: el patrón simple no debe
  // re-matchear "Art. 54" dentro de "Arts. 54 y 162 LA" (crearía una clave
  // espuria sin cuerpo).
  const reclamados: Array<[number, number]> = [];
  const agregar = (texto: string, clave: ClaveCita | null) => {
    if (!clave) return;
    const k = `${clave.tipo}|${clave.numero}|${clave.cuerpo ?? '*'}`;
    if (vistas.has(k)) return;
    vistas.add(k);
    out.push({ texto, clave });
  };

  let m: RegExpExecArray | null;
  while ((m = PATRON_LISTA_ARTS.exec(answer)) !== null) {
    const texto = m[0].trim();
    // Cuerpo: lo que sigue al último número (mayúscula inicial = sigla/cuerpo)
    const cuerpoM = /(?:de\s+la\s+|del\s+)?([A-Z][A-Za-z-]{1,10})\s*$/.exec(texto);
    const cuerpoRaw = cuerpoM ? cuerpoM[1]! : '';
    const esPlural = /^Art(?:s\.|ículos)/.test(texto);
    // Solo expandir con señal fuerte de lista (plural o cuerpo al final):
    // "Art. 54 y 30 días" NO debe inventar un "Art. 30".
    if (!esPlural && !cuerpoRaw) continue;
    reclamados.push([m.index, m.index + m[0].length]);
    const numeros = texto.match(new RegExp(String.raw`\d+(?:\.\d+)*${SUFIJO_ART}`, 'g')) ?? [];
    for (const num of numeros) {
      agregar(texto, parseReferencia(`Art. ${num}${cuerpoRaw ? ` ${cuerpoRaw}` : ''}`));
    }
  }

  for (const pat of patrones) {
    while ((m = pat.exec(answer)) !== null) {
      const inicio = m.index;
      if (reclamados.some(([a, b]) => inicio >= a && inicio < b)) continue;
      const texto = m[0].trim();
      agregar(texto, parseReferencia(texto));
    }
  }
  return out;
}

/** "3" y "3A)" pertenecen al rango "1-6"; "75" al "73-89"; dos rangos
 *  coinciden si son el mismo; dos números sueltos, si son iguales. */
function numeroCoincide(a: string, b: string): boolean {
  if (a === b) return true;
  const rango = /^(\d+)-(\d+)$/;
  const enRango = (r: string, n: string): boolean => {
    const m = rango.exec(r); const k = /^(\d+)(?:[A-F]\))?$/.exec(n);
    if (!m || !k) return false; // "28-A", "137-BIS" jamás entran a un rango
    const v = Number(k[1]);
    return v >= Number(m[1]) && v <= Number(m[2]);
  };
  return enRango(a, b) || enRango(b, a);
}

export function clavesIguales(a: ClaveCita, b: ClaveCita): boolean {
  if (a.tipo !== b.tipo) return false;
  // Glosario: la cita genérica ("Glosario de las RGCE", numero '*') respalda
  // cualquier apartado del glosario del mismo cuerpo, y viceversa.
  if (a.tipo === 'glosario') {
    if (a.numero !== b.numero && a.numero !== '*' && b.numero !== '*') return false;
  } else if (a.tipo === 'rgi' || a.tipo === 'articulo') {
    // Rangos numéricos puros ("1-6" RGI, "73-89" LCE): pertenencia. "28-A" no
    // es rango (sufijo de letra) y cruza solo por igualdad exacta.
    if (!numeroCoincide(a.numero, b.numero)) return false;
  } else if (a.numero !== b.numero) return false;
  // Cuerpo: si AMBOS lo declaran, debe coincidir. Si la cita no lo declara,
  // solo respalda un doc cuyo número+tipo sea inequívoco (se resuelve arriba).
  if (a.cuerpo && b.cuerpo) return a.cuerpo === b.cuerpo;
  return true;
}

export interface ResultadoCitas {
  citadas: { texto: string; clave: ClaveCita }[];
  /** referencia citada → índice del doc que la respalda */
  respaldadas: Map<string, number>;
  noRespaldadas: string[];
}

/**
 * Cruza las citas de la respuesta contra las claves de los documentos
 * recuperados (doc.reference). Estricto: clave exacta; una cita sin cuerpo
 * declarado solo se respalda si UN ÚNICO doc coincide en tipo+número
 * (ambigüedad = no respaldada — mejor pedir precisión que fingir respaldo).
 */
/** Claves de UN documento del corpus. La `reference` de un doc puede ser
 *  compuesta — "A · B" (dos preceptos), "Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026"
 *  (lista), "TMEC Anexo 4-B (automotriz)" (sufijo), "Art. 28-A párr. final
 *  LIVA" (precisión) — y antes solo se intentaba parsearla entera: 8/45 docs
 *  del corpus no obtenían clave y toda cita a ellos era "fantasma" (27-ago). */
export function clavesDeReferencia(reference: string): ClaveCita[] {
  const claves: ClaveCita[] = [];
  for (const parte of reference.split(/\s*[·|]\s*/)) {
    let t = parte
      .replace(/\s*\([^)]*\)\s*/g, ' ')                       // "(automotriz)", "(vigente desde 2018)"
      .replace(/\s+p[aá]rr(?:afo|\.)\s+\w+/gi, '')              // "párr. final"
      .replace(/\s+fr(?:acci[oó]n|\.)\s+[IVXLC]+/gi, '')         // "fr. I"
      .replace(/\s+[—–-]\s+.*$/, '')                          // "Capítulo 4 — Textiles"
      .replace(/\s+/g, ' ').trim();
    // La forma original primero ("TMEC Capítulo 4" ya parsea); si no, el cuerpo
    // al final como en las citas: "TMEC Anexo 4-B" → "Anexo 4-B TMEC".
    const directa = parseReferencia(t);
    if (directa) { claves.push(directa); continue; }
    const pre = /^(TMEC|T-MEC|RGCE(?:\s+\d{4})?)\s+(.+)$/i.exec(t);
    if (pre) t = `${pre[2]} ${pre[1]}`;
    // Rango "Reglas 1.3.2 a 1.3.7 RGCE 2026" → una clave por regla del tramo
    // (mismo prefijo, último segmento numérico).
    const rango = /^Reglas\s+(\d+(?:\.\d+)+)\s+a\s+(\d+(?:\.\d+)+)\s*(.*)$/i.exec(t);
    if (rango) {
      const cuerpo = rango[3] ? normalizarCuerpo(rango[3]) ?? 'RGCE' : 'RGCE';
      const ini = rango[1]!.split('.'), fin = rango[2]!.split('.');
      const prefijo = ini.slice(0, -1).join('.');
      if (ini.length === fin.length && prefijo === fin.slice(0, -1).join('.')) {
        for (let n = Number(ini.at(-1)); n <= Number(fin.at(-1)); n++) claves.push({ tipo: 'regla', numero: `${prefijo}.${n}`, cuerpo });
      } else {
        claves.push({ tipo: 'regla', numero: normalizarNumero(rango[1]!), cuerpo }, { tipo: 'regla', numero: normalizarNumero(rango[2]!), cuerpo });
      }
      continue;
    }
    // Lista "Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026" → una clave por regla
    const lista = /^Reglas\s+((?:\d+(?:\.\d+)+)(?:\s*(?:,|\sy)\s*\d+(?:\.\d+)+)+)\s*(.*)$/i.exec(t);
    if (lista) {
      const cuerpo = lista[2] ? normalizarCuerpo(lista[2]) ?? 'RGCE' : 'RGCE';
      for (const n of lista[1]!.split(/\s*(?:,|\sy)\s*/)) claves.push({ tipo: 'regla', numero: normalizarNumero(n), cuerpo });
      continue;
    }
    const c = parseReferencia(t);
    if (c) claves.push(c);
  }
  return claves;
}

export function cruzarCitas(answer: string, docReferences: string[]): ResultadoCitas {
  // Índice del doc por cada clave (un doc puede aportar varias claves).
  const clavesDocs: Array<{ clave: ClaveCita; doc: number }> = [];
  docReferences.forEach((r, i) => { for (const clave of clavesDeReferencia(r)) clavesDocs.push({ clave, doc: i }); });
  const citadas = extraerCitas(answer);
  const respaldadas = new Map<string, number>();
  const noRespaldadas: string[] = [];
  for (const c of citadas) {
    const matches: number[] = [];
    const clavesDistintas = new Set<string>();
    for (const cd of clavesDocs) {
      if (!clavesIguales(c.clave, cd.clave)) continue;
      if (!matches.includes(cd.doc)) matches.push(cd.doc);
      clavesDistintas.add(`${cd.clave.tipo}|${cd.clave.numero}|${cd.clave.cuerpo ?? ''}`);
    }
    // Ambigüedad = la cita sin cuerpo cruza con PRECEPTOS distintos (Art. 54 LA
    // vs Art. 54 LFD), no con varios docs del mismo precepto.
    if (matches.length >= 1 && (clavesDistintas.size === 1 || c.clave.cuerpo)) {
      respaldadas.set(c.texto, matches[0]!);
    } else {
      noRespaldadas.push(c.texto);
    }
  }
  return { citadas, respaldadas, noRespaldadas };
}
