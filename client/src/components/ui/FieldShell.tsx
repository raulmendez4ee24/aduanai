/**
 * SELLO · FieldShell — envoltura compartida de Input/Select/Textarea.
 * Label arriba (tinta-suave), mensaje de error en carmín debajo.
 */
import type { ReactNode } from 'react'

export interface FieldShellProps {
  label?: string
  error?: string
  hint?: string
  htmlFor?: string
  requerido?: boolean
  children: ReactNode
  className?: string
}

export function FieldShell({ label, error, hint, htmlFor, requerido, children, className = '' }: FieldShellProps) {
  return (
    <div className={`font-sello-ui ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm text-tinta-suave mb-1.5">
          {label}{requerido && <span className="text-carmin" aria-hidden> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-carmin" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-13 text-tinta-suave">{hint}</p>
      ) : null}
    </div>
  )
}

/** Clases base compartidas de los controles de formulario Sello. */
export const CONTROL_BASE = [
  'w-full bg-superficie text-tinta text-base font-sello-ui',
  'border border-linea rounded-sello-sm px-3 py-2',
  'placeholder:text-tinta-suave/60',
  'transition-colors duration-150 ease-out',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-1',
  'disabled:bg-papel-2 disabled:text-tinta-suave disabled:cursor-not-allowed',
].join(' ')

export const CONTROL_ERROR = 'border-carmin focus-visible:ring-carmin'
