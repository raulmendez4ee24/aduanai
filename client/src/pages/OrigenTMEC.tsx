import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Globe, Calculator, AlertTriangle, ShieldCheck, FileWarning, RefreshCw, Plus, Trash2, Award, FileText, Boxes, Users, ListChecks, Send, Copy, ExternalLink, Download, Upload } from 'lucide-react'
import { api } from '../lib/api'
import type { OriginAnalysisInput, OriginAnalysisResult, OriginRule, OriginCertificateInput } from '../lib/api'
import { CampoNumerico } from '../components/ui'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { origenApi, archivoABase64, type DeterminacionBOM, type ProductoOrigen, type CertProveedor, type CertificadoPrellenado, type ReporteCobertura, type ReporteImport } from '../lib/api/origen'

export const GUIA_MODULO = {
  titulo: 'Origen T-MEC',
  pasos: [
    'Calculadora: captura la fracción del bien final y sus materiales (originarios / no originarios) para el VCR por 4 métodos; el estado sobrevive al cambiar de módulo.',
    'Desde el BOM: elige un producto terminado del catálogo; el sistema evalúa el salto arancelario CC/CTH/CTSH material por material, la acumulación (MX/US/CA) y el de minimis (umbral editable, pendiente de cotejo). Si un material no tiene fracción, lo dice y enlaza al catálogo.',
    'Certificado: se prellena con los 9 elementos del Anexo 5-A desde el análisis, el producto y el cliente activo; imprime con folio.',
    'Certificados de proveedores: registra al proveedor, solicita por correo (o copia el enlace del portal), el proveedor sube su PDF y capturas vigencia; alertas a 60/30/7 días.',
    'Cobertura de reglas: qué capítulos/partidas tienen regla específica cargada y cuáles no. Las reglas nuevas se cargan con fuente (Admin → Importar), nunca se inventan.',
  ],
}

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'calculadora' | 'bom' | 'proveedores' | 'cobertura'
const TABS: { id: Tab; label: string; icono: typeof Globe }[] = [
  { id: 'calculadora', label: 'Calculadora VCR', icono: Calculator },
  { id: 'bom', label: 'Desde el BOM', icono: Boxes },
  { id: 'proveedores', label: 'Certificados de proveedores', icono: Users },
  { id: 'cobertura', label: 'Cobertura de reglas', icono: ListChecks },
]

interface Material {
  id: string
  description: string
  valueUSD: number
  originating: boolean
}

function emptyMaterial(originating = false): Material {
  return { id: Math.random().toString(36).slice(2), description: '', valueUSD: 0, originating }
}

interface FormOrigen {
  agreement: 'TMEC' | 'TLCUEM' | 'CPTPP'
  fractionCode: string
  productValue: number
  laborCost: number
  overheadCost: number
  profit: number
  packagingCost: number
  royalties: number
  rvcMethod: 'transaction_value' | 'net_cost'
  materials: Material[]
  highWageLaborCost: number
  totalSteelAluminum: number
  naSteelAluminum: number
}
const FORM_INICIAL: FormOrigen = {
  agreement: 'TMEC', fractionCode: '', productValue: 0, laborCost: 0, overheadCost: 0, profit: 0, packagingCost: 0, royalties: 0,
  rvcMethod: 'transaction_value', materials: [emptyMaterial(true), emptyMaterial(false)], highWageLaborCost: 0, totalSteelAluminum: 0, naSteelAluminum: 0,
}

export function OrigenTMECPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(tabParam && TABS.some(t => t.id === tabParam) ? tabParam : 'calculadora')
  useEffect(() => { if (tabParam && TABS.some(t => t.id === tabParam)) setTab(tabParam) }, [tabParam])
  const cambiarTab = (t: Tab) => { setTab(t); const p = new URLSearchParams(params); p.set('tab', t); p.delete('certificadoId'); setParams(p, { replace: true }) }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 pb-4`}>
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Origen T-MEC</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">
          VCR, salto arancelario por material, de minimis, acumulación, certificado con los 9 elementos y certificados de proveedores. Análisis preliminar — la determinación final
          requiere documentación de cadena de suministro.
        </p>
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => cambiarTab(t.id)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${tab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              <t.icono className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'calculadora' && <CalculadoraTab />}
      {tab === 'bom' && <BomTab />}
      {tab === 'proveedores' && <ProveedoresTab certificadoId={params.get('certificadoId')} />}
      {tab === 'cobertura' && <CoberturaTab />}
    </div>
  )
}

// ═════════════════════════ Calculadora VCR (estado persistente) ═════════════════════════

function CalculadoraTab() {
  const [form, setForm, reset] = useEstadoPersistente<FormOrigen>('origen', FORM_INICIAL)
  const set = <K extends keyof FormOrigen>(k: K, v: FormOrigen[K]) => setForm(prev => ({ ...prev, [k]: v }))
  const { agreement, fractionCode, productValue, materials } = form

  const [rule, setRule] = useState<OriginRule | null>(null)
  const [ruleLoading, setRuleLoading] = useState(false)
  const [result, setResult] = useState<OriginAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const originatingValue = materials.filter(m => m.originating).reduce((s, m) => s + (m.valueUSD || 0), 0)
  const nonOriginatingValue = materials.filter(m => !m.originating).reduce((s, m) => s + (m.valueUSD || 0), 0)

  useEffect(() => {
    if (!fractionCode || fractionCode.replace(/[^0-9]/g, '').length < 2) {
      setRule(null)
      return
    }
    let cancelled = false
    setRuleLoading(true)
    api.originRule(fractionCode, agreement)
      .then(r => { if (!cancelled) setRule(r.data.rule) })
      .catch(() => { if (!cancelled) setRule(null) })
      .finally(() => { if (!cancelled) setRuleLoading(false) })
    return () => { cancelled = true }
  }, [fractionCode, agreement])

  function updateMaterial(id: string, patch: Partial<Material>) {
    set('materials', materials.map(m => m.id === id ? { ...m, ...patch } : m))
  }
  function addMaterial(originating: boolean) { set('materials', [...materials, emptyMaterial(originating)]) }
  function removeMaterial(id: string) { set('materials', materials.filter(m => m.id !== id)) }

  async function handleAnalyze() {
    if (!fractionCode || productValue <= 0) {
      setError('Fracción y valor del producto son requeridos')
      return
    }
    setLoading(true); setError(''); setResult(null)
    try {
      const input: OriginAnalysisInput = {
        fractionCode,
        agreement,
        productValue,
        originatingValue,
        nonOriginatingValue,
        laborCost: form.laborCost || undefined,
        highWageLaborCost: form.highWageLaborCost || undefined,
        overheadCost: form.overheadCost || undefined,
        profit: form.profit || undefined,
        packagingCost: form.packagingCost || undefined,
        royalties: form.royalties || undefined,
        rvcMethod: form.rvcMethod,
        totalSteelAluminumValue: form.totalSteelAluminum || undefined,
        northAmericanSteelAluminumValue: form.naSteelAluminum || undefined,
      }
      const r = await api.originAnalyze(input)
      setResult(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al analizar origen')
    }
    setLoading(false)
  }

  return (
    <>
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        {/* Tratado + Fracción */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Field label="Tratado">
            <div className="flex gap-2">
              {(['TMEC', 'TLCUEM', 'CPTPP'] as const).map(t => (
                <button key={t} onClick={() => set('agreement', t)}
                  className={`text-[12px] font-medium px-3 py-2 rounded-full transition ${agreement === t ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Fracción del producto final">
            <input className="w-full text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"
              placeholder="0000.00.00" value={fractionCode}
              onChange={e => set('fractionCode', e.target.value)} />
          </Field>
          <Field label="Método RVC">
            <select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white"
              value={form.rvcMethod} onChange={e => set('rvcMethod', e.target.value as 'transaction_value' | 'net_cost')}>
              <option value="transaction_value">Transaction value</option>
              <option value="net_cost">Net cost</option>
            </select>
          </Field>
        </div>

        {/* Regla aplicable */}
        {ruleLoading && (
          <div className="mb-4 flex items-center gap-2 text-[12px] text-slate-500">
            <RefreshCw className="w-3 h-3 animate-spin" /> Buscando regla específica...
          </div>
        )}
        {!ruleLoading && rule && (
          <div className="mb-4 rounded-xl bg-emerald-50/40 border border-emerald-100 p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Regla aplicable {rule.annex ? `· Anexo ${rule.annex}` : ''} · nivel {rule.matchType === 'exact' ? 'fracción' : rule.fractionCode.length >= 6 ? 'subpartida' : rule.fractionCode.length >= 4 ? 'partida' : 'capítulo (genérica)'}</p>
                <p className="text-[12px] text-slate-800 mt-1">{rule.description}</p>
                <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                  <Badge>tipo: {rule.ruleType}</Badge>
                  {rule.tariffShiftCode && <Badge>salto: {rule.tariffShiftCode}</Badge>}
                  {rule.rvcRequired != null && <Badge>RVC mín: {rule.rvcRequired}%{rule.rvcRequiredNetCost != null ? ` VT / ${rule.rvcRequiredNetCost}% CN` : ''}</Badge>}
                  {rule.rvcMethod && <Badge>método: {rule.rvcMethod}</Badge>}
                </div>
                {rule.notes && <p className="text-[11px] text-slate-500 mt-2 italic">{rule.notes}</p>}
              </div>
            </div>
          </div>
        )}
        {!ruleLoading && fractionCode && !rule && (
          <div className="mb-4 rounded-xl bg-amber-50/40 border border-amber-100 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-[12px] text-amber-700">Sin regla específica cargada para fracción {fractionCode} bajo {agreement}. Consulta el anexo de reglas específicas del tratado o pide a un administrador cargarla con fuente (pestaña Cobertura).</p>
            </div>
          </div>
        )}

        {/* Valor del producto + costos */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Field label="Valor del producto USD"><NumInput value={productValue} onChange={v => set('productValue', v)} /></Field>
          <Field label="Mano de obra USD"><NumInput value={form.laborCost} onChange={v => set('laborCost', v)} /></Field>
          <Field label="Overhead USD"><NumInput value={form.overheadCost} onChange={v => set('overheadCost', v)} /></Field>
          <Field label="Utilidad USD"><NumInput value={form.profit} onChange={v => set('profit', v)} placeholder="default 10% del producto" /></Field>
          <Field label="Empaque USD"><NumInput value={form.packagingCost} onChange={v => set('packagingCost', v)} /></Field>
          <Field label="Regalías USD"><NumInput value={form.royalties} onChange={v => set('royalties', v)} /></Field>
        </div>

        <MaterialsBlock
          title="Materiales ORIGINARIOS"
          subtitle="Producidos o suministrados en territorio del tratado (acumulación MX/US/CA)"
          tone="emerald"
          materials={materials.filter(m => m.originating)}
          totalLabel="Σ Originarios"
          total={originatingValue}
          onAdd={() => addMaterial(true)}
          onUpdate={updateMaterial}
          onRemove={removeMaterial}
        />

        <MaterialsBlock
          title="Materiales NO ORIGINARIOS (VNM)"
          subtitle="Importados de fuera del tratado — afectan el RVC"
          tone="rose"
          materials={materials.filter(m => !m.originating)}
          totalLabel="Σ No originarios (VNM)"
          total={nonOriginatingValue}
          onAdd={() => addMaterial(false)}
          onUpdate={updateMaterial}
          onRemove={removeMaterial}
        />

        {rule?.isAutomotive && (
          <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-violet-700"/>
              <p className="text-[13px] font-bold text-violet-900">Anexo 4-B Automotriz — {rule.autoCategory ?? 'parte'}</p>
            </div>
            <p className="text-[11px] text-violet-700 mb-3">
              Los vehículos y autopartes requieren además del RVC: <strong>Labor Value Content (LVC)</strong> y <strong>% acero/aluminio NA</strong>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Mano obra >$16 USD/hr"><NumInput value={form.highWageLaborCost} onChange={v => set('highWageLaborCost', v)} placeholder="LVC"/></Field>
              <Field label="Total acero+aluminio USD"><NumInput value={form.totalSteelAluminum} onChange={v => set('totalSteelAluminum', v)}/></Field>
              <Field label="Acero+aluminio NA USD"><NumInput value={form.naSteelAluminum} onChange={v => set('naSteelAluminum', v)}/></Field>
            </div>
            {rule.laborValueContent != null || rule.steelAluminumPercent != null
              ? <p className="text-[10px] text-violet-700 mt-2">LVC requerido: {rule.laborValueContent ?? 'no cargado en la regla'}% — Acero/aluminio NA requerido: {rule.steelAluminumPercent ?? 'no cargado en la regla'}%</p>
              : <p className="text-[10px] text-amber-700 mt-2">La regla cargada no trae umbrales LVC / acero-aluminio: falta cargarlos con fuente (Anexo 4-B, Apéndice automotriz).</p>}
          </div>
        )}

        <div className="flex gap-3 mt-4 items-center">
          <button onClick={handleAnalyze} disabled={loading || !fractionCode || productValue <= 0}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Calculator className="w-4 h-4" />}
            {loading ? 'Analizando...' : 'Analizar origen'}
          </button>
          <button onClick={() => { reset(); setResult(null); setRule(null) }} className="text-[12px] text-slate-500 hover:text-slate-800">Limpiar</button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <p className="text-[12px] text-rose-700">{error}</p>
          </div>
        )}
      </div>

      {result && <OriginResult result={result} />}
    </>
  )
}


// ═════════════════════════ Desde el BOM ═════════════════════════

const VEREDICTO: Record<DeterminacionBOM['veredicto'], { texto: string; clase: string }> = {
  cumple: { texto: 'Cumple el salto arancelario', clase: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  cumple_de_minimis: { texto: 'Cumple por de minimis (umbral pendiente de cotejo)', clase: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  no_cumple: { texto: 'No cumple con los datos actuales', clase: 'bg-rose-50 border-rose-200 text-rose-800' },
  no_determinable: { texto: 'No determinable: faltan datos', clase: 'bg-amber-50 border-amber-200 text-amber-800' },
  sin_regla: { texto: 'Sin regla específica cargada', clase: 'bg-amber-50 border-amber-200 text-amber-800' },
  sin_fraccion: { texto: 'El producto no tiene fracción', clase: 'bg-amber-50 border-amber-200 text-amber-800' },
}
const SALTO_ETIQUETA: Record<string, { t: string; c: string }> = {
  cumple: { t: 'cumple', c: 'bg-emerald-100 text-emerald-800' },
  no_cumple: { t: 'NO cumple', c: 'bg-rose-100 text-rose-800' },
  no_determinable: { t: 'no determinable', c: 'bg-amber-100 text-amber-800' },
  no_aplica: { t: 'originario', c: 'bg-sky-100 text-sky-800' },
}

function BomTab() {
  const [productos, setProductos] = useState<ProductoOrigen[]>([])
  const [q, setQ] = useState('')
  const [productId, setProductId] = useState('')
  const [valorTV, setValorTV] = useState(0)
  const [pct, setPct] = useState(10)
  const [valores, setValores] = useState<Record<string, number>>({})
  const [r, setR] = useState<DeterminacionBOM | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { origenApi.productos().then(x => setProductos(x.data)).catch(() => setProductos([])) }, [])

  async function determinar() {
    if (!productId) return
    setLoading(true); setError('')
    try {
      const x = await origenApi.determinarBOM({ productId, valorTransaccionUSD: valorTV || undefined, porcentajeDeMinimis: pct, valores })
      setR(x.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }

  const lista = productos.filter(p => !q || p.productCode.toLowerCase().includes(q.toLowerCase()) || p.description.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-4`}>
        <p className="text-[12px] text-slate-600">Elige un producto terminado del <Link to="/catalogo" className="text-emerald-700 underline">catálogo de partes</Link>. Cada componente del BOM se evalúa contra la regla específica (cambio de capítulo/partida/subpartida); los materiales de MX/US/CA cuentan como originarios (acumulación).</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Buscar producto"><input value={q} onChange={e => setQ(e.target.value)} placeholder="código o descripción" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
          <Field label="Producto terminado">
            <select value={productId} onChange={e => { setProductId(e.target.value); setR(null); setValores({}) }} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
              <option value="">—</option>
              {lista.map(p => <option key={p.id} value={p.id}>{p.productCode} · {p.description.slice(0, 40)} ({p.componentes} comp.{p.fractionCode ? '' : ' · sin fracción'})</option>)}
            </select>
          </Field>
          <Field label="Valor de transacción USD (de minimis)"><NumInput value={valorTV} onChange={setValorTV}/></Field>
          <Field label="Umbral de minimis % (default 10)"><NumInput value={pct} onChange={setPct}/></Field>
        </div>
        {productos.length === 0 && <p className="text-[11px] text-amber-700">No hay productos en el catálogo para el cliente activo. Crea la parte y su BOM en Catálogo de partes.</p>}
        <div className="flex gap-3 items-center">
          <button onClick={determinar} disabled={!productId || loading} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-2.5 rounded-full">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Boxes className="w-4 h-4"/>} Determinar desde el BOM
          </button>
          {error && <span className="text-[12px] text-rose-700">{error}</span>}
        </div>
      </div>

      {r && (
        <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-4`}>
          <div className={`rounded-xl border p-4 ${VEREDICTO[r.veredicto].clase}`}>
            <p className="text-[10px] uppercase tracking-wider opacity-70">{r.producto.productCode} · {r.producto.fractionCode ?? 'sin fracción'} · {r.tratado}</p>
            <p className="text-[18px] font-bold">{VEREDICTO[r.veredicto].texto}</p>
            <p className="text-[12px] mt-1">{r.motivo}</p>
            {r.regla && <p className="text-[11px] mt-2 opacity-80">Regla: {r.regla.description} {r.codigoSalto ? `· salto ${r.codigoSalto}` : ''}</p>}
            {r.veredicto === 'sin_regla' && <p className="text-[11px] mt-2">Ve a <button onClick={() => window.location.assign('/origen-tmec?tab=cobertura')} className="underline">Cobertura de reglas</button> para ver qué falta cargar.</p>}
          </div>

          {r.faltantes.length > 0 && (
            <div className="rounded-xl bg-amber-50/40 border border-amber-100 p-3">
              <p className="text-[12px] font-semibold text-amber-800 mb-1 flex items-center gap-1"><FileWarning className="w-3.5 h-3.5"/> Faltantes para dictaminar</p>
              <ul className="list-disc pl-5 text-[11px] text-slate-700 space-y-0.5">{r.faltantes.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}

          {r.salto && (
            <div>
              <p className="text-[12px] font-semibold text-slate-800 mb-2">Salto arancelario por material ({r.salto.codigo}) — {r.salto.resumen.cumplen} cumplen · {r.salto.resumen.noCumplen} no cumplen · {r.salto.resumen.noDeterminables} sin fracción · {r.salto.resumen.originarios} originarios</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1 pr-2">Material</th><th className="pr-2">Fracción</th><th className="pr-2">Origen</th><th className="pr-2">Valor USD</th><th className="pr-2">Salto</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {r.salto.porMaterial.map((m, i) => (
                      <tr key={i} className="border-b border-slate-100 align-top">
                        <td className="py-1.5 pr-2 font-medium">{m.material.productCode ?? ''} <span className="text-slate-500 font-normal">{m.material.descripcion}</span></td>
                        <td className="pr-2 font-mono">{m.material.fractionCode ?? <span className="text-amber-700">—</span>}</td>
                        <td className="pr-2 font-mono">{m.material.paisOrigen ?? <span className="text-amber-700">?</span>}</td>
                        <td className="pr-2">
                          {m.salto === 'no_aplica' ? <span className="text-slate-400">n/a</span> : (
                            <CampoNumerico step="0.01" className="w-20 text-[11px] font-mono border border-slate-200 rounded px-1 py-0.5" value={valores[m.material.productId ?? ''] ?? m.material.valorUSD ?? 0}
                              onValue={v => setValores(prev => ({ ...prev, [m.material.productId ?? '']: v }))}/>
                          )}
                        </td>
                        <td className="pr-2"><span className={`px-1.5 py-0.5 rounded font-semibold ${SALTO_ETIQUETA[m.salto]!.c}`}>{SALTO_ETIQUETA[m.salto]!.t}</span></td>
                        <td className="text-slate-600">{m.motivo} {m.enlaceCatalogo && <Link to={m.enlaceCatalogo} className="text-emerald-700 underline whitespace-nowrap">capturar en catálogo</Link>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Captura el valor USD de los materiales que fallan y vuelve a determinar para evaluar el de minimis.</p>
            </div>
          )}

          {r.deMinimis && (
            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 text-[11px] text-slate-700">
              <p className="font-semibold text-slate-800">De minimis — {r.deMinimis.aplica === true ? 'aplica' : r.deMinimis.aplica === false ? 'no aplica' : 'no determinable'}
                <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">cotejo {r.deMinimis.cotejo}</span></p>
              <p>{r.deMinimis.porcentajeCalculado != null ? `${r.deMinimis.porcentajeCalculado}% del valor de transacción` : '—'} · umbral {r.deMinimis.porcentajeUmbral}% · {r.deMinimis.fundamento}</p>
              <p className="text-amber-700">{r.deMinimis.aviso}</p>
              {r.deMinimis.excepcionesNoEvaluadas.map((x, i) => <p key={i} className="text-amber-700">{x}</p>)}
            </div>
          )}

          {r.automotriz.aplica && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-3 text-[11px]">
              <p className="font-semibold text-violet-900 mb-1">Anexo 4-B automotriz ({r.automotriz.categoria ?? 'parte'})</p>
              <p>LVC: {r.automotriz.lvc.calculado ?? '—'}% / requerido {r.automotriz.lvc.requerido ?? 'no cargado'}% → {r.automotriz.lvc.cumple == null ? 'sin evaluar' : r.automotriz.lvc.cumple ? 'cumple' : 'no cumple'} {r.automotriz.lvc.faltante && <span className="text-amber-700">· {r.automotriz.lvc.faltante}</span>}</p>
              <p>Acero/aluminio NA: {r.automotriz.aceroAluminio.calculado ?? '—'}% / requerido {r.automotriz.aceroAluminio.requerido ?? 'no cargado'}% → {r.automotriz.aceroAluminio.cumple == null ? 'sin evaluar' : r.automotriz.aceroAluminio.cumple ? 'cumple' : 'no cumple'} {r.automotriz.aceroAluminio.faltante && <span className="text-amber-700">· {r.automotriz.aceroAluminio.faltante}</span>}</p>
            </div>
          )}

          <p className="text-[11px] text-slate-500 italic">{r.acumulacion.nota}</p>
          <p className="text-[11px] text-slate-500 italic">{r.disclaimer}</p>
          {(r.veredicto === 'cumple' || r.veredicto === 'cumple_de_minimis') && (
            <CertificateButton fractionCode={r.producto.fractionCode ?? ''} productId={r.producto.id} />
          )}
        </div>
      )}
    </>
  )
}

// ═════════════════════════ Certificados de proveedores ═════════════════════════

const ESTADO_CERT: Record<string, string> = { solicitado: 'bg-sky-100 text-sky-800', recibido: 'bg-emerald-100 text-emerald-800', vencido: 'bg-rose-100 text-rose-800', rechazado: 'bg-slate-100 text-slate-700' }

function ProveedoresTab({ certificadoId }: { certificadoId: string | null }) {
  const [items, setItems] = useState<CertProveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [form, setForm] = useState({ proveedorNombre: '', proveedorPais: '', proveedorEmail: '', fractionCode: '', tratado: 'TMEC', vigenciaHasta: '' })
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try { setItems((await origenApi.certProveedores()).data) } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear() {
    setBusy(true); setError('')
    try {
      await origenApi.certProveedorCrear({ ...form, proveedorEmail: form.proveedorEmail || null, fractionCode: form.fractionCode || null, vigenciaHasta: form.vigenciaHasta || null })
      setForm({ proveedorNombre: '', proveedorPais: '', proveedorEmail: '', fractionCode: '', tratado: 'TMEC', vigenciaHasta: '' })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setBusy(false)
  }
  async function solicitar(id: string) {
    setBusy(true); setError(''); setAviso('')
    try {
      const r = (await origenApi.certProveedorSolicitar(id)).data
      setAviso(r.correoEnviado ? `Correo enviado. Enlace del portal: ${r.portalUrl}` : `${r.motivo}. Copia y envía el enlace: ${r.portalUrl}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setBusy(false)
  }
  async function eliminar(id: string) {
    if (!confirm('¿Eliminar el registro del certificado?')) return
    try { await origenApi.certProveedorEliminar(id); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }
  function copiar(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard?.writeText(url).then(() => setAviso(`Enlace copiado: ${url}`)).catch(() => setAviso(url))
  }

  return (
    <>
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-3`}>
        <p className="text-[12px] text-slate-600">Registra al proveedor y solicita su certificación de origen. El proveedor la sube por un enlace público sin cuenta; tú capturas o confirmas la vigencia y el sistema avisa a 60/30/7 días y al vencer.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Field label="Proveedor *"><input value={form.proveedorNombre} onChange={e => setForm({ ...form, proveedorNombre: e.target.value })} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
          <Field label="País *"><input value={form.proveedorPais} onChange={e => setForm({ ...form, proveedorPais: e.target.value.toUpperCase() })} placeholder="US" className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
          <Field label="Correo"><input value={form.proveedorEmail} onChange={e => setForm({ ...form, proveedorEmail: e.target.value })} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
          <Field label="Fracción"><input value={form.fractionCode} onChange={e => setForm({ ...form, fractionCode: e.target.value })} className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
          <Field label="Tratado">
            <select value={form.tratado} onChange={e => setForm({ ...form, tratado: e.target.value })} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
              {['TMEC', 'TLCUEM', 'CPTPP', 'ALADI'].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Vigente hasta (si ya lo tienes)"><input type="date" value={form.vigenciaHasta} onChange={e => setForm({ ...form, vigenciaHasta: e.target.value })} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={crear} disabled={busy || !form.proveedorNombre || !form.proveedorPais} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[12px] font-semibold px-4 py-2 rounded-full"><Plus className="w-3.5 h-3.5"/> Registrar</button>
          <button onClick={async () => { const r = await origenApi.certProveedoresProcesarVencimientos(); setAviso(`Vencimientos revisados: ${r.data.vencidos} vencidos, ${r.data.alertas} alertas nuevas`); load() }} className="text-[11px] text-slate-600 hover:text-slate-900">Revisar vencimientos ahora</button>
          {error && <span className="text-[12px] text-rose-700">{error}</span>}
        </div>
        {aviso && <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 break-all">{aviso}</p>}
      </div>

      <div className={`${GLASS} rounded-2xl p-4`}>
        {loading ? <p className="text-[12px] text-slate-500">Cargando…</p> : items.length === 0 ? (
          <p className="text-[12px] text-slate-500 text-center py-4">Aún no hay certificados de proveedores registrados para el cliente activo.</p>
        ) : (
          <div className="space-y-1.5">
            {items.map(c => (
              <div key={c.id} className={`rounded-xl border p-3 ${certificadoId === c.id ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-white/60'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ESTADO_CERT[c.estado] ?? ''}`}>{c.estado.toUpperCase()}</span>
                  <span className="text-[12px] font-semibold text-slate-900">{c.proveedorNombre}</span>
                  <span className="text-[10px] font-mono text-slate-500">{c.proveedorPais} · {c.tratado}{c.fractionCode ? ` · ${c.fractionCode}` : ''}</span>
                  <span className="ml-auto text-[11px] text-slate-600">
                    {c.vigenciaHasta ? `vigente hasta ${c.vigenciaHasta.slice(0, 10)}${c.diasParaVencer != null ? ` (${c.diasParaVencer < 0 ? 'vencido' : `${c.diasParaVencer} días`})` : ''}` : 'sin vigencia capturada'}
                  </span>
                </div>
                <div className="flex gap-3 mt-2 text-[11px] items-center flex-wrap">
                  <button onClick={() => solicitar(c.id)} disabled={busy} className="flex items-center gap-1 text-emerald-700 hover:underline"><Send className="w-3 h-3"/> {c.tokenSolicitud ? 'Reenviar solicitud' : 'Solicitar al proveedor'}</button>
                  {c.portalPath && <button onClick={() => copiar(c.portalPath!)} className="flex items-center gap-1 text-slate-700 hover:underline"><Copy className="w-3 h-3"/> Copiar enlace del portal</button>}
                  {c.portalPath && <a href={c.portalPath} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-slate-700 hover:underline"><ExternalLink className="w-3 h-3"/> Abrir portal</a>}
                  {c.documentId && <span className="text-slate-500">PDF recibido {c.recibidoAt?.slice(0, 10)}</span>}
                  <button onClick={() => eliminar(c.id)} className="ml-auto text-rose-600 hover:underline flex items-center gap-1"><Trash2 className="w-3 h-3"/> Eliminar</button>
                </div>
                {c.notas && <p className="text-[10px] text-slate-500 mt-1 italic">{c.notas}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ═════════════════════════ Cobertura de reglas ═════════════════════════

function CoberturaTab() {
  const [tratado, setTratado] = useState('TMEC')
  const [fracciones, setFracciones] = useState('8544.30, 8703.23, 7318.15.99')
  const [r, setR] = useState<ReporteCobertura | null>(null)
  const [loading, setLoading] = useState(false)
  const [rep, setRep] = useState<ReporteImport | null>(null)
  const [dryRun, setDryRun] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try { setR((await origenApi.cobertura(tratado, fracciones.split(',').map(s => s.trim()).filter(Boolean))).data) } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }
  useEffect(() => { load() }, [tratado]) // eslint-disable-line react-hooks/exhaustive-deps

  async function importar(f: File) {
    setError('')
    try {
      const b64 = await archivoABase64(f)
      setRep((await origenApi.importarReglas({ archivoBase64: b64, nombreArchivo: f.name, dryRun })).data)
      if (!dryRun) load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error (solo SUPERADMIN puede importar)') }
  }

  return (
    <>
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-3`}>
        <p className="text-[12px] text-slate-600">Qué capítulos y partidas tienen regla específica de producto cargada y cuáles no. Sin regla cargada el sistema NO dictamina: se carga con fuente oficial desde la plantilla.</p>
        <div className="flex gap-2 flex-wrap items-end">
          <Field label="Tratado">
            <select value={tratado} onChange={e => setTratado(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">{['TMEC', 'TLCUEM', 'CPTPP'].map(t => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Consultar fracciones (coma)"><input value={fracciones} onChange={e => setFracciones(e.target.value)} className="w-72 text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
          <button onClick={load} className="text-[11px] bg-slate-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">{loading ? <RefreshCw className="w-3 h-3 animate-spin"/> : <ListChecks className="w-3 h-3"/>} Consultar</button>
          {error && <span className="text-[12px] text-rose-700">{error}</span>}
        </div>
        {r && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <Stat label="Reglas cargadas" v={r.resumen.totalReglas}/>
              <Stat label="Capítulos con regla" v={`${r.resumen.capitulosConRegla} / 97`}/>
              <Stat label="Con fuente en notas" v={r.cotejo.reglasConFuente}/>
              <Stat label="Sin fuente (pendiente de cotejo)" v={r.cotejo.reglasSinFuente} warn/>
            </div>
            <p className="text-[10px] text-amber-700">{r.cotejo.nota}</p>
            <div className="space-y-1">
              {r.consultas.map(c => (
                <div key={c.fraccion} className={`text-[11px] rounded-lg border px-3 py-1.5 ${c.nivel === 'sin_regla' ? 'border-amber-200 bg-amber-50/50' : c.nivel === 'capitulo' ? 'border-amber-100 bg-white/60' : 'border-emerald-200 bg-emerald-50/40'}`}>
                  <span className="font-mono font-semibold">{c.fraccion}</span> — {c.mensaje} {c.regla && <span className="text-slate-500">({c.regla.ruleType}{c.regla.tariffShiftCode ? ` · ${c.regla.tariffShiftCode}` : ''})</span>}
                </div>
              ))}
            </div>
            <details className="text-[11px]">
              <summary className="cursor-pointer text-slate-700">Capítulos sin regla ({r.resumen.capitulosSinRegla.length})</summary>
              <p className="font-mono text-slate-600 mt-1 break-words">{r.resumen.capitulosSinRegla.join(' ')}</p>
            </details>
            <details className="text-[11px]">
              <summary className="cursor-pointer text-slate-700">Detalle por capítulo con regla ({r.resumen.capitulos.length})</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-1">
                {r.resumen.capitulos.map(c => <div key={c.capitulo} className="rounded border border-slate-200 bg-white/60 px-2 py-1"><span className="font-mono font-semibold">{c.capitulo}</span> · {c.reglas} regla(s) · cap {c.niveles.capitulo} / part {c.niveles.partida} / subp {c.niveles.subpartida} / frac {c.niveles.fraccion}</div>)}
              </div>
            </details>
          </>
        )}
      </div>

      <div className={`${GLASS} rounded-2xl p-4 space-y-2`}>
        <p className="text-[12px] font-semibold text-slate-800 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5"/> Importar reglas específicas (Excel/CSV, solo administrador)</p>
        <p className="text-[11px] text-slate-600">Columnas: fracción o prefijo, matchType, tratado, ruleType, tariffShiftCode (CC/CTH/CTSH), rvcRequired, método, anexo, notas, <strong>fuente</strong>. Sin fuente http(s) la regla entra como “pendiente de cotejo”.</p>
        <div className="flex gap-3 items-center flex-wrap text-[11px]">
          <a href={origenApi.plantillaReglasURL} className="flex items-center gap-1 text-emerald-700 hover:underline" download><Download className="w-3 h-3"/> Descargar plantilla</a>
          <label className="flex items-center gap-1"><input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}/> Solo validar (no escribir)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }} className="text-[11px]"/>
        </div>
        {rep && <ReporteImportView rep={rep}/>}
      </div>
    </>
  )
}

function Stat({ label, v, warn }: { label: string; v: number | string; warn?: boolean }) {
  return <div className={`rounded-lg border p-2 ${warn ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white/60'}`}><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="text-[16px] font-bold">{v}</p></div>
}

export function ReporteImportView({ rep }: { rep: ReporteImport }) {
  return (
    <div className="text-[11px] space-y-1">
      <p className="font-semibold">{rep.dryRun ? 'Validación (sin escribir)' : 'Importación'}: {rep.total} filas · {rep.validas} válidas · {rep.invalidas} rechazadas · {rep.creadas} creadas · {rep.actualizadas} actualizadas · {rep.cotejadas} con fuente · {rep.pendientesCotejo} pendientes de cotejo</p>
      <div className="max-h-56 overflow-y-auto space-y-0.5">
        {rep.filas.map(f => (
          <div key={f.fila} className={`rounded px-2 py-0.5 ${f.ok ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            fila {f.fila} · {f.fractionCode ?? f.clave ?? '—'} · {f.accion} · cotejo {f.cotejo}{f.errores.length > 0 ? ` · ${f.errores.join('; ')}` : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function OriginResult({ result }: { result: OriginAnalysisResult }) {
  const palette = result.qualifies
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-rose-50 border-rose-200 text-rose-800'

  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-4`}>
      <div className="flex items-start gap-3">
        {result.qualifies
          ? <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-1" />
          : <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-1" />}
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{result.agreement}</p>
          <p className="text-[20px] font-bold text-slate-900">
            {result.qualifies ? '✅ Califica como originario' : '❌ No califica con los datos actuales'}
          </p>
          <p className="text-[12px] text-slate-600 mt-1">{result.reason}</p>
        </div>
      </div>

      {/* RVC por 4 métodos */}
      {result.rvc && (
        <div className={`rounded-xl border p-4 ${palette}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-2">RVC calculado por método (requerido ≥ {result.rvcRequired ?? '—'}%)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['transactionValue', 'netCost', 'buildUp', 'buildDown'] as const).map(method => {
              const value = result.rvc[method]
              const labels: Record<typeof method, string> = {
                transactionValue: 'Transaction Value',
                netCost: 'Net Cost',
                buildUp: 'Build-Up',
                buildDown: 'Build-Down',
              }
              // Umbral por método (T-MEC típico: 60% VT / 50% CN) — sin esto
              // el panel marcaba "no cumple" un costo neto de 52% que sí cumple.
              const required = method === 'netCost' && result.rule?.rvcRequiredNetCost != null
                ? result.rule.rvcRequiredNetCost
                : result.rvcRequired
              const meets = value != null && required != null && value >= required
              return (
                <div key={method} className={`rounded-lg p-3 bg-white/60 border ${meets ? 'border-emerald-300' : 'border-slate-200'}`}>
                  <p className="text-[10px] uppercase opacity-70">{labels[method]}</p>
                  <p className={`text-[22px] font-bold ${meets ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {value != null ? `${value}%` : '—'}
                  </p>
                  {meets && <p className="text-[9px] text-emerald-600 font-bold">✓ CUMPLE</p>}
                </div>
              )
            })}
          </div>
          <p className="font-mono text-[11px] mt-2 opacity-70 break-words">{result.formula}</p>
          {result.netCost != null && (
            <p className="text-[11px] mt-1 opacity-70">Net cost calculado = ${result.netCost.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD</p>
          )}
        </div>
      )}

      {/* Anexo 4-B: LVC + SA */}
      {(result.laborValueContentPct != null || result.steelAluminumNAPct != null) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
          <p className="text-[12px] font-bold text-violet-900 mb-2 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5"/> Requisitos automotrices Anexo 4-B
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
            {result.laborValueContentPct != null && (
              <div className={`rounded-lg p-3 border ${result.lvcCompliance ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className="text-[10px] uppercase opacity-70">LVC (Labor Value Content)</p>
                <p className="text-[20px] font-bold">{result.laborValueContentPct}%</p>
                <p className="text-[10px] opacity-70">Requerido ≥ {result.lvcRequired}% — {result.lvcCompliance ? '✓ Cumple' : '✗ No cumple'}</p>
              </div>
            )}
            {result.steelAluminumNAPct != null && (
              <div className={`rounded-lg p-3 border ${result.saCompliance ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className="text-[10px] uppercase opacity-70">% Acero/aluminio Norteamericano</p>
                <p className="text-[20px] font-bold">{result.steelAluminumNAPct}%</p>
                <p className="text-[10px] opacity-70">Requerido ≥ {result.saRequired}% — {result.saCompliance ? '✓ Cumple' : '✗ No cumple'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botón generar certificado si cumple */}
      {result.qualifies && result.analysisId && (
        <CertificateButton analysisId={result.analysisId ?? undefined} fractionCode={result.fractionCode}/>
      )}

      {/* Recomendaciones */}
      {result.recommendations.length > 0 && (
        <div className="rounded-xl bg-amber-50/40 border border-amber-100 p-4">
          <p className="text-[12px] font-semibold text-amber-800 mb-2 flex items-center gap-2">
            <FileWarning className="w-4 h-4" /> Recomendaciones
          </p>
          <ul className="space-y-1">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="text-[12px] text-slate-700 flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">→</span>
                <span>{rec.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
        <p className="text-[11px] text-slate-600 italic">{result.disclaimer}</p>
      </div>
    </div>
  )
}

function MaterialsBlock(props: {
  title: string
  subtitle: string
  tone: 'emerald' | 'rose'
  materials: Material[]
  totalLabel: string
  total: number
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<Material>) => void
  onRemove: (id: string) => void
}) {
  const accent = props.tone === 'emerald' ? 'text-emerald-600 hover:text-emerald-700' : 'text-rose-600 hover:text-rose-700'
  const totalAccent = props.tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700'
  return (
    <div className="mb-4 rounded-xl border border-slate-200/70 bg-white/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[12px] font-semibold text-slate-700">{props.title}</p>
          <p className="text-[10px] text-slate-500">{props.subtitle}</p>
        </div>
        <button onClick={props.onAdd} className={`text-[11px] font-medium ${accent} flex items-center gap-1`}>
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>
      <div className="space-y-1.5">
        {props.materials.map(m => (
          <div key={m.id} className="flex gap-2 items-center">
            <input className="flex-1 text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"
              placeholder="Descripción del material"
              value={m.description}
              onChange={e => props.onUpdate(m.id, { description: e.target.value })} />
            {/* D4 (24-ago): campo numérico compartido — acepta 0.02, sin residuos */}
            <CampoNumerico step="0.01" className="w-32 text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"
              placeholder="USD"
              value={m.valueUSD}
              onValue={v => props.onUpdate(m.id, { valueUSD: v })} />
            <button onClick={() => props.onRemove(m.id)} className="text-rose-500 hover:text-rose-700">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {props.materials.length === 0 && (
          <p className="text-[11px] text-slate-400 italic py-1">Sin materiales en esta categoría</p>
        )}
      </div>
      <div className={`mt-2 pt-2 border-t border-slate-100 flex justify-between text-[12px] font-semibold ${totalAccent}`}>
        <span>{props.totalLabel}</span>
        <span className="font-mono">${props.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
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

// D4 (24-ago): NumInput tenía la misma clase rota (`value={value || ''}` +
// parseFloat por tecla — "0.02" → "2"). Ahora es un alias del campo numérico
// compartido con el estilo local de esta página.
function NumInput({ value, onChange, placeholder }: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <CampoNumerico step="0.01" className="w-full text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"
      placeholder={placeholder ?? '0.00'} value={value} onValue={onChange} />
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono">{children}</span>
}


// ═════════════════════════ Certificado con los 9 elementos (Anexo 5-A) ═════════════════════════

function CertificateButton({ analysisId, fractionCode, productId }: { analysisId?: string; fractionCode: string; productId?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full transition">
        <FileText className="w-4 h-4"/> Certificación de origen T-MEC (9 elementos)
      </button>
      {open && <CertificateModal analysisId={analysisId} productId={productId} fractionCode={fractionCode} onClose={() => setOpen(false)}/>}
    </>
  )
}

type FormCert = OriginCertificateInput & { certificadorTipo: 'exportador' | 'productor' | 'importador'; certificadorTelefono: string; certificadorCorreo: string; certificadorDireccion: string; numeroFactura: string }

function CertificateModal({ analysisId, productId, fractionCode, onClose }: { analysisId?: string; productId?: string; fractionCode: string; onClose: () => void }) {
  const [form, setForm] = useState<FormCert>({
    fractionCode, productDescription: '', exporterName: '', exporterAddress: '', exporterTaxId: '', importerName: '', importerAddress: '', importerTaxId: '',
    producerName: '', producerAddress: '', producerTaxId: '', originCountry: 'MX', preferenceCriterion: 'C', blanketPeriodFrom: '', blanketPeriodTo: '',
    signedBy: '', signedByRole: 'Representante legal', originAnalysisId: analysisId,
    certificadorTipo: 'exportador', certificadorTelefono: '', certificadorCorreo: '', certificadorDireccion: '', numeroFactura: '',
  })
  const [pre, setPre] = useState<CertificadoPrellenado | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: string; certificateNumber: string } | null>(null)

  useEffect(() => {
    origenApi.prellenarCertificado({ analysisId, productId }).then(r => {
      const s = r.data.sugerido
      setPre(r.data)
      setForm(f => ({
        ...f,
        fractionCode: s.fractionCode || f.fractionCode, productDescription: s.productDescription || f.productDescription,
        exporterName: s.exporterName ?? f.exporterName, exporterTaxId: s.exporterTaxId ?? f.exporterTaxId,
        importerName: s.importerName ?? f.importerName, importerTaxId: s.importerTaxId ?? f.importerTaxId, producerName: s.producerName ?? f.producerName,
        preferenceCriterion: s.preferenceCriterion ?? f.preferenceCriterion,
        blanketPeriodFrom: s.blanketPeriodFrom ? s.blanketPeriodFrom.slice(0, 10) : '', blanketPeriodTo: s.blanketPeriodTo ? s.blanketPeriodTo.slice(0, 10) : '',
        signedBy: s.signedBy ?? f.signedBy, signedByRole: s.signedByRole ?? f.signedByRole, originAnalysisId: s.originAnalysisId ?? f.originAnalysisId,
        certificadorTipo: s.certificador?.tipo ?? 'exportador', certificadorCorreo: s.certificador?.correo ?? '', certificadorTelefono: s.certificador?.telefono ?? '',
      }))
    }).catch(() => setPre(null))
  }, [analysisId, productId])

  async function generate() {
    setBusy(true); setError('')
    try {
      const { certificadorTipo, certificadorTelefono, certificadorCorreo, certificadorDireccion, numeroFactura, ...base } = form
      const payload = {
        ...base,
        blanketPeriodFrom: base.blanketPeriodFrom || undefined, blanketPeriodTo: base.blanketPeriodTo || undefined,
        certificador: { tipo: certificadorTipo, nombre: base.signedBy, cargo: base.signedByRole, direccion: certificadorDireccion || undefined, telefono: certificadorTelefono || undefined, correo: certificadorCorreo || undefined },
        numeroFactura: numeroFactura || undefined,
      }
      const r = await api.originCertificateCreate(payload as OriginCertificateInput)
      setCreated({ id: r.data.id, certificateNumber: r.data.certificateNumber })
    } catch (e) { setError(e instanceof Error ? e.message : 'Error generando certificado') }
    setBusy(false)
  }

  function openPDF() {
    if (created) window.open(api.originCertificatePdfURL(created.id), '_blank')
  }
  const inp = 'w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5'
  const mono = `${inp} font-mono`

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100">
          <p className="text-[15px] font-bold text-slate-900">Certificación de origen T-MEC — 9 elementos mínimos (Anexo 5-A)</p>
          <p className="text-[11px] text-slate-500">Formato libre: prellenado desde el análisis, el producto y el cliente activo. Lo que falte, captúralo; nada se inventa.</p>
        </div>
        {created ? (
          <div className="p-5 space-y-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <Award className="w-8 h-8 text-emerald-600 mx-auto mb-1"/>
              <p className="text-[13px] font-bold text-emerald-900">Certificación emitida</p>
              <p className="font-mono text-[11px] text-emerald-700 mt-1">Folio {created.certificateNumber}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={openPDF} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                <FileText className="w-4 h-4"/> Abrir vista imprimible (PDF)
              </button>
              <button onClick={onClose} className="px-4 text-[12px] text-slate-500 hover:text-slate-800">Cerrar</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {pre && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-800 mb-1">Checklist de los 9 elementos</p>
                <ol className="text-[11px] text-slate-700 space-y-0.5">
                  {pre.elementos.map(e => <li key={e.n} className="flex gap-2"><span className={`font-bold ${e.completo ? 'text-emerald-600' : 'text-amber-600'}`}>{e.completo ? '✓' : '○'} {e.n}.</span><span>{e.nombre}{e.valor ? <span className="text-slate-500"> — {e.valor}</span> : <span className="text-amber-700"> — captúralo abajo</span>}</span></li>)}
                </ol>
                <p className="text-[10px] text-slate-500 mt-1">{pre.fundamento}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Field label="1. Quién certifica *">
                <select value={form.certificadorTipo} onChange={e => setForm({ ...form, certificadorTipo: e.target.value as FormCert['certificadorTipo'] })} className={`${inp} bg-white`}>
                  <option value="exportador">Exportador</option><option value="productor">Productor</option><option value="importador">Importador</option>
                </select>
              </Field>
              <Field label="2. Certificador: correo · teléfono"><div className="flex gap-1"><input value={form.certificadorCorreo} onChange={e => setForm({ ...form, certificadorCorreo: e.target.value })} placeholder="correo" className={inp}/><input value={form.certificadorTelefono} onChange={e => setForm({ ...form, certificadorTelefono: e.target.value })} placeholder="tel" className={`${inp} w-28`}/></div></Field>
              <Field label="3. Exportador *"><input value={form.exporterName} onChange={e => setForm({ ...form, exporterName: e.target.value })} className={inp}/></Field>
              <Field label="RFC/Tax ID Exportador"><input value={form.exporterTaxId} onChange={e => setForm({ ...form, exporterTaxId: e.target.value })} className={mono}/></Field>
              <Field label="Dirección exportador (incl. país)"><input value={form.exporterAddress} onChange={e => setForm({ ...form, exporterAddress: e.target.value })} className={inp}/></Field>
              <Field label="4. Productor"><input value={form.producerName} onChange={e => setForm({ ...form, producerName: e.target.value })} className={inp}/></Field>
              <Field label="5. Importador"><input value={form.importerName} onChange={e => setForm({ ...form, importerName: e.target.value })} className={inp}/></Field>
              <Field label="RFC/Tax ID Importador"><input value={form.importerTaxId} onChange={e => setForm({ ...form, importerTaxId: e.target.value })} className={mono}/></Field>
              <Field label="6. Fracción (SA 6 dígitos en el certificado) *"><input value={form.fractionCode} onChange={e => setForm({ ...form, fractionCode: e.target.value })} className={mono}/></Field>
              <Field label="Descripción de la mercancía *"><input value={form.productDescription} onChange={e => setForm({ ...form, productDescription: e.target.value })} className={inp}/></Field>
              <Field label="Número de factura (embarque único)"><input value={form.numeroFactura} onChange={e => setForm({ ...form, numeroFactura: e.target.value })} className={mono}/></Field>
              <Field label="País origen *">
                <select value={form.originCountry} onChange={e => setForm({ ...form, originCountry: e.target.value as 'MX' | 'US' | 'CA' })} className={`${inp} bg-white`}>
                  <option value="MX">MX — México</option><option value="US">US — Estados Unidos</option><option value="CA">CA — Canadá</option>
                </select>
              </Field>
              <Field label="7. Criterio de origen (Art. 4.2) *">
                <select value={form.preferenceCriterion} onChange={e => setForm({ ...form, preferenceCriterion: e.target.value as 'A' | 'B' | 'C' | 'D' | 'E' })} className={`${inp} bg-white`}>
                  <option value="A">A — Totalmente obtenida</option>
                  <option value="B">B — Exclusivamente materiales originarios</option>
                  <option value="C">C — Materiales no originarios que cumplen Anexo 4-B</option>
                  <option value="D">D — Sin cambio arancelario, VCR ≥ 60% VT</option>
                  <option value="E">E — Excepción</option>
                </select>
              </Field>
              <Field label="8. Periodo global (desde / hasta, máx. 12 meses)"><div className="flex gap-1"><input type="date" value={form.blanketPeriodFrom} onChange={e => setForm({ ...form, blanketPeriodFrom: e.target.value })} className={inp}/><input type="date" value={form.blanketPeriodTo} onChange={e => setForm({ ...form, blanketPeriodTo: e.target.value })} className={inp}/></div></Field>
              <Field label="9. Firmante *"><input value={form.signedBy} onChange={e => setForm({ ...form, signedBy: e.target.value })} className={inp}/></Field>
              <Field label="Cargo *"><input value={form.signedByRole} onChange={e => setForm({ ...form, signedByRole: e.target.value })} className={inp}/></Field>
            </div>
            {error && <p className="text-[12px] text-rose-700">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button onClick={generate} disabled={busy || !form.productDescription || !form.exporterName || !form.signedBy || !form.fractionCode}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Award className="w-4 h-4"/>}
                {busy ? 'Generando...' : 'Emitir certificación con folio'}
              </button>
              <button onClick={onClose} className="px-4 text-[12px] text-slate-500 hover:text-slate-800">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
