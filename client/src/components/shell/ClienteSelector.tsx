/**
 * Selector global de cliente/RFC (topbar del shell) — Operación 2026-08, Ola 1.
 *
 * Lee la lista de clientes del tenant (acotada al alcance del usuario si
 * tiene restricción), persiste la elección con `setClienteActivo` (que
 * dispara `aduanai:cliente`) y ofrece "Todos los clientes" cuando el usuario
 * no está restringido. Si el cliente guardado ya no existe (baja, otro
 * tenant), se limpia solo.
 */
import { useEffect, useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import { clientesApi, type Cliente } from '../../lib/api/clientes'
import { useClienteActivo } from '../../hooks/useClienteActivo'

export function ClienteSelector() {
  const { clienteId, setClienteId } = useClienteActivo()
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [alcance, setAlcance] = useState<string[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    Promise.all([clientesApi.listar(), clientesApi.alcance()])
      .then(([lista, alc]) => {
        if (!vivo) return
        setClientes(lista.data)
        setAlcance(alc.data.clienteIds)
        const ids = lista.data.map(c => c.id)
        const guardado = clienteId
        if (guardado && !ids.includes(guardado)) setClienteId(null)
        // Restringido a un solo cliente: queda fijo.
        if (alc.data.clienteIds && alc.data.clienteIds.length === 1 && ids.includes(alc.data.clienteIds[0]!)) {
          setClienteId(alc.data.clienteIds[0]!)
        }
      })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
    // Solo al montar: la lista cambia al crear/editar clientes → evento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function recargar() { clientesApi.listar().then(r => setClientes(r.data)).catch(() => {}) }
    window.addEventListener('aduanai:clientes', recargar)
    return () => window.removeEventListener('aduanai:clientes', recargar)
  }, [])

  const restringidoAUno = !!alcance && alcance.length === 1
  const opciones = useMemo(() => clientes ?? [], [clientes])

  if (error || clientes === null) return null
  if (opciones.length === 0) return null // sin clientes: nada que elegir (estado vacío vive en /clientes)

  return (
    <label className="hidden sm:flex items-center gap-1.5 text-sm font-sello-ui">
      <Building2 className="w-4 h-4 text-tinta-suave shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="sr-only">Cliente activo</span>
      <select
        value={clienteId ?? ''}
        onChange={e => setClienteId(e.target.value || null)}
        disabled={restringidoAUno}
        aria-label="Cliente activo"
        title={clienteId ? opciones.find(c => c.id === clienteId)?.rfc : 'Todos los clientes'}
        className="max-w-[220px] truncate bg-superficie border border-linea rounded-sello-sm px-2 py-1 text-sm text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo disabled:opacity-70"
      >
        {!alcance && <option value="">Todos los clientes</option>}
        {opciones.map(c => (
          <option key={c.id} value={c.id}>{c.razonSocial} · {c.rfc}</option>
        ))}
      </select>
    </label>
  )
}
