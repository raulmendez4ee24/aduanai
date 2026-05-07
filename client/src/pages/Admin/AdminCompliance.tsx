import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle, RefreshCw, Search, Link as LinkIcon } from 'lucide-react'
import { api } from '../../lib/api'
import type { ComplianceReport } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export function AdminCompliancePage() {
  const [tenantId, setTenantId] = useState('')
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Pre-cargar mi propio tenant si quiero ver el mío
    const stored = localStorage.getItem('aduanai_tenantId')
    if (stored) setTenantId(stored)
  }, [])

  async function fetchReport() {
    if (!tenantId) return
    setLoading(true); setError(''); setReport(null)
    try {
      const r = await api.complianceReport(tenantId)
      setReport(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar reporte')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Reporte de cumplimiento normativo</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">
          Trazabilidad versional — qué versiones TIGIE/LIGIE/RGCE se consultaron en cada clasificación,
          identifica clasificaciones con versión expirada/superada.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            placeholder="Tenant ID"
            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-mono"
          />
          <button onClick={fetchReport} disabled={loading || !tenantId}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-5 py-2 rounded-lg transition">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
            Generar reporte
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-100">
            <AlertTriangle className="w-4 h-4 text-rose-500"/>
            <p className="text-[12px] text-rose-700">{error}</p>
          </div>
        )}
      </div>

      {report && (
        <>
          {/* Resumen del tenant + activas */}
          <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
            <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Tenant</p>
                <p className="text-[18px] font-bold text-slate-900">{report.tenant.name}</p>
                {report.tenant.rfc && <p className="text-[11px] text-slate-500 font-mono">RFC: {report.tenant.rfc}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Total consultas</p>
                <p className="text-[36px] font-bold text-slate-900 leading-none">{report.totals.consults}</p>
                <p className="text-[11px] text-amber-600 mt-1">
                  {report.totals.outdatedConsults} con versión no vigente · {report.totals.uniqueTigieVersions} versiones distintas
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
              {Object.entries(report.activeVersions).map(([k, v]) => v && (
                <div key={k} className="bg-white/60 rounded-lg p-2 border border-emerald-100">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{k.toUpperCase()}</p>
                  <p className="text-[12px] font-semibold text-emerald-700 font-mono">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recomendaciones */}
          {report.recommendations.length > 0 && (
            <div className={`${GLASS} rounded-[2rem] p-5`}>
              <p className="text-[12px] font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4"/> Recomendaciones
              </p>
              <ul className="space-y-2">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="text-[12px] text-slate-700 leading-relaxed flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Breakdown por versión */}
          {report.breakdown.length > 0 && (
            <div className={`${GLASS} rounded-[2rem] p-6`}>
              <p className="text-[12px] font-semibold text-slate-700 mb-3">Desglose por versión TIGIE consultada</p>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200/50 text-left">
                    <th className="py-2 text-slate-500 font-medium">Versión TIGIE</th>
                    <th className="py-2 text-slate-500 font-medium text-right">Consultas</th>
                    <th className="py-2 text-slate-500 font-medium">Estado</th>
                    <th className="py-2 text-slate-500 font-medium">Primera</th>
                    <th className="py-2 text-slate-500 font-medium">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {report.breakdown.map(g => (
                    <tr key={g.version} className="border-b border-slate-100/50">
                      <td className="py-2 font-mono">{g.version}</td>
                      <td className="py-2 text-right font-mono font-semibold">{g.count}</td>
                      <td className="py-2">
                        {g.outdated
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">No vigente</span>
                          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Vigente</span>}
                      </td>
                      <td className="py-2 text-slate-500 font-mono">{g.firstAt.slice(0, 10)}</td>
                      <td className="py-2 text-slate-500 font-mono">{g.lastAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recientes */}
          {report.recent.length > 0 && (
            <div className={`${GLASS} rounded-[2rem] p-6`}>
              <p className="text-[12px] font-semibold text-slate-700 mb-3">Consultas recientes (últimas 20)</p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200/50 text-left">
                    <th className="py-2 text-slate-500 font-medium">Fecha</th>
                    <th className="py-2 text-slate-500 font-medium">TIGIE</th>
                    <th className="py-2 text-slate-500 font-medium">Modelo</th>
                    <th className="py-2 text-slate-500 font-medium">Hash</th>
                    <th className="py-2 text-slate-500 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {report.recent.map(r => (
                    <tr key={r.id} className="border-b border-slate-100/50">
                      <td className="py-2 text-slate-500 font-mono">{new Date(r.consultedAt).toLocaleString('es-MX')}</td>
                      <td className="py-2 font-mono">{r.tigieVersion}</td>
                      <td className="py-2 text-slate-600">{r.modelUsed}</td>
                      <td className="py-2 font-mono text-slate-400">{r.consultHash.slice(0, 12)}…</td>
                      <td className="py-2 text-right">
                        <a href={api.verifyConsultURL(r.consultHash)} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                          <LinkIcon className="w-3 h-3"/> verificar
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
