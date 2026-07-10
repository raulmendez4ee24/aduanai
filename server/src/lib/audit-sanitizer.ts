/** Sanitización y límite central para cualquier AuditLog.metadata. */

export const MAX_AUDIT_METADATA_BYTES = 16 * 1024;
const MAX_AUDIT_DEPTH = 12;
const MAX_AUDIT_ARRAY_ITEMS = 100;
const MAX_AUDIT_OBJECT_KEYS = 100;
const SANITIZER_VERSION = 1;

const SENSITIVE_KEYS = new Set([
  'password', 'currentpassword', 'newpassword', 'confirmpassword',
  'token', 'refreshtoken', 'accesstoken', 'resettoken',
  'apikey', 'secret', 'clientsecret', 'authorization', 'privatekey',
  'verificationcode', 'resetcode', 'otp', 'cookie', 'sessionid',
]);

const BINARY_KEYS = new Set([
  'base64', 'evidence', 'filecontent', 'documentcontent', 'binary', 'datauri',
]);

function normalizeKey(key: string | null): string {
  return key?.replace(/[^a-z0-9]/gi, '').toLowerCase() ?? '';
}

function sanitizeValue(value: unknown, key: string | null, depth: number): unknown {
  const normalizedKey = normalizeKey(key);

  if (BINARY_KEYS.has(normalizedKey) || normalizedKey.endsWith('base64')) {
    if (typeof value === 'string' && /^\[OMITTED_(?:BINARY|DATA_URI):/i.test(value)) return value;
    const chars = typeof value === 'string' ? value.length : 0;
    return `[OMITTED_BINARY:${chars}_CHARS]`;
  }
  if (SENSITIVE_KEYS.has(normalizedKey)) return '[REDACTED]';
  if (typeof value === 'string' && /^data:[^;]+;base64,/i.test(value)) {
    return `[OMITTED_DATA_URI:${value.length}_CHARS]`;
  }
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[OMITTED_BINARY:${value.length}_BYTES]`;
  if (depth >= MAX_AUDIT_DEPTH) return '[OMITTED_MAX_DEPTH]';

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_AUDIT_ARRAY_ITEMS)
      .map(item => sanitizeValue(item, null, depth + 1));
    if (value.length > MAX_AUDIT_ARRAY_ITEMS) {
      sanitized.push(`[OMITTED_ARRAY_ITEMS:${value.length - MAX_AUDIT_ARRAY_ITEMS}]`);
    }
    return sanitized;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of entries.slice(0, MAX_AUDIT_OBJECT_KEYS)) {
      result[childKey] = sanitizeValue(childValue, childKey, depth + 1);
    }
    if (entries.length > MAX_AUDIT_OBJECT_KEYS) {
      result._auditOmittedKeys = entries.length - MAX_AUDIT_OBJECT_KEYS;
    }
    return result;
  }

  return `[OMITTED_TYPE:${typeof value}]`;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
}

function summarizeShape(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (value && typeof value === 'object') {
    return { type: 'object', keyCount: Object.keys(value as Record<string, unknown>).length };
  }
  if (typeof value === 'string') return { type: 'string', chars: value.length };
  return { type: value === null ? 'null' : typeof value };
}

/** Sanitiza secretos/binarios en cualquier profundidad sin mutar la entrada. */
export function sanitizeAuditBody(body: unknown): unknown {
  return sanitizeValue(body, null, 0);
}

/** Frontera central: aplica sanitizer y cap a metadata de cualquier caller. */
export function sanitizeAuditMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  if (metadata === null) return null;
  const sanitized = sanitizeAuditBody(metadata) as Record<string, unknown>;
  const sanitizedBytes = jsonBytes(sanitized);
  if (sanitizedBytes <= MAX_AUDIT_METADATA_BYTES) return sanitized;

  return {
    _auditTruncated: true,
    sanitizerVersion: SANITIZER_VERSION,
    sanitizedBytes,
    maxMetadataBytes: MAX_AUDIT_METADATA_BYTES,
    shape: summarizeShape(sanitized),
  };
}

/** Construye metadata acotada para el middleware HTTP. */
export function buildAuditMetadata(statusCode: number, body: unknown): Record<string, unknown> {
  const requestBody = sanitizeAuditBody(body);
  const metadata = { statusCode, requestBody };
  const sanitizedBytes = jsonBytes(metadata);
  if (sanitizedBytes <= MAX_AUDIT_METADATA_BYTES) return metadata;

  return {
    statusCode,
    requestBody: {
      _auditTruncated: true,
      sanitizerVersion: SANITIZER_VERSION,
      sanitizedBytes,
      maxMetadataBytes: MAX_AUDIT_METADATA_BYTES,
      shape: summarizeShape(requestBody),
    },
  };
}
