/**
 * SELLO · Badge — docs/DESIGN_SYSTEM.md §6
 * La única "pill" permitida del sistema. 13px, sentence case (nada de uppercase).
 * Tonos: neutral / petroleo / ambar / carmin.
 */
import type { ReactNode } from 'react'

type Tono = 'neutral' | 'petroleo' | 'ambar' | 'carmin'

const TONOS: Record<Tono, string> = {
  neutral: 'bg-papel-2 text-tinta-suave border-linea',
  petroleo: 'bg-petroleo-suave text-petroleo border-petroleo/20',
  ambar: 'bg-ambar-suave text-ambar border-ambar/25',
  carmin: 'bg-carmin-suave text-carmin border-carmin/25',
}

export interface BadgeProps {
  tono?: Tono
  children: ReactNode
  className?: string
}

export function Badge({ tono = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-13 font-medium font-sello-ui px-2 py-0.5 rounded-sello-sm border ${TONOS[tono]} ${className}`}
    >
      {children}
    </span>
  )
}
