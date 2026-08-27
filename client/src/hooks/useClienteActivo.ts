/**
 * Cliente/RFC activo del shell (Operación 2026-08, Ola 1).
 *
 *   const { clienteId, setClienteId } = useClienteActivo()
 *   useEffect(() => { recargar() }, [clienteId])   // re-consulta al cambiar
 *
 * Fuente única: localStorage['aduanai_cliente'] vía api-core; el evento
 * `aduanai:cliente` (lo dispara setClienteActivo) sincroniza todas las
 * páginas montadas. `null` = "Todos los clientes".
 */
import { useCallback, useEffect, useState } from 'react'
import { clienteActivo, setClienteActivo } from '../lib/api-core'

export function useClienteActivo(): { clienteId: string | null; setClienteId: (id: string | null) => void } {
  const [clienteId, setEstado] = useState<string | null>(() => clienteActivo())

  useEffect(() => {
    function onCambio(e: Event) {
      const detail = (e as CustomEvent<string | null>).detail
      setEstado(detail ?? null)
    }
    function onStorage(e: StorageEvent) {
      if (e.key === 'aduanai_cliente') setEstado(e.newValue)
    }
    window.addEventListener('aduanai:cliente', onCambio)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('aduanai:cliente', onCambio)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setClienteId = useCallback((id: string | null) => { setClienteActivo(id) }, [])
  return { clienteId, setClienteId }
}
