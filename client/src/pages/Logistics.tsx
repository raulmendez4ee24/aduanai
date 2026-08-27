import { DemoTag } from '../components/DemoBanner'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { ContainerSpec, LoadPlanRecord, CubicageResult, LoadOptimization, CostAnalysis } from '../lib/api'
import { Truck, Plus, Calculator, Sparkles, DollarSign, Trash2 } from 'lucide-react'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

/**
 * Ola 3 (27-ago-2026): Logística sale del menú. La ruta /logistics sigue
 * existiendo y el módulo legacy (cubicaje/planes de carga) se conserva abajo
 * como `LogisticsPageLegacy`, sin borrar código. La página muestra un aviso
 * honesto hasta que se integre al despacho o se retire.
 */
export const GUIA_MODULO = {
  titulo: 'Logística',
  pasos: ['Módulo fuera del alcance actual: se integrará al despacho (ETA vs cita de cruce, demoras vs almacenajes) o se retirará.', 'Para costos de despacho usa el Cotizador.'],
}

export function LogisticsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className={`${GLASS} rounded-[2rem] p-8`}>
        <div className="flex items-center gap-2 mb-2">
          <Truck className="w-5 h-5 text-slate-500" />
          <h1 className="text-xl font-bold text-slate-900">Logística</h1>
        </div>
        <p className="text-[13px] text-slate-700">
          <strong>Módulo fuera del alcance actual:</strong> se integrará al despacho (ETA vs cita de cruce, demoras vs almacenajes) o se retirará.
        </p>
        <p className="text-[12px] text-slate-500 mt-2">Los planes de carga y el cubicaje que existían aquí no se han borrado; simplemente no forman parte del flujo operativo de hoy. Los costos de despacho (honorarios, almacenaje, maniobras) viven en el Cotizador.</p>
        <Link to="/cotizador" className="inline-block mt-4 text-[13px] font-medium bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl">Ir al Cotizador →</Link>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LogisticsPageLegacy() {
  const [containers, setContainers] = useState<ContainerSpec[]>([])
  const [plans, setPlans] = useState<LoadPlanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<LoadPlanRecord | null>(null)
  const [cubicage, setCubicage] = useState<CubicageResult | null>(null)
  const [optimization, setOptimization] = useState<LoadOptimization | null>(null)
  const [costs, setCosts] = useState<CostAnalysis | null>(null)
  const [calcLoading, setCalcLoading] = useState('')

  // Create form
  const [newName, setNewName] = useState('')
  const [newContainer, setNewContainer] = useState('')
  const [creating, setCreating] = useState(false)

  // Add item form
  const [showAddItem, setShowAddItem] = useState(false)
  const [itemForm, setItemForm] = useState({ description: '', quantity: '1', length: '', width: '', height: '', weight: '' })

  useEffect(() => {
    async function load() {
      const [c, p] = await Promise.allSettled([api.logisticsContainers(), api.logisticsPlans()])
      if (c.status === 'fulfilled') { setContainers(c.value.data); if (c.value.data.length > 0) setNewContainer(c.value.data[0]!.type) }
      if (p.status === 'fulfilled') setPlans(p.value.data)
      setLoading(false)
    }
    load()
  }, [])

  async function createPlan() {
    if (!newName.trim() || !newContainer) return
    setCreating(true)
    try {
      await api.logisticsPlanCreate({ name: newName, containerType: newContainer })
      const res = await api.logisticsPlans(); setPlans(res.data)
      setShowCreate(false); setNewName('')
    } catch {}
    setCreating(false)
  }

  async function selectPlan(p: LoadPlanRecord) {
    setSelectedPlan(p); setCubicage(null); setOptimization(null); setCosts(null)
    try { const res = await api.logisticsPlanDetail(p.id); setSelectedPlan(res.data) } catch {}
  }

  async function addItem() {
    if (!selectedPlan || !itemForm.description) return
    try {
      await api.logisticsAddItem(selectedPlan.id, {
        description: itemForm.description, quantity: parseInt(itemForm.quantity) || 1,
        length: parseFloat(itemForm.length) || 0, width: parseFloat(itemForm.width) || 0,
        height: parseFloat(itemForm.height) || 0, weight: parseFloat(itemForm.weight) || 0,
      })
      const res = await api.logisticsPlanDetail(selectedPlan.id); setSelectedPlan(res.data)
      setItemForm({ description: '', quantity: '1', length: '', width: '', height: '', weight: '' }); setShowAddItem(false)
    } catch {}
  }

  async function removeItem(itemId: string) {
    if (!selectedPlan) return
    try { await api.logisticsRemoveItem(selectedPlan.id, itemId); const res = await api.logisticsPlanDetail(selectedPlan.id); setSelectedPlan(res.data) } catch {}
  }

  async function calculate() { if (!selectedPlan) return; setCalcLoading('calc'); try { const r = await api.logisticsCalculate(selectedPlan.id); setCubicage(r.data) } catch {} setCalcLoading('') }
  async function optimize() { if (!selectedPlan) return; setCalcLoading('opt'); try { const r = await api.logisticsOptimize(selectedPlan.id); setOptimization(r.data) } catch {} setCalcLoading('') }
  async function analyzeCosts() { if (!selectedPlan) return; setCalcLoading('cost'); try { const r = await api.logisticsCosts(selectedPlan.id); setCosts(r.data) } catch {} setCalcLoading('') }

  const inputClass = "w-full bg-white/60 border border-slate-200/50 rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Plans list */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2"><Truck className="w-5 h-5 text-emerald-500" /><h1 className="text-xl font-bold text-slate-900">Logística</h1> <DemoTag /></div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-semibold px-4 py-2 rounded-full transition-colors"><Plus className="w-3.5 h-3.5" /> Nuevo plan</button>
        </div>

        {/* Container selector for new plan */}
        {showCreate && (
          <div className="mb-5 bg-white/40 rounded-xl p-4 space-y-3">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del plan" className={inputClass} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {containers.map(c => (
                <button key={c.type} onClick={() => setNewContainer(c.type)}
                  className={`p-3 rounded-xl border text-left transition-all ${newContainer === c.type ? 'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-300' : 'bg-white/40 border-slate-200/50 hover:bg-white/60'}`}>
                  <p className="text-[12px] font-semibold text-slate-800">{c.label}</p>
                  <p className="text-[10px] text-slate-500">{c.length}x{c.width}x{c.height}m — {c.volumeM3}m³</p>
                  <p className="text-[10px] text-slate-500">Max: {c.maxWeight.toLocaleString()}kg</p>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={createPlan} disabled={creating || !newName.trim()} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[12px] font-medium px-4 py-2 rounded-full transition-colors">Crear</button>
              <button onClick={() => setShowCreate(false)} className="text-[12px] text-slate-600 px-4 py-2 rounded-full hover:bg-white/60 transition-colors">Cancelar</button>
            </div>
          </div>
        )}

        {loading ? <div className="space-y-3">{[1,2].map(i => <div key={i} className="animate-pulse bg-slate-200/60 rounded-xl h-16" />)}</div> : plans.length > 0 ? (
          <div className="space-y-2">
            {plans.map(p => (
              <button key={p.id} onClick={() => selectPlan(p)} className={`w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all ${selectedPlan?.id === p.id ? 'bg-emerald-50/50 ring-1 ring-emerald-200' : 'bg-white/40 hover:bg-white/60'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900">{p.name}</p>
                  <p className="text-[11px] text-slate-500">{p.containerType} — {p.totalItems} items</p>
                </div>
                <div className="w-24">
                  <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-500">Vol</span><span className="font-medium text-emerald-500">{Math.round(p.volumeUsed)}%</span></div>
                  <div className="w-full bg-slate-200/50 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, p.volumeUsed)}%` }} /></div>
                </div>
              </button>
            ))}
          </div>
        ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin planes de carga</p>}
      </div>

      {/* Selected plan detail */}
      {selectedPlan && (
        <div className={`${GLASS} rounded-[2rem] p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-slate-900">{selectedPlan.name}</h2>
            <div className="flex gap-2">
              <button onClick={calculate} disabled={!!calcLoading} className="flex items-center gap-1 text-[11px] font-medium bg-white/60 px-3 py-1.5 rounded-full hover:bg-white/80 transition-colors disabled:opacity-50">
                {calcLoading === 'calc' ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> : <Calculator className="w-3 h-3" />} Calcular
              </button>
              <button onClick={optimize} disabled={!!calcLoading} className="flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-colors disabled:opacity-50">
                {calcLoading === 'opt' ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-3 h-3" />} Optimizar IA
              </button>
              <button onClick={analyzeCosts} disabled={!!calcLoading} className="flex items-center gap-1 text-[11px] font-medium bg-white/60 px-3 py-1.5 rounded-full hover:bg-white/80 transition-colors disabled:opacity-50">
                {calcLoading === 'cost' ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> : <DollarSign className="w-3 h-3" />} Costos
              </button>
            </div>
          </div>

          {/* Usage bars */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/40 rounded-xl p-4">
              <div className="flex justify-between text-[11px] mb-2"><span className="text-slate-500">Volumen</span><span className="font-bold text-emerald-500">{Math.round(selectedPlan.volumeUsed)}%</span></div>
              <div className="w-full bg-slate-200/50 rounded-full h-3"><div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${Math.min(100, selectedPlan.volumeUsed)}%` }} /></div>
            </div>
            <div className="bg-white/40 rounded-xl p-4">
              <div className="flex justify-between text-[11px] mb-2"><span className="text-slate-500">Peso</span><span className="font-bold text-emerald-500">{Math.round(selectedPlan.weightUsed)}%</span></div>
              <div className="w-full bg-slate-200/50 rounded-full h-3"><div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${Math.min(100, selectedPlan.weightUsed)}%` }} /></div>
            </div>
          </div>

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-slate-700">Items ({selectedPlan.items?.length ?? 0})</p>
              <button onClick={() => setShowAddItem(!showAddItem)} className="text-[11px] font-medium text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full hover:bg-emerald-100">
                {showAddItem ? 'Cancelar' : '+ Agregar'}
              </button>
            </div>

            {showAddItem && (
              <div className="bg-white/40 rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-7 gap-2">
                <input placeholder="Descripción" value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} className={`${inputClass} md:col-span-2`} />
                <input placeholder="Cant" type="number" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })} className={inputClass} />
                <input placeholder="L (m)" type="number" value={itemForm.length} onChange={e => setItemForm({ ...itemForm, length: e.target.value })} className={inputClass} />
                <input placeholder="W (m)" type="number" value={itemForm.width} onChange={e => setItemForm({ ...itemForm, width: e.target.value })} className={inputClass} />
                <input placeholder="H (m)" type="number" value={itemForm.height} onChange={e => setItemForm({ ...itemForm, height: e.target.value })} className={inputClass} />
                <button onClick={addItem} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-medium rounded-xl transition-colors">Add</button>
              </div>
            )}

            {selectedPlan.items && selectedPlan.items.length > 0 ? (
              <div className="space-y-1.5">
                {selectedPlan.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-white/40 rounded-xl p-3 text-[11px]">
                    <span className="flex-1 font-medium text-slate-800">{item.description}</span>
                    <span className="text-slate-500">x{item.quantity}</span>
                    <span className="text-slate-500">{item.length}x{item.width}x{item.height}m</span>
                    <span className="text-slate-500">{item.weight}kg</span>
                    <button onClick={() => removeItem(item.id)} className="w-6 h-6 rounded-lg bg-rose-50 flex items-center justify-center hover:bg-rose-100"><Trash2 className="w-3 h-3 text-rose-500" /></button>
                  </div>
                ))}
              </div>
            ) : <p className="text-center text-[12px] text-slate-400 py-4">Sin items</p>}
          </div>

          {/* Results */}
          {cubicage && (
            <div className="bg-white/40 rounded-xl p-4">
              <p className="text-[12px] font-semibold text-slate-700 mb-3">Resultado Cubicaje</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div><p className="text-[18px] font-bold text-slate-900">{cubicage.volumeUsedPct.toFixed(1)}%</p><p className="text-[10px] text-slate-500">Volumen</p></div>
                <div><p className="text-[18px] font-bold text-slate-900">{cubicage.weightUsedPct.toFixed(1)}%</p><p className="text-[10px] text-slate-500">Peso</p></div>
                <div><p className="text-[18px] font-bold text-slate-900">{cubicage.totalPieces}</p><p className="text-[10px] text-slate-500">Piezas</p></div>
                <div><p className={`text-[18px] font-bold ${cubicage.fitsAll ? 'text-emerald-600' : 'text-rose-600'}`}>{cubicage.fitsAll ? 'Cabe' : `${cubicage.overflow} sobran`}</p><p className="text-[10px] text-slate-500">Estado</p></div>
              </div>
            </div>
          )}

          {optimization && (
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
              <p className="text-[12px] font-semibold text-emerald-700 mb-2">Optimización IA</p>
              <p className="text-[12px] text-slate-700 mb-2">{optimization.arrangement}</p>
              {optimization.tips.map((t, i) => <p key={i} className="text-[11px] text-slate-600 flex items-start gap-2 mb-1"><span className="text-emerald-500">→</span>{t}</p>)}
            </div>
          )}

          {costs && (
            <div className="bg-white/40 rounded-xl p-4">
              <p className="text-[12px] font-semibold text-slate-700 mb-3">Análisis de Costos</p>
              <p className="text-[12px] text-slate-600 mb-3">{costs.recommendation}</p>
              <div className="space-y-2">
                {costs.options.map((o, i) => (
                  <div key={i} className="bg-white/40 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-slate-800">{o.name}</span>
                      <span className="text-[14px] font-bold text-emerald-600">${o.estimatedCost.toLocaleString()}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{o.containers} — Utilización: {o.volumeUtilization}% — ${o.costPerPiece.toFixed(2)}/pieza</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
