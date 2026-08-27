/**
 * SELLO · Reporte de Revisión Pre-Glosa (docs/DESIGN_SYSTEM.md).
 *
 * NO es un dashboard: es el DOCUMENTO que el agente imprime, archiva y —si las
 * cosas se ponen feas— usa para defenderse. Layout de documento (columna 860px,
 * hoja blanca sobre papel), encabezado con folio + versión de corpus sellada,
 * resumen ejecutivo con semáforo, hallazgos numerados (con el dato del
 * pedimento cuando el flag mapea a uno real), fundamentos con URL visible, y
 * pie repetido en cada hoja impresa.
 *
 * PDF: no hay librería de PDF en el stack (auditoría) y el servidor solo tiene
 * dictamen.html para clasificaciones, no glosa. Decisión: print CSS + impresión
 * del navegador ("Descargar PDF" → window.print()). Para un documento legal es
 * la MEJOR opción del stack: texto vectorial seleccionable/buscable, fuentes
 * embebidas, sobrevive en escala de grises — jspdf/html2canvas lo rasterizaría
 * a imagen borrosa, peor para archivar. Ver print CSS en index.css.
 *
 * HONESTIDAD (docs/GAP_API_EXPEDIENTE.md): la respuesta de glosa da el texto
 * del fundamento (legalBasis) pero NO su cotejo por-dato (URL+fecha+método) →
 * cada cita rinde sello ámbar "sin_verificar". La versión de corpus SÍ es un
 * cotejo real (fechas SNICE/DOF) → verde. Números de campo del pedimento: solo
 * se muestra el DATO del pedimento cuando el flag mapea a uno; no se fabrican
 * números de campo del Anexo 22 (no cotejados). La estructura dice la verdad.
 */
import { Fragment, useEffect, useState } from 'react'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { useSearchParams } from 'react-router-dom'
import {
  Printer, RotateCcw, CheckCircle2, AlertTriangle, ShieldAlert, ClipboardCheck, FileUp, Archive, ChevronDown, ChevronUp,
} from 'lucide-react'
import { api } from '../lib/api'
import type { GlosaSimulationInput, GlosaSimulationResult, GlosaRiskFlag, DominioGlosa, Anexo22Catalogs } from '../lib/api'
import { Button, Card, Badge, Input, Select, Textarea, SelloVerificacion, useCampoNumerico, type EstadoSello } from '../components/ui'
import { ImportarArchivo } from '../components/pedimentos/ImportarArchivo'
import { PaisSelect } from '../components/pedimentos/PaisSelect'
import { apiPedimentos, type GlosaPedimentoResultado, type CruceGlosa, type GlosaSimulationResultConCruces } from '../lib/api/pedimentos'

export const GUIA_MODULO = {
  titulo: 'Reporte de revisión pre-glosa',
  pasos: [
    'Importa el archivo M3 / Data Stage: se genera una revisión por partida y un resumen del pedimento (riesgo máximo, hallazgos agregados, reglas no evaluadas).',
    'O captura una operación: fracción, país de origen y vendedor (combo con catálogo), aduana, clave y valores.',
    'Lee los hallazgos y los cruces por partida (origen-tratado, cuota por exportador, UMC/UMT, precio estimado, identificadores Ap. 8): cada uno cita fundamento y si pudo evaluarse.',
    'Un dominio sin revisar o una partida indeterminada nunca se presenta como riesgo bajo.',
    'Descarga el PDF (impresión del navegador) y archiva el reporte al expediente del pedimento.',
  ],
}

// ── Cruces por partida (Operación 2026-08) ────────────────────────────────
const CRUCE_RESULTADO: Record<NonNullable<CruceGlosa['resultado']>, { label: string; tono: 'neutral' | 'ambar' | 'carmin' | 'petroleo' }> = {
  ok: { label: 'Congruente', tono: 'petroleo' }, observacion: { label: 'Observación', tono: 'ambar' }, hallazgo: { label: 'Hallazgo', tono: 'carmin' },
}

function SeccionCruces({ cruces }: { cruces: CruceGlosa[] }) {
  if (!cruces || cruces.length === 0) return null
  return (
    <section className="mt-8 doc-evitar-corte">
      <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-3">Cruces de la partida ({cruces.length})</h2>
      <ul className="space-y-3">
        {cruces.map(c => (
          <li key={c.codigo} className="border-l-2 pl-4" style={{ borderColor: c.estado === 'no_evaluado' ? 'var(--color-ambar)' : c.resultado === 'hallazgo' ? 'var(--color-carmin)' : 'var(--color-linea)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-sello-mono text-13 text-tinta-suave">{c.codigo}</span>
              <span className="text-base font-medium text-tinta">{c.nombre}</span>
              {c.estado === 'no_evaluado'
                ? <Badge tono="ambar">No evaluado</Badge>
                : <Badge tono={CRUCE_RESULTADO[c.resultado ?? 'ok'].tono}>{CRUCE_RESULTADO[c.resultado ?? 'ok'].label}</Badge>}
            </div>
            <p className="text-sm text-tinta leading-relaxed mt-1">{c.estado === 'no_evaluado' ? (c.motivo ?? c.mensaje) : c.mensaje}</p>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-13 text-tinta-suave">Fundamento:</span>
              <span className="text-13 text-tinta">{c.fundamento}</span>
              <SelloVerificacion estado={c.cotejoFundamento === 'verificado' ? 'verificado' : 'sin_verificar'} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Mapa flag.category → dato del pedimento (solo lo que mapea de verdad) ──
// Homenaje honesto a la estructura del pedimento: mostramos el NOMBRE del dato
// que el agente reconoce, no un número de campo del Anexo 22 sin cotejar.
const CATEGORIA_A_DATO: Record<string, string> = {
  valuation: 'Valor en aduana',
  value: 'Valor en aduana',
  valor: 'Valor en aduana',
  origin: 'País de origen / vendedor',
  origen: 'País de origen / vendedor',
  classification: 'Fracción arancelaria y NICO',
  clasificacion: 'Fracción arancelaria y NICO',
  antidumping: 'Identificador de cuota compensatoria',
  cuotas: 'Identificador de cuota compensatoria',
  nom: 'Regulaciones y restricciones no arancelarias',
  noms: 'Regulaciones y restricciones no arancelarias',
  rrna: 'Regulaciones y restricciones no arancelarias',
  padron: 'Padrón de importadores de sectores específicos',
  regime: 'Clave de pedimento / régimen',
  regimen: 'Clave de pedimento / régimen',
  documentation: 'Anexos del pedimento (36-A LA)',
  tmec: 'Certificación de origen (preferencia arancelaria)',
}

function datoDelPedimento(flag: GlosaRiskFlag): string | null {
  const c = flag.category?.toLowerCase() ?? ''
  for (const [k, v] of Object.entries(CATEGORIA_A_DATO)) if (c.includes(k)) return v
  return null
}

// ── Fuente oficial de una cita legal (URL estable de la ley; el cotejo por
// artículo sigue pendiente → sello ámbar). Da URL visible en impresión. ──
const LEYES: { re: RegExp; nombre: string; url: string }[] = [
  { re: /\bLA\b|Ley Aduanera|\bL\.?A\.?\b/i, nombre: 'Ley Aduanera', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf' },
  { re: /\bLCE\b|Comercio Exterior/i, nombre: 'Ley de Comercio Exterior', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LCE.pdf' },
  { re: /\bCFF\b|Código Fiscal/i, nombre: 'Código Fiscal de la Federación', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf' },
  { re: /\bRGCE\b|Reglas Generales/i, nombre: 'RGCE 2026', url: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf' },
  { re: /Anexo 22/i, nombre: 'Anexo 22 RGCE 2026', url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5778300&fecha=15/01/2026' },
]

interface FuenteCitada {
  id: string; texto: string; nombre?: string; url?: string; estado: EstadoSello
  fechaPublicacion?: string; fechaVerificacion?: string; metodo?: 'manual' | 'scraper'
}

// Frontera Canónica Fase 2: si el flag trae `fundamento` (DatoLegal), el sello
// sale de su procedencia real — verde SOLO cuando la regla está cotejada en DB.
// Sin fundamento estructurado, cae al comportamiento previo (ámbar honesto).
function fuenteDeFlag(flag: GlosaRiskFlag): FuenteCitada | null {
  const texto = flag.fundamento?.valor ?? flag.legalBasis
  if (!texto) return null
  const f = flag.fundamento
  if (f && f.estado === 'verificado' && f.fuente) {
    return {
      id: texto,
      texto,
      nombre: f.fuente.nombre,
      url: f.fuente.url ?? undefined,
      estado: 'verificado',
      fechaPublicacion: f.fuente.fechaPublicacion ?? undefined,
      fechaVerificacion: f.fechaCotejo ?? undefined,
      metodo: f.metodo === 'ingesta' ? 'scraper' : f.metodo,
    }
  }
  const m = LEYES.find(l => l.re.test(texto))
  return {
    id: texto,
    texto,
    nombre: m?.nombre,
    url: m?.url,
    estado: 'sin_verificar', // cotejo por-artículo pendiente; ámbar honesto
  }
}

// ── Dominios de la revisión fail-closed (§5.1) ────────────────────────────
const DOMINIO_LABEL: Record<DominioGlosa, string> = {
  precio_estimado: 'Precio estimado SAT',
  historico_importador: 'Histórico del importador',
  cuotas_compensatorias: 'Cuotas compensatorias',
  padrones: 'Padrones SAT',
  noms: 'NOMs requeridas',
  reclasificacion_historica: 'Reclasificación histórica',
}

// ── Semáforo del veredicto ────────────────────────────────────────────────
// FAIL-CLOSED (§5.2): con revisión incompleta el veredicto NUNCA puede ser el
// verde "Sin hallazgos" — un dominio sin revisar puede esconder exactamente el
// hallazgo que falta. El backend ya manda riskLevelPresentacion='indeterminado';
// aquí se respeta en la presentación.
function veredicto(result: GlosaSimulationResult) {
  const criticos = result.flags.filter(f => f.severity === 'critical').length
  const observaciones = result.flags.filter(f => f.severity !== 'critical').length
  const incompleta = result.revision ? !result.revision.completa : false
  if (criticos > 0) return {
    color: 'carmin' as const, icono: ShieldAlert,
    titulo: `${criticos} ${criticos === 1 ? 'hallazgo crítico' : 'hallazgos críticos'}${incompleta ? ' · revisión incompleta' : ''}`,
    frase: 'Hay observaciones que un glosador del SAT muy probablemente marcaría. Atiéndelas antes de transmitir el pedimento.',
  }
  if (incompleta) return {
    color: 'carmin' as const, icono: ShieldAlert,
    titulo: 'Resultado indeterminado — revisión incompleta',
    frase: `El sistema no pudo consultar ${result.revision.noRevisados.length === 1 ? 'uno de los dominios' : `${result.revision.noRevisados.length} dominios`} de la revisión. Los hallazgos listados son válidos, pero la ausencia de hallazgos en los dominios no revisados NO significa que estén limpios. No transmitas confiando en este reporte parcial.`,
  }
  if (observaciones > 0) return {
    color: 'ambar' as const, icono: AlertTriangle,
    titulo: `${observaciones} ${observaciones === 1 ? 'observación' : 'observaciones'}`,
    frase: 'No hay hallazgos críticos, pero conviene revisar y documentar los puntos siguientes para llegar mejor preparado a una revisión.',
  }
  return {
    color: 'sello' as const, icono: CheckCircle2,
    titulo: 'Sin hallazgos',
    frase: 'Con la información proporcionada, la operación no dispara reglas de riesgo de glosa. Conserva este reporte y la documentación soporte.',
  }
}

const SEVERIDAD: Record<GlosaRiskFlag['severity'], { label: string; tono: 'neutral' | 'ambar' | 'carmin' }> = {
  low: { label: 'Aviso', tono: 'neutral' },
  medium: { label: 'Observación', tono: 'ambar' },
  high: { label: 'Observación relevante', tono: 'ambar' },
  critical: { label: 'Crítico', tono: 'carmin' },
}

function fechaHoraLarga(d: Date): string {
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Folio legible derivado del simulationId (estable, no fabricado).
function folioDe(simulationId: string, fecha: Date): string {
  const y = fecha.getFullYear()
  const corto = simulationId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()
  return `PG-${y}-${corto}`
}

export function GlosaSimulatorPage() {
  const [params] = useSearchParams()
  const [catalogos, setCatalogos] = useState<Anexo22Catalogs | null>(null)
  const [form, setForm] = useEstadoPersistente<GlosaSimulationInput>('preglosa', {
    fractionCode: params.get('fraccion') ?? '',
    productDescription: '',
    countryOrigin: '', countryProvider: '', customsCode: '', regimenCode: 'IMD',
    unitValueUSD: 0, weightKg: 0, totalValueUSD: 0,
    declaresAntidumping: false, appliesTMEC: false, hasTMECCertificate: false,
    declaresNOMs: false, hasIVAIEPSCertification: false, declaresLink: false,
    // Captura real (misión 25-ago): sin este dato ORI_002 disparaba siempre
    // que se marcaran los dos checkboxes T-MEC.
    documents: { originCertificate: false },
  })
  const [estado, setEstado] = useState<'form' | 'generando' | 'listo' | 'listo-pedimento' | 'error'>('form')
  const [pedResultado, setPedResultado] = useState<GlosaPedimentoResultado | null>(null)
  const [partidaAbierta, setPartidaAbierta] = useState<number | null>(null)
  const [archivado, setArchivado] = useState<{ reference: string; documentName: string } | null>(null)
  const [archivando, setArchivando] = useState(false)
  const [mostrarImportar, setMostrarImportar] = useState(false)
  const [declaradoPed, setDeclaradoPed] = useState<{ hasIVAIEPSCertification?: boolean; hasTMECCertificate?: boolean }>({})
  const [paso, setPaso] = useState(0)
  const [result, setResult] = useState<GlosaSimulationResult | null>(null)
  const [error, setError] = useState('')
  const [generadoEn, setGeneradoEn] = useState<Date | null>(null)

  useEffect(() => { api.catalogsAnexo22().then(r => setCatalogos(r.data)).catch(() => {}) }, [])

  // D10 (misión 25-ago-2026): Pre-Glosa y Fiscal cuentan la misma historia —
  // si el tenant tiene certificación IVA/IEPS ACTIVA registrada en Fiscal, el
  // checkbox arranca prellenado (el usuario puede corregirlo).
  useEffect(() => {
    api.fiscalCertification()
      .then(r => {
        if (r.data?.status === 'ACTIVE') setForm(f => ({ ...f, hasIVAIEPSCertification: true }))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (estado !== 'generando') return
    setPaso(0)
    const t1 = setTimeout(() => setPaso(1), 700)
    const t2 = setTimeout(() => setPaso(2), 1500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [estado])

  const set = <K extends keyof GlosaSimulationInput>(k: K, v: GlosaSimulationInput[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // D4 (auditoría 21-ago, cerrado 24-ago): los campos de dinero/peso usan el
  // campo numérico compartido — "0.02" y ".02" se capturan tal cual (la clase
  // rota `value={x || ''}` + parseFloat por tecla se los comía).
  const campoUnitValue = useCampoNumerico(form.unitValueUSD, n => set('unitValueUSD', n))
  const campoWeight = useCampoNumerico(form.weightKg, n => set('weightKg', n))
  const campoTotalValue = useCampoNumerico(form.totalValueUSD, n => set('totalValueUSD', n))

  async function generarDesdePedimento(id: string) {
    setEstado('generando'); setError(''); setArchivado(null); setPartidaAbierta(null)
    try {
      const res = await apiPedimentos.glosaDesdePedimento(id, declaradoPed)
      setPedResultado(res.data)
      setGeneradoEn(new Date())
      setEstado('listo-pedimento')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el reporte del pedimento.')
      setEstado('error')
    }
  }

  async function archivarPedimento() {
    if (!pedResultado) return
    setArchivando(true)
    try {
      const r = await apiPedimentos.archivar(pedResultado.pedimentoId, 'preglosa', pedResultado as unknown as Record<string, unknown>,
        `Riesgo máximo ${pedResultado.resumen.riskLevelPresentacion} · ${pedResultado.resumen.hallazgos.length} hallazgo(s) agregados`)
      setArchivado({ reference: r.data.reference, documentName: r.data.documentName })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo archivar') }
    setArchivando(false)
  }

  async function generar() {
    setEstado('generando'); setError('')
    try {
      const res = await api.glosaSimulate({ ...form, totalValueUSD: form.totalValueUSD || (form.unitValueUSD * (form.units ?? 1)) })
      setResult(res.data)
      setGeneradoEn(new Date())
      setEstado('listo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el reporte.')
      setEstado('error')
    }
  }

  // ── Estado: formulario ──
  if (estado === 'form' || estado === 'generando' || estado === 'error') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="font-sello-display text-28 text-tinta">Reporte de revisión pre-glosa</h1>
          <p className="text-base text-tinta-suave leading-relaxed mt-1">
            Captura los datos de la operación y genera el documento que te dice qué te observaría un glosador del SAT antes de transmitir.
          </p>
        </div>

        <Card denso header={
          <button type="button" className="w-full flex items-center gap-2 text-left" onClick={() => setMostrarImportar(m => !m)}>
            <FileUp className="w-5 h-5 text-tinta-suave" strokeWidth={1.5} aria-hidden />
            <span className="text-base font-medium text-tinta">Importar archivo M3 / Data Stage</span>
            <span className="text-sm text-tinta-suave">— una revisión por partida y resumen del pedimento</span>
            {mostrarImportar ? <ChevronUp className="w-4 h-4 ml-auto text-tinta-suave" aria-hidden /> : <ChevronDown className="w-4 h-4 ml-auto text-tinta-suave" aria-hidden />}
          </button>
        }>
          {mostrarImportar ? (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-2">
                {([['hasIVAIEPSCertification', 'El importador tiene certificación IVA/IEPS'], ['hasTMECCertificate', 'Cuenta con certificado de origen T-MEC vinculado']] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-tinta cursor-pointer py-1">
                    <input type="checkbox" className="accent-petroleo w-4 h-4" checked={!!declaradoPed[k]} onChange={e => setDeclaradoPed(d => ({ ...d, [k]: e.target.checked }))} />
                    {label} <span className="text-13 text-tinta-suave">(el archivo no lo trae)</span>
                  </label>
                ))}
              </div>
              <ImportarArchivo onImportado={id => { void generarDesdePedimento(id) }} />
            </div>
          ) : (
            <p className="text-sm text-tinta-suave">Abre para arrastrar el .txt del SAAI M3 o el CSV de Data Stage. Nada se recaptura.</p>
          )}
        </Card>

        <Card>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Fracción arancelaria" mono requerido placeholder="7318.15.01"
              value={form.fractionCode} onChange={e => set('fractionCode', e.target.value)} />
            <PaisSelect label="País de origen" value={form.countryOrigin} onChange={v => set('countryOrigin', v)} />
            <PaisSelect label="País del vendedor" value={form.countryProvider} onChange={v => set('countryProvider', v)} />
            <Select label="Aduana" value={form.customsCode} onChange={e => set('customsCode', e.target.value)}>
              <option value="">Selecciona…</option>
              {catalogos?.aduanas.map(a => <option key={a.clave} value={a.clave}>{a.clave} — {a.denominacion}</option>)}
            </Select>
            <Select label="Clave de pedimento" value={form.regimenCode} onChange={e => set('regimenCode', e.target.value)}>
              {catalogos?.clavesPedimento.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
            </Select>
            <Input label="Valor unitario (USD)" mono placeholder="0.00" {...campoUnitValue} />
            <Input label="Peso (kg)" mono placeholder="0" {...campoWeight} />
            <Input label="Valor total de la operación (USD)" mono placeholder="0.00" {...campoTotalValue} />
          </div>

          <div className="mt-4">
            <Textarea label="Descripción del producto en factura" rows={2}
              placeholder="Ej. Tornillos de acero inoxidable A2, rosca métrica M8×40, cabeza hexagonal, para ensamble de maquinaria"
              value={form.productDescription ?? ''} onChange={e => set('productDescription', e.target.value)} />
            <p className="text-xs text-tinta-suave mt-1">
              La regla de descripción genérica (CLA_002) se evalúa sobre este texto; sin él queda «no evaluada».
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-linea">
            <p className="text-sm text-tinta-suave mb-3">Declaraciones de la operación</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {([
                ['declaresAntidumping', 'Declara cuota compensatoria'],
                ['appliesTMEC', 'Aplica preferencia T-MEC'],
                ['hasTMECCertificate', 'Cuenta con certificado de origen T-MEC'],
                ['declaresNOMs', 'Declara cumplimiento de NOMs'],
                ['hasIVAIEPSCertification', 'Tiene certificación IVA/IEPS'],
                ['declaresLink', 'Declara vinculación comprador-vendedor'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-tinta cursor-pointer py-1">
                  <input type="checkbox" className="accent-petroleo w-4 h-4"
                    checked={!!form[k]} onChange={e => set(k, e.target.checked as never)} />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-tinta cursor-pointer py-1">
                <input type="checkbox" className="accent-petroleo w-4 h-4"
                  checked={!!form.documents?.originCertificate}
                  onChange={e => set('documents', { ...form.documents, originCertificate: e.target.checked })} />
                Certificado de origen vinculado al pedimento
              </label>
            </div>
          </div>
        </Card>

        {estado === 'error' && (
          <Card className="border-carmin/30 bg-carmin-suave">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-carmin shrink-0" strokeWidth={1.5} aria-hidden />
              <div>
                <p className="text-base font-medium text-carmin">No se pudo generar el reporte</p>
                <p className="text-sm text-tinta-suave mt-0.5">{error}</p>
                <Button variante="secundario" tamano="sm" className="mt-3" onClick={generar}>
                  <RotateCcw className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Reintentar
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button variante="primario" tamano="lg" loading={estado === 'generando'}
            disabled={!form.fractionCode.trim() || estado === 'generando'} onClick={generar}>
            <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} aria-hidden />
            Generar reporte pre-glosa
          </Button>
          {estado === 'generando' && (
            <ul className="text-sm space-y-0.5">
              {['Evaluando reglas de valoración y origen…', 'Cotejando cuotas, NOMs y padrones…', 'Redactando hallazgos y recomendaciones…'].map((t, i) => (
                <li key={i} className={`flex items-center gap-2 ${i < paso ? 'text-sello' : i === paso ? 'text-tinta' : 'text-tinta-suave/50'}`}>
                  {i < paso ? <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                    : i === paso ? <span className="w-3.5 h-3.5 rounded-full border-2 border-petroleo border-t-transparent animate-spin" aria-hidden />
                    : <span className="w-3.5 h-3.5 rounded-full border border-linea" aria-hidden />}
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // ── Estado: reporte multipartida (desde pedimento importado) ──
  if (estado === 'listo-pedimento' && pedResultado && generadoEn) {
    return (
      <ReportePedimento
        r={pedResultado} generadoEn={generadoEn} archivado={archivado} archivando={archivando}
        partidaAbierta={partidaAbierta} setPartidaAbierta={setPartidaAbierta}
        onArchivar={archivarPedimento}
        onNuevo={() => { setEstado('form'); setPedResultado(null); setArchivado(null) }}
        error={error}
      />
    )
  }

  // ── Estado: reporte listo ──
  if (!result || !generadoEn) return null
  const v = veredicto(result)
  const folio = folioDe(result.simulationId, generadoEn)
  const revisionIncompleta = result.revision ? !result.revision.completa : false
  const fuentes = [...new Map(
    result.flags.map(f => fuenteDeFlag(f)).filter((s): s is FuenteCitada => s !== null).map(s => [s.texto, s]),
  ).values()]
  const pieTexto = `${folio} · ${fechaHoraLarga(generadoEn)} · Generado por ADUANAI — cada cita indica su estado de verificación${revisionIncompleta ? ' · REVISIÓN INCOMPLETA' : ''}`

  return (
    <div>
      {/* Barra de acciones (no se imprime) */}
      <div className="max-w-[860px] mx-auto mb-4 flex items-center gap-2 no-print">
        <Button variante="primario" onClick={() => window.print()}>
          <Printer className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Descargar PDF
        </Button>
        <Button variante="secundario" onClick={() => { setEstado('form'); setResult(null) }}>
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Nuevo reporte
        </Button>
      </div>

      {/* El documento */}
      <article className="doc-imprimible max-w-[860px] mx-auto">
        <div className="doc-hoja bg-superficie border border-linea rounded-sello p-8 sm:p-12 text-tinta">
          {/* Encabezado */}
          <header className="doc-evitar-corte">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-sello-display text-lg text-tinta">ADUANAI</p>
                <h1 className="font-sello-display text-28 text-tinta mt-3">Reporte de revisión pre-glosa</h1>
              </div>
              <dl className="text-13 font-sello-ui text-right space-y-0.5">
                <div><dt className="inline text-tinta-suave">Folio: </dt><dd className="inline font-sello-mono text-tinta">{folio}</dd></div>
                <div><dt className="inline text-tinta-suave">Generado: </dt><dd className="inline font-sello-mono text-tinta">{fechaHoraLarga(generadoEn)}</dd></div>
                <div><dt className="inline text-tinta-suave">Fracción: </dt><dd className="inline font-sello-mono text-tinta">{form.fractionCode}</dd></div>
              </dl>
            </div>
            {/* Versión normativa — ECO-DEVUELTA por el backend en ESTA corrida
                (Frontera Canónica §5.5: ya no se lee el espejo del cliente) */}
            {result.versiones && (
              <div className="mt-4 pt-4 border-t border-linea flex items-center gap-2 flex-wrap">
                <span className="text-sm text-tinta-suave">Base normativa usada:</span>
                <span className="text-sm text-tinta">{result.versiones.tigie}</span>
                <SelloVerificacion
                  estado="verificado"
                  fuenteNombre={result.versiones.fuenteNombre}
                  fuenteUrl={result.versiones.fuenteUrl}
                  fechaPublicacion={result.versiones.fechaPublicacion}
                  fechaVerificacion={result.versiones.fechaVerificacion}
                  metodo="manual"
                />
              </div>
            )}
          </header>

          {/* Revisión incompleta — banner FAIL-CLOSED, también en impresión (§5.2) */}
          {revisionIncompleta && (
            <section className="mt-6 doc-evitar-corte">
              <div className="rounded-sello border border-carmin/40 bg-carmin-suave p-5">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 shrink-0 text-carmin" strokeWidth={1.5} aria-hidden />
                  <p className="font-sello-display text-22 text-carmin">
                    Revisión incompleta — {result.revision.noRevisados.length} {result.revision.noRevisados.length === 1 ? 'dominio sin revisar' : 'dominios sin revisar'}
                  </p>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {result.revision.noRevisados.map(n => (
                    <li key={n.dominio} className="flex items-start gap-2 text-sm text-tinta">
                      <SelloVerificacion estado="no_revisado" className="shrink-0" />
                      <span><span className="font-medium">{DOMINIO_LABEL[n.dominio]}</span> — {n.motivo}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-tinta leading-relaxed mt-3 pt-3 border-t border-carmin/20">
                  El score y los índices heurísticos de este reporte se calcularon SOLO sobre los dominios revisados.
                  Un dominio sin revisar puede esconder exactamente el hallazgo que falta — este resultado no puede
                  presentarse como riesgo bajo.
                </p>
              </div>
            </section>
          )}

          {/* Reglas no evaluadas — dato no capturado o insuficiente (misión 25-ago):
              distinto de un dominio sin revisar; la regla NO dispara por defecto. */}
          {(result.revision?.reglasNoEvaluadas?.length ?? 0) > 0 && (
            <section className="mt-6 doc-evitar-corte">
              <div className="rounded-sello border border-ambar/40 bg-ambar-suave p-5">
                <p className="font-sello-display text-16 text-tinta">
                  Reglas no evaluadas — sin dato suficiente ({result.revision!.reglasNoEvaluadas!.length})
                </p>
                <ul className="mt-2 space-y-1.5">
                  {result.revision!.reglasNoEvaluadas!.map(r => (
                    <li key={r.ruleCode} className="flex items-start gap-2 text-sm text-tinta">
                      <span className="font-sello-mono text-tinta-suave shrink-0">{r.ruleCode}</span>
                      <span>{r.motivo}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-tinta-suave leading-relaxed mt-2">
                  Una regla sin dato no dispara ni cuenta como revisada: captura el dato faltante para evaluarla.
                </p>
              </div>
            </section>
          )}

          {/* Resumen ejecutivo */}
          <section className="mt-8 doc-evitar-corte">
            <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-2">Resumen ejecutivo</h2>
            <div className={`rounded-sello border p-5 ${v.color === 'carmin' ? 'border-carmin/30 bg-carmin-suave' : v.color === 'ambar' ? 'border-ambar/30 bg-ambar-suave' : 'border-sello/30'}`}
              style={v.color === 'sello' ? { backgroundColor: 'var(--color-petroleo-suave)' } : undefined}>
              <div className="flex items-center gap-3">
                <v.icono className={`w-6 h-6 shrink-0 ${v.color === 'carmin' ? 'text-carmin' : v.color === 'ambar' ? 'text-ambar' : 'text-sello'}`} strokeWidth={1.5} aria-hidden />
                <p className={`font-sello-display text-22 ${v.color === 'carmin' ? 'text-carmin' : v.color === 'ambar' ? 'text-ambar' : 'text-sello'}`}>{v.titulo}</p>
              </div>
              <p className="text-base text-tinta leading-relaxed mt-2">{v.frase}</p>
              <div className="mt-3 pt-3 border-t border-linea grid grid-cols-3 gap-4 text-13">
                <div><span className="text-tinta-suave">Índice de revisión (heurístico): </span><span className="font-sello-mono text-tinta">{Math.round(result.raProbability)}%{revisionIncompleta && '*'}</span></div>
                <div><span className="text-tinta-suave">Índice de cotejo (heurístico): </span><span className="font-sello-mono text-tinta">{Math.round(result.cotejoProb)}%{revisionIncompleta && '*'}</span></div>
                <div><span className="text-tinta-suave">Índice de glosa (heurístico): </span><span className="font-sello-mono text-tinta">{Math.round(result.glosaProb)}%{revisionIncompleta && '*'}</span></div>
              </div>
              {revisionIncompleta && (
                <p className="text-13 text-carmin mt-2">* Cifras parciales — calculadas solo sobre los dominios revisados.</p>
              )}
            </div>
          </section>

          {/* Cobertura de la revisión — qué se consultó y qué no (§5.1) */}
          {result.revision && (
            <section className="mt-8 doc-evitar-corte">
              <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-3">Cobertura de la revisión</h2>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {(Object.entries(result.revision.dominios) as [DominioGlosa, 'revisado' | 'no_revisado' | 'no_aplica'][]).map(([dom, estado]) => (
                  <li key={dom} className="flex items-center gap-2 text-sm">
                    {estado === 'revisado'
                      ? <CheckCircle2 className="w-4 h-4 text-sello shrink-0" strokeWidth={1.5} aria-hidden />
                      : estado === 'no_revisado'
                        ? <ShieldAlert className="w-4 h-4 text-carmin shrink-0" strokeWidth={1.5} aria-hidden />
                        : <span className="w-4 h-4 rounded-full border border-linea shrink-0" aria-hidden />}
                    <span className={estado === 'no_revisado' ? 'text-carmin font-medium' : 'text-tinta'}>
                      {DOMINIO_LABEL[dom]}
                    </span>
                    <span className="text-13 text-tinta-suave">
                      {estado === 'revisado' ? '· consultado' : estado === 'no_revisado' ? '· NO revisado' : '· no aplica'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Hallazgos */}
          <section className="mt-8">
            <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-3">
              Hallazgos {result.flags.length > 0 && `(${result.flags.length})`}
            </h2>
            {result.flags.length === 0 ? (
              <p className="text-base text-tinta-suave">Sin hallazgos que reportar para esta operación.</p>
            ) : (
              <ol className="space-y-5">
                {result.flags.map((f, i) => {
                  const sev = SEVERIDAD[f.severity]
                  const dato = datoDelPedimento(f)
                  return (
                    <li key={f.ruleCode + i} className="doc-evitar-corte border-l-2 pl-4"
                      style={{ borderColor: f.severity === 'critical' ? 'var(--color-carmin)' : f.severity === 'low' ? 'var(--color-linea)' : 'var(--color-ambar)' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-sello-mono text-sm text-tinta-suave">Hallazgo {String(i + 1).padStart(2, '0')}</span>
                        <Badge tono={sev.tono}>{sev.label}</Badge>
                        {dato && <span className="font-sello-mono text-13 text-tinta-suave">· Dato del pedimento: {dato}</span>}
                      </div>
                      <p className="text-base font-medium text-tinta mt-1.5">{f.name}</p>
                      <p className="text-sm text-tinta leading-relaxed mt-1">{f.reason}</p>
                      {(() => {
                        const s = fuenteDeFlag(f)
                        return s && (
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            <span className="text-sm text-tinta-suave">Fundamento:</span>
                            <span className="text-sm text-tinta">{s.texto}</span>
                            <SelloVerificacion
                              estado={s.estado}
                              fuenteNombre={s.nombre}
                              fuenteUrl={s.url}
                              fechaPublicacion={s.fechaPublicacion}
                              fechaVerificacion={s.fechaVerificacion}
                              metodo={s.metodo}
                            />
                          </div>
                        )
                      })()}
                      <div className="mt-2 rounded-sello-sm bg-papel-2 border border-linea px-3 py-2">
                        <span className="text-13 uppercase tracking-wide text-tinta-suave">Recomendación · </span>
                        <span className="text-sm text-tinta">{f.recommendation}</span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {/* Cruces por partida (Operación 2026-08) */}
          <SeccionCruces cruces={(result as GlosaSimulationResultConCruces).cruces ?? []} />

          {/* Recomendaciones priorizadas */}
          {result.recommendations.some(r => r.items.length > 0) && (
            <section className="mt-8 doc-evitar-corte">
              <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-3">Acciones recomendadas</h2>
              {result.recommendations.filter(r => r.items.length > 0).map((rec, i) => (
                <div key={i} className="mb-3">
                  <Badge tono={rec.priority === 'critical' ? 'carmin' : 'petroleo'}>
                    {rec.priority === 'critical' ? 'Prioritario' : 'Recomendado'}
                  </Badge>
                  <ul className="mt-2 space-y-1.5 list-disc pl-5">
                    {rec.items.map((it, j) => <li key={j} className="text-sm text-tinta leading-relaxed">{it}</li>)}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {/* Fundamentos — URL completa visible (en papel el link no sirve si no se lee) */}
          <section className="mt-8 doc-evitar-corte">
            <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-3">Fundamentos legales citados</h2>
            {fuentes.length === 0 ? (
              <p className="text-sm text-tinta-suave">Este reporte no citó fundamentos legales estructurados.</p>
            ) : (
              <ul className="space-y-3">
                {fuentes.map(f => (
                  <li key={f.id} className="doc-evitar-corte">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base text-tinta">{f.texto}</span>
                      <SelloVerificacion
                        estado={f.estado}
                        fuenteNombre={f.nombre}
                        fuenteUrl={f.url}
                        fechaPublicacion={f.fechaPublicacion}
                        fechaVerificacion={f.fechaVerificacion}
                        metodo={f.metodo}
                      />
                    </div>
                    {f.url && <p className="font-sello-mono text-13 text-tinta-suave break-all mt-0.5">{f.nombre}: {f.url}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-13 text-tinta-suave mt-4 pt-3 border-t border-linea leading-relaxed">
              El sello verde indica cita cotejada contra la fuente oficial (con fecha de cotejo); el ámbar,
              cita aún no cotejada artículo por artículo — la URL apunta a la ley vigente consolidada. {result.disclaimer}
            </p>
          </section>
        </div>
      </article>

      {/* Pie repetido en cada hoja impresa */}
      <div className="doc-pie font-sello-mono">{pieTexto}</div>
    </div>
  )
}


// ── Documento multipartida (Operación 2026-08) ────────────────────────────
const NIVEL_INDET = { label: 'Indeterminado', tono: 'carmin' as const }
const NIVEL: Record<string, { label: string; tono: 'neutral' | 'ambar' | 'carmin' | 'petroleo' }> = {
  low: { label: 'Bajo', tono: 'petroleo' }, medium: { label: 'Medio', tono: 'ambar' }, high: { label: 'Alto', tono: 'carmin' }, critical: { label: 'Crítico', tono: 'carmin' }, indeterminado: { label: 'Indeterminado', tono: 'carmin' },
}

function ReportePedimento({ r, generadoEn, archivado, archivando, partidaAbierta, setPartidaAbierta, onArchivar, onNuevo, error }: {
  r: GlosaPedimentoResultado; generadoEn: Date; archivado: { reference: string; documentName: string } | null; archivando: boolean
  partidaAbierta: number | null; setPartidaAbierta: (n: number | null) => void; onArchivar: () => void; onNuevo: () => void; error: string
}) {
  const folio = `PG-${generadoEn.getFullYear()}-${r.pedimentoId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`
  const res = r.resumen
  const indeterminado = res.riskLevelPresentacion === 'indeterminado'
  const nivel = NIVEL[res.riskLevelPresentacion] ?? NIVEL_INDET
  const pieTexto = `${folio} · ${fechaHoraLarga(generadoEn)} · Pedimento ${r.numero ?? r.pedimentoId} · ${res.partidasTotal} partida(s) · Generado por ADUANAI${indeterminado ? ' · REVISIÓN INCOMPLETA' : ''}`

  return (
    <div>
      <div className="max-w-[960px] mx-auto mb-4 flex items-center gap-2 flex-wrap no-print">
        <Button variante="primario" onClick={() => window.print()}><Printer className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Descargar PDF</Button>
        <Button variante="primario" onClick={onArchivar} disabled={archivando || !!archivado} loading={archivando}><Archive className="w-4 h-4" strokeWidth={1.5} aria-hidden /> {archivado ? 'Archivado' : 'Archivar al expediente'}</Button>
        <Button variante="secundario" onClick={onNuevo}><RotateCcw className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Nuevo reporte</Button>
        {archivado && <span className="text-sm text-sello">Guardado en el expediente <span className="font-sello-mono">{archivado.reference}</span> · <a className="underline" href="/expediente">ver</a></span>}
        {error && <span className="text-sm text-carmin">{error}</span>}
      </div>

      <article className="doc-imprimible max-w-[960px] mx-auto">
        <div className="doc-hoja bg-superficie border border-linea rounded-sello p-8 sm:p-12 text-tinta">
          <header className="doc-evitar-corte">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-sello-display text-lg text-tinta">ADUANAI</p>
                <h1 className="font-sello-display text-28 text-tinta mt-3">Reporte de revisión pre-glosa — pedimento completo</h1>
              </div>
              <dl className="text-13 font-sello-ui text-right space-y-0.5">
                <div><dt className="inline text-tinta-suave">Folio: </dt><dd className="inline font-sello-mono text-tinta">{folio}</dd></div>
                <div><dt className="inline text-tinta-suave">Generado: </dt><dd className="inline font-sello-mono text-tinta">{fechaHoraLarga(generadoEn)}</dd></div>
                <div><dt className="inline text-tinta-suave">Pedimento: </dt><dd className="inline font-sello-mono text-tinta">{r.numero ?? r.pedimentoId}</dd></div>
                <div><dt className="inline text-tinta-suave">Clave / aduana: </dt><dd className="inline font-sello-mono text-tinta">{r.clave} / {r.aduana}</dd></div>
                <div><dt className="inline text-tinta-suave">Origen del dato: </dt><dd className="inline font-sello-mono text-tinta">{r.origenArchivo ?? 'captura'}</dd></div>
              </dl>
            </div>
            {r.versiones && (
              <div className="mt-4 pt-4 border-t border-linea flex items-center gap-2 flex-wrap">
                <span className="text-sm text-tinta-suave">Base normativa usada:</span>
                <span className="text-sm text-tinta">{r.versiones.tigie}</span>
                <SelloVerificacion estado="verificado" fuenteNombre={r.versiones.fuenteNombre} fuenteUrl={r.versiones.fuenteUrl} fechaPublicacion={r.versiones.fechaPublicacion} fechaVerificacion={r.versiones.fechaVerificacion} metodo="manual" />
              </div>
            )}
          </header>

          {/* Resumen del pedimento */}
          <section className="mt-8 doc-evitar-corte">
            <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-2">Resumen del pedimento</h2>
            <div className={`rounded-sello border p-5 ${nivel.tono === 'carmin' ? 'border-carmin/30 bg-carmin-suave' : nivel.tono === 'ambar' ? 'border-ambar/30 bg-ambar-suave' : 'border-sello/30'}`} style={nivel.tono === 'petroleo' ? { backgroundColor: 'var(--color-petroleo-suave)' } : undefined}>
              <div className="flex items-center gap-3 flex-wrap">
                {indeterminado ? <ShieldAlert className="w-6 h-6 text-carmin" strokeWidth={1.5} aria-hidden /> : <ClipboardCheck className="w-6 h-6 text-tinta" strokeWidth={1.5} aria-hidden />}
                <p className="font-sello-display text-22 text-tinta">Riesgo máximo: {nivel.label}</p>
                {res.partidaRiesgoMaximo !== null && !indeterminado && <span className="text-sm text-tinta-suave">(partida {res.partidaRiesgoMaximo}, índice heurístico {res.riskScoreMax})</span>}
              </div>
              <p className="text-sm text-tinta leading-relaxed mt-2">
                {res.partidasEvaluadas} de {res.partidasTotal} partidas evaluadas{res.partidasConError > 0 ? ` · ${res.partidasConError} con error` : ''} · {res.hallazgos.length} regla(s) con hallazgo · {res.cruces.length} cruce(s) con observación · {res.reglasNoEvaluadas.length + res.crucesNoEvaluados.length} regla(s)/cruce(s) no evaluados
              </p>
              {indeterminado && (
                <p className="text-sm text-carmin mt-2">Alguna partida quedó indeterminada (dominio sin revisar, fracción inexistente o error): el pedimento no puede presentarse como riesgo bajo.</p>
              )}
            </div>
          </section>

          {/* Tabla de partidas */}
          <section className="mt-8">
            <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-3">Partidas ({r.partidas.length})</h2>
            <div className="overflow-x-auto border border-linea rounded-sello">
              <table className="w-full font-sello-ui">
                <thead>
                  <tr className="border-b border-linea">
                    {['#', 'Fracción', 'Descripción', 'Origen', 'Nivel', 'Hallazgos', 'Cruces', 'No eval.', ''].map(h => (
                      <th key={h} scope="col" className="text-13 uppercase tracking-wide font-medium text-tinta-suave px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.partidas.map(p => {
                    const rr = p.resultado
                    const niv = rr ? (NIVEL[rr.riskLevelPresentacion] ?? NIVEL_INDET) : NIVEL_INDET
                    const crucesMalos = (rr?.cruces ?? []).filter(c => c.estado === 'evaluado' && c.resultado !== 'ok').length
                    const noEval = (rr?.revision.reglasNoEvaluadas?.length ?? 0) + (rr?.cruces ?? []).filter(c => c.estado === 'no_evaluado').length
                    const abierta = partidaAbierta === p.numeroPartida
                    return (
                      <Fragment key={p.numeroPartida}>
                        <tr className="border-b border-linea/60 odd:bg-papel-2/40 cursor-pointer" onClick={() => setPartidaAbierta(abierta ? null : p.numeroPartida)}>
                          <td className="px-3 py-2 font-sello-mono text-sm text-tinta">{p.numeroPartida}</td>
                          <td className="px-3 py-2 font-sello-mono text-sm text-tinta">{p.fraccion}</td>
                          <td className="px-3 py-2 text-sm text-tinta max-w-[260px] truncate" title={p.descripcion}>{p.descripcion}</td>
                          <td className="px-3 py-2 font-sello-mono text-sm text-tinta">{p.input.countryOrigin}</td>
                          <td className="px-3 py-2"><Badge tono={niv.tono}>{p.error ? 'Error' : niv.label}</Badge></td>
                          <td className="px-3 py-2 font-sello-mono text-sm text-right text-tinta">{rr ? rr.flags.length : '—'}</td>
                          <td className="px-3 py-2 font-sello-mono text-sm text-right text-tinta">{rr ? crucesMalos : '—'}</td>
                          <td className="px-3 py-2 font-sello-mono text-sm text-right text-tinta">{rr ? noEval : '—'}</td>
                          <td className="px-3 py-2 text-tinta-suave no-print">{abierta ? <ChevronUp className="w-4 h-4" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}</td>
                        </tr>
                        {abierta && (
                          <tr className="border-b border-linea">
                            <td colSpan={9} className="px-4 py-4 bg-superficie">
                              {p.error && <p className="text-sm text-carmin">{p.error}</p>}
                              {rr && (
                                <div className="space-y-4">
                                  {rr.flags.length === 0 ? <p className="text-sm text-tinta-suave">Sin hallazgos de reglas ponderadas en esta partida.</p> : (
                                    <ol className="space-y-3">
                                      {rr.flags.map((f, i) => (
                                        <li key={f.ruleCode + i} className="border-l-2 pl-3" style={{ borderColor: f.severity === 'critical' ? 'var(--color-carmin)' : f.severity === 'low' ? 'var(--color-linea)' : 'var(--color-ambar)' }}>
                                          <div className="flex items-center gap-2 flex-wrap"><span className="font-sello-mono text-13 text-tinta-suave">{f.ruleCode}</span><Badge tono={SEVERIDAD[f.severity].tono}>{SEVERIDAD[f.severity].label}</Badge><span className="text-sm font-medium text-tinta">{f.name}</span></div>
                                          <p className="text-sm text-tinta mt-1">{f.reason}</p>
                                          {(f.fundamento?.valor ?? f.legalBasis) && <p className="text-13 text-tinta-suave mt-0.5">Fundamento: {f.fundamento?.valor ?? f.legalBasis}</p>}
                                        </li>
                                      ))}
                                    </ol>
                                  )}
                                  <SeccionCruces cruces={rr.cruces ?? []} />
                                  {(rr.revision.reglasNoEvaluadas?.length ?? 0) > 0 && (
                                    <ul className="text-sm text-tinta space-y-1">
                                      {rr.revision.reglasNoEvaluadas!.map(n => <li key={n.ruleCode}><span className="font-sello-mono text-13 text-tinta-suave">{n.ruleCode}</span> no evaluada — {n.motivo}</li>)}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Hallazgos agregados */}
          <section className="mt-8">
            <h2 className="text-13 uppercase tracking-wide text-tinta-suave mb-3">Hallazgos agregados del pedimento ({res.hallazgos.length + res.cruces.length})</h2>
            {res.hallazgos.length === 0 && res.cruces.length === 0 ? <p className="text-base text-tinta-suave">Sin hallazgos agregados.</p> : (
              <ol className="space-y-4">
                {res.hallazgos.map((h, i) => (
                  <li key={h.ruleCode} className="doc-evitar-corte border-l-2 pl-4" style={{ borderColor: h.severity === 'critical' ? 'var(--color-carmin)' : h.severity === 'low' ? 'var(--color-linea)' : 'var(--color-ambar)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-sello-mono text-sm text-tinta-suave">Hallazgo {String(i + 1).padStart(2, '0')}</span>
                      <Badge tono={SEVERIDAD[h.severity].tono}>{SEVERIDAD[h.severity].label}</Badge>
                      <span className="font-sello-mono text-13 text-tinta-suave">· partidas {h.partidas.join(', ')}</span>
                    </div>
                    <p className="text-base font-medium text-tinta mt-1">{h.name}</p>
                    <p className="text-sm text-tinta leading-relaxed mt-1">{h.reason}</p>
                    {h.legalBasis && <p className="text-13 text-tinta-suave mt-0.5">Fundamento: {h.legalBasis}</p>}
                  </li>
                ))}
                {res.cruces.map((c, i) => (
                  <li key={c.codigo + c.resultado} className="doc-evitar-corte border-l-2 pl-4" style={{ borderColor: c.resultado === 'hallazgo' ? 'var(--color-carmin)' : 'var(--color-ambar)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-sello-mono text-sm text-tinta-suave">Cruce {String(i + 1).padStart(2, '0')}</span>
                      <Badge tono={CRUCE_RESULTADO[c.resultado].tono}>{CRUCE_RESULTADO[c.resultado].label}</Badge>
                      <span className="font-sello-mono text-13 text-tinta-suave">· partidas {c.partidas.join(', ')}</span>
                    </div>
                    <p className="text-base font-medium text-tinta mt-1">{c.nombre}</p>
                    <p className="text-sm text-tinta leading-relaxed mt-1">{c.mensaje}</p>
                    <p className="text-13 text-tinta-suave mt-0.5">Fundamento: {c.fundamento}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* No evaluado / no revisado */}
          {(res.reglasNoEvaluadas.length > 0 || res.crucesNoEvaluados.length > 0 || res.dominiosNoRevisados.length > 0) && (
            <section className="mt-8 doc-evitar-corte">
              <div className={`rounded-sello border p-5 ${res.dominiosNoRevisados.length > 0 ? 'border-carmin/40 bg-carmin-suave' : 'border-ambar/40 bg-ambar-suave'}`}>
                <p className="font-sello-display text-16 text-tinta">Reglas no evaluadas y dominios sin revisar</p>
                <ul className="mt-2 space-y-1.5">
                  {res.dominiosNoRevisados.map(d => <li key={d.dominio + d.motivo} className="text-sm text-carmin"><span className="font-medium">{DOMINIO_LABEL[d.dominio as DominioGlosa] ?? d.dominio}</span> NO revisado en partidas {d.partidas.join(', ')} — {d.motivo}</li>)}
                  {res.reglasNoEvaluadas.map(n => <li key={n.ruleCode + n.motivo} className="text-sm text-tinta"><span className="font-sello-mono text-tinta-suave">{n.ruleCode}</span> partidas {n.partidas.join(', ')} — {n.motivo}</li>)}
                  {res.crucesNoEvaluados.map(n => <li key={n.codigo + n.motivo} className="text-sm text-tinta"><span className="font-sello-mono text-tinta-suave">{n.codigo}</span> partidas {n.partidas.join(', ')} — {n.motivo}</li>)}
                </ul>
                <p className="text-xs text-tinta-suave leading-relaxed mt-2">Una regla sin dato no dispara ni cuenta como revisada; un dominio sin revisar puede esconder exactamente el hallazgo que falta.</p>
              </div>
            </section>
          )}

          <p className="text-13 text-tinta-suave mt-8 pt-3 border-t border-linea leading-relaxed">{r.disclaimer}</p>
        </div>
      </article>
      <div className="doc-pie font-sello-mono">{pieTexto}</div>
    </div>
  )
}
