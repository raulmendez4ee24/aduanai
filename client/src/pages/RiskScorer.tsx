import { useState } from 'react'
import { api } from '../lib/api'
import type { RiskAssessResult, RiskChecklistItem, RiskRegla } from '../lib/api'
import { ShieldAlert, ShieldCheck, Scale, AlertTriangle, ExternalLink, CheckCircle2, Circle, Loader2 } from 'lucide-react'

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

function OrigenBadge({ origen }: { origen: string }) {
  if (origen === 'verificado') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200"><ShieldCheck className="w-3 h-3" />VERIFICADO POR EL SISTEMA</span>
  }
  if (origen === 'mixto') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">MIXTO (sistema + usuario)</span>
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">DECLARADO POR USUARIO</span>
}

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
  const opt = (v: Tri, label: string, cls: string) => (
    <button type="button" onClick={() => onChange(v)}
      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-colors ${value === v ? cls : 'bg-white/50 text-slate-400 border-slate-200 hover:bg-white'}`}>
      {label}
    </button>
  )
  return (
    <div className="flex gap-1 shrink-0">
      {opt(true, 'Sí', 'bg-emerald-100 text-emerald-700 border-emerald-300')}
      {opt(false, 'No', 'bg-rose-100 text-rose-700 border-rose-300')}
      {opt(null, '—', 'bg-slate-200 text-slate-600 border-slate-300')}
    </div>
  )
}

export function RiskScorerPage() {
  const [tipoSujeto, setTipoSujeto] = useState<'agente' | 'agencia'>('agente')
  const [op, setOp] = useState({ fraccion: '', paisOrigen: '', importadorRfc: '', numeroPedimento: '', valorUnitario: '', preferenciaArancelaria: false })
  const [decl, setDecl] = useState<Record<string, Tri>>({})
  const [v59, setV59] = useState<Record<string, Tri>>({})
  const [padrones, setPadrones] = useState('')
  const [result, setResult] = useState<RiskAssessResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      })
      setResult(res.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al evaluar')
    }
    setLoading(false)
  }

  const banda = result ? BANDA_STYLE[result.banda] ?? BANDA_STYLE.ROJO : null
  const reglasActivas = result?.factores.flatMap(f => f.reglas.filter(r => r.puntos > 0)) ?? []
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

      {/* Formulario */}
      <div className={`${GLASS} rounded-[2rem] p-6 space-y-5`}>
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
                  <div key={it.key} className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-slate-700">{it.label}</span>
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

        <button onClick={evaluar} disabled={loading}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-6 py-3 rounded-full transition-all">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
          {loading ? 'Evaluando…' : 'Evaluar exposición y escudo'}
        </button>
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
      </div>

      {/* Resultado */}
      {result && banda && (
        <div className="space-y-4">
          {/* Banda */}
          <div className={`rounded-2xl p-4 flex items-center gap-3 ${banda.bg} text-white`}>
            {result.banda.startsWith('ROJO') ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            <div>
              <p className="text-[15px] font-bold">{banda.label}</p>
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
                    <div className="bg-slate-200/60 h-1.5 rounded-full">
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
                          <FundamentoLink regla={c} />
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
          {reglasActivas.length > 0 && (
            <div className={`${GLASS} rounded-[2rem] p-6`}>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Por qué — reglas que sumaron exposición ({reglasActivas.length})</p>
              <div className="space-y-2">
                {reglasActivas.sort((a, b) => b.puntos - a.puntos).map(r => (
                  <div key={r.id} className="flex items-start justify-between gap-3 bg-white/50 rounded-xl px-3 py-2.5 border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-[13px] text-slate-800">{r.descripcion}{r.bandera && <span className="ml-2 text-[10px] font-bold text-rose-600">⚑ {r.bandera}</span>}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <OrigenBadge origen={r.origenSenal} />
                        <FundamentoLink regla={r} />
                      </div>
                    </div>
                    <span className="font-mono text-[15px] font-bold text-rose-600 shrink-0">+{r.puntos}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400">{result.disclaimer} · Reglas {result.rulesVersion}</p>
        </div>
      )}
    </div>
  )
}
