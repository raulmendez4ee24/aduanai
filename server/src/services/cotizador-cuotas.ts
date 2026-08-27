/**
 * Cuota compensatoria AUTOMÁTICA para el cotizador (Ola 2).
 *
 * Usa el servicio existente `services/antidumping.ts` tal cual
 * (`checkAntidumpingDuty` = match EXACTO fracción+país, vigente y activa;
 * `resolverTasaPorExportador` = tasa por empresa si la resolución trae
 * `exportadorTasas` y el usuario capturó exportador, si no la general).
 * Aquí solo se orquesta: elegir la resolución, resolver la tasa, leer la
 * marca `esAntielusion` (no la expone el servicio) y devolver un objeto
 * compatible con `resolveCuotaCompensatoria` (quoter.ts).
 */
import { prisma } from '../lib/prisma';
import { checkAntidumpingDuty, resolverTasaPorExportador, type AntidumpingCheckResult, type TasaResuelta } from './antidumping';
import type { AntidumpingMatch } from './compliance-lookup';

export interface CuotaAutomatica {
  /** Objeto listo para `resolveCuotaCompensatoria` con la tasa ya resuelta. */
  match: AntidumpingMatch;
  tasa: TasaResuelta;
  esAntielusion: boolean;
  examenSunsetFecha: string | null;
  exportadorCapturado: string | null;
  /** Cuántas resoluciones vigentes coincidieron (si >1 se toma la más reciente y se avisa). */
  coincidencias: number;
  advertencias: string[];
  /** Vigencia legible para el PDF: "vigente desde … hasta …". */
  vigencia: string;
}

function fecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : 's/f';
}

/** Puro: arma el resultado a partir de una resolución ya elegida. Testeable sin DB. */
export function armarCuotaAutomatica(
  r: AntidumpingCheckResult,
  opts: { exportador?: string | null; esAntielusion?: boolean; examenSunsetFecha?: string | null; coincidencias?: number },
): CuotaAutomatica {
  const tasa = resolverTasaPorExportador(
    { rate: r.duty.rate, rateUnit: r.duty.rateUnit, exportadorTasas: r.duty.exportadorTasas, specificProducer: r.duty.specificProducer },
    opts.exportador ?? null,
  );
  const advertencias: string[] = [];
  const res = r.duty.resolutionNumber ?? 's/n';
  if (opts.esAntielusion) {
    advertencias.push(`⚠️ ANTIELUSIÓN: la resolución ${res} es una medida contra elusión de cuotas — aplica aunque la mercancía llegue por triangulación o con modificaciones menores. Revisa origen real y exportador.`);
  }
  if (tasa.origen === 'exportador') {
    advertencias.push(`Cuota por exportador: ${tasa.empresa} → ${tasa.tasa} ${tasa.rateUnit} (${res}).`);
  } else if (tasa.origen === 'general') {
    if (tasa.aviso) advertencias.push(tasa.aviso);
    else advertencias.push(opts.exportador
      ? `Exportador "${opts.exportador}" no está en la lista de tasas por empresa de ${res}: se aplica la tasa general ${tasa.tasa} ${tasa.rateUnit}.`
      : `${res} trae tasas por exportador/productor: captura el exportador para aplicar la tasa específica; se aplica la general ${tasa.tasa} ${tasa.rateUnit}.`);
  }
  if (r.expiringSoon && r.daysToExpiry != null) {
    advertencias.push(`La cuota ${res} vence en ${r.daysToExpiry} días (${fecha(r.duty.expiryDate)}) — confirma examen de vigencia.`);
  }
  if ((opts.coincidencias ?? 1) > 1) {
    advertencias.push(`${opts.coincidencias} resoluciones vigentes coinciden con fracción+país; se aplica la más reciente (${res}). Revisa manualmente.`);
  }
  const match: AntidumpingMatch = {
    rate: tasa.tasa,
    rateType: (r.duty.rateType as AntidumpingMatch['rateType']) ?? 'percentage',
    rateUnit: tasa.rateUnit,
    resolutionType: r.duty.resolutionType,
    resolutionNumber: r.duty.resolutionNumber,
    expedienteUPCI: r.duty.expedienteUPCI,
    productDesc: r.duty.productDesc,
    type: r.duty.resolutionType,
    decree: r.duty.resolutionNumber,
    dofUrl: r.duty.dofUrl,
    country: r.duty.countryOfOrigin,
    countryNormalized: r.duty.countryOfOrigin,
    publishDate: r.duty.publishDateDOF,
    effectiveDate: r.duty.effectiveDate,
    expiryDate: r.duty.expiryDate,
    notes: r.duty.notes,
    matchType: r.matchType,
    matchedFraction: r.matchedFraction,
  };
  return {
    match,
    tasa,
    esAntielusion: !!opts.esAntielusion,
    examenSunsetFecha: opts.examenSunsetFecha ?? null,
    exportadorCapturado: opts.exportador ?? null,
    coincidencias: opts.coincidencias ?? 1,
    advertencias,
    vigencia: `${r.duty.resolutionType} · vigente desde ${fecha(r.duty.effectiveDate)}${r.duty.expiryDate ? ` hasta ${fecha(r.duty.expiryDate)}` : ' (sin fecha de término cargada)'}${opts.examenSunsetFecha ? ` · examen de vigencia ${fecha(opts.examenSunsetFecha)}` : ''}`,
  };
}

/** Detecta y resuelve la cuota para fracción + país (+ exportador). null = sin cuota vigente. */
export async function resolverCuotaAutomatica(input: {
  fractionCode: string;
  countryOfOrigin: string;
  exportador?: string | null;
}): Promise<CuotaAutomatica | null> {
  const resultados = await checkAntidumpingDuty({ fractionCode: input.fractionCode, countryOfOrigin: input.countryOfOrigin });
  if (resultados.length === 0) return null;
  const elegido = resultados[0]!; // orderBy publishDateDOF desc en el servicio
  const extra = await prisma.antidumpingDuty.findUnique({
    where: { id: elegido.duty.id },
    select: { esAntielusion: true, examenSunsetFecha: true },
  });
  return armarCuotaAutomatica(elegido, {
    exportador: input.exportador ?? null,
    esAntielusion: extra?.esAntielusion ?? false,
    examenSunsetFecha: extra?.examenSunsetFecha?.toISOString() ?? null,
    coincidencias: resultados.length,
  });
}
