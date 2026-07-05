/**
 * SELLO · Button — docs/DESIGN_SYSTEM.md §6
 * Variantes: primario (petróleo) / secundario (borde línea) / destructivo (carmín) / ghost.
 * Radius 4px, focus ring petróleo SIEMPRE visible, transición 150ms.
 * El label debe ser un verbo específico en sentence case ("Generar reporte").
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

type Variante = 'primario' | 'secundario' | 'destructivo' | 'ghost'
type Tamano = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamano?: Tamano
  loading?: boolean
}

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-petroleo text-white hover:bg-petroleo/90 disabled:hover:bg-petroleo',
  secundario: 'bg-superficie text-tinta border border-linea hover:bg-papel-2 disabled:hover:bg-superficie',
  destructivo: 'bg-carmin text-white hover:bg-carmin/90 disabled:hover:bg-carmin',
  ghost: 'bg-transparent text-tinta hover:bg-papel-2',
}

const TAMANOS: Record<Tamano, string> = {
  sm: 'text-sm px-3 py-1.5 gap-1.5',
  md: 'text-base px-4 py-2 gap-2',
  lg: 'text-base px-6 py-3 gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'primario', tamano = 'md', loading = false, disabled, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-sello-ui font-medium select-none',
        'rounded-sello-sm transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-2 focus-visible:ring-offset-papel',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})
