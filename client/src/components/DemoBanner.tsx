import { FlaskConical } from 'lucide-react'
import { useTenantStatus } from '../lib/useTenantStatus'

/**
 * Fase 2.1 — Señal de honestidad de datos.
 *
 * Banner global PERSISTENTE (a propósito NO descartable, a diferencia del
 * PilotBanner): mientras el tenant tenga datos demo sembrados, toda la app
 * lo dice de frente. Se apaga solo cuando los datos demo se limpian de la BD.
 */
export function DemoBanner() {
  const status = useTenantStatus()
  if (!status?.hasDemoData) return null

  return (
    <div className="px-3 pt-3">
      <div className="flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2">
        <FlaskConical className="w-4 h-4 text-violet-500 shrink-0" />
        <p className="text-[12px] text-violet-800 leading-snug">
          <span className="font-bold uppercase tracking-wide">Datos de demostración</span>
          <span className="text-violet-700"> — este espacio contiene operaciones sembradas de ejemplo, no información real de tu empresa. Los módulos marcados con la etiqueta </span>
          <span className="font-semibold bg-violet-100 border border-violet-200 rounded px-1 py-px text-[10px] uppercase">demo</span>
          <span className="text-violet-700"> incluyen estos datos.</span>
        </p>
      </div>
    </div>
  )
}

/**
 * Chip para el encabezado de cada módulo sembrado con datos demo.
 * Solo se muestra si el tenant efectivamente tiene datos demo.
 */
export function DemoTag() {
  const status = useTenantStatus()
  if (!status?.hasDemoData) return null

  return (
    <span
      title="Este módulo incluye datos de demostración sembrados (no operaciones reales)"
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 align-middle"
    >
      <FlaskConical className="w-3 h-3" />
      demo
    </span>
  )
}
