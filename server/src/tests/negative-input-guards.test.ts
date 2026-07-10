/** Regresiones de entrada que deben cerrar antes de tocar DB. */

import { strict as assert } from 'node:assert';
import type { Router } from 'express';
import { inventoryRouter } from '../routes/inventory';
import { fiscalRouter } from '../routes/fiscal';

interface MockResult {
  statusCode: number;
  body: unknown;
}

async function invokeLastHandler(router: Router, path: string, req: Record<string, unknown>): Promise<MockResult> {
  const layer = router.stack.find(item => item.route?.path === path);
  if (!layer?.route) throw new Error(`Ruta ${path} no encontrada`);
  const handler = layer.route.stack.at(-1)?.handle;
  if (!handler) throw new Error(`Handler ${path} no encontrado`);

  const result: MockResult = { statusCode: 200, body: null };
  const res = {
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
  await handler(req as never, res as never, (err?: unknown) => { if (err) throw err; });
  return result;
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nNegative input guards');

async function main(): Promise<void> {
await test('descargo negativo devuelve 400 antes de consultar inventario', async () => {
  const result = await invokeLastHandler(inventoryRouter, '/discharges', {
    body: { temporaryImportId: 'imp', type: 'RETURN', quantity: -10, unit: 'kg', dischargeDate: '2026-07-10' },
  });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, { status: 'error', message: 'La cantidad del descargo debe ser mayor a cero' });
});

await test('descargo no finito devuelve 400', async () => {
  const result = await invokeLastHandler(inventoryRouter, '/discharges', {
    body: { temporaryImportId: 'imp', type: 'RETURN', quantity: 'Infinity', unit: 'kg', dischargeDate: '2026-07-10' },
  });
  assert.equal(result.statusCode, 400);
});

await test('IVA aplicado negativo devuelve 400 antes de consultar crédito', async () => {
  const result = await invokeLastHandler(fiscalRouter, '/credits/:id/use', {
    params: { id: 'credit' },
    body: { pedimentoDescargo: '26 00 0000 0000001', ivaApplied: -1, usageDate: '2026-07-10' },
  });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, { status: 'error', message: 'Los montos aplicados no pueden ser negativos' });
});

await test('IEPS aplicado negativo devuelve 400', async () => {
  const result = await invokeLastHandler(fiscalRouter, '/credits/:id/use', {
    params: { id: 'credit' },
    body: { pedimentoDescargo: '26 00 0000 0000001', ivaApplied: 0, iepsApplied: -1, usageDate: '2026-07-10' },
  });
  assert.equal(result.statusCode, 400);
});

await test('aplicación total cero devuelve 400', async () => {
  const result = await invokeLastHandler(fiscalRouter, '/credits/:id/use', {
    params: { id: 'credit' },
    body: { pedimentoDescargo: '26 00 0000 0000001', ivaApplied: 0, iepsApplied: 0, usageDate: '2026-07-10' },
  });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, { status: 'error', message: 'El monto total aplicado debe ser mayor a cero' });
});

console.log(`\n${passed} passed, 0 failed\n`);
}

void main().catch(err => {
  console.error(err);
  process.exit(1);
});
