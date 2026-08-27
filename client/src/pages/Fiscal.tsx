/**
 * Fiscal Guardian — Ola 2: el calendario vivo de la certificación IVA/IEPS.
 * Pestañas: Resumen · Certificación (semáforo por obligación + avisos) ·
 * Créditos (descargo como flujo + reporte) · Conciliación (vs Anexo 30) ·
 * Simulador (si pierdes la certificación) · Garantías · Riesgos.
 *
 * Regla: números reales o estado vacío honesto; nada decorativo.
 */
import { DemoTag } from '../components/DemoBanner'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { FiscalDashboard, TaxCreditRecord, GuaranteeRecord, CertificationProfileRecord, FiscalRiskReport } from '../lib/api'
import { fiscalApi } from '../lib/api/fiscal'
import type { SemaforoCertificacion, SemaforoOb, ObligacionCalendarioRecord, DefinicionAviso, Conciliacion, SimuladorPerdida, Bucket } from '../lib/api/fiscal'
import { Shield, AlertTriangle, ChevronRight, CalendarClock, Download, Scale, Calculator, FileWarning } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { ROITile } from '../components/ROIBanner'
import { Button, Card, Badge, Input, Select, EmptyState, DataTable } from '../components/ui'

export const GUIA_MODULO = {
  titulo: 'Fiscal Guardian',
  pasos: [
    'Captura tu perfil de certificación (rubro A/AA/AAA, fecha de vencimiento): el semáforo evalúa cada obligación con fundamento y marca las que siguen "pendientes de cotejo".',
    'Registra avisos (domicilio, socios, clientes/proveedores) y sincroniza la renovación: se crean obligaciones en el Calendario con fecha límite; repetir el mismo evento no duplica.',
    'En Créditos, descarga saldos contra el pedimento de retorno: el sistema rechaza montos mayores al saldo y deja rastro en auditoría; exporta el reporte a Excel.',
    'En Conciliación, elige el periodo (2026-Q3, 2026-08 o 2026) y compara tus créditos por antigüedad contra el estado de cuenta Anexo 30 capturado.',
    'En Simulador ves el IVA mensual que tendrías que pagar o garantizar sin certificación, con tus importaciones reales y el tipo de cambio del sistema; el costo de garantía solo se calcula con el % que tú captures.',
  ],
}

type Tab = 'resumen' | 'cert' | 'credits' | 'conciliacion' | 'simulador' | 'guarantees' | 'risks'
const TONO: Record<SemaforoOb, 'petroleo' | 'ambar' | 'carmin' | 'neutral'> = { verde: 'petroleo', ambar: 'ambar', rojo: 'carmin', gris: 'neutral' }
const ETIQ: Record<SemaforoOb, string> = { verde: 'En orden', ambar: 'Atención', rojo: 'Crítico', gris: 'Sin datos' }
const mxn = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`

export function FiscalPage() {
  const [tab, setTab] = useState<Tab>('resumen')
  const [dash, setDash] = useState<FiscalDashboard | null>(null)
  const [credits, setCredits] = useState<TaxCreditRecord[]>([])
  const [guarantees, setGuarantees] = useState<GuaranteeRecord[]>([])
  const [cert, setCert] = useState<CertificationProfileRecord | null>(null)
  const [risks, setRisks] = useState<FiscalRiskReport | null>(null)
  const [semaforo, setSemaforo] = useState<SemaforoCertificacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargarCreditos = useCallback(() => api.fiscalCredits().then((r) => setCredits(r.data)).catch(() => {}), [])
  const cargarSemaforo = useCallback(() => fiscalApi.semaforo().then((r) => setSemaforo(r.data)).catch(() => {}), [])

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([api.fiscalDashboard(), api.fiscalCredits(), api.fiscalGuarantees(), api.fiscalCertification(), api.fiscalRisks(), fiscalApi.semaforo()])
      if (results[0].status === 'fulfilled') setDash(results[0].value.data)
      if (results[1].status === 'fulfilled') setCredits(results[1].value.data)
      if (results[2].status === 'fulfilled') setGuarantees(results[2].value.data)
      if (results[3].status === 'fulfilled') setCert(results[3].value.data)
      if (results[4].status === 'fulfilled') setRisks(results[4].value.data)
      if (results[5].status === 'fulfilled') setSemaforo(results[5].value.data)
      setLoading(false)
    }
    load()
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' }, { key: 'cert', label: 'Certificación' }, { key: 'credits', label: 'Créditos' },
    { key: 'conciliacion', label: 'Conciliación' }, { key: 'simulador', label: 'Simulador' }, { key: 'guarantees', label: 'Garantías' }, { key: 'risks', label: 'Riesgos' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-sello-ui">
      <Card header={
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-petroleo" /><h1 className="text-xl font-medium text-tinta">Fiscal Guardian</h1><DemoTag />{loading && <span className="text-13 text-tinta-suave ml-2">Cargando…</span>}</div>
          <div className="flex gap-1 flex-wrap">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} disabled={loading} className={`text-sm px-3 py-1.5 rounded-sello-sm border transition-colors disabled:opacity-50 ${tab === t.key ? 'bg-petroleo text-white border-petroleo' : 'bg-superficie text-tinta border-linea hover:bg-papel-2'}`}>{t.label}</button>
            ))}
          </div>
        </div>
      }>
        <div className="mb-4"><ROITile moduleKey="fiscalGuardian" /></div>

        {!loading && tab === 'resumen' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Créditos activos', val: dash ? String(dash.activeCredits) : '—' },
                { label: 'Saldo pendiente de descargo', val: dash ? mxn(dash.totalPending) : '—' },
                { label: 'Garantías activas', val: dash ? String(dash.activeGuarantees) : '—' },
                { label: 'Certificación', val: semaforo ? `${semaforo.rubro ?? 'sin rubro'} · ${ETIQ[semaforo.global]}` : '—', tono: semaforo?.global },
              ].map((m, i) => (
                <div key={i} className={`bg-superficie border rounded-sello p-4 ${m.tono === 'rojo' ? 'border-carmin/40' : m.tono === 'ambar' ? 'border-ambar/40' : 'border-linea'}`}>
                  <p className="text-13 text-tinta-suave">{m.label}</p>
                  <p className="text-lg font-medium font-sello-mono text-tinta">{m.val}</p>
                </div>
              ))}
            </div>
            {semaforo ? (
              <div className="border border-linea rounded-sello p-4">
                <p className="text-sm font-medium text-tinta mb-2">Obligaciones de la certificación</p>
                <div className="flex gap-2 flex-wrap">{(['rojo', 'ambar', 'verde', 'gris'] as SemaforoOb[]).map((s) => <Badge key={s} tono={TONO[s]}>{ETIQ[s]}: {semaforo.resumen[s]}</Badge>)}<Badge>{semaforo.pendientesDeCotejo} pendientes de cotejo</Badge></div>
                <Button variante="ghost" tamano="sm" className="mt-2" onClick={() => setTab('cert')}>Ver detalle <ChevronRight className="w-3.5 h-3.5" /></Button>
              </div>
            ) : <p className="text-sm text-tinta-suave">Sin datos de certificación.</p>}
            {dash && dash.riskFactors.length > 0 && (
              <div className="border border-ambar/40 bg-ambar-suave rounded-sello p-4">
                <p className="text-sm font-medium text-ambar mb-1">Factores detectados</p>
                {dash.riskFactors.map((f, i) => <p key={i} className="text-13 text-tinta">• {f}</p>)}
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'cert' && <Certificacion cert={cert} semaforo={semaforo} recargar={cargarSemaforo} onError={setError} />}
        {!loading && tab === 'credits' && <Creditos credits={credits} recargar={cargarCreditos} onError={setError} />}
        {!loading && tab === 'conciliacion' && <ConciliacionTab onError={setError} />}
        {!loading && tab === 'simulador' && <Simulador onError={setError} />}

        {!loading && tab === 'guarantees' && (
          guarantees.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-3">
              {guarantees.map((g) => (
                <div key={g.id} className={`border rounded-sello p-4 ${g.alertLevel === 'danger' || g.alertLevel === 'expired' ? 'border-carmin/40' : g.alertLevel === 'warning' ? 'border-ambar/40' : 'border-linea'}`}>
                  <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-tinta">{g.type}</span><Badge tono={g.alertLevel === 'ok' ? 'petroleo' : g.alertLevel === 'warning' ? 'ambar' : 'carmin'}>{g.status}{g.daysLeft !== undefined && ` · ${g.daysLeft} d`}</Badge></div>
                  <p className="text-lg font-sello-mono text-tinta">{mxn(g.amount)}</p>
                  <p className="text-13 text-tinta-suave mt-1">{g.institution}{g.referenceNumber && ` — ${g.referenceNumber}`}</p>
                  <div className="flex justify-between text-13 text-tinta-suave mt-2"><span>Emisión {new Date(g.issueDate).toLocaleDateString('es-MX')}</span><span>Vence {new Date(g.expiryDate).toLocaleDateString('es-MX')}</span></div>
                </div>
              ))}
            </div>
          ) : <EmptyState icono={Shield} titulo="Sin garantías registradas" descripcion="Si tu rubro exige garantía del interés fiscal, regístrala para vigilar su vencimiento." />
        )}

        {!loading && tab === 'risks' && (
          risks && risks.risks.length > 0 ? (
            <div className="space-y-2">
              <div className="flex gap-2 mb-3">{risks.critical > 0 && <Badge tono="carmin">{risks.critical} críticos</Badge>}{risks.high > 0 && <Badge tono="ambar">{risks.high} altos</Badge>}<Badge>{risks.total} detectados</Badge></div>
              {risks.aiSummary && <div className="border border-linea rounded-sello p-4 text-sm text-tinta leading-relaxed">{risks.aiSummary}</div>}
              {risks.risks.map((r, i) => (
                <div key={i} className={`p-4 rounded-sello border ${r.severity === 'critical' ? 'border-carmin/40 bg-carmin-suave' : r.severity === 'high' ? 'border-ambar/40 bg-ambar-suave' : 'border-linea'}`}>
                  <div className="flex items-center gap-2 mb-1"><Badge tono={r.severity === 'critical' ? 'carmin' : r.severity === 'high' ? 'ambar' : 'neutral'}>{r.severity}</Badge><span className="text-13 text-tinta-suave">{r.category}</span></div>
                  <p className="text-sm font-medium text-tinta">{r.message}</p>
                  <p className="text-13 text-tinta-suave mt-1">{r.detail}</p>
                  <p className="text-13 text-petroleo mt-2 flex items-center gap-1"><ChevronRight className="w-3 h-3" />{r.action}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState icono={AlertTriangle} titulo="Sin riesgos detectados" descripcion="Con créditos, garantías y certificación capturados, aquí aparecen los vencimientos." />
        )}

        {error && <div className="mt-4 flex items-center gap-2 p-3 rounded-sello bg-carmin-suave border border-carmin/25"><AlertTriangle className="w-4 h-4 text-carmin" /><p className="text-sm text-carmin">{error}</p></div>}
      </Card>
    </div>
  )
}

function Certificacion({ cert, semaforo, recargar, onError }: { cert: CertificationProfileRecord | null; semaforo: SemaforoCertificacion | null; recargar: () => Promise<void>; onError: (e: string) => void }) {
  const [avisos, setAvisos] = useState<ObligacionCalendarioRecord[]>([])
  const [defs, setDefs] = useState<DefinicionAviso[]>([])
  const [form, setForm] = useState({ tipo: 'cambio_domicilio', fechaEvento: '', descripcion: '' })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const cargarAvisos = useCallback(() => fiscalApi.avisos().then((r) => setAvisos(r.data)).catch(() => {}), [])
  useEffect(() => { cargarAvisos(); fiscalApi.catalogo().then((r) => setDefs(r.data.avisos)).catch(() => {}) }, [cargarAvisos])

  async function registrar(tipo: string) {
    setGuardando(true); setMsg('')
    try {
      const r = await fiscalApi.registrarAviso(tipo, tipo === 'renovacion' ? undefined : form.fechaEvento, form.descripcion || undefined)
      setMsg(r.creada ? `Obligación creada: ${r.data.titulo} — vence ${r.data.fechaLimite.slice(0, 10)}.` : `Ya existía esa obligación (${r.data.fechaLimite.slice(0, 10)}); no se duplicó.`)
      await Promise.all([cargarAvisos(), recargar()])
    } catch (e) { onError(e instanceof Error ? e.message : 'Error') }
    setGuardando(false)
  }
  const def = defs.find((d) => d.tipo === form.tipo)

  return (
    <div className="space-y-5">
      <div className="border border-linea rounded-sello p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium text-tinta">Perfil de certificación</h3>
          {cert ? <Badge tono={cert.status === 'ACTIVE' ? 'petroleo' : 'ambar'}>{cert.status}</Badge> : <Badge>sin perfil</Badge>}
        </div>
        {cert ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
            <div><p className="text-13 text-tinta-suave">Rubro</p><p className="font-medium text-tinta">{cert.modality}</p></div>
            <div><p className="text-13 text-tinta-suave">Número</p><p className="font-sello-mono text-tinta">{cert.certNumber ?? '—'}</p></div>
            <div><p className="text-13 text-tinta-suave">Emisión</p><p className="font-sello-mono text-tinta">{cert.issueDate ? new Date(cert.issueDate).toLocaleDateString('es-MX') : '—'}</p></div>
            <div><p className="text-13 text-tinta-suave">Vencimiento</p><p className="font-sello-mono text-tinta">{cert.expiryDate ? new Date(cert.expiryDate).toLocaleDateString('es-MX') : 'sin capturar'}</p></div>
          </div>
        ) : <p className="text-sm text-tinta-suave mt-2">Sin perfil de certificación capturado: el semáforo mostrará "sin datos" en lo que depende del registro.</p>}
        {semaforo && <p className="text-13 text-tinta-suave mt-3">Vigencia del registro: {semaforo.vigencia.meses} meses — {semaforo.vigencia.fuente}.</p>}
      </div>

      {semaforo ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-medium text-tinta">Obligaciones por rubro {semaforo.rubro ?? '(sin rubro)'} — semáforo</h3>
            <div className="flex gap-2 flex-wrap">{(['rojo', 'ambar', 'verde', 'gris'] as SemaforoOb[]).map((s) => <Badge key={s} tono={TONO[s]}>{ETIQ[s]}: {semaforo.resumen[s]}</Badge>)}</div>
          </div>
          {semaforo.obligaciones.filter((o) => o.aplica).map((o) => (
            <div key={o.clave} className={`border rounded-sello p-3 ${o.estado === 'rojo' ? 'border-carmin/40' : o.estado === 'ambar' ? 'border-ambar/40' : 'border-linea'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-tinta">{o.titulo}</p>
                  <p className="text-13 text-tinta mt-0.5">{o.detalle}</p>
                  <p className="text-13 text-tinta-suave mt-1">{o.fundamento}{o.cotejo === 'pendiente' && <span className="text-ambar"> · pendiente de cotejo contra RGCE 2026</span>}{o.cotejo === 'corpus' && o.fuente && <span> · fuente en corpus: {o.fuente}</span>}</p>
                  <p className="text-13 text-tinta-suave">Consecuencia: {o.consecuencia}</p>
                </div>
                <div className="flex flex-col items-end gap-1"><Badge tono={TONO[o.estado]}>{ETIQ[o.estado]}</Badge>{o.fechaLimite && <span className="text-13 font-sello-mono text-tinta-suave">{o.fechaLimite}</span>}</div>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icono={Scale} titulo="Sin semáforo" descripcion="No se pudo calcular el estado de la certificación." />}

      <div className="border border-linea rounded-sello p-4 space-y-3">
        <h3 className="text-sm font-medium text-tinta flex items-center gap-2"><CalendarClock className="w-4 h-4 text-petroleo" /> Avisos y renovación → Calendario de obligaciones</h3>
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <Select label="Evento" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {defs.filter((d) => d.tipo !== 'renovacion').map((d) => <option key={d.tipo} value={d.tipo}>{d.titulo}</option>)}
          </Select>
          <Input label="Fecha del evento" type="date" mono value={form.fechaEvento} onChange={(e) => setForm({ ...form, fechaEvento: e.target.value })} />
          <Input label="Descripción (opcional)" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          <Button onClick={() => registrar(form.tipo)} loading={guardando} disabled={!form.fechaEvento}>Registrar aviso</Button>
        </div>
        {def && <p className="text-13 text-tinta-suave">{def.fundamento} · plazo de trabajo {def.plazoDias} días{def.cotejo === 'pendiente' && <span className="text-ambar"> · pendiente de cotejo</span>}. {def.consecuencia}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variante="secundario" onClick={() => registrar('renovacion')} loading={guardando} disabled={!cert?.expiryDate} title={!cert?.expiryDate ? 'Captura la fecha de vencimiento del perfil' : ''}>Sincronizar renovación (vencimiento − 30 días)</Button>
          {msg && <span className="text-13 text-tinta">{msg}</span>}
        </div>
        {avisos.length > 0 ? (
          <DataTable<ObligacionCalendarioRecord> filas={avisos} filaKey={(a) => a.id} columnas={[
            { key: 't', header: 'Tipo', render: (a) => <Badge>{a.tipo}</Badge> },
            { key: 'ti', header: 'Obligación', render: (a) => <span>{a.titulo}<span className="block text-13 text-tinta-suave">{a.fundamento}</span></span> },
            { key: 'f', header: 'Fecha límite', mono: true, render: (a) => a.fechaLimite.slice(0, 10) },
            { key: 'e', header: 'Estado', render: (a) => <Badge tono={a.estado === 'cumplida' ? 'petroleo' : new Date(a.fechaLimite) < new Date() ? 'carmin' : 'ambar'}>{a.estado}</Badge> },
          ]} />
        ) : <p className="text-13 text-tinta-suave">Sin avisos ni renovación registrados en el calendario.</p>}
      </div>
    </div>
  )
}

function Creditos({ credits, recargar, onError }: { credits: TaxCreditRecord[]; recargar: () => Promise<void>; onError: (e: string) => void }) {
  const [sel, setSel] = useState<TaxCreditRecord | null>(null)
  const [form, setForm] = useState({ monto: '', pedimentoDescargo: '', fecha: '' })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  async function descargar() {
    if (!sel) return
    setGuardando(true); setMsg('')
    try {
      const r = await fiscalApi.descargarCredito(sel.id, { monto: Number(form.monto), pedimentoDescargo: form.pedimentoDescargo, fecha: form.fecha })
      setMsg(`Descargo registrado: IVA ${mxn(r.data.usage.ivaApplied)} · IEPS ${mxn(r.data.usage.iepsApplied)}. Saldo restante ${mxn(r.data.credito?.remaining ?? 0)} (${r.data.credito?.status}). Quedó en auditoría.`)
      setSel(null); setForm({ monto: '', pedimentoDescargo: '', fecha: '' })
      await recargar()
    } catch (e) { onError(e instanceof Error ? e.message : 'Error') }
    setGuardando(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-tinta-suave">Descarga el crédito contra el pedimento de retorno o cambio de régimen. El sistema rechaza montos mayores al saldo.</p>
        <Button variante="secundario" tamano="sm" onClick={() => fiscalApi.descargarReporteCreditos().catch((e) => onError(e.message))}><Download className="w-4 h-4" /> Reporte de créditos y descargos (xlsx)</Button>
      </div>
      {credits.length === 0 ? <EmptyState icono={FileWarning} titulo="Sin créditos fiscales" descripcion="Registra los créditos IVA/IEPS de tus importaciones temporales para vigilar descargos y vencimientos." /> : (
        <DataTable<TaxCreditRecord> filas={credits} filaKey={(c) => c.id} columnas={[
          { key: 'p', header: 'Pedimento', mono: true, render: (c) => c.pedimento },
          { key: 'f', header: 'Fracción', mono: true, render: (c) => formatFraction(c.fractionCode) },
          { key: 'o', header: 'Otorgado', align: 'right', mono: true, render: (c) => (c.ivaAmount + c.iepsAmount).toLocaleString('es-MX', { minimumFractionDigits: 2 }) },
          { key: 'd', header: 'Descargado', align: 'right', mono: true, render: (c) => c.discharged.toLocaleString('es-MX', { minimumFractionDigits: 2 }) },
          { key: 's', header: 'Saldo', align: 'right', mono: true, render: (c) => c.remaining.toLocaleString('es-MX', { minimumFractionDigits: 2 }) },
          { key: 'st', header: 'Estado', render: (c) => <Badge tono={c.status === 'FULLY_USED' ? 'petroleo' : c.status === 'EXPIRED' || c.status === 'IRREGULAR' ? 'carmin' : 'neutral'}>{c.status}</Badge> },
          { key: 'v', header: 'Vence', mono: true, render: (c) => new Date(c.dischargeDeadline).toLocaleDateString('es-MX') },
          { key: 'a', header: '', render: (c) => c.remaining > 0 ? <Button variante="secundario" tamano="sm" onClick={() => setSel(c)}>Descargar</Button> : null },
        ]} />
      )}
      {sel && (
        <div className="border border-linea rounded-sello p-4 bg-papel-2 space-y-3">
          <p className="text-sm text-tinta">Descargo del crédito <span className="font-sello-mono">{sel.pedimento}</span> — saldo disponible <span className="font-sello-mono">{mxn(sel.remaining)}</span></p>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <Input label="Monto (MXN)" type="number" mono value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} requerido hint="Se aplica a IVA primero y el resto a IEPS" />
            <Input label="Pedimento de retorno / cambio de régimen" mono value={form.pedimentoDescargo} onChange={(e) => setForm({ ...form, pedimentoDescargo: e.target.value })} requerido />
            <Input label="Fecha" type="date" mono value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} requerido />
            <div className="flex gap-2"><Button onClick={descargar} loading={guardando} disabled={!(Number(form.monto) > 0) || !form.pedimentoDescargo || !form.fecha}>Registrar descargo</Button><Button variante="ghost" onClick={() => setSel(null)}>Cancelar</Button></div>
          </div>
          {Number(form.monto) > sel.remaining && <p className="text-13 text-carmin">El monto excede el saldo disponible.</p>}
        </div>
      )}
      {msg && <p className="text-13 text-tinta">{msg}</p>}
    </div>
  )
}

function periodoActual(): string { const d = new Date(); return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}` }

function ConciliacionTab({ onError }: { onError: (e: string) => void }) {
  const [periodo, setPeriodo] = useState(periodoActual())
  const [data, setData] = useState<Conciliacion | null>(null)
  const [cargando, setCargando] = useState(false)
  async function correr() {
    setCargando(true)
    try { setData((await fiscalApi.conciliacion(periodo)).data) } catch (e) { onError(e instanceof Error ? e.message : 'Error') }
    setCargando(false)
  }
  useEffect(() => { correr() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const buckets: Bucket[] = ['0-6', '6-12', '12-18', '>18']
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <Input label="Periodo" mono value={periodo} onChange={(e) => setPeriodo(e.target.value)} hint="2026-Q3, 2026-08 o 2026" className="max-w-xs" />
        <Button onClick={correr} loading={cargando}>Conciliar</Button>
        {data && <Button variante="secundario" onClick={() => fiscalApi.descargarConciliacion(periodo).catch((e) => onError(e.message))}><Download className="w-4 h-4" /> Exportar xlsx</Button>}
      </div>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: 'Créditos otorgados en el periodo', v: data.creditos.otorgadoEnPeriodo }, { l: 'Descargos del periodo', v: data.creditos.descargadoEnPeriodo },
              { l: 'Saldo al cierre', v: data.creditos.saldoAlCierre }, { l: 'Créditos con saldo / descargados', v: `${data.creditos.activos} / ${data.creditos.totalmenteDescargados}` },
            ].map((x) => <div key={x.l} className="border border-linea rounded-sello p-3"><p className="text-13 text-tinta-suave">{x.l}</p><p className="font-sello-mono text-tinta">{typeof x.v === 'number' ? mxn(x.v) : x.v}</p></div>)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {buckets.map((b) => <div key={b} className="border border-linea rounded-sello p-3"><p className="text-13 text-tinta-suave">Antigüedad {b} meses</p><p className="font-sello-mono text-tinta">{mxn(data.creditos.porBucket[b].saldo)}</p><p className="text-13 text-tinta-suave">{data.creditos.porBucket[b].creditos} crédito(s)</p></div>)}
          </div>
          <div className={`border rounded-sello p-4 ${data.cuadra === false ? 'border-carmin/40' : data.cuadra ? 'border-petroleo/40' : 'border-linea'}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-medium text-tinta">Anexo 30 / SCCCyG — {data.periodo.etiqueta}</p>
              <Badge tono={data.cuadra === null ? 'neutral' : data.cuadra ? 'petroleo' : 'carmin'}>{data.cuadra === null ? 'Sin Anexo 30 capturado' : data.cuadra ? 'Cuadra' : `${data.diferencias.length} diferencia(s)`}</Badge>
            </div>
            <p className="text-13 text-tinta-suave mt-1">{data.nota}</p>
            {data.anexo30 && <p className="text-13 text-tinta mt-2 font-sello-mono">Créditos {mxn(data.anexo30.totalCredits)} · Cargos {mxn(data.anexo30.totalDebits)} · Saldo {mxn(data.anexo30.balance)}</p>}
            {data.diferencias.length > 0 && (
              <DataTable<Conciliacion['diferencias'][number]> className="mt-3" filas={data.diferencias} filaKey={(d) => d.concepto} columnas={[
                { key: 'c', header: 'Concepto', render: (d) => d.concepto },
                { key: 's', header: 'Sistema', align: 'right', mono: true, render: (d) => mxn(d.sistema) },
                { key: 'a', header: 'Anexo 30', align: 'right', mono: true, render: (d) => mxn(d.anexo30) },
                { key: 'd', header: 'Diferencia', align: 'right', mono: true, render: (d) => <span className="text-carmin">{mxn(d.diferencia)}</span> },
              ]} />
            )}
          </div>
          {data.creditos.detalle.length > 0 ? (
            <DataTable<Conciliacion['creditos']['detalle'][number]> filas={data.creditos.detalle} filaKey={(c) => c.id} columnas={[
              { key: 'p', header: 'Pedimento', mono: true, render: (c) => c.pedimento },
              { key: 'f', header: 'Fecha crédito', mono: true, render: (c) => c.creditDate },
              { key: 'o', header: 'Otorgado', align: 'right', mono: true, render: (c) => c.otorgado.toLocaleString('es-MX', { minimumFractionDigits: 2 }) },
              { key: 'd', header: 'Descargado al cierre', align: 'right', mono: true, render: (c) => c.descargadoAlCierre.toLocaleString('es-MX', { minimumFractionDigits: 2 }) },
              { key: 's', header: 'Saldo al cierre', align: 'right', mono: true, render: (c) => c.saldoAlCierre.toLocaleString('es-MX', { minimumFractionDigits: 2 }) },
              { key: 'b', header: 'Antigüedad', mono: true, render: (c) => `${c.antiguedadMeses} m · ${c.bucket}` },
            ]} />
          ) : <p className="text-13 text-tinta-suave">Sin créditos existentes al cierre del periodo.</p>}
        </>
      )}
    </div>
  )
}

function Simulador({ onError }: { onError: (e: string) => void }) {
  const [pct, setPct] = useState('')
  const [data, setData] = useState<SimuladorPerdida | null>(null)
  const [cargando, setCargando] = useState(false)
  async function correr() {
    setCargando(true)
    try { setData((await fiscalApi.simulador(pct.trim() === '' ? null : Number(pct))).data) } catch (e) { onError(e instanceof Error ? e.message : 'Error') }
    setCargando(false)
  }
  useEffect(() => { correr() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-suave">Si pierdes la certificación, el IVA de cada importación temporal se paga o garantiza. Aquí, con tus importaciones reales y el tipo de cambio del sistema.</p>
      <div className="flex items-end gap-3 flex-wrap">
        <Input label="% anual de garantía (opcional)" type="number" mono value={pct} onChange={(e) => setPct(e.target.value)} hint="El que te cotizó tu afianzadora; sin él no se estima costo" className="max-w-xs" />
        <Button onClick={correr} loading={cargando}><Calculator className="w-4 h-4" /> Calcular</Button>
      </div>
      {data && (data.sinDatos ? (
        <EmptyState icono={Calculator} titulo="Sin importaciones temporales en los últimos 3 meses" descripcion="El simulador usa TemporaryImport (valor en aduana por fecha de entrada). Registra o importa tus pedimentos de importación temporal para tener una base real." />
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="border border-carmin/40 bg-carmin-suave rounded-sello p-4">
              <p className="text-13 text-carmin">IVA mensual a pagar o garantizar — último mes ({data.base.ultimoMes.desde} a {data.base.ultimoMes.hasta})</p>
              <p className="text-xl font-sello-mono font-medium text-carmin">{mxn(data.ivaMensualMXN.ultimoMes)}</p>
              <p className="text-13 text-tinta-suave mt-1">{data.base.ultimoMes.importaciones} importaciones · valor en aduana USD {data.base.ultimoMes.valorAduanaUSD.toLocaleString('en-US')}</p>
            </div>
            <div className="border border-carmin/40 bg-carmin-suave rounded-sello p-4">
              <p className="text-13 text-carmin">IVA mensual — promedio 3 meses ({data.base.promedio3Meses.desde} a {data.base.promedio3Meses.hasta})</p>
              <p className="text-xl font-sello-mono font-medium text-carmin">{mxn(data.ivaMensualMXN.promedio3Meses)}</p>
              <p className="text-13 text-tinta-suave mt-1">{data.base.promedio3Meses.importaciones} importaciones · USD {data.base.promedio3Meses.valorAduanaUSDMensual.toLocaleString('en-US')} / mes</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="border border-linea rounded-sello p-3"><p className="text-13 text-tinta-suave">Tipo de cambio</p><p className="font-sello-mono text-tinta">{data.tipoCambio.rate} ({data.tipoCambio.source}, {data.tipoCambio.asOf})</p>{data.tipoCambio.warning && <p className="text-13 text-ambar mt-1">{data.tipoCambio.warning}</p>}</div>
            <div className="border border-linea rounded-sello p-3"><p className="text-13 text-tinta-suave">IEPS</p><p className="text-sm text-tinta">No calculado</p><p className="text-13 text-tinta-suave">{data.notaIEPS}</p></div>
            <div className="border border-linea rounded-sello p-3"><p className="text-13 text-tinta-suave">Costo de garantía</p><p className="font-sello-mono text-tinta">{data.garantia.costoMensualMXN != null ? `${mxn(data.garantia.costoMensualMXN)} / mes · ${mxn(data.garantia.costoAnualMXN ?? 0)} / año` : 'sin % capturado'}</p><p className="text-13 text-tinta-suave">{data.garantia.nota}</p></div>
          </div>
          <p className="text-13 text-tinta-suave">{data.fundamento}</p>
        </>
      ))}
    </div>
  )
}
