import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { AntidumpingDutyRecord } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function CuotasActivasPage() {
  const [items, setItems] = useState<AntidumpingDutyRecord[]>([])
  const [scope, setScope] = useState<'tenant' | 'all'>('tenant')
  const [country, setCountry] = useState('')
  const [fraction, setFraction] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api.antidumpingActive({
        scope, country: country || undefined, fraction: fraction || undefined,
      })
      setItems(r.data)
    } catch { setItems([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [scope])

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-rose-600"/>
          <h1 className="text-xl font-bold text-slate-900">Cuotas compensatorias activas</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-3">Resoluciones UPCI vigentes que afectan tu operación. Cada cuota se SUMA al arancel y la omisión es multa 130-150% del impuesto omitido (Art. 178 LA).</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setScope('tenant')} className={`text-[11px] font-medium px-3 py-1.5 rounded-full ${scope === 'tenant' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            Mis fracciones (último año)
          </button>
          <button onClick={() => setScope('all')} className={`text-[11px] font-medium px-3 py-1.5 rounded-full ${scope === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            Todas
          </button>
        </div>
      </div>

      <div className={`${GLASS} rounded-2xl p-4 flex flex-wrap gap-2 items-center`}>
        <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="País ISO-2" className="text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-24"/>
        <input value={fraction} onChange={e => setFraction(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Fracción" className="text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-32"/>
        <button onClick={load} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <Search className="w-3 h-3"/> Buscar
        </button>
        <span className="ml-auto text-[11px] text-slate-500">{items.length} resoluciones vigentes</span>
      </div>

      {loading ? <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando…</div> : (
        <div className="space-y-1.5">
          {items.length === 0 && (
            <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-emerald-700`}>
              {scope === 'tenant' ? '✓ Ninguna cuota compensatoria afecta tus fracciones del último año' : 'Sin resultados'}
            </div>
          )}
          {items.map(d => {
            const exp = expanded === d.id
            return (
              <div key={d.id} className={`${GLASS} rounded-xl`}>
                <button onClick={() => setExpanded(exp ? null : d.id)} className="w-full p-3 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-500">{d.resolutionNumber}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] font-mono">{d.fractionCode}</span>
                    <span className="text-[10px] font-mono">{d.countryOfOrigin}</span>
                    <span className="ml-auto text-[12px] font-bold text-rose-700">{d.rate} {d.rateUnit}</span>
                  </div>
                  <p className="text-[12px] text-slate-700 mt-1">{d.productDesc}</p>
                </button>
                {exp && (
                  <div className="px-3 pb-3 text-[11px] text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                    <p><strong>Tipo:</strong> {d.resolutionType} · <strong>Investigación:</strong> {d.investigationType ?? '—'}</p>
                    <p><strong>Expediente UPCI:</strong> {d.expedienteUPCI ?? '—'}</p>
                    <p><strong>Vigente desde:</strong> {d.effectiveDate?.slice(0, 10)} · <strong>Hasta:</strong> {d.expiryDate?.slice(0, 10) ?? 'sin fecha'}</p>
                    {d.specificProducer && <p><strong>Productor específico:</strong> {d.specificProducer}</p>}
                    {d.notes && <p className="italic">{d.notes}</p>}
                    {d.dofUrl && <a href={d.dofUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3"/> Ver en DOF</a>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
