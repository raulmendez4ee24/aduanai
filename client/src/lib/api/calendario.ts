/** API — Calendario de obligaciones (Operación 2026-08). */
import { request } from '../api-core'

export type EstadoObligacion = 'pendiente' | 'en_curso' | 'cumplida' | 'vencida'
export type Semaforo = 'rojo' | 'ambar' | 'verde' | 'gris'

export interface Obligacion {
  id: string
  tenantId: string
  clienteId: string | null
  tipo: string
  titulo: string
  descripcion: string | null
  fundamento: string | null
  fechaLimite: string
  recurrencia: string | null
  responsableUserId: string | null
  estado: EstadoObligacion
  cumplidaAt: string | null
  evidenciaDocumentId: string | null
  consecuencia: string | null
  createdAt: string
  updatedAt: string
  semaforo: Semaforo
}
export interface ObligacionDetalle extends Obligacion {
  evidencia: { id: string; name: string; fileName: string | null; fileUrl: string | null; createdAt: string } | null
  responsable: { id: string; name: string; email: string } | null
}
export interface Responsable { id: string; name: string; email: string }
export interface ObligacionBase {
  tipo: string; titulo: string; descripcion: string; fundamento: string; cotejo: 'ok' | 'pendiente'
  recurrencia: string; consecuencia: string; requiere: string | null; proximaFecha: string
}
export interface EntradaObligacion {
  tipo: string; titulo: string; descripcion?: string | null; fundamento?: string | null; fechaLimite: string
  recurrencia?: string | null; responsableUserId?: string | null; consecuencia?: string | null; clienteId?: string | null; estado?: EstadoObligacion
}

export const calendarioApi = {
  listar: (q: { estado?: string; desde?: string; hasta?: string } = {}) => {
    const p = new URLSearchParams()
    if (q.estado) p.set('estado', q.estado)
    if (q.desde) p.set('desde', q.desde)
    if (q.hasta) p.set('hasta', q.hasta)
    const qs = p.toString()
    return request<{ status: string; data: Obligacion[]; responsables: Responsable[] }>(`/calendario${qs ? `?${qs}` : ''}`)
  },
  catalogoBase: () => request<{ status: string; data: ObligacionBase[]; tipos: string[]; recurrencias: string[]; estados: string[] }>('/calendario/catalogo-base'),
  obtener: (id: string) => request<{ status: string; data: ObligacionDetalle }>(`/calendario/${encodeURIComponent(id)}`),
  crear: (body: EntradaObligacion) => request<{ status: string; data: Obligacion }>('/calendario', { method: 'POST', body: JSON.stringify(body) }),
  actualizar: (id: string, body: Partial<EntradaObligacion>) => request<{ status: string; data: Obligacion }>(`/calendario/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  cumplir: (id: string, evidenciaDocumentId?: string | null) => request<{ status: string; data: { cumplida: Obligacion; siguiente: Obligacion | null } }>(`/calendario/${encodeURIComponent(id)}/cumplir`, { method: 'POST', body: JSON.stringify({ evidenciaDocumentId: evidenciaDocumentId ?? null }) }),
  eliminar: (id: string) => request<{ status: string }>(`/calendario/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  sembrarBase: (body: { tieneIMMEX?: boolean; tieneCertIVAIEPS?: boolean } = {}) => request<{ status: string; data: { creadas: number; existentes: number; omitidas: string[] } }>('/calendario/sembrar-base', { method: 'POST', body: JSON.stringify(body) }),
  procesarVencimientos: () => request<{ status: string; data: { vencidas: number; alertas: number } }>('/calendario/procesar-vencimientos', { method: 'POST' }),
  /** Descarga el Excel (usa el token del localStorage porque es un blob, no JSON). */
  exportXlsx: async (): Promise<void> => {
    const token = localStorage.getItem('aduanai_token')
    const cliente = localStorage.getItem('aduanai_cliente')
    const res = await fetch('/api/calendario/export.xlsx', { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cliente ? { 'X-Cliente-Id': cliente } : {}) } })
    if (!res.ok) throw new Error('No se pudo exportar el Excel')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `calendario-obligaciones-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  },
}
