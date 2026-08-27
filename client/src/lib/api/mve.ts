/**
 * Auto MVE — API Ola 2 ("el resto del formato E2"). No toca api.ts.
 */
import { request } from '../api-core'

export type Cotejo = 'ley' | 'pendiente'
export interface OpcionCatalogo { clave: string; etiqueta: string; fundamento?: string; orden?: number; cotejo: Cotejo }
export interface CatalogosE2 {
  metodosValoracion: OpcionCatalogo[]
  incrementables: OpcionCatalogo[]
  decrementables: OpcionCatalogo[]
  formasPago: OpcionCatalogo[]
  notas: { claves: string; formasPago: string; transmision: string; vigencia: string; layout: string }
}

export interface AjusteConcepto { concepto: string; monto: number; descripcion?: string | null }

export interface ExtraccionE2 {
  providerName: string
  providerCountry: string
  providerTaxId?: string | null
  invoiceNumber: string
  invoiceDate: string
  incoterm: string
  currency: string
  items: { description: string; quantity: number; unitPrice: number; totalPrice: number }[]
  subtotal: number
  freight?: number | null
  insurance?: number | null
  otherCharges?: number | null
  totalValue: number
  paymentTerms?: string | null
  notes?: string | null
  formaPago?: string | null
  plazoPagoDias?: number | null
  metodoValoracion?: string | null
  incrementables?: AjusteConcepto[]
  decrementables?: AjusteConcepto[]
  hasVinculacion?: boolean | null
  vinculacionDesc?: string | null
  vinculacionAfectaPrecio?: boolean | null
  pesoBrutoKg?: number | null
  pesoNetoKg?: number | null
  rfcImportador?: string | null
}

export interface PlantillaAplicada { id: string; proveedorNombre: string; usos: number; camposAplicados: string[] }

export interface CuerpoMVE {
  pedimento?: string | null
  providerName: string
  providerCountry: string
  invoiceNumber: string
  invoiceDate: string
  incoterm: string
  currency: string
  exchangeRate?: number | null
  invoiceValue: number
  incrementables: AjusteConcepto[]
  decrementables: AjusteConcepto[]
  hasVinculacion: boolean
  vinculacionDesc?: string | null
  vinculacionAfectaPrecio?: boolean | null
  metodoValoracion: string
  formaPago?: string | null
  plazoPagoDias?: number | null
  paymentTerms?: string | null
  rfcImportador?: string | null
  pesoBrutoKg?: number | null
  pesoNetoKg?: number | null
  vigenciaHasta?: string | null
  plantillaId?: string | null
}

export interface MVEE2Record {
  id: string
  pedimento?: string | null
  providerName: string
  providerCountry: string
  invoiceNumber: string
  invoiceDate: string
  incoterm: string
  currency: string
  invoiceValue: number
  freightValue: number
  insuranceValue: number
  otherIncrements: number
  customsValue: number
  hasVinculacion: boolean
  status: string
  estadoTransmision: 'lista_para_transmitir' | 'transmitida_por_usuario'
  metodoValoracion?: string | null
  formaPago?: string | null
  rfcImportador?: string | null
  pesoBrutoKg?: number | null
  vigenciaHasta?: string | null
  plantillaId?: string | null
  transmittedAt?: string | null
  createdAt: string
  formatoE2?: { transmision?: { folioVucem?: string | null; fechaTransmision?: string | null } } | null
}

export interface Cuadre { cuadra: boolean; diferencias: string[]; totalIncrementables: number; totalDecrementables: number }

export interface PlantillaProveedor {
  id: string
  proveedorNombre: string
  proveedorPais?: string | null
  usos: number
  updatedAt: string
  campos: {
    incoterm?: string; currency?: string; metodoValoracion?: string; formaPago?: string | null; plazoPagoDias?: number | null
    hasVinculacion?: boolean; incrementablesTipicos?: string[]; decrementablesTipicos?: string[]
  }
}

export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'gris'
export interface VigenciaProveedor {
  proveedor: string; pais: string; mves: number; ultimaMveId: string; ultimaFactura: string
  vigenciaHasta: string | null; semaforo: Semaforo; diasRestantes: number | null; estadoTransmision: string
}

export interface ResultadoLoteFila {
  indice: number; nombre: string | null; ok: boolean; mveId?: string; proveedor?: string; factura?: string
  customsValue?: number; plantillaAplicada?: PlantillaAplicada | null; cuadra?: boolean; error?: string
}
export interface ResultadoLote { total: number; creadas: number; fallidas: number; resultados: ResultadoLoteFila[] }

export interface LayoutE2 {
  aviso: string
  campos: { seccion: string; campo: string; valor: string | number | boolean | null }[]
  json: Record<string, unknown>
  estadoTransmision: string
}

export const mveApi = {
  catalogos: () => request<{ status: string; data: CatalogosE2 }>('/mve/catalogos'),

  extraer: (invoiceText: string) =>
    request<{ status: string; data: ExtraccionE2; plantillaAplicada: PlantillaAplicada | null; rfcContexto: string | null }>('/mve/extract-invoice', {
      method: 'POST', body: JSON.stringify({ invoiceText }),
    }),

  crear: (data: CuerpoMVE) =>
    request<{ status: string; data: MVEE2Record; cuadre: Cuadre }>('/mve', { method: 'POST', body: JSON.stringify(data) }),

  editar: (id: string, data: Partial<CuerpoMVE>) =>
    request<{ status: string; data: MVEE2Record; cuadre: Cuadre }>(`/mve/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listar: (params: { page?: number; proveedor?: string } = {}) => {
    const q = new URLSearchParams({ page: String(params.page ?? 1), limit: '50' })
    if (params.proveedor) q.set('proveedor', params.proveedor)
    return request<{ status: string; data: MVEE2Record[]; pagination: { page: number; limit: number; total: number } }>(`/mve?${q}`)
  },

  plantillas: () => request<{ status: string; data: PlantillaProveedor[] }>('/mve/plantillas'),

  vigencias: () => request<{ status: string; data: { proveedores: VigenciaProveedor[]; nota: string; resumen: Record<Semaforo, number> } }>('/mve/vigencias'),

  lote: (facturas: { nombre?: string; contenidoBase64?: string; texto?: string }[]) =>
    request<{ status: string; loteId: string; data: ResultadoLote }>('/mve/lote', { method: 'POST', body: JSON.stringify({ facturas }) }, 600_000),

  layout: (id: string) => request<{ status: string; data: LayoutE2 }>(`/mve/${id}/layout`),

  /** URL de descarga directa del XML (misma sesión: el navegador manda cookies/no JWT; se usa fetch+blob). */
  descargarLayoutXml: async (id: string, invoiceNumber: string) => {
    const token = localStorage.getItem('aduanai_token')
    const res = await fetch(`/api/mve/${id}/layout?formato=xml`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error('No se pudo generar el layout')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `mve-${invoiceNumber.replace(/[^A-Za-z0-9_-]+/g, '_')}-layout-trabajo.xml`; a.click()
    URL.revokeObjectURL(url)
  },

  marcarTransmitida: (id: string, folioVucem: string, fechaTransmision: string) =>
    request<{ status: string; data: MVEE2Record }>(`/mve/${id}/marcar-transmitida`, { method: 'POST', body: JSON.stringify({ folioVucem, fechaTransmision }) }),
}
