import { useEffect, useState } from 'react'
import { Building2, Save, CheckCircle2, Users, Calendar } from 'lucide-react'
import { api } from '../../lib/api'
import type { TenantSettings, TenantUser } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function EmpresaPage() {
  const [data, setData] = useState<TenantSettings | null>(null)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [name, setName] = useState('')
  const [rfc, setRfc] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    try {
      const r = await api.settingsEmpresa()
      setData(r.data)
      setName(r.data.name)
      setRfc(r.data.rfc ?? '')
    } catch { setData(null) }
    try { const u = await api.settingsUsers(); setUsers(u.data) } catch {}
  }
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      await api.settingsEmpresaUpdate({ name: name || undefined, rfc: rfc || undefined })
      setMsg({ type: 'success', text: 'Datos actualizados' })
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Error' })
    }
    setSaving(false)
  }

  if (!data) return <div className={`${GLASS} max-w-3xl mx-auto rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando…</div>

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-slate-700"/>
          <h1 className="text-xl font-bold text-slate-900">Mi empresa</h1>
        </div>
        <p className="text-[12px] text-slate-500">Datos del tenant, plan, uso y usuarios.</p>
      </div>

      {/* Datos básicos editables */}
      <div className={`${GLASS} rounded-2xl p-5 space-y-3`}>
        <p className="text-[13px] font-semibold text-slate-900">Datos básicos</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Razón social</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full mt-0.5 text-[13px] border border-slate-200 rounded-lg px-3 py-1.5"/>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">RFC</label>
            <input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" className="w-full mt-0.5 text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-1.5"/>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="text-[12px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
            <Save className="w-3 h-3"/> {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {msg && <p className={`text-[11px] ${msg.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
        </div>
      </div>

      {/* Plan + uso */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Plan" value={data.plan} hint={data.status}/>
        <Card label="Usuarios" value={data.userCount.toString()} hint={data.userLimit ? `/ ${data.userLimit}` : 'sin límite'}/>
        <Card label="Clasificaciones" value={data.classificationCount.toLocaleString('es-MX')} hint={data.classificationLimit ? `/ ${data.classificationLimit}` : 'sin límite'}/>
        <Card label="Cotizaciones" value={data.quoteCount.toLocaleString('es-MX')}/>
      </div>

      {/* Estado contractual */}
      <div className={`${GLASS} rounded-2xl p-5`}>
        <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1"><Calendar className="w-4 h-4"/> Estado contractual</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
          <Field label="Plan actual">{data.plan}</Field>
          <Field label="Status">{data.status}</Field>
          {data.pilotStartedAt && <Field label="Piloto iniciado">{new Date(data.pilotStartedAt).toLocaleDateString('es-MX')}</Field>}
          {data.pilotEndsAt && <Field label="Piloto vence">{new Date(data.pilotEndsAt).toLocaleDateString('es-MX')}</Field>}
          {data.contractStartedAt && <Field label="Contrato iniciado">{new Date(data.contractStartedAt).toLocaleDateString('es-MX')}</Field>}
          {data.contractEndsAt && <Field label="Contrato vence">{new Date(data.contractEndsAt).toLocaleDateString('es-MX')}</Field>}
          {data.monthlyPrice != null && <Field label="Mensualidad">${data.monthlyPrice.toLocaleString('es-MX')} MXN</Field>}
          <Field label="Health score"><span className={data.healthScore >= 70 ? 'text-emerald-700' : data.healthScore >= 40 ? 'text-amber-700' : 'text-rose-700'}>{data.healthScore}/100</span></Field>
          {data.lastActivityAt && <Field label="Última actividad">{new Date(data.lastActivityAt).toLocaleString('es-MX')}</Field>}
          {data.contractModules.length > 0 && <Field label="Módulos contratados" full>{data.contractModules.join(', ')}</Field>}
        </div>
      </div>

      {/* Usuarios */}
      <div className={`${GLASS} rounded-2xl p-5`}>
        <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1">
          <Users className="w-4 h-4"/> Usuarios de la empresa ({users.length})
        </p>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-1.5 text-slate-500 font-medium">Nombre</th>
              <th className="py-1.5 text-slate-500 font-medium">Email</th>
              <th className="py-1.5 text-slate-500 font-medium">Rol</th>
              <th className="py-1.5 text-slate-500 font-medium">Verificado</th>
              <th className="py-1.5 text-slate-500 font-medium">Último login</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-100/50">
                <td className="py-1.5">{u.name || '—'}</td>
                <td className="py-1.5 font-mono">{u.email}</td>
                <td className="py-1.5"><span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 rounded">{u.role}</span></td>
                <td className="py-1.5">{u.emailVerified ? <CheckCircle2 className="w-3 h-3 text-emerald-600"/> : '—'}</td>
                <td className="py-1.5 text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-[20px] font-bold text-slate-900">{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <span className="text-slate-500">{label}: </span>
      <span className="text-slate-900 font-medium">{children}</span>
    </div>
  )
}
