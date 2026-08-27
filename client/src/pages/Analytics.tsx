/**
 * Analytics real (Ola 3): tres preguntas — ahorro, riesgo, equipo — por cliente
 * activo y periodo. Sin gráficas decorativas: tarjetas + tablas con el número,
 * la fórmula ("cómo se calculó") y el enlace al detalle. Los totales son los
 * mismos del Historial (mismo criterio de conteo en el servidor).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LineChart as LCIcon, Download, AlertCircle, Info } from 'lucide-react'
import { analyticsReal, descargarAnalyticsXlsx, type AnalyticsReal, type LineaAhorro } from '../lib/api/ola3'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
const PERIODOS = [30, 90, 180, 365]

export const GUIA_MODULO = {
  titulo: 'Analytics',
  pasos: [
    'Elige el periodo; el cliente activo (selector del shell) filtra todo.',
    'Ahorro: T-MEC no aplicado (origen US/CA/MX sin preferencia), PROSEC no usado y ahorro ya aplicado — cada cifra con su fórmula y el detalle línea por línea.',
    'Riesgo: fracciones sensibles que SÍ están en tus operaciones (cuota, NOM obligatoria, precio estimado, Anexo 10) y aduanas con reconocimiento alto según tus Pre-Glosas.',
    'Equipo: clasificaciones por usuario, % validado y tiempo medio por job.',
    'Los totales coinciden con el Historial. Exporta a Excel con el botón de arriba.',
  ],
}

const usd = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export function AnalyticsPage() {
  const [days, setDays] = useState(90)
  const [data, setData] = useState<AnalyticsReal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    let vivo = true
    setLoading(true); setError('')
    analyticsReal(days).then(r => { if (vivo) setData(r.data) }).catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'Error') }).finally(() => { if (vivo) setLoading(false) })
    const onCliente = () => analyticsReal(days).then(r => { if (vivo) setData(r.data) }).catch(() => undefined)
    window.addEventListener('aduanai:cliente', onCliente)
    return () => { vivo = false; window.removeEventListener('aduanai:cliente', onCliente) }
  }, [days])

  async function exportar() {
    setExportando(true)
    try { await descargarAnalyticsXlsx(days) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo exportar') }
    setExportando(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LCIcon className="w-5 h-5 text-emerald-500" />
            <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
            {data?.filtro.clienteId && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">cliente activo</span>}
          </div>
          <div className="flex items-center gap-2">
            <select value={days} onChange={e => setDays(Number(e.target.value))} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
              {PERIODOS.map(p => <option key={p} value={p}>últimos {p} días</option>)}
            </select>
            <button onClick={exportar} disabled={exportando || !data} className="flex items-center gap-1.5 text-[12px] bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"><Download className="w-3.5 h-3.5" />{exportando ? 'Exportando…' : 'Excel'}</button>
          </div>
        </div>
        {data && <p className="text-[11px] text-slate-500 mt-2">Periodo {data.filtro.desde.slice(0, 10)} → {data.filtro.hasta.slice(0, 10)} · cada cifra muestra cómo se calculó; nada se estima fuera de tus tablas.</p>}
      </div>

      {error && <div className={`${GLASS} rounded-2xl p-4 text-[12px] text-rose-700 flex items-center gap-2`}><AlertCircle className="w-4 h-4" />{error}</div>}
      {loading && !data && <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Calculando…</div>}

      {data && (
        <>
          {/* Totales que cuadran con el Historial */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta label="Clasificaciones (total)" valor={data.totales.clasificaciones.toLocaleString('es-MX')} formula={data.totales.formula} enlace={{ to: '/historial', texto: 'ver Historial' }} />
            <Tarjeta label="Cotizaciones (total)" valor={data.totales.cotizaciones.toLocaleString('es-MX')} formula={data.totales.formula} enlace={{ to: '/cotizador', texto: 'ir al Cotizador' }} />
            <Tarjeta label="Clasificaciones en periodo" valor={data.totales.clasificacionesPeriodo.toLocaleString('es-MX')} formula="count(Classification) con createdAt dentro del periodo" />
            <Tarjeta label="Cotizaciones en periodo" valor={data.totales.cotizacionesPeriodo.toLocaleString('es-MX')} formula="count(Quote) con createdAt dentro del periodo" />
          </div>

          {/* (a) Ahorro */}
          <h2 className="text-[13px] font-semibold text-slate-900 pt-2">¿Cuánto dinero está en juego?</h2>
          <div className="grid lg:grid-cols-3 gap-3">
            <Tarjeta label="T-MEC no aplicado" valor={usd(data.ahorro.tmecNoAplicado.totalUSD)} tono="amber" formula={data.ahorro.tmecNoAplicado.formula} nota={data.ahorro.tmecNoAplicado.sinTasa > 0 ? `${data.ahorro.tmecNoAplicado.sinTasa} partida(s) sin tasa en el catálogo no suman` : undefined} />
            <Tarjeta label="PROSEC no usado" valor={usd(data.ahorro.prosecNoUsado.totalUSD)} tono="amber" formula={data.ahorro.prosecNoUsado.formula} nota={data.ahorro.prosecNoUsado.nota} />
            <Tarjeta label="Ahorro aplicado" valor={usd(data.ahorro.aplicado.totalUSD)} tono="emerald" formula={data.ahorro.aplicado.formula} />
          </div>
          <Detalle titulo={`Detalle T-MEC no aplicado (${data.ahorro.tmecNoAplicado.lineas.length})`} lineas={data.ahorro.tmecNoAplicado.lineas} />
          <Detalle titulo={`Detalle PROSEC no usado (${data.ahorro.prosecNoUsado.lineas.length})`} lineas={data.ahorro.prosecNoUsado.lineas} extra={l => { const p = l as Partial<{ sector: string; cotejado: boolean }>; return p.sector ? `${p.sector}${p.cotejado ? '' : ' · sin cotejo DOF'}` : '' }} />
          <Detalle titulo={`Detalle ahorro aplicado (${data.ahorro.aplicado.lineas.length})`} lineas={data.ahorro.aplicado.lineas} />

          {/* (b) Riesgo */}
          <h2 className="text-[13px] font-semibold text-slate-900 pt-2">¿Dónde está mi riesgo?</h2>
          <Panel titulo={`Fracciones sensibles en mis operaciones (${data.riesgo.fraccionesSensibles.length})`} formula={data.riesgo.formula}>
            {data.riesgo.fraccionesSensibles.length === 0 ? <Vacio texto="Ninguna fracción del periodo cruza con cuotas, NOMs obligatorias, precios estimados ni Anexo 10." /> : (
              <Tabla cab={['Fracción', 'Apariciones', 'Valor USD', 'Cuota compensatoria', 'NOM obligatoria', 'Precio estimado', 'Anexo 10', '']}
                filas={data.riesgo.fraccionesSensibles.map(s => [
                  <b className="font-mono">{s.fractionCode}</b>, s.apariciones, usd(s.valorUSD),
                  s.cuotaCompensatoria.count > 0 ? `${s.cuotaCompensatoria.count} (${s.cuotaCompensatoria.paises.join(', ')})` : '—',
                  s.nomObligatoria.length ? s.nomObligatoria.join(', ') : '—', s.precioEstimado ? 'sí' : '—', s.anexo10 ?? '—',
                  <Link to={`/fracciones?code=${s.fractionCode}`} className="text-emerald-700 hover:underline">ficha</Link>,
                ])} />
            )}
          </Panel>
          <div className="grid lg:grid-cols-2 gap-3">
            <Panel titulo="Aduanas según mis Pre-Glosas" formula={data.riesgo.formulaAduanas}>
              {data.riesgo.aduanas.length === 0 ? <Vacio texto="Sin simulaciones de Pre-Glosa en el periodo." enlace={{ to: '/simulador-glosa', texto: 'abrir Pre-Glosa' }} /> : (
                <Tabla cab={['Aduana', 'Simulaciones', 'RA promedio', 'Riesgo promedio', 'Nivel alto']} filas={data.riesgo.aduanas.map(a => [<b className="font-mono">{a.customsCode}</b>, a.simulaciones, `${a.raPromedio}%`, a.riesgoPromedio, a.nivelAlto])} />
              )}
            </Panel>
            <Panel titulo="Risk Scorer" formula="Evaluaciones del periodo agrupadas por banda; exposición promedio 0-100">
              {data.riesgo.riskScorer.evaluaciones === 0 ? <Vacio texto="Sin evaluaciones de Risk Scorer en el periodo." enlace={{ to: '/risk-scorer', texto: 'abrir Risk Scorer' }} /> : (
                <div className="text-[12px] text-slate-700 space-y-1">
                  <p>{data.riesgo.riskScorer.evaluaciones} evaluaciones · exposición promedio <b className="font-mono">{data.riesgo.riskScorer.exposicionPromedio}</b></p>
                  <div className="flex flex-wrap gap-2">{Object.entries(data.riesgo.riskScorer.bandas).map(([b, n]) => <span key={b} className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px]">{b}: {n}</span>)}</div>
                </div>
              )}
            </Panel>
          </div>

          {/* (c) Equipo */}
          <h2 className="text-[13px] font-semibold text-slate-900 pt-2">¿Cómo va el equipo?</h2>
          <Panel titulo="Por usuario" formula={data.equipo.formula}>
            {data.equipo.porUsuario.length === 0 ? <Vacio texto="Sin clasificaciones en el periodo." enlace={{ to: '/clasificador', texto: 'clasificar' }} /> : (
              <Tabla cab={['Usuario', 'Clasificaciones', 'Validadas', '% validado', '% correcto', 'Tiempo medio (s)', 'Jobs']}
                filas={data.equipo.porUsuario.map(u => [<span>{u.nombre}<span className="block text-slate-400">{u.email}</span></span>, u.clasificaciones, u.validadas, u.pctValidado == null ? '—' : `${u.pctValidado}%`, u.pctCorrecto == null ? '—' : `${u.pctCorrecto}%`, u.tiempoMedioSeg == null ? '—' : u.tiempoMedioSeg, u.jobs])} />
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function Tarjeta({ label, valor, formula, tono, nota, enlace }: { label: string; valor: string; formula: string; tono?: 'amber' | 'emerald'; nota?: string; enlace?: { to: string; texto: string } }) {
  const color = tono === 'amber' ? 'text-amber-700' : tono === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[20px] font-bold font-mono ${color}`}>{valor}</p>
      <p className="text-[10px] text-slate-500 mt-1 flex items-start gap-1"><Info className="w-3 h-3 shrink-0 mt-0.5" /><span>Cómo se calculó: {formula}</span></p>
      {nota && <p className="text-[10px] text-amber-700 mt-1">{nota}</p>}
      {enlace && <Link to={enlace.to} className="text-[11px] text-emerald-700 hover:underline mt-1 inline-block">{enlace.texto} →</Link>}
    </div>
  )
}

function Panel({ titulo, formula, children }: { titulo: string; formula: string; children: ReactNode }) {
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[13px] font-semibold text-slate-900">{titulo}</p>
      <p className="text-[10px] text-slate-500 mb-3">Cómo se calculó: {formula}</p>
      {children}
    </div>
  )
}

function Detalle({ titulo, lineas, extra }: { titulo: string; lineas: LineaAhorro[]; extra?: (l: LineaAhorro) => string }) {
  const [abierto, setAbierto] = useState(false)
  if (lineas.length === 0) return null
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <button onClick={() => setAbierto(a => !a)} className="text-[12px] font-medium text-slate-800 hover:underline">{abierto ? '▾' : '▸'} {titulo}</button>
      {abierto && (
        <div className="mt-3">
          <Tabla cab={['Origen', 'Fecha', 'Fracción', 'País', 'Valor USD', 'Tasa aplicada', 'General', 'Preferencial', 'Ahorro USD', 'Detalle', '']}
            filas={lineas.map(l => [l.origen, l.fecha.slice(0, 10), <b className="font-mono">{l.fractionCode}</b>, l.pais, usd(l.valorUSD), l.tasaAplicada == null ? '—' : `${l.tasaAplicada}%`, l.tasaGeneral == null ? '—' : `${l.tasaGeneral}%`, l.tasaPreferencial == null ? '—' : `${l.tasaPreferencial}%`, <b>{usd(l.ahorroUSD)}</b>, `${l.detalle}${extra ? ` ${extra(l)}` : ''}`,
              <Link to={l.origen === 'clasificacion' ? `/defensa?tipo=classification&id=${l.id}` : `/defensa?tipo=quote&id=${l.id}`} className="text-emerald-700 hover:underline">ver</Link>])} />
        </div>
      )}
    </div>
  )
}

function Tabla({ cab, filas }: { cab: string[]; filas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead><tr className="text-left border-b border-slate-100">{cab.map((c, i) => <th key={i} className="py-1.5 pr-3 text-slate-500 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i} className="border-b border-slate-100/60 align-top">{f.map((c, j) => <td key={j} className="py-1.5 pr-3 text-slate-700">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Vacio({ texto, enlace }: { texto: string; enlace?: { to: string; texto: string } }) {
  return <p className="text-[12px] text-slate-500 italic">{texto}{enlace && <> <Link to={enlace.to} className="not-italic text-emerald-700 hover:underline">{enlace.texto} →</Link></>}</p>
}
