/**
 * API del Clasificador en lote + adjuntos + dictamen humano + hermanas
 * (Ola 1, Operación 2026-08). Importa `request` de api-core (api.ts no se toca).
 */
import { request, clienteActivo } from '../api-core'

export type Semaforo = 'verde' | 'ambar' | 'rojo'
export type EstadoLote = 'queued' | 'running' | 'done' | 'failed'

export interface Lote {
  id: string
  nombreArchivo: string
  totalFilas: number
  procesadas: number
  verdes: number
  ambar: number
  rojas: number
  status: EstadoLote
  errorMsg: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  clienteId: string | null
  userId: string
  pendientes?: number
}

export interface FilaLote {
  id: string
  batchId: string
  numeroFila: number
  productCode: string | null
  descripcion: string
  contexto: string | null
  paisOrigen: string | null
  valorUSD: number | null
  usoDestino: string | null
  semaforo: Semaforo | null
  fractionCode: string | null
  confidence: number | null
  coincideCatalogo: boolean | null
  fraccionCatalogo: string | null
  classificationId: string | null
  jobId: string | null
  productId: string | null
  error: string | null
  revisado: boolean
}

export interface ResultadoImport {
  id: string
  totalFilas: number
  omitidas: Array<{ numeroFila: number; motivo: string }>
  columnas: Record<string, string>
  maxFilas: number
}

export interface Adjunto {
  id: string
  name: string
  type: string
  fileName: string | null
  fileSize: number | null
  mimeType: string | null
  fileHash: string | null
  notes: string | null
  createdAt: string
}

export interface SolicitudDictamen {
  id: string
  classificationId: string | null
  solicitadoPor: string
  asignadoA: string | null
  motivo: string | null
  estado: 'abierta' | 'en_revision' | 'dictaminada' | 'rechazada'
  dictamen: { fractionCode?: string; nico?: string | null; fundamento?: string; dictaminadoPor?: string; fecha?: string; rechazo?: boolean; motivo?: string | null } | null
  createdAt: string
  resueltaAt: string | null
  clasificacion: { id: string; inputDescription: string; fractionCode: string; fractionDescription: string | null; confidence: number; status: string } | null
  solicitante: { id: string; name: string | null; email: string } | null
}

export interface SubpartidaHermana {
  code: string
  codeFormatted: string
  description: string
  elegida: boolean
  fracciones: Array<{ code: string; codeFormatted: string; description: string; elegida: boolean }>
}

export const USOS_DESTINO = [
  { valor: 'INSUMO_IMMEX', label: 'Insumo IMMEX (importación temporal)' },
  { valor: 'VENTA_DIRECTA', label: 'Venta directa (importación definitiva)' },
  { valor: 'ACTIVO_FIJO', label: 'Activo fijo' },
] as const
export type UsoDestino = typeof USOS_DESTINO[number]['valor']

function headersAuth(): Record<string, string> {
  const token = localStorage.getItem('aduanai_token')
  const cliente = clienteActivo()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cliente ? { 'X-Cliente-Id': cliente } : {}),
  }
}

/** Descarga autenticada (los endpoints .xlsx no aceptan token por query). */
export async function descargarArchivo(path: string, nombreSugerido: string): Promise<void> {
  const res = await fetch(`/api${path}`, { headers: headersAuth() })
  if (!res.ok) {
    let msg = `No pude descargar (${res.status}).`
    try { const j = await res.json(); if (j?.message) msg = j.message } catch { /* sin cuerpo JSON */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = /filename="([^"]+)"/.exec(cd)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = m?.[1] ?? nombreSugerido
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function archivoABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = String(fr.result ?? '')
      resolve(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s)
    }
    fr.onerror = () => reject(new Error('No pude leer el archivo.'))
    fr.readAsDataURL(file)
  })
}

export const apiLote = {
  importar: (nombreArchivo: string, base64: string) =>
    request<{ status: string; data: ResultadoImport }>('/clasificacion-lote/import', {
      method: 'POST',
      body: JSON.stringify({ nombreArchivo, base64 }),
    }, 60000),

  lista: () => request<{ status: string; data: Lote[]; umbrales: { alta: number; media: number } }>('/clasificacion-lote'),

  detalle: (id: string) => request<{ status: string; data: Lote }>(`/clasificacion-lote/${encodeURIComponent(id)}`, undefined, 15000),

  filas: (id: string, semaforo?: Semaforo | 'pendiente' | '') =>
    request<{ status: string; data: FilaLote[] }>(
      `/clasificacion-lote/${encodeURIComponent(id)}/filas${semaforo ? `?semaforo=${semaforo}` : ''}`,
      undefined,
      20000,
    ),

  revisar: (loteId: string, filaId: string, body: { fractionCode?: string; nota?: string }) =>
    request<{ status: string; data: FilaLote }>(`/clasificacion-lote/${encodeURIComponent(loteId)}/filas/${encodeURIComponent(filaId)}/revisar`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  descargarExport: (id: string, nombreArchivo: string) =>
    descargarArchivo(`/clasificacion-lote/${encodeURIComponent(id)}/export.xlsx`, `${nombreArchivo.replace(/\.(xlsx|xls|csv)$/i, '')}-clasificado.xlsx`),

  descargarPlantilla: () => descargarArchivo('/clasificacion-lote/plantilla.xlsx', 'plantilla-clasificacion-lote.xlsx'),
}

export const apiAdjuntos = {
  // Bajo /api/documents/clasificacion: tope de body 50 MB (adjuntos hasta 10 MB).
  lista: (classificationId: string) =>
    request<{ status: string; data: Adjunto[] }>(`/documents/clasificacion/${encodeURIComponent(classificationId)}/adjuntos`),

  subir: (classificationId: string, body: { nombre: string; mimeType: string; base64: string; tipo: string }) =>
    request<{ status: string; data: Adjunto; duplicado: boolean }>(`/documents/clasificacion/${encodeURIComponent(classificationId)}/adjuntos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, 120000),

  urlArchivo: (classificationId: string, docId: string) =>
    `/documents/clasificacion/${encodeURIComponent(classificationId)}/adjuntos/${encodeURIComponent(docId)}/archivo`,

  abrir: (classificationId: string, docId: string, nombre: string) =>
    descargarArchivo(apiAdjuntos.urlArchivo(classificationId, docId), nombre),
}

export const apiDictamen = {
  solicitar: (classificationId: string, motivo?: string) =>
    request<{ status: string; data: SolicitudDictamen; existente: boolean }>(`/classify/${encodeURIComponent(classificationId)}/solicitar-dictamen`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    }),

  bandeja: (estado?: SolicitudDictamen['estado'] | '') =>
    request<{ status: string; data: SolicitudDictamen[] }>(`/dictamenes${estado ? `?estado=${estado}` : ''}`),

  resolver: (id: string, body: { fractionCode: string; nico?: string; fundamento: string }) =>
    request<{ status: string; data: SolicitudDictamen; classificationId: string }>(`/dictamenes/${encodeURIComponent(id)}/resolver`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  rechazar: (id: string, motivo: string) =>
    request<{ status: string; data: SolicitudDictamen }>(`/dictamenes/${encodeURIComponent(id)}/rechazar`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    }),
}
