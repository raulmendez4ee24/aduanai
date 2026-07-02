import { DemoTag } from '../components/DemoBanner'
import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { InventoryStats, InventoryBalance, TemporaryImportRecord, DischargeRecord, ProductRecord, AssemblyRecord, AssemblyResultRecord, ImportTraceabilityRecord } from '../lib/api'
import { Warehouse, AlertTriangle, ChevronLeft, ChevronRight, Boxes, Package, ChevronDown, ChevronUp, Plus, Workflow, GitBranch } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { ROITile } from '../components/ROIBanner'
import { usePermissions } from '../hooks/usePermissions'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
type Tab = 'dashboard' | 'imports' | 'discharges' | 'bom' | 'reports'

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [stats, setStats] = useState<InventoryStats | null>(null)
  const [balances, setBalances] = useState<InventoryBalance[]>([])
  const [imports, setImports] = useState<TemporaryImportRecord[]>([])
  const [discharges, setDischarges] = useState<DischargeRecord[]>([])
  const [expiring, setExpiring] = useState<TemporaryImportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [importPage, setImportPage] = useState(1)
  const [dischargePage, setDischargePage] = useState(1)

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([
        api.inventoryStats(), api.inventoryBalances(),
        api.inventoryImports(1), api.inventoryDischarges(1),
        api.inventoryExpiring(90),
      ])
      if (results[0]?.status === 'fulfilled') setStats(results[0].value.data)
      if (results[1]?.status === 'fulfilled') setBalances(results[1].value.data)
      if (results[2]?.status === 'fulfilled') setImports(results[2].value.data)
      if (results[3]?.status === 'fulfilled') setDischarges(results[3].value.data)
      if (results[4]?.status === 'fulfilled') setExpiring(results[4].value.data)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (tab === 'imports') api.inventoryImports(importPage).then(r => setImports(r.data)).catch(() => {})
  }, [importPage, tab])

  useEffect(() => {
    if (tab === 'discharges') api.inventoryDischarges(dischargePage).then(r => setDischarges(r.data)).catch(() => {})
  }, [dischargePage, tab])

  const Skel = () => <div className="animate-pulse bg-slate-200/60 rounded-xl h-24" />

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-4">
          <Warehouse className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Inventario IMMEX</h1> <DemoTag />
        </div>

        <div className="mb-4"><ROITile moduleKey="inventoryIMMEX" /></div>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { key: 'dashboard', label: 'Dashboard' }, { key: 'imports', label: 'Importaciones' },
            { key: 'discharges', label: 'Descargos' }, { key: 'bom', label: 'Productos y BOM' }, { key: 'reports', label: 'Reportes' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as Tab)}
              className={`text-[12px] font-medium px-4 py-2 rounded-full transition-all whitespace-nowrap ${tab === t.key ? 'bg-emerald-500 text-white' : 'bg-white/50 text-slate-600 hover:bg-white/70'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? <div className="grid grid-cols-3 gap-4"><Skel /><Skel /><Skel /></div> : (
          <>
            {/* Dashboard */}
            {tab === 'dashboard' && (
              <div className="space-y-4">
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      { l: 'Total Importaciones', v: stats.totalImports },
                      { l: 'Activas', v: stats.activeImports },
                      { l: 'Descargas', v: stats.totalDischarges },
                      { l: 'Por Vencer (90d)', v: stats.expiringIn90Days, w: stats.expiringIn90Days > 0 },
                      { l: 'Valor Activo USD', v: `$${Math.round(stats.totalValueActive).toLocaleString()}` },
                      { l: 'Piezas Pendientes', v: stats.totalPendingQty },
                    ].map((m, i) => (
                      <div key={i} className={`bg-white/40 rounded-xl p-4 ${m.w ? 'ring-1 ring-rose-200' : ''}`}>
                        <p className="text-[10px] text-slate-500">{m.l}</p>
                        <p className={`text-[20px] font-bold ${m.w ? 'text-rose-600' : 'text-slate-900'}`}>{typeof m.v === 'number' ? m.v.toLocaleString() : m.v}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expiring alerts */}
                {expiring.length > 0 && (
                  <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-100">
                    <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-rose-500" /><p className="text-[12px] font-semibold text-rose-700">Próximas a vencer ({expiring.length})</p></div>
                    <div className="space-y-1.5">
                      {expiring.slice(0, 5).map(e => (
                        <div key={e.id} className="flex items-center justify-between text-[11px] py-1.5 border-b border-rose-100/50 last:border-b-0">
                          <span className="font-mono font-semibold text-slate-800">{formatFraction(e.fractionCode)}</span>
                          <span className="text-slate-600 flex-1 truncate mx-3">{e.description}</span>
                          <span className="text-slate-500">{e.pedimento}</span>
                          <span className="text-rose-600 font-medium ml-3">{new Date(e.expirationDate).toLocaleDateString('es-MX')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Balances table */}
                <div>
                  <p className="text-[12px] font-semibold text-slate-700 mb-3">Saldos por Fracción</p>
                  {balances.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead><tr className="border-b border-slate-200/50">
                          <th className="text-left py-2 text-slate-500 font-medium">Fracción</th>
                          <th className="text-left py-2 text-slate-500 font-medium">Descripción</th>
                          <th className="text-right py-2 text-slate-500 font-medium">Importado</th>
                          <th className="text-right py-2 text-slate-500 font-medium">Descargado</th>
                          <th className="text-right py-2 text-slate-500 font-medium">Saldo</th>
                          <th className="text-right py-2 text-slate-500 font-medium">Días</th>
                        </tr></thead>
                        <tbody>
                          {balances.map((b, i) => (
                            <tr key={i} className="border-b border-slate-100/50 hover:bg-white/30">
                              <td className="py-2 font-mono font-semibold text-slate-900">{formatFraction(b.fractionCode)}</td>
                              <td className="py-2 text-slate-600 max-w-[180px] truncate">{b.description}</td>
                              <td className="py-2 text-right">{b.totalImported.toLocaleString()}</td>
                              <td className="py-2 text-right">{b.totalDischarged.toLocaleString()}</td>
                              <td className="py-2 text-right font-semibold text-slate-900">{b.balance.toLocaleString()}</td>
                              <td className="py-2 text-right">
                                {b.daysRemaining !== null ? (
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${b.daysRemaining < 30 ? 'bg-rose-50 text-rose-600' : b.daysRemaining < 90 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{b.daysRemaining}d</span>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-center text-[12px] text-slate-400 py-6">Sin saldos</p>}
                </div>
              </div>
            )}

            {/* Imports */}
            {tab === 'imports' && (
              <div>
                {imports.length > 0 ? (
                  <div className="space-y-2">
                    {imports.map(imp => (
                      <div key={imp.id} className="bg-white/40 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[13px] font-bold text-slate-900">{imp.pedimento}</span>
                            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${imp.status === 'active' ? 'bg-emerald-50 text-emerald-600' : imp.status === 'expired' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>{imp.status}</span>
                          </div>
                          <span className="text-[11px] text-slate-400">{new Date(imp.entryDate).toLocaleDateString('es-MX')}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                          <div><span className="text-slate-500">Fracción:</span> <span className="font-mono font-semibold">{formatFraction(imp.fractionCode)}</span></div>
                          <div><span className="text-slate-500">Cant:</span> {imp.quantity} {imp.unit}</div>
                          <div><span className="text-slate-500">Descargado:</span> {imp.quantityDischarged}</div>
                          <div><span className="text-slate-500">Valor:</span> ${imp.customsValue.toLocaleString()}</div>
                          <div><span className="text-slate-500">Vence:</span> <span className={imp.status === 'expired' ? 'text-rose-600 font-medium' : ''}>{new Date(imp.expirationDate).toLocaleDateString('es-MX')}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-center text-[12px] text-slate-400 py-8">Sin importaciones temporales</p>}
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button onClick={() => setImportPage(p => Math.max(1, p - 1))} disabled={importPage === 1} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-[12px] text-slate-500">Página {importPage}</span>
                  <button onClick={() => setImportPage(p => p + 1)} disabled={imports.length < 20} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            {/* Discharges */}
            {tab === 'discharges' && (
              <div>
                {discharges.length > 0 ? (
                  <div className="space-y-2">
                    {discharges.map(d => (
                      <div key={d.id} className="bg-white/40 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-semibold text-slate-800">{d.type}</span>
                          <span className="text-[11px] text-slate-400">{new Date(d.dischargeDate).toLocaleDateString('es-MX')}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                          {d.pedimento && <div><span className="text-slate-500">Pedimento:</span> <span className="font-mono">{d.pedimento}</span></div>}
                          <div><span className="text-slate-500">Cant:</span> {d.quantity} {d.unit}</div>
                          {d.customsValue && <div><span className="text-slate-500">Valor:</span> ${d.customsValue.toLocaleString()}</div>}
                          {d.temporaryImport && <div><span className="text-slate-500">Fracción:</span> <span className="font-mono">{formatFraction(d.temporaryImport.fractionCode)}</span></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-center text-[12px] text-slate-400 py-8">Sin descargos</p>}
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button onClick={() => setDischargePage(p => Math.max(1, p - 1))} disabled={dischargePage === 1} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-[12px] text-slate-500">Página {dischargePage}</span>
                  <button onClick={() => setDischargePage(p => p + 1)} disabled={discharges.length < 20} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            {/* Productos y BOM */}
            {tab === 'bom' && <BomTab />}

            {/* Reports */}
            {tab === 'reports' && (
              <div className="text-center py-12">
                <Warehouse className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-[14px] font-semibold text-slate-700">Reportes Anexo 24 / 30</p>
                <p className="text-[12px] text-slate-500 mt-1">Genera reportes de inventario IMMEX para cumplimiento fiscal.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// BOM Tab — productos terminados, componentes, ensambles y trazabilidad
// ──────────────────────────────────────────────────────────────────────────

function BomTab() {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [assemblies, setAssemblies] = useState<AssemblyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showCreateProduct, setShowCreateProduct] = useState(false)
  const [showRecordAssembly, setShowRecordAssembly] = useState(false)
  const [trace, setTrace] = useState<ImportTraceabilityRecord | null>(null)
  const [traceImportId, setTraceImportId] = useState('')
  const [recordedResult, setRecordedResult] = useState<AssemblyResultRecord | null>(null)
  const [error, setError] = useState('')
  const { can } = usePermissions()

  async function refresh() {
    setLoading(true)
    try {
      const [p, a] = await Promise.all([api.bomProducts(), api.assemblies()])
      setProducts(p.data)
      setAssemblies(a.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  function toggle(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpanded(next)
  }

  const finished = products.filter(p => p.isFinished)
  const raw = products.filter(p => !p.isFinished)

  if (loading) return <div className="grid grid-cols-2 gap-3"><div className="bg-slate-200/60 rounded-xl h-24 animate-pulse" /><div className="bg-slate-200/60 rounded-xl h-24 animate-pulse" /></div>
  if (error) return <p className="text-rose-600 text-[12px]">{error}</p>

  return (
    <div className="space-y-5">
      {/* Header con KPIs y botones */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3">
          <Kpi icon={Package} label="Productos terminados" value={finished.length} />
          <Kpi icon={Boxes} label="Materias primas" value={raw.length} />
          <Kpi icon={Workflow} label="Ensambles registrados" value={assemblies.length} />
        </div>
        <div className="flex gap-2">
          {can('inventory', 'discharge') && (
            <button onClick={() => setShowRecordAssembly(true)} disabled={finished.length === 0}
              className="text-[12px] font-medium px-4 py-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-1.5">
              <Workflow className="w-3.5 h-3.5" /> Registrar ensamble
            </button>
          )}
          {can('inventory', 'adjust') && (
            <button onClick={() => setShowCreateProduct(true)}
              className="text-[12px] font-medium px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nuevo producto
            </button>
          )}
        </div>
      </div>

      {showCreateProduct && <CreateProductForm onClose={() => setShowCreateProduct(false)} onCreated={() => { setShowCreateProduct(false); refresh() }} />}
      {showRecordAssembly && (
        <RecordAssemblyForm
          finished={finished}
          onClose={() => setShowRecordAssembly(false)}
          onRecorded={(r) => { setRecordedResult(r); setShowRecordAssembly(false); refresh() }}
        />
      )}

      {recordedResult && <AssemblyResultDisplay result={recordedResult} onClose={() => setRecordedResult(null)} />}

      {/* Productos terminados con BOM expandible */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-4 h-4 text-emerald-600" />
          <p className="text-[13px] font-semibold text-slate-800">Productos terminados ({finished.length})</p>
        </div>
        {finished.length === 0 ? (
          <p className="text-center text-[12px] text-slate-400 py-6 bg-white/30 rounded-xl">Aún no hay productos terminados</p>
        ) : (
          <div className="space-y-2">
            {finished.map(p => (
              <div key={p.id} className="bg-white/40 rounded-xl">
                <button onClick={() => toggle(p.id)} className="w-full p-4 flex items-center gap-3 text-left">
                  {expanded.has(p.id) ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-bold text-slate-900">{p.productCode}</span>
                      {p.fractionCode && <span className="font-mono text-[10px] text-slate-500">{formatFraction(p.fractionCode)}</span>}
                    </div>
                    <p className="text-[12px] text-slate-600 truncate">{p.description}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{p.components?.length ?? 0} componentes</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p._count?.assemblies ?? 0} ensambles</span>
                </button>
                {expanded.has(p.id) && (
                  <div className="px-4 pb-4">
                    {p.components && p.components.length > 0 ? (
                      <table className="w-full text-[11px]">
                        <thead><tr className="border-b border-slate-200/50">
                          <th className="text-left py-1.5 text-slate-500 font-medium">Componente</th>
                          <th className="text-left py-1.5 text-slate-500 font-medium">Fracción</th>
                          <th className="text-right py-1.5 text-slate-500 font-medium">Qty</th>
                          <th className="text-right py-1.5 text-slate-500 font-medium">Unidad</th>
                          <th className="text-right py-1.5 text-slate-500 font-medium">Merma</th>
                        </tr></thead>
                        <tbody>
                          {p.components.map(c => (
                            <tr key={c.id} className="border-b border-slate-100/50">
                              <td className="py-1.5 font-mono font-medium">{c.component.productCode} <span className="text-slate-500 font-sans">— {c.component.description}</span></td>
                              <td className="py-1.5 font-mono text-slate-500">{c.component.fractionCode ? formatFraction(c.component.fractionCode) : '—'}</td>
                              <td className="py-1.5 text-right">{c.quantity}</td>
                              <td className="py-1.5 text-right text-slate-500">{c.unit}</td>
                              <td className="py-1.5 text-right">{c.scrapPercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-[11px] text-slate-400 py-2">Sin componentes definidos</p>
                    )}
                    <AddComponentForm productId={p.id} rawProducts={raw} onAdded={refresh} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Materias primas */}
      {raw.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Boxes className="w-4 h-4 text-slate-500" />
            <p className="text-[13px] font-semibold text-slate-800">Materias primas ({raw.length})</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {raw.map(p => (
              <div key={p.id} className="bg-white/40 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-bold text-slate-900">{p.productCode}</span>
                    {p.fractionCode && <span className="font-mono text-[10px] text-slate-500">{formatFraction(p.fractionCode)}</span>}
                  </div>
                  <p className="text-[11px] text-slate-600 truncate">{p.description}</p>
                </div>
                <span className="text-[10px] text-slate-500">{p.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ensambles recientes */}
      {assemblies.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Workflow className="w-4 h-4 text-emerald-600" />
            <p className="text-[13px] font-semibold text-slate-800">Ensambles recientes</p>
          </div>
          <div className="space-y-2">
            {assemblies.slice(0, 8).map(a => (
              <div key={a.id} className="bg-white/40 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-bold text-slate-900">{a.product.productCode}</span>
                    {a.reference && <span className="text-[10px] text-slate-500">· {a.reference}</span>}
                  </div>
                  <span className="text-[11px] text-slate-500">{new Date(a.assemblyDate).toLocaleDateString('es-MX')}</span>
                </div>
                <p className="text-[11px] text-slate-600 mb-1">
                  <span className="font-bold text-emerald-600">{a.quantity}</span> {a.product.unit} · {a.consumptions.length} componentes consumidos
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trazabilidad */}
      <div className="rounded-2xl bg-violet-50/40 border border-violet-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="w-4 h-4 text-violet-600" />
          <p className="text-[13px] font-semibold text-slate-800">Trazabilidad reverse</p>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">Pega un ID de importación temporal para ver en qué ensambles se usó:</p>
        <div className="flex gap-2">
          <input
            type="text" value={traceImportId} onChange={e => setTraceImportId(e.target.value)}
            placeholder="ID de TemporaryImport (ej: cmon85...)"
            className="flex-1 text-[12px] font-mono border border-slate-200 rounded-xl px-3 py-2 bg-white"
          />
          <button
            onClick={async () => { try { const r = await api.importTraceability(traceImportId); setTrace(r.data) } catch (e) { setError(e instanceof Error ? e.message : 'Error') } }}
            disabled={!traceImportId}
            className="text-[12px] font-medium px-4 py-2 rounded-xl bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-40">
            Consultar
          </button>
        </div>
        {trace && (
          <div className="mt-3 bg-white rounded-xl p-3 text-[12px]">
            <p className="font-mono font-bold text-slate-900">{trace.pedimento} · {formatFraction(trace.fractionCode)}</p>
            <p className="text-slate-600 mt-1">{trace.description}</p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] text-slate-500">Importado</p><p className="font-bold">{trace.quantityImported.toLocaleString()} {trace.unit}</p></div>
              <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] text-slate-500">Saldo</p><p className="font-bold">{trace.balance.toLocaleString()} {trace.unit}</p></div>
              <div className="bg-emerald-50 rounded-lg p-2"><p className="text-[10px] text-emerald-700">Usado en producción</p><p className="font-bold text-emerald-700">{trace.totalConsumedInProduction.toFixed(0)} {trace.unit}</p></div>
            </div>
            {trace.consumedInAssemblies.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-1">Ensambles ({trace.consumedInAssemblies.length}):</p>
                <ul className="space-y-1">
                  {trace.consumedInAssemblies.map((c, i) => (
                    <li key={i} className="text-[11px] text-slate-600">
                      <span className="font-mono">{c.productCode}</span> · {c.quantityProduced} unidades · {new Date(c.assemblyDate).toLocaleDateString('es-MX')}
                      <span className="ml-2 text-slate-500">(~{c.componentDeducted.toFixed(0)} {trace.unit} consumidos)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="bg-white/50 rounded-xl px-3 py-2 flex items-center gap-2">
      <Icon className="w-4 h-4 text-emerald-600" />
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-[16px] font-bold text-slate-900 leading-none">{value}</p>
      </div>
    </div>
  )
}

function CreateProductForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ productCode: '', description: '', fractionCode: '', unit: 'Pza', isFinished: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true); setErr('')
    try {
      await api.bomProductCreate({
        productCode: form.productCode, description: form.description,
        fractionCode: form.fractionCode || undefined, unit: form.unit, isFinished: form.isFinished,
      })
      onCreated()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-emerald-200 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-slate-800">Nuevo producto</p>
        <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-700">Cerrar</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input className="text-[12px] border border-slate-200 rounded-lg px-3 py-2" placeholder="SKU" value={form.productCode} onChange={e => setForm({...form, productCode: e.target.value})} />
        <input className="text-[12px] border border-slate-200 rounded-lg px-3 py-2 col-span-2 md:col-span-2" placeholder="Descripción" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
        <input className="text-[12px] font-mono border border-slate-200 rounded-lg px-3 py-2" placeholder="Fracción (opcional)" value={form.fractionCode} onChange={e => setForm({...form, fractionCode: e.target.value})} />
        <input className="text-[12px] border border-slate-200 rounded-lg px-3 py-2" placeholder="Unidad" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} />
        <label className="text-[12px] flex items-center gap-2"><input type="checkbox" checked={form.isFinished} onChange={e => setForm({...form, isFinished: e.target.checked})} /> Producto terminado</label>
        <button onClick={submit} disabled={busy || !form.productCode || !form.description} className="text-[12px] font-medium px-3 py-2 rounded-lg bg-emerald-500 text-white disabled:opacity-40">{busy ? 'Creando...' : 'Crear'}</button>
      </div>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
    </div>
  )
}

function AddComponentForm({ productId, rawProducts, onAdded }: { productId: string; rawProducts: ProductRecord[]; onAdded: () => void }) {
  const [form, setForm] = useState({ componentId: '', quantity: '1', unit: 'Pza', scrapPercent: '0' })
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!form.componentId) return
    setBusy(true)
    try {
      await api.bomComponentUpsert(productId, {
        componentId: form.componentId,
        quantity: parseFloat(form.quantity),
        unit: form.unit,
        scrapPercent: parseFloat(form.scrapPercent),
      })
      setForm({ componentId: '', quantity: '1', unit: 'Pza', scrapPercent: '0' })
      onAdded()
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/50 grid grid-cols-2 md:grid-cols-5 gap-2">
      <select value={form.componentId} onChange={e => setForm({...form, componentId: e.target.value})} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5">
        <option value="">+ Agregar componente...</option>
        {rawProducts.map(p => <option key={p.id} value={p.id}>{p.productCode} — {p.description.slice(0, 30)}</option>)}
      </select>
      <input type="number" placeholder="Qty" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5" />
      <input placeholder="Unidad" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5" />
      <input type="number" placeholder="Merma %" value={form.scrapPercent} onChange={e => setForm({...form, scrapPercent: e.target.value})} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5" />
      <button onClick={submit} disabled={busy || !form.componentId} className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500 text-white disabled:opacity-40">{busy ? '...' : 'Agregar'}</button>
    </div>
  )
}

function RecordAssemblyForm({ finished, onClose, onRecorded }: { finished: ProductRecord[]; onClose: () => void; onRecorded: (r: AssemblyResultRecord) => void }) {
  const [form, setForm] = useState({ productId: '', quantity: '100', reference: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true); setErr('')
    try {
      const r = await api.assemblyRecord({
        productId: form.productId,
        quantity: parseFloat(form.quantity),
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      })
      onRecorded(r.data)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-emerald-200 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-slate-800">Registrar ensamble (descontará componentes del IMMEX FIFO)</p>
        <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-700">Cerrar</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <select value={form.productId} onChange={e => setForm({...form, productId: e.target.value})} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2 col-span-2">
          <option value="">Producto terminado...</option>
          {finished.map(p => <option key={p.id} value={p.id}>{p.productCode} — {p.description.slice(0, 50)}</option>)}
        </select>
        <input type="number" placeholder="Cantidad" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2" />
        <input placeholder="OP / referencia" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} className="text-[12px] border border-slate-200 rounded-lg px-3 py-2" />
      </div>
      <button onClick={submit} disabled={busy || !form.productId || !form.quantity} className="text-[12px] font-medium px-4 py-2 rounded-lg bg-emerald-500 text-white disabled:opacity-40 flex items-center gap-2">
        <Workflow className="w-3.5 h-3.5" /> {busy ? 'Procesando...' : 'Registrar y descontar'}
      </button>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
    </div>
  )
}

function AssemblyResultDisplay({ result, onClose }: { result: AssemblyResultRecord; onClose: () => void }) {
  const hasShortage = result.consumptions.some(c => c.shortage > 0)
  return (
    <div className={`rounded-2xl p-4 ${hasShortage ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} border space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-slate-800">
          {hasShortage ? '⚠️ Ensamble con faltantes de inventario' : '✓ Ensamble registrado'}
        </p>
        <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-700">Cerrar</button>
      </div>
      <div className="space-y-1.5">
        {result.consumptions.map((c, i) => (
          <div key={i} className="text-[11px]">
            <p className="font-mono font-medium">
              {c.componentCode}
              {c.fractionCode && <span className="text-slate-500 ml-2">· {formatFraction(c.fractionCode)}</span>}
              <span className="ml-2 font-sans text-slate-700">{c.quantityWithScrap.toFixed(0)} {c.unit}</span>
              {c.shortage > 0 && <span className="ml-2 text-rose-600 font-bold">faltante: {c.shortage.toFixed(0)}</span>}
            </p>
            {c.importsConsumed.length > 0 && (
              <p className="text-slate-500 ml-3">
                ↳ FIFO: {c.importsConsumed.map(i => `${i.pedimento} (${i.deducted.toFixed(0)})`).join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

