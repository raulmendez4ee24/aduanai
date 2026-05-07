/**
 * Helpers de formato para presentación.
 */

/**
 * Formatea fracción arancelaria de 8 dígitos a "XXXX.XX.XX".
 * Acepta también códigos ya formateados (no rompe).
 */
export function formatFraction(code?: string | null): string {
  if (!code) return ''
  const cleaned = code.replace(/[^0-9]/g, '')
  if (cleaned.length !== 8) return code
  return `${cleaned.slice(0, 4)}.${cleaned.slice(4, 6)}.${cleaned.slice(6, 8)}`
}

/**
 * Formatea confianza (escala 0-100 ya viene del servidor).
 * No multiplica por 100 — solo redondea.
 */
export function formatConfidence(value: number | null | undefined, decimals = 0): string {
  if (value == null || isNaN(value)) return '—'
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}

/**
 * Formatea un valor como porcentaje, manejando explícitamente la escala.
 *
 * - `scaled: true` (default)  → el valor YA viene en 0-100 (no multiplicar)
 * - `scaled: false`           → el valor viene en 0-1 (multiplicar × 100)
 *
 * Convenio en ADUANAI: el backend siempre devuelve porcentajes en 0-100
 * (confidence, igiRate, riskScore, completeness, volumeUsed, etc.). Si por
 * algún motivo recibes un ratio 0-1, pasa `scaled: false` explícitamente.
 *
 * @example
 *   formatPercentage(85)             // "85%"
 *   formatPercentage(85.4, { decimals: 1 })  // "85.4%"
 *   formatPercentage(0.85, { scaled: false }) // "85%"
 *   formatPercentage(null)           // "—"
 */
export function formatPercentage(
  value: number | null | undefined,
  options: { scaled?: boolean; decimals?: number; clamp?: boolean; suffix?: string } = {},
): string {
  const { scaled = true, decimals = 0, clamp = false, suffix = '%' } = options
  if (value == null || isNaN(value)) return '—'
  let v = scaled ? value : value * 100
  if (clamp) v = Math.max(0, Math.min(100, v))
  return `${decimals > 0 ? v.toFixed(decimals) : Math.round(v)}${suffix}`
}

/**
 * Devuelve el ancho CSS para una barra de progreso (clamp a 0-100).
 *
 * @example
 *   barWidth(85)              // "85%"
 *   barWidth(120)             // "100%" (clamp)
 *   barWidth(0.85, false)     // "85%"
 */
export function barWidth(value: number | null | undefined, scaled = true): string {
  if (value == null || isNaN(value)) return '0%'
  const v = scaled ? value : value * 100
  return `${Math.max(0, Math.min(100, v))}%`
}
