/**
 * API del cotizador — Ola 2 (Operación 2026-08): cotizaciones guardadas,
 * versiones, escenarios persistidos, tabuladores de honorarios, catálogo DTA
 * y exportación. Importa `request` de api-core (no se toca lib/api.ts).
 */
import { request } from '../api-core'
import type { MultiQuoteInput, MultiQuoteItemInput, MultiQuoteResult, ScenarioComparison, ScenarioVariant } from '../api'

export type TipoOperacionDTA =
  | 'general' | 'activo_fijo_immex' | 'temporal_immex' | 'tratado' | 'exenta_retorno'
  | 'exportacion' | 'transito_interno' | 'transito_internacional' | 'rectificacion'

export type CotejoDTA = 'verificado' | 'corpus' | 'pendiente'

export interface EntradaDTA {
  tipo: TipoOperacionDTA
  etiqueta: string
  claves: string[]
  base: 'millar' | 'fija'
  valor: number
  fraccionArt49: string
  fundamento: string
  cotejo: CotejoDTA
  nota?: string
}

export interface DTAResuelto {
  tipo: TipoOperacionDTA
  etiqueta: string
  base: 'millar' | 'fija'
  dtaPct: number
  montoFijoMXN: number
  fraccionArt49: string
  fundamento: string
  cotejo: CotejoDTA
  aviso: string | null
  nota: string | null
  fuente?: { reference: string; title: string; officialUrl: string | null; version: string | null; claseTexto: string; fechaCotejo: string | null } | null
}

export interface ReglaHonorarios {
  tipoOperacion: TipoOperacionDTA | '*'
  base: 'fijo' | 'porcentaje' | 'millar'
  valor: number
  minimo?: number
  maximo?: number
}

export interface Tabulador {
  id: string
  nombre: string
  reglas: ReglaHonorarios[]
  activo: boolean
  createdAt: string
  updatedAt: string
}

/** Extensiones Ola 2 de la entrada multi-partida (el servidor las acepta). */
export interface MultiQuoteItemInputOla2 extends MultiQuoteItemInput {
  exportador?: string
}
export interface MultiQuoteInputOla2 extends Omit<MultiQuoteInput, 'items'> {
  items: MultiQuoteItemInputOla2[]
  tipoOperacion?: TipoOperacionDTA
  tabuladorId?: string
  usarTabulador?: boolean
  vigenciaHasta?: string
  notas?: string
}

export interface ScenarioVariantOla2 extends ScenarioVariant {
  treatyOverride?: 'TMEC' | 'TLCUEM' | 'CPTPP' | null
  hasCertificadoOrigen?: boolean
  applyPROSEC?: boolean
  tipoOperacionOverride?: TipoOperacionDTA
}

/** Campos Ola 2 que vienen en cada partida del resultado. */
export interface ItemOla2 {
  exportador?: string | null
  dtaNota?: string | null
  antidumping?: (MultiQuoteResult['items'][number]['antidumping'] & {
    origenTasa?: 'exportador' | 'general' | 'general_sin_lista'
    empresa?: string | null
    esAntielusion?: boolean
    vigencia?: string
    resolutionType?: string
    advertencias?: string[]
  }) | null
  programs?: MultiQuoteResult['items'][number]['programs'] & {
    ieps: MultiQuoteResult['items'][number]['programs']['ieps'] & { cotejo?: 'verificado' | 'sin_verificar' | 'sin_tasa'; nota?: string; fundamento?: string | null }
  }
}

export interface MultiQuoteResultOla2 extends MultiQuoteResult {
  quoteId?: string
  tcFechaDOF?: string | null
  tipoOperacion?: TipoOperacionDTA
  dta?: DTAResuelto
  honorarios?: { origen: 'tabulador' | 'manual'; tabuladorId: string | null; tabuladorNombre: string | null; detalle: string | null; monto: number }
  input?: MultiQuoteInputOla2
}

export interface FilaCotizacion {
  id: string
  folio: string
  name: string | null
  client: string | null
  clienteId: string | null
  clienteRazonSocial: string | null
  fractionCode: string
  origin: string
  currency: string
  status: string
  version: number
  parentQuoteId: string | null
  vigenciaHasta: string | null
  vigente: boolean
  totalAll: number | null
  totalLandedCost: number | null
  exchangeRate: number | null
  tcFechaDOF: string | null
  partidas: number
  tieneEscenarios: boolean
  createdAt: string
  createdBy: string | null
}

export interface EscenarioGuardado {
  name: string
  totalAll: number
  totalLandedCost: number
  totalDuties: number
  igi: number
  dta: number
  countervailing: number
  ieps: number
  iva: number
  deltaMXN: number
  deltaPct: number
  variant: ScenarioVariantOla2
  alertas: string[]
}
export interface EscenariosGuardados {
  calculadoEn: string
  base: { totalAll: number; totalLandedCost: number; totalDuties: number; igi: number; dta: number; countervailing: number; ieps: number; iva: number }
  escenarios: EscenarioGuardado[]
}

export interface CotizacionCompleta {
  id: string
  folio: string
  name: string | null
  client: string | null
  clienteId: string | null
  cliente: { id: string; rfc: string; razonSocial: string } | null
  destination: string | null
  incoterm: string
  currency: string
  origin: string
  fractionCode: string
  status: string
  approvedAt: string | null
  version: number
  parentQuoteId: string | null
  vigenciaHasta: string | null
  vigente: boolean
  notas: string | null
  escenarios: EscenariosGuardados | null
  tcFechaDOF: string | null
  tabuladorId: string | null
  exchangeRate: number | null
  exchangeRateDate: string | null
  totalLandedCost: number | null
  totalDispatch: number | null
  totalAll: number | null
  createdAt: string
  createdBy: string | null
  result: MultiQuoteResultOla2 | null
  input: MultiQuoteInputOla2
  versiones: { id: string; version: number; folio: string; createdAt: string; totalAll: number | null; status: string }[]
  agencia: { nombre: string; rfc: string | null }
}

export interface FiltrosLista {
  nombre?: string; cliente?: string; desde?: string; hasta?: string; estado?: string; vigentes?: boolean; page?: number; pageSize?: number
}

function qs(f: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const cotizadorApi = {
  cotizar: (input: MultiQuoteInputOla2) =>
    request<{ status: string; data: MultiQuoteResultOla2 & { quoteId: string } }>('/quote/multi', { method: 'POST', body: JSON.stringify(input) }),
  escenariosAdHoc: (base: MultiQuoteInputOla2, variants: ScenarioVariantOla2[]) =>
    request<{ status: string; data: ScenarioComparison }>('/quote/scenarios', { method: 'POST', body: JSON.stringify({ base, variants }) }),
  listar: (f: FiltrosLista = {}) =>
    request<{ status: string; data: { filas: FilaCotizacion[]; total: number; page: number; pageSize: number } }>(`/quote${qs(f as Record<string, string | number | boolean | undefined>)}`),
  obtener: (id: string) => request<{ status: string; data: CotizacionCompleta }>(`/quote/${id}`),
  duplicar: (id: string, nombre?: string) =>
    request<{ status: string; data: { id: string; version: number; parentQuoteId: string | null; folio: string; status: string } }>(`/quote/${id}/duplicar`, { method: 'POST', body: JSON.stringify({ nombre }) }),
  actualizar: (id: string, patch: { name?: string | null; notas?: string | null; vigenciaHasta?: string | null; clienteId?: string | null; escenarios?: EscenariosGuardados | null }) =>
    request<{ status: string; data: CotizacionCompleta }>(`/quote/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  escenarios: (id: string, variants?: ScenarioVariantOla2[]) =>
    request<{ status: string; data: { escenarios: EscenariosGuardados; comparacion: ScenarioComparison } }>(`/quote/${id}/escenarios`, { method: 'POST', body: JSON.stringify({ variants }) }),
  plantillaEscenarios: () => request<{ status: string; data: ScenarioVariantOla2[] }>('/quote/escenarios/plantilla'),
  catalogoDTA: () => request<{ status: string; data: { catalogo: EntradaDTA[]; fuente: DTAResuelto['fuente'] } }>('/quote/catalogos/dta'),
  tabuladores: () => request<{ status: string; data: Tabulador[] }>('/quote/tabuladores'),
  crearTabulador: (b: { nombre: string; reglas: ReglaHonorarios[] }) =>
    request<{ status: string; data: Tabulador }>('/quote/tabuladores', { method: 'POST', body: JSON.stringify(b) }),
  actualizarTabulador: (id: string, b: { nombre?: string; reglas?: ReglaHonorarios[]; activo?: boolean }) =>
    request<{ status: string; data: Tabulador }>(`/quote/tabuladores/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  eliminarTabulador: (id: string) => request<{ status: string }>(`/quote/tabuladores/${id}`, { method: 'DELETE' }),
  /** Descarga el Excel con el token (el endpoint exige Authorization). */
  descargarExcel: async (id: string, folio: string) => {
    const token = localStorage.getItem('aduanai_token')
    const res = await fetch(`/api/quote/${id}/export.xlsx`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error(`No se pudo exportar (${res.status})`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `cotizacion-${folio}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  },
}
