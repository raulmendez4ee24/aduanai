import { DemoTag } from '../components/DemoBanner'
import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { Alert, FractionSearchResult } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { Megaphone, CheckCheck, Search, Bell, Eye, X, AlertTriangle, AlertCircle, Info, Clock, RefreshCw, Check, Bell as BellIcon, ArrowRight } from 'lucide-react'
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
  const [regenerating, setRegenerating] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<'' | 'critical' | 'high' | 'medium' | 'low'>('')
  const navigate = useNavigate()

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

  async function acknowledgeAlert(id: string) {
    try { await api.alertAcknowledge(id); loadAlerts() } catch {}
  }

  async function snoozeAlert(id: string, days = 7) {
    try { await api.alertSnooze(id, days); loadAlerts() } catch {}
  }

  async function resolveAlert(id: string) {
    try { await api.alertResolve(id); loadAlerts() } catch {}
  }

  async function ignoreAlert(id: string) {
    try { await api.alertIgnore(id); loadAlerts() } catch {}
  }

  async function regenerate() {
    setRegenerating(true)
    try { await api.alertsRegenerate(); await loadAlerts() } catch {}
    setRegenerating(false)
  }

  function executeAction(a: Alert) {
    if (!a.suggestedAction) return
    const route = (a.suggestedAction.payload as Record<string, unknown> | undefined)?.route as string | undefined
    if (route) {
      acknowledgeAlert(a.id)
      navigate(route)
    }
  }

  const filteredAlerts = severityFilter
    ? alerts.filter(a => a.severity === severityFilter)
    : alerts

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
            <h1 className="text-xl font-bold text-slate-900">Alertas</h1> <DemoTag />
          </div>
          {tab === 'alerts' && (
            <div className="flex items-center gap-2">
              <button onClick={regenerate} disabled={regenerating}
                className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 bg-violet-50 px-3 py-1.5 rounded-full hover:bg-violet-100 disabled:opacity-50 transition-colors">
                <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`}/> {regenerating ? 'Calculando...' : 'Recalcular alertas'}
              </button>
              <button onClick={markAllRead} className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-colors">
                <CheckCheck className="w-3 h-3" /> Marcar leídas
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('alerts')} className={`text-[12px] font-medium px-4 py-2 rounded-full transition-all ${tab === 'alerts' ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
            {/* BUG-8 (24-ago-2026): la píldora contaba "no leídas" mientras
                "Todas" contaba activas — resolver una alerta leída bajaba una
                y no la otra. Ambas derivan ahora del mismo estado: activas. */}
            Alertas {alerts.length > 0 && <span className="ml-1 text-[10px] bg-white/30 px-1.5 py-0.5 rounded-full">{alerts.length}</span>}
          </button>
          <button onClick={() => setTab('watch')} className={`text-[12px] font-medium px-4 py-2 rounded-full transition-all ${tab === 'watch' ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
            <Eye className="w-3 h-3 inline mr-1" /> Monitoreo ({watched.length})
          </button>
        </div>

        {/* Alerts tab */}
        {tab === 'alerts' && (
          <>
            {/* Filtros por severidad */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {(['', 'critical', 'high', 'medium', 'low'] as const).map(s => {
                const count = s ? alerts.filter(a => a.severity === s).length : alerts.length
                return (
                  <button key={s || 'all'} onClick={() => setSeverityFilter(s)}
                    className={`text-[11px] font-medium px-3 py-1.5 rounded-full transition ${severityFilter === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {s === '' ? `Todas (${count})` : s === 'critical' ? `🚨 Críticas (${count})` : s === 'high' ? `⚠️ Altas (${count})` : s === 'medium' ? `🟡 Medias (${count})` : `🔵 Bajas (${count})`}
                  </button>
                )
              })}
            </div>

            {loading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="animate-pulse bg-slate-200/60 rounded-xl h-32" />)}</div>
            ) : filteredAlerts.length > 0 ? (
              <div className="space-y-2">
                {filteredAlerts.map(a => (
                  <SmartAlertCard
                    key={a.id}
                    alert={a}
                    onMarkRead={() => markRead(a.id)}
                    onAcknowledge={() => acknowledgeAlert(a.id)}
                    onSnooze={(days) => snoozeAlert(a.id, days)}
                    onResolve={() => resolveAlert(a.id)}
                    onIgnore={() => ignoreAlert(a.id)}
                    onAction={() => executeAction(a)}
                  />
                ))}
              </div>
            ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin alertas activas. Clic en "Recalcular alertas" para regenerar.</p>}
          </>
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

interface SmartCardProps {
  alert: Alert
  onMarkRead: () => void
  onAcknowledge: () => void
  onSnooze: (days: number) => void
  onResolve: () => void
  onIgnore: () => void
  onAction: () => void
}

function SmartAlertCard({ alert: a, onMarkRead, onAcknowledge, onSnooze, onResolve, onIgnore, onAction }: SmartCardProps) {
  const palette = {
    critical: { card: 'bg-rose-50 border-rose-300', text: 'text-rose-900', accent: 'text-rose-600', dot: 'bg-rose-500', label: 'CRÍTICA', icon: AlertCircle },
    high:     { card: 'bg-orange-50 border-orange-200', text: 'text-orange-900', accent: 'text-orange-600', dot: 'bg-orange-500', label: 'ALTA', icon: AlertTriangle },
    medium:   { card: 'bg-amber-50 border-amber-200', text: 'text-amber-900', accent: 'text-amber-600', dot: 'bg-amber-500', label: 'MEDIA', icon: BellIcon },
    low:      { card: 'bg-sky-50 border-sky-200', text: 'text-sky-900', accent: 'text-sky-600', dot: 'bg-sky-500', label: 'BAJA', icon: Info },
  }[a.severity] ?? { card: 'bg-slate-50 border-slate-200', text: 'text-slate-900', accent: 'text-slate-600', dot: 'bg-slate-400', label: '', icon: Info }
  const Icon = palette.icon

  const impactBadge = a.estimatedImpactMXN != null && a.impactType
    ? a.impactType === 'savings'
      ? <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">+ ${Math.round(a.estimatedImpactMXN).toLocaleString('es-MX')} MXN ahorro</span>
      : a.impactType === 'cost'
        ? <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">− ${Math.round(Math.abs(a.estimatedImpactMXN)).toLocaleString('es-MX')} MXN exposición</span>
        : <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">⚠ Riesgo</span>
    : null

  return (
    <div onClick={() => !a.read && onMarkRead()}
      className={`p-4 rounded-2xl border-2 transition-all ${palette.card} ${!a.read ? 'shadow-sm' : 'opacity-70'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 ${palette.dot} rounded-lg flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4 text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${palette.dot} text-white`}>{palette.label}</span>
            {a.daysToDue != null && (
              <span className={`text-[10px] font-mono flex items-center gap-1 ${a.daysToDue <= 7 ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
                <Clock className="w-3 h-3"/>{a.daysToDue >= 0 ? `${a.daysToDue}d` : 'vencida'}
              </span>
            )}
            {a.affectedFraction && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 text-slate-700 border border-slate-200">
                {formatFraction(a.affectedFraction)}
              </span>
            )}
            <span className="text-[10px] text-slate-400 ml-auto">{new Date(a.createdAt).toLocaleDateString('es-MX')}</span>
          </div>

          <p className={`text-[13px] font-bold ${palette.text} leading-tight`}>{a.title}</p>

          {impactBadge && <div className="mt-1.5">{impactBadge}</div>}

          <p className="text-[12px] text-slate-700 mt-1.5 leading-relaxed">{a.content}</p>

          {a.actionRequired && (
            <div className="mt-2 rounded-lg bg-white/70 border border-white px-3 py-1.5">
              <p className={`text-[11px] font-semibold ${palette.accent}`}>→ {a.actionRequired}</p>
            </div>
          )}

          {a.affectedOperations.length > 0 && (
            <p className="text-[10px] text-slate-500 mt-1.5">
              Afecta {a.affectedOperations.length} operación{a.affectedOperations.length === 1 ? '' : 'es'} del tenant
            </p>
          )}

          {/* Acciones */}
          <div className="flex flex-wrap gap-1.5 mt-3" onClick={e => e.stopPropagation()}>
            {a.suggestedAction && (
              <button onClick={onAction}
                className={`flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-full text-white ${palette.dot} hover:opacity-90 transition`}>
                {a.suggestedAction.label} <ArrowRight className="w-3 h-3"/>
              </button>
            )}
            <button onClick={onResolve}
              className="flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition">
              <Check className="w-3 h-3"/> Marcar resuelta
            </button>
            <button onClick={() => onSnooze(7)}
              className="flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition">
              <Clock className="w-3 h-3"/> Posponer 7 días
            </button>
            {!a.acknowledged && (
              <button onClick={onAcknowledge}
                className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                Visto
              </button>
            )}
            <button onClick={onIgnore}
              className="text-[11px] font-medium px-3 py-1.5 rounded-full text-slate-400 hover:text-rose-600 transition">
              Ignorar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
