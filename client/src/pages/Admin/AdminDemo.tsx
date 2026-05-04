import { useState, useEffect } from 'react'
import { Database, Trash2, RotateCcw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { TenantRecord, DemoStatus } from '../../lib/api'

interface Me {
  role?: string
}

const COUNT_LABELS: Record<keyof DemoStatus['breakdown'], string> = {
  imports: 'Importaciones temp.',
  discharges: 'Descargos',
  taxCredits: 'Créditos fiscales',
  guarantees: 'Garantías',
  certifications: 'Certificación',
  classifications: 'Clasificaciones',
  quotes: 'Cotizaciones',
  operations: 'Expedientes',
  mves: 'Manif. de valor',
  coves: 'COVE',
  loadPlans: 'Planes de carga',
  alerts: 'Alertas TIGIE',
}

const DEMO_TENANT_ID = 'demo-tenant'

export function AdminDemoPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [selected, setSelected] = useState<string>(DEMO_TENANT_ID)
  const [status, setStatus] = useState<DemoStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'load' | 'clear' | 'reset' | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isSuper = me?.role === 'SUPERADMIN'
  const isDemoTenant = selected === DEMO_TENANT_ID

  useEffect(() => {
    Promise.all([
      api.me().then(r => setMe({ role: r.data.role })),
      api.adminTenants(),
    ])
      .then(([, t]) => setTenants(t.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    api.adminDemoStatus(selected)
      .then(r => setStatus(r.data))
      .catch(() => setStatus(null))
  }, [selected, busy])

  async function refreshStatus() {
    if (!selected) return
    const r = await api.adminDemoStatus(selected)
    setStatus(r.data)
  }

  async function handleLoad() {
    if (!selected) return
    if (!confirm(`Cargar dataset demo en "${tenantName(selected)}"? Si ya hay datos demo previos, se reemplazan.`)) return
    setBusy('load')
    setToast(null)
    try {
      const r = await api.adminDemoLoad(selected)
      const total = Object.values(r.data.loaded).reduce((a, b) => a + b, 0)
      setToast({ kind: 'ok', text: `Demo cargado: ${total} registros materializados.` })
      await refreshStatus()
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error al cargar' })
    } finally {
      setBusy(null)
    }
  }

  async function handleClear() {
    if (!selected) return
    if (isDemoTenant && !isSuper) {
      setToast({ kind: 'err', text: 'Solo SUPERADMIN puede limpiar el tenant demo. Usa "Reset demo tenant".' })
      return
    }
    if (!confirm(`Borrar TODOS los datos demo de "${tenantName(selected)}"? Esta acción no se puede deshacer (los datos reales del cliente NO se tocan).`)) return
    setBusy('clear')
    setToast(null)
    try {
      const r = await api.adminDemoClear(selected)
      const total = Object.values(r.data.cleared).reduce((a, b) => a + b, 0)
      setToast({ kind: 'ok', text: `Demo limpiado: ${total} registros borrados.` })
      await refreshStatus()
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error al limpiar' })
    } finally {
      setBusy(null)
    }
  }

  async function handleReset() {
    if (!isSuper) {
      setToast({ kind: 'err', text: 'Solo SUPERADMIN puede resetear el tenant demo.' })
      return
    }
    if (!confirm('Resetear el tenant demo (Maquiladora Ejemplo)? Limpia y recarga el dataset completo.')) return
    setBusy('reset')
    setToast(null)
    try {
      const r = await api.adminDemoReset()
      const total = Object.values(r.data.loaded).reduce((a, b) => a + b, 0)
      setSelected(DEMO_TENANT_ID)
      setToast({ kind: 'ok', text: `Demo tenant reseteado: ${total} registros frescos.` })
      await refreshStatus()
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error al resetear' })
    } finally {
      setBusy(null)
    }
  }

  function tenantName(id: string): string {
    if (id === DEMO_TENANT_ID) return 'Tenant demo (Maquiladora Ejemplo)'
    const t = tenants.find(t => t.id === id)
    return t ? t.name : id
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="flex items-center justify-center h-64 text-rose-600 text-[14px]">{error}</div>

  const total = status ? Object.values(status.breakdown).reduce((a, b) => a + b, 0) : 0
  const hasDemo = total > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
          <Database size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Datos Demo</h1>
          <p className="text-[12px] text-gray-400">Cargar el dataset "Maquiladora Ejemplo SA de CV" en cualquier tenant</p>
        </div>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] ${
          toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.text}
        </div>
      )}

      {/* Tenant picker */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <label className="text-[11px] text-gray-400 uppercase tracking-wider">Tenant destino</label>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="mt-2 w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value={DEMO_TENANT_ID}>★ Tenant demo (Maquiladora Ejemplo) — siempre fresco</option>
          {tenants
            .filter(t => t.id !== DEMO_TENANT_ID)
            .map(t => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.plan} · {t.status}
              </option>
            ))}
        </select>

        {isDemoTenant && (
          <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Este es el tenant compartido para presentaciones de venta. Solo SUPERADMIN puede limpiarlo o resetearlo.
          </p>
        )}
      </div>

      {/* Status */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a]">Estado actual</h3>
          <span className={`text-[11px] px-2 py-1 rounded-full ${hasDemo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {hasDemo ? `${total} registros demo` : 'Sin datos demo'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {status && (Object.entries(status.breakdown) as [keyof DemoStatus['breakdown'], number][]).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-[11px] text-gray-400">{COUNT_LABELS[k]}</p>
              <p className="text-[16px] font-bold text-[#1a1a1a] leading-tight">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid md:grid-cols-3 gap-3">
        <button
          onClick={handleLoad}
          disabled={busy !== null}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-5 py-4 text-[13px] font-medium flex items-center justify-center gap-2 transition"
        >
          {busy === 'load' ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          Cargar datos demo
        </button>
        <button
          onClick={handleClear}
          disabled={busy !== null || !hasDemo || (isDemoTenant && !isSuper)}
          className="bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl px-5 py-4 text-[13px] font-medium flex items-center justify-center gap-2 transition"
        >
          {busy === 'clear' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          Limpiar datos demo
        </button>
        <button
          onClick={handleReset}
          disabled={busy !== null || !isSuper}
          title={isSuper ? 'Limpia y recarga el tenant demo' : 'Solo SUPERADMIN'}
          className="bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl px-5 py-4 text-[13px] font-medium flex items-center justify-center gap-2 transition"
        >
          {busy === 'reset' ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
          Reset demo tenant
        </button>
      </div>

      <div className="text-[11px] text-gray-400 leading-relaxed">
        Cargar = materializa fixtures como registros reales con flag <code className="bg-gray-100 px-1 rounded">isDemoData</code>.<br/>
        Limpiar = borra solo los registros demo del tenant — los datos reales del cliente quedan intactos.<br/>
        Reset = solo aplica al tenant demo compartido (datos siempre frescos para ventas).
      </div>
    </div>
  )
}
