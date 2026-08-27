/**
 * Simulador "¿qué pasa si no descargo esto a tiempo?" — colgado del
 * pedimento real. Solo pinta cifras que el servidor calculó; la multa por
 * exceder plazo se muestra como pendiente de fuente, nunca como número.
 */
import { useEffect, useState } from 'react'
import { anexo24Api, type Exposicion } from '../../lib/api/anexo24'
import { Badge, Button, SelloVerificacion } from '../ui'
import { Aviso, Dialogo, fmtFecha, fmtMXN, fmtNum, fmtUSD, mensajeDe } from './comunes'

export function ExposicionPanel({ temporaryImportId, onClose }: { temporaryImportId: string; onClose: () => void }) {
  const [data, setData] = useState<Exposicion | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null); setError('')
    anexo24Api.exposicion(temporaryImportId).then(r => setData(r.data)).catch(e => setError(mensajeDe(e)))
  }, [temporaryImportId])

  return (
    <Dialogo titulo="¿Qué pasa si no descargo esto a tiempo?" onClose={onClose}>
      <div className="space-y-4 font-sello-ui text-sm">
        {error && <Aviso tono="carmin">{error}</Aviso>}
        {!data && !error && <p className="text-tinta-suave">Calculando con el TC del sistema…</p>}
        {data && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="border border-linea rounded-sello p-3">
                <p className="text-13 uppercase tracking-wide text-tinta-suave">Pedimento · fracción</p>
                <p className="font-sello-mono text-tinta">{data.pedimento} · {data.fractionCode}{data.parteCodigo ? ` · ${data.parteCodigo}` : ''}</p>
                <p className="text-tinta-suave mt-1">Saldo sin descargar: <span className="font-sello-mono text-tinta">{fmtNum(data.saldo)} {data.unit}</span> · {fmtUSD(data.valorSaldoUSD)}</p>
                <p className="text-tinta-suave">
                  {data.vencimiento ? <>Vence <span className="font-sello-mono text-tinta">{fmtFecha(data.vencimiento)}</span> ({data.diasParaVencer != null && data.diasParaVencer < 0 ? `vencida hace ${-data.diasParaVencer} días` : `${data.diasParaVencer} días`})</> : 'Activo fijo · vigencia del programa'}
                  {data.vencida && <Badge tono="carmin" className="ml-2">Vencida</Badge>}
                </p>
              </div>
              <div className="border border-linea rounded-sello p-3">
                <p className="text-13 uppercase tracking-wide text-tinta-suave">Tipo de cambio</p>
                <p className="font-sello-mono text-tinta">{data.tipoCambio.valor != null ? data.tipoCambio.valor.toFixed(4) : '—'} MXN/USD</p>
                <div className="mt-1"><SelloVerificacion estado={data.tipoCambio.estado === 'verificado' ? 'verificado' : 'sin_verificar'} fuenteNombre={data.tipoCambio.fuente ?? undefined} fechaPublicacion={data.tipoCambio.fecha ?? undefined} /></div>
                <p className="text-tinta-suave mt-2">IGI {data.tasas.igiPct != null ? `${data.tasas.igiPct}%` : 'no disponible'} ({data.tasas.igiFuente}) · DTA {data.tasas.dtaPct}% (general; ver cotejo en Cotizador) · IVA {data.tasas.ivaPct}%{data.tasas.iepsPct ? ` · IEPS ${data.tasas.iepsPct}%` : ''}</p>
              </div>
            </div>

            {data.impuestos ? (
              <div className="border border-linea rounded-sello">
                <table className="w-full">
                  <tbody>
                    {[
                      ['Valor del saldo en MXN', data.impuestos.valorMXN],
                      ['IGI (NMF)', data.impuestos.igi],
                      ['DTA', data.impuestos.dta],
                      ...(data.impuestos.ieps ? [['IEPS', data.impuestos.ieps] as const] : []),
                      ['IVA', data.impuestos.iva],
                    ].map(([l, v]) => (
                      <tr key={String(l)} className="border-b border-linea"><td className="px-3 py-2 text-tinta-suave">{l}</td><td className="px-3 py-2 text-right font-sello-mono text-tinta">{fmtMXN(Number(v))}</td></tr>
                    ))}
                    <tr><td className="px-3 py-2 font-medium text-tinta">Contribuciones omitidas si no retorna</td><td className="px-3 py-2 text-right font-sello-mono font-medium text-carmin text-lg">{fmtMXN(data.impuestos.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <Aviso>Sin impuestos calculables: {data.avisos.join(' ')}</Aviso>
            )}

            <div className="border border-linea rounded-sello p-3 space-y-2">
              <p className="text-13 uppercase tracking-wide text-tinta-suave">Multas</p>
              {data.multa.rangoOmision ? (
                <p className="text-tinta">Por omisión de contribuciones: <span className="font-sello-mono">{fmtMXN(data.multa.rangoOmision.min)}</span> a <span className="font-sello-mono">{fmtMXN(data.multa.rangoOmision.max)}</span> ({data.multa.rangoOmision.minPct}%–{data.multa.rangoOmision.maxPct}%) · {data.multa.rangoOmision.fundamento} <Badge tono="ambar">cotejo: {data.multa.rangoOmision.cotejo}</Badge></p>
              ) : <p className="text-tinta-suave">Rango de multa por omisión no calculable sin impuestos.</p>}
              <p className="text-tinta-suave">Multa específica por exceder el plazo de retorno ({data.multa.plazoRetorno.fundamento}): <Badge tono="ambar">pendiente de fuente</Badge> — {data.multa.plazoRetorno.nota}</p>
              <p className="text-tinta-suave">{data.recargos.nota}</p>
            </div>
            {data.impuestos && data.avisos.map((a, i) => <Aviso key={i}>{a}</Aviso>)}
          </>
        )}
        <div className="flex justify-end"><Button variante="secundario" onClick={onClose}>Cerrar</Button></div>
      </div>
    </Dialogo>
  )
}
