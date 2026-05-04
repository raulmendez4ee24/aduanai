import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, Rocket, Building2, AlertTriangle, ArrowRight } from 'lucide-react'
import { api } from '../../lib/api'
import type { AdminDashboardData } from '../../lib/api'

const PIPELINE_STEPS: { key: keyof AdminDashboardData['pipeline']; label: string; color: string }[] = [
  { key: 'new', label: 'Nuevo', color: 'bg-blue-500' },
  { key: 'contacted', label: 'Contactado', color: 'bg-amber-500' },
  { key: 'demoScheduled', label: 'Demo agendada', color: 'bg-purple-500' },
  { key: 'demoDone', label: 'Demo realizada', color: 'bg-indigo-500' },
  { key: 'pilot', label: 'Piloto', color: 'bg-orange-500' },
  { key: 'negotiating', label: 'Negociando', color: 'bg-yellow-500' },
  { key: 'converted', label: 'Convertido', color: 'bg-emerald-500' },
]

function mxn(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center`}>
          <Icon size={16} className="text-white" />
        </div>
        {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
      </div>
      <p className="text-[24px] font-bold text-[#1a1a1a] leading-none">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  )
}

export function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.adminDashboard()
      .then(res => setData(res.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>
  if (error || !data) return <div className="flex items-center justify-center h-64 text-gray-500 text-[14px]">{error || 'Sin datos'}</div>

  const mrrPct = data.kpis.mrrGoal > 0 ? Math.min(100, (data.kpis.mrr / data.kpis.mrrGoal) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
          <TrendingUp size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Panel Admin</h1>
          <p className="text-[12px] text-gray-400">Resumen del negocio</p>
        </div>
      </div>

      {/* MRR Gauge */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">MRR actual</p>
            <p className="text-[28px] font-bold text-[#1a1a1a] leading-tight">{mxn(data.kpis.mrr)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Meta mensual</p>
            <p className="text-[14px] text-gray-600">{mxn(data.kpis.mrrGoal)}</p>
          </div>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all" style={{ width: `${mrrPct}%` }} />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">{mrrPct.toFixed(1)}% de la meta</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Leads este mes" value={String(data.kpis.leadsThisMonth)} accent="bg-blue-500" />
        <Kpi icon={Rocket} label="Pilotos activos" value={String(data.kpis.pilotsActive)} accent="bg-orange-500" />
        <Kpi icon={Building2} label="Empresas activas" value={String(data.kpis.activeTenants)} accent="bg-emerald-500" />
        <Kpi icon={AlertTriangle} label="Renovaciones <30d" value={String(data.kpis.contractsExpiringSoon)} accent="bg-amber-500" />
      </div>

      {/* Pipeline kanban */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-[#1a1a1a]">Pipeline de ventas</h2>
          <Link to="/admin/leads" className="text-[12px] text-emerald-600 hover:underline flex items-center gap-1">
            Ver leads <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {PIPELINE_STEPS.map(step => (
            <div key={step.key} className="bg-white rounded-xl p-3 shadow-sm">
              <div className={`w-2 h-2 rounded-full ${step.color} mb-2`} />
              <p className="text-[22px] font-bold text-[#1a1a1a] leading-none">{data.pipeline[step.key]}</p>
              <p className="text-[11px] text-gray-400 mt-1">{step.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Latest leads + Pilots side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-[#1a1a1a]">Leads recientes</h3>
            <Link to="/admin/leads" className="text-[12px] text-emerald-600 hover:underline">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {data.latestLeads.slice(0, 6).map(l => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{l.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{l.company || '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                    l.score >= 60 ? 'bg-emerald-50 text-emerald-700' : l.score >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                  }`}>{l.score}</span>
                </div>
              </div>
            ))}
            {data.latestLeads.length === 0 && <p className="text-[12px] text-gray-400 text-center py-6">Sin leads</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-[#1a1a1a]">Pilotos activos</h3>
            <Link to="/admin/pilotos" className="text-[12px] text-emerald-600 hover:underline">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {data.pilots.map(p => {
              const daysLeft = p.pilotEndsAt ? Math.max(0, Math.ceil((new Date(p.pilotEndsAt).getTime() - Date.now()) / 86400000)) : 0
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <p className="text-[13px] font-medium text-[#1a1a1a] truncate min-w-0 mr-2">{p.name}</p>
                  <span className={`text-[11px] font-mono shrink-0 ${daysLeft <= 7 ? 'text-rose-600' : 'text-gray-500'}`}>
                    {daysLeft}d
                  </span>
                </div>
              )
            })}
            {data.pilots.length === 0 && <p className="text-[12px] text-gray-400 text-center py-6">Sin pilotos</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
