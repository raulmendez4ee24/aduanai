import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function buildAnthropicClientOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    timeout: Number(env.ANTHROPIC_TIMEOUT_MS) || 120000,
    maxRetries: env.ANTHROPIC_MAX_RETRIES !== undefined
      && Number.isFinite(Number(env.ANTHROPIC_MAX_RETRIES))
      ? Number(env.ANTHROPIC_MAX_RETRIES)
      : 2,
  };
}

// Clasifica errores de la API de Anthropic que significan "sin capacidad de IA":
// crédito agotado (400 con "credit balance") o cuota/rate-limit agotada tras los
// reintentos del SDK (429). Cualquier otro error devuelve null.
export type TipoErrorAnthropic = 'credito' | 'cuota';
export function tipoDeErrorAnthropic(err: unknown): TipoErrorAnthropic | null {
  if (!(err instanceof Anthropic.APIError)) return null;
  const msg = (err.message ?? '').toLowerCase();
  if (err.status === 400 && msg.includes('credit balance')) return 'credito';
  if (err.status === 429) return 'cuota';
  return null;
}

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada. Agrégala en server/.env');
    }
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      ...buildAnthropicClientOptions(),
    });
  }
  return _client;
}
