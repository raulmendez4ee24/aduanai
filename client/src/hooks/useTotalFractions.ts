import { useEffect, useState } from 'react'
import { FALLBACK_STATS } from '../lib/metricas-medidas'

// Contadores públicos EN VIVO desde /api/stats/public (derivados de filas
// ACTIVAS en la base — orden 25-ago: un solo origen para cada número público).
// Los fallbacks (única constante, con unidad y corte declarados) solo pintan
// el primer render.
export interface StatsPublicos {
  fracciones: number
  documentos: number
  fuentes: number
}

export function useStatsPublicos(): StatsPublicos & { formatted: string } {
  const [stats, setStats] = useState<StatsPublicos>({
    fracciones: FALLBACK_STATS.fraccionesActivas,
    documentos: FALLBACK_STATS.documentosLegalesActivos,
    fuentes: FALLBACK_STATS.fuentesLegales,
  })

  useEffect(() => {
    let alive = true
    fetch('/api/stats/public')
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        const d = j?.data ?? {}
        setStats(prev => ({
          fracciones: typeof d.totalFractions === 'number' && d.totalFractions > 0 ? d.totalFractions : prev.fracciones,
          documentos: typeof d.corpusDocumentosActivos === 'number' && d.corpusDocumentosActivos > 0 ? d.corpusDocumentosActivos : prev.documentos,
          fuentes: typeof d.corpusFuentes === 'number' && d.corpusFuentes > 0 ? d.corpusFuentes : prev.fuentes,
        }))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return { ...stats, formatted: stats.fracciones.toLocaleString('es-MX') }
}

/** Compat: consumidores que solo necesitan el total de fracciones ACTIVAS. */
export function useTotalFractions(): { total: number; formatted: string } {
  const { fracciones, formatted } = useStatsPublicos()
  return { total: fracciones, formatted }
}
