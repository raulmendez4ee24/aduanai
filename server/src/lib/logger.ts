/**
 * Logger estructurado y wrapper de uso de IA.
 *
 * Todos los logs se persisten en `SystemLog`. Errores y AI usage se duplican
 * a stdout para poder ver en tiempo real durante desarrollo.
 *
 * Diseño defensivo: si la DB está caída, los logs siguen yendo a stdout para
 * no romper el flujo del request.
 */

import { prisma } from './prisma';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  method?: string;
  endpoint?: string;
  statusCode?: number;
  latencyMs?: number;
  entity?: string;
  entityId?: string;
  action?: string;
  metadata?: Record<string, unknown>;
  userAgent?: string;
  ip?: string;
  errorMessage?: string;
  errorStack?: string;
}

const COLORS: Record<LogLevel, string> = {
  DEBUG: '\x1b[90m',
  INFO: '\x1b[36m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  CRITICAL: '\x1b[1;41m',
};
const RESET = '\x1b[0m';

async function persist(level: LogLevel, ctx: LogContext): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        level,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        requestId: ctx.requestId,
        method: ctx.method,
        endpoint: ctx.endpoint,
        statusCode: ctx.statusCode,
        latencyMs: ctx.latencyMs,
        errorMessage: ctx.errorMessage,
        errorStack: ctx.errorStack,
        entity: ctx.entity,
        entityId: ctx.entityId,
        action: ctx.action,
        metadata: ctx.metadata as never,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });
  } catch (err) {
    // No tirar al request si la DB falla para escribir log
    console.error('[logger] failed to persist log:', err instanceof Error ? err.message : err);
  }
}

export function log(level: LogLevel, message: string, ctx: LogContext = {}): Promise<void> {
  const ts = new Date().toISOString();
  const tag = `${COLORS[level]}[${level}]${RESET}`;
  const summary = ctx.endpoint ? `${ctx.method ?? ''} ${ctx.endpoint}` : '';
  const tenant = ctx.tenantId ? ` t=${ctx.tenantId.slice(-6)}` : '';
  const lat = ctx.latencyMs != null ? ` ${ctx.latencyMs}ms` : '';
  const status = ctx.statusCode != null ? ` ${ctx.statusCode}` : '';
  if (level !== 'DEBUG' || process.env.LOG_DEBUG === 'true') {
    console.log(`${ts} ${tag} ${message}${summary ? ` — ${summary}` : ''}${status}${lat}${tenant}`);
    if (ctx.errorStack) console.log(ctx.errorStack);
  }
  return persist(level, { ...ctx, errorMessage: ctx.errorMessage ?? message });
}

export const logger = {
  debug: (msg: string, ctx: LogContext = {}) => log('DEBUG', msg, ctx),
  info:  (msg: string, ctx: LogContext = {}) => log('INFO', msg, ctx),
  warn:  (msg: string, ctx: LogContext = {}) => log('WARN', msg, ctx),
  error: (msg: string, ctx: LogContext = {}) => log('ERROR', msg, ctx),
  critical: (msg: string, ctx: LogContext = {}) => log('CRITICAL', msg, ctx),
};

// ──────────────────────────────────────────────────────────────────────
// Pricing por modelo (USD por 1M tokens — actualizar según rate cards)
// ──────────────────────────────────────────────────────────────────────

interface ModelPricing { in: number; out: number }
const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-sonnet-4-6':          { in: 3.00,  out: 15.00 },
  'claude-sonnet-4-20250514':   { in: 3.00,  out: 15.00 }, // retirado — solo para logs históricos
  'claude-haiku-4-5-20251001':  { in: 1.00,  out:  5.00 },
  'claude-opus-4-7':            { in: 15.00, out: 75.00 },
  // Gemini
  'gemini-2.0-flash-exp':       { in: 0.10,  out: 0.40 },
  'gemini-2.0-flash-lite':      { in: 0.075, out: 0.30 },
};

export function estimateCostUSD(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { in: 1.0, out: 5.0 }; // fallback conservador
  return Math.round(((inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out) * 1e6) / 1e6;
}

// ──────────────────────────────────────────────────────────────────────
// Logging de uso de IA
// ──────────────────────────────────────────────────────────────────────

export interface AIUsageRecord {
  tenantId?: string;
  userId?: string;
  model: string;
  provider: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  classificationId?: string;
  consultHash?: string;
}

export async function logAIUsage(rec: AIUsageRecord): Promise<void> {
  const totalTokens = rec.inputTokens + rec.outputTokens;
  const costUSD = estimateCostUSD(rec.model, rec.inputTokens, rec.outputTokens);
  try {
    await prisma.aIUsageLog.create({
      data: {
        tenantId: rec.tenantId,
        userId: rec.userId,
        model: rec.model,
        provider: rec.provider,
        operation: rec.operation,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
        totalTokens,
        latencyMs: rec.latencyMs,
        costUSD,
        success: rec.success,
        errorMessage: rec.errorMessage,
        classificationId: rec.classificationId,
        consultHash: rec.consultHash,
      },
    });
  } catch (err) {
    console.error('[logger] failed to persist AI usage:', err instanceof Error ? err.message : err);
  }
}
