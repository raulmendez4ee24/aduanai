import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Caché por sesión: se invalida sola cuando cambia el token (logout/login) y
// NUNCA guarda un fallo — un error transitorio devuelve false (fail-closed)
// pero el siguiente montaje vuelve a preguntar (revisión adversarial 26-ago).
let cached: boolean | null = null
let cachedToken: string | null = null
let pending: Promise<boolean> | null = null

function tokenActual(): string | null {
  try { return localStorage.getItem('aduanai_token') } catch { return null }
}

function cacheVigente(): boolean | null {
  if (cached === null) return null
  if (cachedToken !== tokenActual()) { cached = null; return null }
  return cached
}

async function consultar(): Promise<boolean> {
  const token = tokenActual()
  try {
    const r = await api.pedimentosRadarEstado()
    cached = r.data.habilitado === true
    cachedToken = token
    return cached
  } catch {
    return false // fail-closed, sin cachear: el próximo montaje reintenta
  }
}

/**
 * ¿Está habilitado el Radar de pedimentos (beta tras PEDIMENTO_READER_ENABLED)?
 * `null` mientras se consulta; el nav lo trata como oculto para no mostrar
 * una entrada que devolvería 403.
 */
export function useRadarHabilitado(): boolean | null {
  const [estado, setEstado] = useState<boolean | null>(() => cacheVigente())
  useEffect(() => {
    if (cacheVigente() !== null) return
    let vivo = true
    if (!pending) pending = consultar().finally(() => { pending = null })
    pending.then(v => { if (vivo) setEstado(v) })
    return () => { vivo = false }
  }, [])
  return estado
}

/** Para tests / reinicio de sesión. */
export function _resetRadarHabilitadoCache() { cached = null; cachedToken = null; pending = null }
