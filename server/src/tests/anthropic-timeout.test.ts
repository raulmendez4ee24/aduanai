/**
 * Tests de configuración de timeout y reintentos del cliente Anthropic.
 *
 * Ejecutar:  npm run test:anthropic
 */

import { strict as assert } from 'node:assert';
import { buildAnthropicClientOptions, getAnthropicClient } from '../lib/anthropic';

async function main(): Promise<void> {
  assert.deepEqual(buildAnthropicClientOptions({}), {
    timeout: 120000,
    maxRetries: 2,
  });
  console.log('  ✓ buildAnthropicClientOptions usa los defaults exactos');

  assert.deepEqual(buildAnthropicClientOptions({
    ANTHROPIC_TIMEOUT_MS: '45000',
    ANTHROPIC_MAX_RETRIES: '4',
  }), {
    timeout: 45000,
    maxRetries: 4,
  });
  assert.equal(
    buildAnthropicClientOptions({ ANTHROPIC_MAX_RETRIES: '0' }).maxRetries,
    0,
  );
  console.log('  ✓ respeta overrides, incluido ANTHROPIC_MAX_RETRIES=0');

  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalTimeout = process.env.ANTHROPIC_TIMEOUT_MS;
  const originalMaxRetries = process.env.ANTHROPIC_MAX_RETRIES;

  try {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy-test-key';
    process.env.ANTHROPIC_TIMEOUT_MS = '34567';
    process.env.ANTHROPIC_MAX_RETRIES = '0';

    const client = getAnthropicClient();
    assert.equal(client.timeout, 34567);
    assert.equal(client.maxRetries, 0);
  } finally {
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
    if (originalTimeout === undefined) delete process.env.ANTHROPIC_TIMEOUT_MS;
    else process.env.ANTHROPIC_TIMEOUT_MS = originalTimeout;
    if (originalMaxRetries === undefined) delete process.env.ANTHROPIC_MAX_RETRIES;
    else process.env.ANTHROPIC_MAX_RETRIES = originalMaxRetries;
  }
  console.log('  ✓ el cliente expone timeout=34567 y maxRetries=0 sin llamadas de red');

  console.log('\nResumen: 3/3 pruebas pasaron.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
