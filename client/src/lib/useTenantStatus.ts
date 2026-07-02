import { useEffect, useState } from 'react'
import { api } from './api'
import type { TenantStatusData } from './api'

/**
 * Hook compartido para /auth/tenant-status con caché a nivel de módulo:
 * una sola petición por sesión de página aunque N componentes lo usen
 * (DemoBanner global + DemoTag en cada módulo sembrado).
 */
let cached: TenantStatusData | null = null
let inflight: Promise<TenantStatusData | null> | null = null

function fetchStatus(): Promise<TenantStatusData | null> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = api.tenantStatus()
      .then(r => { cached = r.data; return cached })
      .catch(() => null)
      .finally(() => { inflight = null })
  }
  return inflight
}

export function useTenantStatus(): TenantStatusData | null {
  const [status, setStatus] = useState<TenantStatusData | null>(cached)

  useEffect(() => {
    let active = true
    fetchStatus().then(s => { if (active && s) setStatus(s) })
    return () => { active = false }
  }, [])

  return status
}
