/**
 * Verificación de Padrones SAT.
 *
 * Pipeline:
 *   1. Buscar padrones aplicables a la fracción (general + sectoriales)
 *   2. Para cada uno, leer status del tenant (active/expired/etc.)
 *   3. Decidir si bloquea la operación
 *   4. Persistir el check para reportes de exposición
 */

import { prisma } from '../lib/prisma';
import type { SATPadron, TenantPadronStatus } from '@prisma/client';

export interface PadronCheckItem {
  padronId: string;
  type: string;
  sectorialCode: string | null;
  sectorialName: string;
  description: string;
  legalBasis: string;
  authority: string;
  estimatedDays: number | null;
  status: 'active' | 'suspended' | 'expired' | 'rejected' | 'in_process' | 'not_registered';
  isActive: boolean;
  isExpiringSoon: boolean;
  expirationDate: string | null;
  isBlocking: boolean;
  daysToExpiration: number | null;
}

export interface PadronCheckResult {
  fractionCode: string;
  canOperate: boolean;
  totalRequired: number;
  required: PadronCheckItem[];
  blocking: PadronCheckItem[];
  warnings: PadronCheckItem[];
  legalConsequences: string[];
}

const EXPIRATION_WARNING_DAYS = 30;

/**
 * ¿Aplica un padrón a esta fracción?
 *  - fractionCodes: match exacto
 *  - fractionPatterns: '*' = catch-all (general); 'NN' = prefix match contra fracción normalizada
 *
 * Las fracciones se normalizan removiendo puntos para comparar prefijos
 * con números cortos (ej. '72' aplica a '7318.15.99').
 */
export function matchesFraction(padron: Pick<SATPadron, 'fractionCodes' | 'fractionPatterns'>, fractionCode: string): boolean {
  const cleaned = fractionCode.replace(/\./g, '');
  if (padron.fractionCodes.includes(fractionCode)) return true;
  for (const pattern of padron.fractionPatterns) {
    if (pattern === '*') return true;
    const cleanPattern = pattern.replace(/\./g, '').replace(/\*$/, '');
    if (cleaned.startsWith(cleanPattern)) return true;
  }
  return false;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function buildItem(padron: SATPadron, status: TenantPadronStatus | null): PadronCheckItem {
  const now = new Date();
  const expiration = status?.expirationDate ?? null;
  const daysToExp = expiration ? daysBetween(now, expiration) : null;
  const rawStatus = status?.status ?? 'not_registered';

  // Si está marcado active pero ya venció, lo tratamos como expired
  let normalized: PadronCheckItem['status'] = rawStatus as PadronCheckItem['status'];
  if (rawStatus === 'active' && expiration && expiration < now) normalized = 'expired';

  const isActive = normalized === 'active';
  const isExpiringSoon = isActive && daysToExp !== null && daysToExp <= EXPIRATION_WARNING_DAYS;

  return {
    padronId: padron.id,
    type: padron.type,
    sectorialCode: padron.sectorialCode,
    sectorialName: padron.sectorialName ?? '—',
    description: padron.description,
    legalBasis: padron.legalBasis,
    authority: padron.authority,
    estimatedDays: padron.estimatedDays,
    status: normalized,
    isActive,
    isExpiringSoon,
    expirationDate: expiration?.toISOString() ?? null,
    isBlocking: !isActive,
    daysToExpiration: daysToExp,
  };
}

const LEGAL_CONSEQUENCES = [
  'Embargo precautorio de la mercancía (Art. 151 LA).',
  'Multa del 70% al 100% del valor en aduana de la mercancía (Art. 178 fr. I LA).',
  'Suspensión temporal o definitiva del padrón general — bloqueo de futuras importaciones.',
  'Imposibilidad de despachar la mercancía por aduana hasta regularizar la inscripción.',
];

export async function checkRequiredPadrones(
  tenantId: string,
  fractionCode: string,
  context?: 'classify' | 'quote' | 'prevalidate',
  resourceId?: string,
): Promise<PadronCheckResult> {
  const allPadrones = await prisma.sATPadron.findMany({ where: { active: true } });
  const required = allPadrones.filter(p => matchesFraction(p, fractionCode));

  if (required.length === 0) {
    return {
      fractionCode,
      canOperate: true,
      totalRequired: 0,
      required: [],
      blocking: [],
      warnings: [],
      legalConsequences: [],
    };
  }

  const statuses = await prisma.tenantPadronStatus.findMany({
    where: { tenantId, padronId: { in: required.map(p => p.id) } },
  });
  const byPadronId = new Map(statuses.map(s => [s.padronId, s]));

  const items = required.map(p => buildItem(p, byPadronId.get(p.id) ?? null));
  const blocking = items.filter(i => i.isBlocking);
  const warnings = items.filter(i => i.isExpiringSoon);
  const canOperate = blocking.length === 0;

  // Persistir el check (fire-and-forget, no bloqueante)
  void prisma.padronCheck.create({
    data: {
      tenantId,
      fractionCode,
      requiredPadrones: items as unknown as object,
      canOperate,
      blockingPadrones: blocking as unknown as object,
      warningPadrones: warnings as unknown as object,
      context: context ?? null,
      resourceId: resourceId ?? null,
    },
  }).catch(() => {});

  return {
    fractionCode,
    canOperate,
    totalRequired: items.length,
    required: items,
    blocking,
    warnings,
    legalConsequences: blocking.length > 0 ? LEGAL_CONSEQUENCES : [],
  };
}

/**
 * Plantilla de carta de solicitud de inscripción al padrón.
 */
export function generateInscriptionLetter(input: {
  padron: Pick<SATPadron, 'type' | 'sectorialCode' | 'sectorialName' | 'legalBasis' | 'authority'>;
  tenant: { name: string; rfc: string | null; legalRepresentative?: string | null; address?: string | null };
}): string {
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const padronTitle = input.padron.type === 'general'
    ? 'Padrón de Importadores'
    : `Padrón Sectorial ${input.padron.sectorialCode} (${input.padron.sectorialName})`;

  return `Ciudad de México, a ${fecha}

ADMINISTRACIÓN GENERAL DE AUDITORÍA DE COMERCIO EXTERIOR (AGACE)
SERVICIO DE ADMINISTRACIÓN TRIBUTARIA
P R E S E N T E.

Por medio del presente, en mi carácter de representante legal de la
empresa "${input.tenant.name}" con Registro Federal de Contribuyentes
"${input.tenant.rfc ?? '[RFC PENDIENTE]'}", manifiesto bajo protesta de decir
verdad que cumplimos con la totalidad de los requisitos previstos en
el ${input.padron.legalBasis} y demás disposiciones aplicables, por lo
que respetuosamente solicito la inscripción de mi representada en el
${padronTitle}.

Para tal efecto, se acompaña al presente la siguiente documentación:
  · Acta constitutiva y poderes vigentes (e.firma vigente).
  · Constancia de situación fiscal con opinión positiva de cumplimiento.
  · Comprobante de domicilio fiscal con antigüedad no mayor a 90 días.
  · Documentación específica del sector solicitado (cuando aplique).
  · Manifestación bajo protesta de decir verdad sobre el origen lícito
    de los recursos y la veracidad de la información proporcionada.

Sin otro particular, agradezco la atención que se sirva brindar al
presente, quedando a sus órdenes para cualquier requerimiento adicional
que se considere necesario.

A T E N T A M E N T E,

_________________________________________
${input.tenant.legalRepresentative ?? '[NOMBRE DEL REPRESENTANTE LEGAL]'}
Representante Legal
${input.tenant.name}
RFC: ${input.tenant.rfc ?? '[PENDIENTE]'}
${input.tenant.address ?? '[DOMICILIO FISCAL]'}

──────────────────────────────────────────────────────────────────
Trámite: ${input.padron.type === 'general' ? '5/LA' : `${input.padron.sectorialCode}/LA`}
Autoridad receptora: ${input.padron.authority}
Fundamento: ${input.padron.legalBasis}
──────────────────────────────────────────────────────────────────`;
}
