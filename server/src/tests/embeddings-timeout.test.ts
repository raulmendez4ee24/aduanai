/**
 * Tests de timeout y presupuesto global de embeddings.
 *
 * Ejecutar:  npm run test:embeddings
 */

import { strict as assert } from 'node:assert';
import { generateEmbedding, getEmbeddingTimeoutConfig } from '../lib/embeddings';

const ENV_KEYS = [
  'VOYAGE_API_KEY',
  'OPENAI_API_KEY',
  'VOYAGE_TIMEOUT_MS',
  'VOYAGE_TOTAL_TIMEOUT_MS',
] as const;

type EmbeddingEnvKey = typeof ENV_KEYS[number];
type EmbeddingEnv = Partial<Record<EmbeddingEnvKey, string>>;

async function withMockedFetch(
  mockFetch: typeof fetch,
  env: EmbeddingEnv,
  test: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<EmbeddingEnvKey, string | undefined>;

  try {
    for (const key of ENV_KEYS) {
      const value = env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = mockFetch;
    await test();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  let hangingStartedAt = 0;
  let abortElapsedMs = 0;
  let hangingTotalElapsedMs = 0;
  let budgetElapsedMs = 0;

  await withMockedFetch(
    ((_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      assert.ok(signal, 'Voyage debe pasar AbortSignal al fetch');

      const rejectOnAbort = () => {
        if (abortElapsedMs === 0) abortElapsedMs = Date.now() - hangingStartedAt;
        const error = new Error('Fetch colgado abortado');
        error.name = 'AbortError';
        reject(error);
      };

      if (signal.aborted) rejectOnAbort();
      else signal.addEventListener('abort', rejectOnAbort, { once: true });
    })) as typeof fetch,
    {
      VOYAGE_API_KEY: 'test-voyage-key',
      VOYAGE_TIMEOUT_MS: '300',
      VOYAGE_TOTAL_TIMEOUT_MS: '1000',
    },
    async () => {
      assert.equal(getEmbeddingTimeoutConfig().perAttemptTimeoutMs, 300);
      hangingStartedAt = Date.now();
      const embedding = await generateEmbedding('fetch colgado', 'query');
      hangingTotalElapsedMs = Date.now() - hangingStartedAt;

      assert.equal(embedding.length, 256, 'El fallo final debe conservar el fallback hashed');
      assert.ok(abortElapsedMs > 0, 'El fetch colgado debía recibir el evento abort');
      assert.ok(abortElapsedMs < 2000, `El intento abortó en ${abortElapsedMs}ms; debía ser < 2000ms`);
      assert.ok(hangingTotalElapsedMs < 2000,
        `La llamada colgada tardó ${hangingTotalElapsedMs}ms; debía respetar el budget de 1000ms`);
    },
  );
  console.log(`  ✓ fetch colgado abortó en ${abortElapsedMs} ms; llamada total ${hangingTotalElapsedMs} ms`);

  await withMockedFetch(
    (async () => {
      throw new TypeError('Fallo de red sintético');
    }) as typeof fetch,
    {
      VOYAGE_API_KEY: 'test-voyage-key',
      VOYAGE_TOTAL_TIMEOUT_MS: '1000',
    },
    async () => {
      const startedAt = Date.now();
      const embedding = await generateEmbedding('fallo rápido', 'document');
      budgetElapsedMs = Date.now() - startedAt;

      assert.equal(embedding.length, 256, 'El fallo final debe conservar el fallback hashed');
      assert.ok(budgetElapsedMs < 5000,
        `Los reintentos tardaron ${budgetElapsedMs}ms; el budget debía cortar los 63s de backoff`);
    },
  );
  console.log(`  ✓ budget global cortó el backoff en ${budgetElapsedMs} ms (< 5000 ms)`);

  const expectedEmbedding = Array.from({ length: 1024 }, (_, i) => i / 1024);
  await withMockedFetch(
    (async (_input, init) => {
      assert.ok(init?.signal, 'Voyage debe pasar AbortSignal también en el camino feliz');
      return new Response(JSON.stringify({ data: [{ embedding: expectedEmbedding }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
    {
      VOYAGE_API_KEY: 'test-voyage-key',
      VOYAGE_TIMEOUT_MS: '300',
      VOYAGE_TOTAL_TIMEOUT_MS: '1000',
    },
    async () => {
      const embedding = await generateEmbedding('camino feliz', 'query');
      assert.equal(embedding.length, 1024);
      assert.deepEqual(embedding, expectedEmbedding);
    },
  );
  console.log('  ✓ camino feliz conservó el embedding Voyage válido de 1024 dimensiones');

  console.log(`\nResumen: 3/3 pruebas pasaron. Tiempos medidos: abort=${abortElapsedMs} ms, ` +
    `budget=${budgetElapsedMs} ms.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
