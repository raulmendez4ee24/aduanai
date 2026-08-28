/**
 * TABLERO DE DEUDA DE COTEJO (Operación 2026-08, prioridad 2) — /admin/cotejo
 *
 * Hace medible y gestionable lo que hoy solo se ve como letreros de "sin dato":
 * cuántas filas de cada bloque están cotejadas, cuántas no, desde cuándo no se
 * mueve la aguja, qué fuente oficial hace falta y con qué plantilla se cierra.
 * Sin datos falsos: si el universo está vacío se dice, no se pinta un 100 %.
 *
 * Diseño Sello (docs/DESIGN_SYSTEM.md): papel + tinta, sin sombras ni glass.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCheck, Download, FileSpreadsheet, RefreshCw, Upload, BellRing } from 'lucide-react'
import { Badge, Button, Card, DataTable, EmptyState } from '../../components/ui'
import {
  archivoABase64, cotejoApi,
  type DefCargador, type FraccionUso, type Metrica, type ReporteCarga, type TableroCotejo,
} from '../../lib/api/cotejo'

export const GUIA_MODULO = {
  titulo: 'Deuda de cotejo',
  pasos: [
    'Cada métrica cuenta filas reales: universo (lo que hay) vs con dato (lo que ya está cotejado contra fuente oficial).',
    'El orden es por impacto: primero lo que toca las fracciones que tu equipo más clasifica.',
    '"Sin movimiento" marca la deuda que lleva más de 90 días parada; "Generar alertas" la convierte en alertas internas para que no envejezca en silencio.',
    'Cada bloque dice qué fuente oficial hace falta (DOF / UPCI / SNICE / TFJA) y qué plantilla la carga. Una fila sin cotejadoPor y fuenteUrl se rechaza.',
  ],
}

const BLOQUES: { clave: Metrica['bloque']; label: string }[] = [
  { clave: 'fracciones', label: 'Fracciones más usadas' },
  { clave: 'cuotas', label: 'Cuotas compensatorias' },
  { clave: 'corpus', label: 'Corpus legal' },
  { clave: 'precedentes', label: 'Precedentes' },
  { clave: 'origen', label: 'Reglas de origen' },
  { clave: 'operacion', label: 'Operación del despacho' },
]

const TONO_ESTADO: Record<Metrica['estado'], 'neutral' | 'petroleo' | 'ambar' | 'carmin'> = {
  cerrada: 'petroleo',
  en_curso: 'ambar',
  sin_empezar: 'carmin',
  sin_estructura: 'carmin',
  sin_universo: 'neutral',
}
const LABEL_ESTADO: Record<Metrica['estado'], string> = {
  cerrada: 'Cerrada',
  en_curso: 'En curso',
  sin_empezar: 'Sin empezar',
  sin_estructura: 'Sin tabla en el esquema',
  sin_universo: 'Sin filas que medir',
}

function Barra({ m }: { m: Metrica }) {
  const pct = m.porcentaje ?? 0
  return (
    <div className="w-full">
      <div className="h-1.5 w-full rounded-sello-sm bg-papel-2 overflow-hidden">
        <div
          className={`h-full ${m.estado === 'cerrada' ? 'bg-petroleo' : m.conDato === 0 ? 'bg-carmin' : 'bg-ambar'}`}
          style={{ width: `${m.porcentaje === null ? 0 : Math.max(pct, 1)}%` }}
        />
      </div>
      <p className="mt-1 text-13 text-tinta-suave font-sello-mono">
        {m.porcentaje === null ? 'sin universo' : `${m.conDato} / ${m.universo} · ${pct}%`}
      </p>
    </div>
  )
}

function FichaMetrica({ m, onPlantilla }: { m: Metrica; onPlantilla: (t: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="border border-linea rounded-sello bg-superficie p-4 font-sello-ui">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-medium text-tinta">{m.titulo}</p>
          <p className="text-13 text-tinta-suave font-sello-mono">{m.clave} · {m.ambito === 'tenant' ? 'datos de tu empresa' : 'catálogo del producto'}</p>
        </div>
        <div className="flex items-center gap-2">
          {m.envejecida && (
            <Badge tono="carmin"><AlertTriangle className="w-3.5 h-3.5" aria-hidden />{m.diasDeDeuda} días sin moverse</Badge>
          )}
          <Badge tono={TONO_ESTADO[m.estado]}>{LABEL_ESTADO[m.estado]}</Badge>
        </div>
      </div>

      <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-3 items-end">
        <Barra m={m} />
        <p className="text-13 text-tinta-suave">
          {m.impacto > 0 ? `Toca ${m.impacto} de tus fracciones más usadas` : 'Sin impacto directo en tu top de fracciones'}
        </p>
      </div>

      {m.nota && <p className="mt-3 text-sm text-ambar">{m.nota}</p>}

      <p className="mt-3 text-sm text-tinta">{m.queFalta}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.cargador && (
          <Button variante="secundario" tamano="sm" onClick={() => onPlantilla(m.cargador!)}>
            <Download className="w-3.5 h-3.5" aria-hidden />Plantilla «{m.cargador}»
          </Button>
        )}
        <Button variante="ghost" tamano="sm" onClick={() => setAbierto(v => !v)}>
          {abierto ? 'Ocultar el detalle' : 'Ver fuente y consulta'}
        </Button>
      </div>

      {abierto && (
        <dl className="mt-3 border-t border-linea pt-3 space-y-2 text-13">
          <div>
            <dt className="text-tinta-suave uppercase tracking-wide">Fuente oficial que hace falta</dt>
            <dd className="text-tinta">{m.fuenteOficial}</dd>
          </div>
          <div>
            <dt className="text-tinta-suave uppercase tracking-wide">Cómo se cuenta</dt>
            <dd className="text-tinta font-sello-mono">{m.consulta}</dd>
          </div>
          <div>
            <dt className="text-tinta-suave uppercase tracking-wide">Fechas</dt>
            <dd className="text-tinta font-sello-mono">
              último cotejo: {m.ultimoMovimiento?.slice(0, 10) ?? 'nunca'} · deuda desde: {m.desde?.slice(0, 10) ?? 'sin referencia'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

function Cargadores({ defs, onPlantilla, onImportar, reporte, cargando }: {
  defs: DefCargador[]
  onPlantilla: (t: string) => void
  onImportar: (t: string, f: File, dryRun: boolean) => void
  reporte: { tipo: string; r: ReporteCarga } | null
  cargando: string | null
}) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [dryRun, setDryRun] = useState(true)

  return (
    <Card
      header={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-tinta font-sello-ui">Cargadores</h2>
            <p className="text-13 text-tinta-suave">El día que llegue el PDF oficial, esto es lo único que hay que hacer.</p>
          </div>
          <label className="flex items-center gap-2 text-13 text-tinta font-sello-ui">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            Validar sin escribir (dry run)
          </label>
        </div>
      }
    >
      <p className="text-sm text-tinta-suave mb-4">
        Regla dura: una fila sin <span className="font-sello-mono">cotejadoPor</span> y{' '}
        <span className="font-sello-mono">fuenteUrl</span> se rechaza con su motivo. No se guarda «pendiente de cotejo».
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        {defs.map(d => (
          <div key={d.tipo} className="border border-linea rounded-sello p-4 font-sello-ui">
            <p className="text-base font-medium text-tinta">{d.titulo}</p>
            <p className="text-13 text-tinta-suave mt-0.5">{d.fuenteOficial}</p>
            <p className="text-13 text-tinta-suave mt-2 font-sello-mono">destino: {d.destino}</p>
            <p className="text-13 text-tinta-suave font-sello-mono">clave: {d.clave}</p>
            {d.schemaRequerido && (
              <p className="text-13 text-ambar mt-2">Destino provisional — falta tabla propia (SCHEMA REQUERIDO).</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variante="secundario" tamano="sm" onClick={() => onPlantilla(d.tipo)}>
                <Download className="w-3.5 h-3.5" aria-hidden />Plantilla
              </Button>
              <Button
                variante="primario" tamano="sm"
                loading={cargando === d.tipo}
                onClick={() => inputs.current[d.tipo]?.click()}
              >
                <Upload className="w-3.5 h-3.5" aria-hidden />{dryRun ? 'Validar archivo' : 'Cargar archivo'}
              </Button>
              <input
                ref={el => { inputs.current[d.tipo] = el }}
                type="file" accept=".xlsx,.xls,.csv,.json" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) onImportar(d.tipo, f, dryRun)
                  e.target.value = ''
                }}
              />
            </div>
            {reporte?.tipo === d.tipo && <ReporteImport r={reporte.r} />}
          </div>
        ))}
      </div>
    </Card>
  )
}

function ReporteImport({ r }: { r: ReporteCarga }) {
  const malas = r.filas.filter(f => !f.ok)
  return (
    <div className="mt-3 border-t border-linea pt-3 text-13 font-sello-ui">
      <p className="text-tinta">
        {r.dryRun ? 'Validación' : 'Importación'}: {r.total} fila(s) · {r.aceptadas} aceptada(s) · {r.rechazadas} rechazada(s)
        {!r.dryRun && ` · ${r.creadas} creada(s) · ${r.actualizadas} actualizada(s)`}
      </p>
      {malas.length > 0 && (
        <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto">
          {malas.slice(0, 40).map(f => (
            <li key={f.fila} className="text-carmin">
              <span className="font-sello-mono">fila {f.fila}</span>: {f.errores.join(' · ')}
            </li>
          ))}
          {malas.length > 40 && <li className="text-tinta-suave">… y {malas.length - 40} más</li>}
        </ul>
      )}
    </div>
  )
}

export function AdminCotejoPage() {
  const [t, setT] = useState<TableroCotejo | null>(null)
  const [defs, setDefs] = useState<DefCargador[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargandoTablero, setCargandoTablero] = useState(true)
  const [cargandoTipo, setCargandoTipo] = useState<string | null>(null)
  const [reporte, setReporte] = useState<{ tipo: string; r: ReporteCarga } | null>(null)
  const [top, setTop] = useState(20)

  const cargar = useCallback((n: number) => {
    setCargandoTablero(true)
    setError('')
    Promise.all([cotejoApi.estado(n), cotejoApi.cargadores()])
      .then(([tablero, cargadores]) => { setT(tablero.data); setDefs(cargadores.data) })
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar el tablero'))
      .finally(() => setCargandoTablero(false))
  }, [])

  useEffect(() => { cargar(top) }, [cargar, top])

  const plantilla = (tipo: string) => {
    setError('')
    cotejoApi.plantilla(tipo).catch(e => setError(e instanceof Error ? e.message : 'No se pudo descargar la plantilla'))
  }

  const importar = async (tipo: string, file: File, dryRun: boolean) => {
    setError(''); setAviso(''); setReporte(null); setCargandoTipo(tipo)
    try {
      const base64 = await archivoABase64(file)
      const res = await cotejoApi.importar(tipo, base64, file.name, dryRun)
      setReporte({ tipo, r: res.data })
      if (res.aviso) setAviso(res.aviso)
      if (!dryRun && (res.data.creadas > 0 || res.data.actualizadas > 0)) cargar(top)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el archivo')
    } finally {
      setCargandoTipo(null)
    }
  }

  const generarAlertas = () => {
    setError(''); setAviso('')
    cotejoApi.sincronizarAlertas()
      .then(r => setAviso(`Alertas de deuda: ${r.data.creadas} nueva(s), ${r.data.actualizadas} actualizada(s), ${r.data.resueltas} resuelta(s) (umbral ${r.data.umbralDias} días).`))
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudieron generar las alertas'))
  }

  if (cargandoTablero && !t) {
    return <p className="text-sm text-tinta-suave font-sello-ui py-10 text-center">Contando la deuda…</p>
  }
  if (error && !t) {
    return (
      <EmptyState
        icono={AlertTriangle}
        titulo="No se pudo cargar el tablero"
        descripcion={error}
        accion={{ label: 'Reintentar', onClick: () => cargar(top) }}
      />
    )
  }
  if (!t) return null

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-sello-ui">
      <Card
        header={
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-22 font-sello-display text-tinta flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-petroleo" aria-hidden />Deuda de cotejo
              </h1>
              <p className="text-13 text-tinta-suave mt-1">
                Lo que el producto declara «pendiente de fuente oficial», contado con consultas reales y con fecha.
                Generado {t.generadoAt.replace('T', ' ').slice(0, 16)} UTC.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variante="ghost" tamano="sm" onClick={() => cargar(top)} loading={cargandoTablero}>
                <RefreshCw className="w-3.5 h-3.5" aria-hidden />Recalcular
              </Button>
              <Button variante="secundario" tamano="sm" onClick={generarAlertas}>
                <BellRing className="w-3.5 h-3.5" aria-hidden />Generar alertas
              </Button>
              <Button variante="secundario" tamano="sm" onClick={() => cotejoApi.exportXlsx(top).catch(e => setError(e instanceof Error ? e.message : 'Error'))}>
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden />Excel
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { n: t.resumen.filasPendientes, l: 'filas sin cotejar' },
            { n: t.resumen.conDeuda, l: `métricas con deuda (de ${t.resumen.metricas})` },
            { n: t.resumen.envejecidas, l: `paradas +${t.umbralDias} días` },
            { n: t.resumen.cerradas, l: 'métricas cerradas' },
            { n: t.resumen.porcentajeGlobal === null ? '—' : `${t.resumen.porcentajeGlobal}%`, l: 'cotejado global (por filas)' },
          ].map(k => (
            <div key={k.l} className="border border-linea rounded-sello p-3">
              <p className="text-22 font-sello-mono text-tinta">{k.n}</p>
              <p className="text-13 text-tinta-suave mt-0.5">{k.l}</p>
            </div>
          ))}
        </div>
        {(aviso || error) && (
          <p className={`mt-3 text-sm ${error ? 'text-carmin' : 'text-petroleo'}`}>{error || aviso}</p>
        )}
      </Card>

      {BLOQUES.map(b => {
        const ms = t.metricas.filter(m => m.bloque === b.clave)
        if (ms.length === 0) return null
        return (
          <Card key={b.clave} header={<h2 className="text-lg font-medium text-tinta">{b.label}</h2>} denso>
            <div className="space-y-3">
              {ms.map(m => <FichaMetrica key={m.clave} m={m} onPlantilla={plantilla} />)}
            </div>
          </Card>
        )
      })}

      <Card
        header={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-tinta">Fracciones más usadas de tu historial</h2>
              <p className="text-13 text-tinta-suave">Sale de tus clasificaciones reales (sin demo), no de una lista fija. Lo de arriba es lo que primero hay que cerrar.</p>
            </div>
            <label className="text-13 text-tinta-suave flex items-center gap-2">
              Analizar top
              <select
                value={top}
                onChange={e => setTop(Number(e.target.value))}
                className="border border-linea rounded-sello-sm px-2 py-1 bg-superficie text-tinta"
              >
                {[10, 20, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        }
        denso
      >
        <DataTable<FraccionUso>
          columnas={[
            { key: 'fraccion', header: 'Fracción', mono: true, render: f => f.codeFormatted },
            { key: 'desc', header: 'Descripción', render: f => <span className="line-clamp-2">{f.descripcion ?? <em className="text-tinta-suave">no está en el catálogo</em>}</span> },
            { key: 'usos', header: 'Usos', align: 'right', mono: true, render: f => f.usos },
            {
              key: 'falta', header: 'Qué le falta',
              render: f => f.faltantes.length === 0
                ? <Badge tono="petroleo">Completa</Badge>
                : <span className="text-13 text-tinta-suave">{f.faltantes.join(' · ')}</span>,
            },
          ]}
          filas={t.topFracciones}
          filaKey={f => f.fractionCode}
          vacio={
            <span className="text-sm text-tinta-suave">
              Tu historial no tiene clasificaciones reales todavía: sin uso real no hay forma honesta de priorizar qué cotejar primero.
            </span>
          }
        />
      </Card>

      <Cargadores defs={defs} onPlantilla={plantilla} onImportar={importar} reporte={reporte} cargando={cargandoTipo} />
    </div>
  )
}
