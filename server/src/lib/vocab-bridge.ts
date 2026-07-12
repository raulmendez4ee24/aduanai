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
  /** A2 (2026-07-12): partidas (4 dígitos) de la EVIDENCIA — las filas que una
   *  expansión puede aportar se limitan a estos headings. Sin ancla, 'perfiles'
   *  arrastraba 7604 (aluminio) para un IPR de acero. */
  headings: string[];
  /** Fracciones activas cuyo texto contiene los términos (verificado en VERSION). */
  evidence: string;
}

export const VOCAB_BRIDGE: BridgeEntry[] = [
  // ── Electrónica ──
  {
    match: /disco duro|\bssd\b|estado solido|flash drive|pendrive|memoria usb/,
    expand: ['memoria', 'almacenamiento'],
    evidence: '84717001 "Unidades de memoria."; 85235101 "Dispositivos de almacenamiento no volátil"',
    headings: ['8471', '8523'],
  },
  {
    match: /cable\s+(hdmi|usb|vga|displayport|coaxial|de video|de red)/,
    expand: ['conductores'],
    evidence: '85444201/85444999 "conductores eléctricos"; 85442001 "Cables coaxiales, de uno o más conductores"',
    headings: ['8544'],
  },
  {
    match: /smartphone|telefono (celular|inteligente|movil)|\bcelular\b/,
    expand: ['teléfonos'],
    evidence: '85171301 "Teléfonos inteligentes."; 85171401 "Teléfonos celulares (no smartphones)."',
    headings: ['8517'],
  },
  {
    match: /\blaptop\b|\bnotebook\b|computadora portatil/,
    expand: ['portátiles'],
    evidence: '84713001 "Máquinas automáticas para tratamiento o procesamiento de datos, portátiles"',
    headings: ['8471'],
  },
  // ── Alimentos / conservas ──
  {
    match: /\batun\b/,
    expand: ['atunes'],
    evidence: '16041404 "Filetes (lomos) de atunes aleta amarilla"; 03023601 "Atunes del sur"',
    headings: ['0302', '1604'],
  },
  {
    match: /en conserva|enlatad\w+|en lata\b/,
    expand: ['preparaciones', 'conservas'],
    evidence: '16042091 "Las demás preparaciones y conservas de pescado."',
    headings: ['1604'],
  },
  // ── Autopartes de uso común ──
  {
    match: /bateria (de plomo|de auto|automotriz|para auto)|acumulador/,
    expand: ['acumuladores'],
    evidence: '85076001 "Acumuladores eléctricos de iones de litio"; 85078091 "Los demás acumuladores."',
    headings: ['8507'],
  },
  {
    match: /amortiguador/,
    expand: ['amortiguadores'],
    evidence: '87088004 "Cartuchos para amortiguadores"; 87088011 "…diseñados exclusivamente para amortiguadores."',
    headings: ['8708'],
  },
  {
    match: /\bbalata\w*|pastillas? de freno|discos? de freno/,
    expand: ['frenos'],
    evidence: '87083004 "Guarniciones de frenos montadas"; 87083008 "Frenos de tambor"',
    headings: ['8708'],
  },
  // ── Metales ──
  {
    match: /galvanizad\w+/,
    expand: ['cincado'],
    evidence: '72103002/72122003 "Cincados electrolíticamente." (prefijo \\mcinca cubre cincado/cincados)',
    headings: ['7210', '7212', '7217', '7225', '7314'],
  },
  {
    match: /lamina\s+(de\s+)?(acero|inoxidable|galvanizada)|hoja de acero/,
    expand: ['laminados'],
    evidence: '72081003 "Enrollados, simplemente laminados en caliente"; 72111301 "Laminados en las cuatro caras". NOTA: 7219 (inox) NO contiene el término a nivel fracción — verificado 2026-07-12; headings = distribución real del stem lamina en cap. 72',
    headings: ['7208', '7211', '7213', '7216', '7220', '7225', '7226'],
  },
  {
    match: /perfil\w*\s+(estructural\w*|ipr\b|ips\b|tipo\s+ipr)|\bviga\s+(ipr|de acero)/,
    expand: ['perfiles'],
    evidence: '72161001 "Perfiles en U, en I o en H"; 72162101 "Perfiles en L."',
    headings: ['7216'],
  },
  // ── Plásticos / caucho ──
  {
    match: /tupperware|contenedor\w*\s+de\s+plastico|recipiente\w*\s+de\s+plastico/,
    expand: ['vajilla'],
    evidence: '39241001 "Vajilla y demás artículos para el servicio de mesa o de cocina."',
    headings: ['3924'],
  },
  {
    match: /pelicula\s+(stretch|de polietileno|para embalaje)|film stretch|\bplayo\b/,
    expand: ['polímeros', 'etileno'],
    evidence: '39201005 "De polímeros de etileno."',
    headings: ['3920'],
  },
  {
    match: /\bnitrilo\b|\blatex\b/,
    expand: ['caucho'],
    evidence: '40159001 "Prendas de vestir totalmente de caucho."; 4015 guantes de caucho vulcanizado',
    headings: ['4015'],
  },
  // ── Textil ──
  {
    match: /\bplayera\w*|t-?shirt/,
    expand: ['camisetas'],
    evidence: '61091001 "T-shirts y camisetas interiores, de punto, de algodón"',
    headings: ['6109'],
  },
];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface AnchoredTerm {
  term: string;
  /** Partidas (4 dígitos) a las que este término puede aportar filas. */
  headings: string[];
}

/**
 * Expansión determinista: términos del catálogo a añadir a la búsqueda para
 * una descripción comercial dada, anclados a los headings de su evidencia
 * (A2). Si un término aparece en dos entradas, se unen sus headings.
 * Devuelve [] si ninguna entrada aplica.
 */
export function expandVocabTerms(description: string): AnchoredTerm[] {
  const t = stripAccents(description.toLowerCase());
  const byTerm = new Map<string, Set<string>>();
  for (const e of VOCAB_BRIDGE) {
    if (e.match.test(t)) {
      for (const term of e.expand) {
        if (!byTerm.has(term)) byTerm.set(term, new Set());
        for (const h of e.headings) byTerm.get(term)!.add(h);
      }
    }
  }
  return [...byTerm.entries()].map(([term, hs]) => ({ term, headings: [...hs].sort() }));
}
