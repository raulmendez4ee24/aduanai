import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Lock, Eye, EyeOff, Check, ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthLayout } from '../components/AuthLayout'
import { OTPInput } from '../components/OTPInput'
import { PasswordStrength } from '../components/PasswordStrength'
import { api } from '../lib/api'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const emailFromState = (location.state as { email?: string })?.email || ''

  type Phase = 'otp' | 'password' | 'done'
  const [phase, setPhase] = useState<Phase>('otp')

  // Phase 1
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [resetToken, setResetToken] = useState('')

  // Phase 2
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 6) {
      setOtpError('Ingresa el código de 6 dígitos')
      return
    }
    setVerifying(true)
    setOtpError('')
    try {
      const res = await api.verifyResetCode(emailFromState, code)
      setResetToken(res.resetToken)
      setPhase('password')
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Código inválido o expirado')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden')
      return
    }
    if (password.length < 8) {
      setPasswordError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setResetting(true)
    setPasswordError('')
    try {
      await api.resetPassword(resetToken, password)
      setPhase('done')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Error al cambiar la contraseña')
    } finally {
      setResetting(false)
    }
  }

  const passwordValid = password.length >= 8 && password === confirmPassword

  return (
    <AuthLayout title="Nueva contraseña" subtitle="Sigue los pasos para restablecer tu contraseña">
      <AnimatePresence mode="wait">
        {phase === 'otp' && (
          <motion.form
            key="otp"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={handleVerifyCode}
            className="space-y-5"
          >
            {emailFromState && (
              <p className="text-[13px] text-gray-500 text-center">
                Ingresa el código enviado a{' '}
                <span className="font-semibold text-[#1a1a1a]">{emailFromState}</span>
              </p>
            )}

            <OTPInput value={code} onChange={setCode} disabled={verifying} />

            {otpError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 border border-red-100 text-center"
              >
                <p className="text-[12px] text-red-700">{otpError}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={verifying || code.length < 6}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-[14px] rounded-xl transition-all"
            >
              {verifying ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : 'Verificar código'}
            </button>

            <Link
              to="/forgot-password"
              className="flex items-center justify-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Volver
            </Link>
          </motion.form>
        )}

        {phase === 'password' && (
          <motion.form
            key="password"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={handleResetPassword}
            className="space-y-4"
          >
            <div>
              <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Nueva contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPasswordError('') }}
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

            <div>
              <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Confirmar contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setPasswordError('') }}
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

            {passwordError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 border border-red-100"
              >
                <p className="text-[12px] text-red-700">{passwordError}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={!passwordValid || resetting}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-[14px] rounded-xl transition-all"
            >
              {resetting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Cambiando...
                </span>
              ) : 'Cambiar contraseña'}
            </button>
          </motion.form>
        )}

        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4 py-4"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-600" strokeWidth={2.5} />
            </div>
            <h3 className="text-[20px] font-bold text-[#1a1a1a]">¡Contraseña actualizada!</h3>
            <p className="text-[14px] text-gray-500">Redirigiendo al login...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
