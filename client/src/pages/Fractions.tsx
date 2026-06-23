import { useState } from 'react'
import { api } from '../lib/api'
import type { FractionSearchResult } from '../lib/api'
import { Search, Package, Eye, Bell } from 'lucide-react'
import { useTotalFractions } from '../hooks/useTotalFractions'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function FractionsPage() {
  const { formatted } = useTotalFractions()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FractionSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    try { const res = await api.searchFractions(query); setResults(res.data) } catch { setResults([]) }
    setLoading(false)
  }

  async function watch(code: string) {
    try { await api.watchFraction(code) } catch { /* silent */ }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-6">
          <Package className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Fracciones TIGIE</h1>
          <span className="text-[11px] text-slate-500 ml-2">{formatted} fracciones</span>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/60 border border-slate-200/50 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-slate-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder="Buscar por código o descripción..."
              className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none" />
          </div>
          <button onClick={handleSearch} disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-medium px-5 rounded-xl transition-colors">
            {loading ? '...' : 'Buscar'}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className={`${GLASS} rounded-[2rem] p-6`}>
          <p className="text-[12px] text-slate-500 mb-4">{results.length} resultados</p>
          <div className="space-y-2">
            {results.map((f, i) => (
              <div key={i} className="bg-white/40 rounded-xl p-4 hover:bg-white/60 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-mono text-[15px] font-bold text-slate-900">{f.codeFormatted}</p>
                    <p className="text-[12px] text-slate-600 mt-1">{f.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {f.tariffNMF !== null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">IGI: {f.tariffNMF}%</span>}
                      {f.unit && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{f.unit}</span>}
                      {f.requiresPermit && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Requiere permiso</span>}
                      {f.noms?.map((n, j) => <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{n}</span>)}
                    </div>
                  </div>
                  <button onClick={() => watch(f.code)} className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-colors shrink-0 ml-3" title="Monitorear cambios">
                    <Bell className="w-3.5 h-3.5 text-emerald-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
