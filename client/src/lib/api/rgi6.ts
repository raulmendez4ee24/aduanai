/**
 * RGI 6 — específica vs residual (4ª revisión, prioridad 1).
 *
 * Espejo en cliente del bloque `rgi6` que el Clasificador adjunta a la
 * respuesta (server/src/services/rgi6-especifica-residual.ts). Vive aquí y no
 * en lib/api.ts porque ese archivo es compartido: la pantalla lee el bloque con
 * un cast, igual que ya hace con `hermanas`.
 *
 * No hay endpoint propio: el bloque viaja dentro del resultado de clasificar.
 */

export type EstadoRGI6 =
  | 'apagado'
  | 'sin_catalogo'
  | 'no_residual'
  | 'sin_candidata'
  | 'confirmada'
  | 'reclasificada'
  | 'no_ejecutado'

export interface NotaRGI6 {
  source: string
  text: string
  cotejo: 'cotejado' | 'pendiente'
  fuenteUrl: string | null
}

export interface LadoRGI6 {
  code: string
  codeFormatted: string
  description: string
  motivo: string
}

export interface ComparacionRGI6 {
  estado: EstadoRGI6
  ejecutado: boolean
  residual: LadoRGI6 | null
  candidata: LadoRGI6 | null
  ganadora: string | null
  justificacion: string | null
  descarte: string | null
  notas: NotaRGI6[]
  aviso: string
  error?: string
}

/** Estados que ameritan mostrar el veredicto en pantalla (los demás son ruido). */
export function rgi6Visible(r: ComparacionRGI6 | null | undefined): r is ComparacionRGI6 {
  return !!r && ['confirmada', 'reclasificada', 'no_ejecutado', 'sin_candidata'].includes(r.estado)
}
