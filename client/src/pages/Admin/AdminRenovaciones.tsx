import { useState, useEffect } from 'react'
import { RotateCcw, AlertTriangle, Heart } from 'lucide-react'
import { api } from '../../lib/api'
import type { RenewalRecord } from '../../lib/api'

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Crítico', color: 'text-rose-700', bg: 'bg-rose-50' },
  high: { label: 'Urgente', color: 'text-amber-700', bg: 'bg-amber-50' },
  medium: { label: 'Próximo', color: 'text-blue-700', bg: 'bg-blue-50' },
}

function mxn(n: number | null): string {
  if (!n) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function healthColor(score: number): string {
  if (score >= 75) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-500'
  return 'text-rose-500'
}

export function AdminRenovacionesPage() {
  const [renewals, setRenewals] = useState<RenewalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.adminRenewals()
      .then(res => setRenewals(res.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [])

  const totalMRRAtRisk = renewals.reduce((sum, r) => sum + (r.monthlyPrice || 0), 0)
  const criticalCount = renewals.filter(r => r.urgency === 'critical').length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
          <RotateCcw size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Renovaciones</h1>
          <p className="text-[12px] text-gray-400">Contratos próximos a vencer (60 días)</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-[22px] font-bold text-[#1a1a1a]">{renewals.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wider">Por renovar</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-100">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-rose-500" />
            <p className="text-[22px] font-bold text-rose-600">{criticalCount}</p>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wider">Críticos (&lt;7d)</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-[22px] font-bold text-[#1a1a1a]">{mxn(totalMRRAtRisk)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wider">MRR en riesgo</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <div className="text-center text-[13px] text-gray-500 py-8">{error}</div>
      ) : renewals.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
          <RotateCcw size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-[14px] text-gray-500">Sin renovaciones en los próximos 60 días</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-5 py-3">Empresa</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Plan</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">MRR</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Vence en</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Urgencia</th>
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3 hidden md:table-cell">Health</th>
                </tr>
              </thead>
              <tbody>
                {renewals.map(r => {
                  const urg = URGENCY_CONFIG[r.urgency] ?? URGENCY_CONFIG.medium!
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-[13px] font-medium text-[#1a1a1a]">{r.name}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{r.plan}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[12px] font-mono text-gray-600">{mxn(r.monthlyPrice)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[13px] font-semibold text-[#1a1a1a]">{r.daysLeft} días</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${urg.bg} ${urg.color}`}>{urg.label}</span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1">
                          <Heart size={12} className={healthColor(r.healthScore)} />
                          <span className={`text-[12px] font-semibold ${healthColor(r.healthScore)}`}>{r.healthScore}</span>
                        </div>
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
