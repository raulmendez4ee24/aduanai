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
import { smartRetrieval, type RetrievedDoc } from './rag-search';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const RAG_SYSTEM_PROMPT = `Eres el Copilot legal de ADUANAI, asistente especializado en comercio exterior mexicano.

REGLAS CRÍTICAS — SIEMPRE:
1. SOLO puedes responder basándote en los documentos legales proporcionados en el contexto.
2. NUNCA inventes artículos, reglas, fechas, ni cifras. Si la respuesta no está en los documentos, di literalmente: "No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado."
3. SIEMPRE cita la referencia exacta al pie de cada afirmación: "(Art. 84-A LA)", "(Regla 7.1.5 RGCE 2026)", etc.
4. PROHIBIDO poner texto entre comillas («...») como cita LITERAL de un artículo, fracción, regla o resolución, A MENOS QUE ese texto provenga EXACTO, palabra por palabra, de un documento del contexto verificado. Si parafraseas o resumes, NO uses comillas de cita — describe con tus palabras sin comillas.
5. Si la pregunta toca varios temas, separa por sección con encabezado.
6. NO incluyas sección "Fuentes consultadas" / "Referencias" / "Bibliografía" en tu respuesta. Las citas se mostrarán automáticamente abajo como tarjetas — duplicarlas en el texto es ruido.

REGLA DURA — NUNCA FABRIQUES (anti-alucinación). Esto es lo más importante:
- Si vas a REFERENCIAR un artículo/fracción/regla pero NO tienes su texto exacto en el contexto, escribe: "según el Art. X (consulta el texto oficial en el DOF)". NUNCA redactes ni parafrasees su contenido entre comillas como si fuera la letra de la ley.
- Si NO tienes verificado un dato puntual (número de artículo, número de fracción, monto o rango de multa, número de resolución, fecha), di TEXTUALMENTE: "No tengo este dato verificado; consúltalo en el DOF." NUNCA lo inventes, adivines ni aproximes.
- Una cita entre comillas SIEMPRE debe poder rastrearse palabra por palabra a un documento del contexto. Si no puedes rastrearla, no uses comillas. Es preferible decir "no lo tengo verificado" que arriesgar una cita inventada.

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

D) CRÍTICO — IMMEX e IVA en importación temporal (Reforma 2014, Art. 24-fracción I y 28-A LIVA):
   - La importación temporal IMMEX SÍ CAUSA IVA en el despacho aduanero conforme al Art. 24 fracción I LIVA. El concepto "no causación" o "exención automática" por ser temporal está DEROGADO desde 2014.
   - IMMEX SIN certificación IVA-IEPS (modalidad A/AA/AAA): el importador DEBE pagar el IVA causado al momento del despacho, o entregar garantía equivalente (cuenta aduanera ex Art. 86-A fr. I LA, fianza, carta de crédito). Posteriormente puede acreditar el IVA pagado conforme reglas generales del Art. 5 LIVA.
   - IMMEX CON certificación IVA-IEPS (Art. 28-A LIVA y Regla 7.1.5 RGCE 2026): aplica un crédito fiscal del 100% del IVA causado en la importación temporal. El efecto neto es no desembolso de efectivo, pero NO es "diferimiento" ni "no causación" — es un crédito fiscal acreditable que se descarga al retorno.
   - Diferimiento ≠ no causación ≠ exención. Distinguir SIEMPRE con precisión técnica.
   - PROHIBIDO decir "IMMEX no paga IVA" o "IMMEX difiere IVA" sin verificar el estado de certificación. Si el usuario no especifica certificación, EXIGE distinguir ambos escenarios en la respuesta.
   - La modalidad AAA permite vigencia 3 años y reduce requisitos de garantía pero NO elimina la causación; opera vía crédito.

E) Ortografía técnica:
   - "aduanera" (NO "aduaneal")
   - "pedimento" (NO "pedimiento")
   - "arancel" (NO "arancela")
   - "fracción arancelaria" (no "fraccional")

F) Cuando no estés seguro:
   Di explícitamente "verifica con tu agente aduanal especialista" o "consulta resolución UPCI específica" en lugar de improvisar.

ESTILO:
- Lenguaje claro pero técnico cuando sea necesario.
- Conciso pero completo. Sin redundancia.
- Sin saludo formal, ve directo a la respuesta.

DISCLAIMER OBLIGATORIO al final:
"⚖️ Esta información referencia disposiciones legales pero NO sustituye consulta profesional ni reemplaza el texto oficial. Verifica siempre la redacción exacta en fuente oficial (DOF, SAT). Cualquier acción debe validarse con tu agente aduanal o abogado."`;

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

/** Inyecta aviso de certificación cuando la respuesta menciona IMMEX + IVA
 * sin haber distinguido el escenario certificado/no-certificado. La omisión
 * es legalmente riesgosa: una IMMEX sin cert sí paga IVA al despacho (Art. 24
 * fr. I LIVA), una con cert opera por crédito fiscal (Art. 28-A LIVA). */
function injectIMMEXCertificationNote(text: string): string {
  const lower = text.toLowerCase();
  const mentionsIMMEX = /\bimmex\b|importaci[oó]n\s+temporal/i.test(text);
  const mentionsIVA = /\biva\b/i.test(text);
  if (!mentionsIMMEX || !mentionsIVA) return text;

  const mentionsCert = /certificaci[oó]n|certificad[ao]\s+(iva|iep)|modalidad\s*(a{1,3})\b|art[íi]?culo?\s*28-?a/i.test(lower);
  if (mentionsCert) return text;

  const note = '\n\n> ⚠️ **Nota crítica IMMEX/IVA:** La respuesta varía según el estado de certificación IVA-IEPS del IMMEX. **Sin** certificación se causa y se paga (o garantiza) IVA en el despacho conforme Art. 24 fr. I LIVA. **Con** certificación modalidad A/AA/AAA se aplica crédito fiscal del 100% conforme Art. 28-A LIVA y Regla 7.1.5 RGCE 2026 (no es exención ni diferimiento, es crédito). Verifica el estado actual de tu certificación con tu agente aduanal antes de operar.';

  // Inserta antes del disclaimer si está presente, si no al final
  const disclaimerMatch = text.match(/(⚖️[\s\S]*$)/);
  if (disclaimerMatch) {
    return text.replace(disclaimerMatch[0], `${note}\n\n${disclaimerMatch[0]}`);
  }
  return text + note;
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
 * Confidence — calibrado por banding sobre #citas verificadas y match de tema.
 *
 * Bandas (por especificación 2026-05-13):
 *  - 5+ citations verificadas + topic match  → 80–95
 *  - 3–4 citations + topic match              → 65–80
 *  - 1–2 citations o topic match parcial      → 40–60
 *  - 0 citations / respuesta por LLM puro     → 20–40
 *  - "no tengo info verificada"               → 0–15
 *
 * "Topic match" = al menos uno de los docs traídos comparte ≥1 keyword/topic
 * con la pregunta (heurística simple sobre intersección de tokens). Las
 * hallucinations penalizan moviendo dentro de la banda hacia el límite bajo.
 *
 * Mapeo UI: 80–100=verde, 60–79=amarillo, 40–59=naranja, <40=rojo
 */
function calculateConfidence(
  docs: RetrievedDoc[],
  hallucinatedCount: number,
  citationsCount: number,
  answer: string,
  question: string,
): number {
  // Respuesta "no info verificada" / abandono explícito → banda más baja
  const noInfoAnswer = /no tengo informaci[oó]n verificada|no tengo info verificada|consultar (?:el portal del )?sat|agente aduanal certificado/i.test(answer);
  if (noInfoAnswer && citationsCount === 0) {
    return Math.round(8 + Math.random() * 7); // 8–15
  }

  // Sin docs en absoluto → respuesta basada en knowledge interno
  if (docs.length === 0) {
    return Math.round(20 + Math.random() * 20); // 20–40
  }

  // ── Topic match: ¿la pregunta comparte tokens con los docs traídos? ──
  const stop = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'que', 'qué', 'en', 'con', 'sin', 'para', 'por', 'es', 'son', 'al', 'del', 'se', 'ha', 'su', 'sus', 'lo', 'le', 'como']);
  const qTokens = new Set(
    question.toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3 && !stop.has(t)),
  );
  let topicHits = 0;
  for (const d of docs) {
    const docTokens = [...d.topics, d.reference, d.title, d.excerpt]
      .join(' ').toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '');
    for (const t of qTokens) {
      if (docTokens.includes(t)) { topicHits++; break; }
    }
  }
  const hasTopicMatch = topicHits >= Math.max(1, Math.ceil(docs.length * 0.4));
  const partialTopicMatch = topicHits >= 1;

  // ── Determinación de banda ──
  let lo = 20, hi = 40;
  if (citationsCount >= 5 && hasTopicMatch) {
    lo = 80; hi = 95;
  } else if (citationsCount >= 3 && hasTopicMatch) {
    lo = 65; hi = 80;
  } else if (citationsCount >= 1 || partialTopicMatch) {
    lo = 40; hi = 60;
  } else {
    lo = 20; hi = 40;
  }

  // ── Posición dentro de la banda según señales secundarias ──
  // Relevancia promedio del retrieval modula dentro del rango.
  const avgScore = docs.reduce((s, d) => s + d.finalScore, 0) / docs.length;
  let positionPct = Math.max(0, Math.min(1, avgScore)); // 0..1

  // Hallucinations: hasta -30% de la banda
  const totalCited = citationsCount + hallucinatedCount;
  if (totalCited > 0) {
    const hallucinationFraction = hallucinatedCount / totalCited;
    positionPct = Math.max(0, positionPct - hallucinationFraction * 0.3);
  }

  // Auto-incertidumbre del modelo → empuja hacia el límite bajo
  const uncertaintyHits = /no estoy seguro|consultar experto|consulta a tu|verifica con tu agente/i.test(answer);
  if (uncertaintyHits) positionPct = Math.max(0, positionPct - 0.15);

  const score = lo + positionPct * (hi - lo);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface AskCopilotInput {
  question: string;
  tenantId: string;
  userId: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export async function askCopilotWithRAG(input: AskCopilotInput): Promise<CopilotRAGResult> {
  const t0 = Date.now();

  // 1. Smart retrieval: topic filter + híbrido + Haiku reranker. Gate
  // shouldRespond cuando hay <2 docs relevantes para que el modelo no
  // alucine respuestas sin soporte legal.
  const retrieval = await smartRetrieval(input.question, {
    topK: 5,
    rerank: true,
    tenantId: input.tenantId,
    userId: input.userId,
  });
  const docs = retrieval.docs as RetrievedDoc[];
  logger.info(`Copilot retrieval: ${docs.length} docs (avg ${retrieval.averageRelevance}/100, topics: ${retrieval.detectedTopics.join(',') || 'none'}, shouldRespond=${retrieval.shouldRespond})`, {
    action: 'copilot_retrieval',
    tenantId: input.tenantId,
    userId: input.userId,
    metadata: {
      retrievedCount: docs.length,
      averageRelevance: retrieval.averageRelevance,
      detectedTopics: retrieval.detectedTopics,
      shouldRespond: retrieval.shouldRespond,
      reason: retrieval.reason,
    },
  });

  // 2. Prompt con contexto. Cuando el gate dice shouldRespond=false,
  // inyectamos una instrucción dura para que el modelo responda con la
  // frase canónica "no tengo información verificada" en lugar de
  // intentar contestar con baja evidencia.
  const contextBlock = buildContextBlock(docs);
  const noInfoDirective = retrieval.shouldRespond
    ? ''
    : '\n[INSTRUCCIÓN OBLIGATORIA] No hay documentos suficientemente relevantes para responder esta pregunta con confianza. Responde EXACTAMENTE: "No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado." NO intentes contestar de memoria. NO inventes citas.\n';
  const userMsg = `${input.question}\n${contextBlock}${noInfoDirective}`;

  // 3. Generar respuesta
  const generation = await llmGenerateWithMeta({
    model: 'fast',
    maxTokens: 1500,
    system: RAG_SYSTEM_PROMPT,
    user: userMsg,
    log: { operation: 'copilot', tenantId: input.tenantId, userId: input.userId },
  });
  const answer = injectIMMEXCertificationNote(stripDuplicateSourcesSection(generation.text));

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

  const confidence = calculateConfidence(docs, hallucinated.length, citations.length, answer, input.question);
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
  const retrieval = await smartRetrieval(message, { topK: 5, rerank: true });
  const docs = retrieval.docs as RetrievedDoc[];
  const contextBlock = buildContextBlock(docs);
  const noInfoDirective = retrieval.shouldRespond
    ? ''
    : '\n[INSTRUCCIÓN OBLIGATORIA] No hay documentos suficientemente relevantes. Responde EXACTAMENTE: "No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado." NO inventes citas.\n';
  const response = await getAnthropicClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: RAG_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `${message}\n${contextBlock}${noInfoDirective}` }],
  });
  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  return injectIMMEXCertificationNote(stripDuplicateSourcesSection(raw));
}
