/**
 * API — importar M3 / Data Stage, prevalidar y pre-glosar desde el pedimento
 * persistido, catálogo de reglas y archivar al expediente (Operación 2026-08).
 * Usa `request` de api-core (no se toca api.ts).
 */
import { request } from '../api-core'
import type { GlosaSimulationInput, GlosaSimulationResult, PedimentoInputV2, PedimentoValidationResult, GlosaRiskFlag } from '../api'

export type OrigenArchivo = 'M3' | 'DATASTAGE'
export type DatoNoDisponible = 'bultos' | 'pesoNeto' | 'bl' | 'cove' | 'tipoCambioFecha'

export interface ImportarResultado {
  layout: OrigenArchivo
  layoutVersion: string
  archivoHash: string
  pedimentos: { id: string; numero: string | null; clave: string; partidas: number; reutilizado: boolean; datosNoDisponibles: DatoNoDisponible[] }[]
  excluidos: { numeroPedimento7: string; motivo: string }[]
  advertencias: string[]
  avisoLayout: string | null
}

export interface PedimentoImportado {
  id: string; numero: string | null; clave: string; aduana: string; rfcImportador: string
  origenArchivo: string | null; layoutVersion: string | null; createdAt: string; status: string
  _count: { partidas: number }
}

export interface PedimentoInputV2Importado extends PedimentoInputV2 {
  origenArchivo?: 'M3' | 'DATASTAGE' | 'MANUAL'
  datosNoDisponibles?: DatoNoDisponible[]
  identificadoresPedimento?: { codigo: string; complemento1?: string; complemento2?: string }[]
  medioTransporteClave?: string
  partidas: (PedimentoInputV2['partidas'][number] & { nico?: string })[]
}

export interface ValidacionDesdePedimento {
  pedimentoId: string
  numero: string | null
  origenArchivo: string | null
  layoutVersion: string | null
  input: PedimentoInputV2Importado
  validation: PedimentoValidationResult & { reglasNoEvaluadas: { rule: string; partida?: number; motivo: string }[] }
}

export interface ReglaPrevalidador {
  codigo: string; nombre: string; descripcion: string; fundamento: string
  cotejoFundamento: 'verificado' | 'pendiente'; severidad: 'error' | 'warning' | 'info'
  nivel: 'pedimento' | 'partida'; requiere?: string
}

export interface CruceGlosa {
  codigo: 'ORIGEN_TRATADO' | 'CUOTA_EXPORTADOR' | 'UMC_UMT' | 'PRECIO_ESTIMADO' | 'IDENTIFICADOR_AP8'
  nombre: string
  estado: 'evaluado' | 'no_evaluado'
  resultado?: 'ok' | 'observacion' | 'hallazgo'
  severidad?: 'low' | 'medium' | 'high' | 'critical'
  mensaje: string
  fundamento: string
  cotejoFundamento: 'verificado' | 'pendiente'
  motivo?: string
  datos?: Record<string, unknown>
}

export type GlosaSimulationResultConCruces = GlosaSimulationResult & { cruces?: CruceGlosa[] }

export interface GlosaPedimentoResultado {
  pedimentoId: string
  numero: string | null
  clave: string
  aduana: string
  origenArchivo: string | null
  partidas: { numeroPartida: number; fraccion: string; descripcion: string; input: GlosaSimulationInput; resultado: GlosaSimulationResultConCruces | null; error: string | null }[]
  resumen: {
    partidasTotal: number; partidasEvaluadas: number; partidasConError: number
    riskScoreMax: number; riskLevelMax: GlosaSimulationResult['riskLevel'] | null
    riskLevelPresentacion: GlosaSimulationResult['riskLevelPresentacion']
    partidaRiesgoMaximo: number | null
    hallazgos: { ruleCode: string; name: string; severity: GlosaRiskFlag['severity']; category: string; partidas: number[]; reason: string; legalBasis: string | null }[]
    cruces: { codigo: CruceGlosa['codigo']; nombre: string; resultado: 'observacion' | 'hallazgo'; severidad?: CruceGlosa['severidad']; partidas: number[]; mensaje: string; fundamento: string }[]
    reglasNoEvaluadas: { ruleCode: string; motivo: string; partidas: number[] }[]
    crucesNoEvaluados: { codigo: string; motivo: string; partidas: number[] }[]
    dominiosNoRevisados: { dominio: string; motivo: string; partidas: number[] }[]
  }
  disclaimer: string
  versiones?: GlosaSimulationResult['versiones']
}

export interface DeclaradoPedimento {
  hasIVAIEPSCertification?: boolean
  hasTMECCertificate?: boolean
  declaresNOMs?: boolean
  documents?: GlosaSimulationInput['documents']
}

export const apiPedimentos = {
  importar: (nombreArchivo: string, contenidoBase64: string, layout: 'auto' | 'M3' | 'DATASTAGE' = 'auto') =>
    request<{ status: string; data: ImportarResultado; avisoDataStage: string | null }>('/pedimentos/importar', {
      method: 'POST', body: JSON.stringify({ nombreArchivo, contenidoBase64, layout }),
    }, 60_000),
  importados: () => request<{ status: string; data: PedimentoImportado[] }>('/pedimentos/importados'),
  prevalidarDesdePedimento: (id: string, aiCheck: boolean) =>
    request<{ status: string; data: ValidacionDesdePedimento }>(`/prevalidate/desde-pedimento/${id}`, { method: 'POST', body: JSON.stringify({ aiCheck }) }, 120_000),
  reglas: () => request<{ status: string; data: ReglaPrevalidador[]; nota: string; catalogosPendientes: string }>('/prevalidate/reglas'),
  glosaDesdePedimento: (id: string, declarado: DeclaradoPedimento) =>
    request<{ status: string; data: GlosaPedimentoResultado }>(`/glosa/simulate/desde-pedimento/${id}`, { method: 'POST', body: JSON.stringify(declarado) }, 180_000),
  archivar: (pedimentoId: string, tipoReporte: 'prevalidacion' | 'preglosa', reporte: Record<string, unknown>, resumen?: string) =>
    request<{ status: string; data: { operationId: string; reference: string; documentId: string; documentName: string } }>(`/pedimentos/${pedimentoId}/archivar`, {
      method: 'POST', body: JSON.stringify({ tipoReporte, reporte, resumen }),
    }),
}

/** Lee un File como base64 (sin el prefijo data:). */
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
