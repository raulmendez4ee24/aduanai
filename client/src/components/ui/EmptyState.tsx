/**
 * SELLO · EmptyState — docs/DESIGN_SYSTEM.md §6.
 * Un vacío es una invitación a actuar, no un mensaje triste:
 * ícono sobrio + una línea de qué es esto + un botón con la acción.
 */
import type { ComponentType, ReactNode } from 'react'
import { Button } from './Button'

export interface EmptyStateProps {
  icono: ComponentType<{ className?: string }>
  titulo: string
  descripcion?: string
  accion?: { label: string; onClick: () => void }
  children?: ReactNode
}

export function EmptyState({ icono: Icono, titulo, descripcion, accion, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 font-sello-ui">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-sello bg-papel-2 border border-linea mb-4">
        <Icono className="w-6 h-6 text-tinta-suave" aria-hidden />
      </span>
      <p className="text-base font-medium text-tinta">{titulo}</p>
      {descripcion && <p className="mt-1 text-sm text-tinta-suave max-w-md">{descripcion}</p>}
      {accion && (
        <Button variante="primario" tamano="md" className="mt-5" onClick={accion.onClick}>
          {accion.label}
        </Button>
      )}
      {children}
    </div>
  )
}
