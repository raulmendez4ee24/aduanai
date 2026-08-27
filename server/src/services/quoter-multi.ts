/**
 * Cotizador multi-partida.
 *
 * Cada partida calcula sus contribuciones independientemente (Anexo 22),
 * y el quote total suma valor + impuestos + costos de despacho aduanero.
 *
 * Reusa `computeQuoteAmounts` para preservar la matemática validada
 * por el evaluador.
 */

import { prisma } from '../lib/prisma';
import {
  preferenciaAplicable,
  TLCUEM_COUNTRIES,
  TLCUEM_VIGENCIA,
  TMEC_PAISES,
  tlcuemNota,
} from '../lib/treaties';
import { getOfficialRate, getHistoricalRateInfo, getMonthlyAverageRateInfo } from './exchange-rate';
import { computeQuoteAmounts, requireQuotableFraction, resolveCuotaCompensatoria } from './quoter';
import { lookupCompliance } from './compliance-lookup';
import { validateDeclaredPrice, type PriceCheckResult } from './price-validator';
import { checkPROSEC, checkRegla8va, calculateISAN } from './regimes-programs';
import { resolverIEPS } from './cotizador-ieps';
import { resolverCuotaAutomatica } from './cotizador-cuotas';
import { resolverDTAConCorpus } from './cotizador-dta';
import { entradaDTA, type DTAResuelto, type TipoOperacionDTA } from '../lib/dta';
import { calcularHonorarios, type ReglaHonorarios } from './tabulador-honorarios';

export interface MultiQuoteItemInput {
  fractionCode: string;
  description?: string;
  countryOfOrigin: string;
  quantity: number;
  unit?: string;
  /** Peso bruto en kg — requerido cuando aplica cuota compensatoria
   * tipo specific_USD_kg (ej. RES-29/2024 tornillos $2.07/kg). Si no se
   * provee, el quoter cae a quantity asumiendo unit en kg. */
  weightKg?: number;
  unitValueUSD: number;
  freightUSD?: number;
  insuranceUSD?: number;
  /** Override de IGI por partida (si no se confía en la fracción de la DB) */
  igiRateOverride?: number;
  /** Aplicar tratado preferencial (TMEC, TLCUEM, CPTPP) */
  applyTreaty?: 'TMEC' | 'TLCUEM' | 'CPTPP';
  /** ¿El importador tiene certificado de origen vigente? */
  hasCertificadoOrigen?: boolean;
  /** Aplicar PROSEC (requiere registro vigente ante SE) */
  applyPROSEC?: boolean;
  /** Aplicar Regla 8va — parte importada para producto terminado */
  applyRegla8va?: boolean;
  regla8vaParentFraction?: string;
  /** Vehículo nuevo — calcula ISAN */
  isVehicle?: boolean;
  vehiclePriceMXN?: number;
  isElectric?: boolean;
  /** Ola 2: exportador/productor — habilita la tasa por empresa de la cuota compensatoria. */
  exportador?: string;
}

export interface DispatchCosts {
  honorariosAgente?: number;
  prevalidacion?: number;
  almacenaje?: number;
  estiba?: number;
  fleteInterno?: number;
  otrosGastos?: { label: string; amount: number }[];
}

export interface MultiQuoteInput {
  name?: string;
  client?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  currency?: string;
  /** "current" | "average30" | ISO date */
  exchangeRateMode?: 'current' | 'average30' | string;
  /** Override directo del TC */
  exchangeRate?: number;
  items: MultiQuoteItemInput[];
  dispatch?: DispatchCosts;
  /** Ola 2: tipo de operación → DTA por Art. 49 LFD. Default 'general'. */
  tipoOperacion?: TipoOperacionDTA;
  /** Ola 2: tabulador de honorarios elegido (id). La ruta carga las reglas en `tabulador`. */
  tabuladorId?: string;
  /** Interno (lo llena la ruta): reglas del tabulador del tenant. */
  tabulador?: { id: string; nombre: string; reglas: ReglaHonorarios[] } | null;
  /** Si true, los honorarios del tabulador sustituyen a dispatch.honorariosAgente aunque venga capturado. */
  usarTabulador?: boolean;
}

export interface ItemBreakdown {
  numeroPartida: number;
  fractionCode: string;
  description: string | null;
  countryOfOrigin: string;
  quantity: number;
  unit: string | null;
  unitValueUSD: number;
  totalValueUSD: number;
  freightUSD: number;
  insuranceUSD: number;
  customsValueUSD: number;
  customsValueMXN: number;
  igiRate: number;
  dtaRate: number;
  ivaRate: number;
  iepsRate: number;
  countervailingRate: number;
  igi: number;
  dta: number;
  ieps: number;
  countervailing: number;
  iva: number;
  totalDuties: number;
  /** ISAN (vehículo nuevo) ya incluido en totalDuties y totalCost. 0 si no aplica/exento. */
  isan: number;
  totalCost: number;
  hasAntidumping: boolean;
  antidumpingDecree: string | null;
  /** Información completa de la cuota para el banner UI del cotizador.
   * Cuando rateType=specific_USD_kg, "rate" es el USD/kg literal y
   * countervailing es el monto MXN ya convertido. */
  antidumping: {
    rate: number;
    rateType: 'percentage' | 'specific_USD_kg' | 'specific_USD_unit';
    rateUnit: string;
    resolutionNumber: string | null;
    expedienteUPCI: string | null;
    productDesc: string | null;
    dofUrl: string | null;
    effectiveDate: string | null;
    expiryDate: string | null;
    matchType: 'exact' | 'subheading' | 'heading';
    matchedFraction: string | null;
    calculation: string | null;
    needsWeight: boolean;
    /** Multa potencial Art. 178 LA: 130-150% de contribuciones omitidas. */
    potentialPenaltyMXN: number;
    // Ola 2 — cuota automática
    /** 'exportador' = tasa de la empresa capturada; 'general' = hay lista pero no coincide; 'general_sin_lista'. */
    origenTasa: 'exportador' | 'general' | 'general_sin_lista';
    empresa: string | null;
    esAntielusion: boolean;
    vigencia: string;
    resolutionType: string;
    advertencias: string[];
  } | null;
  /** Ola 2: exportador capturado en la partida (para la tasa por empresa). */
  exportador: string | null;
  /** Ola 2: nota del DTA cuando la cuota fija se carga en esta partida. */
  dtaNota: string | null;
  alertas: string[];
  priceCheck: PriceCheckResult | null;
  /** Tratado aplicado y arancel resultante (NMF si no califica / sin certificado) */
  treaty: {
    requested: string | null;
    applied: string | null;            // "TMEC", "TLCUEM", "CPTPP", o null si NMF
    hasCertificate: boolean;
    nmfRate: number;                   // arancel sin tratado
    preferentialRate: number | null;   // arancel preferencial si aplica
    appliedRate: number;               // arancel realmente usado
    savingsMXN: number;                // ahorro vs NMF (0 si no se aplicó preferencia)
    note: string | null;
  };
  /** Nota de vigencia jurídica, presente únicamente cuando se aplica TLCUEM. */
  treatyNote?: string;
  /** Programas y regímenes adicionales (PROSEC, Regla 8va, IEPS, ISAN) */
  programs: {
    prosec: { eligible: boolean; applied: boolean; sector: string | null; prosecRate: number | null; savingsMXN: number; verificacion: import('../lib/dato-legal').DatoLegal<number> | null };
    regla8va: { eligible: boolean; applied: boolean; vehicleFraction: string | null; preferentialRate: number | null };
    ieps: { applies: boolean; category: string | null; rate: number; rateType: string; amountMXN: number; calculation: string; cotejo: 'verificado' | 'sin_verificar' | 'sin_tasa'; nota: string; fundamento: string | null };
    isan: { applies: boolean; exempt: boolean; amountMXN: number; calculation: string; tier: { fixedAmount: number; marginalRate: number } | null };
  };
}

export interface MultiQuoteResult {
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateMode: string;
  exchangeRateSource: string;
  exchangeRateIsOfficial: boolean;
  exchangeRateWarning: string | null;
  items: ItemBreakdown[];
  dispatch: {
    honorariosAgente: number;
    prevalidacion: number;
    almacenaje: number;
    estiba: number;
    fleteInterno: number;
    otrosGastos: { label: string; amount: number }[];
    total: number;
  };
  totals: {
    valueMXN: number;
    igi: number;
    dta: number;
    ieps: number;
    countervailing: number;
    iva: number;
    isan: number;                   // ISAN total (vehículos nuevos), ya en totalDuties/landed
    totalDuties: number;
    totalLandedCost: number;        // valor + impuestos (sin despacho)
    totalDispatch: number;
    totalAll: number;               // landed + despacho
  };
  alertas: string[];                // alertas globales (deduplicadas)
  // Ola 2
  /** Fecha del dato de TC (DOF/Banxico) aplicado; null si TC manual o moneda MXN. */
  tcFechaDOF: string | null;
  tipoOperacion: TipoOperacionDTA;
  dta: DTAResuelto;
  honorarios: {
    origen: 'tabulador' | 'manual';
    tabuladorId: string | null;
    tabuladorNombre: string | null;
    detalle: string | null;
    monto: number;
  };
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

async function resolveExchangeRate(input: MultiQuoteInput): Promise<{
  rate: number;
  date: Date;
  mode: string;
  source: string;
  isOfficial: boolean;
  warning: string | null;
}> {
  if ((input.currency ?? 'USD') === 'MXN') {
    return { rate: 1, date: new Date(), mode: 'identity', source: 'identity', isOfficial: true, warning: null };
  }
  if (input.exchangeRate != null) {
    const date = new Date();
    return {
      rate: input.exchangeRate,
      date,
      mode: 'override',
      source: 'manual',
      isOfficial: false,
      warning: `TC manual del ${date.toISOString().slice(0, 10)} — verifica su fuente antes de pagar contribuciones.`,
    };
  }
  const mode = input.exchangeRateMode ?? 'current';
  if (mode === 'average30') {
    const info = await getMonthlyAverageRateInfo();
    return { rate: info.rate, date: info.asOf, mode: 'average30', source: info.source, isOfficial: info.isOfficial, warning: info.warning };
  }
  // ISO date string
  if (mode !== 'current') {
    const d = new Date(mode);
    if (!isNaN(d.getTime())) {
      const info = await getHistoricalRateInfo(d);
      return { rate: info.rate, date: info.asOf, mode: `historical(${mode})`, source: info.source, isOfficial: info.isOfficial, warning: info.warning };
    }
  }
  const info = await getOfficialRate();
  return { rate: info.rate, date: info.asOf, mode: 'current', source: info.source, isOfficial: info.isOfficial, warning: info.warning };
}

export async function calculateMultiQuote(input: MultiQuoteInput): Promise<MultiQuoteResult> {
  if (!input.items || input.items.length === 0) {
    throw new Error('Se requiere al menos una partida');
  }

  const currency = input.currency ?? 'USD';
  const isMXN = currency === 'MXN';

  const fractionCodes = Array.from(new Set(input.items.map(i => i.fractionCode.replace(/\./g, ''))));
  const fractions = await prisma.fraction.findMany({
    where: { code: { in: fractionCodes }, active: true },
  });
  const fractionByCode = new Map(fractions.map(f => [f.code, f]));

  for (const item of input.items) {
    requireQuotableFraction(
      fractionByCode.get(item.fractionCode.replace(/\./g, '')),
      item.igiRateOverride != null,
    );
  }

  const rateInfo = await resolveExchangeRate(input);
  const { rate: exchangeRate, date: exchangeRateDate, mode: exchangeRateMode } = rateInfo;
  const effectiveRate = isMXN ? 1 : exchangeRate;

  const itemsBreakdown: ItemBreakdown[] = [];
  const globalAlertas: string[] = [];
  if (rateInfo.warning) globalAlertas.push(rateInfo.warning);

  // ── Ola 2: DTA por tipo de operación (Art. 49 LFD) ──
  // Cuota fija = una por operación (pedimento): se carga en la partida 1.
  // Último párrafo Art. 49: si el resultado al millar (fracc. I y II) es menor
  // a la cuota de la fracc. III, se paga esta última — se decide ANTES del
  // loop porque el DTA forma parte de la base del IVA de la partida.
  const dtaInfo = await resolverDTAConCorpus(input.tipoOperacion);
  const cuotaMinimaDTA = entradaDTA('temporal_immex').valor;
  const valorMXNTotalEstimado = input.items.reduce((s, it) => s + (round2(it.quantity * it.unitValueUSD) + (it.freightUSD ?? 0) + (it.insuranceUSD ?? 0)) * effectiveRate, 0);
  const dtaMillarTotal = valorMXNTotalEstimado * dtaInfo.dtaPct / 100;
  const aplicaMinimoDTA = dtaInfo.base === 'millar' && (dtaInfo.tipo === 'general' || dtaInfo.tipo === 'activo_fijo_immex') && dtaMillarTotal < cuotaMinimaDTA;
  const dtaFijoOperacion = dtaInfo.base === 'fija' ? dtaInfo.montoFijoMXN : aplicaMinimoDTA ? cuotaMinimaDTA : null;
  if (dtaInfo.aviso) globalAlertas.push(dtaInfo.aviso);
  if (aplicaMinimoDTA) globalAlertas.push(`DTA: el ${dtaInfo.etiqueta} al millar ($${round2(dtaMillarTotal).toFixed(2)}) es menor a la cuota mínima de la fracc. III ($${cuotaMinimaDTA.toFixed(2)}); se aplica esta última (Art. 49 LFD, último párrafo).`);

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const cleanFrac = it.fractionCode.replace(/\./g, '');
    const fraction = fractionByCode.get(cleanFrac)!;

    const totalValueUSD = round2(it.quantity * it.unitValueUSD);
    const freightUSD = it.freightUSD ?? 0;
    const insuranceUSD = it.insuranceUSD ?? 0;
    const customsValueUSD = round2(totalValueUSD + freightUSD + insuranceUSD);

    const nmfRate = it.igiRateOverride ?? fraction.tariffNMF!;

    // ── Tratado preferencial: validar elegibilidad de origen + certificado ──
    const treatyRequested = it.applyTreaty ?? null;
    const hasCert = it.hasCertificadoOrigen ?? false;
    const country = it.countryOfOrigin.toUpperCase();
    const TREATY_COUNTRIES: Record<string, string[]> = {
      TMEC:   TMEC_PAISES,
      TLCUEM: TLCUEM_COUNTRIES,
      CPTPP:  ['JP','JAPÓN','JAPON','AU','AUSTRALIA','VN','VIETNAM','CL','CHILE','PE','PERU','PERÚ','SG','SINGAPUR','MY','MALASIA','NZ','NUEVA ZELANDA','BN','BRUNEI','CA','CAN'],
    };
    const treatyPreferential: Record<string, number | null> = {
      TMEC:   fraction.tariffTMEC,
      TLCUEM: fraction.tariffTLCUE,
      CPTPP:  fraction.tariffCPTPP,
    };

    let appliedRate = nmfRate;
    let appliedTreaty: string | null = null;
    let preferentialRate: number | null = null;
    let treatyNote: string | null = null;

    if (treatyRequested) {
      const eligibleCountries = TREATY_COUNTRIES[treatyRequested] ?? [];
      const eligibleByCountry = eligibleCountries.some(c => country.includes(c));
      preferentialRate = treatyPreferential[treatyRequested] ?? null;

      if (!eligibleByCountry) {
        treatyNote = `${treatyRequested} no aplica: el origen "${it.countryOfOrigin}" no es país miembro. Se aplica arancel NMF ${nmfRate}%.`;
      } else if (preferentialRate == null) {
        treatyNote = `Tasa preferencial ${treatyRequested} no disponible, se cotiza NMF ${nmfRate}%.`;
      } else if (
        treatyRequested === 'TLCUEM'
        && !preferenciaAplicable(TLCUEM_VIGENCIA[TLCUEM_VIGENCIA.instrumentoParaCalculo])
      ) {
        treatyNote = `TLCUEM no aplica: el instrumento seleccionado no está vigente ni en aplicación provisional. Se aplica arancel NMF ${nmfRate}%.`;
      } else if (!hasCert) {
        treatyNote = `Sin certificado de origen ${treatyRequested} vigente, aplica arancel general ${nmfRate}%, no preferencia ${preferentialRate}%. Solicita el certificado al exportador antes del despacho.`;
      } else {
        appliedRate = preferentialRate;
        appliedTreaty = treatyRequested;
        treatyNote = `Arancel preferencial ${treatyRequested} aplicado (${preferentialRate}%). Conserva certificado de origen vigente como soporte.`;
      }
    }

    // ── PROSEC + Regla 8va — pueden reducir el arancel todavía más ──
    const prosecCheck = await checkPROSEC(it.fractionCode);
    const regla8vaCheck = it.applyRegla8va
      ? await checkRegla8va(it.fractionCode, it.regla8vaParentFraction)
      : { eligible: false, vehicleFraction: null, vehicleDesc: null, preferentialRate: null, conditions: null };

    let postProsecRate = appliedRate;
    let prosecApplied = false;
    if (it.applyPROSEC && prosecCheck.eligible && prosecCheck.prosecRate != null && prosecCheck.prosecRate < postProsecRate) {
      prosecApplied = true;
      postProsecRate = prosecCheck.prosecRate;
    }
    let regla8vaApplied = false;
    if (it.applyRegla8va && regla8vaCheck.eligible && regla8vaCheck.preferentialRate != null && regla8vaCheck.preferentialRate < postProsecRate) {
      regla8vaApplied = true;
      postProsecRate = regla8vaCheck.preferentialRate;
    }
    const finalIgiRate = postProsecRate;
    const prosecSavingsBaseRate = (prosecApplied || regla8vaApplied) ? appliedRate - postProsecRate : 0;

    const igiRate = finalIgiRate;
    // Ola 2: IEPS por categoría desde IEPSRate; fallback al legacy Fraction.iepsRate
    // solo si no hay fila; sin tasa → 0 + nota (nunca se inventa).
    const iepsInfo = await resolverIEPS({ fractionCode: it.fractionCode, quantity: it.quantity, unit: it.unit ?? fraction?.unit ?? null });
    const iepsRate = iepsInfo.aplica ? iepsInfo.pct : (fraction?.iepsRate ?? 0);

    const compliance = await lookupCompliance(it.fractionCode, it.countryOfOrigin);
    // Ola 2: cuota compensatoria automática con tasa por exportador (servicio antidumping.ts).
    const cuotaAuto = await resolverCuotaAutomatica({ fractionCode: it.fractionCode, countryOfOrigin: it.countryOfOrigin, exportador: it.exportador });
    const antidumpingAplicable = cuotaAuto?.match ?? compliance.antidumping;
    // Cuota compensatoria por rateType — la lógica vive en `resolveCuotaCompensatoria`
    // (quoter.ts) para que single-item y multi-partida no diverjan.
    // Spec: RES-29/2024 $2.07 USD/kg sobre 1500 kg → $3,105 USD = $52,785 MXN.
    const cuota = resolveCuotaCompensatoria({
      antidumping: antidumpingAplicable,
      quantity: it.quantity,
      weightKg: it.weightKg,
      unit: it.unit,
      effectiveRate,
    });
    const cvPct = cuota.cvPct;
    const cvAbsoluteMXN = cuota.cvAbsoluteMXN;
    const cvCalculationLabel = cuota.cvCalculationLabel;
    const cvNeedsWeight = cuota.cvNeedsWeight;
    // cvRate para la UI (label %) — para specific se reporta 0 y se usa
    // cvAbsoluteMXN para mostrar el monto real.
    const cvRate = cvPct;

    const amounts = computeQuoteAmounts({
      valueUSD: customsValueUSD,
      exchangeRate: effectiveRate,
      rates: {
        igiPct: igiRate,
        dtaPct: dtaInfo.dtaPct,
        dtaAbsoluteMXN: dtaFijoOperacion != null ? (i === 0 ? dtaFijoOperacion : 0) : undefined,
        iepsPct: iepsRate,
        iepsAbsoluteMXN: iepsInfo.montoEspecificoMXN > 0 ? iepsInfo.montoEspecificoMXN : undefined,
        countervailingPct: cvPct,
        countervailingAbsoluteMXN: cvAbsoluteMXN > 0 ? cvAbsoluteMXN : undefined,
      },
    });
    const dtaNota = dtaFijoOperacion != null
      ? (i === 0
        ? `DTA cuota fija $${dtaFijoOperacion.toFixed(2)} MXN por operación (${dtaInfo.fundamento}${aplicaMinimoDTA ? ', último párrafo' : `, fracc. ${dtaInfo.fraccionArt49}`}) cargada en la partida 1.`
        : 'DTA cuota fija cargada en la partida 1 (una por operación).')
      : null;

    // Validación de precio estimado SAT (Art. 84-A LA)
    const priceCheck = await validateDeclaredPrice({
      fractionCode: cleanFrac,
      countryOfOrigin: it.countryOfOrigin,
      declaredUnitValueUSD: it.unitValueUSD,
      quantity: it.quantity,
      igiRate,
      exchangeRate: effectiveRate,
    });

    // ISAN (vehículo nuevo) — se calcula ANTES del push para integrarlo al total,
    // igual que IGI/DTA/IVA/cuota. Si exento o no aplica, suma 0.
    const isElectric = it.isElectric ?? false;
    const isanCheck = it.isVehicle && it.vehiclePriceMXN
      ? await calculateISAN(it.fractionCode, it.vehiclePriceMXN, isElectric)
      : { applies: false, exempt: false, amountMXN: 0, calculation: '', priceMXN: 0, rangeMin: null, rangeMax: null, fixedAmount: 0, marginalRate: 0, vehicleType: null };
    const isanMXN = round2(isanCheck.applies && !isanCheck.exempt ? isanCheck.amountMXN : 0);

    itemsBreakdown.push({
      numeroPartida: i + 1,
      fractionCode: it.fractionCode,
      description: it.description ?? fraction?.description ?? null,
      countryOfOrigin: it.countryOfOrigin,
      quantity: it.quantity,
      unit: it.unit ?? fraction?.unit ?? null,
      unitValueUSD: it.unitValueUSD,
      totalValueUSD,
      freightUSD,
      insuranceUSD,
      customsValueUSD,
      customsValueMXN: amounts.valueMXN,
      igiRate,
      dtaRate: dtaFijoOperacion != null ? 0 : dtaInfo.dtaPct,
      ivaRate: 16,
      iepsRate,
      countervailingRate: cvRate,
      igi: amounts.igi,
      dta: amounts.dta,
      ieps: amounts.ieps,
      countervailing: amounts.countervailingDuty,
      iva: amounts.iva,
      totalDuties: round2(amounts.totalTaxes + isanMXN),
      isan: isanMXN,
      totalCost: round2(amounts.totalLandedCost + isanMXN),
      hasAntidumping: amounts.countervailingDuty > 0,
      antidumpingDecree: antidumpingAplicable?.decree ?? null,
      antidumping: antidumpingAplicable ? {
        rate: antidumpingAplicable.rate,
        rateType: antidumpingAplicable.rateType,
        rateUnit: antidumpingAplicable.rateUnit,
        resolutionNumber: antidumpingAplicable.resolutionNumber,
        expedienteUPCI: antidumpingAplicable.expedienteUPCI,
        productDesc: antidumpingAplicable.productDesc,
        dofUrl: antidumpingAplicable.dofUrl,
        effectiveDate: antidumpingAplicable.effectiveDate,
        expiryDate: antidumpingAplicable.expiryDate,
        matchType: antidumpingAplicable.matchType ?? 'exact',
        matchedFraction: antidumpingAplicable.matchedFraction ?? null,
        calculation: cvCalculationLabel,
        needsWeight: cvNeedsWeight,
        potentialPenaltyMXN: round2(amounts.countervailingDuty * 1.4),
        origenTasa: cuotaAuto?.tasa.origen ?? 'general_sin_lista',
        empresa: cuotaAuto?.tasa.empresa ?? null,
        esAntielusion: cuotaAuto?.esAntielusion ?? false,
        vigencia: cuotaAuto?.vigencia ?? `vigente desde ${antidumpingAplicable.effectiveDate?.slice(0, 10) ?? 's/f'}`,
        resolutionType: antidumpingAplicable.resolutionType,
        advertencias: cuotaAuto?.advertencias ?? [],
      } : null,
      exportador: it.exportador ?? null,
      dtaNota,
      alertas: [...compliance.alertas, ...(iepsInfo.aplica ? [iepsInfo.nota] : []), ...(cuotaAuto?.advertencias ?? [])],
      priceCheck,
      treaty: {
        requested: treatyRequested,
        applied: appliedTreaty,
        hasCertificate: hasCert,
        nmfRate,
        preferentialRate,
        appliedRate,
        savingsMXN: appliedTreaty
          ? round2((nmfRate - appliedRate) / 100 * amounts.valueMXN)
          : 0,
        note: treatyNote,
      },
      ...(appliedTreaty === 'TLCUEM' ? { treatyNote: tlcuemNota() } : {}),
      programs: (() => {
        // ISAN: reutiliza isanCheck ya calculado arriba (misma fuente, sin recálculo).
        return {
          prosec: {
            eligible: prosecCheck.eligible,
            applied: prosecApplied,
            sector: prosecCheck.sector,
            prosecRate: prosecCheck.prosecRate,
            savingsMXN: prosecApplied ? round2(prosecSavingsBaseRate / 100 * amounts.valueMXN) : 0,
            // Frontera: la UI NO puede pintar la tasa como dato verificado si
            // la fila es aproximación por prefijo (sello + nota lo dicen).
            verificacion: prosecCheck.verificacion,
          },
          regla8va: {
            eligible: regla8vaCheck.eligible,
            applied: regla8vaApplied,
            vehicleFraction: regla8vaCheck.vehicleFraction,
            preferentialRate: regla8vaCheck.preferentialRate,
          },
          ieps: {
            applies: iepsInfo.aplica,
            category: iepsInfo.categoria,
            rate: iepsInfo.tasa,
            rateType: iepsInfo.tipoTasa ?? 'ad_valorem',
            amountMXN: amounts.ieps,
            calculation: iepsInfo.aplica ? iepsInfo.nota : '',
            cotejo: iepsInfo.cotejo,
            nota: iepsInfo.nota,
            fundamento: iepsInfo.fundamento,
          },
          isan: {
            applies: isanCheck.applies,
            exempt: isanCheck.exempt,
            amountMXN: isanCheck.amountMXN,
            calculation: isanCheck.calculation,
            tier: isanCheck.applies && !isanCheck.exempt ? { fixedAmount: isanCheck.fixedAmount, marginalRate: isanCheck.marginalRate } : null,
          },
        };
      })(),
    });

    for (const a of compliance.alertas) {
      if (!globalAlertas.includes(a)) globalAlertas.push(a);
    }
    for (const a of cuotaAuto?.advertencias ?? []) {
      const tag = `Partida ${i + 1}: ${a}`;
      if (!globalAlertas.includes(tag)) globalAlertas.push(tag);
    }
    if (iepsInfo.aplica) {
      const tag = `Partida ${i + 1}: ${iepsInfo.nota}`;
      if (!globalAlertas.includes(tag)) globalAlertas.push(tag);
    }
    // Banner global para cuota compensatoria — siempre prominente
    if (antidumpingAplicable && amounts.countervailingDuty > 0) {
      const ad = antidumpingAplicable;
      const resLabel = ad.resolutionNumber ?? ad.decree ?? 's/n';
      const matchWarn = ad.matchType && ad.matchType !== 'exact'
        ? ` [⚠️ match por ${ad.matchType === 'subheading' ? 'subpartida' : 'partida'} ${ad.matchedFraction} — verifica que ${it.fractionCode} esté cubierta]`
        : '';
      const tag = `🚨 Partida ${i + 1}: cuota compensatoria ${resLabel} aplicable (${cvCalculationLabel ?? `${ad.rate}${ad.rateUnit}`}) — omitirla = multa 130-150% Art. 178 LA${matchWarn}`;
      if (!globalAlertas.includes(tag)) globalAlertas.push(tag);
    } else if (antidumpingAplicable && cvNeedsWeight) {
      const tag = `⚠️ Partida ${i + 1}: cuota compensatoria ${antidumpingAplicable.resolutionNumber ?? antidumpingAplicable.decree ?? 's/n'} requiere weightKg (USD/kg). Declara peso bruto para cálculo exacto.`;
      if (!globalAlertas.includes(tag)) globalAlertas.push(tag);
    }
    if (priceCheck.severity === 'critical' && priceCheck.message) {
      const tag = `Partida ${i + 1}: ${priceCheck.message}`;
      if (!globalAlertas.includes(tag)) globalAlertas.push(tag);
    }
    if (treatyRequested && !appliedTreaty && treatyNote) {
      const tag = `Partida ${i + 1}: ${treatyNote}`;
      if (!globalAlertas.includes(tag)) globalAlertas.push(tag);
    }
  }

  // ── Ola 2: honorarios desde tabulador (si se eligió y no se capturaron a mano, o se forzó) ──
  const valorMXNOperacion = round2(itemsBreakdown.reduce((s, i) => s + i.customsValueMXN, 0));
  let honorarios: MultiQuoteResult['honorarios'] = { origen: 'manual', tabuladorId: null, tabuladorNombre: null, detalle: null, monto: round2(input.dispatch?.honorariosAgente ?? 0) };
  if (input.tabulador && (input.usarTabulador || input.dispatch?.honorariosAgente == null)) {
    const calc = calcularHonorarios(input.tabulador.reglas, { tipoOperacion: dtaInfo.tipo, valorMXN: valorMXNOperacion });
    honorarios = { origen: calc.regla ? 'tabulador' : 'manual', tabuladorId: input.tabulador.id, tabuladorNombre: input.tabulador.nombre, detalle: calc.detalle, monto: calc.regla ? calc.monto : honorarios.monto };
    if (!calc.regla) globalAlertas.push(`Honorarios: ${calc.detalle}`);
  }

  const dispatch = {
    honorariosAgente: honorarios.monto,
    prevalidacion: round2(input.dispatch?.prevalidacion ?? 321),
    almacenaje: round2(input.dispatch?.almacenaje ?? 0),
    estiba: round2(input.dispatch?.estiba ?? 0),
    fleteInterno: round2(input.dispatch?.fleteInterno ?? 0),
    otrosGastos: input.dispatch?.otrosGastos ?? [],
    total: 0,
  };
  dispatch.total = round2(
    dispatch.honorariosAgente + dispatch.prevalidacion + dispatch.almacenaje +
    dispatch.estiba + dispatch.fleteInterno +
    dispatch.otrosGastos.reduce((s, g) => s + g.amount, 0),
  );

  const totals = {
    valueMXN: round2(itemsBreakdown.reduce((s, i) => s + i.customsValueMXN, 0)),
    igi: round2(itemsBreakdown.reduce((s, i) => s + i.igi, 0)),
    dta: round2(itemsBreakdown.reduce((s, i) => s + i.dta, 0)),
    ieps: round2(itemsBreakdown.reduce((s, i) => s + i.ieps, 0)),
    countervailing: round2(itemsBreakdown.reduce((s, i) => s + i.countervailing, 0)),
    iva: round2(itemsBreakdown.reduce((s, i) => s + i.iva, 0)),
    isan: round2(itemsBreakdown.reduce((s, i) => s + (i.isan ?? 0), 0)),
    totalDuties: 0,
    totalLandedCost: round2(itemsBreakdown.reduce((s, i) => s + i.totalCost, 0)),
    totalDispatch: dispatch.total,
    totalAll: 0,
  };
  totals.totalDuties = round2(totals.igi + totals.dta + totals.ieps + totals.countervailing + totals.iva + totals.isan);
  totals.totalAll = round2(totals.totalLandedCost + totals.totalDispatch);

  return {
    exchangeRate,
    exchangeRateDate: exchangeRateDate.toISOString(),
    exchangeRateMode,
    exchangeRateSource: rateInfo.source,
    exchangeRateIsOfficial: rateInfo.isOfficial,
    exchangeRateWarning: rateInfo.warning,
    items: itemsBreakdown,
    dispatch,
    totals,
    alertas: globalAlertas,
    tcFechaDOF: isMXN || rateInfo.source === 'manual' ? null : exchangeRateDate.toISOString(),
    tipoOperacion: dtaInfo.tipo,
    dta: dtaInfo,
    honorarios,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Escenarios "what if" — variaciones sobre un quote base
// ──────────────────────────────────────────────────────────────────────────

export interface ScenarioVariant {
  name: string;
  /** Multiplicadores aplicados al quote base */
  freightMultiplier?: number;          // ej 1.10 = +10% flete
  weightMultiplier?: number;           // ej 1.20 = +20% cantidad/peso
  exchangeRateOverride?: number;       // TC fijo para este escenario
  /** Cambio de país (hace que se evalúe otra cuota compensatoria) */
  countryOverride?: string;
  // Ola 2 — escenarios de venta (China definitivo vs T-MEC vs PROSEC)
  /** Tratado a aplicar en todas las partidas (null = quitar tratado → NMF). */
  treatyOverride?: 'TMEC' | 'TLCUEM' | 'CPTPP' | null;
  hasCertificadoOrigen?: boolean;
  applyPROSEC?: boolean;
  tipoOperacionOverride?: TipoOperacionDTA;
}

export interface ScenarioComparison {
  base: MultiQuoteResult;
  scenarios: { name: string; result: MultiQuoteResult; deltaMXN: number; deltaPct: number }[];
}

export async function compareScenarios(base: MultiQuoteInput, variants: ScenarioVariant[]): Promise<ScenarioComparison> {
  const baseResult = await calculateMultiQuote(base);
  const scenarios: ScenarioComparison['scenarios'] = [];

  for (const v of variants) {
    const variantInput: MultiQuoteInput = {
      ...base,
      exchangeRate: v.exchangeRateOverride ?? base.exchangeRate,
      tipoOperacion: v.tipoOperacionOverride ?? base.tipoOperacion,
      items: base.items.map(it => ({
        ...it,
        quantity: it.quantity * (v.weightMultiplier ?? 1),
        freightUSD: (it.freightUSD ?? 0) * (v.freightMultiplier ?? 1),
        countryOfOrigin: v.countryOverride ?? it.countryOfOrigin,
        ...(v.treatyOverride !== undefined ? { applyTreaty: v.treatyOverride ?? undefined } : {}),
        ...(v.hasCertificadoOrigen !== undefined ? { hasCertificadoOrigen: v.hasCertificadoOrigen } : {}),
        ...(v.applyPROSEC !== undefined ? { applyPROSEC: v.applyPROSEC } : {}),
      })),
    };
    const r = await calculateMultiQuote(variantInput);
    const delta = r.totals.totalAll - baseResult.totals.totalAll;
    scenarios.push({
      name: v.name,
      result: r,
      deltaMXN: round2(delta),
      deltaPct: baseResult.totals.totalAll > 0
        ? Math.round((delta / baseResult.totals.totalAll) * 1000) / 10
        : 0,
    });
  }

  return { base: baseResult, scenarios };
}
