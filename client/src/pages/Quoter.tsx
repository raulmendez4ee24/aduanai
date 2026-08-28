import { DemoTag } from '../components/DemoBanner'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { MultiQuoteResult, ScenarioComparison, ScenarioVariant } from '../lib/api'
import { api } from '../lib/api'
import {
  cotizadorApi,
  type CotizacionCompleta, type EntradaDTA, type EscenariosGuardados, type FilaCotizacion, type ItemOla2,
  type MultiQuoteInputOla2, type MultiQuoteItemInputOla2, type MultiQuoteResultOla2, type ReglaHonorarios, type Tabulador, type TipoOperacionDTA,
} from '../lib/api/cotizador'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { Calculator, DollarSign, AlertCircle, AlertTriangle, ShieldCheck, FileWarning, Plus, Trash2, GitCompare, Globe, Printer, FileSpreadsheet, Copy, FolderOpen, Save, RotateCcw } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { ROITile } from '../components/ROIBanner'
import { NOMExceptionPanel } from '../components/NOMExceptionPanel'
// ── CIRCUITO catálogo↔cotizador (4ª revisión) ── la fracción se autocompleta
// desde el dictamen VIGENTE del número de parte; nunca se teclea dos veces.
import { catalogoApi, formatearFraccion } from '../lib/api/catalogo'

export const GUIA_MODULO = {
  titulo: 'Cotizador',
  pasos: [
    'Captura partidas (fracción, origen, cantidad, valor). Si conoces al exportador, escríbelo: la cuota compensatoria se aplica con la tasa de esa empresa cuando la resolución la trae.',
    'Elige el tipo de operación: el DTA cambia (8 al millar general, 1.76 al millar activo fijo IMMEX, cuota fija en temporales IMMEX y bajo tratado — Art. 49 LFD). El aviso indica si el monto está cotejado.',
    'IEPS se aplica por categoría desde la tabla cargada; si la fracción no tiene tasa, se muestra 0 con nota (nunca se inventa una tasa).',
    'Elige un tabulador para calcular honorarios (fijo, % o al millar con mínimo/máximo); puedes editarlos a mano.',
    'Cotizar guarda la cotización con folio Q-año-seq, fecha DOF del TC y cliente activo. Luego: PDF (vista imprimible), Excel, escenarios de venta (China definitivo vs T-MEC vs PROSEC) y duplicar como nueva versión.',
    'En "Mis cotizaciones" filtras por nombre, cliente, fecha y estado; abre, duplica o imprime cualquier versión.',
    'Lo que captures aquí no se pierde al cambiar de módulo (estado persistente por pestaña).',
  ],
}

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']
const CURRENCIES = ['USD','EUR','MXN','CNY','JPY','GBP','CAD']

function mxn(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

function emptyItem(): MultiQuoteItemInputOla2 {
  return { fractionCode: '', countryOfOrigin: 'CN', quantity: 1, unitValueUSD: 0, freightUSD: 0, insuranceUSD: 0 }
}

// IDs estables por fila para keys de React. Si usáramos el índice, al
// eliminar una partida React reusaría el state de inputs de la fila
// removida en la siguiente — eso producía el bug de "el valor saltó al
// campo Flete USD" cuando se editaba "Valor unit USD".
let __rowSeq = 0
const nextRowId = () => `row_${++__rowSeq}`

// Wheel + comma-tolerant parse para inputs numéricos. El scroll sobre un
// input number enfocado mutaba valores ajenos (UX nativa del navegador).
const blurOnWheel = (e: React.WheelEvent<HTMLInputElement>) => {
  if (document.activeElement === e.currentTarget) e.currentTarget.blur()
}
const parseNum = (s: string): number => {
  if (!s) return 0
  const cleaned = s.replace(/,/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

// BUG-9 (24-ago-2026): al bloquear el signo negativo, el input quedaba con el
// cero de relleno ("-5" → "05", "-100" → "0100") porque el DOM conserva el
// texto tecleado mientras el estado ya es otro número. Al perder foco se
// normaliza el texto del DOM al número realmente almacenado (nunca negativo).
const normalizeNumericBlur = (e: React.FocusEvent<HTMLInputElement>, apply: (n: number) => void) => {
  const n = Math.max(0, parseNum(e.currentTarget.value))
  apply(n)
  e.currentTarget.value = String(n)
}

// BUG-4 (24-ago-2026): tope de cordura por partida. $1,000 millones USD por
// renglón está por encima de cualquier operación real; más allá de eso solo
// se producen desbordes visuales y aritmética sin sentido.
const MAX_PARTIDA_USD = 1_000_000_000

// ── Estado principal en UN objeto (Operación 2026-08 → useEstadoPersistente) ──
interface FormCotizador {
  meta: { name: string; client: string; incoterm: string; currency: string; destination: string }
  items: MultiQuoteItemInputOla2[]
  dispatch: { honorariosAgente: number; prevalidacion: number; almacenaje: number; estiba: number; fleteInterno: number }
  tcMode: 'current' | 'average30' | 'historical'
  tcDate: string
  tcOverride: string
  tipoOperacion: TipoOperacionDTA
  tabuladorId: string
  usarTabulador: boolean
  vigenciaHasta: string
  notas: string
}
const FORM_INICIAL: FormCotizador = {
  meta: { name: '', client: '', incoterm: 'CIF', currency: 'USD', destination: 'Aduana de Nuevo Laredo' },
  items: [emptyItem()],
  dispatch: { honorariosAgente: 0, prevalidacion: 321, almacenaje: 0, estiba: 0, fleteInterno: 0 },
  tcMode: 'current',
  tcDate: new Date().toISOString().slice(0, 10),
  tcOverride: '',
  tipoOperacion: 'general',
  tabuladorId: '',
  usarTabulador: true,
  vigenciaHasta: '',
  notas: '',
}

type Pestana = 'cotizar' | 'mis' | 'tabuladores'

export function QuoterPage() {
  // tcDate NO se persiste (revisión 27-ago: se mandaba el TC del día que se abrió el módulo).
  const [form, setForm, resetForm] = useEstadoPersistente<FormCotizador>('cotizador', FORM_INICIAL, { sobrescribir: { tcDate: new Date().toISOString().slice(0, 10) } as Partial<FormCotizador> })
  const { meta, items, dispatch } = form
  const setMeta = (m: FormCotizador['meta']) => setForm(f => ({ ...f, meta: m }))
  const setItems = (fn: (prev: MultiQuoteItemInputOla2[]) => MultiQuoteItemInputOla2[]) => setForm(f => ({ ...f, items: fn(f.items) }))
  const setDispatch = (d: FormCotizador['dispatch'] | ((prev: FormCotizador['dispatch']) => FormCotizador['dispatch'])) =>
    setForm(f => ({ ...f, dispatch: typeof d === 'function' ? d(f.dispatch) : d }))
  const [rowIds, setRowIds] = useState<string[]>(() => form.items.map(() => nextRowId()))
  // Si el estado rehidratado trae más/menos partidas que ids (deploy o reset), se realinean.
  useEffect(() => {
    if (rowIds.length !== items.length) setRowIds(items.map((_, i) => rowIds[i] ?? nextRowId()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const [pestana, setPestana] = useState<Pestana>('cotizar')
  const [result, setResult] = useState<MultiQuoteResultOla2 | null>(null)
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const [folio, setFolio] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioComparison | null>(null)
  const [escenariosGuardados, setEscenariosGuardados] = useState<EscenariosGuardados | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [showScenarios, setShowScenarios] = useState(false)
  // ── CIRCUITO catálogo↔cotizador ── número de parte por partida (no viaja a
  // la API de cotización: solo sirve para traer la fracción vigente) y el aviso
  // honesto de lo que pasó al buscarlo.
  const [codigoParte, setCodigoParte] = useState<Record<string, string>>({})
  const [avisoParte, setAvisoParte] = useState<Record<string, { texto: string; ok: boolean }>>({})
  const [catalogoDTA, setCatalogoDTA] = useState<EntradaDTA[]>([])
  const [tabuladores, setTabuladores] = useState<Tabulador[]>([])
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    cotizadorApi.catalogoDTA().then(r => setCatalogoDTA(r.data.catalogo)).catch(() => setCatalogoDTA([]))
    cotizadorApi.tabuladores().then(r => setTabuladores(r.data.filter(t => t.activo))).catch(() => setTabuladores([]))
  }, [])

  // /cotizador?abrir=<id> (desde la vista imprimible o un enlace) → abre esa cotización.
  useEffect(() => {
    const id = searchParams.get('abrir')
    if (!id) return
    abrirCotizacion(id).then(() => { searchParams.delete('abrir'); setSearchParams(searchParams, { replace: true }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('abrir')])

  const entradaDTA = catalogoDTA.find(e => e.tipo === form.tipoOperacion)

  function buildInput(): MultiQuoteInputOla2 {
    const exchangeRate = form.tcOverride ? parseFloat(form.tcOverride) : undefined
    return {
      name: meta.name || undefined,
      client: meta.client || undefined,
      destination: meta.destination,
      incoterm: meta.incoterm,
      currency: meta.currency,
      exchangeRateMode: form.tcMode === 'historical' ? form.tcDate : form.tcMode,
      exchangeRate,
      items: items.filter(i => i.fractionCode && i.quantity > 0).map(i => ({ ...i, exportador: i.exportador?.trim() || undefined })),
      dispatch,
      tipoOperacion: form.tipoOperacion,
      tabuladorId: form.tabuladorId || undefined,
      usarTabulador: !!form.tabuladorId && form.usarTabulador,
      vigenciaHasta: form.vigenciaHasta || undefined,
      notas: form.notas || undefined,
    }
  }

  // BUG-4: rango máximo por partida — sin esto un valor absurdo produce
  // totales que desbordan el panel y aritmética sin sentido. Se aplica en
  // Cotizar Y en Comparar escenarios (misma entrada, mismo tope); el servidor
  // valida lo mismo con 422 como línea dura.
  function errorDeRango(): string {
    const fuera = items.findIndex(i => i.fractionCode && (i.unitValueUSD > MAX_PARTIDA_USD || i.unitValueUSD * i.quantity > MAX_PARTIDA_USD))
    if (fuera >= 0) return `Valor fuera de rango en la partida ${fuera + 1}: el valor por partida no puede exceder $1,000,000,000 USD. Revisa cantidad y valor unitario.`
    return ''
  }

  async function handleQuote() {
    if (items.filter(i => i.fractionCode && i.quantity > 0).length === 0) return
    const rango = errorDeRango()
    if (rango) { setError(rango); return }
    setLoading(true); setError(''); setAviso(''); setResult(null); setScenarios(null); setEscenariosGuardados(null); setQuoteId(null); setFolio(null)
    try {
      const r = await cotizadorApi.cotizar(buildInput())
      setResult(r.data)
      setQuoteId(r.data.quoteId)
      if (r.data.honorarios?.origen === 'tabulador') setDispatch(d => ({ ...d, honorariosAgente: r.data.honorarios!.monto }))
      const c = await cotizadorApi.obtener(r.data.quoteId).catch(() => null)
      if (c) setFolio(c.data.folio)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al cotizar') }
    setLoading(false)
  }

  async function handleScenarios() {
    if (!result) return
    const rango = errorDeRango()
    if (rango) { setError(rango); return }
    setLoading(true); setError('')
    try {
      const variants: ScenarioVariant[] = [
        { name: 'Flete +10%', freightMultiplier: 1.10 },
        { name: 'Cantidad +20%', weightMultiplier: 1.20 },
        { name: 'TC +5% (peso devalúa)', exchangeRateOverride: result.exchangeRate * 1.05 },
        { name: 'Cambiar origen a Vietnam', countryOverride: 'Vietnam' },
      ]
      const r = await api.quoteScenarios(buildInput(), variants)
      setScenarios(r.data)
      setShowScenarios(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error en escenarios') }
    setLoading(false)
  }

  /** Escenarios de VENTA (China definitivo vs T-MEC vs PROSEC) — se guardan en la cotización. */
  async function handleEscenariosVenta() {
    if (!quoteId) return
    setLoading(true); setError('')
    try {
      const r = await cotizadorApi.escenarios(quoteId)
      setEscenariosGuardados(r.data.escenarios)
      setScenarios(r.data.comparacion)
      setShowScenarios(true)
      setAviso('Escenarios guardados en la cotización; aparecen en el PDF y el Excel.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error en escenarios de venta') }
    setLoading(false)
  }

  async function handleDuplicar(id: string | null = quoteId) {
    if (!id) return
    setLoading(true); setError('')
    try {
      const r = await cotizadorApi.duplicar(id)
      setAviso(`Versión ${r.data.version} creada (${r.data.folio}). Está abierta para editar.`)
      await abrirCotizacion(r.data.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al duplicar') }
    setLoading(false)
  }

  async function handleGuardarMeta() {
    if (!quoteId) return
    setLoading(true); setError('')
    try {
      await cotizadorApi.actualizar(quoteId, { name: meta.name || null, notas: form.notas || null, vigenciaHasta: form.vigenciaHasta || null })
      setAviso('Nombre, notas y vigencia guardados.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al guardar') }
    setLoading(false)
  }

  /** Carga una cotización guardada en el formulario (editable) y muestra su resultado. */
  async function abrirCotizacion(id: string) {
    setLoading(true); setError('')
    try {
      const { data: c } = await cotizadorApi.obtener(id)
      cargarEnFormulario(c)
      setPestana('cotizar')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la cotización') }
    setLoading(false)
  }

  function cargarEnFormulario(c: CotizacionCompleta) {
    const inp = c.input
    const nuevosItems: MultiQuoteItemInputOla2[] = (inp.items?.length ? inp.items : [emptyItem()]).map(i => ({ ...emptyItem(), ...i }))
    setRowIds(nuevosItems.map(() => nextRowId()))
    setForm(f => ({
      ...f,
      meta: { name: c.name ?? inp.name ?? '', client: c.client ?? inp.client ?? '', incoterm: inp.incoterm ?? c.incoterm ?? 'CIF', currency: inp.currency ?? c.currency ?? 'USD', destination: inp.destination ?? c.destination ?? '' },
      items: nuevosItems,
      dispatch: {
        honorariosAgente: inp.dispatch?.honorariosAgente ?? 0, prevalidacion: inp.dispatch?.prevalidacion ?? 321,
        almacenaje: inp.dispatch?.almacenaje ?? 0, estiba: inp.dispatch?.estiba ?? 0, fleteInterno: inp.dispatch?.fleteInterno ?? 0,
      },
      tcMode: inp.exchangeRateMode === 'average30' ? 'average30' : inp.exchangeRateMode && inp.exchangeRateMode !== 'current' ? 'historical' : 'current',
      tcDate: inp.exchangeRateMode && !['current', 'average30'].includes(inp.exchangeRateMode) ? inp.exchangeRateMode : f.tcDate,
      tcOverride: inp.exchangeRate != null ? String(inp.exchangeRate) : '',
      tipoOperacion: inp.tipoOperacion ?? 'general',
      tabuladorId: c.tabuladorId ?? inp.tabuladorId ?? '',
      vigenciaHasta: c.vigenciaHasta ? c.vigenciaHasta.slice(0, 10) : '',
      notas: c.notas ?? '',
    }))
    setResult(c.result && c.result.items ? c.result : null)
    setQuoteId(c.id)
    setFolio(c.folio)
    setEscenariosGuardados(c.escenarios)
    setScenarios(null); setShowScenarios(false)
  }

  function nuevaCotizacion() {
    resetForm(); setRowIds([nextRowId()])
    setResult(null); setQuoteId(null); setFolio(null); setScenarios(null); setEscenariosGuardados(null); setAviso(''); setError('')
  }

  function updateItem(idx: number, patch: Partial<MultiQuoteItemInputOla2>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function addItem() {
    setItems(prev => [...prev, emptyItem()])
    setRowIds(prev => [...prev, nextRowId()])
  }

  /**
   * Trae la fracción VIGENTE del número de parte y la pone en la partida.
   * Solo autocompleta con dictamen aprobado: una parte sin dictamen deja el
   * campo como estaba y lo dice — no se adivina una fracción.
   */
  async function traerFraccionDeParte(idx: number, rowId: string) {
    const code = (codigoParte[rowId] ?? '').trim()
    if (!code) { setAvisoParte(a => ({ ...a, [rowId]: { texto: '', ok: true } })); return }
    try {
      const r = await catalogoApi.porCodigo(code)
      const d = r.data
      if (!d.tieneDictamen || !d.fractionCode) {
        setAvisoParte(a => ({ ...a, [rowId]: { texto: `${d.productCode} está en el catálogo pero sin dictamen aprobado — captura la fracción a mano o clasifícala.`, ok: false } }))
        return
      }
      updateItem(idx, {
        fractionCode: formatearFraccion(d.fractionCode),
        description: items[idx]?.description?.trim() ? items[idx]!.description : d.description,
        ...(d.paisOrigen && !items[idx]?.countryOfOrigin?.trim() ? { countryOfOrigin: d.paisOrigen } : {}),
      })
      setAvisoParte(a => ({ ...a, [rowId]: { texto: `Fracción vigente v${d.version} de ${d.productCode}${d.nico ? ` · NICO ${d.nico}` : ''}.`, ok: true } }))
    } catch (e) {
      setAvisoParte(a => ({ ...a, [rowId]: { texto: e instanceof Error ? e.message : `No encontré la parte ${code} en tu catálogo.`, ok: false } }))
    }
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
    setRowIds(prev => prev.filter((_, i) => i !== idx))
  }

  const tabulador = tabuladores.find(t => t.id === form.tabuladorId)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Pestañas */}
      <div className="flex items-center gap-2 flex-wrap">
        {([['cotizar', 'Cotizar'], ['mis', 'Mis cotizaciones'], ['tabuladores', 'Tabulador de honorarios']] as [Pestana, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setPestana(k)} className={`text-[12px] font-semibold px-4 py-2 rounded-full transition ${pestana === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{l}</button>
        ))}
        {quoteId && folio && <span className="ml-auto text-[11px] text-slate-600">Abierta: <span className="font-mono font-semibold">{folio}</span></span>}
      </div>

      {pestana === 'mis' && <MisCotizaciones onAbrir={abrirCotizacion} onDuplicar={id => handleDuplicar(id)} />}
      {pestana === 'tabuladores' && <TabuladoresPanel tabuladores={tabuladores} catalogoDTA={catalogoDTA} onChange={setTabuladores} />}

      {pestana === 'cotizar' && (<>
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Calculator className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Cotizador de Importación</h1> <DemoTag />
          <button onClick={nuevaCotizacion} className="ml-auto text-[11px] font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"><RotateCcw className="w-3 h-3"/> Nueva cotización</button>
        </div>

        <div className="mb-4"><ROITile moduleKey="quoter" /></div>

        {/* Meta operación */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Field label="Nombre de operación"><input className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2" value={meta.name} onChange={e => setMeta({...meta, name: e.target.value})} placeholder="Embarque Q1 lote A"/></Field>
          <Field label="Cliente (texto libre; el RFC viene del selector global)"><input className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2" value={meta.client} onChange={e => setMeta({...meta, client: e.target.value})}/></Field>
          <Field label="Incoterm"><select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white" value={meta.incoterm} onChange={e => setMeta({...meta, incoterm: e.target.value})}>{INCOTERMS.map(i => <option key={i}>{i}</option>)}</select></Field>
          <Field label="Moneda"><select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white" value={meta.currency} onChange={e => setMeta({...meta, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        </div>

        {/* Ola 2: tipo de operación (DTA), tabulador, vigencia */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Field label="Tipo de operación (DTA · Art. 49 LFD)">
            <select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white" value={form.tipoOperacion} onChange={e => setForm(f => ({ ...f, tipoOperacion: e.target.value as TipoOperacionDTA }))}>
              {(catalogoDTA.length ? catalogoDTA : [{ tipo: 'general', etiqueta: 'Importación definitiva (general, 8 al millar)' } as EntradaDTA]).map(e => <option key={e.tipo} value={e.tipo}>{e.etiqueta}</option>)}
            </select>
            {entradaDTA && (
              <p className={`text-[10px] mt-1 ${entradaDTA.cotejo === 'pendiente' ? 'text-amber-700' : 'text-slate-500'}`}>
                {entradaDTA.base === 'millar' ? `${entradaDTA.valor} al millar` : `Cuota fija $${entradaDTA.valor.toFixed(2)} MXN por operación`} · fracc. {entradaDTA.fraccionArt49} · claves {entradaDTA.claves.join(', ')} ·{' '}
                {entradaDTA.cotejo === 'verificado' ? 'cotejado contra fuente oficial' : entradaDTA.cotejo === 'corpus' ? 'respaldado en el corpus (cotejo formal pendiente)' : '⚠ pendiente de fuente oficial'}
              </p>
            )}
          </Field>
          <Field label="Tabulador de honorarios">
            <select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white" value={form.tabuladorId} onChange={e => setForm(f => ({ ...f, tabuladorId: e.target.value }))}>
              <option value="">Sin tabulador (captura manual)</option>
              {tabuladores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            {tabulador && (
              <label className="mt-1 flex items-center gap-2 text-[10px] text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.usarTabulador} onChange={e => setForm(f => ({ ...f, usarTabulador: e.target.checked }))} className="rounded border-slate-300"/>
                Sustituir los honorarios capturados por los del tabulador
              </label>
            )}
            {tabuladores.length === 0 && <p className="text-[10px] text-slate-500 mt-1">No hay tabuladores; créalos en la pestaña "Tabulador de honorarios".</p>}
          </Field>
          <Field label="Vigencia de la cotización (hasta)">
            <input type="date" className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2" value={form.vigenciaHasta} onChange={e => setForm(f => ({ ...f, vigenciaHasta: e.target.value }))}/>
          </Field>
        </div>

        {/* Selector TC */}
        <div className="mb-4 rounded-xl bg-slate-50/60 p-3">
          <p className="text-[11px] font-semibold text-slate-700 mb-2">Tipo de cambio</p>
          <div className="flex flex-wrap gap-2">
            <TCRadio val="current" cur={form.tcMode} onChange={v => setForm(f => ({ ...f, tcMode: v }))} label="TC del día" />
            <TCRadio val="average30" cur={form.tcMode} onChange={v => setForm(f => ({ ...f, tcMode: v }))} label="Promedio últimos 30d" />
            <TCRadio val="historical" cur={form.tcMode} onChange={v => setForm(f => ({ ...f, tcMode: v }))} label="Fecha específica" />
            {form.tcMode === 'historical' && (
              <input type="date" value={form.tcDate || new Date().toISOString().slice(0, 10)} onChange={e => setForm(f => ({ ...f, tcDate: e.target.value }))} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
            )}
            <input type="number" min="0" step="0.0001" autoComplete="off" name="tc-override" onWheel={blurOnWheel} placeholder="Override manual TC" value={form.tcOverride} onChange={e => setForm(f => ({ ...f, tcOverride: e.target.value }))} onBlur={e => { const v = e.currentTarget.value; if (v !== '') { const n = Math.max(0, parseNum(v)); setForm(f => ({ ...f, tcOverride: n > 0 ? String(n) : '' })); e.currentTarget.value = n > 0 ? String(n) : '' } }} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 w-40 ml-auto"/>
          </div>
          {form.tcOverride && <p className="text-[10px] text-amber-700 mt-1">Con TC manual el PDF dirá "TC manual — sin fecha DOF".</p>}
        </div>

        {/* Partidas */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-slate-700">Partidas ({items.length})</p>
            <button onClick={addItem} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"><Plus className="w-3 h-3"/> Agregar partida</button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={rowIds[idx] ?? `row-${idx}`} className="rounded-xl border border-slate-200/70 bg-white/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Partida {idx + 1}</span>
                  {items.length > 1 && <button onClick={() => removeItem(idx)} className="text-rose-500 hover:text-rose-700 ml-auto"><Trash2 className="w-3.5 h-3.5"/></button>}
                </div>
                {/* ── CIRCUITO catálogo↔cotizador ── número de parte → fracción vigente */}
                <div className="mb-2">
                  <Field label="Nº de parte (catálogo)">
                    <div className="flex gap-1">
                      <input
                        autoComplete="off"
                        name={`parte-${rowIds[idx]}`}
                        className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"
                        placeholder="opcional — trae la fracción vigente"
                        value={codigoParte[rowIds[idx] ?? ''] ?? ''}
                        onChange={e => setCodigoParte(c => ({ ...c, [rowIds[idx] ?? '']: e.target.value }))}
                        onBlur={() => void traerFraccionDeParte(idx, rowIds[idx] ?? '')}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void traerFraccionDeParte(idx, rowIds[idx] ?? '') } }}
                      />
                      <button
                        type="button"
                        onClick={() => void traerFraccionDeParte(idx, rowIds[idx] ?? '')}
                        className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 whitespace-nowrap px-2"
                      >
                        Traer fracción
                      </button>
                    </div>
                  </Field>
                  {avisoParte[rowIds[idx] ?? '']?.texto && (
                    <p className={`text-[11px] mt-1 ${avisoParte[rowIds[idx] ?? '']!.ok ? 'text-slate-500' : 'text-amber-600'}`}>
                      {avisoParte[rowIds[idx] ?? '']!.texto}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <Field label="Fracción"><input autoComplete="off" name={`fraction-${rowIds[idx]}`} className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5" placeholder="0000.00.00" value={it.fractionCode} onChange={e => updateItem(idx, { fractionCode: e.target.value })}/></Field>
                  <Field label="Descripción"><input autoComplete="off" name={`desc-${rowIds[idx]}`} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.description ?? ''} onChange={e => updateItem(idx, { description: e.target.value })}/></Field>
                  <Field label="País origen"><input autoComplete="off" name={`country-${rowIds[idx]}`} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" placeholder="China" value={it.countryOfOrigin} onChange={e => updateItem(idx, { countryOfOrigin: e.target.value })}/></Field>
                  <Field label="Cantidad"><input type="number" min="0" autoComplete="off" name={`qty-${rowIds[idx]}`} onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.quantity} onChange={e => updateItem(idx, { quantity: parseNum(e.target.value) })} onBlur={e => normalizeNumericBlur(e, n => updateItem(idx, { quantity: n }))}/></Field>
                  <Field label="Valor unit. USD"><input type="number" min="0" step="0.01" autoComplete="off" name={`unitVal-${rowIds[idx]}`} onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.unitValueUSD} onChange={e => updateItem(idx, { unitValueUSD: parseNum(e.target.value) })} onBlur={e => normalizeNumericBlur(e, n => updateItem(idx, { unitValueUSD: n }))}/></Field>
                  <Field label="Total USD"><div className="text-[12px] py-1.5 px-2 text-slate-700 font-semibold break-all">${(it.quantity * it.unitValueUSD).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></Field>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
                  <Field label="Flete USD"><input type="number" min="0" step="0.01" autoComplete="off" name={`freight-${rowIds[idx]}`} onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.freightUSD ?? 0} onChange={e => updateItem(idx, { freightUSD: parseNum(e.target.value) })} onBlur={e => normalizeNumericBlur(e, n => updateItem(idx, { freightUSD: n }))}/></Field>
                  <Field label="Seguro USD"><input type="number" min="0" step="0.01" autoComplete="off" name={`insurance-${rowIds[idx]}`} onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.insuranceUSD ?? 0} onChange={e => updateItem(idx, { insuranceUSD: parseNum(e.target.value) })} onBlur={e => normalizeNumericBlur(e, n => updateItem(idx, { insuranceUSD: n }))}/></Field>
                  <Field label="Peso kg (cuota USD/kg)"><input type="number" step="0.01" autoComplete="off" name={`weight-${rowIds[idx]}`} min="0" onWheel={blurOnWheel} placeholder="opt." title="Requerido si aplica cuota compensatoria USD/kg" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.weightKg ?? ''} onChange={e => updateItem(idx, { weightKg: e.target.value === '' ? undefined : parseNum(e.target.value) })}/></Field>
                  <Field label="Exportador (tasa por empresa)"><input autoComplete="off" name={`exportador-${rowIds[idx]}`} placeholder="opcional" title="Si la resolución antidumping trae tasas por exportador, se aplica la de esta empresa" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.exportador ?? ''} onChange={e => updateItem(idx, { exportador: e.target.value })}/></Field>
                  <Field label="Override IGI %"><input type="number" step="0.1" autoComplete="off" name={`igi-${rowIds[idx]}`} min="0" onWheel={blurOnWheel} placeholder="auto" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.igiRateOverride ?? ''} onChange={e => updateItem(idx, { igiRateOverride: e.target.value === '' ? undefined : parseNum(e.target.value) })}/></Field>
                  <Field label="Tratado">
                    <select className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                      value={it.applyTreaty ?? ''}
                      onChange={e => updateItem(idx, { applyTreaty: (e.target.value || undefined) as 'TMEC' | 'TLCUEM' | 'CPTPP' | undefined })}>
                      <option value="">Sin tratado (NMF)</option>
                      <option value="TMEC">TMEC</option>
                      <option value="TLCUEM">TLCUEM</option>
                      <option value="CPTPP">CPTPP</option>
                    </select>
                  </Field>
                </div>
                {it.applyTreaty && (
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={it.hasCertificadoOrigen ?? false}
                      onChange={e => updateItem(idx, { hasCertificadoOrigen: e.target.checked })}
                      className="rounded border-slate-300"/>
                    <Globe className="w-3 h-3 text-emerald-600"/>
                    Certificado de origen {it.applyTreaty} vigente disponible
                  </label>
                )}
                {it.applyTreaty === 'TMEC' && form.tipoOperacion === 'general' && (
                  <p className="mt-1 text-[10px] text-amber-700">Con T-MEC aplicado suele proceder DTA cuota fija (Art. 49-IV LFD): revisa el tipo de operación "Originaria bajo tratado".</p>
                )}

                {/* Régimenes y programas */}
                <details className="mt-2 rounded-lg bg-violet-50/40 border border-violet-100 p-2.5" open>
                  <summary className="cursor-pointer text-[11px] font-semibold text-violet-800">🎯 Regímenes y programas</summary>
                  <div className="mt-2 space-y-1.5">
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={it.applyPROSEC ?? false}
                        onChange={e => updateItem(idx, { applyPROSEC: e.target.checked })}
                        className="rounded border-slate-300"/>
                      Aplicar PROSEC (requiere registro vigente ante SE)
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={it.applyRegla8va ?? false}
                        onChange={e => updateItem(idx, { applyRegla8va: e.target.checked })}
                        className="rounded border-slate-300"/>
                      Importación bajo Regla 8va
                    </label>
                    {it.applyRegla8va && (
                      <input type="text" value={it.regla8vaParentFraction ?? ''}
                        onChange={e => updateItem(idx, { regla8vaParentFraction: e.target.value })}
                        placeholder="Fracción del producto terminado (ej. 8703)"
                        className="w-full text-[11px] font-mono border border-slate-200 rounded px-2 py-1"/>
                    )}
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={it.isVehicle ?? false}
                        onChange={e => updateItem(idx, { isVehicle: e.target.checked })}
                        className="rounded border-slate-300"/>
                      🚗 Vehículo nuevo (calcular ISAN)
                    </label>
                    {it.isVehicle && (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" autoComplete="off" name={`vehiclePrice-${rowIds[idx]}`} onWheel={blurOnWheel} value={it.vehiclePriceMXN ?? ''}
                          onChange={e => updateItem(idx, { vehiclePriceMXN: e.target.value === '' ? undefined : parseNum(e.target.value) })}
                          placeholder="Precio sugerido MXN"
                          className="text-[11px] border border-slate-200 rounded px-2 py-1"/>
                        <label className="flex items-center gap-1.5 text-[10px] text-slate-700">
                          <input type="checkbox" checked={it.isElectric ?? false}
                            onChange={e => updateItem(idx, { isElectric: e.target.checked })}
                            className="rounded border-slate-300"/>
                          Eléctrico/híbrido (exento)
                        </label>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>

        {/* Costos de despacho aduanero */}
        <details className="mb-4 rounded-xl bg-amber-50/40 border border-amber-100 p-3" open>
          <summary className="text-[12px] font-semibold text-amber-800 cursor-pointer">Costos de despacho aduanero (editables{tabulador && form.usarTabulador ? ' · honorarios desde tabulador' : ''})</summary>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            <Field label="Honorarios agente"><input type="number" autoComplete="off" name="dispatch-honorarios" min="0" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.honorariosAgente} onChange={e => setDispatch({...dispatch, honorariosAgente: parseNum(e.target.value)})} onBlur={e => { const n = Math.max(0, parseNum(e.currentTarget.value)); setDispatch(d => ({...d, honorariosAgente: n})); e.currentTarget.value = String(n) }}/></Field>
            <Field label="Prevalidación"><input type="number" autoComplete="off" name="dispatch-prevalidacion" min="0" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.prevalidacion} onChange={e => setDispatch({...dispatch, prevalidacion: parseNum(e.target.value)})} onBlur={e => { const n = Math.max(0, parseNum(e.currentTarget.value)); setDispatch(d => ({...d, prevalidacion: n})); e.currentTarget.value = String(n) }}/></Field>
            <Field label="Almacenaje"><input type="number" autoComplete="off" name="dispatch-almacenaje" min="0" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.almacenaje} onChange={e => setDispatch({...dispatch, almacenaje: parseNum(e.target.value)})} onBlur={e => { const n = Math.max(0, parseNum(e.currentTarget.value)); setDispatch(d => ({...d, almacenaje: n})); e.currentTarget.value = String(n) }}/></Field>
            <Field label="Estiba"><input type="number" autoComplete="off" name="dispatch-estiba" min="0" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.estiba} onChange={e => setDispatch({...dispatch, estiba: parseNum(e.target.value)})} onBlur={e => { const n = Math.max(0, parseNum(e.currentTarget.value)); setDispatch(d => ({...d, estiba: n})); e.currentTarget.value = String(n) }}/></Field>
            <Field label="Flete interno"><input type="number" autoComplete="off" name="dispatch-flete-interno" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.fleteInterno} onChange={e => setDispatch({...dispatch, fleteInterno: parseNum(e.target.value)})} onBlur={e => { const n = Math.max(0, parseNum(e.currentTarget.value)); setDispatch(d => ({...d, fleteInterno: n})); e.currentTarget.value = String(n) }}/></Field>
          </div>
        </details>

        <Field label="Notas para el cliente (salen en el PDF)">
          <textarea className="w-full text-[12px] border border-slate-200 rounded-lg px-3 py-2 mb-4" rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}/>
        </Field>

        <div className="flex gap-2 flex-wrap">
          <button onClick={handleQuote} disabled={loading || items.filter(i => i.fractionCode && i.quantity > 0).length === 0}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <DollarSign className="w-4 h-4"/>}
            {loading ? 'Calculando...' : quoteId ? 'Recotizar (nueva cotización)' : 'Cotizar y guardar'}
          </button>
          {result && (
            <button onClick={handleScenarios} disabled={loading} className="flex items-center gap-2 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 text-[13px] font-semibold px-6 py-3 rounded-full">
              <GitCompare className="w-4 h-4"/> Sensibilidad (flete/TC/cantidad)
            </button>
          )}
          {quoteId && (<>
            <button onClick={handleEscenariosVenta} disabled={loading} className="flex items-center gap-2 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 text-[13px] font-semibold px-5 py-3 rounded-full">
              <GitCompare className="w-4 h-4"/> Escenarios de venta (China vs T-MEC vs PROSEC)
            </button>
            <Link to={`/cotizador/${quoteId}/imprimir`} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 text-[13px] font-semibold px-5 py-3 rounded-full"><Printer className="w-4 h-4"/> PDF</Link>
            <button onClick={() => cotizadorApi.descargarExcel(quoteId, folio ?? quoteId).catch(e => setError(e instanceof Error ? e.message : 'Error'))} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 text-[13px] font-semibold px-5 py-3 rounded-full"><FileSpreadsheet className="w-4 h-4"/> Excel</button>
            <button onClick={() => handleDuplicar()} disabled={loading} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 text-[13px] font-semibold px-5 py-3 rounded-full"><Copy className="w-4 h-4"/> Duplicar (nueva versión)</button>
            <button onClick={handleGuardarMeta} disabled={loading} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 text-[13px] font-semibold px-5 py-3 rounded-full"><Save className="w-4 h-4"/> Guardar nombre/notas/vigencia</button>
          </>)}
        </div>
        {error && <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100"><AlertCircle className="w-4 h-4 text-rose-500"/><p className="text-[12px] text-rose-700">{error}</p></div>}
        {aviso && !error && <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100"><ShieldCheck className="w-4 h-4 text-emerald-600"/><p className="text-[12px] text-emerald-800">{aviso}</p></div>}
      </div>

      {result && <QuoteResult result={result} />}
      {showScenarios && scenarios && <ScenarioComparison data={scenarios} onClose={() => setShowScenarios(false)} />}
      {escenariosGuardados && !showScenarios && (
        <p className="text-[11px] text-slate-600 px-2">Esta cotización tiene {escenariosGuardados.escenarios.length} escenarios guardados ({shortDate(escenariosGuardados.calculadoEn)}); aparecen en el PDF. <button className="underline" onClick={handleEscenariosVenta}>Recalcular</button></p>
      )}
      </>)}
    </div>
  )
}

// ── Mis cotizaciones (Ola 2) ─────────────────────────────────────────────

function MisCotizaciones({ onAbrir, onDuplicar }: { onAbrir: (id: string) => void; onDuplicar: (id: string) => void }) {
  const [filtros, setFiltros] = useState({ nombre: '', cliente: '', desde: '', hasta: '', estado: '', vigentes: false })
  const [page, setPage] = useState(1)
  const [datos, setDatos] = useState<{ filas: FilaCotizacion[]; total: number; pageSize: number } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [versionesDe, setVersionesDe] = useState<CotizacionCompleta | null>(null)

  async function cargar(p = page) {
    setCargando(true); setError('')
    try {
      const r = await cotizadorApi.listar({ ...filtros, page: p, pageSize: 20 })
      setDatos({ filas: r.data.filas, total: r.data.total, pageSize: r.data.pageSize })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la lista') }
    setCargando(false)
  }
  useEffect(() => { cargar(1); setPage(1) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.estado, filtros.vigentes])
  useEffect(() => {
    const onCliente = () => cargar(1)
    window.addEventListener('aduanai:cliente', onCliente)
    return () => window.removeEventListener('aduanai:cliente', onCliente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.pageSize)) : 1
  const estadoLabel = (s: string) => s === 'approved' ? 'aprobada' : s === 'pending_approval' ? 'pendiente' : s === 'rejected' ? 'rechazada' : s

  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-4`}>
      <div className="flex items-center gap-2"><FolderOpen className="w-5 h-5 text-emerald-500"/><h1 className="text-xl font-bold text-slate-900">Mis cotizaciones</h1><span className="text-[11px] text-slate-500 ml-2">Filtradas por el cliente activo del selector global (si hay uno).</span></div>
      <form className="grid grid-cols-2 md:grid-cols-6 gap-2" onSubmit={e => { e.preventDefault(); setPage(1); cargar(1) }}>
        <Field label="Nombre"><input className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={filtros.nombre} onChange={e => setFiltros({ ...filtros, nombre: e.target.value })}/></Field>
        <Field label="Cliente (texto o razón social)"><input className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={filtros.cliente} onChange={e => setFiltros({ ...filtros, cliente: e.target.value })}/></Field>
        <Field label="Desde"><input type="date" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })}/></Field>
        <Field label="Hasta"><input type="date" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })}/></Field>
        <Field label="Estado"><select className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white" value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })}><option value="">Todos</option><option value="approved">Aprobadas</option><option value="pending_approval">Pendientes</option><option value="rejected">Rechazadas</option></select></Field>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-700"><input type="checkbox" checked={filtros.vigentes} onChange={e => setFiltros({ ...filtros, vigentes: e.target.checked })} className="rounded border-slate-300"/> Solo vigentes</label>
          <button type="submit" className="text-[12px] font-semibold bg-slate-900 text-white px-4 py-1.5 rounded-full">Buscar</button>
        </div>
      </form>
      {error && <p className="text-[12px] text-rose-700">{error}</p>}
      {cargando && <p className="text-[12px] text-slate-500">Cargando…</p>}
      {datos && datos.filas.length === 0 && !cargando && <p className="text-[12px] text-slate-600">No hay cotizaciones con esos filtros. Cotiza en la pestaña "Cotizar": cada cotización se guarda con folio.</p>}
      {datos && datos.filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="border-b border-slate-200/50 text-left text-slate-500">
              <th className="py-2">Folio</th><th className="py-2">v</th><th className="py-2">Nombre</th><th className="py-2">Cliente</th><th className="py-2">Fecha</th><th className="py-2">Vigencia</th><th className="py-2">Estado</th><th className="py-2 text-right">Total MXN</th><th className="py-2">TC (DOF)</th><th className="py-2"></th>
            </tr></thead>
            <tbody>
              {datos.filas.map(f => (
                <tr key={f.id} className="border-b border-slate-100/50">
                  <td className="py-2 font-mono font-semibold">{f.folio}</td>
                  <td className="py-2 font-mono">{f.version}{f.parentQuoteId ? '↳' : ''}</td>
                  <td className="py-2">{f.name ?? <span className="text-slate-400">(sin nombre)</span>}<span className="block text-slate-400">{f.partidas} partida(s) · {f.fractionCode}{f.tieneEscenarios ? ' · escenarios' : ''}</span></td>
                  <td className="py-2">{f.clienteRazonSocial ?? f.client ?? '—'}</td>
                  <td className="py-2">{shortDate(f.createdAt)}<span className="block text-slate-400">{f.createdBy ?? ''}</span></td>
                  <td className={`py-2 ${f.vigente ? '' : 'text-rose-600 font-semibold'}`}>{f.vigenciaHasta ? shortDate(f.vigenciaHasta) : '—'}{!f.vigente ? ' (vencida)' : ''}</td>
                  <td className="py-2">{estadoLabel(f.status)}</td>
                  <td className="py-2 text-right font-mono">{f.totalAll != null ? `$${mxn(f.totalAll)}` : '—'}</td>
                  <td className="py-2 font-mono">{f.exchangeRate?.toFixed(4) ?? '—'}<span className="block text-slate-400">{f.tcFechaDOF ? shortDate(f.tcFechaDOF) : 'manual'}</span></td>
                  <td className="py-2 whitespace-nowrap">
                    <button className="text-emerald-700 font-semibold mr-2" onClick={() => onAbrir(f.id)}>Abrir</button>
                    <button className="text-slate-700 mr-2" onClick={() => onDuplicar(f.id)}>Duplicar</button>
                    <button className="text-slate-700 mr-2" onClick={() => cotizadorApi.obtener(f.id).then(r => setVersionesDe(r.data)).catch(e => setError(e instanceof Error ? e.message : 'Error'))}>Versiones</button>
                    <Link className="text-slate-700" to={`/cotizador/${f.id}/imprimir`}>PDF</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-600">
            <span>{datos.total} cotización(es)</span>
            <button disabled={page <= 1} onClick={() => { setPage(page - 1); cargar(page - 1) }} className="ml-auto px-2 py-1 border border-slate-200 rounded disabled:opacity-40">‹</button>
            <span>{page} / {paginas}</span>
            <button disabled={page >= paginas} onClick={() => { setPage(page + 1); cargar(page + 1) }} className="px-2 py-1 border border-slate-200 rounded disabled:opacity-40">›</button>
          </div>
        </div>
      )}
      {versionesDe && (
        <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
          <div className="flex items-center justify-between mb-2"><p className="text-[12px] font-semibold text-slate-800">Versiones de {versionesDe.folio} — {versionesDe.name ?? 'sin nombre'}</p><button className="text-[11px] text-slate-500" onClick={() => setVersionesDe(null)}>Cerrar</button></div>
          <ul className="text-[11px] space-y-1">
            {versionesDe.versiones.map(v => (
              <li key={v.id} className={`flex items-center gap-3 ${v.id === versionesDe.id ? 'font-semibold' : ''}`}>
                <span className="font-mono">v{v.version}</span><span className="font-mono">{v.folio}</span><span>{shortDate(v.createdAt)}</span><span>{estadoLabel(v.status)}</span><span className="font-mono ml-auto">{v.totalAll != null ? `$${mxn(v.totalAll)}` : '—'}</span>
                <button className="text-emerald-700" onClick={() => onAbrir(v.id)}>Abrir</button>
                <Link className="text-slate-700" to={`/cotizador/${v.id}/imprimir`}>PDF</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Tabulador de honorarios (Ola 2) ──────────────────────────────────────

const BASES: { v: ReglaHonorarios['base']; l: string }[] = [{ v: 'fijo', l: 'Cuota fija (MXN)' }, { v: 'porcentaje', l: '% del valor en aduana' }, { v: 'millar', l: 'Al millar del valor en aduana' }]

function TabuladoresPanel({ tabuladores, catalogoDTA, onChange }: { tabuladores: Tabulador[]; catalogoDTA: EntradaDTA[]; onChange: (t: Tabulador[]) => void }) {
  const [todos, setTodos] = useState<Tabulador[]>(tabuladores)
  const [editando, setEditando] = useState<{ id: string | null; nombre: string; reglas: ReglaHonorarios[] } | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cotizadorApi.tabuladores().then(r => setTodos(r.data)).catch(() => {}) }, [])
  const tipos: { v: string; l: string }[] = [{ v: '*', l: 'Cualquier tipo (comodín)' }, ...catalogoDTA.map(e => ({ v: e.tipo, l: e.etiqueta }))]

  async function guardar() {
    if (!editando) return
    setGuardando(true); setError('')
    try {
      const r = editando.id
        ? await cotizadorApi.actualizarTabulador(editando.id, { nombre: editando.nombre, reglas: editando.reglas })
        : await cotizadorApi.crearTabulador({ nombre: editando.nombre, reglas: editando.reglas })
      const lista = editando.id ? todos.map(t => t.id === r.data.id ? r.data : t) : [...todos, r.data]
      setTodos(lista); onChange(lista.filter(t => t.activo)); setEditando(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') }
    setGuardando(false)
  }
  async function toggleActivo(t: Tabulador) {
    try { const r = await cotizadorApi.actualizarTabulador(t.id, { activo: !t.activo }); const lista = todos.map(x => x.id === t.id ? r.data : x); setTodos(lista); onChange(lista.filter(x => x.activo)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }
  async function eliminar(t: Tabulador) {
    if (!confirm(`¿Eliminar el tabulador "${t.nombre}"? Las cotizaciones ya guardadas conservan sus honorarios.`)) return
    try { await cotizadorApi.eliminarTabulador(t.id); const lista = todos.filter(x => x.id !== t.id); setTodos(lista); onChange(lista.filter(x => x.activo)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }
  const setRegla = (i: number, patch: Partial<ReglaHonorarios>) => setEditando(e => e ? { ...e, reglas: e.reglas.map((r, j) => j === i ? { ...r, ...patch } : r) } : e)

  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-4`}>
      <div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-500"/><h1 className="text-xl font-bold text-slate-900">Tabulador de honorarios</h1>
        <button className="ml-auto text-[12px] font-semibold bg-slate-900 text-white px-4 py-1.5 rounded-full" onClick={() => setEditando({ id: null, nombre: '', reglas: [{ tipoOperacion: '*', base: 'porcentaje', valor: 0.5, minimo: 2500 }] })}>Nuevo tabulador</button></div>
      <p className="text-[11px] text-slate-600">Cada regla aplica a un tipo de operación (o al comodín). Base fija, % o al millar sobre el valor en aduana total en MXN; mínimo y máximo acotan el resultado. Al cotizar, elige el tabulador y los honorarios se calculan (editables).</p>
      {error && <p className="text-[12px] text-rose-700">{error}</p>}
      {todos.length === 0 && !editando && <p className="text-[12px] text-slate-600">Aún no hay tabuladores. Crea el primero con tus reglas reales; nada viene precargado.</p>}
      <ul className="space-y-2">
        {todos.map(t => (
          <li key={t.id} className={`rounded-xl border p-3 ${t.activo ? 'border-slate-200 bg-white/60' : 'border-slate-100 bg-slate-50/50 opacity-70'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-semibold text-slate-900">{t.nombre}</p>{!t.activo && <span className="text-[10px] text-slate-500">(inactivo)</span>}
              <div className="ml-auto flex gap-2 text-[11px]">
                <button className="text-emerald-700 font-semibold" onClick={() => setEditando({ id: t.id, nombre: t.nombre, reglas: t.reglas })}>Editar</button>
                <button className="text-slate-700" onClick={() => toggleActivo(t)}>{t.activo ? 'Desactivar' : 'Activar'}</button>
                <button className="text-rose-600" onClick={() => eliminar(t)}>Eliminar</button>
              </div>
            </div>
            <ul className="mt-1 text-[11px] text-slate-700 space-y-0.5">
              {t.reglas.map((r, i) => <li key={i}>{tipos.find(x => x.v === r.tipoOperacion)?.l ?? r.tipoOperacion}: {r.base === 'fijo' ? `$${r.valor.toFixed(2)} fijo` : r.base === 'porcentaje' ? `${r.valor}%` : `${r.valor} al millar`}{r.minimo != null ? ` · mín $${r.minimo}` : ''}{r.maximo != null ? ` · máx $${r.maximo}` : ''}</li>)}
            </ul>
          </li>
        ))}
      </ul>
      {editando && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
          <Field label="Nombre del tabulador"><input className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2" value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} placeholder="Tarifa estándar 2026"/></Field>
          {editando.reglas.map((r, i) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <Field label="Tipo de operación"><select className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white" value={r.tipoOperacion} onChange={e => setRegla(i, { tipoOperacion: e.target.value as ReglaHonorarios['tipoOperacion'] })}>{tipos.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
              <Field label="Base"><select className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white" value={r.base} onChange={e => setRegla(i, { base: e.target.value as ReglaHonorarios['base'] })}>{BASES.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}</select></Field>
              <Field label="Valor"><input type="number" min="0" step="0.01" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={r.valor} onChange={e => setRegla(i, { valor: parseNum(e.target.value) })}/></Field>
              <Field label="Mínimo MXN"><input type="number" min="0" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={r.minimo ?? ''} onChange={e => setRegla(i, { minimo: e.target.value === '' ? undefined : parseNum(e.target.value) })}/></Field>
              <Field label="Máximo MXN"><input type="number" min="0" onWheel={blurOnWheel} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={r.maximo ?? ''} onChange={e => setRegla(i, { maximo: e.target.value === '' ? undefined : parseNum(e.target.value) })}/></Field>
              <button className="text-[11px] text-rose-600 pb-2" onClick={() => setEditando({ ...editando, reglas: editando.reglas.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="text-[11px] text-emerald-700 font-semibold" onClick={() => setEditando({ ...editando, reglas: [...editando.reglas, { tipoOperacion: 'general', base: 'fijo', valor: 0 }] })}>+ Agregar regla</button>
            <button disabled={guardando || !editando.nombre.trim() || editando.reglas.length === 0} onClick={guardar} className="ml-auto text-[12px] font-semibold bg-emerald-500 text-white px-4 py-1.5 rounded-full disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar tabulador'}</button>
            <button className="text-[12px] text-slate-600 px-3" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}

function TCRadio({ val, cur, onChange, label }: { val: 'current' | 'average30' | 'historical'; cur: string; onChange: (v: 'current' | 'average30' | 'historical') => void; label: string }) {
  return (
    <button onClick={() => onChange(val)}
      className={`text-[11px] font-medium px-3 py-1.5 rounded-full transition ${cur === val ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
      {label}
    </button>
  )
}

function QuoteResult({ result }: { result: MultiQuoteResultOla2 }) {
  const itemsWithAntidumping = result.items.filter(i => i.hasAntidumping || (i as ItemOla2).antidumping)
  const ola2 = (it: MultiQuoteResult['items'][number]) => it as ItemOla2
  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-5`}>
      {/* Banner cuotas compensatorias destacado — una card por partida con
          datos legales completos + cálculo + multa potencial */}
      {itemsWithAntidumping.length > 0 && (
        <div className="space-y-3">
          {itemsWithAntidumping.map((it) => {
            const ad = it.antidumping
            if (!ad) {
              // Fallback compacto si no llegó el objeto rico (backend viejo)
              return (
                <div key={it.numeroPartida} className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-4">
                  <p className="text-[13px] font-bold text-red-900">🚨 Partida {it.numeroPartida}: cuota compensatoria activa</p>
                  <p className="text-[12px] text-red-800 mt-1">
                    <span className="font-mono">{formatFraction(it.fractionCode)}</span> + {it.countryOfOrigin} · {it.countervailingRate}% ({it.antidumpingDecree})
                  </p>
                </div>
              )
            }
            const rateLabel = ad.rateType === 'specific_USD_kg' ? `$${ad.rate} USD/kg`
              : ad.rateType === 'specific_USD_unit' ? `$${ad.rate} ${ad.rateUnit}`
              : `${ad.rate}%`
            const isPrefix = ad.matchType !== 'exact'
            return (
              <div key={it.numeroPartida} className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600"/>
                  <p className="text-[14px] font-bold text-red-900">🚨 Cuota compensatoria antidumping — Partida {it.numeroPartida}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-red-800">
                  {ad.resolutionNumber && (
                    <p><span className="font-semibold">Resolución:</span> <span className="font-mono">{ad.resolutionNumber}</span>{ad.expedienteUPCI ? <span className="text-red-600"> · {ad.expedienteUPCI}</span> : null}</p>
                  )}
                  <p><span className="font-semibold">Fracción:</span> <span className="font-mono">{formatFraction(it.fractionCode)}</span></p>
                  {ad.productDesc && <p className="md:col-span-2"><span className="font-semibold">Producto:</span> {ad.productDesc}</p>}
                  <p><span className="font-semibold">Origen:</span> {it.countryOfOrigin}</p>
                  <p><span className="font-semibold">Cuota:</span> <span className="font-mono text-red-900">{rateLabel}</span>{ola2(it).antidumping?.origenTasa === 'exportador' ? <span className="text-red-700"> · tasa por exportador: {ola2(it).antidumping?.empresa}</span> : ola2(it).antidumping?.origenTasa === 'general' ? <span className="text-red-700"> · tasa general (hay tasas por empresa)</span> : null}</p>
                  {ola2(it).antidumping?.vigencia && <p className="md:col-span-2"><span className="font-semibold">Vigencia:</span> {ola2(it).antidumping?.vigencia}</p>}
                </div>
                {ola2(it).antidumping?.esAntielusion && (
                  <p className="text-[12px] font-bold text-red-900 bg-red-100 border border-red-300 rounded px-2 py-1">⚠️ MEDIDA ANTIELUSIÓN — aplica aunque la mercancía llegue por triangulación o con cambios menores. Revisa origen real y exportador.</p>
                )}
                {(ola2(it).antidumping?.advertencias ?? []).map((a, i) => <p key={i} className="text-[11px] text-red-800">{a}</p>)}
                {ad.calculation && (
                  <div className="rounded-lg bg-white/70 border border-red-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wider text-red-700 font-semibold">Cálculo</p>
                    <p className="text-[12px] text-red-900 font-mono mt-0.5">{ad.calculation}</p>
                    <p className="text-[13px] text-red-900 font-bold mt-1">
                      = ${mxn(it.countervailing)} MXN <span className="text-[10px] text-red-600 font-normal">(TC {result.exchangeRate.toFixed(4)})</span>
                    </p>
                  </div>
                )}
                {ad.needsWeight && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    ⚠️ Cuota tipo USD/kg — declara <span className="font-mono">weightKg</span> en la partida para cálculo exacto.
                  </p>
                )}
                {ad.potentialPenaltyMXN > 0 && (
                  <p className="text-[12px] text-red-800">
                    <span className="font-semibold">Multa potencial si se omite:</span>{' '}
                    <span className="font-mono font-bold">${mxn(ad.potentialPenaltyMXN)} MXN</span>{' '}
                    <span className="text-[10px] text-red-600">(140% Art. 178 LA)</span>
                  </p>
                )}
                {isPrefix && ad.matchedFraction && (
                  <p className="text-[11px] text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-1">
                    ⚠️ <span className="font-semibold">Match por {ad.matchType === 'subheading' ? 'subpartida' : 'partida'}</span> ({ad.matchedFraction}) — verifica que tu fracción específica esté cubierta.
                  </p>
                )}
                {ad.dofUrl && (
                  <a href={ad.dofUrl} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 underline">
                    Ver resolución oficial <Globe className="w-3 h-3"/>
                  </a>
                )}
                <p className="text-[10px] text-red-700/80 italic pt-2 border-t border-red-200">
                  ⚖️ Cálculo estimado con base en datos UPCI. Verifica el monto contra la resolución oficial vigente del DOF/SE antes de declarar pedimento — la responsabilidad legal del dato declarado corresponde al importador y agente aduanal (Art. 54 LA).
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Header totales — BUG-4: min-w-0 + break-all contienen el número
          dentro de la tarjeta; nunca se corta contra el borde de la pantalla. */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="min-w-0 max-w-full">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Costo total con despacho</p>
          <p className="text-[36px] font-bold text-slate-900 break-all leading-tight">${mxn(result.totals.totalAll)} <span className="text-[16px] text-slate-500">MXN</span></p>
          <p className="text-[12px] text-emerald-600 mt-1 break-all">Landed cost: ${mxn(result.totals.totalLandedCost)} · Despacho: ${mxn(result.totals.totalDispatch)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-500">Tipo de cambio</p>
          <p className="font-mono text-[16px] font-bold text-slate-900">${result.exchangeRate.toFixed(4)}</p>
          <p className="text-[10px] text-slate-500">{result.exchangeRateMode} · {result.exchangeRateSource} · TC del {shortDate(result.exchangeRateDate)}</p>
          <p className={`text-[10px] ${result.tcFechaDOF ? 'text-emerald-700' : 'text-amber-700'}`}>{result.tcFechaDOF ? `Fecha DOF/Banxico del TC: ${shortDate(result.tcFechaDOF)}` : 'TC manual — sin fecha DOF (el PDF lo indica)'}</p>
        </div>
      </div>

      {/* Ola 2: DTA por tipo de operación + honorarios */}
      {(result.dta || result.honorarios) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          {result.dta && (
            <div className={`rounded-xl border p-3 ${result.dta.cotejo === 'pendiente' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
              <p className="font-semibold">DTA · {result.dta.etiqueta}</p>
              <p>{result.dta.base === 'millar' ? `${result.dta.dtaPct * 10} al millar sobre valor en aduana` : `Cuota fija $${mxn(result.dta.montoFijoMXN)} MXN por operación`} · {result.dta.fundamento} (fracc. {result.dta.fraccionArt49})</p>
              <p className="mt-0.5">{result.dta.cotejo === 'verificado' ? '✓ Monto cotejado contra fuente oficial' : result.dta.cotejo === 'corpus' ? 'Respaldado en el corpus legal (Art. 49 LFD); cotejo formal contra DOF pendiente.' : '⚠ Monto pendiente de fuente oficial — verifica antes de enviar al cliente.'}</p>
              {result.dta.nota && <p className="mt-0.5 opacity-80">{result.dta.nota}</p>}
            </div>
          )}
          {result.honorarios && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <p className="font-semibold">Honorarios de la agencia: ${mxn(result.honorarios.monto)} MXN</p>
              <p>{result.honorarios.origen === 'tabulador' ? `Calculados con el tabulador "${result.honorarios.tabuladorNombre}": ${result.honorarios.detalle}` : 'Capturados manualmente' + (result.honorarios.detalle ? ` · ${result.honorarios.detalle}` : '')}</p>
            </div>
          )}
        </div>
      )}

      {result.exchangeRateWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
          <p className="text-[11px] leading-relaxed">{result.exchangeRateWarning}</p>
        </div>
      )}

      {/* Tabla de partidas */}
      <div>
        <p className="text-[12px] font-semibold text-slate-700 mb-2">Partidas ({result.items.length})</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-200/50 text-left">
                <th className="py-2 text-slate-500 font-medium">#</th>
                <th className="py-2 text-slate-500 font-medium">Fracción</th>
                <th className="py-2 text-slate-500 font-medium">País</th>
                <th className="py-2 text-slate-500 font-medium text-right">Valor MXN</th>
                <th className="py-2 text-slate-500 font-medium text-right">IGI</th>
                <th className="py-2 text-slate-500 font-medium text-right">DTA</th>
                <th className="py-2 text-slate-500 font-medium text-right">Cuota C.</th>
                <th className="py-2 text-slate-500 font-medium text-right">IVA</th>
                <th className="py-2 text-slate-500 font-medium text-right">ISAN</th>
                <th className="py-2 text-slate-500 font-medium text-right">Total partida</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map(it => (
                <tr key={it.numeroPartida} className={`border-b border-slate-100/50 ${it.hasAntidumping ? 'bg-rose-50/30' : ''}`}>
                  <td className="py-2 font-mono text-slate-500">{it.numeroPartida}</td>
                  <td className="py-2 font-mono font-semibold text-slate-900">{formatFraction(it.fractionCode)}</td>
                  <td className="py-2 text-slate-700">{it.countryOfOrigin}</td>
                  <td className="py-2 text-right font-mono">${mxn(it.customsValueMXN)}</td>
                  <td className="py-2 text-right font-mono">${mxn(it.igi)} <span className="text-slate-400">({it.igiRate}%)</span></td>
                  <td className="py-2 text-right font-mono">${mxn(it.dta)}{it.dtaRate === 0 ? <span className="text-[9px] text-slate-400 block">cuota fija</span> : null}</td>
                  <td className={`py-2 text-right font-mono ${it.hasAntidumping ? 'text-rose-700 font-semibold' : 'text-slate-400'}`}>{
                    it.hasAntidumping
                      ? <>${mxn(it.countervailing)}<span className="text-[9px] text-rose-500 font-normal block">{
                          it.antidumping?.rateType === 'specific_USD_kg' ? `$${it.antidumping.rate} USD/kg`
                          : it.antidumping?.rateType === 'specific_USD_unit' ? `$${it.antidumping.rate} ${it.antidumping.rateUnit}`
                          : `${it.countervailingRate}%`
                        }</span></>
                      : '—'
                  }</td>
                  <td className="py-2 text-right font-mono">${mxn(it.iva)}</td>
                  <td className={`py-2 text-right font-mono ${it.programs.isan.applies && !it.programs.isan.exempt ? 'text-indigo-700 font-semibold' : 'text-slate-400'}`}>{
                    !it.programs.isan.applies ? '—'
                      : it.programs.isan.exempt ? <span className="text-emerald-600">exento</span>
                      : it.isan > 0 ? <>${mxn(it.isan)}</>
                      : <span className="text-amber-600" title={it.programs.isan.calculation}>⚠️ s/tarifa</span>
                  }</td>
                  <td className="py-2 text-right font-mono font-bold text-slate-900">${mxn(it.totalCost)}</td>
                </tr>
              ))}
              <tr className="bg-emerald-50/50 font-bold">
                <td colSpan={3} className="py-2 text-emerald-700">Subtotales</td>
                <td className="py-2 text-right font-mono">${mxn(result.totals.valueMXN)}</td>
                <td className="py-2 text-right font-mono">${mxn(result.totals.igi)}</td>
                <td className="py-2 text-right font-mono">${mxn(result.totals.dta)}</td>
                <td className="py-2 text-right font-mono text-rose-700">${mxn(result.totals.countervailing)}</td>
                <td className="py-2 text-right font-mono">${mxn(result.totals.iva)}</td>
                <td className="py-2 text-right font-mono text-indigo-700">${mxn(result.totals.isan)}</td>
                <td className="py-2 text-right font-mono text-emerald-700">${mxn(result.totals.totalLandedCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Precios Estimados SAT por partida (Art. 84-A LA) */}
      {result.items.some(i => i.priceCheck?.hasEstimatedPrice) && (
        <div>
          <p className="text-[12px] font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-600"/> Precios Estimados SAT (Art. 84-A LA)
          </p>
          <div className="space-y-2">
            {result.items.filter(i => i.priceCheck?.hasEstimatedPrice).map(it => {
              const pc = it.priceCheck!
              const palette = pc.severity === 'critical'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : pc.severity === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              return (
                <div key={it.numeroPartida} className={`rounded-xl border p-3 ${palette}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold">
                        Partida {it.numeroPartida} · {formatFraction(it.fractionCode)} · {it.countryOfOrigin}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
                        <div>
                          <p className="opacity-70">Declarado</p>
                          <p className="font-mono font-semibold">${pc.declaredUnitValueUSD?.toFixed(2)} {pc.estimated?.unit.split('/')[1]}</p>
                        </div>
                        <div>
                          <p className="opacity-70">Estimado SAT</p>
                          <p className="font-mono font-semibold">${pc.estimated?.estimatedValue.toFixed(2)} {pc.estimated?.unit.split('/')[1]}</p>
                        </div>
                        <div>
                          <p className="opacity-70">Diferencia</p>
                          <p className="font-mono font-semibold">{pc.deltaPct != null && pc.deltaPct > 0 ? '−' : ''}{Math.abs(pc.deltaPct ?? 0).toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="opacity-70">Fuente</p>
                          <p className="font-mono text-[10px]">{pc.estimated?.decree ?? pc.estimated?.source}</p>
                        </div>
                      </div>
                      {pc.message && <p className="text-[11px] mt-2 leading-relaxed">{pc.message}</p>}
                      {pc.action && <p className="text-[11px] mt-1 font-semibold">→ {pc.action}</p>}
                      {pc.guaranteeMXN != null && pc.guaranteeMXN > 0 && (
                        <div className="mt-2 inline-flex items-center gap-2 bg-white/60 rounded-lg px-3 py-1.5">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">Garantía estimada</span>
                          <span className="font-mono font-bold text-[13px]">${mxn(pc.guaranteeMXN)} MXN</span>
                        </div>
                      )}
                      {pc.disclaimer && <p className="text-[10px] mt-1 opacity-70 italic">{pc.disclaimer}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tratados preferenciales por partida */}
      {result.items.some(i => i.treaty.requested) && (
        <div>
          <p className="text-[12px] font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600"/> Tratados preferenciales
          </p>
          <div className="space-y-2">
            {result.items.filter(i => i.treaty.requested).map(it => {
              const t = it.treaty
              const isApplied = !!t.applied
              const palette = isApplied
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
              return (
                <div key={it.numeroPartida} className={`rounded-xl border p-3 ${palette}`}>
                  <div className="flex items-start gap-3">
                    {isApplied
                      ? <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5"/>
                      : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold">
                        Partida {it.numeroPartida} · {formatFraction(it.fractionCode)} · {it.countryOfOrigin} · {t.requested}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
                        <div>
                          <p className="opacity-70">Arancel NMF</p>
                          <p className="font-mono font-semibold">{t.nmfRate}%</p>
                        </div>
                        <div>
                          <p className="opacity-70">Preferencial {t.requested}</p>
                          <p className="font-mono font-semibold">{t.preferentialRate == null ? '—' : `${t.preferentialRate}%`}</p>
                        </div>
                        <div>
                          <p className="opacity-70">Aplicado</p>
                          <p className="font-mono font-semibold">{t.appliedRate}%</p>
                        </div>
                        <div>
                          <p className="opacity-70">Ahorro</p>
                          <p className="font-mono font-semibold">{t.savingsMXN > 0 ? `$${mxn(t.savingsMXN)} MXN` : '—'}</p>
                        </div>
                      </div>
                      {t.note && <p className="text-[11px] mt-2 leading-relaxed">{t.note}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* NOMs y excepciones por partida */}
      {result.items.map(it => (
        <NOMExceptionPanel
          key={`nom-${it.numeroPartida}-${it.fractionCode}`}
          fractionCode={it.fractionCode}
          countryOfOrigin={it.countryOfOrigin}
          productDescription={it.description ?? `Partida ${it.numeroPartida}`}
        />
      ))}

      {/* Desglose de impuestos por programas (PROSEC, IEPS, ISAN) */}
      {result.items.some(i => i.programs.prosec.eligible || i.programs.ieps.applies || i.programs.isan.applies || i.programs.regla8va.eligible) && (
        <div className="rounded-xl bg-violet-50/30 border border-violet-200 p-4">
          <p className="text-[12px] font-bold text-violet-900 mb-3">💰 Desglose de impuestos por programas</p>
          {result.items.map(it => {
            const p = it.programs
            const hasContent = p.prosec.eligible || p.regla8va.eligible || p.ieps.applies || p.isan.applies
            if (!hasContent) return null
            const iepsNota = ola2(it).programs?.ieps?.nota
            return (
              <div key={it.numeroPartida} className="rounded-lg bg-white/70 border border-violet-100 p-3 mb-2">
                <p className="text-[11px] font-bold text-slate-900 mb-2">Partida {it.numeroPartida} · {formatFraction(it.fractionCode)}</p>
                <div className="space-y-1.5 text-[11px]">
                  {p.prosec.eligible && (() => {
                    const verificada = p.prosec.verificacion?.estado === 'verificado'
                    const notaProsec = p.prosec.verificacion?.nota
                    return (
                    <div className={`rounded p-2 ${p.prosec.applied && verificada ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                      <p className="font-semibold">PROSEC sector {p.prosec.sector ?? '—'}</p>
                      {p.prosec.applied
                        ? verificada
                          ? <p className="text-emerald-800">✓ Aplicado · Tasa preferencial {p.prosec.prosecRate}% (cotejada: {p.prosec.verificacion?.fuente?.nombre}) · <strong>Ahorro: ${mxn(p.prosec.savingsMXN)} MXN</strong></p>
                          : <p className="text-amber-800">⚠ Aplicado por tu declaración de registro, con tasa SIN VERIFICAR ({p.prosec.prosecRate}%) — confirma en DOF la acotación de tu fracción antes de operar. Ahorro estimado: ${mxn(p.prosec.savingsMXN)} MXN.</p>
                        : verificada
                          ? <p className="text-amber-800">💡 OPORTUNIDAD: con registro PROSEC ahorrarías hasta el {it.treaty.appliedRate - (p.prosec.prosecRate ?? 0)}% del IGI (tasa cotejada en DOF). Trámite ante SE 30-45 días.</p>
                          : <p className="text-amber-800">PROSEC posiblemente aplicable — requiere verificación. Ahorro potencial (NO incluido en el total): hasta {it.treaty.appliedRate - (p.prosec.prosecRate ?? 0)}% del IGI, si tu registro ante SE y la acotación del decreto aplican a esta mercancía. Verifica en DOF.</p>}
                      {notaProsec && <p className="text-[11px] text-amber-800 mt-1">{notaProsec}</p>}
                    </div>
                    )
                  })()}
                  {p.regla8va.eligible && (
                    <div className={`rounded p-2 ${p.regla8va.applied ? 'bg-emerald-50 border border-emerald-200' : 'bg-sky-50 border border-sky-200'}`}>
                      <p className="font-semibold">Regla 8va — parte para {p.regla8va.vehicleFraction}</p>
                      <p>{p.regla8va.applied ? `✓ Aplicada · Tasa ${p.regla8va.preferentialRate}%` : `Disponible — tasa preferencial ${p.regla8va.preferentialRate}%`}</p>
                    </div>
                  )}
                  {p.ieps.applies && (
                    <div className="rounded p-2 bg-rose-50 border border-rose-200">
                      <p className="font-semibold text-rose-900">🚨 IEPS aplicable — {p.ieps.category}{ola2(it).programs?.ieps?.cotejo === 'sin_verificar' ? <span className="text-amber-700 font-normal"> · tasa sin cotejo contra LIEPS/DOF</span> : null}</p>
                      <p className="text-rose-800">{p.ieps.calculation || `${p.ieps.rate} ${p.ieps.rateType}`}</p>
                      {p.ieps.amountMXN > 0 && <p className="text-rose-900 font-bold">Monto: ${mxn(p.ieps.amountMXN)} MXN</p>}
                      {ola2(it).programs?.ieps?.fundamento && <p className="text-[10px] text-rose-700">{ola2(it).programs?.ieps?.fundamento}</p>}
                    </div>
                  )}
                  {!p.ieps.applies && iepsNota && <p className="text-[10px] text-slate-500">{iepsNota}</p>}
                  {p.isan.applies && (
                    <div className={`rounded p-2 ${p.isan.exempt ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                      <p className="font-semibold">🚗 ISAN — {p.isan.exempt ? 'Vehículo eléctrico EXENTO' : 'Vehículo nuevo'}</p>
                      <p>{p.isan.calculation}</p>
                      {!p.isan.exempt && p.isan.amountMXN > 0 && <p className="font-bold">Monto: ${mxn(p.isan.amountMXN)} MXN</p>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Costos de despacho */}
      <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
        <p className="text-[12px] font-semibold text-amber-800 mb-2">Costos de despacho aduanero</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[12px]">
          {[
            ['Honorarios agente', result.dispatch.honorariosAgente],
            ['Prevalidación', result.dispatch.prevalidacion],
            ['Almacenaje', result.dispatch.almacenaje],
            ['Estiba', result.dispatch.estiba],
            ['Flete interno', result.dispatch.fleteInterno],
          ].filter(([, v]) => (v as number) > 0).map(([l, v]) => (
            <div key={l as string} className="flex justify-between"><span className="text-slate-600">{l}</span><span className="font-mono">${mxn(v as number)}</span></div>
          ))}
          <div className="flex justify-between border-t border-amber-200 pt-1 font-semibold col-span-2 md:col-span-3"><span>Total despacho</span><span className="font-mono">${mxn(result.dispatch.total)}</span></div>
        </div>
      </div>

      {/* Compliance global */}
      {result.alertas.length > 0 && (
        <div className="rounded-xl bg-violet-50/40 border border-violet-100 p-4">
          <p className="text-[12px] font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-600"/> Compliance & alertas
          </p>
          <ul className="space-y-1">
            {result.alertas.map((a, i) => (
              <li key={i} className="text-[12px] text-slate-700 flex items-start gap-2">
                <FileWarning className="w-3 h-3 text-amber-500 mt-0.5 shrink-0"/>{a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ScenarioComparison({ data, onClose }: { data: ScenarioComparison; onClose: () => void }) {
  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[14px] font-bold text-slate-900 flex items-center gap-2"><GitCompare className="w-5 h-5 text-violet-600"/> Comparación de escenarios</p>
        <button onClick={onClose} className="text-[12px] text-slate-500 hover:text-slate-700">Cerrar</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-200/50 text-left">
              <th className="py-2 text-slate-500 font-medium">Escenario</th>
              <th className="py-2 text-slate-500 font-medium text-right">Total MXN</th>
              <th className="py-2 text-slate-500 font-medium text-right">Δ vs base</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-emerald-50/40 font-semibold">
              <td className="py-2">Base</td>
              <td className="py-2 text-right font-mono">${mxn(data.base.totals.totalAll)}</td>
              <td className="py-2 text-right text-slate-400">—</td>
            </tr>
            {data.scenarios.map((s, i) => {
              const isWorse = s.deltaMXN > 0
              return (
                <tr key={i} className="border-b border-slate-100/50">
                  <td className="py-2">{s.name}</td>
                  <td className="py-2 text-right font-mono">${mxn(s.result.totals.totalAll)}</td>
                  <td className={`py-2 text-right font-mono ${isWorse ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {isWorse ? '+' : ''}${mxn(s.deltaMXN)} ({s.deltaPct > 0 ? '+' : ''}{s.deltaPct}%)
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
