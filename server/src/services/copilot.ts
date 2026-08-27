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
import { cruzarCitas } from './citas-legales';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/** Frase canónica de abstención — la respuesta degradada ES esta frase. */
export const ABSTENCION_CANONICA =
  'No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado.';

/** Modo del fail-closed de citas (Fase 3a §4.1):
 *  'sombra' (default): detecta y registra, NO bloquea — para medir la tasa
 *  real de regeneración/degradación antes del corte (aprobación 18-ago).
 *  'estricta': cita no respaldada → 1 regeneración correctiva → si persiste,
 *  la respuesta se DEGRADA a la abstención canónica (el usuario nunca la ve).
 *  'off': solo el warning legacy (no recomendado). */
export type ModoCitaEstricta = 'off' | 'sombra' | 'estricta';
export function modoCitaEstricta(): ModoCitaEstricta {
  const v = (process.env.COPILOT_CITA_ESTRICTA ?? 'sombra').toLowerCase();
  return v === 'estricta' || v === 'off' ? v : 'sombra';
}

const RAG_SYSTEM_PROMPT = `Eres el Copilot legal de ADUANAI, asistente especializado en comercio exterior mexicano.

REGLAS CRÍTICAS — SIEMPRE:
1. SOLO puedes responder basándote en los documentos legales proporcionados en el contexto.
2. NUNCA inventes artículos, reglas, fechas, ni cifras. Si la respuesta no está en los documentos, di literalmente: "No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado."
3. SIEMPRE cita la referencia exacta al pie de cada afirmación, con el formato "(Art. NN-X LA)" o "(Regla N.N.N RGCE 2026)". Para las Reglas Generales de Interpretación de la LIGIE el formato es "Regla General N x) (RGI)" — ej. "Regla General 3 a) (RGI)": las RGI NO son artículos, NUNCA las cites como "Art. GRI..." ni "Art. RGI...". Usa el número REAL que provenga del contexto verificado — NUNCA inventes ni rellenes un número de artículo o regla que no esté en el contexto.
4. PROHIBIDO poner texto entre comillas («...») como cita LITERAL de un artículo, fracción, regla o resolución, A MENOS QUE ese texto provenga EXACTO, palabra por palabra, de un documento del contexto verificado. Si parafraseas o resumes, NO uses comillas de cita — describe con tus palabras sin comillas.
5. Si la pregunta toca varios temas, separa por sección con encabezado.
6. NO incluyas sección "Fuentes consultadas" / "Referencias" / "Bibliografía" en tu respuesta. Las citas se mostrarán automáticamente abajo como tarjetas — duplicarlas en el texto es ruido.
7. PROCEDENCIA DEL TEXTO: cada documento del contexto trae "Instrumento/versión". Si un documento está marcado como VERSIÓN ANTICIPADA (Portal del SAT, pendiente de DOF), ese documento SÍ está en tu contexto — úsalo, nunca digas que no lo tienes. Explica SIEMPRE ambos planos: lo que dice el último texto PUBLICADO EN DOF y lo que dice la versión anticipada, indicando que la anticipada surte efectos conforme a la regla 1.1.2 RGCE 2026 y que está pendiente de publicación en el DOF. Si el instrumento tiene varios plazos por párrafo, usa el párrafo que corresponde a la obligación preguntada (la etiqueta "Instrumento/versión" lo mapea).

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
   - IMMEX CON certificación IVA-IEPS (crédito fiscal del 100% conforme Art. 28-A LIVA y Art. 15-A LIEPS; el Esquema de Certificación de Empresas modalidad IVA e IEPS, rubros A/AA/AAA, se regula en el Título 7 del RGCE): aplica un crédito fiscal del 100% del IVA causado en la importación temporal. El efecto neto es no desembolso de efectivo, pero NO es "diferimiento" ni "no causación" — es un crédito fiscal acreditable que se descarga al retorno. NO cites un número de regla RGCE específico salvo que provenga del contexto verificado.
   - Diferimiento ≠ no causación ≠ exención. Distinguir SIEMPRE con precisión técnica.
   - PROHIBIDO decir "IMMEX no paga IVA" o "IMMEX difiere IVA" sin verificar el estado de certificación. Si el usuario no especifica certificación, EXIGE distinguir ambos escenarios en la respuesta.
   - VIGENCIA RGCE 2026: el Registro modalidad IVA e IEPS tiene vigencia de UN AÑO renovable para TODOS los rubros A/AA/AAA conforme a la regla 7.1.6. Dos años aplica únicamente a Comercializadora e Importadora, OEA y Socio Comercial Certificado. NO uses el esquema histórico 1/2/3 años por rubro.

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

  const note = '\n\n> ⚠️ **Nota crítica IMMEX/IVA:** La respuesta varía según el estado de certificación IVA-IEPS del IMMEX. **Sin** certificación se causa y se paga (o garantiza) IVA en el despacho conforme Art. 24 fr. I LIVA. **Con** certificación modalidad A/AA/AAA se aplica crédito fiscal del 100% conforme Art. 28-A LIVA y Art. 15-A LIEPS (no es exención ni diferimiento, es crédito). Verifica el estado actual de tu certificación con tu agente aduanal antes de operar.';

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

/** Documento recuperado que NO respalda ninguna cita — se muestra aparte
 *  ("documentos consultados"), jamás como fuente de una afirmación (§4.2). */
export interface DocumentoConsultado {
  reference: string;
  source: string;
  officialUrl: string | null;
}

export interface CopilotRAGResult {
  answer: string;
  /** SOLO documentos cuya clave cruza con una cita del texto. Puede ser []. */
  citations: Citation[];
  documentosConsultados: DocumentoConsultado[];
  confidence: number;
  consultHash: string;
  hallucinatedReferences: string[];
  retrievedDocsCount: number;
  citaEstricta: {
    modo: ModoCitaEstricta;
    regenerada: boolean;
    degradada: boolean;
    noRespaldadas: string[];
  };
}

function buildContextBlock(docs: RetrievedDoc[]): string {
  if (docs.length === 0) {
    return '\n[CONTEXTO LEGAL DISPONIBLE]\nNo se encontraron documentos legales relevantes en la base. Si no puedes responder con certeza, di literalmente "No tengo información verificada al respecto en mi base de documentos legales. Te sugiero consultar el portal del SAT o a un agente aduanal certificado."\n';
  }
  const blocks = docs.map((d, i) => {
    const url = d.officialUrl ? `\nFuente oficial: ${d.officialUrl}` : '';
    const date = d.effectiveDate ? `\nVigente desde: ${d.effectiveDate.slice(0, 10)}` : '';
    // Instrumento/versión: distingue texto DOF de versión anticipada del
    // Portal SAT (efectos conforme regla 1.1.2 RGCE) — DEFERRED #21.
    const version = d.version ? `\nInstrumento/versión: ${d.version}` : '';
    return `[${i + 1}] ${d.reference} — ${d.title}\nTipo: ${d.type} · Fuente: ${d.source}${date}${version}${url}\n\n${d.content}`;
  }).join('\n\n---\n\n');
  return `\n[CONTEXTO LEGAL DISPONIBLE — ${docs.length} documento(s)]\n\n${blocks}\n\n[FIN DEL CONTEXTO]\n`;
}

// El matcher por tokens ("≥50% coinciden") vivía aquí y producía falsos
// respaldos en ambas direcciones. Sustituido por el matcher de clave
// normalizada (services/citas-legales.ts) — Fase 3a.

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
  // DETERMINISTA (Fase 3a): mismos insumos → mismo número. El aleatorio que
  // había aquí hacía irreproducible la "confianza" que cubre el hash.
  // Respuesta "no info verificada" / abandono explícito → banda más baja
  const noInfoAnswer = /no tengo informaci[oó]n verificada|no tengo info verificada|consultar (?:el portal del )?sat|agente aduanal certificado/i.test(answer);
  if (noInfoAnswer && citationsCount === 0) {
    return 10; // banda 8–15, punto fijo
  }

  // Sin docs en absoluto → respuesta basada en knowledge interno
  if (docs.length === 0) {
    return 30; // banda 20–40, punto fijo
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

/** Hash de verificación de una consulta del Copilot. Incluye tenantId: la misma
 *  pregunta canónica en dos tenants produce hashes distintos (Bloque 3). Los
 *  ids de docs se ordenan para que el hash no dependa del orden de retrieval. */
export function calcularConsultHash(p: {
  tenantId: string; question: string; answer: string; docIds: string[]; modelUsed: string;
}): string {
  return crypto.createHash('sha256')
    .update([p.tenantId, p.question, p.answer, [...p.docIds].sort().join(','), p.modelUsed].join('|'))
    .digest('hex');
}

export async function askCopilotWithRAG(
  input: AskCopilotInput,
  // SOLO tests: inyectar generador/retrieval para simular respuestas con
  // citas no respaldadas sin gastar LLM real ni depender del corpus vivo.
  depsOverride: { generar?: typeof llmGenerateWithMeta; recuperar?: typeof smartRetrieval } = {},
): Promise<CopilotRAGResult> {
  const generar = depsOverride.generar ?? llmGenerateWithMeta;
  const recuperar = depsOverride.recuperar ?? smartRetrieval;
  const t0 = Date.now();

  // 1. Smart retrieval: topic filter + híbrido + Haiku reranker. Gate
  // shouldRespond cuando hay <2 docs relevantes para que el modelo no
  // alucine respuestas sin soporte legal.
  const retrieval = await recuperar(input.question, {
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
  const generation = await generar({
    model: 'fast',
    maxTokens: 1500,
    system: RAG_SYSTEM_PROMPT,
    user: userMsg,
    log: { operation: 'copilot', tenantId: input.tenantId, userId: input.userId },
  });
  let answer = injectIMMEXCertificationNote(stripDuplicateSourcesSection(generation.text));
  let modelUsed = generation.model;

  // 4. FAIL-CLOSED de citas (Fase 3a §4.1): matcher por clave normalizada.
  const modo = modoCitaEstricta();
  let cruce = cruzarCitas(answer, docs.map(d => d.reference));
  let regenerada = false;
  let degradada = false;
  let respuestaDescartada: string | null = null;

  if (cruce.noRespaldadas.length > 0) {
    logger.warn(`Copilot citó referencias no respaldadas: ${cruce.noRespaldadas.join(', ')}`, {
      action: 'copilot_cita_no_respaldada',
      tenantId: input.tenantId,
      userId: input.userId,
      metadata: { modo, question: input.question.slice(0, 200), noRespaldadas: cruce.noRespaldadas },
    });

    if (modo === 'estricta') {
      // Intento ÚNICO de regeneración con instrucción correctiva.
      regenerada = true;
      const correccion = `\n[CORRECCIÓN OBLIGATORIA] Tu respuesta anterior citó referencias que NO están en el contexto verificado: ${cruce.noRespaldadas.join('; ')}. Reescribe la respuesta ELIMINANDO esas referencias o sustituyéndolas por "no tengo este dato verificado; consúltalo en el DOF". NO agregues citas nuevas que no estén en el contexto.\n`;
      const reintento = await generar({
        model: 'fast',
        maxTokens: 1500,
        system: RAG_SYSTEM_PROMPT,
        user: `${userMsg}${correccion}`,
        log: { operation: 'copilot_regeneracion', tenantId: input.tenantId, userId: input.userId },
      });
      const answerReintento = injectIMMEXCertificationNote(stripDuplicateSourcesSection(reintento.text));
      const cruceReintento = cruzarCitas(answerReintento, docs.map(d => d.reference));
      logger.warn(`Copilot regeneró por citas no respaldadas (quedan ${cruceReintento.noRespaldadas.length})`, {
        action: 'copilot_cita_regenerada',
        tenantId: input.tenantId,
        userId: input.userId,
        metadata: { noRespaldadasAntes: cruce.noRespaldadas, noRespaldadasDespues: cruceReintento.noRespaldadas },
      });
      if (cruceReintento.noRespaldadas.length > 0) {
        // Persiste — el usuario NUNCA ve una respuesta con citas no respaldadas.
        degradada = true;
        respuestaDescartada = answerReintento;
        answer = `${ABSTENCION_CANONICA}\n\n⚖️ Esta información referencia disposiciones legales pero NO sustituye consulta profesional ni reemplaza el texto oficial. Verifica siempre la redacción exacta en fuente oficial (DOF, SAT). Cualquier acción debe validarse con tu agente aduanal o abogado.`;
        cruce = cruzarCitas(answer, docs.map(d => d.reference));
        logger.warn('Copilot DEGRADÓ la respuesta a abstención canónica (citas no respaldadas tras regeneración)', {
          action: 'copilot_cita_degradada',
          tenantId: input.tenantId,
          userId: input.userId,
          metadata: { question: input.question.slice(0, 200) },
        });
      } else {
        answer = answerReintento;
        modelUsed = reintento.model;
        cruce = cruceReintento;
      }
    }
  }

  // 5. Citas = SOLO documentos cuya clave cruza con una cita del texto.
  // El fallback "top-3 como referencias usadas" queda ELIMINADO (§4.2): un
  // documento consultado no es un documento que respalde la afirmación.
  const indicesRespaldados = [...new Set(cruce.respaldadas.values())];
  const citations: Citation[] = indicesRespaldados.map(i => {
    const doc = docs[i]!;
    return {
      reference: doc.reference,
      documentId: doc.id,
      source: doc.source,
      excerpt: doc.excerpt,
      officialUrl: doc.officialUrl,
      score: Math.round(doc.finalScore * 100) / 100,
    };
  });
  const documentosConsultados: DocumentoConsultado[] = docs
    .filter((_, i) => !indicesRespaldados.includes(i))
    .map(d => ({ reference: d.reference, source: d.source, officialUrl: d.officialUrl }));

  const confidence = calculateConfidence(docs, cruce.noRespaldadas.length, citations.length, answer, input.question);
  const consultHash = calcularConsultHash({
    tenantId: input.tenantId, question: input.question, answer, docIds: docs.map(d => d.id), modelUsed,
  });

  // 6. Persistir. UPSERT por (tenantId, consultHash): el hash es contenido-
  // determinista (tenant|pregunta|respuesta|docs|modelo) — misma pregunta con
  // misma respuesta (p.ej. la abstención canónica, que es fija) produce el
  // MISMO hash dentro del tenant, y un create fallaría con unique violation.
  // Con tenantId en el hash y unicidad compuesta, dos tenants con la misma
  // consulta canónica ya no colisionan ni se pisan (Bloque 3).
  const tokensUsed = Math.ceil((input.question.length + answer.length) / 4);
  await prisma.copilotConsult.upsert({
    where: { tenantId_consultHash: { tenantId: input.tenantId, consultHash } },
    update: { latencyMs: Date.now() - t0 },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      question: input.question,
      answer,
      citedDocuments: citations as never,
      modelUsed,
      tokensUsed,
      latencyMs: Date.now() - t0,
      confidence,
      consultHash,
      citaModo: modo,
      citaRegenerada: regenerada,
      citaDegradada: degradada,
      citasNoRespaldadas: cruce.noRespaldadas.length > 0 ? (cruce.noRespaldadas as never) : undefined,
      respuestaDescartada,
    },
  });

  return {
    answer,
    citations,
    documentosConsultados,
    confidence,
    consultHash,
    hallucinatedReferences: cruce.noRespaldadas,
    retrievedDocsCount: docs.length,
    citaEstricta: { modo, regenerada, degradada, noRespaldadas: cruce.noRespaldadas },
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
