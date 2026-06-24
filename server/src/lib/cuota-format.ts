/**
 * ÚNICA fuente de formateo de la TASA de una cuota compensatoria en todo el
 * sistema. Cualquier módulo que muestre una cuota DEBE usar este helper — no
 * reimplementar el branching de rateType (eso causó que la misma cuota saliera
 * "$2.07 USD/kg" en Cuotas Activas y "2.07%" en la alerta de la campana).
 *
 * rateType:
 *   - percentage        → "25%"            (sobre valor en aduana)
 *   - specific_USD_kg    → "$2.07 USD/kg"
 *   - specific_USD_unit  → "$5.50 USD/pieza" (usa rateUnit)
 */
export type CuotaRateType = 'percentage' | 'specific_USD_kg' | 'specific_USD_unit' | string;

export function formatCuota(
  rateType: CuotaRateType | null | undefined,
  rate: number,
  rateUnit?: string | null,
): string {
  switch (rateType) {
    case 'specific_USD_kg':
      return `$${rate} USD/kg`;
    case 'specific_USD_unit':
      return `$${rate} ${rateUnit ?? 'USD/unidad'}`;
    case 'percentage':
      return `${rate}%`;
    default:
      // rateType desconocido/ausente: si hay una unidad que no sea %, trátala como
      // específica; si no, porcentaje. NUNCA asumir % a ciegas para un monto USD.
      return rateUnit && rateUnit !== '%' ? `$${rate} ${rateUnit}` : `${rate}%`;
  }
}
