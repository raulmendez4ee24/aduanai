import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthLayout } from '../components/AuthLayout'
import { api } from '../lib/api'

interface Props {
  onLogin: (token: string, user: { id: string; email: string; name: string; role: string; emailVerified: boolean; status: string }) => void
}

export function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('Email y contraseña son requeridos')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.login(email, password, rememberMe)
      if (rememberMe) {
        localStorage.setItem('aduanai_token', res.token)
      } else {
        localStorage.setItem('aduanai_token', res.token)
      }
      onLogin(res.token, res.user)
      if (!res.user.emailVerified) {
        navigate('/verify')
      } else {
        navigate('/app')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Bienvenido de vuelta" subtitle="Ingresa a tu plataforma de comercio exterior">
      <motion.form
        onSubmit={handleSubmit}
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {/* Email */}
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

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12px] font-medium text-[#999]">Contraseña</label>
            <Link to="/forgot-password" className="text-[12px] text-emerald-600 hover:text-emerald-700 font-medium">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Tu contraseña"
              autoComplete="current-password"
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
        </div>

        {/* Remember me */}
        <div className="flex items-center gap-2.5">
          <input
            id="remember"
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
          <label htmlFor="remember" className="text-[13px] text-gray-600 cursor-pointer select-none">
            Recordar sesión
          </label>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-red-50 border border-red-100"
          >
            <p className="text-[12px] text-red-700">{error}</p>
          </motion.div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-[14px] rounded-xl transition-all"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Ingresando...
            </span>
          ) : 'Iniciar sesión'}
        </button>

        <p className="text-center text-[13px] text-gray-500 pt-2">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-emerald-600 hover:text-emerald-700 font-semibold">
            Regístrate
          </Link>
        </p>
      </motion.form>
    </AuthLayout>
  )
}
