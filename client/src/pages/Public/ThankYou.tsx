import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle, Check, ArrowRight } from 'lucide-react'
import { FadeIn } from '../../lib/animations'

const PROBLEMS = [
  { value: 'clasificacion', label: 'Clasificación arancelaria lenta' },
  { value: 'pedimentos', label: 'Errores en pedimentos' },
  { value: 'immex', label: 'Control de inventarios IMMEX' },
  { value: 'fiscal', label: 'Créditos fiscales IVA/IEPS' },
  { value: 'mve', label: 'Manifestación de valor' },
  { value: 'todo', label: 'Todo lo anterior' },
]

const inputClass = "w-full bg-white border border-[#e8e8e4] rounded-xl px-4 py-3 text-[14px] text-[#1a1a1a] placeholder:text-[#ccc] outline-none focus:ring-2 focus:ring-[#1a1a1a]/10 focus:border-[#999] transition-all"

export function ThankYouPage() {
  const location = useLocation()
  const leadId = (location.state as { leadId?: string })?.leadId
  const leadName = (location.state as { leadName?: string })?.leadName

  const [form, setForm] = useState({
    rfc: '',
    industry: '',
    monthlyOps: '',
    hasIMMEX: null as boolean | null,
    currentSoftware: '',
    problems: [] as string[],
    referralSource: '',
  })
  const [sending, setSending] = useState(false)
  const [nivel2Sent, setNivel2Sent] = useState(false)

  function toggleProblem(value: string) {
    setForm(f => ({
      ...f,
      problems: f.problems.includes(value)
        ? f.problems.filter(p => p !== value)
        : [...f.problems, value],
    }))
  }

  async function handleNivel2Submit(e: React.FormEvent) {
    e.preventDefault()
    if (!leadId) return
    setSending(true)
    try {
      await fetch(`/api/leads/${leadId}/qualify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          hasIMMEX: form.hasIMMEX,
        }),
      })
      setNivel2Sent(true)
    } catch {
      // Silently handle — don't block UX
      setNivel2Sent(true)
    }
    setSending(false)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#8B8B6A' }}>
      <div className="max-w-[1400px] mx-auto px-3 md:px-5 py-3 md:py-5">
        <div className="space-y-3">
          {/* Thank you card */}
          <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14 text-center">
            <FadeIn>
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {leadName ? `¡Gracias, ${leadName}!` : '¡Gracias por tu interés!'}
              </h1>
              <p className="text-[16px] text-[#666] max-w-lg mx-auto leading-relaxed">
                Uno de nuestros asesores te contactará en las próximas 24 horas para agendar tu demo personalizada.
              </p>
            </FadeIn>
          </div>

          {/* Nivel 2 form - optional qualification */}
          {!nivel2Sent ? (
            <FadeIn delay={0.2}>
              <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
                <div className="max-w-2xl mx-auto">
                  <div className="text-center mb-8">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/ OPCIONAL</p>
                    <h2 className="text-2xl font-bold text-[#1a1a1a] tracking-tight mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      Ayúdanos a preparar tu demo
                    </h2>
                    <p className="text-[14px] text-[#888]">
                      Mientras más sepamos de tu operación, mejor será la demo. Puedes saltarte esto.
                    </p>
                  </div>

                  <form onSubmit={handleNivel2Submit} className="space-y-5">
                    {/* RFC */}
                    <div>
                      <label className="text-[12px] font-medium text-[#999] mb-1.5 block">RFC de la empresa</label>
                      <input
                        type="text"
                        value={form.rfc}
                        onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
                        placeholder="ABC123456XX9"
                        maxLength={13}
                        className={inputClass}
                      />
                    </div>

                    {/* Giro */}
                    <div>
                      <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Giro de la empresa</label>
                      <select value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className={inputClass}>
                        <option value="">Selecciona...</option>
                        <option value="maquiladora">Maquiladora / Manufactura</option>
                        <option value="importador">Importador / Distribuidor</option>
                        <option value="exportador">Exportador</option>
                        <option value="agencia_aduanal">Agencia aduanal</option>
                        <option value="logistica">Logística / Freight Forwarder</option>
                        <option value="consultoria">Consultoría fiscal / comex</option>
                        <option value="automotriz">Automotriz</option>
                        <option value="alimentos">Alimentos y bebidas</option>
                        <option value="textil">Textil y confección</option>
                        <option value="electronica">Electrónica</option>
                        <option value="farmaceutica">Farmacéutica</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>

                    {/* Operaciones mensuales */}
                    <div>
                      <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Operaciones mensuales aproximadas</label>
                      <select value={form.monthlyOps} onChange={e => setForm({ ...form, monthlyOps: e.target.value })} className={inputClass}>
                        <option value="">Selecciona...</option>
                        <option value="1-10">1 - 10</option>
                        <option value="11-30">11 - 30</option>
                        <option value="31-50">31 - 50</option>
                        <option value="51-100">51 - 100</option>
                        <option value="+100">Más de 100</option>
                      </select>
                    </div>

                    {/* IMMEX */}
                    <div>
                      <label className="text-[12px] font-medium text-[#999] mb-1.5 block">¿Tiene programa IMMEX?</label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, hasIMMEX: true })}
                          className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium border-2 transition-colors ${form.hasIMMEX === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-[#888] hover:border-gray-300'}`}
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, hasIMMEX: false })}
                          className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium border-2 transition-colors ${form.hasIMMEX === false ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-[#888] hover:border-gray-300'}`}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    {/* Software actual */}
                    <div>
                      <label className="text-[12px] font-medium text-[#999] mb-1.5 block">¿Qué software usa actualmente?</label>
                      <input
                        type="text"
                        value={form.currentSoftware}
                        onChange={e => setForm({ ...form, currentSoftware: e.target.value })}
                        placeholder="AJR, Excel, SAP, otro..."
                        className={inputClass}
                      />
                    </div>

                    {/* Problemas — checkboxes */}
                    <div>
                      <label className="text-[12px] font-medium text-[#999] mb-2.5 block">¿Qué problema quiere resolver?</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PROBLEMS.map(p => (
                          <label
                            key={p.value}
                            onClick={() => toggleProblem(p.value)}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${form.problems.includes(p.value) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${form.problems.includes(p.value) ? 'bg-emerald-500' : 'bg-gray-100'}`}>
                              {form.problems.includes(p.value) && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <span className="text-[13px] text-[#555]">{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Cómo nos encontró */}
                    <div>
                      <label className="text-[12px] font-medium text-[#999] mb-1.5 block">¿Cómo nos encontró?</label>
                      <select value={form.referralSource} onChange={e => setForm({ ...form, referralSource: e.target.value })} className={inputClass}>
                        <option value="">Selecciona...</option>
                        <option value="google">Google / Búsqueda</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="referido">Referido / Recomendación</option>
                        <option value="evento">Evento / Conferencia</option>
                        <option value="redes">Redes sociales</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Link
                        to="/"
                        className="flex-1 text-center text-[13px] text-[#888] px-5 py-3.5 rounded-xl border border-[#e0e0e0] hover:bg-[#f5f5f3] transition-colors font-medium"
                      >
                        Saltar
                      </Link>
                      <button
                        type="submit"
                        disabled={sending}
                        className="flex-1 text-[13px] text-white bg-[#1a1a1a] px-5 py-3.5 rounded-xl font-medium hover:bg-[#333] disabled:opacity-50 transition-colors"
                      >
                        {sending ? 'Enviando...' : 'Enviar información'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </FadeIn>
          ) : (
            <FadeIn>
              <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 text-center">
                <p className="text-[15px] font-semibold text-[#1a1a1a] mb-2">¡Información recibida!</p>
                <p className="text-[13px] text-[#888] mb-6">Esto nos ayudará a preparar una demo enfocada en tus necesidades.</p>
                <Link
                  to="/#demo-clasificador"
                  className="inline-flex items-center gap-2 text-[13px] text-white bg-[#1a1a1a] px-6 py-3 rounded-full font-medium hover:bg-[#333] transition-colors"
                >
                  Probar el clasificador IA
                  <ArrowRight size={14} />
                </Link>
              </div>
            </FadeIn>
          )}
        </div>
      </div>
    </div>
  )
}
