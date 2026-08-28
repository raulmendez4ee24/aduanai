/**
 * Puente Aprobaciones ↔ Defensa (cuarta revisión, prioridad 4).
 *
 * El bloque "quién aprobó qué y cuándo" del paquete de Defensa creció: ahora
 * trae estado, leyenda honesta, rol del aprobador al momento, motivo y el
 * evento encadenado de la decisión con su hash. Este módulo extiende el tipo
 * de `ola3.ts` sin tocarlo (regla de lanes) y expone los enlaces de ida y
 * vuelta entre la bandeja y el paquete.
 */
import { request } from '../api-core'
import type { PaqueteDefensa as PaqueteDefensaBase, TipoDefensa } from './ola3'
import type { TipoAprobacion } from './clientes'

export type EstadoAprobacion =
  | 'aprobada'
  | 'aprobada_sin_aprobador'
  | 'aprobada_sembrada'
  | 'pendiente'
  | 'rechazada'
  | 'sin_flujo'
  | 'desconocido'

export interface PersonaDefensa { id: string; nombre: string; email: string }
export interface PersonaConRol extends PersonaDefensa { rol: string | null; rolFuente: string }
export interface DecisionAprobacion {
  action: string
  createdAt: string
  hash: string
  prevHash: string | null
  motivo: string | null
  ratificacionLegado: boolean
  por: PersonaConRol | null
}
export interface AprobacionesDefensa {
  aplica: boolean
  estado: EstadoAprobacion
  leyenda: string
  status: string | null
  creadoPor: PersonaDefensa | null
  aprobadoPor: PersonaConRol | null
  approvedAt: string | null
  motivo: string | null
  decision: DecisionAprobacion | null
  permisos: { action: string; createdAt: string; targetUserId: string | null; details: unknown }[]
  bandeja: { ruta: string; tipo: TipoAprobacion } | null
  fuente: string
}

export type PaqueteDefensa = Omit<PaqueteDefensaBase, 'aprobaciones'> & { aprobaciones: AprobacionesDefensa }

export const defensaPaquete = (tipo: TipoDefensa, id: string) =>
  request<{ status: string; data: PaqueteDefensa }>(`/traceability/defensa/${tipo}/${encodeURIComponent(id)}`)

/** Bandeja → paquete de defensa de esa entidad. */
export const rutaDefensa = (tipoDefensa: 'classification' | 'quote', id: string) =>
  `/defensa?tipo=${tipoDefensa}&id=${encodeURIComponent(id)}`

export const ETIQUETA_ESTADO: Record<EstadoAprobacion, string> = {
  aprobada: 'Aprobada',
  aprobada_sin_aprobador: 'Aprobada sin aprobador (legado)',
  aprobada_sembrada: 'Sembrada (demo)',
  pendiente: 'Pendiente de aprobación',
  rechazada: 'Rechazada',
  sin_flujo: 'Sin flujo de aprobación',
  desconocido: 'Estado desconocido',
}
