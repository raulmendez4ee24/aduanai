import { DemoTag } from '../components/DemoBanner'
import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { ClassificationRecord } from '../lib/api'
import { Clock, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { usePermissions } from '../hooks/usePermissions'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function HistoryPage() {
  const [records, setRecords] = useState<ClassificationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { can } = usePermissions()

  useEffect(() => { load() }, [page, search])

  async function load() {
    setLoading(true)
    try {
      const res = await api.classifyHistory(search || undefined, page)
      setRecords(res.data)
      setTotal(res.pagination.total)
    } catch { setRecords([]) }
    setLoading(false)
  }

  async function sendFeedback(id: string, fb: 'correct' | 'incorrect') {
    try { await api.classifyFeedback(id, fb); load() } catch {}
  }

  async function approve(id: string) {
    try { await api.classifyApprove(id); load() } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  // confidence ya viene en 0-100 desde el backend (ver format.ts)
  const confBadge = (c: number) => {
    const pct = Math.round(c)
    if (pct >= 90) return 'bg-emerald-50 text-emerald-600'
    if (pct >= 75) return 'bg-emerald-50/50 text-emerald-500'
    if (pct >= 50) return 'bg-amber-50 text-amber-600'
    return 'bg-rose-50 text-rose-600'
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-500" />
            <h1 className="text-xl font-bold text-slate-900">Historial</h1> <DemoTag />
          </div>
          <span className="text-[12px] text-slate-500">{total} clasificaciones</span>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/60 border border-slate-200/50 rounded-xl px-4 py-2.5 mb-4">
          <Search className="w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por producto o fracción..." className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none" />
        </div>

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[1fr_120px_80px_80px_100px_40px] gap-3 px-4 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200/50">
          <span>Producto</span>
          <span>Fracción</span>
          <span>Confianza</span>
          <span>Feedback</span>
          <span>Fecha</span>
          <span></span>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="space-y-2 mt-2">{[1,2,3,4,5].map(i => <div key={i} className="animate-pulse bg-slate-200/60 rounded-xl h-14" />)}</div>
        ) : records.length > 0 ? (
          <div className="mt-1">
            {records.map(r => {
              const isExpanded = expandedId === r.id
              return (
                <div key={r.id} className="border-b border-slate-100/50 last:border-b-0">
                  <button onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="w-full grid grid-cols-1 md:grid-cols-[1fr_120px_80px_80px_100px_40px] gap-2 md:gap-3 px-4 py-3 hover:bg-white/40 transition-colors text-left items-center">
                    <p className="text-[12px] text-slate-700 line-clamp-1">{r.inputDescription}</p>
                    <span className="font-mono text-[13px] font-bold text-slate-900">{formatFraction(r.fractionCode)}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block w-fit ${confBadge(r.confidence)}`}>
                      {Math.round(r.confidence)}%
                    </span>
                    <span>
                      {r.feedback === 'correct' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Sí</span>}
                      {r.feedback === 'incorrect' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">✗ No</span>}
                      {r.feedback === 'partial' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">~ Parcial</span>}
                      {!r.feedback && <span className="text-[10px] text-slate-400">—</span>}
                    </span>
                    <span className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleDateString('es-MX')}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="bg-white/40 rounded-xl p-4">
                        <p className="text-[11px] text-slate-500 mb-1">Descripción completa</p>
                        <p className="text-[13px] text-slate-800">{r.inputDescription}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/40 rounded-xl p-3">
                          <p className="text-[10px] text-slate-500">Fracción</p>
                          <p className="font-mono text-[15px] font-bold text-slate-900">{formatFraction(r.fractionCode)}</p>
                        </div>
                        <div className="bg-white/40 rounded-xl p-3">
                          <p className="text-[10px] text-slate-500">Confianza</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-slate-200/50 rounded-full h-2">
                              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, r.confidence)}%` }} />
                            </div>
                            <span className="text-[12px] font-bold text-emerald-500">{Math.round(r.confidence)}%</span>
                          </div>
                        </div>
                        <div className="bg-white/40 rounded-xl p-3">
                          <p className="text-[10px] text-slate-500">Fecha</p>
                          <p className="text-[12px] font-medium text-slate-800">{new Date(r.createdAt).toLocaleString('es-MX')}</p>
                        </div>
                      </div>
                      {r.status === 'pending_approval' && (
                        <div className="flex items-center gap-3 bg-amber-50/50 rounded-xl p-3 border border-amber-100">
                          <ShieldCheck className="w-4 h-4 text-amber-600"/>
                          <p className="text-[11px] text-amber-800 flex-1">Pendiente de aprobación SOD — un validador debe revisar antes de operar.</p>
                          {can('classifier', 'approve') && (
                            <button onClick={() => approve(r.id)} className="text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-full">
                              Aprobar
                            </button>
                          )}
                        </div>
                      )}
                      {!r.feedback && (
                        <div className="flex items-center gap-3">
                          <p className="text-[11px] text-slate-500">¿Resultado correcto?</p>
                          <button onClick={() => sendFeedback(r.id, 'correct')} className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full hover:bg-emerald-100">✓ Sí</button>
                          <button onClick={() => sendFeedback(r.id, 'incorrect')} className="text-[10px] font-medium text-rose-600 bg-rose-50 px-3 py-1 rounded-full hover:bg-rose-100">✗ No</button>
                        </div>
                      )}
                      {r.feedbackNote && (
                        <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100">
                          <p className="text-[10px] text-amber-600 font-medium">Nota: {r.feedbackNote}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin resultados</p>}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center disabled:opacity-30 hover:bg-white/80 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[12px] text-slate-500">Página {page} de {Math.ceil(total / 20)}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={records.length < 20} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center disabled:opacity-30 hover:bg-white/80 transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>
    </div>
  )
}
