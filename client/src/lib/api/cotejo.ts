/**
 * API del tablero de deuda de cotejo (Operación 2026-08, prioridad 2).
 * Importa `request` de api-core (regla: no tocar api.ts).
 */
import { request } from '../api-core'

export type BloqueDeuda = 'cuotas' | 'precedentes' | 'corpus' | 'origen' | 'fracciones' | 'operacion'
export type EstadoMetrica = 'cerrada' | 'en_curso' | 'sin_empezar' | 'sin_estructura' | 'sin_universo'

export interface Metrica {
  clave: string
  bloque: BloqueDeuda
  titulo: string
  ambito: 'producto' | 'tenant'
  universo: number
  conDato: number
  faltan: number
  porcentaje: number | null
  estado: EstadoMetrica
  consulta: string
  queFalta: string
  fuenteOficial: string
  cargador: string | null
  ultimoMovimiento: string | null
  desde: string | null
  diasDeDeuda: number | null
  envejecida: boolean
  impacto: number
  nota?: string
}

export interface FraccionUso {
  fractionCode: string
  codeFormatted: string
  descripcion: string | null
  usos: number
  ultimaVez: string | null
  nico: boolean
  prosec: boolean
  prosecCotejada: boolean
  precioEstimado: boolean
  precioEstimadoOficial: boolean
  anexo21: boolean
  correlativa: boolean
  cuotas: number
  cuotasCotejadas: number
  faltantes: string[]
  enCatalogo: boolean
}

export interface TableroCotejo {
  generadoAt: string
  tenantId: string
  clienteId: string | { in: string[] } | null
  umbralDias: number
  topFracciones: FraccionUso[]
  metricas: Metrica[]
  resumen: {
    metricas: number
    cerradas: number
    conDeuda: number
    envejecidas: number
    filasPendientes: number
    porcentajeGlobal: number | null
  }
}

export interface DefCargador {
  tipo: string
  titulo: string
  destino: string
  fuenteOficial: string
  columnas: string[]
  clave: string
  metricas: string[]
  schemaRequerido: string | null
}

export interface ReporteCarga {
  tipo: string
  total: number
  aceptadas: number
  rechazadas: number
  creadas: number
  actualizadas: number
  duplicadasEnArchivo: number
  dryRun: boolean
  schemaRequerido: string | null
  filas: { fila: number; clave: string | null; ok: boolean; errores: string[]; accion: string }[]
}

export interface ResultadoAlertas {
  creadas: number
  actualizadas: number
  resueltas: number
  metricas: string[]
  umbralDias: number
}

const BASE = '/admin/cotejo'

function cabeceras(): Record<string, string> {
  const token = (() => { try { return localStorage.getItem('aduanai_token') } catch { return null } })()
  const cliente = (() => { try { return localStorage.getItem('aduanai_cliente') } catch { return null } })()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cliente ? { 'X-Cliente-Id': cliente } : {}) }
}

/** Descarga autenticada de un .xlsx (el blob no pasa por `request`, que asume JSON). */
async function descargar(url: string, nombre: string): Promise<void> {
  const res = await fetch(url, { headers: cabeceras() })
  if (!res.ok) throw new Error('No se pudo descargar el archivo')
  const blob = await res.blob()
  const objeto = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objeto
  a.download = nombre
  a.click()
  URL.revokeObjectURL(objeto)
}

export const cotejoApi = {
  estado: (top = 20) => request<{ status: string; data: TableroCotejo }>(`${BASE}/estado?top=${top}`),
  cargadores: () => request<{ status: string; data: DefCargador[] }>(`${BASE}/cargadores`),
  sincronizarAlertas: () => request<{ status: string; data: ResultadoAlertas }>(`${BASE}/alertas`, { method: 'POST' }),
  exportXlsx: (top = 20) => descargar(`/api${BASE}/export.xlsx?top=${top}`, `deuda-de-cotejo-${new Date().toISOString().slice(0, 10)}.xlsx`),
  plantilla: (tipo: string) => descargar(`/api${BASE}/cargadores/${encodeURIComponent(tipo)}/plantilla.xlsx`, `plantilla-${tipo}.xlsx`),
  importar: (tipo: string, archivoBase64: string, nombreArchivo: string, dryRun: boolean) =>
    request<{ status: string; data: ReporteCarga; aviso: string | null }>(
      `${BASE}/cargadores/${encodeURIComponent(tipo)}/importar`,
      { method: 'POST', body: JSON.stringify({ archivoBase64, nombreArchivo, dryRun }) },
    ),
}

/** File → base64 sin el prefijo data:. */
export function archivoABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => {
      const r = String(lector.result ?? '')
      const coma = r.indexOf(',')
      resolve(coma >= 0 ? r.slice(coma + 1) : r)
    }
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(file)
  })
}
