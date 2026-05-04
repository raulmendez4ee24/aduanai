import { llmGenerate } from '../lib/llm';
import { prisma } from '../lib/prisma';

interface ClassificationResult {
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
  disclaimer: string;
}

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
Cada combinación material+tejido+tipo+género tiene su propia fracción. NO uses .99 si existe una específica.

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
b) Smartphones → 8517.14.01 (si combinan telefonía celular)
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
2. Identifica la fracción arancelaria COMPLETA a 8 dígitos y el NICO a 2 dígitos
3. Proporciona un score de confianza (0-100)
4. Lista las GRI que aplicaste y por qué
5. Incluye aranceles NMF y preferenciales (TMEC, TLCUE, etc.)
6. Identifica RRNA, NOMs aplicables y si requiere padrón sectorial
7. Proporciona 2-3 fracciones alternativas con justificación
8. Da una explicación en lenguaje simple Y técnico

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

OBLIGATORIO: Revisa TODAS las fracciones del subheading (6 dígitos) que te proporcioné antes de elegir. NO uses fracciones terminadas en .99 o .00 (cajón de sastre) si existe una fracción más específica que describa mejor el producto. La fracción .01 suele ser la más específica y común.

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

REGLA: si la descripción del producto no especifica estos detalles, NO asumas .99 genérica. Busca la fracción MÁS ESPECÍFICA que sea consistente con la descripción. Si realmente no hay información suficiente, elige la más común (.01) antes que .99.

PROCESO DE CLASIFICACIÓN:
1. Identifica la Sección y Capítulo correctos
2. Determina la Partida (4 dígitos) aplicando GRI 1
3. Determina la Subpartida (6 dígitos) aplicando GRI 6
4. Elige la Fracción mexicana (8 dígitos) revisando TODAS las opciones disponibles del subheading
5. Verifica que la fracción elegida sea la MÁS ESPECÍFICA posible

${SECTOR_RULES}

IMPORTANTE: Si no tienes certeza alta, indícalo claramente. La clasificación arancelaria tiene implicaciones legales.

Responde SIEMPRE en formato JSON válido con esta estructura:
{
  "fraction": { "code": "XXXX.XX.XX", "description": "...", "chapter": "XX", "section": "..." },
  "nico": "XX",
  "confidence": 85,
  "griApplied": ["GRI 1: ...", "GRI 6: ..."],
  "tariffs": { "nmf": 15, "preferential": { "TMEC": 0, "TLCUE": 5 } },
  "regulations": { "rrna": ["Permiso SEMARNAT"], "noms": ["NOM-051-SCFI"], "sectoralRegistry": false },
  "alternatives": [{ "code": "YYYY.YY.YY", "description": "...", "confidence": 60, "reason": "..." }],
  "explanation": { "simple": "...", "technical": "..." },
  "legalBasis": {
    "griApplied": [
      { "rule": "GRI 1", "reasoning": "El producto se describe textualmente en la partida 61.09 como..." },
      { "rule": "GRI 6", "reasoning": "A nivel de subpartida se aplicó..." }
    ],
    "legalNotes": [
      { "source": "Nota 1 del capítulo 61", "text": "Este capítulo comprende solamente artículos de punto confeccionados..." }
    ],
    "discardedFractions": [
      { "code": "62.05", "reason": "Se descartó porque el producto es de tejido de punto (cap 61), no de tejido plano (cap 62)" }
    ]
  },
  "disclaimer": "Esta clasificación es orientativa. La clasificación oficial debe ser validada por un agente aduanal certificado."
}`;

// ============================================
// KNOWLEDGE BASE SEARCH
// ============================================

async function findRelevantKnowledge(description: string, probableChapters: string[] = []) {
  const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0 && probableChapters.length === 0) return [];

  const all = await prisma.classificationKnowledge.findMany({
    where: {
      OR: [
        ...(probableChapters.length > 0 ? [{ chapterCode: { in: probableChapters } }] : []),
        { verified: true },
      ],
    },
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
  return `\n\nCONOCIMIENTO ESPECÍFICO DISPONIBLE PARA ESTA CLASIFICACIÓN:\n\n${lines.join('\n\n')}\n\nUSA ESTE CONOCIMIENTO como referencia prioritaria para tu clasificación. Si el producto coincide con un caso documentado, sigue ese precedente. Si hay un ERROR_COMUN relevante, evítalo explícitamente.\n`;
}

// ============================================
// IMPROVED DB SEARCH — Mejora #2
// ============================================

async function findRelatedFractions(description: string) {
  const searchWords = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Phase 1: Quick keyword search to identify probable headings
  const keywordMatches = await prisma.fraction.findMany({
    where: {
      OR: [
        { keywords: { hasSome: searchWords.slice(0, 8) } },
        ...searchWords.slice(0, 3).map(w => ({
          description: { contains: w, mode: 'insensitive' as const },
        })),
      ],
      active: true,
    },
    select: { code: true, codeFormatted: true, description: true, tariffNMF: true, noms: true, requiresPermit: true, permitType: true, sectoralRegistry: true },
    take: 30,
  });

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
    model: 'fast',
    maxTokens: 300,
    system: `Eres un verificador de clasificación arancelaria mexicana. Se te da un producto, una fracción sugerida, y TODAS las fracciones del mismo subheading. Tu trabajo es verificar si la fracción sugerida es la MÁS ESPECÍFICA y correcta, o si hay otra mejor.

Responde ÚNICAMENTE con JSON: {"code": "XXXX.XX.XX", "changed": true/false, "reason": "..."}
- Si la sugerida es correcta, devuélvela con changed=false
- Si hay una más específica, devuélvela con changed=true
- NUNCA elijas .99 o .00 si existe una más específica
- El código DEBE ser una de las opciones listadas`,
    user: `PRODUCTO: ${description}
FRACCIÓN SUGERIDA: ${suggestedCode}

TODAS LAS FRACCIONES DISPONIBLES EN ESTE SUBHEADING Y ALTERNATIVAS:
${allOptions}

¿Es ${suggestedCode} la correcta o hay una más específica?`,
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

// ============================================
// MAIN CLASSIFICATION FUNCTION
// ============================================

export async function classifyProduct(
  description: string,
  context?: string
): Promise<ClassificationResult> {
  // Mejora #2: Better DB search with full chapter context
  const { relatedFractions, chapterFractions, topChapters } = await findRelatedFractions(description);

  // Knowledge base lookup (casos reales, errores comunes, reglas de sector)
  const knowledge = await findRelevantKnowledge(description, topChapters || []);
  const knowledgeContext = formatKnowledgeForPrompt(knowledge);

  // Build context with related fractions (scored by relevance)
  const searchWords = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const scored = new Map<string, { frac: typeof relatedFractions[0]; score: number }>();
  for (const frac of relatedFractions) {
    const key = frac.codeFormatted;
    const existing = scored.get(key);
    if (existing) {
      existing.score++;
    } else {
      scored.set(key, { frac, score: 1 });
    }
  }

  const topRelated = [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.frac);

  // Format related fractions
  const relatedContext = topRelated.length > 0
    ? `\n\nFRACCIONES TIGIE MÁS RELEVANTES POR BÚSQUEDA:\n${topRelated.map(f => {
        const extras = [];
        if (f.tariffNMF !== null) extras.push(`IGI: ${f.tariffNMF}%`);
        if (f.noms.length > 0) extras.push(`NOMs: ${f.noms.join(', ')}`);
        if (f.requiresPermit) extras.push(`Permiso: ${f.permitType}`);
        if (f.sectoralRegistry) extras.push('Padrón sectorial');
        return `- ${f.codeFormatted}: ${f.description}${extras.length ? ` [${extras.join(' | ')}]` : ''}`;
      }).join('\n')}`
    : '';

  // Format heading/nearby fractions context — Mejora #2 (limited to avoid token overflow)
  const chapterContext = chapterFractions.length > 0
    ? `\n\nFRACCIONES DEL MISMO HEADING Y CAPÍTULO ${topChapters?.join('/')} — REVISA CADA UNA PARA ELEGIR LA MÁS ESPECÍFICA:\n${chapterFractions.slice(0, 150).map(f => `- ${f.codeFormatted}: ${f.description}`).join('\n')}`
    : '';

  const userMessage = `Clasifica el siguiente producto para importación a México:

PRODUCTO: ${description}
${context ? `CONTEXTO ADICIONAL: ${context}` : ''}
${knowledgeContext}
${relatedContext}
${chapterContext}

INSTRUCCIONES:
1. Revisa TODAS las fracciones del capítulo proporcionadas arriba
2. Identifica la subpartida (6 dígitos) correcta
3. Dentro de esa subpartida, elige la fracción (8 dígitos) MÁS ESPECÍFICA
4. NO uses fracciones .99 o .00 si hay una más específica disponible
5. Si alguna fracción de la lista coincide EXACTAMENTE con el producto, úsala
6. Las alternativas deben ser del MISMO capítulo pero diferentes subpartidas

Responde en JSON válido.`;

  const text = await llmGenerate({
    model: 'strong',
    maxTokens: 2000,
    system: SYSTEM_PROMPT,
    user: userMessage,
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No se pudo parsear la respuesta del clasificador');
  }

  let result = JSON.parse(jsonMatch[0]) as ClassificationResult;

  // Mejora #4: Second verification with Haiku
  const suggestedCode = result.fraction.code;
  const verification = await verifyClassification(
    description,
    suggestedCode,
    result.alternatives || [],
    chapterFractions,
  );

  if (verification.changed) {
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

    try {
      const retryText = await llmGenerate({
        model: 'strong',
        maxTokens: 2000,
        system: SYSTEM_PROMPT,
        user: retryMessage,
      });

      const retryMatch = retryText.match(/\{[\s\S]*\}/);
      if (retryMatch) {
        const retryResult = JSON.parse(retryMatch[0]) as ClassificationResult;
        if (retryResult.confidence > result.confidence) {
          result = retryResult;
        }
      }
    } catch {
      // Keep original result
    }
  }

  return result;
}
