/**
 * Lookup de cuotas compensatorias y regulaciones por fracción.
 *
 * - Cuotas compensatorias: match exacto fracción + país (normalizado a ISO-2).
 * - Regulaciones: match `exact` por fracción de 8 dígitos, o `prefix` por
 *   capítulo (2), partida (4), subpartida (6) o fracción (8).
 */

import { prisma } from '../lib/prisma';
import { isDomesticOrigin, DOMESTIC_ORIGIN_NOTE } from '../lib/origin';

// ──────────────────────────────────────────────────────────────────────────
// Normalización de país a ISO-2
// ──────────────────────────────────────────────────────────────────────────

const COUNTRY_ALIASES: Record<string, string> = {
  // China
  'china': 'CN', 'cn': 'CN', 'chn': 'CN', 'república popular china': 'CN', 'republica popular china': 'CN', 'prc': 'CN',
  // Estados Unidos
  'estados unidos': 'US', 'us': 'US', 'usa': 'US', 'eua': 'US', 'eeuu': 'US', 'united states': 'US',
  // Canadá
  'canadá': 'CA', 'canada': 'CA', 'ca': 'CA', 'can': 'CA',
  // Unión Europea principales
  'alemania': 'DE', 'germany': 'DE', 'de': 'DE', 'deu': 'DE',
  'francia': 'FR', 'france': 'FR', 'fr': 'FR', 'fra': 'FR',
  'italia': 'IT', 'italy': 'IT', 'it': 'IT', 'ita': 'IT',
  'españa': 'ES', 'spain': 'ES', 'es': 'ES', 'esp': 'ES',
  'países bajos': 'NL', 'paises bajos': 'NL', 'nl': 'NL', 'holanda': 'NL', 'netherlands': 'NL',
  // Asia
  'japón': 'JP', 'japon': 'JP', 'japan': 'JP', 'jp': 'JP', 'jpn': 'JP',
  'corea': 'KR', 'corea del sur': 'KR', 'kr': 'KR', 'kor': 'KR', 'south korea': 'KR',
  'india': 'IN', 'in': 'IN', 'ind': 'IN',
  'vietnam': 'VN', 'vn': 'VN', 'vnm': 'VN',
  'tailandia': 'TH', 'thailand': 'TH', 'th': 'TH',
  'taiwán': 'TW', 'taiwan': 'TW', 'tw': 'TW',
  // Latam
  'brasil': 'BR', 'brazil': 'BR', 'br': 'BR', 'bra': 'BR',
  'argentina': 'AR', 'ar': 'AR', 'arg': 'AR',
  'chile': 'CL', 'cl': 'CL', 'chl': 'CL',
};

export function normalizeCountry(input: string): string {
  if (!input) return '';
  const key = input.trim().toLowerCase();
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  // Si ya luce como ISO-2 dejarlo como está
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  // Si luce como ISO-3 truncar
  if (/^[a-z]{3}$/.test(key)) return key.toUpperCase();
  return input.toUpperCase();
}

// ──────────────────────────────────────────────────────────────────────────
// Tipos del resultado
// ──────────────────────────────────────────────────────────────────────────

export interface AntidumpingMatch {
  rate: number;
  rateType: 'percentage' | 'specific_USD_kg' | 'specific_USD_unit';
  rateUnit: string;
  resolutionType: string;
  resolutionNumber: string | null;
  expedienteUPCI: string | null;
  productDesc: string | null;
  /** @deprecated usar resolutionType; mantenido para compat */
  type: string;
  decree: string | null;
  dofUrl: string | null;
  country: string;
  countryNormalized: string;
  publishDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  // Si la cuota se aplicó por prefix-match (subpartida o partida), no
  // por fracción exacta. UI debe mostrar warning para validar manualmente.
  matchType?: 'exact' | 'subheading' | 'heading';
  matchedFraction?: string;
}

export interface RegulationMatch {
  type: 'NOM' | 'RRNA' | 'padron_sectorial' | 'permiso_previo';
  authority: string;
  code: string;
  description: string;
  required: boolean;
}

export interface ComplianceLookupResult {
  fractionCode: string;
  country: string;
  antidumping: AntidumpingMatch | null;
  regulations: RegulationMatch[];
  alertas: string[];
  /** true si el origen declarado es México → no aplican requisitos de importación. */
  domesticOrigin: boolean;
}

/**
 * Falla explícita de compliance — se lanza cuando el DB no puede responder.
 * Distinta de "no hay cuota": un `antidumping: null` legítimo significa que
 * no existe cuota para esa fracción+país, mientras que este error significa
 * "no pude verificar". El handler de ruta debe responder 5xx y NUNCA dejar
 * cotizar sin cuota silenciosamente (eso reintroduciría el bug fiscal de
 * cotizar de menos cuando sí aplica cuota compensatoria).
 */
export class ComplianceLookupError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ComplianceLookupError';
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup principal — fail closed: si la BD falla, lanza ComplianceLookupError
// en vez de devolver null. El caller NO puede asumir "sin cuota" por error.
// ──────────────────────────────────────────────────────────────────────────

export async function lookupCompliance(
  fractionCode: string,
  country: string,
): Promise<ComplianceLookupResult> {
  try {
    return await lookupComplianceInternal(fractionCode, country);
  } catch (err) {
    console.error('[compliance-lookup] fail closed:', { fractionCode, country, err });
    throw new ComplianceLookupError(
      `No se pudo verificar cuotas compensatorias para fracción=${fractionCode} país=${country}. ` +
      `La cotización NO procede sin verificación (fail-closed para evitar declarar pedimento ` +
      `con cuota=0 cuando puede aplicar cuota real). Reintenta o contacta soporte.`,
      err,
    );
  }
}

async function lookupComplianceInternal(
  fractionCode: string,
  country: string,
): Promise<ComplianceLookupResult> {
  const cleanFraction = fractionCode.replace(/[^0-9]/g, '');
  const countryNorm = normalizeCountry(country);
  // Origen nacional (México): no se importa → no aplican cuota compensatoria,
  // padrón de importadores, permisos de importación ni certificado de origen.
  const domestic = isDomesticOrigin(country) || isDomesticOrigin(countryNorm);

  // 1) Cuota compensatoria — SOLO match EXACTO de fracción + país.
  // NUNCA por prefijo (subpartida/partida): atribuir la cuota de una fracción
  // hermana sería mostrar una medida que no aplica a esta fracción = inventar
  // una cuota. Si no existe fila exacta → no hay cuota. Cero. Sin estimar.
  // Una cuota antidumping JAMÁS aplica a mercancía mexicana (grava importaciones).
  let ad: Awaited<ReturnType<typeof prisma.antidumpingDuty.findFirst>> | null = null;
  if (countryNorm && !domestic) {
    ad = await prisma.antidumpingDuty.findFirst({
      where: { fractionCode: cleanFraction, countryOfOrigin: countryNorm, active: true },
    });
  }

  // 2) Regulaciones — todas las exact + cualquier prefix que matchee
  // Generar prefijos: 2, 4, 6, 8 dígitos
  const prefixes = [
    cleanFraction.slice(0, 2),
    cleanFraction.slice(0, 4),
    cleanFraction.slice(0, 6),
    cleanFraction,
  ].filter(p => p.length >= 2);

  const regsRaw = await prisma.fractionRegulation.findMany({
    where: {
      active: true,
      OR: [
        { matchType: 'exact', fractionCode: cleanFraction },
        { matchType: 'prefix', fractionCode: { in: prefixes } },
      ],
    },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });

  // Dedup por code + authority (por si NOM aparece en varios prefijos)
  const seen = new Set<string>();
  const regulations: RegulationMatch[] = [];
  for (const r of regsRaw) {
    const k = `${r.type}|${r.authority}|${r.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    regulations.push({
      type: r.type as RegulationMatch['type'],
      authority: r.authority,
      code: r.code,
      description: r.description,
      required: r.required,
    });
  }

  // Origen nacional: descarta regulaciones que SOLO aplican a importación
  // (padrón de importadores, RRNA / permisos previos de importación). Las NOM se
  // conservan porque también aplican al producto en comercio nacional (etiquetado).
  const effectiveRegs = domestic ? regulations.filter(r => r.type === 'NOM') : regulations;

  // 3) Alertas accionables
  const alertas: string[] = [];
  if (domestic) {
    alertas.push(DOMESTIC_ORIGIN_NOTE);
  }
  if (ad) {
    const dateStr = ad.publishDate ? ad.publishDate.toISOString().slice(0, 10) : 'fecha s/d';
    const rateLabel = ad.rateType === 'specific_USD_kg' ? `$${ad.rate} USD/kg`
      : ad.rateType === 'specific_USD_unit' ? `$${ad.rate} ${ad.rateUnit}`
      : `${ad.rate}%`;
    const resLabel = ad.resolutionNumber ?? ad.decree ?? 's/n';
    alertas.push(`Cuota compensatoria ${rateLabel} aplicable a ${ad.countryOfOrigin} — ${resLabel} (${dateStr})`);
  }
  const padron = effectiveRegs.find(r => r.type === 'padron_sectorial');
  if (padron) {
    alertas.push(`Esta fracción requiere inscripción al ${padron.code}`);
  }
  const noms = effectiveRegs.filter(r => r.type === 'NOM');
  if (noms.length > 0) {
    alertas.push(`${noms.length} NOM(s) aplicable(s) — verifica etiquetado/prueba de cumplimiento antes del despacho`);
  }
  const rrna = effectiveRegs.filter(r => r.type === 'RRNA');
  if (rrna.length > 0) {
    alertas.push(`Requiere ${rrna.length} regulación(es) no arancelaria(s) (avisos / autorizaciones)`);
  }

  return {
    fractionCode: cleanFraction,
    country: countryNorm,
    domesticOrigin: domestic,
    antidumping: ad
      ? {
          rate: ad.rate,
          rateType: (ad.rateType as AntidumpingMatch['rateType']) ?? 'percentage',
          rateUnit: ad.rateUnit ?? '%',
          resolutionType: ad.resolutionType,
          resolutionNumber: ad.resolutionNumber ?? null,
          expedienteUPCI: ad.expedienteUPCI ?? null,
          productDesc: ad.productDesc ?? null,
          type: ad.resolutionType,
          decree: ad.decree,
          dofUrl: ad.dofUrl ?? null,
          country: country,
          countryNormalized: ad.countryOfOrigin,
          publishDate: ad.publishDate?.toISOString() ?? null,
          effectiveDate: ad.effectiveDate?.toISOString() ?? null,
          expiryDate: ad.expiryDate?.toISOString() ?? null,
          notes: ad.notes,
          matchType: 'exact',
          matchedFraction: ad.fractionCode,
        }
      : null,
    regulations: effectiveRegs,
    alertas,
  };
}
