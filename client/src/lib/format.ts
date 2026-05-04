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
