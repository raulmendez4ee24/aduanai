import { useState, useEffect } from 'react'
import { LineChart, Target, Award, TrendingUp } from 'lucide-react'
import { api } from '../../lib/api'
import type { AdminMetricsData } from '../../lib/api'
import { formatFraction } from '../../lib/format'

export function AdminMetricasPage() {
  const [data, setData] = useState<AdminMetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.adminMetrics()
      .then(res => setData(res.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>
  if (error || !data) return <div className="text-center text-[13px] text-gray-500 py-8">{error || 'Sin datos'}</div>

  const feedbackTotal = Object.values(data.feedback).reduce((a, b) => a + b, 0)
  const correctPct = feedbackTotal > 0 ? ((data.feedback.correct || 0) / feedbackTotal) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-500 flex items-center justify-center">
          <LineChart size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Métricas globales</h1>
          <p className="text-[12px] text-gray-400">Uso y desempeño de la plataforma</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
            <TrendingUp size={14} className="text-blue-600" />
          </div>
          <p className="text-[22px] font-bold text-[#1a1a1a]">{data.totalClassifications.toLocaleString()}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wider">Clasificaciones totales</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mb-2">
            <Target size={14} className="text-emerald-600" />
          </div>
          <p className="text-[22px] font-bold text-[#1a1a1a]">{data.avgConfidence}%</p>
          <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wider">Confianza promedio</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mb-2">
            <Award size={14} className="text-amber-600" />
          </div>
          <p className="text-[22px] font-bold text-[#1a1a1a]">{correctPct.toFixed(1)}%</p>
          <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wider">Feedback positivo</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-[22px] font-bold text-[#1a1a1a]">{data.topTenants.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wider">Empresas con actividad</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-4">Top 10 fracciones clasificadas</h3>
          <div className="space-y-2">
            {data.topFractions.map((f, i) => (
              <div key={f.fractionCode} className="flex items-center gap-3">
                <span className="text-[11px] text-gray-400 w-5">{i + 1}.</span>
                <span className="font-mono text-[12px] font-medium text-[#1a1a1a] flex-1">{formatFraction(f.fractionCode)}</span>
                <span className="text-[12px] text-gray-500">{f.count}</span>
              </div>
            ))}
            {data.topFractions.length === 0 && <p className="text-[12px] text-gray-400 text-center py-4">Sin datos</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-4">Top 10 empresas más activas</h3>
          <div className="space-y-2">
            {data.topTenants.map((t, i) => (
              <div key={t.tenantId} className="flex items-center gap-3">
                <span className="text-[11px] text-gray-400 w-5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#1a1a1a] truncate">{t.name}</p>
                  <p className="text-[10px] text-gray-400">{t.plan}</p>
                </div>
                <span className="text-[12px] text-gray-500">{t.classifications}</span>
              </div>
            ))}
            {data.topTenants.length === 0 && <p className="text-[12px] text-gray-400 text-center py-4">Sin datos</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
