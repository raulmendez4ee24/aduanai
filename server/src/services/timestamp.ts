/**
 * Servicio de anclaje a Bitcoin via OpenTimestamps.
 *
 * Pipeline:
 *   1. anchorContent(type, id, content) → submit hash al calendar OTS
 *   2. Cron horario revisa pendientes — pide upgrade al calendar
 *   3. Cuando el upgrade trae attestation Bitcoin, marca como confirmed
 *   4. Endpoint público GET /verify/timestamp/:hash devuelve estado y permite
 *      descarga del .ots para verificación independiente
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  submitToCalendar,
  upgradeFromCalendar,
  parseProof,
  estimateBitcoinTimestamp,
} from '../lib/opentimestamps';

export type ResourceType = 'audit_log' | 'classification' | 'quote' | 'pedimento' | 'certificate' | 'consult' | 'custom';

const CRITICAL_AUDIT_ACTIONS = new Set([
  'CLASSIFICATION_CREATE',
  'QUOTE_CREATE',
  'PEDIMENTO_VALIDATE',
  'CERTIFICATE_ISSUE',
  'EXPORT_DICTAMEN',
  'VERIFY_PROFESSIONAL',
  'REJECT_PROFESSIONAL',
]);

export function shouldAnchor(action: string): boolean {
  return CRITICAL_AUDIT_ACTIONS.has(action);
}

const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

export interface AnchorResult {
  proofId: string;
  contentHash: string;
  status: string;
}

/**
 * Ancla un contenido al blockchain Bitcoin via OpenTimestamps.
 * No bloquea — si el calendar falla, marca como `failed` y se reintenta.
 */
export async function anchorContent(resourceType: ResourceType, resourceId: string, content: string): Promise<AnchorResult> {
  const contentHash = sha256(content);

  // Si ya existe un proof confirmado para este hash, devolverlo
  const existing = await prisma.timestampProof.findFirst({
    where: { contentHash, status: { in: ['confirmed', 'verified'] } },
    select: { id: true, status: true },
  });
  if (existing) return { proofId: existing.id, contentHash, status: existing.status };

  try {
    const { proof, calendarUrl } = await submitToCalendar(contentHash);
    const created = await prisma.timestampProof.create({
      data: {
        resourceType, resourceId, contentHash,
        otsProof: new Uint8Array(proof),
        otsProofHex: proof.toString('hex'),
        status: 'submitted',
        calendarUrl,
      },
    });
    logger.info(`Hash anclado a OpenTimestamps (${resourceType}/${resourceId})`, {
      action: 'ots_submitted',
      metadata: { proofId: created.id, contentHash, calendarUrl },
    });
    return { proofId: created.id, contentHash, status: 'submitted' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const failed = await prisma.timestampProof.create({
      data: {
        resourceType, resourceId, contentHash,
        otsProof: new Uint8Array(0),
        status: 'failed',
        errorMessage: msg,
      },
    });
    logger.warn(`Falló submit a OpenTimestamps (${resourceType}/${resourceId})`, {
      action: 'ots_submit_failed', errorMessage: msg, metadata: { proofId: failed.id, contentHash },
    });
    return { proofId: failed.id, contentHash, status: 'failed' };
  }
}

/**
 * Cron horario: revisa proofs `submitted` y `failed` y los upgradea.
 * Cuando el upgrade trae Bitcoin attestation, marca como `confirmed`.
 */
export async function checkPendingTimestamps(): Promise<{ checked: number; confirmed: number; reSubmitted: number }> {
  const pending = await prisma.timestampProof.findMany({
    where: { status: { in: ['submitted', 'failed'] } },
    orderBy: { submittedAt: 'asc' },
    take: 200,
  });
  let confirmed = 0;
  let reSubmitted = 0;

  for (const p of pending) {
    try {
      // Si fue 'failed' por timeout, reintenta submit
      if (p.status === 'failed') {
        try {
          const { proof, calendarUrl } = await submitToCalendar(p.contentHash);
          await prisma.timestampProof.update({
            where: { id: p.id },
            data: {
              otsProof: new Uint8Array(proof), otsProofHex: proof.toString('hex'),
              status: 'submitted', calendarUrl: calendarUrl ?? null, errorMessage: null,
              lastCheckedAt: new Date(),
            },
          });
          reSubmitted++;
        } catch {
          await prisma.timestampProof.update({
            where: { id: p.id },
            data: { lastCheckedAt: new Date() },
          });
        }
        continue;
      }

      // status='submitted' → intentar upgrade
      const upgraded = await upgradeFromCalendar(p.contentHash, p.calendarUrl ?? undefined);
      if (!upgraded) {
        await prisma.timestampProof.update({
          where: { id: p.id },
          data: { lastCheckedAt: new Date() },
        });
        continue;
      }

      const parsed = parseProof(upgraded);
      if (parsed.hasBitcoinAttestation && parsed.bitcoinBlockHeight) {
        const bitcoinTimestamp = estimateBitcoinTimestamp(parsed.bitcoinBlockHeight);
        await prisma.timestampProof.update({
          where: { id: p.id },
          data: {
            otsProof: new Uint8Array(upgraded),
            otsProofHex: upgraded.toString('hex'),
            status: 'confirmed',
            bitcoinBlock: parsed.bitcoinBlockHeight,
            bitcoinTimestamp,
            confirmedAt: new Date(),
            lastCheckedAt: new Date(),
          },
        });
        confirmed++;
        logger.info(`Timestamp confirmado en Bitcoin block ${parsed.bitcoinBlockHeight}`, {
          action: 'ots_confirmed',
          metadata: { proofId: p.id, contentHash: p.contentHash, block: parsed.bitcoinBlockHeight },
        });
      } else {
        // proof actualizado pero todavía no confirmado en Bitcoin
        await prisma.timestampProof.update({
          where: { id: p.id },
          data: {
            otsProof: new Uint8Array(upgraded),
            otsProofHex: upgraded.toString('hex'),
            lastCheckedAt: new Date(),
          },
        });
      }
    } catch (err) {
      logger.warn(`Error checking timestamp ${p.id}`, {
        action: 'ots_check_error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { checked: pending.length, confirmed, reSubmitted };
}

export interface VerifyTimestampResult {
  found: boolean;
  contentHash: string;
  status?: string;
  resourceType?: string;
  bitcoinBlock?: number | null;
  bitcoinTimestamp?: string | null;
  submittedAt?: string;
  confirmedAt?: string | null;
  proofSizeBytes?: number;
  calendarUrl?: string | null;
  verificationCount?: number;
}

export async function verifyTimestamp(contentHash: string): Promise<VerifyTimestampResult> {
  if (!/^[0-9a-fA-F]{64}$/.test(contentHash)) return { found: false, contentHash };
  const p = await prisma.timestampProof.findFirst({
    where: { contentHash },
    orderBy: { submittedAt: 'desc' },
  });
  if (!p) return { found: false, contentHash };

  // Incrementar contador de verificación
  await prisma.timestampProof.update({
    where: { id: p.id },
    data: { verificationCount: { increment: 1 }, lastVerifiedAt: new Date() },
  });

  return {
    found: true,
    contentHash: p.contentHash,
    status: p.status,
    resourceType: p.resourceType,
    bitcoinBlock: p.bitcoinBlock,
    bitcoinTimestamp: p.bitcoinTimestamp?.toISOString() ?? null,
    submittedAt: p.submittedAt.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    proofSizeBytes: p.otsProof?.length ?? 0,
    calendarUrl: p.calendarUrl,
    verificationCount: p.verificationCount + 1,
  };
}

export async function getProofBytes(contentHash: string): Promise<Buffer | null> {
  const p = await prisma.timestampProof.findFirst({
    where: { contentHash },
    orderBy: { submittedAt: 'desc' },
    select: { otsProof: true },
  });
  return p?.otsProof ? Buffer.from(p.otsProof) : null;
}
