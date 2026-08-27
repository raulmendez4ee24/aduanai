/**
 * Auto MVE — Ola 2: el resto del formato E2.
 * Pestañas: Nueva (pegar → revisar E2 completo → creada) · MVEs (layout, marcar
 * transmitida) · Plantillas · Vigencias · Lote.
 *
 * Honestidad: ADUANAI NO transmite a VUCEM. El estado solo puede ser
 * "lista para transmitir" o "transmitida por el usuario" (folio + fecha).
 */
import { DemoTag } from '../components/DemoBanner'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { MVEDashboard } from '../lib/api'
import { mveApi } from '../lib/api/mve'
import type { CatalogosE2, ExtraccionE2, PlantillaAplicada, CuerpoMVE, AjusteConcepto, MVEE2Record, PlantillaProveedor, VigenciaProveedor, ResultadoLote, Semaforo, Cuadre } from '../lib/api/mve'
import { FileText, Sparkles, AlertCircle, Check, Lock, Download, Plus, Trash2, Upload, Layers, Clock, ListChecks } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'
import { Button, Card, Badge, Input, Select, Textarea, EmptyState, DataTable } from '../components/ui'

export const GUIA_MODULO = {
  titulo: 'Auto MVE',
  pasos: [
    'Pega el texto de la factura comercial y pulsa "Extraer con IA": salen proveedor, factura, incoterm, cargos por concepto, forma de pago, pesos y vinculación.',
    'Revisa el formato E2 completo: método de valoración (Art. 64-78 LA), incrementables y decrementables por concepto (deben cuadrar con el valor en aduana), forma de pago traducida de los términos ("T/T 30 días"), RFC del cliente activo y pesos.',
    'Si el proveedor ya tiene plantilla, los campos estables se pre-llenan; la factura siempre manda sobre la plantilla.',
    'Guarda: se crea la MVE "lista para transmitir" y se actualiza la plantilla del proveedor.',
    'En "MVEs" descarga el layout de trabajo (XML/JSON en el orden del E2 — no es el XSD oficial de VUCEM) y, cuando transmitas en VUCEM, márcala con folio y fecha.',
    'En "Lote" sube hasta 20 facturas en texto: una MVE por factura. En "Vigencias" ves el semáforo por proveedor (fecha editable, pendiente de cotejo).',
  ],
}

type Tab = 'nueva' | 'mves' | 'plantillas' | 'vigencias' | 'lote'
type Step = 'paste' | 'review' | 'done'

interface FormE2 {
  providerName: string; providerCountry: string; invoiceNumber: string; invoiceDate: string; incoterm: string; currency: string
  exchangeRate: string; invoiceValue: string; pedimento: string
  metodoValoracion: string; formaPago: string; plazoPagoDias: string; paymentTerms: string
  incrementables: AjusteConcepto[]; decrementables: AjusteConcepto[]
  hasVinculacion: boolean; vinculacionDesc: string; vinculacionAfectaPrecio: '' | 'si' | 'no'
  rfcImportador: string; pesoBrutoKg: string; pesoNetoKg: string; vigenciaHasta: string
  plantillaId: string | null
}

const FORM_INICIAL: FormE2 = {
  providerName: '', providerCountry: '', invoiceNumber: '', invoiceDate: '', incoterm: 'FOB', currency: 'USD', exchangeRate: '', invoiceValue: '', pedimento: '',
  metodoValoracion: 'valor_transaccion', formaPago: '', plazoPagoDias: '', paymentTerms: '',
  incrementables: [], decrementables: [], hasVinculacion: false, vinculacionDesc: '', vinculacionAfectaPrecio: '',
  rfcImportador: '', pesoBrutoKg: '', pesoNetoKg: '', vigenciaHasta: '', plantillaId: null,
}

const money = (n: number, c = 'USD') => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`
const suma = (l: AjusteConcepto[]) => Math.round(l.reduce((s, a) => s + (Number(a.monto) || 0), 0) * 100) / 100
const TONO: Record<Semaforo, 'petroleo' | 'ambar' | 'carmin' | 'neutral'> = { verde: 'petroleo', ambar: 'ambar', rojo: 'carmin', gris: 'neutral' }
const ETIQUETA_SEMAFORO: Record<Semaforo, string> = { verde: 'Vigente', ambar: 'Por vencer', rojo: 'Vencida', gris: 'Sin fecha' }

function formDesdeExtraccion(e: ExtraccionE2, plantillaId: string | null): FormE2 {
  return {
    ...FORM_INICIAL,
    providerName: e.providerName ?? '', providerCountry: e.providerCountry ?? '', invoiceNumber: e.invoiceNumber ?? '', invoiceDate: e.invoiceDate ?? '',
    incoterm: e.incoterm || 'FOB', currency: e.currency || 'USD', invoiceValue: String(e.subtotal ?? ''),
    metodoValoracion: e.metodoValoracion || 'valor_transaccion', formaPago: e.formaPago ?? '', plazoPagoDias: e.plazoPagoDias != null ? String(e.plazoPagoDias) : '', paymentTerms: e.paymentTerms ?? '',
    incrementables: e.incrementables ?? [], decrementables: e.decrementables ?? [],
    hasVinculacion: !!e.hasVinculacion, vinculacionDesc: e.vinculacionDesc ?? '', vinculacionAfectaPrecio: e.vinculacionAfectaPrecio === true ? 'si' : e.vinculacionAfectaPrecio === false ? 'no' : '',
    rfcImportador: e.rfcImportador ?? '', pesoBrutoKg: e.pesoBrutoKg != null ? String(e.pesoBrutoKg) : '', pesoNetoKg: e.pesoNetoKg != null ? String(e.pesoNetoKg) : '',
    plantillaId,
  }
}

function cuerpoDesdeForm(f: FormE2): CuerpoMVE {
  const n = (s: string) => (s.trim() === '' ? null : Number(s))
  return {
    pedimento: f.pedimento || null, providerName: f.providerName, providerCountry: f.providerCountry, invoiceNumber: f.invoiceNumber, invoiceDate: f.invoiceDate,
    incoterm: f.incoterm, currency: f.currency, exchangeRate: n(f.exchangeRate), invoiceValue: Number(f.invoiceValue),
    incrementables: f.incrementables.map((a) => ({ ...a, monto: Number(a.monto) || 0 })), decrementables: f.decrementables.map((a) => ({ ...a, monto: Number(a.monto) || 0 })),
    hasVinculacion: f.hasVinculacion, vinculacionDesc: f.vinculacionDesc || null, vinculacionAfectaPrecio: f.vinculacionAfectaPrecio === '' ? null : f.vinculacionAfectaPrecio === 'si',
    metodoValoracion: f.metodoValoracion, formaPago: f.formaPago || null, plazoPagoDias: n(f.plazoPagoDias), paymentTerms: f.paymentTerms || null,
    rfcImportador: f.rfcImportador || null, pesoBrutoKg: n(f.pesoBrutoKg), pesoNetoKg: n(f.pesoNetoKg), vigenciaHasta: f.vigenciaHasta || null, plantillaId: f.plantillaId,
  }
}

export function MVEPage() {
  const [tab, setTab] = useState<Tab>('nueva')
  const [dashboard, setDashboard] = useState<MVEDashboard | null>(null)
  const [catalogos, setCatalogos] = useState<CatalogosE2 | null>(null)
  const [step, setStep] = useState<Step>('paste')
  const [invoiceText, setInvoiceText] = useState('')
  const [form, setForm] = useEstadoPersistente<FormE2>('mve', FORM_INICIAL)
  const [items, setItems] = useState<ExtraccionE2['items']>([])
  const [plantillaAplicada, setPlantillaAplicada] = useState<PlantillaAplicada | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [creada, setCreada] = useState<{ id: string; cuadre: Cuadre } | null>(null)
  const { can, cannot } = usePermissions()

  useEffect(() => {
    api.mveDashboard().then((r) => setDashboard(r.data)).catch(() => {})
    mveApi.catalogos().then((r) => setCatalogos(r.data)).catch(() => {})
  }, [])

  async function handleExtract() {
    if (!invoiceText.trim()) return
    setLoading(true); setError('')
    try {
      const res = await mveApi.extraer(invoiceText)
      setForm(formDesdeExtraccion(res.data, res.plantillaAplicada?.id ?? null))
      setItems(res.data.items ?? [])
      setPlantillaAplicada(res.plantillaAplicada)
      setStep('review')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al extraer') }
    setLoading(false)
  }

  async function handleCreate() {
    setCreating(true); setError('')
    try {
      const res = await mveApi.crear(cuerpoDesdeForm(form))
      setCreada({ id: res.data.id, cuadre: res.cuadre })
      setStep('done')
      api.mveDashboard().then((r) => setDashboard(r.data)).catch(() => {})
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al crear MVE') }
    setCreating(false)
  }

  const set = <K extends keyof FormE2>(k: K, v: FormE2[K]) => setForm((f) => ({ ...f, [k]: v }))
  const totalInc = suma(form.incrementables); const totalDec = suma(form.decrementables)
  const valorAduana = Math.round(((Number(form.invoiceValue) || 0) + totalInc - totalDec) * 100) / 100

  const tabs: { key: Tab; label: string; icono: typeof FileText }[] = [
    { key: 'nueva', label: 'Nueva MVE', icono: Sparkles }, { key: 'mves', label: 'MVEs', icono: ListChecks },
    { key: 'plantillas', label: 'Plantillas', icono: Layers }, { key: 'vigencias', label: 'Vigencias', icono: Clock }, { key: 'lote', label: 'Lote', icono: Upload },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-sello-ui">
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { l: 'Total', v: dashboard.total }, { l: 'Borrador', v: dashboard.draft }, { l: 'Validadas', v: dashboard.validated }, { l: 'Firmadas', v: dashboard.signed },
            { l: 'Transmitidas por el usuario', v: dashboard.transmitted }, { l: 'Pendientes', v: dashboard.pendingAction, w: dashboard.pendingAction > 0 },
            { l: 'Valor en aduana', v: `$${Math.round(dashboard.totalValueUSD).toLocaleString()}` },
          ].map((m, i) => (
            <div key={i} className={`bg-superficie border rounded-sello p-4 ${m.w ? 'border-ambar/40' : 'border-linea'}`}>
              <p className="text-13 text-tinta-suave">{m.l}</p>
              <p className={`text-lg font-medium font-sello-mono ${m.w ? 'text-ambar' : 'text-tinta'}`}>{typeof m.v === 'number' ? m.v.toLocaleString() : m.v}</p>
            </div>
          ))}
        </div>
      )}

      <Card header={
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-petroleo" /><h1 className="text-xl font-medium text-tinta">Auto MVE</h1><DemoTag /></div>
          <div className="flex gap-1 flex-wrap">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-sello-sm border transition-colors ${tab === t.key ? 'bg-petroleo text-white border-petroleo' : 'bg-superficie text-tinta border-linea hover:bg-papel-2'}`}>
                <t.icono className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>
        </div>
      }>
        {catalogos && <p className="text-13 text-tinta-suave mb-4">{catalogos.notas.transmision}</p>}

        {tab === 'nueva' && (
          <>
            <div className="flex items-center gap-3 mb-6 text-sm">
              {[{ n: 1, label: 'Pegar factura', key: 'paste' }, { n: 2, label: 'Revisar E2', key: 'review' }, { n: 3, label: 'MVE creada', key: 'done' }].map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-13 font-medium ${step === s.key ? 'bg-petroleo text-white' : 'bg-papel-2 text-tinta-suave border border-linea'}`}>{s.n}</span>
                  <span className={step === s.key ? 'text-petroleo font-medium' : 'text-tinta-suave'}>{s.label}</span>
                  {i < 2 && <span className="w-8 h-px bg-linea" />}
                </div>
              ))}
            </div>

            {step === 'paste' && (
              <div className="space-y-4">
                <Textarea value={invoiceText} onChange={(e) => setInvoiceText(e.target.value)} rows={10} label="Texto de la factura comercial"
                  placeholder="Pega aquí el texto de la factura (invoice): proveedor, número, fecha, partidas, cargos, términos de pago (ej. T/T 30 days), pesos…" />
                <Button onClick={handleExtract} disabled={!invoiceText.trim()} loading={loading}><Sparkles className="w-4 h-4" />{loading ? 'Extrayendo con IA…' : 'Extraer con IA'}</Button>
              </div>
            )}

            {step === 'review' && catalogos && (
              <div className="space-y-6">
                {plantillaAplicada && (
                  <div className="border border-petroleo/30 bg-petroleo-suave rounded-sello p-3 text-sm text-tinta">
                    <Layers className="w-4 h-4 inline mr-1 text-petroleo" /> Plantilla del proveedor <strong>{plantillaAplicada.proveedorNombre}</strong> aplicada (uso #{plantillaAplicada.usos + 1}).
                    {plantillaAplicada.camposAplicados.length > 0 ? ` Pre-llenó: ${plantillaAplicada.camposAplicados.join(', ')}.` : ' La factura ya traía todos los campos estables.'}
                  </div>
                )}

                <section>
                  <h2 className="text-sm font-medium text-tinta mb-3">I. Importador y proveedor</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input label="RFC del importador" mono value={form.rfcImportador} onChange={(e) => set('rfcImportador', e.target.value.toUpperCase())} hint="Del cliente activo (o del tenant)" />
                    <Input label="Proveedor" value={form.providerName} onChange={(e) => set('providerName', e.target.value)} requerido />
                    <Input label="País (ISO-2)" mono value={form.providerCountry} onChange={(e) => set('providerCountry', e.target.value.toUpperCase())} requerido />
                    <Input label="Pedimento (opcional)" mono value={form.pedimento} onChange={(e) => set('pedimento', e.target.value)} />
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-medium text-tinta mb-3">II. Factura, pago y pesos</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input label="Número de factura" mono value={form.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} requerido />
                    <Input label="Fecha" type="date" mono value={form.invoiceDate} onChange={(e) => set('invoiceDate', e.target.value)} requerido />
                    <Input label="Incoterm" mono value={form.incoterm} onChange={(e) => set('incoterm', e.target.value.toUpperCase())} />
                    <Input label="Moneda" mono value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
                    <Input label="Precio pagado o por pagar" type="number" mono value={form.invoiceValue} onChange={(e) => set('invoiceValue', e.target.value)} requerido />
                    <Input label="Tipo de cambio (opcional)" type="number" mono value={form.exchangeRate} onChange={(e) => set('exchangeRate', e.target.value)} />
                    <Input label="Peso bruto (kg)" type="number" mono value={form.pesoBrutoKg} onChange={(e) => set('pesoBrutoKg', e.target.value)} />
                    <Input label="Peso neto (kg)" type="number" mono value={form.pesoNetoKg} onChange={(e) => set('pesoNetoKg', e.target.value)} />
                    <Select label="Forma de pago" value={form.formaPago} onChange={(e) => set('formaPago', e.target.value)} hint={catalogos.notas.formasPago}>
                      <option value="">— sin capturar —</option>
                      {catalogos.formasPago.map((f) => <option key={f.clave} value={f.clave}>{f.etiqueta}</option>)}
                    </Select>
                    <Input label="Plazo de pago (días)" type="number" mono value={form.plazoPagoDias} onChange={(e) => set('plazoPagoDias', e.target.value)} />
                    <Input label="Términos textuales de la factura" value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} className="col-span-2" />
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-medium text-tinta mb-3">III. Método de valoración</h2>
                  <Select value={form.metodoValoracion} onChange={(e) => set('metodoValoracion', e.target.value)} hint={catalogos.notas.claves}>
                    {catalogos.metodosValoracion.map((m) => <option key={m.clave} value={m.clave}>{m.orden}. {m.etiqueta} — {m.fundamento}</option>)}
                  </Select>
                </section>

                <section className="grid md:grid-cols-2 gap-4">
                  <ListaAjustes titulo="IV. Incrementables por concepto (Art. 65 LA)" lista={form.incrementables} opciones={catalogos.incrementables} onChange={(l) => set('incrementables', l)} moneda={form.currency} />
                  <ListaAjustes titulo="Decrementables por concepto (Art. 66 LA)" lista={form.decrementables} opciones={catalogos.decrementables} onChange={(l) => set('decrementables', l)} moneda={form.currency} />
                </section>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { l: 'Precio pagado', v: Number(form.invoiceValue) || 0 }, { l: '+ Incrementables', v: totalInc }, { l: '− Decrementables', v: totalDec },
                  ].map((x) => (
                    <div key={x.l} className="bg-papel-2 border border-linea rounded-sello p-3"><p className="text-13 text-tinta-suave">{x.l}</p><p className="font-sello-mono text-tinta">{money(x.v, form.currency)}</p></div>
                  ))}
                  <div className="bg-petroleo-suave border border-petroleo/30 rounded-sello p-3"><p className="text-13 text-petroleo">= Valor en aduana</p><p className="font-sello-mono font-medium text-petroleo">{money(valorAduana, form.currency)}</p></div>
                </div>

                <section>
                  <h2 className="text-sm font-medium text-tinta mb-3">V. Vinculación</h2>
                  <div className="grid md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 text-sm text-tinta"><input type="checkbox" checked={form.hasVinculacion} onChange={(e) => set('hasVinculacion', e.target.checked)} /> Existe vinculación importador–proveedor</label>
                    {form.hasVinculacion && (
                      <>
                        <Input label="Descripción" value={form.vinculacionDesc} onChange={(e) => set('vinculacionDesc', e.target.value)} />
                        <Select label="¿Afectó el precio?" value={form.vinculacionAfectaPrecio} onChange={(e) => set('vinculacionAfectaPrecio', e.target.value as FormE2['vinculacionAfectaPrecio'])}>
                          <option value="">— por contestar —</option><option value="no">No</option><option value="si">Sí</option>
                        </Select>
                      </>
                    )}
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-medium text-tinta mb-3">VI. Vigencia (por proveedor/operación)</h2>
                  <Input label="Vigencia hasta" type="date" mono value={form.vigenciaHasta} onChange={(e) => set('vigenciaHasta', e.target.value)} hint={catalogos.notas.vigencia} className="max-w-xs" />
                </section>

                {items.length > 0 && (
                  <section className="bg-papel-2 border border-linea rounded-sello p-4">
                    <p className="text-sm font-medium text-tinta mb-2">Partidas de la factura ({items.length}) — la MVE no clasifica; la fracción la da el Clasificador</p>
                    {items.map((it, i) => (
                      <div key={i} className="flex justify-between text-13 py-1 border-b border-linea last:border-b-0">
                        <span className="text-tinta flex-1 truncate">{it.description}</span>
                        <span className="text-tinta-suave mx-3 font-sello-mono">{it.quantity} × {it.unitPrice}</span>
                        <span className="font-sello-mono text-tinta">{money(it.totalPrice, form.currency)}</span>
                      </div>
                    ))}
                  </section>
                )}

                <div className="flex gap-3">
                  <Button variante="secundario" onClick={() => setStep('paste')}>Regresar</Button>
                  <Button onClick={handleCreate} loading={creating} disabled={cannot('autoMVE', 'create') || !form.providerName || !form.invoiceNumber || !form.invoiceDate || !form.invoiceValue}
                    title={cannot('autoMVE', 'create') ? 'Requiere rol con permiso autoMVE:create' : ''}>
                    {can('autoMVE', 'create') ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />} Guardar MVE (lista para transmitir)
                  </Button>
                </div>
              </div>
            )}

            {step === 'done' && creada && (
              <div className="text-center py-10">
                <span className="inline-flex w-14 h-14 rounded-sello bg-petroleo-suave border border-petroleo/30 items-center justify-center mb-4"><Check className="w-7 h-7 text-petroleo" /></span>
                <p className="text-base font-medium text-tinta">MVE guardada — lista para transmitir</p>
                <p className="text-13 text-tinta-suave font-sello-mono mt-1">{creada.id}</p>
                {!creada.cuadre.cuadra && <p className="text-13 text-ambar mt-2">Aviso de cuadre: {creada.cuadre.diferencias.join('; ')}</p>}
                <div className="flex gap-3 justify-center mt-6">
                  <Button variante="secundario" onClick={() => mveApi.descargarLayoutXml(creada.id, form.invoiceNumber).catch((e) => setError(e.message))}><Download className="w-4 h-4" /> Descargar layout (XML de trabajo)</Button>
                  <Button onClick={() => { setStep('paste'); setInvoiceText(''); setForm(FORM_INICIAL); setItems([]); setPlantillaAplicada(null); setCreada(null) }}>Crear otra MVE</Button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'mves' && <ListaMVEs catalogos={catalogos} onError={setError} canSign={can('autoMVE', 'sign')} />}
        {tab === 'plantillas' && <Plantillas catalogos={catalogos} />}
        {tab === 'vigencias' && <Vigencias />}
        {tab === 'lote' && <Lote onError={setError} canCreate={can('autoMVE', 'create')} />}

        {error && <div className="mt-4 flex items-center gap-2 p-3 rounded-sello bg-carmin-suave border border-carmin/25"><AlertCircle className="w-4 h-4 text-carmin" /><p className="text-sm text-carmin">{error}</p></div>}
      </Card>
    </div>
  )
}

function ListaAjustes({ titulo, lista, opciones, onChange, moneda }: { titulo: string; lista: AjusteConcepto[]; opciones: CatalogosE2['incrementables']; onChange: (l: AjusteConcepto[]) => void; moneda: string }) {
  const upd = (i: number, p: Partial<AjusteConcepto>) => onChange(lista.map((a, j) => (j === i ? { ...a, ...p } : a)))
  return (
    <div className="border border-linea rounded-sello p-4 space-y-2">
      <div className="flex items-center justify-between"><h2 className="text-sm font-medium text-tinta">{titulo}</h2><span className="font-sello-mono text-sm text-tinta">{money(suma(lista), moneda)}</span></div>
      {lista.length === 0 && <p className="text-13 text-tinta-suave">Sin conceptos.</p>}
      {lista.map((a, i) => {
        const op = opciones.find((o) => o.clave === a.concepto)
        return (
          <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
            <div>
              <Select value={a.concepto} onChange={(e) => upd(i, { concepto: e.target.value })}>
                {opciones.map((o) => <option key={o.clave} value={o.clave}>{o.etiqueta}</option>)}
              </Select>
              <p className="text-13 text-tinta-suave mt-0.5">{op?.fundamento}{op?.cotejo === 'pendiente' ? ' · pendiente de cotejo' : ''}{a.descripcion ? ` · ${a.descripcion}` : ''}</p>
            </div>
            <Input type="number" mono value={String(a.monto)} onChange={(e) => upd(i, { monto: Number(e.target.value) })} />
            <Button variante="ghost" tamano="sm" aria-label="Quitar concepto" onClick={() => onChange(lista.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
          </div>
        )
      })}
      <Button variante="secundario" tamano="sm" disabled={opciones.length === 0} onClick={() => onChange([...lista, { concepto: opciones[0]?.clave ?? 'otros', monto: 0, descripcion: null }])}><Plus className="w-3.5 h-3.5" /> Agregar concepto</Button>
    </div>
  )
}

function EstadoTransmision({ m }: { m: MVEE2Record }) {
  if (m.estadoTransmision === 'transmitida_por_usuario') {
    return <Badge tono="petroleo">Transmitida por el usuario · folio {m.formatoE2?.transmision?.folioVucem ?? '—'}</Badge>
  }
  return <Badge tono="neutral">Lista para transmitir</Badge>
}

function ListaMVEs({ catalogos, onError, canSign }: { catalogos: CatalogosE2 | null; onError: (e: string) => void; canSign: boolean }) {
  const [mves, setMves] = useState<MVEE2Record[]>([])
  const [cargando, setCargando] = useState(true)
  const [marcando, setMarcando] = useState<MVEE2Record | null>(null)
  const [folio, setFolio] = useState(''); const [fecha, setFecha] = useState('')
  const cargar = useCallback(() => { setCargando(true); mveApi.listar().then((r) => setMves(r.data)).catch((e) => onError(e.message)).finally(() => setCargando(false)) }, [onError])
  useEffect(() => { cargar() }, [cargar])

  async function marcar() {
    if (!marcando) return
    try { await mveApi.marcarTransmitida(marcando.id, folio, fecha); setMarcando(null); setFolio(''); setFecha(''); cargar() } catch (e) { onError(e instanceof Error ? e.message : 'Error') }
  }

  if (cargando) return <p className="text-sm text-tinta-suave">Cargando MVEs…</p>
  if (mves.length === 0) return <EmptyState icono={FileText} titulo="Sin MVEs" descripcion="Crea la primera desde 'Nueva MVE' o sube varias en 'Lote'." />
  return (
    <div className="space-y-3">
      {catalogos && <p className="text-13 text-tinta-suave">{catalogos.notas.layout}</p>}
      <DataTable<MVEE2Record> filas={mves} filaKey={(m) => m.id} columnas={[
        { key: 'prov', header: 'Proveedor', render: (m) => <span>{m.providerName} <span className="text-tinta-suave">({m.providerCountry})</span></span> },
        { key: 'fac', header: 'Factura', mono: true, render: (m) => `${m.invoiceNumber} · ${m.invoiceDate.slice(0, 10)}` },
        { key: 'rfc', header: 'RFC', mono: true, render: (m) => m.rfcImportador ?? '—' },
        { key: 'val', header: 'Valor en aduana', align: 'right', mono: true, render: (m) => money(m.customsValue, m.currency) },
        { key: 'met', header: 'Método / pago', render: (m) => <span className="text-13">{m.metodoValoracion ?? 'valor_transaccion'} · {m.formaPago ?? 'sin capturar'}</span> },
        { key: 'est', header: 'Estado', render: (m) => <EstadoTransmision m={m} /> },
        { key: 'acc', header: '', render: (m) => (
          <div className="flex gap-1 justify-end">
            <Button variante="ghost" tamano="sm" title="Descargar layout XML de trabajo" onClick={() => mveApi.descargarLayoutXml(m.id, m.invoiceNumber).catch((e) => onError(e.message))}><Download className="w-4 h-4" /></Button>
            {m.estadoTransmision !== 'transmitida_por_usuario' && canSign && <Button variante="secundario" tamano="sm" onClick={() => setMarcando(m)}>Marcar transmitida</Button>}
          </div>
        ) },
      ]} />
      {marcando && (
        <div className="border border-linea rounded-sello p-4 bg-papel-2 space-y-3">
          <p className="text-sm text-tinta">Registra la transmisión que TÚ hiciste en VUCEM para la factura <strong className="font-sello-mono">{marcando.invoiceNumber}</strong>. ADUANAI no transmite.</p>
          <div className="grid md:grid-cols-3 gap-3">
            <Input label="Folio VUCEM" mono value={folio} onChange={(e) => setFolio(e.target.value)} requerido />
            <Input label="Fecha de transmisión" type="date" mono value={fecha} onChange={(e) => setFecha(e.target.value)} requerido />
            <div className="flex items-end gap-2"><Button onClick={marcar} disabled={folio.trim().length < 4 || !fecha}>Guardar folio</Button><Button variante="ghost" onClick={() => setMarcando(null)}>Cancelar</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function Plantillas({ catalogos }: { catalogos: CatalogosE2 | null }) {
  const [plantillas, setPlantillas] = useState<PlantillaProveedor[] | null>(null)
  useEffect(() => { mveApi.plantillas().then((r) => setPlantillas(r.data)).catch(() => setPlantillas([])) }, [])
  const etiqueta = (lista: CatalogosE2['incrementables'] | undefined, clave: string) => lista?.find((o) => o.clave === clave)?.etiqueta ?? clave
  if (!plantillas) return <p className="text-sm text-tinta-suave">Cargando plantillas…</p>
  if (plantillas.length === 0) return <EmptyState icono={Layers} titulo="Sin plantillas todavía" descripcion="Al guardar la primera MVE de un proveedor se crea su plantilla (incoterm, moneda, conceptos típicos, vinculación, forma de pago). La segunda vez se pre-llena sola." />
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {plantillas.map((p) => (
        <div key={p.id} className="border border-linea rounded-sello p-4 space-y-1.5">
          <div className="flex items-center justify-between"><p className="font-medium text-tinta">{p.proveedorNombre} <span className="text-tinta-suave">({p.proveedorPais ?? '—'})</span></p><Badge>{p.usos} uso{p.usos === 1 ? '' : 's'}</Badge></div>
          <p className="text-13 text-tinta"><span className="text-tinta-suave">Incoterm / moneda:</span> {p.campos.incoterm} · {p.campos.currency}</p>
          <p className="text-13 text-tinta"><span className="text-tinta-suave">Forma de pago:</span> {p.campos.formaPago ? etiqueta(catalogos?.formasPago, p.campos.formaPago) : 'sin capturar'}{p.campos.plazoPagoDias != null ? ` · ${p.campos.plazoPagoDias} días` : ''}</p>
          <p className="text-13 text-tinta"><span className="text-tinta-suave">Método:</span> {etiqueta(catalogos?.metodosValoracion, p.campos.metodoValoracion ?? 'valor_transaccion')}</p>
          <p className="text-13 text-tinta"><span className="text-tinta-suave">Incrementables típicos:</span> {(p.campos.incrementablesTipicos ?? []).map((c) => etiqueta(catalogos?.incrementables, c)).join(', ') || 'ninguno'}</p>
          <p className="text-13 text-tinta"><span className="text-tinta-suave">Vinculación:</span> {p.campos.hasVinculacion ? 'sí' : 'no'}</p>
          <p className="text-13 text-tinta-suave">Actualizada {new Date(p.updatedAt).toLocaleDateString('es-MX')}</p>
        </div>
      ))}
    </div>
  )
}

function Vigencias() {
  const [data, setData] = useState<{ proveedores: VigenciaProveedor[]; nota: string; resumen: Record<Semaforo, number> } | null>(null)
  useEffect(() => { mveApi.vigencias().then((r) => setData(r.data)).catch(() => setData({ proveedores: [], nota: '', resumen: { verde: 0, ambar: 0, rojo: 0, gris: 0 } })) }, [])
  if (!data) return <p className="text-sm text-tinta-suave">Cargando vigencias…</p>
  if (data.proveedores.length === 0) return <EmptyState icono={Clock} titulo="Sin proveedores con MVE" descripcion="Cuando guardes MVEs verás aquí el semáforo de vigencia por proveedor." />
  return (
    <div className="space-y-3">
      <p className="text-13 text-tinta-suave">{data.nota}</p>
      <div className="flex gap-2 flex-wrap">{(['rojo', 'ambar', 'verde', 'gris'] as Semaforo[]).map((s) => <Badge key={s} tono={TONO[s]}>{ETIQUETA_SEMAFORO[s]}: {data.resumen[s]}</Badge>)}</div>
      <DataTable<VigenciaProveedor> filas={data.proveedores} filaKey={(p) => p.proveedor} columnas={[
        { key: 'p', header: 'Proveedor', render: (p) => <span>{p.proveedor} <span className="text-tinta-suave">({p.pais})</span></span> },
        { key: 'n', header: 'MVEs', align: 'right', mono: true, render: (p) => p.mves },
        { key: 'f', header: 'Última factura', mono: true, render: (p) => p.ultimaFactura },
        { key: 'v', header: 'Vigencia hasta', mono: true, render: (p) => p.vigenciaHasta ?? 'sin capturar' },
        { key: 's', header: 'Semáforo', render: (p) => <Badge tono={TONO[p.semaforo]}>{ETIQUETA_SEMAFORO[p.semaforo]}{p.diasRestantes != null ? ` · ${p.diasRestantes} días` : ''}</Badge> },
      ]} />
    </div>
  )
}

function Lote({ onError, canCreate }: { onError: (e: string) => void; canCreate: boolean }) {
  const [archivos, setArchivos] = useState<{ nombre: string; contenidoBase64: string }[]>([])
  const [texto, setTexto] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoLote | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files) return
    const leidos = await Promise.all(Array.from(files).slice(0, 20).map(async (f) => {
      const buf = await f.arrayBuffer()
      let bin = ''; const bytes = new Uint8Array(buf); for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0)
      return { nombre: f.name, contenidoBase64: btoa(bin) }
    }))
    setArchivos(leidos)
  }

  async function procesar() {
    const facturas: { nombre?: string; contenidoBase64?: string; texto?: string }[] = [...archivos]
    const bloques = texto.split(/\n\s*={5,}\s*\n/).map((t) => t.trim()).filter((t) => t.length >= 20)
    bloques.forEach((b, i) => facturas.push({ nombre: `pegada-${i + 1}`, texto: b }))
    if (facturas.length === 0) return
    if (facturas.length > 20) { onError('Máximo 20 facturas por lote'); return }
    setProcesando(true)
    try { const r = await mveApi.lote(facturas); setResultado(r.data) } catch (e) { onError(e instanceof Error ? e.message : 'Error en lote') }
    setProcesando(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-suave">Una MVE por factura, procesadas en secuencia con el mismo extractor (máx. 20). Archivos de texto (.txt) o bloques pegados separados por una línea de <code className="font-sello-mono">=====</code>. PDF no se acepta en lote: pega el texto.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-dashed border-linea rounded-sello p-4">
          <label className="text-sm text-tinta block mb-2">Archivos .txt</label>
          <input type="file" multiple accept=".txt,text/plain" onChange={(e) => onFiles(e.target.files)} className="text-sm" />
          {archivos.length > 0 && <p className="text-13 text-tinta-suave mt-2">{archivos.length} archivo(s): {archivos.map((a) => a.nombre).join(', ')}</p>}
        </div>
        <Textarea label="O pega varias facturas separadas por =====" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <Button onClick={procesar} loading={procesando} disabled={!canCreate || (archivos.length === 0 && texto.trim().length < 20)}><Upload className="w-4 h-4" /> Procesar lote</Button>
      {resultado && (
        <div className="space-y-2">
          <div className="flex gap-2"><Badge tono="petroleo">{resultado.creadas} creadas</Badge>{resultado.fallidas > 0 && <Badge tono="carmin">{resultado.fallidas} fallidas</Badge>}<Badge>{resultado.total} en total</Badge></div>
          <DataTable<ResultadoLote['resultados'][number]> filas={resultado.resultados} filaKey={(r) => String(r.indice)} columnas={[
            { key: 'n', header: '#', mono: true, render: (r) => r.indice + 1 },
            { key: 'a', header: 'Archivo', render: (r) => r.nombre ?? '—' },
            { key: 'r', header: 'Resultado', render: (r) => r.ok ? <span>{r.proveedor} · <span className="font-sello-mono">{r.factura}</span>{r.plantillaAplicada ? <Badge className="ml-2" tono="petroleo">plantilla</Badge> : null}{r.cuadra === false ? <Badge className="ml-2" tono="ambar">revisar cuadre</Badge> : null}</span> : <span className="text-carmin">{r.error}</span> },
            { key: 'v', header: 'Valor en aduana', align: 'right', mono: true, render: (r) => r.customsValue != null ? r.customsValue.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—' },
          ]} />
        </div>
      )}
    </div>
  )
}
