import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Anexo22Catalogs, PedimentoInputV2, PedimentoPartidaInputV2, PedimentoValidationResult } from '../lib/api'
import { ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, Plus, Trash2, ChevronLeft, ChevronRight, Sparkles, FileText } from 'lucide-react'
import { formatFraction } from '../lib/format'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

// Fase 4.2: CLAVES/REGIMENES/ADUANAS locales (mezclaban claves y regímenes
// inventados: IM, G1, IMM, EXT; ITR listado como clave) se reemplazaron por los
// catálogos OFICIALES del Anexo 22 RGCE 2026 vía GET /api/catalogs/anexo22
// (fuente única: server/src/lib/anexo22.ts — misma que usa el Simulador de Glosa).
const INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']
const TRANSPORTES = ['Marítimo', 'Aéreo', 'Terrestre', 'Ferroviario', 'Multimodal']

function emptyPartida(n: number): PedimentoPartidaInputV2 {
  return {
    numeroPartida: n, fraccion: '', descripcion: '',
    cantidad: 1, unidadMedida: 'Pza',
    valorUnitario: 0, valorAduana: 0,
    pais: 'CN', vinculacion: false,
  }
}

function emptyPedimento(): PedimentoInputV2 {
  return {
    clave: 'A1', aduana: '24', patenteAduanal: '3461', // 24 = Nuevo Laredo (Apéndice 1)
    rfcImportador: '', tipoOperacion: 'IMP', regimen: 'IMD',
    pesoBruto: 0, pesoNeto: 0, bultos: 1,
    valorAduana: 0, valorComercial: 0, valorDolares: 0, tipoCambio: 17.49,
    incoterm: 'CIF', transporte: 'Marítimo',
    partidas: [emptyPartida(1)],
  }
}

const STEPS = [
  { id: 1, label: 'Datos generales' },
  { id: 2, label: 'Transporte' },
  { id: 3, label: 'Partidas' },
  { id: 4, label: 'Documentos' },
  { id: 5, label: 'Validación' },
]

export function PreValidatorPage() {
  const [step, setStep] = useState(1)
  const [ped, setPed] = useState<PedimentoInputV2>(emptyPedimento())
  const [validation, setValidation] = useState<PedimentoValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiCheck, setAiCheck] = useState(true)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [catalogs, setCatalogs] = useState<Anexo22Catalogs | null>(null)

  useEffect(() => {
    api.catalogsAnexo22().then(r => setCatalogs(r.data)).catch(() => {})
  }, [])

  function update<K extends keyof PedimentoInputV2>(k: K, v: PedimentoInputV2[K]) {
    setPed(p => ({ ...p, [k]: v }))
  }

  function updatePartida(idx: number, patch: Partial<PedimentoPartidaInputV2>) {
    setPed(p => ({
      ...p,
      partidas: p.partidas.map((it, i) => {
        if (i !== idx) return it
        const merged = { ...it, ...patch }
        if (('cantidad' in patch || 'valorUnitario' in patch) && !('valorAduana' in patch)) {
          merged.valorAduana = Math.round(merged.cantidad * merged.valorUnitario * 100) / 100
        }
        return merged
      }),
    }))
  }

  function addPartida() {
    setPed(p => ({ ...p, partidas: [...p.partidas, emptyPartida(p.partidas.length + 1)] }))
  }
  function removePartida(idx: number) {
    setPed(p => ({
      ...p,
      partidas: p.partidas.filter((_, i) => i !== idx).map((it, i) => ({ ...it, numeroPartida: i + 1 })),
    }))
  }

  function recalcValorAduana() {
    const sum = Math.round(ped.partidas.reduce((s, p) => s + p.valorAduana, 0) * 100) / 100
    update('valorAduana', sum)
    update('valorDolares', sum)
    update('valorComercial', sum)
  }

  async function runValidation() {
    setLoading(true); setError(''); setValidation(null)
    try {
      const r = await api.pedimentoValidate(ped, aiCheck)
      setValidation(r.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error en validación') }
    setLoading(false)
  }

  async function saveAndValidate() {
    setLoading(true); setError(''); setValidation(null)
    try {
      const r = await api.pedimentoCreate(ped, aiCheck)
      setValidation(r.data.validation)
      setSavedId(r.data.pedimento.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al guardar') }
    setLoading(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Pre-validador de Pedimento (Anexo 22)</h1>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <button onClick={() => setStep(s.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium transition ${step === s.id ? 'bg-emerald-500 text-white' : step > s.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === s.id ? 'bg-white/20' : step > s.id ? 'bg-emerald-500 text-white' : 'bg-white text-slate-500'}`}>
                  {step > s.id ? '✓' : s.id}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-[12px] text-slate-500 mb-2">Datos generales del pedimento (Anexo 22 — encabezado).</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Número pedimento (opcional)"><input className="input" value={ped.numero ?? ''} onChange={e => update('numero', e.target.value)} placeholder="25 47 3461 4000123"/></Field>
              <Field label="Clave de pedimento (Apéndice 2)"><select className="input" value={ped.clave} onChange={e => update('clave', e.target.value)}>{(catalogs?.clavesPedimento ?? [{ clave: ped.clave, descripcion: 'cargando catálogo…', regimenes: [] }]).map(c => <option key={c.clave} value={c.clave} title={c.descripcion}>{c.clave} — {c.descripcion.length > 55 ? c.descripcion.slice(0, 55) + '…' : c.descripcion}</option>)}</select></Field>
              <Field label="Régimen (Apéndice 16)"><select className="input" value={ped.regimen} onChange={e => update('regimen', e.target.value)}>{(catalogs?.regimenes ?? [{ clave: ped.regimen, descripcion: 'cargando catálogo…' }]).map(r => <option key={r.clave} value={r.clave} title={r.descripcion}>{r.clave} — {r.descripcion.length > 55 ? r.descripcion.slice(0, 55) + '…' : r.descripcion}</option>)}</select></Field>
              <Field label="Tipo operación"><select className="input" value={ped.tipoOperacion} onChange={e => update('tipoOperacion', e.target.value as 'IMP' | 'EXP')}><option value="IMP">IMP</option><option value="EXP">EXP</option></select></Field>
              <Field label="Aduana de despacho (Apéndice 1)"><select className="input" value={ped.aduana} onChange={e => update('aduana', e.target.value)}>{(catalogs?.aduanas ?? [{ clave: ped.aduana, denominacion: 'cargando catálogo…' }]).map(a => <option key={a.clave} value={a.clave}>{a.clave} — {a.denominacion}</option>)}</select></Field>
              <Field label="Patente aduanal"><input className="input" value={ped.patenteAduanal} onChange={e => update('patenteAduanal', e.target.value)}/></Field>
              <Field label="RFC importador"><input className="input font-mono uppercase" value={ped.rfcImportador} onChange={e => update('rfcImportador', e.target.value.toUpperCase())} placeholder="MEJ010203AB1"/></Field>
              <Field label="CURP (opcional)"><input className="input font-mono uppercase" value={ped.curp ?? ''} onChange={e => update('curp', e.target.value.toUpperCase())}/></Field>
              <Field label="Origen"><input className="input" value={ped.origen ?? ''} onChange={e => update('origen', e.target.value)} placeholder="Shanghai, China"/></Field>
              <Field label="Destino"><input className="input" value={ped.destino ?? ''} onChange={e => update('destino', e.target.value)} placeholder="Cd. Juárez, MX"/></Field>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Peso bruto (kg)"><input type="number" step="0.01" className="input" value={ped.pesoBruto} onChange={e => update('pesoBruto', parseFloat(e.target.value) || 0)}/></Field>
              <Field label="Peso neto (kg)"><input type="number" step="0.01" className="input" value={ped.pesoNeto} onChange={e => update('pesoNeto', parseFloat(e.target.value) || 0)}/></Field>
              <Field label="Bultos"><input type="number" className="input" value={ped.bultos} onChange={e => update('bultos', parseInt(e.target.value) || 0)}/></Field>
              <Field label="Tipo de cambio"><input type="number" step="0.0001" className="input" value={ped.tipoCambio} onChange={e => update('tipoCambio', parseFloat(e.target.value) || 0)}/></Field>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[12px] text-slate-500 mb-2">Datos de transporte e Incoterm.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Incoterm"><select className="input" value={ped.incoterm} onChange={e => update('incoterm', e.target.value)}>{INCOTERMS.map(i => <option key={i}>{i}</option>)}</select></Field>
              <Field label="Transporte"><select className="input" value={ped.transporte} onChange={e => update('transporte', e.target.value)}>{TRANSPORTES.map(t => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Medio de transporte (matrícula/buque)"><input className="input" value={ped.medioTransporte ?? ''} onChange={e => update('medioTransporte', e.target.value)}/></Field>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-slate-500">Partidas del pedimento (1-50). Cada una se valida individualmente contra TIGIE, NOMs y cuotas compensatorias.</p>
              <div className="flex gap-2">
                <button onClick={recalcValorAduana} className="text-[11px] font-medium text-violet-600 hover:text-violet-700">Auto-sumar valor aduana</button>
                <button onClick={addPartida} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"><Plus className="w-3 h-3"/> Agregar partida</button>
              </div>
            </div>
            <div className="space-y-2">
              {ped.partidas.map((p, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200/70 bg-white/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Partida {p.numeroPartida}</span>
                    {ped.partidas.length > 1 && <button onClick={() => removePartida(idx)} className="text-rose-500 hover:text-rose-700 ml-auto"><Trash2 className="w-3.5 h-3.5"/></button>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <Field label="Fracción"><input className="input font-mono" value={p.fraccion} onChange={e => updatePartida(idx, { fraccion: e.target.value })} placeholder="0000.00.00"/></Field>
                    <Field label="Descripción"><input className="input" value={p.descripcion} onChange={e => updatePartida(idx, { descripcion: e.target.value })}/></Field>
                    <Field label="País origen"><input className="input" value={p.pais} onChange={e => updatePartida(idx, { pais: e.target.value })}/></Field>
                    <Field label="Cantidad"><input type="number" className="input" value={p.cantidad} onChange={e => updatePartida(idx, { cantidad: parseFloat(e.target.value) || 0 })}/></Field>
                    <Field label="Unidad"><input className="input" value={p.unidadMedida} onChange={e => updatePartida(idx, { unidadMedida: e.target.value })}/></Field>
                    <Field label="Valor unitario USD"><input type="number" step="0.01" className="input" value={p.valorUnitario} onChange={e => updatePartida(idx, { valorUnitario: parseFloat(e.target.value) || 0 })}/></Field>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    <Field label="Valor aduana USD"><input type="number" step="0.01" className="input" value={p.valorAduana} onChange={e => updatePartida(idx, { valorAduana: parseFloat(e.target.value) || 0 })}/></Field>
                    <Field label="País vendedor"><input className="input" value={p.paisVendedor ?? ''} onChange={e => updatePartida(idx, { paisVendedor: e.target.value })}/></Field>
                    <Field label="Vinculación"><select className="input" value={p.vinculacion ? '1' : '0'} onChange={e => updatePartida(idx, { vinculacion: e.target.value === '1' })}><option value="0">No</option><option value="1">Sí</option></select></Field>
                    {p.vinculacion && <Field label="Descripción vinculación"><input className="input" value={p.vinculacionDesc ?? ''} onChange={e => updatePartida(idx, { vinculacionDesc: e.target.value })}/></Field>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-[12px] text-slate-500 mb-2">Documentos relacionados (referencias, no archivos).</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Factura"><input className="input" value={ped.factura ?? ''} onChange={e => update('factura', e.target.value)} placeholder="INV-CN-12345"/></Field>
              <Field label="COVE"><input className="input" value={ped.cove ?? ''} onChange={e => update('cove', e.target.value)} placeholder="COVE-20260000123"/></Field>
              <Field label="BL / Guía aérea"><input className="input" value={ped.bl ?? ''} onChange={e => update('bl', e.target.value)} placeholder="MAEU123456789"/></Field>
            </div>
          </div>
        )}

        {/* Step 5 */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-[12px] text-slate-700">
                <input type="checkbox" checked={aiCheck} onChange={e => setAiCheck(e.target.checked)}/>
                <Sparkles className="w-3.5 h-3.5 text-emerald-600"/> Incluir chequeo IA de inconsistencias de precio
              </label>
              <button onClick={runValidation} disabled={loading} className="ml-auto bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-medium px-4 py-2 rounded-full disabled:opacity-50">
                {loading ? 'Validando...' : 'Validar (sin guardar)'}
              </button>
              <button onClick={saveAndValidate} disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5"/> {loading ? 'Procesando...' : 'Guardar y validar'}
              </button>
            </div>

            {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100"><AlertCircle className="w-4 h-4 text-rose-500"/><p className="text-[12px] text-rose-700">{error}</p></div>}

            {validation && (
              <div className="space-y-4">
                <div className={`rounded-2xl p-4 ${validation.valid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'} border`}>
                  <div className="flex items-center gap-3">
                    {validation.valid
                      ? <CheckCircle2 className="w-6 h-6 text-emerald-600"/>
                      : <AlertTriangle className="w-6 h-6 text-rose-600"/>}
                    <div>
                      <p className={`text-[14px] font-bold ${validation.valid ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {validation.valid ? 'Pedimento válido' : `${validation.errorsCount} error(es) bloqueante(s)`}
                      </p>
                      <p className="text-[12px] text-slate-600">
                        {validation.errorsCount} error(es) · {validation.warningsCount} advertencia(s) · {validation.aiNotes.length} nota(s) IA
                      </p>
                    </div>
                    {savedId && <span className="ml-auto text-[10px] font-mono bg-white/60 px-2 py-1 rounded-full text-slate-600">id: {savedId.slice(-8)}</span>}
                  </div>
                </div>

                {validation.issues.length > 0 && (
                  <div>
                    <p className="text-[12px] font-semibold text-slate-700 mb-2">Hallazgos</p>
                    <div className="space-y-1.5">
                      {validation.issues.map((iss, i) => <IssueRow key={i} iss={iss} goToPartidas={() => setStep(3)} />)}
                    </div>
                  </div>
                )}

                {validation.aiNotes.length > 0 && (
                  <div className="rounded-xl bg-violet-50/40 border border-violet-100 p-4">
                    <p className="text-[12px] font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-600"/> Notas IA — inconsistencias de precio
                    </p>
                    <div className="space-y-2">
                      {validation.aiNotes.map((n, i) => (
                        <div key={i} className="bg-white rounded-lg p-3 text-[12px]">
                          <p className="font-semibold text-slate-800">Partida {n.partida}</p>
                          <p className="text-slate-700 mt-1">{n.observation}</p>
                          <p className="text-slate-500 mt-1 italic">{n.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200/50">
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="text-[12px] font-medium text-slate-600 disabled:opacity-30 flex items-center gap-1">
            <ChevronLeft className="w-3 h-3"/> Anterior
          </button>
          <span className="text-[11px] text-slate-400">Paso {step} de {STEPS.length}</span>
          {step < STEPS.length
            ? <button onClick={() => setStep(s => Math.min(STEPS.length, s + 1))} className="text-[12px] font-medium text-emerald-600 flex items-center gap-1">Siguiente <ChevronRight className="w-3 h-3"/></button>
            : <span className="w-16"></span>}
        </div>
      </div>

      <style>{`.input { width: 100%; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; color: #0f172a; }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}

function IssueRow({ iss, goToPartidas }: {
  iss: { partida?: number; field: string; severity: string; message: string; rule: string };
  goToPartidas?: () => void;
}) {
  // Render destacado para cuota compensatoria no declarada — es uno de los
  // errores más caros (multa 130-150% + embargo), debe saltar a la vista.
  if (iss.rule === 'ANTIDUMPING_NOT_DECLARED') {
    return (
      <div className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5"/>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-red-900">
              🚨 Cuota compensatoria no declarada
              {iss.partida ? <span className="ml-2 text-red-700 font-normal">· Partida {iss.partida}</span> : null}
              <span className="ml-2 text-[10px] font-mono text-red-600 opacity-70">[{iss.rule}]</span>
            </p>
            <p className="text-[12px] text-red-800 mt-1 leading-relaxed whitespace-pre-line">{iss.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {goToPartidas && (
                <button onClick={goToPartidas}
                  className="text-[11px] font-semibold bg-white border border-red-300 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg flex items-center gap-1">
                  Agregar identificador "CC" a partida {iss.partida ?? ''}
                </button>
              )}
              <a href="/cuotas-activas"
                 className="text-[11px] font-semibold bg-white border border-red-300 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg flex items-center gap-1">
                Ver resolución en Cuotas Activas
              </a>
              <button disabled
                className="text-[11px] font-semibold bg-slate-100 text-slate-400 px-3 py-1.5 rounded-lg cursor-not-allowed"
                title="ERROR bloqueante — debes declarar la cuota antes de continuar">
                Continuar de todas formas
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const palette = iss.severity === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700'
    : iss.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-sky-50 border-sky-200 text-sky-700'
  const Icon = iss.severity === 'error' ? AlertCircle : iss.severity === 'warning' ? AlertTriangle : FileText
  return (
    <div className={`rounded-lg border px-3 py-2 ${palette}`}>
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium">
            {iss.partida ? `Partida ${iss.partida} · ` : ''}{iss.field === 'fraccion' && iss.partida ? formatFraction((iss.message.match(/[0-9]{8}/) ?? [''])[0]) : iss.field}
            <span className="ml-2 text-[10px] opacity-60 font-mono">[{iss.rule}]</span>
          </p>
          <p className="text-[11px] mt-0.5">{iss.message}</p>
        </div>
      </div>
    </div>
  )
}
