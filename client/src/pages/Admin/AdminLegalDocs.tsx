import { useEffect, useState } from 'react'
import { BookOpen, Search, RefreshCw, Trash2, ExternalLink, BarChart3 } from 'lucide-react'
import { api } from '../../lib/api'
import type { LegalDocumentMeta, LegalDocsStats, CopilotQuality } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'docs' | 'stats' | 'quality'

export function AdminLegalDocsPage() {
  const [tab, setTab] = useState<Tab>('docs')
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Documentos legales (RAG Copilot)</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Corpus que el Copilot usa para responder con citas verificables. Sin RAG, el LLM alucina artículos.</p>
        <div className="flex gap-2 flex-wrap">
          {(['docs', 'stats', 'quality'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {t === 'docs' ? 'Documentos' : t === 'stats' ? 'Estadísticas' : 'Calidad Copilot'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'docs' && <DocsTab/>}
      {tab === 'stats' && <StatsTab/>}
      {tab === 'quality' && <QualityTab/>}
    </div>
  )
}

function DocsTab() {
  const [items, setItems] = useState<LegalDocumentMeta[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try { const r = await api.legalDocsList({ search: search || undefined, type: type || undefined }); setItems(r.data) } catch {}
  }
  useEffect(() => { load() }, [type])

  async function reindex() {
    if (!confirm('Re-generar embeddings de TODOS los documentos? Puede tardar varios minutos.')) return
    setBusy(true)
    try { const r = await api.legalDocsReindex(); alert(`Re-indexados ${r.data.updated} documentos`) } catch {}
    setBusy(false)
  }

  async function del(id: string) {
    if (!confirm('Desactivar documento? El Copilot dejará de citarlo.')) return
    try { await api.legalDocsDelete(id); load() } catch {}
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Buscar por título o referencia…"
          className="flex-1 min-w-[200px] text-[12px] border border-slate-200 rounded-lg px-3 py-1.5"/>
        <select value={type} onChange={e => setType(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">Todos los tipos</option>
          <option value="ley">Leyes</option>
          <option value="reglamento">Reglamentos</option>
          <option value="rgce">RGCE</option>
          <option value="tratado">Tratados</option>
          <option value="criterio_sat">Criterios SAT</option>
          <option value="tesis_tfja">Tesis TFJA</option>
          <option value="resolucion_dof">Resoluciones DOF</option>
        </select>
        <button onClick={load} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <Search className="w-3 h-3"/> Buscar
        </button>
        <button onClick={reindex} disabled={busy} className="text-[11px] bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`}/> Re-indexar embeddings
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">{items.length} documento(s)</p>
      <div className="space-y-1.5">
        {items.map(d => (
          <div key={d.id} className="rounded-lg border border-slate-200 bg-white/60 p-3">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{d.type}</span>
              <span className="text-[10px] text-slate-500 font-mono">{d.source}</span>
              {!d.isActive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">INACTIVO</span>}
              <span className="text-[10px] text-slate-400 ml-auto">{d.effectiveDate?.slice(0, 10)}</span>
            </div>
            <p className="text-[12px] font-bold text-slate-900 mt-1">{d.reference} — {d.title}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {d.topics.slice(0, 6).map(t => <span key={t} className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{t}</span>)}
              {d.fractionRefs.slice(0, 4).map(f => <span key={f} className="text-[9px] text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded font-mono">{f}</span>)}
            </div>
            <div className="flex gap-2 mt-2">
              {d.officialUrl && (
                <a href={d.officialUrl} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1">
                  <ExternalLink className="w-2.5 h-2.5"/> Ver oficial
                </a>
              )}
              <button onClick={() => del(d.id)} className="ml-auto text-[10px] text-slate-400 hover:text-rose-600 flex items-center gap-1">
                <Trash2 className="w-2.5 h-2.5"/> Desactivar
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-[12px] text-slate-400 italic py-4 text-center">Sin documentos con los filtros actuales</p>}
      </div>
    </div>
  )
}

function StatsTab() {
  const [data, setData] = useState<LegalDocsStats | null>(null)
  useEffect(() => { api.legalDocsStats().then(r => setData(r.data)).catch(() => setData(null)) }, [])
  if (!data) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="Total documentos" value={data.total}/>
        <Kpi label="Activos" value={data.active}/>
        <Kpi label="Inactivos" value={data.inactive}/>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <BreakdownCard title="Por tipo" rows={data.byType.map(t => [t.type, t.count])}/>
        <BreakdownCard title="Por fuente" rows={data.bySource.map(s => [s.source, s.count])}/>
        <BreakdownCard title="Por topic" rows={data.byTopic.slice(0, 10).map(t => [t.topic, t.count])}/>
      </div>
      {data.lastUpdate && <p className="text-[11px] text-slate-500">Última actualización: {new Date(data.lastUpdate).toLocaleString('es-MX')}</p>}
    </div>
  )
}

function QualityTab() {
  const [data, setData] = useState<CopilotQuality | null>(null)
  useEffect(() => { api.legalDocsCopilotQuality().then(r => setData(r.data)).catch(() => setData(null)) }, [])
  if (!data) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={`Consultas (${data.period})`} value={data.totalConsults}/>
        <Kpi label="Helpful rate" value={`${data.feedback.helpfulRate}%`} valueColor={data.feedback.helpfulRate >= 70 ? 'text-emerald-600' : data.feedback.helpfulRate >= 50 ? 'text-amber-600' : 'text-rose-600'}/>
        <Kpi label="Confianza promedio" value={`${data.avgConfidence}%`}/>
        <Kpi label="Docs nunca citados" value={data.neverCitedCount} valueColor={data.neverCitedCount > 10 ? 'text-amber-600' : 'text-emerald-600'}/>
      </div>
      <div className={`${GLASS} rounded-2xl p-5`}>
        <p className="text-[12px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5"/> Documentos más citados</p>
        {data.topDocsCited.length === 0 ? <p className="text-[11px] text-slate-400 italic">Sin datos aún</p> : (
          <ul className="space-y-1">
            {data.topDocsCited.map(d => (
              <li key={d.reference} className="flex justify-between text-[12px]">
                <span className="text-slate-700 font-mono">{d.reference}</span>
                <span className="font-mono text-emerald-600">{d.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, valueColor }: { label: string; value: number | string; valueColor?: string }) {
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[26px] font-bold mt-0.5 ${valueColor ?? 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function BreakdownCard({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-2">{title}</p>
      {rows.length === 0 ? <p className="text-[11px] text-slate-400 italic">Sin datos</p> : (
        <ul className="space-y-1 text-[11px]">
          {rows.map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-slate-700 truncate">{k}</span>
              <span className="font-mono text-slate-500">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
