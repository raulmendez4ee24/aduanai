/**
 * /historial — Historial de clasificaciones → catálogo (Ola 1, Operación 2026-08).
 * Agrupado por producto (misma descripción normalizada) con conteo; el
 * feedback ✓/✗ es un paso visible y OBLIGATORIO antes de "Promover a catálogo";
 * filtros por fracción/capítulo/fecha/confianza/feedback (el cliente activo
 * viene del selector global); export Excel; acierto del modelo por capítulo
 * calculado del feedback real. Sistema Sello.
 */
import { useCallback, useEffect, useState } from 'react'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { Link } from 'react-router-dom'
import { Clock, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ShieldCheck, Boxes, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { DemoTag } from '../components/DemoBanner'
import { Badge, Button, Card, EmptyState, Input, Select } from '../components/ui'
import { usePermissions } from '../hooks/usePermissions'
import { CONFIDENCE_LABEL, CONFIDENCE_TOOLTIP } from '../lib/confidence'
import {
  historialApi, catalogoApi, descargarArchivo, formatearFraccion, fechaCorta,
  type FiltrosHistorial, type GrupoHistorial, type ClasificacionHistorial, type AciertoCapitulo,
} from '../lib/api/catalogo'

export const GUIA_MODULO = {
  titulo: 'Historial de clasificaciones',
  pasos: [
    'Las clasificaciones se agrupan por producto (misma descripción); el conteo muestra cuántas veces se consultó y si el modelo fue consistente.',
    'Marca ✓ o ✗ en cada clasificación: es el paso obligatorio antes de promover al catálogo y es lo único que alimenta el "acierto por capítulo".',
    'Promover a catálogo crea (o actualiza) la parte con esa fracción como versión "historial"; queda vigente si tienes permiso de aprobar, si no, propuesta.',
    'Filtra por cliente (selector global), fracción, capítulo, fecha, confianza o feedback y exporta el resultado a Excel.',
  ],
}

function mensajeDe(e: unknown): string { return e instanceof Error ? e.message : 'Ocurrió un error. Intenta de nuevo.' }

function tonoConfianza(c: number): 'petroleo' | 'ambar' | 'carmin' | 'neutral' {
  const pct = Math.round(c)
  if (pct >= 75) return 'petroleo'
  if (pct >= 50) return 'ambar'
  return 'carmin'
}

const LIMIT = 20

export function HistoryPage() {
  const { can } = usePermissions()
  const puedeAprobar = can('classifier', 'approve')
  const puedeExportar = can('classifier', 'exportData')
  const puedePromover = can('catalogo', 'create')

  // Filtros en UN objeto (Ola 3 → useEstadoPersistente('/historial', inicial)).
  const [form, setForm] = useEstadoPersistente<FiltrosHistorial>('historial-filtros', { search: '', fractionCode: '', capitulo: '', desde: '', hasta: '', confianzaMin: '', confianzaMax: '', feedback: '', page: 1 })
  const [grupos, setGrupos] = useState<GrupoHistorial[]>([])
  const [total, setTotal] = useState(0)
  const [truncado, setTruncado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [acierto, setAcierto] = useState<{ capitulos: AciertoCapitulo[]; totales: AciertoCapitulo; nota: string } | null>(null)
  const [mostrarAcierto, setMostrarAcierto] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const r = await historialApi.agrupado({ ...form, limit: LIMIT })
      setGrupos(r.data)
      setTotal(r.pagination.total)
      setTruncado(r.pagination.truncado)
    } catch (e) { setError(mensajeDe(e)); setGrupos([]); setTotal(0) }
    finally { setCargando(false) }
  }, [form])

  const cargarAcierto = useCallback(async () => {
    try { setAcierto(await historialApi.aciertoPorCapitulo(form)) } catch { setAcierto(null) }
  }, [form])

  useEffect(() => {
    const t = setTimeout(() => { void cargar(); void cargarAcierto() }, form.search ? 250 : 0)
    return () => clearTimeout(t)
  }, [cargar, cargarAcierto, form.search])

  useEffect(() => {
    const onCliente = () => setForm(f => ({ ...f, page: 1 }))
    window.addEventListener('aduanai:cliente', onCliente)
    return () => window.removeEventListener('aduanai:cliente', onCliente)
  }, [])

  async function exportar() {
    try { await descargarArchivo(historialApi.exportUrl(form), `historial-clasificaciones-${new Date().toISOString().slice(0, 10)}.xlsx`) }
    catch (e) { setError(mensajeDe(e)) }
  }

  const set = (k: keyof FiltrosHistorial, v: string) => setForm(f => ({ ...f, [k]: v, page: 1 }))
  const paginas = Math.max(1, Math.ceil(total / LIMIT))
  const hayFiltros = !!(form.search || form.fractionCode || form.capitulo || form.desde || form.hasta || form.confianzaMin !== '' || form.confianzaMax !== '' || form.feedback)

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-sello-ui">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-petroleo" strokeWidth={1.5} aria-hidden />
          <h1 className="text-xl font-semibold text-tinta">Historial</h1> <DemoTag />
          {!cargando && <span className="text-sm text-tinta-suave">{total} producto{total === 1 ? '' : 's'}{truncado ? ' (últimas 5,000 clasificaciones)' : ''}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variante="secundario" tamano="sm" onClick={() => setMostrarAcierto(v => !v)} aria-expanded={mostrarAcierto}>Acierto por capítulo</Button>
          {puedeExportar && (
            <Button variante="secundario" tamano="sm" onClick={exportar} disabled={total === 0}>
              <Download className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Exportar Excel
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

      {mostrarAcierto && <AciertoPorCapitulo datos={acierto} />}

      <Card denso>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <div className="col-span-2"><Input aria-label="Buscar" placeholder="Producto o fracción" value={form.search ?? ''} onChange={e => set('search', e.target.value)} /></div>
          <Input aria-label="Fracción" placeholder="Fracción" mono value={form.fractionCode ?? ''} onChange={e => set('fractionCode', e.target.value)} />
          <Input aria-label="Capítulo" placeholder="Cap." mono maxLength={2} value={form.capitulo ?? ''} onChange={e => set('capitulo', e.target.value.replace(/\D/g, ''))} />
          <Input aria-label="Desde" type="date" mono value={form.desde ?? ''} onChange={e => set('desde', e.target.value)} />
          <Input aria-label="Hasta" type="date" mono value={form.hasta ?? ''} onChange={e => set('hasta', e.target.value)} />
          <Input aria-label="Confianza mínima" placeholder="Conf. ≥" mono inputMode="numeric" value={String(form.confianzaMin ?? '')} onChange={e => set('confianzaMin', e.target.value.replace(/\D/g, ''))} />
          <Select aria-label="Feedback" value={form.feedback ?? ''} onChange={e => set('feedback', e.target.value)}>
            <option value="">Feedback: todos</option>
            <option value="sin">Sin feedback</option>
            <option value="correct">✓ Correcto</option>
            <option value="incorrect">✗ Incorrecto</option>
            <option value="partial">~ Parcial</option>
          </Select>
        </div>
      </Card>

      {cargando ? (
        <div className="space-y-2" aria-busy="true">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-papel-2 border border-linea rounded-sello" />)}</div>
      ) : grupos.length === 0 ? (
        <Card>
          <EmptyState
            icono={Clock}
            titulo={hayFiltros ? 'Ningún producto coincide con los filtros' : 'Todavía no hay clasificaciones'}
            descripcion={hayFiltros ? 'Ajusta o limpia los filtros.' : 'Cuando clasifiques productos aparecerán aquí agrupados por producto, listos para confirmar y promover al catálogo.'}
          />
        </Card>
      ) : (
        <div className="border border-linea rounded-sello bg-superficie divide-y divide-linea">
          <div className="hidden md:grid grid-cols-[1fr_130px_70px_90px_110px_110px_32px] gap-3 px-4 py-2 text-13 uppercase tracking-wide font-medium text-tinta-suave">
            <span>Producto</span>
            <span>Fracción</span>
            <span className="text-right">Veces</span>
            <span title={CONFIDENCE_TOOLTIP} className="cursor-help">{CONFIDENCE_LABEL}</span>
            <span>Feedback</span>
            <span>Última</span>
            <span />
          </div>
          {grupos.map(g => (
            <GrupoFila
              key={g.clave}
              grupo={g}
              abierto={abierto === g.clave}
              onToggle={() => setAbierto(abierto === g.clave ? null : g.clave)}
              puedeAprobar={puedeAprobar}
              puedePromover={puedePromover}
              onCambio={(msg) => { if (msg) setAviso(msg); void cargar(); void cargarAcierto() }}
              onError={setError}
            />
          ))}
        </div>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variante="ghost" tamano="sm" onClick={() => setForm(f => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))} disabled={(form.page ?? 1) <= 1} aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm text-tinta-suave font-sello-mono">Página {form.page} de {paginas}</span>
          <Button variante="ghost" tamano="sm" onClick={() => setForm(f => ({ ...f, page: Math.min(paginas, (f.page ?? 1) + 1) }))} disabled={(form.page ?? 1) >= paginas} aria-label="Página siguiente"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Fila de grupo (producto) con sus clasificaciones
// ──────────────────────────────────────────────────────────────────

function GrupoFila({ grupo: g, abierto, onToggle, puedeAprobar, puedePromover, onCambio, onError }: {
  grupo: GrupoHistorial; abierto: boolean; onToggle: () => void; puedeAprobar: boolean; puedePromover: boolean
  onCambio: (msg?: string) => void; onError: (msg: string) => void
}) {
  const [items, setItems] = useState<ClasificacionHistorial[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [promoviendo, setPromoviendo] = useState(false)
  const [codigo, setCodigo] = useState(g.enCatalogo?.productCode ?? '')

  useEffect(() => {
    if (!abierto) return
    let vivo = true
    setCargando(true)
    historialApi.listar({ ids: g.ids.slice(0, 100), limit: 100 })
      .then(r => { if (vivo) setItems(r.data) })
      .catch(e => onError(mensajeDe(e)))
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [abierto, g.ids, onError])

  async function feedback(id: string, fb: 'correct' | 'incorrect') {
    try {
      await historialApi.feedback(id, fb)
      setItems(list => list ? list.map(c => c.id === id ? { ...c, feedback: fb } : c) : list)
      onCambio()
    } catch (e) { onError(mensajeDe(e)) }
  }
  async function aprobar(id: string) {
    try { await historialApi.aprobar(id); setItems(list => list ? list.map(c => c.id === id ? { ...c, status: 'approved' } : c) : list); onCambio() }
    catch (e) { onError(mensajeDe(e)) }
  }
  async function promover() {
    if (!g.promovibleId) return
    setPromoviendo(true)
    try {
      const r = await catalogoApi.promover({ classificationId: g.promovibleId, productCode: codigo.trim() || undefined })
      const v = r.data.version
      onCambio(
        r.data.sinCambio
          ? `${r.data.parte.productCode} ya tiene ${formatearFraccion(v.fractionCode)} en el catálogo (v${v.version}).`
          : `${r.data.creada ? 'Parte creada' : 'Parte actualizada'}: ${r.data.parte.productCode} → ${formatearFraccion(v.fractionCode)} (v${v.version}, ${v.estado}).`,
      )
    } catch (e) { onError(mensajeDe(e)) } finally { setPromoviendo(false) }
  }

  const fb = g.feedback
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={abierto}
        className="w-full grid grid-cols-1 md:grid-cols-[1fr_130px_70px_90px_110px_110px_32px] gap-1 md:gap-3 px-4 py-3 text-left items-center hover:bg-papel-2/60 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo">
        <span className="text-sm text-tinta line-clamp-2">
          {g.descripcion}
          {g.enCatalogo && <Badge tono="petroleo" className="ml-2 align-middle"><Boxes className="w-3 h-3" aria-hidden /> {g.enCatalogo.productCode}</Badge>}
        </span>
        <span className="font-sello-mono text-sm text-tinta">
          {formatearFraccion(g.fraccionDominante)}
          {!g.consistente && <span title="El modelo dio fracciones distintas para este producto"><Badge tono="ambar" className="ml-1">{g.fracciones.length} distintas</Badge></span>}
        </span>
        <span className="font-sello-mono text-sm text-tinta md:text-right">{g.conteo}</span>
        <span><Badge tono={tonoConfianza(g.confianzaPromedio)}>{g.confianzaPromedio}%</Badge></span>
        <span className="text-13 text-tinta-suave font-sello-mono">
          {fb.correct > 0 && <span className="text-sello">✓{fb.correct} </span>}
          {fb.incorrect > 0 && <span className="text-carmin">✗{fb.incorrect} </span>}
          {fb.partial > 0 && <span className="text-ambar">~{fb.partial} </span>}
          {fb.sin > 0 && <span>—{fb.sin}</span>}
        </span>
        <span className="font-sello-mono text-13 text-tinta-suave">{fechaCorta(g.ultimaFecha)}</span>
        <span className="justify-self-end text-tinta-suave">{abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 bg-papel-2/40">
          {/* Paso 1: feedback. Paso 2: promover (solo con ✓). */}
          <div className="flex flex-wrap items-center gap-3 border border-linea rounded-sello bg-superficie px-4 py-3">
            <div className="flex-1 text-sm">
              <p className="text-tinta font-medium">Promover a catálogo</p>
              <p className="text-tinta-suave">
                {g.promovibleId
                  ? `Se usará la clasificación marcada ✓ (${formatearFraccion(g.fraccionDominante)}). ${g.enCatalogo ? `La parte ${g.enCatalogo.productCode} ya existe: se añade como versión.` : 'Si no das número de parte se genera uno provisional.'}`
                  : 'Paso obligatorio: marca ✓ en una de las clasificaciones de abajo antes de promover.'}
              </p>
            </div>
            {puedePromover && (
              <>
                <Input aria-label="Número de parte" placeholder="Número de parte" mono value={codigo} onChange={e => setCodigo(e.target.value)} disabled={!!g.enCatalogo} />
                <Button variante="primario" tamano="sm" loading={promoviendo} disabled={!g.promovibleId} onClick={promover}>
                  <Boxes className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Promover
                </Button>
              </>
            )}
            {g.enCatalogo && <Link to={`/catalogo?parte=${g.enCatalogo.productId}`} className="text-sm text-petroleo underline-offset-2 hover:underline">Ver en catálogo</Link>}
          </div>

          {cargando && <p className="text-sm text-tinta-suave">Cargando clasificaciones…</p>}
          {items && items.length === 0 && <p className="text-sm text-tinta-suave">No se pudieron cargar las clasificaciones de este producto.</p>}
          {items && items.map(c => (
            <div key={c.id} className="border border-linea rounded-sello bg-superficie px-4 py-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sello-mono font-medium text-tinta">{formatearFraccion(c.fractionCode)}</span>
                {c.fractionDescription && <span className="text-tinta-suave line-clamp-1 flex-1">{c.fractionDescription}</span>}
                <span title={CONFIDENCE_TOOLTIP}><Badge tono={tonoConfianza(c.confidence)}>{Math.round(c.confidence)}%</Badge></span>
                <span className="font-sello-mono text-13 text-tinta-suave">{fechaCorta(c.createdAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-tinta-suave">¿Resultado correcto?</span>
                {c.feedback === 'correct' && <Badge tono="petroleo">✓ Correcto</Badge>}
                {c.feedback === 'incorrect' && <Badge tono="carmin">✗ Incorrecto</Badge>}
                {c.feedback === 'partial' && <Badge tono="ambar">~ Parcial</Badge>}
                {!c.feedback && (
                  <>
                    <Button variante="secundario" tamano="sm" onClick={() => feedback(c.id, 'correct')}>✓ Sí</Button>
                    <Button variante="secundario" tamano="sm" onClick={() => feedback(c.id, 'incorrect')}>✗ No</Button>
                  </>
                )}
                {c.feedbackNote && <span className="text-13 text-ambar">Nota: {c.feedbackNote}</span>}
                <span className="flex-1" />
                {c.status === 'pending_approval' && (
                  <span className="inline-flex items-center gap-2 text-13 text-ambar">
                    <ShieldCheck className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Pendiente de aprobación SOD
                    {puedeAprobar && <Button variante="primario" tamano="sm" onClick={() => aprobar(c.id)}>Aprobar</Button>}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Acierto del modelo por capítulo (del feedback real)
// ──────────────────────────────────────────────────────────────────

function AciertoPorCapitulo({ datos }: { datos: { capitulos: AciertoCapitulo[]; totales: AciertoCapitulo; nota: string } | null }) {
  if (!datos) return <Card denso><p className="text-sm text-tinta-suave">No se pudo calcular el acierto.</p></Card>
  const conDatos = datos.capitulos.filter(c => c.conFeedback > 0)
  return (
    <Card denso header={
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-medium text-tinta">Acierto del modelo por capítulo</h2>
        <span className="text-sm text-tinta-suave">
          {datos.totales.conFeedback > 0
            ? <>Total: <span className="font-sello-mono text-tinta">{datos.totales.acierto}%</span> sobre {datos.totales.conFeedback} con feedback de {datos.totales.total}</>
            : 'Sin feedback todavía'}
        </span>
      </div>
    }>
      <p className="text-13 text-tinta-suave mb-3">{datos.nota}</p>
      {conDatos.length === 0 ? (
        <p className="text-sm text-tinta-suave">Marca ✓/✗ en las clasificaciones para que aparezca la métrica. No se calcula nada a partir de la confianza declarada por el modelo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-13 uppercase tracking-wide text-tinta-suave">
                <th className="text-left py-2 pr-4 font-medium">Capítulo</th>
                <th className="text-right py-2 px-2 font-medium">Acierto</th>
                <th className="text-right py-2 px-2 font-medium">✓</th>
                <th className="text-right py-2 px-2 font-medium">✗</th>
                <th className="text-right py-2 px-2 font-medium">~</th>
                <th className="text-right py-2 px-2 font-medium">Con feedback</th>
                <th className="text-right py-2 pl-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="font-sello-mono">
              {conDatos.map(c => (
                <tr key={c.capitulo} className="border-b border-linea last:border-b-0">
                  <td className="py-2 pr-4 text-tinta">{c.capitulo}</td>
                  <td className="py-2 px-2 text-right"><Badge tono={c.acierto !== null && c.acierto >= 75 ? 'petroleo' : c.acierto !== null && c.acierto >= 50 ? 'ambar' : 'carmin'}>{c.acierto}%</Badge></td>
                  <td className="py-2 px-2 text-right text-sello">{c.correct}</td>
                  <td className="py-2 px-2 text-right text-carmin">{c.incorrect}</td>
                  <td className="py-2 px-2 text-right text-ambar">{c.partial}</td>
                  <td className="py-2 px-2 text-right text-tinta">{c.conFeedback}</td>
                  <td className="py-2 pl-2 text-right text-tinta-suave">{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
