import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { StatsData, VolumeDay, ClassificationRecord } from '../lib/api'
import { LineChart as LCIcon, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell } from 'recharts'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const CONF_COLORS = ['#10b981', '#6ee7b7', '#fbbf24', '#f97316', '#ef4444']
const CONF_LABELS = ['95-100%', '85-94%', '70-84%', '50-69%', '<50%']

export function AnalyticsPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [volume, setVolume] = useState<VolumeDay[]>([])
  const [history, setHistory] = useState<ClassificationRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [s, v, h] = await Promise.allSettled([api.stats(), api.statsVolume(60), api.classifyHistory(undefined, 1)])
      if (s.status === 'fulfilled') setStats(s.value.data)
      if (v.status === 'fulfilled') setVolume(v.value.data)
      if (h.status === 'fulfilled') setHistory(h.value.data)
      setLoading(false)
    }
    load()
  }, [])

  // Compute chapter distribution from history
  const chapterMap = new Map<string, number>()
  history.forEach(h => {
    const ch = h.fractionCode?.slice(0, 2) ?? '??'
    chapterMap.set(ch, (chapterMap.get(ch) ?? 0) + 1)
  })
  const topChapters = [...chapterMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ch, count]) => ({ ch: `Cap ${ch}`, count }))

  // Confidence distribution
  const confBuckets = [0, 0, 0, 0, 0]
  history.forEach(h => {
    const c = h.confidence
    if (c >= 95) confBuckets[0]!++
    else if (c >= 85) confBuckets[1]!++
    else if (c >= 70) confBuckets[2]!++
    else if (c >= 50) confBuckets[3]!++
    else confBuckets[4]!++
  })
  const confData = confBuckets.map((val, i) => ({ name: CONF_LABELS[i], value: val })).filter(d => d.value > 0)

  // Unique fractions
  const uniqueFractions = new Set(history.map(h => h.fractionCode)).size
  const avgConf = history.length > 0 ? Math.round(history.reduce((s, h) => s + h.confidence, 0) / history.length) : 0

  // Weekly aggregation
  const weeklyMap = new Map<string, { c: number; q: number }>()
  volume.forEach(v => {
    const d = new Date(v.date)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const key = weekStart.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
    const prev = weeklyMap.get(key) ?? { c: 0, q: 0 }
    weeklyMap.set(key, { c: prev.c + v.classifications, q: prev.q + v.quotes })
  })
  const weeklyData = [...weeklyMap.entries()].map(([w, d]) => ({ w, ...d }))

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Clasificaciones Totales', val: stats?.counts.classifications ?? 0, icon: '📦' },
          { label: 'Cotizaciones', val: stats?.counts.quotes ?? 0, icon: '💰' },
          { label: 'Precisión Promedio', val: `${avgConf}%`, icon: '🎯' },
          { label: 'Fracciones Únicas', val: uniqueFractions, icon: '🔢' },
        ].map((k, i) => (
          <div key={i} className={`${GLASS} rounded-[2rem] p-5`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[20px]">{k.icon}</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <p className="text-[24px] font-bold text-slate-900">{typeof k.val === 'number' ? k.val.toLocaleString() : k.val}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Weekly line chart */}
        <div className={`${GLASS} rounded-[2rem] p-6`}>
          <div className="flex items-center gap-2 mb-4">
            <LCIcon className="w-4 h-4 text-emerald-500" />
            <h2 className="text-[14px] font-bold text-slate-900">Clasificaciones por Semana</h2>
          </div>
          {loading ? <div className="animate-pulse bg-slate-200/60 rounded-xl h-56" /> : weeklyData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                  <XAxis dataKey="w" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.5)' }} />
                  <Area type="monotone" dataKey="c" name="Clasificaciones" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                  <Area type="monotone" dataKey="q" name="Cotizaciones" stroke="#6ee7b7" fill="#6ee7b7" fillOpacity={0.08} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-[12px] text-slate-400 text-center py-12">Sin datos</p>}
        </div>

        {/* Top chapters */}
        <div className={`${GLASS} rounded-[2rem] p-6`}>
          <h2 className="text-[14px] font-bold text-slate-900 mb-4">Top 10 Capítulos Clasificados</h2>
          {topChapters.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topChapters} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="ch" tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.5)' }} />
                  <Bar dataKey="count" name="Clasificaciones" fill="#10b981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-[12px] text-slate-400 text-center py-12">Sin datos suficientes</p>}
        </div>
      </div>

      {/* Confidence donut + daily volume */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${GLASS} rounded-[2rem] p-6`}>
          <h2 className="text-[14px] font-bold text-slate-900 mb-4">Distribución de Confianza</h2>
          {confData.length > 0 ? (
            <div className="h-52 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={confData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {confData.map((_, i) => <Cell key={i} fill={CONF_COLORS[i % CONF_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.5)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-[12px] text-slate-400 text-center py-12">Sin datos</p>}
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {confData.map((d, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CONF_COLORS[i % CONF_COLORS.length] }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>

        <div className={`${GLASS} rounded-[2rem] p-6 lg:col-span-2`}>
          <h2 className="text-[14px] font-bold text-slate-900 mb-4">Volumen Diario (últimos 30 días)</h2>
          {volume.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volume.slice(-30).map(v => ({ d: new Date(v.date).toLocaleDateString('es-MX', { day: '2-digit' }), c: v.classifications, q: v.quotes }))} barGap={1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                  <XAxis dataKey="d" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.5)' }} />
                  <Bar dataKey="q" name="Cotizaciones" fill="#6ee7b7" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="c" name="Clasificaciones" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-[12px] text-slate-400 text-center py-12">Sin datos de volumen</p>}
        </div>
      </div>
    </div>
  )
}
