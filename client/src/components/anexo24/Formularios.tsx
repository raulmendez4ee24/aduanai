/**
 * Acciones del Inventario IMMEX: alta desde pedimento persistido, descargo
 * PEPS por parte y retorno desde BOM (con mermas). Cada formulario mantiene su
 * estado en UN objeto `form` (Ola 3 lo migrará a useEstadoPersistente).
 */
import { useEffect, useState } from 'react'
import { Button, Input, Select, Badge } from '../ui'
import { anexo24Api, type PedimentoParaAlta, type ParteConLotes, type AltaResultado, type DescargoPepsResultado, type RetornoBomResultado, type Ubicacion } from '../../lib/api/anexo24'
import type { ProductRecord } from '../../lib/api'
import { Aviso, Dialogo, fmtFecha, fmtNum, hoyISO, mensajeDe } from './comunes'

// ── Alta desde pedimento ──────────────────────────────────────────────────

export function AltaDesdePedimentoForm({ onClose, onDone }: { onClose: () => void; onDone: (r: AltaResultado) => void }) {
  const [pedimentos, setPedimentos] = useState<PedimentoParaAlta[] | null>(null)
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [form, setForm] = useState({ pedimentoId: '', fechaEntrada: hoyISO(), vidaUtilMeses: '', ubicacionId: '', esAnexoIBis: false, esAnexoITer: false })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    anexo24Api.pedimentosParaAlta().then(r => setPedimentos(r.data)).catch(e => { setError(mensajeDe(e)); setPedimentos([]) })
    anexo24Api.ubicaciones().then(r => setUbicaciones(r.data.filter(u => u.activo))).catch(() => {})
  }, [])

  const sel = pedimentos?.find(p => p.id === form.pedimentoId)

  async function enviar() {
    if (!form.pedimentoId) { setError('Elige un pedimento persistido'); return }
    setCargando(true); setError('')
    try {
      const r = await anexo24Api.altaDesdePedimento(form.pedimentoId, {
        fechaEntrada: form.fechaEntrada,
        vidaUtilMeses: form.vidaUtilMeses ? Number(form.vidaUtilMeses) : undefined,
        ubicacionId: form.ubicacionId || undefined,
        esAnexoIBis: form.esAnexoIBis,
        esAnexoITer: form.esAnexoITer,
      })
      onDone(r.data)
    } catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }

  return (
    <Dialogo titulo="Dar de alta desde pedimento" onClose={onClose}>
      <div className="space-y-4 font-sello-ui">
        <p className="text-sm text-tinta-suave">Toma un pedimento IN/AF ya importado (M3 / Data Stage) y crea una importación temporal por partida, ligada a su número de parte. Es idempotente: repetirlo no duplica.</p>
        {pedimentos === null ? <p className="text-sm text-tinta-suave">Cargando pedimentos…</p> : pedimentos.length === 0 ? (
          <Aviso tono="neutral">No hay pedimentos IN/AF persistidos en este tenant. Impórtalos primero desde el Pre-validador (archivo M3 / Data Stage).</Aviso>
        ) : (
          <Select label="Pedimento" requerido value={form.pedimentoId} onChange={e => setForm({ ...form, pedimentoId: e.target.value })}>
            <option value="">Selecciona…</option>
            {pedimentos.map(p => (
              <option key={p.id} value={p.id}>
                {p.clave} · {p.numero ?? 's/n'} · {p.rfcImportador} · {p.partidas} partidas ({p.partidasEnInventario} ya en inventario){p.origenArchivo ? ` · ${p.origenArchivo}` : ''}
              </option>
            ))}
          </Select>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Fecha de entrada (pago/modulación)" requerido type="date" mono value={form.fechaEntrada} onChange={e => setForm({ ...form, fechaEntrada: e.target.value })}
            hint="El pedimento persistido no trae fecha; no se inventa." />
          {sel?.clave === 'AF' && (
            <Input label="Vida útil (meses, informativa)" type="number" mono min={1} value={form.vidaUtilMeses} onChange={e => setForm({ ...form, vidaUtilMeses: e.target.value })} />
          )}
          <Select label="Ubicación inicial" value={form.ubicacionId} onChange={e => setForm({ ...form, ubicacionId: e.target.value })}>
            <option value="">Planta (sin ubicación registrada)</option>
            {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre} · {u.tipo}</option>)}
          </Select>
        </div>
        <fieldset className="border border-linea rounded-sello p-3">
          <legend className="text-13 uppercase tracking-wide text-tinta-suave px-1">Mercancía sensible (Decreto IMMEX)</legend>
          <label className="flex items-center gap-2 text-sm text-tinta"><input type="checkbox" checked={form.esAnexoIBis} onChange={e => setForm({ ...form, esAnexoIBis: e.target.checked, esAnexoITer: false })} /> Anexo I BIS</label>
          <label className="flex items-center gap-2 text-sm text-tinta mt-1"><input type="checkbox" checked={form.esAnexoITer} onChange={e => setForm({ ...form, esAnexoITer: e.target.checked, esAnexoIBis: false })} /> Anexo I TER</label>
          <p className="text-13 text-tinta-suave mt-2">Su plazo diferenciado está pendiente de cotejo: el sistema aplicará 18 meses con aviso.</p>
        </fieldset>
        {error && <Aviso tono="carmin">{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} loading={cargando} disabled={!form.pedimentoId}>Crear importaciones temporales</Button>
        </div>
      </div>
    </Dialogo>
  )
}

export function AltaResultadoPanel({ r, onClose }: { r: AltaResultado; onClose: () => void }) {
  return (
    <Dialogo titulo="Alta registrada" onClose={onClose}>
      <div className="space-y-3 font-sello-ui text-sm">
        <p className="text-tinta">Pedimento <span className="font-sello-mono">{r.numero ?? 's/n'}</span> ({r.clave} → {r.tipo === 'ACTIVO_FIJO' ? 'activo fijo' : 'insumo'}): <strong>{r.creadas}</strong> creadas, {r.existentes} ya existían.</p>
        <p className="text-tinta">Plazo aplicado: <span className="font-sello-mono">{r.plazo.vigenciaPrograma ? 'vigencia del programa' : `${r.plazo.meses} meses`}</span> · {r.plazo.fundamento} <Badge tono={r.plazo.cotejo === 'corpus' ? 'petroleo' : 'ambar'}>{r.plazo.cotejo === 'corpus' ? 'respaldado en corpus' : 'cotejo pendiente'}</Badge></p>
        {r.certificacion && <p className="text-tinta-suave">Certificación IVA/IEPS considerada: {r.certificacion}</p>}
        {r.avisos.map((a, i) => <Aviso key={i}>{a}</Aviso>)}
        <div className="flex justify-end"><Button onClick={onClose}>Entendido</Button></div>
      </div>
    </Dialogo>
  )
}

// ── Descargo PEPS ─────────────────────────────────────────────────────────

export function DescargarPepsForm({ partes, parteInicial, onClose, onDone }: { partes: ParteConLotes[]; parteInicial?: ParteConLotes | null; onClose: () => void; onDone: (r: DescargoPepsResultado) => void }) {
  const claveDe = (p: ParteConLotes) => p.parteId ? `P:${p.parteId}` : `F:${p.fractionCode}`
  const [form, setForm] = useState({ parte: parteInicial ? claveDe(parteInicial) : '', cantidad: '', tipo: 'RT', pedimentoDescargo: '', constanciaTransferencia: '', fecha: hoyISO(), notes: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const insumos = partes.filter(p => p.tipo === 'INSUMO')
  const sel = insumos.find(p => claveDe(p) === form.parte)
  const cantidad = Number(form.cantidad)
  const plan = sel && cantidad > 0 ? (() => {
    let rest = cantidad
    const out: Array<{ pedimento: string; entryDate: string; toma: number }> = []
    for (const l of sel.lotes) { if (rest <= 0) break; const t = Math.min(rest, l.disponible); if (t > 0) { out.push({ pedimento: l.pedimento, entryDate: l.entryDate, toma: t }); rest -= t } }
    return { out, faltante: rest }
  })() : null

  async function enviar() {
    if (!sel) { setError('Elige una parte'); return }
    if (!(cantidad > 0)) { setError('Cantidad mayor a cero'); return }
    setCargando(true); setError('')
    try {
      const r = await anexo24Api.descargarPeps({
        productId: sel.parteId ?? undefined,
        fractionCode: sel.parteId ? undefined : sel.fractionCode,
        cantidad, tipo: form.tipo,
        pedimentoDescargo: form.pedimentoDescargo || undefined,
        constanciaTransferencia: form.constanciaTransferencia || undefined,
        fecha: form.fecha, notes: form.notes || undefined,
      })
      onDone(r.data)
    } catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }

  return (
    <Dialogo titulo="Descargar PEPS por parte" onClose={onClose}>
      <div className="space-y-4 font-sello-ui">
        <Select label="Parte (insumo)" requerido value={form.parte} onChange={e => setForm({ ...form, parte: e.target.value })}>
          <option value="">Selecciona…</option>
          {insumos.map(p => <option key={claveDe(p)} value={claveDe(p)}>{p.parteCodigo ?? `(sin parte) ${p.fractionCode}`} · saldo {fmtNum(p.saldo)} {p.unit} · {p.lotesTotal} lote(s)</option>)}
        </Select>
        <div className="grid sm:grid-cols-3 gap-4">
          <Input label={`Cantidad${sel ? ` (${sel.unit})` : ''}`} requerido type="number" mono min={0} step="any" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
          <Select label="Tipo de salida" requerido value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            <option value="RT">RT · Retorno al extranjero</option>
            <option value="V1">V1 · Transferencia virtual</option>
            <option value="F4">F4/F5 · Cambio de régimen</option>
            <option value="venta">Venta nacional</option>
          </Select>
          <Input label="Fecha" requerido type="date" mono value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
          <Input label="Pedimento de retorno / cambio" mono value={form.pedimentoDescargo} onChange={e => setForm({ ...form, pedimentoDescargo: e.target.value })} />
          <Input label="Constancia de transferencia" mono value={form.constanciaTransferencia} onChange={e => setForm({ ...form, constanciaTransferencia: e.target.value })} hint={form.tipo === 'V1' ? 'Obligatoria para V1 si no hay pedimento' : undefined} />
          <Input label="Notas" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        {plan && (
          <div className="border border-linea rounded-sello p-3 text-sm">
            <p className="text-13 uppercase tracking-wide text-tinta-suave mb-1">Distribución PEPS prevista (más antigua primero)</p>
            {plan.out.map((x, i) => <p key={i} className="font-sello-mono text-tinta">{i + 1}. {x.pedimento} · entrada {fmtFecha(x.entryDate)} → {fmtNum(x.toma)} {sel?.unit}</p>)}
            {plan.faltante > 0 && <Aviso tono="carmin">Faltan {fmtNum(plan.faltante)} {sel?.unit}: el saldo no alcanza; el servidor rechazará el descargo.</Aviso>}
          </div>
        )}
        {error && <Aviso tono="carmin">{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} loading={cargando} disabled={!sel || !(cantidad > 0)}>Registrar descargo PEPS</Button>
        </div>
      </div>
    </Dialogo>
  )
}

export function DescargoResultadoPanel({ r, onClose }: { r: DescargoPepsResultado; onClose: () => void }) {
  return (
    <Dialogo titulo="Descargo PEPS registrado" onClose={onClose}>
      <div className="space-y-3 font-sello-ui text-sm">
        <p className="text-tinta">{fmtNum(r.cantidad)} {r.parte.unit} descargadas en {r.descargos.length} lote(s), del más antiguo al más nuevo:</p>
        <ul className="space-y-1">
          {r.descargos.map(d => <li key={d.dischargeId} className="font-sello-mono text-tinta">{d.pedimento} · entrada {fmtFecha(d.entryDate)} → {fmtNum(d.cantidad)} {r.parte.unit}</li>)}
        </ul>
        <div className="flex justify-end"><Button onClick={onClose}>Cerrar</Button></div>
      </div>
    </Dialogo>
  )
}

// ── Retorno desde BOM ─────────────────────────────────────────────────────

export function RetornoBomForm({ terminados, onClose, onDone }: { terminados: ProductRecord[]; onClose: () => void; onDone: (r: RetornoBomResultado) => void }) {
  const [form, setForm] = useState({ productId: '', cantidad: '', tipo: 'RT', pedimento: '', constanciaTransferencia: '', fecha: hoyISO(), referencia: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const sel = terminados.find(p => p.id === form.productId)
  const cantidad = Number(form.cantidad)

  async function enviar() {
    if (!sel) { setError('Elige un producto terminado'); return }
    if (!(cantidad > 0)) { setError('Cantidad mayor a cero'); return }
    setCargando(true); setError('')
    try {
      const r = await anexo24Api.retornoDesdeBom({
        productId: sel.id, cantidad, tipo: form.tipo, pedimento: form.pedimento || undefined,
        constanciaTransferencia: form.constanciaTransferencia || undefined, fecha: form.fecha, referencia: form.referencia || undefined,
      })
      onDone(r.data)
    } catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }

  return (
    <Dialogo titulo="Retorno desde BOM (con mermas)" onClose={onClose}>
      <div className="space-y-4 font-sello-ui">
        <p className="text-sm text-tinta-suave">Explota la lista de materiales del producto terminado, aplica la merma de cada componente y descarga PEPS cada parte en una sola operación (todo o nada).</p>
        <Select label="Producto terminado" requerido value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>
          <option value="">Selecciona…</option>
          {terminados.map(p => <option key={p.id} value={p.id}>{p.productCode} · {p.description} · {p.components?.length ?? 0} componente(s)</option>)}
        </Select>
        {sel && (sel.components?.length ?? 0) === 0 && <Aviso>Este producto no tiene BOM; agrega componentes en la pestaña BOM.</Aviso>}
        {sel && cantidad > 0 && (sel.components?.length ?? 0) > 0 && (
          <div className="border border-linea rounded-sello p-3 text-sm">
            <p className="text-13 uppercase tracking-wide text-tinta-suave mb-1">Consumo previsto</p>
            {sel.components!.map(c => {
              const req = c.quantity * cantidad
              const con = req * (1 + c.scrapPercent / 100)
              return <p key={c.id} className="font-sello-mono text-tinta">{c.component.productCode}: {fmtNum(req)} + merma {c.scrapPercent}% = {fmtNum(con)} {c.unit}</p>
            })}
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          <Input label={`Cantidad${sel ? ` (${sel.unit})` : ''}`} requerido type="number" mono min={0} step="any" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
          <Select label="Tipo" requerido value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            <option value="RT">RT · Retorno</option>
            <option value="V1">V1 · Transferencia virtual</option>
          </Select>
          <Input label="Fecha" requerido type="date" mono value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
          <Input label="Pedimento RT / V1" mono value={form.pedimento} onChange={e => setForm({ ...form, pedimento: e.target.value })} />
          <Input label="Constancia de transferencia" mono value={form.constanciaTransferencia} onChange={e => setForm({ ...form, constanciaTransferencia: e.target.value })} />
          <Input label="Referencia (orden de producción)" mono value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} />
        </div>
        {error && <Aviso tono="carmin">{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} loading={cargando} disabled={!sel || !(cantidad > 0)}>Registrar retorno y descargar componentes</Button>
        </div>
      </div>
    </Dialogo>
  )
}

export function RetornoResultadoPanel({ r, onClose }: { r: RetornoBomResultado; onClose: () => void }) {
  return (
    <Dialogo titulo="Retorno desde BOM registrado" onClose={onClose} ancho="max-w-3xl">
      <div className="space-y-3 font-sello-ui text-sm">
        <p className="text-tinta">{fmtNum(r.cantidad)} × <span className="font-sello-mono">{r.producto.productCode}</span> · ensamble <span className="font-sello-mono">{r.assemblyId}</span></p>
        <div className="overflow-x-auto border border-linea rounded-sello">
          <table className="w-full">
            <thead><tr className="border-b border-linea text-13 uppercase tracking-wide text-tinta-suave"><th className="text-left px-3 py-2">Componente</th><th className="text-right px-3 py-2">Neto</th><th className="text-right px-3 py-2">Merma</th><th className="text-right px-3 py-2">Descargado</th><th className="text-left px-3 py-2">Lotes PEPS</th></tr></thead>
            <tbody>
              {r.consumos.map(c => (
                <tr key={c.componentCode} className="border-b border-linea last:border-b-0">
                  <td className="px-3 py-2 font-sello-mono">{c.componentCode}</td>
                  <td className="px-3 py-2 text-right font-sello-mono">{fmtNum(c.quantityRequired)} {c.unit}</td>
                  <td className="px-3 py-2 text-right font-sello-mono">{fmtNum(c.merma)} ({c.scrapPercent}%)</td>
                  <td className="px-3 py-2 text-right font-sello-mono">{fmtNum(c.quantityWithScrap)}</td>
                  <td className="px-3 py-2 font-sello-mono">{c.descargo.descargos.map(d => `${d.pedimento} (${fmtNum(d.cantidad)})`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end"><Button onClick={onClose}>Cerrar</Button></div>
      </div>
    </Dialogo>
  )
}
