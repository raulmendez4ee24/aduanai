import { Check, X } from 'lucide-react'

interface PasswordStrengthProps {
  password: string
}

interface Criterion {
  label: string
  met: boolean
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const criteria: Criterion[] = [
    { label: '8+ caracteres', met: password.length >= 8 },
    { label: 'Una mayúscula', met: /[A-Z]/.test(password) },
    { label: 'Un número', met: /[0-9]/.test(password) },
    { label: 'Un carácter especial (!@#$...)', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ]

  const metCount = criteria.filter(c => c.met).length

  const strengthConfig = {
    0: { color: 'bg-gray-200', label: '' },
    1: { color: 'bg-red-500', label: 'Débil' },
    2: { color: 'bg-orange-500', label: 'Regular' },
    3: { color: 'bg-yellow-500', label: 'Buena' },
    4: { color: 'bg-emerald-500', label: 'Fuerte' },
  }

  const config = strengthConfig[metCount as keyof typeof strengthConfig]

  if (!password) return null

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= metCount ? config.color : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        {metCount > 0 && (
          <span className={`text-xs font-medium ${
            metCount === 1 ? 'text-red-500' :
            metCount === 2 ? 'text-orange-500' :
            metCount === 3 ? 'text-yellow-600' :
            'text-emerald-600'
          }`}>
            {config.label}
          </span>
        )}
      </div>

      {/* Criteria checklist */}
      <div className="grid grid-cols-2 gap-1">
        {criteria.map((criterion, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {criterion.met ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <X className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            )}
            <span className={`text-xs ${criterion.met ? 'text-emerald-700' : 'text-gray-400'}`}>
              {criterion.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
