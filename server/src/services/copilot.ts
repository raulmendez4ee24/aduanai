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
6. Al final, lista las fuentes consultadas con su URL oficial.

ESTILO:
- Lenguaje claro pero técnico cuando sea necesario.
- Conciso pero completo. Sin redundancia.
- Sin saludo formal, ve directo a la respuesta.
- Si la pregunta requiere asesoría legal específica, recomiéndalo al final.

DISCLAIMER OBLIGATORIO al final:
"⚖️ Esta información cita textos legales reales pero NO sustituye consulta profesional. Verifica siempre en fuente oficial (DOF, SAT). Cualquier acción debe validarse con tu agente aduanal o abogado."`;

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

function calculateConfidence(docs: RetrievedDoc[], hallucinatedCount: number): number {
  if (docs.length === 0) return 10;
  const avgScore = docs.reduce((s, d) => s + d.finalScore, 0) / docs.length;
  let conf = Math.round(avgScore * 100);
  conf -= hallucinatedCount * 15;
  return Math.max(0, Math.min(100, conf));
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
  const answer = generation.text;

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

  const confidence = calculateConfidence(docs, hallucinated.length);
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
