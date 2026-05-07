import { useEffect, useState } from 'react'
import { Check, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import type { RFCValidationResult } from '../lib/api'

interface Props {
  value: string
  onChange: (v: string) => void
  /** Llama con el resultado al validarse — útil para gatear submit del form. */
  onValidate?: (result: RFCValidationResult | null) => void
  /** allowGeneric=true permite XAXX/XEXX (raro). Default false. */
  allowGeneric?: boolean
  expectedType?: 'moral' | 'fisica'
  required?: boolean
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  autoFocus?: boolean
}

export function RFCInput({
  value, onChange, onValidate,
  allowGeneric = false, expectedType,
  required = false, label = 'RFC',
  placeholder = 'MEJ010203AB1',
  className = '',
  disabled, autoFocus,
}: Props) {
  const [result, setResult] = useState<RFCValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)

  async function validate(rfc: string) {
    if (!rfc) {
      const r = required ? { valid: false, reason: 'EMPTY' as const, message: 'RFC requerido' } : null
      setResult(r)
      onValidate?.(r)
      return
    }
    setLoading(true)
    try {
      const r = await api.validateRFC(rfc, { allowGeneric, expectedType })
      setResult(r.data)
      onValidate?.(r.data)
    } catch {
      // Si falla el endpoint, no bloqueamos — quedamos sin estado
      setResult(null)
      onValidate?.(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Re-evaluar cuando el valor cambia y ya se interactuó
    if (!touched) return
    const t = setTimeout(() => validate(value), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, touched])

  const showFeedback = touched && result != null
  const isValid = result?.valid === true
  const hasWarning = isValid && !!result?.warning
  const isInvalid = result?.valid === false

  const borderClass = !showFeedback ? 'border-slate-200'
    : isInvalid ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
    : hasWarning ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-200'
    : 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200'

  return (
    <div className={`relative ${className}`}>
      {label && <label className="text-[12px] font-medium text-slate-600 mb-1 block">{label}{required && <span className="text-rose-500"> *</span>}</label>}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase())}
          onBlur={() => { setTouched(true); validate(value) }}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={13}
          className={`w-full font-mono text-[13px] bg-white border rounded-xl px-4 py-2.5 pr-10 outline-none transition focus:ring-2 ${borderClass} disabled:bg-slate-50 disabled:text-slate-400`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? <RefreshCw className="w-4 h-4 text-slate-400 animate-spin"/>
            : showFeedback && isInvalid ? <AlertCircle className="w-4 h-4 text-rose-500"/>
            : showFeedback && hasWarning ? <AlertTriangle className="w-4 h-4 text-amber-500"/>
            : showFeedback && isValid ? <Check className="w-4 h-4 text-emerald-500"/>
            : null}
        </div>
      </div>
      {showFeedback && result?.message && (
        <p className={`text-[11px] mt-1 leading-tight ${
          isInvalid ? 'text-rose-600' :
          hasWarning ? 'text-amber-700' :
          'text-emerald-600'
        }`}>
          {isInvalid && '⚠ '}{hasWarning && '⚠ '}{isValid && !hasWarning && '✓ '}
          {result.message}
        </p>
      )}
      {showFeedback && result?.isGeneric && result?.valid && (
        <p className="text-[11px] mt-0.5 text-amber-700">RFC genérico — no apto para operaciones reales.</p>
      )}
    </div>
  )
}
