import { useEffect, useState } from 'react'
import { Anchor, RefreshCw, ExternalLink, CheckCircle2, Clock, Radio, Lock, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import type { TimestampProofRecord, TimestampStats } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const STATUS_META: Record<string, { color: string; label: string; Icon: typeof Clock }> = {
  pending:   { color: 'bg-amber-100 text-amber-800 border-amber-200',   label: 'Pendiente',     Icon: Clock },
  submitted: { color: 'bg-sky-100 text-sky-800 border-sky-200',         label: 'En blockchain', Icon: Radio },
  confirmed: { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Confirmado',     Icon: CheckCircle2 },
  verified:  { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Verificado',     Icon: Lock },
  failed:    { color: 'bg-rose-100 text-rose-700 border-rose-200',       label: 'Falló',          Icon: AlertTriangle },
}

export function AdminTimestampsPage() {
  const [items, setItems] = useState<TimestampProofRecord[]>([])
  const [stats, setStats] = useState<TimestampStats | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterResource, setFilterResource] = useState('')
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    try {
      const r = await api.timestampsList({ status: filterStatus || undefined, resourceType: filterResource || undefined })
      setItems(r.data)
    } catch { setItems([]) }
    try {
      const s = await api.timestampsStats()
      setStats(s.data)
    } catch { setStats(null) }
  }

  useEffect(() => { load() }, [filterStatus, filterResource])

  async function forceCheck() {
    setRunning(true); setMsg('')
    try {
      const r = await api.timestampsCheckPending()
      setMsg(`Revisados: ${r.data.checked} · Confirmados: ${r.data.confirmed} · Re-enviados: ${r.data.reSubmitted}`)
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
    setRunning(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Anchor className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Anclajes blockchain (OpenTimestamps)</h1>
        </div>
        <p className="text-[12px] text-slate-500">
          Acciones críticas se anclan automáticamente al blockchain de Bitcoin vía OpenTimestamps — sellado de tiempo verificable públicamente. No constituye ni sustituye una constancia de conservación NOM-151-SCFI (esa la emite un Prestador de Servicios de Certificación autorizado).
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total proofs" value={stats.total.toLocaleString('es-MX')} />
          <StatCard
            label="Confirmados"
            value={(stats.byStatus.find(s => s.status === 'confirmed')?.count ?? 0).toLocaleString('es-MX')}
            tone="emerald"
          />
          <StatCard
            label="Pendientes"
            value={((stats.byStatus.find(s => s.status === 'submitted')?.count ?? 0) + (stats.byStatus.find(s => s.status === 'pending')?.count ?? 0)).toLocaleString('es-MX')}
            tone="amber"
          />
          <StatCard
            label="Tiempo promedio confirm"
            value={stats.avgConfirmationMinutes != null ? `${stats.avgConfirmationMinutes} min` : '—'}
            tone="slate"
          />
        </div>
      )}

      {stats?.lastConfirmed && stats.lastConfirmed.bitcoinBlock && (
        <div className={`${GLASS} rounded-2xl p-4 flex items-center gap-3`}>
          <CheckCircle2 className="w-5 h-5 text-emerald-600"/>
          <div className="flex-1">
            <p className="text-[12px] text-slate-700">
              Último anclaje confirmado en Bitcoin: <strong>bloque #{stats.lastConfirmed.bitcoinBlock.toLocaleString('en-US')}</strong>
              {stats.lastConfirmed.confirmedAt && <span className="text-slate-500 ml-2">({new Date(stats.lastConfirmed.confirmedAt).toLocaleString('es-MX')})</span>}
            </p>
          </div>
          <a
            href={`https://mempool.space/block/${stats.lastConfirmed.bitcoinBlock}`}
            target="_blank" rel="noreferrer"
            className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1"
          >
            mempool.space <ExternalLink className="w-3 h-3"/>
          </a>
        </div>
      )}

      {/* Filtros + acciones */}
      <div className={`${GLASS} rounded-2xl p-5`}>
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="submitted">Submitted</option>
            <option value="confirmed">Confirmado</option>
            <option value="verified">Verificado</option>
            <option value="failed">Falló</option>
          </select>
          <select value={filterResource} onChange={e => setFilterResource(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">Todos los recursos</option>
            <option value="audit_log">Audit log</option>
            <option value="classification">Clasificación</option>
            <option value="quote">Cotización</option>
            <option value="pedimento">Pedimento</option>
            <option value="certificate">Certificado</option>
            <option value="consult">Consulta</option>
            <option value="custom">Custom</option>
          </select>
          <button
            onClick={forceCheck}
            disabled={running}
            className="ml-auto text-[11px] bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${running ? 'animate-spin' : ''}`}/>
            Forzar verificación
          </button>
        </div>
        {msg && <p className="text-[11px] text-slate-600 mb-2">{msg}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="py-2 text-slate-500 font-medium">Estado</th>
                <th className="py-2 text-slate-500 font-medium">Recurso</th>
                <th className="py-2 text-slate-500 font-medium">Hash (SHA-256)</th>
                <th className="py-2 text-slate-500 font-medium">Bloque BTC</th>
                <th className="py-2 text-slate-500 font-medium">Submitted</th>
                <th className="py-2 text-slate-500 font-medium">Verif</th>
                <th className="py-2 text-slate-500 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => {
                const meta = STATUS_META[p.status] ?? STATUS_META.pending!
                const Icon = meta.Icon
                return (
                  <tr key={p.id} className="border-b border-slate-100/50 hover:bg-slate-50/50">
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.color}`}>
                        <Icon className="w-3 h-3"/>{meta.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <p className="text-slate-700">{p.resourceType}</p>
                      <p className="font-mono text-[10px] text-slate-400 truncate max-w-[160px]" title={p.resourceId}>{p.resourceId.slice(0, 12)}…</p>
                    </td>
                    <td className="py-2">
                      <a
                        href={api.timestampVerifyURL(p.contentHash)}
                        target="_blank" rel="noreferrer"
                        className="font-mono text-[10px] text-emerald-700 hover:underline"
                        title={p.contentHash}
                      >
                        {p.contentHash.slice(0, 16)}…
                      </a>
                    </td>
                    <td className="py-2 font-mono">
                      {p.bitcoinBlock ? (
                        <a href={`https://mempool.space/block/${p.bitcoinBlock}`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                          #{p.bitcoinBlock.toLocaleString('en-US')}
                        </a>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2 text-slate-500">{new Date(p.submittedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="py-2 text-center">{p.verificationCount}</td>
                    <td className="py-2 text-right">
                      <a
                        href={api.timestampDownloadURL(p.contentHash)}
                        target="_blank" rel="noreferrer"
                        className="text-[10px] text-slate-600 hover:text-emerald-700 hover:underline"
                        title="Descargar .ots proof"
                      >
                        .ots
                      </a>
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400 italic">Sin proofs registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${GLASS} rounded-2xl p-4`}>
        <p className="text-[11px] text-slate-600">
          <strong className="text-slate-900">Verificación independiente.</strong> Los proofs son verificables sin confiar en ADUANAI:
          descarga el <code className="bg-slate-100 px-1 rounded">.ots</code> y ejecuta <code className="bg-slate-100 px-1 rounded">ots verify</code> con
          el <a href="https://github.com/opentimestamps/opentimestamps-client" target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">cliente oficial</a>.
        </p>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[20px] font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}
