/**
 * SELLO · DataTable — docs/DESIGN_SYSTEM.md §6.
 * Encabezados 13px uppercase tracking-wide tinta-suave; zebra sutil papel-2;
 * columnas numéricas a la derecha en Plex Mono tabular.
 */
import type { ReactNode } from 'react'

export interface Columna<T> {
  key: string
  header: string
  /** 'right' para columnas numéricas. */
  align?: 'left' | 'right'
  /** Plex Mono con números tabulares (fracciones, montos, folios, fechas). */
  mono?: boolean
  render: (fila: T) => ReactNode
  className?: string
}

export interface DataTableProps<T> {
  columnas: Columna<T>[]
  filas: T[]
  filaKey: (fila: T) => string
  /** Se muestra dentro de la tabla cuando no hay filas. */
  vacio?: ReactNode
  onFilaClick?: (fila: T) => void
  className?: string
}

export function DataTable<T>({ columnas, filas, filaKey, vacio, onFilaClick, className = '' }: DataTableProps<T>) {
  return (
    <div className={`overflow-x-auto border border-linea rounded-sello bg-superficie ${className}`}>
      <table className="w-full font-sello-ui">
        <thead>
          <tr className="border-b border-linea">
            {columnas.map(c => (
              <th
                key={c.key}
                scope="col"
                className={`text-13 uppercase tracking-wide font-medium text-tinta-suave px-4 py-3 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={columnas.length} className="px-4 py-10 text-center">
                {vacio ?? <span className="text-sm text-tinta-suave">Sin registros</span>}
              </td>
            </tr>
          )}
          {filas.map((fila, i) => (
            <tr
              key={filaKey(fila)}
              onClick={onFilaClick ? () => onFilaClick(fila) : undefined}
              className={[
                i % 2 === 1 ? 'bg-papel-2/60' : 'bg-superficie',
                'border-b border-linea last:border-b-0',
                onFilaClick ? 'cursor-pointer hover:bg-petroleo-suave/60 transition-colors duration-150' : '',
              ].join(' ')}
            >
              {columnas.map(c => (
                <td
                  key={c.key}
                  className={[
                    'px-4 py-3 text-sm text-tinta align-top',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.mono ? 'font-sello-mono' : '',
                    c.className ?? '',
                  ].join(' ')}
                >
                  {c.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
