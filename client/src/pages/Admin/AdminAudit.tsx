import { useEffect, useState } from 'react'
import { Shield, Search, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, FileDown, Printer, Link as LinkIcon, Anchor } from 'lucide-react'
import { api } from '../../lib/api'
import type { AuditLogRecord, AuditReportData } from '../../lib/api'
import { Disclaimer } from '../../components/Disclaimer'

const ACTION_PALETTE: Record<string, string> = {
  LOGIN: 'bg-emerald-50 text-emerald-700',
  LOGOUT: 'bg-slate-100 text-slate-600',
  FAILED_LOGIN: 'bg-rose-50 text-rose-700',
  CREATE: 'bg-sky-50 text-sky-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-rose-50 text-rose-700',
  EXPORT: 'bg-violet-50 text-violet-700',
  EXPORT_CSV: 'bg-violet-50 text-violet-700',
  EXPORT_AUDIT_REPORT: 'bg-violet-50 text-violet-700',
  CLASSIFY: 'bg-emerald-50 text-emerald-700',
  QUOTE: 'bg-emerald-50 text-emerald-700',
  QUOTE_MULTI: 'bg-emerald-50 text-emerald-700',
  PEDIMENTO_VALIDATION: 'bg-amber-50 text-amber-700',
}

// Acciones que se anclan automáticamente al blockchain Bitcoin (debe coincidir con
// CRITICAL_AUDIT_ACTIONS del backend en services/timestamp.ts)
const ANCHORED_ACTIONS = new Set([
  'CLASSIFICATION_CREATE', 'QUOTE_CREATE', 'PEDIMENTO_VALIDATE',
  'CERTIFICATE_ISSUE', 'EXPORT_DICTAMEN', 'VERIFY_PROFESSIONAL', 'REJECT_PROFESSIONAL',
])

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' })
}

export function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ entity: '', action: '', q: '', dateFrom: '', dateTo: '' })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [chainCheck, setChainCheck] = useState<{ valid: boolean; brokenAt?: string; checkedCount: number } | null>(null)
  const [report, setReport] = useState<AuditReportData | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.auditList(filters)
      setLogs(r.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerifyChain() {
    setChainCheck(null)
    const r = await api.auditVerifyChain()
    setChainCheck(r.data)
  }

  async function handleGenerateReport() {
    setReport(null); setError('')
    try {
      const r = await api.auditReport(filters.dateFrom || undefined, filters.dateTo || undefined)
      setReport(r.data)
      setTimeout(() => window.print(), 200)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error generando reporte') }
  }

  function toggle(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpanded(next)
  }

  function exportCsv() {
    const qs = new URLSearchParams()
    if (filters.entity) qs.set('entity', filters.entity)
    if (filters.action) qs.set('action', filters.action)
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) qs.set('dateTo', filters.dateTo)
    const token = localStorage.getItem('aduanai_token')
    fetch(`/api/admin/audit/export-csv?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
  }

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 print:gap-2">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center print:w-7 print:h-7">
          <Shield size={18} className="text-white"/>
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Audit Trail</h1>
          <p className="text-[12px] text-gray-400">Trazabilidad inmutable con cadena de hashes SHA-256</p>
        </div>
      </div>

      {/* Acciones top */}
      <div className="flex flex-wrap gap-2 items-center print:hidden">
        <button onClick={handleVerifyChain} className="text-[12px] font-medium px-3 py-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> Verificar cadena
        </button>
        <button onClick={exportCsv} className="text-[12px] font-medium px-3 py-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
          <FileDown className="w-3.5 h-3.5"/> Exportar CSV
        </button>
        <button onClick={handleGenerateReport} className="text-[12px] font-semibold px-3 py-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 flex items-center gap-1.5">
          <Printer className="w-3.5 h-3.5"/> Generar reporte SAT
        </button>

        {chainCheck && (
          <span className={`ml-auto text-[12px] font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 ${chainCheck.valid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {chainCheck.valid ? <CheckCircle2 className="w-3.5 h-3.5"/> : <AlertTriangle className="w-3.5 h-3.5"/>}
            {chainCheck.valid ? `Cadena íntegra (${chainCheck.checkedCount} logs)` : `⚠ Cadena rota en ${chainCheck.brokenAt?.slice(-8)}`}
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm p-4 print:hidden">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input placeholder="Entidad (Pedimento, Quote, ...)" value={filters.entity} onChange={e => setFilters({...filters, entity: e.target.value})} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2"/>
          <input placeholder="Acción (LOGIN, CREATE, ...)" value={filters.action} onChange={e => setFilters({...filters, action: e.target.value})} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2"/>
          <input type="date" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2"/>
          <input type="date" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2"/>
          <div className="flex gap-2">
            <input placeholder="Buscar..." value={filters.q} onChange={e => setFilters({...filters, q: e.target.value})} className="flex-1 text-[12px] border border-slate-200 rounded-lg px-3 py-2"/>
            <button onClick={load} className="text-[12px] px-3 py-2 rounded-lg bg-emerald-500 text-white"><Search className="w-3.5 h-3.5"/></button>
          </div>
        </div>
      </div>

      {error && <p className="text-rose-600 text-[12px]">{error}</p>}

      {/* Reporte imprimible */}
      {report && (
        <div className="bg-white rounded-2xl p-6 print:p-2 print:rounded-none print:shadow-none">
          <div className="border-b border-slate-200 pb-3 mb-3">
            <p className="text-[20px] font-bold text-slate-900">Reporte de Trazabilidad ADUANAI</p>
            <p className="text-[11px] text-slate-500 mt-1">Empresa: <strong>{report.tenant.name}</strong> {report.tenant.rfc && `· RFC ${report.tenant.rfc}`} · Plan {report.tenant.plan}</p>
            <p className="text-[11px] text-slate-500">Período: {fmtDate(report.period.start)} → {fmtDate(report.period.end)} · Generado: {fmtDate(report.generatedAt)}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Integridad de cadena: {report.chainIntegrity.valid ? <span className="text-emerald-700 font-semibold">VÁLIDA ({report.chainIntegrity.checkedCount} registros verificados)</span> : <span className="text-rose-700 font-semibold">ROTA</span>}
            </p>
            <p className="text-[10px] text-slate-500 mt-2 font-mono break-all bg-slate-50 px-2 py-1 rounded">
              Hash del reporte (SHA-256): {report.reportHash}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Verificable en: <code className="font-mono">/verify/audit/{report.reportHash.slice(0, 16)}…</code></p>
          </div>

          <table className="w-full text-[10px]">
            <thead><tr className="border-b border-slate-200 text-left">
              <th className="py-1.5">Timestamp</th>
              <th className="py-1.5">Usuario</th>
              <th className="py-1.5">Acción</th>
              <th className="py-1.5">Entidad</th>
              <th className="py-1.5">Endpoint</th>
              <th className="py-1.5">IP</th>
              <th className="py-1.5">Hash</th>
            </tr></thead>
            <tbody>
              {report.logs.map(l => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-1 font-mono">{fmtDate(l.createdAt)}</td>
                  <td className="py-1">{l.user?.email ?? '—'}</td>
                  <td className="py-1 font-mono">{l.action}</td>
                  <td className="py-1">{l.entity}{l.entityId ? `:${l.entityId.slice(-8)}` : ''}</td>
                  <td className="py-1 font-mono text-slate-500">{l.method} {l.endpoint}</td>
                  <td className="py-1 font-mono text-slate-500">{l.ipAddress ?? '—'}</td>
                  <td className="py-1 font-mono text-slate-400">{l.hash.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.cryptoCertification && report.cryptoCertification.anchoredCount > 0 && (
            <div className="mt-4 border-2 border-emerald-300 bg-emerald-50/50 rounded-xl p-4 print:break-inside-avoid">
              <p className="text-[11px] font-bold text-emerald-800 mb-1 flex items-center gap-1.5">
                <Anchor className="w-3.5 h-3.5"/> CERTIFICACIÓN DE INTEGRIDAD CRIPTOGRÁFICA
              </p>
              <p className="text-[10px] text-emerald-900 mb-2">
                <strong>{report.cryptoCertification.confirmedCount}</strong> de <strong>{report.cryptoCertification.anchoredCount}</strong> acciones críticas
                confirmadas en el blockchain de Bitcoin
                {report.cryptoCertification.lastBitcoinBlock && <> · último bloque <strong>#{report.cryptoCertification.lastBitcoinBlock.toLocaleString('en-US')}</strong></>}
                {report.cryptoCertification.lastConfirmedAt && <> ({fmtDate(report.cryptoCertification.lastConfirmedAt)})</>}
              </p>
              <p className="text-[9px] text-emerald-900/80 leading-relaxed">{report.cryptoCertification.legalNotice}</p>
            </div>
          )}
          <div className="mt-4">
            <Disclaimer hash={report.reportHash}/>
          </div>
        </div>
      )}

      {/* Tabla de logs */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden print:hidden">
        {loading ? <p className="p-6 text-center text-slate-500 text-[12px]">Cargando...</p> :
          <table className="w-full text-[12px]">
            <thead><tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-3 py-2 text-slate-500 font-medium">Timestamp</th>
              <th className="px-3 py-2 text-slate-500 font-medium">Usuario</th>
              <th className="px-3 py-2 text-slate-500 font-medium">Acción</th>
              <th className="px-3 py-2 text-slate-500 font-medium">Entidad</th>
              <th className="px-3 py-2 text-slate-500 font-medium">Endpoint</th>
              <th className="px-3 py-2 text-slate-500 font-medium">Hash</th>
              <th className="w-8"></th>
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <>
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-mono text-slate-700">{fmtDate(l.createdAt)}</td>
                    <td className="px-3 py-2"><span className="text-[11px]">{l.user?.email ?? '—'}</span></td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ACTION_PALETTE[l.action] ?? 'bg-slate-100 text-slate-600'}`}>{l.action}</span>
                      {ANCHORED_ACTIONS.has(l.action) && (
                        <a
                          href="/admin/timestamps"
                          title="Anclado al blockchain Bitcoin via OpenTimestamps"
                          className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        >
                          <Anchor className="w-2.5 h-2.5"/>BTC
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">{l.entity}{l.entityId && <span className="text-slate-400 ml-1">:{l.entityId.slice(-8)}</span>}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{l.method} {l.endpoint}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-400">{l.hash.slice(0, 10)}…</td>
                    <td className="px-2"><button onClick={() => toggle(l.id)} className="text-slate-400 hover:text-slate-700">{expanded.has(l.id) ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}</button></td>
                  </tr>
                  {expanded.has(l.id) && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-2 text-[11px]">
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="text-slate-500">IP:</span> <span className="font-mono">{l.ipAddress ?? '—'}</span></div>
                            <div className="truncate"><span className="text-slate-500">User-Agent:</span> <span className="font-mono text-[10px]">{l.userAgent?.slice(0, 80) ?? '—'}</span></div>
                            <div><span className="text-slate-500">Hash:</span> <span className="font-mono text-[10px] break-all">{l.hash}</span></div>
                            <div><span className="text-slate-500">prevHash:</span> <span className="font-mono text-[10px] break-all">{l.prevHash ?? '— (génesis)'}</span></div>
                          </div>
                          {l.diff && Object.keys(l.diff).length > 0 && (
                            <div>
                              <p className="text-slate-700 font-semibold mb-1">Diff:</p>
                              <pre className="bg-white rounded p-2 text-[10px] overflow-x-auto">{JSON.stringify(l.diff, null, 2)}</pre>
                            </div>
                          )}
                          {l.metadata != null && (
                            <details>
                              <summary className="text-slate-500 cursor-pointer">Metadata</summary>
                              <pre className="bg-white rounded p-2 text-[10px] mt-1 overflow-x-auto">{JSON.stringify(l.metadata, null, 2)}</pre>
                            </details>
                          )}
                          <a href={`/verify/audit/${l.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-[11px]">
                            <LinkIcon className="w-3 h-3"/> Verificar este hash públicamente
                          </a>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-slate-400">Sin registros</td></tr>
              )}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}
