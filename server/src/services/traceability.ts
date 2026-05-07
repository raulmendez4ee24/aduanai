/**
 * Trazabilidad versional — registra cada consulta IA contra versiones normativas
 * activas para que un auditor SAT pueda reconstruir y verificar la operación.
 *
 * Pipeline:
 *   inputs → SHA-256 → inputHash
 *   outputs → SHA-256 → outputHash
 *   knowledgeUsed → SHA-256 → knowledgeBaseHash
 *   consultHash = SHA-256(inputHash + outputHash + tigie + ligie + kbHash + model + ts)
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Canonicaliza un objeto a JSON estable (keys ordenadas) para que el hash
 * sea reproducible independientemente del orden de inserción.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

export function hashInputs(inputs: unknown): string {
  return sha256(canonicalize(inputs));
}

export function hashOutputs(outputs: unknown): string {
  return sha256(canonicalize(outputs));
}

export interface KnowledgeUsedItem {
  id: string;
  title: string;
  type: string;
  fractionCode: string | null;
}

export function hashKnowledgeBase(items: KnowledgeUsedItem[]): string {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return sha256(sorted.map(i => `${i.id}|${i.title}`).join('||'));
}

export interface ActiveVersions {
  tigie: string;
  ligie: string;
  rgce: string | null;
  acuerdoNoms: string | null;
  tmec: string | null;
}

export async function getActiveVersions(): Promise<ActiveVersions> {
  const rows = await prisma.versionSnapshot.findMany({
    where: { active: true },
    select: { type: true, version: true, effectiveDate: true },
  });
  const byType = new Map<string, string>();
  for (const r of rows) {
    // Si hay varias activas para el mismo tipo, prefiere la más reciente
    const existing = byType.get(r.type);
    if (!existing) byType.set(r.type, r.version);
    else {
      const existingRow = rows.find(x => x.type === r.type && x.version === existing);
      if (existingRow && r.effectiveDate > existingRow.effectiveDate) byType.set(r.type, r.version);
    }
  }
  return {
    tigie: byType.get('TIGIE') ?? 'unknown',
    ligie: byType.get('LIGIE') ?? 'unknown',
    rgce: byType.get('RGCE') ?? null,
    acuerdoNoms: byType.get('ACUERDO_NOMs') ?? null,
    tmec: byType.get('TMEC') ?? null,
  };
}

export interface RecordConsultInput {
  classificationId?: string;
  tenantId?: string;
  userId?: string;
  inputs: unknown;            // payload original del usuario
  outputs: unknown;           // resultado completo del clasificador
  modelUsed: string;          // ej "claude-sonnet-4-20250514"
  modelProvider: string;      // "anthropic" | "gemini"
  knowledgeUsed: KnowledgeUsedItem[];
}

export interface RecordConsultResult {
  consultHash: string;
  inputHash: string;
  outputHash: string;
  knowledgeBaseHash: string;
  versions: ActiveVersions;
  consultedAt: Date;
  id: string;
}

export async function recordConsult(input: RecordConsultInput): Promise<RecordConsultResult> {
  const versions = await getActiveVersions();
  const inputHash = hashInputs(input.inputs);
  const outputHash = hashOutputs(input.outputs);
  const knowledgeBaseHash = hashKnowledgeBase(input.knowledgeUsed);
  const consultedAt = new Date();

  const consultHash = sha256(
    [
      inputHash,
      outputHash,
      versions.tigie,
      versions.ligie,
      knowledgeBaseHash,
      input.modelUsed,
      consultedAt.toISOString(),
    ].join('|'),
  );

  const created = await prisma.classificationConsult.create({
    data: {
      classificationId: input.classificationId,
      tenantId: input.tenantId,
      userId: input.userId,
      inputHash,
      inputs: input.inputs as never,
      outputHash,
      outputs: input.outputs as never,
      tigieVersion: versions.tigie,
      ligieVersion: versions.ligie,
      rgceVersion: versions.rgce,
      acuerdoNomsVersion: versions.acuerdoNoms,
      tmecVersion: versions.tmec,
      knowledgeBaseHash,
      knowledgeUsed: input.knowledgeUsed as never,
      modelUsed: input.modelUsed,
      modelProvider: input.modelProvider,
      consultHash,
      consultedAt,
    },
  });

  return {
    id: created.id,
    consultHash,
    inputHash,
    outputHash,
    knowledgeBaseHash,
    versions,
    consultedAt,
  };
}

export interface VerifyConsultResult {
  found: boolean;
  consultedAt?: string;
  versions?: {
    tigie: string;
    ligie: string;
    rgce: string | null;
    acuerdoNoms: string | null;
    tmec: string | null;
  };
  inputHash?: string;
  outputHash?: string;
  knowledgeBaseHash?: string;
  modelUsed?: string;
  modelProvider?: string;
  /** No revela contenido específico del cliente — solo metadatos verificables. */
  tenantName?: string | null;
  tenantRFC?: string | null;
  fractionCode?: string | null; // si está vinculado a Classification
}

export async function verifyConsult(consultHash: string): Promise<VerifyConsultResult> {
  if (!/^[a-f0-9]{64}$/i.test(consultHash)) return { found: false };
  const c = await prisma.classificationConsult.findUnique({
    where: { consultHash },
  });
  if (!c) return { found: false };

  let tenantName: string | null = null;
  let tenantRFC: string | null = null;
  let fractionCode: string | null = null;

  if (c.tenantId) {
    const t = await prisma.tenant.findUnique({
      where: { id: c.tenantId },
      select: { name: true, rfc: true },
    });
    tenantName = t?.name ?? null;
    tenantRFC = t?.rfc ?? null;
  }
  if (c.classificationId) {
    const cl = await prisma.classification.findUnique({
      where: { id: c.classificationId },
      select: { fractionCode: true },
    });
    fractionCode = cl?.fractionCode ?? null;
  }

  return {
    found: true,
    consultedAt: c.consultedAt.toISOString(),
    versions: {
      tigie: c.tigieVersion,
      ligie: c.ligieVersion,
      rgce: c.rgceVersion,
      acuerdoNoms: c.acuerdoNomsVersion,
      tmec: c.tmecVersion,
    },
    inputHash: c.inputHash,
    outputHash: c.outputHash,
    knowledgeBaseHash: c.knowledgeBaseHash,
    modelUsed: c.modelUsed,
    modelProvider: c.modelProvider,
    tenantName,
    tenantRFC,
    fractionCode,
  };
}
