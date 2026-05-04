import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, Building2, UserPlus, Boxes, Bell, CheckCircle2, ArrowRight, ArrowLeft, X, Check } from 'lucide-react'
import { api } from '../lib/api'

interface Props {
  user: { id: string; name: string; email: string; onboardingStep?: number }
  onComplete: () => void
}

const STEPS = [
  { key: 'welcome', title: 'Bienvenido', icon: Rocket },
  { key: 'company', title: 'Tu empresa', icon: Building2 },
  { key: 'team', title: 'Invita tu equipo', icon: UserPlus },
  { key: 'firstClassify', title: 'Primera clasificación', icon: Boxes },
  { key: 'alerts', title: 'Alertas', icon: Bell },
  { key: 'done', title: 'Listo', icon: CheckCircle2 },
]

export function OnboardingWizard({ user, onComplete }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState(user.onboardingStep ?? 0)
  const [submitting, setSubmitting] = useState(false)
  const [skipped, setSkipped] = useState(false)

  async function persistStep(newStep: number) {
    await api.updateOnboarding({ step: newStep }).catch(() => {})
  }

  async function handleNext() {
    const next = step + 1
    if (next >= STEPS.length) {
      setSubmitting(true)
      await api.updateOnboarding({ completed: true }).catch(() => {})
      setSubmitting(false)
      onComplete()
      return
    }
    setStep(next)
    await persistStep(next)
  }

  function handleBack() {
    if (step > 0) {
      const prev = step - 1
      setStep(prev)
      persistStep(prev)
    }
  }

  async function handleSkip() {
    setSubmitting(true)
    await api.updateOnboarding({ completed: true }).catch(() => {})
    setSubmitting(false)
    setSkipped(true)
    onComplete()
  }

  if (skipped) return null

  const current = STEPS[step] ?? STEPS[0]!
  const Icon = current.icon
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          key={step}
          className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl"
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        >
          {/* Progress bar */}
          <div className="h-1 bg-gray-100">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="p-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                  <Icon size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-widest">Paso {step + 1} de {STEPS.length}</p>
                  <h2 className="text-[18px] font-bold text-[#1a1a1a]">{current.title}</h2>
                </div>
              </div>
              <button onClick={handleSkip} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-500" aria-label="Saltar">
                <X size={16} />
              </button>
            </div>

            {/* Step content */}
            <div className="min-h-[220px]">
              {step === 0 && (
                <div>
                  <h3 className="text-[22px] font-bold text-[#1a1a1a] mb-3">¡Hola, {user.name}!</h3>
                  <p className="text-[14px] text-gray-600 leading-relaxed mb-4">
                    Bienvenido a <strong>ADUANAI</strong>. En los próximos minutos te guiamos para que dejes tu plataforma lista y empieces a operar con todo el poder de la IA en tu comex.
                  </p>
                  <div className="bg-emerald-50 rounded-xl p-4">
                    <p className="text-[12px] text-emerald-700 leading-relaxed">
                      Cada paso toma menos de un minuto. Puedes saltarlo en cualquier momento y regresar después.
                    </p>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-2">Configura tu empresa</h3>
                  <p className="text-[13px] text-gray-500 mb-5">Verifica tus datos fiscales y personaliza el espacio de trabajo.</p>
                  <div className="grid gap-2">
                    {[
                      'Verificar RFC y razón social',
                      'Subir logo de la empresa',
                      'Configurar datos de facturación',
                      'Definir zona horaria',
                    ].map(t => (
                      <div key={t} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-5 h-5 rounded-md border border-gray-300 flex items-center justify-center shrink-0" />
                        <span className="text-[13px] text-gray-700">{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-2">Invita tu equipo</h3>
                  <p className="text-[13px] text-gray-500 mb-5">Agrega operadores, administradores y viewers. Todos comparten tu empresa y tus datos son 100% privados.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { r: 'ADMIN', d: 'Control total' },
                      { r: 'USER', d: 'Opera módulos' },
                      { r: 'VIEWER', d: 'Solo lectura' },
                    ].map(x => (
                      <div key={x.r} className="p-4 border border-gray-200 rounded-xl text-center">
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">{x.r}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{x.d}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-4 text-center">Puedes invitar a tu equipo desde Ajustes → Usuarios cuando quieras.</p>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-2">Haz tu primera clasificación</h3>
                  <p className="text-[13px] text-gray-500 mb-5">Describe un producto con sus características y la IA te regresa la fracción arancelaria con confianza, base legal y aranceles aplicables.</p>
                  <button
                    onClick={() => { navigate('/clasificador'); handleSkip() }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-[13px] font-medium hover:bg-emerald-600 transition-colors"
                  >
                    <Boxes size={14} />
                    Ir al clasificador ahora
                  </button>
                  <p className="text-[11px] text-gray-400 mt-3 text-center">O continúa y hazla después.</p>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-2">Configura tus alertas</h3>
                  <p className="text-[13px] text-gray-500 mb-5">Recibe aviso en la app, email o WhatsApp cuando el SAT, la SE o el DOF modifiquen fracciones que te importan.</p>
                  <div className="space-y-2">
                    {[
                      'Cambios en aranceles de fracciones que usas',
                      'Nuevas NOMs aplicables a tus productos',
                      'Permisos sectoriales nuevos',
                      'Vencimientos de plazos IMMEX',
                    ].map(t => (
                      <div key={t} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <Check size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-[13px] text-gray-700">{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} className="text-white" />
                  </div>
                  <h3 className="text-[22px] font-bold text-[#1a1a1a] mb-2">¡Tu plataforma está lista!</h3>
                  <p className="text-[14px] text-gray-600 leading-relaxed mb-6">
                    Ya puedes clasificar productos, generar cotizaciones, controlar tu inventario IMMEX y recibir alertas. Cualquier módulo nuevo que visites incluye un mini-tour.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-left">
                    {[
                      { label: 'Clasificador', path: '/clasificador' },
                      { label: 'Cotizador', path: '/cotizador' },
                      { label: 'Inventario', path: '/inventario' },
                      { label: 'Fiscal Guardian', path: '/fiscal' },
                    ].map(m => (
                      <button
                        key={m.path}
                        onClick={() => { navigate(m.path); handleSkip() }}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors text-[13px] text-[#1a1a1a]"
                      >
                        <span>{m.label}</span>
                        <ArrowRight size={12} className="text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer nav */}
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
              <button
                onClick={handleBack}
                disabled={step === 0}
                className="flex items-center gap-2 px-4 py-2 text-[13px] text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft size={14} />
                Atrás
              </button>
              <div className="flex items-center gap-1">
                {STEPS.map((_s, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === step ? 'bg-emerald-500 w-6' : i < step ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                ))}
              </div>
              <button
                onClick={handleNext}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1a1a] text-white text-[13px] font-medium hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {step === STEPS.length - 1 ? (submitting ? 'Guardando...' : 'Terminar') : 'Siguiente'}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
