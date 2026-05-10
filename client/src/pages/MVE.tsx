import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { MVEDashboard, ExtractedInvoiceData, CreateMVEInput } from '../lib/api'
import { FileText, Sparkles, AlertCircle, Check, Lock } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { usePermissions } from '../hooks/usePermissions'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Step = 'paste' | 'review' | 'done'

export function MVEPage() {
  const [dashboard, setDashboard] = useState<MVEDashboard | null>(null)
  const [step, setStep] = useState<Step>('paste')
  const [invoiceText, setInvoiceText] = useState('')
  const [extracted, setExtracted] = useState<ExtractedInvoiceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [mveId, setMveId] = useState('')
  const { can, cannot } = usePermissions()

  useEffect(() => {
    api.mveDashboard().then(r => setDashboard(r.data)).catch(() => {})
  }, [])

  async function handleExtract() {
    if (!invoiceText.trim()) return
    setLoading(true); setError('')
    try {
      const res = await api.mveExtractInvoice(invoiceText)
      setExtracted(res.data)
      setStep('review')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al extraer') }
    setLoading(false)
  }

  async function handleCreate() {
    if (!extracted) return
    setCreating(true); setError('')
    try {
      const input: CreateMVEInput = {
        providerName: extracted.providerName,
        providerCountry: extracted.providerCountry,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        incoterm: extracted.incoterm,
        currency: extracted.currency,
        invoiceValue: extracted.totalValue,
        freightValue: extracted.freight ?? 0,
        insuranceValue: extracted.insurance ?? 0,
        otherIncrements: extracted.otherCharges ?? 0,
      }
      const res = await api.mveCreate(input)
      setMveId(res.data.id)
      setStep('done')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al crear MVE') }
    setCreating(false)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Dashboard KPIs */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { l: 'Total', v: dashboard.total },
            { l: 'Borrador', v: dashboard.draft },
            { l: 'Validadas', v: dashboard.validated },
            { l: 'Firmadas', v: dashboard.signed },
            { l: 'Transmitidas', v: dashboard.transmitted },
            { l: 'Pendientes', v: dashboard.pendingAction, w: dashboard.pendingAction > 0 },
            { l: 'Valor USD', v: `$${Math.round(dashboard.totalValueUSD).toLocaleString()}` },
          ].map((m, i) => (
            <div key={i} className={`${GLASS} rounded-[1.5rem] p-4 ${m.w ? 'ring-1 ring-amber-200' : ''}`}>
              <p className="text-[10px] text-slate-500">{m.l}</p>
              <p className={`text-[18px] font-bold ${m.w ? 'text-amber-600' : 'text-slate-900'}`}>{typeof m.v === 'number' ? m.v.toLocaleString() : m.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Steps indicator */}
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Auto MVE</h1>
        </div>

        <div className="flex items-center gap-3 mb-8">
          {[
            { n: 1, label: 'Pegar factura', key: 'paste' },
            { n: 2, label: 'Revisar datos', key: 'review' },
            { n: 3, label: 'MVE creada', key: 'done' },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                step === s.key ? 'bg-emerald-500 text-white' :
                ['review', 'done'].indexOf(step) > ['paste', 'review', 'done'].indexOf(s.key) ? 'bg-emerald-100 text-emerald-600' :
                'bg-slate-200/50 text-slate-500'
              }`}>{s.n}</div>
              <span className={`text-[12px] font-medium ${step === s.key ? 'text-emerald-600' : 'text-slate-500'}`}>{s.label}</span>
              {i < 2 && <div className="w-8 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Step 1: Paste */}
        {step === 'paste' && (
          <div className="space-y-4">
            <textarea value={invoiceText} onChange={e => setInvoiceText(e.target.value)}
              placeholder="Pega aquí el texto de la factura comercial (invoice)..."
              className="w-full bg-white/60 border border-slate-200/50 rounded-xl px-4 py-3 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none h-48 font-mono" />
            <button onClick={handleExtract} disabled={loading || !invoiceText.trim()}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Extrayendo con IA...' : 'Extraer con IA'}
            </button>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 'review' && extracted && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { l: 'Proveedor', v: extracted.providerName },
                { l: 'País', v: extracted.providerCountry },
                { l: 'Factura', v: extracted.invoiceNumber },
                { l: 'Fecha', v: extracted.invoiceDate },
                { l: 'Incoterm', v: extracted.incoterm },
                { l: 'Moneda', v: extracted.currency },
              ].map((f, i) => (
                <div key={i} className="bg-white/40 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500">{f.l}</p>
                  <p className="text-[13px] font-semibold text-slate-800">{f.v}</p>
                </div>
              ))}
            </div>

            {extracted.items.length > 0 && (
              <div className="bg-white/40 rounded-xl p-4">
                <p className="text-[12px] font-semibold text-slate-700 mb-2">Items ({extracted.items.length})</p>
                <div className="space-y-1.5">
                  {extracted.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] py-1.5 border-b border-slate-100/50 last:border-b-0">
                      <span className="text-slate-700 flex-1 truncate">{item.description}</span>
                      <span className="text-slate-500 mx-3">{item.quantity} x ${item.unitPrice}</span>
                      <span className="font-semibold text-slate-800">${item.totalPrice.toLocaleString()}</span>
                      {item.fractionCode && <span className="font-mono text-[10px] text-emerald-600 ml-2">{formatFraction(item.fractionCode)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white/40 rounded-xl p-3"><p className="text-[10px] text-slate-500">Subtotal</p><p className="text-[16px] font-bold text-slate-900">${extracted.subtotal.toLocaleString()}</p></div>
              <div className="bg-white/40 rounded-xl p-3"><p className="text-[10px] text-slate-500">Flete</p><p className="text-[16px] font-bold text-slate-900">${(extracted.freight ?? 0).toLocaleString()}</p></div>
              <div className="bg-white/40 rounded-xl p-3"><p className="text-[10px] text-slate-500">Seguro</p><p className="text-[16px] font-bold text-slate-900">${(extracted.insurance ?? 0).toLocaleString()}</p></div>
              <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100"><p className="text-[10px] text-emerald-600">Total</p><p className="text-[16px] font-bold text-emerald-700">${extracted.totalValue.toLocaleString()}</p></div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('paste')} className="text-[12px] text-slate-600 px-5 py-2.5 rounded-full bg-white/50 hover:bg-white/70 transition-colors">Regresar</button>
              <button onClick={handleCreate} disabled={creating || cannot('autoMVE', 'create')}
                title={cannot('autoMVE', 'create') ? 'Requiere rol con permiso autoMVE:create' : ''}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-2.5 rounded-full transition-all">
                {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> :
                  can('autoMVE', 'create') ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {creating ? 'Creando...' : 'Crear MVE'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-[16px] font-bold text-slate-900">MVE creada exitosamente</p>
            <p className="text-[12px] text-slate-500 mt-1 font-mono">{mveId}</p>
            <button onClick={() => { setStep('paste'); setInvoiceText(''); setExtracted(null) }}
              className="mt-6 text-[12px] font-medium text-emerald-500 bg-emerald-50 px-5 py-2 rounded-full hover:bg-emerald-100 transition-colors">
              Crear otra MVE
            </button>
          </div>
        )}

        {error && <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100"><AlertCircle className="w-4 h-4 text-rose-500" /><p className="text-[12px] text-rose-700">{error}</p></div>}
      </div>
    </div>
  )
}
