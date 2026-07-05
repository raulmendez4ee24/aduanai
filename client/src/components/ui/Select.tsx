/**
 * SELLO · Select — docs/DESIGN_SYSTEM.md §6.
 */
import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { FieldShell, CONTROL_BASE, CONTROL_ERROR } from './FieldShell'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  requerido?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, requerido, id, className = '', children, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={selectId} requerido={requerido} className={className}>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={!!error}
        className={`${CONTROL_BASE} appearance-none bg-no-repeat ${error ? CONTROL_ERROR : ''}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
})
