import { CampoNumerico } from '../components/ui'
import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, Search, ShieldAlert, Building2 } from 'lucide-react'
import { api } from '../lib/api'
import type { AntidumpingDutyRecord } from '../lib/api'
import { formatCuota } from '../lib/cuota-format'
import { cuotasApi, type CoberturaCuotas, type CuotaAplicable } from '../lib/api/origen'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'

export const GUIA_MODULO = {
  titulo: 'Cuotas compensatorias',
  pasos: [
    'Cada resolución muestra si está "cotejada" (cargada con fuente oficial DOF/SE) o "pendiente de cotejo" (estructura sembrada): no confirma ni descarta una cuota real hasta cotejarse.',
    'Busca por fracción + país + exportador: si la resolución fija tasa por empresa, se aplica esa; si no, la general — y se dice cuál.',
    'Las resoluciones antielusión (extienden la cuota a un tercer país) disparan alerta por cliente cuando su catálogo o sus operaciones cruzan fracción + origen.',
    'Las tasas se cargan desde Admin → Cuotas UPCI → Importar (plantilla con columnas documentadas). Nunca se inventan resoluciones.',
  ],
}

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Fila = AntidumpingDutyRecord & { cotejadoAt?: string | null; fuenteUrl?: string | null; esAntielusion?: boolean; examenSunsetFecha?: string | null; exportadorTasas?: { empresa: string; tasa: number; rateUnit?: string }[] | null }

interface FormCuotas { scope: 'tenant' | 'all'; country: string; fraction: string; bFraccion: string; bPais: string; bExportador: string; bValor: number }
const INICIAL: FormCuotas = { scope: 'tenant', country: '', fraction: '', bFraccion: '', bPais: '', bExportador: '', bValor: 0 }

export function CuotasActivasPage() {
  const [form, setForm] = useEstadoPersistente<FormCuotas>('cuotas', INICIAL)
  const set = <K extends keyof FormCuotas>(k: K, v: FormCuotas[K]) => setForm(prev => ({ ...prev, [k]: v }))
  const [items, setItems] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [cob, setCob] = useState<CoberturaCuotas | null>(null)
  const [busq, setBusq] = useState<CuotaAplicable | null | 'nada'>(null)
  const [busqErr, setBusqErr] = useState('')

  async function load() {
    setLoading(true)
    try {
      const r = await api.antidumpingActive({ scope: form.scope, country: form.country || undefined, fraction: form.fraction || undefined })
      setItems(r.data as Fila[])
    } catch { setItems([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [form.scope]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cuotasApi.cobertura().then(r => setCob(r.data)).catch(() => setCob(null)) }, [])

  async function buscar() {
    if (!form.bFraccion || !form.bPais) return
    setBusqErr(''); setBusq(null)
    try {
      const r = await cuotasApi.buscar({ fractionCode: form.bFraccion, countryOfOrigin: form.bPais, exportador: form.bExportador || undefined, valueUSD: form.bValor || undefined })
      setBusq(r.data ?? 'nada')
    } catch (e) { setBusqErr(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-rose-600"/>
          <h1 className="text-xl font-bold text-slate-900">Cuotas compensatorias</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-3">Resoluciones UPCI que afectan tu operación. Cada cuota se SUMA al arancel y la omisión es multa 130-150% del impuesto omitido (Art. 178 LA).</p>
        {cob && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 text-[11px]">
            <Stat label="Resoluciones" v={cob.total}/>
            <Stat label="Cotejadas con fuente" v={cob.cotejadas} ok/>
            <Stat label="Pendientes de cotejo" v={cob.pendientesCotejo} warn/>
            <Stat label="Con tasas por exportador" v={cob.conTasasPorExportador}/>
            <Stat label="Antielusión" v={cob.antielusion}/>
          </div>
        )}
        {cob && <p className="text-[10px] text-amber-700 mb-3">{cob.nota}</p>}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => set('scope', 'tenant')} className={`text-[11px] font-medium px-3 py-1.5 rounded-full ${form.scope === 'tenant' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            Mis fracciones (último año)
          </button>
          <button onClick={() => set('scope', 'all')} className={`text-[11px] font-medium px-3 py-1.5 rounded-full ${form.scope === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            Todas
          </button>
        </div>
      </div>

      {/* Enganche: cuota aplicable por fracción + país + exportador */}
      <div className={`${GLASS} rounded-2xl p-4 space-y-2`}>
        <p className="text-[12px] font-semibold text-slate-800 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5"/> ¿Qué cuota aplica? (fracción + país + exportador)</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={form.bFraccion} onChange={e => set('bFraccion', e.target.value)} placeholder="Fracción 8 dígitos" className="text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-36"/>
          <input value={form.bPais} onChange={e => set('bPais', e.target.value.toUpperCase())} placeholder="País" className="text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-20"/>
          <input value={form.bExportador} onChange={e => set('bExportador', e.target.value)} placeholder="Exportador / productor (opcional)" className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 w-64"/>
          <CampoNumerico value={form.bValor} onValue={n => set('bValor', n)} step="0.01" placeholder="Valor USD" className="text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-28"/>
          <button onClick={buscar} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Search className="w-3 h-3"/> Buscar</button>
          {busqErr && <span className="text-[11px] text-rose-700">{busqErr}</span>}
        </div>
        {busq === 'nada' && <p className="text-[11px] text-emerald-700">Sin cuota compensatoria vigente en el corpus para esa fracción + país (match exacto). Recuerda: el corpus está pendiente de cotejo contra la lista UPCI — no descarta una cuota real.</p>}
        {busq && busq !== 'nada' && (
          <div className={`rounded-xl border p-3 text-[12px] ${busq.esAntielusion ? 'border-rose-300 bg-rose-50/60' : 'border-amber-200 bg-amber-50/40'}`}>
            <p className="font-bold text-slate-900">{busq.calculo}</p>
            <p className="text-slate-700">Resolución {busq.fundamento.resolucion ?? '—'} {busq.fundamento.expedienteUPCI ? `· ${busq.fundamento.expedienteUPCI}` : ''} {busq.fundamento.fechaDOF ? `· DOF ${busq.fundamento.fechaDOF}` : ''} · <CotejoBadge cotejado={busq.fundamento.cotejo === 'cotejada'}/></p>
            <p className="text-slate-600">Tasa {busq.tasa.origen === 'exportador' ? `específica de ${busq.tasa.empresa}` : busq.tasa.origen === 'general' ? 'general (el exportador no tiene tasa propia)' : 'general (sin lista por empresa cargada)'} · vigente {busq.vigencia.desde?.slice(0, 10) ?? '—'} a {busq.vigencia.hasta?.slice(0, 10) ?? 'sin fecha'}{busq.vigencia.examenSunsetFecha ? ` · examen sunset ${busq.vigencia.examenSunsetFecha}` : ''}</p>
            {busq.esAntielusion && <p className="text-rose-800 font-semibold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5"/> Resolución antielusión: extiende la cuota a este origen.</p>}
            {busq.otras > 0 && <p className="text-slate-500">+{busq.otras} resolución(es) más vigentes para la misma fracción y país.</p>}
            {(busq.fundamento.fuenteUrl || busq.fundamento.dofUrl) && <a href={busq.fundamento.fuenteUrl ?? busq.fundamento.dofUrl ?? '#'} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3"/> Fuente</a>}
          </div>
        )}
      </div>

      <div className={`${GLASS} rounded-2xl p-4 flex flex-wrap gap-2 items-center`}>
        <input value={form.country} onChange={e => set('country', e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="País ISO-2" className="text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 w-24"/>
        <input value={form.fraction} onChange={e => set('fraction', e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
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
              {form.scope === 'tenant' ? 'Ninguna resolución del corpus cruza con tus fracciones del último año (el corpus está pendiente de cotejo contra la lista UPCI).' : 'Sin resultados'}
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
                    <CotejoBadge cotejado={!!d.cotejadoAt}/>
                    {(d.esAntielusion || d.investigationType === 'elusion') && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">ANTIELUSIÓN</span>}
                    {d.exportadorTasas && d.exportadorTasas.length > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">{d.exportadorTasas.length} TASAS POR EMPRESA</span>}
                    <span className="ml-auto text-[12px] font-bold text-rose-700">{formatCuota(d.rateType, d.rate, d.rateUnit)}</span>
                  </div>
                  <p className="text-[12px] text-slate-700 mt-1">{d.productDesc}</p>
                </button>
                {exp && (
                  <div className="px-3 pb-3 text-[11px] text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                    <p><strong>Tipo:</strong> {d.resolutionType} · <strong>Investigación:</strong> {d.investigationType ?? '—'}</p>
                    <p><strong>Expediente UPCI:</strong> {d.expedienteUPCI ?? '—'}</p>
                    <p><strong>Vigente desde:</strong> {d.effectiveDate?.slice(0, 10)} · <strong>Hasta:</strong> {d.expiryDate?.slice(0, 10) ?? 'sin fecha'}{d.examenSunsetFecha ? <> · <strong>Examen sunset:</strong> {d.examenSunsetFecha.slice(0, 10)}</> : ''}</p>
                    {d.specificProducer && <p><strong>Productor específico:</strong> {d.specificProducer}</p>}
                    {d.exportadorTasas && d.exportadorTasas.length > 0 && (
                      <p><strong>Tasas por exportador/productor:</strong> {d.exportadorTasas.map(e => `${e.empresa}: ${e.tasa} ${e.rateUnit ?? d.rateUnit}`).join(' · ')}</p>
                    )}
                    <p><strong>Cotejo:</strong> {d.cotejadoAt ? `cotejada ${d.cotejadoAt.slice(0, 10)}` : 'pendiente de cotejo contra la lista UPCI/DOF — no confirma ni descarta una cuota real'}</p>
                    {d.notes && <p className="italic">{d.notes}</p>}
                    {(d.fuenteUrl || d.dofUrl) && <a href={d.fuenteUrl ?? d.dofUrl ?? '#'} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3"/> Ver fuente / DOF</a>}
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

function CotejoBadge({ cotejado }: { cotejado: boolean }) {
  return cotejado
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">COTEJADA</span>
    : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">PENDIENTE DE COTEJO</span>
}

function Stat({ label, v, ok, warn }: { label: string; v: number | string; ok?: boolean; warn?: boolean }) {
  return <div className={`rounded-lg border p-2 ${warn ? 'border-amber-200 bg-amber-50/40' : ok ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white/60'}`}><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="text-[16px] font-bold">{v}</p></div>
}
