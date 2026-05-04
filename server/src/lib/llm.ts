import { getAnthropicClient } from './anthropic';
import { GoogleGenerativeAI } from '@google/generative-ai';

type ModelTier = 'strong' | 'fast';

const PROVIDER = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();

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
}): Promise<string> {
  const tier: ModelTier = opts.model ?? 'strong';
  const maxTokens = opts.maxTokens ?? 2000;

  if (PROVIDER === 'gemini') {
    const modelName = tier === 'strong' ? 'gemini-2.0-flash-exp' : 'gemini-2.0-flash-lite';
    const model = getGemini().getGenerativeModel({
      model: modelName,
      systemInstruction: opts.system,
    });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    });
    return result.response.text();
  }

  // Default: Anthropic
  const modelName = tier === 'strong' ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
  const response = await getAnthropicClient().messages.create({
    model: modelName,
    max_tokens: maxTokens,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export function currentLLMProvider(): string {
  return PROVIDER;
}
