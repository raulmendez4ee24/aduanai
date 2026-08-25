import { useEffect, useState } from 'react'
import { Target, BarChart3, Sliders, Building2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { GlosaStats, GlosaRiskRuleRecord } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'overview' | 'rules' | 'customs'

export function AdminGlosaPage() {
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Simulador de Glosa — Administración</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Estadísticas globales, comparación índice-vs-outcomes y ajuste de reglas de riesgo.</p>
        <div className="flex gap-2 flex-wrap">
          {(['overview', 'rules', 'customs'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {t === 'overview' ? 'Visión general' : t === 'rules' ? 'Reglas de riesgo' : 'Aduanas'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'overview' && <OverviewTab/>}
      {tab === 'rules' && <RulesTab/>}
      {tab === 'customs' && <CustomsTab/>}
    </div>
  )
}

function OverviewTab() {
  const [stats, setStats] = useState<GlosaStats | null>(null)
  useEffect(() => { api.glosaAdminStats().then(r => setStats(r.data)).catch(() => setStats(null)) }, [])
  if (!stats) return <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando…</div>

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total simulaciones" value={stats.total.toLocaleString('es-MX')}/>
        <Card label="Índice heurístico medio" value={`${stats.modelCalibration.predictedAvg}%`} hint="índice de revisión promedio (no calibrado)"/>
        <Card label="RA real (verificado)" value={`${stats.modelCalibration.actualRA}%`} hint={`n=${stats.modelCalibration.total}`}/>
        <Card label="Índice vs outcomes"
          value={stats.modelCalibration.total >= 10
            ? `Δ ${Math.abs(stats.modelCalibration.predictedAvg - stats.modelCalibration.actualRA)}pts`
            : 'Insuficiente'}
          tone={stats.modelCalibration.total >= 10 && Math.abs(stats.modelCalibration.predictedAvg - stats.modelCalibration.actualRA) <= 10 ? 'emerald' : 'amber'}/>
      </div>

      <div className={`${GLASS} rounded-2xl p-5`}>
        <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1">
          <BarChart3 className="w-4 h-4"/> Distribución por nivel de riesgo
        </p>
        <div className="space-y-1.5">
          {stats.byLevel.map(l => {
            const pct = stats.total > 0 ? (l.count / stats.total) * 100 : 0
            const color = l.level === 'critical' ? 'bg-rose-500' : l.level === 'high' ? 'bg-amber-500' : l.level === 'medium' ? 'bg-sky-500' : 'bg-emerald-500'
            return (
              <div key={l.level} className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-bold w-16">{l.level}</span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${color}`} style={{ width: `${pct}%` }}/>
                </div>
                <span className="text-[11px] font-mono w-20 text-right">{l.count} ({pct.toFixed(1)}%)</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className={`${GLASS} rounded-2xl p-5`}>
        <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1">
          <BarChart3 className="w-4 h-4"/> Reglas más activadas
        </p>
        {stats.topRules.length === 0 ? <p className="text-[11px] text-slate-400 italic">Sin datos suficientes</p> : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="py-1.5 text-slate-500 font-medium w-24">Código</th>
                <th className="py-1.5 text-slate-500 font-medium">Regla</th>
                <th className="py-1.5 text-slate-500 font-medium text-right">Activaciones</th>
              </tr>
            </thead>
            <tbody>
              {stats.topRules.map((r, i) => (
                <tr key={i} className="border-b border-slate-100/50">
                  <td className="py-1.5 font-mono">{r.ruleCode}</td>
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-right font-mono">{r.activations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function RulesTab() {
  const [rules, setRules] = useState<GlosaRiskRuleRecord[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  async function load() { try { const r = await api.glosaAdminRules(); setRules(r.data) } catch { setRules([]) } }
  useEffect(() => { load() }, [])

  async function update(id: string, body: { weight?: number; severity?: 'low' | 'medium' | 'high' | 'critical'; active?: boolean }) {
    setBusy(id)
    try { await api.glosaAdminUpdateRule(id, body); await load() } catch {}
    setBusy(null)
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1">
        <Sliders className="w-4 h-4"/> Reglas activas — ajusta peso y severity del checklist heurístico
      </p>
      <div className="space-y-2">
        {rules.map(r => (
          <div key={r.id} className={`rounded-xl border p-3 ${r.active ? 'bg-white/60 border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
            <div className="flex items-start gap-2">
              <span className="font-mono text-[10px] text-slate-500 shrink-0">{r.ruleCode}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-slate-900">{r.name}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{r.description}</p>
                {r.legalBasis && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{r.legalBasis}</p>}
              </div>
              <div className="shrink-0 space-y-1">
                <div className="flex items-center gap-1">
                  <label className="text-[9px] text-slate-500">Peso</label>
                  <input
                    type="number" min={0} max={100}
                    defaultValue={r.weight}
                    onBlur={e => {
                      const w = parseFloat(e.target.value)
                      if (!isNaN(w) && w !== r.weight) update(r.id, { weight: w })
                    }}
                    className="w-14 text-[11px] border border-slate-200 rounded px-1.5 py-0.5"
                  />
                </div>
                <select
                  value={r.severity}
                  onChange={e => update(r.id, { severity: e.target.value as 'low' | 'medium' | 'high' | 'critical' })}
                  className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
                <button onClick={() => update(r.id, { active: !r.active })} disabled={busy === r.id} className="text-[10px] text-slate-600 hover:text-slate-900 underline">
                  {r.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CustomsTab() {
  const [stats, setStats] = useState<GlosaStats | null>(null)
  useEffect(() => { api.glosaAdminStats().then(r => setStats(r.data)).catch(() => setStats(null)) }, [])
  if (!stats) return <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando…</div>

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1">
        <Building2 className="w-4 h-4"/> Aduanas con mayor tasa de RA real
      </p>
      {stats.customsRA.length === 0 ? <p className="text-[11px] text-slate-400 italic">Sin feedback suficiente. La tabla se llena conforme los usuarios reporten resultados reales.</p> : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-1.5 text-slate-500 font-medium">Aduana</th>
              <th className="py-1.5 text-slate-500 font-medium text-right">RA reportados</th>
              <th className="py-1.5 text-slate-500 font-medium text-right">Total verificado</th>
              <th className="py-1.5 text-slate-500 font-medium text-right">Tasa RA</th>
            </tr>
          </thead>
          <tbody>
            {stats.customsRA.map((c, i) => {
              const rate = c.total > 0 ? (c.ra / c.total) * 100 : 0
              return (
                <tr key={i} className="border-b border-slate-100/50">
                  <td className="py-1.5 font-mono">{c.customs}</td>
                  <td className="py-1.5 text-right font-mono">{c.ra}</td>
                  <td className="py-1.5 text-right font-mono">{c.total}</td>
                  <td className={`py-1.5 text-right font-bold ${rate >= 30 ? 'text-rose-700' : rate >= 15 ? 'text-amber-700' : 'text-emerald-700'}`}>{rate.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'emerald' | 'amber' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[20px] font-bold ${toneClass}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}
