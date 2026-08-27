import { useEffect, useState } from 'react'
import { Users, Shield, AlertTriangle, FileSearch, CheckCircle2, XCircle, ChevronDown, ChevronUp, UserPlus, Mail, RotateCw, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { TenantRoleRecord, TenantUserWithRoles, PermissionAuditEntry, OEAReport, SODConflict, InvitationRecord } from '../../lib/api'
// ── OPERACIÓN 2026-08 ── alcance por cliente (Ola 1)
import { clientesApi, type Cliente } from '../../lib/api/clientes'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'users' | 'roles' | 'audit' | 'oea'

export function UsersAndRolesPage() {
  const [tab, setTab] = useState<Tab>('users')
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Usuarios y roles</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-3">Gestión de roles granulares con segregación de funciones (OEA). Asigna a cada usuario los permisos mínimos necesarios.</p>
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'users', label: 'Usuarios', icon: Users },
            { id: 'roles', label: 'Roles', icon: Shield },
            { id: 'audit', label: 'Auditoría de permisos', icon: FileSearch },
            { id: 'oea', label: 'Compliance OEA', icon: AlertTriangle },
          ] as { id: Tab; label: string; icon: typeof Users }[]).map(t => {
            const I = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${tab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                <I className="w-3.5 h-3.5"/>{t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'users' && <UsersTab/>}
      {tab === 'roles' && <RolesTab/>}
      {tab === 'audit' && <AuditTab/>}
      {tab === 'oea' && <OEATab/>}
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<TenantUserWithRoles[]>([])
  const [roles, setRoles] = useState<TenantRoleRecord[]>([])
  const [invitations, setInvitations] = useState<InvitationRecord[]>([])
  const [assignFor, setAssignFor] = useState<TenantUserWithRoles | null>(null)
  const [clientesFor, setClientesFor] = useState<TenantUserWithRoles | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true); setErr('')
    try {
      const [u, r, inv] = await Promise.all([
        api.permissionsUsers(), api.permissionsRoles(), api.permissionsInvitations(),
      ])
      setUsers(u.data); setRoles(r.data); setInvitations(inv.data)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function resendInv(id: string) {
    try { await api.permissionsInvitationResend(id); load() } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }
  async function cancelInv(id: string) {
    if (!confirm('¿Cancelar invitación?')) return
    try { await api.permissionsInvitationCancel(id); load() } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  if (loading) return <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando…</div>
  if (err) return <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-rose-700`}>{err}</div>

  const pending = invitations.filter(i => i.status === 'PENDING')

  return (
    <>
      <div className={`${GLASS} rounded-2xl p-5`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-slate-900">Usuarios del tenant ({users.length})</p>
          <button onClick={() => setShowInvite(true)} className="text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5"/>Invitar usuario
          </button>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Usuario</th>
              <th className="py-2 text-slate-500 font-medium">Rol legacy</th>
              <th className="py-2 text-slate-500 font-medium">Roles asignados</th>
              <th className="py-2 text-slate-500 font-medium">Último acceso</th>
              <th className="py-2 text-slate-500 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-100/50">
                <td className="py-2">
                  <p className="text-slate-900 font-medium">{u.name || '—'}</p>
                  <p className="font-mono text-[10px] text-slate-400">{u.email}</p>
                </td>
                <td className="py-2">
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 rounded">{u.role}</span>
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? <span className="text-[10px] text-slate-400 italic">Ninguno</span> :
                      u.roles.map(r => (
                        <span key={r.assignmentId} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                          {r.code}
                          <button onClick={async () => {
                            const role = roles.find(rr => rr.code === r.code)
                            if (!role) return
                            if (!confirm(`Remover rol ${r.name}?`)) return
                            try { await api.permissionsRemove({ userId: u.id, roleId: role.id, reason: 'manual' }); load() } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
                          }} className="hover:text-rose-700"><XCircle className="w-2.5 h-2.5"/></button>
                        </span>
                      ))
                    }
                  </div>
                </td>
                <td className="py-2 text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('es-MX') : 'nunca'}</td>
                <td className="py-2 text-right">
                  <button onClick={() => setAssignFor(u)} className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded">+ Asignar rol</button>
                  <button onClick={() => setClientesFor(u)} disabled={u.roles.length === 0} title={u.roles.length === 0 ? 'Asigna primero un rol' : 'Restringir a ciertos clientes/RFC'} className="ml-1 text-[10px] bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 text-slate-700 px-2 py-1 rounded">Clientes</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5"/>Invitaciones pendientes ({pending.length})</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="py-1.5 text-slate-500 font-medium">Email</th>
                <th className="py-1.5 text-slate-500 font-medium">Roles iniciales</th>
                <th className="py-1.5 text-slate-500 font-medium">Expira</th>
                <th className="py-1.5 text-slate-500 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(inv => (
                <tr key={inv.id} className="border-b border-slate-100/50">
                  <td className="py-1.5">
                    <p className="text-slate-800">{inv.name}</p>
                    <p className="font-mono text-[10px] text-slate-500">{inv.email}</p>
                  </td>
                  <td className="py-1.5 font-mono text-[10px]">{inv.initialRoleCodes.join(', ')}</td>
                  <td className="py-1.5 text-slate-500">{new Date(inv.expiresAt).toLocaleDateString('es-MX')}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => resendInv(inv.id)} title="Reenviar" className="text-emerald-700 hover:text-emerald-900 mr-2"><RotateCw className="w-3.5 h-3.5 inline"/></button>
                    <button onClick={() => cancelInv(inv.id)} title="Cancelar" className="text-rose-700 hover:text-rose-900"><Trash2 className="w-3.5 h-3.5 inline"/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assignFor && (
        <AssignRoleModal user={assignFor} roles={roles} onClose={() => setAssignFor(null)} onSaved={() => { setAssignFor(null); load() }}/>
      )}

      {clientesFor && (
        <AlcanceClientesModal user={clientesFor} onClose={() => setClientesFor(null)} onSaved={() => { setClientesFor(null); load() }}/>
      )}

      {showInvite && (
        <InviteUserModal roles={roles} onClose={() => setShowInvite(false)} onSaved={() => { setShowInvite(false); load() }}/>
      )}
    </>
  )
}

function InviteUserModal({ roles, onClose, onSaved }: { roles: TenantRoleRecord[]; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>(['CLASSIFIER'])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function toggleRole(code: string) {
    setSelected(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  // Detectar conflictos SOD entre los roles seleccionados
  const localConflicts: string[] = []
  for (const a of selected) {
    const ra = roles.find(r => r.code === a)
    if (!ra) continue
    for (const b of ra.conflictsWith) {
      if (selected.includes(b)) {
        const key = [a, b].sort().join(' ↔ ')
        if (!localConflicts.includes(key)) localConflicts.push(key)
      }
    }
  }

  async function save() {
    setSaving(true); setErr('')
    try {
      await api.permissionsInvite({ email, name, initialRoleCodes: selected })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className={`${GLASS} rounded-2xl w-full max-w-md mx-4 p-5`} onClick={e => e.stopPropagation()}>
        <p className="text-[14px] font-bold text-slate-900 mb-3 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-emerald-600"/>Invitar usuario al tenant</p>

        <label className="text-[10px] text-slate-500 uppercase tracking-wide">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="persona@empresa.com"
          className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5 mb-3"/>

        <label className="text-[10px] text-slate-500 uppercase tracking-wide">Nombre completo</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="María Pérez"
          className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5 mb-3"/>

        <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Roles iniciales</label>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {roles.map(r => (
            <label key={r.code} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input type="checkbox" checked={selected.includes(r.code)} onChange={() => toggleRole(r.code)} className="accent-emerald-600"/>
              <span className="font-mono">{r.code}</span>
            </label>
          ))}
        </div>

        {localConflicts.length > 0 && (
          <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-2.5 mb-3">
            <p className="text-[11px] font-bold text-rose-900 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5"/>Conflicto SOD entre roles seleccionados</p>
            <ul className="text-[10px] text-rose-800 ml-4 list-disc mt-1">
              {localConflicts.map(c => <li key={c}>{c}</li>)}
            </ul>
            <p className="text-[10px] text-rose-700 mt-1">No se permite invitar con roles en conflicto. Quita uno.</p>
          </div>
        )}

        {err && <p className="text-[11px] text-rose-700 mb-2">{err}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-[12px] text-slate-600 hover:text-slate-900 px-3 py-1.5">Cancelar</button>
          <button onClick={save} disabled={saving || !email || !name || selected.length === 0 || localConflicts.length > 0}
            className="text-[12px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5"/>{saving ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── OPERACIÓN 2026-08 ── alcance por cliente: el usuario solo ve/crea sobre estos RFC
function AlcanceClientesModal({ user, onClose, onSaved }: { user: TenantUserWithRoles; onClose: () => void; onSaved: () => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [restringir, setRestringir] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([clientesApi.listar({ incluirInactivos: true }), clientesApi.alcanceDeUsuario(user.id)])
      .then(([l, a]) => {
        setClientes(l.data)
        if (a.data.clienteIds) { setRestringir(true); setSeleccion(new Set(a.data.clienteIds)) }
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [user.id])

  function toggle(id: string) {
    setSeleccion(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function submit() {
    setSaving(true); setErr('')
    try {
      await clientesApi.fijarAlcanceDeUsuario(user.id, restringir ? Array.from(seleccion) : null)
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-[14px] font-bold text-slate-900 mb-1">Clientes visibles para {user.name || user.email}</h3>
        <p className="text-[11px] text-slate-500 mb-3">Con restricción, el usuario solo ve y crea registros de los RFC marcados (todas sus asignaciones de rol la comparten). Sin restricción ve todos los clientes de la empresa.</p>
        {loading ? <p className="text-[11px] text-slate-500">Cargando…</p> : (
          <>
            <label className="flex items-center gap-2 text-[12px] text-slate-800 mb-3">
              <input type="checkbox" checked={restringir} onChange={e => setRestringir(e.target.checked)}/>
              Restringir a ciertos clientes
            </label>
            {restringir && (
              clientes.length === 0
                ? <p className="text-[11px] text-slate-500 italic">No hay clientes registrados. Da de alta la cartera en Clientes.</p>
                : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-auto">
                    {clientes.map(c => (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-slate-50">
                        <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => toggle(c.id)}/>
                        <span className="text-slate-800">{c.razonSocial}</span>
                        <span className="font-mono text-slate-500">{c.rfc}</span>
                        {!c.activo && <span className="text-[9px] uppercase text-rose-700">baja</span>}
                      </label>
                    ))}
                  </div>
                )
            )}
            {restringir && seleccion.size === 0 && clientes.length > 0 && (
              <p className="text-[10px] text-amber-700 mt-2">Sin clientes marcados el usuario no verá ningún registro con cliente.</p>
            )}
          </>
        )}
        {err && <p className="text-[11px] text-rose-700 mt-2">{err}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="text-[11px] px-3 py-1.5 border border-slate-200 rounded-lg">Cancelar</button>
          <button onClick={submit} disabled={saving || loading} className="text-[11px] px-3 py-1.5 bg-emerald-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

function AssignRoleModal({ user, roles, onClose, onSaved }: { user: TenantUserWithRoles; roles: TenantRoleRecord[]; onClose: () => void; onSaved: () => void }) {
  const [selectedRole, setSelectedRole] = useState<string>(roles[0]?.code ?? '')
  const [reason, setReason] = useState('')
  const [conflict, setConflict] = useState<SODConflict | null>(null)
  const [forceOverride, setForceOverride] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!selectedRole) return
    api.permissionsCheckConflict(user.id, selectedRole).then(r => setConflict(r.data)).catch(() => setConflict(null))
  }, [selectedRole, user.id])

  async function save() {
    setSaving(true); setErr('')
    try {
      const r = await api.permissionsAssign({ userId: user.id, roleCode: selectedRole, reason: reason || undefined, forceOverrideConflict: forceOverride })
      void r
      onSaved()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setErr(msg)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className={`${GLASS} rounded-2xl w-full max-w-md mx-4 p-5`} onClick={e => e.stopPropagation()}>
        <p className="text-[14px] font-bold text-slate-900 mb-1">Asignar rol</p>
        <p className="text-[11px] text-slate-500 mb-4">Para <strong>{user.name || user.email}</strong></p>

        <label className="text-[10px] text-slate-500 uppercase tracking-wide">Rol</label>
        <select value={selectedRole} onChange={e => { setSelectedRole(e.target.value); setForceOverride(false) }} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5 mb-3">
          {roles.map(r => <option key={r.code} value={r.code}>{r.code} — {r.name}</option>)}
        </select>

        <label className="text-[10px] text-slate-500 uppercase tracking-wide">Motivo (opcional)</label>
        <input value={reason} onChange={e => setReason(e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5 mb-3"/>

        {conflict?.hasConflict && (
          <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 mb-3">
            <p className="text-[12px] font-bold text-rose-900 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5"/>Conflicto SOD detectado</p>
            <p className="text-[11px] text-rose-800 mt-1">El rol seleccionado entra en conflicto con:</p>
            <ul className="text-[11px] text-rose-800 ml-4 list-disc mt-1">
              {conflict.conflictingRoles.map(r => <li key={r.id}><strong>{r.code}</strong> — {r.name}</li>)}
            </ul>
            <label className="flex items-center gap-2 text-[10px] mt-2 text-rose-900">
              <input type="checkbox" checked={forceOverride} onChange={e => setForceOverride(e.target.checked)} className="accent-rose-700"/>
              Aceptar conflicto y registrar override (queda en audit OEA)
            </label>
          </div>
        )}

        {err && <p className="text-[11px] text-rose-700 mb-2">{err}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-[12px] text-slate-600 hover:text-slate-900 px-3 py-1.5">Cancelar</button>
          <button onClick={save} disabled={saving || (conflict?.hasConflict === true && !forceOverride)} className="text-[12px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
            {saving ? 'Guardando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RolesTab() {
  const [roles, setRoles] = useState<TenantRoleRecord[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  useEffect(() => { api.permissionsRoles().then(r => setRoles(r.data)).catch(() => setRoles([])) }, [])

  return (
    <div className="space-y-2">
      {roles.map(r => (
        <div key={r.id} className={`${GLASS} rounded-2xl p-4`}>
          <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="w-full text-left flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-slate-500">{r.code}</span>
                {r.isSystem && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">Sistema</span>}
                {r.isCustom && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">Custom</span>}
                {r.conflictsWith.length > 0 && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">SOD: {r.conflictsWith.join(', ')}</span>}
              </div>
              <p className="text-[13px] font-semibold text-slate-900 mt-1">{r.name}</p>
              {r.description && <p className="text-[11px] text-slate-600 mt-0.5">{r.description}</p>}
            </div>
            {expanded === r.id ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
          </button>
          {expanded === r.id && (
            <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-2 text-[10px]">
              {Object.entries(r.permissions.modules ?? {}).map(([mod, actions]) => (
                <div key={mod} className="bg-white/40 rounded p-2">
                  <p className="font-semibold text-slate-700 mb-1">{mod}</p>
                  {Object.entries(actions).map(([a, v]) => (
                    <div key={a} className="flex items-center gap-1 text-[10px]">
                      {v ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600"/> : <XCircle className="w-2.5 h-2.5 text-slate-300"/>}
                      <span className={v ? 'text-slate-700' : 'text-slate-400'}>{a}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AuditTab() {
  const [items, setItems] = useState<PermissionAuditEntry[]>([])
  const [filter, setFilter] = useState('')
  useEffect(() => { api.permissionsAudit({ action: filter || undefined }).then(r => setItems(r.data)).catch(() => setItems([])) }, [filter])

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex gap-2 mb-3">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">Todas las acciones</option>
          <option value="ROLE_ASSIGNED">Rol asignado</option>
          <option value="ROLE_REMOVED">Rol removido</option>
          <option value="PERMISSION_DENIED">Permiso denegado</option>
          <option value="ROLE_CREATED">Rol creado</option>
          <option value="ROLE_UPDATED">Rol modificado</option>
        </select>
        <span className="ml-auto text-[11px] text-slate-500 self-center">{items.length} eventos</span>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left border-b border-slate-100">
            <th className="py-2 text-slate-500 font-medium">Fecha</th>
            <th className="py-2 text-slate-500 font-medium">Acción</th>
            <th className="py-2 text-slate-500 font-medium">Por</th>
            <th className="py-2 text-slate-500 font-medium">Sobre</th>
            <th className="py-2 text-slate-500 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id} className="border-b border-slate-100/50">
              <td className="py-1.5 font-mono text-slate-500">{new Date(i.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td className="py-1.5"><span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${i.action === 'PERMISSION_DENIED' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{i.action}</span></td>
              <td className="py-1.5">{i.actor?.email ?? i.userId.slice(0, 8)}</td>
              <td className="py-1.5">{i.target?.email ?? (i.role ? <span className="font-mono">{i.role.code}</span> : '—')}</td>
              <td className="py-1.5 text-[10px] text-slate-600 font-mono truncate max-w-[300px]">{JSON.stringify(i.details)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400 italic">Sin eventos</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function OEATab() {
  const [report, setReport] = useState<OEAReport | null>(null)
  useEffect(() => { api.permissionsOEAReport().then(r => setReport(r.data)).catch(() => setReport(null)) }, [])
  if (!report) return <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando reporte OEA…</div>

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Conflictos SOD" value={report.sodConflicts.usersWithConflicts.length.toString()} tone={report.sodConflicts.usersWithConflicts.length > 0 ? 'rose' : 'emerald'}/>
        <Card label="Usuarios con roles" value={report.sodConflicts.totalUsersChecked.toString()}/>
        <Card label="Denegaciones (30d)" value={report.activity.permissionDenials.toString()}/>
        <Card label="Asignaciones (30d)" value={report.activity.roleAssignments.toString()}/>
      </div>

      {report.sodConflicts.usersWithConflicts.length > 0 && (
        <div className={`${GLASS} rounded-2xl p-5 border-2 border-rose-300`}>
          <p className="text-[13px] font-bold text-rose-900 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4"/>Usuarios con conflictos SOD activos
          </p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left border-b border-rose-200">
                <th className="py-1.5 text-rose-700 font-medium">Usuario</th>
                <th className="py-1.5 text-rose-700 font-medium">Roles</th>
                <th className="py-1.5 text-rose-700 font-medium">Conflictos</th>
              </tr>
            </thead>
            <tbody>
              {report.sodConflicts.usersWithConflicts.map(u => (
                <tr key={u.userId} className="border-b border-rose-200/40">
                  <td className="py-1.5">{u.email}</td>
                  <td className="py-1.5 font-mono">{u.roles.map(r => r.code).join(', ')}</td>
                  <td className="py-1.5 text-rose-700 font-mono">{u.conflicts.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`${GLASS} rounded-2xl p-5`}>
        <p className="text-[13px] font-semibold text-slate-900 mb-3">Distribución de roles</p>
        <div className="flex flex-wrap gap-2">
          {report.roleDistribution.map(r => (
            <span key={r.code} className="text-[11px] px-2.5 py-1 bg-slate-100 rounded-full">{r.code}: <strong>{r.count}</strong></span>
          ))}
          {report.roleDistribution.length === 0 && <span className="text-[11px] text-slate-400 italic">Sin asignaciones</span>}
        </div>
      </div>

      {report.recommendations.length > 0 && (
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[13px] font-semibold text-slate-900 mb-2">Recomendaciones</p>
          <ul className="text-[11px] text-slate-700 space-y-1 list-disc ml-5">
            {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-slate-500 italic text-center">Generado: {new Date(report.generatedAt).toLocaleString('es-MX')}</p>
    </div>
  )
}

function Card({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'emerald' }) {
  const cls = tone === 'rose' ? 'text-rose-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[20px] font-bold ${cls}`}>{value}</p>
    </div>
  )
}
