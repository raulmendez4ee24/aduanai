/**
 * SELLO · Inicio v2 (docs/DESIGN_SYSTEM.md) — la pantalla responde en 5s:
 * "¿hay algo hoy que me pueda meter en problemas?"
 *
 * Datos REALES: stats (clasificaciones), alerts (activas), operationsList
 * (operaciones del mes + tabla), legalLibraryList (% corpus verificado,
 * computado de officialUrl/publishedDate por doc).
 * Regulatorio hoy (Operación 2026-08): alertas REALES tipo tariff_change /
 * tarifa_decreto_nuevo del watchdog DOF + estado del vigilante (última
 * revisión, fuentes). El mock anterior quedó atrás de MOCK_WATCHDOG=false.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSearch, FolderOpen, Radar, ArrowRight } from 'lucide-react'
import { api, type Alert, type OperationRecord, type LegalDocSummary } from '../lib/api'
import { regulatorioApi, rutaDeAccion, type EstadoWatchdog } from '../lib/api/regulatorio'
import {
  Button, Card, Badge, DataTable, EmptyState, SelloVerificacion, formatFechaSello,
  type Columna,
} from '../components/ui'

// ════════════════════════════════════════════════════════════════════════
// Watchdog regulatorio — backend real en server/src/services/dof-watchdog.ts
// (Operación 2026-08). El mock se conserva solo como fixture de diseño,
// apagado: la UI muestra alertas reales del tenant/cliente.
// ════════════════════════════════════════════════════════════════════════
const MOCK_WATCHDOG = false

export interface AlertaRegulatoria {
  id: string
  titulo: string
  fuenteNombre: string       // "DOF"
  fuenteUrl: string
  fechaPublicacion: string   // ISO
  fechaVerificacion?: string // ISO — cuándo la cotejamos nosotros
  metodo?: 'manual' | 'scraper'
  /** Fracciones del tenant afectadas por el cambio (0 = informativo). */
  fraccionesAfectadas: number
}

// Eventos DOF REALES (cotejados en fases previas del producto) usados como
// datos de ejemplo mientras no exista el watchdog. Señalizados en la UI.
const ALERTAS_MOCK: AlertaRegulatoria[] = [
  {
    id: 'mock-1',
    titulo: 'Decreto que modifica aranceles de la TIGIE en sectores estratégicos (acero, textil, calzado)',
    fuenteNombre: 'DOF',
    fuenteUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5777376&fecha=29/12/2025',
    fechaPublicacion: '2025-12-29',
    fechaVerificacion: '2026-07-04',
    metodo: 'manual',
    fraccionesAfectadas: 3,
  },
  {
    id: 'mock-2',
    titulo: 'Reforma al Reglamento de la Ley Aduanera: expedientes con control interno documentado (81-A)',
    fuenteNombre: 'DOF',
    fuenteUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5780677&fecha=23/02/2026',
    fechaPublicacion: '2026-02-23',
    fechaVerificacion: '2026-07-04',
    metodo: 'manual',
    fraccionesAfectadas: 0,
  },
  {
    id: 'mock-3',
    titulo: 'Anexo 10 RGCE 2026: padrones de sectores específicos re-publicados',
    fuenteNombre: 'DOF',
    fuenteUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5778300&fecha=15/01/2026',
    fechaPublicacion: '2026-01-14',
    fechaVerificacion: '2026-07-03',
    metodo: 'manual',
    fraccionesAfectadas: 1,
  },
  {
    id: 'mock-4',
    titulo: 'SAT actualiza el listado definitivo del Art. 69-B CFF (operaciones inexistentes)',
    fuenteNombre: 'SAT',
    fuenteUrl: 'http://omawww.sat.gob.mx/cifras_sat/Paginas/datos/vinculo.html?page=ListCompleta69B.html',
    fechaPublicacion: '2025-12-31',
    fechaVerificacion: '2026-07-04',
    metodo: 'scraper',
    fraccionesAfectadas: 0,
  },
]

// ── Estado de la operación (Badge por status) ─────────────────────────────
const ESTADO_OPERACION: Record<string, { label: string; tono: 'neutral' | 'petroleo' | 'ambar' | 'carmin' }> = {
  draft: { label: 'Borrador', tono: 'neutral' },
  in_progress: { label: 'En proceso', tono: 'petroleo' },
  complete: { label: 'Completo', tono: 'petroleo' },
  completed: { label: 'Completo', tono: 'petroleo' },
  pending: { label: 'Pendiente', tono: 'ambar' },
  blocked: { label: 'Bloqueado', tono: 'carmin' },
}

function saludoPorHora(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ── Skeleton (papel-2 pulsando; misma altura que el contenido: sin layout shift)
function SkeletonBloque({ className = '' }: { className?: string }) {
  return <div className={`bg-papel-2 rounded-sello-sm animate-pulse ${className}`} aria-hidden />
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [clasificaciones, setClasificaciones] = useState<number | null>(null)
  const [alertasActivas, setAlertasActivas] = useState<number | null>(null)
  const [operaciones, setOperaciones] = useState<OperationRecord[]>([])
  const [corpus, setCorpus] = useState<LegalDocSummary[]>([])
  const [regulatorias, setRegulatorias] = useState<Alert[]>([])
  const [watchdog, setWatchdog] = useState<EstadoWatchdog | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.allSettled([
      api.stats(),
      api.alerts(),
      api.operationsList(),
      api.legalLibraryList(),
      regulatorioApi.watchdogEstado(),
    ]).then(([st, al, op, co, wd]) => {
      if (!vivo) return
      if (st.status === 'fulfilled') setClasificaciones(st.value.data.counts.classifications)
      if (al.status === 'fulfilled') {
        const todas = al.value.data as Alert[]
        setAlertasActivas(todas.filter(a => !a.read).length)
        setRegulatorias(todas.filter(a => a.type === 'tariff_change' || a.type === 'tarifa_decreto_nuevo' || a.type === 'new_regulation' || a.type === 'antidumping_new').slice(0, 5))
      }
      if (op.status === 'fulfilled') setOperaciones(op.value.data as OperationRecord[])
      if (co.status === 'fulfilled') setCorpus(co.value.data as LegalDocSummary[])
      if (wd.status === 'fulfilled') setWatchdog(wd.value.data)
      setCargando(false)
    })
    return () => { vivo = false }
  }, [])

  const hoy = new Date()
  const fechaLarga = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const opsDelMes = useMemo(() => {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
    return operaciones.filter(o => new Date(o.operationDate ?? o.createdAt).getTime() >= inicioMes).length
  }, [operaciones])

  // % del corpus verificado contra fuente oficial — REAL, computado por doc:
  // un doc cuenta como verificado si trae officialUrl Y publishedDate.
  const corpusPct = useMemo(() => {
    if (corpus.length === 0) return null
    const verificados = corpus.filter(d => d.officialUrl && d.publishedDate).length
    return Math.round((verificados / corpus.length) * 100)
  }, [corpus])

  const opsRecientes = useMemo(
    () => [...operaciones]
      .sort((a, b) => new Date(b.operationDate ?? b.createdAt).getTime() - new Date(a.operationDate ?? a.createdAt).getTime())
      .slice(0, 8),
    [operaciones],
  )

  const columnas: Columna<OperationRecord>[] = [
    { key: 'fecha', header: 'Fecha', mono: true, render: o => formatFechaSello(o.operationDate ?? o.createdAt) ?? '—' },
    { key: 'producto', header: 'Producto / referencia', render: o => (
      <span className="text-tinta">{o.description || o.reference}</span>
    ) },
    { key: 'fraccion', header: 'Fracción', mono: true, render: o => o.fractionCode ?? '—' },
    { key: 'estado', header: 'Estado', render: o => {
      const e = ESTADO_OPERACION[o.status] ?? { label: o.status, tono: 'neutral' as const }
      return <Badge tono={e.tono}>{e.label}</Badge>
    } },
    { key: 'riesgo', header: 'Riesgo pre-glosa', render: () => (
      // La operación aún no guarda vínculo con reportes pre-glosa (sin dato ≠ sin riesgo)
      <span className="text-tinta-suave" title="Sin reporte pre-glosa vinculado a esta operación">—</span>
    ) },
    { key: 'accion', header: '', align: 'right', render: o => (
      <button
        type="button"
        onClick={() => navigate(`/expediente?ref=${encodeURIComponent(o.reference)}`)}
        className="inline-flex items-center gap-1 text-sm text-petroleo hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm"
      >
        Abrir expediente <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
      </button>
    ) },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 1 · Saludo + fecha (discretos) + 5 · acciones rápidas */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-tinta-suave">{saludoPorHora()}</p>
          <p className="text-13 text-tinta-suave font-sello-mono">{fechaLarga}</p>
        </div>
        <div className="flex gap-2">
          <Button variante="primario" onClick={() => navigate('/clasificador')}>Clasificar producto</Button>
          <Button variante="secundario" onClick={() => navigate('/simulador-glosa')}>Nuevo reporte pre-glosa</Button>
        </div>
      </div>

      {/* 2 · Fila de 4 métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Operaciones del mes', valor: cargando ? null : String(opsDelMes), alerta: false, sello: false },
          { label: 'Alertas regulatorias activas', valor: cargando ? null : String(alertasActivas ?? '—'), alerta: (alertasActivas ?? 0) > 0, sello: false },
          { label: 'Clasificaciones realizadas', valor: cargando ? null : String(clasificaciones ?? '—'), alerta: false, sello: false },
          { label: 'Corpus verificado vs fuente oficial', valor: cargando ? null : (corpusPct === null ? '—' : `${corpusPct}%`), alerta: false, sello: true },
        ].map(m => (
          <Card key={m.label} denso>
            <div className="h-24 flex flex-col justify-between">
              {m.valor === null ? (
                <>
                  <SkeletonBloque className="h-10 w-20" />
                  <SkeletonBloque className="h-4 w-full" />
                </>
              ) : (
                <>
                  <p className={`font-sello-display text-4xl ${m.alerta ? 'text-ambar' : 'text-tinta'}`}>{m.valor}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-13 text-tinta-suave leading-snug">{m.label}</p>
                    {m.sello && corpusPct !== null && (
                      <SelloVerificacion
                        estado={corpusPct === 100 ? 'verificado' : 'sin_verificar'}
                        fuenteNombre="DOF / Diputados"
                        metodo="manual"
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* 3 · Regulatorio hoy */}
      <Card
        header={
          <div className="flex items-center gap-2 flex-wrap">
            <Radar className="w-[18px] h-[18px] text-petroleo" strokeWidth={1.5} aria-hidden />
            <h2 className="font-sello-display text-lg text-tinta">Regulatorio hoy</h2>
            {MOCK_WATCHDOG && <Badge tono="ambar">Datos de ejemplo</Badge>}
            {!MOCK_WATCHDOG && (
              <Badge tono={watchdog?.ultimaRevision ? 'petroleo' : 'neutral'}>
                {watchdog?.ultimaRevision
                  ? `Última revisión ${new Date(watchdog.ultimaRevision).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} · ${watchdog.fuentes.map(f => f.nombre.split(' — ')[0]).join(' + ')}`
                  : 'Watchdog sin revisión registrada aún'}
              </Badge>
            )}
            <button
              type="button"
              onClick={() => navigate('/alertas')}
              className="ml-auto text-sm text-petroleo hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm"
            >
              Ver todo lo regulatorio
            </button>
          </div>
        }
      >
        {cargando ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <SkeletonBloque key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          MOCK_WATCHDOG ? (
          <ul className="divide-y divide-linea -my-2">
            {ALERTAS_MOCK.map(a => (
              <li key={a.id} className="py-3 flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-base text-tinta leading-snug">{a.titulo}</p>
                  <div className="mt-1.5">
                    <SelloVerificacion estado="verificado" fuenteNombre={a.fuenteNombre} fuenteUrl={a.fuenteUrl} fechaPublicacion={a.fechaPublicacion} fechaVerificacion={a.fechaVerificacion} metodo={a.metodo} />
                  </div>
                </div>
                <Badge tono={a.fraccionesAfectadas > 0 ? 'ambar' : 'neutral'}>{a.fraccionesAfectadas > 0 ? `Afecta ${a.fraccionesAfectadas} de tus fracciones` : 'Sin impacto en tus fracciones'}</Badge>
              </li>
            ))}
          </ul>
          ) : regulatorias.length === 0 ? (
            <p className="text-sm text-tinta-suave">
              Sin decretos que toquen tus fracciones{watchdog?.ultimaRevision ? ` en los últimos ${watchdog.ventanaDias} días (${watchdog.decretosRevisados} decreto(s) revisados)` : ''}.
              {watchdog?.fuentes.some(f => f.estado === 'ciega') ? ' Una fuente no respondió en la última revisión.' : ''}
            </p>
          ) : (
          <ul className="divide-y divide-linea -my-2">
            {regulatorias.map(a => {
              const url = /https?:\/\/\S+/.exec(a.content)?.[0]?.replace(/[.,;)]+$/, '') ?? null
              const ruta = rutaDeAccion(a.suggestedAction as Parameters<typeof rutaDeAccion>[0])
              return (
                <li key={a.id} className="py-3 flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-base text-tinta leading-snug">{a.title}</p>
                    <div className="mt-1.5">
                      <SelloVerificacion estado="verificado" fuenteNombre={a.type === 'tariff_change' || a.type === 'tarifa_decreto_nuevo' ? 'DOF / Diputados' : 'Sistema'} fuenteUrl={url ?? undefined} fechaPublicacion={a.createdAt} metodo="scraper" />
                    </div>
                  </div>
                  <Badge tono={a.fractionCodes.length > 0 ? 'ambar' : 'neutral'}>{a.fractionCodes.length > 0 ? `Afecta ${a.fractionCodes.length} de tus fracciones` : 'Informativo'}</Badge>
                  {ruta && <Button variante="secundario" tamano="sm" onClick={() => navigate(ruta)}>{a.suggestedAction?.label ?? 'Abrir'} <ArrowRight className="w-3 h-3" /></Button>}
                </li>
              )
            })}
          </ul>
          )
        )}
      </Card>

      {/* 4 · Operaciones recientes */}
      <section className="space-y-3">
        <h2 className="font-sello-display text-lg text-tinta">Operaciones recientes</h2>
        {cargando ? (
          <SkeletonBloque className="h-64 w-full" />
        ) : (
          <DataTable
            columnas={columnas}
            filas={opsRecientes}
            filaKey={o => o.id}
            vacio={
              <EmptyState
                icono={FolderOpen}
                titulo="Aún no registras operaciones"
                descripcion="Crea tu primer expediente y te muestro cómo se ve una operación con su documentación al día."
                accion={{ label: 'Crear expediente', onClick: () => navigate('/expediente') }}
              />
            }
          />
        )}
      </section>

      {/* 6 · Dirección para cuentas nuevas (solo si tampoco hay clasificaciones) */}
      {!cargando && clasificaciones === 0 && (
        <Card>
          <EmptyState
            icono={FileSearch}
            titulo="Aún no clasificas ningún producto"
            descripcion="Clasifica el primero y te muestro cómo se ve un expediente con citas legales verificadas contra el DOF."
            accion={{ label: 'Clasificar mi primer producto', onClick: () => navigate('/clasificador') }}
          />
        </Card>
      )}
    </div>
  )
}
