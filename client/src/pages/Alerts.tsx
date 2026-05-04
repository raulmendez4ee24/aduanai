import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { Alert, FractionSearchResult } from '../lib/api'
import { Megaphone, CheckCheck, Search, Bell, Eye, X } from 'lucide-react'
import { formatFraction } from '../lib/format'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function AlertsPage() {
  const [tab, setTab] = useState<'alerts' | 'watch'>('alerts')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [watched, setWatched] = useState<FractionSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FractionSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => { loadAlerts(); loadWatched() }, [])

  async function loadAlerts() {
    setLoading(true)
    try { const res = await api.alerts(); setAlerts(res.data) } catch { setAlerts([]) }
    setLoading(false)
  }

  async function loadWatched() {
    try { const res = await api.watchedFractions(); setWatched(res.data) } catch { setWatched([]) }
  }

  async function markAllRead() {
    try { await api.alertMarkAllRead(); loadAlerts() } catch {}
  }

  async function markRead(id: string) {
    try { await api.alertMarkRead(id); loadAlerts() } catch {}
  }

  async function searchFractions() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try { const res = await api.searchFractions(searchQuery); setSearchResults(res.data.slice(0, 6)) } catch { setSearchResults([]) }
    setSearching(false)
  }

  async function watchFraction(code: string) {
    try { await api.watchFraction(code); loadWatched(); setSearchResults([]) ; setSearchQuery('') } catch {}
  }

  async function unwatchFraction(code: string) {
    try { await api.unwatchFraction(code); loadWatched() } catch {}
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-emerald-500" />
            <h1 className="text-xl font-bold text-slate-900">Alertas</h1>
          </div>
          {tab === 'alerts' && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-colors">
              <CheckCheck className="w-3 h-3" /> Marcar leídas
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('alerts')} className={`text-[12px] font-medium px-4 py-2 rounded-full transition-all ${tab === 'alerts' ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
            Alertas {alerts.filter(a => !a.read).length > 0 && <span className="ml-1 text-[10px] bg-white/30 px-1.5 py-0.5 rounded-full">{alerts.filter(a => !a.read).length}</span>}
          </button>
          <button onClick={() => setTab('watch')} className={`text-[12px] font-medium px-4 py-2 rounded-full transition-all ${tab === 'watch' ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
            <Eye className="w-3 h-3 inline mr-1" /> Monitoreo ({watched.length})
          </button>
        </div>

        {/* Alerts tab */}
        {tab === 'alerts' && (
          loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="animate-pulse bg-slate-200/60 rounded-xl h-20" />)}</div>
          ) : alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} onClick={() => !a.read && markRead(a.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    a.type === 'critical' ? 'bg-rose-50/50 border-rose-100' :
                    a.type === 'warning' ? 'bg-amber-50/50 border-amber-100' :
                    'bg-blue-50/50 border-blue-100'
                  } ${!a.read ? 'ring-1 ring-emerald-200' : 'opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${a.type === 'critical' ? 'bg-rose-500' : a.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-slate-800">{a.title}</p>
                        <span className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleDateString('es-MX')}</span>
                      </div>
                      <p className="text-[12px] text-slate-600 mt-1">{a.content}</p>
                      {a.fractionCodes.length > 0 && (
                        <div className="flex gap-1.5 mt-2">
                          {a.fractionCodes.map((f, i) => <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/60 text-slate-600">{formatFraction(f)}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin alertas</p>
        )}

        {/* Watch tab */}
        {tab === 'watch' && (
          <div className="space-y-4">
            {/* Search to add */}
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white/60 border border-slate-200/50 rounded-xl px-4 py-2.5">
                <Search className="w-4 h-4 text-slate-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchFractions() }}
                  placeholder="Buscar fracción para monitorear..." className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none" />
              </div>
              <button onClick={searchFractions} disabled={searching} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-medium px-4 rounded-xl transition-colors">
                {searching ? '...' : 'Buscar'}
              </button>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="bg-white/40 rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] text-slate-500 mb-2">Selecciona para monitorear:</p>
                {searchResults.map((f, i) => (
                  <button key={i} onClick={() => watchFraction(f.code)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/60 transition-colors text-left">
                    <Bell className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-mono text-[12px] font-semibold text-slate-900">{f.codeFormatted}</span>
                    <span className="text-[11px] text-slate-500 flex-1 truncate">{f.description}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Watched list */}
            <div>
              <p className="text-[12px] font-semibold text-slate-700 mb-3">Fracciones monitoreadas ({watched.length})</p>
              {watched.length > 0 ? (
                <div className="space-y-2">
                  {watched.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/40 rounded-xl p-3">
                      <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                        <Eye className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[13px] font-semibold text-slate-900">{f.codeFormatted}</p>
                        <p className="text-[11px] text-slate-500 truncate">{f.description}</p>
                      </div>
                      {f.tariffNMF !== null && <span className="text-[10px] text-slate-400">{f.tariffNMF}% IGI</span>}
                      <button onClick={() => unwatchFraction(f.code)} className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center hover:bg-rose-100 transition-colors shrink-0">
                        <X className="w-3 h-3 text-rose-500" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[12px] text-slate-400 text-center py-6">No estás monitoreando ninguna fracción</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
