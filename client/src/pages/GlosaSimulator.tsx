import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Target, ChevronRight, ChevronLeft, AlertTriangle, FileText, ShieldCheck, Download, Save, RotateCcw, Clock } from 'lucide-react'
import { api } from '../lib/api'
import type { GlosaSimulationInput, GlosaSimulationResult, GlosaSimulationListItem } from '../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const STEPS = [
  { id: 1, label: 'Identificación' },
  { id: 2, label: 'Mercancía' },
  { id: 3, label: 'Documentación' },
  { id: 4, label: 'Resultado' },
]

const CUSTOMS = [
  { code: 'MAN', name: 'Manzanillo' },
  { code: 'VER', name: 'Veracruz' },
  { code: 'TIJ', name: 'Tijuana' },
  { code: 'NLD', name: 'Nuevo Laredo' },
  { code: 'ZLO', name: 'Zaragoza Coahuila' },
  { code: 'LZC', name: 'Lázaro Cárdenas' },
  { code: 'ALT', name: 'Altamira' },
  { code: 'PRO', name: 'Progreso' },
  { code: 'AICM', name: 'AICM (CDMX)' },
  { code: 'NUS', name: 'Nogales' },
]

const REGIMES = [
  { code: 'A1', name: 'Definitivo' },
  { code: 'A4', name: 'Temporal IMMEX' },
  { code: 'F4', name: 'Depósito fiscal' },
  { code: 'IN', name: 'Importación temporal IMMEX (IN)' },
  { code: 'RT', name: 'Retorno' },
  { code: 'R1', name: 'Regularización' },
]

const COUNTRIES = ['CN', 'US', 'MX', 'VN', 'IN', 'KR', 'JP', 'DE', 'IT', 'BR', 'TW', 'TH', 'MY', 'ID', 'KH', 'CA']

function emptyInput(): GlosaSimulationInput {
  return {
    fractionCode: '',
    productDescription: '',
    countryOrigin: 'CN',
    countryProvider: 'CN',
    customsCode: 'MAN',
    regimenCode: 'A1',
    unitValueUSD: 0,
    unitMeasure: 'PIEZA',
    units: 1,
    weightKg: 0,
    totalValueUSD: 0,
    declaresAntidumping: false,
    declaresLink: false,
    appliesTMEC: false,
    hasTMECCertificate: false,
    declaresNOMs: false,
    hasIVAIEPSCertification: false,
    documents: {
      invoice: true, bl: true, packingList: true,
      originCertificate: false, mve: false, permits: false, nomCertificates: false,
    },
  }
}

export function GlosaSimulatorPage() {
  const [params] = useSearchParams()
  const [step, setStep] = useState(1)
  const [input, setInput] = useState<GlosaSimulationInput>(emptyInput())
  const [result, setResult] = useState<GlosaSimulationResult | null>(null)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState('')
  const [history, setHistory] = useState<GlosaSimulationListItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Pre-fill desde query params (cuando vengo del clasificador / cotizador / pre-validador).
  // Se aplica UNA sola vez y solo con valores NO vacíos, para que nunca pise/borre lo
  // que el usuario teclee después (un ?fraction= vacío no debe vaciar el campo).
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current) return
    const fc = params.get('fraction')
    const co = params.get('origin')
    const v = params.get('valueUSD')
    if (fc || co || v) {
      prefilled.current = true
      setInput(prev => ({
        ...prev,
        ...(fc ? { fractionCode: fc } : {}),
        ...(co ? { countryOrigin: co, countryProvider: co } : {}),
        ...(v ? { unitValueUSD: parseFloat(v), totalValueUSD: parseFloat(v) } : {}),
      }))
    }
  }, [params])

  useEffect(() => {
    if (showHistory) api.glosaHistory().then(r => setHistory(r.data)).catch(() => setHistory([]))
  }, [showHistory])

  function update<K extends keyof GlosaSimulationInput>(key: K, value: GlosaSimulationInput[K]) {
    setInput(prev => ({ ...prev, [key]: value }))
  }

  function updateDocs(key: string, value: boolean) {
    setInput(prev => ({ ...prev, documents: { ...prev.documents, [key]: value } }))
  }

  async function runSimulation() {
    setRunning(true); setErr('')
    try {
      const totalUSD = input.totalValueUSD || (input.unitValueUSD * (input.units ?? 1))
      const r = await api.glosaSimulate({ ...input, totalValueUSD: totalUSD })
      setResult(r.data)
      setStep(4)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al simular')
    }
    setRunning(false)
  }

  function reset() {
    setInput(emptyInput())
    setResult(null)
    setStep(1)
    setErr('')
  }

  const fractionDigits = input.fractionCode.replace(/\D/g, '').length

  // Campos requeridos faltantes en el paso actual (para mostrar al usuario qué
  // completar en vez de dejar el botón "Siguiente" deshabilitado en silencio).
  const missing = useMemo(() => {
    const m: string[] = []
    if (step === 1) {
      if (!input.customsCode) m.push('aduana')
      if (!input.regimenCode) m.push('régimen')
    } else if (step === 2) {
      if (fractionDigits < 8) m.push('fracción arancelaria (8 dígitos)')
      if (!(input.unitValueUSD > 0)) m.push('valor unitario USD')
      if (!(input.weightKg > 0)) m.push('peso bruto (kg)')
    }
    return m
  }, [step, input, fractionDigits])

  const canAdvance = missing.length === 0

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Simulador de Glosa</h1>
          <button onClick={() => setShowHistory(prev => !prev)} className="ml-auto text-[11px] flex items-center gap-1 text-slate-600 hover:text-slate-900">
            <Clock className="w-3 h-3"/> {showHistory ? 'Cerrar histórico' : 'Histórico'}
          </button>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Predice probabilidad de Reconocimiento Aduanero (RA) basado en el modelo de riesgo del SAT. Simula antes de despachar para evitar embargos y demoras.</p>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                step === s.id ? 'bg-emerald-600 text-white' : step > s.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
              }`}>{step > s.id ? '✓' : s.id}</div>
              <span className={`text-[11px] truncate ${step === s.id ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${step > s.id ? 'bg-emerald-300' : 'bg-slate-200'}`}/>}
            </div>
          ))}
        </div>
      </div>

      {showHistory && <HistoryPanel items={history}/>}

      {/* Paso 1 */}
      {step === 1 && (
        <div className={`${GLASS} rounded-2xl p-5 space-y-3`}>
          <h2 className="text-[13px] font-semibold text-slate-900">Identificación del pedimento</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Aduana de despacho">
              <select value={input.customsCode} onChange={e => update('customsCode', e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5">
                {CUSTOMS.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label="Régimen aduanero">
              <select value={input.regimenCode} onChange={e => update('regimenCode', e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5">
                {REGIMES.map(r => <option key={r.code} value={r.code}>{r.code} — {r.name}</option>)}
              </select>
            </Field>
            <Field label="¿IMMEX con certificación IVA-IEPS?">
              <select value={String(input.hasIVAIEPSCertification ?? false)} onChange={e => update('hasIVAIEPSCertification', e.target.value === 'true')} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5">
                <option value="false">No</option>
                <option value="true">Sí (A/AA/AAA)</option>
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* Paso 2 */}
      {step === 2 && (
        <div className={`${GLASS} rounded-2xl p-5 space-y-3`}>
          <h2 className="text-[13px] font-semibold text-slate-900">Datos de la mercancía</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Fracción arancelaria (8 dígitos)">
              <input value={input.fractionCode} onChange={e => update('fractionCode', e.target.value)} placeholder="7318.15.99" className="w-full text-[13px] font-mono border border-slate-200 rounded-lg px-2 py-1.5"/>
            </Field>
            <Field label="País de origen (ISO-2)">
              <select value={input.countryOrigin} onChange={e => update('countryOrigin', e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5">
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="País de embarque (ISO-2)">
              <select value={input.countryProvider} onChange={e => update('countryProvider', e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5">
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Unidad de medida">
              <select value={input.unitMeasure} onChange={e => update('unitMeasure', e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5">
                <option>PIEZA</option><option>KILOGRAMO</option><option>METRO</option><option>LITRO</option><option>TONELADA</option>
              </select>
            </Field>
            <Field label="Cantidad">
              <input type="number" value={input.units ?? ''} onChange={e => update('units', parseInt(e.target.value) || 0)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
            </Field>
            <Field label="Valor unitario USD">
              <input type="number" step="0.01" value={input.unitValueUSD || ''} onChange={e => update('unitValueUSD', parseFloat(e.target.value) || 0)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
            </Field>
            <Field label="Valor total USD">
              <input type="number" step="0.01" value={input.totalValueUSD || ''} onChange={e => update('totalValueUSD', parseFloat(e.target.value) || 0)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
            </Field>
            <Field label="Peso bruto (kg)">
              <input type="number" step="0.01" value={input.weightKg || ''} onChange={e => update('weightKg', parseFloat(e.target.value) || 0)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
            </Field>
            <Field label="Descripción detallada del producto" full>
              <textarea value={input.productDescription ?? ''} onChange={e => update('productDescription', e.target.value)} rows={3} placeholder="Ej. Tornillos de acero zincado cabeza hexagonal métrica M10x40, marca XYZ, modelo 12345…" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5"/>
            </Field>
          </div>
        </div>
      )}

      {/* Paso 3 */}
      {step === 3 && (
        <div className={`${GLASS} rounded-2xl p-5 space-y-4`}>
          <h2 className="text-[13px] font-semibold text-slate-900">Documentación y declaraciones</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Checkbox checked={input.documents?.invoice ?? false} onChange={v => updateDocs('invoice', v)} label="Factura comercial"/>
            <Checkbox checked={input.documents?.bl ?? false} onChange={v => updateDocs('bl', v)} label="BL / Guía aérea"/>
            <Checkbox checked={input.documents?.packingList ?? false} onChange={v => updateDocs('packingList', v)} label="Packing list"/>
            <Checkbox checked={input.documents?.originCertificate ?? false} onChange={v => updateDocs('originCertificate', v)} label="Certificado de origen"/>
            <Checkbox checked={input.documents?.mve ?? false} onChange={v => updateDocs('mve', v)} label="MVE (Manifestación de Valor)"/>
            <Checkbox checked={input.documents?.permits ?? false} onChange={v => updateDocs('permits', v)} label="Permisos previos"/>
            <Checkbox checked={input.documents?.nomCertificates ?? false} onChange={v => updateDocs('nomCertificates', v)} label="Certificados NOM"/>
          </div>
          <div className="border-t border-slate-200 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Checkbox checked={input.declaresAntidumping ?? false} onChange={v => update('declaresAntidumping', v)} label="Declaro cuotas compensatorias (si aplican)"/>
            <Checkbox checked={input.appliesTMEC ?? false} onChange={v => update('appliesTMEC', v)} label="Aplica preferencia TMEC"/>
            <Checkbox checked={input.hasTMECCertificate ?? false} onChange={v => update('hasTMECCertificate', v)} label="Tengo certificado TMEC firmado"/>
            <Checkbox checked={input.declaresNOMs ?? false} onChange={v => update('declaresNOMs', v)} label="Declaro cumplimiento NOMs aplicables"/>
            <Checkbox checked={input.declaresLink ?? false} onChange={v => update('declaresLink', v)} label="Hay vinculación comprador-vendedor (declarada)"/>
          </div>
        </div>
      )}

      {/* Paso 4 - Resultado */}
      {step === 4 && result && <ResultPanel result={result} onReset={reset} simulationId={result.simulationId}/>}

      {err && <p className="text-[11px] text-rose-700">{err}</p>}

      {/* Nav */}
      {step < 4 && (
        <div className="space-y-2">
        {missing.length > 0 && (
          <p className="text-[11px] text-amber-700">
            Para continuar, completa: {missing.join(', ')}.
          </p>
        )}
        <div className="flex justify-between">
          <button onClick={() => setStep(prev => Math.max(1, prev - 1))} disabled={step === 1} className="text-[12px] text-slate-600 hover:text-slate-900 disabled:opacity-30 flex items-center gap-1">
            <ChevronLeft className="w-3 h-3"/> Anterior
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(prev => prev + 1)} disabled={!canAdvance} className="text-[12px] bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg flex items-center gap-1">
              Siguiente <ChevronRight className="w-3 h-3"/>
            </button>
          ) : (
            <button onClick={runSimulation} disabled={running || !canAdvance} className="text-[12px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg flex items-center gap-1">
              {running ? 'Simulando…' : 'Simular glosa'} <Target className="w-3 h-3"/>
            </button>
          )}
        </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-emerald-600"/>
      {label}
    </label>
  )
}

function HistoryPanel({ items }: { items: GlosaSimulationListItem[] }) {
  return (
    <div className={`${GLASS} rounded-2xl p-4`}>
      <p className="text-[12px] font-semibold text-slate-900 mb-2">Histórico de simulaciones</p>
      {items.length === 0 ? <p className="text-[11px] text-slate-400 italic">Sin simulaciones previas</p> : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-1.5 text-slate-500 font-medium">Fecha</th>
              <th className="py-1.5 text-slate-500 font-medium">Fracción</th>
              <th className="py-1.5 text-slate-500 font-medium">Aduana</th>
              <th className="py-1.5 text-slate-500 font-medium">Riesgo</th>
              <th className="py-1.5 text-slate-500 font-medium text-right">RA prob</th>
              <th className="py-1.5 text-slate-500 font-medium">Resultado real</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr key={s.id} className="border-b border-slate-100/50">
                <td className="py-1.5 text-slate-600">{new Date(s.createdAt).toLocaleDateString('es-MX')}</td>
                <td className="py-1.5 font-mono">{s.fractionCode}</td>
                <td className="py-1.5">{s.customsCode}</td>
                <td className="py-1.5"><RiskBadge level={s.riskLevel}/></td>
                <td className="py-1.5 text-right font-mono">{s.raProbability}%</td>
                <td className="py-1.5 text-[10px]">
                  {s.actualOutcome ? <span className="text-slate-700">{s.actualOutcome}</span> : <span className="text-slate-400 italic">pendiente</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-800 border-rose-200',
    high: 'bg-amber-100 text-amber-800 border-amber-200',
    medium: 'bg-sky-100 text-sky-800 border-sky-200',
    low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  }
  const label: Record<string, string> = { critical: 'CRÍTICO', high: 'ALTO', medium: 'MEDIO', low: 'BAJO' }
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${map[level] ?? map.low}`}>{label[level] ?? level}</span>
}

function ResultPanel({ result, onReset, simulationId }: { result: GlosaSimulationResult; onReset: () => void; simulationId: string }) {
  const [outcomeLogged, setOutcomeLogged] = useState(false)
  const ringClass = result.riskLevel === 'critical' ? 'stroke-rose-500' :
                    result.riskLevel === 'high' ? 'stroke-amber-500' :
                    result.riskLevel === 'medium' ? 'stroke-sky-500' : 'stroke-emerald-500'
  const radius = 60
  const circ = 2 * Math.PI * radius
  const offset = circ - (result.riskScore / 100) * circ

  async function logOutcome(outcome: 'ra_yes' | 'ra_no' | 'documental' | 'free') {
    try {
      await api.glosaOutcome(simulationId, outcome)
      setOutcomeLogged(true)
    } catch {}
  }

  return (
    <div className="space-y-4">
      {/* Score */}
      <div className={`${GLASS} rounded-2xl p-6`}>
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-6">
            <svg width="140" height="140" className="shrink-0">
              <circle cx="70" cy="70" r={radius} className="stroke-slate-200" strokeWidth="10" fill="none"/>
              <circle
                cx="70" cy="70" r={radius}
                className={ringClass}
                strokeWidth="10"
                fill="none"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
              />
              <text x="70" y="70" textAnchor="middle" className="fill-slate-900 font-bold" fontSize="28">{result.riskScore}</text>
              <text x="70" y="90" textAnchor="middle" className="fill-slate-500" fontSize="10">de 100</text>
            </svg>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Nivel de riesgo</p>
              <p className="text-[20px] font-bold"><RiskBadge level={result.riskLevel}/></p>
              <p className="text-[12px] text-slate-700 mt-2">Probabilidad de RA: <strong className="text-rose-700">{result.raProbability}%</strong></p>
              <p className="text-[11px] text-slate-500">Cotejo documental: {result.cotejoProb}% · Glosa: {result.glosaProb}%</p>
            </div>
          </div>
          <div className="text-[11px] space-y-0.5">
            {result.industryAverage !== null && <p className="text-slate-600">Promedio industria: <strong>{result.industryAverage}%</strong></p>}
            {result.yourHistory !== null && <p className="text-slate-600">Tu histórico: <strong>{result.yourHistory}%</strong></p>}
          </div>
        </div>
      </div>

      {/* Banderas */}
      {result.flags.length > 0 && (
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 text-amber-600"/> Banderas detectadas ({result.flags.length})
          </p>
          <div className="space-y-2">
            {result.flags.map((f, i) => (
              <div key={i} className={`rounded-xl border p-3 ${
                f.severity === 'critical' ? 'bg-rose-50 border-rose-200' :
                f.severity === 'high' ? 'bg-amber-50 border-amber-200' :
                f.severity === 'medium' ? 'bg-sky-50 border-sky-200' :
                'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                    f.severity === 'critical' ? 'bg-rose-200 text-rose-900' :
                    f.severity === 'high' ? 'bg-amber-200 text-amber-900' :
                    f.severity === 'medium' ? 'bg-sky-200 text-sky-900' :
                    'bg-slate-200 text-slate-700'
                  }`}>{f.severity}</span>
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-slate-900">{f.name}</p>
                    <p className="text-[11px] text-slate-700 mt-0.5">{f.reason}</p>
                    <p className="text-[10px] text-slate-600 mt-1">→ {f.recommendation}</p>
                    {f.legalBasis && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{f.legalBasis}</p>}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">{f.ruleCode}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendaciones */}
      {result.recommendations.length > 0 && (
        <div className={`${GLASS} rounded-2xl p-5`}>
          <p className="text-[13px] font-semibold text-slate-900 mb-2 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600"/> Recomendaciones prioritarias
          </p>
          {result.recommendations.map((r, i) => (
            <div key={i} className="mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: r.priority === 'critical' ? '#be123c' : '#0369a1' }}>
                {r.priority === 'critical' ? '🔴 Resolver antes de despachar' : '📋 Preparar para posible RA'}
              </p>
              <ul className="space-y-1 ml-4">
                {r.items.map((item, j) => <li key={j} className="text-[11px] text-slate-700 list-disc">{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <p className="text-[10px] text-slate-600 italic">{result.disclaimer}</p>
      </div>

      {/* Acciones */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={onReset} className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          <RotateCcw className="w-3 h-3"/> Nueva simulación
        </button>
        <a href={`/api/glosa/${simulationId}`} target="_blank" rel="noreferrer" className="text-[11px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1">
          <Download className="w-3 h-3"/> JSON completo
        </a>
        <button onClick={() => window.print()} className="text-[11px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1">
          <FileText className="w-3 h-3"/> Imprimir
        </button>
      </div>

      {/* Feedback de aprendizaje */}
      <div className={`${GLASS} rounded-2xl p-4`}>
        {outcomeLogged ? (
          <p className="text-[11px] text-emerald-700 text-center">✓ Resultado registrado — gracias, mejora la calibración del modelo.</p>
        ) : (
          <>
            <p className="text-[11px] text-slate-700 mb-2">Una vez despachado, ¿qué pasó realmente? (mejora el modelo)</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => logOutcome('ra_yes')} className="text-[10px] bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded-lg">Hubo RA</button>
              <button onClick={() => logOutcome('documental')} className="text-[10px] bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg">Solo documental</button>
              <button onClick={() => logOutcome('ra_no')} className="text-[10px] bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-700 px-2.5 py-1 rounded-lg">Sin RA</button>
              <button onClick={() => logOutcome('free')} className="text-[10px] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg">Despacho libre</button>
            </div>
          </>
        )}
      </div>

      <button onClick={() => { /* save persisted ya */ }} className="hidden">
        <Save/>
      </button>
    </div>
  )
}
