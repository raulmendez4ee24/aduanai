/**
 * API — Regulatorio (Operación 2026-08): acciones normalizadas de alerta,
 * severidad, digest semanal y estado del watchdog DOF.
 */
import { request } from '../api-core'

export type TipoAccionAlerta = 'armar_rt' | 'cambio_regimen' | 'revisar_fraccion' | 'ver_obligacion' | 'cotizar'
export interface AccionAlerta {
  type: TipoAccionAlerta
  label: string
  payload: Record<string, unknown> & { route?: string }
}

export interface ReglasSeveridad {
  umbralesMonto: { alto: number; medio: number; bajo: number }
  umbralesDias: { inminente: number; proxima: number; lejana: number }
  tiposSinMonto: string[]
  matriz: { banda: string; vencida_o_inminente: string; proxima: string; lejana_o_sin_fecha: string }[]
  nota: string
}

export interface DigestCliente {
  clienteId: string | null
  nombre: string
  rfc: string | null
  alertas: { id: string; type: string; severity: string; title: string; estimatedImpactMXN: number | null; dueDate: string | null; ruta: string | null }[]
  vencimientos: { id: string; pedimento: string; fractionCode: string; expirationDate: string; dias: number; saldo: number; unit: string }[]
  obligaciones: { id: string; tipo: string; titulo: string; fechaLimite: string; dias: number; estado: string }[]
}
export interface Digest {
  tenantId: string
  tenantNombre: string
  generadoAt: string
  periodo: { desde: string; hasta: string }
  clientes: DigestCliente[]
  totales: { alertas: number; vencimientos: number; obligaciones: number; impactoMXN: number }
}
export type CanalDigest = 'email' | 'whatsapp' | 'ambos'

export interface ResultadoEnvioDigest {
  canal: string | null
  enviado: boolean
  motivo: string | null
  email: { intentado: boolean; destinatarios: string[]; error: string | null }
  whatsapp: { intentado: boolean; destinatarios: string[]; error: string | null }
  alertaId: string | null
}

export interface EstadoWatchdog {
  ultimaRevision: string | null
  fuentes: { clave: string; nombre: string; url: string; estado: 'ok' | 'ciega' | 'sin_revisar' }[]
  decretosRevisados: number
  alertasCreadas: number
  ventanaDias: number
}

export const regulatorioApi = {
  severidadReglas: () => request<{ status: string; data: ReglasSeveridad }>('/alerts/severidad/reglas'),
  digestPreview: () => request<{ status: string; data: { digest: Digest; canal: CanalDigest | null; ultimoEnvioAt: string | null; canales: CanalDigest[] } }>('/alerts/digest/preview'),
  digestEnviarAhora: () => request<{ status: string; data: ResultadoEnvioDigest }>('/alerts/digest/enviar-ahora', { method: 'POST' }),
  digestCanal: (canal: CanalDigest | null) => request<{ status: string; data: { digestSemanalCanal: string | null; digestUltimoEnvioAt: string | null } }>('/alerts/digest/canal', { method: 'PATCH', body: JSON.stringify({ canal }) }),
  watchdogEstado: () => request<{ status: string; data: EstadoWatchdog }>('/alerts/watchdog/estado'),
  watchdogRevisarAhora: () => request<{ status: string; data: { decretos: { clave: string; fechaDOF: string; titulo: string; url: string; fracciones: number }[]; alertasCreadas: number; alertasExistentes: number; fuentesCiegas: string[] } }>('/alerts/watchdog/revisar-ahora', { method: 'POST' }, 120000),
}

/** Ruta de navegación de una acción normalizada (el server ya la incluye en payload.route). */
export function rutaDeAccion(a: AccionAlerta | null | undefined): string | null {
  if (!a) return null
  if (typeof a.payload?.route === 'string' && a.payload.route.startsWith('/')) return a.payload.route
  return null
}
