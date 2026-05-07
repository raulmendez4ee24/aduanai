import { useEffect, useState } from 'react'
import { CheckCircle, AlertTriangle, AlertCircle, Mail } from 'lucide-react'
import { api } from '../../lib/api'
import type { PublicStatus, SystemIncidentRecord } from '../../lib/api'

export function StatusPage() {
  const [data, setData] = useState<PublicStatus | null>(null)
  const [incidents, setIncidents] = useState<SystemIncidentRecord[]>([])
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  async function load() {
    try { const r = await api.statusPublic(); setData(r.data) } catch {}
    try { const r = await api.statusIncidents(); setIncidents(r.data) } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [])

  async function subscribe(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    try { await api.statusSubscribe(email); setSubscribed(true); setEmail('') } catch {}
  }

  if (!data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Cargando…</div>

  const palette = {
    operational: { bg: 'bg-emerald-500', text: 'All systems operational', icon: CheckCircle },
    degraded:    { bg: 'bg-amber-500',   text: 'Partial outage detected',  icon: AlertTriangle },
    down:        { bg: 'bg-rose-500',    text: 'Major outage',             icon: AlertCircle },
  }[data.overall]
  const StatusIcon = palette.icon

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto py-12 px-6">
        <header className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-wider text-emerald-600">ADUANAI</p>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">System Status</h1>
        </header>

        {/* Status global */}
        <div className={`rounded-2xl ${palette.bg} text-white p-6 mb-6 flex items-center gap-4 shadow-lg`}>
          <StatusIcon className="w-10 h-10 shrink-0"/>
          <div>
            <p className="text-[20px] font-bold">{palette.text}</p>
            <p className="text-[12px] opacity-90">Última actualización: {new Date(data.timestamp).toLocaleString('es-MX')}</p>
          </div>
        </div>

        {/* Componentes */}
        <div className="bg-white rounded-2xl border border-slate-200 mb-6">
          <p className="text-[12px] font-semibold text-slate-700 px-4 py-3 border-b border-slate-100">Componentes</p>
          <ul>
            {data.components.map(c => (
              <li key={c.name} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-b-0">
                <div>
                  <p className="text-[13px] font-medium text-slate-900">{c.name}</p>
                  {c.detail && <p className="text-[10px] text-slate-500">{c.detail}</p>}
                </div>
                <span className={`text-[11px] font-bold ${c.status === 'operational' ? 'text-emerald-600' : c.status === 'degraded' ? 'text-amber-600' : 'text-rose-600'}`}>
                  {c.status === 'operational' ? '✓ Operational' : c.status === 'degraded' ? '⚠ Degraded' : '✗ Down'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Uptime últimos 90 días */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
          <p className="text-[12px] font-semibold text-slate-700 mb-2">Uptime últimos 90 días</p>
          <div className="flex gap-0.5 h-8">
            {data.uptime90.map((d) => (
              <div key={d.day} className={`flex-1 rounded-sm ${
                d.status === 'operational' ? 'bg-emerald-400' : d.status === 'degraded' ? 'bg-amber-400' : 'bg-rose-500'
              }`} title={`${d.day}: ${d.status}`}/>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>{data.uptime90[0]?.day}</span><span>Hoy</span>
          </div>
        </div>

        {/* Incidentes */}
        <div className="bg-white rounded-2xl border border-slate-200 mb-6">
          <p className="text-[12px] font-semibold text-slate-700 px-4 py-3 border-b border-slate-100">Incidentes recientes</p>
          {incidents.length === 0 ? (
            <p className="text-[12px] text-emerald-600 px-4 py-6 text-center">Sin incidentes en los últimos 90 días ✓</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {incidents.map(i => (
                <li key={i.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      i.severity === 'critical' ? 'bg-rose-100 text-rose-800' :
                      i.severity === 'major' ? 'bg-amber-100 text-amber-800' :
                      'bg-sky-100 text-sky-800'
                    }`}>{i.severity.toUpperCase()}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      i.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>{i.status.toUpperCase()}</span>
                    <span className="text-[10px] text-slate-400 ml-auto">{new Date(i.startedAt).toLocaleString('es-MX')}</span>
                  </div>
                  <p className="text-[13px] font-bold text-slate-900">{i.title}</p>
                  <p className="text-[12px] text-slate-600 mt-0.5">{i.description}</p>
                  {i.updates.length > 1 && (
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-500 border-l-2 border-slate-200 pl-3">
                      {i.updates.map((u, k) => (
                        <li key={k}>
                          <span className="text-slate-400">{new Date(u.ts).toLocaleString('es-MX')}:</span> {u.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {i.resolution && <p className="text-[11px] mt-2 text-emerald-700"><strong>Resolución:</strong> {i.resolution}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Suscribirse */}
        <div className="bg-slate-900 rounded-2xl p-5 text-white">
          <p className="text-[13px] font-bold mb-1">Recibe alertas de incidentes</p>
          <p className="text-[11px] text-slate-300 mb-3">Te avisaremos por email cuando haya degradación o incidentes en producción.</p>
          {subscribed ? (
            <p className="text-[12px] text-emerald-400">✓ Suscrito. Te avisaremos.</p>
          ) : (
            <form onSubmit={subscribe} className="flex gap-2">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="tu@email.com"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-emerald-500"/>
              <button type="submit" className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-medium px-4 rounded-lg">
                <Mail className="w-3.5 h-3.5"/> Suscribirse
              </button>
            </form>
          )}
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-6">
          ADUANAI — Plataforma de comercio exterior con IA · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
