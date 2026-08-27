/**
 * /clientes — cartera de RFC operados por la agencia (Operación 2026-08, Ola 1).
 * Tabla con conteos reales por cliente, alta/edición, import Excel, backfill
 * (solo admin) y estado vacío honesto. Sistema de diseño SELLO.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Plus, Upload, Pencil, Database, AlertTriangle } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Textarea, DataTable, EmptyState, type Columna } from '../components/ui'
import { showToast } from '../components/Toast'
import { usePermissions } from '../hooks/usePermissions'
import { useClienteActivo } from '../hooks/useClienteActivo'
import { clientesApi, type Cliente, type ClienteInput, type ResumenCliente, type ResultadoImportClientes } from '../lib/api/clientes'

export const GUIA_MODULO = {
  titulo: 'Clientes (RFC operados)',
  pasos: [
    'Da de alta cada importador/exportador que operas: RFC, razón social, IMMEX y certificación IVA/IEPS.',
    'Elige el cliente activo en la barra superior: todo lo que clasifiques, cotices o simules queda ligado a él.',
    'Importa tu cartera desde Excel (columnas: RFC, Razón social, IMMEX, Certificación, Padrón de importadores, Padrones sectoriales, Email).',
    'Si ya tenías historial sin cliente, "Ligar historial" lo asigna al cliente propio de tu empresa (solo administrador).',
  ],
}

const FORM_INICIAL: ClienteInput = {
  rfc: '', razonSocial: '', programaIMMEX: '', certificacionIVAIEPS: null,
  padronImportadores: false, padronesSectoriales: [], contactoNombre: '', contactoEmail: '', notas: '',
}

type Fila = Cliente & { resumen?: ResumenCliente }

export function ClientesPage() {
  const { can } = usePermissions()
  const { clienteId: activo, setClienteId } = useClienteActivo()
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [resumen, setResumen] = useState<Map<string, ResumenCliente>>(new Map())
  const [error, setError] = useState('')
  const [incluirInactivos, setIncluirInactivos] = useState(false)
  const [editando, setEditando] = useState<Cliente | null | 'nuevo'>(null)
  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState<ResultadoImportClientes | null>(null)
  const [backfillCorriendo, setBackfillCorriendo] = useState(false)

  const puedeCrear = can('clientes', 'create')
  const puedeBackfill = can('clientes', 'settings')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [l, r] = await Promise.all([clientesApi.listar({ incluirInactivos }), clientesApi.resumen().catch(() => null)])
      setClientes(l.data)
      setResumen(new Map((r?.data ?? []).map(x => [x.clienteId, x])))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la lista de clientes')
      setClientes([])
    }
  }, [incluirInactivos])

  useEffect(() => { void cargar() }, [cargar])

  const filas: Fila[] = useMemo(() => (clientes ?? []).map(c => ({ ...c, resumen: resumen.get(c.id) })), [clientes, resumen])

  function avisarCambio() { try { window.dispatchEvent(new CustomEvent('aduanai:clientes')) } catch { /* noop */ } }

  async function onImportar(file: File) {
    setImportando(true); setResultadoImport(null)
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result).split(',')[1] ?? '')
        fr.onerror = () => rej(new Error('No se pudo leer el archivo'))
        fr.readAsDataURL(file)
      })
      const r = await clientesApi.importar(b64)
      setResultadoImport(r.data)
      showToast(`Importación: ${r.data.creados} creados, ${r.data.actualizados} actualizados, ${r.data.errores.length} con error`, r.data.errores.length ? 'info' : 'success')
      avisarCambio(); await cargar()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al importar', 'error')
    } finally { setImportando(false) }
  }

  async function onBackfill() {
    if (!confirm('Ligar todo el historial sin cliente al cliente propio de tu empresa (su RFC). Solo toca registros de tu empresa. ¿Continuar?')) return
    setBackfillCorriendo(true)
    try {
      const r = await clientesApi.backfill()
      const total = Object.values(r.data.tocadas).reduce((a, b) => a + b, 0)
      showToast(total === 0 ? 'No había registros sin cliente.' : `${total.toLocaleString('es-MX')} registros ligados al cliente propio`, 'success')
      avisarCambio(); await cargar()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al ligar historial', 'error')
    } finally { setBackfillCorriendo(false) }
  }

  const columnas: Columna<Fila>[] = [
    { key: 'razon', header: 'Cliente', render: f => (
      <div className="min-w-0">
        <p className="font-medium text-tinta truncate">{f.razonSocial}</p>
        <p className="font-sello-mono text-13 text-tinta-suave">{f.rfc}</p>
      </div>
    ) },
    { key: 'programa', header: 'IMMEX / Cert.', render: f => (
      <div className="flex flex-wrap gap-1">
        {f.programaIMMEX ? <Badge tono="petroleo">{f.programaIMMEX}</Badge> : <span className="text-tinta-suave text-13">—</span>}
        {f.certificacionIVAIEPS && <Badge tono="neutral">IVA/IEPS {f.certificacionIVAIEPS}</Badge>}
        {f.padronImportadores && <Badge tono="neutral">Padrón imp.</Badge>}
      </div>
    ) },
    { key: 'cls', header: 'Clasif.', align: 'right', mono: true, render: f => f.resumen ? f.resumen.clasificaciones.toLocaleString('es-MX') : '—' },
    { key: 'cot', header: 'Cotiz.', align: 'right', mono: true, render: f => f.resumen ? f.resumen.cotizaciones.toLocaleString('es-MX') : '—' },
    { key: 'ops', header: 'Operac.', align: 'right', mono: true, render: f => f.resumen ? f.resumen.operaciones.toLocaleString('es-MX') : '—' },
    { key: 'temp', header: 'Temp. activas', align: 'right', mono: true, render: f => f.resumen ? f.resumen.importacionesTemporalesActivas.toLocaleString('es-MX') : '—' },
    { key: 'al', header: 'Alertas', align: 'right', mono: true, render: f => f.resumen
      ? (f.resumen.alertasAbiertas > 0 ? <Badge tono="ambar">{f.resumen.alertasAbiertas}</Badge> : '0')
      : '—' },
    { key: 'estado', header: 'Estado', render: f => f.activo
      ? (activo === f.id ? <Badge tono="petroleo">Activo en shell</Badge> : <Badge tono="neutral">Vigente</Badge>)
      : <Badge tono="carmin">Baja</Badge> },
    { key: 'acc', header: '', align: 'right', render: f => (
      <div className="flex justify-end gap-1">
        {f.activo && activo !== f.id && (
          <Button variante="ghost" tamano="sm" onClick={e => { e.stopPropagation(); setClienteId(f.id) }}>Usar</Button>
        )}
        {puedeCrear && (
          <Button variante="ghost" tamano="sm" aria-label={`Editar ${f.razonSocial}`} onClick={e => { e.stopPropagation(); setEditando(f) }}>
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        )}
      </div>
    ) },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-sello-display text-22 text-tinta">Clientes</h1>
          <p className="text-sm text-tinta-suave mt-0.5">RFC que opera tu empresa. Cada registro (clasificación, cotización, pedimento…) se liga al cliente activo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeBackfill && (
            <Button variante="secundario" tamano="sm" loading={backfillCorriendo} onClick={onBackfill} title="Asigna al cliente propio los registros históricos sin cliente">
              <Database className="w-4 h-4" strokeWidth={1.5} /> Ligar historial
            </Button>
          )}
          {puedeCrear && (
            <label className="inline-flex">
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={importando}
                onChange={e => { const f = e.target.files?.[0]; if (f) void onImportar(f); e.currentTarget.value = '' }} />
              <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-sello-sm border border-linea bg-superficie text-tinta cursor-pointer hover:bg-papel-2 ${importando ? 'opacity-60 pointer-events-none' : ''}`}>
                <Upload className="w-4 h-4" strokeWidth={1.5} /> {importando ? 'Importando…' : 'Importar Excel'}
              </span>
            </label>
          )}
          {puedeCrear && (
            <Button variante="primario" tamano="sm" onClick={() => setEditando('nuevo')}>
              <Plus className="w-4 h-4" strokeWidth={1.5} /> Nuevo cliente
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 border border-carmin/30 bg-carmin-suave text-carmin rounded-sello-sm px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> {error}
        </div>
      )}

      {resultadoImport && resultadoImport.errores.length > 0 && (
        <Card denso header={<p className="text-sm font-medium text-tinta">Filas con error en la importación ({resultadoImport.errores.length})</p>}>
          <ul className="text-13 text-tinta space-y-1 max-h-48 overflow-auto">
            {resultadoImport.errores.map((e, i) => (
              <li key={i}><span className="font-sello-mono">Fila {e.fila}</span> {e.rfc && <span className="font-sello-mono">{e.rfc}</span>} — {e.motivo}</li>
            ))}
          </ul>
        </Card>
      )}

      {clientes === null ? (
        <p className="text-sm text-tinta-suave">Cargando clientes…</p>
      ) : clientes.length === 0 && !incluirInactivos ? (
        <EmptyState
          icono={Building2}
          titulo="Aún no hay clientes registrados"
          descripcion={puedeCrear
            ? 'Da de alta el primer RFC que operas o importa tu cartera desde Excel. Hasta entonces, los registros se guardan sin cliente.'
            : 'Tu administrador aún no ha dado de alta clientes. Hasta entonces, los registros se guardan sin cliente.'}
          accion={puedeCrear ? { label: 'Nuevo cliente', onClick: () => setEditando('nuevo') } : undefined}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-tinta-suave">
              <input type="checkbox" checked={incluirInactivos} onChange={e => setIncluirInactivos(e.target.checked)} className="accent-petroleo" />
              Mostrar dados de baja
            </label>
            {activo && (
              <Button variante="ghost" tamano="sm" onClick={() => setClienteId(null)}>Ver todos los clientes</Button>
            )}
          </div>
          <DataTable columnas={columnas} filas={filas} filaKey={f => f.id} onFilaClick={puedeCrear ? f => setEditando(f) : undefined} />
        </>
      )}

      {editando !== null && (
        <FormularioCliente
          cliente={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={async () => { setEditando(null); avisarCambio(); await cargar() }}
        />
      )}
    </div>
  )
}

function FormularioCliente({ cliente, onCerrar, onGuardado }: { cliente: Cliente | null; onCerrar: () => void; onGuardado: () => void | Promise<void> }) {
  const [form, setForm] = useState<ClienteInput>(cliente ? {
    rfc: cliente.rfc, razonSocial: cliente.razonSocial, programaIMMEX: cliente.programaIMMEX ?? '',
    certificacionIVAIEPS: cliente.certificacionIVAIEPS, padronImportadores: cliente.padronImportadores,
    padronesSectoriales: cliente.padronesSectoriales, contactoNombre: cliente.contactoNombre ?? '',
    contactoEmail: cliente.contactoEmail ?? '', notas: cliente.notas ?? '', activo: cliente.activo,
  } : FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [padronesTexto, setPadronesTexto] = useState((cliente?.padronesSectoriales ?? []).join(', '))

  function set<K extends keyof ClienteInput>(k: K, v: ClienteInput[K]) { setForm(f => ({ ...f, [k]: v })) }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setGuardando(true); setError('')
    const payload: ClienteInput = {
      ...form,
      rfc: form.rfc.trim().toUpperCase(),
      programaIMMEX: form.programaIMMEX?.trim() || null,
      contactoNombre: form.contactoNombre?.trim() || null,
      contactoEmail: form.contactoEmail?.trim() || null,
      notas: form.notas?.trim() || null,
      padronesSectoriales: padronesTexto.split(/[,;]/).map(s => s.trim()).filter(Boolean),
    }
    try {
      if (cliente) await clientesApi.actualizar(cliente.id, payload)
      else await clientesApi.crear(payload)
      showToast(cliente ? 'Cliente actualizado' : 'Cliente creado', 'success')
      await onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={cliente ? 'Editar cliente' : 'Nuevo cliente'}>
      <div className="absolute inset-0 bg-tinta/30" onMouseDown={onCerrar} />
      <form onSubmit={onSubmit} className="relative w-full sm:max-w-xl max-h-[92vh] overflow-auto bg-superficie border border-linea rounded-sello p-6 space-y-4">
        <h2 className="font-sello-display text-lg text-tinta">{cliente ? 'Editar cliente' : 'Nuevo cliente'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="RFC" requerido mono value={form.rfc} onChange={e => set('rfc', e.target.value)} placeholder="ABC010203XY1" maxLength={13} />
          <Input label="Razón social" requerido value={form.razonSocial} onChange={e => set('razonSocial', e.target.value)} />
          <Input label="Programa IMMEX" value={form.programaIMMEX ?? ''} onChange={e => set('programaIMMEX', e.target.value)} hint="Número de programa, si aplica" />
          <Select label="Certificación IVA/IEPS" value={form.certificacionIVAIEPS ?? ''} onChange={e => set('certificacionIVAIEPS', (e.target.value || null) as ClienteInput['certificacionIVAIEPS'])}>
            <option value="">Sin certificación</option>
            <option value="A">A</option><option value="AA">AA</option><option value="AAA">AAA</option>
          </Select>
          <Input label="Contacto" value={form.contactoNombre ?? ''} onChange={e => set('contactoNombre', e.target.value)} />
          <Input label="Email de contacto" type="email" value={form.contactoEmail ?? ''} onChange={e => set('contactoEmail', e.target.value)} />
          <Input label="Padrones sectoriales" value={padronesTexto} onChange={e => setPadronesTexto(e.target.value)} hint="Separados por coma" className="sm:col-span-2" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" checked={!!form.padronImportadores} onChange={e => set('padronImportadores', e.target.checked)} className="accent-petroleo" />
          Inscrito en el Padrón de Importadores
        </label>
        {cliente && (
          <label className="inline-flex items-center gap-2 text-sm text-tinta ml-4">
            <input type="checkbox" checked={form.activo !== false} onChange={e => set('activo', e.target.checked)} className="accent-petroleo" />
            Vigente
          </label>
        )}
        <Textarea label="Notas" value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} rows={2} />
        {error && <p role="alert" className="text-sm text-carmin">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variante="primario" loading={guardando}>{cliente ? 'Guardar cambios' : 'Crear cliente'}</Button>
        </div>
      </form>
    </div>
  )
}
