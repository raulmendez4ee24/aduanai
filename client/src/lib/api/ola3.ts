/**
 * API Ola 3 — Fracciones (ficha + árbol), Analytics real, Defensa, Confianza.
 * Importa `request` de api-core (regla: no tocar api.ts).
 */
import { request } from '../api-core'

// ── Fracciones ──────────────────────────────────────────────────────────────
export type EstadoBloque = 'con_datos' | 'sin_dato' | 'pendiente_de_carga'
export interface Bloque<T> { estado: EstadoBloque; fuente: string; fechaDOF?: string | null; fechaCotejo?: string | null; nota?: string; datos: T }
export interface NodoArbol { nivel: 'seccion' | 'capitulo' | 'partida' | 'subpartida' | 'fraccion'; code: string; label: string; notas?: string | null; hoja?: boolean }
export interface Arancel { clave: string; etiqueta: string; tasa: number | null; unidad: string; vigente: boolean; nota?: string }
export interface FichaFraccion {
  fraccion: { code: string; codeFormatted: string; description: string; unit: string | null; active: boolean; updatedAt: string }
  versionCatalogo: { tigie: string; ligie: string; fechaDOF: string; vigencia: string; fechaCotejo: string; fuente: string }
  bloques: {
    arbol: Bloque<NodoArbol[]>
    nicos: Bloque<{ nico: string; fuente: string }[]>
    aranceles: Bloque<Arancel[]>
    prosec: Bloque<{ sector: string; tasa: number; matchType: string; decree: string | null; vigenteDesde: string; vigenteHasta: string | null; fechaCotejo: string | null; cotejado: boolean }[]>
    regla8va: Bloque<{ vehicleFraction: string; vehicleDesc: string; preferentialRate: number; rol: string; conditions: string | null; vigenteDesde: string }[]>
    cuotasCompensatorias: Bloque<{ id: string; countryOfOrigin: string; productDesc: string | null; specificProducer: string | null; exportadorTasas: unknown; rate: number; rateUnit: string; resolutionNumber: string | null; status: string; publishDateDOF: string | null; effectiveDate: string | null; expiryDate: string | null; examenSunsetFecha: string | null; cotejadoAt: string | null; esAntielusion: boolean; dofUrl: string | null }[]>
    noms: Bloque<{ code: string; authority: string; description: string; required: boolean; origenDato: string; excepciones: { exceptionCode: string; fraccionAnexo: string; description: string; requiredDoc: string | null; legalBasis: string | null }[] }[]>
    permisos: Bloque<{ type: string; authority: string; code: string; description: string; required: boolean; matchType: string }[]>
    aduanasAnexo21: Bloque<never[]>
    preciosEstimados: Bloque<{ countryOfOrigin: string | null; estimatedValue: number; unit: string; decree: string | null; publishDate: string; effectiveDate: string; expiryDate: string | null; source: string }[]>
    correlativas: Bloque<{ tipo: string; nota: string }[]>
  }
}
export interface RespuestaArbol { nodo: string; nivel: NodoArbol['nivel']; hijos: (NodoArbol & { hoja: boolean })[] }

export const fichaFraccion = (code: string) => request<{ status: string; data: FichaFraccion }>(`/fractions/${encodeURIComponent(code)}/ficha`)
export const arbolFracciones = (nodo: string) => request<{ status: string; data: RespuestaArbol }>(`/fractions/arbol?nodo=${encodeURIComponent(nodo)}`)

// ── Analytics ───────────────────────────────────────────────────────────────
export interface LineaAhorro { origen: 'clasificacion' | 'cotizacion'; id: string; fecha: string; fractionCode: string; pais: string; valorUSD: number; tasaAplicada: number | null; tasaGeneral: number | null; tasaPreferencial: number | null; ahorroUSD: number; detalle: string }
export interface AnalyticsReal {
  filtro: { tenantId: string; clienteId: string | null; desde: string; hasta: string }
  totales: { clasificaciones: number; cotizaciones: number; clasificacionesPeriodo: number; cotizacionesPeriodo: number; formula: string }
  ahorro: {
    tmecNoAplicado: { totalUSD: number; lineas: LineaAhorro[]; sinTasa: number; formula: string }
    prosecNoUsado: { totalUSD: number; lineas: (LineaAhorro & { sector: string; cotejado: boolean })[]; formula: string; nota: string }
    aplicado: { totalUSD: number; lineas: LineaAhorro[]; formula: string }
  }
  riesgo: {
    fraccionesSensibles: { fractionCode: string; apariciones: number; valorUSD: number; cuotaCompensatoria: { paises: string[]; count: number }; nomObligatoria: string[]; precioEstimado: boolean; anexo10: string | null }[]
    formula: string
    aduanas: { customsCode: string; simulaciones: number; raPromedio: number; riesgoPromedio: number; nivelAlto: number }[]
    formulaAduanas: string
    riskScorer: { evaluaciones: number; bandas: Record<string, number>; exposicionPromedio: number | null }
  }
  equipo: { porUsuario: { userId: string; nombre: string; email: string; clasificaciones: number; validadas: number; correctas: number; pctValidado: number | null; pctCorrecto: number | null; tiempoMedioSeg: number | null; jobs: number }[]; formula: string }
}
export const analyticsReal = (days: number) => request<{ status: string; data: AnalyticsReal }>(`/analytics?days=${days}`)
export function analyticsExportUrl(days: number): string {
  const cliente = (() => { try { return localStorage.getItem('aduanai_cliente') } catch { return null } })()
  return `/api/analytics/export.xlsx?days=${days}${cliente ? `&clienteId=${encodeURIComponent(cliente)}` : ''}`
}

// ── Defensa ─────────────────────────────────────────────────────────────────
export type TipoDefensa = 'classification' | 'quote' | 'operation' | 'glosa' | 'risk'
export interface EntidadDefensa { id: string; resumen: string; fecha: string; status: string }
export interface PaqueteDefensa {
  entidad: { tipo: TipoDefensa; id: string; resumen: string; fecha: string; clienteId: string | null; fractionCode: string | null }
  versiones: { usadas: { tigie: string | null; ligie: string | null; rgce: string | null; acuerdoNoms: string | null; tmec: string | null; consultHash: string | null; consultedAt: string | null }; vigentesHoy: { tigie: string; ligie: string; rgce: string | null; acuerdoNoms: string | null; tmec: string | null }; snapshots: { type: string; version: string; publishDate: string; effectiveDate: string; source: string | null }[]; fuente: string; desactualizada: boolean | null }
  reglas: { descripcion: string; fuente: string; datos: unknown }
  aprobaciones: { status: string | null; creadoPor: { id: string; nombre: string; email: string } | null; aprobadoPor: { id: string; nombre: string; email: string } | null; approvedAt: string | null; permisos: { action: string; createdAt: string; targetUserId: string | null; details: unknown }[]; fuente: string }
  bitacora: { eventos: { id: string; action: string; createdAt: string; hash: string; prevHash: string | null; userId: string | null; endpoint: string | null }[]; cadena: { valid: boolean; brokenAt?: string; checkedCount: number }; ultimoHash: string | null; ultimoHashTenant: string | null; fuente: string }
  certificado: { folio: string; hashPaquete: string; emitidoAt: string; verifyConsultUrl: string | null; verifyAuditUrl: string | null; nom151: string; sellado: string }
}
export const defensaListar = (tipo: TipoDefensa) => request<{ status: string; data: EntidadDefensa[]; tipos: TipoDefensa[] }>(`/traceability/defensa?tipo=${tipo}`)
export const defensaPaquete = (tipo: TipoDefensa, id: string) => request<{ status: string; data: PaqueteDefensa }>(`/traceability/defensa/${tipo}/${encodeURIComponent(id)}`)
export const defensaCertificadoUrl = (tipo: TipoDefensa, id: string) => `/api/traceability/defensa/${tipo}/${encodeURIComponent(id)}/certificado.html`

/** El certificado va con Authorization: lo abrimos en una pestaña vía blob (no hay cookie de sesión). */
export async function abrirCertificado(tipo: TipoDefensa, id: string): Promise<void> {
  const token = localStorage.getItem('aduanai_token')
  const res = await fetch(defensaCertificadoUrl(tipo, id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`No se pudo generar el certificado (${res.status})`)
  const html = await res.text()
  const w = window.open('', '_blank')
  if (!w) throw new Error('El navegador bloqueó la ventana del certificado')
  w.document.open(); w.document.write(html); w.document.close()
}

/** Igual para el Excel de Analytics: descarga autenticada. */
export async function descargarAnalyticsXlsx(days: number): Promise<void> {
  const token = localStorage.getItem('aduanai_token')
  const res = await fetch(analyticsExportUrl(days), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`No se pudo exportar (${res.status})`)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `analytics-${days}d.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// ── Confianza ("Tus datos") ─────────────────────────────────────────────────
export interface InfraInfo {
  proveedor: { nombre: string; region: string; regionEstado: string; evidencia: string }
  afirmaciones: { clave: string; titulo: string; estado: 'verificado' | 'pendiente' | 'no_integrado' | 'en_evaluacion'; detalle: string; evidencia: string }[]
  enlaces: { avisoPrivacidad: string; auditoria: string; verificarHash: string }
  generadoAt: string
}
export const confianza = () => request<{ status: string; data: InfraInfo }>('/verification/confianza')
