/**
 * SELLO · Input — docs/DESIGN_SYSTEM.md §6.
 * 16px, borde línea, focus petróleo, label arriba, error carmín debajo.
 * `mono` para datos (fracciones, montos, folios): Plex Mono tabular.
 */
import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { FieldShell, CONTROL_BASE, CONTROL_ERROR } from './FieldShell'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  requerido?: boolean
  mono?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, requerido, mono = false, id, className = '', ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={inputId} requerido={requerido} className={className}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={`${CONTROL_BASE} ${mono ? 'font-sello-mono' : ''} ${error ? CONTROL_ERROR : ''}`}
        {...rest}
      />
    </FieldShell>
  )
})
