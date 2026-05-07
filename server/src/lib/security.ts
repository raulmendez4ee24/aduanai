/**
 * Helpers de seguridad: registro de eventos, bloqueo de IP, escape HTML.
 */

import { prisma } from './prisma';
import { logger } from './logger';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEventInput {
  type: string;
  severity?: SecuritySeverity;
  ip: string;
  userId?: string;
  email?: string;
  endpoint?: string;
  details?: Record<string, unknown>;
}

export async function recordSecurityEvent(ev: SecurityEventInput): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        type: ev.type,
        severity: ev.severity ?? 'medium',
        ip: ev.ip,
        userId: ev.userId,
        email: ev.email,
        endpoint: ev.endpoint,
        details: ev.details as never,
      },
    });
    if ((ev.severity ?? 'medium') === 'critical' || ev.severity === 'high') {
      logger.warn(`Security event: ${ev.type}`, {
        action: 'security_event',
        ip: ev.ip,
        userId: ev.userId,
        endpoint: ev.endpoint,
        metadata: { type: ev.type, severity: ev.severity, ...ev.details },
      });
    }
  } catch (err) {
    console.error('[security] failed to record event:', err instanceof Error ? err.message : err);
  }
}

export async function isIPBlocked(ip: string): Promise<boolean> {
  const now = new Date();
  const block = await prisma.blockedIP.findFirst({
    where: { ip, active: true, expiresAt: { gt: now } },
    select: { id: true },
  });
  return block !== null;
}

export async function blockIP(ip: string, reason: string, durationMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + durationMs);
  await prisma.blockedIP.upsert({
    where: { ip },
    update: { reason, expiresAt, active: true, unblockedAt: null, unblockedBy: null },
    create: { ip, reason, expiresAt, active: true },
  });
  await recordSecurityEvent({
    type: 'ip_blocked',
    severity: 'high',
    ip,
    details: { reason, durationMs, expiresAt: expiresAt.toISOString() },
  });
}

export async function unblockIP(ip: string, by: string): Promise<void> {
  await prisma.blockedIP.update({
    where: { ip },
    data: { active: false, unblockedAt: new Date(), unblockedBy: by },
  });
}

export function getClientIP(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string }; ip?: string }): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return String(fwd[0]).split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? req.ip ?? 'unknown';
}

/** Escape HTML para prevenir XSS al renderizar strings de usuario. */
export function escapeHTML(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Sanitiza recursivamente strings en un objeto (para outputs). */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj === 'string') return escapeHTML(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(sanitizeObject) as unknown as T;
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = sanitizeObject(v);
    return out as T;
  }
  return obj;
}
