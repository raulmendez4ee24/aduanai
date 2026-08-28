/**
 * Clasificador en lote — "Excel entra, Excel sale" (Ola 1, Operación 2026-08).
 *
 * Subes un Excel/CSV con 50–500 partidas; cada fila se clasifica con el
 * mismo pipeline del Clasificador (una a la vez, server-side), recibe un
 * semáforo verde/ámbar/rojo y sale de vuelta como Excel con fracción, NICO,
 * confianza, coincidencia con catálogo y alternativas descartadas. La pestaña
 * "Dictámenes" es la bandeja de solicitudes de dictamen humano.
 *
 * Diseño Sello: papel y tinta, sin sombras. Sin datos falsos: todo lo que se
 * pinta viene del servidor; vacío = estado vacío honesto.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Layers, Upload, FileDown, FileSpreadsheet, RefreshCw, Check, Gavel, AlertTriangle } from 'lucide-react'
import { Button, Card, Badge, Input, Textarea, DataTable, EmptyState, formatFechaSello, type Columna } from '../components/ui'
import { formatFraction } from '../lib/format'
import {
  apiLote, apiDictamen, archivoABase64,
  type Lote, type FilaLote, type Semaforo, type SolicitudDictamen, USOS_DESTINO,
} from '../lib/api/clasificacion-lote'

export const GUIA_MODULO = {
  titulo: 'Clasificador en lote',
  pasos: [
    'Descarga la plantilla o usa tu propio Excel/CSV: solo la columna "descripcion" es obligatoria (código, contexto, país, valor USD y uso/destino son opcionales; el orden y los acentos no importan).',
    'Arrastra el archivo o selecciónalo. Máximo 500 filas por lote; cada fila se clasifica con el mismo pipeline del Clasificador, una a la vez.',
    'Sigue el progreso en vivo: verde = confianza alta y coincide con tu catálogo (o sin alertas); ámbar = confianza media, discrepancia con catálogo o alertas; rojo = sin candidato o error.',
    'Filtra por semáforo, revisa las ámbar/rojas y corrige la fracción cuando haga falta (queda como feedback y clasificación nueva).',
    'Exporta el Excel de salida con todas tus columnas más fracción, NICO, confianza, semáforo, coincidencia y alternativas descartadas.',
    'En "Dictámenes" un usuario con permiso de aprobación resuelve las solicitudes de dictamen humano que salen del Clasificador.',
  ],
}

const LABEL_SEMAFORO: Record<Semaforo, string> = { verde: 'Verde', ambar: 'Ámbar', rojo: 'Rojo' }
const LABEL_ESTADO: Record<Lote['status'], string> = { queued: 'En cola', running: 'Procesando', done: 'Terminado', failed: 'Detenido' }

function BadgeSemaforo({ s }: { s: Semaforo | null }) {
  if (!s) return <Badge tono="neutral">Pendiente</Badge>
  const tono = s === 'verde' ? 'petroleo' : s === 'ambar' ? 'ambar' : 'carmin'
  return <Badge tono={tono}>{LABEL_SEMAFORO[s]}</Badge>
}

function labelUso(v: string | null): string {
  if (!v) return ''
  return USOS_DESTINO.find(u => u.valor === v)?.label ?? v
}

export function ClasificadorLotePage() {
  const [pestana, setPestana] = useState<'lotes' | 'dictamenes'>('lotes')

  // Estado del formulario principal (un solo objeto — Ola 3 lo hará persistente).
  const [form, setForm] = useState<{ archivo: File | null; arrastrando: boolean }>({ archivo: null, arrastrando: false })
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [lotes, setLotes] = useState<Lote[] | null>(null)
  const [loteActivo, setLoteActivo] = useState<Lote | null>(null)
  const [filas, setFilas] = useState<FilaLote[] | null>(null)
  const [filtro, setFiltro] = useState<Semaforo | 'pendiente' | ''>('')
  const [revisando, setRevisando] = useState<FilaLote | null>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const cargarLotes = useCallback(async () => {
    try {
      const r = await apiLote.lista()
      setLotes(r.data)
      return r.data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cargar los lotes.')
      setLotes([])
      return []
    }
  }, [])

  useEffect(() => { void cargarLotes() }, [cargarLotes])

  const cargarFilas = useCallback(async (id: string, f: typeof filtro) => {
    try {
      const r = await apiLote.filas(id, f)
      setFilas(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cargar las filas.')
    }
  }, [])

  // Progreso en vivo: polling cada 3 s mientras el lote activo esté en cola/procesando.
  useEffect(() => {
    if (!loteActivo) return
    void cargarFilas(loteActivo.id, filtro)
    if (loteActivo.status !== 'queued' && loteActivo.status !== 'running') return
    const iv = setInterval(async () => {
      try {
        const r = await apiLote.detalle(loteActivo.id)
        setLoteActivo(r.data)
        setLotes(prev => prev ? prev.map(l => (l.id === r.data.id ? r.data : l)) : prev)
        void cargarFilas(r.data.id, filtro)
      } catch { /* transitorio: el siguiente tick reintenta */ }
    }, 3000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loteActivo?.id, loteActivo?.status, filtro])

  function elegirArchivo(f: File | null) {
    setError('')
    setAviso('')
    if (f && !/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setError('Sube un archivo .xlsx, .xls o .csv.')
      return
    }
    setForm(s => ({ ...s, archivo: f, arrastrando: false }))
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    elegirArchivo(e.dataTransfer.files?.[0] ?? null)
  }

  async function subir() {
    if (!form.archivo || subiendo) return
    setSubiendo(true)
    setError('')
    setAviso('')
    try {
      const base64 = await archivoABase64(form.archivo)
      const r = await apiLote.importar(form.archivo.name, base64)
      const omitidas = r.data.omitidas.length
      setAviso(`Lote creado con ${r.data.totalFilas} filas${omitidas ? ` (${omitidas} fila${omitidas === 1 ? '' : 's'} sin descripción omitida${omitidas === 1 ? '' : 's'}: ${r.data.omitidas.map(o => o.numeroFila).join(', ')})` : ''}. Columnas detectadas: ${Object.entries(r.data.columnas).map(([k, v]) => `${k} → ${v}`).join(', ')}.`)
      setForm({ archivo: null, arrastrando: false })
      if (inputArchivo.current) inputArchivo.current.value = ''
      const lista = await cargarLotes()
      const nuevo = lista.find(l => l.id === r.data.id)
      if (nuevo) { setLoteActivo(nuevo); setFiltro('') }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude importar el archivo.')
    } finally {
      setSubiendo(false)
    }
  }

  async function exportar() {
    if (!loteActivo) return
    setError('')
    try { await apiLote.descargarExport(loteActivo.id, loteActivo.nombreArchivo) }
    catch (e) { setError(e instanceof Error ? e.message : 'No pude exportar.') }
  }

  async function descargarPlantilla() {
    setError('')
    try { await apiLote.descargarPlantilla() }
    catch (e) { setError(e instanceof Error ? e.message : 'No pude descargar la plantilla.') }
  }

  async function guardarRevision(fila: FilaLote, body: { fractionCode?: string; nota?: string }) {
    if (!loteActivo) return
    setError('')
    try {
      await apiLote.revisar(loteActivo.id, fila.id, body)
      setRevisando(null)
      await cargarFilas(loteActivo.id, filtro)
      const r = await apiLote.detalle(loteActivo.id)
      setLoteActivo(r.data)
      setLotes(prev => prev ? prev.map(l => (l.id === r.data.id ? r.data : l)) : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude guardar la revisión.')
    }
  }

  const columnasLotes: Columna<Lote>[] = [
    { key: 'archivo', header: 'Archivo', render: l => <span className="text-sm text-tinta">{l.nombreArchivo}</span> },
    { key: 'fecha', header: 'Fecha', mono: true, render: l => formatFechaSello(l.createdAt) ?? '' },
    { key: 'estado', header: 'Estado', render: l => <Badge tono={l.status === 'failed' ? 'carmin' : l.status === 'done' ? 'petroleo' : 'neutral'}>{LABEL_ESTADO[l.status]}</Badge> },
    { key: 'progreso', header: 'Progreso', mono: true, align: 'right', render: l => `${l.procesadas}/${l.totalFilas}` },
    { key: 'verdes', header: 'Verdes', mono: true, align: 'right', render: l => l.verdes },
    { key: 'ambar', header: 'Ámbar', mono: true, align: 'right', render: l => l.ambar },
    { key: 'rojas', header: 'Rojas', mono: true, align: 'right', render: l => l.rojas },
  ]

  const columnasFilas: Columna<FilaLote>[] = [
    { key: 'n', header: '#', mono: true, align: 'right', render: f => f.numeroFila },
    { key: 'codigo', header: 'Código', mono: true, render: f => f.productCode ?? '' },
    { key: 'desc', header: 'Descripción', render: f => <span className="text-sm text-tinta line-clamp-2 max-w-md block" title={f.descripcion}>{f.descripcion}</span> },
    { key: 'fraccion', header: 'Fracción', mono: true, render: f => f.fractionCode ? formatFraction(f.fractionCode) : '' },
    { key: 'conf', header: 'Conf.', mono: true, align: 'right', render: f => f.confidence ?? '' },
    { key: 'sem', header: 'Semáforo', render: f => <BadgeSemaforo s={f.semaforo} /> },
    {
      key: 'cat', header: 'Catálogo', render: f =>
        f.coincideCatalogo === null
          ? <span className="text-13 text-tinta-suave">sin parte</span>
          : f.coincideCatalogo
            ? <span className="text-13 text-petroleo inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden /> coincide</span>
            : <span className="text-13 text-ambar font-sello-mono">≠ {formatFraction(f.fraccionCatalogo)}</span>,
    },
    // ── CIRCUITO catálogo↔lote ── de dónde salió la fracción de la fila.
    {
      key: 'origen', header: 'Origen', render: f =>
        f.origen === 'catalogo'
          ? <span className="text-13 text-petroleo">catálogo (dictamen vigente)</span>
          : f.origen === 'clasificador'
            ? <span className="text-13 text-tinta-suave">clasificador</span>
            : <span className="text-13 text-tinta-suave">—</span>,
    },
    { key: 'error', header: 'Error', render: f => f.error ? <span className="text-13 text-carmin line-clamp-2 max-w-xs block" title={f.error}>{f.error}</span> : '' },
    {
      key: 'acciones', header: '', render: f => (
        <div className="flex items-center gap-1 justify-end">
          {f.revisado && <Badge tono="petroleo">Revisada</Badge>}
          <Button variante="secundario" tamano="sm" onClick={e => { e.stopPropagation(); setRevisando(f) }} disabled={!f.semaforo}>
            {f.revisado ? 'Reabrir' : 'Revisar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-5 font-sello-ui">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sello-display text-28 text-tinta tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-petroleo" strokeWidth={1.5} aria-hidden />
            Clasificador en lote
          </h1>
          <p className="text-sm text-tinta-suave mt-1">Excel entra, Excel sale: cada partida se clasifica con el mismo pipeline del Clasificador y recibe un semáforo.</p>
        </div>
        <div className="flex border border-linea rounded-sello-sm overflow-hidden" role="tablist">
          {(['lotes', 'dictamenes'] as const).map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={pestana === t}
              onClick={() => setPestana(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${pestana === t ? 'bg-petroleo-suave text-petroleo' : 'bg-superficie text-tinta-suave hover:text-tinta'}`}
            >
              {t === 'lotes' ? 'Lotes' : 'Dictámenes'}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div role="alert" className="bg-carmin-suave border border-carmin/25 text-carmin rounded-sello px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {aviso && <div className="bg-petroleo-suave border border-petroleo/15 text-tinta rounded-sello px-4 py-3 text-sm">{aviso}</div>}

      {pestana === 'dictamenes' ? (
        <BandejaDictamenes onError={setError} />
      ) : (
        <>
          {/* Subida */}
          <Card denso>
            <div
              onDragOver={e => { e.preventDefault(); setForm(s => ({ ...s, arrastrando: true })) }}
              onDragLeave={() => setForm(s => ({ ...s, arrastrando: false }))}
              onDrop={onDrop}
              className={`border border-dashed rounded-sello px-6 py-8 text-center transition-colors duration-150 ${form.arrastrando ? 'border-petroleo bg-petroleo-suave' : 'border-linea bg-papel'}`}
            >
              <Upload className="w-6 h-6 mx-auto text-tinta-suave" strokeWidth={1.5} aria-hidden />
              <p className="text-base text-tinta mt-2">
                {form.archivo ? <span className="font-sello-mono">{form.archivo.name}</span> : 'Arrastra tu Excel/CSV aquí o selecciónalo'}
              </p>
              <p className="text-13 text-tinta-suave mt-1">Columna obligatoria: descripción. Opcionales: código, contexto, país origen, valor USD, uso/destino. Máximo 500 filas.</p>
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                <input ref={inputArchivo} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => elegirArchivo(e.target.files?.[0] ?? null)} />
                <Button variante="secundario" tamano="sm" onClick={() => inputArchivo.current?.click()}>
                  <FileSpreadsheet className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                  Seleccionar archivo
                </Button>
                <Button variante="primario" tamano="sm" onClick={subir} loading={subiendo} disabled={!form.archivo}>
                  <Upload className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                  Clasificar lote
                </Button>
                <Button variante="ghost" tamano="sm" onClick={descargarPlantilla}>
                  <FileDown className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                  Descargar plantilla
                </Button>
              </div>
            </div>
          </Card>

          {/* Lista de lotes */}
          <Card
            denso
            header={
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-base font-medium text-tinta">Lotes</h2>
                <Button variante="ghost" tamano="sm" onClick={() => void cargarLotes()}>
                  <RefreshCw className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                  Actualizar
                </Button>
              </div>
            }
          >
            {lotes === null ? (
              <p className="text-sm text-tinta-suave">Cargando lotes…</p>
            ) : lotes.length === 0 ? (
              <EmptyState
                icono={Layers}
                titulo="Aún no hay lotes"
                descripcion="Sube un Excel o CSV con tus partidas y aquí verás el progreso y el semáforo de cada una."
                accion={{ label: 'Descargar plantilla', onClick: descargarPlantilla }}
              />
            ) : (
              <DataTable
                columnas={columnasLotes}
                filas={lotes}
                filaKey={l => l.id}
                onFilaClick={l => { setLoteActivo(l); setFiltro(''); setFilas(null) }}
              />
            )}
          </Card>

          {/* Lote activo */}
          {loteActivo && (
            <Card
              denso
              header={
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-base font-medium text-tinta truncate">{loteActivo.nombreArchivo}</h2>
                    <p className="text-13 text-tinta-suave mt-0.5">
                      {LABEL_ESTADO[loteActivo.status]} · <span className="font-sello-mono">{loteActivo.procesadas}/{loteActivo.totalFilas}</span> procesadas
                      {loteActivo.status === 'running' && ' — una fila a la vez, 1 a 3 min por fila. Puedes navegar; el lote sigue en el servidor.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tono="petroleo">Verde {loteActivo.verdes}</Badge>
                    <Badge tono="ambar">Ámbar {loteActivo.ambar}</Badge>
                    <Badge tono="carmin">Rojo {loteActivo.rojas}</Badge>
                    <Button variante="primario" tamano="sm" onClick={exportar}>
                      <FileDown className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                      Exportar Excel
                    </Button>
                  </div>
                </div>
              }
            >
              {/* Barra de progreso */}
              <div className="h-2 w-full bg-papel-2 rounded-sello-sm overflow-hidden flex mb-4" aria-label="Progreso del lote">
                {loteActivo.totalFilas > 0 && (
                  <>
                    <div className="bg-petroleo h-full" style={{ width: `${(loteActivo.verdes / loteActivo.totalFilas) * 100}%` }} />
                    <div className="bg-ambar h-full" style={{ width: `${(loteActivo.ambar / loteActivo.totalFilas) * 100}%` }} />
                    <div className="bg-carmin h-full" style={{ width: `${(loteActivo.rojas / loteActivo.totalFilas) * 100}%` }} />
                  </>
                )}
              </div>
              {/* ── CIRCUITO catálogo↔lote ── ahorro medido, no prometido. */}
              {loteActivo.origen && loteActivo.origen.desdeCatalogo > 0 && (
                <p className="text-13 text-tinta-suave mb-4">
                  <span className="font-sello-mono text-tinta">{loteActivo.origen.desdeCatalogo}</span> de{' '}
                  <span className="font-sello-mono text-tinta">{loteActivo.totalFilas}</span> fila(s) se resolvieron desde el catálogo
                  (número de parte con dictamen vigente): esas no pasaron por el modelo.
                </p>
              )}
              {loteActivo.errorMsg && (
                <p className="text-sm text-carmin bg-carmin-suave border border-carmin/25 rounded-sello-sm px-3 py-2 mb-4">{loteActivo.errorMsg}</p>
              )}

              <div className="flex items-center gap-1 mb-3 flex-wrap" role="group" aria-label="Filtrar por semáforo">
                {([['', 'Todas'], ['verde', 'Verdes'], ['ambar', 'Ámbar'], ['rojo', 'Rojas'], ['pendiente', 'Pendientes']] as const).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={filtro === v}
                    onClick={() => setFiltro(v)}
                    className={`px-3 py-1.5 text-sm rounded-sello-sm border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${filtro === v ? 'bg-petroleo-suave border-petroleo/20 text-petroleo' : 'bg-superficie border-linea text-tinta-suave hover:text-tinta'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {filas === null ? (
                <p className="text-sm text-tinta-suave">Cargando filas…</p>
              ) : (
                <DataTable
                  columnas={columnasFilas}
                  filas={filas}
                  filaKey={f => f.id}
                  vacio={<span className="text-sm text-tinta-suave">{filtro ? 'Ninguna fila con ese semáforo.' : 'El lote no tiene filas.'}</span>}
                />
              )}
            </Card>
          )}

          {revisando && (
            <RevisarFila fila={revisando} onCancelar={() => setRevisando(null)} onGuardar={body => guardarRevision(revisando, body)} />
          )}
        </>
      )}
    </div>
  )
}

function RevisarFila({ fila, onCancelar, onGuardar }: { fila: FilaLote; onCancelar: () => void; onGuardar: (b: { fractionCode?: string; nota?: string }) => Promise<void> }) {
  const [fraccion, setFraccion] = useState(fila.fractionCode ? formatFraction(fila.fractionCode) : '')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cambia = fraccion.replace(/[^0-9]/g, '') !== (fila.fractionCode ?? '').replace(/[^0-9]/g, '')

  async function guardar(conCorreccion: boolean) {
    setGuardando(true)
    try { await onGuardar({ fractionCode: conCorreccion ? fraccion : undefined, nota: nota.trim() || undefined }) }
    finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-tinta/30 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Revisar fila ${fila.numeroFila}`}>
      <Card className="w-full max-w-lg shadow-sello-float" header={<h3 className="text-base font-medium text-tinta">Revisar fila {fila.numeroFila}</h3>}>
        <p className="text-sm text-tinta leading-relaxed">{fila.descripcion}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-13 text-tinta-suave">
          {fila.productCode && <><dt>Código</dt><dd className="font-sello-mono text-tinta">{fila.productCode}</dd></>}
          {fila.usoDestino && <><dt>Uso/destino</dt><dd className="text-tinta">{labelUso(fila.usoDestino)}</dd></>}
          <dt>Propuesta</dt><dd className="font-sello-mono text-tinta">{fila.fractionCode ? formatFraction(fila.fractionCode) : '— sin candidato'}{fila.confidence != null ? ` · ${fila.confidence}/100` : ''}</dd>
          {fila.fraccionCatalogo && <><dt>Catálogo</dt><dd className="font-sello-mono text-tinta">{formatFraction(fila.fraccionCatalogo)}</dd></>}
          {fila.error && <><dt>Error</dt><dd className="text-carmin">{fila.error}</dd></>}
        </dl>
        <div className="mt-4 space-y-3">
          <Input label="Fracción correcta" mono value={fraccion} onChange={e => setFraccion(e.target.value)} placeholder="7318.15.99" hint="8 dígitos; debe existir en el catálogo TIGIE cargado." />
          <Textarea label="Nota" rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Por qué (opcional)" />
        </div>
        <div className="flex items-center justify-end gap-2 mt-5 flex-wrap">
          <Button variante="ghost" tamano="sm" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
          <Button variante="secundario" tamano="sm" onClick={() => guardar(false)} loading={guardando && !cambia}>Marcar revisada</Button>
          <Button variante="primario" tamano="sm" onClick={() => guardar(true)} disabled={!cambia || fraccion.replace(/[^0-9]/g, '').length !== 8} loading={guardando && cambia}>
            Corregir fracción
          </Button>
        </div>
      </Card>
    </div>
  )
}

function BandejaDictamenes({ onError }: { onError: (m: string) => void }) {
  const [estado, setEstado] = useState<SolicitudDictamen['estado'] | ''>('abierta')
  const [solicitudes, setSolicitudes] = useState<SolicitudDictamen[] | null>(null)
  const [resolviendo, setResolviendo] = useState<SolicitudDictamen | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await apiDictamen.bandeja(estado)
      setSolicitudes(r.data)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pude cargar la bandeja.')
      setSolicitudes([])
    }
  }, [estado, onError])

  useEffect(() => { void cargar() }, [cargar])

  const LABEL: Record<SolicitudDictamen['estado'], string> = { abierta: 'Abierta', en_revision: 'En revisión', dictaminada: 'Dictaminada', rechazada: 'Rechazada' }

  const columnas: Columna<SolicitudDictamen>[] = [
    { key: 'fecha', header: 'Fecha', mono: true, render: s => formatFechaSello(s.createdAt) ?? '' },
    { key: 'desc', header: 'Producto', render: s => <span className="text-sm text-tinta line-clamp-2 max-w-md block">{s.clasificacion?.inputDescription ?? '—'}</span> },
    { key: 'prop', header: 'Propuesta IA', mono: true, render: s => s.clasificacion ? formatFraction(s.clasificacion.fractionCode) : '' },
    { key: 'motivo', header: 'Motivo', render: s => <span className="text-13 text-tinta-suave line-clamp-2 max-w-xs block">{s.motivo ?? ''}</span> },
    { key: 'quien', header: 'Solicitó', render: s => <span className="text-13 text-tinta-suave">{s.solicitante?.name ?? s.solicitante?.email ?? ''}</span> },
    { key: 'estado', header: 'Estado', render: s => <Badge tono={s.estado === 'dictaminada' ? 'petroleo' : s.estado === 'rechazada' ? 'carmin' : 'ambar'}>{LABEL[s.estado]}</Badge> },
    { key: 'dict', header: 'Dictamen', mono: true, render: s => s.dictamen?.fractionCode ? `${formatFraction(s.dictamen.fractionCode)}${s.dictamen.nico ? ` NICO ${s.dictamen.nico}` : ''}` : '' },
    {
      key: 'acc', header: '', render: s => (s.estado === 'abierta' || s.estado === 'en_revision') ? (
        <div className="flex justify-end">
          <Button variante="secundario" tamano="sm" onClick={() => setResolviendo(s)}>
            <Gavel className="w-4 h-4" strokeWidth={1.5} aria-hidden />
            Resolver
          </Button>
        </div>
      ) : null,
    },
  ]

  return (
    <Card
      denso
      header={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-medium text-tinta">Bandeja de dictámenes</h2>
          <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filtrar por estado">
            {([['abierta', 'Abiertas'], ['dictaminada', 'Dictaminadas'], ['rechazada', 'Rechazadas'], ['', 'Todas']] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={estado === v}
                onClick={() => setEstado(v)}
                className={`px-3 py-1.5 text-sm rounded-sello-sm border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${estado === v ? 'bg-petroleo-suave border-petroleo/20 text-petroleo' : 'bg-superficie border-linea text-tinta-suave hover:text-tinta'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {solicitudes === null ? (
        <p className="text-sm text-tinta-suave">Cargando…</p>
      ) : solicitudes.length === 0 ? (
        <EmptyState
          icono={Gavel}
          titulo="Sin solicitudes de dictamen"
          descripcion='Desde el resultado del Clasificador, "Solicitar dictamen humano" crea una solicitud que aparece aquí para que un validador la resuelva.'
        />
      ) : (
        <DataTable columnas={columnas} filas={solicitudes} filaKey={s => s.id} />
      )}
      {resolviendo && (
        <ResolverDictamen
          solicitud={resolviendo}
          onCerrar={() => setResolviendo(null)}
          onListo={async () => { setResolviendo(null); await cargar() }}
          onError={onError}
        />
      )}
    </Card>
  )
}

function ResolverDictamen({ solicitud, onCerrar, onListo, onError }: { solicitud: SolicitudDictamen; onCerrar: () => void; onListo: () => Promise<void>; onError: (m: string) => void }) {
  const [fraccion, setFraccion] = useState(solicitud.clasificacion ? formatFraction(solicitud.clasificacion.fractionCode) : '')
  const [nico, setNico] = useState('')
  const [fundamento, setFundamento] = useState('')
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [errorLocal, setErrorLocal] = useState('')

  async function resolver() {
    setOcupado(true)
    setErrorLocal('')
    try {
      await apiDictamen.resolver(solicitud.id, { fractionCode: fraccion, nico: nico || undefined, fundamento })
      await onListo()
    } catch (e) {
      const m = e instanceof Error ? e.message : 'No pude resolver.'
      setErrorLocal(m)
      onError(m)
    } finally { setOcupado(false) }
  }

  async function rechazar() {
    setOcupado(true)
    setErrorLocal('')
    try {
      await apiDictamen.rechazar(solicitud.id, motivoRechazo)
      await onListo()
    } catch (e) {
      const m = e instanceof Error ? e.message : 'No pude rechazar.'
      setErrorLocal(m)
      onError(m)
    } finally { setOcupado(false) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-tinta/30 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Resolver dictamen">
      <Card className="w-full max-w-lg shadow-sello-float" header={<h3 className="text-base font-medium text-tinta">Dictamen humano</h3>}>
        <p className="text-sm text-tinta leading-relaxed">{solicitud.clasificacion?.inputDescription ?? '—'}</p>
        <p className="text-13 text-tinta-suave mt-1">
          Propuesta de la IA: <span className="font-sello-mono text-tinta">{solicitud.clasificacion ? formatFraction(solicitud.clasificacion.fractionCode) : '—'}</span>
          {solicitud.motivo && <> · Motivo: {solicitud.motivo}</>}
        </p>
        {errorLocal && <p className="text-sm text-carmin mt-2">{errorLocal}</p>}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Input className="col-span-2" label="Fracción dictaminada" mono requerido value={fraccion} onChange={e => setFraccion(e.target.value)} placeholder="7318.15.99" />
          <Input label="NICO" mono value={nico} onChange={e => setNico(e.target.value)} placeholder="01" />
        </div>
        <Textarea className="mt-3" label="Fundamento" requerido rows={4} value={fundamento} onChange={e => setFundamento(e.target.value)} hint="GRI aplicadas, notas de sección/capítulo, criterio. Queda en el expediente como versión aprobada." />
        <div className="flex items-center justify-between gap-2 mt-5 flex-wrap">
          <div className="flex items-center gap-2">
            <Input aria-label="Motivo de rechazo" value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Motivo de rechazo" />
            <Button variante="destructivo" tamano="sm" onClick={rechazar} disabled={ocupado || !motivoRechazo.trim()}>Rechazar</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variante="ghost" tamano="sm" onClick={onCerrar} disabled={ocupado}>Cancelar</Button>
            <Button variante="primario" tamano="sm" onClick={resolver} loading={ocupado} disabled={fraccion.replace(/[^0-9]/g, '').length !== 8 || fundamento.trim().length < 10}>
              <Gavel className="w-4 h-4" strokeWidth={1.5} aria-hidden />
              Emitir dictamen
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
