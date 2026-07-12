/**
 * Pre-check de criterios estructurales material/tipo (Clasificador v2, Etapa 3).
 *
 * Mismo patrón que el pre-check numérico (Etapa 1): extracción determinista de
 * atributos DECLARADOS del producto (material del acero, fibra textil, tipo de
 * tejido, género, construcción de tubo, cuero) y matching contra los criterios
 * TEXTUALES de las fracciones candidatas. Los veredictos se inyectan como
 * HECHOS y refuerzan la regla simétrica específica/residual: específica solo
 * con criterio declarado CUMPLIDO.
 *
 * FALLA CERRADO:
 *  - Producto sin declaración en un eje → sin veredicto en ese eje.
 *  - Producto o candidata con DOS valores del mismo eje (mezclas "60% algodón
 *    40% poliéster", criterios compuestos) → sin veredicto en ese eje.
 *  - Ejes y patrones del lado catálogo verificados contra el texto real de
 *    fracciones activas el 2026-07-11 (conteos en cada eje). El valor
 *    "sin soldadura" NO tiene anclaje textual a nivel fracción (los tubos sin
 *    costura de 7304 se describen por proceso, no por costura) — el eje tubo
 *    solo puede confirmar/excluir contra candidatas "soldados".
 */

export interface StructuralAxis {
  axis: string;
  /** valor → patrón sobre la descripción del PRODUCTO (normalizada, sin acentos). */
  product: Record<string, RegExp>;
  /** valor → patrón sobre la descripción de la FRACCIÓN (normalizada). Con
   *  `negations` evaluadas primero (p. ej. "excepto de punto" ≠ "de punto"). */
  catalog: Record<string, RegExp>;
  /** Patrones de negación del catálogo: si matchean, asignan su valor ANTES
   *  de evaluar los patrones normales. */
  catalogNegations?: Record<string, RegExp>;
}

// Conteos = fracciones activas cuyo texto matchea (verificado 2026-07-11).
export const STRUCTURAL_AXES: StructuralAxis[] = [
  {
    axis: 'acero',
    product: {
      inoxidable: /\binoxidable\b/,
      carbono: /acero al carbon\w*|acero carbon\w*|acero sin alear/,
      aleado: /acero aleado|aceros aleados/,
    },
    catalog: {
      inoxidable: /acero inoxidable/, // 18 fracciones
      carbono: /sin alear/, // 10 fracciones
      aleado: /aceros? aleados?/, // ≥1 fracción
    },
  },
  {
    axis: 'fibra',
    product: {
      algodon: /\balgodon\b/,
      sintetica: /poliester|nylon|nailon|acrilic\w+|elastano|spandex|fibra\w* sintetic\w+/,
      artificial: /\brayon\b|viscosa|fibra\w* artificial\w*/,
      lana: /\blana\b/,
      seda: /\bseda\b/,
    },
    catalog: {
      algodon: /de algodon/, // 78
      sintetica: /fibras sinteticas/, // 64
      artificial: /fibras artificiales/, // 8
      lana: /de lana/, // 59
      seda: /de seda/, // 21
    },
  },
  {
    axis: 'tejido',
    product: {
      punto: /de punto/,
      plano: /tejido plano/,
    },
    catalog: {
      punto: /de punto/, // 25
      plano: /tejido plano/,
    },
    catalogNegations: {
      plano: /excepto de punto/, // 3
    },
  },
  {
    axis: 'genero',
    product: {
      masculino: /para (hombres?|caballeros?|ninos?)\b|de hombre\b/,
      femenino: /para (mujer(es)?|damas?|ninas?)\b|de mujer\b/,
    },
    catalog: {
      masculino: /para hombres o ninos|para hombres?\b/, // 10
      femenino: /para mujeres o ninas|para mujer(es)?\b/, // 8
    },
  },
  {
    axis: 'tubo',
    product: {
      sin_soldadura: /sin costura|sin soldadura/,
      soldado: /\bsoldad\w+|con costura/,
    },
    catalog: {
      soldado: /\bsoldad\w+/, // 6 — único valor con anclaje textual a nivel fracción
    },
  },
  {
    axis: 'cuero',
    product: {
      natural: /piel genuina|cuero genuino|piel natural|de piel\b|de cuero\b/,
      sintetico: /piel sintetica|imitacion (de )?piel|cuero sintetico|cuero regenerado/,
    },
    catalog: {
      natural: /cuero natural/, // 10
      sintetico: /cuero regenerado/,
    },
  },
];

export interface StructuralVerdict {
  code: string;
  codeFormatted: string;
  axis: string;
  productValue: string;
  catalogValue: string;
  verdict: 'CUMPLE' | 'NO_CUMPLE';
  fact: string;
}

export interface StructuralFacts {
  verdicts: StructuralVerdict[];
  block: string | null;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Detecta el valor de un eje en un texto; null si 0 o ≥2 valores (falla cerrado). */
function detect(patterns: Record<string, RegExp>, text: string, negations?: Record<string, RegExp>): string | null {
  const hits = new Set<string>();
  if (negations) {
    for (const [value, re] of Object.entries(negations)) {
      if (re.test(text)) return value; // la negación decide sola ("excepto de punto")
    }
  }
  for (const [value, re] of Object.entries(patterns)) {
    if (re.test(text)) hits.add(value);
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

const AXIS_LABEL: Record<string, string> = {
  acero: 'tipo de acero', fibra: 'fibra textil', tejido: 'construcción del tejido',
  genero: 'género', tubo: 'construcción del tubo', cuero: 'material del corte',
};

export function computeStructuralFacts(
  productDescription: string,
  candidates: { code: string; codeFormatted?: string; description: string }[],
): StructuralFacts {
  const p = norm(productDescription);
  const verdicts: StructuralVerdict[] = [];

  for (const ax of STRUCTURAL_AXES) {
    const productValue = detect(ax.product, p);
    if (!productValue) continue; // producto no declara (o declara mezcla) → sin veredicto

    for (const c of candidates) {
      const cd = norm(c.description);
      const catalogValue = detect(ax.catalog, cd, ax.catalogNegations);
      if (!catalogValue) continue; // candidata sin criterio textual en este eje

      const ok = productValue === catalogValue;
      const codeFmt = c.codeFormatted ?? c.code;
      verdicts.push({
        code: c.code, codeFormatted: codeFmt, axis: ax.axis, productValue, catalogValue,
        verdict: ok ? 'CUMPLE' : 'NO_CUMPLE',
        fact: ok
          ? `el producto declara ${AXIS_LABEL[ax.axis]} "${productValue}" y ${codeFmt} exige "${catalogValue}" → CUMPLE el criterio declarado`
          : `el producto declara ${AXIS_LABEL[ax.axis]} "${productValue}" pero ${codeFmt} exige "${catalogValue}" → NO CUMPLE`,
      });
    }
  }

  if (verdicts.length === 0) return { verdicts, block: null };

  // A1 (medición 2026-07-11, ajuste aprobado): solo exclusiones al prompt —
  // misma razón que el pre-check numérico (un CUMPLE inyectado atrae hacia
  // candidatas equivocadas). Los CUMPLE quedan en verdicts para logging.
  const exclusions = verdicts.filter(v => v.verdict === 'NO_CUMPLE').slice(0, 14);
  if (exclusions.length === 0) return { verdicts, block: null };
  const block = [
    'EXCLUSIONES DE MATERIAL/TIPO RESUELTAS (matching textual determinista — hechos verificados, NO los re-evalúes):',
    ...exclusions.map(v => `- ${v.fact}`),
    'Cada NO CUMPLE excluye esa fracción: exige un criterio que el producto declara distinto. Regla simétrica intacta: específica solo con criterio declarado cumplido; sin criterio declarado, la residual es la correcta.',
  ].join('\n');

  return { verdicts, block };
}
