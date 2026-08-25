/**
 * SELLO · Clasificador v2 — la pantalla donde el agente decide si confía.
 *
 * Dos paneles: izquierda la CONVERSACIÓN (el medio), derecha el EXPEDIENTE
 * (el producto). Cada dato legal lleva SIEMPRE su SelloVerificacion.
 *
 * HONESTIDAD DEL SELLO: el backend expone `datosCanonicos` (Frontera Canónica
 * §3.4) — NICO, tarifas, NOMs, RRNA y padrón vienen SUSTITUIDOS por catálogo/
 * tablas con procedencia (fuente + fechas + estado). Esos se sellan según su
 * DatoLegal (verde cuando la fuente lo permite). Lo que sigue siendo texto del
 * LLM (justificación RGI, notas, explicación) permanece ámbar 'sin_verificar'.
 * La confianza del modelo NO se muestra como número prominente: no está
 * calibrada (los errores promedian 87.5) — solo aparece como detalle técnico.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Copy, Check, FileDown, ClipboardCheck, MessageSquareText,
  FolderOpen, ThumbsUp, ThumbsDown, ChevronDown,
} from 'lucide-react'
import { api } from '../lib/api'
import type { ClassificationResult, ClassifierAlert, ClassifierAntidumpingMetadata, DatoLegal } from '../lib/api'
import { formatFraction } from '../lib/format'
import { Button, Card, Badge, Textarea, Input, SelloVerificacion, EmptyState, type EstadoSello } from '../components/ui'

// ════════════════════════════════════════════════════════════════════════
// DatoLegalVerificado — el tipo IDEAL contra el que está construida la UI.
// Hoy se llena mapeando lo que la API sí trae; lo faltante queda
// 'sin_verificar' (ver docs/GAP_API_EXPEDIENTE.md). NO se inventan datos.
// ════════════════════════════════════════════════════════════════════════
export interface DatoLegalVerificado {
  id: string
  texto: string          // la afirmación/cita ("Regla General 1 (RGI)…")
  detalle?: string       // razonamiento o texto extendido
  estado: EstadoSello
  fuenteNombre?: string
  fuenteUrl?: string
  fechaPublicacion?: string
  fechaVerificacion?: string
  metodo?: 'manual' | 'scraper'
}

interface Mensaje {
  rol: 'usuario' | 'sistema'
  texto: string
  esError?: boolean
}

// Etapas del indicador de trabajo. El backend NO emite eventos de progreso
// (una sola respuesta POST): los tiempos reflejan el pipeline real
// (candidatos → IA/GRI → verificación de catálogo), no son un adorno.
const ETAPAS = [
  'Buscando candidatos en el catálogo TIGIE…',
  'Aplicando Reglas Generales de Interpretación…',
  'Verificando fracción, cuotas y regulaciones…',
]

function selloDe(d: DatoLegalVerificado) {
  return (
    <SelloVerificacion
      estado={d.estado}
      fuenteNombre={d.fuenteNombre}
      fuenteUrl={d.fuenteUrl}
      fechaPublicacion={d.fechaPublicacion}
      fechaVerificacion={d.fechaVerificacion}
      metodo={d.metodo}
    />
  )
}

// DatoLegal de la API → props del sello. 'no_disponible' no produce sello
// (es ausencia explícita de dato, no un valor que calificar).
function deDatoLegal(id: string, texto: string, d: DatoLegal<unknown>, detalle?: string): DatoLegalVerificado {
  return {
    id,
    texto,
    detalle,
    estado: (d.estado === 'no_disponible' ? 'sin_verificar' : d.estado) as EstadoSello,
    fuenteNombre: d.fuente?.nombre,
    fuenteUrl: d.fuente?.url ?? undefined,
    fechaPublicacion: d.fuente?.fechaPublicacion ?? undefined,
    fechaVerificacion: d.fechaCotejo ?? undefined,
    metodo: d.metodo === 'ingesta' ? 'scraper' : d.metodo,
  }
}

// ── Mapeo API actual → expediente (lo no expuesto queda sin_verificar) ────
function mapExpediente(r: ClassificationResult) {
  const sinVerificar = (extra: Partial<DatoLegalVerificado> = {}): Pick<DatoLegalVerificado, 'estado'> & Partial<DatoLegalVerificado> => ({
    estado: 'sin_verificar',
    ...extra,
  })

  const justificacion: DatoLegalVerificado[] = [
    ...(r.legalBasis?.griApplied ?? []).map((g, i) => ({
      id: `gri-${i}`,
      texto: g.rule,
      detalle: g.reasoning,
      ...sinVerificar({ fuenteNombre: 'LIGIE — Reglas Generales' }),
    })),
    ...(r.legalBasis?.legalNotes ?? []).map((n, i) => ({
      id: `nota-${i}`,
      texto: n.source,
      detalle: n.text,
      ...sinVerificar({ fuenteNombre: n.source }),
    })),
  ]

  // NOMs: con datosCanonicos, cada NOM sale sellada según su DatoLegal
  // (verde si viene de la tabla curada; ámbar si del campo pendiente de
  // Anexo 2.4.1; roja si la consulta falló). Sin el bloque, ámbar legacy.
  const canonNoms = r.datosCanonicos?.regulaciones.noms
  const noms: DatoLegalVerificado[] = canonNoms
    ? canonNoms.estado === 'no_revisado'
      ? [deDatoLegal('nom-nr', 'NOMs no revisadas — la consulta a la tabla falló', canonNoms, canonNoms.nota)]
      : (canonNoms.valor ?? []).map((n, i) =>
          deDatoLegal(`nom-${i}`, n.code, canonNoms, n.description || `Autoridad: ${n.authority}`))
    : (r.regulations?.noms ?? []).map((nom, i) => ({
        id: `nom-${i}`,
        texto: nom,
        ...sinVerificar({ fuenteNombre: 'Anexo 2.4.1 (SE)' }),
      }))

  const cuotaMeta = (r.alerts ?? [])
    .filter(a => a.type === 'antidumping' && a.metadata)
    .map(a => a.metadata as ClassifierAntidumpingMetadata)

  const cuotas: DatoLegalVerificado[] = cuotaMeta.map((m, i) => ({
    id: `cuota-${i}`,
    texto: `Cuota compensatoria ${m.rateLabel} — origen ${m.countryNormalized}`,
    detalle: m.resolutionNumber ?? undefined,
    // La tabla de cuotas está pendiente de cotejo UPCI: aunque la API declara
    // dofUrl/publishDate, NO lo presentamos como verificado. El popover
    // muestra la fuente declarada; el sello dice la verdad.
    estado: 'sin_verificar',
    fuenteNombre: m.dofUrl ? 'DOF (declarado)' : undefined,
    fuenteUrl: m.dofUrl ?? undefined,
    fechaPublicacion: m.publishDate ?? undefined,
  }))

  const canonRrna = r.datosCanonicos?.regulaciones.rrna
  const rrna: DatoLegalVerificado[] = [
    ...(canonRrna
      ? canonRrna.estado === 'no_revisado'
        ? [deDatoLegal('rrna-nr', 'RRNA no revisadas — la consulta a la tabla falló', canonRrna, canonRrna.nota)]
        : (canonRrna.valor ?? []).map((x, i) =>
            deDatoLegal(`rrna-${i}`, x.code, canonRrna, x.description || `Autoridad: ${x.authority}`))
      : (r.regulations?.rrna ?? []).map((x, i) => ({
          id: `rrna-${i}`, texto: x, ...sinVerificar(),
        }))),
    ...(r.padronCheck && r.padronCheck.totalRequired > 0
      ? r.padronCheck.required.map((p, i) => ({
          id: `padron-${i}`,
          texto: `Padrón sectorial requerido: ${('name' in p ? (p as { name?: string }).name : undefined) ?? ('sectorialName' in p ? (p as { sectorialName?: string }).sectorialName : undefined) ?? 'sector'}`,
          estado: 'sin_verificar' as EstadoSello,
          fuenteNombre: 'Anexo 10 RGCE 2026',
        }))
      : []),
  ]

  const advertencias: (ClassifierAlert & { id: string })[] = (r.alerts ?? []).map((a, i) => ({ ...a, id: `al-${i}` }))

  // Panel de fuentes: dedup por fuenteNombre de todo lo citado
  const todas = [...justificacion, ...noms, ...cuotas, ...rrna]
  const fuentes = [...new Map(
    todas.filter(d => d.fuenteNombre).map(d => [d.fuenteNombre, d]),
  ).values()]

  return { justificacion, noms, cuotas, rrna, advertencias, fuentes }
}

// ── Sección del expediente ────────────────────────────────────────────────
function SeccionExpediente({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card denso header={<h3 className="font-sello-display text-lg text-tinta">{titulo}</h3>} className="print:break-inside-avoid">
      {children}
    </Card>
  )
}

// Persistencia del borrador y del job en vuelo (BUG-2, 24-ago-2026): el
// borrador se guarda al escribir y el job activo sobrevive a la navegación —
// al volver al módulo se retoma el polling o se pinta el resultado terminado.
// Llaves con namespace del módulo Y del usuario autenticado (revisión 24-ago):
// otro usuario que inicie sesión en el mismo navegador no ve el borrador ni
// retoma el job de quien salió.
function idUsuarioLocal(): string {
  try {
    const t = localStorage.getItem('aduanai_token')
    const b64 = t?.split('.')[1]
    if (!b64) return 'anon'
    const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as { userId?: string }
    return payload.userId ?? 'anon'
  } catch {
    return 'anon'
  }
}
const draftKey = () => `aduanai:classifier:draft:${idUsuarioLocal()}`
const jobKey = () => `aduanai:classifier:job:${idUsuarioLocal()}`

function leerDraft(): { input: string; pais: string; valor: string; cantidad: string } {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()) ?? '{}') as Record<string, unknown>
    return {
      input: typeof d.input === 'string' ? d.input : '',
      pais: typeof d.pais === 'string' ? d.pais : '',
      valor: typeof d.valor === 'string' ? d.valor : '',
      cantidad: typeof d.cantidad === 'string' ? d.cantidad : '',
    }
  } catch {
    return { input: '', pais: '', valor: '', cantidad: '' }
  }
}

export function ClassifierPage() {
  const navigate = useNavigate()
  const draftInicial = useMemo(leerDraft, [])
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [input, setInput] = useState(draftInicial.input)
  const [pais, setPais] = useState(draftInicial.pais)
  const [valor, setValor] = useState(draftInicial.valor)
  const [cantidad, setCantidad] = useState(draftInicial.cantidad)
  const [detallesAbiertos, setDetallesAbiertos] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [etapa, setEtapa] = useState(0)
  const [resultado, setResultado] = useState<ClassificationResult | null>(null)
  const [classificationId, setClassificationId] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [tabMovil, setTabMovil] = useState<'conversacion' | 'expediente'>('conversacion')
  const [expedienteNuevo, setExpedienteNuevo] = useState(false)
  const finConversacion = useRef<HTMLDivElement>(null)
  // Momento en que arrancó el job (para el indicador de etapas, también al
  // retomar un job tras navegar) y control de cancelación del polling.
  const inicioJob = useRef<number | null>(null)
  const pollCancelado = useRef(false)
  // Número de "vuelta" del watcher: cada vigilarJob toma la suya y muere si
  // deja de ser la vigente (StrictMode, doble submit, desmontaje) — nunca hay
  // dos watchers vivos del mismo componente ni acciones tras un await viejo.
  const vueltaSeq = useRef(0)

  // Etapas por tiempo transcurrido desde que arrancó el job (no desde que se
  // montó el componente): al volver a la página el indicador sigue donde iba.
  useEffect(() => {
    if (!cargando) return
    const tick = () => {
      const transcurrido = Date.now() - (inicioJob.current ?? Date.now())
      setEtapa(transcurrido < 4000 ? 0 : transcurrido < 11000 ? 1 : 2)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [cargando])

  useEffect(() => {
    finConversacion.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [mensajes, cargando])

  // Borrador persistente (BUG-2): se guarda al escribir, con debounce corto.
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(), JSON.stringify({ input, pais, valor, cantidad })) } catch { /* almacenamiento lleno/bloqueado: el borrador es best-effort */ }
    }, 400)
    return () => clearTimeout(t)
  }, [input, pais, valor, cantidad])

  // Al montar: si hay un job guardado, retomarlo — el trabajo en vuelo
  // sobrevive a la navegación. El polling se cancela al desmontar (el job
  // sigue corriendo server-side; la llave queda para retomarlo al volver).
  useEffect(() => {
    pollCancelado.current = false
    const jobGuardado = localStorage.getItem(jobKey())
    if (jobGuardado) void vigilarJob(jobGuardado, { reanudando: true })
    return () => { pollCancelado.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const expediente = useMemo(() => (resultado ? mapExpediente(resultado) : null), [resultado])

  // Sondea el job hasta que termine. Los errores de red transitorios NO matan
  // nada: el job sigue server-side y el siguiente intento lo recupera.
  async function vigilarJob(jobId: string, opts?: { reanudando?: boolean }) {
    const miVuelta = ++vueltaSeq.current
    const vigente = () => !pollCancelado.current && vueltaSeq.current === miVuelta
    try { localStorage.setItem(jobKey(), jobId) } catch { /* best-effort */ }
    setCargando(true)
    let intervalo = 2500
    let primeraVuelta = true
    while (vigente()) {
      try {
        const res = await api.classifyJob(jobId)
        // Chequeo POST-await: si esta vuelta dejó de ser la vigente mientras
        // esperaba la red, NO toca estado ni localStorage — otro watcher (o
        // ninguno) es el dueño ahora.
        if (!vigente()) return
        const j = res.job
        if (opts?.reanudando && primeraVuelta) {
          inicioJob.current = new Date(j.createdAt).getTime()
          if (j.description) setMensajes([{ rol: 'usuario', texto: j.description }])
        }
        primeraVuelta = false
        if (j.status === 'done' && j.result) {
          // Re-verificación 24-ago (BUG-2 parcial): la llave NO se borra al
          // terminar — es lo que permite RESTAURAR el expediente al volver al
          // módulo ("estará aquí al volver"), incluso días después (el job
          // vive 7 días). Solo se suelta con el 404 de expiración o cuando
          // una clasificación nueva la reemplaza.
          setResultado(j.result)
          setClassificationId(j.classificationId ?? '')
          setExpedienteNuevo(true)
          setFeedback(null)
          setMensajes(m => [...m, {
            rol: 'sistema',
            texto: `Fracción propuesta: ${formatFraction(j.result!.fraction.code)} — ${j.result!.fraction.description}. El expediente completo está en el panel derecho, con cada cita y su estado de verificación.`,
          }])
          setCargando(false)
          return
        }
        if (j.status === 'error') {
          // El error también se restaura al volver (mensaje + texto en el
          // borrador para reintentar) — misma razón que el done.
          if (j.description) setInput(prev => prev || j.description || '')
          setMensajes(m => [...m, {
            rol: 'sistema',
            esError: true,
            texto: j.error?.message ?? 'La clasificación falló. Intenta de nuevo.',
          }])
          setCargando(false)
          return
        }
      } catch (e) {
        if (!vigente()) return
        // Job expirado o borrado (404): soltar la llave sin drama. Cualquier
        // otro error (red, 5xx transitorio) se reintenta en el siguiente ciclo.
        if (e instanceof Error && /no encontrada/i.test(e.message)) {
          try { localStorage.removeItem(jobKey()) } catch { /* best-effort */ }
          setCargando(false)
          return
        }
      }
      await new Promise(r => setTimeout(r, intervalo))
      intervalo = Math.min(intervalo + 500, 5000)
    }
  }

  async function clasificar() {
    const q = input.trim()
    if (!q || cargando) return
    setFeedback(null)
    inicioJob.current = Date.now()
    setCargando(true)
    try {
      const res = await api.classifyStart(
        q,
        undefined,
        pais.trim() || undefined,
        valor ? parseFloat(valor) : undefined,
        { declaredQuantity: cantidad ? parseFloat(cantidad) : undefined },
      )
      // Revisión 24-ago (#3): si el servidor reutilizó un job activo con OTRA
      // descripción (doble pestaña, llave perdida), la conversación muestra la
      // descripción de ESE job — jamás se asocia el resultado del producto A
      // con el texto del producto B. El texto nuevo se queda en el borrador.
      // Revisión 24-ago: al arrancar una clasificación nueva, el expediente
      // anterior (posiblemente restaurado, de hasta 7 días) deja de mostrarse
      // — sus acciones (exportar, enviar a Pre-Glosa) no deben quedar activas
      // apuntando al resultado viejo mientras corre (o falla) el nuevo.
      setResultado(null)
      setClassificationId('')
      setExpedienteNuevo(false)
      const reusadoDistinto = res.reused && res.description && res.description.trim() !== q
      if (reusadoDistinto) {
        setMensajes(m => [...m.filter(x => !x.esError),
          { rol: 'usuario', texto: res.description! },
          { rol: 'sistema', texto: 'Ya tenías una clasificación en curso — la retomo primero. Tu texto nuevo sigue en el borrador para clasificarlo cuando esta termine.' },
        ])
        // input NO se limpia: el borrador conserva el texto nuevo.
      } else {
        // BUG-6: los errores de intentos anteriores se limpian al iniciar una
        // operación nueva — no se apilan encima del resultado bueno.
        setMensajes(m => [...m.filter(x => !x.esError), { rol: 'usuario', texto: q }])
        setInput('')
      }
      void vigilarJob(res.jobId)
    } catch (e) {
      setCargando(false)
      setMensajes(m => [...m, {
        rol: 'sistema',
        esError: true,
        texto: e instanceof Error ? e.message : 'No pude clasificar. Reformula la descripción con más detalle (material, uso, características).',
      }])
    }
  }

  async function enviarFeedback(fb: 'correct' | 'incorrect') {
    if (!classificationId || feedback) return
    setFeedback(fb)
    api.classifyFeedback(classificationId, fb).catch(() => {})
  }

  function copiarFraccion() {
    if (!resultado) return
    navigator.clipboard.writeText(formatFraction(resultado.fraction.code)).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  }

  const advertenciaTono = (sev: ClassifierAlert['severity']) =>
    sev === 'critical' ? 'carmin' : sev === 'warning' ? 'ambar' : 'neutral'

  // ── Panel izquierdo: conversación ──
  const conversacion = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {mensajes.length === 0 && !cargando && (
          <EmptyState
            icono={MessageSquareText}
            titulo="Describe tu producto"
            descripcion="Material, uso y características. A mayor detalle, mejor fracción — y siempre con sus fuentes a la vista."
          />
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={`max-w-[92%] ${m.rol === 'usuario' ? 'ml-auto' : ''}`}>
            <div className={[
              'rounded-sello px-4 py-3 text-base leading-relaxed border',
              m.rol === 'usuario'
                ? 'bg-petroleo-suave border-petroleo/15 text-tinta'
                : m.esError
                  ? 'bg-carmin-suave border-carmin/25 text-carmin'
                  : 'bg-superficie border-linea text-tinta',
            ].join(' ')}>
              {m.texto}
            </div>
            {m.rol === 'sistema' && !m.esError && i === mensajes.length - 1 && classificationId && (
              <div className="flex items-center gap-2 mt-1.5 pl-1">
                <span className="text-13 text-tinta-suave">¿Fue correcta?</span>
                <button type="button" onClick={() => enviarFeedback('correct')} aria-label="Clasificación correcta"
                  className={`p-1 rounded-sello-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${feedback === 'correct' ? 'text-petroleo' : 'text-tinta-suave hover:text-petroleo'}`}>
                  <ThumbsUp className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => enviarFeedback('incorrect')} aria-label="Clasificación incorrecta"
                  className={`p-1 rounded-sello-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${feedback === 'incorrect' ? 'text-carmin' : 'text-tinta-suave hover:text-carmin'}`}>
                  <ThumbsDown className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        ))}
        {cargando && (
          <div className="bg-superficie border border-linea rounded-sello px-4 py-3 space-y-2 max-w-[92%]">
            {ETAPAS.map((e, i) => (
              <div key={i} className={`flex items-center gap-2 text-sm ${i < etapa ? 'text-petroleo' : i === etapa ? 'text-tinta font-medium' : 'text-tinta-suave/50'}`}>
                {i < etapa
                  ? <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  : i === etapa
                    ? <span className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-petroleo border-t-transparent animate-spin" aria-hidden />
                    : <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-linea" aria-hidden />}
                {e}
              </div>
            ))}
            <p className="text-13 text-tinta-suave pt-1">
              La clasificación fundamentada puede tomar de 1 a 3 minutos. Puedes navegar a otros
              módulos — el trabajo continúa y estará aquí al volver.
            </p>
          </div>
        )}
        <div ref={finConversacion} />
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-linea mt-3 space-y-2">
        <Textarea
          aria-label="Descripción del producto"
          placeholder="Ej. Tornillo de acero inoxidable, cabeza hexagonal, M10x50mm, para uso industrial"
          rows={3}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) clasificar() }}
        />
        <button
          type="button"
          onClick={() => setDetallesAbiertos(v => !v)}
          aria-expanded={detallesAbiertos}
          className="inline-flex items-center gap-1 text-13 text-tinta-suave hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${detallesAbiertos ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden />
          Detalles opcionales (país, valor, cantidad)
        </button>
        {detallesAbiertos && (
          <div className="grid grid-cols-3 gap-2">
            <Input aria-label="País de origen" placeholder="País (CN)" mono value={pais} onChange={e => setPais(e.target.value)} />
            <Input aria-label="Valor unitario USD" placeholder="Valor USD" mono value={valor} onChange={e => setValor(e.target.value)} />
            <Input aria-label="Cantidad declarada" placeholder="Cantidad" mono value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </div>
        )}
        <Button variante="primario" onClick={clasificar} loading={cargando} disabled={!input.trim()} className="w-full">
          <Send className="w-4 h-4" strokeWidth={1.5} aria-hidden />
          Clasificar producto
        </Button>
      </div>
    </div>
  )

  // ── Panel derecho: expediente ──
  const panelExpediente = !resultado || !expediente ? (
    <Card>
      <EmptyState
        icono={FolderOpen}
        titulo="El expediente se construye aquí"
        descripcion="Describe tu producto a la izquierda. Cada fracción llega con su justificación legal, cuotas, NOMs y el estado de verificación de cada fuente."
      />
    </Card>
  ) : (
    <div className="space-y-4">
      {/* Barra de acciones sticky */}
      <div className="sticky top-14 z-10 bg-papel border border-linea rounded-sello px-4 py-2.5 flex items-center gap-2 flex-wrap print:hidden">
        <Button variante="secundario" tamano="sm" onClick={copiarFraccion}>
          {copiado ? <Check className="w-4 h-4" strokeWidth={1.5} aria-hidden /> : <Copy className="w-4 h-4" strokeWidth={1.5} aria-hidden />}
          {copiado ? 'Copiada' : 'Copiar fracción'}
        </Button>
        <Button
          variante="secundario"
          tamano="sm"
          disabled={!classificationId}
          onClick={() => window.open(api.dictamenURL(classificationId), '_blank')}
        >
          <FileDown className="w-4 h-4" strokeWidth={1.5} aria-hidden />
          Exportar expediente (PDF)
        </Button>
        <Button
          variante="secundario"
          tamano="sm"
          onClick={() => navigate(`/simulador-glosa?fraccion=${encodeURIComponent(resultado.fraction.code)}`)}
        >
          <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} aria-hidden />
          Enviar a Pre-Glosa
        </Button>
      </div>

      {/* Encabezado del expediente */}
      <Card className="print:break-inside-avoid">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-13 uppercase tracking-wide text-tinta-suave">Fracción arancelaria propuesta</p>
            <p className="font-sello-mono text-4xl text-tinta mt-1">{formatFraction(resultado.fraction.code)}</p>
            {(resultado.nico || (resultado.datosCanonicos?.nico.valor?.length ?? 0) > 0) && (
              <p className="font-sello-mono text-sm text-tinta-suave mt-1 flex items-center gap-2 flex-wrap">
                {resultado.nico
                  ? <>NICO {resultado.nico}</>
                  : <>NICO por elegir: {resultado.datosCanonicos!.nico.valor!.join(', ')}</>}
                {resultado.datosCanonicos && selloDe(deDatoLegal('nico', 'NICO', resultado.datosCanonicos.nico))}
              </p>
            )}
            {/* Presentación compuesta: cadena jerárquica REAL cuando la descripción
                de la fracción es un fragmento sin contexto. Jamás se inventa el
                texto padre: si no está en catálogo, fragmento con nota. */}
            {(() => {
              const desc = resultado.fraction.description
              const jer = resultado.datosCanonicos?.fraccion.valor?.jerarquia
              const esFragmento = desc.length <= 80
              if (!esFragmento || !jer) {
                return <p className="text-base text-tinta leading-relaxed mt-3">{desc}</p>
              }
              if (!jer.partida && !jer.subpartida) {
                return (
                  <div className="mt-3">
                    <p className="text-base text-tinta leading-relaxed">{desc}</p>
                    <p className="text-13 text-tinta-suave mt-1">
                      Texto de partida/subpartida no disponible en el catálogo cargado — el fragmento es el texto oficial de la fracción.
                    </p>
                  </div>
                )
              }
              return (
                <div className="mt-3 space-y-1">
                  {jer.partida && (
                    <p className="text-sm text-tinta-suave leading-relaxed">
                      <span className="font-sello-mono">{jer.partida.code}</span> {jer.partida.texto}
                    </p>
                  )}
                  {jer.subpartida && (
                    <p className="text-sm text-tinta-suave leading-relaxed pl-3">
                      › <span className="font-sello-mono">{jer.subpartida.code}</span> {jer.subpartida.texto}
                    </p>
                  )}
                  <p className="text-base text-tinta leading-relaxed pl-6">› {desc}</p>
                </div>
              )
            })()}
          </div>
          <div className="shrink-0">
            {resultado.datosCanonicos ? (
              selloDe(deDatoLegal('fraccion', 'Fracción del catálogo', resultado.datosCanonicos.fraccion))
            ) : (
              <SelloVerificacion
                estado="sin_verificar"
                fuenteNombre={resultado.meta ? `Catálogo ${resultado.meta.tigieVersion}` : 'Catálogo TIGIE'}
                metodo="manual"
              />
            )}
          </div>
        </div>
        <p className="text-13 text-tinta-suave mt-4 pt-3 border-t border-linea leading-relaxed">{resultado.disclaimer}</p>
        {/* Detalle técnico — NUNCA número prominente: la confianza autodeclarada
            no está calibrada (los errores promedian 87.5/100). */}
        <p className="text-13 text-tinta-suave mt-1.5 leading-relaxed">
          Confianza autodeclarada del modelo: {resultado.confidence}/100 — no calibrada; no es probabilidad de acierto.
        </p>
      </Card>

      {/* Justificación legal */}
      {expediente.justificacion.length > 0 && (
        <SeccionExpediente titulo="Justificación legal">
          <ul className="space-y-4">
            {expediente.justificacion.map(d => (
              <li key={d.id}>
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="text-base font-medium text-tinta">{d.texto}</p>
                  {selloDe(d)}
                </div>
                {d.detalle && <p className="text-sm text-tinta-suave leading-relaxed mt-1">{d.detalle}</p>}
              </li>
            ))}
          </ul>
        </SeccionExpediente>
      )}

      {/* NOMs */}
      {expediente.noms.length > 0 && (
        <SeccionExpediente titulo="NOMs aplicables">
          <ul className="space-y-2">
            {expediente.noms.map(d => (
              <li key={d.id} className="flex items-center gap-2 flex-wrap">
                <span className="font-sello-mono text-base text-tinta">{d.texto}</span>
                {selloDe(d)}
              </li>
            ))}
          </ul>
        </SeccionExpediente>
      )}

      {/* Cuotas y aranceles */}
      <SeccionExpediente titulo="Cuotas y aranceles">
        <table className="w-full">
          <tbody className="divide-y divide-linea">
            <tr>
              <td className="py-2 text-sm text-tinta-suave">Arancel NMF (IGI)</td>
              <td className="py-2 text-right font-sello-mono text-base text-tinta">
                {resultado.tariffs?.nmf != null ? `${resultado.tariffs.nmf}%` : 'Sin dato en catálogo'}
              </td>
              <td className="py-2 pl-3 w-px whitespace-nowrap">
                {resultado.datosCanonicos && resultado.tariffs?.nmf != null
                  ? selloDe(deDatoLegal('nmf', 'NMF', resultado.datosCanonicos.tarifas.nmf))
                  : resultado.tariffs?.nmf != null
                    ? <SelloVerificacion estado="sin_verificar" fuenteNombre="TIGIE (catálogo)" />
                    : null}
              </td>
            </tr>
            {Object.entries(resultado.tariffs?.preferential ?? {}).map(([tratado, tasa]) => (
              <tr key={tratado}>
                <td className="py-2 text-sm text-tinta-suave">Preferencial {tratado}</td>
                <td className="py-2 text-right font-sello-mono text-base text-tinta">{tasa}%</td>
                <td className="py-2 pl-3 w-px whitespace-nowrap">
                  {resultado.datosCanonicos
                    ? selloDe(deDatoLegal(`pref-${tratado}`, tratado, resultado.datosCanonicos.tarifas.preferenciales))
                    : <SelloVerificacion estado="sin_verificar" fuenteNombre={`Tratado ${tratado}`} />}
                </td>
              </tr>
            ))}
            {expediente.cuotas.map(d => (
              <tr key={d.id}>
                <td className="py-2 text-sm text-carmin font-medium">{d.texto}</td>
                <td className="py-2 text-right font-sello-mono text-base text-carmin">{d.detalle ?? ''}</td>
                <td className="py-2 pl-3 w-px whitespace-nowrap">{selloDe(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SeccionExpediente>

      {/* Regulaciones no arancelarias */}
      {expediente.rrna.length > 0 && (
        <SeccionExpediente titulo="Regulaciones no arancelarias">
          <ul className="space-y-2">
            {expediente.rrna.map(d => (
              <li key={d.id} className="flex items-start gap-2 flex-wrap">
                <span className="text-base text-tinta">{d.texto}</span>
                {selloDe(d)}
              </li>
            ))}
          </ul>
        </SeccionExpediente>
      )}

      {/* Advertencias */}
      {expediente.advertencias.length > 0 && (
        <SeccionExpediente titulo="Advertencias">
          <ul className="space-y-3">
            {expediente.advertencias.map(a => (
              <li key={a.id} className={`rounded-sello-sm border px-3 py-2.5 ${a.severity === 'critical' ? 'bg-carmin-suave border-carmin/25' : a.severity === 'warning' ? 'bg-ambar-suave border-ambar/25' : 'bg-papel-2 border-linea'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tono={advertenciaTono(a.severity)}>{a.severity === 'critical' ? 'Crítico' : a.severity === 'warning' ? 'Advertencia' : 'Aviso'}</Badge>
                  <p className="text-sm font-medium text-tinta">{a.title}</p>
                </div>
                <p className="text-sm text-tinta-suave leading-relaxed mt-1">{a.message}</p>
              </li>
            ))}
          </ul>
        </SeccionExpediente>
      )}

      {/* Panel de fuentes — el argumento de venta del producto */}
      <SeccionExpediente titulo="Fuentes de este expediente">
        {expediente.fuentes.length === 0 ? (
          <p className="text-sm text-tinta-suave">Esta respuesta no citó fuentes estructuradas.</p>
        ) : (
          <ul className="divide-y divide-linea -my-2">
            {expediente.fuentes.map(f => (
              <li key={f.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-base text-tinta">{f.fuenteNombre}</span>
                {selloDe(f)}
              </li>
            ))}
          </ul>
        )}
        <p className="text-13 text-tinta-suave mt-4 pt-3 border-t border-linea leading-relaxed">
          El sello verde indica dato del catálogo/tablas canónicas con fuente y fecha de cotejo. El ámbar,
          afirmación aún no cotejada dato por dato (típicamente razonamiento del modelo o datasets en
          consolidación) — no que sea falsa. El rojo indica que una consulta falló y ese dato NO fue revisado.
        </p>
      </SeccionExpediente>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto">
      {/* Tabs móviles */}
      <div className="lg:hidden flex border border-linea rounded-sello-sm overflow-hidden mb-4 print:hidden">
        {(['conversacion', 'expediente'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setTabMovil(t); if (t === 'expediente') setExpedienteNuevo(false) }}
            aria-selected={tabMovil === t}
            role="tab"
            className={`flex-1 py-2.5 text-sm font-medium font-sello-ui transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${tabMovil === t ? 'bg-petroleo-suave text-petroleo' : 'bg-superficie text-tinta-suave'}`}
          >
            {t === 'conversacion' ? 'Conversación' : 'Expediente'}
            {t === 'expediente' && expedienteNuevo && tabMovil !== 'expediente' && (
              <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-ambar align-middle" aria-label="Contenido nuevo" />
            )}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-5 lg:gap-6 lg:items-start">
        {/* Conversación ~40% */}
        <div className={`lg:col-span-2 lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)] print:hidden ${tabMovil === 'conversacion' ? '' : 'hidden lg:flex'} flex flex-col`}>
          {conversacion}
        </div>
        {/* Expediente ~60% */}
        <div className={`lg:col-span-3 mt-4 lg:mt-0 ${tabMovil === 'expediente' ? '' : 'hidden lg:block'} print:block print:col-span-5`}>
          {panelExpediente}
        </div>
      </div>
    </div>
  )
}
