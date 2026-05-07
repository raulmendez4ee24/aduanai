import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Building2, Phone, Eye, EyeOff, Check, ArrowRight, ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthLayout } from '../components/AuthLayout'
import { RFCInput } from '../components/RFCInput'
import { PasswordStrength } from '../components/PasswordStrength'
import { api } from '../lib/api'

interface Props {
  onLogin: (token: string, user: { id: string; email: string; name: string; role: string; emailVerified: boolean; status: string }) => void
}

type StepId = 1 | 2 | 3

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: 'Cuenta' },
  { id: 2, label: 'Empresa' },
  { id: 3, label: 'Seguridad' },
]

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
}

// validateRFC legacy reemplazado por <RFCInput /> con endpoint /api/validate/rfc
function _legacyValidateRFC(rfc: string): string | null {
  if (!rfc) return null
  const upper = rfc.toUpperCase()
  if (upper === 'XAXX010101000' || upper === 'XEXX010101000') return 'RFC genérico no permitido'
  if (upper.length < 12 || upper.length > 13) return 'El RFC debe tener 12 (moral) o 13 (física) caracteres'
  return null
}

function rfcHint(rfc: string): string {
  const len = rfc.replace(/\s/g, '').length
  if (len === 12) return 'Persona moral (12)'
  if (len === 13) return 'Persona física (13)'
  return ''
}

const inputClass = "w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-[#1a1a1a] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all"

export function RegisterPage({ onLogin }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState<StepId>(1)
  const [direction, setDirection] = useState(1)

  // Step 1
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneRaw, setPhoneRaw] = useState('')

  // Step 2
  const [companyName, setCompanyName] = useState('')
  const [rfc, setRfc] = useState('')
  const [rfcError, setRfcError] = useState('')

  // Step 3
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function validateEmail(val: string) {
    if (!val) { setEmailError(''); return false }
    const ok = EMAIL_RE.test(val)
    setEmailError(ok ? '' : 'Ingresa un correo electrónico válido')
    return ok
  }

  function handlePhoneChange(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    setPhoneRaw(digits)
    setPhone(formatPhone(digits))
  }

  // handleRfcChange legacy: el RFCInput maneja onChange + onValidate ahora.
  function _legacyHandleRfcChange(val: string) {
    const upper = val.toUpperCase()
    setRfc(upper)
    const err = _legacyValidateRFC(upper)
    setRfcError(err || '')
  }
  void _legacyHandleRfcChange; void rfcHint

  function goNext() {
    setDirection(1)
    setStep(s => (s < 3 ? ((s + 1) as StepId) : s))
  }

  function goPrev() {
    setDirection(-1)
    setStep(s => (s > 1 ? ((s - 1) as StepId) : s))
  }

  const step1Valid = name.trim().length > 0 && EMAIL_RE.test(email) && !emailError
  const step2Valid = companyName.trim().length > 0 && !rfcError
  const step3Valid =
    password.length >= 8 &&
    password === confirmPassword &&
    termsAccepted

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!step3Valid) return
    setLoading(true)
    setError('')
    try {
      const res = await api.register({
        email,
        password,
        name,
        companyName,
        phone: phoneRaw.length === 10 ? phone : undefined,
        rfc: rfc || undefined,
      })
      localStorage.setItem('aduanai_token', res.token)
      onLogin(res.token, res.user)
      navigate('/verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  }

  return (
    <AuthLayout title="Crea tu cuenta" subtitle="Empieza a automatizar tu operación aduanera">
      {/* Progress bar */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ${
                step > s.id
                  ? 'bg-emerald-600 text-white'
                  : step === s.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {step > s.id ? <Check className="w-4 h-4" strokeWidth={3} /> : s.id}
              </div>
              <span className={`text-[11px] mt-1 font-medium ${step >= s.id ? 'text-emerald-700' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${step > s.id ? 'bg-emerald-600' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden">
        <AnimatePresence custom={direction} mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              {/* Nombre */}
              <div>
                <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Nombre completo *</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Correo electrónico *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); validateEmail(e.target.value) }}
                    onBlur={e => validateEmail(e.target.value)}
                    placeholder="tu@empresa.com"
                    className={`${inputClass} ${emailError ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : email && !emailError ? 'border-emerald-400' : ''}`}
                  />
                  {email && !emailError && (
                    <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                  )}
                </div>
                {emailError && <p className="text-[11px] text-red-500 mt-1">{emailError}</p>}
              </div>

              {/* Teléfono */}
              <div>
                <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Teléfono <span className="text-gray-300">(opcional)</span></label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    placeholder="(55) 1234-5678"
                    className={`${inputClass} ${phoneRaw.length > 0 && phoneRaw.length !== 10 ? 'border-orange-300' : ''}`}
                  />
                </div>
                {phoneRaw.length > 0 && phoneRaw.length !== 10 && (
                  <p className="text-[11px] text-orange-500 mt-1">Ingresa los 10 dígitos</p>
                )}
              </div>

              <button
                type="button"
                onClick={goNext}
                disabled={!step1Valid}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
              >
                Siguiente <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-center text-[13px] text-gray-500 pt-1">
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" className="text-emerald-600 hover:text-emerald-700 font-semibold">
                  Inicia sesión
                </Link>
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              {/* Empresa */}
              <div>
                <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Nombre de la empresa *</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Mi Empresa S.A. de C.V."
                    className={inputClass}
                  />
                </div>
              </div>

              {/* RFC con validación reforzada (bloquea genéricos XAXX/XEXX) */}
              <RFCInput
                value={rfc}
                onChange={setRfc}
                onValidate={(r) => {
                  if (rfc.length === 0) { setRfcError(''); return }
                  if (r && !r.valid) setRfcError(r.message ?? 'RFC inválido')
                  else setRfcError('')
                }}
                label="RFC (opcional)"
                placeholder="ABC123456789"
                allowGeneric={false}
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="flex-1 py-3.5 border border-gray-200 hover:bg-gray-50 text-[#1a1a1a] font-semibold text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Anterior
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!step2Valid}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  Siguiente <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.form
              key="step3"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Contraseña */}
              <div>
                <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Contraseña *</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-[#1a1a1a] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              {/* Confirmar contraseña */}
              <div>
                <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Confirmar contraseña *</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu contraseña"
                    className={`w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-[#1a1a1a] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all ${confirmPassword && password !== confirmPassword ? 'border-red-300' : confirmPassword && password === confirmPassword ? 'border-emerald-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(s => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-[11px] text-red-500 mt-1">Las contraseñas no coinciden</p>
                )}
              </div>

              {/* Términos */}
              <div className="flex items-start gap-2.5">
                <input
                  id="terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                />
                <label htmlFor="terms" className="text-[12px] text-gray-600 cursor-pointer leading-relaxed">
                  Acepto los{' '}
                  <Link to="/terminos" target="_blank" className="text-emerald-600 hover:underline">términos y condiciones</Link>
                  {' '}y el{' '}
                  <Link to="/privacidad" target="_blank" className="text-emerald-600 hover:underline">aviso de privacidad</Link>
                </label>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-red-50 border border-red-100"
                >
                  <p className="text-[12px] text-red-700">{error}</p>
                </motion.div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={goPrev}
                  className="flex-1 py-3.5 border border-gray-200 hover:bg-gray-50 text-[#1a1a1a] font-semibold text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Anterior
                </button>
                <button
                  type="submit"
                  disabled={!step3Valid || loading}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-[14px] rounded-xl transition-all"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creando...
                    </span>
                  ) : 'Crear cuenta'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  )
}
