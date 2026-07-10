/** Tests puros del sanitizer de AuditLog. Sin DB. */

import { strict as assert } from 'node:assert';
import {
  buildAuditMetadata,
  MAX_AUDIT_METADATA_BYTES,
  sanitizeAuditBody,
  sanitizeAuditMetadata,
} from '../lib/audit-sanitizer';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nAuditLog sanitizer');

test('elimina files[].base64 sin perder metadatos del archivo', () => {
  const payload = 'JVBERi0xLjQK-secret-pdf';
  const body = { files: [{ name: 'pedimento.pdf', mimeType: 'application/pdf', base64: payload }] };
  const sanitized = sanitizeAuditBody(body) as typeof body;
  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.files[0]?.name, 'pedimento.pdf');
  assert.match(String(sanitized.files[0]?.base64), /^\[OMITTED_BINARY:\d+_CHARS\]$/);
  assert.doesNotMatch(serialized, /JVBERi0xLjQK/);
});

test('redacta secretos recursivamente y sin distinguir mayúsculas', () => {
  const sanitized = sanitizeAuditBody({ nested: { password: 'p', currentPassword: 'c', refreshToken: 'r', API_KEY: 'k' } }) as {
    nested: Record<string, string>;
  };
  assert.equal(sanitized.nested.password, '[REDACTED]');
  assert.equal(sanitized.nested.currentPassword, '[REDACTED]');
  assert.equal(sanitized.nested.refreshToken, '[REDACTED]');
  assert.equal(sanitized.nested.API_KEY, '[REDACTED]');
});

test('omite evidence y data URI aunque la clave no se llame base64', () => {
  const sanitized = sanitizeAuditBody({
    evidence: 'raw-pdf-content',
    image: 'data:image/png;base64,SECRET_IMAGE',
  }) as Record<string, string>;
  assert.match(sanitized.evidence, /^\[OMITTED_BINARY:/);
  assert.match(sanitized.image, /^\[OMITTED_DATA_URI:/);
  assert.doesNotMatch(JSON.stringify(sanitized), /raw-pdf-content|SECRET_IMAGE/);
});

test('no muta el request original', () => {
  const original = { files: [{ base64: 'abc' }], token: 'secret' };
  sanitizeAuditBody(original);
  assert.equal(original.files[0]?.base64, 'abc');
  assert.equal(original.token, 'secret');
});

test('es idempotente al cruzar middleware y frontera central', () => {
  const once = sanitizeAuditBody({ files: [{ base64: 'abcdef' }] }) as { files: { base64: string }[] };
  const twice = sanitizeAuditMetadata({ statusCode: 200, requestBody: once }) as {
    requestBody: { files: { base64: string }[] };
  };
  assert.equal(twice.requestBody.files[0]?.base64, '[OMITTED_BINARY:6_CHARS]');
});

test('conserva cuerpos normales debajo del límite', () => {
  const metadata = buildAuditMetadata(201, { fractionCode: '73181599', quantity: 10 });
  assert.equal(metadata.statusCode, 201);
  assert.deepEqual(metadata.requestBody, { fractionCode: '73181599', quantity: 10 });
});

test('trunca cuerpos grandes sin guardar preview del contenido', () => {
  const marker = 'CONFIDENTIAL_MARKER_';
  const metadata = buildAuditMetadata(200, { notes: marker.repeat(5000) });
  const serialized = JSON.stringify(metadata);
  const requestBody = metadata.requestBody as Record<string, unknown>;
  assert.equal(requestBody._auditTruncated, true);
  assert.doesNotMatch(serialized, /CONFIDENTIAL_MARKER/);
  assert.ok(Buffer.byteLength(serialized, 'utf8') <= MAX_AUDIT_METADATA_BYTES);
});

test('la selección bajo límites es determinista ante distinto orden de keys', () => {
  const entries = Array.from({ length: 120 }, (_, i) => [`key_${String(i).padStart(3, '0')}`, i] as const);
  const forward = Object.fromEntries(entries);
  const reverse = Object.fromEntries([...entries].reverse());
  assert.deepEqual(sanitizeAuditBody(forward), sanitizeAuditBody(reverse));
});

test('la frontera central también limita metadata de callers directos', () => {
  const metadata = sanitizeAuditMetadata({ detail: 'ñ'.repeat(20_000) });
  const serialized = JSON.stringify(metadata);
  assert.equal(metadata?._auditTruncated, true);
  assert.doesNotMatch(serialized, /ñññññ/);
  assert.ok(Buffer.byteLength(serialized, 'utf8') <= MAX_AUDIT_METADATA_BYTES);
});

console.log(`\n${passed} passed, 0 failed\n`);
