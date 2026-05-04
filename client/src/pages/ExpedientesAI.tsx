import { useEffect, useState, useRef } from 'react'
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, Sparkles, GitMerge, Link as LinkIcon, ChevronRight, Trash2, Edit3 } from 'lucide-react'
import { api } from '../lib/api'
import type { DocumentAIRecord, DocumentBatchItem, CrossAuditResultRecord, OperationRecord } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const DOCTYPE_LABELS: Record<string, string> = {
  factura: 'Factura comercial',
  pedimento: 'Pedimento',
  bl: 'Bill of Lading',
  awb: 'Air Waybill',
  packing_list: 'Packing list',
  certificado_origen: 'Certificado de origen',
  cove: 'COVE',
  mve: 'Manifestación de valor',
  carta_porte: 'Carta porte CFDI',
  nom: 'NOM',
  otro: 'Otro',
}

const DOCTYPE_COLOR: Record<string, string> = {
  factura: 'bg-emerald-50 text-emerald-700',
  pedimento: 'bg-amber-50 text-amber-700',
  bl: 'bg-sky-50 text-sky-700',
  awb: 'bg-sky-50 text-sky-700',
  packing_list: 'bg-violet-50 text-violet-700',
  certificado_origen: 'bg-emerald-50 text-emerald-700',
  cove: 'bg-rose-50 text-rose-700',
  mve: 'bg-rose-50 text-rose-700',
  carta_porte: 'bg-blue-50 text-blue-700',
  nom: 'bg-slate-100 text-slate-700',
  otro: 'bg-slate-100 text-slate-500',
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result as string
      res(r.split(',')[1] ?? '')
    }
    reader.onerror = rej
    reader.readAsDataURL(file)
  })
}

export function ExpedientesAIPage() {
  const [docs, setDocs] = useState<DocumentAIRecord[]>([])
  const [operations, setOperations] = useState<OperationRecord[]>([])
  const [groups, setGroups] = useState<{ ref: string; documentIds: string[] }[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<DocumentBatchItem[] | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [selected, setSelected] = useState<DocumentAIRecord | null>(null)
  const [audit, setAudit] = useState<CrossAuditResultRecord | null>(null)
  const [activeTab, setActiveTab] = useState<'docs' | 'audit' | 'timeline' | 'groups'>('docs')
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  async function refresh() {
    try {
      const [d, o, g] = await Promise.all([
        api.documentsList(),
        api.operationsList().catch(() => ({ data: [] as OperationRecord[] })),
        api.documentsGroupSuggest().catch(() => ({ data: { groups: [] } })),
      ])
      setDocs(d.data)
      setOperations((o as { data: OperationRecord[] }).data ?? [])
      setGroups(g.data.groups)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }
  useEffect(() => { refresh() }, [])

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).slice(0, 50)
    if (files.length === 0) return
    setUploading(true); setError(''); setUploadResults(null); setProgress({ current: 0, total: files.length })

    try {
      const payload: { name: string; mimeType: string; base64: string }[] = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const b64 = await fileToBase64(f)
        payload.push({ name: f.name, mimeType: f.type || 'application/octet-stream', base64: b64 })
        setProgress({ current: i + 1, total: files.length })
      }
      const r = await api.documentsUploadBatch(payload)
      setUploadResults(r.data.results)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error subiendo archivos')
    } finally {
      setUploading(false)
    }
  }

  async function handleAudit(operationId: string) {
    try {
      const r = await api.crossAudit(operationId)
      setAudit(r.data)
      setActiveTab('audit')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error en audit') }
  }

  function operationName(id: string | null | undefined): string {
    if (!id) return '— sin vincular'
    const op = operations.find(o => o.id === id)
    return op ? `${op.reference} (${op.status})` : id.slice(-8)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Expedientes con extracción IA</h1>
        </div>

        {/* Drag & drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          className={`rounded-2xl border-2 border-dashed transition-all p-8 text-center cursor-pointer
            ${dragOver ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-300 bg-slate-50/40 hover:bg-slate-100/40'}`}
          onClick={() => fileInput.current?.click()}
        >
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.xml"
            onChange={e => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
          <Upload className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
          <p className="text-[14px] font-semibold text-slate-700">Arrastra documentos aquí o click para seleccionar</p>
          <p className="text-[11px] text-slate-500 mt-1">PDF, JPG, PNG, XML — hasta 50 documentos por batch</p>
          <p className="text-[10px] text-slate-400 mt-2">La IA detectará el tipo (factura, pedimento, BL, etc.) y extraerá los campos automáticamente.</p>
        </div>

        {uploading && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-emerald-700 bg-emerald-50/70 rounded-xl px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Procesando {progress.current}/{progress.total} documento(s) con IA…
          </div>
        )}

        {uploadResults && (
          <div className="mt-3 space-y-1">
            {uploadResults.map(r => (
              <div key={r.index} className={`text-[11px] px-3 py-1.5 rounded-lg ${r.ok ? (r.cached ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700') : 'bg-rose-50 text-rose-700'}`}>
                {r.ok
                  ? <>✓ Documento {r.index + 1}: <strong>{r.document?.docType}</strong> — confianza {r.document?.confidence}% {r.cached && '(cache)'} {r.linked && r.operationId ? <span className="ml-2"><LinkIcon className="w-2.5 h-2.5 inline"/> vinculado a operación</span> : ''}</>
                  : <>✗ Documento {r.index + 1}: {r.error}</>}
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-[12px] text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {/* Tabs */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex gap-2 mb-4">
          {[
            { k: 'docs', l: `Documentos (${docs.length})` },
            { k: 'audit', l: 'Auditoría cruzada' },
            { k: 'timeline', l: 'Timeline' },
            { k: 'groups', l: `Grupos sugeridos (${groups.length})` },
          ].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k as typeof activeTab)}
              className={`text-[12px] font-medium px-4 py-2 rounded-full whitespace-nowrap ${activeTab === t.k ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {activeTab === 'docs' && (
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-2 max-h-[600px] overflow-y-auto">
              {docs.length === 0 && <p className="text-[12px] text-slate-400 text-center py-8">Sin documentos. Sube algunos para empezar.</p>}
              {docs.map(d => (
                <div key={d.id} onClick={() => setSelected(d)}
                  className={`rounded-xl border p-3 cursor-pointer transition ${selected?.id === d.id ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 bg-white/50 hover:bg-white/70'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-slate-500"/>
                    <span className="text-[12px] font-semibold text-slate-800 truncate flex-1">{d.fileName ?? d.name}</span>
                    {d.docType && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DOCTYPE_COLOR[d.docType] ?? 'bg-slate-100 text-slate-500'}`}>
                      {DOCTYPE_LABELS[d.docType] ?? d.docType}
                    </span>}
                    {d.confidence != null && <span className="text-[10px] font-mono text-slate-500">{d.confidence}%</span>}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>{d.fileSize ? `${Math.round(d.fileSize / 1024)} KB` : ''}</span>
                    <span className="font-mono">{d.fileHash?.slice(0, 10)}…</span>
                    <span className="ml-auto">{operationName(d.operationId)}</span>
                    {d.operationId && <button onClick={(e) => { e.stopPropagation(); handleAudit(d.operationId!) }} className="text-violet-600 hover:text-violet-700 flex items-center gap-1"><Sparkles className="w-3 h-3"/>auditar</button>}
                  </div>
                </div>
              ))}
            </div>

            {/* Detalle a la derecha */}
            <div className="md:col-span-1">
              {selected ? (
                <div className="rounded-xl bg-white/60 border border-slate-200 p-4 sticky top-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{selected.fileName}</p>
                    <Edit3 className="w-3.5 h-3.5 text-slate-400 cursor-pointer" title="Editar (próximamente)"/>
                  </div>
                  <div className="text-[11px] space-y-1.5">
                    <div><span className="text-slate-500">Tipo IA:</span> <span className="font-semibold">{selected.docType ?? '—'}</span> ({selected.confidence}%)</div>
                    <div><span className="text-slate-500">Hash:</span> <span className="font-mono text-[10px]">{selected.fileHash?.slice(0, 16)}…</span></div>
                    <div><span className="text-slate-500">Operación:</span> {operationName(selected.operationId)}</div>
                  </div>
                  {selected.extractedData && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold text-slate-700 mb-1">Datos extraídos</p>
                      <pre className="bg-slate-50 rounded-lg p-2 text-[10px] overflow-x-auto max-h-[300px]">{JSON.stringify(selected.extractedData, null, 2)}</pre>
                    </div>
                  )}
                  {selected.aiErrors && Array.isArray(selected.aiErrors) && selected.aiErrors.length > 0 && (
                    <div className="mt-3 text-[11px] text-rose-700">
                      <p className="font-semibold">Errores IA</p>
                      <ul className="list-disc ml-4">{selected.aiErrors.map((e, i) => <li key={i}>{String(e)}</li>)}</ul>
                    </div>
                  )}
                </div>
              ) : <p className="text-[12px] text-slate-400 text-center py-8">Selecciona un documento.</p>}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div>
            {!audit ? (
              <div className="text-center py-8">
                <p className="text-[12px] text-slate-500 mb-3">Selecciona una operación para correr auditoría cruzada.</p>
                <select onChange={e => e.target.value && handleAudit(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2 bg-white">
                  <option value="">Operación...</option>
                  {operations.map(op => <option key={op.id} value={op.id}>{op.reference}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">Op {audit.operationId.slice(-8)} · {audit.documentCount} doc(s)</p>
                  <div className="flex gap-2">
                    {Object.entries(audit.byType).map(([t, n]) => (
                      <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DOCTYPE_COLOR[t] ?? 'bg-slate-100'}`}>{t}: {n}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {audit.issues.length === 0 && <p className="text-[12px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Sin inconsistencias detectadas</p>}
                  {audit.issues.map((iss, i) => {
                    const palette = iss.severity === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : iss.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-sky-50 border-sky-200 text-sky-700'
                    return (
                      <div key={i} className={`rounded-lg border px-3 py-2 ${palette}`}>
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
                          <div>
                            <p className="text-[11px] font-semibold">{iss.rule} <span className="text-[10px] opacity-60">[{iss.severity}]</span></p>
                            <p className="text-[12px] mt-0.5">{iss.message}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && audit && (
          <div className="space-y-2">
            {audit.timeline.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${s.status === 'present' ? 'bg-emerald-50/40' : 'bg-amber-50/40'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${s.status === 'present' ? 'bg-emerald-500' : 'bg-amber-400'}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-800">{s.label}</p>
                  <p className="text-[10px] text-slate-500">{s.documentType ?? 'sin documento'}{s.date && ` · ${new Date(s.date).toLocaleDateString('es-MX')}`}</p>
                </div>
                {s.status === 'missing' && <span className="text-[10px] font-bold text-amber-700">Falta</span>}
              </div>
            ))}
          </div>
        )}
        {activeTab === 'timeline' && !audit && <p className="text-[12px] text-slate-400 text-center py-8">Corre auditoría cruzada primero (tab anterior).</p>}

        {activeTab === 'groups' && (
          <div className="space-y-2">
            {groups.length === 0 && <p className="text-[12px] text-slate-400 text-center py-8">Sin grupos sugeridos. Sube documentos no vinculados con números de pedimento/factura comunes para que la IA los agrupe.</p>}
            {groups.map((g, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <GitMerge className="w-4 h-4 text-violet-600"/>
                  <span className="text-[12px] font-semibold">Ref común: <span className="font-mono">{g.ref}</span></span>
                  <span className="text-[10px] text-slate-500">{g.documentIds.length} documento(s)</span>
                </div>
                <p className="text-[11px] text-slate-600">Estos documentos parecen ser de la misma operación. Vincúlalos manualmente desde el detalle.</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

void ChevronRight; void Trash2;
