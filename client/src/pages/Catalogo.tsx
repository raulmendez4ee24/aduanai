/**
 * /catalogo — Catálogo maestro de partes (Ola 1, Operación 2026-08).
 * Cliente → número de parte → descripción → fracción → NICO → dictamen,
 * construido una vez y reutilizado. Sistema Sello: papel y tinta, sin datos
 * falsos, estado vacío honesto, errores visibles.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Search, Upload, Download, Plus, ChevronLeft, ChevronRight, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Badge, Button, Card, DataTable, EmptyState, Input, Select, Textarea, type Columna } from '../components/ui'
import { usePermissions } from '../hooks/usePermissions'
import {
  catalogoApi, descargarArchivo, archivoABase64, formatearFraccion, fechaCorta,
  type ParteResumen, type ParteDetalle, type VersionParte, type ReporteImport,
} from '../lib/api/catalogo'

export const GUIA_MODULO = {
  titulo: 'Catálogo de partes',
  pasos: [
    'Cada parte es un número de parte del cliente con su descripción, unidad, uso/destino y país de origen.',
    'La fracción y el NICO viven en versiones: alguien propone (manual, Clasificador, Historial o Excel) y quien tiene permiso de aprobar la vuelve vigente.',
    'Reclasificar una parte con versión vigente exige justificación; la versión anterior queda como "reemplazada", nunca se borra.',
    'El Clasificador consulta este catálogo antes de correr: un número de parte con versión vigente se responde igual siempre (consistencia = defensa legal).',
    'Importa tu catálogo desde Excel/CSV (columnas productCode, description, fractionCode, nico, unit, usoDestino, paisOrigen) y expórtalo cuando quieras.',
  ],
}

const USOS: { value: string; label: string }[] = [
  { value: '', label: 'Uso/destino: todos' },
  { value: 'INSUMO_IMMEX', label: 'Insumo IMMEX' },
  { value: 'VENTA_DIRECTA', label: 'Venta directa' },
  { value: 'ACTIVO_FIJO', label: 'Activo fijo' },
]

const ETIQUETA_USO: Record<string, string> = { INSUMO_IMMEX: 'Insumo IMMEX', VENTA_DIRECTA: 'Venta directa', ACTIVO_FIJO: 'Activo fijo' }
const ETIQUETA_FUENTE: Record<string, string> = { manual: 'Manual', clasificador: 'Clasificador', historial: 'Historial', lote: 'Excel' }

function tonoEstado(estado: string): 'petroleo' | 'ambar' | 'neutral' | 'carmin' {
  if (estado === 'vigente') return 'petroleo'
  if (estado === 'propuesta') return 'ambar'
  if (estado === 'rechazada') return 'carmin'
  return 'neutral'
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error. Intenta de nuevo.'
}

export function CatalogoPage() {
  const { can } = usePermissions()
  const puedeAprobar = can('classifier', 'approve')
  const puedeCrear = can('catalogo', 'create')
  const puedeExportar = can('catalogo', 'exportData')
  const [params, setParams] = useSearchParams()

  // Filtros en UN objeto (Ola 3 lo migrará a useEstadoPersistente).
  const [form, setForm] = useState({
    q: params.get('q') ?? '',
    capitulo: params.get('capitulo') ?? '',
    dictamen: (params.get('dictamen') as '' | 'con' | 'sin') ?? '',
    usoDestino: params.get('usoDestino') ?? '',
    page: Number(params.get('page') ?? 1) || 1,
  })
  const [filas, setFilas] = useState<ParteResumen[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionId, setSeleccionId] = useState<string | null>(params.get('parte'))
  const [nuevaAbierta, setNuevaAbierta] = useState(false)
  const [importAbierto, setImportAbierto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const LIMIT = 25

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const r = await catalogoApi.listar({ q: form.q, capitulo: form.capitulo, dictamen: form.dictamen, usoDestino: form.usoDestino, page: form.page, limit: LIMIT })
      setFilas(r.data)
      setTotal(r.pagination.total)
    } catch (e) {
      setError(mensajeDe(e))
      setFilas([])
      setTotal(0)
    } finally {
      setCargando(false)
    }
  }, [form.q, form.capitulo, form.dictamen, form.usoDestino, form.page])

  useEffect(() => {
    const t = setTimeout(() => { void cargar() }, form.q ? 250 : 0)
    return () => clearTimeout(t)
  }, [cargar, form.q])

  useEffect(() => {
    const next = new URLSearchParams()
    if (form.q) next.set('q', form.q)
    if (form.capitulo) next.set('capitulo', form.capitulo)
    if (form.dictamen) next.set('dictamen', form.dictamen)
    if (form.usoDestino) next.set('usoDestino', form.usoDestino)
    if (form.page > 1) next.set('page', String(form.page))
    if (seleccionId) next.set('parte', seleccionId)
    setParams(next, { replace: true })
  }, [form, seleccionId, setParams])

  useEffect(() => {
    const onCliente = () => { setForm(f => ({ ...f, page: 1 })); void cargar() }
    window.addEventListener('aduanai:cliente', onCliente)
    return () => window.removeEventListener('aduanai:cliente', onCliente)
  }, [cargar])

  async function exportar() {
    try {
      await descargarArchivo(catalogoApi.exportUrl({ q: form.q, capitulo: form.capitulo, dictamen: form.dictamen, usoDestino: form.usoDestino }), `catalogo-partes-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) { setError(mensajeDe(e)) }
  }

  const columnas: Columna<ParteResumen>[] = [
    { key: 'codigo', header: 'Número de parte', mono: true, render: p => <span className="font-medium">{p.productCode}</span> },
    { key: 'desc', header: 'Descripción', render: p => <span className="line-clamp-2">{p.description}</span> },
    { key: 'cliente', header: 'Cliente', render: p => <span className="text-tinta-suave">{p.clienteNombre ?? '—'}</span> },
    {
      key: 'fraccion', header: 'Fracción vigente', mono: true,
      render: p => p.versionVigente > 0 && p.fractionCode
        ? <span>{formatearFraccion(p.fractionCode)}{p.nico ? <span className="text-tinta-suave"> · NICO {p.nico}</span> : null}</span>
        : <Badge tono="ambar">Sin dictamen</Badge>,
    },
    {
      key: 'version', header: 'Versión', align: 'right', mono: true,
      render: p => (
        <span>
          {p.versionVigente > 0 ? `v${p.versionVigente}` : '—'}
          {p.propuestasPendientes > 0 && <Badge tono="ambar" className="ml-2">{p.propuestasPendientes} propuesta{p.propuestasPendientes > 1 ? 's' : ''}</Badge>}
        </span>
      ),
    },
    { key: 'uso', header: 'Uso/destino', render: p => <span className="text-tinta-suave">{p.usoDestino ? ETIQUETA_USO[p.usoDestino] ?? p.usoDestino : '—'}</span> },
    { key: 'act', header: 'Actualizado', mono: true, render: p => <span className="text-tinta-suave">{fechaCorta(p.updatedAt)}</span> },
  ]

  const paginas = Math.max(1, Math.ceil(total / LIMIT))
  const hayFiltros = !!(form.q || form.capitulo || form.dictamen || form.usoDestino)

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-sello-ui">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-petroleo" strokeWidth={1.5} aria-hidden />
          <h1 className="text-xl font-semibold text-tinta">Catálogo de partes</h1>
          <span className="text-sm text-tinta-suave">{cargando ? '' : `${total} parte${total === 1 ? '' : 's'}`}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeExportar && (
            <Button variante="secundario" tamano="sm" onClick={exportar} disabled={total === 0}>
              <Download className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Exportar Excel
            </Button>
          )}
          {puedeCrear && (
            <Button variante="secundario" tamano="sm" onClick={() => setImportAbierto(true)}>
              <Upload className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Importar Excel
            </Button>
          )}
          {puedeCrear && (
            <Button variante="primario" tamano="sm" onClick={() => setNuevaAbierta(true)}>
              <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Nueva parte
            </Button>
          )}
        </div>
      </div>

      {aviso && (
        <div role="status" className="flex items-start gap-2 border border-linea bg-petroleo-suave rounded-sello px-4 py-3 text-sm text-tinta">
          <CheckCircle2 className="w-4 h-4 text-sello mt-0.5" strokeWidth={1.5} aria-hidden />
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="text-tinta-suave hover:text-tinta"><X className="w-4 h-4" /></button>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 border border-carmin/30 bg-carmin-suave rounded-sello px-4 py-3 text-sm text-carmin">
          <AlertTriangle className="w-4 h-4 mt-0.5" strokeWidth={1.5} aria-hidden />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <Card denso>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_180px_200px] gap-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-tinta-suave shrink-0" strokeWidth={1.5} aria-hidden />
            <Input aria-label="Buscar" placeholder="Buscar por número de parte, descripción o fracción" className="flex-1" value={form.q} onChange={e => setForm(f => ({ ...f, q: e.target.value, page: 1 }))} />
          </div>
          <Input aria-label="Capítulo" placeholder="Capítulo (84)" mono maxLength={2} value={form.capitulo} onChange={e => setForm(f => ({ ...f, capitulo: e.target.value.replace(/\D/g, ''), page: 1 }))} />
          <Select aria-label="Dictamen" value={form.dictamen} onChange={e => setForm(f => ({ ...f, dictamen: e.target.value as '' | 'con' | 'sin', page: 1 }))}>
            <option value="">Dictamen: todos</option>
            <option value="con">Con dictamen vigente</option>
            <option value="sin">Sin dictamen vigente</option>
          </Select>
          <Select aria-label="Uso o destino" value={form.usoDestino} onChange={e => setForm(f => ({ ...f, usoDestino: e.target.value, page: 1 }))}>
            {USOS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
        </div>
      </Card>

      {cargando ? (
        <div className="space-y-2" aria-busy="true">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-papel-2 border border-linea rounded-sello" />)}</div>
      ) : filas.length === 0 && !hayFiltros ? (
        <Card>
          <EmptyState
            icono={Boxes}
            titulo="Todavía no hay partes en tu catálogo"
            descripcion="Importa tu catálogo desde Excel, crea la primera parte a mano o promueve una clasificación con feedback ✓ desde el Historial."
            accion={puedeCrear ? { label: 'Importar Excel', onClick: () => setImportAbierto(true) } : undefined}
          />
        </Card>
      ) : (
        <>
          <DataTable
            columnas={columnas}
            filas={filas}
            filaKey={p => p.id}
            onFilaClick={p => setSeleccionId(p.id)}
            vacio={<span className="text-sm text-tinta-suave">Ninguna parte coincide con los filtros.</span>}
          />
          {paginas > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variante="ghost" tamano="sm" onClick={() => setForm(f => ({ ...f, page: Math.max(1, f.page - 1) }))} disabled={form.page <= 1} aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm text-tinta-suave font-sello-mono">Página {form.page} de {paginas}</span>
              <Button variante="ghost" tamano="sm" onClick={() => setForm(f => ({ ...f, page: Math.min(paginas, f.page + 1) }))} disabled={form.page >= paginas} aria-label="Página siguiente"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </>
      )}

      {seleccionId && (
        <FichaParte
          id={seleccionId}
          puedeAprobar={puedeAprobar}
          puedeCrear={puedeCrear}
          onCerrar={() => setSeleccionId(null)}
          onCambio={(msg) => { setAviso(msg); void cargar() }}
        />
      )}
      {nuevaAbierta && (
        <NuevaParte
          onCerrar={() => setNuevaAbierta(false)}
          onCreada={(p) => { setNuevaAbierta(false); setAviso(`Parte ${p.productCode} creada.`); setSeleccionId(p.id); void cargar() }}
        />
      )}
      {importAbierto && (
        <ImportarExcel
          onCerrar={() => setImportAbierto(false)}
          onImportado={(rep) => { setAviso(`Importación: ${rep.creadas} creadas, ${rep.actualizadas} actualizadas, ${rep.errores.length} con error.`); void cargar() }}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Ficha de parte con versiones
// ──────────────────────────────────────────────────────────────────

function Modal({ titulo, onCerrar, children, ancho = 'max-w-3xl' }: { titulo: string; onCerrar: () => void; children: React.ReactNode; ancho?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])
  return (
    <div className="fixed inset-0 z-40 bg-tinta/30 flex items-start justify-center p-4 overflow-y-auto" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${ancho} bg-superficie border border-linea rounded-sello shadow-sello-float mt-8`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-linea">
          <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-tinta-suave hover:text-tinta focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function FichaParte({ id, puedeAprobar, puedeCrear, onCerrar, onCambio }: { id: string; puedeAprobar: boolean; puedeCrear: boolean; onCerrar: () => void; onCambio: (msg: string) => void }) {
  const [parte, setParte] = useState<ParteDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nuevaVersion, setNuevaVersion] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try { setParte((await catalogoApi.obtener(id)).data); setError(null) }
    catch (e) { setError(mensajeDe(e)) }
  }, [id])
  useEffect(() => { void cargar() }, [cargar])

  async function aprobar(v: VersionParte) {
    setOcupado(`aprobar-${v.version}`)
    try {
      const r = await catalogoApi.aprobarVersion(id, v.version)
      setParte(r.data.parte)
      onCambio(`Versión ${v.version} de ${r.data.parte.productCode} aprobada: ${formatearFraccion(v.fractionCode)} es la vigente.`)
    } catch (e) { setError(mensajeDe(e)) } finally { setOcupado(null) }
  }
  async function rechazar(v: VersionParte) {
    const motivo = window.prompt(`Motivo para rechazar la versión ${v.version} (opcional):`) ?? undefined
    setOcupado(`rechazar-${v.version}`)
    try {
      const r = await catalogoApi.rechazarVersion(id, v.version, motivo)
      setParte(r.data.parte)
      onCambio(`Versión ${v.version} rechazada.`)
    } catch (e) { setError(mensajeDe(e)) } finally { setOcupado(null) }
  }

  return (
    <Modal titulo={parte ? `${parte.productCode}` : 'Parte'} onCerrar={onCerrar}>
      {error && <p role="alert" className="text-sm text-carmin mb-3">{error}</p>}
      {!parte ? (
        <p className="text-sm text-tinta-suave">Cargando…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="md:col-span-2"><span className="text-tinta-suave">Descripción</span><p className="text-tinta">{parte.description}</p></div>
            <div><span className="text-tinta-suave">Cliente</span><p className="text-tinta">{parte.clienteNombre ?? '—'}</p></div>
            <div><span className="text-tinta-suave">Unidad</span><p className="text-tinta">{parte.unit}</p></div>
            <div><span className="text-tinta-suave">Uso/destino</span><p className="text-tinta">{parte.usoDestino ? ETIQUETA_USO[parte.usoDestino] ?? parte.usoDestino : '—'}</p></div>
            <div><span className="text-tinta-suave">País de origen</span><p className="text-tinta font-sello-mono">{parte.paisOrigen ?? '—'}</p></div>
            <div className="md:col-span-2">
              <span className="text-tinta-suave">Clasificación vigente</span>
              {parte.versionVigente > 0 && parte.fractionCode ? (
                <p className="text-tinta font-sello-mono text-lg">
                  {formatearFraccion(parte.fractionCode)}{parte.nico ? ` · NICO ${parte.nico}` : ''} <Badge tono="petroleo" className="ml-2 align-middle">v{parte.versionVigente}</Badge>
                </p>
              ) : (
                <p><Badge tono="ambar">Sin dictamen vigente</Badge> <span className="text-tinta-suave">— propón una versión o apruébala si ya hay propuesta.</span></p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-tinta">Versiones ({parte.totalVersiones})</h3>
            {puedeCrear && <Button variante="secundario" tamano="sm" onClick={() => setNuevaVersion(v => !v)}>{nuevaVersion ? 'Cancelar' : 'Nueva versión'}</Button>}
          </div>

          {nuevaVersion && (
            <FormNuevaVersion
              parte={parte}
              puedeAprobar={puedeAprobar}
              onListo={(p, msg) => { setParte(p); setNuevaVersion(false); onCambio(msg) }}
            />
          )}

          {parte.versiones.length === 0 ? (
            <p className="text-sm text-tinta-suave">Sin versiones todavía.</p>
          ) : (
            <ol className="divide-y divide-linea border border-linea rounded-sello">
              {parte.versiones.map(v => (
                <li key={v.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-sello-mono font-medium text-tinta">v{v.version} · {formatearFraccion(v.fractionCode)}{v.nico ? ` · NICO ${v.nico}` : ''}</span>
                    <Badge tono={tonoEstado(v.estado)}>{v.estado}</Badge>
                    <Badge tono="neutral">{ETIQUETA_FUENTE[v.fuente] ?? v.fuente}</Badge>
                    {v.tigieVersion && <span className="text-tinta-suave text-13">TIGIE {v.tigieVersion}</span>}
                    <span className="flex-1" />
                    {v.estado === 'propuesta' && puedeAprobar && (
                      <>
                        <Button variante="primario" tamano="sm" loading={ocupado === `aprobar-${v.version}`} onClick={() => aprobar(v)}>Aprobar</Button>
                        <Button variante="ghost" tamano="sm" loading={ocupado === `rechazar-${v.version}`} onClick={() => rechazar(v)}>Rechazar</Button>
                      </>
                    )}
                    {v.estado === 'propuesta' && !puedeAprobar && <span className="text-13 text-ambar">Pendiente de aprobación</span>}
                  </div>
                  <p className="text-tinta-suave mt-1">
                    Propuso {v.propuestoPorNombre ?? 'usuario'} el <span className="font-sello-mono">{fechaCorta(v.createdAt)}</span>
                    {v.aprobadoAt && <> · {v.estado === 'rechazada' ? 'Rechazó' : 'Aprobó'} {v.aprobadoPorNombre ?? 'usuario'} el <span className="font-sello-mono">{fechaCorta(v.aprobadoAt)}</span></>}
                  </p>
                  {v.justificacion && <p className="text-tinta mt-1">Justificación: {v.justificacion}</p>}
                  {v.classificationId && <p className="text-13 text-tinta-suave mt-1 font-sello-mono">Clasificación {v.classificationId}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  )
}

function FormNuevaVersion({ parte, puedeAprobar, onListo }: { parte: ParteDetalle; puedeAprobar: boolean; onListo: (p: ParteDetalle, msg: string) => void }) {
  const [form, setForm] = useState({ fractionCode: '', nico: '', justificacion: '', aprobar: false })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const requiereJustificacion = parte.versionVigente > 0

  async function enviar() {
    setError(null)
    if (!/^\d{8}$/.test(form.fractionCode.replace(/[.\-\s]/g, ''))) return setError('La fracción debe tener 8 dígitos (p. ej. 7318.15.99).')
    if (requiereJustificacion && !form.justificacion.trim()) return setError('Esta parte ya tiene una clasificación vigente: la reclasificación exige justificación.')
    setEnviando(true)
    try {
      const r = await catalogoApi.proponerVersion(parte.id, {
        fractionCode: form.fractionCode, nico: form.nico || null, justificacion: form.justificacion || null, fuente: 'manual', aprobar: form.aprobar && puedeAprobar,
      })
      onListo(r.data.parte, form.aprobar && puedeAprobar ? `Versión ${r.data.version.version} aprobada y vigente.` : `Versión ${r.data.version.version} propuesta; pendiente de aprobación.`)
    } catch (e) { setError(mensajeDe(e)) } finally { setEnviando(false) }
  }

  return (
    <div className="border border-linea rounded-sello bg-papel-2/50 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2">
        <Input label="Fracción arancelaria" requerido mono placeholder="7318.15.99" value={form.fractionCode} onChange={e => setForm(f => ({ ...f, fractionCode: e.target.value }))} />
        <Input label="NICO" mono placeholder="01" maxLength={2} value={form.nico} onChange={e => setForm(f => ({ ...f, nico: e.target.value.replace(/\D/g, '') }))} />
      </div>
      <Textarea
        label={requiereJustificacion ? 'Justificación (obligatoria: ya hay una versión vigente)' : 'Justificación'}
        requerido={requiereJustificacion}
        rows={3}
        placeholder="Por qué cambia la clasificación: ficha técnica, criterio, resolución…"
        value={form.justificacion}
        onChange={e => setForm(f => ({ ...f, justificacion: e.target.value }))}
      />
      {puedeAprobar && (
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" checked={form.aprobar} onChange={e => setForm(f => ({ ...f, aprobar: e.target.checked }))} className="accent-petroleo" />
          Aprobar en el acto (queda vigente y reemplaza la anterior)
        </label>
      )}
      {error && <p role="alert" className="text-sm text-carmin">{error}</p>}
      <div className="flex justify-end">
        <Button variante="primario" tamano="sm" loading={enviando} onClick={enviar}>Guardar versión</Button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Nueva parte
// ──────────────────────────────────────────────────────────────────

function NuevaParte({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: (p: ParteDetalle) => void }) {
  const [form, setForm] = useState({ productCode: '', description: '', unit: 'Pza', usoDestino: '', paisOrigen: '', fractionCode: '', nico: '' })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    setError(null)
    if (!form.productCode.trim()) return setError('El número de parte es obligatorio.')
    if (!form.description.trim()) return setError('La descripción es obligatoria.')
    if (form.fractionCode && !/^\d{8}$/.test(form.fractionCode.replace(/[.\-\s]/g, ''))) return setError('La fracción debe tener 8 dígitos.')
    setEnviando(true)
    try {
      const r = await catalogoApi.crear({
        productCode: form.productCode.trim(), description: form.description.trim(), unit: form.unit || 'Pza',
        usoDestino: form.usoDestino || null, paisOrigen: form.paisOrigen || null,
        fractionCode: form.fractionCode || null, nico: form.nico || null,
      })
      onCreada(r.data)
    } catch (e) { setError(mensajeDe(e)) } finally { setEnviando(false) }
  }

  return (
    <Modal titulo="Nueva parte" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2">
          <Input label="Número de parte" requerido mono value={form.productCode} onChange={e => setForm(f => ({ ...f, productCode: e.target.value }))} />
          <Input label="Unidad" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
        </div>
        <Textarea label="Descripción" requerido rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Select label="Uso/destino" value={form.usoDestino} onChange={e => setForm(f => ({ ...f, usoDestino: e.target.value }))}>
            <option value="">Sin definir</option>
            {USOS.filter(u => u.value).map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
          <Input label="País de origen" mono placeholder="CN" value={form.paisOrigen} onChange={e => setForm(f => ({ ...f, paisOrigen: e.target.value.toUpperCase() }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2">
          <Input label="Fracción inicial (opcional)" mono placeholder="7318.15.99" hint="Queda como versión 1; vigente solo si tienes permiso de aprobar." value={form.fractionCode} onChange={e => setForm(f => ({ ...f, fractionCode: e.target.value }))} />
          <Input label="NICO" mono maxLength={2} value={form.nico} onChange={e => setForm(f => ({ ...f, nico: e.target.value.replace(/\D/g, '') }))} />
        </div>
        {error && <p role="alert" className="text-sm text-carmin">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variante="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variante="primario" loading={enviando} onClick={enviar}>Crear parte</Button>
        </div>
      </div>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────
// Importar Excel / CSV
// ──────────────────────────────────────────────────────────────────

function ImportarExcel({ onCerrar, onImportado }: { onCerrar: () => void; onImportado: (r: ReporteImport) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [reporte, setReporte] = useState<ReporteImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function importar() {
    if (!archivo) return
    setError(null)
    setEnviando(true)
    try {
      const b64 = await archivoABase64(archivo)
      const r = await catalogoApi.importar({ archivoBase64: b64, nombreArchivo: archivo.name })
      setReporte(r.data)
      onImportado(r.data)
    } catch (e) { setError(mensajeDe(e)) } finally { setEnviando(false) }
  }

  return (
    <Modal titulo="Importar catálogo desde Excel o CSV" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="space-y-4 text-sm">
        <p className="text-tinta-suave">
          Columnas: <span className="font-sello-mono text-tinta">productCode, description, fractionCode, nico, unit, usoDestino, paisOrigen</span>.
          Obligatorias: productCode y description. usoDestino: INSUMO_IMMEX, VENTA_DIRECTA o ACTIVO_FIJO.
          Las partes existentes se actualizan; una fracción distinta a la vigente queda como propuesta (no la pisa).
        </p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { setArchivo(e.target.files?.[0] ?? null); setReporte(null) }} />
        <div className="flex items-center gap-3">
          <Button variante="secundario" onClick={() => inputRef.current?.click()}>Elegir archivo</Button>
          <span className="text-tinta-suave">{archivo ? archivo.name : 'Ningún archivo elegido'}</span>
        </div>
        {error && <p role="alert" className="text-carmin">{error}</p>}
        {reporte && (
          <div className="border border-linea rounded-sello p-4 space-y-2">
            <p className="text-tinta">
              {reporte.total} filas · <span className="text-sello font-medium">{reporte.creadas} creadas</span> · {reporte.actualizadas} actualizadas
              {reporte.versionesPropuestas > 0 && <> · {reporte.versionesPropuestas} versión(es) pendientes de aprobación</>}
              {reporte.errores.length > 0 && <> · <span className="text-carmin font-medium">{reporte.errores.length} con error</span></>}
            </p>
            {reporte.errores.length > 0 && (
              <ul className="max-h-48 overflow-y-auto divide-y divide-linea border border-linea rounded-sello-sm">
                {reporte.errores.map((e, i) => (
                  <li key={i} className="px-3 py-1.5 text-13">
                    <span className="font-sello-mono text-tinta-suave">Fila {e.fila}{e.productCode ? ` · ${e.productCode}` : ''}</span> — <span className="text-carmin">{e.mensaje}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variante="ghost" onClick={onCerrar}>{reporte ? 'Cerrar' : 'Cancelar'}</Button>
          <Button variante="primario" loading={enviando} disabled={!archivo || !!reporte} onClick={importar}>Importar</Button>
        </div>
      </div>
    </Modal>
  )
}
