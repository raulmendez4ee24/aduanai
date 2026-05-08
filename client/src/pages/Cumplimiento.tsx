import { useEffect, useState } from 'react'
import { ShieldCheck, CheckCircle2, AlertTriangle, FileText } from 'lucide-react'
import { api } from '../lib/api'
import type { ComplianceReport } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function CumplimientoPage() {
  const [data, setData] = useState<ComplianceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const me = await api.settingsEmpresa()
        const r = await api.complianceReport(me.data.id)
        setData(r.data)
      } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
      setLoading(false)
    })()
  }, [])

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Cumplimiento normativo</h1>
        </div>
        <p className="text-[12px] text-slate-500">Reporte de trazabilidad versional — qué versiones de TIGIE/LIGIE/RGCE estaban vigentes en cada consulta crítica.</p>
      </div>

      {loading ? <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando reporte…</div>
        : err ? <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-rose-700`}>{err}</div>
        : data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card label="TIGIE vigente" value={data.activeVersions.tigie}/>
              <Card label="LIGIE vigente" value={data.activeVersions.ligie}/>
              <Card label="RGCE vigente" value={data.activeVersions.rgce ?? '—'}/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card label="Total consultas" value={data.totals.consults.toLocaleString('es-MX')}/>
              <Card label="Desactualizadas" value={data.totals.outdatedConsults.toLocaleString('es-MX')}
                tone={data.totals.outdatedConsults > 0 ? 'amber' : 'emerald'}/>
              <Card label="Versiones únicas TIGIE" value={data.totals.uniqueTigieVersions.toString()}/>
            </div>

            <div className={`${GLASS} rounded-2xl p-5`}>
              <p className="text-[13px] font-semibold text-slate-900 mb-3">Cobertura por versión</p>
              {data.breakdown.length === 0 ? <p className="text-[11px] text-slate-400 italic">Sin consultas registradas</p> : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left border-b border-slate-100">
                      <th className="py-2 text-slate-500 font-medium">Versión TIGIE</th>
                      <th className="py-2 text-slate-500 font-medium">Status</th>
                      <th className="py-2 text-slate-500 font-medium text-right">Consultas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdown.map((g, i) => (
                      <tr key={i} className="border-b border-slate-100/50">
                        <td className="py-1.5 font-mono">{g.version}</td>
                        <td className="py-1.5">
                          {g.outdated
                            ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"><AlertTriangle className="w-2.5 h-2.5"/>Desactualizada</span>
                            : <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-2.5 h-2.5"/>Vigente</span>}
                        </td>
                        <td className="py-1.5 text-right font-mono">{g.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {data.recommendations.length > 0 && (
              <div className={`${GLASS} rounded-2xl p-5`}>
                <p className="text-[13px] font-semibold text-slate-900 mb-2">Recomendaciones</p>
                <ul className="text-[11px] text-slate-700 space-y-1 list-disc ml-5">
                  {data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            <div className={`${GLASS} rounded-2xl p-5`}>
              <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1">
                <FileText className="w-4 h-4"/> Consultas recientes ({data.recent.length})
              </p>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="py-1.5 text-slate-500 font-medium">Fecha</th>
                    <th className="py-1.5 text-slate-500 font-medium">TIGIE</th>
                    <th className="py-1.5 text-slate-500 font-medium">LIGIE</th>
                    <th className="py-1.5 text-slate-500 font-medium">Modelo</th>
                    <th className="py-1.5 text-slate-500 font-medium">consultHash</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.slice(0, 30).map(c => (
                    <tr key={c.id} className="border-b border-slate-100/40">
                      <td className="py-1 text-slate-600">{new Date(c.consultedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="py-1 font-mono">{c.tigieVersion}</td>
                      <td className="py-1 font-mono">{c.ligieVersion}</td>
                      <td className="py-1 text-slate-500">{c.modelUsed}</td>
                      <td className="py-1 font-mono text-emerald-700"><a href={`/verify/${c.consultHash}`} target="_blank" rel="noreferrer" className="hover:underline">{c.consultHash.slice(0, 12)}…</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  )
}

function Card({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[18px] font-bold font-mono ${toneClass}`}>{value}</p>
    </div>
  )
}
