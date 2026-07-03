import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { ClassificationResult, IndustrialSector, ImporterType, ClassifierAlert, ClassifierAntidumpingMetadata } from '../lib/api'
import { Search, Sparkles, AlertCircle, ThumbsUp, ThumbsDown, Copy, Check, Scale, ChevronDown, AlertTriangle, ShieldCheck, Car, Link as LinkIcon, Target, ExternalLink } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { ROITile } from '../components/ROIBanner'
import { NOMExceptionPanel } from '../components/NOMExceptionPanel'
import { PadronCheckBanner, PadronOkBadge } from './Settings/Padrones'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const SECTOR_OPTIONS: { value: IndustrialSector; label: string }[] = [
  { value: 'general', label: 'General / Comercializadora' },
  { value: 'automotive_terminal', label: 'Automotriz — armadora terminal (OEM)' },
  { value: 'automotive_parts', label: 'Automotriz — autopartista (Tier 1/2/3)' },
  { value: 'aeronautic', label: 'Aeronáutico / Aeroespacial' },
  { value: 'consumer_electronics', label: 'Electrónica de consumo' },
  { value: 'medical_pharma', label: 'Médico / Farmacéutico' },
  { value: 'construction', label: 'Construcción' },
  { value: 'textile_apparel', label: 'Textil / Confección' },
  { value: 'food_beverage', label: 'Alimentos y bebidas' },
  { value: 'industrial_machinery', label: 'Maquinaria industrial' },
  { value: 'agriculture', label: 'Agropecuario' },
  { value: 'oil_gas', label: 'Petróleo y gas' },
  { value: 'chemicals', label: 'Químicos' },
]

export function ClassifierPage() {
  const [query, setQuery] = useState('')
  const [context, setContext] = useState('')
  const [country, setCountry] = useState('')
  const [declaredValue, setDeclaredValue] = useState('')
  const [declaredQuantity, setDeclaredQuantity] = useState('')
  const [useCase, setUseCase] = useState('')
  const [sector, setSector] = useState<IndustrialSector | ''>('')
  const [importerType, setImporterType] = useState<ImporterType | ''>('')
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [classificationId, setClassificationId] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  // Fase 4.10 — UX: etapa visible durante los ~15s de clasificación + scroll al resultado
  const [stage, setStage] = useState(0)
  const resultRef = useRef<HTMLDivElement>(null)

  const STAGES = [
    'Buscando fracciones candidatas en el catálogo (8,256 fracciones TIGIE)…',
    'Analizando con IA — aplicando Reglas Generales de Interpretación…',
    'Verificando la fracción elegida contra el catálogo…',
  ]

  useEffect(() => {
    if (!loading) return
    setStage(0)
    const t1 = setTimeout(() => setStage(1), 4000)
    const t2 = setTimeout(() => setStage(2), 11000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [loading])

  useEffect(() => {
    // El resultado aparecía abajo sin desplazar la vista — el usuario se
    // quedaba viendo el formulario sin saber que ya terminó.
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  async function handleClassify() {
    if (!query.trim()) return
    setLoading(true); setError(''); setResult(null); setFeedbackSent(false)
    try {
      const declared = declaredValue ? parseFloat(declaredValue) : undefined
      const qty = declaredQuantity ? parseFloat(declaredQuantity) : undefined
      const extras = {
        useCase: useCase || undefined,
        sector: sector || undefined,
        importerType: importerType || undefined,
        // Cantidad declarada — habilita cálculo concreto de cuotas
        // compensatorias específicas (USD/kg). Sin esto el banner muestra
        // tasa pero no monto USD calculado.
        declaredQuantity: qty != null && Number.isFinite(qty) && qty > 0 ? qty : undefined,
      }
      const res = await api.classify(query, context || undefined, country || undefined, declared, extras)
      setResult(res.data)
      if (res.classificationId) setClassificationId(res.classificationId)
      else {
        const hist = await api.classifyHistory(query, 1)
        if (hist.data.length > 0) setClassificationId(hist.data[0]!.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al clasificar')
    }
    setLoading(false)
  }

  async function sendFeedback(fb: 'correct' | 'incorrect') {
    if (!classificationId) return
    try {
      await api.classifyFeedback(classificationId, fb)
      setFeedbackSent(true)
    } catch { /* silent */ }
  }

  function copyFraction() {
    if (!result) return
    navigator.clipboard.writeText(result.fraction.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Input card */}
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Clasificador Arancelario IA</h1>
        </div>

        <div className="mb-4"><ROITile moduleKey="classifier" /></div>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Describe el producto a importar</label>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ej: Laptop Dell Inspiron 15, pantalla 15.6 pulgadas, procesador Intel i7, 16GB RAM, 512GB SSD..."
              className="w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 resize-none h-28 transition-all"
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleClassify() }}
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Contexto adicional (opcional)</label>
            <input
              type="text"
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Ej: Para uso en oficina, importado de China"
              className="w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">País de origen (opcional — activa alertas de cuota compensatoria)</label>
              <input
                type="text"
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="China, Estados Unidos, Vietnam..."
                className="w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Valor unitario declarado USD (opcional — chequeo subvaloración)</label>
              <input
                type="number"
                step="0.01"
                value={declaredValue}
                onChange={e => setDeclaredValue(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
              Cantidad declarada (opcional — habilita cálculo concreto de cuota compensatoria USD/kg o USD/unidad)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={declaredQuantity}
              onChange={e => setDeclaredQuantity(e.target.value)}
              placeholder="Ej: 1500 (kg para cuotas USD/kg) o 200 (unidades para USD/unit)"
              className="w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
            />
            <p className="text-[10px] text-slate-400 mt-1 italic">
              Sin este dato el banner de cuota compensatoria muestra la tasa pero no el monto USD a pagar.
            </p>
          </div>

          {/* Contexto operacional — uso destinado, sector, tipo de importador */}
          <details className="rounded-xl bg-violet-50/30 border border-violet-100 p-3 group" open>
            <summary className="text-[12px] font-semibold text-violet-700 cursor-pointer flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5"/> Contexto operacional (mejora la clasificación por uso destinado)
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">Uso destinado</label>
                <input
                  type="text"
                  value={useCase}
                  onChange={e => setUseCase(e.target.value)}
                  placeholder="Ensamble vehicular, equipo médico, uso industrial..."
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">Sector industrial</label>
                <select
                  value={sector}
                  onChange={e => setSector(e.target.value as IndustrialSector | '')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/30">
                  <option value="">— Sin declarar —</option>
                  {SECTOR_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">Tipo de importador</label>
                <select
                  value={importerType}
                  onChange={e => setImporterType(e.target.value as ImporterType | '')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/30">
                  <option value="">— Sin declarar —</option>
                  <option value="IMMEX">IMMEX</option>
                  <option value="DEFINITIVO">Definitivo</option>
                  <option value="PERSONA_FISICA">Persona física</option>
                </select>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 italic">
              El uso destinado y sector pueden cambiar la fracción (ej. tornillo genérico cap 73 vs autoparte específica cap 87 si lo importa una armadora).
            </p>
          </details>
          <button
            onClick={handleClassify}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Clasificando...' : 'Clasificar con IA'}
          </button>

          {/* Fase 4.10: progreso por etapas — la espera de ~15s ya no es pantalla muda */}
          {loading && (
            <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
              {STAGES.map((s, i) => (
                <div key={i} className={`flex items-center gap-2 text-[12px] ${i < stage ? 'text-emerald-700' : i === stage ? 'text-emerald-800 font-semibold' : 'text-slate-400'}`}>
                  {i < stage
                    ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    : i === stage
                      ? <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />
                      : <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />}
                  <span>{s}</span>
                </div>
              ))}
              <p className="text-[10px] text-emerald-600/70 pt-1">La clasificación fundamentada suele tomar 10-20 segundos.</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <p className="text-[12px] text-rose-700">{error}</p>
          </div>
        )}
      </div>

      {/* Result card */}
      {result && (
        <div ref={resultRef} className={`${GLASS} rounded-[2rem] p-6 md:p-8 space-y-6 scroll-mt-4`}>
          {/* Disclaimer prominente Art. 54 LA */}
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <div className="flex items-start gap-3">
              <Scale className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-bold text-amber-900">Sugerencia de IA — Análisis técnico de apoyo</p>
                <p className="text-[12px] text-amber-800 mt-1 leading-relaxed">
                  ⚖️ La clasificación final es responsabilidad del agente aduanal certificado conforme al Art. 54 de la Ley Aduanera.
                  Este resultado es un apoyo técnico basado en GRI, notas legales y catálogo TIGIE; no sustituye el dictamen profesional ni constituye certeza fiscal vinculante.
                </p>
              </div>
            </div>
          </div>

          {/* Fraction header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Fracción sugerida</p>
              <div className="flex items-center gap-3">
                <p className="font-mono text-[32px] font-bold text-slate-900 tracking-tight">{formatFraction(result.fraction.code)}</p>
                <button onClick={copyFraction} className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center hover:bg-white transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </div>
              {result.nico && <p className="font-mono text-[13px] text-slate-500 mt-1">NICO: {result.nico}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Métrica técnica IA</p>
              <p className="text-[18px] font-semibold text-slate-700">{Math.round(result.confidence)}%</p>
              <p className="text-[10px] text-slate-400">no es certeza fiscal</p>
            </div>
          </div>

          {/* Padrones SAT — bloqueo si no inscrito */}
          {result.padronCheck && <PadronCheckBanner check={result.padronCheck}/>}
          {result.padronCheck?.canOperate && result.padronCheck.totalRequired > 0 && <PadronOkBadge totalRequired={result.padronCheck.totalRequired}/>}

          {/* Simular glosa */}
          <a
            href={`/simulador-glosa?fraction=${encodeURIComponent(result.fraction.code)}`}
            className="inline-flex items-center gap-1.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium"
          >
            <Target className="w-3.5 h-3.5"/> Simular glosa para esta fracción
          </a>

          {/* Alertas defensivas */}
          {result.alerts && result.alerts.length > 0 && (
            <div className="space-y-2">
              {result.alerts.map((a, i) => {
                // Banner enriquecido para cuota compensatoria — antidumping
                // sale prominente con todos los datos legales y cálculo
                // concreto si el classifier recibió declaredQuantity.
                if (a.type === 'antidumping') {
                  return <AntidumpingBanner key={i} alert={a} />
                }
                const isAutomotive = a.type === 'automotive'
                const isUndervalue = a.type === 'undervalue'
                const palette = a.severity === 'critical'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : isAutomotive
                    ? 'bg-orange-50 border-orange-200 text-orange-800'
                    : isUndervalue
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-sky-50 border-sky-200 text-sky-800'
                const Icon = isAutomotive ? Car
                  : isUndervalue ? AlertTriangle
                  : ShieldCheck
                return (
                  <div key={i} className={`rounded-xl border p-4 ${palette}`}>
                    <div className="flex items-start gap-3">
                      <Icon className="w-5 h-5 shrink-0 mt-0.5"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold">{a.title}</p>
                        <p className="text-[12px] mt-1 leading-relaxed whitespace-pre-line">{a.message}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Description */}
          <div className="bg-white/40 rounded-xl p-4">
            <p className="text-[12px] font-semibold text-slate-700 mb-1">{result.fraction.description}</p>
            <p className="text-[11px] text-slate-500">Capítulo {result.fraction.chapter} — Sección {result.fraction.section}</p>
          </div>

          {/* Alerta de litigios activos en la fracción/capítulo */}
          {result.litigationAlert?.active && result.litigationAlert.cases.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-[12px] font-bold text-rose-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4"/> ⚖️ Esta fracción ha sido objeto de litigios en TFJA
              </p>
              <ul className="space-y-1.5">
                {result.litigationAlert.cases.slice(0, 3).map(c => (
                  <li key={c.id} className="text-[11px] text-rose-700">
                    <span className="font-mono">[{c.type} {c.reference}]</span> {c.title}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-700 mt-2 italic">
                Considerar consulta vinculante al SAT (Art. 47 CFF) antes de operar volumen.
              </p>
            </div>
          )}

          {/* Precedentes legales aplicables */}
          {result.precedents && result.precedents.length > 0 && (
            <details className="rounded-xl border border-violet-200 bg-violet-50/30 group" open>
              <summary className="cursor-pointer p-4 text-[12px] font-bold text-violet-800 flex items-center gap-2">
                <Scale className="w-4 h-4"/> Precedentes y criterios aplicables ({result.precedents.length})
              </summary>
              <div className="px-4 pb-4 space-y-2">
                {result.precedents.map(p => (
                  <div key={p.id} className="rounded-lg bg-white border border-violet-100 p-3">
                    <div className="flex items-start gap-2 flex-wrap mb-1">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">{p.type}</span>
                      <span className="text-[9px] font-mono text-slate-500">{p.reference}</span>
                      <span className="text-[9px] text-slate-400">· {p.yearPublished}</span>
                      {p.litigated && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">⚖️</span>}
                      <span className="ml-auto text-[9px] uppercase tracking-wider text-slate-400">{p.topic}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-slate-900">{p.title}</p>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{p.summary}</p>
                    {p.applicability && (
                      <div className="mt-2 rounded bg-emerald-50 border border-emerald-100 p-2">
                        <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-0.5">Cómo aplica</p>
                        <p className="text-[11px] text-emerald-900">{p.applicability}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Análisis por uso — material vs uso destinado */}
          {result.useBasedAnalysis && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
              <p className="text-[12px] font-bold text-violet-800 mb-3 flex items-center gap-2">
                <Scale className="w-4 h-4"/> Análisis por uso destinado — dualidad de clasificación
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg bg-white border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Por material</p>
                  <p className="font-mono text-[16px] font-bold text-slate-900 mt-1">{result.useBasedAnalysis.byMaterial.code}</p>
                  <p className="text-[11px] text-slate-600 mt-1">{result.useBasedAnalysis.byMaterial.description}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Confianza: {result.useBasedAnalysis.byMaterial.confidence}%</p>
                </div>
                <div className="rounded-lg bg-white border border-amber-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Por uso destinado</p>
                  <p className="font-mono text-[16px] font-bold text-amber-900 mt-1">{result.useBasedAnalysis.byUse.code}</p>
                  <p className="text-[11px] text-slate-700 mt-1">{result.useBasedAnalysis.byUse.description}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Confianza: {result.useBasedAnalysis.byUse.confidence}%</p>
                </div>
              </div>

              <div className="space-y-2 text-[11px]">
                <div>
                  <p className="font-semibold text-slate-700">Criterio:</p>
                  <p className="text-slate-600 leading-relaxed">{result.useBasedAnalysis.criterion}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Recomendación:</p>
                  <p className="text-slate-600 leading-relaxed">{result.useBasedAnalysis.recommendation}</p>
                </div>
                <div className="rounded-lg bg-rose-50 border border-rose-100 p-2">
                  <p className="font-semibold text-rose-700">⚠ Riesgo:</p>
                  <p className="text-rose-700 leading-relaxed">{result.useBasedAnalysis.riskNote}</p>
                </div>
                {result.useBasedAnalysis.precedents.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-700">Precedentes:</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {result.useBasedAnalysis.precedents.map((p, i) => (
                        <li key={i} className="text-slate-600 text-[10px] font-mono">• {p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tariffs */}
          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-3">Aranceles</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white/40 rounded-xl p-3 text-center">
                <p className="text-[18px] font-bold text-slate-900">{result.tariffs.nmf}%</p>
                <p className="text-[10px] text-slate-500">IGI (NMF)</p>
              </div>
              {Object.entries(result.tariffs.preferential).slice(0, 3).map(([treaty, rate]) => (
                <div key={treaty} className="bg-emerald-50/50 rounded-xl p-3 text-center">
                  <p className="text-[18px] font-bold text-emerald-600">{rate}%</p>
                  <p className="text-[10px] text-slate-500">{treaty}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Regulations */}
          {(result.regulations.rrna.length > 0 || result.regulations.noms.length > 0) && (
            <div>
              <p className="text-[12px] font-semibold text-slate-700 mb-3">Regulaciones</p>
              <div className="flex flex-wrap gap-2">
                {result.regulations.noms.map((n, i) => (
                  <span key={i} className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{n}</span>
                ))}
                {result.regulations.rrna.map((r, i) => (
                  <span key={i} className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{r}</span>
                ))}
              </div>
            </div>
          )}

          {/* NOMs y excepciones Anexo 2.4.1 */}
          {result.regulations.noms.length > 0 && (
            <NOMExceptionPanel
              fractionCode={result.fraction.code}
              countryOfOrigin={country || undefined}
              knownNoms={result.regulations.noms.map(code => ({ code, authority: 'SE' }))}
              productDescription={query}
            />
          )}

          {/* Explanation */}
          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-2">Explicación</p>
            <p className="text-[13px] text-slate-600 leading-relaxed">{result.explanation?.simple ?? 'Sin explicación disponible para esta clasificación.'}</p>
          </div>

          {/* Fundamentación Legal */}
          {result.legalBasis && (
            (result.legalBasis.griApplied?.length ||
              result.legalBasis.legalNotes?.length ||
              result.legalBasis.discardedFractions?.length) ? (
              <div>
                <button
                  onClick={() => setLegalOpen(o => !o)}
                  className="w-full flex items-center justify-between bg-white/40 hover:bg-white/60 rounded-xl p-3 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-emerald-500" />
                    <p className="text-[12px] font-semibold text-slate-700">Fundamentación Legal</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${legalOpen ? 'rotate-180' : ''}`} />
                </button>
                {legalOpen && (
                  <div className="mt-3 space-y-4 bg-white/30 rounded-xl p-4">
                    {result.legalBasis.griApplied?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">GRI aplicadas</p>
                        <div className="space-y-2">
                          {result.legalBasis.griApplied.map((g, i) => (
                            <div key={i} className="bg-white/50 rounded-lg p-3">
                              <p className="text-[12px] font-semibold text-emerald-700">{g.rule}</p>
                              <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">{g.reasoning}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.legalBasis.legalNotes?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Notas legales revisadas</p>
                        <div className="space-y-2">
                          {result.legalBasis.legalNotes.map((n, i) => (
                            <div key={i} className="bg-amber-50/50 border border-amber-100 rounded-lg p-3">
                              <p className="text-[12px] font-semibold text-amber-800">{n.source}</p>
                              <p className="text-[12px] text-slate-700 mt-1 leading-relaxed italic">"{n.text}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.legalBasis.discardedFractions?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Partidas descartadas</p>
                        <div className="space-y-2">
                          {result.legalBasis.discardedFractions.map((d, i) => (
                            <div key={i} className="flex gap-3 bg-rose-50/40 border border-rose-100 rounded-lg p-3">
                              <p className="font-mono text-[12px] font-semibold text-rose-700 shrink-0">{d.code}</p>
                              <p className="text-[12px] text-slate-600 leading-relaxed">{d.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null
          )}

          {/* GRI */}
          {result.griApplied.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-slate-700 mb-2">GRI aplicadas</p>
              <div className="flex flex-wrap gap-2">
                {result.griApplied.map((g, i) => (
                  <span key={i} className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Alternatives */}
          {result.alternatives.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-slate-700 mb-3">Alternativas</p>
              <div className="space-y-2">
                {result.alternatives.map((alt, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/40 rounded-xl p-3">
                    <p className="font-mono text-[13px] font-semibold text-slate-800">{alt.code}</p>
                    <p className="text-[11px] text-slate-500 flex-1 line-clamp-1">{alt.description}</p>
                    <span className="text-[11px] font-bold text-emerald-500">{Math.round(alt.confidence)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback */}
          <div className="flex items-center gap-3 pt-4 border-t border-slate-200/50">
            <p className="text-[12px] text-slate-500">¿Resultado correcto?</p>
            {feedbackSent ? (
              <span className="text-[12px] text-emerald-600 font-medium">¡Gracias por tu feedback!</span>
            ) : (
              <>
                <button onClick={() => sendFeedback('correct')} className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-colors">
                  <ThumbsUp className="w-3 h-3" /> Sí
                </button>
                <button onClick={() => sendFeedback('incorrect')} className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full hover:bg-rose-100 transition-colors">
                  <ThumbsDown className="w-3 h-3" /> No
                </button>
              </>
            )}
          </div>

          {/* Footer regulatorio + verificable + dictamen */}
          {result.meta && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[10px] text-slate-600 space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p>
                    <span className="font-semibold">Consultado:</span> TIGIE {result.meta.tigieVersion} · LIGIE {result.meta.ligieVersion}
                    {result.meta.rgceVersion ? ` · RGCE ${result.meta.rgceVersion}` : ''}
                    {' · '}
                    <span className="font-mono">{new Date(result.meta.consultedAt).toLocaleString('es-MX')}</span>
                  </p>
                  {result.meta.modelUsed && (
                    <p className="text-slate-500">
                      <span className="font-semibold text-slate-600">Motor:</span> Motor ADUANAI
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <a href={result.meta.verifyUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[10px] font-medium px-2.5 py-1.5 rounded-full transition">
                    <LinkIcon className="w-3 h-3"/> Verificar
                  </a>
                  {classificationId && (
                    <a href={api.dictamenURL(classificationId)} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-full transition">
                      📄 Dictamen
                    </a>
                  )}
                </div>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 text-[10px]">Hashes de integridad</summary>
                <div className="mt-1.5 font-mono break-all space-y-0.5 text-slate-500">
                  <p><span className="text-slate-400">consult:</span> {result.meta.consultHash}</p>
                  {result.meta.inputHash && <p><span className="text-slate-400">input:</span> {result.meta.inputHash}</p>}
                  {result.meta.outputHash && <p><span className="text-slate-400">output:</span> {result.meta.outputHash}</p>}
                  {result.meta.knowledgeBaseHash && <p><span className="text-slate-400">kb:</span> {result.meta.knowledgeBaseHash}</p>}
                </div>
              </details>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-slate-400 italic">{result.disclaimer}</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Banner cuota compensatoria — prominente, datos legales completos
// ─────────────────────────────────────────────────────────────────────

function shortDate(iso: string | null): string {
  if (!iso) return 's/d'
  try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

function AntidumpingBanner({ alert }: { alert: ClassifierAlert }) {
  // El backend ya envía metadata tipada con todos los campos. Cast porque
  // ClassifierAlert.metadata es Record | ClassifierAntidumpingMetadata.
  const m = alert.metadata as ClassifierAntidumpingMetadata | undefined
  if (!m) {
    // Fallback al render plano si no llegó metadata (no debería pasar)
    return (
      <div className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-5">
        <p className="text-[14px] font-bold text-red-900">{alert.title}</p>
        <p className="text-[12px] text-red-800 mt-1 whitespace-pre-line">{alert.message}</p>
      </div>
    )
  }
  const isPrefixMatch = m.matchType !== 'exact'
  return (
    <div className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5"/>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold text-red-900 leading-tight">🚨 CUOTA COMPENSATORIA ACTIVA</h3>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] text-red-800">
            {m.resolutionNumber && (
              <p><span className="font-semibold">Resolución:</span> <span className="font-mono">{m.resolutionNumber}</span>{m.expedienteUPCI ? <span className="text-red-600"> · {m.expedienteUPCI}</span> : null}</p>
            )}
            <p><span className="font-semibold">Origen:</span> {m.countryNormalized}</p>
            {m.productDesc && <p className="md:col-span-2"><span className="font-semibold">Producto:</span> {m.productDesc}</p>}
            <p className="md:col-span-2"><span className="font-semibold">Cuota:</span> <span className="font-mono text-red-900">{m.rateLabel}</span></p>
            {m.calculatedAmountUSD != null && (
              <p className="md:col-span-2 mt-1 rounded bg-white/60 border border-red-200 px-2 py-1 text-[11px]">
                <span className="font-semibold">Cálculo:</span> <span className="font-mono">${m.calculatedAmountUSD.toFixed(2)} USD</span>
                {m.potentialPenaltyUSDMin != null && m.potentialPenaltyUSDMax != null && (
                  <span className="text-red-600"> · Multa potencial 130-150%: <span className="font-mono">${m.potentialPenaltyUSDMin.toFixed(0)} – ${m.potentialPenaltyUSDMax.toFixed(0)} USD</span></span>
                )}
              </p>
            )}
            {m.effectiveDate && <p><span className="font-semibold">Vigente desde:</span> {shortDate(m.effectiveDate)}</p>}
            {m.expiryDate && <p><span className="font-semibold">Vence:</span> {shortDate(m.expiryDate)}</p>}
          </div>
          <div className="mt-3 rounded-lg bg-red-100 border border-red-300 p-3">
            <p className="text-[11px] font-bold text-red-900 uppercase tracking-wider mb-1">⚠️ Omitir en pedimento</p>
            <ul className="text-[11px] text-red-800 space-y-0.5">
              <li>• Multa 130-150% sobre impuesto omitido (Art. 178 LA)</li>
              <li>• Embargo precautorio (Art. 151 LA)</li>
              <li>• Suspensión de operaciones</li>
            </ul>
          </div>
          {isPrefixMatch && m.matchedFraction && (
            <div className="mt-2 rounded-lg bg-amber-100 border border-amber-300 p-2.5">
              <p className="text-[11px] text-amber-900">
                ⚠️ <span className="font-semibold">Match por {m.matchType === 'subheading' ? 'subpartida' : 'partida'}</span> ({m.matchedFraction}) — verifica que tu fracción específica esté cubierta por la resolución antes de declarar.
              </p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {m.dofUrl && (
              <a href={m.dofUrl} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-700 border border-red-300 hover:bg-red-100 px-3 py-1.5 rounded-lg">
                Ver resolución oficial <ExternalLink className="w-3 h-3"/>
              </a>
            )}
            <a href="/cuotas-activas"
               className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-700 border border-red-300 hover:bg-red-100 px-3 py-1.5 rounded-lg">
              Ver más cuotas activas <LinkIcon className="w-3 h-3"/>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
