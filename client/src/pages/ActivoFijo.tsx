/**
 * Activo fijo IMMEX (Operación 2026-08) — /activo-fijo.
 * Solo lectura del inventario de activo fijo (TemporaryImport tipo ACTIVO_FIJO) con vida
 * útil, fecha de alta y opciones de salida (retorno RT / cambio de régimen F5 vía asistente),
 * más alta manual mínima. NO toca Inventory.tsx (Anexo 24).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, Plus, ArrowRight, AlertTriangle } from 'lucide-react'
import { Button, Card, Badge, Input, EmptyState } from '../components/ui'
import { activoFijoApi, type ActivoFijo, type AltaActivoFijo } from '../lib/api/cambio-regimen'

export const GUIA_MODULO = {
  titulo: 'Activo fijo IMMEX',
  pasos: [
    'Aquí vive la maquinaria y equipo importado temporalmente (clave AF): sin vencimiento operativo mientras el programa esté vigente.',
    'Registra el alta mínima: pedimento, fracción (validada contra el catálogo), cantidad, valor y vida útil en meses.',
    'Cada activo muestra meses transcurridos y vida útil restante.',
    'Salida: retorno (RT) o cambio de régimen a definitivo (F5) con cálculo de contribuciones en el asistente.',
  ],
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
const FORM_INICIAL: AltaActivoFijo = { pedimento: '', fractionCode: '', description: '', quantity: 1, unit: 'Pza', customsValue: 0, entryDate: '', vidaUtilMeses: null, supplier: '', originCountry: '' }

export function ActivoFijoPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ActivoFijo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<AltaActivoFijo>(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setCargando(true); setError(null)
    try { setItems((await activoFijoApi.listar()).data) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar') }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  async function crear() {
    if (!form.pedimento || !form.fractionCode || !form.quantity || !form.customsValue || !form.entryDate) { setError('Pedimento, fracción, cantidad, valor y fecha de entrada son obligatorios'); return }
    setGuardando(true); setError(null)
    try {
      await activoFijoApi.crear({ ...form, vidaUtilMeses: form.vidaUtilMeses || null, supplier: form.supplier || undefined, originCountry: form.originCountry || undefined, description: form.description || undefined })
      setForm(FORM_INICIAL); setMostrarForm(false); await cargar()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar') }
    setGuardando(false)
  }

  const valorTotal = items.reduce((a, i) => a + i.customsValue, 0)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Card header={
        <div className="flex items-center gap-2 flex-wrap">
          <Factory className="w-[18px] h-[18px] text-petroleo" strokeWidth={1.5} aria-hidden />
          <h1 className="font-sello-display text-lg text-tinta">Activo fijo IMMEX</h1>
          <Badge tono="neutral">{items.length} activos · {valorTotal.toLocaleString('es-MX')} USD</Badge>
          <Button className="ml-auto" variante="primario" tamano="sm" onClick={() => setMostrarForm(v => !v)}><Plus className="w-4 h-4" /> Alta manual</Button>
        </div>
      }>
        <p className="text-sm text-tinta-suave">Bienes de activo fijo importados temporalmente (clave AF). Permanecen mientras el programa IMMEX esté vigente (Regla 4.3.1 RGCE 2026); su salida es retorno o cambio de régimen F5.</p>
        {error && <p className="mt-3 text-sm text-carmin flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {error}</p>}
      </Card>

      {mostrarForm && (
        <Card header={<h2 className="font-sello-display text-base text-tinta">Alta de activo fijo</h2>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input label="Pedimento" requerido mono value={form.pedimento} onChange={e => setForm({ ...form, pedimento: e.target.value })} placeholder="26 47 3461 4000123" />
            <Input label="Fracción" requerido mono value={form.fractionCode} onChange={e => setForm({ ...form, fractionCode: e.target.value })} placeholder="8458.11.01" hint="Se valida contra el catálogo TIGIE." />
            <Input label="Descripción" value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} />
            <Input label="Cantidad" requerido type="number" min={0} step="any" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
            <Input label="Unidad" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            <Input label="Valor en aduana (USD)" requerido type="number" min={0} step="0.01" value={form.customsValue || ''} onChange={e => setForm({ ...form, customsValue: Number(e.target.value) })} />
            <Input label="Fecha de entrada" requerido type="date" value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} />
            <Input label="Vida útil (meses)" type="number" min={1} value={form.vidaUtilMeses ?? ''} onChange={e => setForm({ ...form, vidaUtilMeses: e.target.value ? Number(e.target.value) : null })} hint="Opcional; sin valor se usa horizonte de 120 meses." />
            <Input label="Proveedor" value={form.supplier ?? ''} onChange={e => setForm({ ...form, supplier: e.target.value })} />
            <Input label="País de origen" value={form.originCountry ?? ''} onChange={e => setForm({ ...form, originCountry: e.target.value })} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button variante="primario" tamano="sm" loading={guardando} onClick={crear}>Registrar</Button>
            <Button variante="ghost" tamano="sm" onClick={() => setMostrarForm(false)}>Cancelar</Button>
          </div>
        </Card>
      )}

      <Card>
        {cargando ? <p className="text-sm text-tinta-suave">Cargando…</p> : items.length === 0 ? (
          <EmptyState icono={Factory} titulo="Sin activo fijo registrado" descripcion="Registra la maquinaria y equipo importado bajo clave AF para controlar su vida útil y su salida." accion={{ label: 'Alta manual', onClick: () => setMostrarForm(true) }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wide text-tinta-suave text-left"><th className="py-1 pr-2">Pedimento</th><th className="py-1 pr-2">Fracción</th><th className="py-1 pr-2">Descripción</th><th className="py-1 pr-2 text-right">Cantidad</th><th className="py-1 pr-2 text-right">Valor USD</th><th className="py-1 pr-2">Alta</th><th className="py-1 pr-2">Vida útil</th><th className="py-1">Salida</th></tr></thead>
              <tbody>
                {items.map(a => (
                  <tr key={a.id} className="border-t border-linea">
                    <td className="py-1.5 pr-2 font-mono text-[12px]">{a.pedimento}</td>
                    <td className="py-1.5 pr-2 font-mono text-[12px]">{a.fractionCode}</td>
                    <td className="py-1.5 pr-2 text-tinta truncate max-w-[240px]">{a.description || '—'}{a.ubicacion ? <span className="text-tinta-suave"> · {a.ubicacion.nombre}</span> : null}</td>
                    <td className="py-1.5 pr-2 text-right font-mono">{a.quantity - a.quantityDischarged} {a.unit}</td>
                    <td className="py-1.5 pr-2 text-right font-mono">{a.customsValue.toLocaleString('es-MX')}</td>
                    <td className="py-1.5 pr-2">{fecha(a.entryDate)} <span className="text-tinta-suave">({a.mesesTranscurridos} m)</span></td>
                    <td className="py-1.5 pr-2">{a.vidaUtilMeses != null ? <Badge tono={a.vidaUtilRestanteMeses === 0 ? 'ambar' : 'neutral'}>{a.vidaUtilRestanteMeses} de {a.vidaUtilMeses} m</Badge> : <span className="text-tinta-suave">sin capturar</span>}</td>
                    <td className="py-1.5">
                      <div className="flex gap-1 flex-wrap">
                        {a.opcionesSalida.map(o => <Button key={o.tipo} variante="secundario" tamano="sm" onClick={() => navigate(o.ruta)}>{o.tipo} <ArrowRight className="w-3 h-3" /></Button>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
