import { useEffect, useState } from 'react'
import { Shield, CheckCircle2, AlertTriangle, Anchor, Search, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../lib/api'
import type { AuditLogRecord } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

interface TimestampInfo { status: string; bitcoinBlock: number | null; contentHash: string }

const ANCHORED_ACTIONS = new Set([
  'CLASSIFICATION_CREATE', 'QUOTE_CREATE', 'PEDIMENTO_VALIDATE',
  'CERTIFICATE_ISSUE', 'EXPORT_DICTAMEN', 'VERIFY_PROFESSIONAL', 'REJECT_PROFESSIONAL',
])

export function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ entity: '', action: '', q: '' })
  const [chain, setChain] = useState<{ valid: boolean; checkedCount: number; brokenAt?: string } | null>(null)
  const [tsByLog, setTsByLog] = useState<Map<string, TimestampInfo>>(new Map())
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api.myAuditList(filters)
      setLogs(r.data)
    } catch { setLogs([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [filters.entity, filters.action])

  useEffect(() => {
    api.myAuditVerifyChain().then(r => setChain(r.data)).catch(() => setChain(null))
    api.myAuditTimestamps().then(r => {
      const m = new Map<string, TimestampInfo>()
      r.data.forEach(t => m.set(t.resourceId, { status: t.status, bitcoinBlock: t.bitcoinBlock, contentHash: t.contentHash }))
      setTsByLog(m)
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Audit Trail</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-3">
          Registro de las acciones críticas de tu empresa. Cada evento encadenado con SHA-256 + sellado de tiempo verificable vía OpenTimestamps/Bitcoin en acciones críticas. No sustituye una constancia NOM-151 (requiere un PSC autorizado).
        </p>

        {chain && (
          <div className={`rounded-xl border p-3 flex items-center gap-2 text-[12px] ${chain.valid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            {chain.valid
              ? <><CheckCircle2 className="w-4 h-4 text-emerald-600"/><span className="text-emerald-900"><strong>Cadena íntegra</strong> · {chain.checkedCount} registros verificados criptográficamente</span></>
              : <><AlertTriangle className="w-4 h-4 text-rose-600"/><span className="text-rose-900"><strong>CADENA ROTA</strong> · ruptura en {chain.brokenAt} — investigación inmediata requerida</span></>}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className={`${GLASS} rounded-2xl p-4 flex flex-wrap gap-2 items-center`}>
        <input value={filters.entity} onChange={e => setFilters({ ...filters, entity: e.target.value })}
          placeholder="Entidad (Classification, Quote…)" className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
        <input value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })}
          placeholder="Acción (CREATE, LOGIN…)" className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
        <input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Búsqueda libre…" className="flex-1 min-w-[200px] text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
        <button onClick={load} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <Search className="w-3 h-3"/> Buscar
        </button>
        <span className="text-[11px] text-slate-500">{logs.length} eventos</span>
      </div>

      {/* Tabla */}
      <div className={`${GLASS} rounded-2xl p-4 overflow-x-auto`}>
        {loading ? <p className="text-[12px] text-slate-500 text-center py-8">Cargando…</p> : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="py-2 text-slate-500 font-medium">Fecha</th>
                <th className="py-2 text-slate-500 font-medium">Usuario</th>
                <th className="py-2 text-slate-500 font-medium">Acción</th>
                <th className="py-2 text-slate-500 font-medium">Entidad</th>
                <th className="py-2 text-slate-500 font-medium">Hash</th>
                <th className="py-2 text-slate-500 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const ts = tsByLog.get(l.id)
                const isAnchored = ANCHORED_ACTIONS.has(l.action)
                return (
                  <>
                    <tr key={l.id} className="border-b border-slate-100/50 hover:bg-slate-50/50">
                      <td className="py-2 font-mono text-slate-500">{new Date(l.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' })}</td>
                      <td className="py-2">{l.user?.email ?? '—'}</td>
                      <td className="py-2">
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{l.action}</span>
                        {isAnchored && (
                          ts?.status === 'confirmed' || ts?.status === 'verified' ? (
                            <a href={`/verify/timestamp/${ts.contentHash}`} target="_blank" rel="noreferrer" title={`Anclado en bloque #${ts.bitcoinBlock}`} className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Anchor className="w-2.5 h-2.5"/>BTC ✓
                            </a>
                          ) : ts?.status === 'submitted' ? (
                            <span title="Esperando confirmación Bitcoin" className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                              <Anchor className="w-2.5 h-2.5"/>BTC…
                            </span>
                          ) : (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              <Anchor className="w-2.5 h-2.5"/>pend.
                            </span>
                          )
                        )}
                      </td>
                      <td className="py-2 font-mono text-slate-600">{l.entity}{l.entityId && <span className="text-slate-400">:{l.entityId.slice(-8)}</span>}</td>
                      <td className="py-2 font-mono text-[10px] text-slate-400">{l.hash.slice(0, 12)}…</td>
                      <td className="py-2">
                        <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="text-slate-400 hover:text-slate-700">
                          {expanded === l.id ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                        </button>
                      </td>
                    </tr>
                    {expanded === l.id && (
                      <tr className="bg-slate-50/40">
                        <td colSpan={6} className="px-3 py-3 text-[10px]">
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="text-slate-500">Endpoint:</span> <span className="font-mono">{l.method} {l.endpoint ?? '—'}</span></div>
                            <div><span className="text-slate-500">IP:</span> <span className="font-mono">{l.ipAddress ?? '—'}</span></div>
                            <div className="col-span-2 break-all"><span className="text-slate-500">hash:</span> <span className="font-mono text-[9px]">{l.hash}</span></div>
                            <div className="col-span-2 break-all"><span className="text-slate-500">prevHash:</span> <span className="font-mono text-[9px]">{l.prevHash ?? '— (génesis)'}</span></div>
                            {ts && (
                              <div className="col-span-2 mt-1 pt-2 border-t border-slate-200">
                                <p className="font-semibold text-slate-700 mb-1">Anclaje OpenTimestamps</p>
                                <div className="space-y-0.5">
                                  <div><span className="text-slate-500">Estado:</span> {ts.status}</div>
                                  {ts.bitcoinBlock && (
                                    <div><span className="text-slate-500">Bloque BTC:</span> <a href={`https://mempool.space/block/${ts.bitcoinBlock}`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline inline-flex items-center gap-0.5">#{ts.bitcoinBlock.toLocaleString('en-US')} <ExternalLink className="w-2.5 h-2.5"/></a></div>
                                  )}
                                  <div><a href={`/verify/timestamp/${ts.contentHash}`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">Verificar independientemente →</a></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {logs.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400 italic">Sin eventos registrados</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-slate-500 italic text-center">
        Todos los eventos son verificables públicamente sin confiar en ADUANAI vía /verify/timestamp/&lt;hash&gt; con el cliente oficial OpenTimestamps.
      </p>
    </div>
  )
}
