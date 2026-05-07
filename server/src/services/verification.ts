/**
 * Servicio de verificación profesional — agentes aduanales / importadores.
 *
 * Lookup contra `ProfessionalRegistry` para pre-aprobación automática
 * cuando la patente declarada existe, está activa y no expirada.
 *
 * Estados:
 *   pending   - usuario nuevo, no envió docs
 *   submitted - subió docs, esperando review SUPERADMIN
 *   verified  - aprobado
 *   rejected  - rechazado con razón
 *   expired   - patente caducada (cron lo detecta)
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendEmail } from '../lib/email';

export type VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';
export type ProfessionalType = 'agent_customs' | 'broker' | 'importer' | 'consultant' | 'other';

export interface RegistryLookup {
  exists: boolean;
  active: boolean;
  expired: boolean;
  socialName?: string;
  port?: string;
  expiry?: string;
  source?: string;
}

export async function lookupPatente(patente: string): Promise<RegistryLookup> {
  const clean = patente.trim();
  if (!clean) return { exists: false, active: false, expired: false };
  const r = await prisma.professionalRegistry.findUnique({ where: { patente: clean } });
  if (!r) return { exists: false, active: false, expired: false };
  const expired = r.expiry ? r.expiry.getTime() < Date.now() : false;
  return {
    exists: true,
    active: r.active && !expired,
    expired,
    socialName: r.socialName,
    port: r.port ?? undefined,
    expiry: r.expiry?.toISOString(),
    source: r.source ?? undefined,
  };
}

export interface SubmitVerificationInput {
  userId: string;
  professionalType: ProfessionalType;
  agentPatente?: string;
  agentSocialName?: string;
  agentPort?: string;
  patenteDocUrl?: string;
  rfcDocUrl?: string;
  cspDocUrl?: string;
  notes?: string;
}

export async function submitVerification(input: SubmitVerificationInput): Promise<{ id: string; preApproved: boolean }> {
  // Verificar contra registry si trae patente
  let preApproved = false;
  let agentExpiry: Date | null = null;
  if (input.professionalType === 'agent_customs' && input.agentPatente) {
    const lookup = await lookupPatente(input.agentPatente);
    preApproved = lookup.exists && lookup.active && !lookup.expired;
    agentExpiry = lookup.expiry ? new Date(lookup.expiry) : null;
  }

  const existing = await prisma.userVerification.findUnique({ where: { userId: input.userId } });
  const data = {
    professionalType: input.professionalType,
    agentPatente: input.agentPatente ?? null,
    agentSocialName: input.agentSocialName ?? null,
    agentPort: input.agentPort ?? null,
    agentExpiry,
    patenteDocUrl: input.patenteDocUrl ?? null,
    rfcDocUrl: input.rfcDocUrl ?? null,
    cspDocUrl: input.cspDocUrl ?? null,
    notes: input.notes ?? null,
    status: 'submitted' as const,
    submittedAt: new Date(),
    rejectionReason: null,
  };

  const record = existing
    ? await prisma.userVerification.update({ where: { userId: input.userId }, data })
    : await prisma.userVerification.create({ data: { ...data, userId: input.userId } });

  // Notificar a SUPERADMIN
  try {
    const ops = process.env.OPERATIONS_EMAIL || 'raul@aduanai.mx';
    await sendEmail({
      to: ops,
      subject: `[ADUANAI] Nueva solicitud de verificación profesional`,
      html: `<p>Usuario <strong>${input.userId}</strong> envió documentos para verificación profesional.</p>
        <p>Tipo: ${input.professionalType}<br>
        ${input.agentPatente ? `Patente: ${input.agentPatente}<br>` : ''}
        ${input.agentSocialName ? `Razón social: ${input.agentSocialName}<br>` : ''}
        Pre-aprobación automática: ${preApproved ? '✅ sí (registry match)' : '⚠ no'}</p>
        <p>Revisa en /admin/verifications</p>`,
    });
  } catch (err) {
    logger.warn('No se pudo notificar a SUPERADMIN sobre verificación', {
      action: 'verification_notify_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  return { id: record.id, preApproved };
}

export async function approveVerification(id: string, verifiedBy: string): Promise<void> {
  const v = await prisma.userVerification.findUnique({ where: { id }, include: { user: true } });
  if (!v) throw new Error('Verification no encontrada');

  await prisma.userVerification.update({
    where: { id },
    data: {
      status: 'verified',
      verifiedAt: new Date(),
      verifiedBy,
      rejectionReason: null,
      agentVerified: v.agentPatente != null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: v.user.tenantId,
      userId: verifiedBy,
      action: 'VERIFY_PROFESSIONAL',
      entity: 'UserVerification',
      entityId: id,
      after: { status: 'verified' } as never,
      hash: '',
    },
  });

  try {
    await sendEmail({
      to: v.user.email,
      subject: '[ADUANAI] Verificación profesional aprobada',
      html: `<p>Hola ${v.user.name},</p>
        <p>Tu verificación profesional ha sido <strong>aprobada</strong>. Ya tienes acceso completo a todos los módulos según tu plan contratado.</p>
        <p>Ingresa a tu cuenta para empezar a operar.</p>`,
    });
  } catch { /* silent */ }
}

export async function rejectVerification(id: string, verifiedBy: string, reason: string): Promise<void> {
  const v = await prisma.userVerification.findUnique({ where: { id }, include: { user: true } });
  if (!v) throw new Error('Verification no encontrada');

  await prisma.userVerification.update({
    where: { id },
    data: {
      status: 'rejected',
      verifiedAt: new Date(),
      verifiedBy,
      rejectionReason: reason,
      agentVerified: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: v.user.tenantId,
      userId: verifiedBy,
      action: 'REJECT_PROFESSIONAL',
      entity: 'UserVerification',
      entityId: id,
      after: { status: 'rejected', reason } as never,
      hash: '',
    },
  });

  try {
    await sendEmail({
      to: v.user.email,
      subject: '[ADUANAI] Verificación profesional rechazada',
      html: `<p>Hola ${v.user.name},</p>
        <p>Tu verificación profesional fue <strong>rechazada</strong>.</p>
        <p><strong>Razón:</strong> ${reason}</p>
        <p>Puedes resubir tus documentos desde tu cuenta.</p>`,
    });
  } catch { /* silent */ }
}

/** Cron diario: marca como `expired` las verificaciones cuya patente expiró. */
export async function markExpiredVerifications(): Promise<number> {
  const now = new Date();
  const result = await prisma.userVerification.updateMany({
    where: {
      status: 'verified',
      agentExpiry: { lt: now, not: null },
    },
    data: { status: 'expired', agentVerified: false },
  });
  if (result.count > 0) {
    logger.warn(`${result.count} verificaciones marcadas como expiradas`, { action: 'verifications_expired' });
  }
  return result.count;
}

/** Cron semanal: notifica a usuarios con patente que expira en próximos 30 días. */
export async function notifyExpiringPatentes(): Promise<number> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const verifications = await prisma.userVerification.findMany({
    where: {
      status: 'verified',
      agentExpiry: { gte: now, lte: in30 },
    },
    include: { user: true },
  });
  let sent = 0;
  for (const v of verifications) {
    try {
      const days = Math.ceil(((v.agentExpiry?.getTime() ?? 0) - now.getTime()) / (1000 * 60 * 60 * 24));
      await sendEmail({
        to: v.user.email,
        subject: `[ADUANAI] Tu patente expira en ${days} días`,
        html: `<p>Hola ${v.user.name},</p>
          <p>Tu patente <strong>${v.agentPatente}</strong> expira el <strong>${v.agentExpiry?.toISOString().slice(0,10)}</strong> (${days} días).</p>
          <p>Renueva tu verificación profesional desde tu cuenta antes de la fecha de vencimiento para mantener acceso completo.</p>`,
      });
      sent++;
    } catch { /* silent */ }
  }
  return sent;
}
