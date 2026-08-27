/**
 * Ubicaciones (planta / submaquila) y traslados. Una submaquila sin folio de
 * aviso ante la SE se muestra marcada: el traslado se registra, pero no queda
 * amparado.
 */
import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { anexo24Api, type PedimentoPartidaInv, type Ubicacion } from '../../lib/api/anexo24'
import { Badge, Button, Card, DataTable, EmptyState, Input, Select } from '../ui'
import { Aviso, Dialogo, fmtFecha, fmtNum, hoyISO, mensajeDe } from './comunes'

export function SubmaquilaTab({ lotes, puedeEditar, onCambio }: { lotes: PedimentoPartidaInv[]; puedeEditar: boolean; onCambio: () => void }) {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[] | null>(null)
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState(false)
  const [traslado, setTraslado] = useState<PedimentoPartidaInv | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])

  async function cargar() {
    try { setUbicaciones((await anexo24Api.ubicaciones()).data) } catch (e) { setError(mensajeDe(e)); setUbicaciones([]) }
  }
  useEffect(() => { cargar() }, [])

  const enSubmaquila = lotes.filter(l => l.ubicacion?.tipo === 'SUBMAQUILA')

  return (
    <div className="space-y-4 font-sello-ui">
      {error && <Aviso tono="carmin">{error}</Aviso>}
      {avisos.map((a, i) => <Aviso key={i}>{a}</Aviso>)}
      <Card denso header={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-base font-medium text-tinta">Ubicaciones registradas</p>
          <div className="flex gap-2">
            {puedeEditar && lotes.length > 0 && <Button variante="secundario" onClick={() => setTraslado(lotes[0] ?? null)}>Trasladar mercancía</Button>}
            {puedeEditar && <Button onClick={() => setNueva(true)}>Nueva ubicación</Button>}
          </div>
        </div>
      }>
        {ubicaciones === null ? <p className="text-sm text-tinta-suave">Cargando…</p> : ubicaciones.length === 0 ? (
          <EmptyState icono={MapPin} titulo="Sin ubicaciones" descripcion="Registra la planta y las submaquilas (con su folio de aviso ante la SE) para documentar dónde está cada lote." accion={puedeEditar ? { label: 'Nueva ubicación', onClick: () => setNueva(true) } : undefined} />
        ) : (
          <DataTable
            columnas={[
              { key: 'nombre', header: 'Nombre', render: u => <span className="text-tinta">{u.nombre}{!u.activo && <Badge className="ml-2">inactiva</Badge>}</span> },
              { key: 'tipo', header: 'Tipo', render: u => <Badge tono={u.tipo === 'SUBMAQUILA' ? 'petroleo' : 'neutral'}>{u.tipo === 'SUBMAQUILA' ? 'Submaquila' : 'Planta'}</Badge> },
              { key: 'rfc', header: 'RFC tercero', mono: true, render: u => u.rfcTercero ?? '—' },
              { key: 'aviso', header: 'Aviso SE', mono: true, render: u => u.tipo === 'SUBMAQUILA' ? (u.avisoSubmaquila ?? <Badge tono="ambar">sin aviso</Badge>) : '—' },
              { key: 'lotes', header: 'Lotes activos', align: 'right', mono: true, render: u => fmtNum(u.lotesActivos ?? 0, 0) },
              { key: 'acc', header: '', render: u => puedeEditar && u.activo ? <Button variante="ghost" tamano="sm" onClick={async () => { try { await anexo24Api.ubicacionDesactivar(u.id); await cargar() } catch (e) { setError(mensajeDe(e)) } }}>Desactivar</Button> : null },
            ]}
            filas={ubicaciones}
            filaKey={u => u.id}
          />
        )}
      </Card>

      <Card denso header={<p className="text-base font-medium text-tinta">Lotes en submaquila ({enSubmaquila.length})</p>}>
        {enSubmaquila.length === 0 ? (
          <p className="text-sm text-tinta-suave">Ningún lote activo está en submaquila.</p>
        ) : (
          <DataTable
            columnas={[
              { key: 'ped', header: 'Pedimento', mono: true, render: l => l.pedimento },
              { key: 'parte', header: 'Parte / fracción', mono: true, render: l => l.product?.productCode ?? l.fractionCode },
              { key: 'saldo', header: 'Saldo', align: 'right', mono: true, render: l => `${fmtNum(l.saldo)} ${l.unit}` },
              { key: 'ubi', header: 'Submaquila', render: l => <span>{l.ubicacion?.nombre}</span> },
              { key: 'acc', header: '', render: l => puedeEditar ? <Button variante="ghost" tamano="sm" onClick={() => setTraslado(l)}>Trasladar</Button> : null },
            ]}
            filas={enSubmaquila}
            filaKey={l => l.id}
          />
        )}
      </Card>

      {nueva && <NuevaUbicacionForm onClose={() => setNueva(false)} onDone={async (avs) => { setNueva(false); setAvisos(avs); await cargar() }} />}
      {traslado && ubicaciones && (
        <TrasladoForm lote={traslado} lotes={lotes} ubicaciones={ubicaciones.filter(u => u.activo)} onClose={() => setTraslado(null)}
          onDone={async (avs) => { setTraslado(null); setAvisos(avs); await cargar(); onCambio() }} />
      )}
    </div>
  )
}

function NuevaUbicacionForm({ onClose, onDone }: { onClose: () => void; onDone: (avisos: string[]) => void }) {
  const [form, setForm] = useState({ nombre: '', tipo: 'SUBMAQUILA', domicilio: '', rfcTercero: '', avisoSubmaquila: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  async function enviar() {
    setCargando(true); setError('')
    try { const r = await anexo24Api.ubicacionCrear({ ...form, domicilio: form.domicilio || undefined, rfcTercero: form.rfcTercero || undefined, avisoSubmaquila: form.avisoSubmaquila || undefined }); onDone(r.avisos ?? []) }
    catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }
  return (
    <Dialogo titulo="Nueva ubicación" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Nombre" requerido value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <Select label="Tipo" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="PLANTA">Planta</option><option value="SUBMAQUILA">Submaquila</option></Select>
          <Input label="Domicilio" value={form.domicilio} onChange={e => setForm({ ...form, domicilio: e.target.value })} />
          <Input label="RFC del tercero" mono value={form.rfcTercero} onChange={e => setForm({ ...form, rfcTercero: e.target.value })} />
          {form.tipo === 'SUBMAQUILA' && <Input label="Folio de aviso de submaquila (SE)" mono value={form.avisoSubmaquila} onChange={e => setForm({ ...form, avisoSubmaquila: e.target.value })} hint="Sin aviso el traslado no queda amparado" />}
        </div>
        {error && <Aviso tono="carmin">{error}</Aviso>}
        <div className="flex justify-end gap-2"><Button variante="secundario" onClick={onClose}>Cancelar</Button><Button onClick={enviar} loading={cargando} disabled={!form.nombre.trim()}>Guardar ubicación</Button></div>
      </div>
    </Dialogo>
  )
}

function TrasladoForm({ lote, lotes, ubicaciones, onClose, onDone }: { lote: PedimentoPartidaInv; lotes: PedimentoPartidaInv[]; ubicaciones: Ubicacion[]; onClose: () => void; onDone: (avisos: string[]) => void }) {
  const [form, setForm] = useState({ loteId: lote.id, ubicacionId: '', fecha: hoyISO(), notas: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const sel = lotes.find(l => l.id === form.loteId)
  async function enviar() {
    setCargando(true); setError('')
    try { const r = await anexo24Api.traslado(form.loteId, { ubicacionId: form.ubicacionId || null, fecha: form.fecha, notas: form.notas || undefined }); onDone(r.avisos ?? []) }
    catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }
  return (
    <Dialogo titulo="Trasladar mercancía" onClose={onClose}>
      <div className="space-y-4">
        <Select label="Lote (pedimento · parte)" value={form.loteId} onChange={e => setForm({ ...form, loteId: e.target.value })}>
          {lotes.map(l => <option key={l.id} value={l.id}>{l.pedimento} · {l.product?.productCode ?? l.fractionCode} · saldo {fmtNum(l.saldo)} {l.unit} · {l.ubicacion?.nombre ?? 'planta'}</option>)}
        </Select>
        {sel && <p className="text-sm text-tinta-suave">Entrada {fmtFecha(sel.entryDate)} · actualmente en <strong className="text-tinta">{sel.ubicacion?.nombre ?? 'planta (sin ubicación)'}</strong></p>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Select label="Destino" value={form.ubicacionId} onChange={e => setForm({ ...form, ubicacionId: e.target.value })}>
            <option value="">Planta (sin ubicación)</option>
            {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre} · {u.tipo}{u.tipo === 'SUBMAQUILA' && !u.avisoSubmaquila ? ' · SIN AVISO' : ''}</option>)}
          </Select>
          <Input label="Fecha del movimiento" type="date" mono value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
        </div>
        <Input label="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        {error && <Aviso tono="carmin">{error}</Aviso>}
        <div className="flex justify-end gap-2"><Button variante="secundario" onClick={onClose}>Cancelar</Button><Button onClick={enviar} loading={cargando}>Registrar traslado</Button></div>
      </div>
    </Dialogo>
  )
}
