/**
 * /aprobaciones — bandeja "el junior propone, el señor con patente aprueba"
 * (Operación 2026-08, Ola 1). Lista clasificaciones y cotizaciones en
 * `pending_approval` del tenant/cliente activo; aprobar o rechazar con motivo.
 */
import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Check, X, Building2 } from 'lucide-react'
import { Button, Card, Badge, EmptyState, Textarea } from '../components/ui'
import { showToast } from '../components/Toast'
import { usePermissions } from '../hooks/usePermissions'
import { useClienteActivo } from '../hooks/useClienteActivo'
import { notificarCambioAprobaciones } from '../hooks/usePendientesAprobacion'
import { Link } from 'react-router-dom'
import { aprobacionesApi, type PendienteAprobacion, type TipoAprobacion } from '../lib/api/clientes'
import { rutaDefensa } from '../lib/api/defensa-aprobaciones'
import { formatFraction } from '../lib/format'

export const GUIA_MODULO = {
  titulo: 'Aprobaciones',
  pasos: [
    'Lo que captura un usuario sin permiso de aprobar nace "pendiente de aprobación" y aparece aquí.',
    'Quien tiene permiso de aprobar (GLOSADOR, VALIDATOR, GERENTE, administrador) revisa y aprueba o rechaza con motivo.',
    'Cada decisión queda en el audit trail encadenado con quién propuso, quién decidió y el motivo.',
    'El selector de cliente de la barra superior filtra la bandeja por RFC.',
    '"Paquete de defensa" abre el expediente de esa entidad: versión normativa, reglas, aprobación y bitácora con hash.',
  ],
}

const ETIQUETA: Record<TipoAprobacion, string> = { clasificacion: 'Clasificación', cotizacion: 'Cotización' }
const MODULO: Record<TipoAprobacion, string> = { clasificacion: 'classifier', cotizacion: 'quoter' }

export function AprobacionesPage() {
  const { can, loading: cargandoPerms } = usePermissions()
  const { clienteId } = useClienteActivo()
  const [items, setItems] = useState<PendienteAprobacion[] | null>(null)
  const [error, setError] = useState('')
  const [rechazando, setRechazando] = useState<PendienteAprobacion | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError('')
    try { setItems((await aprobacionesApi.pendientes()).data) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la bandeja'); setItems([]) }
  }, [])

  useEffect(() => { void cargar() }, [cargar, clienteId])

  async function aprobar(p: PendienteAprobacion) {
    setOcupado(p.id)
    try {
      await aprobacionesApi.aprobar(p.tipo, p.id)
      showToast(`${ETIQUETA[p.tipo]} aprobada`, 'success')
      notificarCambioAprobaciones(); await cargar()
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo aprobar', 'error') }
    finally { setOcupado(null) }
  }

  async function rechazar(p: PendienteAprobacion, motivo: string) {
    setOcupado(p.id)
    try {
      await aprobacionesApi.rechazar(p.tipo, p.id, motivo)
      showToast(`${ETIQUETA[p.tipo]} rechazada`, 'info')
      setRechazando(null)
      notificarCambioAprobaciones(); await cargar()
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo rechazar', 'error') }
    finally { setOcupado(null) }
  }

  const puedeAlguno = can('classifier', 'approve') || can('quoter', 'approve')

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="font-sello-display text-22 text-tinta">Aprobaciones</h1>
        <p className="text-sm text-tinta-suave mt-0.5">Propuestas pendientes de revisión. {clienteId ? 'Filtradas por el cliente activo.' : 'Todos los clientes.'}</p>
      </header>

      {!cargandoPerms && !puedeAlguno && items && items.length > 0 && (
        <div className="border border-ambar/30 bg-ambar-suave text-ambar rounded-sello-sm px-4 py-3 text-sm">
          Puedes ver la bandeja, pero tu rol no aprueba. Pide a un glosador, validador o gerente que revise.
        </div>
      )}
      {error && <p role="alert" className="text-sm text-carmin">{error}</p>}

      {items === null ? (
        <p className="text-sm text-tinta-suave">Cargando bandeja…</p>
      ) : items.length === 0 ? (
        <EmptyState icono={BadgeCheck} titulo="Nada pendiente" descripcion="No hay clasificaciones ni cotizaciones esperando aprobación para este alcance." />
      ) : (
        <ul className="space-y-3">
          {items.map(p => {
            const puede = can(MODULO[p.tipo], 'approve')
            return (
              <li key={`${p.tipo}-${p.id}`}>
                <Card denso>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge tono="petroleo">{ETIQUETA[p.tipo]}</Badge>
                        <span className="font-sello-mono text-13 text-tinta-suave">{formatFraction(p.fractionCode)}</span>
                        {p.cliente && (
                          <span className="inline-flex items-center gap-1 text-13 text-tinta-suave">
                            <Building2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden /> {p.cliente.razonSocial} · <span className="font-sello-mono">{p.cliente.rfc}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-tinta break-words">{p.titulo}</p>
                      <p className="text-13 text-tinta-suave mt-0.5">{p.detalle}</p>
                      <p className="text-13 text-tinta-suave mt-1">
                        Propuso {p.propuestoPor?.name ?? '—'} · {new Date(p.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      <Link to={rutaDefensa(p.tipo === 'clasificacion' ? 'classification' : 'quote', p.id)} className="text-13 text-petroleo underline underline-offset-2 mt-1 inline-block">
                        Paquete de defensa →
                      </Link>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variante="secundario" tamano="sm" disabled={!puede || ocupado === p.id} onClick={() => setRechazando(p)} title={puede ? 'Rechazar con motivo' : 'Tu rol no aprueba en este módulo'}>
                        <X className="w-4 h-4" strokeWidth={1.5} /> Rechazar
                      </Button>
                      <Button variante="primario" tamano="sm" disabled={!puede} loading={ocupado === p.id} onClick={() => aprobar(p)} title={puede ? 'Aprobar' : 'Tu rol no aprueba en este módulo'}>
                        <Check className="w-4 h-4" strokeWidth={1.5} /> Aprobar
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {rechazando && (
        <DialogoRechazo item={rechazando} ocupado={ocupado === rechazando.id} onCerrar={() => setRechazando(null)} onConfirmar={m => rechazar(rechazando, m)} />
      )}
    </div>
  )
}

function DialogoRechazo({ item, ocupado, onCerrar, onConfirmar }: { item: PendienteAprobacion; ocupado: boolean; onCerrar: () => void; onConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')
  const valido = motivo.trim().length >= 3
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Rechazar propuesta">
      <div className="absolute inset-0 bg-tinta/30" onMouseDown={onCerrar} />
      <div className="relative w-full sm:max-w-md bg-superficie border border-linea rounded-sello p-6 space-y-4">
        <h2 className="font-sello-display text-lg text-tinta">Rechazar {ETIQUETA[item.tipo].toLowerCase()}</h2>
        <p className="text-sm text-tinta-suave">{item.titulo}</p>
        <Textarea label="Motivo" requerido rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} hint="Queda en el audit trail y lo ve quien propuso." />
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button variante="destructivo" disabled={!valido} loading={ocupado} onClick={() => onConfirmar(motivo.trim())}>Rechazar</Button>
        </div>
      </div>
    </div>
  )
}
