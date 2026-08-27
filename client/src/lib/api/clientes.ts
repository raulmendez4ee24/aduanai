/**
 * API de clientes (RFC operados) y aprobaciones — Operación 2026-08, Ola 1.
 * Importa `request` de api-core (regla: no tocar api.ts).
 */
import { request } from '../api-core'

export interface Cliente {
  id: string
  tenantId: string
  rfc: string
  razonSocial: string
  programaIMMEX: string | null
  certificacionIVAIEPS: 'A' | 'AA' | 'AAA' | null
  padronImportadores: boolean
  padronesSectoriales: string[]
  contactoNombre: string | null
  contactoEmail: string | null
  notas: string | null
  activo: boolean
  isDemoData: boolean
  createdAt: string
  updatedAt: string
}

export interface ClienteInput {
  rfc: string
  razonSocial: string
  programaIMMEX?: string | null
  certificacionIVAIEPS?: 'A' | 'AA' | 'AAA' | null
  padronImportadores?: boolean
  padronesSectoriales?: string[]
  contactoNombre?: string | null
  contactoEmail?: string | null
  notas?: string | null
  activo?: boolean
}

export interface ResumenCliente {
  clienteId: string
  rfc: string
  razonSocial: string
  activo: boolean
  clasificaciones: number
  cotizaciones: number
  operaciones: number
  importacionesTemporalesActivas: number
  alertasAbiertas: number
}

export interface ResultadoImportClientes {
  creados: number
  actualizados: number
  errores: { fila: number; rfc: string; motivo: string }[]
}

export interface BackfillResultado {
  clienteId: string
  tocadas: Record<string, number>
}

type Ok<T> = { status: string; data: T }

export const clientesApi = {
  listar: (opts: { incluirInactivos?: boolean; q?: string } = {}) => {
    const qs = new URLSearchParams()
    if (opts.incluirInactivos) qs.set('incluirInactivos', 'true')
    if (opts.q) qs.set('q', opts.q)
    const s = qs.toString()
    return request<Ok<Cliente[]>>(`/clientes${s ? `?${s}` : ''}`)
  },
  obtener: (id: string) => request<Ok<Cliente>>(`/clientes/${id}`),
  crear: (input: ClienteInput) => request<Ok<Cliente>>('/clientes', { method: 'POST', body: JSON.stringify(input) }),
  actualizar: (id: string, input: Partial<ClienteInput>) => request<Ok<Cliente>>(`/clientes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  desactivar: (id: string) => request<{ status: string }>(`/clientes/${id}`, { method: 'DELETE' }),
  resumen: () => request<Ok<ResumenCliente[]>>('/clientes/resumen'),
  importar: (base64: string) => request<Ok<ResultadoImportClientes>>('/clientes/import', { method: 'POST', body: JSON.stringify({ base64 }) }, 120_000),
  backfill: (clienteId?: string) => request<Ok<BackfillResultado>>('/clientes/backfill', { method: 'POST', body: JSON.stringify(clienteId ? { clienteId } : {}) }, 120_000),
  asegurarPropio: () => request<Ok<{ id: string; rfc: string; creado: boolean }>>('/clientes/asegurar-propio', { method: 'POST', body: '{}' }),
  /** Alcance del usuario actual: null = todos los clientes. */
  alcance: () => request<Ok<{ clienteIds: string[] | null }>>('/clientes/alcance'),
  alcanceDeUsuario: (userId: string) => request<Ok<{ clienteIds: string[] | null }>>(`/clientes/usuarios/${userId}/alcance`),
  fijarAlcanceDeUsuario: (userId: string, clienteIds: string[] | null) =>
    request<Ok<{ asignaciones: number; clienteIds: string[] | null }>>(`/clientes/usuarios/${userId}/alcance`, { method: 'PUT', body: JSON.stringify({ clienteIds }) }),
}

// ── Aprobaciones ─────────────────────────────────────────────────────────

export type TipoAprobacion = 'clasificacion' | 'cotizacion'

export interface PendienteAprobacion {
  tipo: TipoAprobacion
  id: string
  titulo: string
  detalle: string
  fractionCode: string
  clienteId: string | null
  cliente: { rfc: string; razonSocial: string } | null
  propuestoPor: { id: string; name: string; email: string } | null
  createdAt: string
}

export interface ConteoAprobaciones { clasificaciones: number; cotizaciones: number; total: number }

export const aprobacionesApi = {
  pendientes: () => request<Ok<PendienteAprobacion[]>>('/aprobaciones/pendientes'),
  conteo: () => request<Ok<ConteoAprobaciones>>('/aprobaciones/conteo'),
  aprobar: (tipo: TipoAprobacion, id: string, motivo?: string) =>
    request<Ok<{ id: string; status: string }>>(`/aprobaciones/${tipo}/${id}/aprobar`, { method: 'POST', body: JSON.stringify(motivo ? { motivo } : {}) }),
  rechazar: (tipo: TipoAprobacion, id: string, motivo: string) =>
    request<Ok<{ id: string; status: string }>>(`/aprobaciones/${tipo}/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  proponer: (tipo: TipoAprobacion, id: string, motivo?: string) =>
    request<Ok<{ id: string; status: string }>>(`/aprobaciones/${tipo}/${id}/proponer`, { method: 'POST', body: JSON.stringify(motivo ? { motivo } : {}) }),
}
