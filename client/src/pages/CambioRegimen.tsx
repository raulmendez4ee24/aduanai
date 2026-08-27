/**
 * Asistente de cambio de régimen y regularizaciones (Operación 2026-08) — /cambio-regimen.
 * Llega desde la alerta `cambio_regimen` con ?ids=a,b&tipo=F4. Selecciona N importaciones
 * temporales con saldo, calcula contribuciones por partida con el motor del Cotizador
 * (TC del sistema o manual), captura actualización/recargos (editables, fundamento
 * pendiente de fuente oficial), arma el expediente con folio y abre la vista imprimible.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Repeat, Calculator, FileText, Printer, AlertTriangle, CheckSquare, Square } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Textarea, EmptyState } from '../components/ui'
import { cambioRegimenApi, type CandidataTI, type CalculoExpediente, type Expediente, type TipoCambio, type DocumentoRequerido } from '../lib/api/cambio-regimen'

export const GUIA_MODULO = {
  titulo: 'Cambio de régimen y regularizaciones',
  pasos: [
    'Elige el tipo: F4 (insumos a definitivo), F5 (activo fijo a definitivo), A3 (regularización) o RT (retorno).',
    'Selecciona las importaciones temporales con saldo; si llegas desde una alerta ya vienen marcadas.',
    'Calcula: IGI, DTA, IEPS e IVA por partida sobre el saldo, con el tipo de cambio del sistema o uno manual.',
    'Captura actualización y recargos si la operación es extemporánea (el sistema no inventa factores del CFF).',
    'Arma el expediente: obtiene folio, checklist documental y vista imprimible para PDF.',
  ],
}

const mxn = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

interface Form { tipo: TipoCambio; seleccion: string[]; tcManual: string; actualizacionMXN: string; recargosMXN: string; notas: string }

export function CambioRegimenPage() {
  const [params] = useSearchParams()
  const idsQuery = useMemo(() => (params.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean), [params])
  const tipoQuery = params.get('tipo')
  const [form, setForm] = useState<Form>({ tipo: (['F4', 'F5', 'A3', 'RT'].includes(tipoQuery ?? '') ? tipoQuery : 'F4') as TipoCambio, seleccion: idsQuery, tcManual: '', actualizacionMXN: '', recargosMXN: '', notas: '' })
  const [tipos, setTipos] = useState<{ tipo: TipoCambio; descripcion: string; documentos: DocumentoRequerido[] }[]>([])
  const [candidatas, setCandidatas] = useState<CandidataTI[]>([])
  const [calculo, setCalculo] = useState<CalculoExpediente | null>(null)
  const [expedientes, setExpedientes] = useState<Expediente[]>([])
  const [cargando, setCargando] = useState(true)
  const [calculando, setCalculando] = useState(false)
  const [armando, setArmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      setCargando(true); setError(null)
      try {
        const [t, c, e] = await Promise.all([cambioRegimenApi.tipos(), cambioRegimenApi.candidatas(), cambioRegimenApi.listar()])
        setTipos(t.data); setExpedientes(e.data)
        // Si vienen ids por querystring que no están en las candidatas por estado/cliente, se piden explícitamente.
        const faltan = idsQuery.filter(id => !c.data.some(x => x.id === id))
        const extra = faltan.length ? (await cambioRegimenApi.candidatas(faltan)).data : []
        setCandidatas([...extra, ...c.data.filter(x => !extra.some(y => y.id === x.id))])
      } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar') }
      setCargando(false)
    })()
  }, [idsQuery])

  const toggle = (id: string) => setForm(f => ({ ...f, seleccion: f.seleccion.includes(id) ? f.seleccion.filter(x => x !== id) : [...f.seleccion, id] }))
  const entrada = () => ({
    temporaryImportIds: form.seleccion, tipo: form.tipo,
    tc: form.tcManual ? Number(form.tcManual) : undefined,
    actualizacionMXN: form.actualizacionMXN ? Number(form.actualizacionMXN) : undefined,
    recargosMXN: form.recargosMXN ? Number(form.recargosMXN) : undefined,
  })

  async function calcular() {
    if (form.seleccion.length === 0) { setError('Selecciona al menos una importación temporal'); return }
    setCalculando(true); setError(null); setAviso(null)
    try { setCalculo((await cambioRegimenApi.calcular(entrada())).data) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo calcular'); setCalculo(null) }
    setCalculando(false)
  }
  async function armar() {
    setArmando(true); setError(null)
    try {
      const r = await cambioRegimenApi.crear({ ...entrada(), notas: form.notas || undefined })
      setExpedientes(x => [r.data, ...x]); setAviso(`Expediente armado con folio ${r.data.calculo.folio ?? r.data.id}.`)
      setCalculo(r.data.calculo)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo armar el expediente') }
    setArmando(false)
  }
  async function imprimir(id: string) {
    try { await cambioRegimenApi.abrirImprimible(id) } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo abrir') }
  }
  async function cambiarEstado(id: string, estado: string) {
    try { const r = await cambioRegimenApi.actualizar(id, { estado }); setExpedientes(x => x.map(e => e.id === id ? r.data : e)) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar') }
  }

  const tipoInfo = tipos.find(t => t.tipo === form.tipo)
  const seleccionadas = candidatas.filter(c => form.seleccion.includes(c.id))

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Card header={
        <div className="flex items-center gap-2 flex-wrap">
          <Repeat className="w-[18px] h-[18px] text-petroleo" strokeWidth={1.5} aria-hidden />
          <h1 className="font-sello-display text-lg text-tinta">Cambio de régimen y regularizaciones</h1>
          {idsQuery.length > 0 && <Badge tono="petroleo">Desde alerta: {idsQuery.length} partida{idsQuery.length === 1 ? '' : 's'}</Badge>}
        </div>
      }>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select label="Tipo de operación" value={form.tipo} onChange={e => { setForm({ ...form, tipo: e.target.value as TipoCambio }); setCalculo(null) }}>
            {(tipos.length ? tipos : [{ tipo: 'F4' as TipoCambio, descripcion: '', documentos: [] }]).map(t => <option key={t.tipo} value={t.tipo}>{t.tipo} — {t.descripcion}</option>)}
          </Select>
          <Input label="Tipo de cambio manual (MXN/USD)" type="number" step="0.0001" mono value={form.tcManual} onChange={e => setForm({ ...form, tcManual: e.target.value })} hint="Vacío = TC del sistema (Banxico FIX)." />
          <Input label="Actualización (MXN)" type="number" step="0.01" mono value={form.actualizacionMXN} onChange={e => setForm({ ...form, actualizacionMXN: e.target.value })} hint="Art. 17-A CFF — captura manual" />
          <Input label="Recargos (MXN)" type="number" step="0.01" mono value={form.recargosMXN} onChange={e => setForm({ ...form, recargosMXN: e.target.value })} hint="Art. 21 CFF — captura manual" />
        </div>
        {tipoInfo && <p className="mt-2 text-sm text-tinta-suave">{tipoInfo.descripcion}</p>}
        {error && <p className="mt-3 text-sm text-carmin flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {error}</p>}
        {aviso && <p className="mt-3 text-sm text-petroleo">{aviso}</p>}
      </Card>

      <Card header={<div className="flex items-center gap-2"><h2 className="font-sello-display text-base text-tinta">Importaciones temporales</h2><Badge tono="neutral">{form.seleccion.length} seleccionadas</Badge>
        <Button className="ml-auto" variante="primario" tamano="sm" loading={calculando} onClick={calcular}><Calculator className="w-4 h-4" /> Calcular contribuciones</Button></div>}>
        {cargando ? <p className="text-sm text-tinta-suave">Cargando…</p> : candidatas.length === 0 ? (
          <EmptyState icono={Repeat} titulo="No hay importaciones temporales con saldo" descripcion="Registra importaciones en Inventario IMMEX o Activo fijo; aquí aparecen las activas, parcialmente descargadas y vencidas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wide text-tinta-suave text-left"><th className="py-1 pr-2"></th><th className="py-1 pr-2">Pedimento</th><th className="py-1 pr-2">Fracción</th><th className="py-1 pr-2">Descripción</th><th className="py-1 pr-2 text-right">Saldo</th><th className="py-1 pr-2 text-right">Valor USD</th><th className="py-1 pr-2">Vence</th><th className="py-1">Tipo</th></tr></thead>
              <tbody>
                {candidatas.map(c => {
                  const sel = form.seleccion.includes(c.id)
                  return (
                    <tr key={c.id} className={`border-t border-linea cursor-pointer ${sel ? 'bg-petroleo-suave/40' : 'hover:bg-papel-2'}`} onClick={() => toggle(c.id)}>
                      <td className="py-1.5 pr-2">{sel ? <CheckSquare className="w-4 h-4 text-petroleo" /> : <Square className="w-4 h-4 text-tinta-suave" />}</td>
                      <td className="py-1.5 pr-2 font-mono text-[12px]">{c.pedimento}</td>
                      <td className="py-1.5 pr-2 font-mono text-[12px]">{c.fractionCode}</td>
                      <td className="py-1.5 pr-2 text-tinta truncate max-w-[260px]">{c.description}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{c.saldo} {c.unit}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{c.customsValue.toLocaleString('es-MX')}</td>
                      <td className="py-1.5 pr-2">{fecha(c.expirationDate)}</td>
                      <td className="py-1.5"><Badge tono={c.tipo === 'ACTIVO_FIJO' ? 'petroleo' : 'neutral'}>{c.tipo === 'ACTIVO_FIJO' ? 'AF' : 'insumo'}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {calculo && (
        <Card header={<div className="flex items-center gap-2 flex-wrap"><h2 className="font-sello-display text-base text-tinta">Cálculo por partida</h2>
          <Badge tono="neutral">TC {calculo.tc.valor} ({calculo.tc.fuente}{calculo.tc.fecha ? `, ${calculo.tc.fecha.slice(0, 10)}` : ''})</Badge>
          {calculo.clavePedimento && <Badge tono="petroleo">Clave {calculo.clavePedimento.clave} · Anexo 22</Badge>}
          {calculo.folio && <Badge tono="petroleo">Folio {calculo.folio}</Badge>}</div>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wide text-tinta-suave text-left"><th className="py-1 pr-2">Pedimento</th><th className="py-1 pr-2">Fracción</th><th className="py-1 pr-2 text-right">Saldo</th><th className="py-1 pr-2 text-right">Valor MXN</th><th className="py-1 pr-2 text-right">IGI</th><th className="py-1 pr-2 text-right">DTA</th><th className="py-1 pr-2 text-right">IEPS</th><th className="py-1 pr-2 text-right">IVA</th><th className="py-1 text-right">Total</th></tr></thead>
              <tbody>
                {calculo.partidas.map(p => (
                  <Fragment key={p.temporaryImportId}>
                    <tr className="border-t border-linea">
                      <td className="py-1.5 pr-2 font-mono text-[12px]">{p.pedimento}</td><td className="py-1.5 pr-2 font-mono text-[12px]">{p.fractionCode}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{p.saldoCantidad} {p.unit}</td><td className="py-1.5 pr-2 text-right font-mono">{mxn(p.saldoValorMXN)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{p.tasas.igiPct}% · {mxn(p.montos.igi)}</td><td className="py-1.5 pr-2 text-right font-mono">{mxn(p.montos.dta)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{mxn(p.montos.ieps)}</td><td className="py-1.5 pr-2 text-right font-mono">{mxn(p.montos.iva)}</td><td className="py-1.5 text-right font-mono font-semibold">{mxn(p.montos.total)}</td>
                    </tr>
                    {p.notas.length > 0 && <tr><td colSpan={9} className="pb-1.5 text-[12px] text-ambar">{p.notas.join(' · ')}</td></tr>}
                  </Fragment>
                ))}
                <tr className="border-t border-linea font-semibold"><td colSpan={3} className="py-1.5">Subtotales</td><td className="text-right font-mono">{mxn(calculo.subtotales.saldoValorMXN)}</td><td className="text-right font-mono">{mxn(calculo.subtotales.igi)}</td><td className="text-right font-mono">{mxn(calculo.subtotales.dta)}</td><td className="text-right font-mono">{mxn(calculo.subtotales.ieps)}</td><td className="text-right font-mono">{mxn(calculo.subtotales.iva)}</td><td className="text-right font-mono">{mxn(calculo.subtotales.contribuciones)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-sello-sm border border-linea p-3"><p className="text-[11px] uppercase tracking-wide text-tinta-suave">Actualización</p><p className="font-mono text-tinta">{mxn(calculo.actualizacion.montoMXN)}</p><p className="text-[12px] text-tinta-suave">{calculo.actualizacion.fundamento}</p></div>
            <div className="rounded-sello-sm border border-linea p-3"><p className="text-[11px] uppercase tracking-wide text-tinta-suave">Recargos</p><p className="font-mono text-tinta">{mxn(calculo.recargos.montoMXN)}</p><p className="text-[12px] text-tinta-suave">{calculo.recargos.fundamento}</p></div>
            <div className="rounded-sello-sm border border-petroleo p-3 bg-petroleo-suave/40"><p className="text-[11px] uppercase tracking-wide text-tinta-suave">Total a pagar</p><p className="font-sello-display text-2xl text-tinta">{mxn(calculo.total)}</p></div>
          </div>
          {calculo.advertencias.length > 0 && <ul className="mt-3 text-sm text-ambar list-disc pl-5">{calculo.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>}
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-tinta-suave mb-1">Documentos del expediente (checklist operativo)</p>
            <ul className="text-sm text-tinta grid grid-cols-1 md:grid-cols-2 gap-x-6">{calculo.documentos.map(d => <li key={d.clave}>☐ {d.label}{d.obligatorio ? '' : <span className="text-tinta-suave"> (opcional)</span>}</li>)}</ul>
          </div>
          {!calculo.folio && (
            <div className="mt-3 flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[240px]"><Textarea label="Notas del expediente" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>
              <Button variante="primario" tamano="sm" loading={armando} onClick={armar}><FileText className="w-4 h-4" /> Armar expediente ({seleccionadas.length} partidas)</Button>
            </div>
          )}
        </Card>
      )}

      <Card header={<h2 className="font-sello-display text-base text-tinta">Expedientes ({expedientes.length})</h2>}>
        {expedientes.length === 0 ? <p className="text-sm text-tinta-suave">Aún no hay expedientes armados.</p> : (
          <ul className="divide-y divide-linea -my-2">
            {expedientes.map(e => (
              <li key={e.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[12px] text-tinta">{e.calculo.folio ?? e.id}</span>
                <Badge tono="petroleo">{e.tipo}</Badge>
                <span className="text-sm text-tinta-suave">{e.temporaryImportIds.length} partida{e.temporaryImportIds.length === 1 ? '' : 's'} · total {mxn(e.calculo.total)} · {fecha(e.createdAt)}</span>
                <select className="ml-auto text-[12px] border border-linea rounded-sello-sm px-2 py-1 bg-superficie" value={e.estado} onChange={ev => cambiarEstado(e.id, ev.target.value)} aria-label="Estado">
                  <option value="borrador">borrador</option><option value="listo">listo</option><option value="presentado">presentado</option>
                </select>
                <Button variante="secundario" tamano="sm" onClick={() => imprimir(e.id)}><Printer className="w-4 h-4" /> Imprimible</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
