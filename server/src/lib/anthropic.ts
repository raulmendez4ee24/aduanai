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
