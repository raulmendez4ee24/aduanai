/**
 * Fiscal Guardian — API Ola 2 ("calendario vivo de la certificación"). No toca api.ts.
 */
import { request } from '../api-core'

export type SemaforoOb = 'verde' | 'ambar' | 'rojo' | 'gris'
export type Rubro = 'A' | 'AA' | 'AAA'

export interface ObligacionSemaforo {
  clave: string
  titulo: string
  categoria: 'requisito' | 'obligacion' | 'aviso' | 'renovacion'
  rubros: Rubro[]
  fundamento: string
  cotejo: 'corpus' | 'pendiente'
  fuente: string | null
  consecuencia: string
  estado: SemaforoOb
  detalle: string
  fechaLimite?: string | null
  aplica: boolean
}

export interface SemaforoCertificacion {
  rubro: Rubro | null
  vigencia: { meses: number; fuente: string }
  global: SemaforoOb
  resumen: Record<SemaforoOb, number>
  obligaciones: ObligacionSemaforo[]
  pendientesDeCotejo: number
  contexto: Record<string, unknown>
}

export interface DefinicionAviso {
  tipo: string; tipoCalendario: string; titulo: string; fundamento: string; cotejo: 'corpus' | 'pendiente'; plazoDias: number; consecuencia: string
}

export interface ObligacionCalendarioRecord {
  id: string; tipo: string; titulo: string; descripcion?: string | null; fundamento?: string | null
  fechaLimite: string; estado: string; consecuencia?: string | null; clienteId?: string | null
}

export type Bucket = '0-6' | '6-12' | '12-18' | '>18'
export interface Conciliacion {
  periodo: { periodo: string; inicio: string; fin: string; etiqueta: string }
  creditos: {
    otorgadoEnPeriodo: number; descargadoEnPeriodo: number; saldoAlCierre: number; activos: number; totalmenteDescargados: number
    porBucket: Record<Bucket, { creditos: number; saldo: number }>
    detalle: { id: string; pedimento: string; fractionCode: string; creditDate: string; dischargeDeadline: string; otorgado: number; descargadoAlCierre: number; saldoAlCierre: number; antiguedadMeses: number; bucket: Bucket; status: string }[]
  }
  anexo30: { existe: boolean; period: string | null; totalCredits: number; totalDebits: number; balance: number; ivaDeferred: number } | null
  diferencias: { concepto: string; sistema: number; anexo30: number; diferencia: number }[]
  cuadra: boolean | null
  nota: string
}

export interface SimuladorPerdida {
  base: {
    ultimoMes: { desde: string; hasta: string; importaciones: number; valorAduanaUSD: number }
    promedio3Meses: { desde: string; hasta: string; importaciones: number; valorAduanaUSDMensual: number }
  }
  tipoCambio: { rate: number; source: string; asOf: string; isOfficial: boolean; warning: string | null }
  ivaTasa: number
  ivaMensualMXN: { ultimoMes: number; promedio3Meses: number }
  iepsMensualMXN: null
  notaIEPS: string
  garantia: { pct: number | null; costoMensualMXN: number | null; costoAnualMXN: number | null; nota: string }
  sinDatos: boolean
  fundamento: string
}

export interface DescargoResultado {
  usage: { id: string; pedimentoDescargo: string; ivaApplied: number; iepsApplied: number; usageDate: string }
  credito: { id: string; remaining: number; discharged: number; status: string } | null
}

async function descargarArchivo(path: string, nombre: string): Promise<void> {
  const token = localStorage.getItem('aduanai_token')
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error('No se pudo generar el archivo')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}

export const fiscalApi = {
  semaforo: () => request<{ status: string; data: SemaforoCertificacion }>('/fiscal/certificacion/semaforo'),
  catalogo: () => request<{ status: string; data: { obligaciones: Omit<ObligacionSemaforo, 'estado' | 'detalle' | 'aplica'>[]; avisos: DefinicionAviso[] } }>('/fiscal/certificacion/catalogo'),
  avisos: () => request<{ status: string; data: ObligacionCalendarioRecord[] }>('/fiscal/avisos'),
  registrarAviso: (tipo: string, fechaEvento?: string, descripcion?: string) =>
    request<{ status: string; data: ObligacionCalendarioRecord; creada: boolean }>('/fiscal/avisos', { method: 'POST', body: JSON.stringify({ tipo, fechaEvento, descripcion }) }),
  conciliacion: (periodo: string) => request<{ status: string; data: Conciliacion }>(`/fiscal/conciliacion?periodo=${encodeURIComponent(periodo)}`),
  descargarConciliacion: (periodo: string) => descargarArchivo(`/fiscal/conciliacion/export.xlsx?periodo=${encodeURIComponent(periodo)}`, `conciliacion-anexo30-${periodo}.xlsx`),
  simulador: (pctGarantia: number | null) =>
    request<{ status: string; data: SimuladorPerdida }>(`/fiscal/simulador-perdida${pctGarantia != null ? `?pctGarantia=${pctGarantia}` : ''}`),
  descargarCredito: (id: string, body: { monto: number; pedimentoDescargo: string; fecha: string }) =>
    request<{ status: string; data: DescargoResultado }>(`/fiscal/creditos/${id}/descargar`, { method: 'POST', body: JSON.stringify(body) }),
  descargarReporteCreditos: () => descargarArchivo('/fiscal/creditos/reporte.xlsx', 'creditos-fiscales-descargos.xlsx'),
}
