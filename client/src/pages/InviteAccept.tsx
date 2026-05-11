import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Mail, Lock, AlertCircle, ShieldCheck } from 'lucide-react'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type AcceptUser = { id: string; email: string; name: string; role: string; emailVerified: boolean; status: string }

export function InviteAcceptPage({ onLogin }: { onLogin: (token: string, user: AcceptUser) => void }) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!token) setErr('Token de invitación faltante en la URL')
  }, [token])

  async function submit() {
    setErr('')
    if (password.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres'); return }
    if (password !== confirm) { setErr('Las contraseñas no coinciden'); return }
    setLoading(true)
    try {
      const res = await api.acceptInvitation(token, password)
      onLogin(res.token, res.user)
      navigate('/app')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo aceptar la invitación')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 to-emerald-50/30">
      <div className={`${GLASS} rounded-[2rem] w-full max-w-md p-8`}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Aceptar invitación</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-6">Crea la contraseña para tu cuenta ADUANAI. Tus roles iniciales ya están asignados en el tenant.</p>

        <label className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center gap-1"><Lock className="w-3 h-3"/>Nueva contraseña</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="mín. 8 caracteres"
          className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 mt-1 mb-3 bg-white/60 outline-none focus:ring-2 focus:ring-emerald-500/30"/>

        <label className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center gap-1"><Lock className="w-3 h-3"/>Confirmar contraseña</label>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="repite la contraseña"
          className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 mt-1 mb-4 bg-white/60 outline-none focus:ring-2 focus:ring-emerald-500/30"/>

        {err && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
            <AlertCircle className="w-4 h-4 text-rose-500"/>
            <p className="text-[12px] text-rose-700">{err}</p>
          </div>
        )}

        <button onClick={submit} disabled={loading || !token}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-semibold py-2.5 rounded-full flex items-center justify-center gap-2 transition-all">
          {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Mail className="w-4 h-4"/>}
          {loading ? 'Creando cuenta…' : 'Aceptar y entrar'}
        </button>
      </div>
    </div>
  )
}
