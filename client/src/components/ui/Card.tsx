/**
 * SELLO · Card — docs/DESIGN_SYSTEM.md §6
 * Superficie blanca, borde 1px línea, radius 6px. SIN sombra (regla §4).
 * Slots: header / body (children) / footer.
 */
import type { ReactNode } from 'react'

export interface CardProps {
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  /** Padding del body; default generoso (24px). */
  denso?: boolean
  className?: string
}

export function Card({ header, footer, children, denso = false, className = '' }: CardProps) {
  const pad = denso ? 'p-5' : 'p-6'
  return (
    <section className={`bg-superficie border border-linea rounded-sello ${className}`}>
      {header && (
        <header className={`${denso ? 'px-5 py-4' : 'px-6 py-5'} border-b border-linea`}>
          {header}
        </header>
      )}
      <div className={pad}>{children}</div>
      {footer && (
        <footer className={`${denso ? 'px-5 py-4' : 'px-6 py-5'} border-t border-linea bg-papel-2/50 rounded-b-sello`}>
          {footer}
        </footer>
      )}
    </section>
  )
}
