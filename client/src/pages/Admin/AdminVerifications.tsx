import { useEffect, useState } from 'react'
import { ShieldCheck, Clock, AlertTriangle, Check, X, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import type { UserVerificationWithUser } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'pending' | 'verified' | 'rejected' | 'expiring'

export function AdminVerificationsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pending', label: 'Pendientes', icon: Clock },
    { id: 'verified', label: 'Verificados', icon: ShieldCheck },
    { id: 'rejected', label: 'Rechazados', icon: X },
    { id: 'expiring', label: 'Por expirar', icon: AlertTriangle },
  ]
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Verificaciones profesionales</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Aprobar/rechazar solicitudes de agentes aduanales, apoderados, importadores y consultores.</p>
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              <t.icon className="w-3.5 h-3.5"/> {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'pending' && <List status="submitted" allowActions/>}
      {tab === 'verified' && <List status="verified"/>}
      {tab === 'rejected' && <List status="rejected"/>}
      {tab === 'expiring' && <ExpiringList/>}
    </div>
  )
}

function List({ status, allowActions }: { status: string; allowActions?: boolean }) {
  const [items, setItems] = useState<UserVerificationWithUser[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = status === 'submitted' ? await api.verificationPending() : await api.verificationAll(status)
      setItems(r.data)
    } catch {}
  }
  useEffect(() => { load() }, [status])

  async function approve(id: string) {
    setBusy(true)
    try { await api.verificationApprove(id); await load() } catch {}
    setBusy(false)
  }
  async function reject(id: string) {
    const reason = prompt('Razón de rechazo (mínimo 5 caracteres):')
    if (!reason || reason.trim().length < 5) return
    setBusy(true)
    try { await api.verificationReject(id, reason); await load() } catch {}
    setBusy(false)
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3">{items.length} solicitud(es)</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-slate-400">Ninguna en este estado</p>
      ) : (
        <div className="space-y-2">
          {items.map(v => {
            const expanded = expandedId === v.id
            return (
              <div key={v.id} className="rounded-lg border border-slate-200 bg-white/60 p-3">
                <button onClick={() => setExpandedId(expanded ? null : v.id)} className="w-full text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-slate-900">{v.user.name}</span>
                    <span className="text-[11px] text-slate-500">{v.user.email}</span>
                    {v.professionalType && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">{v.professionalType}</span>}
                    {v.agentPatente && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100">Patente {v.agentPatente}</span>}
                    {v.user.tenant?.rfc && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100">RFC {v.user.tenant.rfc}</span>}
                    <span className="ml-auto text-[10px] text-slate-400">{v.submittedAt ? new Date(v.submittedAt).toLocaleString('es-MX') : '—'}</span>
                  </div>
                </button>
                {expanded && (
                  <div className="mt-3 space-y-2 text-[11px] text-slate-700">
                    <p><strong>Razón social:</strong> {v.agentSocialName ?? '—'}</p>
                    <p><strong>Aduana:</strong> {v.agentPort ?? '—'}</p>
                    <p><strong>Vence:</strong> {v.agentExpiry ? new Date(v.agentExpiry).toLocaleDateString('es-MX') : '—'}</p>
                    <p><strong>Notas:</strong> {v.notes ?? '—'}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <DocLink label="Patente" url={v.patenteDocUrl}/>
                      <DocLink label="CSF" url={v.cspDocUrl}/>
                      <DocLink label="RFC" url={v.rfcDocUrl}/>
                    </div>
                    {v.rejectionReason && (
                      <div className="rounded bg-rose-50 border border-rose-100 p-2">
                        <p className="text-[11px] text-rose-700"><strong>Rechazada:</strong> {v.rejectionReason}</p>
                      </div>
                    )}
                    {allowActions && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => approve(v.id)} disabled={busy}
                          className="text-[11px] bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3"/> Verificar
                        </button>
                        <button onClick={() => reject(v.id)} disabled={busy}
                          className="text-[11px] bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-full flex items-center gap-1">
                          <X className="w-3 h-3"/> Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <button onClick={load} className="mt-3 text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
        <RefreshCw className="w-3 h-3"/> Refrescar
      </button>
    </div>
  )
}

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) return <p className="text-[10px] text-slate-400">{label}: —</p>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 hover:underline truncate block">
      📄 {label}
    </a>
  )
}

function ExpiringList() {
  const [items, setItems] = useState<UserVerificationWithUser[]>([])
  useEffect(() => { api.verificationExpiring().then(r => setItems(r.data)).catch(() => setItems([])) }, [])
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3">Patentes que expiran en los próximos 60 días ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-emerald-600">Ninguna patente próxima a expirar ✓</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Usuario</th>
              <th className="py-2 text-slate-500 font-medium">Patente</th>
              <th className="py-2 text-slate-500 font-medium">Aduana</th>
              <th className="py-2 text-slate-500 font-medium">Expira</th>
            </tr>
          </thead>
          <tbody>
            {items.map(v => {
              const days = v.agentExpiry ? Math.ceil((new Date(v.agentExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
              return (
                <tr key={v.id} className="border-b border-slate-100/50">
                  <td className="py-2">{v.user.name} <span className="text-slate-500 text-[10px]">{v.user.email}</span></td>
                  <td className="py-2 font-mono">{v.agentPatente}</td>
                  <td className="py-2">{v.agentPort}</td>
                  <td className={`py-2 font-mono ${days != null && days <= 30 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{v.agentExpiry?.slice(0, 10)} ({days}d)</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
