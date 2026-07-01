import { useEffect, useState } from 'react'
import { Globe, Calculator, AlertTriangle, ShieldCheck, FileWarning, RefreshCw, Plus, Trash2, Award, FileText } from 'lucide-react'
import { api } from '../lib/api'
import type { OriginAnalysisInput, OriginAnalysisResult, OriginRule, OriginCertificateInput } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

interface Material {
  id: string
  description: string
  valueUSD: number
  originating: boolean
}

function emptyMaterial(originating = false): Material {
  return { id: Math.random().toString(36).slice(2), description: '', valueUSD: 0, originating }
}

export function OrigenTMECPage() {
  const [agreement, setAgreement] = useState<'TMEC' | 'TLCUEM' | 'CPTPP'>('TMEC')
  const [fractionCode, setFractionCode] = useState('')
  const [productValue, setProductValue] = useState<number>(0)
  const [laborCost, setLaborCost] = useState<number>(0)
  const [overheadCost, setOverheadCost] = useState<number>(0)
  const [profit, setProfit] = useState<number>(0)
  const [packagingCost, setPackagingCost] = useState<number>(0)
  const [royalties, setRoyalties] = useState<number>(0)
  const [rvcMethod, setRvcMethod] = useState<'transaction_value' | 'net_cost'>('transaction_value')
  const [materials, setMaterials] = useState<Material[]>([emptyMaterial(true), emptyMaterial(false)])

  // Anexo 4-B automotriz
  const [highWageLaborCost, setHighWageLaborCost] = useState<number>(0)
  const [totalSteelAluminum, setTotalSteelAluminum] = useState<number>(0)
  const [naSteelAluminum, setNaSteelAluminum] = useState<number>(0)

  const [rule, setRule] = useState<OriginRule | null>(null)
  const [ruleLoading, setRuleLoading] = useState(false)
  const [result, setResult] = useState<OriginAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const originatingValue = materials.filter(m => m.originating).reduce((s, m) => s + (m.valueUSD || 0), 0)
  const nonOriginatingValue = materials.filter(m => !m.originating).reduce((s, m) => s + (m.valueUSD || 0), 0)

  useEffect(() => {
    if (!fractionCode || fractionCode.replace(/[^0-9]/g, '').length < 2) {
      setRule(null)
      return
    }
    let cancelled = false
    setRuleLoading(true)
    api.originRule(fractionCode, agreement)
      .then(r => { if (!cancelled) setRule(r.data.rule) })
      .catch(() => { if (!cancelled) setRule(null) })
      .finally(() => { if (!cancelled) setRuleLoading(false) })
    return () => { cancelled = true }
  }, [fractionCode, agreement])

  function updateMaterial(id: string, patch: Partial<Material>) {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }
  function addMaterial(originating: boolean) { setMaterials(prev => [...prev, emptyMaterial(originating)]) }
  function removeMaterial(id: string) { setMaterials(prev => prev.filter(m => m.id !== id)) }

  async function handleAnalyze() {
    if (!fractionCode || productValue <= 0) {
      setError('Fracción y valor del producto son requeridos')
      return
    }
    setLoading(true); setError(''); setResult(null)
    try {
      const input: OriginAnalysisInput = {
        fractionCode,
        agreement,
        productValue,
        originatingValue,
        nonOriginatingValue,
        laborCost: laborCost || undefined,
        highWageLaborCost: highWageLaborCost || undefined,
        overheadCost: overheadCost || undefined,
        profit: profit || undefined,
        packagingCost: packagingCost || undefined,
        royalties: royalties || undefined,
        rvcMethod,
        totalSteelAluminumValue: totalSteelAluminum || undefined,
        northAmericanSteelAluminumValue: naSteelAluminum || undefined,
      }
      const r = await api.originAnalyze(input)
      setResult(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al analizar origen')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Calculadora de Origen TMEC</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">
          Calcula RVC y verifica cumplimiento de reglas específicas. Análisis preliminar — la determinación final
          requiere documentación de cadena de suministro.
        </p>

        {/* Tratado + Fracción */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Field label="Tratado">
            <div className="flex gap-2">
              {(['TMEC', 'TLCUEM', 'CPTPP'] as const).map(t => (
                <button key={t} onClick={() => setAgreement(t)}
                  className={`text-[12px] font-medium px-3 py-2 rounded-full transition ${agreement === t ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Fracción del producto final">
            <input className="w-full text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"
              placeholder="0000.00.00" value={fractionCode}
              onChange={e => setFractionCode(e.target.value)} />
          </Field>
          <Field label="Método RVC">
            <select className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white"
              value={rvcMethod} onChange={e => setRvcMethod(e.target.value as 'transaction_value' | 'net_cost')}>
              <option value="transaction_value">Transaction value</option>
              <option value="net_cost">Net cost</option>
            </select>
          </Field>
        </div>

        {/* Regla aplicable */}
        {ruleLoading && (
          <div className="mb-4 flex items-center gap-2 text-[12px] text-slate-500">
            <RefreshCw className="w-3 h-3 animate-spin" /> Buscando regla específica...
          </div>
        )}
        {!ruleLoading && rule && (
          <div className="mb-4 rounded-xl bg-emerald-50/40 border border-emerald-100 p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Regla aplicable {rule.annex ? `· Anexo ${rule.annex}` : ''}</p>
                <p className="text-[12px] text-slate-800 mt-1">{rule.description}</p>
                <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                  <Badge>tipo: {rule.ruleType}</Badge>
                  {rule.rvcRequired != null && <Badge>RVC mín: {rule.rvcRequired}%</Badge>}
                  {rule.rvcMethod && <Badge>método: {rule.rvcMethod}</Badge>}
                </div>
                {rule.notes && <p className="text-[11px] text-slate-500 mt-2 italic">{rule.notes}</p>}
              </div>
            </div>
          </div>
        )}
        {!ruleLoading && fractionCode && !rule && (
          <div className="mb-4 rounded-xl bg-amber-50/40 border border-amber-100 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-[12px] text-amber-700">Sin regla específica registrada para fracción {fractionCode} bajo {agreement}. Consulta el anexo de reglas específicas del tratado.</p>
            </div>
          </div>
        )}

        {/* Valor del producto + costos */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Field label="Valor del producto USD"><NumInput value={productValue} onChange={setProductValue} /></Field>
          <Field label="Mano de obra USD"><NumInput value={laborCost} onChange={setLaborCost} /></Field>
          <Field label="Overhead USD"><NumInput value={overheadCost} onChange={setOverheadCost} /></Field>
          <Field label="Utilidad USD"><NumInput value={profit} onChange={setProfit} placeholder="default 10% del producto" /></Field>
          <Field label="Empaque USD"><NumInput value={packagingCost} onChange={setPackagingCost} /></Field>
          <Field label="Regalías USD"><NumInput value={royalties} onChange={setRoyalties} /></Field>
        </div>

        {/* Materiales originarios */}
        <MaterialsBlock
          title="Materiales ORIGINARIOS"
          subtitle="Producidos o suministrados en territorio del tratado"
          tone="emerald"
          materials={materials.filter(m => m.originating)}
          totalLabel="Σ Originarios"
          total={originatingValue}
          onAdd={() => addMaterial(true)}
          onUpdate={updateMaterial}
          onRemove={removeMaterial}
        />

        <MaterialsBlock
          title="Materiales NO ORIGINARIOS (VNM)"
          subtitle="Importados de fuera del tratado — afectan el RVC"
          tone="rose"
          materials={materials.filter(m => !m.originating)}
          totalLabel="Σ No originarios (VNM)"
          total={nonOriginatingValue}
          onAdd={() => addMaterial(false)}
          onUpdate={updateMaterial}
          onRemove={removeMaterial}
        />

        {/* Automotriz Anexo 4-B — solo si la regla detectada es automotriz */}
        {rule?.isAutomotive && (
          <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-violet-700"/>
              <p className="text-[13px] font-bold text-violet-900">Anexo 4-B Automotriz — {rule.autoCategory ?? 'parte'}</p>
            </div>
            <p className="text-[11px] text-violet-700 mb-3">
              Los vehículos y autopartes requieren además del RVC: <strong>Labor Value Content (LVC)</strong> y <strong>% acero/aluminio NA</strong>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Mano obra >$16 USD/hr"><NumInput value={highWageLaborCost} onChange={setHighWageLaborCost} placeholder="LVC denominator"/></Field>
              <Field label="Total acero+aluminio USD"><NumInput value={totalSteelAluminum} onChange={setTotalSteelAluminum}/></Field>
              <Field label="Acero+aluminio NA USD"><NumInput value={naSteelAluminum} onChange={setNaSteelAluminum}/></Field>
            </div>
            {rule.laborValueContent != null && <p className="text-[10px] text-violet-700 mt-2">LVC requerido: {rule.laborValueContent}% — Acero/aluminio NA requerido: {rule.steelAluminumPercent}%</p>}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <button onClick={handleAnalyze} disabled={loading || !fractionCode || productValue <= 0}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Calculator className="w-4 h-4" />}
            {loading ? 'Analizando...' : 'Analizar origen'}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <p className="text-[12px] text-rose-700">{error}</p>
          </div>
        )}
      </div>

      {result && <OriginResult result={result} />}
    </div>
  )
}

function OriginResult({ result }: { result: OriginAnalysisResult }) {
  const palette = result.qualifies
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-rose-50 border-rose-200 text-rose-800'

  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-4`}>
      <div className="flex items-start gap-3">
        {result.qualifies
          ? <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-1" />
          : <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-1" />}
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{result.agreement}</p>
          <p className="text-[20px] font-bold text-slate-900">
            {result.qualifies ? '✅ Califica como originario' : '❌ No califica con los datos actuales'}
          </p>
          <p className="text-[12px] text-slate-600 mt-1">{result.reason}</p>
        </div>
      </div>

      {/* RVC por 4 métodos */}
      {result.rvc && (
        <div className={`rounded-xl border p-4 ${palette}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-2">RVC calculado por método (requerido ≥ {result.rvcRequired ?? '—'}%)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['transactionValue', 'netCost', 'buildUp', 'buildDown'] as const).map(method => {
              const value = result.rvc[method]
              const labels: Record<typeof method, string> = {
                transactionValue: 'Transaction Value',
                netCost: 'Net Cost',
                buildUp: 'Build-Up',
                buildDown: 'Build-Down',
              }
              const meets = value != null && result.rvcRequired != null && value >= result.rvcRequired
              return (
                <div key={method} className={`rounded-lg p-3 bg-white/60 border ${meets ? 'border-emerald-300' : 'border-slate-200'}`}>
                  <p className="text-[10px] uppercase opacity-70">{labels[method]}</p>
                  <p className={`text-[22px] font-bold ${meets ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {value != null ? `${value}%` : '—'}
                  </p>
                  {meets && <p className="text-[9px] text-emerald-600 font-bold">✓ CUMPLE</p>}
                </div>
              )
            })}
          </div>
          <p className="font-mono text-[11px] mt-2 opacity-70 break-words">{result.formula}</p>
          {result.netCost != null && (
            <p className="text-[11px] mt-1 opacity-70">Net cost calculado = ${result.netCost.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD</p>
          )}
        </div>
      )}

      {/* Anexo 4-B: LVC + SA */}
      {(result.laborValueContentPct != null || result.steelAluminumNAPct != null) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
          <p className="text-[12px] font-bold text-violet-900 mb-2 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5"/> Requisitos automotrices Anexo 4-B
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
            {result.laborValueContentPct != null && (
              <div className={`rounded-lg p-3 border ${result.lvcCompliance ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className="text-[10px] uppercase opacity-70">LVC (Labor Value Content)</p>
                <p className="text-[20px] font-bold">{result.laborValueContentPct}%</p>
                <p className="text-[10px] opacity-70">Requerido ≥ {result.lvcRequired}% — {result.lvcCompliance ? '✓ Cumple' : '✗ No cumple'}</p>
              </div>
            )}
            {result.steelAluminumNAPct != null && (
              <div className={`rounded-lg p-3 border ${result.saCompliance ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className="text-[10px] uppercase opacity-70">% Acero/aluminio Norteamericano</p>
                <p className="text-[20px] font-bold">{result.steelAluminumNAPct}%</p>
                <p className="text-[10px] opacity-70">Requerido ≥ {result.saRequired}% — {result.saCompliance ? '✓ Cumple' : '✗ No cumple'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botón generar certificado si cumple */}
      {result.qualifies && result.analysisId && (
        <CertificateButton analysisId={result.analysisId} fractionCode={result.fractionCode}/>
      )}

      {/* Recomendaciones */}
      {result.recommendations.length > 0 && (
        <div className="rounded-xl bg-amber-50/40 border border-amber-100 p-4">
          <p className="text-[12px] font-semibold text-amber-800 mb-2 flex items-center gap-2">
            <FileWarning className="w-4 h-4" /> Recomendaciones
          </p>
          <ul className="space-y-1">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="text-[12px] text-slate-700 flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">→</span>
                <span>{rec.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
        <p className="text-[11px] text-slate-600 italic">{result.disclaimer}</p>
      </div>
    </div>
  )
}

function MaterialsBlock(props: {
  title: string
  subtitle: string
  tone: 'emerald' | 'rose'
  materials: Material[]
  totalLabel: string
  total: number
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<Material>) => void
  onRemove: (id: string) => void
}) {
  const accent = props.tone === 'emerald' ? 'text-emerald-600 hover:text-emerald-700' : 'text-rose-600 hover:text-rose-700'
  const totalAccent = props.tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700'
  return (
    <div className="mb-4 rounded-xl border border-slate-200/70 bg-white/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[12px] font-semibold text-slate-700">{props.title}</p>
          <p className="text-[10px] text-slate-500">{props.subtitle}</p>
        </div>
        <button onClick={props.onAdd} className={`text-[11px] font-medium ${accent} flex items-center gap-1`}>
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>
      <div className="space-y-1.5">
        {props.materials.map(m => (
          <div key={m.id} className="flex gap-2 items-center">
            <input className="flex-1 text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"
              placeholder="Descripción del material"
              value={m.description}
              onChange={e => props.onUpdate(m.id, { description: e.target.value })} />
            <input type="number" step="0.01" className="w-32 text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"
              placeholder="USD"
              value={m.valueUSD || ''}
              onChange={e => props.onUpdate(m.id, { valueUSD: parseFloat(e.target.value) || 0 })} />
            <button onClick={() => props.onRemove(m.id)} className="text-rose-500 hover:text-rose-700">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {props.materials.length === 0 && (
          <p className="text-[11px] text-slate-400 italic py-1">Sin materiales en esta categoría</p>
        )}
      </div>
      <div className={`mt-2 pt-2 border-t border-slate-100 flex justify-between text-[12px] font-semibold ${totalAccent}`}>
        <span>{props.totalLabel}</span>
        <span className="font-mono">${props.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}

function NumInput({ value, onChange, placeholder }: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <input type="number" step="0.01" className="w-full text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"
      placeholder={placeholder ?? '0.00'} value={value || ''}
      onChange={e => onChange(parseFloat(e.target.value) || 0)} />
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono">{children}</span>
}

function CertificateButton({ analysisId, fractionCode }: { analysisId: string; fractionCode: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full transition">
        <FileText className="w-4 h-4"/> Generar Certificado de Origen TMEC
      </button>
      {open && <CertificateModal analysisId={analysisId} fractionCode={fractionCode} onClose={() => setOpen(false)}/>}
    </>
  )
}

function CertificateModal({ analysisId, fractionCode, onClose }: { analysisId: string; fractionCode: string; onClose: () => void }) {
  const [form, setForm] = useState<OriginCertificateInput>({
    fractionCode,
    productDescription: '',
    exporterName: '',
    exporterAddress: '',
    exporterTaxId: '',
    importerName: '',
    importerAddress: '',
    importerTaxId: '',
    producerName: '',
    producerAddress: '',
    producerTaxId: '',
    originCountry: 'MX',
    preferenceCriterion: 'C',
    blanketPeriodFrom: '',
    blanketPeriodTo: '',
    signedBy: '',
    signedByRole: 'Apoderado legal',
    originAnalysisId: analysisId,
  })
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ id: string; certificateNumber: string } | null>(null)

  async function generate() {
    setBusy(true)
    try {
      const r = await api.originCertificateCreate({ ...form })
      setCreated({ id: r.data.id, certificateNumber: r.data.certificateNumber })
    } catch (e) { alert(e instanceof Error ? e.message : 'Error generando certificado') }
    setBusy(false)
  }

  function openPDF() {
    if (created) window.open(api.originCertificatePdfURL(created.id), '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100">
          <p className="text-[15px] font-bold text-slate-900">Certificado de Origen TMEC</p>
          <p className="text-[11px] text-slate-500">Completa los datos del exportador, importador y producto.</p>
        </div>
        {created ? (
          <div className="p-5 space-y-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <Award className="w-8 h-8 text-emerald-600 mx-auto mb-1"/>
              <p className="text-[13px] font-bold text-emerald-900">Certificado emitido</p>
              <p className="font-mono text-[11px] text-emerald-700 mt-1">{created.certificateNumber}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={openPDF} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                <FileText className="w-4 h-4"/> Abrir HTML imprimible
              </button>
              <button onClick={onClose} className="px-4 text-[12px] text-slate-500 hover:text-slate-800">Cerrar</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Field label="Fracción"><input value={form.fractionCode} onChange={e => setForm({...form, fractionCode: e.target.value})} className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
              <Field label="Descripción producto *"><input value={form.productDescription} onChange={e => setForm({...form, productDescription: e.target.value})} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
              <Field label="Exportador *"><input value={form.exporterName} onChange={e => setForm({...form, exporterName: e.target.value})} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
              <Field label="RFC/Tax ID Exportador"><input value={form.exporterTaxId} onChange={e => setForm({...form, exporterTaxId: e.target.value})} className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
              <Field label="Importador"><input value={form.importerName} onChange={e => setForm({...form, importerName: e.target.value})} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
              <Field label="RFC/Tax ID Importador"><input value={form.importerTaxId} onChange={e => setForm({...form, importerTaxId: e.target.value})} className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
              <Field label="País origen *">
                <select value={form.originCountry} onChange={e => setForm({...form, originCountry: e.target.value as 'MX' | 'US' | 'CA'})} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  <option value="MX">MX — México</option>
                  <option value="US">US — Estados Unidos</option>
                  <option value="CA">CA — Canadá</option>
                </select>
              </Field>
              <Field label="Criterio preferencia *">
                <select value={form.preferenceCriterion} onChange={e => setForm({...form, preferenceCriterion: e.target.value as 'A' | 'B' | 'C' | 'D' | 'E'})} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  <option value="A">A — Wholly obtained</option>
                  <option value="B">B — Materiales originarios</option>
                  <option value="C">C — Regla específica Anexo 4-B</option>
                  <option value="D">D — Sin cambio arancelario, RVC</option>
                  <option value="E">E — Excepción</option>
                </select>
              </Field>
              <Field label="Firmante *"><input value={form.signedBy} onChange={e => setForm({...form, signedBy: e.target.value})} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
              <Field label="Cargo *"><input value={form.signedByRole} onChange={e => setForm({...form, signedByRole: e.target.value})} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/></Field>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={generate} disabled={busy || !form.productDescription || !form.exporterName || !form.signedBy}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Award className="w-4 h-4"/>}
                {busy ? 'Generando...' : 'Generar certificado'}
              </button>
              <button onClick={onClose} className="px-4 text-[12px] text-slate-500 hover:text-slate-800">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
