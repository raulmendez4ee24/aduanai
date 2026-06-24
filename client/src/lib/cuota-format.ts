/**
 * ÚNICA fuente de formateo de la TASA de una cuota compensatoria en el cliente.
 * Espejo EXACTO de server/src/lib/cuota-format.ts (el límite de paquetes impide
 * compartir el módulo). Mantener ambos idénticos. No reimplementar el branching.
 *
 *   percentage        → "25%"
 *   specific_USD_kg    → "$2.07 USD/kg"
 *   specific_USD_unit  → "$5.50 USD/pieza"
 */
export type CuotaRateType = 'percentage' | 'specific_USD_kg' | 'specific_USD_unit' | string

export function formatCuota(
  rateType: CuotaRateType | null | undefined,
  rate: number,
  rateUnit?: string | null,
): string {
  switch (rateType) {
    case 'specific_USD_kg':
      return `$${rate} USD/kg`
    case 'specific_USD_unit':
      return `$${rate} ${rateUnit ?? 'USD/unidad'}`
    case 'percentage':
      return `${rate}%`
    default:
      return rateUnit && rateUnit !== '%' ? `$${rate} ${rateUnit}` : `${rate}%`
  }
}
