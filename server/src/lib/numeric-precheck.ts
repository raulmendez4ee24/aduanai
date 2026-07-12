/**
 * Pre-check determinista de atributos numéricos (Clasificador v2, Etapa 1).
 *
 * Extrae magnitudes declaradas en la descripción del producto (mm, pulgadas,
 * kg, ton, cm³, HP/CV, AWG, calibre de lámina, %, Brix, decitex, designación
 * métrica M{N} y patrón D×L de sujetadores) y las compara contra los umbrales
 * que las descripciones de las fracciones candidatas declaran ("inferior a
 * 6.4 mm", "superior a 16 mm pero inferior o igual a 35 mm"). Los veredictos
 * resueltos se inyectan al prompt como HECHOS.
 *
 * Principios (aprobados en el diseño de la Etapa 1):
 *  - 100% código, cero IA, determinista y puro (sin IO).
 *  - FALLA CERRADO: umbral no parseable, atributo no emparejable, unidad
 *    ambigua o valor dentro de la banda de guarda → NO se emite veredicto.
 *  - Solo mecanismos generales: convenciones de unidades y de tornillería
 *    (normas ASTM B258 / MSG / rosca métrica ISO), nunca reglas por caso.
 */

// ───────────────────────── Tipos ─────────────────────────

export type Dimension =
  | 'length_mm' | 'mass_kg' | 'volume_cm3' | 'power_kw'
  | 'percent' | 'brix' | 'decitex';

export interface Magnitude {
  dimension: Dimension;
  /** Valor en la unidad canónica de la dimensión (mm, kg, cm³, kW, %, …). */
  value: number;
  /** Atributo canónico declarado (espesor, anchura, longitud, diametro, peso, …) o null. */
  attribute: string | null;
  /** Para percent: sustantivo sujeto ("algodón", "grasa…"). */
  subject: string | null;
  /** Texto original del que se extrajo (para el HECHO legible). */
  raw: string;
}

export interface Constraint {
  dimension: Dimension;
  op: '<' | '<=' | '>' | '>=';
  /** Umbral en unidad canónica. */
  value: number;
  attribute: string | null;
  subject: string | null;
  raw: string;
}

export interface CandidateInput {
  code: string;
  codeFormatted?: string;
  description: string;
}

export interface ConstraintVerdict {
  code: string;
  codeFormatted: string;
  constraintRaw: string;
  verdict: 'CUMPLE' | 'NO_CUMPLE';
  fact: string;
}

export interface NumericFacts {
  magnitudes: Magnitude[];
  verdicts: ConstraintVerdict[];
  /** Bloque listo para el prompt, o null si no hubo nada resoluble. */
  block: string | null;
}

// ───────────────────────── Normalización ─────────────────────────

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function norm(s: string): string {
  return stripAccents(s.toLowerCase());
}

/** "7,000" → 7000; "0.5" → 0.5 */
function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';

// ───────────────────────── Atributos ─────────────────────────

/** Sinónimos → atributo canónico (Etapa 1, adición ratificada). */
const ATTR_CANON: Record<string, string> = {
  espesor: 'espesor', grosor: 'espesor',
  anchura: 'anchura', ancho: 'anchura',
  longitud: 'longitud', largo: 'longitud',
  altura: 'altura', alto: 'altura',
  diametro: 'diametro',
  peso: 'peso', masa: 'peso',
  capacidad: 'capacidad',
  cilindrada: 'cilindrada',
  potencia: 'potencia',
  titulo: 'titulo',
};
const ATTR_WORDS = Object.keys(ATTR_CANON).join('|');

function canonAttr(word: string | null | undefined): string | null {
  if (!word) return null;
  return ATTR_CANON[norm(word)] ?? null;
}

// ───────────────────────── Tablas estándar ─────────────────────────

/** ASTM B258 — diámetro de conductor por número AWG: d(mm) = 0.127·92^((36−n)/39). */
function awgToMm(n: number): number | null {
  if (!Number.isInteger(n) || n < 0 || n > 40) return null;
  return 0.127 * Math.pow(92, (36 - n) / 39);
}

/** Manufacturers' Standard Gauge (lámina de acero) — espesor en mm. */
const MSG_SHEET_MM: Record<number, number> = {
  3: 6.073, 4: 5.695, 5: 5.314, 6: 5.082, 7: 4.554, 8: 4.176, 9: 3.797,
  10: 3.416, 11: 3.038, 12: 2.657, 13: 2.278, 14: 1.897, 15: 1.709,
  16: 1.519, 17: 1.367, 18: 1.214, 19: 1.062, 20: 0.912, 21: 0.836,
  22: 0.759, 23: 0.683, 24: 0.607, 25: 0.531, 26: 0.455, 27: 0.417,
  28: 0.378, 29: 0.343, 30: 0.305,
};

// Contextos de gate (mecanismos generales, no productos del set)
const FASTENER_CTX = /\b(tornillos?|pernos?|birlos?|esparragos?|tuercas?|roscas?|roscad\w*)\b/;
const SHEET_CTX = /\b(lamina\w*|chapas?|acero)\b/;

// ───────────────────────── Extracción — producto ─────────────────────────

/**
 * Busca el ÚLTIMO atributo declarado en una ventana de 40 chars antes del
 * match ("capacidad de carga de 3 toneladas" → capacidad). Mismo criterio que
 * el lado catálogo: si el atributo está declarado aunque no sea adyacente,
 * cuenta — dejarlo pasar convertía la magnitud en "suelta" y el fallback de
 * emparejamiento podía cruzar capacidad (carga útil) con peso bruto.
 */
function attrNear(text: string, index: number): string | null {
  const before = text.slice(Math.max(0, index - 40), index);
  const m = before.match(new RegExp(`\\b(${ATTR_WORDS})\\b(?![\\s\\S]*\\b(?:${ATTR_WORDS})\\b)`));
  return canonAttr(m?.[1] ?? null);
}

export function extractProductMagnitudes(productDescription: string): Magnitude[] {
  const t = norm(productDescription);
  const out: Magnitude[] = [];
  const fastener = FASTENER_CTX.test(t);
  const push = (m: Magnitude) => out.push(m);

  // 1) Designación de rosca métrica M{N}[xL] — solo con contexto de sujetador.
  //    Convención ISO: M8 = diámetro nominal 8 mm; "M8x25" añade longitud 25 mm.
  if (fastener) {
    for (const m of t.matchAll(/\bm(\d{1,2}(?:\.\d)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\b/g)) {
      const d = parseFloat(m[1]!);
      if (d >= 1.6 && d <= 64) {
        push({ dimension: 'length_mm', value: d, attribute: 'diametro', subject: null, raw: m[0]!.toUpperCase() });
        if (m[2] != null) {
          push({ dimension: 'length_mm', value: parseFloat(m[2]), attribute: 'longitud', subject: null, raw: m[0]!.toUpperCase() });
        }
      }
    }
    // 2) Patrón D×L explícito en mm ("4mm × 30mm") — primera magnitud =
    //    diámetro, segunda = longitud (convención mecánica de sujetadores).
    for (const m of t.matchAll(new RegExp(`${NUM}\\s*mm\\s*[x×]\\s*${NUM}\\s*mm`, 'g'))) {
      push({ dimension: 'length_mm', value: parseNum(m[1]!), attribute: 'diametro', subject: null, raw: m[0]! });
      push({ dimension: 'length_mm', value: parseNum(m[2]!), attribute: 'longitud', subject: null, raw: m[0]! });
    }
  }

  // 3) Pulgadas fraccionarias: 1/4", 3/8", "1 1/2 pulgadas" → mm (exacto ×25.4).
  for (const m of t.matchAll(/(?:\b(\d+)\s+)?\b(\d+)\/(\d+)\s*(?:"|''|pulgadas?|pulg\b|in\b)/g)) {
    const whole = m[1] ? parseInt(m[1], 10) : 0;
    const val = (whole + parseInt(m[2]!, 10) / parseInt(m[3]!, 10)) * 25.4;
    push({ dimension: 'length_mm', value: val, attribute: attrNear(t, m.index!), subject: null, raw: m[0]! });
  }

  // 4) Longitudes con unidad explícita (mm/cm/m/pulgadas decimales).
  //    Se excluyen posiciones ya consumidas por D×L (dedupe simple por raw).
  const dxlSpans = new Set(out.filter(o => o.raw.includes('x') || o.raw.includes('×')).map(o => o.raw));
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(mm|cm|pulgadas?|pulg\\b|in\\b|m\\b)`, 'g'))) {
    const within = [...dxlSpans].some(s => s.includes(m[0]!));
    if (within) continue;
    const unit = m[2]!;
    const factor = unit === 'mm' ? 1 : unit === 'cm' ? 10 : unit === 'm' ? 1000 : 25.4;
    push({ dimension: 'length_mm', value: parseNum(m[1]!) * factor, attribute: attrNear(t, m.index!), subject: null, raw: m[0]! });
  }

  // 5) Masa: g/kg/ton/lb → kg. "Tonelada corta/larga" → sin extracción (ambigua).
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(kg|kilogramos?|kilos?|g\\b|gramos?|ton(?:eladas?)?\\b|lb\\b|libras?)`, 'g'))) {
    const unit = m[2]!;
    if (/^ton/.test(unit) && /tonelada\s+(corta|larga)/.test(t)) continue;
    const factor = /^ton/.test(unit) ? 1000 : /^(lb|libra)/.test(unit) ? 0.45359237 : /^(g|gramo)/.test(unit) ? 0.001 : 1;
    push({ dimension: 'mass_kg', value: parseNum(m[1]!) * factor, attribute: attrNear(t, m.index!), subject: null, raw: m[0]! });
  }

  // 6) Volumen/cilindrada: cc/cm³/l → cm³.
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(cc\\b|cm3|cm³|litros?|l\\b|ml\\b)`, 'g'))) {
    const unit = m[2]!;
    const factor = /^(l|litro)/.test(unit) ? 1000 : unit === 'ml' ? 1 : 1;
    push({ dimension: 'volume_cm3', value: parseNum(m[1]!) * factor, attribute: attrNear(t, m.index!), subject: null, raw: m[0]! });
  }

  // 7) Potencia: HP/CV/kW → kW (factores exactos distintos: HP ≠ CV).
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(hp\\b|cv\\b|caballos?\\b|kw\\b)`, 'g'))) {
    const unit = m[2]!;
    const factor = unit === 'hp' ? 0.745699872 : unit === 'kw' ? 1 : 0.73549875; // cv/caballos
    push({ dimension: 'power_kw', value: parseNum(m[1]!) * factor, attribute: 'potencia', subject: null, raw: m[0]! });
  }

  // 8) AWG → diámetro mm (el token "AWG" es el gate).
  for (const m of t.matchAll(/\bawg\s*(\d{1,2})\b|\b(\d{1,2})\s*awg\b/g)) {
    const mm = awgToMm(parseInt(m[1] ?? m[2]!, 10));
    if (mm != null) push({ dimension: 'length_mm', value: mm, attribute: 'diametro', subject: null, raw: m[0]! });
  }

  // 9) Calibre de lámina (MSG) → espesor mm; SOLO con contexto lámina/chapa/acero.
  if (SHEET_CTX.test(t)) {
    for (const m of t.matchAll(/\bcalibre\s*(\d{1,2})\b/g)) {
      const mm = MSG_SHEET_MM[parseInt(m[1]!, 10)];
      if (mm != null) push({ dimension: 'length_mm', value: mm, attribute: 'espesor', subject: null, raw: m[0]! });
    }
  }

  // 10) Porcentaje con sujeto adyacente ("60% algodón" / "algodón 60%").
  for (const m of t.matchAll(new RegExp(`(\\w{4,})\\s+(?:de\\s+)?${NUM}\\s*%|${NUM}\\s*%\\s*(?:de\\s+)?(\\w{4,})`, 'g'))) {
    const subject = m[1] ?? m[4] ?? null;
    const value = parseNum(m[2] ?? m[3]!);
    if (subject && value <= 100) push({ dimension: 'percent', value, attribute: null, subject: norm(subject), raw: m[0]! });
  }

  // 11) Brix y decitex (unidad idéntica requerida).
  for (const m of t.matchAll(new RegExp(`(?:valor\\s+)?brix\\s+(?:de\\s+)?${NUM}|${NUM}\\s*°?\\s*brix`, 'g'))) {
    push({ dimension: 'brix', value: parseNum(m[1] ?? m[2]!), attribute: null, subject: null, raw: m[0]! });
  }
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*decitex`, 'g'))) {
    push({ dimension: 'decitex', value: parseNum(m[1]!), attribute: null, subject: null, raw: m[0]! });
  }

  // Convención de sujetadores: una ÚNICA longitud sin atributo en contexto de
  // sujetador es el diámetro nominal (así se designa comercialmente: 'tornillo
  // de 1/4"'). Con 2+ longitudes sueltas no se asume nada (capa 2 del diseño).
  if (fastener) {
    const bareLengths = out.filter(o => o.dimension === 'length_mm' && o.attribute === null);
    if (bareLengths.length === 1) bareLengths[0]!.attribute = 'diametro';
  }

  return out;
}

// ───────────────────────── Extracción — catálogo ─────────────────────────

const CMP: [RegExp, Constraint['op']][] = [
  [/\b(?:superior|mayor)\s+o\s+igual\s+a(?:l)?\b/, '>='],
  [/\b(?:inferior|menor)\s+o\s+igual\s+a(?:l)?\b/, '<='],
  [/\b(?:superior|mayor)\s+a(?:l)?\b|\bque\s+exceda\s+de\b|\bexceda\s+de\b/, '>'],
  [/\b(?:inferior|menor)\s+a(?:l)?\b/, '<'],
  [/\bhasta\b/, '<='],
];

interface UnitSpec { dimension: Dimension; factor: number }
const CATALOG_UNITS: Record<string, UnitSpec> = {
  mm: { dimension: 'length_mm', factor: 1 },
  cm: { dimension: 'length_mm', factor: 10 },
  m: { dimension: 'length_mm', factor: 1000 },
  kg: { dimension: 'mass_kg', factor: 1 },
  g: { dimension: 'mass_kg', factor: 0.001 },
  t: { dimension: 'mass_kg', factor: 1000 },
  l: { dimension: 'volume_cm3', factor: 1000 },
  ml: { dimension: 'volume_cm3', factor: 1 },
  cm3: { dimension: 'volume_cm3', factor: 1 },
  'cm³': { dimension: 'volume_cm3', factor: 1 },
  cc: { dimension: 'volume_cm3', factor: 1 },
  kw: { dimension: 'power_kw', factor: 1 },
  cv: { dimension: 'power_kw', factor: 0.73549875 },
  hp: { dimension: 'power_kw', factor: 0.745699872 },
  '%': { dimension: 'percent', factor: 1 },
  decitex: { dimension: 'decitex', factor: 1 },
};

/**
 * Extrae restricciones numéricas de la descripción de UNA fracción.
 * Gramática cerrada: comparador español + número + unidad conocida. Todo lo
 * que no calce, se ignora (falla cerrado). Restricción sin atributo hereda el
 * de la restricción anterior de la misma descripción (compuestos "…X pero
 * inferior o igual a Y").
 */
export function extractConstraints(fractionDescription: string): Constraint[] {
  const t = norm(fractionDescription);
  const out: Constraint[] = [];
  const unitAlt = 'mm|cm3|cm³|cc|cm|ml|kg|kw|cv|hp|decitex|[%]|m\\b|g\\b|l\\b|t\\b';

  for (const [cmpRe, op] of CMP) {
    const re = new RegExp(`(${cmpRe.source})\\s+${NUM}\\s*(${unitAlt})?`, 'g');
    for (const m of t.matchAll(re)) {
      const numStr = m[2]!;
      const unitTok = (m[3] ?? '').trim();
      const idx = m.index!;
      // Atributo: ventana izquierda de 70 chars
      const left = t.slice(Math.max(0, idx - 70), idx);
      let attribute = null as string | null;
      let subject = null as string | null;
      let dimension: Dimension | null = null;
      let factor = 1;

      const attrM = left.match(new RegExp(`\\b(${ATTR_WORDS})\\b(?![\\s\\S]*\\b(?:${ATTR_WORDS})\\b)`));
      if (attrM) attribute = canonAttr(attrM[1]);
      const contM = left.match(/contenido\s+de\s+([a-zñ]+(?:\s+[a-zñ]+)?)(?![\s\S]*contenido\s+de)/);
      if (contM) subject = norm(contM[1]!);
      const isBrix = /valor\s+brix\s*$/.test(left.trim()) || /\bbrix\b/.test(left);

      if (unitTok && CATALOG_UNITS[unitTok]) {
        dimension = CATALOG_UNITS[unitTok]!.dimension;
        factor = CATALOG_UNITS[unitTok]!.factor;
      } else if (isBrix) {
        dimension = 'brix';
      } else if (subject) {
        // "contenido de X inferior al 20%" — a veces el % viene pegado después
        const after = t.slice(idx + m[0]!.length, idx + m[0]!.length + 3);
        if (after.includes('%') || m[0]!.includes('%')) dimension = 'percent';
      }
      if (!dimension) continue; // unidad desconocida → sin restricción (falla cerrado)

      out.push({ dimension, op, value: parseNum(numStr) * factor, attribute, subject, raw: m[0]!.trim(), });
    }
  }
  // Orden por posición aproximada no garantizado tras el loop por comparador;
  // herencia de atributo: aplica sobre el orden de aparición en el texto.
  out.sort((a, b) => t.indexOf(a.raw) - t.indexOf(b.raw));
  for (let i = 1; i < out.length; i++) {
    if (!out[i]!.attribute && out[i - 1]!.attribute && out[i]!.dimension === out[i - 1]!.dimension) {
      out[i]!.attribute = out[i - 1]!.attribute;
    }
  }
  return out;
}

// ───────────────────────── Emparejamiento y veredicto ─────────────────────────

const GUARD_BAND = 0.005; // 0.5% relativo — cerca del umbral no se opina

function fmt(v: number): string {
  const r = Math.round(v * 100) / 100;
  return r.toLocaleString('en-US');
}

function satisfied(op: Constraint['op'], v: number, t: number): boolean {
  switch (op) {
    case '<': return v < t;
    case '<=': return v <= t;
    case '>': return v > t;
    case '>=': return v >= t;
  }
}

const OP_TXT: Record<Constraint['op'], string> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' };
const DIM_UNIT: Record<Dimension, string> = {
  length_mm: 'mm', mass_kg: 'kg', volume_cm3: 'cm³', power_kw: 'kW',
  percent: '%', brix: '°Brix', decitex: 'decitex',
};

export function computeNumericFacts(productDescription: string, candidates: CandidateInput[]): NumericFacts {
  const magnitudes = extractProductMagnitudes(productDescription);
  const verdicts: ConstraintVerdict[] = [];
  if (magnitudes.length === 0) return { magnitudes, verdicts, block: null };

  // Capa 2 del diseño: para magnitudes SIN atributo, solo se empareja si
  // TODAS las restricciones de esa dimensión (en todo el set de candidatas)
  // apuntan al mismo atributo.
  const allConstraints = candidates.map(c => ({ c, cons: extractConstraints(c.description) }));
  const attrsByDim = new Map<Dimension, Set<string>>();
  for (const { cons } of allConstraints) {
    for (const k of cons) {
      if (!k.attribute) continue;
      if (!attrsByDim.has(k.dimension)) attrsByDim.set(k.dimension, new Set());
      attrsByDim.get(k.dimension)!.add(k.attribute);
    }
  }

  for (const { c, cons } of allConstraints) {
    for (const k of cons) {
      // Emparejar magnitud del producto
      let mag: Magnitude | undefined;
      if (k.dimension === 'percent') {
        mag = magnitudes.find(m => m.dimension === 'percent' && m.subject && k.subject
          && (m.subject.startsWith(k.subject.slice(0, 5)) || k.subject.startsWith(m.subject.slice(0, 5))));
      } else {
        const candidatesMag = magnitudes.filter(m => m.dimension === k.dimension);
        if (k.attribute) {
          mag = candidatesMag.find(m => m.attribute === k.attribute);
          if (!mag) {
            const bare = candidatesMag.filter(m => m.attribute === null);
            const attrs = attrsByDim.get(k.dimension) ?? new Set();
            if (bare.length === 1 && attrs.size <= 1) mag = bare[0];
          }
        } else {
          // Restricción sin atributo: emparejar solo si es la única de su
          // dimensión en esta candidata y el producto tiene UNA magnitud ahí.
          const sameDim = cons.filter(x => x.dimension === k.dimension);
          if (sameDim.length === 1 && candidatesMag.length === 1) mag = candidatesMag[0];
        }
      }
      if (!mag) continue; // no emparejable → sin veredicto

      // Banda de guarda (0.5% relativo) — la igualdad exacta SÍ resuelve.
      if (k.value > 0 && mag.value !== k.value && Math.abs(mag.value - k.value) / k.value <= GUARD_BAND) continue;

      const ok = satisfied(k.op, mag.value, k.value);
      const unit = DIM_UNIT[k.dimension];
      const conv = fmt(mag.value) !== mag.raw.replace(/\s+/g, ' ').trim()
        ? `${mag.raw.trim()} = ${fmt(mag.value)} ${unit}` : `${fmt(mag.value)} ${unit}`;
      const codeFmt = c.codeFormatted ?? c.code;
      const rel = ok ? OP_TXT[k.op] : (k.op === '<' || k.op === '<=' ? '≥' : '≤');
      verdicts.push({
        code: c.code,
        codeFormatted: codeFmt,
        constraintRaw: k.raw,
        verdict: ok ? 'CUMPLE' : 'NO_CUMPLE',
        fact: `${conv} ${rel} ${fmt(k.value)} ${unit} → el producto ${ok ? 'CUMPLE' : 'NO CUMPLE'} el criterio "${k.raw}" de ${codeFmt}`,
      });
    }
  }

  if (verdicts.length === 0) return { magnitudes, verdicts, block: null };

  // Violaciones primero (excluyen candidatas); tope de 14 líneas.
  const ordered = [...verdicts.filter(v => v.verdict === 'NO_CUMPLE'), ...verdicts.filter(v => v.verdict === 'CUMPLE')];
  const shown = ordered.slice(0, 14);
  const block = [
    'HECHOS NUMÉRICOS RESUELTOS (pre-check determinista en código — trátalos como verificados, NO los re-evalúes):',
    ...shown.map(v => `- ${v.fact}`),
    'Un NO CUMPLE excluye esa fracción por criterio numérico objetivo. Un CUMPLE valida SOLO el criterio numérico (el resto de criterios se evalúa normal).',
  ].join('\n');

  return { magnitudes, verdicts, block };
}
