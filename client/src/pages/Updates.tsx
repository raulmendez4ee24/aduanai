import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { TIGIEUpdateRecord, ChangelogEntry } from '../lib/api'
import { RefreshCw, Sparkles, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatFraction } from '../lib/format'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function UpdatesPage() {
  const [tab, setTab] = useState<'analyze' | 'updates' | 'changelog'>('updates')
  const [updates, setUpdates] = useState<TIGIEUpdateRecord[]>([])
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Analyze form
  const [decreeText, setDecreeText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<TIGIEUpdateRecord | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [u, c] = await Promise.allSettled([api.updaterUpdates(), api.updaterChangelog()])
      if (u.status === 'fulfilled') setUpdates(u.value.data)
      if (c.status === 'fulfilled') setChangelog(c.value.data)
      setLoading(false)
    }
    load()
  }, [])

  async function analyzeDecree() {
    if (!decreeText.trim()) return
    setAnalyzing(true); setError(''); setAnalysisResult(null)
    try {
      const res = await api.updaterAnalyzeDecree(decreeText)
      setAnalysisResult(res.data.update)
      const u = await api.updaterUpdates(); setUpdates(u.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al analizar') }
    setAnalyzing(false)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-5">
          <RefreshCw className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Actualizaciones TIGIE</h1>
        </div>

        <div className="flex gap-2 mb-6">
          {[
            { key: 'updates', label: 'Actualizaciones' },
            { key: 'analyze', label: 'Analizar Decreto' },
            { key: 'changelog', label: 'Changelog' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`text-[12px] font-medium px-4 py-2 rounded-full transition-all ${tab === t.key ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Analyze tab */}
        {tab === 'analyze' && (
          <div className="space-y-4">
            <textarea value={decreeText} onChange={e => setDecreeText(e.target.value)}
              placeholder="Pega aquí el texto del decreto del Diario Oficial de la Federación..."
              className="w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-3 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none h-48 font-mono" />
            <button onClick={analyzeDecree} disabled={analyzing || !decreeText.trim()}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
              {analyzing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analyzing ? 'Analizando con IA...' : 'Analizar decreto'}
            </button>
            {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100"><AlertCircle className="w-4 h-4 text-rose-500" /><p className="text-[12px] text-rose-700">{error}</p></div>}

            {analysisResult && (
              <div className="bg-white/40 rounded-xl p-5 space-y-3">
                <h3 className="text-[14px] font-bold text-slate-900">Análisis completado</h3>
                <p className="text-[12px] text-slate-600">{analysisResult.summary}</p>
                <div className="grid grid-cols-3 gap-3">
                  {analysisResult.fractionsCreated > 0 && <div className="bg-emerald-50/50 rounded-lg p-3 text-center border border-emerald-100"><p className="text-[18px] font-bold text-emerald-600">+{analysisResult.fractionsCreated}</p><p className="text-[10px] text-emerald-600">Creadas</p></div>}
                  {analysisResult.fractionsModified > 0 && <div className="bg-amber-50/50 rounded-lg p-3 text-center border border-amber-100"><p className="text-[18px] font-bold text-amber-600">{analysisResult.fractionsModified}</p><p className="text-[10px] text-amber-600">Modificadas</p></div>}
                  {analysisResult.fractionsSuppressed > 0 && <div className="bg-rose-50/50 rounded-lg p-3 text-center border border-rose-100"><p className="text-[18px] font-bold text-rose-600">-{analysisResult.fractionsSuppressed}</p><p className="text-[10px] text-rose-600">Suprimidas</p></div>}
                </div>
                {analysisResult.changes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-700">Cambios detectados:</p>
                    {analysisResult.changes.slice(0, 10).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] py-1.5 border-b border-slate-100/50">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.type === 'created' ? 'bg-emerald-100 text-emerald-700' : c.type === 'modified' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{c.type}</span>
                        <span className="font-mono font-semibold text-slate-800">{formatFraction(c.fractionCode)}</span>
                        <span className="text-slate-500 flex-1 truncate">{c.description || c.details}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Updates list */}
        {tab === 'updates' && (
          loading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="animate-pulse bg-slate-200/60 rounded-xl h-24" />)}</div> :
          updates.length > 0 ? (
            <div className="space-y-2">
              {updates.map(u => {
                const isExpanded = expandedId === u.id
                return (
                  <div key={u.id} className="bg-white/40 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedId(isExpanded ? null : u.id)} className="w-full flex items-center gap-4 p-4 hover:bg-white/60 transition-colors text-left">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-slate-900">{u.source}</span>
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${u.status === 'applied' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{u.status}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{u.summary}</p>
                      </div>
                      <div className="flex gap-2 text-[10px] shrink-0">
                        {u.fractionsCreated > 0 && <span className="text-emerald-600">+{u.fractionsCreated}</span>}
                        {u.fractionsModified > 0 && <span className="text-amber-600">~{u.fractionsModified}</span>}
                        {u.fractionsSuppressed > 0 && <span className="text-rose-600">-{u.fractionsSuppressed}</span>}
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        <p className="text-[12px] text-slate-600">{u.summary}</p>
                        <div className="flex gap-4 text-[11px] text-slate-500">
                          <span>Publicación: {new Date(u.publishDate).toLocaleDateString('es-MX')}</span>
                          <span>Vigencia: {new Date(u.effectiveDate).toLocaleDateString('es-MX')}</span>
                          <span>Notificados: {u.usersNotified}</span>
                        </div>
                        {u.changes.length > 0 && (
                          <div className="space-y-1">
                            {u.changes.slice(0, 8).map((c, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px] py-1 border-b border-slate-100/50">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.type === 'created' ? 'bg-emerald-100 text-emerald-700' : c.type === 'modified' ? 'bg-amber-100 text-amber-700' : c.type === 'suppressed' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{c.type}</span>
                                <span className="font-mono text-slate-800">{formatFraction(c.fractionCode)}</span>
                                <span className="text-slate-500 flex-1 truncate">{c.description || c.details}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin actualizaciones</p>
        )}

        {/* Changelog */}
        {tab === 'changelog' && (
          changelog.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="border-b border-slate-200/50">
                  <th className="text-left py-2 text-slate-500 font-medium">Fracción</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Tipo</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Campo</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Anterior</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Nuevo</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Vigencia</th>
                </tr></thead>
                <tbody>
                  {changelog.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100/50 hover:bg-white/30">
                      <td className="py-2 font-mono font-semibold text-slate-900">{formatFraction(c.fractionCode)}</td>
                      <td className="py-2"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.changeType === 'created' ? 'bg-emerald-100 text-emerald-700' : c.changeType === 'modified' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{c.changeType}</span></td>
                      <td className="py-2 text-slate-600">{c.field ?? '—'}</td>
                      <td className="py-2 text-slate-500">{c.oldValue ?? '—'}</td>
                      <td className="py-2 text-slate-700 font-medium">{c.newValue ?? '—'}</td>
                      <td className="py-2 text-slate-500">{new Date(c.effectiveDate).toLocaleDateString('es-MX')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin changelog</p>
        )}
      </div>
    </div>
  )
}
