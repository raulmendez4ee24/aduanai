/**
 * Fracciones — ficha completa + árbol (Ola 3).
 * "Pantalla abierta todo el día": buscador, árbol lateral perezoso y ficha por
 * secciones; cada dato con su fuente y su fecha DOF/cotejo. Sin datos falsos:
 * los bloques vacíos dicen qué fuente falta.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Search, Package, Bell, ChevronRight, ChevronDown, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import type { FractionSearchResult } from '../lib/api'
import { useTotalFractions } from '../hooks/useTotalFractions'
import { fichaFraccion, arbolFracciones, type FichaFraccion, type NodoArbol, type Bloque } from '../lib/api/ola3'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export const GUIA_MODULO = {
  titulo: 'Fracciones',
  pasos: [
    'Busca por código (con o sin puntos) o por descripción; o navega el árbol de la izquierda: sección → capítulo → partida → subpartida → fracción.',
    'La ficha reúne descripción, NICOs, IGI general y por tratado, PROSEC, Regla 8va, cuotas compensatorias, NOMs con excepciones, permisos, precios estimados y correlativas.',
    'Cada bloque dice su fuente y la fecha DOF/cotejo. "Sin dato cargado" significa que no hay fila real para esta fracción; "pendiente de carga" que la fuente oficial aún no está en el producto.',
    'La campana monitorea cambios DOF de esa fracción (Regulatorio).',
  ],
}

const NIVEL_LABEL: Record<NodoArbol['nivel'], string> = { seccion: 'Sección', capitulo: 'Capítulo', partida: 'Partida', subpartida: 'Subpartida', fraccion: 'Fracción' }

export function FractionsPage() {
  const { formatted } = useTotalFractions()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FractionSearchResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [code, setCode] = useState<string>(() => new URLSearchParams(window.location.search).get('code') ?? '')
  const [ficha, setFicha] = useState<FichaFraccion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function buscar() {
    const q = query.trim()
    if (!q) return
    if (/^[\d.]{10,}$/.test(q) && q.replace(/\D/g, '').length === 8) { setCode(q.replace(/\D/g, '')); return }
    setBuscando(true)
    try { const r = await api.searchFractions(q); setResults(r.data) } catch { setResults([]) }
    setBuscando(false)
  }

  useEffect(() => {
    if (!code) return
    let vivo = true
    setCargando(true); setError('')
    fichaFraccion(code).then(r => { if (vivo) setFicha(r.data) })
      .catch(e => { if (vivo) { setFicha(null); setError(e instanceof Error ? e.message : 'No se pudo cargar la ficha') } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [code])

  async function watch(c: string) { try { await api.watchFraction(c) } catch { /* silencioso: la campana es opcional */ } }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Fracciones TIGIE</h1>
          <span className="text-[11px] text-slate-500 ml-2">{formatted} fracciones</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/60 border border-slate-200/50 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-slate-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscar() }}
              placeholder="Código (8471.30.01) o descripción…" className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none" />
          </div>
          <button onClick={buscar} disabled={buscando} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-medium px-5 rounded-xl">{buscando ? '…' : 'Buscar'}</button>
        </div>
        {results.length > 0 && (
          <div className="mt-3 max-h-64 overflow-auto divide-y divide-slate-100 border border-slate-100 rounded-xl bg-white/60">
            {results.map(f => (
              <button key={f.code} onClick={() => { setCode(f.code); setResults([]) }} className="w-full text-left px-4 py-2 hover:bg-emerald-50/60 flex items-center gap-3">
                <span className="font-mono text-[13px] font-bold text-slate-900 w-28 shrink-0">{f.codeFormatted}</span>
                <span className="text-[12px] text-slate-600 truncate">{f.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        <div className={`${GLASS} rounded-2xl p-4 lg:sticky lg:top-4 max-h-[75vh] overflow-auto`}>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Árbol TIGIE</p>
          <Arbol nodo="" onFraccion={setCode} seleccionada={code} />
        </div>

        <div className="space-y-4 min-w-0">
          {!code && !cargando && (
            <div className={`${GLASS} rounded-2xl p-8 text-center text-[12px] text-slate-500`}>Elige una fracción del árbol o búscala arriba para abrir su ficha.</div>
          )}
          {cargando && <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando ficha de {code}…</div>}
          {error && <div className={`${GLASS} rounded-2xl p-4 text-[12px] text-rose-700 flex items-center gap-2`}><AlertCircle className="w-4 h-4" />{error}</div>}
          {ficha && !cargando && <Ficha ficha={ficha} onWatch={() => watch(ficha.fraccion.code)} />}
        </div>
      </div>
    </div>
  )
}

// ── Árbol perezoso ──────────────────────────────────────────────────────────

function Arbol({ nodo, onFraccion, seleccionada, nivelPadre }: { nodo: string; onFraccion: (c: string) => void; seleccionada: string; nivelPadre?: string }) {
  const [hijos, setHijos] = useState<(NodoArbol & { hoja: boolean })[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let vivo = true
    arbolFracciones(nodo).then(r => { if (vivo) setHijos(r.data.hijos) }).catch(e => { if (vivo) setErr(e instanceof Error ? e.message : 'error') })
    return () => { vivo = false }
  }, [nodo])
  if (err) return <p className="text-[11px] text-rose-600 pl-2">{err}</p>
  if (!hijos) return <p className="text-[11px] text-slate-400 pl-2">…</p>
  if (hijos.length === 0) return <p className="text-[11px] text-slate-400 pl-2 italic">sin elementos{nivelPadre ? ` bajo ${nivelPadre}` : ''}</p>
  return (
    <ul className="space-y-0.5">
      {hijos.map(h => <NodoUI key={h.code} n={h} onFraccion={onFraccion} seleccionada={seleccionada} />)}
    </ul>
  )
}

function NodoUI({ n, onFraccion, seleccionada }: { n: NodoArbol & { hoja: boolean }; onFraccion: (c: string) => void; seleccionada: string }) {
  const [abierto, setAbierto] = useState(false)
  const activa = n.hoja && n.code === seleccionada
  const codeFmt = n.nivel === 'fraccion' ? `${n.code.slice(0, 4)}.${n.code.slice(4, 6)}.${n.code.slice(6)}` : n.code
  return (
    <li>
      <button onClick={() => (n.hoja ? onFraccion(n.code) : setAbierto(a => !a))} title={n.label}
        className={`w-full text-left flex items-start gap-1.5 px-1.5 py-1 rounded-lg text-[11px] hover:bg-emerald-50/70 ${activa ? 'bg-emerald-100 text-emerald-900' : 'text-slate-700'}`}>
        {n.hoja ? <span className="w-3.5 shrink-0" /> : abierto ? <ChevronDown className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />}
        <span className="font-mono font-semibold shrink-0">{codeFmt}</span>
        <span className="truncate">{n.label}</span>
      </button>
      {abierto && !n.hoja && <div className="pl-4 border-l border-slate-100 ml-2"><Arbol nodo={n.code} onFraccion={onFraccion} seleccionada={seleccionada} nivelPadre={`${NIVEL_LABEL[n.nivel]} ${n.code}`} /></div>}
    </li>
  )
}

// ── Ficha ───────────────────────────────────────────────────────────────────

function Ficha({ ficha, onWatch }: { ficha: FichaFraccion; onWatch: () => void }) {
  const f = ficha.fraccion, b = ficha.bloques, v = ficha.versionCatalogo
  return (
    <>
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[24px] font-bold text-slate-900">{f.codeFormatted}{!f.active && <span className="ml-2 text-[11px] font-sans font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full align-middle">inactiva / retirada</span>}</p>
            <p className="text-[13px] text-slate-700 mt-1">{f.description}</p>
            <p className="text-[11px] text-slate-500 mt-1">Unidad: {f.unit ?? '—'}</p>
          </div>
          <button onClick={onWatch} className="w-9 h-9 rounded-lg bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center shrink-0" title="Monitorear cambios DOF"><Bell className="w-4 h-4 text-emerald-600" /></button>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
          <span className="font-medium text-slate-700">Catálogo:</span> {v.tigie} · DOF {v.fechaDOF} · vigente desde {v.vigencia} · último cotejo {v.fechaCotejo}
        </div>
        <ol className="mt-3 flex flex-wrap gap-1 text-[11px]">
          {b.arbol.datos.map((n, i) => (
            <li key={n.nivel} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
              <span className="text-slate-500">{NIVEL_LABEL[n.nivel]}</span> <span className="font-mono font-semibold text-slate-800">{n.code}</span>
              {n.nivel !== 'fraccion' && <span className="text-slate-600 max-w-[220px] truncate" title={n.label}>{n.label}</span>}
            </li>
          ))}
        </ol>
        {b.arbol.datos[1]?.notas && <details className="mt-2 text-[11px]"><summary className="cursor-pointer text-slate-600">Notas legales del capítulo {b.arbol.datos[1].code}</summary><pre className="whitespace-pre-wrap font-sans text-slate-600 mt-1 max-h-48 overflow-auto">{b.arbol.datos[1].notas}</pre></details>}
      </div>

      <Seccion titulo="NICOs" bloque={b.nicos} vacio="La tabla NICO no trae subdivisión cargada para esta fracción.">
        <div className="flex flex-wrap gap-2">{b.nicos.datos.map(n => <span key={n.nico} className="font-mono text-[13px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">{f.codeFormatted}.{n.nico}</span>)}</div>
      </Seccion>

      <Seccion titulo="Aranceles (IGI general y por tratado)" bloque={b.aranceles}>
        <Tabla cab={['Instrumento', 'Tasa', 'Vigencia', 'Nota']} filas={b.aranceles.datos.map(a => [a.etiqueta, a.tasa == null ? <Sin /> : <b className="font-mono">{a.tasa}{a.unidad === '%' ? '%' : ` ${a.unidad}`}</b>, a.vigente ? 'vigente' : 'no aplicable hoy', a.nota ?? ''])} />
      </Seccion>

      <Seccion titulo="PROSEC" bloque={b.prosec} vacio="Sin elegibilidad PROSEC cargada para esta fracción.">
        <Tabla cab={['Sector', 'Tasa PROSEC', 'Coincidencia', 'Vigencia', 'Decreto', 'Cotejo DOF']} filas={b.prosec.datos.map(p => [p.sector, <b className="font-mono">{p.tasa}%</b>, p.matchType, `${p.vigenteDesde}${p.vigenteHasta ? ` → ${p.vigenteHasta}` : ''}`, p.decree ?? '—', p.cotejado ? p.fechaCotejo! : <Pend texto="sin cotejar" />])} />
      </Seccion>

      <Seccion titulo="Regla 8va" bloque={b.regla8va} vacio="No consta en ningún mapeo de Regla 8va cargado.">
        <Tabla cab={['Rol', 'Producto terminado', 'Tasa', 'Condiciones', 'Desde']} filas={b.regla8va.datos.map(r => [r.rol === 'producto_terminado' ? 'Producto terminado' : 'Parte permitida', `${r.vehicleFraction} — ${r.vehicleDesc}`, <b className="font-mono">{r.preferentialRate}%</b>, r.conditions ?? '—', r.vigenteDesde])} />
      </Seccion>

      <Seccion titulo="Cuotas compensatorias" bloque={b.cuotasCompensatorias} vacio="Sin cuota compensatoria registrada para esta fracción (coincidencia exacta).">
        <Tabla cab={['País', 'Producto / exportador', 'Cuota', 'Resolución', 'Estado', 'DOF', 'Vigencia', 'Cotejo']} filas={b.cuotasCompensatorias.datos.map(c => [
          c.countryOfOrigin,
          <span>{c.productDesc ?? '—'}{c.specificProducer ? <span className="block text-slate-500">exportador: {c.specificProducer}</span> : null}{Array.isArray(c.exportadorTasas) && c.exportadorTasas.length > 0 ? <span className="block text-slate-500">{(c.exportadorTasas as { empresa?: string; tasa?: number; rateUnit?: string }[]).map((x, i) => <span key={i}>{x.empresa}: {x.tasa}{x.rateUnit ?? ''}; </span>)}</span> : null}{c.esAntielusion ? <span className="block text-amber-700">antielusión</span> : null}</span>,
          <b className="font-mono">{c.rate} {c.rateUnit}</b>,
          c.dofUrl ? <a href={c.dofUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">{c.resolutionNumber ?? 'DOF'}</a> : (c.resolutionNumber ?? '—'),
          c.status,
          c.publishDateDOF ?? <Sin />,
          `${c.effectiveDate ?? '?'} → ${c.expiryDate ?? (c.examenSunsetFecha ? `sunset ${c.examenSunsetFecha}` : 'sin fecha')}`,
          c.cotejadoAt ?? <Pend texto="pendiente de cotejo" />,
        ])} />
      </Seccion>

      <Seccion titulo="NOMs y excepciones (Anexo 2.4.1)" bloque={b.noms} vacio="Sin NOM asociada en fraction_regulations ni en el catálogo.">
        <div className="space-y-2">
          {b.noms.datos.map(n => (
            <div key={n.code} className="border border-slate-100 rounded-xl p-3 bg-white/50">
              <p className="text-[12px]"><b className="font-mono">{n.code}</b> · {n.authority} · {n.required ? 'obligatoria' : 'no obligatoria'} <span className="text-slate-400">({n.origenDato})</span></p>
              <p className="text-[11px] text-slate-600">{n.description}</p>
              {n.excepciones.length > 0 ? (
                <ul className="mt-1.5 text-[11px] text-slate-600 list-disc ml-4">{n.excepciones.map(e => <li key={e.exceptionCode + e.fraccionAnexo}><b>{e.exceptionCode} fr. {e.fraccionAnexo}</b>: {e.description}{e.requiredDoc ? ` — documento: ${e.requiredDoc}` : ''}{e.legalBasis ? ` (${e.legalBasis})` : ''}</li>)}</ul>
              ) : <p className="text-[11px] text-slate-400 italic mt-1">sin excepciones cargadas para esta NOM</p>}
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Permisos, RRNA y padrones" bloque={b.permisos} vacio="Sin permiso previo, RRNA ni padrón sectorial registrado.">
        <Tabla cab={['Tipo', 'Autoridad', 'Clave', 'Descripción', 'Obligatorio', 'Coincidencia']} filas={b.permisos.datos.map(p => [p.type, p.authority, p.code, p.description, p.required ? 'sí' : 'no', p.matchType])} />
      </Seccion>

      <Seccion titulo="Aduanas autorizadas (Anexo 21)" bloque={b.aduanasAnexo21} vacio="Sin dato cargado." />

      <Seccion titulo="Precios estimados (Art. 84-A LA)" bloque={b.preciosEstimados} vacio="Sin precio estimado registrado para esta fracción.">
        <Tabla cab={['Origen', 'Precio estimado', 'Publicación', 'Vigencia', 'Fuente / decreto']} filas={b.preciosEstimados.datos.map(p => [p.countryOfOrigin ?? 'cualquiera', <b className="font-mono">{p.estimatedValue} {p.unit}</b>, p.publishDate, `${p.effectiveDate} → ${p.expiryDate ?? 'sin fecha'}`, `${p.source}${p.decree ? ` — ${p.decree}` : ''}`])} />
      </Seccion>

      <Seccion titulo="Correlativas LIGIE 2020 ↔ 2022 ↔ 2025" bloque={b.correlativas} vacio="Correlativas: pendiente de carga.">
        <ul className="text-[12px] text-slate-700 list-disc ml-4">{b.correlativas.datos.map((c, i) => <li key={i}><b>{c.tipo}</b>: {c.nota}</li>)}</ul>
      </Seccion>
    </>
  )
}

function Seccion<T>({ titulo, bloque, vacio, children }: { titulo: string; bloque: Bloque<T>; vacio?: string; children?: ReactNode }) {
  const conDatos = bloque.estado === 'con_datos'
  return (
    <section className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[13px] font-semibold text-slate-900">{titulo}</h2>
        <div className="flex items-center gap-2 text-[10px]">
          {bloque.fechaDOF && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">DOF {bloque.fechaDOF}</span>}
          {bloque.fechaCotejo && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">cotejo {bloque.fechaCotejo}</span>}
          {bloque.estado === 'pendiente_de_carga' && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">pendiente de carga</span>}
          {bloque.estado === 'sin_dato' && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">sin dato cargado</span>}
        </div>
      </div>
      {conDatos ? children : <p className="text-[12px] text-slate-500 italic">{vacio ?? 'Sin dato cargado.'}</p>}
      {bloque.nota && conDatos && <p className="text-[11px] text-slate-500 mt-2">{bloque.nota}</p>}
      <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-2">Fuente: {bloque.fuente}</p>
    </section>
  )
}

function Tabla({ cab, filas }: { cab: string[]; filas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead><tr className="text-left border-b border-slate-100">{cab.map(c => <th key={c} className="py-1.5 pr-3 text-slate-500 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i} className="border-b border-slate-100/60 align-top">{f.map((c, j) => <td key={j} className="py-1.5 pr-3 text-slate-700">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
const Sin = () => <span className="text-slate-400 italic">sin dato</span>
const Pend = ({ texto }: { texto: string }) => <span className="text-amber-700">{texto}</span>
