/**
 * API del catálogo maestro de partes (Ola 1, Operación 2026-08).
 * Importa `request` de api-core (no se toca lib/api.ts).
 */
import { request } from '../api-core'

export type UsoDestino = 'INSUMO_IMMEX' | 'VENTA_DIRECTA' | 'ACTIVO_FIJO'
export type EstadoVersion = 'propuesta' | 'vigente' | 'reemplazada' | 'rechazada'
export type FuenteVersion = 'manual' | 'clasificador' | 'historial' | 'lote'

export interface VersionParte {
  id: string
  version: number
  fractionCode: string
  nico: string | null
  justificacion: string | null
  fuente: FuenteVersion | string
  classificationId: string | null
  estado: EstadoVersion | string
  propuestoPor: string
  propuestoPorNombre: string | null
  aprobadoPor: string | null
  aprobadoPorNombre: string | null
  aprobadoAt: string | null
  tigieVersion: string | null
  createdAt: string
}

export interface ParteResumen {
  id: string
  productCode: string
  description: string
  unit: string
  fractionCode: string | null
  nico: string | null
  noms: unknown
  usoDestino: UsoDestino | string | null
  paisOrigen: string | null
  clienteId: string | null
  clienteNombre: string | null
  versionVigente: number
  versiones: number
  propuestasPendientes: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface ParteDetalle extends Omit<ParteResumen, 'versiones'> {
  totalVersiones: number
  versiones: VersionParte[]
}

export interface FiltrosCatalogo {
  q?: string
  capitulo?: string
  dictamen?: 'con' | 'sin' | ''
  usoDestino?: string
  page?: number
  limit?: number
}

export interface ReporteImport {
  total: number
  creadas: number
  actualizadas: number
  versionesPropuestas: number
  errores: { fila: number; productCode: string; mensaje: string }[]
  ids: string[]
}

export interface CatalogoHit {
  productId: string
  productCode: string
  description: string
  fractionCode: string
  nico: string | null
  version: number
  aprobadoAt: string | null
  aprobadoPorNombre: string | null
}

/**
 * Dictamen vigente de una parte por número de parte (GET /catalogo/por-codigo/:code).
 * Lo consumen Cotizador (autocompletar fracción) e Inventario. `tieneDictamen:false`
 * = la parte existe pero nadie ha aprobado una versión: NO hay fracción que usar.
 */
export interface DictamenPorCodigo {
  productId: string
  productCode: string
  description: string
  unit: string
  clienteId: string | null
  usoDestino: UsoDestino | string | null
  paisOrigen: string | null
  tieneDictamen: boolean
  fractionCode: string | null
  fractionCodeFormateada: string | null
  nico: string | null
  version: number
  aprobadoAt: string | null
  aprobadoPorNombre: string | null
  propuestasPendientes: number
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

export const catalogoApi = {
  listar: (f: FiltrosCatalogo = {}) =>
    request<{ status: string; data: ParteResumen[]; pagination: { page: number; limit: number; total: number }; catalogos: { usosDestino: UsoDestino[]; fuentes: FuenteVersion[] } }>(
      `/catalogo${qs({ q: f.q, capitulo: f.capitulo, dictamen: f.dictamen, usoDestino: f.usoDestino, page: f.page, limit: f.limit })}`,
    ),

  obtener: (id: string) => request<{ status: string; data: ParteDetalle }>(`/catalogo/${encodeURIComponent(id)}`),

  crear: (d: { productCode: string; description: string; unit?: string; usoDestino?: string | null; paisOrigen?: string | null; fractionCode?: string | null; nico?: string | null; justificacion?: string | null; clienteId?: string | null }) =>
    request<{ status: string; data: ParteDetalle }>('/catalogo', { method: 'POST', body: JSON.stringify(d) }),

  actualizar: (id: string, d: Partial<{ description: string; unit: string; usoDestino: string | null; paisOrigen: string | null; clienteId: string | null; active: boolean }>) =>
    request<{ status: string; data: ParteDetalle }>(`/catalogo/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(d) }),

  desactivar: (id: string) => request<{ status: string }>(`/catalogo/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  proponerVersion: (id: string, d: { fractionCode: string; nico?: string | null; justificacion?: string | null; fuente?: FuenteVersion; aprobar?: boolean }) =>
    request<{ status: string; data: { version: VersionParte; parte: ParteDetalle } }>(`/catalogo/${encodeURIComponent(id)}/versiones`, { method: 'POST', body: JSON.stringify(d) }),

  aprobarVersion: (id: string, version: number) =>
    request<{ status: string; data: { version: VersionParte; parte: ParteDetalle } }>(`/catalogo/${encodeURIComponent(id)}/versiones/${version}/aprobar`, { method: 'POST' }),

  rechazarVersion: (id: string, version: number, motivo?: string) =>
    request<{ status: string; data: { version: VersionParte; parte: ParteDetalle } }>(`/catalogo/${encodeURIComponent(id)}/versiones/${version}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) }),

  promover: (d: { classificationId: string; productCode?: string; unit?: string; usoDestino?: string; justificacion?: string }) =>
    request<{ status: string; data: { creada: boolean; sinCambio: boolean; parte: ParteDetalle; version: VersionParte } }>('/catalogo/promover', { method: 'POST', body: JSON.stringify(d) }),

  /**
   * Fracción vigente + NICO + uso/destino de un número de parte. 404 cuando la
   * parte no existe (o cae fuera del alcance de cliente) — el llamador debe
   * tratarlo como "sin dictamen", nunca como error rojo.
   */
  porCodigo: (productCode: string) =>
    request<{ status: string; data: DictamenPorCodigo; nota: string | null }>(`/catalogo/por-codigo/${encodeURIComponent(productCode)}`),

  buscarPorDescripcion: (q: string) =>
    request<{ status: string; data: { exacta: ParteResumen | null; similares: ParteResumen[] } }>(`/catalogo/buscar-por-descripcion${qs({ q })}`),

  importar: (d: { archivoBase64: string; nombreArchivo: string }) =>
    request<{ status: string; data: ReporteImport }>('/catalogo/import', { method: 'POST', body: JSON.stringify(d) }, 120000),

  /** URL de descarga (el navegador la abre con el token en header vía descargar()). */
  exportUrl: (f: FiltrosCatalogo = {}) => `/api/catalogo/export.xlsx${qs({ q: f.q, capitulo: f.capitulo, dictamen: f.dictamen, usoDestino: f.usoDestino })}`,

  /**
   * El Clasificador consulta el catálogo antes de correr: con `productCode`
   * vigente el servidor responde `reused:true` SIN correr el modelo; si no,
   * responde 202 con jobId (+ `catalogoSugerido` si la descripción coincide).
   */
  clasificarConCatalogo: (d: { description: string; productCode?: string; countryOfOrigin?: string; declaredValueUSD?: number; declaredQuantity?: number; useCase?: string; importerType?: string; forzar?: boolean; justificacion?: string }) =>
    request<
      | { status: string; reused: true; catalogo: CatalogoHit; message: string; jobId?: undefined }
      | { status: string; reused: boolean; jobId: string; description: string | null; catalogoSugerido: CatalogoHit | null; parteEnCatalogo: { productId: string; productCode: string; creada: boolean } | null; catalogo?: undefined }
    >('/classify', { method: 'POST', body: JSON.stringify(d) }, 30000),
}

// ──────────────────────────────────────────────────────────────────
// Historial → catálogo (endpoints en /api/classify)
// ──────────────────────────────────────────────────────────────────

export interface FiltrosHistorial {
  search?: string
  fractionCode?: string
  capitulo?: string
  desde?: string
  hasta?: string
  confianzaMin?: number | ''
  confianzaMax?: number | ''
  feedback?: '' | 'correct' | 'incorrect' | 'partial' | 'sin'
  page?: number
  limit?: number
  ids?: string[]
}

export interface GrupoHistorial {
  clave: string
  descripcion: string
  conteo: number
  fracciones: { fractionCode: string; conteo: number }[]
  fraccionDominante: string
  consistente: boolean
  confianzaPromedio: number
  feedback: { correct: number; incorrect: number; partial: number; sin: number }
  ultimaFecha: string
  ids: string[]
  promovibleId: string | null
  enCatalogo: { productId: string; productCode: string; fractionCode: string | null; versionVigente: number } | null
  clienteId: string | null
}

export interface AciertoCapitulo {
  capitulo: string
  conFeedback: number
  correct: number
  incorrect: number
  partial: number
  acierto: number | null
  total: number
}

export interface ClasificacionHistorial {
  id: string
  inputDescription: string
  fractionCode: string
  fractionDescription?: string | null
  confidence: number
  feedback?: string | null
  feedbackNote?: string | null
  status?: string
  createdAt: string
  clienteId?: string | null
}

function qsHistorial(f: FiltrosHistorial): string {
  return qs({ search: f.search, fractionCode: f.fractionCode, capitulo: f.capitulo, desde: f.desde, hasta: f.hasta, confianzaMin: f.confianzaMin === '' ? undefined : f.confianzaMin, confianzaMax: f.confianzaMax === '' ? undefined : f.confianzaMax, feedback: f.feedback, page: f.page, limit: f.limit, ids: f.ids && f.ids.length ? f.ids.join(',') : undefined })
}

export const historialApi = {
  listar: (f: FiltrosHistorial) =>
    request<{ status: string; data: ClasificacionHistorial[]; pagination: { page: number; limit: number; total: number } }>(`/classify/history${qsHistorial(f)}`),
  agrupado: (f: FiltrosHistorial) =>
    request<{ status: string; data: GrupoHistorial[]; pagination: { page: number; limit: number; total: number; filasConsideradas: number; truncado: boolean } }>(`/classify/history/agrupado${qsHistorial(f)}`),
  aciertoPorCapitulo: (f: FiltrosHistorial = {}) =>
    request<{ status: string; capitulos: AciertoCapitulo[]; totales: AciertoCapitulo; nota: string }>(`/classify/acierto-por-capitulo${qsHistorial({ ...f, page: undefined, limit: undefined })}`),
  exportUrl: (f: FiltrosHistorial) => `/api/classify/history/export.xlsx${qsHistorial({ ...f, page: undefined, limit: undefined })}`,
  feedback: (id: string, feedback: 'correct' | 'incorrect' | 'partial', feedbackNote?: string) =>
    request<{ status: string }>(`/classify/${encodeURIComponent(id)}/feedback`, { method: 'PATCH', body: JSON.stringify({ feedback, feedbackNote }) }),
  aprobar: (id: string) => request<{ status: string }>(`/classify/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
}

/** Descarga autenticada de un binario (xlsx) con el mismo token/cliente que `request`. */
export async function descargarArchivo(url: string, nombre: string): Promise<void> {
  const token = localStorage.getItem('aduanai_token')
  const cliente = localStorage.getItem('aduanai_cliente')
  const res = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cliente ? { 'X-Cliente-Id': cliente } : {}) },
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: null }))
    throw new Error(e.message || `No se pudo descargar (${res.status})`)
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function archivoABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result ?? '')
      resolve(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s)
    }
    r.onerror = () => reject(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(file)
  })
}

export function formatearFraccion(code: string | null | undefined): string {
  const d = String(code ?? '').replace(/[.\-\s]/g, '')
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : (code ?? '')
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${String(d.getDate()).padStart(2, '0')}-${meses[d.getMonth()]}-${d.getFullYear()}`
}
