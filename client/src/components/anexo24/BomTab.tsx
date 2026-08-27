/**
 * Productos y BOM (Sello). Migrado del Inventory.tsx anterior: alta de
 * productos, componentes con merma, ensambles registrados y trazabilidad.
 * El "registrar ensamble" antiguo (FIFO sin Discharge, toleraba faltantes) se
 * sustituye por "Retorno desde BOM" (PEPS con Discharge y todo-o-nada).
 */
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Package } from 'lucide-react'
import { api } from '../../lib/api'
import type { ProductRecord, AssemblyRecord, ImportTraceabilityRecord } from '../../lib/api'
import { formatFraction } from '../../lib/format'
import { Badge, Button, Card, EmptyState, Input, Select } from '../ui'
import { Aviso, Dialogo, fmtFecha, fmtNum, Kpi, mensajeDe } from './comunes'

export function BomTab({ puedeEditar, onRetorno, productos, ensambles, recargar }: {
  puedeEditar: boolean; onRetorno: () => void; productos: ProductRecord[]; ensambles: AssemblyRecord[]; recargar: () => Promise<void>
}) {
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const [nuevo, setNuevo] = useState(false)
  const [traceId, setTraceId] = useState('')
  const [trace, setTrace] = useState<ImportTraceabilityRecord | null>(null)
  const [error, setError] = useState('')

  const terminados = productos.filter(p => p.isFinished)
  const primas = productos.filter(p => !p.isFinished)
  const toggle = (id: string) => setExpandido(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-4 font-sello-ui">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="Terminados" value={terminados.length} />
          <Kpi label="Materias primas" value={primas.length} />
          <Kpi label="Ensambles" value={ensambles.length} />
        </div>
        <div className="flex gap-2">
          {puedeEditar && <Button variante="secundario" onClick={() => setNuevo(true)}>Nuevo producto</Button>}
          {puedeEditar && <Button onClick={onRetorno} disabled={terminados.length === 0}>Retorno desde BOM</Button>}
        </div>
      </div>
      {error && <Aviso tono="carmin">{error}</Aviso>}

      <Card denso header={<p className="text-base font-medium text-tinta">Productos terminados ({terminados.length})</p>}>
        {terminados.length === 0 ? (
          <EmptyState icono={Package} titulo="Sin productos terminados" descripcion="Crea el producto terminado y agrégale componentes con su porcentaje de merma." accion={puedeEditar ? { label: 'Nuevo producto', onClick: () => setNuevo(true) } : undefined} />
        ) : (
          <div className="divide-y divide-linea">
            {terminados.map(p => (
              <div key={p.id} className="py-2">
                <button onClick={() => toggle(p.id)} className="w-full flex items-center gap-3 text-left py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm" aria-expanded={expandido.has(p.id)}>
                  {expandido.has(p.id) ? <ChevronUp className="w-4 h-4 text-tinta-suave" aria-hidden /> : <ChevronDown className="w-4 h-4 text-tinta-suave" aria-hidden />}
                  <span className="font-sello-mono text-tinta">{p.productCode}</span>
                  <span className="text-sm text-tinta-suave truncate flex-1">{p.description}</span>
                  <Badge>{p.components?.length ?? 0} componentes</Badge>
                  <Badge>{p._count?.assemblies ?? 0} ensambles</Badge>
                </button>
                {expandido.has(p.id) && (
                  <div className="pl-7 pt-2">
                    {p.components && p.components.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead><tr className="text-13 uppercase tracking-wide text-tinta-suave border-b border-linea"><th className="text-left py-1">Componente</th><th className="text-left py-1">Fracción</th><th className="text-right py-1">Cantidad</th><th className="text-right py-1">Merma</th></tr></thead>
                        <tbody>{p.components.map(c => (
                          <tr key={c.id} className="border-b border-linea last:border-b-0"><td className="py-1 font-sello-mono">{c.component.productCode} <span className="font-sello-ui text-tinta-suave">— {c.component.description}</span></td><td className="py-1 font-sello-mono">{c.component.fractionCode ? formatFraction(c.component.fractionCode) : '—'}</td><td className="py-1 text-right font-sello-mono">{fmtNum(c.quantity)} {c.unit}</td><td className="py-1 text-right font-sello-mono">{c.scrapPercent}%</td></tr>
                        ))}</tbody>
                      </table>
                    ) : <p className="text-sm text-tinta-suave">Sin componentes definidos.</p>}
                    {puedeEditar && <AgregarComponente productId={p.id} primas={primas} onAdded={recargar} onError={setError} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {primas.length > 0 && (
        <Card denso header={<p className="text-base font-medium text-tinta">Materias primas ({primas.length})</p>}>
          <div className="grid sm:grid-cols-2 gap-2">
            {primas.map(p => (
              <div key={p.id} className="flex items-center gap-3 border border-linea rounded-sello px-3 py-2">
                <span className="font-sello-mono text-tinta">{p.productCode}</span>
                <span className="text-sm text-tinta-suave truncate flex-1">{p.description}</span>
                {p.fractionCode && <span className="font-sello-mono text-13 text-tinta-suave">{formatFraction(p.fractionCode)}</span>}
                <span className="text-13 text-tinta-suave">{p.unit}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {ensambles.length > 0 && (
        <Card denso header={<p className="text-base font-medium text-tinta">Ensambles / retornos recientes</p>}>
          <div className="divide-y divide-linea">
            {ensambles.slice(0, 10).map(a => (
              <div key={a.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="font-sello-mono text-tinta">{a.product.productCode}</span>
                <span className="text-tinta-suave flex-1">{fmtNum(a.quantity)} {a.product.unit} · {a.consumptions.length} componente(s){a.reference ? ` · ${a.reference}` : ''}</span>
                <span className="font-sello-mono text-tinta-suave">{fmtFecha(a.assemblyDate)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card denso header={<p className="text-base font-medium text-tinta">Trazabilidad de una importación</p>}>
        <div className="flex gap-2 items-end">
          <Input label="ID de importación temporal" mono value={traceId} onChange={e => setTraceId(e.target.value)} className="flex-1" />
          <Button variante="secundario" disabled={!traceId} onClick={async () => { try { setTrace((await api.importTraceability(traceId)).data) } catch (e) { setError(mensajeDe(e)) } }}>Consultar</Button>
        </div>
        {trace && (
          <div className="mt-3 text-sm">
            <p className="font-sello-mono text-tinta">{trace.pedimento} · {formatFraction(trace.fractionCode)}</p>
            <p className="text-tinta-suave">{trace.description}</p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Kpi label="Importado" value={`${fmtNum(trace.quantityImported)} ${trace.unit}`} />
              <Kpi label="Saldo" value={`${fmtNum(trace.balance)} ${trace.unit}`} />
              <Kpi label="En producción" value={`${fmtNum(trace.totalConsumedInProduction)} ${trace.unit}`} sub="estimación proporcional" />
            </div>
            {trace.consumedInAssemblies.length > 0 && (
              <ul className="mt-2 space-y-1">{trace.consumedInAssemblies.map((c, i) => <li key={i} className="text-tinta-suave"><span className="font-sello-mono text-tinta">{c.productCode}</span> · {fmtNum(c.quantityProduced)} · {fmtFecha(c.assemblyDate)} · ~{fmtNum(c.componentDeducted)} {trace.unit}</li>)}</ul>
            )}
          </div>
        )}
      </Card>

      {nuevo && <NuevoProductoForm onClose={() => setNuevo(false)} onDone={async () => { setNuevo(false); await recargar() }} />}
    </div>
  )
}

function NuevoProductoForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ productCode: '', description: '', fractionCode: '', unit: 'Pza', isFinished: false })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  async function enviar() {
    setCargando(true); setError('')
    try { await api.bomProductCreate({ productCode: form.productCode, description: form.description, fractionCode: form.fractionCode || undefined, unit: form.unit, isFinished: form.isFinished }); onDone() }
    catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }
  return (
    <Dialogo titulo="Nuevo producto / parte" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Número de parte (SKU)" requerido mono value={form.productCode} onChange={e => setForm({ ...form, productCode: e.target.value })} />
          <Input label="Descripción" requerido value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Input label="Fracción (opcional, se valida contra TIGIE)" mono value={form.fractionCode} onChange={e => setForm({ ...form, fractionCode: e.target.value })} />
          <Input label="Unidad" requerido value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-tinta"><input type="checkbox" checked={form.isFinished} onChange={e => setForm({ ...form, isFinished: e.target.checked })} /> Es producto terminado (lleva BOM)</label>
        {error && <Aviso tono="carmin">{error}</Aviso>}
        <div className="flex justify-end gap-2"><Button variante="secundario" onClick={onClose}>Cancelar</Button><Button onClick={enviar} loading={cargando} disabled={!form.productCode || !form.description}>Crear producto</Button></div>
      </div>
    </Dialogo>
  )
}

function AgregarComponente({ productId, primas, onAdded, onError }: { productId: string; primas: ProductRecord[]; onAdded: () => Promise<void>; onError: (m: string) => void }) {
  const [form, setForm] = useState({ componentId: '', quantity: '1', unit: 'Pza', scrapPercent: '0' })
  const [cargando, setCargando] = useState(false)
  useEffect(() => { const c = primas.find(p => p.id === form.componentId); if (c) setForm(f => ({ ...f, unit: c.unit })) }, [form.componentId, primas])
  async function enviar() {
    if (!form.componentId) return
    setCargando(true)
    try {
      await api.bomComponentUpsert(productId, { componentId: form.componentId, quantity: parseFloat(form.quantity), unit: form.unit, scrapPercent: parseFloat(form.scrapPercent) })
      setForm({ componentId: '', quantity: '1', unit: 'Pza', scrapPercent: '0' })
      await onAdded()
    } catch (e) { onError(mensajeDe(e)) } finally { setCargando(false) }
  }
  return (
    <div className="mt-3 pt-3 border-t border-linea grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
      <Select label="Componente" value={form.componentId} onChange={e => setForm({ ...form, componentId: e.target.value })} className="col-span-2 md:col-span-2">
        <option value="">Agregar componente…</option>
        {primas.map(p => <option key={p.id} value={p.id}>{p.productCode} — {p.description.slice(0, 40)}</option>)}
      </Select>
      <Input label="Cantidad" type="number" mono step="any" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
      <Input label="Merma %" type="number" mono step="any" value={form.scrapPercent} onChange={e => setForm({ ...form, scrapPercent: e.target.value })} />
      <Button variante="secundario" onClick={enviar} loading={cargando} disabled={!form.componentId}>Agregar</Button>
    </div>
  )
}
