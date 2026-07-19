/**
 * Tests puros del umbral mínimo del clasificador y su error 422.
 *
 * Ejecutar: npm run test:classify-input
 */

import { strict as assert } from 'node:assert';
import {
  createNoCandidateError,
  validateClassifyInput,
} from '../services/classify-input';

async function main(): Promise<void> {
  const rejectedDescriptions = ['', 'x', 'cosa', '12345', '???', 'ab cd'];
  for (const description of rejectedDescriptions) {
    const result = validateClassifyInput(description);
    assert.equal(result.ok, false, `Debía rechazar: ${JSON.stringify(description)}`);
    if (!result.ok) {
      assert.ok(result.reason.trim().length > 0, 'El rechazo debe incluir una razón');
    }
  }
  console.log(`  ✓ rechaza ${rejectedDescriptions.length} descripciones vacías o insuficientes con reason`);

  const acceptedDescriptions = [
    'tornillo M8 acero',
    'laptop 14 pulgadas',
    'bomba centrífuga para agua',
    'tornillo de acero inoxidable M8 con rosca métrica',
  ];
  for (const description of acceptedDescriptions) {
    assert.deepEqual(
      validateClassifyInput(description),
      { ok: true },
      `Debía aceptar: ${JSON.stringify(description)}`,
    );
  }
  console.log(`  ✓ acepta ${acceptedDescriptions.length} descripciones legítimas, incluida "tornillo M8 acero"`);

  const noCandidateError = createNoCandidateError();
  assert.equal(noCandidateError.statusCode, 422);
  assert.match(noCandidateError.message, /descripción es insuficiente/i);
  assert.match(noCandidateError.message, /material/i);
  assert.match(noCandidateError.message, /uso/i);
  assert.match(noCandidateError.message, /composición/i);
  assert.match(noCandidateError.message, /características técnicas/i);
  console.log('  ✓ SIN_CANDIDATO construye AppError 422 con mensaje accionable');

  console.log('\nResumen: 3/3 grupos de pruebas pasaron.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
