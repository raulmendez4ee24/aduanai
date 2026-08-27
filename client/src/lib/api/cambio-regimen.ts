/** API — Asistente de cambio de régimen F4/F5/A3/RT y activo fijo (Operación 2026-08). */
import { request } from '../api-core'

export type TipoCambio = 'F4' | 'F5' | 'A3' | 'RT'
export interface DocumentoRequerido { clave: string; label: string; obligatorio: boolean }
export interface CandidataTI {
  id: string; pedimento: string; fractionCode: string; description: string; quantity: number; quantityDischarged: number; unit: string
  customsValue: number; expirationDate: string; status: string; tipo: string; clienteId: string | null; saldo: number
}
export interface PartidaCalculo {
  temporaryImportId: string; pedimento: string; fractionCode: string; description: string; unit: string
  cantidadImportada: number; cantidadDescargada: number; saldoCantidad: number; valorAduanaUSD: number; saldoValorUSD: number; saldoValorMXN: number
  tasas: { igiPct: number; dtaPct: number; ivaPct: number; iepsPct: number }
  montos: { igi: number; dta: number; ieps: number; iva: number; total: number }
  notas: string[]
}
export interface CampoEditable { montoMXN: number; editable: true; fundamento: string; cotejo: 'pendiente' | 'ok' }
export interface CalculoExpediente {
  tipo: TipoCambio; descripcion: string; clavePedimento: { clave: string; descripcion: string } | null
  tc: { valor: number; fuente: string; fecha: string | null }
  partidas: PartidaCalculo[]
  subtotales: { saldoValorMXN: number; igi: number; dta: number; ieps: number; iva: number; contribuciones: number }
  actualizacion: CampoEditable; recargos: CampoEditable; total: number
  documentos: DocumentoRequerido[]; advertencias: string[]; calculadoAt: string; folio?: string
}
export interface Expediente {
  id: string; tenantId: string; clienteId: string | null; userId: string; tipo: TipoCambio; temporaryImportIds: string[]
  calculo: CalculoExpediente; quoteId: string | null; estado: 'borrador' | 'listo' | 'presentado'; notas: string | null; createdAt: string; updatedAt: string
}
export interface EntradaCalculo { temporaryImportIds: string[]; tipo: TipoCambio; tc?: number; actualizacionMXN?: number; recargosMXN?: number; notas?: string }

export const cambioRegimenApi = {
  tipos: () => request<{ status: string; data: { tipo: TipoCambio; descripcion: string; documentos: DocumentoRequerido[] }[] }>('/cambio-regimen/tipos'),
  candidatas: (ids?: string[]) => request<{ status: string; data: CandidataTI[] }>(`/cambio-regimen/candidatas${ids && ids.length ? `?ids=${encodeURIComponent(ids.join(','))}` : ''}`),
  calcular: (body: EntradaCalculo) => request<{ status: string; data: CalculoExpediente }>('/cambio-regimen/calcular', { method: 'POST', body: JSON.stringify(body) }),
  crear: (body: EntradaCalculo) => request<{ status: string; data: Expediente }>('/cambio-regimen', { method: 'POST', body: JSON.stringify(body) }),
  listar: () => request<{ status: string; data: Expediente[] }>('/cambio-regimen'),
  obtener: (id: string) => request<{ status: string; data: Expediente }>(`/cambio-regimen/${encodeURIComponent(id)}`),
  actualizar: (id: string, body: { estado?: string; notas?: string | null; actualizacionMXN?: number; recargosMXN?: number }) => request<{ status: string; data: Expediente }>(`/cambio-regimen/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /** Abre la vista imprimible (HTML con print CSS + folio) en una pestaña. */
  abrirImprimible: async (id: string): Promise<void> => {
    const token = localStorage.getItem('aduanai_token')
    const res = await fetch(`/api/cambio-regimen/${encodeURIComponent(id)}/imprimible`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error('No se pudo generar la vista imprimible')
    const html = await res.text()
    const w = window.open('', '_blank')
    if (!w) throw new Error('El navegador bloqueó la ventana')
    w.document.open(); w.document.write(html); w.document.close()
  },
}

export interface ActivoFijo {
  id: string; pedimento: string; fractionCode: string; description: string; quantity: number; quantityDischarged: number; unit: string
  customsValue: number; valueMXN: number | null; supplier: string | null; originCountry: string | null; entryDate: string; status: string; clienteId: string | null
  claveDocumento: string | null; vidaUtilMeses: number | null; ubicacion: { id: string; nombre: string } | null
  mesesTranscurridos: number; vidaUtilRestanteMeses: number | null
  opcionesSalida: { tipo: 'RT' | 'F5'; label: string; ruta: string }[]
}
export interface AltaActivoFijo {
  pedimento: string; fractionCode: string; description?: string; quantity: number; unit: string; customsValue: number; valueMXN?: number
  supplier?: string; originCountry?: string; entryDate: string; vidaUtilMeses?: number | null; notes?: string
}

export const activoFijoApi = {
  listar: () => request<{ status: string; data: ActivoFijo[] }>('/inventory/activo-fijo'),
  crear: (body: AltaActivoFijo) => request<{ status: string; data: { id: string } }>('/inventory/activo-fijo', { method: 'POST', body: JSON.stringify(body) }),
}
