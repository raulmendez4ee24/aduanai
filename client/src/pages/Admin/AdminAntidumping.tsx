import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, Search, Clock, TrendingDown, Upload, Download } from 'lucide-react'
import { cuotasApi, archivoABase64, type ReporteImport, type CoberturaCuotas } from '../../lib/api/origen'
import { api } from '../../lib/api'
import type { AntidumpingDutyRecord, ExposureReport } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'list' | 'expiring' | 'exposure' | 'importar'

export function AdminAntidumpingPage() {
  const [tab, setTab] = useState<Tab>('list')
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-rose-500"/>
          <h1 className="text-xl font-bold text-slate-900">Cuotas compensatorias UPCI</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Resoluciones antidumping vigentes. Cada cuota se SUMA al arancel y la multa por omisión es 130-150% (Art. 178 LA).</p>
        <div className="flex gap-2 flex-wrap">
          {(['list', 'expiring', 'exposure', 'importar'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {t === 'list' ? 'Listado' : t === 'expiring' ? 'Por expirar' : t === 'exposure' ? 'Exposición tenant' : 'Importar UPCI'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'list' && <ListTab/>}
      {tab === 'expiring' && <ExpiringTab/>}
      {tab === 'exposure' && <ExposureTab/>}
      {tab === 'importar' && <ImportarTab/>}
    </div>
  )
}

function ListTab() {
  const [items, setItems] = useState<AntidumpingDutyRecord[]>([])
  const [country, setCountry] = useState('')
  const [fraction, setFraction] = useState('')
  const [status, setStatus] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    try { const r = await api.antidumpingList({ country: country || undefined, fraction: fraction || undefined, status: status || undefined }); setItems(r.data) } catch {}
  }
  useEffect(() => { load() }, [status])

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="País ISO-2 (CN, US, VN…)"
          className="text-[12px] font-mono border border-slate-200 rounded-lg px-3 py-1.5 w-32"/>
        <input value={fraction} onChange={e => setFraction(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Fracción"
          className="text-[12px] font-mono border border-slate-200 rounded-lg px-3 py-1.5 w-40"/>
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">Todos los estados</option>
          <option value="vigente">Vigente</option>
          <option value="suspendida">Suspendida</option>
          <option value="revocada">Revocada</option>
          <option value="en_revision">En revisión</option>
        </select>
        <button onClick={load} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <Search className="w-3 h-3"/> Buscar
        </button>
        <span className="ml-auto text-[11px] text-slate-500 self-center">{items.length} resolución(es)</span>
      </div>
      <div className="space-y-1.5">
        {items.map(d => {
          const expanded = expandedId === d.id
          return (
            <div key={d.id} className="rounded-lg border border-slate-200 bg-white/60">
              <button onClick={() => setExpandedId(expanded ? null : d.id)} className="w-full p-3 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    d.status === 'vigente' ? 'bg-emerald-100 text-emerald-800' :
                    d.status === 'suspendida' ? 'bg-amber-100 text-amber-800' :
                    d.status === 'revocada' ? 'bg-slate-100 text-slate-700' :
                    'bg-sky-100 text-sky-800'
                  }`}>{d.status.toUpperCase()}</span>
                  <span className="text-[10px] font-mono text-slate-500">{d.resolutionNumber}</span>
                  <span className="text-[10px] text-slate-400">·</span>
                  <span className="text-[10px] font-mono">{d.fractionCode}</span>
                  <span className="text-[10px] font-mono">{d.countryOfOrigin}</span>
                  <span className="ml-auto text-[12px] font-bold text-rose-700">
                    {d.rate} {d.rateUnit}
                  </span>
                </div>
                <p className="text-[12px] text-slate-700 mt-1">{d.productDesc}</p>
              </button>
              {expanded && (
                <div className="px-3 pb-3 text-[11px] text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                  <p><strong>Tipo:</strong> {d.resolutionType} · <strong>Investigación:</strong> {d.investigationType ?? '—'}</p>
                  <p><strong>Expediente UPCI:</strong> {d.expedienteUPCI ?? '—'}</p>
                  <p><strong>Cuota:</strong> {d.rate} {d.rateUnit} ({d.rateType})</p>
                  <p><strong>Publicación DOF:</strong> {d.publishDateDOF?.slice(0, 10)} · <strong>Vigente desde:</strong> {d.effectiveDate?.slice(0, 10)} · <strong>Hasta:</strong> {d.expiryDate?.slice(0, 10) ?? 'sin fecha'}</p>
                  {d.specificProducer && <p><strong>Productor específico:</strong> {d.specificProducer}</p>}
                  {d.notes && <p className="italic">{d.notes}</p>}
                  {d.dofUrl && <a href={d.dofUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3"/> Ver en DOF</a>}
                </div>
              )}
            </div>
          )
        })}
        {items.length === 0 && <p className="text-[12px] text-slate-400 italic py-4 text-center">Sin resoluciones</p>}
      </div>
    </div>
  )
}

function ExpiringTab() {
  const [items, setItems] = useState<AntidumpingDutyRecord[]>([])
  useEffect(() => { api.antidumpingExpiring().then(r => setItems(r.data)).catch(() => setItems([])) }, [])
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5"/> Resoluciones que expiran en próximos 90 días ({items.length})
      </p>
      {items.length === 0 ? <p className="text-[12px] text-emerald-600">Ninguna resolución próxima a expirar ✓</p> : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Resolución</th>
              <th className="py-2 text-slate-500 font-medium">Fracción · País</th>
              <th className="py-2 text-slate-500 font-medium">Producto</th>
              <th className="py-2 text-slate-500 font-medium text-right">Cuota</th>
              <th className="py-2 text-slate-500 font-medium">Expira</th>
            </tr>
          </thead>
          <tbody>
            {items.map(d => {
              const days = d.expiryDate ? Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
              return (
                <tr key={d.id} className="border-b border-slate-100/50">
                  <td className="py-2 font-mono">{d.resolutionNumber}</td>
                  <td className="py-2 font-mono">{d.fractionCode} · {d.countryOfOrigin}</td>
                  <td className="py-2 truncate max-w-[200px]">{d.productDesc}</td>
                  <td className="py-2 text-right font-bold text-rose-700">{d.rate} {d.rateUnit}</td>
                  <td className={`py-2 font-mono ${days != null && days <= 30 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{d.expiryDate?.slice(0, 10)} ({days}d)</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ExposureTab() {
  const [tenantId, setTenantId] = useState('')
  const [report, setReport] = useState<ExposureReport | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('aduanai_tenantId')
    if (t) setTenantId(t)
  }, [])

  async function load() {
    if (!tenantId) return
    setLoading(true)
    try { const r = await api.antidumpingExposureByTenant(tenantId); setReport(r.data) } catch {}
    setLoading(false)
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex gap-2 mb-3">
        <input value={tenantId} onChange={e => setTenantId(e.target.value)}
          placeholder="Tenant ID"
          className="flex-1 text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"/>
        <button onClick={load} disabled={loading || !tenantId} className="text-[12px] bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
          Calcular exposición
        </button>
      </div>
      {report && (
        <div className="space-y-3">
          <div className={`rounded-xl border p-4 ${report.totalExposureUSD > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className={`w-5 h-5 ${report.totalExposureUSD > 0 ? 'text-rose-600' : 'text-emerald-600'}`}/>
              <p className="text-[14px] font-bold text-slate-900">
                {report.totalExposureUSD > 0 ? '🚨 Exposición a cuotas no declaradas' : '✓ Sin exposición detectada'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Total imports (último año)</p>
                <p className="text-[18px] font-bold">{report.totalImports}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Exposición acumulada</p>
                <p className="text-[18px] font-bold text-rose-700">${Math.round(report.totalExposureUSD).toLocaleString('es-MX')} USD</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Multa potencial (Art. 178)</p>
                <p className="text-[18px] font-bold text-rose-700">${Math.round(report.potentialMultaUSD).toLocaleString('es-MX')} USD</p>
              </div>
            </div>
          </div>
          {report.byResolution.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-slate-700 mb-2">Detalle por resolución</p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="py-2 text-slate-500 font-medium">Resolución</th>
                    <th className="py-2 text-slate-500 font-medium">Fracción · País</th>
                    <th className="py-2 text-slate-500 font-medium">Producto</th>
                    <th className="py-2 text-slate-500 font-medium text-right">Imports</th>
                    <th className="py-2 text-slate-500 font-medium text-right">Exposición USD</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byResolution.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100/50">
                      <td className="py-2 font-mono">{r.resolutionNumber}</td>
                      <td className="py-2 font-mono">{r.fractionCode} · {r.countryOfOrigin}</td>
                      <td className="py-2 truncate max-w-[200px]">{r.productDesc}</td>
                      <td className="py-2 text-right font-mono">{r.importsCount}</td>
                      <td className="py-2 text-right font-mono font-bold text-rose-700">${Math.round(r.exposureUSD).toLocaleString('es-MX')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Ola 2 origen-cuotas: pipeline de carga UPCI (estructura, sin inventar) ──
function ImportarTab() {
  const [dryRun, setDryRun] = useState(true)
  const [rep, setRep] = useState<(ReporteImport & { duplicadasEnArchivo: number }) | null>(null)
  const [cob, setCob] = useState<CoberturaCuotas | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { cuotasApi.cobertura().then(r => setCob(r.data)).catch(() => setCob(null)) }, [rep])

  async function importar(f: File) {
    setBusy(true); setError('')
    try { setRep((await cuotasApi.importarUPCI({ archivoBase64: await archivoABase64(f), nombreArchivo: f.name, dryRun })).data) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setBusy(false)
  }
  return (
    <div className={`${GLASS} rounded-2xl p-5 space-y-3`}>
      <p className="text-[12px] font-semibold text-slate-800 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5"/> Importar resoluciones UPCI (Excel/CSV)</p>
      <p className="text-[11px] text-slate-600">Columnas: resolutionNumber, expedienteUPCI, resolutionType, fractionCode, countryOfOrigin, productDesc, rateType, rate, rateUnit, exportadorTasas ("Empresa=tasa; Empresa=tasa"), specificProducer, publishDateDOF, effectiveDate, expiryDate, examenSunsetFecha, status, investigationType, esAntielusion, dofUrl, <strong>fuenteUrl</strong>, notes. Dedupe por (fracción, país, resolución): si existe se actualiza. <strong>cotejadoAt solo cuando la fila trae fuenteUrl</strong>; sin fuente entra como "pendiente de cotejo".</p>
      {cob && <p className="text-[11px] text-slate-700">Estado actual: {cob.total} resoluciones · {cob.cotejadas} cotejadas · {cob.pendientesCotejo} pendientes de cotejo · {cob.conTasasPorExportador} con tasas por empresa · {cob.antielusion} antielusión · {cob.inactivas} inactivas.</p>}
      <div className="flex gap-3 items-center flex-wrap text-[11px]">
        <a href={cuotasApi.plantillaUPCIURL} className="flex items-center gap-1 text-emerald-700 hover:underline" download><Download className="w-3 h-3"/> Descargar plantilla</a>
        <label className="flex items-center gap-1"><input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}/> Solo validar (no escribir)</label>
        <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }} className="text-[11px]"/>
        {error && <span className="text-rose-700">{error}</span>}
      </div>
      {rep && (
        <div className="text-[11px] space-y-1">
          <p className="font-semibold">{rep.dryRun ? 'Validación (sin escribir)' : 'Importación'}: {rep.total} filas · {rep.validas} válidas · {rep.invalidas} rechazadas ({rep.duplicadasEnArchivo} duplicadas en archivo) · {rep.creadas} creadas · {rep.actualizadas} actualizadas · {rep.cotejadas} cotejadas · {rep.pendientesCotejo} pendientes de cotejo</p>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {rep.filas.map(f => <div key={f.fila} className={`rounded px-2 py-0.5 ${f.ok ? 'bg-emerald-50' : 'bg-rose-50'}`}>fila {f.fila} · {f.clave ?? '—'} · {f.accion} · {f.cotejo}{f.errores.length > 0 ? ` · ${f.errores.join('; ')}` : ''}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
