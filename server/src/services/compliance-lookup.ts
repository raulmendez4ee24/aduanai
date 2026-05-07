/**
 * Lookup de cuotas compensatorias y regulaciones por fracción.
 *
 * - Cuotas compensatorias: match exacto fracción + país (normalizado a ISO-2).
 * - Regulaciones: match `exact` por fracción de 8 dígitos, o `prefix` por
 *   capítulo (2), partida (4), subpartida (6) o fracción (8).
 */

import { prisma } from '../lib/prisma';

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
  type: string;
  decree: string | null;
  country: string;
  countryNormalized: string;
  publishDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  notes: string | null;
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
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup principal
// ──────────────────────────────────────────────────────────────────────────

export async function lookupCompliance(
  fractionCode: string,
  country: string,
): Promise<ComplianceLookupResult> {
  const cleanFraction = fractionCode.replace(/[^0-9]/g, '');
  const countryNorm = normalizeCountry(country);

  // 1) Cuota compensatoria — exact match fracción + país
  const ad = countryNorm
    ? await prisma.antidumpingDuty.findFirst({
        where: {
          fractionCode: cleanFraction,
          countryOfOrigin: countryNorm,
          active: true,
        },
      })
    : null;

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

  // 3) Alertas accionables
  const alertas: string[] = [];
  if (ad) {
    const dateStr = ad.publishDate ? ad.publishDate.toISOString().slice(0, 10) : 'fecha s/d';
    alertas.push(`Cuota compensatoria ${ad.rate}% aplicable a ${ad.countryOfOrigin} — Decreto ${ad.decree ?? 's/n'} (${dateStr})`);
  }
  const padron = regulations.find(r => r.type === 'padron_sectorial');
  if (padron) {
    alertas.push(`Esta fracción requiere inscripción al ${padron.code}`);
  }
  const noms = regulations.filter(r => r.type === 'NOM');
  if (noms.length > 0) {
    alertas.push(`${noms.length} NOM(s) aplicable(s) — verifica etiquetado/prueba de cumplimiento antes del despacho`);
  }
  const rrna = regulations.filter(r => r.type === 'RRNA');
  if (rrna.length > 0) {
    alertas.push(`Requiere ${rrna.length} regulación(es) no arancelaria(s) (avisos / autorizaciones)`);
  }

  return {
    fractionCode: cleanFraction,
    country: countryNorm,
    antidumping: ad
      ? {
          rate: ad.rate,
          type: ad.resolutionType,
          decree: ad.decree,
          country: country,
          countryNormalized: ad.countryOfOrigin,
          publishDate: ad.publishDate?.toISOString() ?? null,
          effectiveDate: ad.effectiveDate?.toISOString() ?? null,
          expiryDate: ad.expiryDate?.toISOString() ?? null,
          notes: ad.notes,
        }
      : null,
    regulations,
    alertas,
  };
}
