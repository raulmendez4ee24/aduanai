import { useEffect, useState } from 'react'
import { TrendingUp, Sparkles, Info } from 'lucide-react'
import { api } from '../lib/api'
import type { ROISummary } from '../lib/api'

/**
 * Fase 2.4 (honestidad): fórmula visible en hover para las cifras grandes.
 * Construye "Módulo: N × $costo MXN" por cada módulo con valor > 0, a partir
 * de los mismos count/perUnitMXN que calcula roi-service (no se inventa nada).
 */
function buildFormulaTooltip(data: ROISummary): string {
  const parts = (Object.entries(data.byModule) as [keyof ROISummary['byModule'], ROISummary['byModule']['classifier']][])
    .filter(([, m]) => m.savingsMXN > 0)
    .map(([key, m]) => `${MODULE_LABELS[key]}: ${m.count} × $${m.perUnitMXN.toLocaleString('es-MX')} MXN`)
  return `Estimación (no cifra auditada): actividad del periodo × costo de referencia evitado por unidad.\n${parts.join('\n')}\nAbre el desglose para ver la base de cada costo.`
}

function mxn(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

const MODULE_LABELS: Record<keyof ROISummary['byModule'], string> = {
  classifier: 'Clasificador IA',
  inventoryIMMEX: 'Inventario IMMEX',
  fiscalGuardian: 'Fiscal Guardian',
  quoter: 'Cotizador',
  mve: 'Auto MVE',
  logistics: 'Logística',
}

export function ROIBanner({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<ROISummary | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    api.roiSummary(days).then(r => setData(r.data)).catch(() => {})
  }, [days])

  if (!data) return null

  const periodLabel = days === 30 ? 'este mes' : days === 7 ? 'esta semana' : `últimos ${days} días`

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 shadow-lg">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-emerald-50/80">Valor estimado entregado {periodLabel}</p>
          <p className="text-[32px] font-bold leading-none mt-1 cursor-help inline-flex items-center gap-2" title={buildFormulaTooltip(data)}>
            {mxn(data.totalSavingsMXN)}
            <Info className="w-4 h-4 opacity-60" />
          </p>
          <p className="text-[12px] text-emerald-50/90 mt-2">
            <button onClick={() => setShowBreakdown(v => !v)} className="hover:underline inline-flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {showBreakdown ? 'Ocultar' : 'Ver'} desglose por módulo
            </button>
          </p>
        </div>
      </div>

      {showBreakdown && (
        <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(Object.entries(data.byModule) as [keyof ROISummary['byModule'], ROISummary['byModule']['classifier']][])
            .filter(([, m]) => m.savingsMXN > 0)
            .sort((a, b) => b[1].savingsMXN - a[1].savingsMXN)
            .map(([key, m]) => (
              <div key={key} className="bg-white/15 rounded-xl p-3">
                <p className="text-[11px] text-emerald-50/80">{MODULE_LABELS[key]}</p>
                <p className="text-[18px] font-bold leading-none mt-1">{mxn(m.savingsMXN)}</p>
                <p className="text-[10px] text-emerald-50/70 mt-1 leading-snug">{m.rationale}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/**
 * Mini-tile para mostrar el ROI de un módulo específico (en su página).
 */
export function ROITile({ moduleKey, days = 30 }: { moduleKey: keyof ROISummary['byModule']; days?: number }) {
  const [data, setData] = useState<ROISummary | null>(null)

  useEffect(() => {
    api.roiSummary(days).then(r => setData(r.data)).catch(() => {})
  }, [days])

  if (!data?.byModule) return null
  const m = data.byModule[moduleKey]
  // Guard: si la respuesta no trae este módulo, no renderizar (antes esto
  // crasheaba ROITile → blanqueaba todo el dashboard de Inventario/Fiscal).
  if (!m || (m.count === 0 && m.savingsMXN === 0)) return null

  return (
    <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 px-4 py-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-emerald-700 uppercase tracking-wider">Valor estimado · {days}d</p>
        <p className="text-[18px] font-bold text-emerald-700 leading-none mt-0.5 cursor-help" title={`Estimación (no cifra auditada): ${m.count} × $${m.perUnitMXN.toLocaleString('es-MX')} MXN. ${m.rationale}`}>{mxn(m.savingsMXN)}</p>
        <p className="text-[10px] text-emerald-600/80 mt-1 leading-snug">{m.rationale}</p>
      </div>
    </div>
  )
}
