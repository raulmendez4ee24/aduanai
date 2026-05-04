import { useState, useEffect } from 'react'
import { Building2, Heart } from 'lucide-react'
import { api } from '../../lib/api'
import type { TenantRecord } from '../../lib/api'

const PLAN_COLORS: Record<string, string> = {
  PILOT: 'bg-orange-50 text-orange-700',
  STARTER: 'bg-blue-50 text-blue-700',
  PROFESSIONAL: 'bg-purple-50 text-purple-700',
  ENTERPRISE: 'bg-emerald-50 text-emerald-700',
  CUSTOM: 'bg-slate-100 text-slate-700',
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PILOT: 'bg-orange-50 text-orange-700',
  TRIAL: 'bg-blue-50 text-blue-700',
  SUSPENDED: 'bg-gray-100 text-gray-500',
  CHURNED: 'bg-rose-50 text-rose-700',
}

function healthColor(score: number): string {
  if (score >= 75) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-500'
  return 'text-rose-500'
}

function mxn(n: number | null): string {
  if (n === null) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

export function AdminEmpresasPage() {
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPlan, setFilterPlan] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setError(null)
      const res = await api.adminTenants({
        plan: filterPlan || undefined,
        status: filterStatus || undefined,
        search: search || undefined,
      })
      setTenants(res.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterPlan, filterStatus])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
          <Building2 size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Empresas</h1>
          <p className="text-[12px] text-gray-400">Todos los tenants del sistema</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load() }}
          className="text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-w-[200px]"
        />
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} className="text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
          <option value="">Todos los planes</option>
          <option value="PILOT">Piloto</option>
          <option value="STARTER">Starter</option>
          <option value="PROFESSIONAL">Professional</option>
          <option value="ENTERPRISE">Enterprise</option>
          <option value="CUSTOM">Custom</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activos</option>
          <option value="PILOT">En piloto</option>
          <option value="SUSPENDED">Suspendidos</option>
          <option value="CHURNED">Churned</option>
        </select>
        <span className="text-[12px] text-gray-400 ml-auto">{tenants.length} empresa{tenants.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <div className="text-center text-[13px] text-gray-500 py-8">{error}</div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-5 py-3">Empresa</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Plan</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Estado</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3 hidden md:table-cell">Usuarios</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3 hidden md:table-cell">Clasif.</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3 hidden lg:table-cell">MRR</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Health</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3 hidden lg:table-cell">Vence</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-[13px] text-gray-400 py-12">Sin empresas</td></tr>
                )}
                {tenants.map(t => {
                  const vence = t.plan === 'PILOT' ? t.pilotDaysLeft : t.contractDaysLeft
                  return (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[13px] text-[#1a1a1a]">{t.name}</p>
                        <p className="text-[11px] text-gray-400">{t.rfc || 'Sin RFC'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${PLAN_COLORS[t.plan] || 'bg-gray-100 text-gray-600'}`}>{t.plan}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="text-[12px] text-gray-600">{t.usersCount}{t.userLimit ? `/${t.userLimit}` : ''}</span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="text-[12px] text-gray-600">{t.classificationsUsed}{t.classificationLimit ? `/${t.classificationLimit}` : ''}</span>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <span className="text-[12px] text-gray-600 font-mono">{mxn(t.monthlyPrice)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <Heart size={12} className={healthColor(t.healthScore)} />
                          <span className={`text-[12px] font-semibold ${healthColor(t.healthScore)}`}>{t.healthScore}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {vence !== null && (
                          <span className={`text-[12px] ${vence <= 7 ? 'text-rose-600 font-semibold' : vence <= 30 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {vence}d
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
