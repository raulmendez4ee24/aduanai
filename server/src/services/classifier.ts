import { getAnthropicClient } from '../lib/anthropic';
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
  disclaimer: string;
}

const SYSTEM_PROMPT = `Eres un experto clasificador arancelario mexicano. Tu trabajo es clasificar productos en fracciones arancelarias de la TIGIE (Tarifa de la Ley de los Impuestos Generales de Importación y de Exportación) de México.

REGLAS:
1. Aplica las Reglas Generales Interpretativas (GRI 1-6) del Sistema Armonizado
2. Identifica la fracción arancelaria a 8 dígitos y el NICO a 2 dígitos
3. Proporciona un score de confianza (0-100)
4. Lista las GRI que aplicaste y por qué
5. Incluye aranceles NMF y preferenciales (TMEC, TLCUE, etc.)
6. Identifica RRNA (Regulaciones y Restricciones No Arancelarias), NOMs aplicables y si requiere padrón sectorial
7. Proporciona 2-3 fracciones alternativas con justificación
8. Da una explicación en lenguaje simple Y técnico

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
  "disclaimer": "Esta clasificación es orientativa. La clasificación oficial debe ser validada por un agente aduanal certificado."
}`;

export async function classifyProduct(
  description: string,
  context?: string
): Promise<ClassificationResult> {
  // Buscar fracciones relacionadas en la DB para dar contexto al clasificador
  const searchWords = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const queries = [];

  // Buscar por cada palabra significativa en la descripción
  for (const word of searchWords.slice(0, 5)) {
    queries.push(
      prisma.fraction.findMany({
        where: { description: { contains: word, mode: 'insensitive' } },
        select: { codeFormatted: true, description: true, tariffNMF: true, noms: true, requiresPermit: true, permitType: true, sectoralRegistry: true },
        take: 5,
      })
    );
  }

  // Buscar por keywords
  if (searchWords.length > 0) {
    queries.push(
      prisma.fraction.findMany({
        where: { keywords: { hasSome: searchWords } },
        select: { codeFormatted: true, description: true, tariffNMF: true, noms: true, requiresPermit: true, permitType: true, sectoralRegistry: true },
        take: 10,
      })
    );
  }

  const results = await Promise.all(queries);
  const allMatches = results.flat();

  // Deduplicar y rankear por relevancia (más palabras coincidentes = mejor)
  const scored = new Map<string, { frac: typeof allMatches[0]; score: number }>();
  for (const frac of allMatches) {
    const key = frac.codeFormatted;
    const existing = scored.get(key);
    if (existing) {
      existing.score++;
    } else {
      scored.set(key, { frac, score: 1 });
    }
  }

  const relatedFractions = [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(s => s.frac);

  const dbContext = relatedFractions.length > 0
    ? `\n\nFRACCIONES TIGIE RELACIONADAS (usa estas como referencia para tu clasificación):\n${relatedFractions.map(f => {
        const extras = [];
        if (f.tariffNMF !== null) extras.push(`IGI: ${f.tariffNMF}%`);
        if (f.noms.length > 0) extras.push(`NOMs: ${f.noms.join(', ')}`);
        if (f.requiresPermit) extras.push(`Permiso: ${f.permitType}`);
        if (f.sectoralRegistry) extras.push('Padrón sectorial');
        return `- ${f.codeFormatted}: ${f.description}${extras.length ? ` [${extras.join(' | ')}]` : ''}`;
      }).join('\n')}`
    : '';

  const userMessage = `Clasifica el siguiente producto para importación a México:

PRODUCTO: ${description}
${context ? `CONTEXTO ADICIONAL: ${context}` : ''}
${dbContext}

IMPORTANTE: Si alguna de las fracciones TIGIE relacionadas coincide exactamente con el producto, úsala. Si no, clasifica según las Reglas Generales Interpretativas del Sistema Armonizado.

Responde en JSON válido.`;

  const response = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extraer JSON de la respuesta
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No se pudo parsear la respuesta del clasificador');
  }

  return JSON.parse(jsonMatch[0]) as ClassificationResult;
}
