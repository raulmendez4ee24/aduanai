/**
 * Conteo de aprobaciones pendientes para el badge del nav (Ola 1).
 * Se recarga al cambiar el cliente activo y cuando una página dispara
 * `aduanai:aprobaciones` (tras aprobar/rechazar). Silencioso ante errores.
 */
import { useEffect, useState } from 'react'
import { aprobacionesApi } from '../lib/api/clientes'
import { useClienteActivo } from './useClienteActivo'

export function notificarCambioAprobaciones(): void {
  try { window.dispatchEvent(new CustomEvent('aduanai:aprobaciones')) } catch { /* noop */ }
}

export function usePendientesAprobacion(): number {
  const { clienteId } = useClienteActivo()
  const [total, setTotal] = useState(0)
  useEffect(() => {
    let vivo = true
    const cargar = () => {
      aprobacionesApi.conteo().then(r => { if (vivo) setTotal(r.data.total) }).catch(() => { if (vivo) setTotal(0) })
    }
    cargar()
    window.addEventListener('aduanai:aprobaciones', cargar)
    const t = window.setInterval(cargar, 120_000)
    return () => { vivo = false; window.removeEventListener('aduanai:aprobaciones', cargar); window.clearInterval(t) }
  }, [clienteId])
  return total
}
