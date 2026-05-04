import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, ArrowLeft, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthLayout } from '../components/AuthLayout'
import { api } from '../lib/api'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setError('Ingresa tu correo electrónico')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar el correo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Recupera tu contraseña"
      subtitle="Te enviaremos un código para restablecer tu contraseña"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {sent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-600" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-[#1a1a1a] mb-2">Código enviado</h3>
              <p className="text-[14px] text-gray-500">
                Enviamos un código de recuperación a{' '}
                <span className="font-semibold text-[#1a1a1a]">{email}</span>
              </p>
            </div>
            <button
              onClick={() => navigate('/reset-password', { state: { email } })}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[14px] rounded-xl transition-all"
            >
              Ingresar código
            </button>
            <button
              onClick={() => setSent(false)}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Usar otro correo
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder="tu@empresa.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-[#1a1a1a] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all"
                />
              </div>
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

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-[14px] rounded-xl transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enviando...
                </span>
              ) : 'Enviar código'}
            </button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors pt-1"
            >
              <ArrowLeft className="w-4 h-4" /> Volver al login
            </Link>
          </form>
        )}
      </motion.div>
    </AuthLayout>
  )
}
