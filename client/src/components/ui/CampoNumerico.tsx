/**
 * Campo numérico controlado SIN el bug de "0.02 → 2" (D4, auditoría 21-ago).
 *
 * La clase defectuosa era `value={x || ''}` + `parseFloat(...) || 0` por
 * tecla: el 0 es falsy, así que al teclear "0" el input se repinta VACÍO y
 * el punto decimal siguiente nunca puede componerse — "0.02" y ".02"
 * terminaban en "2". El patrón sano (el del Pre-validador) muestra el número
 * tal cual; aquí se generaliza: el TEXTO tecleado vive en estado local
 * mientras el campo está enfocado (la composición "0." → "0.02" sobrevive),
 * el número parseado se emite en cada tecla, y al perder foco el texto se
 * normaliza al número real (nunca queda "05", nunca negativos).
 *
 * Dos formas de uso, mismo comportamiento:
 *  - `useCampoNumerico(value, onValue)` → props para spreadear en cualquier
 *    input que las reenvíe (p. ej. el `Input` del design system Sello).
 *    Solo para campos ESTÁTICOS (los hooks no pueden ir en un map).
 *  - `<CampoNumerico value onValue className … />` → un `<input>` plano con
 *    el comportamiento integrado, para filas dinámicas.
 */
import { useEffect, useState } from 'react'

function aTexto(n: number): string {
  return n === 0 ? '' : String(n)
}

export function useCampoNumerico(value: number, onValue: (n: number) => void) {
  const [texto, setTexto] = useState(() => aTexto(value))
  const [enfocado, setEnfocado] = useState(false)

  // Cambios externos del valor (reset del form, navegación con querystring)
  // se reflejan solo cuando el usuario NO está escribiendo.
  useEffect(() => {
    if (!enfocado) setTexto(aTexto(value))
  }, [value, enfocado])

  return {
    type: 'number' as const,
    inputMode: 'decimal' as const,
    min: 0,
    value: texto,
    onFocus: () => setEnfocado(true),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = e.target.value
      setTexto(t)
      const n = parseFloat(t)
      onValue(Number.isFinite(n) && n >= 0 ? n : 0)
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      setEnfocado(false)
      const n = Math.max(0, parseFloat(e.currentTarget.value) || 0)
      onValue(n)
      setTexto(aTexto(n))
    },
  }
}

export interface CampoNumericoProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min'> {
  value: number
  onValue: (n: number) => void
}

export function CampoNumerico({ value, onValue, ...rest }: CampoNumericoProps) {
  const campo = useCampoNumerico(value, onValue)
  return <input {...rest} {...campo} />
}
