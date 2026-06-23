import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { FiscalDashboard, FiscalAccount, TaxCreditRecord, GuaranteeRecord, CertificationProfileRecord, FiscalRiskReport, CertLossSimulation } from '../lib/api'
import { Shield, AlertTriangle, ChevronRight } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { ROITile } from '../components/ROIBanner'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
type Tab = 'dashboard' | 'credits' | 'guarantees' | 'cert' | 'risks'

export function FiscalPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [dash, setDash] = useState<FiscalDashboard | null>(null)
  const [account, setAccount] = useState<FiscalAccount | null>(null)
  const [credits, setCredits] = useState<TaxCreditRecord[]>([])
  const [guarantees, setGuarantees] = useState<GuaranteeRecord[]>([])
  const [cert, setCert] = useState<CertificationProfileRecord | null>(null)
  const [risks, setRisks] = useState<FiscalRiskReport | null>(null)
  const [simulation, setSimulation] = useState<CertLossSimulation | null>(null)
  const [loading, setLoading] = useState(true)
  const [simLoading, setSimLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([
        api.fiscalDashboard(), api.fiscalAccount(), api.fiscalCredits(),
        api.fiscalGuarantees(), api.fiscalCertification(), api.fiscalRisks(),
      ])
      if (results[0]?.status === 'fulfilled') setDash(results[0].value.data)
      if (results[1]?.status === 'fulfilled') setAccount(results[1].value.data)
      if (results[2]?.status === 'fulfilled') setCredits(results[2].value.data)
      if (results[3]?.status === 'fulfilled') setGuarantees(results[3].value.data)
      if (results[4]?.status === 'fulfilled') setCert(results[4].value.data)
      if (results[5]?.status === 'fulfilled') setRisks(results[5].value.data)
      setLoading(false)
    }
    load()
  }, [])

  async function runSimulation() {
    setSimLoading(true)
    try { const res = await api.fiscalSimulateLoss(); setSimulation(res.data) } catch {}
    setSimLoading(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' }, { key: 'credits', label: 'Créditos' },
    { key: 'guarantees', label: 'Garantías' }, { key: 'cert', label: 'Certificación' }, { key: 'risks', label: 'Riesgos' },
  ]

  const Skel = ({ h = 'h-24' }: { h?: string } = {}) => (
    <div className={`animate-pulse bg-gradient-to-r from-slate-200/70 via-slate-200/40 to-slate-200/70 bg-[length:200%_100%] rounded-xl ${h}`} />
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Fiscal Guardian</h1>
          {loading && <span className="text-[11px] text-slate-400 ml-2">Cargando datos fiscales…</span>}
        </div>
        <div className="mb-4"><ROITile moduleKey="fiscalGuardian" /></div>
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} disabled={loading}
              className={`text-[12px] font-medium px-4 py-2 rounded-full transition-all whitespace-nowrap disabled:opacity-50 ${tab === t.key ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Skel/><Skel/><Skel/><Skel/>
            </div>
            <Skel h="h-32"/>
            <Skel h="h-40"/>
          </div>
        ) : (
          <>
            {/* Dashboard */}
            {tab === 'dashboard' && dash && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Créditos Activos', val: dash.activeCredits },
                    { label: 'Garantías', val: dash.activeGuarantees },
                    { label: 'Utilización', val: `${Math.round(dash.utilizationRate)}%` },
                    { label: 'Score Riesgo', val: dash.riskScore, warn: dash.riskScore > 50 },
                  ].map((m, i) => (
                    <div key={i} className={`bg-white/40 rounded-xl p-4 ${m.warn ? 'ring-1 ring-rose-200' : ''}`}>
                      <p className="text-[10px] text-slate-500">{m.label}</p>
                      <p className={`text-[24px] font-bold ${m.warn ? 'text-rose-600' : 'text-slate-900'}`}>{typeof m.val === 'number' ? m.val.toLocaleString() : m.val}</p>
                    </div>
                  ))}
                </div>
                {/* Risk gauge */}
                <div className="bg-white/40 rounded-xl p-5">
                  <p className="text-[12px] font-semibold text-slate-700 mb-3">Nivel de Riesgo</p>
                  <div className="w-full bg-slate-200/50 rounded-full h-4">
                    <div className={`h-4 rounded-full transition-all ${dash.riskScore > 70 ? 'bg-rose-500' : dash.riskScore > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${dash.riskScore}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-slate-500"><span>Bajo</span><span>Medio</span><span>Alto</span></div>
                </div>
                {dash.riskFactors.length > 0 && (
                  <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100">
                    <p className="text-[11px] font-semibold text-amber-700 mb-2">Factores de riesgo</p>
                    {dash.riskFactors.map((f, i) => <p key={i} className="text-[11px] text-amber-600 flex items-start gap-2 mb-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />{f}</p>)}
                  </div>
                )}
                <div className="grid md:grid-cols-3 gap-3">
                  <div className="bg-white/40 rounded-xl p-4 text-center"><p className="text-[10px] text-slate-500">Total Otorgado</p><p className="text-[20px] font-bold text-slate-900">${dash.totalGranted.toLocaleString()}</p></div>
                  <div className="bg-white/40 rounded-xl p-4 text-center"><p className="text-[10px] text-slate-500">Total Pendiente</p><p className="text-[20px] font-bold text-slate-900">${dash.totalPending.toLocaleString()}</p></div>
                  <div className="bg-white/40 rounded-xl p-4 text-center"><p className="text-[10px] text-slate-500">Certificación</p><p className={`text-[16px] font-bold ${dash.certificationStatus?.toUpperCase() === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}`}>{dash.certificationStatus} {dash.certificationModality && `(${dash.certificationModality})`}</p></div>
                </div>
              </div>
            )}

            {/* Credits */}
            {tab === 'credits' && (
              <div className="overflow-x-auto">
                {credits.length > 0 ? (
                  <table className="w-full text-[12px]">
                    <thead><tr className="border-b border-slate-200/50">
                      <th className="text-left py-3 text-slate-500 font-medium">Pedimento</th>
                      <th className="text-left py-3 text-slate-500 font-medium">Fracción</th>
                      <th className="text-right py-3 text-slate-500 font-medium">IVA</th>
                      <th className="text-right py-3 text-slate-500 font-medium">IEPS</th>
                      <th className="text-center py-3 text-slate-500 font-medium">Status</th>
                      <th className="text-right py-3 text-slate-500 font-medium">Vence</th>
                    </tr></thead>
                    <tbody>
                      {credits.map(c => (
                        <tr key={c.id} className="border-b border-slate-100/50 hover:bg-white/30">
                          <td className="py-3 font-mono font-semibold text-slate-900">{c.pedimento}</td>
                          <td className="py-3 font-mono text-slate-700">{formatFraction(c.fractionCode)}</td>
                          <td className="py-3 text-right text-slate-800">${c.ivaAmount.toLocaleString()}</td>
                          <td className="py-3 text-right text-slate-800">${c.iepsAmount.toLocaleString()}</td>
                          <td className="py-3 text-center"><span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.status === 'active' ? 'bg-emerald-50 text-emerald-600' : c.status === 'expired' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>{c.status}</span></td>
                          <td className="py-3 text-right text-[11px] text-slate-500">{new Date(c.dischargeDeadline).toLocaleDateString('es-MX')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin créditos fiscales</p>}
              </div>
            )}

            {/* Guarantees */}
            {tab === 'guarantees' && (
              guarantees.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {guarantees.map(g => (
                    <div key={g.id} className={`bg-white/40 rounded-xl p-5 ${g.alertLevel === 'danger' || g.alertLevel === 'expired' ? 'ring-1 ring-rose-200' : g.alertLevel === 'warning' ? 'ring-1 ring-amber-200' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[12px] font-semibold text-slate-800">{g.type}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          g.alertLevel === 'ok' ? 'bg-emerald-50 text-emerald-600' : g.alertLevel === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                        }`}>{g.status} {g.daysLeft !== undefined && `(${g.daysLeft}d)`}</span>
                      </div>
                      <p className="text-[20px] font-bold text-slate-900">${g.amount.toLocaleString()}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{g.institution} {g.referenceNumber && `— ${g.referenceNumber}`}</p>
                      <div className="flex justify-between text-[10px] text-slate-400 mt-3">
                        <span>Emisión: {new Date(g.issueDate).toLocaleDateString('es-MX')}</span>
                        <span>Vence: {new Date(g.expiryDate).toLocaleDateString('es-MX')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin garantías registradas</p>
            )}

            {/* Certification */}
            {tab === 'cert' && (
              <div className="space-y-4">
                {cert ? (
                  <div className="bg-white/40 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[14px] font-bold text-slate-900">Perfil de Certificación</h3>
                      <span className={`text-[10px] font-semibold px-3 py-1 rounded-full ${cert.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{cert.status}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div><p className="text-[10px] text-slate-500">Modalidad</p><p className="text-[13px] font-semibold text-slate-800">{cert.modality}</p></div>
                      {cert.certNumber && <div><p className="text-[10px] text-slate-500">Número</p><p className="text-[13px] font-mono text-slate-800">{cert.certNumber}</p></div>}
                      {cert.issueDate && <div><p className="text-[10px] text-slate-500">Emisión</p><p className="text-[13px] text-slate-800">{new Date(cert.issueDate).toLocaleDateString('es-MX')}</p></div>}
                      {cert.expiryDate && <div><p className="text-[10px] text-slate-500">Vencimiento</p><p className="text-[13px] text-slate-800">{new Date(cert.expiryDate).toLocaleDateString('es-MX')}</p></div>}
                    </div>
                  </div>
                ) : <p className="text-[13px] text-slate-400 text-center py-4">Sin perfil de certificación</p>}

                <div className="bg-white/40 rounded-xl p-5">
                  <h3 className="text-[14px] font-bold text-slate-900 mb-3">Simulador de Pérdida de Certificación</h3>
                  <p className="text-[12px] text-slate-500 mb-4">Calcula el impacto financiero si perdieras tu certificación OEA/IMMEX.</p>
                  <button onClick={runSimulation} disabled={simLoading} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[12px] font-semibold px-5 py-2.5 rounded-full transition-all">
                    {simLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                    {simLoading ? 'Simulando...' : 'Simular pérdida'}
                  </button>
                  {simulation && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="bg-rose-50/50 rounded-xl p-3 border border-rose-100"><p className="text-[10px] text-rose-600">Impacto inmediato</p><p className="text-[18px] font-bold text-rose-700">${simulation.immediateImpact.toLocaleString()}</p></div>
                      <div className="bg-rose-50/50 rounded-xl p-3 border border-rose-100"><p className="text-[10px] text-rose-600">Costo mensual extra</p><p className="text-[18px] font-bold text-rose-700">${simulation.monthlyExtraCost.toLocaleString()}</p></div>
                      <div className="bg-rose-50/50 rounded-xl p-3 border border-rose-100"><p className="text-[10px] text-rose-600">Costo anual extra</p><p className="text-[18px] font-bold text-rose-700">${simulation.annualExtraCost.toLocaleString()}</p></div>
                    </div>
                  )}
                  {simulation?.aiAnalysis && <p className="mt-3 text-[12px] text-slate-600 leading-relaxed bg-white/40 rounded-xl p-4">{simulation.aiAnalysis}</p>}
                </div>
              </div>
            )}

            {/* Risks */}
            {tab === 'risks' && (
              risks && risks.risks.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex gap-3 mb-4">
                    {risks.critical > 0 && <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600">{risks.critical} críticos</span>}
                    {risks.high > 0 && <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">{risks.high} altos</span>}
                    <span className="text-[10px] text-slate-500">{risks.total} riesgos detectados</span>
                  </div>
                  {risks.aiSummary && <div className="bg-white/40 rounded-xl p-4 mb-4"><p className="text-[12px] text-slate-700 leading-relaxed">{risks.aiSummary}</p></div>}
                  {risks.risks.map((r, i) => (
                    <div key={i} className={`p-4 rounded-xl border ${
                      r.severity === 'critical' ? 'bg-rose-50/50 border-rose-100' :
                      r.severity === 'high' ? 'bg-amber-50/50 border-amber-100' :
                      r.severity === 'medium' ? 'bg-yellow-50/50 border-yellow-100' :
                      'bg-blue-50/50 border-blue-100'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          r.severity === 'critical' ? 'bg-rose-100 text-rose-700' : r.severity === 'high' ? 'bg-amber-100 text-amber-700' : r.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                        }`}>{r.severity.toUpperCase()}</span>
                        <span className="text-[10px] text-slate-500">{r.category}</span>
                      </div>
                      <p className="text-[13px] font-semibold text-slate-800">{r.message}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{r.detail}</p>
                      <p className="text-[11px] text-emerald-600 mt-2 flex items-center gap-1"><ChevronRight className="w-3 h-3" />{r.action}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-[13px] text-slate-400 py-8">Sin riesgos detectados</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
