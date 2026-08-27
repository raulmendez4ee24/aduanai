/**
 * Reporte Anexo 24 en formato de autoridad: JSON del servidor pintado como
 * documento imprimible (print CSS + folio, patrón de Pre-Glosa) y descarga
 * .xlsx. La etiqueta "estructura pendiente de cotejo contra Anexo 24 vigente"
 * es parte del documento, no un footer.
 */
import { useState } from 'react'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { anexo24Api, descargarReporteXlsx, type ReporteAnexo24 } from '../../lib/api/anexo24'
import { Badge, Button, Input } from '../ui'
import { Aviso, fmtFecha, fmtNum, fmtUSD, mensajeDe, periodoAnterior, TIPO_DESCARGO_LABEL } from './comunes'

export function ReporteAnexo24Tab() {
  const [form, setForm] = useState({ periodo: periodoAnterior() })
  const [rep, setRep] = useState<ReporteAnexo24 | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [bajando, setBajando] = useState(false)

  async function generar() {
    setCargando(true); setError('')
    try { setRep((await anexo24Api.reporte(form.periodo)).data) } catch (e) { setError(mensajeDe(e)); setRep(null) } finally { setCargando(false) }
  }
  async function excel() {
    setBajando(true); setError('')
    try { await descargarReporteXlsx(form.periodo) } catch (e) { setError(mensajeDe(e)) } finally { setBajando(false) }
  }

  return (
    <div className="space-y-4 font-sello-ui">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Input label="Periodo (YYYY-MM)" mono value={form.periodo} onChange={e => setForm({ periodo: e.target.value })} className="w-44" />
        <Button onClick={generar} loading={cargando}>Generar reporte</Button>
        <Button variante="secundario" onClick={excel} loading={bajando}><FileSpreadsheet className="w-4 h-4" aria-hidden /> Descargar Excel</Button>
        {rep && <Button variante="secundario" onClick={() => window.print()}><Printer className="w-4 h-4" aria-hidden /> Imprimir / PDF</Button>}
      </div>
      {error && <Aviso tono="carmin">{error}</Aviso>}
      {!rep && !error && <p className="text-sm text-tinta-suave">Elige un periodo y genera el reporte. Las secciones siguen la estructura del Anexo 24 (entradas, salidas, saldos, activo fijo, mermas, submaquila).</p>}
      {rep && <Documento r={rep} />}
    </div>
  )
}

function Seccion({ titulo, children, vacio, n }: { titulo: string; children?: React.ReactNode; vacio: string; n: number }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h3 className="font-sello-display text-lg text-tinta border-b border-linea pb-1 mb-2">{titulo}</h3>
      {n === 0 ? <p className="text-sm text-tinta-suave">{vacio}</p> : children}
    </section>
  )
}

const th = 'text-left text-13 uppercase tracking-wide text-tinta-suave px-2 py-1 border-b border-linea'
const thR = `${th} text-right`
const td = 'px-2 py-1 border-b border-linea text-sm text-tinta align-top'
const tdM = `${td} font-sello-mono`
const tdR = `${tdM} text-right`

function Documento({ r }: { r: ReporteAnexo24 }) {
  const pie = `${r.folio} · generado ${fmtFecha(r.generadoEn)} · hash ${r.hash.slice(0, 16)}… · ${r.cotejo.etiqueta}`
  return (
    <>
      <article className="doc-imprimible">
        <div className="doc-hoja bg-superficie border border-linea rounded-sello p-8 sm:p-10 text-tinta">
          <header className="flex flex-wrap justify-between gap-4 border-b border-linea pb-4">
            <div>
              <p className="text-13 uppercase tracking-wide text-tinta-suave">Sistema de control de inventarios IMMEX</p>
              <h2 className="font-sello-display text-28 tracking-tight">Reporte Anexo 24 · {r.periodo}</h2>
              <p className="text-sm text-tinta-suave mt-1">Periodo {fmtFecha(r.rango.inicio)} a {fmtFecha(r.rango.fin)}</p>
            </div>
            <dl className="text-sm space-y-0.5">
              <div><dt className="inline text-tinta-suave">Folio: </dt><dd className="inline font-sello-mono">{r.folio}</dd></div>
              <div><dt className="inline text-tinta-suave">Generado: </dt><dd className="inline font-sello-mono">{fmtFecha(r.generadoEn)}</dd></div>
              <div><dt className="inline text-tinta-suave">Cierre del periodo: </dt><dd className="inline font-sello-mono">{r.cierre ? `sellado ${fmtFecha(r.cierre.cerradoAt)} · ${r.cierre.hash?.slice(0, 12)}…` : 'periodo abierto'}</dd></div>
              <div><dt className="inline text-tinta-suave">Hash del contenido: </dt><dd className="inline font-sello-mono">{r.hash.slice(0, 16)}…</dd></div>
            </dl>
          </header>
          <div className="mt-3"><Aviso>{r.cotejo.etiqueta} Fuente en el sistema: {r.cotejo.fuenteRepo}.</Aviso></div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-sm">
            {[['Entradas', r.totales.entradas], ['Salidas', r.totales.salidas], ['Partes con saldo', r.totales.partesConSaldo], ['Saldo total', r.totales.saldoTotal], ['Activo fijo (lotes)', r.totales.activoFijo], ['Merma total', r.totales.mermaTotal], ['Lotes en submaquila', r.totales.submaquilaLotes]].map(([l, v]) => (
              <div key={String(l)} className="border border-linea rounded-sello px-3 py-2"><p className="text-13 text-tinta-suave">{l}</p><p className="font-sello-mono text-lg">{fmtNum(Number(v))}</p></div>
            ))}
          </div>

          <Seccion titulo="I. Entradas — importaciones temporales por pedimento y partida" n={r.entradas.length} vacio="Sin entradas en el periodo.">
            <table className="w-full"><thead><tr><th className={th}>Pedimento</th><th className={th}>Partida</th><th className={th}>Clave</th><th className={th}>Fracción</th><th className={th}>Parte</th><th className={th}>Descripción</th><th className={thR}>Cantidad</th><th className={thR}>Valor</th><th className={th}>Entrada</th><th className={th}>Vence</th></tr></thead>
              <tbody>{r.entradas.map(e => <tr key={e.temporaryImportId}><td className={tdM}>{e.pedimento}</td><td className={tdR}>{e.numeroPartida ?? '—'}</td><td className={tdM}>{e.clave ?? '—'}</td><td className={tdM}>{e.fractionCode}</td><td className={tdM}>{e.parteCodigo ?? '—'}</td><td className={td}>{e.descripcion}</td><td className={tdR}>{fmtNum(e.cantidad)} {e.unit}</td><td className={tdR}>{fmtUSD(e.valorUSD)}</td><td className={tdM}>{fmtFecha(e.fechaEntrada)}</td><td className={tdM}>{e.vencimiento ? fmtFecha(e.vencimiento) : 'vigencia del programa'}</td></tr>)}</tbody></table>
          </Seccion>

          <Seccion titulo="II. Salidas — retornos, transferencias y cambios de régimen" n={r.salidas.length} vacio="Sin salidas en el periodo.">
            <table className="w-full"><thead><tr><th className={th}>Fecha</th><th className={th}>Tipo</th><th className={th}>Pedimento retorno</th><th className={th}>Constancia</th><th className={th}>Pedimento origen</th><th className={th}>Fracción</th><th className={th}>Parte</th><th className={thR}>Cantidad</th></tr></thead>
              <tbody>{r.salidas.map(s => <tr key={s.dischargeId}><td className={tdM}>{fmtFecha(s.fecha)}</td><td className={td}>{TIPO_DESCARGO_LABEL[s.tipo] ?? s.tipo}</td><td className={tdM}>{s.pedimentoRetorno ?? '—'}</td><td className={tdM}>{s.constanciaTransferencia ?? '—'}</td><td className={tdM}>{s.pedimentoOrigen}</td><td className={tdM}>{s.fractionCode}</td><td className={tdM}>{s.parteCodigo ?? '—'}</td><td className={tdR}>{fmtNum(s.cantidad)} {s.unit}</td></tr>)}</tbody></table>
          </Seccion>

          <Seccion titulo="III. Saldos por número de parte al cierre del periodo" n={r.saldos.length} vacio="Sin saldos al corte.">
            <table className="w-full"><thead><tr><th className={th}>Parte</th><th className={th}>Fracción</th><th className={th}>Descripción</th><th className={th}>Tipo</th><th className={thR}>Importado</th><th className={thR}>Descargado</th><th className={thR}>Saldo</th><th className={thR}>Lotes</th></tr></thead>
              <tbody>{r.saldos.map((p, i) => <tr key={i}><td className={tdM}>{p.parteCodigo ?? '—'}</td><td className={tdM}>{p.fractionCode}</td><td className={td}>{p.descripcion}</td><td className={td}>{p.tipo === 'ACTIVO_FIJO' ? 'Activo fijo' : 'Insumo'}</td><td className={tdR}>{fmtNum(p.importado)}</td><td className={tdR}>{fmtNum(p.descargado)}</td><td className={tdR}>{fmtNum(p.saldo)} {p.unit}</td><td className={tdR}>{p.lotes}</td></tr>)}</tbody></table>
          </Seccion>

          <Seccion titulo="IV. Activo fijo (permanencia por la vigencia del programa)" n={r.activoFijo.length} vacio="Sin activo fijo registrado.">
            <table className="w-full"><thead><tr><th className={th}>Pedimento</th><th className={th}>Fracción</th><th className={th}>Parte</th><th className={th}>Descripción</th><th className={thR}>Cantidad</th><th className={thR}>Valor</th><th className={th}>Entrada</th><th className={thR}>Vida útil</th><th className={th}>Ubicación</th></tr></thead>
              <tbody>{r.activoFijo.map(a => <tr key={a.temporaryImportId}><td className={tdM}>{a.pedimento}</td><td className={tdM}>{a.fractionCode}</td><td className={tdM}>{a.parteCodigo ?? '—'}</td><td className={td}>{a.descripcion}</td><td className={tdR}>{fmtNum(a.cantidad)} {a.unit}</td><td className={tdR}>{fmtUSD(a.valorUSD)}</td><td className={tdM}>{fmtFecha(a.fechaEntrada)}</td><td className={tdR}>{a.vidaUtilMeses != null ? `${a.vidaUtilMeses} m` : '—'}</td><td className={td}>{a.ubicacion ?? 'planta'}</td></tr>)}</tbody></table>
          </Seccion>

          <Seccion titulo="V. Mermas y desperdicios" n={r.mermas.length + r.desperdicios.length} vacio="Sin mermas ni desperdicios en el periodo.">
            <table className="w-full"><thead><tr><th className={th}>Origen</th><th className={th}>Fecha</th><th className={th}>Producto / lote</th><th className={th}>Componente / fracción</th><th className={thR}>Neto</th><th className={thR}>Con merma</th><th className={thR}>Merma</th></tr></thead>
              <tbody>
                {r.mermas.map((m, i) => <tr key={`m${i}`}><td className={td}>Merma BOM</td><td className={tdM}>{fmtFecha(m.fecha)}</td><td className={tdM}>{m.productoTerminado} × {fmtNum(m.cantidadTerminado)}</td><td className={tdM}>{m.componentCode}{m.fractionCode ? ` · ${m.fractionCode}` : ''}</td><td className={tdR}>{fmtNum(m.quantityRequired)}</td><td className={tdR}>{fmtNum(m.quantityWithScrap)}</td><td className={tdR}>{fmtNum(m.merma)} {m.unit}</td></tr>)}
                {r.desperdicios.map(d => <tr key={d.dischargeId}><td className={td}>{TIPO_DESCARGO_LABEL[d.tipo] ?? d.tipo}</td><td className={tdM}>{fmtFecha(d.fecha)}</td><td className={tdM}>{d.pedimentoOrigen}</td><td className={tdM}>{d.fractionCode}</td><td className={tdR}>—</td><td className={tdR}>—</td><td className={tdR}>{fmtNum(d.cantidad)} {d.unit}</td></tr>)}
              </tbody></table>
          </Seccion>

          <Seccion titulo="VI. Submaquila" n={r.submaquila.length} vacio="Sin submaquilas registradas.">
            {r.submaquila.map(u => (
              <div key={u.ubicacionId} className="mb-3">
                <p className="text-sm text-tinta"><strong>{u.nombre}</strong>{u.rfcTercero ? <span className="font-sello-mono"> · {u.rfcTercero}</span> : ''} · aviso SE: {u.avisoSubmaquila ? <span className="font-sello-mono">{u.avisoSubmaquila}</span> : <Badge tono="ambar">sin aviso</Badge>}</p>
                {u.lotes.length === 0 ? <p className="text-sm text-tinta-suave">Sin lotes activos.</p> : (
                  <table className="w-full mt-1"><thead><tr><th className={th}>Pedimento</th><th className={th}>Fracción</th><th className={th}>Parte</th><th className={thR}>Saldo</th></tr></thead>
                    <tbody>{u.lotes.map(l => <tr key={l.temporaryImportId}><td className={tdM}>{l.pedimento}</td><td className={tdM}>{l.fractionCode}</td><td className={tdM}>{l.parteCodigo ?? '—'}</td><td className={tdR}>{fmtNum(l.saldo)} {l.unit}</td></tr>)}</tbody></table>
                )}
              </div>
            ))}
          </Seccion>
        </div>
      </article>
      <div className="doc-pie font-sello-mono text-13 text-tinta-suave mt-2">{pie}</div>
    </>
  )
}
