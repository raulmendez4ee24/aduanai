import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle, FileWarning, FileText, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import type { NOMEvaluation, NOMOperationContext, CartaNoComercializacionInput } from '../lib/api'

interface Props {
  fractionCode: string
  countryOfOrigin?: string
  /** NOMs ya conocidas (si se omite, el panel las busca por compliance-lookup) */
  knownNoms?: { code: string; authority?: string; description?: string }[]
  /** Descripción del producto, para prefill del generador de carta */
  productDescription?: string
}

const DEFAULT_CONTEXT: NOMOperationContext = {
  immex: false,
  productive: false,
  consumerFinal: true,
  automotive: false,
  industrialEquipment: false,
  ownUse: false,
  personalUse: false,
  samples: false,
  repair: false,
  reExport: false,
  governmentImport: false,
  willLabelInMexico: false,
  fair: false,
}

export function NOMExceptionPanel({ fractionCode, countryOfOrigin, knownNoms, productDescription }: Props) {
  const [context, setContext] = useState<NOMOperationContext>(DEFAULT_CONTEXT)
  const [evaluations, setEvaluations] = useState<NOMEvaluation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasNoms, setHasNoms] = useState<boolean | null>(null) // null = aún no evaluado
  const [showCartaModal, setShowCartaModal] = useState<NOMEvaluation | null>(null)

  async function evaluate(ctx: NOMOperationContext) {
    if (!fractionCode) return
    setLoading(true); setError('')
    try {
      const r = await api.nomsEvaluate({
        fractionCode,
        countryOfOrigin,
        context: ctx,
        noms: knownNoms,
      })
      setEvaluations(r.data.evaluations)
      setHasNoms(r.data.evaluations.length > 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error evaluando NOMs')
    }
    setLoading(false)
  }

  useEffect(() => {
    evaluate(context)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fractionCode, countryOfOrigin, JSON.stringify(knownNoms)])

  function toggle(key: keyof NOMOperationContext) {
    const next = { ...context, [key]: !context[key] }
    // Si marca productive, asume no consumerFinal
    if (key === 'productive' && next.productive) next.consumerFinal = false
    if (key === 'consumerFinal' && next.consumerFinal) next.productive = false
    setContext(next)
    evaluate(next)
  }

  if (hasNoms === false) return null

  return (
    <div className="rounded-xl bg-violet-50/30 border border-violet-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-violet-600"/> NOMs y excepciones (Anexo 2.4.1)
        </p>
        {loading && <RefreshCw className="w-3 h-3 animate-spin text-slate-400"/>}
      </div>

      {/* Contexto operativo */}
      <div className="mb-3 rounded-lg bg-white/60 p-3">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Contexto de la operación</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          <Toggle ctx={context} k="immex" label="IMMEX" onToggle={toggle}/>
          <Toggle ctx={context} k="productive" label="Insumo productivo" onToggle={toggle}/>
          <Toggle ctx={context} k="consumerFinal" label="Consumidor final" onToggle={toggle}/>
          <Toggle ctx={context} k="automotive" label="Automotriz terminal" onToggle={toggle}/>
          <Toggle ctx={context} k="industrialEquipment" label="Maquinaria/equipo industrial" onToggle={toggle}/>
          <Toggle ctx={context} k="ownUse" label="Uso propio (activo fijo)" onToggle={toggle}/>
          <Toggle ctx={context} k="samples" label="Muestras sin valor" onToggle={toggle}/>
          <Toggle ctx={context} k="willLabelInMexico" label="Se etiquetará en MX" onToggle={toggle}/>
          <Toggle ctx={context} k="repair" label="Reparación + retorno" onToggle={toggle}/>
        </div>
      </div>

      {/* Resultados por NOM */}
      <div className="space-y-2">
        {evaluations.map(ev => {
          const palette = ev.severity === 'critical' ? 'bg-rose-50 border-rose-200 text-rose-800'
            : ev.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
            : ev.severity === 'info' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-sky-50 border-sky-200 text-sky-800'
          const Icon = ev.severity === 'critical' ? AlertTriangle
            : ev.severity === 'warning' ? AlertTriangle
            : ShieldCheck
          return (
            <div key={ev.nomCode} className={`rounded-xl border p-3 ${palette}`}>
              <div className="flex items-start gap-2">
                <Icon className="w-4 h-4 shrink-0 mt-0.5"/>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold">{ev.nomCode} <span className="text-[10px] opacity-70 font-normal">· {ev.authority}</span></p>
                  {ev.description && <p className="text-[11px] opacity-80 mt-0.5">{ev.description}</p>}
                  <p className="text-[12px] mt-1">{ev.message}</p>

                  {ev.exception && (
                    <div className="mt-2 rounded-lg bg-white/60 p-2 text-[11px]">
                      <p><strong>{ev.exception.exceptionCode}</strong> — {ev.exception.description}</p>
                      {ev.exception.requiredDoc && (
                        <p className="mt-1"><strong>Documento:</strong> {ev.exception.requiredDoc}</p>
                      )}
                      {ev.exception.legalBasis && (
                        <p className="text-[10px] opacity-60 italic mt-1">{ev.exception.legalBasis}</p>
                      )}
                      {ev.exception.requiredDoc?.toLowerCase().includes('no comercialización') && (
                        <button
                          onClick={() => setShowCartaModal(ev)}
                          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-full transition">
                          <FileText className="w-3 h-3"/> Generar Carta de No Comercialización
                        </button>
                      )}
                    </div>
                  )}

                  {ev.fullComplianceRequirements && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold opacity-80">Requisitos de cumplimiento:</p>
                      <ul className="mt-1 space-y-0.5">
                        {ev.fullComplianceRequirements.map((r, i) => (
                          <li key={i} className="text-[11px] flex items-start gap-1.5">
                            <FileWarning className="w-3 h-3 shrink-0 mt-0.5 opacity-60"/>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {evaluations.length === 0 && hasNoms === null && (
          <p className="text-[11px] text-slate-400 italic">Buscando NOMs aplicables...</p>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-rose-50 border border-rose-100">
          <AlertTriangle className="w-3 h-3 text-rose-500"/>
          <p className="text-[11px] text-rose-700">{error}</p>
        </div>
      )}

      {showCartaModal && (
        <CartaModal
          evaluation={showCartaModal}
          fractionCode={fractionCode}
          productDescription={productDescription ?? ''}
          allNoms={evaluations.map(e => e.nomCode)}
          onClose={() => setShowCartaModal(null)}
        />
      )}
    </div>
  )
}

function Toggle({ ctx, k, label, onToggle }: { ctx: NOMOperationContext; k: keyof NOMOperationContext; label: string; onToggle: (k: keyof NOMOperationContext) => void }) {
  const active = !!ctx[k]
  return (
    <button onClick={() => onToggle(k)}
      className={`text-[11px] px-2 py-1 rounded-md text-left transition ${active ? 'bg-violet-600 text-white font-medium' : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300'}`}>
      {active ? '✓ ' : ''}{label}
    </button>
  )
}

function CartaModal(props: { evaluation: NOMEvaluation; fractionCode: string; productDescription: string; allNoms: string[]; onClose: () => void }) {
  const [form, setForm] = useState<CartaNoComercializacionInput>({
    empresa: '',
    rfc: '',
    immexNumber: '',
    domicilioFiscal: '',
    representanteLegal: '',
    representanteCargo: 'Apoderado legal',
    fractionCode: props.fractionCode,
    productDescription: props.productDescription,
    noms: props.allNoms,
    destination: 'Insumo productivo, no destinado a consumidor final',
    exceptionCode: props.evaluation.exception?.exceptionCode ?? 'Anexo 2.4.1',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleGenerate() {
    setSubmitting(true)
    try {
      const token = localStorage.getItem('aduanai_token')
      const res = await fetch(api.nomsCartaURL(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Error generando carta')
      }
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      props.onClose()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <p className="text-[14px] font-bold text-slate-900 mb-1">Carta de No Comercialización</p>
        <p className="text-[11px] text-slate-500 mb-4">Completa los datos del importador para generar el documento imprimible.</p>

        <div className="grid grid-cols-2 gap-2">
          <Input label="Empresa importadora *" value={form.empresa} onChange={v => setForm({...form, empresa: v})} />
          <Input label="RFC *" value={form.rfc} onChange={v => setForm({...form, rfc: v})} />
          <Input label="Programa IMMEX" value={form.immexNumber ?? ''} onChange={v => setForm({...form, immexNumber: v})} />
          <Input label="Domicilio fiscal" value={form.domicilioFiscal ?? ''} onChange={v => setForm({...form, domicilioFiscal: v})} />
          <Input label="Representante legal *" value={form.representanteLegal} onChange={v => setForm({...form, representanteLegal: v})} />
          <Input label="Cargo" value={form.representanteCargo ?? ''} onChange={v => setForm({...form, representanteCargo: v})} />
          <Input label="Fracción *" value={form.fractionCode} onChange={v => setForm({...form, fractionCode: v})} />
          <Input label="Excepción" value={form.exceptionCode} onChange={v => setForm({...form, exceptionCode: v})} />
        </div>
        <div className="mt-2">
          <label className="block">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Descripción del producto *</span>
            <textarea rows={2} className="w-full text-[12px] border border-slate-200 rounded-lg px-3 py-2 mt-1"
              value={form.productDescription} onChange={e => setForm({...form, productDescription: e.target.value})}/>
          </label>
        </div>
        <div className="mt-2">
          <label className="block">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Destino declarado</span>
            <textarea rows={2} className="w-full text-[12px] border border-slate-200 rounded-lg px-3 py-2 mt-1"
              value={form.destination} onChange={e => setForm({...form, destination: e.target.value})}/>
          </label>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={handleGenerate} disabled={submitting || !form.empresa || !form.rfc || !form.representanteLegal || !form.productDescription}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-4 py-2 rounded-lg transition flex items-center justify-center gap-2">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>}
            {submitting ? 'Generando...' : 'Generar carta'}
          </button>
          <button onClick={props.onClose} className="text-[12px] text-slate-500 hover:text-slate-800 px-4">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      <input className="w-full text-[12px] border border-slate-200 rounded-lg px-3 py-1.5 mt-1"
        value={value} onChange={e => onChange(e.target.value)}/>
    </label>
  )
}
