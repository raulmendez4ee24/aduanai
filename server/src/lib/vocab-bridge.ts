/**
 * Puente de vocabulario comercial → catálogo TIGIE (Clasificador v2, Etapa 2).
 *
 * Diccionario CURADO y VERSIONADO: cada entrada mapea vocabulario comercial
 * (como describen los importadores) a términos que SÍ existen en el texto de
 * las fracciones del catálogo. Las expansiones se AÑADEN a los términos de
 * búsqueda de findRelatedFractions de forma determinista — nunca reemplazan.
 *
 * REGLAS DE CURADURÍA:
 *  - Cada término de expansión fue verificado contra el texto real de
 *    fracciones ACTIVAS (ver `evidence` y src/tests/vocab-bridge-verify.ts,
 *    que re-verifica TODO el diccionario contra la DB y falla si una entrada
 *    pierde sustento). Nada de sinónimos inventados en runtime.
 *  - Entradas son mecanismos GENERALES de vocabulario (electrónica, alimentos,
 *    autopartes, metales, plásticos, textil) — prohibido nombrar casos del
 *    accuracy set.
 *  - Las expansiones llevan acento correcto: la búsqueda regex corre contra el
 *    texto acentuado del catálogo ("teléfonos", no "telefonos").
 *
 * DESCARTADAS por falta de evidencia en fracciones (documentado 2026-07-11):
 *  - llanta→neumáticos: 4011 no dice "neumáticos" a nivel fracción.
 *  - bujía→bujías: 8511.10 no dice "bujías" (solo la 8511.80 precalentadoras).
 *  - pickup/camioneta→mercancías: 8704 no usa "mercancías"; además las
 *    keywords ya traen pickup/camioneta (el gap ahí es la opacidad de
 *    "Los demás.", no vocabulario).
 *  - jeans→mezclilla: "mezclilla" solo existe en TELAS (5209/5211), no en
 *    prendas 6204 — expandirlo metería ruido de capítulo.
 */

export const VOCAB_BRIDGE_VERSION = '2026-07-11';

export interface BridgeEntry {
  /** Se evalúa sobre la descripción normalizada (minúsculas, sin acentos). */
  match: RegExp;
  /** Términos del vocabulario del catálogo que se añaden a la búsqueda. */
  expand: string[];
  /** Fracciones activas cuyo texto contiene los términos (verificado en VERSION). */
  evidence: string;
}

export const VOCAB_BRIDGE: BridgeEntry[] = [
  // ── Electrónica ──
  {
    match: /disco duro|\bssd\b|estado solido|flash drive|pendrive|memoria usb/,
    expand: ['memoria', 'almacenamiento'],
    evidence: '84717001 "Unidades de memoria."; 85235101 "Dispositivos de almacenamiento no volátil"',
  },
  {
    match: /cable\s+(hdmi|usb|vga|displayport|coaxial|de video|de red)/,
    expand: ['conductores'],
    evidence: '85444201/85444999 "conductores eléctricos"; 85442001 "Cables coaxiales, de uno o más conductores"',
  },
  {
    match: /smartphone|telefono (celular|inteligente|movil)|\bcelular\b/,
    expand: ['teléfonos'],
    evidence: '85171301 "Teléfonos inteligentes."; 85171401 "Teléfonos celulares (no smartphones)."',
  },
  {
    match: /\blaptop\b|\bnotebook\b|computadora portatil/,
    expand: ['portátiles'],
    evidence: '84713001 "Máquinas automáticas para tratamiento o procesamiento de datos, portátiles"',
  },
  // ── Alimentos / conservas ──
  {
    match: /\batun\b/,
    expand: ['atunes'],
    evidence: '16041404 "Filetes (lomos) de atunes aleta amarilla"; 03023601 "Atunes del sur"',
  },
  {
    match: /en conserva|enlatad\w+|en lata\b/,
    expand: ['preparaciones', 'conservas'],
    evidence: '16042091 "Las demás preparaciones y conservas de pescado."',
  },
  // ── Autopartes de uso común ──
  {
    match: /bateria (de plomo|de auto|automotriz|para auto)|acumulador/,
    expand: ['acumuladores'],
    evidence: '85076001 "Acumuladores eléctricos de iones de litio"; 85078091 "Los demás acumuladores."',
  },
  {
    match: /amortiguador/,
    expand: ['amortiguadores'],
    evidence: '87088004 "Cartuchos para amortiguadores"; 87088011 "…diseñados exclusivamente para amortiguadores."',
  },
  {
    match: /\bbalata\w*|pastillas? de freno|discos? de freno/,
    expand: ['frenos'],
    evidence: '87083004 "Guarniciones de frenos montadas"; 87083008 "Frenos de tambor"',
  },
  // ── Metales ──
  {
    match: /galvanizad\w+/,
    expand: ['cincado'],
    evidence: '72103002/72122003 "Cincados electrolíticamente." (prefijo \\mcinca cubre cincado/cincados)',
  },
  {
    match: /lamina\s+(de\s+)?(acero|inoxidable|galvanizada)|hoja de acero/,
    expand: ['laminados'],
    evidence: '72081003 "Enrollados, simplemente laminados en caliente"; 7219/7211 laminados planos',
  },
  {
    match: /perfil\w*\s+(estructural\w*|ipr\b|ips\b|tipo\s+ipr)|\bviga\s+(ipr|de acero)/,
    expand: ['perfiles'],
    evidence: '72161001 "Perfiles en U, en I o en H"; 72162101 "Perfiles en L."',
  },
  // ── Plásticos / caucho ──
  {
    match: /tupperware|contenedor\w*\s+de\s+plastico|recipiente\w*\s+de\s+plastico/,
    expand: ['vajilla'],
    evidence: '39241001 "Vajilla y demás artículos para el servicio de mesa o de cocina."',
  },
  {
    match: /pelicula\s+(stretch|de polietileno|para embalaje)|film stretch|\bplayo\b/,
    expand: ['polímeros', 'etileno'],
    evidence: '39201005 "De polímeros de etileno."',
  },
  {
    match: /\bnitrilo\b|\blatex\b/,
    expand: ['caucho'],
    evidence: '40159001 "Prendas de vestir totalmente de caucho."; 4015 guantes de caucho vulcanizado',
  },
  // ── Textil ──
  {
    match: /\bplayera\w*|t-?shirt/,
    expand: ['camisetas'],
    evidence: '61091001 "T-shirts y camisetas interiores, de punto, de algodón"',
  },
];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Expansión determinista: términos del catálogo a añadir a la búsqueda para
 * una descripción comercial dada. Devuelve [] si ninguna entrada aplica.
 */
export function expandVocabTerms(description: string): string[] {
  const t = stripAccents(description.toLowerCase());
  const out: string[] = [];
  for (const e of VOCAB_BRIDGE) {
    if (e.match.test(t)) {
      for (const term of e.expand) if (!out.includes(term)) out.push(term);
    }
  }
  return out;
}
