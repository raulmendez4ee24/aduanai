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

export async function calculateISAN(fractionCode: string, priceMXN: number, isElectric = false): Promise<ISANResult> {
  const clean = fractionCode.replace(/[^0-9]/g, '');

  // Si es eléctrico, busca por vehicleType=electric
  if (isElectric) {
    const exempt = await prisma.iSANRate.findFirst({
      where: { vehicleType: 'electric', active: true, fiscalYear: 2026 },
    });
    if (exempt) {
      return {
        applies: true, vehicleType: 'electric', exempt: true,
        priceMXN, rangeMin: 0, rangeMax: null,
        fixedAmount: 0, marginalRate: 0, amountMXN: 0,
        calculation: 'Vehículo eléctrico — EXENTO de ISAN',
      };
    }
  }

  // Buscar tarifa por fracción + rango de precio
  const rates = await prisma.iSANRate.findMany({
    where: {
      OR: [
        { fractionCode: clean },
        { fractionCode: clean.slice(0, 4) },
      ],
      active: true,
      vehicleType: 'passenger',
      fiscalYear: 2026,
    },
    orderBy: { priceRangeMin: 'asc' },
  });
  if (rates.length === 0) {
    return { applies: false, vehicleType: null, exempt: false, priceMXN, rangeMin: null, rangeMax: null, fixedAmount: 0, marginalRate: 0, amountMXN: 0, calculation: 'No aplica ISAN para esta fracción' };
  }

  const tier = rates.find(r => priceMXN >= r.priceRangeMin && (r.priceRangeMax == null || priceMXN <= r.priceRangeMax));
  if (!tier) {
    return { applies: false, vehicleType: 'passenger', exempt: false, priceMXN, rangeMin: null, rangeMax: null, fixedAmount: 0, marginalRate: 0, amountMXN: 0, calculation: 'Precio fuera de tarifa' };
  }
  const excedente = priceMXN - tier.priceRangeMin;
  const marginal = excedente * (tier.marginalRate / 100);
  const total = tier.fixedAmount + marginal;

  return {
    applies: true,
    vehicleType: tier.vehicleType,
    exempt: false,
    priceMXN,
    rangeMin: tier.priceRangeMin,
    rangeMax: tier.priceRangeMax,
    fixedAmount: tier.fixedAmount,
    marginalRate: tier.marginalRate,
    amountMXN: Math.round(total * 100) / 100,
    calculation: `Cuota fija $${tier.fixedAmount.toLocaleString('es-MX')} + ${tier.marginalRate}% × $${excedente.toLocaleString('es-MX')} (excedente) = $${total.toLocaleString('es-MX')} MXN`,
  };
}
