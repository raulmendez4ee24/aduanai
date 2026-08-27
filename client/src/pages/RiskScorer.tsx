import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { RiskAssessResult, RiskChecklistItem, RiskRegla } from '../lib/api'
import { ShieldAlert, ShieldCheck, Scale, AlertTriangle, ExternalLink, CheckCircle2, Circle, Loader2, Briefcase, FileText, Paperclip, Archive, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { OrigenBadge } from '../components/OrigenBadge'
import { useEstadoPersistente } from '../hooks/useEstadoPersistente'
import { useClienteActivo } from '../hooks/useClienteActivo'
import { riskCartera, riskHistorial, riskEvidencia, riskArchivar, riskDictamenUrl, abrirHtmlConToken, archivoABase64, type FilaCartera, type RiskHistorialFila } from '../lib/api/ola2'

export const GUIA_MODULO = {
  titulo: 'Risk Scorer — responsabilidad solidaria',
  pasos: [
    'Elige el cliente activo en el selector global: la evaluación se guarda a su nombre con folio RS-<año>-<seq> y alimenta su score vivo.',
    'Captura identificadores (fracción, RFC, pedimento) y responde el checklist declarativo; lo no respondido cuenta como riesgo (falla cerrada).',
    'Evalúa: verás exposición y escudo por separado, con fundamento y fecha de cotejo por regla.',
    'Adjunta el documento que respalda una señal "declarada": pasa a "verificado (doc. adjunto)" sin alterar pesos ni puntos.',
    'Abre el dictamen imprimible (folio + hash SHA-256) y archívalo al expediente 59-V de la operación.',
    'Pestaña Cartera: todos los clientes ordenados por exposición, con tendencia y fecha del último score — vista del gerente.',
  ],
}

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const BANDA_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  VERDE: { bg: 'bg-emerald-500', text: 'text-emerald-700', label: 'Verde — exposición controlada' },
  AMARILLO: { bg: 'bg-yellow-400', text: 'text-yellow-700', label: 'Amarillo — refuerza tu evidencia' },
  NARANJA: { bg: 'bg-orange-500', text: 'text-orange-700', label: 'Naranja — exposición relevante' },
  ROJO: { bg: 'bg-rose-500', text: 'text-rose-700', label: 'Rojo — exposición alta' },
  ROJO_CRITICO: { bg: 'bg-rose-700', text: 'text-rose-800', label: 'ROJO CRÍTICO — no despachar sin corregir' },
}

const FACTOR_LABEL: Record<string, string> = {
  VALOR: 'Valor en aduana', PERFIL: 'Perfil del importador', CUOTAS: 'Cuotas compensatorias',
  PADRONES: 'Padrones sectoriales', TEMPORALES: 'Temporales IMMEX', CLASIFICACION: 'Clasificación',
  NOMS: 'NOMs', DOCUMENTACION: 'Documentación',
}

/** Tri-estado del checklist declarativo: null = sin responder. */
type Tri = boolean | null
interface DeclItem { key: string; label: string }
const DECL_GRUPOS: { titulo: string; items: DeclItem[] }[] = [
  {
    titulo: 'Valor y pago',
    items: [
      { key: 'mveTransmitida', label: 'Manifestación de Valor (E2) transmitida por Ventanilla Digital' },
      { key: 'incrementablesConSoporte', label: 'Incrementables (flete/seguro/regalías) con soporte documental' },
      { key: 'pagoConSoporteBancario', label: 'Pago con transferencia bancaria o carta de crédito' },
      { key: 'proveedorLocalizable', label: 'Proveedor extranjero localizable y verificado' },
    ],
  },
  {
    titulo: 'Cliente y padrones',
    items: [
      { key: 'expedienteKyc', label: 'Expediente KYC del cliente (162-VI: identidad, no-vinculación 69-B)' },
      { key: 'padronImportadoresVigente', label: 'Padrón de Importadores vigente y sin causales de suspensión' },
      { key: 'causalSuspensionPadron', label: 'ALERTA: hay causal visible de suspensión del padrón (1.3.3)' },
      { key: 'vinculacionConCliente', label: 'ALERTA: existe vinculación agente/agencia–cliente (160-XIII)' },
    ],
  },
  {
    titulo: 'Expedientes y despacho',
    items: [
      { key: 'expediente162VII', label: 'Expediente electrónico del despacho (162-VII) completo' },
      { key: 'controlInterno81A', label: 'Procedimientos de control interno documentados (RLA 81-A)' },
      { key: 'encargoConferido', label: 'Encargo conferido vigente para el RFC' },
      { key: 'evidenciaNoms', label: 'Evidencia de cumplimiento de NOMs disponible' },
      { key: 'documentoRrnaAmparaMercancia', label: 'El documento RRNA ampara exactamente la mercancía (235-H)' },
      { key: 'certOrigen9Elementos', label: 'Certificación de origen con los 9 elementos (Anexo 5-A T-MEC)' },
    ],
  },
  {
    titulo: 'Origen y régimen',
    items: [
      { key: 'pruebaOrigenDistinto', label: 'Prueba de origen distinto disponible (defensa LCE 66 vs cuotas)' },
      { key: 'rutaTercerPaisEnsamblador', label: 'ALERTA: ruta con ensamble/ajuste en tercer país (elusión 89 B)' },
      { key: 'transferenciaDeTemporales', label: 'ALERTA: la operación transfiere temporales (solidaridad 53-X)' },
    ],
  },
]
const DECL_59V: DeclItem[] = [
  { key: 'a', label: 'a) Garantía cuenta aduanera (si aplica precio estimado)' },
  { key: 'b', label: 'b) CFDIs' }, { key: 'c', label: 'c) Facturas comerciales' },
  { key: 'd', label: 'd) Transferencias de pago / cartas de crédito' },
  { key: 'e', label: 'e) Transporte, seguros y conexos' },
  { key: 'f', label: 'f) Contratos y órdenes de compra' },
  { key: 'g', label: 'g) Soporte de incrementables (65-66)' },
  { key: 'h', label: 'h) Otros: notas de crédito / descuentos (RLA 81-X)' },
]
const DECL_AGENCIA: DeclItem[] = [
  { key: 'mveEspejoAgencia', label: 'La agencia conserva los documentos 81 de la MVE (235-F)' },
  { key: 'constancia32D', label: 'Constancia 32-D de socios/administración (235-J)' },
]

function FundamentoLink({ regla }: { regla: { fundamento: RiskRegla['fundamento'] } }) {
  const f = regla.fundamento
  return (
    <a href={f.url} target="_blank" rel="noreferrer" title={`${f.citaCorta}\n\nFuente: ${f.fuente}`}
      className="inline-flex items-center gap-1 text-[11px] font-mono text-sky-700 hover:text-sky-900 hover:underline">
      {f.articulo} · cotejo {f.fechaCotejo} <ExternalLink className="w-3 h-3" />
    </a>
  )
}

function TriSelect({ value, onChange }: { value: Tri; onChange: (v: Tri) => void }) {
  // Selección NEUTRA (petróleo) para Sí/No — nunca verde: un "Sí" puede sumar
  // riesgo (filas ALERTA). El "sin responder" se pinta ámbar (cuenta como riesgo).
  const opt = (v: Tri, label: string, cls: string) => (
    <button type="button" onClick={() => onChange(v)}
      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-colors ${value === v ? cls : 'bg-white/50 text-slate-400 border-slate-200 hover:bg-white'}`}>
      {label}
    </button>
  )
  return (
    <div className="flex gap-1 shrink-0">
      {opt(true, 'Sí', 'bg-teal-900 text-white border-teal-900')}
      {opt(false, 'No', 'bg-teal-900 text-white border-teal-900')}
      {opt(null, '—', 'bg-amber-100 text-amber-800 border-amber-400')}
    </div>
  )
}

const esAlerta = (label: string) => label.startsWith('ALERTA:')

interface FormRisk {
  tipoSujeto: 'agente' | 'agencia'
  op: { fraccion: string; paisOrigen: string; importadorRfc: string; numeroPedimento: string; valorUnitario: string; preferenciaArancelaria: boolean }
  decl: Record<string, Tri>
  v59: Record<string, Tri>
  padrones: string
  operationId: string
}
const FORM_INICIAL: FormRisk = {
  tipoSujeto: 'agente',
  op: { fraccion: '', paisOrigen: '', importadorRfc: '', numeroPedimento: '', valorUnitario: '', preferenciaArancelaria: false },
  decl: {}, v59: {}, padrones: '', operationId: '',
}
type ResultadoOperativo = RiskAssessResult & { folio?: string | null; clienteId?: string | null; operationId?: string | null }

export function RiskScorerPage() {
  // Ola 2: estado persistente (sobrevive al cambio de módulo) en UN objeto.
  const [form, setForm] = useEstadoPersistente<FormRisk>('risk-scorer', FORM_INICIAL)
  const { tipoSujeto, op, decl, v59, padrones } = form
  const setTipoSujeto = (t: FormRisk['tipoSujeto']) => setForm(f => ({ ...f, tipoSujeto: t }))
  const setOp = (o: FormRisk['op']) => setForm(f => ({ ...f, op: o }))
  const setDecl = (d: Record<string, Tri>) => setForm(f => ({ ...f, decl: d }))
  const setV59 = (d: Record<string, Tri>) => setForm(f => ({ ...f, v59: d }))
  const setPadrones = (p: string) => setForm(f => ({ ...f, padrones: p }))
  const { clienteId } = useClienteActivo()
  const [vista, setVista] = useState<'evaluar' | 'cartera'>('evaluar')
  const [result, setResult] = useState<ResultadoOperativo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bandaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Mismo patrón del Clasificador: el resultado no debe aparecer fuera de vista.
    if (result) bandaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  // Preguntas sin responder = riesgo (falla cerrada del motor). Contador junto a Evaluar.
  const preguntas: Tri[] = [
    ...DECL_GRUPOS.flatMap(g => g.items.map(it => decl[it.key] ?? null)),
    ...DECL_59V.map(it => v59[it.key] ?? null),
    ...(tipoSujeto === 'agencia' ? DECL_AGENCIA.map(it => decl[it.key] ?? null) : []),
  ]
  const sinResponder = preguntas.filter(v => v === null).length

  async function evaluar() {
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await api.riskAssess({
        tipoSujeto,
        operacion: {
          fraccion: op.fraccion || undefined,
          paisOrigen: op.paisOrigen || undefined,
          importadorRfc: op.importadorRfc || undefined,
          numeroPedimento: op.numeroPedimento || undefined,
          valorUnitario: op.valorUnitario ? parseFloat(op.valorUnitario) : undefined,
          preferenciaArancelaria: op.preferenciaArancelaria,
        },
        declarado: {
          ...decl,
          expediente59V: v59,
          padronesActivos: padrones.split(',').map(s => s.trim()).filter(Boolean),
        },
        ...(form.operationId.trim() ? { operationId: form.operationId.trim() } : {}),
      } as Parameters<typeof api.riskAssess>[0])
      setResult(res.data as ResultadoOperativo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al evaluar')
    }
    setLoading(false)
  }

  const banda = result ? BANDA_STYLE[result.banda] ?? BANDA_STYLE.ROJO : null
  const reglasActivas = result?.factores.flatMap(f => f.reglas.filter(r => r.puntos > 0)) ?? []
  // Reglas no evaluadas (señal no disponible: dataset vencido/sin ingesta) —
  // 0 puntos por diseño, así que el filtro de arriba jamás las mostraría y el
  // motivo sería invisible (revisión 25-ago). Se listan aparte, con su motivo.
  const reglasNoEvaluadas = result?.factores.flatMap(f => f.reglas.filter(r => r.origenEfectivo === 'no_evaluado')) ?? []
  const checklistAplicable = (result?.checklist ?? []).filter((c: RiskChecklistItem) => c.aplicable)
  const pendientes = checklistAplicable.filter(c => !c.completo)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 flex items-center gap-2"><Scale className="w-6 h-6 text-emerald-600" />Risk Scorer — Responsabilidad Solidaria</h1>
        <p className="text-[12px] text-slate-500 mt-1">
          Motor determinista con fundamento citable por regla (reforma aduanera 2026). El Art. 54 vigente ya no tiene excluyentes:
          tu defensa es la evidencia — este scorer mide tu exposición Y tu escudo, por separado.
        </p>
      </div>

      {/* Ola 2: Evaluar / Cartera */}
      <div className="flex items-center gap-2 flex-wrap">
        {([['evaluar', 'Evaluar', Scale], ['cartera', 'Cartera (gerente)', Briefcase]] as const).map(([k, l, Icono]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${vista === k ? 'bg-teal-900 text-white border-teal-900' : 'bg-white/60 text-slate-600 border-slate-200'}`}>
            <Icono className="w-3.5 h-3.5" /> {l}
          </button>
        ))}
        {vista === 'evaluar' && (
          <span className={`text-[11px] px-3 py-1 rounded-full border ${clienteId ? 'bg-teal-50 text-teal-800 border-teal-200' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
            {clienteId ? 'La evaluación se guardará a nombre del cliente activo' : 'Sin cliente activo: la evaluación no alimentará la cartera'}
          </span>
        )}
      </div>

      {vista === 'cartera' && <CarteraRisk />}

      {/* Formulario */}
      <div className={`${GLASS} rounded-[2rem] p-6 space-y-5 ${vista === 'cartera' ? 'hidden' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold text-slate-600">Evaluar como:</span>
          {(['agente', 'agencia'] as const).map(t => (
            <button key={t} onClick={() => setTipoSujeto(t)}
              className={`px-4 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${tipoSujeto === t ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white/60 text-slate-600 border-slate-200'}`}>
              {t === 'agente' ? 'Agente aduanal' : 'Agencia aduanal'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ['fraccion', 'Fracción arancelaria', '7318.15.01'],
            ['paisOrigen', 'País de origen (ISO-2)', 'CN'],
            ['importadorRfc', 'RFC del importador', 'ABC010101XYZ'],
            ['numeroPedimento', 'Número de pedimento', '25 47 3461 4000284'],
            ['valorUnitario', 'Valor unitario (USD)', '100'],
          ] as const).map(([key, label, ph]) => (
            <label key={key} className="block">
              <span className="text-[11px] font-semibold text-slate-500">{label}</span>
              <input value={op[key]} onChange={e => setOp({ ...op, [key]: e.target.value })} placeholder={ph}
                className="mt-1 w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </label>
          ))}
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500">ID de la operación (expediente 59-V) — opcional</span>
            <input value={form.operationId} onChange={e => setForm(f => ({ ...f, operationId: e.target.value }))} placeholder="id del expediente"
              className="mt-1 w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500">Padrones sectoriales activos</span>
            <input value={padrones} onChange={e => setPadrones(e.target.value)} placeholder="15, 10 (códigos Anexo 10)"
              className="mt-1 w-full bg-white/60 border border-slate-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-slate-600">
          <input type="checkbox" checked={op.preferenciaArancelaria} onChange={e => setOp({ ...op, preferenciaArancelaria: e.target.checked })} className="accent-emerald-500" />
          La operación aplica preferencia arancelaria (T-MEC u otro tratado)
        </label>

        <div className="grid md:grid-cols-2 gap-5">
          {DECL_GRUPOS.map(g => (
            <div key={g.titulo} className="bg-white/40 rounded-2xl p-4">
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">{g.titulo} <span className="normal-case font-normal text-amber-600">· declarado por ti</span></p>
              <div className="space-y-2">
                {g.items.map(it => (
                  <div key={it.key}
                    className={`flex items-center justify-between gap-2 ${esAlerta(it.label) ? 'bg-rose-50/70 border border-rose-200 rounded-lg px-2 py-1 -mx-1' : ''}`}>
                    <span className={`text-[12px] ${esAlerta(it.label) ? 'text-rose-800' : 'text-slate-700'}`}>{it.label}</span>
                    <TriSelect value={decl[it.key] ?? null} onChange={v => setDecl({ ...decl, [it.key]: v })} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="bg-white/40 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Expediente 59-V (por operación) <span className="normal-case font-normal text-amber-600">· declarado por ti</span></p>
            <div className="space-y-2">
              {DECL_59V.map(it => (
                <div key={it.key} className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-slate-700">{it.label}</span>
                  <TriSelect value={v59[it.key] ?? null} onChange={v => setV59({ ...v59, [it.key]: v })} />
                </div>
              ))}
            </div>
          </div>
          {tipoSujeto === 'agencia' && (
            <div className="bg-white/40 rounded-2xl p-4 border border-sky-200">
              <p className="text-[11px] font-bold text-sky-700 uppercase tracking-wider mb-2">Solo agencias (RLA 235-F / 235-J)</p>
              <div className="space-y-2">
                {DECL_AGENCIA.map(it => (
                  <div key={it.key} className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-slate-700">{it.label}</span>
                    <TriSelect value={decl[it.key] ?? null} onChange={v => setDecl({ ...decl, [it.key]: v })} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={evaluar} disabled={loading}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
            {loading ? 'Evaluando…' : 'Evaluar exposición y escudo'}
          </button>
          {sinResponder > 0 && (
            <span className="text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-full px-3 py-1.5">
              {sinResponder} pregunta{sinResponder === 1 ? '' : 's'} sin responder — cuentan como riesgo (falla cerrada)
            </span>
          )}
        </div>
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
      </div>

      {/* Resultado */}
      {result && banda && vista === 'evaluar' && (
        <div className="space-y-4">
          {/* Ola 2: folio + dictamen + archivar */}
          <div className={`${GLASS} rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap`}>
            <span className="text-[12px] text-slate-600">Folio <span className="font-mono font-bold text-slate-900">{result.folio ?? 'sin folio'}</span></span>
            <button onClick={() => abrirHtmlConToken(riskDictamenUrl(result.assessmentId)).catch(e => setError(e instanceof Error ? e.message : 'Error'))}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-teal-900 bg-white border border-slate-200 px-3 py-1.5 rounded-full hover:bg-slate-50">
              <FileText className="w-3.5 h-3.5" /> Dictamen imprimible (PDF)
            </button>
            <ArchivarDictamen assessmentId={result.assessmentId} operationId={result.operationId ?? (form.operationId.trim() || null)} setError={setError} />
            <span className="text-[11px] text-slate-500 ml-auto">Adjunta evidencia en cada regla "declarada" para pasarla a verificada.</span>
          </div>
          {/* Banda */}
          <div ref={bandaRef} className={`rounded-2xl p-4 flex items-center gap-3 scroll-mt-4 ${banda.bg} text-white`}>
            {result.banda.startsWith('ROJO') ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            <div>
              <p className="text-[15px] font-bold">{banda.label}</p>
              {result.cobertura && (
                <p className="text-[11px] opacity-90 mt-0.5">
                  {result.cobertura.verificadas} verificadas · {result.cobertura.declaradas} declaradas · {result.cobertura.noEvaluadas} no evaluadas
                </p>
              )}
              {result.banderas.length > 0 && (
                <p className="text-[11px] opacity-90 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />
                  Banderas: {result.banderas.map(b => b === 'LISTADO_69B' ? 'Importador en listado 69-B' : b === 'EMBARGO' ? 'Causal de embargo (151 LA)' : b).join(' · ')}
                </p>
              )}
            </div>
          </div>

          {/* LAS DOS DIMENSIONES — siempre juntas, nunca un solo número */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Dimensión A: Exposición */}
            <div className={`${GLASS} rounded-[2rem] p-6`}>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dimensión A — Exposición</p>
              <p className="text-[42px] font-bold text-slate-900 leading-none mt-2">{result.exposicion}<span className="text-[18px] text-slate-400">/100</span></p>
              <div className="mt-4 space-y-2">
                {result.factores.map(f => (
                  <div key={f.factor}>
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>{FACTOR_LABEL[f.factor] ?? f.factor}</span><span className="font-mono">{f.puntos}/{f.peso}</span>
                    </div>
                    {/* riel gris SIEMPRE visible — los factores en 0 también se leen */}
                    <div className="bg-slate-300/80 h-1.5 rounded-full">
                      <div className={`h-1.5 rounded-full ${f.puntos > 0 ? 'bg-rose-400' : 'bg-emerald-300'}`} style={{ width: `${f.peso > 0 ? (f.puntos / f.peso) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dimensión B: Escudo */}
            <div className={`${GLASS} rounded-[2rem] p-6`}>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dimensión B — Escudo de evidencia</p>
              <p className="text-[42px] font-bold text-slate-900 leading-none mt-2">{result.escudoPct}<span className="text-[18px] text-slate-400">%</span></p>
              <p className="text-[11px] text-slate-500 mt-1">{checklistAplicable.filter(c => c.completo).length} de {checklistAplicable.length} evidencias aplicables completas · las defensas NO restan exposición</p>
              {/* Qué te falta — checklist accionable */}
              {pendientes.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider mb-2">Qué te falta (accionable)</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {pendientes.map(c => (
                      <div key={c.id} className="flex items-start gap-2 bg-rose-50/60 border border-rose-100 rounded-lg px-2.5 py-1.5">
                        <Circle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[12px] text-slate-800">{c.accionSugerida}</p>
                          <div className="flex items-center gap-2 flex-wrap"><FundamentoLink regla={c} />
                            <AdjuntarEvidencia assessmentId={result.assessmentId} factorId={c.id} onListo={res => setResult(prev => prev ? { ...prev, ...res } : prev)} setError={setError} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pendientes.length === 0 && (
                <p className="mt-4 text-[12px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />Todas las evidencias aplicables están completas.</p>
              )}
            </div>
          </div>

          {/* Reglas que sumaron puntos — con fundamento clickeable y origen de señal */}
          {(reglasActivas.length > 0 || reglasNoEvaluadas.length > 0) && (
            <div className={`${GLASS} rounded-[2rem] p-6`}>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Por qué — reglas que sumaron exposición ({reglasActivas.length})</p>
              <div className="space-y-2">
                {reglasActivas.sort((a, b) => b.puntos - a.puntos).map(r => (
                  <div key={r.id} className="flex items-start justify-between gap-3 bg-white/50 rounded-xl px-3 py-2.5 border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-[13px] text-slate-800">{r.descripcion}{r.bandera && <span className="ml-2 text-[10px] font-bold text-rose-600">⚑ {r.bandera}</span>}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <OrigenBadge origen={r.origenEfectivo ?? r.origenSenal} motivo={r.motivo} />
                        <FundamentoLink regla={r} />
                        {(r.origenEfectivo ?? r.origenSenal) === 'declarado' && (
                          <AdjuntarEvidencia assessmentId={result.assessmentId} factorId={r.id} onListo={res => setResult(prev => prev ? { ...prev, ...res } : prev)} setError={setError} />
                        )}
                        {(r as RiskRegla & { verificadoPorEvidencia?: boolean }).verificadoPorEvidencia && <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">doc. adjunto</span>}
                      </div>
                    </div>
                    <span className="font-mono text-[15px] font-bold text-rose-600 shrink-0">+{r.puntos}</span>
                  </div>
                ))}
              </div>
              {reglasNoEvaluadas.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-200/60">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">No evaluadas — sin puntos ni bandera ({reglasNoEvaluadas.length})</p>
                  <div className="space-y-2">
                    {reglasNoEvaluadas.map(r => (
                      <div key={r.id} className="flex items-start justify-between gap-3 bg-slate-50/60 rounded-xl px-3 py-2.5 border border-slate-100">
                        <div className="min-w-0">
                          <p className="text-[13px] text-slate-600">{r.descripcion}</p>
                          {r.motivo && <p className="text-[11px] text-slate-500 mt-0.5">{r.motivo}</p>}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <OrigenBadge origen="no_evaluado" motivo={r.motivo} />
                            <FundamentoLink regla={r} />
                          </div>
                        </div>
                        <span className="font-mono text-[13px] text-slate-400 shrink-0">0</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-slate-400">{result.disclaimer} · Reglas {result.rulesVersion}</p>
        </div>
      )}
    </div>
  )
}

// ── Ola 2: evidencia documental, archivar dictamen y cartera ────────────

function AdjuntarEvidencia({ assessmentId, factorId, onListo, setError }: { assessmentId: string; factorId: string; onListo: (r: Partial<RiskAssessResult>) => void; setError: (m: string) => void }) {
  const [ocupado, setOcupado] = useState(false)
  async function subir(file: File) {
    setOcupado(true)
    try {
      const base64 = await archivoABase64(file)
      const r = await riskEvidencia(assessmentId, factorId, { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64 })
      onListo(r.data.resultado as Partial<RiskAssessResult>)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo adjuntar la evidencia') }
    setOcupado(false)
  }
  return (
    <label className={`inline-flex items-center gap-1 text-[10px] font-semibold text-teal-900 bg-white border border-slate-200 rounded-full px-2 py-0.5 cursor-pointer hover:bg-slate-50 ${ocupado ? 'opacity-50 pointer-events-none' : ''}`} title="Adjunta el documento que respalda esta señal (máx. 3 MB)">
      {ocupado ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />} adjuntar evidencia
      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xml" onChange={e => e.target.files?.[0] && subir(e.target.files[0])} />
    </label>
  )
}

function ArchivarDictamen({ assessmentId, operationId, setError }: { assessmentId: string; operationId: string | null; setError: (m: string) => void }) {
  const [estado, setEstado] = useState<'idle' | 'ok' | 'busy'>('idle')
  const [opId, setOpId] = useState(operationId ?? '')
  async function archivar() {
    if (!opId.trim()) return
    setEstado('busy')
    try { await riskArchivar(assessmentId, opId.trim()); setEstado('ok') } catch (e) { setEstado('idle'); setError(e instanceof Error ? e.message : 'No se pudo archivar') }
  }
  if (estado === 'ok') return <span className="text-[12px] text-teal-800 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Dictamen archivado en el expediente</span>
  return (
    <span className="flex items-center gap-1.5">
      <input value={opId} onChange={e => setOpId(e.target.value)} placeholder="id del expediente" className="text-[11px] font-mono bg-white/60 border border-slate-200 rounded-full px-3 py-1 w-40" />
      <button onClick={archivar} disabled={!opId.trim() || estado === 'busy'} className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-teal-900 px-3 py-1.5 rounded-full disabled:opacity-50">
        {estado === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />} Archivar al expediente 59-V
      </button>
    </span>
  )
}

const TENDENCIA: Record<FilaCartera['tendencia'], { label: string; Icono: typeof TrendingUp; cls: string }> = {
  sube: { label: 'sube', Icono: TrendingUp, cls: 'text-rose-600' },
  baja: { label: 'baja', Icono: TrendingDown, cls: 'text-emerald-600' },
  estable: { label: 'estable', Icono: Minus, cls: 'text-slate-500' },
  sin_historial: { label: 'sin historial', Icono: Minus, cls: 'text-slate-400' },
}

function CarteraRisk() {
  const [filas, setFilas] = useState<FilaCartera[] | null>(null)
  const [err, setErr] = useState('')
  const [detalle, setDetalle] = useState<{ cliente: string; serie: RiskHistorialFila[] } | null>(null)
  useEffect(() => { riskCartera().then(r => setFilas(r.data)).catch(e => { setFilas([]); setErr(e instanceof Error ? e.message : 'Error') }) }, [])
  async function verHistorial(f: FilaCartera) {
    try { const r = await riskHistorial(f.clienteId); setDetalle({ cliente: r.data.cliente.razonSocial, serie: r.data.serie }) } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
  }
  return (
    <div className={`${GLASS} rounded-[2rem] p-6 space-y-4`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cartera — clientes ordenados por exposición (último score)</p>
        <span className="text-[11px] text-slate-500">{filas?.length ?? 0} cliente(s)</span>
      </div>
      {err && <p className="text-[12px] text-rose-600">{err}</p>}
      {filas === null ? <p className="text-[12px] text-slate-500">Cargando cartera…</p>
        : filas.length === 0 ? <p className="text-[12px] text-slate-500">Sin clientes registrados. Da de alta clientes en /clientes y evalúa con el selector activo.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Cliente</th><th className="py-2 pr-3">Exposición</th><th className="py-2 pr-3">Escudo</th><th className="py-2 pr-3">Banda</th><th className="py-2 pr-3">Tendencia</th><th className="py-2 pr-3">Folio</th><th className="py-2 pr-3">Fecha</th><th className="py-2"></th>
              </tr></thead>
              <tbody>
                {filas.map(f => {
                  const b = f.banda ? BANDA_STYLE[f.banda] : null
                  const t = TENDENCIA[f.tendencia]
                  return (
                    <tr key={f.clienteId} className="border-b border-slate-100">
                      <td className="py-2 pr-3"><p className="text-[13px] text-slate-800">{f.razonSocial}</p><p className="text-[10px] font-mono text-slate-500">{f.rfc}</p></td>
                      <td className="py-2 pr-3 font-mono text-[15px] font-bold text-slate-900">{f.exposicion ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono text-[13px] text-slate-700">{f.escudoPct != null ? `${f.escudoPct}%` : '—'}</td>
                      <td className="py-2 pr-3">{b ? <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.bg} mr-1.5 align-middle`} /> : null}<span className="text-[11px] text-slate-600">{f.banda ?? 'sin evaluar'}</span></td>
                      <td className="py-2 pr-3"><span className={`inline-flex items-center gap-1 text-[11px] ${t.cls}`}><t.Icono className="w-3.5 h-3.5" /> {t.label}</span></td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">{f.folio ?? '—'}</td>
                      <td className="py-2 pr-3 text-[11px] text-slate-500">{f.fecha ? new Date(f.fecha).toLocaleDateString('es-MX') : '—'}</td>
                      <td className="py-2 text-right">
                        {f.evaluaciones > 0 && <button onClick={() => verHistorial(f)} className="text-[11px] font-semibold text-teal-900 hover:underline">historial ({f.evaluaciones})</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      {detalle && (
        <div className="bg-white/50 rounded-2xl p-4 border border-slate-100">
          <p className="text-[12px] font-semibold text-slate-700 mb-2">Historial de {detalle.cliente} (score vivo = último)</p>
          <div className="flex items-end gap-1.5 h-24">
            {detalle.serie.map(s => (
              <div key={s.id} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${s.folio ?? s.id} · exposición ${s.exposicion} · escudo ${s.escudoPct}% · ${new Date(s.createdAt).toLocaleDateString('es-MX')}`}>
                <div className={`w-full rounded-t ${BANDA_STYLE[s.banda]?.bg ?? 'bg-slate-300'}`} style={{ height: `${Math.max(4, s.exposicion)}%` }} />
                <span className="text-[9px] font-mono text-slate-500">{s.exposicion}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {detalle.serie.map(s => <button key={s.id} onClick={() => abrirHtmlConToken(riskDictamenUrl(s.id)).catch(() => {})} className="text-[10px] font-mono text-teal-900 bg-white border border-slate-200 rounded-full px-2 py-0.5 hover:bg-slate-50">{s.folio ?? s.id.slice(-6)}</button>)}
          </div>
        </div>
      )}
    </div>
  )
}
