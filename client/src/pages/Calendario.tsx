/**
 * Calendario de obligaciones (Operación 2026-08) — rutas /calendario y /calendario/:id.
 * Tablero mensual + lista con semáforo (≤7 días rojo, ≤30 ámbar), responsables,
 * marcar cumplida con evidencia (Document), siembra del catálogo base y export xlsx.
 * Datos reales del tenant/cliente activo; sin datos falsos; errores visibles.
 */
import { useEffect, useMemo, useState } from 'react'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarCheck, ChevronLeft, ChevronRight, Download, Plus, Sprout, CheckCircle2, AlertTriangle, ArrowLeft, Trash2, RefreshCw } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Textarea, EmptyState } from '../components/ui'
import { calendarioApi, type Obligacion, type ObligacionDetalle, type Responsable, type ObligacionBase, type EntradaObligacion } from '../lib/api/calendario'
import { api } from '../lib/api'

export const GUIA_MODULO = {
  titulo: 'Calendario de obligaciones',
  pasos: [
    'Siembra el catálogo base (SE, padrones, 32-D, certificación, Anexo 24/30) para tu empresa o el cliente activo; es idempotente.',
    'Cada obligación muestra fundamento y consecuencia; las marcadas "pendiente de fuente oficial" esperan cotejo.',
    'Semáforo: rojo vence en ≤7 días o vencida, ámbar ≤30 días, verde después.',
    'Asigna responsable, marca cumplida con evidencia (archivo) y la recurrente se regenera sola.',
    'Las vencidas generan una alerta con botón "Ver obligación". Exporta a Excel cuando lo pidan.',
  ],
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const TONO: Record<Obligacion['semaforo'], 'carmin' | 'ambar' | 'petroleo' | 'neutral'> = { rojo: 'carmin', ambar: 'ambar', verde: 'petroleo', gris: 'neutral' }
const PUNTO: Record<Obligacion['semaforo'], string> = { rojo: 'bg-carmin', ambar: 'bg-ambar', verde: 'bg-petroleo', gris: 'bg-linea' }
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
const dias = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)

const FORM_INICIAL: EntradaObligacion = { tipo: 'OTRA', titulo: '', descripcion: '', fundamento: '', fechaLimite: '', recurrencia: 'UNICA', responsableUserId: '', consecuencia: '' }

export function CalendarioPage() {
  const { id } = useParams<{ id?: string }>()
  if (id) return <DetalleObligacion id={id} />
  return <TableroCalendario />
}

function TableroCalendario() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Obligacion[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [catalogo, setCatalogo] = useState<ObligacionBase[]>([])
  const [tipos, setTipos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [mes, setMes] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [filtroEstado, setFiltroEstado] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useEstadoPersistente<EntradaObligacion>('calendario', FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setCargando(true); setError(null)
    try {
      const [r, c] = await Promise.all([calendarioApi.listar(), calendarioApi.catalogoBase()])
      setItems(r.data); setResponsables(r.responsables); setCatalogo(c.data); setTipos(c.tipos)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el calendario') }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const filtrados = useMemo(() => filtroEstado ? items.filter(i => i.estado === filtroEstado) : items, [items, filtroEstado])
  const porDia = useMemo(() => {
    const m = new Map<string, Obligacion[]>()
    for (const o of items) {
      const k = o.fechaLimite.slice(0, 10)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(o)
    }
    return m
  }, [items])
  const celdas = useMemo(() => {
    const primero = new Date(Date.UTC(mes.y, mes.m, 1))
    const offset = (primero.getUTCDay() + 6) % 7 // lunes = 0
    const nDias = new Date(Date.UTC(mes.y, mes.m + 1, 0)).getUTCDate()
    const out: (string | null)[] = Array.from({ length: offset }, () => null)
    for (let d = 1; d <= nDias; d++) out.push(`${mes.y}-${String(mes.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    while (out.length % 7) out.push(null)
    return out
  }, [mes])

  async function sembrar() {
    setAviso(null); setError(null)
    try {
      const r = await calendarioApi.sembrarBase()
      setAviso(`Siembra: ${r.data.creadas} creadas, ${r.data.existentes} ya existían${r.data.omitidas.length ? `, omitidas por perfil: ${r.data.omitidas.join(', ')}` : ''}.`)
      await cargar()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo sembrar') }
  }
  async function exportar() {
    try { await calendarioApi.exportXlsx() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo exportar') }
  }
  async function procesar() {
    try { const r = await calendarioApi.procesarVencimientos(); setAviso(`Revisión: ${r.data.vencidas} vencidas, ${r.data.alertas} alertas nuevas.`); await cargar() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo revisar') }
  }
  async function crear() {
    if (!form.titulo.trim() || !form.fechaLimite) { setError('Título y fecha límite son obligatorios'); return }
    setGuardando(true); setError(null)
    try {
      await calendarioApi.crear({ ...form, responsableUserId: form.responsableUserId || null, descripcion: form.descripcion || null, fundamento: form.fundamento || null, consecuencia: form.consecuencia || null })
      setForm(FORM_INICIAL); setMostrarForm(false); await cargar()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear') }
    setGuardando(false)
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const resumen = { rojo: items.filter(i => i.semaforo === 'rojo').length, ambar: items.filter(i => i.semaforo === 'ambar').length, pendientes: items.filter(i => i.estado !== 'cumplida').length }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Card header={
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarCheck className="w-[18px] h-[18px] text-petroleo" strokeWidth={1.5} aria-hidden />
          <h1 className="font-sello-display text-lg text-tinta">Calendario de obligaciones</h1>
          <div className="ml-auto flex gap-2 flex-wrap">
            <Button variante="secundario" tamano="sm" onClick={sembrar}><Sprout className="w-4 h-4" /> Sembrar catálogo base</Button>
            <Button variante="secundario" tamano="sm" onClick={procesar}><RefreshCw className="w-4 h-4" /> Revisar vencimientos</Button>
            <Button variante="secundario" tamano="sm" onClick={exportar}><Download className="w-4 h-4" /> Excel</Button>
            <Button variante="primario" tamano="sm" onClick={() => setMostrarForm(v => !v)}><Plus className="w-4 h-4" /> Nueva obligación</Button>
          </div>
        </div>
      }>
        <div className="flex gap-3 flex-wrap text-sm text-tinta-suave">
          <Badge tono="carmin">{resumen.rojo} en rojo (≤7 días o vencidas)</Badge>
          <Badge tono="ambar">{resumen.ambar} en ámbar (≤30 días)</Badge>
          <Badge tono="neutral">{resumen.pendientes} pendientes en total</Badge>
        </div>
        {error && <p className="mt-3 text-sm text-carmin flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {error}</p>}
        {aviso && <p className="mt-3 text-sm text-petroleo">{aviso}</p>}
      </Card>

      {mostrarForm && (
        <Card header={<h2 className="font-sello-display text-base text-tinta">Nueva obligación</h2>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select label="Tipo" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              {tipos.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Título" requerido value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
            <Input label="Fecha límite" requerido type="date" value={form.fechaLimite} onChange={e => setForm({ ...form, fechaLimite: e.target.value })} />
            <Select label="Recurrencia" value={form.recurrencia ?? 'UNICA'} onChange={e => setForm({ ...form, recurrencia: e.target.value })}>
              <option value="UNICA">Única</option><option value="MENSUAL">Mensual</option><option value="ANUAL">Anual</option>
            </Select>
            <Select label="Responsable" value={form.responsableUserId ?? ''} onChange={e => setForm({ ...form, responsableUserId: e.target.value })}>
              <option value="">Sin asignar</option>
              {responsables.map(r => <option key={r.id} value={r.id}>{r.name} · {r.email}</option>)}
            </Select>
            <Input label="Fundamento" value={form.fundamento ?? ''} onChange={e => setForm({ ...form, fundamento: e.target.value })} hint="Cita la regla/artículo; si no hay fuente oficial, dilo." />
            <Textarea label="Descripción" value={form.descripcion ?? ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
            <Textarea label="Consecuencia de no cumplir" value={form.consecuencia ?? ''} onChange={e => setForm({ ...form, consecuencia: e.target.value })} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button variante="primario" tamano="sm" loading={guardando} onClick={crear}>Guardar</Button>
            <Button variante="ghost" tamano="sm" onClick={() => setMostrarForm(false)}>Cancelar</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Tablero mensual */}
        <Card className="lg:col-span-3" header={
          <div className="flex items-center gap-2">
            <button type="button" className="p-1 rounded-sello-sm hover:bg-papel-2" aria-label="Mes anterior" onClick={() => setMes(m => m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 })}><ChevronLeft className="w-4 h-4" /></button>
            <h2 className="font-sello-display text-base text-tinta capitalize">{MESES[mes.m]} {mes.y}</h2>
            <button type="button" className="p-1 rounded-sello-sm hover:bg-papel-2" aria-label="Mes siguiente" onClick={() => setMes(m => m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 })}><ChevronRight className="w-4 h-4" /></button>
          </div>
        }>
          <div className="grid grid-cols-7 gap-1 text-[11px] text-tinta-suave mb-1">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-center">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((k, i) => {
              const lista = k ? porDia.get(k) ?? [] : []
              return (
                <div key={i} className={`min-h-[64px] rounded-sello-sm border p-1 text-[11px] ${k ? 'border-linea bg-superficie' : 'border-transparent'} ${k === hoy ? 'ring-2 ring-petroleo' : ''}`}>
                  {k && <div className="text-tinta-suave">{Number(k.slice(8))}</div>}
                  {lista.slice(0, 3).map(o => (
                    <button key={o.id} type="button" onClick={() => navigate(`/calendario/${o.id}`)} title={o.titulo}
                      className="w-full text-left flex items-center gap-1 truncate hover:underline">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${PUNTO[o.semaforo]}`} /><span className="truncate text-tinta">{o.titulo}</span>
                    </button>
                  ))}
                  {lista.length > 3 && <div className="text-tinta-suave">+{lista.length - 3}</div>}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Lista */}
        <Card className="lg:col-span-2" header={
          <div className="flex items-center gap-2">
            <h2 className="font-sello-display text-base text-tinta">Lista</h2>
            <select className="ml-auto text-sm border border-linea rounded-sello-sm px-2 py-1 bg-superficie" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todas</option><option value="pendiente">Pendientes</option><option value="en_curso">En curso</option><option value="vencida">Vencidas</option><option value="cumplida">Cumplidas</option>
            </select>
          </div>
        }>
          {cargando ? <p className="text-sm text-tinta-suave">Cargando…</p> : filtrados.length === 0 ? (
            <EmptyState icono={CalendarCheck} titulo="Sin obligaciones registradas"
              descripcion={items.length === 0 ? 'Siembra el catálogo base para arrancar con las obligaciones típicas de una IMMEX, o crea una manualmente.' : 'Nada con ese filtro.'}
              accion={items.length === 0 ? { label: 'Sembrar catálogo base', onClick: sembrar } : undefined} />
          ) : (
            <ul className="divide-y divide-linea -my-2">
              {filtrados.map(o => {
                const d = dias(o.fechaLimite)
                const resp = responsables.find(r => r.id === o.responsableUserId)
                return (
                  <li key={o.id} className="py-2.5 flex items-start gap-2">
                    <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${PUNTO[o.semaforo]}`} aria-label={o.semaforo} />
                    <button type="button" className="flex-1 text-left min-w-0" onClick={() => navigate(`/calendario/${o.id}`)}>
                      <p className="text-sm text-tinta leading-snug">{o.titulo}</p>
                      <p className="text-[12px] text-tinta-suave">
                        {fecha(o.fechaLimite)} · {o.estado === 'cumplida' ? 'cumplida' : o.estado === 'vencida' ? `vencida hace ${-d} d` : d >= 0 ? `en ${d} d` : `hace ${-d} d`}
                        {resp ? ` · ${resp.name}` : ' · sin responsable'}
                        {o.fundamento?.includes('pendiente de fuente oficial') || o.fundamento?.includes('cotejo: pendiente') ? ' · fuente pendiente' : ''}
                      </p>
                    </button>
                    <Badge tono={TONO[o.semaforo]}>{o.tipo}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {catalogo.length > 0 && (
        <Card header={<h2 className="font-sello-display text-base text-tinta">Catálogo base (lo que siembra el botón)</h2>}>
          <ul className="divide-y divide-linea -my-2">
            {catalogo.map(b => (
              <li key={b.tipo} className="py-2 flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <p className="text-sm text-tinta">{b.titulo}</p>
                  <p className="text-[12px] text-tinta-suave">{b.fundamento} · {b.recurrencia.toLowerCase()} · próxima {fecha(b.proximaFecha)}{b.requiere ? ` · requiere ${b.requiere}` : ''}</p>
                </div>
                <Badge tono={b.cotejo === 'ok' ? 'petroleo' : 'ambar'}>{b.cotejo === 'ok' ? 'fundamento en corpus' : 'pendiente de fuente oficial'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function DetalleObligacion({ id }: { id: string }) {
  const navigate = useNavigate()
  const [o, setO] = useState<ObligacionDetalle | null>(null)
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [evidenciaId, setEvidenciaId] = useState('')
  const [form, setForm] = useState<{ estado: string; responsableUserId: string; fechaLimite: string }>({ estado: 'pendiente', responsableUserId: '', fechaLimite: '' })

  async function cargar() {
    setError(null)
    try {
      const [r, l] = await Promise.all([calendarioApi.obtener(id), calendarioApi.listar()])
      setO(r.data); setResponsables(l.responsables)
      setForm({ estado: r.data.estado, responsableUserId: r.data.responsableUserId ?? '', fechaLimite: r.data.fechaLimite.slice(0, 10) })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar') }
  }
  useEffect(() => { cargar() }, [id])

  async function guardar() {
    setError(null)
    try { await calendarioApi.actualizar(id, { estado: form.estado as Obligacion['estado'], responsableUserId: form.responsableUserId || null, fechaLimite: form.fechaLimite }); setAviso('Guardado'); await cargar() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') }
  }
  async function subirEvidencia(file: File) {
    setSubiendo(true); setError(null)
    try {
      const base64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.onerror = () => rej(new Error('No se pudo leer el archivo')); fr.readAsDataURL(file) })
      const r = await api.documentsUploadBatch([{ name: file.name, mimeType: file.type || 'application/octet-stream', base64 }])
      const docId = r.data.results[0]?.document?.id
      if (!docId) throw new Error(r.data.results[0] && 'error' in r.data.results[0] ? String((r.data.results[0] as { error?: string }).error) : 'El servidor no devolvió el documento')
      setEvidenciaId(docId); setAviso(`Evidencia subida (${file.name})`)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo subir la evidencia') }
    setSubiendo(false)
  }
  async function cumplir() {
    setError(null)
    try {
      const r = await calendarioApi.cumplir(id, evidenciaId || null)
      setAviso(r.data.siguiente ? `Cumplida. Siguiente ocurrencia creada para ${fecha(r.data.siguiente.fechaLimite)}.` : 'Cumplida.')
      await cargar()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo marcar cumplida') }
  }
  async function eliminar() {
    if (!window.confirm('¿Eliminar esta obligación?')) return
    try { await calendarioApi.eliminar(id); navigate('/calendario') } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar') }
  }

  if (error && !o) return <Card><p className="text-sm text-carmin">{error}</p><Button variante="ghost" tamano="sm" onClick={() => navigate('/calendario')}><ArrowLeft className="w-4 h-4" /> Volver</Button></Card>
  if (!o) return <Card><p className="text-sm text-tinta-suave">Cargando…</p></Card>
  const d = dias(o.fechaLimite)
  const fuentePendiente = !!o.fundamento && (o.fundamento.includes('pendiente de fuente oficial') || o.fundamento.includes('cotejo: pendiente') || o.fundamento.includes('no está en el corpus'))

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Card header={
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => navigate('/calendario')} className="p-1 rounded-sello-sm hover:bg-papel-2" aria-label="Volver"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="font-sello-display text-lg text-tinta">{o.titulo}</h1>
          <Badge tono={TONO[o.semaforo]}>{o.estado === 'cumplida' ? 'cumplida' : o.estado === 'vencida' ? 'vencida' : d >= 0 ? `vence en ${d} d` : `venció hace ${-d} d`}</Badge>
          <Badge tono="neutral">{o.tipo}</Badge>
          {o.recurrencia && o.recurrencia !== 'UNICA' && <Badge tono="neutral">{o.recurrencia.toLowerCase()}</Badge>}
        </div>
      }>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-[11px] uppercase tracking-wide text-tinta-suave">Fecha límite</dt><dd className="text-tinta">{fecha(o.fechaLimite)}</dd></div>
          <div><dt className="text-[11px] uppercase tracking-wide text-tinta-suave">Responsable</dt><dd className="text-tinta">{o.responsable ? `${o.responsable.name} · ${o.responsable.email}` : 'Sin asignar'}</dd></div>
          <div className="md:col-span-2"><dt className="text-[11px] uppercase tracking-wide text-tinta-suave">Fundamento</dt><dd className="text-tinta">{o.fundamento ?? '—'} {fuentePendiente && <Badge tono="ambar">pendiente de fuente oficial</Badge>}</dd></div>
          {o.descripcion && <div className="md:col-span-2"><dt className="text-[11px] uppercase tracking-wide text-tinta-suave">Descripción</dt><dd className="text-tinta">{o.descripcion}</dd></div>}
          {o.consecuencia && <div className="md:col-span-2"><dt className="text-[11px] uppercase tracking-wide text-tinta-suave">Consecuencia de no cumplir</dt><dd className="text-carmin">{o.consecuencia}</dd></div>}
          {o.cumplidaAt && <div><dt className="text-[11px] uppercase tracking-wide text-tinta-suave">Cumplida el</dt><dd className="text-tinta">{fecha(o.cumplidaAt)}</dd></div>}
          {o.evidencia && <div><dt className="text-[11px] uppercase tracking-wide text-tinta-suave">Evidencia</dt><dd className="text-tinta">{o.evidencia.fileUrl ? <a className="underline" href={o.evidencia.fileUrl} target="_blank" rel="noreferrer">{o.evidencia.name}</a> : o.evidencia.name}</dd></div>}
        </dl>
        {error && <p className="mt-3 text-sm text-carmin">{error}</p>}
        {aviso && <p className="mt-3 text-sm text-petroleo">{aviso}</p>}
      </Card>

      {o.estado !== 'cumplida' && (
        <Card header={<h2 className="font-sello-display text-base text-tinta">Seguimiento</h2>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select label="Estado" value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
              <option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="vencida">Vencida</option>
            </Select>
            <Select label="Responsable" value={form.responsableUserId} onChange={e => setForm({ ...form, responsableUserId: e.target.value })}>
              <option value="">Sin asignar</option>{responsables.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <Input label="Fecha límite" type="date" value={form.fechaLimite} onChange={e => setForm({ ...form, fechaLimite: e.target.value })} />
          </div>
          <div className="mt-3 flex gap-2 flex-wrap items-center">
            <Button variante="secundario" tamano="sm" onClick={guardar}>Guardar cambios</Button>
            <label className="text-sm text-tinta-suave flex items-center gap-2">
              <input type="file" className="text-[12px]" disabled={subiendo} onChange={e => { const f = e.target.files?.[0]; if (f) subirEvidencia(f) }} />
              {subiendo ? 'Subiendo…' : evidenciaId ? 'Evidencia lista' : 'Evidencia (opcional)'}
            </label>
            <Button variante="primario" tamano="sm" onClick={cumplir}><CheckCircle2 className="w-4 h-4" /> Marcar cumplida</Button>
            <Button variante="ghost" tamano="sm" className="ml-auto text-carmin" onClick={eliminar}><Trash2 className="w-4 h-4" /> Eliminar</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
