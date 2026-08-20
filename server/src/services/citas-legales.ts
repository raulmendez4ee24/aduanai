/**
 * FRONTERA CANÓNICA · MATCHER DE CITAS LEGALES (Fase 3a, §4.1)
 *
 * Sustituye el matcher por tokens ("≥50% de palabras coinciden") que producía
 * falsos respaldos en ambas direcciones. Una cita está respaldada ⟺ su CLAVE
 * NORMALIZADA {tipo, numero, cuerpo} coincide EXACTAMENTE con la clave de un
 * documento recuperado. "Art. 54 LA" ≠ "Art. 54 LIVA" ≠ "Art. 54-A LA".
 */

export interface ClaveCita {
  tipo: 'articulo' | 'regla' | 'anexo' | 'rgi' | 'capitulo_tmec' | 'transitorio';
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

function normalizarCuerpo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const limpio = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^del?\s+/, '');
  if (CUERPOS[limpio]) return CUERPOS[limpio];
  // "RGCE 2026" etc. — quita año
  const sinAnio = limpio.replace(/\s*(19|20)\d{2}$/, '');
  return CUERPOS[sinAnio] ?? raw.trim().toUpperCase();
}

function normalizarNumero(raw: string): string {
  // "137 bis 1" → "137-BIS-1"; "88 bis"/"88 ter" → "88-BIS"/"88-TER"
  return raw.trim().toUpperCase()
    .replace(/\s+(BIS|TER|QU[AÁ]TER)\s+(\d)/g, '-$1-$2')
    .replace(/\s+(BIS|TER|QU[AÁ]TER)\b/g, '-$1')
    .replace(/\s+/g, '');
}

/** Parsea UNA referencia textual a clave. null = no es una cita reconocible. */
export function parseReferencia(texto: string): ClaveCita | null {
  const t = texto.trim();

  // RGI: "Regla General 3 a) (RGI)" / "RGI 3" — NUNCA es artículo
  let m = /(?:Regla\s+General\s+|RGI\s*)(\d+)\s*([a-f]\))?/i.exec(t);
  if (m && /RGI|Regla\s+General/i.test(t)) {
    return { tipo: 'rgi', numero: normalizarNumero(m[1]! + (m[2] ? ` ${m[2]}` : '')), cuerpo: 'LIGIE' };
  }

  // Regla RGCE: "Regla 7.1.6 RGCE 2026" / "Regla 1.2.1"
  m = /Regla\s+(\d+(?:\.\d+)+)\s*(?:de\s+las?\s+)?([A-Za-z].*)?$/i.exec(t);
  if (m) return { tipo: 'regla', numero: normalizarNumero(m[1]!), cuerpo: normalizarCuerpo(m[2]) ?? 'RGCE' };

  // Anexo: "Anexo 22 RGCE 2026" / "Anexo 2.4.1"
  m = /Anexo\s+(\d+(?:\.\d+)*(?:-[A-Z])?)\s*([A-Za-z].*)?$/i.exec(t);
  if (m) return { tipo: 'anexo', numero: normalizarNumero(m[1]!), cuerpo: normalizarCuerpo(m[2]) ?? 'RGCE' };

  // TMEC capítulo: "TMEC Cap. 4" / "Capítulo 4 del T-MEC"
  m = /(?:TMEC|T-MEC).*?Cap(?:ítulo|\.)?\s*(\d+)|Cap(?:ítulo|\.)?\s*(\d+)\s+(?:del\s+)?(?:TMEC|T-MEC)/i.exec(t);
  if (m) return { tipo: 'capitulo_tmec', numero: normalizarNumero(m[1] ?? m[2]!), cuerpo: 'TMEC' };

  // Transitorios de un decreto: "Transitorios DOF 19-11-2025 LA"
  m = /^Transitorios?\s+(?:del\s+Decreto\s+)?DOF\s+(\d{2}-\d{2}-\d{4})\s*([A-Za-z][A-Za-z\s-]{0,25})?$/i.exec(t);
  if (m) return { tipo: 'transitorio', numero: m[1]!, cuerpo: normalizarCuerpo(m[2]) };

  // Artículo: "Art. 54 LA" / "Artículo 28-A de la LIVA" / "Art. 4.5 T-MEC"
  m = /Art(?:ículo|\.)?\s*(\d+(?:\.\d+)*(?:-[A-Z])?(?:\s+(?:[Bb]is|[Tt]er|[Qq]u[aá]ter)(?:\s+\d+)?)?)\s*(?:,?\s*(?:fracci[oó]n\s+[IVXLC]+\s*)?)?(?:de\s+la\s+|de\s+el\s+|del\s+)?([A-Za-z][A-Za-z\s-]{0,25})?$/.exec(t);
  if (m) {
    return { tipo: 'articulo', numero: normalizarNumero(m[1]!), cuerpo: normalizarCuerpo(m[2]) };
  }

  return null;
}

/** Extrae las citas del texto de una respuesta (mismas familias que antes,
 *  pero cada una parseada a clave). */
export function extraerCitas(answer: string): { texto: string; clave: ClaveCita }[] {
  const patrones = [
    /Art(?:ículo|\.)?\s*\d+(?:\.\d+)*(?:-[A-Z])?(?:\s+(?:[Bb]is|[Tt]er|[Qq]u[aá]ter)(?:\s+\d+)?)?(?:\s+(?:de\s+la\s+|del\s+)?[A-Z][A-Za-z-]{1,10})?/g,
    /Transitorios?\s+(?:del\s+Decreto\s+)?DOF\s+\d{2}-\d{2}-\d{4}(?:\s+[A-Z][A-Za-z-]{1,10})?/g,
    /Regla\s+General\s+\d+\s*(?:[a-f]\))?\s*(?:\(RGI\))?/g,
    /Regla\s+\d+(?:\.\d+)+(?:\s+RGCE(?:\s+\d{4})?)?/g,
    /Anexo\s+\d+(?:\.\d+)*(?:-[A-Z])?(?:\s+RGCE(?:\s+\d{4})?)?/g,
    /(?:TMEC|T-MEC)\s+Cap(?:ítulo|\.)?\s*\d+/g,
  ];
  const vistas = new Set<string>();
  const out: { texto: string; clave: ClaveCita }[] = [];
  for (const pat of patrones) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(answer)) !== null) {
      const texto = m[0].trim();
      const clave = parseReferencia(texto);
      if (!clave) continue;
      const k = `${clave.tipo}|${clave.numero}|${clave.cuerpo ?? '*'}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      out.push({ texto, clave });
    }
  }
  return out;
}

export function clavesIguales(a: ClaveCita, b: ClaveCita): boolean {
  if (a.tipo !== b.tipo || a.numero !== b.numero) return false;
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
export function cruzarCitas(answer: string, docReferences: string[]): ResultadoCitas {
  const clavesDocs = docReferences.map(r => parseReferencia(r));
  const citadas = extraerCitas(answer);
  const respaldadas = new Map<string, number>();
  const noRespaldadas: string[] = [];
  for (const c of citadas) {
    const matches: number[] = [];
    clavesDocs.forEach((cd, i) => {
      if (cd && clavesIguales(c.clave, cd)) matches.push(i);
    });
    if (matches.length === 1 || (matches.length > 1 && c.clave.cuerpo)) {
      respaldadas.set(c.texto, matches[0]!);
    } else {
      noRespaldadas.push(c.texto);
    }
  }
  return { citadas, respaldadas, noRespaldadas };
}
