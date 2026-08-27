/**
 * API de la rama ola2/copilot-risk-expedientes (Operación 2026-08).
 * Copilot en contexto · precedentes por fracción · importación de corpus ·
 * Risk Scorer operativo · Expediente electrónico. Importa `request` de
 * api-core (regla: no tocar client/src/lib/api.ts).
 */
import { request } from '../api-core'

// ── Precedentes por fracción ──────────────────────────────────────────
export interface PrecedentePorFraccionItem {
  id: string; type: string; reference: string; title: string; topic: string; summary: string; ruling: string;
  yearPublished: number; litigated: boolean; source: string | null; fractionCodes: string[]
}
export interface PrecedentesPorFraccion {
  fraccion: string; verificados: number; criterios: number; tesis: number; otros: number;
  items: PrecedentePorFraccionItem[]; cargadosSinVerificar: number; corpusVerificado: boolean; mensaje: string
}
export const precedentesPorFraccion = (code: string) =>
  request<{ status: string; data: PrecedentesPorFraccion }>(`/precedents/por-fraccion/${encodeURIComponent(code)}`)

// ── Importación de corpus / precedentes (admin) ───────────────────────
export interface ResultadoFilaImportacion {
  indice: number; reference: string; estado: 'creado' | 'actualizado' | 'duplicado' | 'rechazado'; verificado: boolean; errores: string[]; avisos: string[]; id?: string
}
export interface ResultadoImportacion {
  total: number; creados: number; actualizados: number; duplicados: number; rechazados: number; verificados: number; filas: ResultadoFilaImportacion[]
}
export const legalDocsImportar = (fileName: string, base64: string) =>
  request<{ status: string; data: ResultadoImportacion; materialPendiente: { material: string; motivo: string }[] }>('/admin/legal-docs/importar', { method: 'POST', body: JSON.stringify({ fileName, base64 }) })
export const precedentsImportar = (fileName: string, base64: string) =>
  request<{ status: string; data: ResultadoImportacion; aviso: string | null }>('/admin/precedents/importar', { method: 'POST', body: JSON.stringify({ fileName, base64 }) })
export interface EstadoPrecedentes {
  corpusVerificado: boolean; total: number; conFuente: number; sinFuente: number;
  items: { id: string; type: string; reference: string; title: string; source: string | null; yearPublished: number; isVigente: boolean; fractionCodes: string[]; tieneFuente: boolean; cotejo: string | null }[]
}
export const precedentsEstado = () => request<{ status: string; data: EstadoPrecedentes }>('/admin/precedents/estado')
export const PLANTILLA_LEGAL_DOCS_URL = '/api/admin/legal-docs/plantilla.xlsx'
export const PLANTILLA_PRECEDENTES_URL = '/api/admin/precedents/plantilla.xlsx'

// ── Risk Scorer operativo ─────────────────────────────────────────────
export interface RiskHistorialFila { id: string; folio: string | null; exposicion: number; escudoPct: number; banda: string; rulesVersion: string; createdAt: string; operationId: string | null }
export const riskHistorial = (clienteId: string) =>
  request<{ status: string; data: { cliente: { id: string; rfc: string; razonSocial: string }; vivo: RiskHistorialFila | null; serie: RiskHistorialFila[] } }>(`/risk/clientes/${clienteId}/historial`)
export interface FilaCartera {
  clienteId: string; rfc: string; razonSocial: string; assessmentId: string | null; folio: string | null;
  exposicion: number | null; escudoPct: number | null; banda: string | null; tendencia: 'sube' | 'baja' | 'estable' | 'sin_historial'; fecha: string | null; evaluaciones: number
}
export const riskCartera = () => request<{ status: string; data: FilaCartera[]; total: number }>('/risk/cartera')
export const riskEvidencia = (assessmentId: string, factorId: string, archivo: { fileName: string; mimeType: string; base64: string; nombre?: string }) =>
  request<{ status: string; data: { documentId: string; factorId: string; evidencia: Record<string, { documentId: string; verificadoAt: string; nombre?: string }>; resultado: unknown } }>(
    `/risk/${assessmentId}/factores/${encodeURIComponent(factorId)}/evidencia`, { method: 'POST', body: JSON.stringify(archivo) })
export const riskArchivar = (assessmentId: string, operationId?: string) =>
  request<{ status: string; data: { documentId: string; operationId: string; folio: string | null; hash: string } }>(`/risk/${assessmentId}/archivar`, { method: 'POST', body: JSON.stringify({ operationId }) })
export const riskDictamenUrl = (assessmentId: string) => `/api/risk/${assessmentId}/dictamen.html`

// ── Expediente electrónico ────────────────────────────────────────────
export type Cotejo = 'corpus' | 'pendiente'
export interface FundamentoExpediente { articulo: string; citaCorta: string; fuente: string; url: string; fechaCotejo: string | null; cotejo: Cotejo }
export interface IncisoChecklist {
  id: string; inciso: string; descripcion: string; estado: 'completo' | 'pendiente' | 'no_aplica';
  documentos: { id: string; name: string; type: string; status: string }[]; documentosEsperados: string[]; condicional: boolean; fundamento: FundamentoExpediente; cotejo: Cotejo
}
export interface ChecklistExpediente {
  generadoAt: string; incisos59V: IncisoChecklist[]; piezas162VII: IncisoChecklist[];
  completitud59V: number; completitud162VII: number; completitudDocumentos: number; semaforo: 'verde' | 'ambar' | 'rojo'; noAplica: string[]
}
export interface DiferenciaGlosa {
  codigo: string; severidad: 'error' | 'advertencia' | 'info'; campo: string; fuenteA: string; fuenteB: string;
  valorA: string | number | null; valorB: string | number | null; delta: number | null; tolerancia: string; mensaje: string
}
export interface ResultadoGlosaDocumental {
  consistente: boolean; errores: number; advertencias: number; diferencias: DiferenciaGlosa[]; cruces: string[]; faltantes: string[];
  tolerancias: { valorPct: number; valorAbs: number; pesoPct: number; cantidadAbs: number; bultosAbs: number }; fuentePedimento: 'importado' | 'extraido' | 'ninguno'; generadoAt: string
}
export interface DocumentoExpediente {
  id: string; name: string; type: string; docType: string | null; status: string; required: boolean; fileName: string | null; fileSize: number | null;
  mimeType: string | null; fileHash: string | null; confidence: number | null; extractedData: Record<string, unknown> | null; aiErrors: string[] | null; verifiedAt: string | null; notes: string | null; createdAt: string
}
export interface OperacionExpediente {
  id: string; reference: string; type: string; status: string; description: string | null; fractionCode: string | null; origin: string | null; customsValue: number | null;
  currency: string | null; customsBroker: string | null; operationDate: string | null; createdAt: string; clienteId: string | null; pedimentoId: string | null;
  completeness: number; missingDocuments: { type: string; name: string; required: boolean }[]; documents: DocumentoExpediente[];
  checklist: ChecklistExpediente; glosaDocumental: ResultadoGlosaDocumental | null; retencionHasta: string | null;
  retencion: { hasta: string | null; anios: number; fundamento: FundamentoExpediente }
}
export interface OperacionLista {
  id: string; reference: string; type: string; status: string; fractionCode: string | null; origin: string | null; customsValue: number | null; currency: string | null;
  createdAt: string; operationDate: string | null; retencionHasta: string | null; clienteId: string | null; completeness: number;
  documents: { id: string; type: string; docType: string | null; status: string; required: boolean }[]; glosaDocumental: { consistente: boolean | null; errores: number } | null
}
export const expedientesList = (status?: string) => request<{ status: string; data: OperacionLista[] }>(`/operations${status ? `?status=${status}` : ''}`)
export const expedienteDetalle = (id: string) => request<{ status: string; data: OperacionExpediente }>(`/operations/${id}`)
export const expedienteCrear = (body: { reference: string; type: string; description?: string; fractionCode?: string; origin?: string; customsValue?: number; customsBroker?: string; operationDate?: string }) =>
  request<{ status: string; data: { id: string } }>('/operations', { method: 'POST', body: JSON.stringify(body) })
export const expedienteChecklist = (id: string, noAplica?: string[]) =>
  request<{ status: string; data: { checklist: ChecklistExpediente; completeness: number } }>(`/operations/${id}/checklist`, { method: 'POST', body: JSON.stringify({ noAplica }) })
export const expedienteSubirDocumento = (id: string, body: { fileName: string; mimeType: string; base64: string; type?: string; extraer?: boolean; nombre?: string }) =>
  request<{ status: string; data: { document: DocumentoExpediente; checklist: ChecklistExpediente; completeness: number; extraccion: { docType: string; confidence: number; errores: string[] } | null; errorExtraccion: string | null } }>(
    `/operations/${id}/documentos`, { method: 'POST', body: JSON.stringify(body) }, 180_000)
export const expedienteGlosa = (id: string, tolerancias?: Partial<ResultadoGlosaDocumental['tolerancias']>) =>
  request<{ status: string; data: ResultadoGlosaDocumental }>(`/operations/${id}/glosa`, { method: 'POST', body: JSON.stringify({ tolerancias }) })
export const expedienteRetencion = (id: string, fechaOperacion?: string) =>
  request<{ status: string; data: { retencionHasta: string; fundamento: FundamentoExpediente; obligacionId: string } }>(`/operations/${id}/retencion`, { method: 'POST', body: JSON.stringify({ fechaOperacion }) })
export const expedienteVincularPedimento = (id: string, pedimentoId: string | null) =>
  request<{ status: string; data: { pedimentoId: string | null } }>(`/operations/${id}/vincular-pedimento`, { method: 'POST', body: JSON.stringify({ pedimentoId }) })
export const expedienteEliminar = (id: string) => request<{ status: string }>(`/operations/${id}`, { method: 'DELETE' })
export const expedienteDocumentoEstado = (opId: string, docId: string, body: { status: string; fileName?: string; notes?: string }) =>
  request<{ status: string; data: DocumentoExpediente; completeness: number; checklist: ChecklistExpediente }>(`/operations/${opId}/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(body) })
export const paqueteAuditoriaUrl = (id: string) => `/api/operations/${id}/paquete-auditoria.zip`

/** Descarga autenticada (los <a href> no llevan el Bearer). */
export async function descargarConToken(url: string, nombre: string): Promise<void> {
  const token = localStorage.getItem('aduanai_token')
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`No se pudo descargar (${res.status})`)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 5000)
}

/** Abre un HTML autenticado (dictamen) en pestaña nueva. */
export async function abrirHtmlConToken(url: string): Promise<void> {
  const token = localStorage.getItem('aduanai_token')
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`No se pudo abrir (${res.status})`)
  const html = await res.text()
  const w = window.open('', '_blank')
  if (!w) throw new Error('El navegador bloqueó la pestaña nueva')
  w.document.open(); w.document.write(html); w.document.close()
}

export function archivoABase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = () => res(((reader.result as string) ?? '').split(',')[1] ?? '')
    reader.onerror = rej
    reader.readAsDataURL(file)
  })
}
