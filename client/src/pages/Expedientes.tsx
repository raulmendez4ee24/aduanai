/**
 * Expedientes (Ola 2, 27-ago-2026) — fusiona `Operations.tsx` (expediente por
 * operación) y `ExpedientesAI.tsx` (extracción IA) en un solo producto:
 * expediente electrónico 59-V / 162-VII con checklist de incisos a)–h),
 * semáforo de completitud, extracción IA al subir, glosa documental
 * automática, retención 5 años y paquete de auditoría ZIP.
 *
 * Ruta: /expediente (lista) · /expediente/:id (detalle) · /expediente-ia → redirige.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  FolderOpen, Plus, Upload, FileText, CheckCircle2, Circle, AlertTriangle, Archive, Clock, ExternalLink, ShieldCheck, Scale, Loader2, Trash2, RefreshCw,
} from 'lucide-react'
import { Button, Card, Badge, Input, Select, EmptyState } from '../components/ui'
import { DemoTag } from '../components/DemoBanner'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { useClienteActivo } from '../hooks/useClienteActivo'
import { formatFraction } from '../lib/format'
import {
  expedientesList, expedienteDetalle, expedienteCrear, expedienteChecklist, expedienteSubirDocumento, expedienteGlosa, expedienteRetencion,
  expedienteEliminar, expedienteDocumentoEstado, paqueteAuditoriaUrl, descargarConToken, archivoABase64,
  type OperacionLista, type OperacionExpediente, type IncisoChecklist, type DiferenciaGlosa,
} from '../lib/api/ola2'

export const GUIA_MODULO = {
  titulo: 'Expedientes — expediente electrónico 59-V / 162-VII',
  pasos: [
    'Crea la operación con su referencia/pedimento; el sistema abre los slots de documentos requeridos y el checklist de incisos a)–h) del Art. 59 fr. V LA.',
    'Sube cada documento (PDF/imagen/XML). La IA detecta el tipo y extrae los datos; el inciso correspondiente se marca completo automáticamente.',
    'Marca "no aplica" en los incisos condicionales (a) garantía, h) notas de crédito) cuando no existan para esa operación.',
    'Corre la glosa documental: cruza factura vs pedimento vs BL vs packing con tolerancias explícitas (valor 1 %, peso 5 %, cantidades exactas) — criterio operativo del producto, no una norma.',
    'Fija la retención de 5 años (crea el aviso en el Calendario) y descarga el paquete de auditoría ZIP con certificado de integridad.',
    'Los fundamentos marcados "pendiente de fuente oficial" aún no están cotejados en el corpus: verifica el texto en el DOF antes de citarlos.',
  ],
}

type Tab = 'checklist' | 'documentos' | 'glosa' | 'auditoria'
const TABS: { k: Tab; l: string }[] = [
  { k: 'checklist', l: 'Checklist 59-V / 162-VII' }, { k: 'documentos', l: 'Documentos' }, { k: 'glosa', l: 'Glosa documental' }, { k: 'auditoria', l: 'Retención y auditoría' },
]
const STATUS_LABEL: Record<string, string> = { DRAFT: 'Borrador', IN_PROGRESS: 'En proceso', COMPLETE: 'Completo', ARCHIVED: 'Archivado' }
const SEMAFORO_TONO = { verde: 'petroleo', ambar: 'ambar', rojo: 'carmin' } as const
const SEMAFORO_LABEL = { verde: 'Completo', ambar: 'Parcial', rojo: 'Incompleto' } as const
const DOCTYPE_LABELS: Record<string, string> = {
  factura: 'Factura comercial', factura_comercial: 'Factura comercial', pedimento: 'Pedimento', bl: 'Bill of Lading', awb: 'Air Waybill', conocimiento_embarque: 'B/L o AWB',
  packing_list: 'Packing list', certificado_origen: 'Certificado de origen', cove: 'COVE', mve: 'Manifestación de valor', manifestacion_valor: 'Manifestación de valor',
  carta_porte: 'Carta porte', nom: 'NOM', nom_certificado: 'Certificado NOM', otro: 'Otro', evidencia_riesgo: 'Evidencia Risk Scorer', dictamen_riesgo: 'Dictamen Risk Scorer',
  documento_transporte: 'Documento de transporte', padron_importadores: 'Constancia padrón', encargo_conferido: 'Encargo conferido', permiso_previo: 'Permiso previo',
  cuadro_liquidacion: 'Cuadro de liquidación', hoja_calculo: 'Hoja de cálculo', pedimento_transito: 'Pedimento de tránsito',
}
const etiquetaTipo = (t: string) => DOCTYPE_LABELS[t] ?? t

interface FormNuevo { reference: string; type: string; fractionCode: string; origin: string; customsValue: string; description: string; customsBroker: string; operationDate: string }
const FORM_INICIAL: FormNuevo = { reference: '', type: 'IMPORT', fractionCode: '', origin: '', customsValue: '', description: '', customsBroker: '', operationDate: '' }

export function ExpedientesPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const [params] = useSearchParams()
  const { clienteId } = useClienteActivo()
  const [lista, setLista] = useState<OperacionLista[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [error, setError] = useState('')
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [form, setForm, resetForm] = useEstadoPersistente<FormNuevo>('expediente', FORM_INICIAL)
  const [creando, setCreando] = useState(false)
  const [detalle, setDetalle] = useState<OperacionExpediente | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') as Tab) || 'checklist')

  const cargarLista = useCallback(async () => {
    setCargando(true)
    try { const r = await expedientesList(filtro || undefined); setLista(r.data); setError('') }
    catch (e) { setLista([]); setError(e instanceof Error ? e.message : 'No se pudo cargar la lista') }
    setCargando(false)
  }, [filtro])
  useEffect(() => { cargarLista() }, [cargarLista, clienteId])

  const cargarDetalle = useCallback(async (opId: string) => {
    setCargandoDetalle(true)
    try { const r = await expedienteDetalle(opId); setDetalle(r.data); setError('') }
    catch (e) { setDetalle(null); setError(e instanceof Error ? e.message : 'No se pudo cargar el expediente') }
    setCargandoDetalle(false)
  }, [])
  useEffect(() => { if (id) cargarDetalle(id); else setDetalle(null) }, [id, cargarDetalle])

  async function crear() {
    if (!form.reference.trim()) return
    setCreando(true)
    try {
      const r = await expedienteCrear({
        reference: form.reference.trim(), type: form.type, description: form.description || undefined, fractionCode: form.fractionCode || undefined,
        origin: form.origin || undefined, customsValue: form.customsValue ? Number(form.customsValue) : undefined, customsBroker: form.customsBroker || undefined,
        operationDate: form.operationDate || undefined,
      })
      setMostrarNuevo(false); resetForm(); await cargarLista(); navigate(`/expediente/${r.data.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear') }
    setCreando(false)
  }

  async function eliminar(opId: string) {
    if (!confirm('¿Eliminar este expediente y sus documentos? Esta acción queda en el audit trail.')) return
    try { await expedienteEliminar(opId); navigate('/expediente'); await cargarLista() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar') }
  }

  const set = (k: keyof FormNuevo, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-sello-ui">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-petroleo" />
          <h1 className="font-sello-display text-2xl text-tinta">Expedientes</h1> <DemoTag />
          <span className="text-13 text-tinta-suave">{lista.length} operación(es)</span>
        </div>
        <Button variante="primario" tamano="sm" onClick={() => setMostrarNuevo(true)}><Plus className="w-4 h-4" /> Nueva operación</Button>
      </div>
      {error && <p className="text-sm text-carmin bg-carmin-suave border border-carmin/25 rounded-sello-sm px-3 py-2">{error}</p>}

      <div className="grid lg:grid-cols-5 gap-4 items-start">
        {/* Lista */}
        <Card denso className="lg:col-span-2" header={
          <div className="flex gap-1.5 flex-wrap">
            {['', 'DRAFT', 'IN_PROGRESS', 'COMPLETE'].map(s => (
              <button key={s} onClick={() => setFiltro(s)} className={`text-13 px-2.5 py-1 rounded-sello-sm border ${filtro === s ? 'bg-petroleo text-white border-petroleo' : 'bg-superficie text-tinta-suave border-linea hover:bg-papel-2'}`}>
                {s === '' ? 'Todos' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        }>
          {cargando ? <p className="text-sm text-tinta-suave py-6 text-center">Cargando…</p>
            : lista.length === 0 ? (
              <EmptyState icono={FolderOpen} titulo="Sin expedientes" descripcion="Crea tu primera operación para abrir el expediente electrónico." accion={{ label: 'Nueva operación', onClick: () => setMostrarNuevo(true) }} />
            ) : (
              <ul className="divide-y divide-linea -my-2">
                {lista.map(op => {
                  const total = op.documentos.requeridos
                  const listos = op.documentos.requeridosListos
                  const activo = op.id === id
                  return (
                    <li key={op.id}>
                      <button onClick={() => navigate(`/expediente/${op.id}`)} className={`w-full text-left py-3 px-2 -mx-2 rounded-sello-sm ${activo ? 'bg-petroleo-suave' : 'hover:bg-papel-2'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-sello-mono text-sm text-tinta">{op.reference}</span>
                          <Badge tono={op.status === 'COMPLETE' ? 'petroleo' : op.status === 'IN_PROGRESS' ? 'ambar' : 'neutral'}>{STATUS_LABEL[op.status] ?? op.status}</Badge>
                          {op.glosaDocumental && (
                            <Badge tono={op.glosaDocumental.consistente ? 'petroleo' : 'carmin'}>{op.glosaDocumental.consistente ? 'glosa OK' : `glosa: ${op.glosaDocumental.errores} error(es)`}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-13 text-tinta-suave mt-1">
                          {op.fractionCode && <span className="font-sello-mono">{formatFraction(op.fractionCode)}</span>}
                          <span>{op.type === 'IMPORT' ? 'Importación' : op.type === 'EXPORT' ? 'Exportación' : 'Tránsito'}</span>
                          <span>{new Date(op.createdAt).toLocaleDateString('es-MX')}</span>
                          <span className="ml-auto">{listos}/{total} requeridos</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
        </Card>

        {/* Detalle */}
        <div className="lg:col-span-3 space-y-4">
          {!id ? (
            <Card><EmptyState icono={FileText} titulo="Selecciona un expediente" descripcion="Checklist 59-V a)–h), documentos con extracción IA, glosa documental, retención y paquete de auditoría." /></Card>
          ) : cargandoDetalle || !detalle ? (
            <Card><p className="text-sm text-tinta-suave py-6 text-center">{cargandoDetalle ? 'Cargando expediente…' : 'No se pudo cargar el expediente.'}</p></Card>
          ) : (
            <>
              <Card denso header={
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-sello-display text-xl text-tinta">{detalle.reference}</h2>
                      <Badge tono={SEMAFORO_TONO[detalle.checklist.semaforo]}>Expediente {SEMAFORO_LABEL[detalle.checklist.semaforo]}</Badge>
                      <Badge tono="neutral">{STATUS_LABEL[detalle.status] ?? detalle.status}</Badge>
                    </div>
                    <p className="text-13 text-tinta-suave mt-1">
                      {detalle.type === 'IMPORT' ? 'Importación' : detalle.type === 'EXPORT' ? 'Exportación' : 'Tránsito'}
                      {detalle.fractionCode && <> · <span className="font-sello-mono">{formatFraction(detalle.fractionCode)}</span></>}
                      {detalle.origin && <> · origen {detalle.origin}</>}
                      {detalle.customsValue != null && <> · {detalle.customsValue.toLocaleString('es-MX')} {detalle.currency}</>}
                      {detalle.operationDate && <> · operación {new Date(detalle.operationDate).toLocaleDateString('es-MX')}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variante="ghost" tamano="sm" onClick={() => cargarDetalle(detalle.id)} title="Recargar"><RefreshCw className="w-4 h-4" /></Button>
                    <Button variante="ghost" tamano="sm" onClick={() => eliminar(detalle.id)} title="Eliminar"><Trash2 className="w-4 h-4 text-carmin" /></Button>
                  </div>
                </div>
              }>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ['59-V incisos a)–h)', detalle.checklist.completitud59V], ['162-VII despacho', detalle.checklist.completitud162VII], ['Documentos requeridos', detalle.checklist.completitudDocumentos],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="border border-linea rounded-sello-sm py-2">
                      <p className="font-sello-mono text-xl text-tinta">{v}<span className="text-13 text-tinta-suave">%</span></p>
                      <p className="text-13 text-tinta-suave">{l}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap mt-4 print:hidden">
                  {TABS.map(t => (
                    <button key={t.k} onClick={() => setTab(t.k)} className={`text-13 px-3 py-1.5 rounded-sello-sm border ${tab === t.k ? 'bg-petroleo text-white border-petroleo' : 'bg-superficie text-tinta-suave border-linea hover:bg-papel-2'}`}>{t.l}</button>
                  ))}
                </div>
              </Card>

              {tab === 'checklist' && <TabChecklist detalle={detalle} onCambio={() => cargarDetalle(detalle.id)} setError={setError} />}
              {tab === 'documentos' && <TabDocumentos detalle={detalle} onCambio={() => cargarDetalle(detalle.id)} setError={setError} />}
              {tab === 'glosa' && <TabGlosa detalle={detalle} onCambio={() => cargarDetalle(detalle.id)} setError={setError} />}
              {tab === 'auditoria' && <TabAuditoria detalle={detalle} onCambio={() => cargarDetalle(detalle.id)} setError={setError} />}
            </>
          )}
        </div>
      </div>

      {mostrarNuevo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-tinta/30 p-4">
          <Card className="w-full max-w-lg" header={<h2 className="font-sello-display text-lg text-tinta">Nueva operación</h2>}
            footer={<div className="flex justify-end gap-2"><Button variante="secundario" tamano="sm" onClick={() => setMostrarNuevo(false)}>Cancelar</Button><Button variante="primario" tamano="sm" loading={creando} disabled={!form.reference.trim()} onClick={crear}>Crear expediente</Button></div>}>
            <div className="space-y-3">
              <Input label="Referencia / pedimento" requerido mono value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="26 47 3461 6000001" />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Tipo" value={form.type} onChange={e => set('type', e.target.value)}>
                  <option value="IMPORT">Importación</option><option value="EXPORT">Exportación</option><option value="TRANSIT">Tránsito</option>
                </Select>
                <Input label="Fracción" mono value={form.fractionCode} onChange={e => set('fractionCode', e.target.value)} placeholder="7318.15.01" />
                <Input label="Origen (ISO-2)" value={form.origin} onChange={e => set('origin', e.target.value)} placeholder="CN" />
                <Input label="Valor en aduana" type="number" value={form.customsValue} onChange={e => set('customsValue', e.target.value)} placeholder="10000" />
                <Input label="Fecha de la operación" type="date" value={form.operationDate} onChange={e => set('operationDate', e.target.value)} hint="Base de la retención de 5 años" />
                <Input label="Agente aduanal" value={form.customsBroker} onChange={e => set('customsBroker', e.target.value)} />
              </div>
              <Input label="Descripción" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Tornillería para línea de ensamble" />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ── Pestañas ────────────────────────────────────────────────────────────

interface TabProps { detalle: OperacionExpediente; onCambio: () => void; setError: (m: string) => void }

function Fundamento({ f }: { f: IncisoChecklist['fundamento'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <a href={f.url} target="_blank" rel="noreferrer" title={`${f.citaCorta}\n\n${f.fuente}`} className="font-sello-mono text-13 text-petroleo hover:underline inline-flex items-center gap-1">
        {f.articulo}{f.fechaCotejo ? ` · cotejo ${f.fechaCotejo}` : ''} <ExternalLink className="w-3 h-3" />
      </a>
      {f.cotejo === 'pendiente' && <Badge tono="ambar">pendiente de fuente oficial</Badge>}
    </span>
  )
}

function FilaInciso({ i, onNoAplica, ocupado }: { i: IncisoChecklist; onNoAplica?: (v: boolean) => void; ocupado: boolean }) {
  const icono = i.estado === 'completo' ? <CheckCircle2 className="w-4 h-4 text-petroleo" /> : i.estado === 'no_aplica' ? <Circle className="w-4 h-4 text-tinta-suave" /> : <Circle className="w-4 h-4 text-carmin" />
  return (
    <li className={`py-3 ${i.estado === 'no_aplica' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icono}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-tinta"><span className="font-sello-mono text-tinta-suave mr-1">{i.inciso}</span>{i.descripcion}</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <Fundamento f={i.fundamento} />
            {i.documentos.length > 0
              ? i.documentos.map(d => <Badge key={d.id} tono="petroleo"><FileText className="w-3 h-3" />{d.name}</Badge>)
              : i.estado === 'pendiente' && <span className="text-13 text-tinta-suave">esperado: {i.documentosEsperados.slice(0, 3).map(etiquetaTipo).join(', ')}</span>}
          </div>
        </div>
        {i.condicional && onNoAplica && i.estado !== 'completo' && (
          <label className="text-13 text-tinta-suave flex items-center gap-1 shrink-0">
            <input type="checkbox" checked={i.estado === 'no_aplica'} disabled={ocupado} onChange={e => onNoAplica(e.target.checked)} className="accent-petroleo" /> no aplica
          </label>
        )}
      </div>
    </li>
  )
}

function TabChecklist({ detalle, onCambio, setError }: TabProps) {
  const [ocupado, setOcupado] = useState(false)
  const c = detalle.checklist
  async function toggleNoAplica(incisoId: string, v: boolean) {
    setOcupado(true)
    try {
      const na = new Set(c.noAplica); if (v) na.add(incisoId); else na.delete(incisoId)
      await expedienteChecklist(detalle.id, [...na]); onCambio()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar') }
    setOcupado(false)
  }
  return (
    <div className="space-y-4">
      <Card denso header={<div className="flex items-center justify-between gap-2 flex-wrap"><h3 className="font-sello-display text-lg text-tinta">Art. 59 fr. V LA — incisos a)–h)</h3><Badge tono={SEMAFORO_TONO[c.semaforo]}>{c.completitud59V}% completo</Badge></div>}>
        <ul className="divide-y divide-linea -my-3">{c.incisos59V.map(i => <FilaInciso key={i.id} i={i} ocupado={ocupado} onNoAplica={v => toggleNoAplica(i.id, v)} />)}</ul>
        <p className="text-13 text-tinta-suave mt-4 pt-3 border-t border-linea leading-relaxed">Los incisos se marcan completos cuando existe un documento subido del tipo esperado. El fundamento con fecha de cotejo proviene de la Ley Aduanera consolidada (reforma DOF 19-11-2025); lo etiquetado "pendiente de fuente oficial" aún no está cotejado en el corpus.</p>
      </Card>
      <Card denso header={<div className="flex items-center justify-between gap-2 flex-wrap"><h3 className="font-sello-display text-lg text-tinta">Art. 162 fr. VII LA — archivo del despacho</h3><Badge tono={c.completitud162VII >= 100 ? 'petroleo' : c.completitud162VII >= 60 ? 'ambar' : 'carmin'}>{c.completitud162VII}% completo</Badge></div>}>
        <ul className="divide-y divide-linea -my-3">{c.piezas162VII.map(i => <FilaInciso key={i.id} i={i} ocupado={ocupado} onNoAplica={v => toggleNoAplica(i.id, v)} />)}</ul>
      </Card>
    </div>
  )
}

function TabDocumentos({ detalle, onCambio, setError }: TabProps) {
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [tipoLibre, setTipoLibre] = useState('')
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const inputLibre = useRef<HTMLInputElement>(null)
  const [ultimaExtraccion, setUltimaExtraccion] = useState<string | null>(null)

  async function subir(file: File, type?: string) {
    setSubiendo(type ?? 'libre'); setUltimaExtraccion(null)
    try {
      const base64 = await archivoABase64(file)
      const r = await expedienteSubirDocumento(detalle.id, { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64, type: type || undefined })
      setUltimaExtraccion(r.data.extraccion ? `IA: ${etiquetaTipo(r.data.extraccion.docType)} (confianza ${r.data.extraccion.confidence}%)${r.data.extraccion.errores.length ? ` · ${r.data.extraccion.errores.join('; ')}` : ''}` : r.data.errorExtraccion ? `Documento guardado sin extracción: ${r.data.errorExtraccion}` : 'Documento guardado.')
      onCambio()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo subir') }
    setSubiendo(null)
  }
  const docSel = detalle.documents.find(d => d.id === seleccionado) ?? null
  const pendientes = detalle.documents.filter(d => d.status === 'PENDING')
  const subidos = detalle.documents.filter(d => d.status !== 'PENDING')
  return (
    <div className="space-y-4">
      <Card denso header={<h3 className="font-sello-display text-lg text-tinta">Slots requeridos ({subidos.filter(d => d.required).length}/{detalle.documents.filter(d => d.required).length})</h3>}>
        {pendientes.length === 0 ? <p className="text-sm text-tinta-suave">Todos los slots tienen documento.</p> : (
          <ul className="divide-y divide-linea -my-2">
            {pendientes.map(d => (
              <li key={d.id} className="py-2 flex items-center gap-3">
                <Clock className="w-4 h-4 text-tinta-suave shrink-0" />
                <div className="flex-1 min-w-0"><p className="text-sm text-tinta">{d.name}</p><p className="text-13 text-tinta-suave">{d.type}{d.required ? ' · requerido' : ' · opcional'}</p></div>
                <label className={`text-13 inline-flex items-center gap-1 px-2.5 py-1 rounded-sello-sm border border-linea cursor-pointer hover:bg-papel-2 ${subiendo ? 'opacity-50 pointer-events-none' : ''}`}>
                  {subiendo === d.type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Subir
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xml" onChange={e => e.target.files?.[0] && subir(e.target.files[0], d.type)} />
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 pt-3 border-t border-linea flex items-end gap-2 flex-wrap">
          <Input label="Otro documento (tipo opcional)" value={tipoLibre} onChange={e => setTipoLibre(e.target.value)} placeholder="comprobante_pago, contrato, nota_credito…" className="flex-1 min-w-[220px]" />
          <input ref={inputLibre} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xml" onChange={e => e.target.files?.[0] && subir(e.target.files[0], tipoLibre.trim() || undefined)} />
          <Button variante="secundario" tamano="sm" loading={subiendo === 'libre'} onClick={() => inputLibre.current?.click()}><Upload className="w-4 h-4" /> Subir con extracción IA</Button>
        </div>
        {ultimaExtraccion && <p className="text-13 text-petroleo mt-2">{ultimaExtraccion}</p>}
        <p className="text-13 text-tinta-suave mt-2">La IA detecta el tipo (factura, pedimento, BL, packing…) y extrae campos para la glosa documental. Tipos útiles para los incisos: comprobante_pago (d), contrato / orden_compra (f), soporte_incrementables (g), nota_credito (h), cfdi (b).</p>
      </Card>
      <Card denso header={<h3 className="font-sello-display text-lg text-tinta">Documentos del expediente ({subidos.length})</h3>}>
        {subidos.length === 0 ? <p className="text-sm text-tinta-suave">Aún no hay documentos subidos.</p> : (
          <div className="grid md:grid-cols-2 gap-3">
            <ul className="divide-y divide-linea -my-2">
              {subidos.map(d => (
                <li key={d.id}>
                  <button onClick={() => setSeleccionado(d.id)} className={`w-full text-left py-2 px-2 -mx-2 rounded-sello-sm ${seleccionado === d.id ? 'bg-petroleo-suave' : 'hover:bg-papel-2'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-tinta-suave" />
                      <span className="text-sm text-tinta truncate flex-1">{d.fileName ?? d.name}</span>
                      <Badge tono={d.status === 'VERIFIED' ? 'petroleo' : 'neutral'}>{d.status === 'VERIFIED' ? 'verificado' : 'subido'}</Badge>
                    </div>
                    <p className="text-13 text-tinta-suave mt-0.5">{etiquetaTipo(d.docType ?? d.type)}{d.confidence != null && ` · IA ${d.confidence}%`}{d.fileHash && <> · <span className="font-sello-mono">{d.fileHash.slice(0, 10)}…</span></>}</p>
                  </button>
                </li>
              ))}
            </ul>
            <div>
              {docSel ? (
                <div className="border border-linea rounded-sello-sm p-3">
                  <p className="text-sm text-tinta font-medium">{docSel.fileName ?? docSel.name}</p>
                  <p className="text-13 text-tinta-suave">{etiquetaTipo(docSel.docType ?? docSel.type)} · {docSel.fileSize ? `${Math.round(docSel.fileSize / 1024)} KB` : 'sin archivo'} · {new Date(docSel.createdAt).toLocaleDateString('es-MX')}</p>
                  {docSel.status !== 'VERIFIED' && (
                    <Button variante="secundario" tamano="sm" className="mt-2" onClick={async () => { try { await expedienteDocumentoEstado(detalle.id, docSel.id, { status: 'VERIFIED' }); onCambio() } catch (e) { setError(e instanceof Error ? e.message : 'Error') } }}>
                      <ShieldCheck className="w-4 h-4" /> Marcar verificado
                    </Button>
                  )}
                  {docSel.extractedData && <pre className="mt-3 bg-papel-2 rounded-sello-sm p-2 text-13 font-sello-mono overflow-auto max-h-72">{JSON.stringify(docSel.extractedData, null, 2)}</pre>}
                  {docSel.notes && <p className="text-13 text-ambar mt-2">{docSel.notes}</p>}
                  {Array.isArray(docSel.aiErrors) && docSel.aiErrors.length > 0 && <p className="text-13 text-carmin mt-2">IA: {docSel.aiErrors.join('; ')}</p>}
                </div>
              ) : <p className="text-sm text-tinta-suave py-6 text-center">Selecciona un documento para ver la extracción.</p>}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

const SEV_TONO = { error: 'carmin', advertencia: 'ambar', info: 'neutral' } as const

function TabGlosa({ detalle, onCambio, setError }: TabProps) {
  const [ocupado, setOcupado] = useState(false)
  const g = detalle.glosaDocumental
  async function correr() {
    setOcupado(true)
    try { await expedienteGlosa(detalle.id); onCambio() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo glosar') }
    setOcupado(false)
  }
  const fila = (d: DiferenciaGlosa, i: number) => (
    <tr key={i} className="border-b border-linea align-top">
      <td className="py-2 pr-2"><Badge tono={SEV_TONO[d.severidad]}>{d.severidad}</Badge></td>
      <td className="py-2 pr-2 text-sm text-tinta">{d.campo}</td>
      <td className="py-2 pr-2 text-13 font-sello-mono text-tinta">{d.fuenteA}: {d.valorA ?? '—'}</td>
      <td className="py-2 pr-2 text-13 font-sello-mono text-tinta">{d.fuenteB}: {d.valorB ?? '—'}</td>
      <td className="py-2 pr-2 text-13 font-sello-mono text-tinta">{d.delta ?? '—'}</td>
      <td className="py-2 text-13 text-tinta-suave">{d.tolerancia}</td>
    </tr>
  )
  return (
    <Card denso header={
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-sello-display text-lg text-tinta">Glosa documental — factura vs pedimento vs BL vs packing</h3>
        <Button variante="primario" tamano="sm" loading={ocupado} onClick={correr}><Scale className="w-4 h-4" /> {g ? 'Volver a glosar' : 'Glosar ahora'}</Button>
      </div>
    }>
      {!g ? (
        <p className="text-sm text-tinta-suave">Sube factura, pedimento (o vincula el pedimento importado M3/Data Stage), BL y packing list; la glosa cruza valor, cantidades, pesos, bultos, RFC y consignatario con tolerancias explícitas. Determinista, sin IA en el cruce.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tono={g.consistente ? 'petroleo' : g.errores > 0 ? 'carmin' : 'ambar'}>{g.consistente ? 'Consistente' : `${g.errores} error(es) · ${g.advertencias} advertencia(s)`}</Badge>
            <span className="text-13 text-tinta-suave">Pedimento: {g.fuentePedimento === 'importado' ? 'archivo M3/Data Stage (dato duro)' : g.fuentePedimento === 'extraido' ? 'extracción IA' : 'sin pedimento'}</span>
            <span className="text-13 text-tinta-suave">· cruces: {g.cruces.length ? g.cruces.join(', ') : 'ninguno'}</span>
            <span className="text-13 text-tinta-suave ml-auto">{new Date(g.generadoAt).toLocaleString('es-MX')}</span>
          </div>
          <p className="text-13 text-tinta-suave">Tolerancias (criterio operativo, sin fundamento legal): valor {g.tolerancias.valorPct * 100} % o ±{g.tolerancias.valorAbs} · peso {g.tolerancias.pesoPct * 100} % · cantidades ±{g.tolerancias.cantidadAbs} · bultos ±{g.tolerancias.bultosAbs}</p>
          {g.diferencias.length === 0 ? <p className="text-sm text-petroleo flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Sin diferencias en los cruces realizados.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="text-13 text-tinta-suave uppercase tracking-wider"><th className="pb-1">Sev.</th><th className="pb-1">Campo</th><th className="pb-1">A</th><th className="pb-1">B</th><th className="pb-1">Δ</th><th className="pb-1">Tolerancia</th></tr></thead>
                <tbody>{g.diferencias.map(fila)}</tbody>
              </table>
            </div>
          )}
          {g.faltantes.length > 0 && <p className="text-13 text-ambar flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Sin datos de: {g.faltantes.map(etiquetaTipo).join(', ')} — esos cruces no se realizaron.</p>}
        </div>
      )}
    </Card>
  )
}

function TabAuditoria({ detalle, onCambio, setError }: TabProps) {
  const [ocupado, setOcupado] = useState<'ret' | 'zip' | null>(null)
  const r = detalle.retencion
  async function fijarRetencion() {
    setOcupado('ret')
    try { await expedienteRetencion(detalle.id); onCambio() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo fijar la retención') }
    setOcupado(null)
  }
  async function descargarZip() {
    setOcupado('zip')
    try { await descargarConToken(paqueteAuditoriaUrl(detalle.id), `paquete-auditoria-${detalle.reference.replace(/[^A-Za-z0-9_-]+/g, '_')}.zip`) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar') }
    setOcupado(null)
  }
  const dictamenes = detalle.documents.filter(d => d.type === 'dictamen_riesgo')
  return (
    <div className="space-y-4">
      <Card denso header={<h3 className="font-sello-display text-lg text-tinta">Retención del expediente — {r.anios} años</h3>}>
        <div className="flex items-center gap-3 flex-wrap">
          {r.hasta ? <Badge tono="petroleo"><Clock className="w-3 h-3" /> conservar hasta {new Date(r.hasta).toLocaleDateString('es-MX')}</Badge> : <Badge tono="ambar">retención sin fijar</Badge>}
          <Button variante="secundario" tamano="sm" loading={ocupado === 'ret'} onClick={fijarRetencion}>{r.hasta ? 'Recalcular' : 'Fijar retención'} (+ aviso en Calendario)</Button>
        </div>
        <p className="text-13 text-tinta-suave mt-3 flex items-center gap-2 flex-wrap">
          <Fundamento f={r.fundamento} />
        </p>
        <p className="text-13 text-tinta-suave mt-1">{r.fundamento.citaCorta} El plazo se calcula desde la fecha de la operación{detalle.operationDate ? '' : ' (o la de creación si no la capturaste)'}; el aviso vive en Calendario de obligaciones (tipo "otra").</p>
      </Card>
      <Card denso header={<h3 className="font-sello-display text-lg text-tinta">Paquete de auditoría</h3>}>
        <p className="text-sm text-tinta">ZIP con los documentos del expediente (archivo o extracción cuando el original no se almacenó), el reporte de glosa documental, el checklist 59-V/162-VII y un certificado de integridad con SHA-256 por entrada, hash del paquete y estado de la cadena de auditoría.</p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button variante="primario" tamano="sm" loading={ocupado === 'zip'} onClick={descargarZip}><Archive className="w-4 h-4" /> Descargar paquete-auditoria.zip</Button>
          <span className="text-13 text-tinta-suave">Cada descarga queda registrada en el audit trail.</span>
        </div>
      </Card>
      <Card denso header={<h3 className="font-sello-display text-lg text-tinta">Dictámenes del Risk Scorer archivados ({dictamenes.length})</h3>}>
        {dictamenes.length === 0 ? <p className="text-sm text-tinta-suave">Ninguno. Desde el Risk Scorer puedes archivar el dictamen con folio a este expediente.</p> : (
          <ul className="divide-y divide-linea -my-2">{dictamenes.map(d => <li key={d.id} className="py-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-petroleo" /><span className="text-sm text-tinta">{d.name}</span>{d.fileHash && <span className="font-sello-mono text-13 text-tinta-suave ml-auto">{d.fileHash.slice(0, 16)}…</span>}</li>)}</ul>
        )}
      </Card>
    </div>
  )
}
