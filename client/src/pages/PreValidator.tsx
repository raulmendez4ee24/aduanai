/**
 * SELLO · Pre-validador de pedimento (Anexo 22) — Operación 2026-08.
 *
 * "Esto me marca lo mismo que el prevalidador de CAAAREM, pero me lo explica."
 * La entrada real es el archivo M3 / Data Stage (ImportarArchivo): al importar
 * se llena el formulario desde el pedimento persistido y se corre la
 * validación multipartida. La captura manual sigue disponible. Cada hallazgo
 * cita su regla; el catálogo completo (código, fundamento, severidad) vive en
 * "Reglas del prevalidador" (GET /api/prevalidate/reglas). Lo que el archivo
 * no trae queda «no evaluado» con motivo — nunca un error fabricado.
 */
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Anexo22Catalogs, PedimentoPartidaInputV2, PedimentoValidationResult } from '../lib/api'
import { ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, Plus, Trash2, ChevronLeft, ChevronRight, Sparkles, FileText, Archive, FileUp } from 'lucide-react'
import { formatFraction } from '../lib/format'
import { Button, Card, Badge, Input, Select } from '../components/ui'
import { ImportarArchivo } from '../components/pedimentos/ImportarArchivo'
import { ReglasPrevalidador } from '../components/pedimentos/ReglasPrevalidador'
import { PaisSelect } from '../components/pedimentos/PaisSelect'
import { apiPedimentos, type PedimentoInputV2Importado, type ValidacionDesdePedimento } from '../lib/api/pedimentos'

export const GUIA_MODULO = {
  titulo: 'Pre-validador de pedimento',
  pasos: [
    'Importa el archivo M3 (.txt del SAAI) o el Data Stage: el formulario se llena solo y se validan todas las partidas.',
    'Si capturas a mano, completa datos generales, transporte, partidas (con NICO y país del catálogo) y documentos.',
    'Revisa los hallazgos: cada uno cita su regla y fundamento; lo que el archivo no trae aparece como «no evaluado».',
    'Consulta "Reglas del prevalidador" para ver qué revisa cada código y qué catálogos siguen pendientes de cotejo.',
    'Archiva el reporte al expediente para dejar rastro en la Operation del pedimento.',
  ],
}

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']
const TRANSPORTES = ['Marítimo', 'Aéreo', 'Terrestre', 'Ferroviario', 'Multimodal']

type Partida = PedimentoPartidaInputV2 & { nico?: string }
type Pedimento = PedimentoInputV2Importado

function emptyPartida(n: number): Partida {
  return { numeroPartida: n, fraccion: '', descripcion: '', nico: '', cantidad: 1, unidadMedida: 'Pza', valorUnitario: 0, valorAduana: 0, pais: '', vinculacion: false }
}

function emptyPedimento(): Pedimento {
  return {
    origenArchivo: 'MANUAL',
    clave: 'A1', aduana: '24', patenteAduanal: '',
    rfcImportador: '', tipoOperacion: 'IMP', regimen: 'IMD',
    pesoBruto: 0, pesoNeto: 0, bultos: 1,
    valorAduana: 0, valorComercial: 0, valorDolares: 0, tipoCambio: 0,
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

type Validacion = PedimentoValidationResult & { reglasNoEvaluadas?: { rule: string; partida?: number; motivo: string }[] }

export function PreValidatorPage() {
  const [step, setStep] = useState(1)
  const [ped, setPed] = useState<Pedimento>(emptyPedimento())
  const [validation, setValidation] = useState<Validacion | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiCheck, setAiCheck] = useState(true)
  const [pedimentoId, setPedimentoId] = useState<string | null>(null)
  const [importado, setImportado] = useState<ValidacionDesdePedimento | null>(null)
  const [mostrarImportar, setMostrarImportar] = useState(true)
  const [error, setError] = useState('')
  const [catalogs, setCatalogs] = useState<Anexo22Catalogs | null>(null)
  const [archivado, setArchivado] = useState<{ reference: string; documentName: string } | null>(null)
  const [archivando, setArchivando] = useState(false)

  useEffect(() => {
    api.catalogsAnexo22().then(r => setCatalogs(r.data)).catch(() => {})
  }, [])

  function update<K extends keyof Pedimento>(k: K, v: Pedimento[K]) {
    setPed(p => ({ ...p, [k]: v }))
  }

  const RFC_RE = /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/
  const noDisp = new Set(ped.datosNoDisponibles ?? [])
  function pasoValido(id: number): boolean {
    switch (id) {
      case 1:
        return RFC_RE.test(ped.rfcImportador.trim()) && ped.pesoBruto > 0 && (noDisp.has('pesoNeto') || (ped.pesoNeto > 0 && ped.pesoNeto <= ped.pesoBruto)) && (noDisp.has('bultos') || ped.bultos >= 1) && ped.tipoCambio > 0
      case 2:
        return ped.incoterm.trim() !== '' && ped.transporte.trim() !== ''
      case 3:
        return ped.partidas.length > 0 && ped.partidas.every(p =>
          p.fraccion.replace(/\D/g, '').length === 8 && /^\d{2}$/.test(p.nico ?? '') &&
          p.descripcion.trim() !== '' && p.cantidad > 0 && p.valorUnitario > 0 && p.valorAduana > 0 && p.pais.trim() !== '')
      case 4:
        return (ped.factura ?? '').trim() !== '' && (noDisp.has('cove') || (ped.cove ?? '').trim() !== '')
      default:
        return false
    }
  }

  function updatePartida(idx: number, patch: Partial<Partida>) {
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
  function addPartida() { setPed(p => ({ ...p, partidas: [...p.partidas, emptyPartida(p.partidas.length + 1)] })) }
  function removePartida(idx: number) {
    setPed(p => ({ ...p, partidas: p.partidas.filter((_, i) => i !== idx).map((it, i) => ({ ...it, numeroPartida: i + 1 })) }))
  }
  function recalcValorAduana() {
    const sum = Math.round(ped.partidas.reduce((s, p) => s + p.valorAduana, 0) * 100) / 100
    setPed(p => ({ ...p, valorAduana: sum, valorDolares: sum, valorComercial: sum }))
  }

  async function onImportado(id: string) {
    setLoading(true); setError(''); setValidation(null); setArchivado(null)
    try {
      const r = await apiPedimentos.prevalidarDesdePedimento(id, aiCheck)
      setImportado(r.data)
      setPed(r.data.input)
      setPedimentoId(r.data.pedimentoId)
      setValidation(r.data.validation)
      setMostrarImportar(false)
      setStep(5)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo validar el pedimento importado') }
    setLoading(false)
  }

  async function runValidation() {
    setLoading(true); setError(''); setValidation(null)
    try {
      if (pedimentoId && importado) {
        const r = await apiPedimentos.prevalidarDesdePedimento(pedimentoId, aiCheck)
        setValidation(r.data.validation)
      } else {
        const r = await api.pedimentoValidate(ped, aiCheck)
        setValidation(r.data as Validacion)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Error en validación') }
    setLoading(false)
  }

  async function saveAndValidate() {
    setLoading(true); setError(''); setValidation(null)
    try {
      const r = await api.pedimentoCreate(ped, aiCheck)
      setValidation(r.data.validation as Validacion)
      setPedimentoId(r.data.pedimento.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al guardar') }
    setLoading(false)
  }

  async function archivar() {
    if (!pedimentoId || !validation) return
    setArchivando(true); setError('')
    try {
      const r = await apiPedimentos.archivar(pedimentoId, 'prevalidacion', { pedimento: ped as unknown as Record<string, unknown>, validation, generadoEn: new Date().toISOString() },
        `${validation.errorsCount} error(es) · ${validation.warningsCount} advertencia(s)`)
      setArchivado({ reference: r.data.reference, documentName: r.data.documentName })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo archivar') }
    setArchivando(false)
  }

  function nuevo() {
    setPed(emptyPedimento()); setValidation(null); setPedimentoId(null); setImportado(null); setArchivado(null); setMostrarImportar(true); setStep(1); setError('')
  }

  const esImportado = !!importado
  const claveInfo = catalogs?.clavesPedimento.find(c => c.clave === ped.clave) as { cotejo?: string } | undefined

  return (
    <div className="max-w-5xl mx-auto space-y-4 font-sello-ui">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sello-display text-28 text-tinta">Pre-validador de pedimento</h1>
          <p className="text-base text-tinta-suave leading-relaxed mt-1">
            Lo que te marcaría el prevalidador, explicado regla por regla contra el Anexo 22. La entrada real es el archivo M3 o el Data Stage; la recaptura es la excepción.
          </p>
        </div>
        {(esImportado || pedimentoId) && (
          <Button variante="secundario" tamano="sm" onClick={nuevo}>Nuevo pedimento</Button>
        )}
      </div>

      {mostrarImportar && (
        <Card header={<div className="flex items-center gap-2"><FileUp className="w-5 h-5 text-tinta-suave" strokeWidth={1.5} aria-hidden /><span className="text-base font-medium text-tinta">Importar archivo M3 / Data Stage</span></div>} denso>
          <ImportarArchivo onImportado={id => { void onImportado(id) }} />
          {loading && <p className="text-sm text-tinta-suave mt-3">Validando el pedimento importado…</p>}
        </Card>
      )}
      {!mostrarImportar && !esImportado && (
        <Button variante="ghost" tamano="sm" onClick={() => setMostrarImportar(true)}><FileUp className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Importar archivo M3 / Data Stage</Button>
      )}

      {esImportado && importado && (
        <div className="rounded-sello border border-linea bg-superficie px-5 py-3 flex items-center gap-3 flex-wrap">
          <Badge tono={importado.origenArchivo === 'DATASTAGE' ? 'ambar' : 'petroleo'}>{importado.origenArchivo ?? 'archivo'}</Badge>
          <span className="font-sello-mono text-sm text-tinta">{importado.numero ?? importado.pedimentoId}</span>
          <span className="text-sm text-tinta-suave">{importado.layoutVersion}</span>
          {(ped.datosNoDisponibles?.length ?? 0) > 0 && (
            <span className="text-13 text-tinta-suave">· el archivo no trae: {ped.datosNoDisponibles!.join(', ')} (no evaluado, no inventado)</span>
          )}
        </div>
      )}

      <Card denso>
        {/* Stepper */}
        <div className="flex items-center gap-1 mb-5 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <button onClick={() => setStep(s.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-sello-sm text-sm border transition-colors ${step === s.id ? 'bg-petroleo text-white border-petroleo' : pasoValido(s.id) ? 'bg-petroleo-suave text-petroleo border-petroleo/20' : 'bg-papel-2 text-tinta-suave border-linea'}`}>
                <span className="font-sello-mono text-13">{pasoValido(s.id) && step !== s.id ? '✓' : s.id}</span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-tinta-suave/50" aria-hidden />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-tinta-suave">Datos generales del pedimento (Anexo 22 — encabezado).</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="Número de pedimento" mono placeholder="26 24 3842 6123460" value={ped.numero ?? ''} onChange={e => update('numero', e.target.value)} />
              <Select label="Clave (Apéndice 2)" value={ped.clave} onChange={e => update('clave', e.target.value)} hint={claveInfo?.cotejo === 'pendiente' ? 'Clave agregada sin cotejo verbatim: no restringe régimen.' : undefined}>
                {(catalogs?.clavesPedimento ?? [{ clave: ped.clave, descripcion: 'cargando catálogo…', regimenes: [] }]).map(c => <option key={c.clave} value={c.clave} title={c.descripcion}>{c.clave} — {c.descripcion.length > 55 ? c.descripcion.slice(0, 55) + '…' : c.descripcion}</option>)}
              </Select>
              <Select label="Régimen (Apéndice 16)" value={ped.regimen} onChange={e => update('regimen', e.target.value)} hint={esImportado && !ped.regimen ? 'No derivable de la clave: queda no evaluado.' : undefined}>
                {!ped.regimen && <option value="">— no derivado —</option>}
                {(catalogs?.regimenes ?? [{ clave: ped.regimen, descripcion: 'cargando catálogo…' }]).map(r => <option key={r.clave} value={r.clave} title={r.descripcion}>{r.clave} — {r.descripcion.length > 55 ? r.descripcion.slice(0, 55) + '…' : r.descripcion}</option>)}
              </Select>
              <Select label="Tipo de operación" value={ped.tipoOperacion} onChange={e => update('tipoOperacion', e.target.value as 'IMP' | 'EXP')}><option value="IMP">IMP</option><option value="EXP">EXP</option></Select>
              <Select label="Aduana de despacho (Apéndice 1)" value={ped.aduana} onChange={e => update('aduana', e.target.value)}>
                {(catalogs?.aduanas ?? [{ clave: ped.aduana, denominacion: 'cargando catálogo…' }]).map(a => <option key={a.clave} value={a.clave}>{a.clave} — {a.denominacion}</option>)}
              </Select>
              <Input label="Patente aduanal" mono value={ped.patenteAduanal} onChange={e => update('patenteAduanal', e.target.value)} />
              <Input label="RFC importador" mono requerido value={ped.rfcImportador} onChange={e => update('rfcImportador', e.target.value.toUpperCase())} placeholder="MEJ010203AB1" />
              <Input label="CURP (opcional)" mono value={ped.curp ?? ''} onChange={e => update('curp', e.target.value.toUpperCase())} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="Peso bruto (kg)" mono type="number" step="0.001" value={ped.pesoBruto} onChange={e => update('pesoBruto', parseFloat(e.target.value) || 0)} />
              <Input label="Peso neto (kg)" mono type="number" step="0.001" value={ped.pesoNeto} onChange={e => update('pesoNeto', parseFloat(e.target.value) || 0)} hint={noDisp.has('pesoNeto') ? 'No viene en el archivo: no evaluado.' : undefined} />
              <Input label="Bultos" mono type="number" value={ped.bultos} onChange={e => update('bultos', parseInt(e.target.value) || 0)} hint={noDisp.has('bultos') ? 'No viene en el archivo: no evaluado.' : undefined} />
              <Input label="Tipo de cambio" mono type="number" step="0.00001" value={ped.tipoCambio} onChange={e => update('tipoCambio', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-tinta-suave">Transporte e Incoterm. La congruencia aduana ↔ medio de transporte se revisa contra los Apéndices 1 y 3.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Select label="Incoterm" value={ped.incoterm} onChange={e => update('incoterm', e.target.value)}>
                {!INCOTERMS.includes(ped.incoterm) && <option value={ped.incoterm}>{ped.incoterm || '—'}</option>}
                {INCOTERMS.map(i => <option key={i}>{i}</option>)}
              </Select>
              {esImportado
                ? <Input label="Medio de transporte (Apéndice 3)" value={`${ped.transporte}${ped.medioTransporteClave ? ` (clave ${ped.medioTransporteClave})` : ''}`} readOnly />
                : <Select label="Transporte" value={ped.transporte} onChange={e => update('transporte', e.target.value)}>{TRANSPORTES.map(t => <option key={t}>{t}</option>)}</Select>}
              <Input label="Matrícula / buque / vuelo" value={ped.medioTransporte ?? ''} onChange={e => update('medioTransporte', e.target.value)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-tinta-suave">Partidas. Cada una se valida contra TIGIE, NICO, NOMs, identificadores (Apéndice 8), unidad de tarifa y cuotas compensatorias.</p>
              <div className="flex gap-2">
                <Button variante="ghost" tamano="sm" onClick={recalcValorAduana}>Auto-sumar valor</Button>
                <Button variante="secundario" tamano="sm" onClick={addPartida}><Plus className="w-4 h-4" aria-hidden /> Agregar partida</Button>
              </div>
            </div>
            <div className="space-y-2">
              {ped.partidas.map((p, idx) => (
                <div key={idx} className="rounded-sello border border-linea bg-papel-2/40 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-13 uppercase tracking-wide text-tinta-suave">Partida {p.numeroPartida}</span>
                    {(p.identificadores?.length ?? 0) > 0 && <span className="text-13 text-tinta-suave">· identificadores: {p.identificadores!.map(i => i.codigo).join(', ')}</span>}
                    {ped.partidas.length > 1 && <button onClick={() => removePartida(idx)} className="text-carmin ml-auto" aria-label="Quitar partida"><Trash2 className="w-4 h-4" aria-hidden /></button>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <Input label="Fracción" mono value={p.fraccion} onChange={e => updatePartida(idx, { fraccion: e.target.value })} placeholder="0000.00.00" />
                    <Input label="NICO" mono value={p.nico ?? ''} onChange={e => updatePartida(idx, { nico: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="00" requerido />
                    <div className="md:col-span-2"><Input label="Descripción" value={p.descripcion} onChange={e => updatePartida(idx, { descripcion: e.target.value })} /></div>
                    <PaisSelect label="País de origen" value={p.pais} onChange={v => updatePartida(idx, { pais: v })} />
                    <PaisSelect label="País vendedor" value={p.paisVendedor ?? ''} onChange={v => updatePartida(idx, { paisVendedor: v })} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
                    <Input label="Cantidad (UMC)" mono type="number" value={p.cantidad} onChange={e => updatePartida(idx, { cantidad: parseFloat(e.target.value) || 0 })} />
                    <Select label="Unidad de tarifa (Ap. 7)" value={p.unidadMedida} onChange={e => updatePartida(idx, { unidadMedida: e.target.value })}>
                      {!(catalogs as { unidadesMedida?: { clave: string }[] } | null)?.unidadesMedida?.some(u => u.clave === p.unidadMedida) && <option value={p.unidadMedida}>{p.unidadMedida || '—'}</option>}
                      {((catalogs as { unidadesMedida?: { clave: string; descripcion: string }[] } | null)?.unidadesMedida ?? []).map(u => <option key={u.clave} value={u.clave}>{u.clave} — {u.descripcion}</option>)}
                    </Select>
                    <Input label="Valor unitario USD" mono type="number" step="0.00001" value={p.valorUnitario} onChange={e => updatePartida(idx, { valorUnitario: parseFloat(e.target.value) || 0 })} />
                    <Input label="Valor USD" mono type="number" step="0.01" value={p.valorAduana} onChange={e => updatePartida(idx, { valorAduana: parseFloat(e.target.value) || 0 })} />
                    <Select label="Vinculación" value={p.vinculacion ? '1' : '0'} onChange={e => updatePartida(idx, { vinculacion: e.target.value === '1' })}><option value="0">No</option><option value="1">Sí</option></Select>
                    {p.vinculacion && <Input label="Descripción vinculación" value={p.vinculacionDesc ?? ''} onChange={e => updatePartida(idx, { vinculacionDesc: e.target.value })} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-tinta-suave">Documentos relacionados (referencias, no archivos). Un documento sin referencia se marca DOCUMENTO_VACIO.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input label="Factura / CFDI" mono value={ped.factura ?? ''} onChange={e => update('factura', e.target.value)} placeholder="INV-CN-12345" />
              <Input label="COVE" mono value={ped.cove ?? ''} onChange={e => update('cove', e.target.value)} placeholder="COVE-20260000123" hint={noDisp.has('cove') ? 'El archivo no lo distingue del CFDI: no evaluado.' : undefined} />
              <Input label="BL / guía aérea / carta porte" mono value={ped.bl ?? ''} onChange={e => update('bl', e.target.value)} placeholder="MAEU123456789" hint={noDisp.has('bl') ? 'No viene en el archivo M3: captúralo.' : undefined} />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-tinta">
                <input type="checkbox" className="accent-petroleo w-4 h-4" checked={aiCheck} onChange={e => setAiCheck(e.target.checked)} />
                <Sparkles className="w-4 h-4 text-tinta-suave" strokeWidth={1.5} aria-hidden /> Incluir chequeo IA de inconsistencias de precio
              </label>
              <div className="ml-auto flex gap-2 flex-wrap">
                <Button variante="secundario" onClick={runValidation} disabled={loading} loading={loading}>{esImportado ? 'Volver a validar' : 'Validar (sin guardar)'}</Button>
                {!esImportado && <Button variante="primario" onClick={saveAndValidate} disabled={loading}><ShieldCheck className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Guardar y validar</Button>}
                {pedimentoId && validation && (
                  <Button variante="primario" onClick={archivar} disabled={archivando || !!archivado} loading={archivando}>
                    <Archive className="w-4 h-4" strokeWidth={1.5} aria-hidden /> {archivado ? 'Archivado' : 'Archivar al expediente'}
                  </Button>
                )}
              </div>
            </div>

            {archivado && (
              <p className="text-sm text-sello">Reporte guardado en el expediente <span className="font-sello-mono">{archivado.reference}</span> como «{archivado.documentName}». <a className="underline" href="/expediente">Ver expedientes</a></p>
            )}
            {error && <div className="flex items-center gap-2 p-3 rounded-sello bg-carmin-suave border border-carmin/30"><AlertCircle className="w-4 h-4 text-carmin" aria-hidden /><p className="text-sm text-carmin">{error}</p></div>}

            {validation && (
              <div className="space-y-4">
                <div className={`rounded-sello p-4 border ${validation.valid ? 'border-sello/30' : 'bg-carmin-suave border-carmin/30'}`} style={validation.valid ? { backgroundColor: 'var(--color-petroleo-suave)' } : undefined}>
                  <div className="flex items-center gap-3">
                    {validation.valid ? <CheckCircle2 className="w-6 h-6 text-sello" strokeWidth={1.5} aria-hidden /> : <AlertTriangle className="w-6 h-6 text-carmin" strokeWidth={1.5} aria-hidden />}
                    <div>
                      <p className={`font-sello-display text-22 ${validation.valid ? 'text-sello' : 'text-carmin'}`}>
                        {validation.valid ? 'Sin errores bloqueantes' : `${validation.errorsCount} error(es) bloqueante(s)`}
                      </p>
                      <p className="text-sm text-tinta-suave">
                        {validation.errorsCount} error(es) · {validation.warningsCount} advertencia(s) · {validation.aiNotes.length} nota(s) IA · {validation.reglasNoEvaluadas?.length ?? 0} regla(s) no evaluada(s) · {ped.partidas.length} partida(s)
                      </p>
                    </div>
                    {pedimentoId && <span className="ml-auto font-sello-mono text-13 text-tinta-suave">id {pedimentoId.slice(-8)}</span>}
                  </div>
                </div>

                {validation.issues.length > 0 && (
                  <div>
                    <p className="text-13 uppercase tracking-wide text-tinta-suave mb-2">Hallazgos</p>
                    <div className="space-y-1.5">
                      {validation.issues.map((iss, i) => <IssueRow key={i} iss={iss} goToPartidas={() => setStep(3)} />)}
                    </div>
                  </div>
                )}

                {(validation.reglasNoEvaluadas?.length ?? 0) > 0 && (
                  <div className="rounded-sello border border-ambar/40 bg-ambar-suave p-4">
                    <p className="text-base font-medium text-tinta">Reglas no evaluadas — sin dato suficiente ({validation.reglasNoEvaluadas!.length})</p>
                    <ul className="mt-2 space-y-1">
                      {validation.reglasNoEvaluadas!.map((r, i) => (
                        <li key={i} className="text-sm text-tinta flex items-start gap-2">
                          <span className="font-sello-mono text-13 text-tinta-suave shrink-0">{r.rule}{r.partida ? ` · P${r.partida}` : ''}</span>
                          <span>{r.motivo}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-13 text-tinta-suave mt-2">Una regla sin dato no dispara ni cuenta como revisada: captura el dato faltante para evaluarla.</p>
                  </div>
                )}

                {validation.aiNotes.length > 0 && (
                  <div className="rounded-sello border border-linea bg-papel-2/50 p-4">
                    <p className="text-base font-medium text-tinta mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-tinta-suave" strokeWidth={1.5} aria-hidden /> Notas IA — inconsistencias de precio</p>
                    <div className="space-y-2">
                      {validation.aiNotes.map((n, i) => (
                        <div key={i} className="bg-superficie border border-linea rounded-sello-sm p-3 text-sm">
                          <p className="font-medium text-tinta">Partida {n.partida}</p>
                          <p className="text-tinta mt-1">{n.observation}</p>
                          <p className="text-tinta-suave mt-1 italic">{n.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-linea">
          <Button variante="ghost" tamano="sm" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}><ChevronLeft className="w-4 h-4" aria-hidden /> Anterior</Button>
          <span className="text-13 text-tinta-suave">Paso {step} de {STEPS.length}</span>
          {step < STEPS.length
            ? <Button variante="ghost" tamano="sm" onClick={() => setStep(s => Math.min(STEPS.length, s + 1))}>Siguiente <ChevronRight className="w-4 h-4" aria-hidden /></Button>
            : <span className="w-16" />}
        </div>
      </Card>

      <ReglasPrevalidador />
    </div>
  )
}

function IssueRow({ iss, goToPartidas }: {
  iss: { partida?: number; field: string; severity: string; message: string; rule: string };
  goToPartidas?: () => void;
}) {
  if (iss.rule === 'ANTIDUMPING_NOT_DECLARED') {
    return (
      <div className="rounded-sello border-l-2 border-carmin bg-carmin-suave p-4 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-carmin shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-carmin">
              Cuota compensatoria no declarada
              {iss.partida ? <span className="ml-2 font-normal">· Partida {iss.partida}</span> : null}
              <span className="ml-2 font-sello-mono text-13 text-carmin/70">[{iss.rule}]</span>
            </p>
            <p className="text-sm text-tinta mt-1 leading-relaxed whitespace-pre-line">{iss.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {goToPartidas && <Button variante="secundario" tamano="sm" onClick={goToPartidas}>Agregar identificador CC a la partida {iss.partida ?? ''}</Button>}
              <a href="/cuotas-activas" className="text-sm underline text-carmin self-center">Ver resolución en Cuotas activas</a>
            </div>
          </div>
        </div>
      </div>
    )
  }
  const tono = iss.severity === 'error' ? 'border-carmin/30 bg-carmin-suave text-carmin' : iss.severity === 'warning' ? 'border-ambar/30 bg-ambar-suave text-ambar' : 'border-linea bg-papel-2/50 text-tinta'
  const Icon = iss.severity === 'error' ? AlertCircle : iss.severity === 'warning' ? AlertTriangle : FileText
  return (
    <div className={`rounded-sello border px-3 py-2 ${tono}`}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {iss.partida ? `Partida ${iss.partida} · ` : ''}{iss.field === 'fraccion' && iss.partida ? formatFraction((iss.message.match(/[0-9]{8}/) ?? [''])[0]) : iss.field}
            <span className="ml-2 font-sello-mono text-13 opacity-70">[{iss.rule}]</span>
          </p>
          <p className="text-sm text-tinta mt-0.5 leading-relaxed">{iss.message}</p>
        </div>
      </div>
    </div>
  )
}
