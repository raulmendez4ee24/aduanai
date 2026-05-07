import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Cpu, Heart, RefreshCw, TrendingUp, FileText } from 'lucide-react'
import { api } from '../../lib/api'
import type { MonitoringOverview, SystemLogRecord, ErrorGroup, AICostsReport, BusinessMetrics, HealthStatus } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'overview' | 'logs' | 'errors' | 'ai-costs' | 'business' | 'health'

export function AdminMonitoringPage() {
  const [tab, setTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Resumen', icon: Activity },
    { id: 'logs', label: 'Logs', icon: FileText },
    { id: 'errors', label: 'Errores', icon: AlertTriangle },
    { id: 'ai-costs', label: 'Costos IA', icon: Cpu },
    { id: 'business', label: 'Negocio', icon: TrendingUp },
    { id: 'health', label: 'Salud', icon: Heart },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Monitoreo y Observabilidad</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Logs estructurados, errores agregados, consumo de IA, métricas de negocio y health checks.</p>
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              <t.icon className="w-3.5 h-3.5"/> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab/>}
      {tab === 'logs' && <LogsTab/>}
      {tab === 'errors' && <ErrorsTab/>}
      {tab === 'ai-costs' && <AICostsTab/>}
      {tab === 'business' && <BusinessTab/>}
      {tab === 'health' && <HealthTab/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function OverviewTab() {
  const [data, setData] = useState<MonitoringOverview | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try { const r = await api.monitoringOverview(); setData(r.data) } catch {}
    setLoading(false)
  }
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i) }, [])

  if (!data) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>

  const errorRateColor = data.errors.rateHour > 5 ? 'text-rose-600' : data.errors.rateHour > 1 ? 'text-amber-600' : 'text-emerald-600'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Requests / hora" value={data.requests.hour.toLocaleString('es-MX')} sub={`${data.requests.day.toLocaleString('es-MX')} hoy · ${data.requests.week.toLocaleString('es-MX')} semana`}/>
        <Kpi label="Error rate (1h)" value={`${data.errors.rateHour}%`} sub={`${data.errors.hour} errores / ${data.requests.hour} req`} valueColor={errorRateColor}/>
        <Kpi label="Latencia avg (24h)" value={`${data.latency.avgMsDay} ms`} sub="todos los endpoints" />
        <Kpi label="Costo IA (mes)" value={`$${data.ai.costUSDMonth.toFixed(2)}`} sub={`${data.ai.tokensMonth.toLocaleString('es-MX')} tokens`}/>
      </div>

      {/* Sparkline latencia */}
      <div className={`${GLASS} rounded-2xl p-5`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] font-semibold text-slate-700">Latencia últimas 24h</p>
          <button onClick={load} disabled={loading} className="text-[10px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}/> Auto cada 30s
          </button>
        </div>
        <Sparkline points={data.latency.sparkline}/>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-2">Top endpoints (24h)</p>
          <ul className="space-y-1">
            {data.topEndpoints.map((e, i) => (
              <li key={i} className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-slate-700 truncate flex-1">{e.endpoint}</span>
                <span className="font-mono text-slate-500 ml-2">{e.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-2">Top errores (24h)</p>
          <ul className="space-y-1">
            {data.topErrors.length > 0 ? data.topErrors.map((e, i) => (
              <li key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-700 truncate flex-1">{e.message ?? '<sin mensaje>'}</span>
                <span className="font-mono text-rose-600 ml-2">{e.count}</span>
              </li>
            )) : <li className="text-[11px] text-emerald-600">Sin errores en 24h ✓</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Sparkline({ points }: { points: { ts: string; avg: number; count: number }[] }) {
  const max = Math.max(1, ...points.map(p => p.avg))
  return (
    <div className="flex items-end gap-0.5 h-20">
      {points.map((p, i) => {
        const h = (p.avg / max) * 100
        return (
          <div key={i} className="flex-1 bg-emerald-200 hover:bg-emerald-400 rounded-t-sm transition-all relative group" style={{ height: `${h || 4}%`, minHeight: '4px' }}>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap font-mono">
              {new Date(p.ts).getHours()}h · {p.avg}ms · {p.count}req
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function LogsTab() {
  const [logs, setLogs] = useState<SystemLogRecord[]>([])
  const [level, setLevel] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    try {
      const r = await api.monitoringLogs({ level: level || undefined, endpoint: endpoint || undefined, limit: 200 })
      setLogs(r.data)
    } catch {}
  }
  useEffect(() => {
    load()
    if (!autoRefresh) return
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, endpoint, autoRefresh])

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white" value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">Todos los niveles</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
        <input className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 font-mono flex-1 min-w-[200px]" placeholder="Endpoint…" value={endpoint} onChange={e => setEndpoint(e.target.value)}/>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}/>
          Auto-refresh 5s
        </label>
        <button onClick={load} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg">Refrescar</button>
      </div>
      <div className="overflow-y-auto max-h-[600px] font-mono">
        {logs.map(l => {
          const expanded = expandedId === l.id
          return (
            <div key={l.id} onClick={() => setExpandedId(expanded ? null : l.id)}
              className={`text-[10px] py-1 px-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                l.level === 'CRITICAL' ? 'bg-rose-50' : l.level === 'ERROR' ? 'bg-rose-50/50' : l.level === 'WARN' ? 'bg-amber-50/50' : ''
              }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400">{new Date(l.timestamp).toLocaleTimeString('es-MX', { hour12: false })}</span>
                <span className={`font-bold w-16 ${
                  l.level === 'CRITICAL' ? 'text-white bg-rose-600 px-1 rounded' :
                  l.level === 'ERROR' ? 'text-rose-700' :
                  l.level === 'WARN' ? 'text-amber-700' :
                  l.level === 'INFO' ? 'text-sky-600' : 'text-slate-400'
                }`}>{l.level}</span>
                {l.statusCode && <span className={`${l.statusCode >= 500 ? 'text-rose-600' : l.statusCode >= 400 ? 'text-amber-600' : 'text-emerald-600'}`}>{l.statusCode}</span>}
                <span className="text-slate-700 flex-1 truncate">{l.method} {l.endpoint} {l.errorMessage && `— ${l.errorMessage}`}</span>
                {l.latencyMs != null && <span className="text-slate-400">{l.latencyMs}ms</span>}
              </div>
              {expanded && (
                <div className="mt-2 pl-4 text-[9px] text-slate-600 space-y-0.5">
                  <p>requestId: {l.requestId}</p>
                  {l.tenantId && <p>tenant: {l.tenantId}</p>}
                  {l.userId && <p>user: {l.userId}</p>}
                  {l.ip && <p>ip: {l.ip}</p>}
                  {l.errorStack && <pre className="bg-slate-900 text-rose-300 p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">{l.errorStack}</pre>}
                  {l.metadata != null && <pre className="bg-slate-50 p-2 rounded mt-1">{JSON.stringify(l.metadata, null, 2)}</pre>}
                </div>
              )}
            </div>
          )
        })}
        {logs.length === 0 && <p className="text-center text-[12px] text-slate-400 py-8">Sin logs</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function ErrorsTab() {
  const [errors, setErrors] = useState<ErrorGroup[]>([])
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    api.monitoringErrors().then(r => setErrors(r.data)).catch(() => setErrors([]))
  }, [])

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3">Errores agrupados por mensaje (últimos 7 días)</p>
      {errors.length === 0 ? (
        <p className="text-[12px] text-emerald-600">Sin errores en los últimos 7 días ✓</p>
      ) : (
        <div className="space-y-2">
          {errors.map((e, i) => (
            <div key={i} className="rounded-lg border border-rose-100 bg-rose-50/30 p-3">
              <button onClick={() => setExpandedIdx(expandedIdx === i ? null : i)} className="w-full text-left">
                <div className="flex items-start gap-2">
                  <span className="text-[12px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">{e.count}×</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-900 truncate">{e.message}</p>
                    <p className="text-[10px] text-slate-500">Última: {new Date(e.lastSeen).toLocaleString('es-MX')} · {e.affectedTenants} tenant(s) · {e.affectedUsers} usuario(s)</p>
                  </div>
                </div>
              </button>
              {expandedIdx === i && e.sample.errorStack && (
                <pre className="mt-2 bg-slate-900 text-rose-300 p-3 rounded text-[9px] overflow-x-auto whitespace-pre-wrap">{e.sample.errorStack}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function AICostsTab() {
  const [data, setData] = useState<AICostsReport | null>(null)
  const [range, setRange] = useState<'day' | 'week' | 'month' | 'year'>('month')

  useEffect(() => {
    api.monitoringAICosts(range).then(r => setData(r.data)).catch(() => setData(null))
  }, [range])

  if (!data) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>

  return (
    <div className="space-y-4">
      <div className={`${GLASS} rounded-2xl p-5`}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-[12px] font-semibold text-slate-700">Consumo de IA — {range}</p>
          <div className="flex gap-1">
            {(['day','week','month','year'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)} className={`text-[11px] px-2.5 py-1 rounded-full ${range === r ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{r}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Llamadas" value={data.totals.calls.toLocaleString('es-MX')}/>
          <Kpi label="Tokens" value={data.totals.tokens.toLocaleString('es-MX')}/>
          <Kpi label="Costo USD" value={`$${data.totals.costUSD.toFixed(2)}`}/>
          {data.totals.projectionUSD != null && <Kpi label="Proyección mes" value={`$${data.totals.projectionUSD.toFixed(2)}`}/>}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Table title="Por modelo" rows={data.byModel.map(r => [r.model, `${r.calls} calls`, `${r.totalTokens.toLocaleString('es-MX')} tk`, `$${r.costUSD.toFixed(2)}`])}/>
        <Table title="Por operación" rows={data.byOperation.map(r => [r.operation, `${r.calls} calls`, `${r.tokens.toLocaleString('es-MX')} tk`, `$${r.costUSD.toFixed(2)}`])}/>
      </div>
      <Table title="Por tenant (top 10)" rows={data.byTenant.slice(0, 10).map(r => [r.tenantId ?? 'N/A', `${r.calls} calls`, `${r.tokens.toLocaleString('es-MX')} tk`, `$${r.costUSD.toFixed(2)}`])}/>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function BusinessTab() {
  const [data, setData] = useState<BusinessMetrics | null>(null)
  useEffect(() => { api.monitoringBusiness().then(r => setData(r.data)).catch(() => setData(null)) }, [])
  if (!data) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="DAU" value={data.users.dau} sub="Daily active users"/>
        <Kpi label="WAU" value={data.users.wau} sub="Weekly active users"/>
        <Kpi label="MAU" value={data.users.mau} sub="Monthly active users"/>
        <Kpi label="LTV avg" value={`$${data.ltvAvgMXN.toLocaleString('es-MX')} MXN`}/>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-3">Funnel últimos 30 días</p>
          <FunnelStep label="Leads" value={data.funnel.leads30d} max={data.funnel.leads30d}/>
          <FunnelStep label="Demo agendado" value={data.funnel.demoScheduled} max={data.funnel.leads30d}/>
          <FunnelStep label="Demo realizado" value={data.funnel.demoDone} max={data.funnel.leads30d}/>
          <FunnelStep label="Piloto" value={data.funnel.pilots} max={data.funnel.leads30d}/>
          <FunnelStep label="Convertido" value={data.funnel.converted} max={data.funnel.leads30d}/>
        </div>
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-3">Otros indicadores</p>
          <ul className="text-[12px] space-y-2">
            <li className="flex justify-between"><span className="text-slate-600">Clasificaciones (1d)</span><span className="font-mono">{data.activity.classificationsDay}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Clasificaciones (7d)</span><span className="font-mono">{data.activity.classificationsWeek}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Tenants activos</span><span className="font-mono">{data.activeTenants}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Churn 60d</span><span className={`font-mono ${data.churn.last60Days > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{data.churn.last60Days} ({data.churn.rateMonthly}%)</span></li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function FunnelStep({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-slate-700">{label}</span>
        <span className="font-mono text-slate-500">{value} {pct < 100 && `(${pct.toFixed(0)}%)`}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }}/>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function HealthTab() {
  const [data, setData] = useState<HealthStatus | null>(null)
  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setData).catch(() => setData(null))
  }, [])
  if (!data) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>

  const overallOk = data.status === 'ok'
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[12px] font-semibold text-slate-700">Health check</p>
          <p className="text-[10px] text-slate-500">{data.service} · uptime {Math.floor(data.uptime / 60)}m · node {data.nodeVersion}</p>
        </div>
        <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${overallOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
          {overallOk ? '✓ OPERATIVO' : '⚠ DEGRADADO'}
        </span>
      </div>
      <div className="space-y-2">
        {Object.entries(data.checks).map(([k, v]) => (
          <div key={k} className={`rounded-lg border p-3 flex items-center justify-between ${v.ok ? 'bg-emerald-50/30 border-emerald-100' : 'bg-rose-50/30 border-rose-100'}`}>
            <div>
              <p className="text-[12px] font-semibold text-slate-900 uppercase">{k.replace('_', ' ')}</p>
              {v.error && <p className="text-[10px] text-rose-600 mt-0.5">{v.error}</p>}
              {'latencyMs' in v && v.latencyMs != null && <p className="text-[10px] text-slate-500 mt-0.5">{v.latencyMs} ms</p>}
            </div>
            <span className={`text-[11px] font-mono ${v.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{v.ok ? '✓' : '✗'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, valueColor }: { label: string; value: string | number; sub?: string; valueColor?: string }) {
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[22px] font-bold mt-0.5 ${valueColor ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Table({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-2">{title}</p>
      {rows.length === 0 ? <p className="text-[11px] text-slate-400 italic">Sin datos</p> : (
        <table className="w-full text-[11px]">
          <tbody>
            {rows.map((cols, i) => (
              <tr key={i} className="border-b border-slate-100">
                {cols.map((c, j) => (
                  <td key={j} className={`py-1.5 ${j === 0 ? 'font-mono text-slate-700' : j === cols.length - 1 ? 'text-right font-mono text-slate-900 font-semibold' : 'text-slate-500 font-mono'}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
