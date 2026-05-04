import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { MultiQuoteInput, MultiQuoteItemInput, MultiQuoteResult, ScenarioComparison, ScenarioVariant } from '../lib/api'
import { Calculator, DollarSign, AlertCircle, AlertTriangle, ShieldCheck, FileWarning, Plus, Trash2, GitCompare } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { ROITile } from '../components/ROIBanner'

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

function emptyItem(): MultiQuoteItemInput {
  return { fractionCode: '', countryOfOrigin: 'CN', quantity: 1, unitValueUSD: 0, freightUSD: 0, insuranceUSD: 0 }
}

export function QuoterPage() {
  const [meta, setMeta] = useState({ name: '', client: '', incoterm: 'CIF', currency: 'USD', destination: 'Aduana de Nuevo Laredo' })
  const [items, setItems] = useState<MultiQuoteItemInput[]>([emptyItem()])
  const [dispatch, setDispatch] = useState({
    honorariosAgente: 0, prevalidacion: 321, almacenaje: 0, estiba: 0, fleteInterno: 0,
  })
  const [tcMode, setTcMode] = useState<'current' | 'average30' | 'historical'>('current')
  const [tcDate, setTcDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [tcOverride, setTcOverride] = useState<string>('')

  const [result, setResult] = useState<MultiQuoteResult | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showScenarios, setShowScenarios] = useState(false)

  function buildInput(): MultiQuoteInput {
    const exchangeRate = tcOverride ? parseFloat(tcOverride) : undefined
    return {
      name: meta.name || undefined,
      client: meta.client || undefined,
      destination: meta.destination,
      incoterm: meta.incoterm,
      currency: meta.currency,
      exchangeRateMode: tcMode === 'historical' ? tcDate : tcMode,
      exchangeRate,
      items: items.filter(i => i.fractionCode && i.quantity > 0),
      dispatch,
    }
  }

  async function handleQuote() {
    if (items.filter(i => i.fractionCode && i.quantity > 0).length === 0) return
    setLoading(true); setError(''); setResult(null); setScenarios(null)
    try {
      const r = await api.quoteMulti(buildInput())
      setResult(r.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al cotizar') }
    setLoading(false)
  }

  async function handleScenarios() {
    if (!result) return
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

  function updateItem(idx: number, patch: Partial<MultiQuoteItemInput>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function addItem() { setItems(prev => [...prev, emptyItem()]) }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Cotizador de Importación</h1>
        </div>

        <div className="mb-4"><ROITile moduleKey="quoter" /></div>

        {/* Meta operación */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Field label="Nombre de operación"><input className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2" value={meta.name} onChange={e => setMeta({...meta, name: e.target.value})} placeholder="Embarque Q1 lote A"/></Field>
          <Field label="Cliente"><input className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2" value={meta.client} onChange={e => setMeta({...meta, client: e.target.value})}/></Field>
          <Field label="Incoterm"><select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white" value={meta.incoterm} onChange={e => setMeta({...meta, incoterm: e.target.value})}>{INCOTERMS.map(i => <option key={i}>{i}</option>)}</select></Field>
          <Field label="Moneda"><select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white" value={meta.currency} onChange={e => setMeta({...meta, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        </div>

        {/* Selector TC */}
        <div className="mb-4 rounded-xl bg-slate-50/60 p-3">
          <p className="text-[11px] font-semibold text-slate-700 mb-2">Tipo de cambio</p>
          <div className="flex flex-wrap gap-2">
            <TCRadio val="current" cur={tcMode} onChange={setTcMode} label="TC del día" />
            <TCRadio val="average30" cur={tcMode} onChange={setTcMode} label="Promedio últimos 30d" />
            <TCRadio val="historical" cur={tcMode} onChange={setTcMode} label="Fecha específica" />
            {tcMode === 'historical' && (
              <input type="date" value={tcDate} onChange={e => setTcDate(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
            )}
            <input type="number" step="0.0001" placeholder="Override manual TC" value={tcOverride} onChange={e => setTcOverride(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 w-40 ml-auto"/>
          </div>
        </div>

        {/* Partidas */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-slate-700">Partidas ({items.length})</p>
            <button onClick={addItem} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"><Plus className="w-3 h-3"/> Agregar partida</button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200/70 bg-white/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Partida {idx + 1}</span>
                  {items.length > 1 && <button onClick={() => removeItem(idx)} className="text-rose-500 hover:text-rose-700 ml-auto"><Trash2 className="w-3.5 h-3.5"/></button>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <Field label="Fracción"><input className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5" placeholder="7318.15.01" value={it.fractionCode} onChange={e => updateItem(idx, { fractionCode: e.target.value })}/></Field>
                  <Field label="Descripción"><input className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.description ?? ''} onChange={e => updateItem(idx, { description: e.target.value })}/></Field>
                  <Field label="País origen"><input className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" placeholder="China" value={it.countryOfOrigin} onChange={e => updateItem(idx, { countryOfOrigin: e.target.value })}/></Field>
                  <Field label="Cantidad"><input type="number" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.quantity} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}/></Field>
                  <Field label="Valor unit. USD"><input type="number" step="0.01" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.unitValueUSD} onChange={e => updateItem(idx, { unitValueUSD: parseFloat(e.target.value) || 0 })}/></Field>
                  <Field label="Total USD"><div className="text-[12px] py-1.5 px-2 text-slate-700 font-semibold">${(it.quantity * it.unitValueUSD).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></Field>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                  <Field label="Flete USD"><input type="number" step="0.01" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.freightUSD ?? 0} onChange={e => updateItem(idx, { freightUSD: parseFloat(e.target.value) || 0 })}/></Field>
                  <Field label="Seguro USD"><input type="number" step="0.01" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.insuranceUSD ?? 0} onChange={e => updateItem(idx, { insuranceUSD: parseFloat(e.target.value) || 0 })}/></Field>
                  <Field label="Override IGI %"><input type="number" step="0.1" placeholder="auto" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={it.igiRateOverride ?? ''} onChange={e => updateItem(idx, { igiRateOverride: e.target.value === '' ? undefined : parseFloat(e.target.value) })}/></Field>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Costos de despacho aduanero */}
        <details className="mb-4 rounded-xl bg-amber-50/40 border border-amber-100 p-3" open>
          <summary className="text-[12px] font-semibold text-amber-800 cursor-pointer">Costos de despacho aduanero (editables)</summary>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            <Field label="Honorarios agente"><input type="number" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.honorariosAgente} onChange={e => setDispatch({...dispatch, honorariosAgente: parseFloat(e.target.value) || 0})}/></Field>
            <Field label="Prevalidación"><input type="number" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.prevalidacion} onChange={e => setDispatch({...dispatch, prevalidacion: parseFloat(e.target.value) || 0})}/></Field>
            <Field label="Almacenaje"><input type="number" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.almacenaje} onChange={e => setDispatch({...dispatch, almacenaje: parseFloat(e.target.value) || 0})}/></Field>
            <Field label="Estiba"><input type="number" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.estiba} onChange={e => setDispatch({...dispatch, estiba: parseFloat(e.target.value) || 0})}/></Field>
            <Field label="Flete interno"><input type="number" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5" value={dispatch.fleteInterno} onChange={e => setDispatch({...dispatch, fleteInterno: parseFloat(e.target.value) || 0})}/></Field>
          </div>
        </details>

        <div className="flex gap-2">
          <button onClick={handleQuote} disabled={loading || items.filter(i => i.fractionCode && i.quantity > 0).length === 0}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <DollarSign className="w-4 h-4"/>}
            {loading ? 'Calculando...' : 'Cotizar'}
          </button>
          {result && (
            <button onClick={handleScenarios} disabled={loading} className="flex items-center gap-2 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 text-[13px] font-semibold px-6 py-3 rounded-full">
              <GitCompare className="w-4 h-4"/> Comparar escenarios
            </button>
          )}
        </div>
        {error && <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100"><AlertCircle className="w-4 h-4 text-rose-500"/><p className="text-[12px] text-rose-700">{error}</p></div>}
      </div>

      {result && <QuoteResult result={result} />}
      {showScenarios && scenarios && <ScenarioComparison data={scenarios} onClose={() => setShowScenarios(false)} />}
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

function QuoteResult({ result }: { result: MultiQuoteResult }) {
  const itemsWithAntidumping = result.items.filter(i => i.hasAntidumping)
  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-5`}>
      {/* Banner cuotas compensatorias destacado */}
      {itemsWithAntidumping.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-rose-50 border border-rose-200 p-4">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5"/>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-rose-700">⚠️ {itemsWithAntidumping.length} partida(s) con cuota compensatoria activa</p>
            <ul className="mt-2 space-y-1">
              {itemsWithAntidumping.map((it, i) => (
                <li key={i} className="text-[12px] text-rose-700">
                  Partida {it.numeroPartida}: <span className="font-mono">{formatFraction(it.fractionCode)}</span> + {it.countryOfOrigin} → {it.countervailingRate}% ({it.antidumpingDecree})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Header totales */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Costo total con despacho</p>
          <p className="text-[36px] font-bold text-slate-900">${mxn(result.totals.totalAll)} <span className="text-[16px] text-slate-500">MXN</span></p>
          <p className="text-[12px] text-emerald-600 mt-1">Landed cost: ${mxn(result.totals.totalLandedCost)} · Despacho: ${mxn(result.totals.totalDispatch)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-500">Tipo de cambio</p>
          <p className="font-mono text-[16px] font-bold text-slate-900">${result.exchangeRate.toFixed(4)}</p>
          <p className="text-[10px] text-slate-500">{result.exchangeRateMode} · {shortDate(result.exchangeRateDate)}</p>
        </div>
      </div>

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
                  <td className="py-2 text-right font-mono">${mxn(it.dta)}</td>
                  <td className={`py-2 text-right font-mono ${it.hasAntidumping ? 'text-rose-700 font-semibold' : 'text-slate-400'}`}>{it.hasAntidumping ? `$${mxn(it.countervailing)} (${it.countervailingRate}%)` : '—'}</td>
                  <td className="py-2 text-right font-mono">${mxn(it.iva)}</td>
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
                <td className="py-2 text-right font-mono text-emerald-700">${mxn(result.totals.totalLandedCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

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
