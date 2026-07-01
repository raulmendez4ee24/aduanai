import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { OperationRecord, CreateOperationInput } from '../lib/api'
import { FolderOpen, Plus, X, ChevronDown, ChevronUp, FileText, CheckCircle2, Clock, Upload } from 'lucide-react'
import { formatFraction } from '../lib/format'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-amber-50 text-amber-600',
  COMPLETE: 'bg-emerald-50 text-emerald-600',
  ARCHIVED: 'bg-slate-100 text-slate-500',
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En Proceso',
  COMPLETE: 'Completo',
  ARCHIVED: 'Archivado',
}

export function OperationsPage() {
  const [operations, setOperations] = useState<OperationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailData, setDetailData] = useState<(OperationRecord & { completeness: number; missingDocuments: string[] }) | null>(null)
  const [filter, setFilter] = useState('')

  // New operation form
  const [form, setForm] = useState<CreateOperationInput>({ reference: '', type: 'IMPORT' })
  const [creating, setCreating] = useState(false)

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    try { const res = await api.operationsList(filter || undefined); setOperations(res.data) } catch { setOperations([]) }
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.reference.trim()) return
    setCreating(true)
    try {
      await api.operationCreate(form)
      setShowModal(false)
      setForm({ reference: '', type: 'IMPORT' })
      load()
    } catch { /* silent */ }
    setCreating(false)
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); setDetailData(null); return }
    setExpandedId(id)
    setDetailLoading(true)
    try { const res = await api.operationDetail(id); setDetailData(res.data) } catch { setDetailData(null) }
    setDetailLoading(false)
  }

  async function markDocUploaded(opId: string, docId: string) {
    try {
      await api.operationDocumentUpdate(opId, docId, { status: 'UPLOADED', fileName: 'documento.pdf' })
      const res = await api.operationDetail(opId)
      setDetailData(res.data)
      load()
    } catch { /* silent */ }
  }

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }))
  const inputClass = "w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-emerald-500" />
            <h1 className="text-xl font-bold text-slate-900">Expedientes</h1>
            <span className="text-[12px] text-slate-500 ml-1">{operations.length} operaciones</span>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-semibold px-4 py-2 rounded-full transition-colors">
            <Plus className="w-3.5 h-3.5" /> Nueva operación
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-4">
          {['', 'DRAFT', 'IN_PROGRESS', 'COMPLETE'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-full transition-all ${filter === s ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
              {s === '' ? 'Todos' : STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>

        {/* Operations list */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="animate-pulse bg-slate-200/60 rounded-xl h-20" />)}</div>
        ) : operations.length > 0 ? (
          <div className="space-y-2">
            {operations.map(op => {
              const docTotal = op.documents?.length ?? 0
              const docDone = op.documents?.filter(d => d.status !== 'PENDING').length ?? 0
              const pct = docTotal > 0 ? Math.round((docDone / docTotal) * 100) : 0
              const isExpanded = expandedId === op.id

              return (
                <div key={op.id} className="bg-white/40 rounded-xl overflow-hidden">
                  {/* Header row */}
                  <button onClick={() => toggleExpand(op.id)} className="w-full flex items-center gap-4 p-4 hover:bg-white/60 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[14px] font-bold text-slate-900">{op.reference}</span>
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[op.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {STATUS_LABEL[op.status] ?? op.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        {op.fractionCode && <span className="font-mono">{formatFraction(op.fractionCode)}</span>}
                        <span>{op.type === 'IMPORT' ? 'Importación' : 'Exportación'}</span>
                        <span>{new Date(op.createdAt).toLocaleDateString('es-MX')}</span>
                      </div>
                    </div>

                    {/* Doc progress */}
                    <div className="w-32 shrink-0">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-500">Docs {docDone}/{docTotal}</span>
                        <span className="font-semibold text-emerald-500">{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-200/50 rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-200/30">
                      {detailLoading ? (
                        <div className="py-6 text-center"><div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                      ) : detailData ? (
                        <div className="pt-4 space-y-4">
                          {/* Info */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {op.origin && <div><p className="text-[10px] text-slate-500">Origen</p><p className="text-[12px] font-medium text-slate-800">{op.origin}</p></div>}
                            {op.customsValue && <div><p className="text-[10px] text-slate-500">Valor</p><p className="text-[12px] font-medium text-slate-800">${op.customsValue.toLocaleString()} {op.currency}</p></div>}
                            {op.customsBroker && <div><p className="text-[10px] text-slate-500">Agente</p><p className="text-[12px] font-medium text-slate-800">{op.customsBroker}</p></div>}
                            <div><p className="text-[10px] text-slate-500">Completeness</p><p className="text-[12px] font-bold text-emerald-500">{detailData.completeness}%</p></div>
                          </div>

                          {/* Missing docs alert */}
                          {detailData.missingDocuments.length > 0 && (
                            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                              <p className="text-[11px] font-semibold text-amber-700 mb-1">Documentos faltantes:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {detailData.missingDocuments.map((d, i) => (
                                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{d}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Documents list */}
                          <div>
                            <p className="text-[12px] font-semibold text-slate-700 mb-2">Documentos</p>
                            <div className="space-y-1.5">
                              {detailData.documents?.map(doc => (
                                <div key={doc.id} className="flex items-center gap-3 bg-white/40 rounded-xl p-3">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    doc.status === 'PENDING' ? 'bg-slate-100' :
                                    doc.status === 'UPLOADED' ? 'bg-emerald-50' : 'bg-emerald-100'
                                  }`}>
                                    {doc.status === 'PENDING' ? <Clock className="w-3.5 h-3.5 text-slate-400" /> :
                                     doc.status === 'UPLOADED' ? <FileText className="w-3.5 h-3.5 text-emerald-500" /> :
                                     <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-medium text-slate-800">{doc.name}</p>
                                    <p className="text-[10px] text-slate-500">{doc.type} {doc.required ? '(requerido)' : '(opcional)'}</p>
                                  </div>
                                  {doc.status === 'PENDING' ? (
                                    <button onClick={() => markDocUploaded(op.id, doc.id)}
                                      className="flex items-center gap-1 text-[10px] font-medium text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-full hover:bg-emerald-100 transition-colors">
                                      <Upload className="w-3 h-3" /> Subir
                                    </button>
                                  ) : (
                                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                                      doc.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-600'
                                    }`}>{doc.status === 'VERIFIED' ? 'Verificado' : 'Subido'}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : <p className="text-[12px] text-slate-400 py-4 text-center">Error cargando detalle</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-[14px] font-semibold text-slate-700">Sin expedientes</p>
            <p className="text-[12px] text-slate-500 mt-1">Crea tu primera operación para empezar.</p>
            <button onClick={() => setShowModal(true)} className="mt-4 text-[11px] font-medium text-emerald-500 bg-emerald-50 px-4 py-1.5 rounded-full hover:bg-emerald-100 transition-colors">
              + Nueva operación
            </button>
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className={`${GLASS} rounded-2xl w-full max-w-lg mx-4 p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[16px] font-bold text-slate-900">Nueva Operación</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center hover:bg-white transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-slate-500 mb-1 block">Referencia / Pedimento *</label>
                <input type="text" value={form.reference} onChange={e => set('reference', e.target.value)}
                  placeholder="PED-2026-001" className={`${inputClass} font-mono`} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">Tipo</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)} className={inputClass}>
                    <option value="IMPORT">Importación</option>
                    <option value="EXPORT">Exportación</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">Fracción</label>
                  <input type="text" value={form.fractionCode ?? ''} onChange={e => set('fractionCode', e.target.value)}
                    placeholder="0000.00.00" className={`${inputClass} font-mono`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">Origen</label>
                  <input type="text" value={form.origin ?? ''} onChange={e => set('origin', e.target.value)}
                    placeholder="CN" className={inputClass} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">Valor aduanero</label>
                  <input type="number" value={form.customsValue ?? ''} onChange={e => set('customsValue', e.target.value)}
                    placeholder="10000" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 mb-1 block">Descripción</label>
                <input type="text" value={form.description ?? ''} onChange={e => set('description', e.target.value)}
                  placeholder="Importación de laptops..." className={inputClass} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 mb-1 block">Agente aduanal</label>
                <input type="text" value={form.customsBroker ?? ''} onChange={e => set('customsBroker', e.target.value)}
                  placeholder="Nombre" className={inputClass} />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="text-[12px] text-slate-600 px-4 py-2 rounded-full hover:bg-white/60 transition-colors">Cancelar</button>
              <button onClick={handleCreate} disabled={creating || !form.reference.trim()}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[12px] font-semibold px-5 py-2 rounded-full transition-colors">
                {creating ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
