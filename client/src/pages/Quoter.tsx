import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { MultiQuoteInput, MultiQuoteItemInput, MultiQuoteResult, ScenarioComparison, ScenarioVariant } from '../lib/api'
import { Calculator, DollarSign, AlertCircle, AlertTriangle, ShieldCheck, FileWarning, Plus, Trash2, GitCompare, Globe } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { ROITile } from '../components/ROIBanner'
import { NOMExceptionPanel } from '../components/NOMExceptionPanel'

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
                        <input type="number" value={it.vehiclePriceMXN ?? ''}
                          onChange={e => updateItem(idx, { vehiclePriceMXN: parseFloat(e.target.value) || undefined })}
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
                          <p className="font-mono font-semibold">{t.preferentialRate ?? '—'}%</p>
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
            return (
              <div key={it.numeroPartida} className="rounded-lg bg-white/70 border border-violet-100 p-3 mb-2">
                <p className="text-[11px] font-bold text-slate-900 mb-2">Partida {it.numeroPartida} · {formatFraction(it.fractionCode)}</p>
                <div className="space-y-1.5 text-[11px]">
                  {p.prosec.eligible && (
                    <div className={`rounded p-2 ${p.prosec.applied ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                      <p className="font-semibold">PROSEC sector {p.prosec.sector ?? '—'}</p>
                      {p.prosec.applied
                        ? <p className="text-emerald-800">✓ Aplicado · Tasa preferencial {p.prosec.prosecRate}% · <strong>Ahorro: ${mxn(p.prosec.savingsMXN)} MXN</strong></p>
                        : <p className="text-amber-800">💡 OPORTUNIDAD: con registro PROSEC ahorrarías hasta el {it.treaty.appliedRate - (p.prosec.prosecRate ?? 0)}% del IGI. Trámite ante SE 30-45 días.</p>}
                    </div>
                  )}
                  {p.regla8va.eligible && (
                    <div className={`rounded p-2 ${p.regla8va.applied ? 'bg-emerald-50 border border-emerald-200' : 'bg-sky-50 border border-sky-200'}`}>
                      <p className="font-semibold">Regla 8va — parte para {p.regla8va.vehicleFraction}</p>
                      <p>{p.regla8va.applied ? `✓ Aplicada · Tasa ${p.regla8va.preferentialRate}%` : `Disponible — tasa preferencial ${p.regla8va.preferentialRate}%`}</p>
                    </div>
                  )}
                  {p.ieps.applies && (
                    <div className="rounded p-2 bg-rose-50 border border-rose-200">
                      <p className="font-semibold text-rose-900">🚨 IEPS aplicable — {p.ieps.category}</p>
                      <p className="text-rose-800">{p.ieps.calculation || `${p.ieps.rate} ${p.ieps.rateType}`}</p>
                      {p.ieps.amountMXN > 0 && <p className="text-rose-900 font-bold">Monto: ${mxn(p.ieps.amountMXN)} MXN</p>}
                    </div>
                  )}
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
