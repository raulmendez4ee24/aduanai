/**
 * SELLO · Textarea — docs/DESIGN_SYSTEM.md §6.
 */
import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import { FieldShell, CONTROL_BASE, CONTROL_ERROR } from './FieldShell'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  requerido?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, requerido, id, className = '', rows = 4, ...rest },
  ref,
) {
  const autoId = useId()
  const areaId = id ?? autoId
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={areaId} requerido={requerido} className={className}>
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        aria-invalid={!!error}
        className={`${CONTROL_BASE} leading-relaxed resize-y ${error ? CONTROL_ERROR : ''}`}
        {...rest}
      />
    </FieldShell>
  )
})
