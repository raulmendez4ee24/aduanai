import { useEffect, useState } from 'react'
import { Shield, AlertTriangle, Lock, Unlock, RefreshCw, Eye } from 'lucide-react'
import { api } from '../../lib/api'
import type { SecurityOverview, SecurityEventRecord, BlockedIPRecord, LockedUserRecord, TenantRFCFlag } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'overview' | 'events' | 'blocked' | 'locked' | 'rfcs'

const SEVERITY_PALETTE: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-800 border-rose-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-sky-100 text-sky-800 border-sky-200',
}

export function AdminSecurityPage() {
  const [tab, setTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Resumen', icon: Shield },
    { id: 'events', label: 'Eventos', icon: AlertTriangle },
    { id: 'blocked', label: 'IPs bloqueadas', icon: Lock },
    { id: 'locked', label: 'Usuarios bloqueados', icon: Lock },
    { id: 'rfcs', label: 'RFCs sospechosos', icon: AlertTriangle },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-rose-500"/>
          <h1 className="text-xl font-bold text-slate-900">Seguridad</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Eventos de abuso, IPs bloqueadas, usuarios con intentos fallidos y stats de defensa.</p>
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
      {tab === 'events' && <EventsTab/>}
      {tab === 'blocked' && <BlockedTab/>}
      {tab === 'locked' && <LockedTab/>}
      {tab === 'rfcs' && <RFCsTab/>}
    </div>
  )
}

function RFCsTab() {
  const [items, setItems] = useState<TenantRFCFlag[]>([])
  useEffect(() => { api.securityTenantsRFC().then(r => setItems(r.data)).catch(() => setItems([])) }, [])
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3">Tenants con RFC sospechoso, genérico o inválido ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-emerald-600">Todos los tenants tienen RFC válido ✓</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Tenant</th>
              <th className="py-2 text-slate-500 font-medium">RFC</th>
              <th className="py-2 text-slate-500 font-medium">Estado</th>
              <th className="py-2 text-slate-500 font-medium">Razón</th>
            </tr>
          </thead>
          <tbody>
            {items.map(t => (
              <tr key={t.id} className="border-b border-slate-100/50">
                <td className="py-2 text-slate-700">{t.name}</td>
                <td className="py-2 font-mono">{t.rfc ?? '—'}</td>
                <td className="py-2">
                  {!t.rfcValid ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">INVÁLIDO</span>
                    : t.isGeneric ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">GENÉRICO</span>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">SOSPECHOSO</span>}
                </td>
                <td className="py-2 text-slate-600">{t.rfcMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function OverviewTab() {
  const [data, setData] = useState<SecurityOverview | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try { const r = await api.securityOverview(); setData(r.data) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (!data) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Eventos hoy" value={data.events.day}/>
        <Kpi label="Bloqueos activos" value={data.blocks.active} valueColor={data.blocks.active > 0 ? 'text-rose-600' : 'text-emerald-600'}/>
        <Kpi label="Bloqueos 24h" value={data.blocks.last24h}/>
        <Kpi label="Usuarios bloqueados" value={data.lockedUsers} valueColor={data.lockedUsers > 0 ? 'text-amber-600' : 'text-slate-900'}/>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-2">Eventos por severidad (7d)</p>
          <ul className="space-y-1.5">
            {data.bySeverity.map(s => (
              <li key={s.severity} className="flex items-center justify-between text-[11px]">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SEVERITY_PALETTE[s.severity] ?? 'bg-slate-100 text-slate-700'}`}>
                  {s.severity.toUpperCase()}
                </span>
                <span className="font-mono">{s.count}</span>
              </li>
            ))}
            {data.bySeverity.length === 0 && <li className="text-[11px] text-emerald-600">Sin eventos en 7 días ✓</li>}
          </ul>
        </div>
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-2">Top tipos de eventos (7d)</p>
          <ul className="space-y-1">
            {data.byType.map(t => (
              <li key={t.type} className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-slate-700 truncate">{t.type}</span>
                <span className="font-mono text-slate-500">{t.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${GLASS} rounded-2xl p-5`}>
        <p className="text-[12px] font-semibold text-slate-700 mb-3">Logins fallidos recientes (24h)</p>
        {data.recentFailedLogins.length === 0 ? (
          <p className="text-[11px] text-emerald-600">Sin intentos fallidos ✓</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="py-1.5 text-slate-500 font-medium">Hora</th>
                <th className="py-1.5 text-slate-500 font-medium">Email</th>
                <th className="py-1.5 text-slate-500 font-medium">IP</th>
                <th className="py-1.5 text-slate-500 font-medium">Razón</th>
              </tr>
            </thead>
            <tbody>
              {data.recentFailedLogins.map(f => (
                <tr key={f.id} className="border-b border-slate-100/50">
                  <td className="py-1.5 text-slate-500 font-mono">{new Date(f.createdAt).toLocaleString('es-MX')}</td>
                  <td className="py-1.5 text-slate-700">{f.email}</td>
                  <td className="py-1.5 font-mono text-slate-500">{f.ip}</td>
                  <td className="py-1.5 text-rose-600">{f.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button onClick={load} disabled={loading} className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}/> Refrescar
      </button>
    </div>
  )
}

function EventsTab() {
  const [events, setEvents] = useState<SecurityEventRecord[]>([])
  const [type, setType] = useState('')
  const [severity, setSeverity] = useState('')
  const [ip, setIp] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    try {
      const r = await api.securityEvents({ type: type || undefined, severity: severity || undefined, ip: ip || undefined, limit: 200 })
      setEvents(r.data)
    } catch {}
  }
  useEffect(() => { load() }, [type, severity, ip])

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white" value={type} onChange={e => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="failed_login">failed_login</option>
          <option value="rate_limit_hit">rate_limit_hit</option>
          <option value="ip_blocked">ip_blocked</option>
          <option value="user_locked">user_locked</option>
          <option value="suspicious_pattern">suspicious_pattern</option>
          <option value="honeypot_triggered">honeypot_triggered</option>
          <option value="form_too_fast">form_too_fast</option>
          <option value="blocked_ip_attempt">blocked_ip_attempt</option>
        </select>
        <select className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white" value={severity} onChange={e => setSeverity(e.target.value)}>
          <option value="">Todas las severidades</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <input className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 font-mono" placeholder="IP…" value={ip} onChange={e => setIp(e.target.value)}/>
      </div>
      <div className="overflow-y-auto max-h-[600px] font-mono">
        {events.map(e => {
          const expanded = expandedId === e.id
          return (
            <div key={e.id} onClick={() => setExpandedId(expanded ? null : e.id)} className="text-[10px] py-1.5 px-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400">{new Date(e.createdAt).toLocaleString('es-MX')}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${SEVERITY_PALETTE[e.severity] ?? 'bg-slate-100 text-slate-700'}`}>{e.severity.toUpperCase()}</span>
                <span className="text-slate-700 font-semibold">{e.type}</span>
                <span className="text-slate-500">{e.ip}</span>
                {e.email && <span className="text-slate-700">{e.email}</span>}
                {e.endpoint && <span className="text-slate-500 truncate flex-1">{e.endpoint}</span>}
              </div>
              {expanded && e.details != null && (
                <pre className="mt-1.5 bg-slate-50 p-2 rounded text-[9px] whitespace-pre-wrap">{JSON.stringify(e.details, null, 2)}</pre>
              )}
            </div>
          )
        })}
        {events.length === 0 && <p className="text-center text-[12px] text-slate-400 py-8">Sin eventos con los filtros actuales</p>}
      </div>
    </div>
  )
}

function BlockedTab() {
  const [ips, setIps] = useState<BlockedIPRecord[]>([])

  async function load() {
    try { const r = await api.securityBlockedIPs(); setIps(r.data) } catch {}
  }
  useEffect(() => { load() }, [])

  async function unblock(ip: string) {
    if (!confirm(`¿Desbloquear ${ip}?`)) return
    try { await api.securityUnblockIP(ip); load() } catch {}
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3">IPs actualmente bloqueadas ({ips.length})</p>
      {ips.length === 0 ? (
        <p className="text-[12px] text-emerald-600">Ninguna IP bloqueada ✓</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">IP</th>
              <th className="py-2 text-slate-500 font-medium">Razón</th>
              <th className="py-2 text-slate-500 font-medium">Expira</th>
              <th className="py-2 text-slate-500 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {ips.map(i => (
              <tr key={i.id} className="border-b border-slate-100/50">
                <td className="py-2 font-mono">{i.ip}</td>
                <td className="py-2 text-slate-700">{i.reason}</td>
                <td className="py-2 text-slate-500 font-mono">{new Date(i.expiresAt).toLocaleString('es-MX')}</td>
                <td className="py-2 text-right">
                  <button onClick={() => unblock(i.ip)} className="inline-flex items-center gap-1 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded">
                    <Unlock className="w-3 h-3"/> Desbloquear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LockedTab() {
  const [users, setUsers] = useState<LockedUserRecord[]>([])

  async function load() {
    try { const r = await api.securityLockedUsers(); setUsers(r.data) } catch {}
  }
  useEffect(() => { load() }, [])

  async function unlock(id: string, email: string) {
    if (!confirm(`¿Desbloquear ${email}?`)) return
    try { await api.securityUnlockUser(id); load() } catch {}
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3">Usuarios con intentos fallidos / bloqueados</p>
      {users.length === 0 ? (
        <p className="text-[12px] text-emerald-600">Ningún usuario bloqueado ✓</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Email</th>
              <th className="py-2 text-slate-500 font-medium">Nombre</th>
              <th className="py-2 text-slate-500 font-medium text-right">Intentos</th>
              <th className="py-2 text-slate-500 font-medium">Bloqueado hasta</th>
              <th className="py-2 text-slate-500 font-medium">Última IP</th>
              <th className="py-2 text-slate-500 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-100/50">
                <td className="py-2 text-slate-700">{u.email}</td>
                <td className="py-2 text-slate-700">{u.name}</td>
                <td className={`py-2 text-right font-mono ${u.failedLoginAttempts >= 3 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{u.failedLoginAttempts}</td>
                <td className="py-2 text-slate-500 font-mono">{u.lockedUntil ? new Date(u.lockedUntil).toLocaleString('es-MX') : '—'}</td>
                <td className="py-2 font-mono text-slate-500">{u.lastLoginIp ?? '—'}</td>
                <td className="py-2 text-right">
                  <button onClick={() => unlock(u.id, u.email)} className="inline-flex items-center gap-1 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded">
                    <Eye className="w-3 h-3"/> Desbloquear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Kpi({ label, value, valueColor }: { label: string; value: number | string; valueColor?: string }) {
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[26px] font-bold mt-0.5 ${valueColor ?? 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
