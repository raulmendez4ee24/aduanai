import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Search, ArrowRight, Mail } from 'lucide-react'
import { motion } from '../lib/animations'
import type { ClassificationResult } from '../lib/api'

const STORAGE_USES_KEY = 'aduanai_demo_uses'
const STORAGE_EMAIL_KEY = 'aduanai_demo_email'
const FREE_LIMIT = 3
const EMAIL_LIMIT = 10

const PLACEHOLDER_SAMPLES = [
  'Laptop Dell 15 pulgadas, Intel i7, 16GB RAM, SSD 512GB',
  'Tequila añejo 100% agave, botella 750ml, 40% alc. vol.',
  'Camiseta de algodón 100% para hombre, talla M, color azul',
  'Arnés de cables para automóvil, cobre con conectores plásticos',
  'Aceite de oliva extra virgen, botella de vidrio 1 litro, España',
]

function getUses(): number {
  const v = localStorage.getItem(STORAGE_USES_KEY)
  return v ? parseInt(v, 10) : 0
}

function getEmail(): string | null {
  return localStorage.getItem(STORAGE_EMAIL_KEY)
}

function incrementUses(): number {
  const next = getUses() + 1
  localStorage.setItem(STORAGE_USES_KEY, String(next))
  return next
}

function formatFraction(code: string): string {
  if (code.length === 8) return `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6, 8)}`
  return code
}

export function DemoClassifier() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [error, setError] = useState('')
  const [uses, setUses] = useState(getUses)
  const [email, setEmail] = useState<string | null>(getEmail)
  const [showEmailCapture, setShowEmailCapture] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)

  useEffect(() => {
    if (query) return
    const interval = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_SAMPLES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [query])

  const isHardLimitReached = uses >= EMAIL_LIMIT

  async function handleClassify() {
    if (!query.trim()) return
    if (isHardLimitReached) return

    // If at free limit and no email, show email capture instead
    if (uses >= FREE_LIMIT && !email) {
      setShowEmailCapture(true)
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setShowEmailCapture(false)

    try {
      const res = await fetch('/api/classify/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: query }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Error ${res.status}`)
      }
      const data = await res.json()
      const newUses = incrementUses()
      setUses(newUses)
      setResult(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al clasificar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!emailInput.trim()) return
    setEmailSubmitting(true)

    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Demo',
          email: emailInput.trim(),
          phone: '',
          source: 'demo_classifier',
        }),
      })
    } catch {
      // Fail silently — don't block UX
    }

    localStorage.setItem(STORAGE_EMAIL_KEY, emailInput.trim())
    setEmail(emailInput.trim())
    setShowEmailCapture(false)
    setEmailSubmitting(false)

    // Now classify immediately
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/classify/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: query }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Error ${res.status}`)
      }
      const data = await res.json()
      const newUses = incrementUses()
      setUses(newUses)
      setResult(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al clasificar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleClassify()
    }
  }

  const currentMax = email ? EMAIL_LIMIT : FREE_LIMIT

  return (
    <div className="bg-white rounded-2xl p-6 md:p-8 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-emerald-600" />
        </div>
        <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Prueba el Clasificador IA</h3>
        <span className="ml-auto text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
          Demo gratuito
        </span>
      </div>

      {/* Input */}
      <div className="relative mb-4">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Describe el producto que quieres importar...\n\nEjemplo: ${PLACEHOLDER_SAMPLES[placeholderIdx]}`}
          rows={3}
          disabled={isHardLimitReached || loading}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[15px] resize-none focus:border-emerald-500 focus:ring-0 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Classify button */}
      {!isHardLimitReached && (
        <button
          onClick={handleClassify}
          disabled={loading || !query.trim()}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Clasificando...
            </>
          ) : (
            <>
              <Search size={18} />
              Clasificar producto
            </>
          )}
        </button>
      )}

      {/* Uses counter */}
      {!isHardLimitReached && (
        <p className="text-center text-[13px] text-gray-400 mt-3">
          Uso {uses} de {currentMax} {email ? '' : 'gratuitos'}
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="mt-3 text-[13px] text-rose-600 text-center">{error}</p>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-6 bg-gray-50 rounded-xl p-5 animate-pulse space-y-4">
          <div className="flex justify-between">
            <div>
              <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-40 bg-gray-200 rounded" />
            </div>
            <div className="text-right">
              <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-16 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <p className="text-[12px] text-gray-400 text-center pt-1">Analizando con IA… la clasificación fundamentada puede tomar de 1 a 3 minutos</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mt-6 bg-gray-50 rounded-xl p-5 space-y-4">
            {/* Fracción — la confianza del modelo NO se muestra como número
                prominente: no está calibrada (Frontera Canónica, precisión de
                aprobación 18-ago). Queda como detalle técnico abajo. */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Fracción arancelaria</p>
              <p className="text-2xl font-bold text-[#1a1a1a] font-mono tracking-wider">{formatFraction(result.fraction.code)}</p>
            </div>

            {/* Description */}
            <p className="text-[14px] text-gray-600">{result.fraction.description}</p>
            <p className="text-[11px] text-gray-400">
              Confianza autodeclarada del modelo: {result.confidence}/100 (no calibrada — verifícala con tu agente aduanal)
            </p>

            {/* Tariffs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Arancel NMF</p>
                <p className="text-lg font-semibold text-[#1a1a1a]">{result.tariffs.nmf}%</p>
              </div>
              {result.tariffs.preferential.TMEC !== undefined && (
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-[11px] text-emerald-600 uppercase">T-MEC</p>
                  <p className="text-lg font-semibold text-emerald-700">{result.tariffs.preferential.TMEC}%</p>
                </div>
              )}
            </div>

            {/* Explanation */}
            <p className="text-[13px] text-gray-500 leading-relaxed">{result.explanation?.simple ?? 'Sin explicación disponible.'}</p>

            {/* CTA */}
            <div className="pt-2 border-t border-gray-200">
              <Link
                to="/register"
                className="text-[13px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
              >
                Regístrate para ver regulaciones, NOMs y más
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* Email capture overlay */}
      {showEmailCapture && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mt-6 bg-[#1a1a1a] rounded-xl p-6 text-center"
        >
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Mail className="text-white" size={24} />
          </div>
          <h4 className="text-white text-lg font-semibold mb-2">¿Te gustó? Sigue probando</h4>
          <p className="text-gray-400 text-[13px] mb-5">Deja tu email para desbloquear 7 clasificaciones más. Sin compromiso.</p>
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <input
              ref={emailRef}
              type="email"
              required
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="tu@empresa.com"
              className="w-full rounded-lg px-4 py-3 text-[14px] bg-white/10 text-white placeholder:text-gray-500 border border-white/10 focus:border-emerald-500 outline-none"
            />
            <button
              type="submit"
              disabled={emailSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium py-3 rounded-lg transition-colors"
            >
              {emailSubmitting ? 'Desbloqueando...' : 'Desbloquear clasificaciones'}
            </button>
          </form>
          <p className="text-[11px] text-gray-500 mt-3">Recibirás info sobre ADUANAI. Sin spam.</p>
        </motion.div>
      )}

      {/* Limit reached */}
      {isHardLimitReached && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 bg-gray-50 rounded-xl p-6 text-center"
        >
          <div className="w-12 h-12 bg-[#1a1a1a] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="text-white" size={20} />
          </div>
          <h4 className="text-[15px] font-semibold text-[#1a1a1a] mb-2">Demo completado</h4>
          <p className="text-[13px] text-gray-500 mb-5">Has alcanzado el límite del demo. Regístrate para clasificaciones ilimitadas.</p>
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Crear cuenta gratis
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      )}
    </div>
  )
}
