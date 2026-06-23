import { useEffect, useState } from 'react'

// Conteo de fracciones del catálogo, en vivo desde /api/stats/public.
// Se usa un fallback con el último valor conocido para el primer render;
// se reemplaza en cuanto responde la API. Así el número nunca se desfasa.
const FALLBACK = 8256

export function useTotalFractions(): { total: number; formatted: string } {
  const [total, setTotal] = useState(FALLBACK)

  useEffect(() => {
    let alive = true
    fetch('/api/stats/public')
      .then((r) => r.json())
      .then((j) => {
        const n = j?.data?.totalFractions
        if (alive && typeof n === 'number' && n > 0) setTotal(n)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return { total, formatted: total.toLocaleString('es-MX') }
}
