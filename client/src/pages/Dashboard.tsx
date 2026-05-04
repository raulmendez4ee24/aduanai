import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, TrendingUp, Bot, AlertTriangle, Eye, Clock,
  CheckCircle2, Circle, ArrowUpRight, Boxes, FileText,
  Warehouse, BarChart3
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../lib/api'
import type { StatsData, VolumeDay, Alert, ClassificationRecord, InventoryBalance, InventoryStats } from '../lib/api'
import { formatFraction } from '../lib/format'
import { ROIBanner } from '../components/ROIBanner'
import { ComplianceGauge } from '../components/ComplianceGauge'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200/60 rounded-xl ${className}`} />
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs}h`
  return `Hace ${Math.floor(hrs / 24)}d`
}

function EmptyState({ message, cta, onCta }: { message: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Boxes className="w-8 h-8 text-slate-300 mb-2" />
      <p className="text-[12px] text-slate-400 mt-2">{message}</p>
      {cta && onCta && (
        <button onClick={onCta} className="mt-3 text-[11px] font-medium text-emerald-500 hover:text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full transition-colors">
          {cta}
        </button>
      )}
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [volume, setVolume] = useState<VolumeDay[] | null>(null)
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [recentClassifications, setRecentClassifications] = useState<ClassificationRecord[] | null>(null)
  const [invStats, setInvStats] = useState<InventoryStats | null>(null)
  const [invBalances, setInvBalances] = useState<InventoryBalance[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const results = await Promise.allSettled([
        api.stats(),
        api.statsVolume(30),
        api.alerts(),
        api.alertsUnreadCount(),
        api.classifyHistory(undefined, 1),
        api.inventoryStats(),
        api.inventoryBalances(),
      ])
      if (results[0]?.status === 'fulfilled') setStats(results[0].value.data)
      if (results[1]?.status === 'fulfilled') setVolume(results[1].value.data)
      if (results[2]?.status === 'fulfilled') setAlerts(results[2].value.data.slice(0, 5))
      if (results[3]?.status === 'fulfilled') setUnreadAlerts(results[3].value.data.count)
      if (results[4]?.status === 'fulfilled') setRecentClassifications(results[4].value.data.slice(0, 5))
      if (results[5]?.status === 'fulfilled') setInvStats(results[5].value.data)
      if (results[6]?.status === 'fulfilled') setInvBalances(results[6].value.data.slice(0, 5))
      setLoading(false)
    }
    load()
  }, [])

  const lastClassification = recentClassifications?.[0] ?? null

  return (
    <div className="space-y-4">

      {/* ROI banner — valor entregado mes a la fecha */}
      <ROIBanner days={30} />

      {/* Grid principal con Compliance Gauge prominente */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-min">

      {/* Compliance Score */}
      <div className="lg:col-span-2 lg:row-span-2">
        <ComplianceGauge />
      </div>

      {/* ── W1: Centro de Control ── */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-bold text-slate-900">Centro de Control</h3>
          <span className="text-[10px] font-medium text-slate-400 bg-white/60 px-2.5 py-1 rounded-full">Hoy</span>
        </div>
        {loading ? (
          <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : stats ? (
          <div className="divide-y divide-slate-200/50">
            {[
              { icon: Package, label: 'Clasificaciones IA', value: stats.counts.classifications.toLocaleString() },
              { icon: TrendingUp, label: 'Cotizaciones', value: stats.counts.quotes.toLocaleString() },
              { icon: Bot, label: 'Consultas Copilot', value: stats.counts.copilotMessages.toLocaleString() },
            ].map((m, i) => (
              <div key={i} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                  <m.icon className="w-4 h-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-500">{m.label}</p>
                  <p className="text-[20px] font-bold text-slate-900 leading-tight">{m.value}</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-50 flex items-center gap-0.5">
                  <ArrowUpRight className="w-2.5 h-2.5" />
                </span>
              </div>
            ))}
          </div>
        ) : <EmptyState message="No hay datos disponibles" />}
      </div>

      {/* ── W2: Última Clasificación ── */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-bold text-slate-900">Última Clasificación</h3>
          <button onClick={() => navigate('/historial')} className="text-[10px] font-medium text-emerald-500 hover:text-emerald-600">Ver todas →</button>
        </div>
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-6" /><Skeleton className="h-4 w-3/4" /></div>
        ) : lastClassification ? (
          <>
            <p className="font-mono text-[28px] font-bold text-slate-900 tracking-tight">{formatFraction(lastClassification.fractionCode)}</p>
            <p className="text-[12px] text-slate-500 mt-1 line-clamp-2">{lastClassification.inputDescription}</p>
            <div className="mt-5">
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-slate-500">Confianza</span>
                <span className="font-bold text-emerald-500">{Math.round(lastClassification.confidence)}%</span>
              </div>
              <div className="w-full bg-slate-200/50 rounded-full h-2.5">
                <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-2.5 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, lastClassification.confidence)}%` }} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {lastClassification.feedback === 'correct' && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Validada</span>}
              {lastClassification.feedback === 'incorrect' && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">✗ Incorrecta</span>}
              {!lastClassification.feedback && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Sin feedback</span>}
              <span className="text-[10px] text-slate-400">{timeAgo(lastClassification.createdAt)}</span>
            </div>
          </>
        ) : <EmptyState message="Sin clasificaciones" cta="Clasificar producto" onCta={() => navigate('/clasificador')} />}
      </div>

      {/* ── W3: Alertas ── */}
      <div className={`${GLASS} rounded-[2rem] p-6 lg:col-span-2`}>
        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle className="w-4 h-4 text-emerald-500" />
          <h3 className="text-[14px] font-bold text-slate-900">Alertas de Compliance</h3>
          {unreadAlerts > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">{unreadAlerts} nuevas</span>}
          <button onClick={() => navigate('/alertas')} className="ml-auto text-[10px] font-medium text-emerald-500 hover:text-emerald-600">Ver todas →</button>
        </div>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
        ) : alerts && alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map(alert => (
              <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
                alert.type === 'critical' ? 'bg-rose-50/50 border-rose-100' :
                alert.type === 'warning' ? 'bg-amber-50/50 border-amber-100' :
                'bg-blue-50/50 border-blue-100'
              }`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  alert.type === 'critical' ? 'bg-rose-500' : alert.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-800 line-clamp-1">{alert.title}</p>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {alert.fractionCodes.length > 0 && <span className="font-mono text-slate-600">{formatFraction(alert.fractionCodes[0])}</span>}
                    {alert.fractionCodes.length > 0 && ' — '}{alert.content.slice(0, 80)}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(alert.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState message="Sin alertas activas" />}
      </div>

      {/* ── W4: Recientes ── */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-bold text-slate-900">Recientes</h3>
          <button onClick={() => navigate('/historial')} className="text-[10px] font-medium text-emerald-500 hover:text-emerald-600">Historial →</button>
        </div>
        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12" />)}</div>
        ) : recentClassifications && recentClassifications.length > 0 ? (
          <div className="space-y-2">
            {recentClassifications.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/40 hover:bg-white/60 transition-colors">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0">
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[12px] font-semibold text-slate-900">{formatFraction(c.fractionCode)}</p>
                  <p className="text-[10px] text-slate-500 line-clamp-1">{c.inputDescription}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-bold text-emerald-500">{Math.round(c.confidence)}%</p>
                  <p className="text-[9px] text-slate-400">{timeAgo(c.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState message="Sin clasificaciones" cta="Clasificar" onCta={() => navigate('/clasificador')} />}
      </div>

      {/* ── W5: Timeline ── */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[11px] text-slate-500">Último proceso</p>
            <p className="font-mono text-[18px] font-bold text-slate-900 tracking-tight">
              {lastClassification ? `#CLS-${lastClassification.id.slice(0, 8).toUpperCase()}` : '—'}
            </p>
          </div>
          <span className="text-[10px] font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-600">En proceso</span>
        </div>
        <div className="mt-5 space-y-0">
          {[
            { label: 'Clasificación completada', detail: lastClassification ? `Fracción ${formatFraction(lastClassification.fractionCode)}` : '—', status: 'done' as const },
            { label: 'Cotización generada', detail: 'IGI + DTA + IVA calculados', status: 'done' as const },
            { label: 'En despacho aduanal', detail: lastClassification ? timeAgo(lastClassification.createdAt) : '', status: 'current' as const },
            { label: 'Entrega estimada', detail: 'Pendiente', status: 'future' as const },
          ].map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  step.status === 'done' ? 'bg-emerald-500' : step.status === 'current' ? 'bg-emerald-400' : 'bg-white border-2 border-slate-200'
                }`}>
                  {step.status === 'done' && <CheckCircle2 className="w-3 h-3 text-white" />}
                  {step.status === 'current' && <Circle className="w-2 h-2 text-white fill-white" />}
                  {step.status === 'future' && <Clock className="w-2.5 h-2.5 text-slate-300" />}
                </div>
                {i < 3 && <div className={`w-px h-8 ${step.status === 'future' ? 'bg-slate-200/60' : 'bg-emerald-200'}`} />}
              </div>
              <div className="pb-4">
                <p className={`text-[12px] font-semibold ${step.status === 'future' ? 'text-slate-400' : 'text-slate-900'}`}>{step.label}</p>
                <p className="text-[10px] text-slate-500 font-mono">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── W6: Volumen ── */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-bold text-slate-900">Volumen</h3>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Clasif.</span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-300" /> Cotiz.</span>
          </div>
        </div>
        {loading ? <Skeleton className="h-44" /> : volume && volume.length > 0 ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volume.slice(-14).map(v => ({
                d: new Date(v.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
                c: v.classifications, q: v.quotes,
              }))} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis dataKey="d" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '12px', fontSize: '11px' }} />
                <Bar dataKey="q" name="Cotizaciones" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="c" name="Clasificaciones" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState message="Sin datos de volumen" />}
      </div>

      {/* ── W7: Inventario IMMEX ── */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-bold text-slate-900">Inventario IMMEX</h3>
          <button onClick={() => navigate('/inventario')} className="text-[10px] font-medium text-emerald-500 hover:text-emerald-600">Detalle →</button>
        </div>
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-12" /></div>
        ) : invBalances && invBalances.length > 0 ? (
          <>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={invBalances.slice(0, 5).map(b => ({ f: formatFraction(b.fractionCode), val: b.balance }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                  <XAxis dataKey="f" tick={{ fontSize: 8, fill: '#94a3b8', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '12px', fontSize: '11px' }} />
                  <Bar dataKey="val" name="Saldo" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/50">
              <div>
                <p className="text-[10px] text-slate-500">Activas</p>
                <p className="text-[16px] font-bold text-slate-900">{invStats?.activeImports?.toLocaleString() ?? '—'}</p>
              </div>
              {invStats && invStats.expiringIn90Days > 0 && (
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{invStats.expiringIn90Days} por vencer
                </span>
              )}
              <div className="text-right">
                <p className="text-[10px] text-slate-500">Valor total</p>
                <p className="text-[16px] font-bold text-slate-900">${invStats ? Math.round(invStats.totalValueActive).toLocaleString() : '—'}</p>
              </div>
            </div>
          </>
        ) : <EmptyState message="Sin inventario" cta="Ir a inventario" onCta={() => navigate('/inventario')} />}
      </div>
      </div>
    </div>
  )
}
