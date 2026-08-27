/**
 * API Inventario IMMEX — Anexo 24 real (Ola 1, 27-ago-2026).
 * Usa `request` de api-core (manda X-Cliente-Id). No toca api.ts.
 */
import { request } from '../api-core'

export type TipoTemporal = 'INSUMO' | 'ACTIVO_FIJO'

export interface LotePeps {
  temporaryImportId: string
  pedimento: string
  pedimentoPartidaId: string | null
  entryDate: string
  expirationDate: string | null
  quantity: number
  quantityDischarged: number
  disponible: number
  ordenPeps: number
  ubicacion: { id: string; nombre: string; tipo: string } | null
}

export interface ParteConLotes {
  parteId: string | null
  parteCodigo: string | null
  fractionCode: string
  descripcion: string
  unit: string
  tipo: TipoTemporal | string
  importado: number
  descargado: number
  saldo: number
  proximoVencimiento: string | null
  /** Vacío en /partes (resumen agregado); se cargan con `lotesDeParte` al expandir. */
  lotes: LotePeps[]
  lotesTotal: number
}

export interface PedimentoPartidaInv {
  id: string
  pedimento: string
  pedimentoId: string | null
  pedimentoPartidaId: string | null
  numeroPartida: number | null
  fractionCode: string
  description: string
  quantity: number
  quantityDischarged: number
  saldo: number
  unit: string
  customsValue: number
  valueMXN: number | null
  entryDate: string
  expirationDate: string | null
  vigenciaPrograma: boolean
  status: string
  tipo: TipoTemporal | string
  claveDocumento: string | null
  vidaUtilMeses: number | null
  notes: string | null
  product: { id: string; productCode: string } | null
  ubicacion: { id: string; nombre: string; tipo: string } | null
  discharges: Array<{ id: string; type: string; quantity: number; dischargeDate: string; pedimento: string | null; constanciaTransferencia: string | null; assemblyId: string | null }>
}

export interface PedimentoParaAlta {
  id: string
  numero: string | null
  clave: string
  aduana: string
  rfcImportador: string
  origenArchivo: string | null
  createdAt: string
  partidas: number
  partidasEnInventario: number
}

export interface PlazoInfo { meses: number | null; vigenciaPrograma: boolean; fundamento: string; cotejo: string; aviso: string | null }

export interface AltaResultado {
  pedimentoId: string; numero: string | null; clave: string; tipo: TipoTemporal; certificacion: string | null
  creadas: number; existentes: number; temporaryImportIds: string[]; plazo: PlazoInfo; avisos: string[]
}

export interface DescargoPepsResultado {
  parte: { productId: string | null; fractionCode: string | null; unit: string }
  cantidad: number
  tipo: string
  descargos: Array<{ dischargeId: string; temporaryImportId: string; pedimento: string; entryDate: string; cantidad: number }>
}

export interface RetornoBomResultado {
  assemblyId: string
  producto: { id: string; productCode: string; description: string }
  cantidad: number
  consumos: Array<{
    componentCode: string; fractionCode: string | null; unit: string; scrapPercent: number
    quantityRequired: number; quantityWithScrap: number; merma: number; descargo: DescargoPepsResultado
  }>
  mermas: { totalPorComponente: Array<{ componentCode: string; unit: string; merma: number; scrapPercent: number }> }
}

export interface Ubicacion {
  id: string; nombre: string; tipo: 'PLANTA' | 'SUBMAQUILA' | string; domicilio: string | null; rfcTercero: string | null
  avisoSubmaquila: string | null; activo: boolean; clienteId: string | null; lotesActivos?: number
}

export interface CierreResumen {
  id: string; periodo: string; cerradoPor: string; cerradoAt: string; hash: string | null; clienteId: string | null; notas: string | null
  totales: { lotes: number; partes: number; importado: number; descargado: number; saldo: number; activoFijoLotes: number } | null
}

export interface ReporteAnexo24 {
  folio: string
  periodo: string
  rango: { inicio: string; fin: string }
  generadoEn: string
  clienteId: string | null
  cotejo: { estado: 'pendiente'; etiqueta: string; fuenteRepo: string }
  cierre: { periodo: string; hash: string | null; cerradoAt: string } | null
  entradas: Array<{ temporaryImportId: string; pedimento: string; numeroPartida: number | null; clave: string | null; tipo: string; fractionCode: string; parteCodigo: string | null; descripcion: string; cantidad: number; unit: string; valorUSD: number; valorMXN: number | null; paisOrigen: string | null; fechaEntrada: string; vencimiento: string | null; plazoMeses: number | null; ubicacion: string | null }>
  salidas: Array<{ dischargeId: string; fecha: string; tipo: string; pedimentoRetorno: string | null; constanciaTransferencia: string | null; pedimentoOrigen: string; fractionCode: string; parteCodigo: string | null; cantidad: number; unit: string; valorUSD: number | null; assemblyId: string | null }>
  saldos: Array<{ parteId: string | null; parteCodigo: string | null; fractionCode: string; descripcion: string; unit: string; tipo: string; importado: number; descargado: number; saldo: number; lotes: number }>
  saldosPorPedimento: Array<{ temporaryImportId: string; pedimento: string; fractionCode: string; parteCodigo: string | null; unit: string; tipo: string; entryDate: string; expirationDate: string | null; importado: number; descargado: number; saldo: number }>
  activoFijo: Array<{ temporaryImportId: string; pedimento: string; fractionCode: string; parteCodigo: string | null; descripcion: string; cantidad: number; unit: string; valorUSD: number; fechaEntrada: string; vidaUtilMeses: number | null; ubicacion: string | null; status: string }>
  mermas: Array<{ assemblyId: string; fecha: string; productoTerminado: string; cantidadTerminado: number; componentCode: string; fractionCode: string | null; unit: string; quantityRequired: number; quantityWithScrap: number; merma: number; referencia: string | null }>
  desperdicios: Array<{ dischargeId: string; fecha: string; tipo: string; pedimentoOrigen: string; fractionCode: string; cantidad: number; unit: string; notas: string | null }>
  submaquila: Array<{ ubicacionId: string; nombre: string; rfcTercero: string | null; domicilio: string | null; avisoSubmaquila: string | null; lotes: Array<{ temporaryImportId: string; pedimento: string; fractionCode: string; parteCodigo: string | null; saldo: number; unit: string }> }>
  totales: { entradas: number; salidas: number; partesConSaldo: number; saldoTotal: number; activoFijo: number; mermaTotal: number; submaquilaLotes: number }
  hash: string
}

export interface Exposicion {
  temporaryImportId: string; pedimento: string; fractionCode: string; parteCodigo: string | null; tipo: string; unit: string
  saldo: number; vencimiento: string | null; diasParaVencer: number | null; vencida: boolean; valorSaldoUSD: number
  tipoCambio: { valor: number | null; fuente: string | null; fecha: string | null; estado: string }
  tasas: { igiPct: number | null; igiFuente: string; dtaPct: number; ivaPct: number; iepsPct: number }
  impuestos: { valorMXN: number; igi: number; dta: number; ieps: number; iva: number; total: number } | null
  multa: {
    rangoOmision: { minPct: number; maxPct: number; min: number; max: number; fundamento: string; cotejo: string } | null
    plazoRetorno: { fundamento: string; cotejo: 'pendiente'; nota: string }
  }
  recargos: { nota: string }
  avisos: string[]
}

export interface EntradaCatalogoPlazo { clave: string; descripcion: string; meses: number | null; vigenciaPrograma: boolean; fundamento: string; fuenteRepo: string | null; cotejo: 'corpus' | 'pendiente' }

type Ok<T> = { status: string; data: T }

export const anexo24Api = {
  partes: (tipo?: TipoTemporal) => request<Ok<ParteConLotes[]>>(`/inventory/partes${tipo ? `?tipo=${tipo}` : ''}`),
  lotesDeParte: (p: Pick<ParteConLotes, 'parteId' | 'fractionCode' | 'tipo'>) => {
    const q = new URLSearchParams()
    if (p.parteId) q.set('parteId', p.parteId); else q.set('fractionCode', p.fractionCode)
    q.set('tipo', p.tipo)
    return request<Ok<LotePeps[]>>(`/inventory/partes/lotes?${q.toString()}`)
  },
  pedimentoPartidas: (abiertas = true) => request<Ok<PedimentoPartidaInv[]>>(`/inventory/pedimento-partidas?abiertas=${abiertas}`),
  pedimentosParaAlta: () => request<Ok<PedimentoParaAlta[]>>('/inventory/pedimentos-para-alta'),
  altaDesdePedimento: (pedimentoId: string, body: { fechaEntrada: string; vidaUtilMeses?: number; ubicacionId?: string; esAnexoIBis?: boolean; esAnexoITer?: boolean }) =>
    request<Ok<AltaResultado>>(`/inventory/desde-pedimento/${pedimentoId}`, { method: 'POST', body: JSON.stringify(body) }),
  descargarPeps: (body: { productId?: string; fractionCode?: string; cantidad: number; tipo: string; pedimentoDescargo?: string; constanciaTransferencia?: string; fecha: string; notes?: string }) =>
    request<Ok<DescargoPepsResultado>>('/inventory/descargar-peps', { method: 'POST', body: JSON.stringify(body) }),
  retornoDesdeBom: (body: { productId: string; cantidad: number; tipo?: string; pedimento?: string; constanciaTransferencia?: string; fecha: string; referencia?: string; notas?: string }) =>
    request<Ok<RetornoBomResultado>>('/inventory/retorno-desde-bom', { method: 'POST', body: JSON.stringify(body) }),
  traslado: (temporaryImportId: string, body: { ubicacionId: string | null; fecha?: string; notas?: string }) =>
    request<Ok<PedimentoPartidaInv> & { avisos: string[] }>(`/inventory/imports/${temporaryImportId}/traslado`, { method: 'POST', body: JSON.stringify(body) }),
  cierres: () => request<Ok<CierreResumen[]> & { ultimoPeriodoCerrado: string | null }>('/inventory/cierres'),
  cerrarPeriodo: (periodo: string, notas?: string) =>
    request<Ok<{ cierre: CierreResumen; resumen: unknown }>>('/inventory/cierres', { method: 'POST', body: JSON.stringify({ periodo, notas }) }),
  reporte: (periodo: string) => request<Ok<ReporteAnexo24>>(`/inventory/anexo24/reporte?periodo=${encodeURIComponent(periodo)}`),
  reporteXlsxUrl: (periodo: string) => `/api/inventory/anexo24/reporte?periodo=${encodeURIComponent(periodo)}&formato=xlsx`,
  exposicion: (temporaryImportId: string) => request<Ok<Exposicion>>(`/inventory/exposicion/${temporaryImportId}`),
  plazos: () => request<Ok<{ general: number; catalogo: EntradaCatalogoPlazo[] }>>('/inventory/plazos-immex'),
  ubicaciones: () => request<Ok<Ubicacion[]>>('/ubicaciones'),
  ubicacionCrear: (body: { nombre: string; tipo: string; domicilio?: string; rfcTercero?: string; avisoSubmaquila?: string }) =>
    request<Ok<Ubicacion> & { avisos: string[] }>('/ubicaciones', { method: 'POST', body: JSON.stringify(body) }),
  ubicacionEditar: (id: string, body: Partial<{ nombre: string; tipo: string; domicilio: string; rfcTercero: string; avisoSubmaquila: string; activo: boolean }>) =>
    request<Ok<Ubicacion>>(`/ubicaciones/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  ubicacionDesactivar: (id: string) => request<Ok<Ubicacion>>(`/ubicaciones/${id}`, { method: 'DELETE' }),
}

/** Descarga el .xlsx con el token (fetch autenticado → blob → enlace temporal). */
export async function descargarReporteXlsx(periodo: string): Promise<void> {
  const token = localStorage.getItem('aduanai_token')
  const cliente = localStorage.getItem('aduanai_cliente')
  const res = await fetch(anexo24Api.reporteXlsxUrl(periodo), {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cliente ? { 'X-Cliente-Id': cliente } : {}) },
  })
  if (!res.ok) {
    let msg = `No se pudo generar el Excel (${res.status})`
    try { const j = await res.json(); if (j?.message) msg = j.message } catch { /* sin cuerpo JSON */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `anexo24-${periodo}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
