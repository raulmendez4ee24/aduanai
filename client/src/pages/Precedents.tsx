import { useEffect, useState } from 'react'
import { Scale, Search, AlertTriangle, ExternalLink, FileText, X } from 'lucide-react'
import { api } from '../lib/api'
import type { LegalPrecedent } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const TYPES: { value: string; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'TFJA', label: 'TFJA — Tesis' },
  { value: 'SCJN', label: 'SCJN — Jurisprudencia' },
  { value: 'CRITERIO_SAT', label: 'Criterio SAT' },
  { value: 'CONSULTA_SAT', label: 'Consulta vinculante SAT' },
  { value: 'RESOLUCION_UPCI', label: 'Resolución UPCI (cuotas comp.)' },
  { value: 'OMA', label: 'OMA — Sistema Armonizado' },
]

const TOPICS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los temas' },
  { value: 'reclasificación', label: 'Reclasificación' },
  { value: 'subvaluación', label: 'Subvaluación' },
  { value: 'valor_aduanero', label: 'Valor aduanero' },
  { value: 'origen', label: 'Origen TMEC/TLCUEM' },
  { value: 'noms', label: 'NOMs / Anexo 2.4.1' },
  { value: 'antidumping', label: 'Cuotas compensatorias' },
  { value: 'vinculación', label: 'Vinculación Art. 71' },
  { value: 'uso_destinado', label: 'Uso destinado vs material' },
]

export function PrecedentsPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [topic, setTopic] = useState('')
  const [fraction, setFraction] = useState('')
  const [litigatedOnly, setLitigatedOnly] = useState(false)
  const [items, setItems] = useState<LegalPrecedent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<LegalPrecedent | null>(null)

  async function fetchList() {
    setLoading(true); setError('')
    try {
      const r = await api.precedentsList({
        search: search || undefined,
        type: type || undefined,
        topic: topic || undefined,
        fraction: fraction || undefined,
        litigated: litigatedOnly || undefined,
        limit: 50,
      })
      setItems(r.data)
      setTotal(r.pagination.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar precedentes')
    }
    setLoading(false)
  }

  useEffect(() => { fetchList() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Precedentes y Criterios</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">
          Tesis del TFJA, jurisprudencia SCJN, criterios SAT, decisiones OMA y resoluciones UPCI relevantes para clasificación arancelaria mexicana.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <input className="md:col-span-2 text-[13px] border border-slate-200 rounded-lg px-3 py-2"
            placeholder="Buscar por título, resumen o referencia…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') fetchList() }} />
          <select className="text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white"
            value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white"
            value={topic} onChange={e => setTopic(e.target.value)}>
            {TOPICS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3 items-center">
          <input className="text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"
            placeholder="Fracción 8 dígitos (opcional)"
            value={fraction} onChange={e => setFraction(e.target.value)} />
          <label className="flex items-center gap-2 text-[12px] text-slate-700">
            <input type="checkbox" checked={litigatedOnly} onChange={e => setLitigatedOnly(e.target.checked)}/>
            Solo casos con litigio activo
          </label>
          <button onClick={fetchList} disabled={loading}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-4 py-2 rounded-lg transition">
            <Search className="w-4 h-4"/> Buscar
          </button>
        </div>
        {error && (
          <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-rose-50 border border-rose-100">
            <AlertTriangle className="w-4 h-4 text-rose-500"/>
            <p className="text-[12px] text-rose-700">{error}</p>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-2">{total} precedente(s) encontrado(s)</p>
      </div>

      <div className="space-y-2">
        {items.map(p => (
          <PrecedentCard key={p.id} p={p} onClick={() => setSelected(p)} />
        ))}
        {items.length === 0 && !loading && (
          <div className={`${GLASS} rounded-2xl p-8 text-center`}>
            <p className="text-[12px] text-slate-500">Sin resultados con los filtros actuales.</p>
          </div>
        )}
      </div>

      {selected && <PrecedentModal p={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function PrecedentCard({ p, onClick }: { p: LegalPrecedent; onClick: () => void }) {
  const typeBadge: Record<string, string> = {
    TFJA: 'bg-violet-100 text-violet-800',
    SCJN: 'bg-rose-100 text-rose-800',
    CRITERIO_SAT: 'bg-emerald-100 text-emerald-800',
    CONSULTA_SAT: 'bg-sky-100 text-sky-800',
    RESOLUCION_UPCI: 'bg-amber-100 text-amber-800',
    OMA: 'bg-blue-100 text-blue-800',
  }
  return (
    <button onClick={onClick} className={`${GLASS} rounded-2xl p-5 w-full text-left hover:shadow-md transition`}>
      <div className="flex items-start gap-3 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadge[p.type] ?? 'bg-slate-100 text-slate-700'}`}>{p.type}</span>
        <span className="text-[10px] font-mono text-slate-500">{p.reference}</span>
        <span className="text-[10px] text-slate-400 font-mono">· {p.yearPublished}</span>
        {p.litigated && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">⚖️ litigio activo</span>}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{p.topic}</span>
      </div>
      <p className="text-[13px] font-bold text-slate-900 mt-2">{p.title}</p>
      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{p.summary}</p>
      {p.fractionCodes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.fractionCodes.slice(0, 5).map(f => (
            <span key={f} className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{f}</span>
          ))}
        </div>
      )}
    </button>
  )
}

function PrecedentModal({ p, onClose }: { p: LegalPrecedent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{p.type}</span>
              <span className="text-[10px] font-mono text-slate-500">{p.reference}</span>
              <span className="text-[10px] font-mono text-slate-400">· {p.yearPublished}</span>
              {p.litigated && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">⚖️ litigio</span>}
            </div>
            <p className="text-[15px] font-bold text-slate-900 mt-1.5">{p.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-5 space-y-3 text-[12px] text-slate-700 leading-relaxed">
          <Section title="Resumen del caso" content={p.summary} />
          <Section title="Determinación / Fallo" content={p.ruling} />
          <Section title="Razonamiento legal" content={p.reasoning} />
          {p.applicability && <Section title="Aplicabilidad práctica" content={p.applicability} accent="emerald" />}
          {p.fractionCodes.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Fracciones referidas</p>
              <div className="flex flex-wrap gap-1">
                {p.fractionCodes.map(f => (
                  <span key={f} className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{f}</span>
                ))}
              </div>
            </div>
          )}
          {p.source && (
            <div className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <ExternalLink className="w-3 h-3 mt-0.5 shrink-0"/>
              <span>Fuente: {p.source}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, content, accent }: { title: string; content: string; accent?: 'emerald' }) {
  const cls = accent === 'emerald'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : 'bg-slate-50 border-slate-200 text-slate-700'
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1 flex items-center gap-1">
        <FileText className="w-3 h-3"/>{title}
      </p>
      <p className="leading-relaxed">{content}</p>
    </div>
  )
}
