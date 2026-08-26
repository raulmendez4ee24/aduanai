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
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Printer, RotateCcw, CheckCircle2, AlertTriangle, ShieldAlert, ClipboardCheck,
} from 'lucide-react'
import { api } from '../lib/api'
import type { GlosaSimulationInput, GlosaSimulationResult, GlosaRiskFlag, DominioGlosa, Anexo22Catalogs } from '../lib/api'
import { Button, Card, Badge, Input, Select, Textarea, SelloVerificacion, useCampoNumerico, type EstadoSello } from '../components/ui'

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
  const [form, setForm] = useState<GlosaSimulationInput>({
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
  const [estado, setEstado] = useState<'form' | 'generando' | 'listo' | 'error'>('form')
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

        <Card>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Fracción arancelaria" mono requerido placeholder="7318.15.01"
              value={form.fractionCode} onChange={e => set('fractionCode', e.target.value)} />
            <Input label="País de origen (ISO-2)" mono placeholder="CN"
              value={form.countryOrigin} onChange={e => set('countryOrigin', e.target.value.toUpperCase())} />
            <Input label="País del vendedor (ISO-2)" mono placeholder="CN"
              value={form.countryProvider} onChange={e => set('countryProvider', e.target.value.toUpperCase())} />
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
