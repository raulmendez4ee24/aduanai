import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { OTPInput } from '../components/OTPInput'
import { api } from '../lib/api'

interface Props {
  userEmail?: string
  onLogout: () => void
}

export function VerifyEmailPage({ userEmail, onLogout }: Props) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [canResend, setCanResend] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true)
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => navigate('/app'), 1500)
      return () => clearTimeout(timer)
    }
  }, [success, navigate])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 6) {
      setError('Ingresa el código de 6 dígitos')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.verifyEmail(code)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido o expirado')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setResendMessage('')
    setError('')
    try {
      await api.resendCode('email_verify')
      setCountdown(60)
      setCanResend(false)
      setResendMessage('Código reenviado. Revisa tu bandeja de entrada.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el código')
    } finally {
      setResending(false)
    }
  }

  function handleLogout() {
    onLogout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <motion.div
        className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" strokeWidth={2.5} />
              </div>
              <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-2">¡Email verificado!</h2>
              <p className="text-[14px] text-gray-500">Redirigiendo a tu plataforma...</p>
            </motion.div>
          ) : (
            <motion.div key="form">
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <Mail className="w-8 h-8 text-emerald-600" />
                </div>
              </div>

              <h1 className="text-[24px] font-bold text-[#1a1a1a] text-center mb-2">Verifica tu email</h1>
              <p className="text-[14px] text-gray-500 text-center mb-8">
                Enviamos un código de 6 dígitos a{' '}
                {userEmail ? (
                  <span className="font-semibold text-[#1a1a1a]">{userEmail}</span>
                ) : (
                  'tu correo electrónico'
                )}
              </p>

              <form onSubmit={handleVerify} className="space-y-5">
                <OTPInput value={code} onChange={setCode} disabled={loading} />

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-red-50 border border-red-100 text-center"
                  >
                    <p className="text-[12px] text-red-700">{error}</p>
                  </motion.div>
                )}

                {resendMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center"
                  >
                    <p className="text-[12px] text-emerald-700">{resendMessage}</p>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-[14px] rounded-xl transition-all"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verificando...
                    </span>
                  ) : 'Verificar'}
                </button>

                <div className="text-center">
                  {canResend ? (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resending}
                      className="text-[13px] text-emerald-600 hover:text-emerald-700 font-semibold disabled:opacity-50"
                    >
                      {resending ? 'Reenviando...' : 'Reenviar código'}
                    </button>
                  ) : (
                    <p className="text-[13px] text-gray-400">
                      Reenviar en{' '}
                      <span className="font-semibold text-gray-600">{countdown}s</span>
                    </p>
                  )}
                </div>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-100 text-center">
                <button
                  onClick={handleLogout}
                  className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Volver al inicio
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
