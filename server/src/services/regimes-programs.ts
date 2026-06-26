/**
 * Servicios de lookup y cálculo: PROSEC, Regla 8va, IEPS, ISAN.
 *
 * Cada función recibe inputs operativos (fracción, valor, peso, etc.) y
 * devuelve el cálculo aplicable. Diseñadas para integrarse al cotizador.
 */

import { prisma } from '../lib/prisma';

// ════════════════════════════════════════════════════════════════════
// PROSEC
// ════════════════════════════════════════════════════════════════════

export interface PROSECResult {
  eligible: boolean;
  sector: string | null;
  prosecRate: number | null;
  conditions: unknown;
  notes: string | null;
}

export async function checkPROSEC(fractionCode: string): Promise<PROSECResult> {
  const clean = fractionCode.replace(/[^0-9]/g, '');
  if (!clean) return { eligible: false, sector: null, prosecRate: null, conditions: null, notes: null };

  // Match exact 8d → prefijos 6/4/2
  if (clean.length >= 8) {
    const exact = await prisma.pROSECEligibility.findFirst({
      where: { fractionCode: clean.slice(0, 8), matchType: 'exact', active: true },
    });
    if (exact) return { eligible: true, sector: exact.sector, prosecRate: exact.prosecRate, conditions: exact.conditions, notes: exact.notes };
  }
  for (const len of [6, 4, 2]) {
    if (clean.length >= len) {
      const prefix = clean.slice(0, len);
      const m = await prisma.pROSECEligibility.findFirst({
        where: { fractionCode: prefix, matchType: 'prefix', active: true },
        orderBy: { fractionCode: 'desc' },
      });
      if (m) return { eligible: true, sector: m.sector, prosecRate: m.prosecRate, conditions: m.conditions, notes: m.notes };
    }
  }
  return { eligible: false, sector: null, prosecRate: null, conditions: null, notes: null };
}

// ════════════════════════════════════════════════════════════════════
// REGLA 8VA
// ════════════════════════════════════════════════════════════════════

export interface Regla8vaResult {
  eligible: boolean;
  vehicleFraction: string | null;
  vehicleDesc: string | null;
  preferentialRate: number | null;
  conditions: string | null;
}

/**
 * Verifica si una fracción de PARTE puede importarse bajo Regla 8va para un
 * producto terminado específico. El usuario debe declarar el `targetVehicleFraction`.
 */
export async function checkRegla8va(partFraction: string, targetVehicleFraction?: string): Promise<Regla8vaResult> {
  const cleanPart = partFraction.replace(/[^0-9]/g, '');
  if (!cleanPart) return { eligible: false, vehicleFraction: null, vehicleDesc: null, preferentialRate: null, conditions: null };

  const where: Record<string, unknown> = { active: true };
  if (targetVehicleFraction) where.vehicleFraction = targetVehicleFraction.replace(/[^0-9]/g, '').slice(0, 4);

  const mappings = await prisma.regla8vaMapping.findMany({ where });
  for (const m of mappings) {
    const allowed = (m.partsAllowed as { fraction: string }[]) ?? [];
    const matches = allowed.some(p => cleanPart.startsWith(p.fraction.replace(/[^0-9]/g, '')));
    if (matches) {
      return {
        eligible: true,
        vehicleFraction: m.vehicleFraction,
        vehicleDesc: m.vehicleDesc,
        preferentialRate: m.preferentialRate,
        conditions: m.conditions,
      };
    }
  }
  return { eligible: false, vehicleFraction: null, vehicleDesc: null, preferentialRate: null, conditions: null };
}

// ════════════════════════════════════════════════════════════════════
// IEPS
// ════════════════════════════════════════════════════════════════════

export interface IEPSCalculation {
  applies: boolean;
  category: string | null;
  rate: number;
  rateType: 'ad_valorem' | 'specific';
  unit: string | null;
  description: string | null;
  amountMXN: number | null;
  calculation: string;
}

export interface IEPSInput {
  fractionCode: string;
  baseMXN?: number;     // base gravable (CIF + IGI + DTA)
  quantity?: number;    // cantidad para tasas específicas
  unit?: string;        // unidad de la cantidad
}

export async function checkIEPS(input: IEPSInput): Promise<IEPSCalculation> {
  const clean = input.fractionCode.replace(/[^0-9]/g, '');
  if (!clean) return notApplies();

  let rate: typeof emptyRate = await prisma.iEPSRate.findFirst({
    where: { fractionCode: clean.slice(0, 8), matchType: 'exact', active: true },
  });
  if (!rate) {
    for (const len of [6, 4, 2]) {
      if (clean.length >= len) {
        rate = await prisma.iEPSRate.findFirst({
          where: { fractionCode: clean.slice(0, len), matchType: 'prefix', active: true },
          orderBy: { fractionCode: 'desc' },
        });
        if (rate) break;
      }
    }
  }
  if (!rate) return notApplies();

  let amount: number | null = null;
  let calc = '';
  if (rate.rateType === 'ad_valorem' && input.baseMXN != null) {
    amount = Math.round(input.baseMXN * (rate.rate / 100) * 100) / 100;
    calc = `${rate.rate}% × $${input.baseMXN.toLocaleString('es-MX')} MXN = $${amount.toLocaleString('es-MX')} MXN`;
  } else if (rate.rateType === 'specific' && input.quantity != null) {
    amount = Math.round(input.quantity * rate.rate * 100) / 100;
    calc = `${rate.rate} ${rate.unit ?? ''} × ${input.quantity} = $${amount.toLocaleString('es-MX')} MXN`;
  } else {
    calc = `Tasa ${rate.rate} ${rate.unit ?? ''} aplicable — falta ${rate.rateType === 'ad_valorem' ? 'baseMXN' : 'quantity'} para calcular monto`;
  }

  return {
    applies: true,
    category: rate.productCategory,
    rate: rate.rate,
    rateType: rate.rateType as 'ad_valorem' | 'specific',
    unit: rate.unit,
    description: rate.description,
    amountMXN: amount,
    calculation: calc,
  };
}

const emptyRate: { rate: number; rateType: string; unit: string | null; productCategory: string; description: string | null } | null = null;
function notApplies(): IEPSCalculation {
  return { applies: false, category: null, rate: 0, rateType: 'ad_valorem', unit: null, description: null, amountMXN: null, calculation: '' };
}

// ════════════════════════════════════════════════════════════════════
// ISAN — Impuesto Sobre Automóviles Nuevos (tarifa progresiva)
// ════════════════════════════════════════════════════════════════════

export interface ISANResult {
  applies: boolean;
  vehicleType: string | null;
  exempt: boolean;
  priceMXN: number;
  rangeMin: number | null;
  rangeMax: number | null;
  fixedAmount: number;
  marginalRate: number;
  amountMXN: number;
  calculation: string;
}

// Parámetros escalares de la tarifa ISAN 2026 — FUENTE PRIMARIA:
// DOF 28-dic-2025, Anexo 15 RMF, secciones A y B. Mismo documento que las 5
// tramos seedeados (prisma/seed/regimes-programs.ts ISAN_RATES). COTEJADO contra
// el PDF oficial del SAT el 2026-06-25 — los 4 escalares coinciden EXACTO:
//   https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-15-RMF-2026_DOF-2812225.pdf
export const ISAN_2026 = {
  fiscalYear: 2026,
  // Art. 3, último párrafo: si precio > umbral, se resta 7% del excedente.
  highPriceThreshold: 1_060_189.93,
  highPriceDiscountRate: 0.07,
  // Art. 8, fracc. II: ≤ exemptFull → 100% exento; ≤ exemptHalf → 50% de exención.
  exemptFull: 356_934.05,
  exemptHalf: 452_116.48,
  source: 'DOF 28-dic-2025 — Anexo 15 RMF 2026 (Art. 3 y 8-II LFISAN). Cotejado vs PDF oficial SAT el 2026-06-25.',
} as const;

const isanRound2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const mxnFmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function calculateISAN(fractionCode: string, priceMXN: number, isElectric = false): Promise<ISANResult> {
  const clean = fractionCode.replace(/[^0-9]/g, '');
  const isPassengerVehicle = clean.startsWith('8703');

  // Eléctricos/híbridos: EXENTOS. No requiere fila en la tabla (blindaje).
  if (isElectric) {
    return {
      applies: true, vehicleType: 'electric', exempt: true,
      priceMXN, rangeMin: 0, rangeMax: null, fixedAmount: 0, marginalRate: 0, amountMXN: 0,
      calculation: 'Vehículo eléctrico/híbrido — EXENTO de ISAN',
    };
  }

  // Buscar tarifa por fracción + año fiscal
  const rates = await prisma.iSANRate.findMany({
    where: {
      OR: [{ fractionCode: clean }, { fractionCode: clean.slice(0, 4) }],
      active: true, vehicleType: 'passenger', fiscalYear: ISAN_2026.fiscalYear,
    },
    orderBy: { priceRangeMin: 'asc' },
  });

  if (rates.length === 0) {
    // BLINDAJE: si es automóvil (8703) y no hay tarifa cargada, NO lo ocultes en
    // silencio — marca que ISAN APLICA pero falta la tarifa verificada (amount 0).
    if (isPassengerVehicle) {
      return {
        applies: true, vehicleType: 'passenger', exempt: false,
        priceMXN, rangeMin: null, rangeMax: null, fixedAmount: 0, marginalRate: 0, amountMXN: 0,
        calculation: '⚠️ ISAN APLICA pero no hay tarifa verificada cargada. No se incluye monto — consulta la tarifa vigente en el DOF (Anexo 15 RMF).',
      };
    }
    return { applies: false, vehicleType: null, exempt: false, priceMXN, rangeMin: null, rangeMax: null, fixedAmount: 0, marginalRate: 0, amountMXN: 0, calculation: 'No aplica ISAN para esta fracción' };
  }

  const tier = rates.find(r => priceMXN >= r.priceRangeMin && (r.priceRangeMax == null || priceMXN <= r.priceRangeMax));
  if (!tier) {
    return { applies: false, vehicleType: 'passenger', exempt: false, priceMXN, rangeMin: null, rangeMax: null, fixedAmount: 0, marginalRate: 0, amountMXN: 0, calculation: 'Precio fuera de tarifa' };
  }

  // 1) Impuesto base — tarifa progresiva (Art. 3)
  const excedente = priceMXN - tier.priceRangeMin;
  const base = tier.fixedAmount + excedente * (tier.marginalRate / 100);
  let impuesto = base;
  let note = '';

  // 2) Descuento Art. 3 último párrafo (precio alto). No se traslapa con 8-II.
  if (priceMXN > ISAN_2026.highPriceThreshold) {
    const descuento = (priceMXN - ISAN_2026.highPriceThreshold) * ISAN_2026.highPriceDiscountRate;
    impuesto = base - descuento;
    note = ` − 7% × $${mxnFmt(priceMXN - ISAN_2026.highPriceThreshold)} (precio > $${mxnFmt(ISAN_2026.highPriceThreshold)}) = −$${mxnFmt(descuento)}`;
  }

  // 3) Exención Art. 8 fracc. II (vehículos de bajo costo)
  let exempt = false;
  if (priceMXN <= ISAN_2026.exemptFull) {
    impuesto = 0; exempt = true;
    note = ` · EXENTO 100% (Art. 8-II: precio ≤ $${mxnFmt(ISAN_2026.exemptFull)})`;
  } else if (priceMXN <= ISAN_2026.exemptHalf) {
    impuesto = impuesto * 0.5;
    note = ` · reducción 50% (Art. 8-II: precio ≤ $${mxnFmt(ISAN_2026.exemptHalf)})`;
  }

  const total = Math.max(0, isanRound2(impuesto));
  return {
    applies: true,
    vehicleType: tier.vehicleType,
    exempt,
    priceMXN,
    rangeMin: tier.priceRangeMin,
    rangeMax: tier.priceRangeMax,
    fixedAmount: tier.fixedAmount,
    marginalRate: tier.marginalRate,
    amountMXN: total,
    calculation: `Cuota fija $${mxnFmt(tier.fixedAmount)} + ${tier.marginalRate}% × $${mxnFmt(excedente)} = $${mxnFmt(base)}${note} → ISAN $${mxnFmt(total)} MXN`,
  };
}
