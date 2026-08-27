/**
 * Cotización imprimible — /cotizador/:id/imprimir (Ola 2, Operación 2026-08).
 *
 * PDF = vista imprimible con print CSS + folio (patrón de Pre-Glosa, sin
 * librerías): encabezado de la agencia (nombre + RFC del tenant; no existe
 * campo de logo en Tenant), folio Q-año-seq, vigencia, desglose por partida,
 * totales, honorarios, fecha exacta del DOF del TC aplicado (o "TC manual"),
 * cuadro comparativo de escenarios guardados y avisos de cotejo.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Printer, FileSpreadsheet, ArrowLeft } from 'lucide-react'
import { Button } from '../components/ui'
import { formatFraction } from '../lib/format'
import { cotizadorApi, type CotizacionCompleta, type ItemOla2 } from '../lib/api/cotizador'

function mxn(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) } catch { return iso }
}
function fechaHora(d: Date): string {
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function CotizacionImprimirPage() {
  const { id } = useParams<{ id: string }>()
  const [c, setC] = useState<CotizacionCompleta | null>(null)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    if (!id) return
    cotizadorApi.obtener(id).then(r => setC(r.data)).catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar la cotización'))
  }, [id])

  if (error) return <div className="max-w-[960px] mx-auto p-6 text-carmin text-sm">{error} · <Link className="underline" to="/cotizador">Volver al cotizador</Link></div>
  if (!c) return <div className="max-w-[960px] mx-auto p-6 text-sm text-tinta-suave">Cargando cotización…</div>

  const r = c.result
  const items = (r?.items ?? []) as (NonNullable<typeof r>['items'][number] & ItemOla2)[]
  const generadoEn = new Date()
  const tcManual = !c.tcFechaDOF
  const tcTexto = tcManual
    ? `TC manual ${c.exchangeRate?.toFixed(4) ?? '—'} MXN/USD — capturado por el usuario; sin fecha DOF. Verifica el TC publicado antes de pagar contribuciones.`
    : `TC ${c.exchangeRate?.toFixed(4)} MXN/USD publicado el ${fecha(c.tcFechaDOF)} (fuente: ${r?.exchangeRateSource ?? 'Banxico/DOF'}${r?.exchangeRateIsOfficial === false ? ' — dato de respaldo, no oficial' : ''}).`
  const pieTexto = `${c.folio} · v${c.version} · ${c.agencia.nombre} · Vigencia ${c.vigenciaHasta ? `hasta ${fecha(c.vigenciaHasta)}` : 'no indicada'} · ${tcManual ? 'TC manual' : `TC DOF ${fecha(c.tcFechaDOF)}`} · Generado por ADUANAI ${fechaHora(generadoEn)}`
  const dta = r?.dta
  const hon = r?.honorarios
  const avisos = [
    ...(dta?.aviso ? [dta.aviso] : []),
    ...items.flatMap(it => (it.programs?.ieps?.applies && it.programs.ieps.cotejo !== 'verificado' ? [`Partida ${it.numeroPartida}: ${it.programs.ieps.nota ?? 'IEPS sin cotejo'}`] : [])),
    ...items.flatMap(it => (it.antidumping?.esAntielusion ? [`Partida ${it.numeroPartida}: la cuota ${it.antidumping.resolutionNumber ?? ''} es una medida ANTIELUSIÓN — aplica aunque haya triangulación.`] : [])),
  ]

  return (
    <div>
      <div className="max-w-[960px] mx-auto mb-4 flex items-center gap-2 flex-wrap no-print">
        <Button variante="primario" onClick={() => window.print()}><Printer className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Descargar PDF</Button>
        <Button variante="secundario" loading={exportando} onClick={async () => { setExportando(true); try { await cotizadorApi.descargarExcel(c.id, c.folio) } catch (e) { setError(e instanceof Error ? e.message : 'Error') } setExportando(false) }}>
          <FileSpreadsheet className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Exportar Excel
        </Button>
        <Link to={`/cotizador?abrir=${c.id}`} className="inline-flex items-center gap-1 text-sm text-tinta underline ml-2"><ArrowLeft className="w-4 h-4" aria-hidden /> Volver al cotizador</Link>
        {!c.vigente && <span className="text-sm text-carmin ml-auto">Cotización vencida ({fecha(c.vigenciaHasta)})</span>}
      </div>

      <article className="doc-imprimible max-w-[960px] mx-auto">
        <div className="doc-hoja bg-superficie border border-linea rounded-sello p-8 sm:p-12 text-tinta">
          <header className="doc-evitar-corte">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-sello-display text-lg text-tinta">{c.agencia.nombre}</p>
                {c.agencia.rfc && <p className="text-sm font-sello-mono text-tinta-suave">RFC {c.agencia.rfc}</p>}
                <h1 className="font-sello-display text-28 text-tinta mt-3">Cotización de importación</h1>
                {c.name && <p className="text-base text-tinta mt-1">{c.name}</p>}
              </div>
              <dl className="text-13 font-sello-ui text-right space-y-0.5">
                <div><dt className="inline text-tinta-suave">Folio: </dt><dd className="inline font-sello-mono text-tinta">{c.folio}</dd></div>
                <div><dt className="inline text-tinta-suave">Versión: </dt><dd className="inline font-sello-mono text-tinta">{c.version}{c.parentQuoteId ? ' (derivada)' : ''}</dd></div>
                <div><dt className="inline text-tinta-suave">Fecha: </dt><dd className="inline font-sello-mono text-tinta">{fecha(c.createdAt)}</dd></div>
                <div><dt className="inline text-tinta-suave">Vigencia: </dt><dd className={`inline font-sello-mono ${c.vigente ? 'text-tinta' : 'text-carmin'}`}>{c.vigenciaHasta ? `hasta ${fecha(c.vigenciaHasta)}` : 'no indicada'}</dd></div>
                <div><dt className="inline text-tinta-suave">Estado: </dt><dd className="inline font-sello-mono text-tinta">{c.status === 'approved' ? 'aprobada' : c.status === 'pending_approval' ? 'pendiente de aprobación' : c.status}</dd></div>
              </dl>
            </div>
            <div className="mt-4 pt-4 border-t border-linea grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-tinta-suave">Cliente</p><p className="text-tinta">{c.cliente?.razonSocial ?? c.client ?? '—'}</p>{c.cliente?.rfc && <p className="font-sello-mono text-tinta-suave text-13">RFC {c.cliente.rfc}</p>}</div>
              <div><p className="text-tinta-suave">Incoterm / moneda</p><p className="text-tinta">{c.incoterm} · {c.currency}</p></div>
              <div><p className="text-tinta-suave">Destino</p><p className="text-tinta">{c.destination ?? '—'}</p></div>
              <div><p className="text-tinta-suave">Tipo de operación (DTA)</p><p className="text-tinta">{dta?.etiqueta ?? 'Importación definitiva (general)'}</p></div>
            </div>
            <p className="mt-3 text-13 text-tinta border border-linea rounded-sello px-3 py-2 bg-papel-2">
              <span className="font-semibold">Tipo de cambio aplicado: </span>{tcTexto}
            </p>
          </header>

          {/* Partidas */}
          <section className="mt-6">
            <h2 className="font-sello-display text-lg text-tinta mb-2">Desglose por partida ({items.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-13 border-collapse">
                <thead>
                  <tr className="border-b border-tinta text-left">
                    <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Fracción</th><th className="py-1 pr-2">Descripción</th><th className="py-1 pr-2">Origen</th>
                    <th className="py-1 pr-2 text-right">Cant.</th><th className="py-1 pr-2 text-right">Valor aduana MXN</th><th className="py-1 pr-2 text-right">IGI</th><th className="py-1 pr-2 text-right">DTA</th>
                    <th className="py-1 pr-2 text-right">IEPS</th><th className="py-1 pr-2 text-right">Cuota comp.</th><th className="py-1 pr-2 text-right">IVA</th><th className="py-1 text-right">Total partida</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.numeroPartida} className="border-b border-linea align-top">
                      <td className="py-1 pr-2 font-sello-mono">{it.numeroPartida}</td>
                      <td className="py-1 pr-2 font-sello-mono">{formatFraction(it.fractionCode)}</td>
                      <td className="py-1 pr-2">{it.description ?? '—'}{it.exportador ? <span className="block text-tinta-suave">Exportador: {it.exportador}</span> : null}</td>
                      <td className="py-1 pr-2">{it.countryOfOrigin}{it.treaty?.applied ? <span className="block text-tinta-suave">{it.treaty.applied} {it.treaty.appliedRate}%</span> : null}</td>
                      <td className="py-1 pr-2 text-right font-sello-mono">{it.quantity} {it.unit ?? ''}</td>
                      <td className="py-1 pr-2 text-right font-sello-mono">{mxn(it.customsValueMXN)}</td>
                      <td className="py-1 pr-2 text-right font-sello-mono">{mxn(it.igi)}<span className="block text-tinta-suave">{it.igiRate}%</span></td>
                      <td className="py-1 pr-2 text-right font-sello-mono">{mxn(it.dta)}<span className="block text-tinta-suave">{it.dtaRate > 0 ? `${it.dtaRate}%` : 'cuota fija'}</span></td>
                      <td className="py-1 pr-2 text-right font-sello-mono">{it.ieps > 0 ? mxn(it.ieps) : '—'}{it.programs?.ieps?.applies ? <span className="block text-tinta-suave">{it.programs.ieps.rate}{it.programs.ieps.rateType === 'specific' ? ' esp.' : '%'}</span> : null}</td>
                      <td className="py-1 pr-2 text-right font-sello-mono">{it.countervailing > 0 ? mxn(it.countervailing) : '—'}{it.antidumping ? <span className="block text-tinta-suave">{it.antidumping.resolutionNumber ?? 's/n'} · {it.antidumping.rate} {it.antidumping.rateUnit}{it.antidumping.origenTasa === 'exportador' ? ` (${it.antidumping.empresa})` : ''}</span> : null}</td>
                      <td className="py-1 pr-2 text-right font-sello-mono">{mxn(it.iva)}</td>
                      <td className="py-1 text-right font-sello-mono font-semibold">{mxn(it.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {items.some(it => it.antidumping) && (
              <ul className="mt-2 text-13 text-tinta space-y-1">
                {items.filter(it => it.antidumping).map(it => (
                  <li key={`ad-${it.numeroPartida}`}>Partida {it.numeroPartida}: cuota compensatoria {it.antidumping!.resolutionNumber ?? 's/n'} ({it.antidumping!.resolutionType ?? 'definitiva'}) — {it.antidumping!.vigencia ?? `vigente desde ${fecha(it.antidumping!.effectiveDate)}`}{it.antidumping!.esAntielusion ? ' — MEDIDA ANTIELUSIÓN' : ''}.</li>
                ))}
              </ul>
            )}
            {items[0]?.dtaNota && <p className="mt-2 text-13 text-tinta-suave">{items[0].dtaNota}</p>}
          </section>

          {/* Totales + honorarios */}
          <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6 doc-evitar-corte">
            <div>
              <h2 className="font-sello-display text-lg text-tinta mb-2">Contribuciones</h2>
              <dl className="text-13 space-y-1">
                {[
                  ['Valor en aduana', r?.totals?.valueMXN], ['IGI', r?.totals?.igi], ['DTA', r?.totals?.dta], ['IEPS', r?.totals?.ieps],
                  ['Cuotas compensatorias', r?.totals?.countervailing], ['IVA', r?.totals?.iva], ['ISAN', r?.totals?.isan],
                ].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between"><dt className="text-tinta-suave">{l as string}</dt><dd className="font-sello-mono">{mxn(v as number)}</dd></div>
                ))}
                <div className="flex justify-between border-t border-tinta pt-1 font-semibold"><dt>Total contribuciones</dt><dd className="font-sello-mono">{mxn(r?.totals?.totalDuties)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Landed cost (valor + contribuciones)</dt><dd className="font-sello-mono">{mxn(c.totalLandedCost)}</dd></div>
              </dl>
            </div>
            <div>
              <h2 className="font-sello-display text-lg text-tinta mb-2">Servicios de despacho</h2>
              <dl className="text-13 space-y-1">
                <div className="flex justify-between"><dt className="text-tinta-suave">Honorarios de la agencia{hon?.origen === 'tabulador' && hon.tabuladorNombre ? ` (tabulador ${hon.tabuladorNombre})` : ''}</dt><dd className="font-sello-mono">{mxn(r?.dispatch?.honorariosAgente)}</dd></div>
                {hon?.detalle && <p className="text-tinta-suave text-13">{hon.detalle}</p>}
                {[['Prevalidación', r?.dispatch?.prevalidacion], ['Almacenaje', r?.dispatch?.almacenaje], ['Estiba', r?.dispatch?.estiba], ['Flete interno', r?.dispatch?.fleteInterno]].filter(([, v]) => (v as number) > 0).map(([l, v]) => (
                  <div key={l as string} className="flex justify-between"><dt className="text-tinta-suave">{l as string}</dt><dd className="font-sello-mono">{mxn(v as number)}</dd></div>
                ))}
                {(r?.dispatch?.otrosGastos ?? []).map(g => <div key={g.label} className="flex justify-between"><dt className="text-tinta-suave">{g.label}</dt><dd className="font-sello-mono">{mxn(g.amount)}</dd></div>)}
                <div className="flex justify-between border-t border-tinta pt-1 font-semibold"><dt>Total despacho</dt><dd className="font-sello-mono">{mxn(c.totalDispatch)}</dd></div>
              </dl>
              <p className="mt-4 text-lg font-sello-display flex justify-between border-t-2 border-tinta pt-2"><span>TOTAL</span><span className="font-sello-mono">${mxn(c.totalAll)} MXN</span></p>
            </div>
          </section>

          {/* Escenarios */}
          {c.escenarios && c.escenarios.escenarios.length > 0 && (
            <section className="mt-6 doc-evitar-corte">
              <h2 className="font-sello-display text-lg text-tinta mb-2">Cuadro comparativo de escenarios</h2>
              <table className="w-full text-13 border-collapse">
                <thead><tr className="border-b border-tinta text-left"><th className="py-1 pr-2">Escenario</th><th className="py-1 pr-2 text-right">IGI</th><th className="py-1 pr-2 text-right">DTA</th><th className="py-1 pr-2 text-right">Cuota comp.</th><th className="py-1 pr-2 text-right">IVA</th><th className="py-1 pr-2 text-right">Total MXN</th><th className="py-1 text-right">Δ vs base</th></tr></thead>
                <tbody>
                  <tr className="border-b border-linea font-semibold"><td className="py-1 pr-2">Base (esta cotización)</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(c.escenarios.base.igi)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(c.escenarios.base.dta)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(c.escenarios.base.countervailing)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(c.escenarios.base.iva)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(c.escenarios.base.totalAll)}</td><td className="py-1 text-right">—</td></tr>
                  {c.escenarios.escenarios.map(s => (
                    <tr key={s.name} className="border-b border-linea"><td className="py-1 pr-2">{s.name}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(s.igi)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(s.dta)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(s.countervailing)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(s.iva)}</td><td className="py-1 pr-2 text-right font-sello-mono">{mxn(s.totalAll)}</td><td className={`py-1 text-right font-sello-mono ${s.deltaMXN > 0 ? 'text-carmin' : 'text-sello'}`}>{s.deltaMXN > 0 ? '+' : ''}{mxn(s.deltaMXN)} ({s.deltaPct > 0 ? '+' : ''}{s.deltaPct}%)</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="text-13 text-tinta-suave mt-1">Calculado el {fechaHora(new Date(c.escenarios.calculadoEn))} con la misma entrada; cada escenario cambia origen, tratado, programa o tipo de operación.</p>
            </section>
          )}

          {/* Notas y avisos */}
          {(c.notas || avisos.length > 0) && (
            <section className="mt-6 doc-evitar-corte">
              {c.notas && (<><h2 className="font-sello-display text-lg text-tinta mb-1">Notas</h2><p className="text-13 text-tinta whitespace-pre-wrap">{c.notas}</p></>)}
              {avisos.length > 0 && (
                <>
                  <h2 className="font-sello-display text-lg text-tinta mb-1 mt-3">Avisos de verificación</h2>
                  <ul className="text-13 text-tinta list-disc pl-5 space-y-0.5">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </>
              )}
            </section>
          )}

          <footer className="mt-8 pt-3 border-t border-linea text-13 text-tinta-suave">
            <p>Fundamentos: IGI y tasas preferenciales — LIGIE/TIGIE 2026 y tratados vigentes; DTA — {dta?.fundamento ?? 'Art. 49 LFD'}; IVA — Art. 27 LIVA; IEPS — LIEPS Arts. 2 y 14; cuotas compensatorias — resoluciones UPCI citadas por partida.</p>
            <p className="mt-1">Estimación con base en los datos capturados y las tasas cargadas al {fecha(c.createdAt)}. La responsabilidad del dato declarado corresponde al importador y al agente aduanal (Art. 54 LA). Montos en MXN.</p>
          </footer>
        </div>
      </article>
      <div className="doc-pie font-sello-mono">{pieTexto}</div>
    </div>
  )
}
