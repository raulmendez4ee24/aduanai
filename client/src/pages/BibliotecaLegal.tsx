import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Search, ExternalLink, ChevronLeft } from 'lucide-react'
import { api } from '../lib/api'
import type { LegalDocSummary, LegalDocFull } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function BibliotecaLegalPage() {
  const [items, setItems] = useState<LegalDocSummary[]>([])
  const [sources, setSources] = useState<{ source: string; count: number }[]>([])
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<LegalDocFull | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api.legalLibraryList({ q: q || undefined, type: type || undefined, source: source || undefined })
      setItems(r.data)
    } catch { setItems([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [type, source])
  useEffect(() => { api.legalLibrarySources().then(r => setSources(r.data)).catch(() => setSources([])) }, [])

  const TYPES = useMemo(() => [
    { v: '', n: 'Todos los tipos' },
    { v: 'ley', n: 'Leyes' },
    { v: 'rgce', n: 'RGCE' },
    { v: 'criterio', n: 'Criterios SAT' },
    { v: 'tratado', n: 'Tratados' },
    { v: 'nom', n: 'NOMs' },
  ], [])

  if (selected) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <button onClick={() => setSelected(null)} className="text-[12px] text-slate-600 hover:text-slate-900 flex items-center gap-1">
          <ChevronLeft className="w-3 h-3"/> Volver a la biblioteca
        </button>
        <div className={`${GLASS} rounded-2xl p-6`}>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">{selected.type}</span>
            <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-slate-100 text-slate-700 rounded">{selected.source}</span>
            <span className="text-[10px] text-slate-500 font-mono ml-auto">{selected.reference}</span>
          </div>
          <h1 className="text-[18px] font-bold text-slate-900 mb-2">{selected.title}</h1>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-3">
            {selected.publishedDate && <span>Publicado: {new Date(selected.publishedDate).toLocaleDateString('es-MX')}</span>}
            {selected.effectiveDate && <span>· Vigor: {new Date(selected.effectiveDate).toLocaleDateString('es-MX')}</span>}
          </div>
          <div className="prose prose-sm max-w-none">
            <p className="text-[12px] text-slate-700 whitespace-pre-wrap leading-relaxed">{selected.content}</p>
          </div>
          {selected.officialUrl && (
            <a href={selected.officialUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:underline">
              Fuente oficial <ExternalLink className="w-3 h-3"/>
            </a>
          )}
          {selected.topics.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-1">
              {selected.topics.map(t => <span key={t} className="text-[9px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">{t}</span>)}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Biblioteca Legal</h1>
        </div>
        <p className="text-[12px] text-slate-500">Consulta los documentos legales del corpus RAG: leyes, reglas RGCE, criterios SAT, tratados y NOMs.</p>
      </div>

      <div className={`${GLASS} rounded-2xl p-4 flex flex-wrap gap-2 items-center`}>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Buscar por palabra clave, artículo, tema…"
            className="w-full text-[12px] border border-slate-200 rounded-lg pl-7 pr-3 py-1.5"/>
        </div>
        <select value={type} onChange={e => setType(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          {TYPES.map(t => <option key={t.v} value={t.v}>{t.n}</option>)}
        </select>
        <select value={source} onChange={e => setSource(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">Todas las fuentes ({sources.reduce((s, x) => s + x.count, 0)})</option>
          {sources.map(s => <option key={s.source} value={s.source}>{s.source} ({s.count})</option>)}
        </select>
        <button onClick={load} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg">Buscar</button>
      </div>

      {loading ? <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando…</div> : (
        <div className="space-y-1.5">
          {items.length === 0 && <p className="text-[12px] text-slate-400 italic text-center py-6">Sin resultados</p>}
          {items.map(d => (
            <button key={d.id} onClick={() => api.legalLibraryGet(d.id).then(r => setSelected(r.data))}
              className={`${GLASS} w-full text-left rounded-xl p-3 hover:bg-white/90`}>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">{d.type}</span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">{d.source}</span>
                <span className="text-[10px] text-slate-500 font-mono ml-auto">{d.reference}</span>
              </div>
              <p className="text-[13px] font-semibold text-slate-900">{d.title}</p>
              {d.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {d.keywords.slice(0, 6).map(k => <span key={k} className="text-[9px] text-slate-500">#{k}</span>)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
