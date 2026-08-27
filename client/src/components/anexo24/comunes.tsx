/**
 * Piezas compartidas del Inventario IMMEX (Sello): formatos, avisos, diálogo,
 * KPI. Sin datos falsos: todo lo que se pinta viene del servidor.
 */
import { useEffect, type ReactNode } from 'react'
import { X, AlertTriangle, Info } from 'lucide-react'
import { Button } from '../ui'

export const fmtNum = (n: number | null | undefined, dec = 2): string =>
  n == null || Number.isNaN(n) ? '—' : n.toLocaleString('es-MX', { maximumFractionDigits: dec })
export const fmtUSD = (n: number | null | undefined): string => (n == null ? '—' : `${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`)
export const fmtMXN = (n: number | null | undefined): string => (n == null ? '—' : `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`
}
export const hoyISO = (): string => new Date().toISOString().slice(0, 10)
export const periodoActual = (): string => new Date().toISOString().slice(0, 7)
export function periodoAnterior(): string {
  const d = new Date()
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

export const TIPO_DESCARGO_LABEL: Record<string, string> = {
  RETURN_EXPORT: 'Retorno (RT)', TRANSFER: 'Transferencia virtual (V1)', REGIME_CHANGE: 'Cambio de régimen (F4/F5)', DOMESTIC_SALE: 'Venta nacional',
  WASTE: 'Desperdicio', SCRAP: 'Merma', DESTRUCTION: 'Destrucción', DONATION: 'Donación',
}

export function Aviso({ tono = 'ambar', children }: { tono?: 'ambar' | 'carmin' | 'neutral'; children: ReactNode }) {
  const cls = tono === 'carmin'
    ? 'bg-carmin-suave border-carmin/25 text-carmin'
    : tono === 'neutral' ? 'bg-papel-2 border-linea text-tinta-suave' : 'bg-ambar-suave border-ambar/25 text-ambar'
  const Icono = tono === 'neutral' ? Info : AlertTriangle
  return (
    <div role={tono === 'carmin' ? 'alert' : 'status'} className={`flex gap-2 items-start text-sm border rounded-sello px-3 py-2 font-sello-ui ${cls}`}>
      <Icono className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Kpi({ label, value, alerta = false, sub }: { label: string; value: string | number; alerta?: boolean; sub?: string }) {
  return (
    <div className={`bg-superficie border rounded-sello px-4 py-3 ${alerta ? 'border-carmin/40' : 'border-linea'}`}>
      <p className="text-13 uppercase tracking-wide text-tinta-suave font-sello-ui">{label}</p>
      <p className={`font-sello-mono text-22 leading-tight ${alerta ? 'text-carmin' : 'text-tinta'}`}>{typeof value === 'number' ? fmtNum(value) : value}</p>
      {sub && <p className="text-13 text-tinta-suave mt-0.5">{sub}</p>}
    </div>
  )
}

/** Diálogo modal (única sombra permitida: flotante). Cierra con Escape. */
export function Dialogo({ titulo, onClose, children, ancho = 'max-w-2xl' }: { titulo: string; onClose: () => void; children: ReactNode; ancho?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/40 p-4 sm:p-8" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${ancho} bg-superficie border border-linea rounded-sello shadow-sello-float`}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-linea">
          <h2 className="font-sello-display text-lg text-tinta">{titulo}</h2>
          <Button variante="ghost" tamano="sm" onClick={onClose} aria-label="Cerrar"><X className="w-4 h-4" aria-hidden /></Button>
        </header>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

export function mensajeDe(e: unknown, porDefecto = 'Ocurrió un error'): string {
  return e instanceof Error && e.message ? e.message : porDefecto
}
