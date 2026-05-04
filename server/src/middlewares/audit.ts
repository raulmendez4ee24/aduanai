/**
 * Audit middleware — registra automáticamente mutaciones (POST/PUT/PATCH/DELETE)
 * en /api/* con tenantId resuelto. Fire-and-forget.
 *
 * Inferencia simple de entidad/acción a partir de método + path.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { recordAudit } from '../services/audit-service';

const SKIP_PATHS = [
  '/auth/login',
  '/auth/logout',
  '/auth/refresh',
  '/auth/verify-email',
  '/auth/resend-code',
  '/admin/audit',          // evita recursión infinita
  '/admin/dashboard',
  '/admin/metrics',
  '/admin/renewals',
];

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

const PATH_TO_ENTITY: Array<{ pattern: RegExp; entity: string; actionOverride?: string }> = [
  { pattern: /\/classify(\/.*)?$/, entity: 'Classification', actionOverride: 'CLASSIFY' },
  { pattern: /\/quote\/multi/, entity: 'Quote', actionOverride: 'QUOTE_MULTI' },
  { pattern: /\/quote\/scenarios/, entity: 'Quote', actionOverride: 'QUOTE_SCENARIOS' },
  { pattern: /\/quote/, entity: 'Quote', actionOverride: 'QUOTE' },
  { pattern: /\/prevalidate\/pedimento/, entity: 'Pedimento', actionOverride: 'PEDIMENTO_VALIDATION' },
  { pattern: /\/prevalidate/, entity: 'Pedimento', actionOverride: 'PRE_VALIDATE' },
  { pattern: /\/inventory\/imports/, entity: 'TemporaryImport' },
  { pattern: /\/inventory\/discharges/, entity: 'Discharge' },
  { pattern: /\/inventory\/products/, entity: 'Product' },
  { pattern: /\/inventory\/assemblies/, entity: 'Assembly' },
  { pattern: /\/inventory\/bom/, entity: 'ProductComponent' },
  { pattern: /\/inventory\/annex24/, entity: 'Annex24Report' },
  { pattern: /\/inventory/, entity: 'Inventory' },
  { pattern: /\/fiscal\/credits/, entity: 'TaxCredit' },
  { pattern: /\/fiscal\/guarantees/, entity: 'Guarantee' },
  { pattern: /\/fiscal\/certification/, entity: 'CertificationProfile' },
  { pattern: /\/fiscal/, entity: 'Fiscal' },
  { pattern: /\/mve/, entity: 'ManifestacionValor' },
  { pattern: /\/logistics\/plans/, entity: 'LoadPlan' },
  { pattern: /\/logistics/, entity: 'LoadPlan' },
  { pattern: /\/operations/, entity: 'Operation' },
  { pattern: /\/alerts/, entity: 'Alert' },
  { pattern: /\/admin\/demo-data/, entity: 'DemoData', actionOverride: 'DEMO_DATA' },
  { pattern: /\/admin\/pilots/, entity: 'Tenant', actionOverride: 'PILOT_LIFECYCLE' },
  { pattern: /\/admin\/contracts/, entity: 'Tenant', actionOverride: 'CONTRACT' },
  { pattern: /\/admin\/proposals/, entity: 'Proposal' },
  { pattern: /\/admin\/tenants/, entity: 'Tenant' },
  { pattern: /\/admin\/demo/, entity: 'DemoAccount' },
  { pattern: /\/leads/, entity: 'Lead' },
  { pattern: /\/knowledge/, entity: 'ClassificationKnowledge' },
  { pattern: /\/copilot/, entity: 'CopilotMessage' },
];

function inferEntityAndAction(method: string, path: string): { action: string; entity: string } {
  let action = METHOD_TO_ACTION[method] ?? method;
  let entity = 'Unknown';
  for (const { pattern, entity: e, actionOverride } of PATH_TO_ENTITY) {
    if (pattern.test(path)) {
      entity = e;
      if (actionOverride) action = actionOverride;
      break;
    }
  }
  return { action, entity };
}

function extractEntityId(path: string, body: unknown): string | null {
  // /api/inventory/imports/cmon123  → "cmon123"
  const m = path.match(/\/[a-z0-9]{20,}(\/|$)/i);
  if (m) return m[0].replace(/\//g, '').trim();
  // Fallback al campo id del body de respuesta
  if (body && typeof body === 'object') {
    const b = body as { data?: { id?: string; quoteId?: string; pedimento?: { id?: string } } };
    return b.data?.id ?? b.data?.quoteId ?? b.data?.pedimento?.id ?? null;
  }
  return null;
}

function shouldSkip(path: string, method: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
  for (const skip of SKIP_PATHS) {
    if (path.includes(skip)) return true;
  }
  return false;
}

export function auditMiddleware() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Capturar path ANTES del routing — Express 5 "consume" req.path durante el dispatch
    // y al ejecutar res.on('finish') ya viene como '/'.
    const capturedPath = req.originalUrl?.split('?')[0] ?? req.path;
    const capturedMethod = req.method;

    if (shouldSkip(capturedPath, capturedMethod)) return next();

    // Capturar respuesta para extraer entityId
    const originalJson = res.json.bind(res);
    let responseBody: unknown = null;
    res.json = function (body: unknown) {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      if (!req.tenantId) return;
      if (res.statusCode >= 400) return;

      const { action, entity } = inferEntityAndAction(capturedMethod, capturedPath);
      const entityId = extractEntityId(capturedPath, responseBody);
      const safeBody = sanitizeBody(req.body);

      void recordAudit({
        tenantId: req.tenantId,
        userId: req.userId,
        action,
        entity,
        entityId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        endpoint: capturedPath,
        method: capturedMethod,
        metadata: {
          statusCode: res.statusCode,
          requestBody: safeBody,
        },
      });
    });

    next();
  };
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const SENSITIVE = ['password', 'newPassword', 'token', 'refreshToken', 'apiKey', 'secret'];
  const clone = JSON.parse(JSON.stringify(body));
  for (const k of Object.keys(clone)) {
    if (SENSITIVE.includes(k)) clone[k] = '[REDACTED]';
  }
  return clone;
}
