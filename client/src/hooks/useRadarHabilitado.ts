import { useEffect, useState } from 'react'
import { api } from '../lib/api'

let cached: boolean | null = null
let pending: Promise<boolean> | null = null

async function consultar(): Promise<boolean> {
  try {
    const r = await api.pedimentosRadarEstado()
    cached = r.data.habilitado === true
  } catch {
    cached = false // fail-closed: sin respuesta, el módulo no se ofrece
  }
  return cached
}

/**
 * ¿Está habilitado el Radar de pedimentos (beta tras PEDIMENTO_READER_ENABLED)?
 * `null` mientras se consulta; el nav lo trata como oculto para no mostrar
 * una entrada que devolvería 403.
 */
export function useRadarHabilitado(): boolean | null {
  const [estado, setEstado] = useState<boolean | null>(cached)
  useEffect(() => {
    if (cached !== null) return
    if (!pending) pending = consultar()
    pending.then(v => { setEstado(v); pending = null })
  }, [])
  return estado
}

/** Para tests / reinicio de sesión. */
export function _resetRadarHabilitadoCache() { cached = null; pending = null }
