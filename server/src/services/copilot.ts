/**
 * Copilot ADUANAI con RAG sobre LegalDocuments.
 *
 * Pipeline:
 *   1. Buscar top-K documentos legales relevantes (rag-search)
 *   2. Construir prompt con CONTEXT del corpus + prohibición explícita de inventar
 *   3. Generar respuesta con LLM
 *   4. Detectar citas hallucinadas (referencias en la respuesta que no estén en docs)
 *   5. Persistir CopilotConsult con hash, citas, confianza
 */

import crypto from 'crypto';
import { getAnthropicClient } from '../lib/anthropic';
import { llmGenerateWithMeta } from '../lib/llm';
import { searchLegalDocuments, type RetrievedDoc } from './rag-search';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const RAG_SYSTEM_PROMPT = `Eres el Copilot legal de ADUANAI, asistente especializado en comercio exterior mexicano.

REGLAS CRÍTICAS — SIEMPRE:
1. SOLO puedes responder basándote en los documentos legales proporcionados en el contexto.
2. NUNCA inventes artículos, reglas, fechas, ni cifras. Si la respuesta no está en los documentos, di literalmente: "No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado."
3. SIEMPRE cita la referencia exacta al pie de cada afirmación: "(Art. 84-A LA)", "(Regla 7.1.5 RGCE 2026)", etc.
4. Cuando sea relevante, incluye comilla textual entre comillas tipográficas: "..."
5. Si la pregunta toca varios temas, separa por sección con encabezado.
6. NO incluyas sección "Fuentes consultadas" / "Referencias" / "Bibliografía" en tu respuesta. Las citas se mostrarán automáticamente abajo como tarjetas — duplicarlas en el texto es ruido.

REGLAS DE EXACTITUD TÉCNICA:

A) Tratado correcto por país de origen:
   - USA, Canada, México → TMEC
   - Unión Europea (Alemania, Francia, Italia, España, etc.) → TLCUEM
   - Japón, Vietnam, Singapur, Australia, NZ, Perú, Chile, Malasia, Brunei → CPTPP
   - China → SIN tratado preferencial (arancel NMF, riesgo antidumping)
   - NUNCA mezcles: jamás digas "TMEC" para un origen no-TMEC.

B) Cálculo de impuestos COMPLETO:
   Si calculas garantía, landed cost o monto a pagar, SIEMPRE incluye:
   - IGI según TIGIE (arancel general)
   - DTA (0.8% sobre valor en aduana, Art. 49 LFD)
   - IEPS si aplica (verifica si la fracción está en la lista IEPS — bebidas alcohólicas, tabaco, refrescos, combustibles, plaguicidas, juegos de azar)
   - ISAN si es vehículo nuevo (Art. 2 LISAN) — NO confundas con IEPS
   - IVA 16% al final sobre la base completa (Art. 27 LIVA)
   - Cuota compensatoria si hay resolución UPCI vigente
   NUNCA calcules sólo IVA. Si te falta un componente, dilo explícitamente.

C) IEPS vs ISAN — distinción crítica:
   - IEPS: alcoholes, tabacos, refrescos, combustibles, plaguicidas, juegos
   - ISAN: vehículos nuevos (Art. 1 LISAN) con tarifa progresiva por valor
   - Un vehículo NO paga IEPS. Paga ISAN.

D) Ortografía técnica:
   - "aduanera" (NO "aduaneal")
   - "pedimento" (NO "pedimiento")
   - "arancel" (NO "arancela")
   - "fracción arancelaria" (no "fraccional")

E) Cuando no estés seguro:
   Di explícitamente "verifica con tu agente aduanal especialista" o "consulta resolución UPCI específica" en lugar de improvisar.

ESTILO:
- Lenguaje claro pero técnico cuando sea necesario.
- Conciso pero completo. Sin redundancia.
- Sin saludo formal, ve directo a la respuesta.

DISCLAIMER OBLIGATORIO al final:
"⚖️ Esta información cita textos legales reales pero NO sustituye consulta profesional. Verifica siempre en fuente oficial (DOF, SAT). Cualquier acción debe validarse con tu agente aduanal o abogado."`;

/** Elimina secciones "Fuentes consultadas" / "Referencias" si el modelo
 * las generó pese al system prompt. Las citas se renderizan aparte como
 * tarjetas, duplicar es ruido. */
function stripDuplicateSourcesSection(text: string): string {
  // Quita encabezados de fuentes hasta el final o hasta el disclaimer
  const patterns = [
    /\n+#{1,6}\s*Fuentes\s+consultadas[\s\S]*?(?=\n*(?:⚖️|⚖|---|\n#{1,6}\s)|$)/gi,
    /\n+#{1,6}\s*Referencias[\s\S]*?(?=\n*(?:⚖️|⚖|---|\n#{1,6}\s)|$)/gi,
    /\n+#{1,6}\s*Bibliograf[ií]a[\s\S]*?(?=\n*(?:⚖️|⚖|---|\n#{1,6}\s)|$)/gi,
    /\n+\*\*Fuentes\s+consultadas\*\*[\s\S]*?(?=\n*(?:⚖️|⚖|---)|$)/gi,
  ];
  let out = text;
  for (const p of patterns) out = out.replace(p, '\n');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

interface Citation {
  reference: string;
  documentId: string;
  source: string;
  excerpt: string;
  officialUrl: string | null;
  score: number;
}

export interface CopilotRAGResult {
  answer: string;
  citations: Citation[];
  confidence: number;
  consultHash: string;
  hallucinatedReferences: string[];
  retrievedDocsCount: number;
}

function buildContextBlock(docs: RetrievedDoc[]): string {
  if (docs.length === 0) {
    return '\n[CONTEXTO LEGAL DISPONIBLE]\nNo se encontraron documentos legales relevantes en la base. Si no puedes responder con certeza, di literalmente "No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado."\n';
  }
  const blocks = docs.map((d, i) => {
    const url = d.officialUrl ? `\nFuente oficial: ${d.officialUrl}` : '';
    const date = d.effectiveDate ? `\nVigente desde: ${d.effectiveDate.slice(0, 10)}` : '';
    return `[${i + 1}] ${d.reference} — ${d.title}\nTipo: ${d.type} · Fuente: ${d.source}${date}${url}\n\n${d.content}`;
  }).join('\n\n---\n\n');
  return `\n[CONTEXTO LEGAL DISPONIBLE — ${docs.length} documento(s)]\n\n${blocks}\n\n[FIN DEL CONTEXTO]\n`;
}

/**
 * Detecta referencias citadas en la respuesta y las cruza contra el corpus.
 * Devuelve las que NO se pudieron verificar (probable hallucination).
 */
function detectHallucinations(answer: string, docs: RetrievedDoc[]): { citedRefs: string[]; hallucinated: string[] } {
  // Heurística: extraer "Art. X LA", "Regla X.X.X", "Anexo X", "Capítulo X TMEC", etc.
  const patterns = [
    /Art(?:ículo|\.)?\s*(\d+(?:-[A-Z])?(?:\s+L[A-Z]{1,4})?)/gi,
    /Regla\s+(\d+\.\d+(?:\.\d+)?\s+RGCE)/gi,
    /Anexo\s+(\d+(?:\.\d+)*(?:\s+RGCE)?)/gi,
    /TMEC\s+(Cap(?:ítulo|\.)?\s*\d+|Anexo\s+\d+(?:-[A-Z])?)/gi,
  ];
  const citedRefs = new Set<string>();
  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(answer)) !== null) {
      citedRefs.add(m[0].trim());
    }
  }
  // Contra-revisar contra docs
  const corpusText = docs.map(d => `${d.reference} ${d.title}`.toLowerCase()).join(' ');
  const hallucinated: string[] = [];
  for (const ref of citedRefs) {
    const lower = ref.toLowerCase();
    // Match flexible: el corpus debe contener la referencia o sus tokens clave
    const tokens = lower.match(/\d+|[a-záéíóú]{3,}/gi) ?? [];
    const hits = tokens.filter(t => corpusText.includes(t)).length;
    if (tokens.length > 0 && hits / tokens.length < 0.5) {
      hallucinated.push(ref);
    }
  }
  return { citedRefs: [...citedRefs], hallucinated };
}

/**
 * Confidence recalibrado:
 *  - 40% verificación de citas (¿las refs que el LLM citó están en el corpus?)
 *  - 30% relevancia del retrieval (avg finalScore)
 *  - 20% cobertura de citas (¿se citó al menos un % de los docs traídos?)
 *  - 10% lenguaje (penaliza "no estoy seguro", "consultar experto")
 *
 * Mapeo a colores UI (decidido en cliente):
 *   80-100 = verde, 60-79 = amarillo, 40-59 = naranja, <40 = rojo
 */
function calculateConfidence(docs: RetrievedDoc[], hallucinatedCount: number, citationsCount: number, answer: string): number {
  if (docs.length === 0) return 10;

  // 1) Verificación de citas: % de citas no-hallucinatadas
  const totalCited = citationsCount + hallucinatedCount;
  const verifyScore = totalCited === 0 ? 50 : Math.round((citationsCount / totalCited) * 100);

  // 2) Relevancia del retrieval
  const avgScore = docs.reduce((s, d) => s + d.finalScore, 0) / docs.length;
  const relevanceScore = Math.round(avgScore * 100);

  // 3) Cobertura: cuántos docs se usaron de los traídos
  const coverageScore = Math.min(100, Math.round((citationsCount / Math.max(1, docs.length)) * 100));

  // 4) Lenguaje: incertidumbre auto-declarada
  const uncertaintyHits = /no estoy seguro|consultar experto|consulta a tu|verifica con tu agente|no tengo información|no tengo informacion/i.test(answer);
  const languageScore = uncertaintyHits ? 30 : 90;

  const weighted = verifyScore * 0.40 + relevanceScore * 0.30 + coverageScore * 0.20 + languageScore * 0.10;
  return Math.max(0, Math.min(100, Math.round(weighted)));
}

export interface AskCopilotInput {
  question: string;
  tenantId: string;
  userId: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export async function askCopilotWithRAG(input: AskCopilotInput): Promise<CopilotRAGResult> {
  const t0 = Date.now();

  // 1. Recuperar docs relevantes
  const docs = await searchLegalDocuments(input.question, { topK: 5 });

  // 2. Prompt con contexto
  const contextBlock = buildContextBlock(docs);
  const userMsg = `${input.question}\n${contextBlock}`;

  // 3. Generar respuesta
  const generation = await llmGenerateWithMeta({
    model: 'fast',
    maxTokens: 1500,
    system: RAG_SYSTEM_PROMPT,
    user: userMsg,
    log: { operation: 'copilot', tenantId: input.tenantId, userId: input.userId },
  });
  const answer = stripDuplicateSourcesSection(generation.text);

  // 4. Detectar hallucinations
  const { citedRefs, hallucinated } = detectHallucinations(answer, docs);
  if (hallucinated.length > 0) {
    logger.warn(`Copilot citó referencias no verificadas: ${hallucinated.join(', ')}`, {
      action: 'copilot_hallucination',
      tenantId: input.tenantId,
      userId: input.userId,
      metadata: { question: input.question.slice(0, 200), hallucinated, citedRefs },
    });
  }

  // 5. Citas verificadas (subset de citedRefs que sí están en docs)
  const citations: Citation[] = [];
  for (const doc of docs) {
    const refLower = doc.reference.toLowerCase();
    if (citedRefs.some(r => r.toLowerCase().includes(refLower) || refLower.includes(r.toLowerCase().split(' ')[0]!))) {
      citations.push({
        reference: doc.reference,
        documentId: doc.id,
        source: doc.source,
        excerpt: doc.excerpt,
        officialUrl: doc.officialUrl,
        score: Math.round(doc.finalScore * 100) / 100,
      });
    }
  }
  // Si no se detectaron coincidencias, incluye los top 3 docs como referencias usadas
  if (citations.length === 0) {
    for (const d of docs.slice(0, 3)) {
      citations.push({
        reference: d.reference,
        documentId: d.id,
        source: d.source,
        excerpt: d.excerpt,
        officialUrl: d.officialUrl,
        score: Math.round(d.finalScore * 100) / 100,
      });
    }
  }

  const confidence = calculateConfidence(docs, hallucinated.length, citations.length, answer);
  const consultHash = crypto.createHash('sha256')
    .update([input.question, answer, docs.map(d => d.id).sort().join(','), generation.model].join('|'))
    .digest('hex');

  // 6. Persistir
  const tokensUsed = Math.ceil((input.question.length + answer.length) / 4);
  await prisma.copilotConsult.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      question: input.question,
      answer,
      citedDocuments: citations as never,
      modelUsed: generation.model,
      tokensUsed,
      latencyMs: Date.now() - t0,
      confidence,
      consultHash,
    },
  });

  return {
    answer,
    citations,
    confidence,
    consultHash,
    hallucinatedReferences: hallucinated,
    retrievedDocsCount: docs.length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Legacy wrapper (mantiene firma antigua para callers existentes)
// ─────────────────────────────────────────────────────────────────────

export async function chatWithCopilot(
  message: string,
  history: { role: string; content: string }[],
): Promise<string> {
  // Para no romper callers que solo esperan string, llamamos al RAG sin persistir
  // (no hay tenantId/userId aquí). Devolvemos la respuesta como string.
  void history; // history no se usa en RAG (cada turno es atómico)
  const docs = await searchLegalDocuments(message, { topK: 5 });
  const contextBlock = buildContextBlock(docs);
  const response = await getAnthropicClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: RAG_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `${message}\n${contextBlock}` }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
