import { useEffect, useState } from 'react'
import { Shield, CheckCircle2, XCircle, Search, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import type { TenantPadronStatusRecord, SATPadronRecord, PadronExposureReport } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'tenants' | 'by_padron' | 'pending' | 'exposure'

export function AdminPadronesPage() {
  const [tab, setTab] = useState<Tab>('tenants')
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-slate-700"/>
          <h1 className="text-xl font-bold text-slate-900">Padrones SAT — Administración</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Status de padrones por tenant, verificaciones pendientes y reporte de exposición por intentos sin padrón vigente.</p>
        <div className="flex gap-2 flex-wrap">
          {(['tenants', 'by_padron', 'pending', 'exposure'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {t === 'tenants' ? 'Estados por tenant' : t === 'by_padron' ? 'Por padrón' : t === 'pending' ? 'Verificaciones pendientes' : 'Exposición'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'tenants' && <TenantsTab/>}
      {tab === 'by_padron' && <ByPadronTab/>}
      {tab === 'pending' && <PendingTab/>}
      {tab === 'exposure' && <ExposureTab/>}
    </div>
  )
}

function TenantsTab() {
  const [items, setItems] = useState<(TenantPadronStatusRecord & { tenant: { id: string; name: string; rfc: string | null } | null })[]>([])
  const [filter, setFilter] = useState('')
  useEffect(() => { api.padronesAdminList(filter || undefined).then(r => setItems(r.data)).catch(() => setItems([])) }, [filter])

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex gap-2 mb-3">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">Todos los estados</option>
          <option value="active">Vigentes</option>
          <option value="expired">Vencidos</option>
          <option value="in_process">En proceso</option>
          <option value="suspended">Suspendidos</option>
          <option value="rejected">Rechazados</option>
        </select>
        <span className="ml-auto text-[11px] text-slate-500 self-center">{items.length} registro(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Tenant</th>
              <th className="py-2 text-slate-500 font-medium">Padrón</th>
              <th className="py-2 text-slate-500 font-medium">Estado</th>
              <th className="py-2 text-slate-500 font-medium">Vencimiento</th>
              <th className="py-2 text-slate-500 font-medium">Verificación</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => {
              const days = s.expirationDate ? Math.ceil((new Date(s.expirationDate).getTime() - Date.now()) / 86400000) : null
              return (
                <tr key={s.id} className="border-b border-slate-100/50 hover:bg-slate-50/50">
                  <td className="py-2">
                    <p className="text-slate-700 font-medium">{s.tenant?.name ?? s.tenantId.slice(0, 12)}</p>
                    {s.tenant?.rfc && <p className="font-mono text-[10px] text-slate-400">{s.tenant.rfc}</p>}
                  </td>
                  <td className="py-2">
                    {s.padron.type === 'general' ? 'General' : `Sector ${s.padron.sectorialCode}`}
                    <p className="text-[10px] text-slate-500">{s.padron.sectorialName}</p>
                  </td>
                  <td className="py-2"><StatusChip status={s.status}/></td>
                  <td className={`py-2 font-mono ${days != null && days <= 30 ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
                    {s.expirationDate ? `${new Date(s.expirationDate).toLocaleDateString('es-MX')} ${days != null ? `(${days}d)` : ''}` : '—'}
                  </td>
                  <td className="py-2 text-slate-500">{s.verifiedBy ?? '—'}</td>
                </tr>
              )
            })}
            {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400 italic">Sin registros</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ByPadronTab() {
  const [data, setData] = useState<{ padron: SATPadronRecord; total: number; breakdown: Record<string, number> }[]>([])
  useEffect(() => { api.padronesAdminByPadron().then(r => setData(r.data)).catch(() => setData([])) }, [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {data.map(d => (
        <div key={d.padron.id} className={`${GLASS} rounded-2xl p-4`}>
          <p className="text-[13px] font-semibold text-slate-900">
            {d.padron.type === 'general' ? 'Padrón General' : `Sector ${d.padron.sectorialCode}`}
            <span className="text-slate-500 ml-1 text-[11px] font-normal">— {d.padron.sectorialName}</span>
          </p>
          <p className="text-[20px] font-bold text-slate-900 mt-1">{d.total}</p>
          <p className="text-[10px] text-slate-500 mb-2">tenants registrados</p>
          {Object.entries(d.breakdown).length > 0 && (
            <div className="flex flex-wrap gap-1 text-[10px]">
              {Object.entries(d.breakdown).map(([s, c]) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{s}: {c}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PendingTab() {
  const [items, setItems] = useState<(TenantPadronStatusRecord & { tenant: { id: string; name: string; rfc: string | null } | null })[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    try { const r = await api.padronesAdminPending(); setItems(r.data) } catch { setItems([]) }
  }
  useEffect(() => { load() }, [])

  async function approve(id: string) {
    setBusy(id)
    try { await api.padronesAdminApprove(id); await load() } catch {}
    setBusy(null)
  }
  async function reject(id: string) {
    const reason = prompt('Motivo de rechazo:') ?? ''
    if (!reason) return
    setBusy(id)
    try { await api.padronesAdminReject(id, reason); await load() } catch {}
    setBusy(null)
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] text-slate-500 mb-3">{items.length} declaración(es) pendientes de verificación manual</p>
      <div className="space-y-2">
        {items.map(s => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white/60 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[12px] font-semibold text-slate-900">{s.tenant?.name ?? s.tenantId.slice(0, 12)}</p>
              {s.tenant?.rfc && <span className="font-mono text-[10px] text-slate-500">{s.tenant.rfc}</span>}
              <StatusChip status={s.status}/>
              <span className="ml-auto text-[10px] text-slate-500">{new Date(s.updatedAt).toLocaleString('es-MX')}</span>
            </div>
            <p className="text-[11px] text-slate-700 mt-1">
              {s.padron.type === 'general' ? 'Padrón General' : `Sector ${s.padron.sectorialCode} — ${s.padron.sectorialName}`}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[10px] text-slate-600 mt-1">
              <div><strong>Inscripción:</strong> {s.registrationDate ? new Date(s.registrationDate).toLocaleDateString('es-MX') : '—'}</div>
              <div><strong>Vencimiento:</strong> {s.expirationDate ? new Date(s.expirationDate).toLocaleDateString('es-MX') : '—'}</div>
              <div><strong>Constancia:</strong> {s.evidence ? '📎 adjunta' : 'sin adjuntar'}</div>
            </div>
            {s.notes && <p className="text-[10px] text-slate-500 italic mt-1">{s.notes}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => approve(s.id)} disabled={busy === s.id} className="text-[10px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2 py-1 rounded flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3"/> Aprobar
              </button>
              <button onClick={() => reject(s.id)} disabled={busy === s.id} className="text-[10px] bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-2 py-1 rounded flex items-center gap-1">
                <XCircle className="w-3 h-3"/> Rechazar
              </button>
              {s.evidence && <a href={s.evidence} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-700 hover:underline self-center">Ver constancia →</a>}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-[12px] text-slate-400 italic py-4 text-center">Sin verificaciones pendientes</p>}
      </div>
    </div>
  )
}

function ExposureTab() {
  const [tenantId, setTenantId] = useState('')
  const [report, setReport] = useState<PadronExposureReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    if (!tenantId) return
    setLoading(true); setErr('')
    try { const r = await api.padronesAdminExposure(tenantId); setReport(r.data) } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex gap-2 mb-3">
        <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="Tenant ID" className="flex-1 text-[12px] font-mono border border-slate-200 rounded-lg px-3 py-1.5"/>
        <button onClick={load} disabled={loading || !tenantId} className="text-[11px] bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <Search className="w-3 h-3"/> Calcular
        </button>
      </div>
      {err && <p className="text-[11px] text-rose-700 mb-2">{err}</p>}
      {report && (
        <div className="space-y-3">
          <div className={`rounded-xl border p-4 ${report.totalBlockingChecks > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`w-5 h-5 ${report.totalBlockingChecks > 0 ? 'text-rose-600' : 'text-emerald-600'}`}/>
              <p className="text-[14px] font-bold text-slate-900">
                {report.totalBlockingChecks > 0 ? `${report.totalBlockingChecks} intento(s) sin padrón vigente` : 'Sin exposición detectada'}
              </p>
            </div>
            {report.tenant && <p className="text-[12px] text-slate-700">{report.tenant.name} {report.tenant.rfc && <span className="font-mono text-[10px] text-slate-500">{report.tenant.rfc}</span>}</p>}
          </div>
          {report.byFraction.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="py-2 text-slate-500 font-medium">Fracción</th>
                  <th className="py-2 text-slate-500 font-medium text-right">Intentos</th>
                  <th className="py-2 text-slate-500 font-medium">Padrones faltantes</th>
                  <th className="py-2 text-slate-500 font-medium">Último</th>
                </tr>
              </thead>
              <tbody>
                {report.byFraction.map((f, i) => (
                  <tr key={i} className="border-b border-slate-100/50">
                    <td className="py-2 font-mono">{f.fractionCode}</td>
                    <td className="py-2 text-right font-bold text-rose-700">{f.attempts}</td>
                    <td className="py-2">{f.missingPadrones.join(', ')}</td>
                    <td className="py-2 text-slate-500">{new Date(f.lastCheckedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    expired: 'bg-rose-100 text-rose-800 border-rose-200',
    in_process: 'bg-sky-100 text-sky-800 border-sky-200',
    suspended: 'bg-amber-100 text-amber-800 border-amber-200',
    rejected: 'bg-rose-100 text-rose-800 border-rose-200',
    not_registered: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  const label: Record<string, string> = {
    active: 'Vigente', expired: 'Vencido', in_process: 'En proceso',
    suspended: 'Suspendido', rejected: 'Rechazado', not_registered: 'No inscrito',
  }
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${map[status] ?? map.not_registered}`}>{label[status] ?? status}</span>
}
