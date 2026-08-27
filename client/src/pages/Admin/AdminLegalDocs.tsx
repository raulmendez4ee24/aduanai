import { useEffect, useRef, useState } from 'react'
import { BookOpen, Search, RefreshCw, Trash2, ExternalLink, BarChart3, Upload, Download, Gavel } from 'lucide-react'
import { api } from '../../lib/api'
import type { LegalDocumentMeta, LegalDocsStats, CopilotQuality } from '../../lib/api'
import {
  legalDocsImportar, precedentsImportar, precedentsEstado, descargarConToken, archivoABase64,
  PLANTILLA_LEGAL_DOCS_URL, PLANTILLA_PRECEDENTES_URL, type ResultadoImportacion, type EstadoPrecedentes,
} from '../../lib/api/ola2'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'docs' | 'stats' | 'quality' | 'importar'

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
          {(['docs', 'stats', 'quality', 'importar'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {t === 'docs' ? 'Documentos' : t === 'stats' ? 'Estadísticas' : t === 'quality' ? 'Calidad Copilot' : 'Importar corpus / precedentes'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'docs' && <DocsTab/>}
      {tab === 'stats' && <StatsTab/>}
      {tab === 'quality' && <QualityTab/>}
      {tab === 'importar' && <ImportarTab/>}
    </div>
  )
}

// ── Ola 2: pipeline de carga (xlsx/csv/json) con reporte por fila ────────
function ImportarTab() {
  const [tipo, setTipo] = useState<'legal-docs' | 'precedents'>('legal-docs')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ResultadoImportacion | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [material, setMaterial] = useState<{ material: string; motivo: string }[]>([])
  const [err, setErr] = useState('')
  const [estadoPrec, setEstadoPrec] = useState<EstadoPrecedentes | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { precedentsEstado().then(r => setEstadoPrec(r.data)).catch(() => setEstadoPrec(null)) }, [res])

  async function subir(file: File) {
    setBusy(true); setErr(''); setRes(null); setAviso(null)
    try {
      const base64 = await archivoABase64(file)
      if (tipo === 'legal-docs') { const r = await legalDocsImportar(file.name, base64); setRes(r.data); setMaterial(r.materialPendiente) }
      else { const r = await precedentsImportar(file.name, base64); setRes(r.data); setAviso(r.aviso) }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error al importar') }
    setBusy(false)
  }
  const plantilla = tipo === 'legal-docs' ? PLANTILLA_LEGAL_DOCS_URL : PLANTILLA_PRECEDENTES_URL
  const ESTADO_CLS: Record<string, string> = { creado: 'bg-emerald-50 text-emerald-700', actualizado: 'bg-sky-50 text-sky-700', duplicado: 'bg-slate-100 text-slate-600', rechazado: 'bg-rose-50 text-rose-700' }
  return (
    <div className="space-y-3">
      <div className={`${GLASS} rounded-2xl p-5 space-y-3`}>
        <div className="flex gap-2 flex-wrap items-center">
          {(['legal-docs', 'precedents'] as const).map(t => (
            <button key={t} onClick={() => { setTipo(t); setRes(null) }} className={`text-[12px] font-medium px-3 py-1.5 rounded-full flex items-center gap-1 ${tipo === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
              {t === 'legal-docs' ? <><BookOpen className="w-3 h-3"/> Corpus legal (LegalDocument)</> : <><Gavel className="w-3 h-3"/> Precedentes (tesis / criterios)</>}
            </button>
          ))}
          <button onClick={() => descargarConToken(plantilla, tipo === 'legal-docs' ? 'plantilla-corpus-legal.xlsx' : 'plantilla-precedentes.xlsx').catch(e => setErr(e.message))} className="ml-auto text-[11px] bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-slate-50">
            <Download className="w-3 h-3"/> Plantilla .xlsx
          </button>
          <input ref={input} type="file" className="hidden" accept=".xlsx,.xls,.csv,.json" onChange={e => e.target.files?.[0] && subir(e.target.files[0])} />
          <button onClick={() => input.current?.click()} disabled={busy} className="text-[11px] bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
            <Upload className={`w-3 h-3 ${busy ? 'animate-pulse' : ''}`}/> {busy ? 'Importando…' : 'Importar archivo'}
          </button>
        </div>
        <div className="text-[11px] text-slate-600 leading-relaxed">
          {tipo === 'legal-docs' ? (
            <>Columnas: <code>reference*</code> (debe obtener clave: "Art. 54 LA", "Regla 7.1.6 RGCE 2026", "Anexo 22 RGCE"), <code>title*</code>, <code>source*</code>, <code>content*</code>, <code>type</code>, <code>claseTexto</code> (texto_integro | resumen), <code>version</code>, <code>fechaCotejo</code> (YYYY-MM-DD), <code>officialUrl</code>, <code>effectiveDate</code>, <code>topics</code>, <code>keywords</code>, <code>fractionRefs</code>. <strong>fechaCotejo + officialUrl son obligatorias para marcar verificado</strong>; sin ellas la fila entra como resumen no verificado. Dedupe por hash del contenido. El embedding se rechaza si el proveedor cayó a un fallback de otra dimensión (no se envenena el corpus).</>
          ) : (
            <>Columnas: <code>reference*</code> (sin placeholders "XX"), <code>title*</code>, <code>type*</code> (TFJA | SCJN | CRITERIO_SAT | CONSULTA_SAT | OMA | RESOLUCION_UPCI), <code>topic*</code>, <code>summary*</code>, <code>ruling*</code>, <code>reasoning*</code>, <code>yearPublished*</code>, <code>officialUrl</code>, <code>fechaCotejo</code>, <code>applicability</code>, <code>fractionCodes</code>, <code>chapterCodes</code>, <code>litigated</code>. Solo las filas con officialUrl + fechaCotejo cuentan como verificadas; y NADA se sirve al Clasificador/Copilot mientras <code>PRECEDENT_CORPUS_VERIFIED=false</code>.</>
          )}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
          <p className="font-semibold mb-1">Material pendiente de licencia / fuente oficial (no se carga contenido)</p>
          <ul className="list-disc ml-4 space-y-0.5">
            {(material.length ? material : [
              { material: 'Notas Explicativas del Sistema Armonizado', motivo: 'Licencia OMA/SE — pendiente de fuente oficial con permiso de uso.' },
              { material: 'RGCE 2026 íntegras (texto completo)', motivo: 'Carga verbatim por regla desde el DOF; este importador acepta reglas sueltas con fechaCotejo y officialUrl.' },
            ]).map(m => <li key={m.material}><strong>{m.material}</strong>: {m.motivo}</li>)}
          </ul>
        </div>
        {err && <p className="text-[12px] text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{err}</p>}
        {aviso && <p className="text-[12px] text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{aviso}</p>}
      </div>

      {res && (
        <div className={`${GLASS} rounded-2xl p-5`}>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
            {([['Filas', res.total], ['Creadas', res.creados], ['Actualizadas', res.actualizados], ['Duplicadas', res.duplicados], ['Rechazadas', res.rechazados], ['Verificadas', res.verificados]] as const).map(([l, v]) => (
              <div key={l} className="bg-white/60 rounded-xl p-2 text-center"><p className="text-[10px] uppercase text-slate-500">{l}</p><p className="text-[18px] font-bold text-slate-900">{v}</p></div>
            ))}
          </div>
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {res.filas.map(f => (
              <div key={f.indice} className="rounded-lg border border-slate-200 bg-white/60 px-3 py-2 text-[11px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-slate-500">#{f.indice + 1}</span>
                  <span className="font-mono font-semibold text-slate-800">{f.reference || '(sin reference)'}</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${ESTADO_CLS[f.estado]}`}>{f.estado}</span>
                  {f.estado !== 'rechazado' && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${f.verificado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{f.verificado ? 'verificado' : 'NO verificado'}</span>}
                </div>
                {f.errores.length > 0 && <p className="text-rose-700 mt-0.5">{f.errores.join(' · ')}</p>}
                {f.avisos.length > 0 && <p className="text-amber-700 mt-0.5">{f.avisos.join(' · ')}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tipo === 'precedents' && estadoPrec && (
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[12px] font-semibold text-slate-700 mb-2 flex items-center gap-2">
            Estado del corpus de precedentes
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${estadoPrec.corpusVerificado ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{estadoPrec.corpusVerificado ? 'SERVIDO' : 'APAGADO (PRECEDENT_CORPUS_VERIFIED=false)'}</span>
          </p>
          <p className="text-[11px] text-slate-600 mb-2">{estadoPrec.total} fila(s) · {estadoPrec.conFuente} con URL de fuente oficial · {estadoPrec.sinFuente} sin fuente (no citables)</p>
          <ul className="space-y-1 max-h-[300px] overflow-y-auto">
            {estadoPrec.items.map(p => (
              <li key={p.id} className="text-[11px] flex items-center gap-2 flex-wrap border-b border-slate-100 py-1">
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{p.type}</span>
                <span className="font-mono text-slate-800">{p.reference}</span>
                <span className="text-slate-600 truncate flex-1">{p.title}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.tieneFuente ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{p.tieneFuente ? `fuente${p.cotejo ? ` · cotejo ${p.cotejo}` : ''}` : 'sin fuente'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
