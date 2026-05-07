import { getAnthropicClient } from './anthropic';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logAIUsage } from './logger';

type ModelTier = 'strong' | 'fast';

const PROVIDER = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();

export interface AILogContext {
  operation: string;       // ej "classify", "verify_classifier", "doc_extract", "copilot"
  tenantId?: string;
  userId?: string;
  classificationId?: string;
  consultHash?: string;
}

function approxTokens(s: string): number {
  // Aproximación: ~4 chars/token para promedios mixtos en/es. Se sustituye por
  // tokens reales cuando el SDK los devuelve (Anthropic) — Gemini se aproxima.
  return Math.ceil(s.length / 4);
}

let _gemini: GoogleGenerativeAI | null = null;
function getGemini() {
  if (!_gemini) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY no configurada. Agrégala en server/.env');
    }
    _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _gemini;
}

export async function llmGenerate(opts: {
  model?: ModelTier;
  system: string;
  user: string;
  maxTokens?: number;
  log?: AILogContext;
}): Promise<string> {
  const tier: ModelTier = opts.model ?? 'strong';
  const maxTokens = opts.maxTokens ?? 2000;
  const start = Date.now();
  const provider = PROVIDER;
  const model = provider === 'gemini'
    ? (tier === 'strong' ? 'gemini-2.0-flash-exp' : 'gemini-2.0-flash-lite')
    : (tier === 'strong' ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001');

  let inputTokens = 0;
  let outputTokens = 0;
  let success = true;
  let errorMessage: string | undefined;
  let text = '';

  try {
    if (provider === 'gemini') {
      const m = getGemini().getGenerativeModel({ model, systemInstruction: opts.system });
      const result = await m.generateContent({
        contents: [{ role: 'user', parts: [{ text: opts.user }] }],
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      });
      text = result.response.text();
      // Gemini devuelve usageMetadata
      const meta = result.response.usageMetadata;
      inputTokens = meta?.promptTokenCount ?? approxTokens(opts.system + opts.user);
      outputTokens = meta?.candidatesTokenCount ?? approxTokens(text);
    } else {
      const response = await getAnthropicClient().messages.create({
        model,
        max_tokens: maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      });
      text = response.content[0].type === 'text' ? response.content[0].text : '';
      inputTokens = response.usage.input_tokens;
      outputTokens = response.usage.output_tokens;
    }
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    inputTokens = approxTokens(opts.system + opts.user);
    throw err;
  } finally {
    if (opts.log) {
      // Fire-and-forget — no esperar al insert para no añadir latencia
      void logAIUsage({
        ...opts.log,
        model,
        provider,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        success,
        errorMessage,
      });
    }
  }

  return text;
}

export function currentLLMProvider(): string {
  return PROVIDER;
}

/** Igual que llmGenerate pero devuelve también el modelo y proveedor usados (para trazabilidad). */
export async function llmGenerateWithMeta(opts: {
  model?: ModelTier;
  system: string;
  user: string;
  maxTokens?: number;
  log?: AILogContext;
}): Promise<{ text: string; model: string; provider: string }> {
  const tier: ModelTier = opts.model ?? 'strong';
  const provider = PROVIDER;
  const model = provider === 'gemini'
    ? (tier === 'strong' ? 'gemini-2.0-flash-exp' : 'gemini-2.0-flash-lite')
    : (tier === 'strong' ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001');
  const text = await llmGenerate(opts);
  return { text, model, provider };
}
