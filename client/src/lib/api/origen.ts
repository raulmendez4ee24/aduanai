/**
 * API — Origen T-MEC y cuotas compensatorias (Operación 2026-08, Ola 2).
 * Importa `request` de api-core (regla: no tocar api.ts).
 */
import { request } from '../api-core'
import type { OriginRule } from '../api'

// ── Origen: BOM / salto / de minimis ──────────────────────────────────────
export interface MaterialBOM {
  productId?: string | null
  productCode?: string | null
  descripcion: string
  fractionCode: string | null
  paisOrigen: string | null
  valorUSD?: number | null
  cantidad?: number | null
  unidad?: string | null
}
export interface EvaluacionMaterial {
  material: MaterialBOM
  originario: boolean
  salto: 'cumple' | 'no_cumple' | 'no_determinable' | 'no_aplica'
  motivo: string
  enlaceCatalogo?: string
}
export interface ResultadoSalto {
  codigo: 'CC' | 'CTH' | 'CTSH'
  fraccionFinal: string
  resultado: 'cumple' | 'no_cumple' | 'no_determinable'
  porMaterial: EvaluacionMaterial[]
  resumen: { total: number; originarios: number; noOriginarios: number; cumplen: number; noCumplen: number; noDeterminables: number }
  mensaje: string
}
export interface ResultadoDeMinimis {
  aplica: boolean | null
  porcentajeUmbral: number
  porcentajeCalculado: number | null
  valorNoCumplenUSD: number
  valorTransaccionUSD: number | null
  fundamento: string
  cotejo: 'pendiente'
  aviso: string
  excepcionesNoEvaluadas: string[]
}
export interface ResultadoAutomotriz {
  aplica: boolean
  categoria: string | null
  lvc: { requerido: number | null; calculado: number | null; cumple: boolean | null; faltante: string | null }
  aceroAluminio: { requerido: number | null; calculado: number | null; cumple: boolean | null; faltante: string | null }
}
export interface DeterminacionBOM {
  producto: { id: string; productCode: string; description: string; fractionCode: string | null; paisOrigen: string | null; clienteId: string | null }
  tratado: string
  regla: OriginRule | null
  codigoSalto: 'CC' | 'CTH' | 'CTSH' | null
  salto: ResultadoSalto | null
  deMinimis: ResultadoDeMinimis | null
  acumulacion: { originarios: MaterialBOM[]; nota: string }
  automotriz: ResultadoAutomotriz
  veredicto: 'cumple' | 'cumple_de_minimis' | 'no_cumple' | 'no_determinable' | 'sin_regla' | 'sin_fraccion'
  motivo: string
  faltantes: string[]
  disclaimer: string
}
export interface ProductoOrigen {
  id: string; productCode: string; description: string; fractionCode: string | null; paisOrigen: string | null; isFinished: boolean; clienteId: string | null; componentes: number
}
export interface CoberturaFraccion { fraccion: string; nivel: 'fraccion' | 'subpartida' | 'partida' | 'capitulo' | 'sin_regla'; regla: { fractionCode: string; matchType: string; ruleType: string; tariffShiftCode: string | null } | null; mensaje: string }
export interface ReporteCobertura {
  resumen: { tratado: string; totalReglas: number; capitulosConRegla: number; capitulosSinRegla: string[]; capitulos: { capitulo: string; reglas: number; niveles: { capitulo: number; partida: number; subpartida: number; fraccion: number }; partidasConRegla: string[] }[] }
  consultas: CoberturaFraccion[]
  cotejo: { reglasConFuente: number; reglasSinFuente: number; nota: string }
}
export interface ReporteImport {
  total: number; validas: number; invalidas: number; creadas: number; actualizadas: number; cotejadas: number; pendientesCotejo: number; dryRun: boolean
  filas: { fila: number; fractionCode?: string | null; clave?: string | null; ok: boolean; errores: string[]; cotejo: string; accion: string }[]
}

// ── Certificado 9 elementos ───────────────────────────────────────────────
export interface ElementoCertificado { n: number; nombre: string; valor: string; fuente: string; completo: boolean }
export interface Certificador { tipo: 'exportador' | 'productor' | 'importador'; nombre?: string; cargo?: string; direccion?: string; telefono?: string; correo?: string }
export interface CertificadoPrellenado {
  elementos: ElementoCertificado[]
  faltantes: string[]
  sugerido: {
    fractionCode: string; productDescription: string; exporterName?: string; exporterTaxId?: string; importerName?: string; importerTaxId?: string; producerName?: string
    originCountry?: 'MX' | 'US' | 'CA'; preferenceCriterion?: 'A' | 'B' | 'C' | 'D' | 'E'; blanketPeriodFrom?: string; blanketPeriodTo?: string
    signedBy?: string; signedByRole?: string; originAnalysisId?: string; certificador?: Certificador
  }
  fundamento: string
}

// ── Certificados de proveedores ───────────────────────────────────────────
export interface CertProveedor {
  id: string; tenantId: string; clienteId: string | null; proveedorNombre: string; proveedorPais: string; proveedorEmail: string | null
  productId: string | null; fractionCode: string | null; tratado: string; vigenciaDesde: string | null; vigenciaHasta: string | null
  estado: 'solicitado' | 'recibido' | 'vencido' | 'rechazado'; documentId: string | null; tokenSolicitud: string | null
  solicitadoAt: string; recibidoAt: string | null; notas: string | null; diasParaVencer: number | null; portalPath: string | null
}
export interface EntradaCertProveedor {
  proveedorNombre: string; proveedorPais: string; proveedorEmail?: string | null; productId?: string | null; fractionCode?: string | null
  tratado?: string; vigenciaDesde?: string | null; vigenciaHasta?: string | null; notas?: string | null; clienteId?: string | null
}
export interface ResultadoSolicitud { id: string; token: string; portalPath: string; portalUrl: string; correoEnviado: boolean; motivo: string | null }
export interface VistaPortal {
  id: string; proveedorNombre: string; proveedorPais: string; fractionCode: string | null; tratado: string; estado: string
  vigenciaDesde: string | null; vigenciaHasta: string | null; recibidoAt: string | null; producto: { productCode: string; description: string } | null; solicitante: string
}

// ── Cuotas ────────────────────────────────────────────────────────────────
export interface CuotaAplicable {
  duty: { id: string; resolutionNumber: string | null; expedienteUPCI: string | null; fractionCode: string; countryOfOrigin: string; productDesc: string | null; rateType: string; rate: number; rateUnit: string; investigationType: string | null; dofUrl: string | null }
  tasa: { tasa: number; rateUnit: string; empresa: string | null; origen: 'exportador' | 'general' | 'general_sin_lista' }
  fundamento: { resolucion: string | null; expedienteUPCI: string | null; fechaDOF: string | null; dofUrl: string | null; fuenteUrl: string | null; cotejo: 'cotejada' | 'pendiente'; cotejadoAt: string | null }
  esAntielusion: boolean
  vigencia: { desde: string | null; hasta: string | null; examenSunsetFecha: string | null; investigationType: string | null; expiraPronto: boolean; diasParaExpirar: number | null }
  montoUSD: number | null
  calculo: string
  otras: number
}
export interface CoberturaCuotas {
  total: number; activas: number; inactivas: number; vigentes: number; cotejadas: number; pendientesCotejo: number
  conTasasPorExportador: number; antielusion: number; conSunset: number; porPais: { pais: string; total: number; cotejadas: number }[]; nota: string
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const origenApi = {
  productos: (q?: string) => request<{ status: string; data: ProductoOrigen[] }>(`/origin/productos${qs({ q })}`),
  determinarBOM: (b: { productId: string; tratado?: string; porcentajeDeMinimis?: number; valorTransaccionUSD?: number; valores?: Record<string, number>; highWageLaborCost?: number; totalSteelAluminumValue?: number; northAmericanSteelAluminumValue?: number }) =>
    request<{ status: string; data: DeterminacionBOM }>('/origin/bom/determinar', { method: 'POST', body: JSON.stringify(b) }),
  salto: (b: { fraccionFinal: string; codigo: 'CC' | 'CTH' | 'CTSH'; materiales: MaterialBOM[]; valorTransaccionUSD?: number; porcentajeDeMinimis?: number }) =>
    request<{ status: string; data: { salto: ResultadoSalto; deMinimis: ResultadoDeMinimis } }>('/origin/salto', { method: 'POST', body: JSON.stringify(b) }),
  cobertura: (tratado = 'TMEC', fracciones: string[] = []) => request<{ status: string; data: ReporteCobertura }>(`/origin/reglas/cobertura${qs({ tratado, fracciones: fracciones.join(',') })}`),
  importarReglas: (b: { archivoBase64: string; nombreArchivo?: string; dryRun?: boolean }) => request<{ status: string; data: ReporteImport }>('/origin/reglas/importar', { method: 'POST', body: JSON.stringify(b) }, 120000),
  plantillaReglasURL: '/api/origin/reglas/plantilla.xlsx',
  prellenarCertificado: (p: { analysisId?: string; productId?: string; clienteId?: string; certificadorTipo?: string }) => request<{ status: string; data: CertificadoPrellenado }>(`/origin/certificados/prellenar${qs(p)}`),
  certProveedores: (estado?: string) => request<{ status: string; data: CertProveedor[] }>(`/origin/proveedores/certificados${qs({ estado })}`),
  certProveedorCrear: (b: EntradaCertProveedor) => request<{ status: string; data: CertProveedor }>('/origin/proveedores/certificados', { method: 'POST', body: JSON.stringify(b) }),
  certProveedorActualizar: (id: string, b: Partial<EntradaCertProveedor> & { estado?: string }) => request<{ status: string; data: CertProveedor }>(`/origin/proveedores/certificados/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  certProveedorEliminar: (id: string) => request<{ status: string }>(`/origin/proveedores/certificados/${id}`, { method: 'DELETE' }),
  certProveedorSolicitar: (id: string) => request<{ status: string; data: ResultadoSolicitud }>(`/origin/proveedores/certificados/${id}/solicitar`, { method: 'POST' }),
  certProveedoresProcesarVencimientos: () => request<{ status: string; data: { vencidos: number; alertas: number } }>('/origin/proveedores/vencimientos/procesar', { method: 'POST' }),
  // Público (sin token de sesión; request manda Authorization solo si existe)
  portalVer: (token: string) => request<{ status: string; data: VistaPortal }>(`/origin/portal/${encodeURIComponent(token)}`),
  portalSubir: (token: string, b: { archivoBase64: string; mimeType: string; nombreArchivo: string; vigenciaDesde?: string; vigenciaHasta: string; numeroCertificado?: string }) =>
    request<{ status: string; data: VistaPortal }>(`/origin/portal/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify(b) }, 60000),
}

export const cuotasApi = {
  buscar: (b: { fractionCode: string; countryOfOrigin: string; exportador?: string; valueUSD?: number; weightKg?: number; units?: number }) =>
    request<{ status: string; data: CuotaAplicable | null }>('/antidumping/buscar', { method: 'POST', body: JSON.stringify(b) }),
  cobertura: () => request<{ status: string; data: CoberturaCuotas }>('/antidumping/cobertura'),
  detectarElusion: () => request<{ status: string; data: { cruces: number; alertas: number; existentes: number } }>('/antidumping/elusion/detectar', { method: 'POST' }),
  importarUPCI: (b: { archivoBase64: string; nombreArchivo?: string; dryRun?: boolean }) => request<{ status: string; data: ReporteImport & { duplicadasEnArchivo: number } }>('/admin/antidumping/importar', { method: 'POST', body: JSON.stringify(b) }, 120000),
  plantillaUPCIURL: '/api/admin/antidumping/plantilla.xlsx',
}

/** Lee un File del navegador como base64 (sin el prefijo data:). */
export function archivoABase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(f)
  })
}
