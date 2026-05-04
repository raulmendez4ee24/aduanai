import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import type { KnowledgeRecord, KnowledgeType } from '../../lib/api'
import { Plus, CheckCircle2, Trash2, Edit3, Upload, AlertTriangle, X, Search, BookOpen } from 'lucide-react'
import { formatFraction } from '../../lib/format'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const TYPE_OPTIONS: KnowledgeType[] = [
  'CASO_CLASIFICACION', 'CRITERIO_SAT', 'RESOLUCION_SCJN', 'NOTA_EXPLICATIVA_OMA',
  'NOTA_LEGAL', 'REGLA_SECTOR', 'ERROR_COMUN', 'PRECEDENTE', 'CONSULTA_SAT',
]

const TYPE_LABELS: Record<KnowledgeType, string> = {
  CASO_CLASIFICACION: 'Caso',
  CRITERIO_SAT: 'Criterio SAT',
  RESOLUCION_SCJN: 'Resolución SCJN',
  NOTA_EXPLICATIVA_OMA: 'Nota OMA',
  NOTA_LEGAL: 'Nota Legal',
  REGLA_SECTOR: 'Regla Sector',
  ERROR_COMUN: 'Error Común',
  PRECEDENTE: 'Precedente',
  CONSULTA_SAT: 'Consulta SAT',
}

const TYPE_COLORS: Record<KnowledgeType, string> = {
  CASO_CLASIFICACION: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CRITERIO_SAT: 'bg-blue-50 text-blue-700 border-blue-100',
  RESOLUCION_SCJN: 'bg-purple-50 text-purple-700 border-purple-100',
  NOTA_EXPLICATIVA_OMA: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  NOTA_LEGAL: 'bg-amber-50 text-amber-700 border-amber-100',
  REGLA_SECTOR: 'bg-teal-50 text-teal-700 border-teal-100',
  ERROR_COMUN: 'bg-rose-50 text-rose-700 border-rose-100',
  PRECEDENTE: 'bg-slate-50 text-slate-700 border-slate-200',
  CONSULTA_SAT: 'bg-sky-50 text-sky-700 border-sky-100',
}

type FormState = Partial<KnowledgeRecord> & { keywordsInput?: string; productsInput?: string }

export function AdminKnowledgePage() {
  const [items, setItems] = useState<KnowledgeRecord[]>([])
  const [accuracy, setAccuracy] = useState<{ chapter: string; total: number; correct: number; accuracy: number; alert: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterChapter, setFilterChapter] = useState('')
  const [filterVerified, setFilterVerified] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<KnowledgeRecord | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null)

  async function loadData() {
    try {
      setError('')
      setLoading(true)
      const [list, acc] = await Promise.all([
        api.knowledgeList({
          type: filterType || undefined,
          chapter: filterChapter || undefined,
          verified: filterVerified === '' ? undefined : filterVerified === 'true',
          search: search || undefined,
        }),
        api.knowledgeAccuracy(),
      ])
      setItems(list.data)
      setAccuracy(acc.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = useMemo(() => accuracy.filter(a => a.alert), [accuracy])

  async function handleVerify(id: string) {
    try {
      await api.knowledgeVerify(id)
      await loadData()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este conocimiento?')) return
    try {
      await api.knowledgeDelete(id)
      await loadData()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }

  async function handleImport() {
    try {
      setImportResult(null)
      const parsed = JSON.parse(importText)
      const arr = Array.isArray(parsed) ? parsed : parsed.items
      if (!Array.isArray(arr)) throw new Error('El JSON debe ser un array o tener .items')
      const res = await api.knowledgeImport(arr)
      setImportResult({ created: res.created, errors: res.errors })
      await loadData()
    } catch (e) {
      setImportResult({ created: 0, errors: [e instanceof Error ? e.message : 'Error'] })
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-500" />
            <h1 className="text-xl font-bold text-slate-900">Base de Conocimiento</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="flex items-center gap-2 text-[12px] font-medium px-4 py-2 rounded-full bg-white/60 border border-slate-200 hover:bg-white">
              <Upload className="w-3.5 h-3.5" /> Importar
            </button>
            <button onClick={() => { setEditing(null); setShowForm(true) }} className="flex items-center gap-2 text-[12px] font-medium px-4 py-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600">
              <Plus className="w-3.5 h-3.5" /> Agregar conocimiento
            </button>
          </div>
        </div>

        {/* Alerts por precisión baja */}
        {alerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {alerts.map(a => (
              <div key={a.chapter} className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <p className="text-[12px] text-rose-700">{a.alert}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadData() }}
              placeholder="Buscar título, contenido, fracción..."
              className="w-full bg-white/60 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]">
            <option value="">Todos los tipos</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <input value={filterChapter} onChange={e => setFilterChapter(e.target.value)} placeholder="Cap (ej: 61)" className="bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
          <div className="flex gap-2">
            <select value={filterVerified} onChange={e => setFilterVerified(e.target.value)} className="flex-1 bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]">
              <option value="">Todos</option>
              <option value="true">Verificados</option>
              <option value="false">Sin verificar</option>
            </select>
            <button onClick={loadData} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-medium">Filtrar</button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className={`${GLASS} rounded-[2rem] overflow-hidden`}>
        {error && <div className="p-4 bg-rose-50 text-rose-700 text-[12px] border-b border-rose-100">{error}</div>}
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-[13px]">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-[13px]">Sin registros</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(k => (
              <div key={k.id} className="p-4 md:p-5 hover:bg-white/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[k.type]}`}>{TYPE_LABELS[k.type]}</span>
                      {k.fractionCode && <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{formatFraction(k.fractionCode)}</span>}
                      {k.chapterCode && !k.fractionCode && <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Cap {k.chapterCode}</span>}
                      <span className="text-[10px] text-slate-500">P{k.priority}</span>
                      {k.verified ? (
                        <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verificado</span>
                      ) : (
                        <span className="text-[10px] font-medium text-amber-600">Sin verificar</span>
                      )}
                    </div>
                    <p className="text-[13px] font-semibold text-slate-900 mb-1">{k.title}</p>
                    <p className="text-[12px] text-slate-600 whitespace-pre-wrap line-clamp-3">{k.content}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Fuente: {k.source}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!k.verified && (
                      <button onClick={() => handleVerify(k.id)} title="Verificar" className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </button>
                    )}
                    <button onClick={() => { setEditing(k); setShowForm(true) }} title="Editar" className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 flex items-center justify-center">
                      <Edit3 className="w-4 h-4 text-slate-600" />
                    </button>
                    <button onClick={() => handleDelete(k.id)} title="Eliminar" className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 flex items-center justify-center">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal formulario */}
      {showForm && (
        <KnowledgeFormModal
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={async () => { setShowForm(false); setEditing(null); await loadData() }}
        />
      )}

      {/* Modal importar */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className={`${GLASS} rounded-[2rem] p-6 max-w-2xl w-full max-h-[85vh] overflow-auto`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Importar JSON masivo</h2>
              <button onClick={() => { setShowImport(false); setImportResult(null) }}><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <p className="text-[12px] text-slate-500 mb-3">Pega un array JSON con objetos {`{ type, title, content, source, keywords, ... }`}</p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder='[{"type":"CASO_CLASIFICACION","title":"...","content":"...","source":"...","keywords":["..."]}]'
              className="w-full h-64 bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[12px] font-mono outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <button onClick={handleImport} className="px-4 py-2 bg-emerald-500 text-white rounded-full text-[13px] font-medium">Importar</button>
            </div>
            {importResult && (
              <div className="mt-3 p-3 rounded-xl bg-white/60 border border-slate-100">
                <p className="text-[12px] text-slate-700 font-medium">✓ Creados: {importResult.created}</p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-rose-600 mb-1">Errores ({importResult.errors.length}):</p>
                    <ul className="text-[11px] text-rose-700 space-y-0.5">
                      {importResult.errors.slice(0, 10).map((err, i) => <li key={i}>• {err}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KnowledgeFormModal({ initial, onClose, onSaved }: { initial: KnowledgeRecord | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(() => ({
    type: initial?.type ?? 'CASO_CLASIFICACION',
    fractionCode: initial?.fractionCode ?? '',
    chapterCode: initial?.chapterCode ?? '',
    sectionCode: initial?.sectionCode ?? '',
    title: initial?.title ?? '',
    content: initial?.content ?? '',
    source: initial?.source ?? '',
    priority: initial?.priority ?? 5,
    verified: initial?.verified ?? false,
    keywordsInput: (initial?.keywords ?? []).join(', '),
    productsInput: (initial?.products ?? []).join(', '),
  }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    if (!form.type || !form.title || !form.content || !form.source) {
      setErr('type, title, content y source son obligatorios')
      return
    }
    setSaving(true)
    try {
      const payload: Partial<KnowledgeRecord> = {
        type: form.type as KnowledgeType,
        title: form.title,
        content: form.content,
        source: form.source,
        fractionCode: form.fractionCode || null,
        chapterCode: form.chapterCode || null,
        sectionCode: form.sectionCode || null,
        priority: Number(form.priority) || 5,
        verified: !!form.verified,
        keywords: (form.keywordsInput ?? '').split(',').map(s => s.trim()).filter(Boolean),
        products: (form.productsInput ?? '').split(',').map(s => s.trim()).filter(Boolean),
      }
      if (initial) {
        await api.knowledgeUpdate(initial.id, payload)
      } else {
        await api.knowledgeCreate(payload)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className={`${GLASS} rounded-[2rem] p-6 max-w-2xl w-full max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">{initial ? 'Editar' : 'Nuevo'} conocimiento</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Tipo *</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as KnowledgeType })} className="w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]">
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Prioridad (1-10)</label>
              <input type="number" min={1} max={10} value={form.priority ?? 5} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} className="w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input value={form.fractionCode ?? ''} onChange={e => setForm({ ...form, fractionCode: e.target.value })} placeholder="Fracción (ej: 6109.10.01)" className="bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
            <input value={form.chapterCode ?? ''} onChange={e => setForm({ ...form, chapterCode: e.target.value })} placeholder="Capítulo (ej: 61)" className="bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
            <input value={form.sectionCode ?? ''} onChange={e => setForm({ ...form, sectionCode: e.target.value })} placeholder="Sección" className="bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
          </div>

          <input value={form.title ?? ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título *" className="w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
          <textarea value={form.content ?? ''} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Contenido * (razonamiento completo)" className="w-full h-40 bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px] resize-none" />
          <input value={form.source ?? ''} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Fuente *" className="w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
          <input value={form.keywordsInput ?? ''} onChange={e => setForm({ ...form, keywordsInput: e.target.value })} placeholder="Keywords separados por coma" className="w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
          <input value={form.productsInput ?? ''} onChange={e => setForm({ ...form, productsInput: e.target.value })} placeholder="Productos ejemplo separados por coma" className="w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />

          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={!!form.verified} onChange={e => setForm({ ...form, verified: e.target.checked })} />
            Marcar como verificado
          </label>

          {err && <p className="text-[12px] text-rose-600">{err}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-full text-[13px] text-slate-600 hover:bg-white/40">Cancelar</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-full bg-emerald-500 text-white text-[13px] font-medium disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
