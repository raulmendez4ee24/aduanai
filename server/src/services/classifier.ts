import { llmGenerate, llmGenerateWithMeta } from '../lib/llm';
import { jsonrepair } from 'jsonrepair';
import { prisma } from '../lib/prisma';
import { computeNumericFacts } from '../lib/numeric-precheck';
import { logger } from '../lib/logger';
import { validateFraction, FRACTION_UNVERIFIED_MESSAGE } from './fraction-validator';
import type { KnowledgeUsedItem } from './traceability';
import {
  createClassifyInputError,
  createNoCandidateError,
  isNoCandidateCode,
  validateClassifyInput,
} from './classify-input';
import { extractSearchTerms } from './rgi6-terminos';
import {
  compararEspecificaVsResidual,
  filtrarAlternativasContradictorias,
  type ComparacionRGI6,
  type LlmRGI6,
} from './rgi6-especifica-residual';
import {
  lookupPrecedents,
  hasActiveLitigation,
  PRECEDENT_CORPUS_VERIFIED,
  precedentesPorFraccion,
  type PrecedentMatch,
  type PrecedentesPorFraccion,
} from './precedent-lookup';

export interface ClassificationResult {
  fraction: {
    code: string;
    description: string;
    chapter: string;
    section: string;
  };
  nico: string;
  confidence: number;
  griApplied: string[];
  tariffs: {
    nmf: number;
    preferential: Record<string, number>;
  };
  regulations: {
    rrna: string[];
    noms: string[];
    sectoralRegistry: boolean;
  };
  alternatives: {
    code: string;
    description: string;
    confidence: number;
    reason: string;
  }[];
  explanation: {
    simple: string;
    technical: string;
  };
  legalBasis: {
    griApplied: { rule: string; reasoning: string }[];
    legalNotes: { source: string; text: string }[];
    discardedFractions: { code: string; reason: string }[];
  };
  /**
   * Análisis comparativo cuando el USO destinado puede cambiar la clasificación
   * (típicamente material vs autoparte automotriz, aeronáutico, médico, etc.).
   * Solo se llena si la dualidad existe — null si no aplica.
   */
  useBasedAnalysis: {
    applies: boolean;
    byMaterial: { code: string; description: string; confidence: number };
    byUse: { code: string; description: string; confidence: number };
    criterion: string;
    recommendation: string;
    riskNote: string;
    precedents: string[];
  } | null;
  disclaimer: string;
  /**
   * Candado Fase 1b: presente SOLO cuando el código final emitido por el
   * LLM/verificador fue inválido (truncado/inexistente/inactivo) y el candado
   * cayó al código pre-verificación validado contra el catálogo. Observable
   * en la respuesta de la API; el evento también se loggea a SystemLog.
   */
  verifierFallback?: { invalidCode: string; usedCode: string; reason: string };
  /** Trazabilidad — modelo IA y conocimiento aplicado en esta clasificación. */
  _trace?: {
    modelUsed: string;
    modelProvider: string;
    knowledgeUsed: KnowledgeUsedItem[];
  };
  /** Precedentes legales relevantes (TFJA, SCJN, criterios SAT) y alerta de litigio. */
  precedents?: PrecedentMatch[];
  litigationAlert?: { active: boolean; cases: PrecedentMatch[] } | null;
  /** Ola 2: conteo honesto de criterios/tesis por fracción (con flag apagado: 0 + mensaje). */
  precedentes?: PrecedentesPorFraccion;
  /**
   * 4ª revisión, prioridad 1 — comparación RGI 6 "subpartida específica vs
   * residual" dentro de la MISMA partida. Presente SIEMPRE que la fracción
   * final salga de una residual del catálogo: dice si el pase corrió, cuál fue
   * la ganadora, la justificación escrita y el descarte textual de la
   * perdedora. `estado: 'no_ejecutado'` = el pase falló y se conservó la
   * elección original (nunca se inventa el veredicto).
   */
  rgi6?: ComparacionRGI6;
}

export const INDUSTRIAL_SECTORS = [
  'automotive_terminal',     // armadora
  'automotive_parts',        // autopartista
  'aeronautic',
  'consumer_electronics',
  'medical_pharma',
  'construction',
  'textile_apparel',
  'food_beverage',
  'industrial_machinery',
  'agriculture',
  'oil_gas',
  'chemicals',
  'general',
] as const;

export type IndustrialSector = typeof INDUSTRIAL_SECTORS[number];

export const IMPORTER_TYPES = ['IMMEX', 'DEFINITIVO', 'PERSONA_FISICA'] as const;
export type ImporterType = typeof IMPORTER_TYPES[number];

// ============================================
// USE-BASED RECLASSIFICATION RULES — uso destinado vs material
// ============================================

const USE_BASED_RULES = `
CRÍTICO — CLASIFICACIÓN POR USO DESTINADO vs MATERIAL:

El USO destinado y el SECTOR del importador pueden cambiar la clasificación. Ejemplos canónicos:

1) TORNILLERÍA AUTOMOTRIZ:
   - Tornillo de acero genérico → 7318.15
   - Mismo tornillo importado por ARMADORA o AUTOPARTISTA para ensamble vehicular,
     diseñado específicamente para una pieza automotriz (no comercial general)
     → potencial 8708.99 (partes y accesorios para vehículos)
   Criterio: Nota 2 de la Sección XVII excluye partes "uso general" cap 73,
   PERO si el tornillo es identificable como parte específica de un vehículo
   (forma, dimensiones, material especial), aplica cap 87.

2) CABLES Y ARNESES (juegos de cables):
   - Cable eléctrico genérico → 8544.42 / 8544.49 según el texto de cada subpartida
   - JUEGO DE CABLES (arnés) de los tipos utilizados en los medios de transporte
     → 8544.30, subpartida ESPECÍFICA POR DESTINO dentro de la misma partida
     85.44. No es la residual "los demás" de 8544.42/.49, ni el capítulo 87.
   Criterio (Nota 2 de la Sección XVII): las partes de vehículos van a su
   capítulo SALVO cuando son mercancía cubierta por una partida específica de
   los capítulos 84 a 90 — la 85.44 lo es. Por eso un arnés automotriz NO se
   reclasifica a 8708 y NO debe ofrecerse 8708.xx como alternativa en el mismo
   dictamen que invoca esa nota: sería contradictorio.

3) PLÁSTICOS PARA AUTOPARTES:
   - Pieza plástica genérica → cap 39
   - Tablero, defensa, manija, parrilla plástica para auto → 8708.XX
   Criterio: si tiene la forma terminada de una autoparte y se importa para
   ensamble vehicular, va a cap 87.

4) HULES PARA AUTOPARTES:
   - Manguera de hule genérica → cap 40
   - Sello/empaque/manguera específica para motor vehicular → 8708.XX
   Criterio: identificable como parte de motor o sistema vehicular.

5) COMPONENTES ELECTRÓNICOS:
   - Componente electrónico genérico → cap 85
   - Mismo componente para uso AERONÁUTICO o aeroespacial → potencial cap 88
     (partes de aeronaves) si está diseñado/certificado para aeronave
   - Componente para equipo MÉDICO certificado → potencial cap 90
     (instrumentos médicos) si es parte específica del equipo

6) PRODUCTOS FARMACÉUTICOS / MÉDICOS:
   - Sustancia química → cap 28-29
   - Misma sustancia presentada como medicamento dosificado → cap 30
   - Material para dispositivo médico identificable → cap 90

REGLA DE DECISIÓN:
- Si el USUARIO declara sector ${'AUTOMOTIVE_TERMINAL'} o ${'AUTOMOTIVE_PARTS'} y el producto
  es susceptible de uso vehicular específico, EVALÚA AMBAS clasificaciones.
- Si declara IMMEX automotriz + uso específico vehicular, la clasificación
  por uso (cap 87) GANA peso vs la genérica por material.
- Si el sector es general/sin declarar, prevalece la clasificación por
  material salvo que la descripción del producto deje claro el uso (ej. "tablero
  para Volkswagen Jetta", "arnés ECU motor diésel").

CUANDO LA DUALIDAD APLICA, en tu respuesta DEBES llenar 'useBasedAnalysis':
{
  "applies": true,
  "byMaterial": { "code": "7318.15.99", "description": "Tornillos de acero", "confidence": 75 },
  "byUse":      { "code": "8708.99.99", "description": "Partes y accesorios para vehículos", "confidence": 60 },
  "criterion": "Si el tornillo está específicamente diseñado para una pieza vehicular y se importa por la armadora con destino a ensamble, revisa las Notas de la Sección XVII y compara únicamente las fracciones candidatas vigentes; no afirmes precedentes sin contexto verificado.",
  "recommendation": "Si NO es importación específica para autopartes → 7318.15.99. Si SÍ → considerar 8708.99 con análisis de criterio.",
  "riskNote": "Reclasificar a 8708 sin sustento puede generar PAMA por incorrecta clasificación. Documentar con plano de pieza, número de parte OEM, contrato de suministro a armadora.",
  "precedents": []
}

IMPORTANTE sobre "precedents": NUNCA inventes referencias de tesis, criterios o
resoluciones (números de tesis, años, salas). SOLO cita precedentes que aparezcan
textualmente en el contexto que se te proporcionó; si no se te dio ninguno, deja
el arreglo vacío.

Si NO hay dualidad de clasificación (producto claro por material o producto claramente específico por uso), useBasedAnalysis = null.

PESO DE LA DECISIÓN según contexto declarado:
- IMMEX + AUTOMOTIVE_TERMINAL/PARTS + uso "ensamble vehicular": prefiere clasificación por USO (cap 87) si la descripción soporta.
- DEFINITIVO + sin sector específico: prefiere clasificación por MATERIAL.
- PERSONA_FISICA + uso personal: clasificación por MATERIAL salvo evidencia clara.
`;

// ============================================
// SECTOR-SPECIFIC RULES — Mejora #3
// ============================================

const SECTOR_RULES = `
REGLAS ESPECÍFICAS POR SECTOR — APLÍCALAS OBLIGATORIAMENTE:

TEXTILES (Capítulos 50-63):
Para textiles, determina PRIMERO y en este orden:
a) ¿Es de punto (cap 60-61) o tejido plano (cap 62)? Las prendas de punto van en cap 61, las de tejido plano en cap 62.
b) Material PRINCIPAL (regla de peso): ¿algodón (>50%)?, ¿fibra sintética?, ¿lana?, ¿seda?
c) ¿Es prenda exterior, interior, o accesorio?
d) ¿Para hombre/niño o mujer/niña?
e) Ropa de cama, mesa, tocador, cocina → cap 63
Cada combinación material+tejido+tipo+género tiene su propia fracción. Usa la fracción específica que corresponda a esa combinación; si el producto no encaja EXPLÍCITAMENTE en ninguna específica, la residual (.99) ES la correcta.

CALZADO (Capítulo 64):
a) Material de la SUELA determina la partida: caucho/plástico (6402-6405), cuero natural (6403)
b) Material del CORTE/parte superior determina la subpartida: cuero, textil, plástico, caucho
c) Tipo: deportivo, de vestir, de seguridad (con casquillo), sandalia, pantufla
d) Las botas de seguridad con casquillo metálico → 6403.51 (cuero) o 6402.91

VEHÍCULOS (Capítulo 87):
a) Tipo: automóvil de pasajeros (8703), camioneta pickup (8704), motocicleta (8711), bicicleta (8712)
b) Combustible: gasolina, diésel, eléctrico, híbrido — cada uno tiene su propia partida/subpartida
c) Cilindrada EXACTA en cc determina la subpartida:
   - Gasolina ≤1000cc, 1000-1500cc, 1500-3000cc, >3000cc
   - Diésel ≤1500cc, 1500-2500cc, >2500cc
d) Nuevo vs usado no afecta la clasificación arancelaria

ELECTRÓNICA (Capítulos 84-85):
a) Computadoras portátiles y tabletas → 8471.30.01
b) Smartphones → distingue 8517.13 de 8517.14 exclusivamente entre las fracciones candidatas vigentes; NO fijes un código de memoria
c) Monitores → 8528.52 (sin sintonizador TV) vs 8528.72 (con sintonizador/Smart TV)
d) Partes y accesorios van en partidas separadas de los equipos completos
e) Cables con conectores específicos → 8544

ALIMENTOS (Capítulos 01-24):
a) Estado: fresco, congelado, deshidratado, en conserva — cambia la partida
b) Procesamiento: entero, cortado, molido, preparado — puede cambiar el capítulo
c) Bebidas alcohólicas: tipo de destilación/fermentación determina partida (2203=cerveza, 2204=vino, 2208=destilados)

PLÁSTICOS (Capítulo 39):
a) Forma primaria (pellets, resinas) → 3901-3914
b) Productos semiacabados (láminas, películas, tubos) → 3916-3921
c) Artículos terminados (envases, vajilla, artículos de higiene) → 3922-3926
d) Tipo de polímero: PE, PP, PVC, PET, PS → cada uno tiene su partida en formas primarias

METALES (Capítulos 72-83):
a) Tipo de metal base: hierro/acero (72-73), cobre (74), aluminio (76)
b) Forma: lingotes, láminas, barras, tubos, alambre, tornillos/tuercas
c) Aleación: acero al carbón vs inoxidable vs aleado
d) Tornillos/tuercas → 7318 (acero), con subpartidas por tipo de cabeza y rosca
`;

// ============================================
// ENHANCED SYSTEM PROMPT — Mejoras #1, #3
// ============================================

const SYSTEM_PROMPT = `Eres un experto clasificador arancelario mexicano con 20 años de experiencia. Tu trabajo es clasificar productos en fracciones arancelarias de la TIGIE (Tarifa de la Ley de los Impuestos Generales de Importación y de Exportación) de México.

REGLAS GENERALES:
1. Aplica las Reglas Generales Interpretativas (GRI 1-6) del Sistema Armonizado
2. Identifica la fracción arancelaria COMPLETA a 8 dígitos
3. Proporciona un score de confianza (0-100)
4. Lista las GRI que aplicaste y por qué
5. NO emitas NICO, aranceles (NMF/preferenciales) ni RRNA/NOMs/padrón: esos datos se toman SIEMPRE del catálogo oficial, no de ti
6. Proporciona 2-3 fracciones alternativas con justificación
7. Da una explicación en lenguaje simple Y técnico

APLICACIÓN OBLIGATORIA DE LAS 6 GRI (en orden estricto):

Para clasificar este producto, aplica las Reglas Generales de Interpretación en orden:

GRI 1: Busca primero si el producto está descrito textualmente en alguna partida. Lee las Notas Legales de la sección y capítulo aplicables — estas tienen fuerza legal sobre los títulos.

GRI 2a: Si el producto está incompleto, sin montar, o sin ensamblar, clasifícalo como si estuviera completo.

GRI 2b: Si es una mezcla de materiales, considera qué material le da el carácter esencial.

GRI 3: Si el producto podría ir en dos o más partidas:
  3a: La partida más específica prevalece sobre la genérica.
  3b: Para mezclas y surtidos, clasifica por el material o componente que le da carácter esencial.
  3c: Si todo falla, la última partida en orden numérico.

GRI 4: Si ninguna partida aplica, clasifica en la del artículo más análogo o semejante.

GRI 5: Los estuches y envases van con el producto que contienen (salvo que tengan valor propio).

GRI 6: A nivel de subpartida y fracción, aplica las mismas reglas anteriores considerando las notas de subpartida.

En tu respuesta, SIEMPRE incluye (en el campo legalBasis):
1. Qué GRI aplicaste y por qué (rule + reasoning)
2. Qué notas legales revisaste (source = "Nota X del capítulo Y" o "Nota de sección Z", text = contenido)
3. Por qué descartaste otras partidas posibles (code + reason)

INSTRUCCIÓN CRÍTICA SOBRE LOS ÚLTIMOS DÍGITOS:
Los últimos 2 dígitos de la fracción mexicana (posiciones 7-8) distinguen variantes ESPECÍFICAS del producto. Presta ESPECIAL atención a:
- Material principal (algodón vs poliéster vs mezcla vs lana)
- Tipo de tejido (punto vs plano vs no tejido)
- Peso/gramaje del material
- Uso específico (doméstico vs industrial vs médico)
- Grado de elaboración o procesamiento
- Para quién es (hombre, mujer, niño)

OBLIGATORIO: Revisa TODAS las fracciones del subheading (6 dígitos) que te proporcioné antes de elegir. Prefiere una fracción específica SÓLO si el producto cumple EXPLÍCITAMENTE sus criterios (material, dimensiones, especificación técnica). Si NINGUNA fracción específica de las disponibles aplica al producto, la residual .99/.00 ("los demás") ES la clasificación correcta — NO la evites cuando es la que corresponde, ni fuerces una específica (tampoco la .01) cuyos criterios el producto no cumple.

GUÍA DE DESAMBIGUACIÓN (últimos 2 dígitos de la fracción):

Cuando identifiques la subpartida (6 dígitos), ANTES de dar la fracción final (8 dígitos) pregúntate:

1. ¿Hay variantes por MATERIAL específico?
   - algodón ≥85% vs mezcla vs fibras sintéticas vs artificiales (lana/seda)
   - fibras "sintéticas" (poliéster, nylon, acrílico) ≠ "artificiales" (rayón, viscosa, lyocell)

2. ¿Hay variantes por USO específico?
   - deportivo (running, tenis, gym) vs vestir vs seguridad industrial vs casual
   - hombre vs mujer vs niño (en prendas de vestir)

3. ¿Hay variantes por CARACTERÍSTICA técnica?
   - con/sin elastómero (lycra/spandex) — "stretch" o "skinny" implica elastómero → fracción distinta
   - con/sin conectores (cables: 8544.42 con, 8544.49 sin)
   - añejo/reposado/blanco (tequila): cada uno tiene fracción distinta
   - con/sin sintonizador TV (8528.52 monitor sin, 8528.72 televisor con)
   - con/sin puntera metálica (calzado: 6403.40 seguridad vs 6403.99 vestir)

4. ¿Hay variantes por TAMAÑO/CAPACIDAD?
   - envases ≤2L vs más grandes (vinos 2204.21 vs 2204.22)
   - cilindrada de motor (vehículos: rangos 1000/1500/3000 cc)
   - peso (laptops ≤10kg → 8471.30; otros → 8471.41)

5. ¿Hay variantes por FORMA del producto?
   - cápsulas/tabletas vs polvo vs líquido (suplementos 2106.90.01 vs .09 vs .10)
   - primaria (pellets) vs semiacabado (láminas) vs terminado (envases) en plásticos

REGLA: elige la fracción específica que sea consistente con la descripción y cuyos criterios el producto cumpla EXPLÍCITAMENTE. Si la descripción no aporta el detalle que distingue una específica, o si ninguna específica aplica al producto, NO inventes una específica ni asumas la .01: usa la residual .99/.00 ("los demás"), que es la clasificación correcta cuando no hay una específica aplicable.

REGLA DIMENSIONAL: si la descripción incluye dimensiones numéricas (diámetro, longitud, capacidad, peso, cilindrada), compáralas EXPLÍCITAMENTE contra los umbrales numéricos de las fracciones candidatas ANTES de decidir entre específica y residual (ej.: fracción "diámetro inferior a 6.4 mm y longitud inferior a 50.8 mm" + producto "4 mm × 30 mm" → 4 < 6.4 Y 30 < 50.8 → la específica APLICA; producto "M8 = 8 mm" → 8 ≥ 6.4 → NO aplica → residual). Muestra la comparación en el razonamiento.

PROCESO DE CLASIFICACIÓN:
1. Identifica la Sección y Capítulo correctos
2. Determina la Partida (4 dígitos) aplicando GRI 1
3. Determina la Subpartida (6 dígitos) aplicando GRI 6
4. Elige la Fracción mexicana (8 dígitos) revisando TODAS las opciones disponibles del subheading
5. Verifica que la fracción elegida sea la que CORRESPONDE al producto: una específica sólo si el producto cumple sus criterios; si ninguna aplica, la residual (.99/.00)

${SECTOR_RULES}

${USE_BASED_RULES}

IMPORTANTE: Si no tienes certeza alta, indícalo claramente. La clasificación arancelaria tiene implicaciones legales.

Responde SIEMPRE en formato JSON válido con esta estructura:
{
  "fraction": { "code": "XXXX.XX.XX", "description": "...", "chapter": "XX", "section": "..." },
  "confidence": 85,
  "griApplied": ["Regla General 1 (RGI 1): ...", "Regla General 6 (RGI 6): ..."],
  "alternatives": [{ "code": "YYYY.YY.YY", "description": "...", "confidence": 60, "reason": "..." }],
  "explanation": { "simple": "...", "technical": "..." },
  "legalBasis": {
    "griApplied": [
      { "rule": "Regla General 1 (RGI 1)", "reasoning": "El producto se describe textualmente en la partida 61.09 como..." },
      { "rule": "Regla General 6 (RGI 6)", "reasoning": "A nivel de subpartida se aplicó..." }
    ],
    "legalNotes": [
      { "source": "Nota 1 del capítulo 61", "text": "Este capítulo comprende solamente artículos de punto confeccionados..." }
    ],
    "discardedFractions": [
      { "code": "62.05", "reason": "Se descartó porque el producto es de tejido de punto (cap 61), no de tejido plano (cap 62)" }
    ]
  },
  "useBasedAnalysis": null,
  "disclaimer": "Esta clasificación es orientativa. La clasificación oficial debe ser validada por un agente aduanal certificado."
}`;

// ============================================
// KNOWLEDGE BASE SEARCH
// ============================================

/**
 * Filtro del retrieval de conocimiento (Bloque 3, sin contaminación entre
 * tenants): se consume (a) lo VERIFICADO por staff, de cualquier origen, o
 * (b) lo NO verificado del MISMO tenant en sus capítulos probables. Las filas
 * de feedback de otros tenants (y las legadas globales sin verificar) jamás
 * entran al prompt de otro tenant. Sin tenant (demo pública) → solo (a).
 */
export function construirFiltroConocimiento(probableChapters: string[], tenantId?: string): Record<string, unknown> {
  const ramas: Record<string, unknown>[] = [{ verified: true }];
  if (tenantId && probableChapters.length > 0) {
    ramas.push({ AND: [{ tenantId }, { chapterCode: { in: probableChapters } }] });
  }
  return { OR: ramas };
}

async function findRelevantKnowledge(description: string, probableChapters: string[] = [], tenantId?: string) {
  const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0 && probableChapters.length === 0) return [];

  const all = await prisma.classificationKnowledge.findMany({
    where: construirFiltroConocimiento(probableChapters, tenantId) as never,
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 80,
  });

  const descLower = description.toLowerCase();
  const scored = all.map(k => {
    let score = (k.priority ?? 5) * 10;
    const kwArr = Array.isArray(k.keywords) ? (k.keywords as string[]) : [];
    for (const kw of kwArr) {
      if (descLower.includes(String(kw).toLowerCase())) score += 15;
    }
    const prodArr = Array.isArray(k.products) ? (k.products as string[]) : [];
    for (const p of prodArr) {
      if (descLower.includes(String(p).toLowerCase())) score += 20;
    }
    if (k.chapterCode && probableChapters.includes(k.chapterCode)) score += 25;
    if (!k.verified) score -= 20;
    return { k, score };
  });

  return scored
    .filter(({ k }) => {
      // El corpus de precedentes está apagado: tampoco se permite reintroducir
      // precedentes/criterios mediante ClassificationKnowledge.
      if (!PRECEDENT_CORPUS_VERIFIED && (k.type === 'PRECEDENTE' || k.type === 'CRITERIO_SAT')) return false;

      // DEFERRED #18: 8517.13.01 y 8517.14.01 conviven activas con conocimiento
      // contradictorio. Hasta cotejar SNICE, se excluyen casos de smartphone del
      // prompt y el modelo debe decidir solo entre candidatos vigentes.
      const knowledgeText = `${k.title} ${k.content} ${k.fractionCode ?? ''}`;
      if (/smartphone|tel[eé]fono inteligente/i.test(knowledgeText) && /8517[.\s]?1[34]/.test(knowledgeText)) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.k);
}

function formatKnowledgeForPrompt(kn: Awaited<ReturnType<typeof findRelevantKnowledge>>): string {
  if (kn.length === 0) return '';
  const lines = kn.map((k, i) => {
    const header = `[${k.type}${k.fractionCode ? ` — ${k.fractionCode}` : ''}] ${k.title}`;
    return `— Caso ${i + 1}: ${header}\n${k.content}\n(Fuente: ${k.source})`;
  });
  return `\n\nCONOCIMIENTO ESPECÍFICO DISPONIBLE PARA ESTA CLASIFICACIÓN:\n\n${lines.join('\n\n')}\n\nUSA ESTE CONOCIMIENTO como contexto auxiliar, limitado por las fracciones candidatas vigentes. No lo describas como precedente legal salvo que el contexto incluya una fuente oficial verificable. Si hay un ERROR_COMUN relevante, evítalo explícitamente.\n`;
}

// ============================================
// IMPROVED DB SEARCH — Mejora #2
// ============================================

// 2ª Ola Etapa 2 (F1) — higiene de términos de búsqueda. El diagnóstico de los
// 37 candados de la línea base mostró que "para"/"tipo" (substring) matcheaban
// "preparaciones"/"reparación" en miles de filas y el take-30 SIN ORDEN devolvía
// filas arbitrarias. La lista de stopwords y `extractSearchTerms` viven ahora en
// services/rgi6-terminos.ts (VERBATIM, mismo comportamiento) para que el pase
// RGI 6 específica-vs-residual use el MISMO criterio de término significativo
// sin duplicar la lista.

interface RankedFraction {
  code: string; codeFormatted: string; description: string;
  tariffNMF: number | null; noms: string[]; requiresPermit: boolean;
  permitType: string | null; sectoralRegistry: boolean;
}

async function findRelatedFractions(description: string) {
  // Etapa 2 (puente de vocabulario) APAGADA al cierre de la ola v2
  // (2026-07-12): la re-medición única con diccionario anclado (A2) no cumplió
  // los criterios de cierre (56.6%, techo 62.6% aun regalando timeouts, meta
  // 63.6% — artefacto tests/medicion-a1a2-2026-07-12.json). El diccionario
  // lib/vocab-bridge.ts y su verificador quedan en código, sin conectar, para
  // la siguiente ola (DEFERRED #19 es la palanca principal).
  const searchItems: { term: string; headings: string[] | null }[] =
    extractSearchTerms(description).slice(0, 8).map(term => ({ term, headings: null }));
  const searchWords = searchItems.map(i => i.term); // mismo nombre aguas abajo

  // 2ª Ola Etapa 2 (F2) — fase 1 RANKEADA: una consulta por término (match por
  // FRONTERA DE PALABRA en descripción, no substring; y elemento exacto en
  // keywords), unión puntuada en JS: keywords pesa 3, descripción 2. El top-30
  // sale por score — la partida correcta ya no pierde la votación por ruido.
  const SELECT = 'code, "codeFormatted", description, "tariffNMF", noms, "requiresPermit", "permitType", "sectoralRegistry"';
  const scored2 = new Map<string, { frac: RankedFraction; score: number }>();
  const addHit = (frac: RankedFraction, weight: number) => {
    const cur = scored2.get(frac.code);
    if (cur) cur.score += weight;
    else scored2.set(frac.code, { frac, score: weight });
  };
  await Promise.all(searchItems.map(async ({ term, headings }) => {
    // Raíz por prefijo para flexiones del español ("motocicleta" debe matchear
    // "motociclos"; "calcetines" ↔ "calcetín"): palabras ≥6 chars se recortan
    // 3 (mínimo 5) y el regex ancla en frontera de palabra (\m + prefijo).
    const stem = term.length >= 6 ? term.slice(0, Math.max(5, term.length - 3)) : term;
    // Variantes naive singular/plural para el match exacto del array keywords.
    const kwVariants = [...new Set([term, `${term}s`, `${term}es`, term.replace(/e?s$/, '')])].filter(Boolean);
    // Filtro de ancla (solo términos puente): headings ya validados \d{4}.
    const headingSql = headings && headings.length > 0
      ? ` AND (${headings.map(h => `code LIKE '${h}%'`).join(' OR ')})`
      : '';
    const [kwRows, descRows, dfRaw] = await Promise.all([
      // LIMIT 200 + orden determinista: con 40, términos de df>40 ("ácido",
      // 137 filas) devolvían una muestra arbitraria y la fracción correcta
      // podía perder su crédito (re-introducía el bug del take-30 ciego).
      prisma.fraction.findMany({
        where: {
          active: true,
          keywords: { hasSome: kwVariants },
          ...(headings && headings.length > 0 ? { OR: headings.map(h => ({ code: { startsWith: h } })) } : {}),
        },
        select: { code: true, codeFormatted: true, description: true, tariffNMF: true, noms: true, requiresPermit: true, permitType: true, sectoralRegistry: true },
        orderBy: { code: 'asc' },
        take: 200,
      }),
      prisma.$queryRawUnsafe<RankedFraction[]>(
        `SELECT ${SELECT} FROM fractions WHERE active = true AND description ~* $1${headingSql} ORDER BY code LIMIT 200`,
        `\\m${stem}`,
      ),
      // Frecuencia documental del término (para IDF) — dentro del ancla si la hay.
      prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM fractions WHERE active = true AND description ~* $1${headingSql}`,
        `\\m${stem}`,
      ),
    ]);
    // Ponderación IDF (regresión detectada en la re-medición): sin ella,
    // "ácido" (cientos de fracciones) pesa igual que "sulfúrico" (poquísimas)
    // y el ruido con 3 términos genéricos le gana a la correcta con 2
    // específicos ("Aguacate Hass fresco" perdía contra capítulos de carne
    // porque "frescos o refrigerados" aparece en cientos de descripciones).
    const df = Number(dfRaw[0]?.n ?? 0);
    const idf = 1 / Math.log2(4 + df);
    for (const r of kwRows) addHit(r as RankedFraction, 3 * idf);
    // El raw SQL puede traer noms NULL (filas cargadas fuera de Prisma) — el
    // formateador del prompt hace f.noms.length; normalizamos aquí.
    for (const r of descRows) addHit({ ...r, noms: r.noms ?? [] }, 2 * idf);
  }));
  const keywordMatches = [...scored2.values()]
    .sort((a, b) => b.score - a.score || a.frac.code.localeCompare(b.frac.code))
    .slice(0, 30)
    .map(x => x.frac);

  // Determine most likely headings (4 digits) from initial matches
  const headingCounts = new Map<string, number>();
  const chapterCounts = new Map<string, number>();
  for (const m of keywordMatches) {
    const heading = m.code.substring(0, 4);
    const chapter = m.code.substring(0, 2);
    headingCounts.set(heading, (headingCounts.get(heading) || 0) + 1);
    chapterCounts.set(chapter, (chapterCounts.get(chapter) || 0) + 1);
  }

  // Get top 3 headings
  const topHeadings = [...headingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(e => e[0]);

  const topChapters = [...chapterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(e => e[0]);

  if (topHeadings.length === 0) {
    return { relatedFractions: keywordMatches, chapterFractions: [], topChapters: [] };
  }

  // Phase 2: Fetch ALL fractions from the top headings (not entire chapter)
  // This gives complete context within the relevant headings without token overflow
  const headingFractions = await prisma.fraction.findMany({
    where: {
      OR: topHeadings.map(h => ({ code: { startsWith: h } })),
      active: true,
    },
    select: { code: true, codeFormatted: true, description: true, tariffNMF: true, noms: true, requiresPermit: true, permitType: true, sectoralRegistry: true },
    orderBy: { code: 'asc' },
  });

  // Phase 3: Also get nearby headings from same chapter for broader context (limited)
  const nearbyFractions = await prisma.fraction.findMany({
    where: {
      code: { startsWith: topChapters[0] },
      active: true,
    },
    select: { code: true, codeFormatted: true, description: true, tariffNMF: true, noms: true, requiresPermit: true, permitType: true, sectoralRegistry: true },
    orderBy: { code: 'asc' },
    take: 80,
  });

  // Filter out fractions already in headingFractions
  const headingCodes = new Set(headingFractions.map(f => f.code));
  const uniqueNearby = nearbyFractions.filter(f => !headingCodes.has(f.code));

  return {
    relatedFractions: keywordMatches,
    chapterFractions: [...headingFractions, ...uniqueNearby.slice(0, 60)],
    topChapters,
  };
}

// ============================================
// VERIFICATION STEP — Mejora #4
// ============================================

async function verifyClassification(
  description: string,
  suggestedCode: string,
  alternatives: { code: string; description: string }[],
  chapterFractions: { codeFormatted: string; description: string }[]
): Promise<{ verifiedCode: string; changed: boolean }> {
  // Get fractions from same subheading for comparison
  const subheading = suggestedCode.replace(/[.\-\s]/g, '').substring(0, 6);
  const subheadingOptions = chapterFractions
    .filter(f => f.codeFormatted.replace(/[.\s]/g, '').startsWith(subheading))
    .map(f => `${f.codeFormatted}: ${f.description}`)
    .join('\n');

  // Also get fractions from alternative subheadings
  const altSubheadings = alternatives
    .map(a => a.code.replace(/[.\-\s]/g, '').substring(0, 6))
    .filter(s => s !== subheading);

  const altOptions = chapterFractions
    .filter(f => altSubheadings.some(s => f.codeFormatted.replace(/[.\s]/g, '').startsWith(s)))
    .map(f => `${f.codeFormatted}: ${f.description}`)
    .join('\n');

  const allOptions = [subheadingOptions, altOptions].filter(Boolean).join('\n');
  if (!allOptions) return { verifiedCode: suggestedCode, changed: false };

  const text = await llmGenerate({
    temperature: 0, // clasificación determinista (2ª Ola Etapa 2)
    model: 'fast',
    maxTokens: 300,
    system: `Eres un verificador de clasificación arancelaria mexicana. Se te da un producto, una fracción sugerida, y TODAS las fracciones del mismo subheading. Tu trabajo es verificar si la fracción sugerida CORRESPONDE al producto según los criterios textuales de cada fracción (material, dimensiones, especificación), o si otra de la lista corresponde mejor.

Responde ÚNICAMENTE con JSON: {"code": "XXXX.XX.XX", "changed": true/false, "reason": "..."}
- Si la sugerida corresponde al producto, devuélvela con changed=false
- REGLA SIMÉTRICA específica/residual: elige una específica SOLO si el producto declara explícitamente el criterio que esa fracción exige (región, origen, material, uso, dimensión). Si la específica exige algo NO declarado (p. ej. "del Estado de Morelos", "Café Veracruz" cuando la descripción no menciona ese origen) → la residual .99/.00 ES la correcta. Pero si el producto SÍ declara el criterio de una específica (p. ej. "de acero inoxidable") → esa específica, NO la residual
- El código DEBE ser una de las opciones listadas`,
    user: `PRODUCTO: ${description}
FRACCIÓN SUGERIDA: ${suggestedCode}

TODAS LAS FRACCIONES DISPONIBLES EN ESTE SUBHEADING Y ALTERNATIVAS:
${allOptions}

¿Es ${suggestedCode} la que corresponde al producto según los criterios (material, dimensiones, especificación) de cada fracción, o corresponde mejor otra de la lista?`,
  });

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.code && result.code !== suggestedCode) {
        return { verifiedCode: result.code, changed: true };
      }
    }
  } catch {
    // Verification failed, keep original
  }

  return { verifiedCode: suggestedCode, changed: false };
}

/**
 * ¿Se acepta el cambio de código que propone el verificador (Mejora #4)?
 *
 * El verificador corre con el modelo RÁPIDO y su encargo documentado es
 * comprobar la fracción DENTRO de la subpartida ya razonada ("Se te da …
 * TODAS las fracciones del mismo subheading"). Como al prompt también se le
 * añaden las subpartidas de las alternativas, en la práctica podía mover la
 * clasificación a OTRA PARTIDA — el modelo fuerte razonaba 8544.30.99 para un
 * arnés automotriz y el verificador lo mandaba a 8512.90.07 (partes de
 * aparatos de alumbrado) dejando el dictamen contradiciéndose: todos los
 * descartes escritos decían que la 85.44 era la correcta.
 *
 * Regla: el verificador puede corregir subpartida y fracción DENTRO de la
 * misma partida (4 dígitos). Un salto de partida es una RE-CLASIFICACIÓN, no
 * una verificación, y no puede decidirla el modelo rápido por encima del
 * razonamiento escrito del fuerte: se conserva el código razonado y queda
 * constancia en SystemLog.
 *
 * `CLASIFICADOR_VERIFICADOR_CAMBIA_PARTIDA=1` restaura el comportamiento
 * anterior (el verificador puede saltar de partida) sin tocar código.
 */
export function aceptarCambioDelVerificador(
  suggestedCode: string,
  verifiedCode: string,
  env: NodeJS.ProcessEnv = process.env,
): { aceptar: boolean; motivo: string } {
  const a = suggestedCode.replace(/\D/g, '');
  const b = verifiedCode.replace(/\D/g, '');
  if (b.length !== 8) return { aceptar: false, motivo: `el verificador emitió "${verifiedCode}", que no es una fracción de 8 dígitos` };
  if (a.length !== 8) return { aceptar: true, motivo: 'no había código razonado válido con el que comparar' };
  if (a.slice(0, 4) === b.slice(0, 4)) return { aceptar: true, motivo: 'mismo capítulo y partida: es una corrección de subpartida/fracción' };
  if (env.CLASIFICADOR_VERIFICADOR_CAMBIA_PARTIDA === '1') {
    return { aceptar: true, motivo: 'salto de partida permitido por configuración' };
  }
  return {
    aceptar: false,
    motivo: `el verificador propuso saltar de la partida ${a.slice(0, 4)} a la ${b.slice(0, 4)}; ese paso solo confirma la fracción dentro de la partida ya razonada`,
  };
}

// ============================================
// MAIN CLASSIFICATION FUNCTION
// ============================================

export interface ClassifyOptions {
  /** Uso destinado del producto (texto libre) */
  useCase?: string;
  /** Sector industrial declarado por el importador */
  sector?: IndustrialSector;
  /** Tipo de importador (afecta peso de la dualidad material vs uso) */
  importerType?: ImporterType;
  /** Tenant que clasifica: habilita su propio conocimiento no verificado (Bloque 3). */
  tenantId?: string;
}

const SECTOR_LABELS: Record<IndustrialSector, string> = {
  automotive_terminal: 'Automotriz — armadora terminal (OEM)',
  automotive_parts: 'Automotriz — autopartista (Tier 1/2/3)',
  aeronautic: 'Aeronáutico / Aeroespacial',
  consumer_electronics: 'Electrónica de consumo',
  medical_pharma: 'Médico / Farmacéutico',
  construction: 'Construcción',
  textile_apparel: 'Textil / Confección',
  food_beverage: 'Alimentos y bebidas',
  industrial_machinery: 'Maquinaria industrial',
  agriculture: 'Agropecuario',
  oil_gas: 'Petróleo y gas',
  chemicals: 'Químicos',
  general: 'General / Comercializadora',
};

/**
 * CANDADO FINAL del Clasificador (Fase 1b) — misma familia que los candados de
 * Inventario/MVE: el código que sale de classifyProduct DEBE existir y estar
 * vigente en el catálogo `Fraction`. El LLM/verificador puede emitir códigos
 * truncados a subpartida (visto en vivo: "7318.15") o inexistentes; nada de eso
 * debe llegar al usuario.
 *
 * Orden de decisión (falla cerrado):
 *  1. Código final válido → pasa intacto.
 *  2. Inválido pero el código pre-verificación SÍ valida → fallback a ese, con
 *     descripción canónica del catálogo + logger.warn (SystemLog) + flag
 *     `verifierFallback` en la respuesta para observabilidad.
 *  3. Ninguno valida → Error explícito; NO se devuelve fracción fabricada.
 */
export async function enforceCatalogFraction(
  result: ClassificationResult,
  preVerificationCode: string,
): Promise<ClassificationResult> {
  if (isNoCandidateCode(result.fraction.code)) {
    throw createNoCandidateError();
  }

  const finalCheck = await validateFraction(result.fraction.code);
  if (finalCheck.valid) return result;

  const fallback = await validateFraction(preVerificationCode);
  if (fallback.valid) {
    const invalidCode = result.fraction.code;
    const usedCode = `${fallback.code.slice(0, 4)}.${fallback.code.slice(4, 6)}.${fallback.code.slice(6, 8)}`;
    logger.warn(
      `Clasificador emitió código inválido "${invalidCode}" (${finalCheck.reason}); fallback al código pre-verificación ${usedCode}`,
      {
        action: 'classifier_fraction_fallback',
        entity: 'classification',
        metadata: { invalidCode, usedCode, reason: finalCheck.reason },
      },
    );
    result.fraction.code = usedCode;
    if (fallback.description) result.fraction.description = fallback.description;
    result.verifierFallback = { invalidCode, usedCode, reason: finalCheck.reason };
    return result;
  }

  throw new Error(
    `El clasificador no produjo una fracción válida del catálogo (final: "${result.fraction.code}", pre-verificación: "${preVerificationCode}"). ${FRACTION_UNVERIFIED_MESSAGE} Reintenta o reformula la descripción.`,
  );
}

export async function classifyProduct(
  description: string,
  context?: string,
  options?: ClassifyOptions,
): Promise<ClassificationResult> {
  const inputValidation = validateClassifyInput(description);
  if (!inputValidation.ok) {
    throw createClassifyInputError(inputValidation.reason);
  }

  // Mejora #2: Better DB search with full chapter context
  const { relatedFractions, chapterFractions, topChapters } = await findRelatedFractions(description);

  // Knowledge base lookup (casos reales, errores comunes, reglas de sector)
  const knowledge = await findRelevantKnowledge(description, topChapters || [], options?.tenantId);
  const knowledgeContext = formatKnowledgeForPrompt(knowledge);

  // Precedentes legales para alimentar el prompt (TFJA, SCJN, criterios SAT)
  const searchKeywords = description.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 5);
  const promptPrecedents = await lookupPrecedents({
    chapter: topChapters?.[0],
    keywords: searchKeywords,
    limit: 4,
  });
  const precedentContext = promptPrecedents.length > 0
    ? `\n\nPRECEDENTES LEGALES Y CRITERIOS RELEVANTES PARA ESTA CLASIFICACIÓN:\n\n${promptPrecedents.map((p, i) =>
        `[${p.type} ${p.reference}] ${p.title}\n  Resumen: ${p.summary}\n  Determinación: ${p.ruling}\n  Aplicabilidad: ${p.applicability ?? '—'}`,
      ).join('\n\n')}\n\nUSA estos precedentes para fundamentar tu decisión. Si un precedente aplica directamente al producto, MENCIÓNALO en el campo legalBasis.griApplied como reasoning.`
    : '';

  // 2ª Ola Etapa 2.3-iter2: aquí vivía una capa de re-scoring MUERTA (contaba
  // score=1 por fracción — venían ya dedupeadas — y un sort no-op) cuyo único
  // efecto real era truncar el top-30 rankeado a 10: el ácido sulfúrico llegaba
  // #16 del ranking IDF y el modelo jamás lo veía. Los 30 pasan directo — ya
  // vienen ordenados por relevancia desde findRelatedFractions.
  const topRelated = relatedFractions;

  // Etapa 1 (Clasificador v2): pre-check determinista de atributos numéricos.
  // Compara magnitudes declaradas del producto contra umbrales parseables de
  // TODAS las candidatas que verá el modelo (top-30 + heading/capítulo) y, si
  // resuelve algo, inyecta los veredictos como HECHOS. Falla cerrado: sin
  // magnitudes o sin umbrales parseables el prompt queda idéntico.
  const precheckPool = new Map<string, { code: string; codeFormatted?: string; description: string }>();
  for (const f of topRelated) precheckPool.set(f.code, f);
  for (const f of chapterFractions.slice(0, 150)) if (!precheckPool.has(f.code)) precheckPool.set(f.code, f);
  const precheckCandidates = [...precheckPool.values()];
  const numericFacts = computeNumericFacts(description, precheckCandidates);
  // Etapa 3 (criterios estructurales) APAGADA al cierre de la ola v2
  // (2026-07-12): su integración no cumplió los criterios de cierre en la
  // re-medición única (ver tests/medicion-a1a2-2026-07-12.json). El módulo
  // lib/structural-precheck.ts y sus tests quedan en código, sin conectar.
  // El pre-check NUMÉRICO (Etapa 1) permanece ACTIVO en modo solo-exclusiones
  // (A1): recuperó #11/#21 y nunca mostró firma de regresión.
  const numericContext = numericFacts.block ? `\n\n${numericFacts.block}` : '';

  // Format related fractions
  const relatedContext = topRelated.length > 0
    ? `\n\nFRACCIONES TIGIE MÁS RELEVANTES POR BÚSQUEDA:\n${topRelated.map(f => {
        const extras = [];
        if (f.tariffNMF !== null) extras.push(`IGI: ${f.tariffNMF}%`);
        if (f.noms.length > 0) extras.push(`NOMs: ${f.noms.join(', ')}`);
        if (f.requiresPermit) extras.push(`Permiso: ${f.permitType}`);
        return `- ${f.codeFormatted}: ${f.description}${extras.length ? ` [${extras.join(' | ')}]` : ''}`;
      }).join('\n')}`
    : '';

  // Format heading/nearby fractions context — Mejora #2 (limited to avoid token overflow)
  const chapterContext = chapterFractions.length > 0
    ? `\n\nFRACCIONES DEL MISMO HEADING Y CAPÍTULO ${topChapters?.join('/')} — REVISA CADA UNA PARA ELEGIR LA MÁS ESPECÍFICA:\n${chapterFractions.slice(0, 150).map(f => `- ${f.codeFormatted}: ${f.description}`).join('\n')}`
    : '';

  // Bloque de contexto operacional (uso destinado, sector, importador)
  const opsContextLines: string[] = [];
  if (options?.useCase) opsContextLines.push(`USO DESTINADO: ${options.useCase}`);
  if (options?.sector) opsContextLines.push(`SECTOR INDUSTRIAL DEL IMPORTADOR: ${SECTOR_LABELS[options.sector] ?? options.sector}`);
  if (options?.importerType) opsContextLines.push(`TIPO DE IMPORTADOR: ${options.importerType}`);
  const opsContext = opsContextLines.length > 0
    ? `\n\nCONTEXTO OPERACIONAL DECLARADO POR EL USUARIO:\n${opsContextLines.join('\n')}\n\nEvalúa si este contexto activa la clasificación POR USO (cap 87 autopartes, cap 88 aeronáutico, cap 90 médico, etc.) vs la clasificación por MATERIAL. Si el sector es automotriz/aeronáutico/médico/farmacéutico Y el producto puede tener doble clasificación, llena obligatoriamente el campo useBasedAnalysis del JSON.`
    : '';

  const userMessage = `Clasifica el siguiente producto para importación a México:

PRODUCTO: ${description}
${context ? `CONTEXTO ADICIONAL: ${context}` : ''}${opsContext}${numericContext}
${knowledgeContext}${precedentContext}
${relatedContext}
${chapterContext}

INSTRUCCIONES:
1. Revisa TODAS las fracciones del capítulo proporcionadas arriba
2. Identifica la subpartida (6 dígitos) correcta
3. Dentro de esa subpartida, elige la fracción (8 dígitos) que CORRESPONDA al producto
4. REGLA SIMÉTRICA específica/residual: elige una específica SOLO si el producto declara explícitamente el criterio que esa fracción exige (región, origen, material, uso, dimensión, especificación técnica). Si la específica exige algo NO declarado (p. ej. "del Estado de Morelos" cuando la descripción no menciona origen) → la residual .99/.00 ES la correcta. Pero si el producto SÍ declara el criterio de una específica (p. ej. "de acero inoxidable" y existe fracción de inoxidable) → esa específica, NO la residual
5. Si alguna fracción de la lista coincide EXACTAMENTE con el producto, úsala
6. Las alternativas deben ser del MISMO capítulo pero diferentes subpartidas
7. Si el USO o SECTOR declarado activa una clasificación alternativa (autopartes, aeronáutico, médico), llena 'useBasedAnalysis' con ambas opciones, criterio, recomendación, riesgo y precedentes. Si no aplica, useBasedAnalysis = null.
8. SOLO puedes responder con una fracción de 8 dígitos que APAREZCA en las listas de candidatos proporcionadas arriba. Si NINGUNA fracción listada aplica al producto, responde con "fraction": {"code": "SIN_CANDIDATO", "description": "", "chapter": "", "section": ""} — NUNCA escribas de memoria un código que no esté en las listas (los códigos de memoria suelen ser subpartidas de 6 dígitos u obsoletos y se rechazan).

Responde en JSON válido.`;

  const generation = await llmGenerateWithMeta({
    model: 'strong',
    maxTokens: 3000,
    temperature: 0, // clasificación determinista (2ª Ola Etapa 2)
    system: SYSTEM_PROMPT,
    user: userMessage,
  });
  const text = generation.text;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No se pudo parsear la respuesta del clasificador');
  }

  // JSON.parse estricto rompe ante trailing commas y comentarios estilo JS
  // que algunos modelos LLM emiten (visto con sonnet-4-6 → SyntaxError en
  // arrays grandes). Reintentamos con jsonrepair si la primera pasada falla.
  let result: ClassificationResult;
  try {
    result = JSON.parse(jsonMatch[0]) as ClassificationResult;
  } catch (parseErr) {
    try {
      const repaired = jsonrepair(jsonMatch[0]);
      result = JSON.parse(repaired) as ClassificationResult;
    } catch (repairErr) {
      throw new Error(
        `LLM devolvió JSON malformado (parse: ${parseErr instanceof Error ? parseErr.message : 'unknown'}; ` +
        `repair: ${repairErr instanceof Error ? repairErr.message : 'unknown'})`,
      );
    }
  }

  // Normalización defensiva: el LLM a veces OMITE campos que el resto del
  // pipeline y la UI asumen presentes (reproducido con "Tequila 100% agave
  // México" → result.explanation undefined → crash en la UI). Defaulteamos en
  // la fuente para que la API nunca devuelva una forma que truene al cliente.
  if (!result.fraction || typeof result.fraction.code !== 'string') {
    throw new Error('El clasificador no devolvió una fracción válida. Reintenta o reformula la descripción.');
  }
  // 2ª Ola Etapa 2 (F3): el modelo declaró honestamente que NINGÚN candidato
  // del catálogo aplica — falla cerrada ANTES de verificación (misma familia
  // que el candado final, que queda intacto como última línea).
  if (isNoCandidateCode(result.fraction.code)) {
    throw createNoCandidateError();
  }
  if (!result.explanation || typeof result.explanation.simple !== 'string') {
    result.explanation = {
      simple: result.explanation?.simple ?? 'Clasificación generada. Revisa la fundamentación legal y valida con tu agente aduanal.',
      technical: result.explanation?.technical ?? '',
    };
  }
  // Fase 1b (Frontera Canónica): el prompt YA NO pide nico/tariffs/regulations
  // — estos defaults son el placeholder que la reconciliación de la ruta
  // SUSTITUYE por los canónicos. Si un modelo viejo los emite igual, la
  // reconciliación también los descarta (y registra la discrepancia).
  if (typeof result.nico !== 'string') result.nico = '';
  result.regulations = {
    rrna: result.regulations?.rrna ?? [],
    noms: result.regulations?.noms ?? [],
    sectoralRegistry: result.regulations?.sectoralRegistry ?? false,
  };
  result.tariffs = {
    // null (no 0): "el LLM no lo emitió" ≠ "arancel 0%". La reconciliación de
    // la ruta lo sustituye SIEMPRE por el canónico antes de cualquier lector.
    nmf: result.tariffs?.nmf ?? (null as unknown as number),
    preferential: result.tariffs?.preferential ?? {},
  };
  if (!Array.isArray(result.alternatives)) result.alternatives = [];
  if (!Array.isArray(result.griApplied)) result.griApplied = [];

  // Trazabilidad: capturar modelo y conocimiento aplicado
  result._trace = {
    modelUsed: generation.model,
    modelProvider: generation.provider,
    knowledgeUsed: knowledge.map(k => ({
      id: k.id,
      title: k.title,
      type: String(k.type),
      fractionCode: k.fractionCode ?? null,
    })),
  };

  // Default useBasedAnalysis a null si el LLM lo omite o devuelve {applies:false}
  if (!result.useBasedAnalysis || result.useBasedAnalysis.applies === false) {
    result.useBasedAnalysis = null;
  } else if (!PRECEDENT_CORPUS_VERIFIED) {
    // El LLM no puede rodear el switch inventando strings en este subcampo.
    result.useBasedAnalysis.precedents = [];
  }

  // Precedentes finales: lookup específico con la fracción ya elegida
  const finalFraction = result.fraction.code.replace(/[^0-9]/g, '');
  const topicHints = [
    options?.sector === 'automotive_terminal' || options?.sector === 'automotive_parts' ? 'reclasificación' : null,
    options?.sector === 'aeronautic' || options?.sector === 'medical_pharma' ? 'uso_destinado' : null,
    result.useBasedAnalysis ? 'uso_destinado' : null,
  ].filter(Boolean) as string[];
  result.precedents = await lookupPrecedents({
    fractionCode: finalFraction,
    chapter: finalFraction.slice(0, 2),
    topics: topicHints,
    keywords: searchKeywords,
    limit: 5,
  });
  const litigation = await hasActiveLitigation(finalFraction);
  result.litigationAlert = litigation.has ? { active: true, cases: litigation.precedents } : null;
  // Ola 2: panel "esta fracción tiene N criterios y M tesis" — estado honesto.
  try { result.precedentes = await precedentesPorFraccion(finalFraction); } catch { /* el panel se omite */ }

  // Mejora #4: Second verification with Haiku
  const suggestedCode = result.fraction.code;
  const verification = await verifyClassification(
    description,
    suggestedCode,
    result.alternatives || [],
    chapterFractions,
  );

  if (isNoCandidateCode(verification.verifiedCode)) {
    throw createNoCandidateError();
  }

  const cambioDelVerificador = verification.changed
    ? aceptarCambioDelVerificador(suggestedCode, verification.verifiedCode)
    : { aceptar: false, motivo: '' };

  if (verification.changed && !cambioDelVerificador.aceptar) {
    logger.warn(
      `Verificador descartado: ${cambioDelVerificador.motivo} (razonado ${suggestedCode}, propuesto ${verification.verifiedCode})`,
      {
        action: 'classifier_verifier_rechazado',
        entity: 'classification',
        metadata: { suggestedCode, verifiedCode: verification.verifiedCode, motivo: cambioDelVerificador.motivo },
      },
    );
  }

  if (verification.changed && cambioDelVerificador.aceptar) {
    // Update the fraction code with verified one
    const cleanCode = verification.verifiedCode.replace(/[.\-\s]/g, '');
    const formatted = `${cleanCode.slice(0, 4)}.${cleanCode.slice(4, 6)}.${cleanCode.slice(6, 8)}`;

    // Find the fraction in DB for description
    const verifiedFraction = chapterFractions.find(f =>
      f.codeFormatted.replace(/[.\s]/g, '') === cleanCode ||
      f.code === cleanCode
    );

    result.fraction.code = formatted;
    if (verifiedFraction) {
      result.fraction.description = verifiedFraction.description;
    }
  }

  // Mejora #5: Fallback if confidence < 70%
  if (result.confidence < 70 && chapterFractions.length > 0) {
    // Low confidence — retry with expanded context
    const retryMessage = `La clasificación anterior dio confianza baja (${result.confidence}%).

PRODUCTO: ${description}
FRACCIÓN SUGERIDA: ${result.fraction.code} (confianza: ${result.confidence}%)

Revisa estas alternativas del mismo capítulo y elige la MEJOR:
${chapterFractions.slice(0, 100).map(f => `- ${f.codeFormatted}: ${f.description}`).join('\n')}

¿Hay una fracción más apropiada? Responde con el mismo formato JSON.`;

    let retryResult: ClassificationResult | undefined;
    try {
      const retryText = await llmGenerate({
        model: 'strong',
        maxTokens: 3000,
        temperature: 0, // clasificación determinista (2ª Ola Etapa 2)
        system: SYSTEM_PROMPT,
        user: retryMessage,
      });

      const retryMatch = retryText.match(/\{[\s\S]*\}/);
      if (retryMatch) {
        try {
          retryResult = JSON.parse(retryMatch[0]) as ClassificationResult;
        } catch {
          retryResult = JSON.parse(jsonrepair(retryMatch[0])) as ClassificationResult;
        }
      }
    } catch {
      // Keep original result
    }

    if (retryResult) {
      if (isNoCandidateCode(retryResult.fraction?.code)) {
        throw createNoCandidateError();
      }
      if (retryResult.confidence > result.confidence) {
        result = retryResult;
      }
    }
  }

  // CANDADO FINAL (Fase 1b): valida el código emitido contra el catálogo, sea
  // cual sea la ruta que lo produjo (LLM inicial, verificador o retry de
  // confianza baja). Falla cerrado — nunca sale un código inexistente/truncado.
  result = await enforceCatalogFraction(result, suggestedCode);

  // ── RGI 6: subpartida ESPECÍFICA vs RESIDUAL (4ª revisión, prioridad 1) ──
  // Si la fracción final es residual y en la MISMA partida hay una subpartida
  // específica cuyo texto coincide con el producto o con el uso declarado, se
  // compara textualmente y se deja el descarte por escrito ANTES de aceptar la
  // residual. Falla suave: si el pase no corre, la elección original se queda.
  result = await aplicarRGI6(result, description, options);

  // Alternativas contradictorias: si el razonamiento invoca una nota de
  // exclusión, ninguna alternativa puede vivir en el capítulo excluido.
  result = await depurarAlternativasContradictorias(result);

  return result;
}

/**
 * Aplica el pase RGI 6 específica-vs-residual y deja constancia escrita en
 * `legalBasis` (lo que la pantalla y el dictamen ya renderizan) además del
 * bloque `rgi6` de la respuesta. Nunca lanza: ante cualquier fallo devuelve el
 * resultado intacto con `rgi6.estado = 'no_ejecutado'`.
 */
export async function aplicarRGI6(
  result: ClassificationResult,
  description: string,
  options?: ClassifyOptions,
  /** Inyectable SOLO para tests: por defecto el pase usa el cliente del clasificador. */
  llm?: LlmRGI6,
): Promise<ClassificationResult> {
  let comparacion: ComparacionRGI6;
  try {
    comparacion = await compararEspecificaVsResidual({
      descripcion: description,
      usoDestino: options?.useCase ?? null,
      sector: options?.sector ? (SECTOR_LABELS[options.sector] ?? options.sector) : null,
      codigoElegido: result.fraction.code,
      llm,
    });
  } catch (e) {
    // El orquestador ya atrapa el fallo del LLM; esto cubre un fallo de
    // catálogo/DB para que el clasificador no se caiga por la comparación.
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`Comparación RGI 6 no disponible: ${msg}`, {
      action: 'rgi6_no_disponible', entity: 'classification',
      metadata: { code: result.fraction.code, error: msg.slice(0, 300) },
    });
    result.rgi6 = {
      estado: 'no_ejecutado', ejecutado: false, residual: null, candidata: null,
      ganadora: null, justificacion: null, descarte: null, notas: [],
      aviso: 'No se pudo ejecutar la comparación específica vs residual (el catálogo no respondió): se conserva la fracción elegida por el motor.',
      error: msg,
    };
    return result;
  }

  result.rgi6 = comparacion;

  result.legalBasis = {
    griApplied: result.legalBasis?.griApplied ?? [],
    legalNotes: result.legalBasis?.legalNotes ?? [],
    discardedFractions: result.legalBasis?.discardedFractions ?? [],
  };

  // Estados sin pase: no se toca la clasificación ni se ensucia el dictamen.
  if (comparacion.estado === 'apagado' || comparacion.estado === 'sin_catalogo' || comparacion.estado === 'no_residual') {
    return result;
  }

  if (comparacion.estado === 'sin_candidata') {
    result.legalBasis.griApplied.push({
      rule: 'Regla General 6 (RGI 6) — específica vs residual',
      reasoning: comparacion.aviso,
    });
    return result;
  }

  if (comparacion.estado === 'no_ejecutado') {
    result.legalBasis.griApplied.push({
      rule: 'Regla General 6 (RGI 6) — específica vs residual: NO EJECUTADA',
      reasoning: `${comparacion.candidata?.motivo ?? ''} ${comparacion.aviso}`.trim(),
    });
    return result;
  }

  // El pase corrió. PRIMERO se aplica la ganadora (con el candado de catálogo
  // de por medio) y solo DESPUÉS se escribe el veredicto: así el dictamen nunca
  // dice "ganó la específica" con la fracción anterior puesta.
  if (comparacion.estado === 'reclasificada' && comparacion.ganadora) {
    const ganadora = comparacion.ganadora;
    const check = await validateFraction(ganadora);
    if (!check.valid) {
      // Paranoia: pasoRGI6 ya validó. Si aun así no valida, se conserva la
      // elección original y se reporta como no ejecutado (nunca a medias).
      const motivo = `la fracción ganadora ${ganadora} no valida contra el catálogo (${check.reason})`;
      logger.warn(`Pase RGI 6 descartado: ${motivo}`, {
        action: 'rgi6_ganadora_invalida', entity: 'classification',
        metadata: { ganadora, reason: check.reason },
      });
      result.rgi6 = {
        ...comparacion,
        estado: 'no_ejecutado', ejecutado: false, ganadora: null,
        justificacion: null, descarte: null,
        aviso: `No se pudo aplicar la comparación RGI 6: ${motivo}. Se conserva la fracción ${comparacion.residual?.codeFormatted ?? result.fraction.code} elegida por el motor.`,
        error: motivo,
      };
      result.legalBasis.griApplied.push({
        rule: 'Regla General 6 (RGI 6) — específica vs residual: NO EJECUTADA',
        reasoning: result.rgi6.aviso,
      });
      return result;
    }
    result.fraction.code = `${ganadora.slice(0, 4)}.${ganadora.slice(4, 6)}.${ganadora.slice(6, 8)}`;
    if (check.description) result.fraction.description = check.description;
    result.fraction.chapter = ganadora.slice(0, 2);
    // Los paneles legales cuelgan de la fracción: se recalculan con la nueva.
    try {
      result.precedents = await lookupPrecedents({ fractionCode: ganadora, chapter: ganadora.slice(0, 2), limit: 5 });
      const lit = await hasActiveLitigation(ganadora);
      result.litigationAlert = lit.has ? { active: true, cases: lit.precedents } : null;
      result.precedentes = await precedentesPorFraccion(ganadora);
    } catch { /* los paneles se omiten; la clasificación no depende de ellos */ }
  }

  result.legalBasis.griApplied.push({
    rule: 'Regla General 6 (RGI 6) — específica vs residual',
    reasoning: `${comparacion.aviso} ${comparacion.justificacion ?? ''}`.trim(),
  });
  const perdedora = comparacion.estado === 'reclasificada' ? comparacion.residual : comparacion.candidata;
  if (perdedora && comparacion.descarte) {
    result.legalBasis.discardedFractions.push({ code: perdedora.codeFormatted, reason: comparacion.descarte });
  }
  for (const n of comparacion.notas) {
    const yaEsta = result.legalBasis.legalNotes.some(x => x.source === n.source);
    if (!yaEsta) {
      result.legalBasis.legalNotes.push({
        source: n.cotejo === 'pendiente' ? `${n.source} (cotejo pendiente)` : n.source,
        text: n.text,
      });
    }
  }

  return result;
}

/** Texto donde se busca la cita de una nota de exclusión (todo el razonamiento emitido). */
function razonamientoCompleto(result: ClassificationResult): string {
  return [
    ...(result.legalBasis?.griApplied ?? []).map(g => `${g.rule} ${g.reasoning}`),
    ...(result.legalBasis?.legalNotes ?? []).map(n => `${n.source} ${n.text}`),
    // Observado en vivo: el modelo cita la nota DENTRO del descarte de la
    // fracción de cap 87 ("Descartado porque la Nota 2 de la Sección XVII…").
    ...(result.legalBasis?.discardedFractions ?? []).map(d => `${d.code} ${d.reason}`),
    ...(result.griApplied ?? []),
    result.explanation?.technical ?? '',
    result.useBasedAnalysis?.criterion ?? '',
    result.useBasedAnalysis?.recommendation ?? '',
  ].join(' \n');
}

/**
 * Coherencia del dictamen: si el razonamiento cita una nota de exclusión (p. ej.
 * la Nota 2 de la Sección XVII, que mantiene en su capítulo las partes cubiertas
 * por una partida específica de los capítulos 84 a 90), no puede a la vez
 * ofrecer alternativas del capítulo excluido. Sin la nota en el corpus NO se
 * filtra: queda dicho en `legalBasis`.
 */
export async function depurarAlternativasContradictorias(result: ClassificationResult): Promise<ClassificationResult> {
  try {
    const filtrado = await filtrarAlternativasContradictorias({
      alternativas: result.alternatives ?? [],
      codigoFinal: result.fraction.code,
      razonamiento: razonamientoCompleto(result),
    });
    result.legalBasis = {
      griApplied: result.legalBasis?.griApplied ?? [],
      legalNotes: result.legalBasis?.legalNotes ?? [],
      discardedFractions: result.legalBasis?.discardedFractions ?? [],
    };
    if (filtrado.descartadas.length > 0) {
      result.alternatives = filtrado.alternativas;
      result.legalBasis.discardedFractions.push(...filtrado.descartadas);
    }
    // La dualidad material-vs-uso puede apuntar al capítulo excluido aunque no
    // haya ninguna ALTERNATIVA ahí: sostenerla es la misma contradicción en
    // otro campo de la pantalla ("alternativa por uso: 8708.99.XX").
    const capUso = (result.useBasedAnalysis?.byUse?.code ?? '').replace(/\D/g, '').slice(0, 2);
    if (result.useBasedAnalysis && capUso && filtrado.capitulosExcluidos.includes(capUso)) {
      result.legalBasis.discardedFractions.push({
        code: result.useBasedAnalysis.byUse.code,
        reason: `Análisis por uso retirado: apunta al capítulo ${capUso}, excluido por la ${filtrado.notasAplicadas.map(n => n.replace(/ LIGIE$/, '')).join(' y ')} que el propio razonamiento invoca (cotejo pendiente).`,
      });
      result.useBasedAnalysis = null;
    }
    for (const aviso of filtrado.avisos) {
      result.legalBasis.discardedFractions.push({ code: '—', reason: aviso });
    }
  } catch (e) {
    logger.warn(`No se pudo depurar alternativas contradictorias: ${e instanceof Error ? e.message : String(e)}`, {
      action: 'rgi6_alternativas_no_depuradas', entity: 'classification',
    });
  }
  return result;
}
