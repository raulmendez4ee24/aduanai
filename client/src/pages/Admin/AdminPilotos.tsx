import { useState, useEffect } from 'react'
import { Rocket, Clock, Users, Zap, CheckCircle, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import type { PilotRecord } from '../../lib/api'

function daysChipClass(d: number): string {
  if (d <= 3) return 'bg-rose-100 text-rose-700'
  if (d <= 7) return 'bg-amber-100 text-amber-700'
  if (d <= 15) return 'bg-yellow-50 text-yellow-700'
  return 'bg-emerald-50 text-emerald-700'
}

export function AdminPilotosPage() {
  const [pilots, setPilots] = useState<PilotRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [extending, setExtending] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)

  async function load() {
    try {
      setError(null)
      const res = await api.adminPilots()
      setPilots(res.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleExtend(tenantId: string) {
    const input = window.prompt('¿Cuántos días extender el piloto?', '15')
    if (!input) return
    const days = parseInt(input, 10)
    if (isNaN(days) || days < 1 || days > 90) { alert('Valor inválido (1-90 días)'); return }
    setExtending(tenantId)
    try {
      await api.adminExtendPilot(tenantId, days)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al extender')
    } finally {
      setExtending(null)
    }
  }

  async function handleProcessLifecycle() {
    setActivating(true)
    try {
      const res = await api.adminProcessPilotLifecycle()
      alert(`Procesado: ${res.data.reminded15} emails 15d, ${res.data.reminded25} emails 25d, ${res.data.suspended} suspendidos`)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
          <Rocket size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Pilotos activos</h1>
          <p className="text-[12px] text-gray-400">Empresas en periodo de prueba</p>
        </div>
        <button
          onClick={handleProcessLifecycle}
          disabled={activating}
          className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-xl text-[12px] font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <Zap size={14} />
          {activating ? 'Procesando...' : 'Procesar recordatorios'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <div className="text-center text-[13px] text-gray-500 py-8">{error}</div>
      ) : pilots.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
          <Rocket size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-[14px] text-gray-500 mb-1">No hay pilotos activos</p>
          <p className="text-[12px] text-gray-400">Activa uno desde la pestaña Leads</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pilots.map(p => {
            const classifPct = p.classificationLimit ? Math.min(100, (p.classificationsUsed / p.classificationLimit) * 100) : 0
            return (
              <div key={p.id} className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-[#1a1a1a] truncate">{p.name}</h3>
                    <p className="text-[11px] text-gray-400 truncate">{p.primaryUser?.email || '—'}</p>
                  </div>
                  <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md shrink-0 ${daysChipClass(p.daysLeft)}`}>
                    {p.daysLeft}d
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-400 flex items-center gap-1"><Clock size={10} /> Clasificaciones</span>
                    <span className="text-gray-600 font-medium">{p.classificationsUsed}/{p.classificationLimit || '∞'}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${classifPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${classifPct}%` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400 flex items-center gap-1"><Users size={10} /> Usuarios</span>
                  <span className="text-gray-600 font-medium">{p.usersCount}/{p.userLimit || '∞'}</span>
                </div>

                {p.lastActivityAt && (
                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-50">
                    <span className="text-gray-400">Última actividad</span>
                    <span className="text-gray-600">{new Date(p.lastActivityAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleExtend(p.id)}
                    disabled={extending === p.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <Plus size={12} />
                    {extending === p.id ? '...' : 'Extender'}
                  </button>
                  <a
                    href={`/admin/empresas/${p.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1a1a1a] text-white text-[12px] font-medium hover:bg-[#333] transition-colors"
                  >
                    <CheckCircle size={12} />
                    Ver detalle
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
