import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, AlertCircle, Clock, RefreshCw, FileText, ShieldCheck, Lock } from 'lucide-react'
import { api } from '../lib/api'
import type { UserVerificationRecord, ProfessionalType, PatenteLookup } from '../lib/api'
import { confianza, type InfraInfo } from '../lib/api/ola3'

export const GUIA_MODULO = {
  titulo: 'Verificación profesional',
  pasos: [
    'Indica tu rol; si eres agente aduanal, captura la patente y verifícala contra el registro.',
    'Sube las URLs de tus documentos (patente, CSF, RFC) y envía la solicitud; un administrador la revisa.',
    '"Tus datos" explica dónde viven tus datos y qué protecciones están verificadas, pendientes o en evaluación.',
  ],
}

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const TYPES: { value: ProfessionalType; label: string }[] = [
  { value: 'agent_customs', label: 'Agente Aduanal con patente' },
  { value: 'broker', label: 'Apoderado Aduanal' },
  { value: 'importer', label: 'Importador / Empresa' },
  { value: 'consultant', label: 'Consultor de Comex' },
  { value: 'other', label: 'Otro' },
]

export function VerificacionPage() {
  const [v, setV] = useState<UserVerificationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [professionalType, setProfessionalType] = useState<ProfessionalType>('agent_customs')
  const [agentPatente, setAgentPatente] = useState('')
  const [agentSocialName, setAgentSocialName] = useState('')
  const [agentPort, setAgentPort] = useState('')
  const [patenteDocUrl, setPatenteDocUrl] = useState('')
  const [rfcDocUrl, setRfcDocUrl] = useState('')
  const [cspDocUrl, setCspDocUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [lookup, setLookup] = useState<PatenteLookup | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api.verificationMe()
      setV(r.data)
      if (r.data) {
        setProfessionalType((r.data.professionalType as ProfessionalType) ?? 'agent_customs')
        setAgentPatente(r.data.agentPatente ?? '')
        setAgentSocialName(r.data.agentSocialName ?? '')
        setAgentPort(r.data.agentPort ?? '')
        setPatenteDocUrl(r.data.patenteDocUrl ?? '')
        setRfcDocUrl(r.data.rfcDocUrl ?? '')
        setCspDocUrl(r.data.cspDocUrl ?? '')
        setNotes(r.data.notes ?? '')
      }
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function checkPatente() {
    if (!agentPatente) return
    try { const r = await api.verificationLookup(agentPatente); setLookup(r.data) } catch { setLookup(null) }
  }

  async function submit() {
    setError(''); setSubmitting(true)
    try {
      await api.verificationSubmit({
        professionalType,
        agentPatente: agentPatente || undefined,
        agentSocialName: agentSocialName || undefined,
        agentPort: agentPort || undefined,
        patenteDocUrl: patenteDocUrl || undefined,
        rfcDocUrl: rfcDocUrl || undefined,
        cspDocUrl: cspDocUrl || undefined,
        notes: notes || undefined,
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar')
    }
    setSubmitting(false)
  }

  if (loading) return <div className={`${GLASS} rounded-2xl p-6 max-w-3xl mx-auto`}>Cargando…</div>

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {v && <StatusCard v={v}/>}

      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Verificación profesional</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">
          Verifica tu rol profesional para acceso completo a operaciones reales (pre-validador, MVE, audit trail enterprise).
          Sin verificación, el acceso queda limitado a clasificador y cotizador en modo demo.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-slate-600 mb-1 block">¿Cuál es tu rol?</label>
            <select value={professionalType} onChange={e => setProfessionalType(e.target.value as ProfessionalType)}
              className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white">
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {professionalType === 'agent_customs' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
              <div className="md:col-span-2">
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">Número de patente *</label>
                <div className="flex gap-2">
                  <input value={agentPatente} onChange={e => setAgentPatente(e.target.value)}
                    onBlur={checkPatente}
                    placeholder="1101"
                    className="flex-1 text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"/>
                  <button onClick={checkPatente} className="text-[11px] bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800">
                    Verificar
                  </button>
                </div>
                {lookup && (
                  <div className={`mt-2 text-[11px] rounded-lg p-2 ${
                    lookup.exists && lookup.active ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
                    lookup.exists && lookup.expired ? 'bg-rose-50 border border-rose-200 text-rose-800' :
                    'bg-amber-50 border border-amber-200 text-amber-800'
                  }`}>
                    {lookup.exists && lookup.active && (
                      <>✅ Patente válida — <strong>{lookup.socialName}</strong> ({lookup.port}). Vence: {lookup.expiry?.slice(0,10)}</>
                    )}
                    {lookup.exists && lookup.expired && (
                      <>⚠ Patente encontrada pero expirada el {lookup.expiry?.slice(0,10)}.</>
                    )}
                    {!lookup.exists && (
                      <>⚠ Patente no encontrada en el registro CAAAREM. Tu solicitud requerirá verificación manual.</>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">Aduana principal</label>
                <input value={agentPort} onChange={e => setAgentPort(e.target.value)}
                  placeholder="Nuevo Laredo, Veracruz, AICM..."
                  className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2"/>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">Razón social del despacho</label>
                <input value={agentSocialName} onChange={e => setAgentSocialName(e.target.value)}
                  className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2"/>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <DocField label="Copia de patente vigente (PDF/JPG)" value={patenteDocUrl} onChange={setPatenteDocUrl} hint="URL del documento subido a /api/documents"/>
            <DocField label="Constancia de Situación Fiscal (CSF)" value={cspDocUrl} onChange={setCspDocUrl}/>
            <DocField label="Comprobante RFC" value={rfcDocUrl} onChange={setRfcDocUrl}/>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-600 mb-1 block">Notas adicionales</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2"/>
          </div>

          <button onClick={submit} disabled={submitting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>}
            {v?.status === 'rejected' ? 'Resubir documentos' : v?.status === 'submitted' ? 'Actualizar solicitud' : 'Enviar solicitud'}
          </button>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 p-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500"/>
              <p className="text-[12px] text-rose-700">{error}</p>
            </div>
          )}
        </div>
      </div>

      <TusDatos />
    </div>
  )
}

/** Ola 3 — "Tus datos": dónde viven y cómo se protegen. Todo viene del server
 *  (GET /api/verification/confianza); aquí no se afirma nada por cuenta propia. */
function TusDatos() {
  const [info, setInfo] = useState<InfraInfo | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { confianza().then(r => setInfo(r.data)).catch(e => setErr(e instanceof Error ? e.message : 'Error')) }, [])
  const estilo: Record<InfraInfo['afirmaciones'][number]['estado'], { label: string; cls: string }> = {
    verificado: { label: 'verificado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pendiente: { label: 'pendiente de confirmar', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    no_integrado: { label: 'no integrado', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    en_evaluacion: { label: 'en evaluación', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  }
  return (
    <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
      <div className="flex items-center gap-2 mb-1">
        <Lock className="w-5 h-5 text-slate-700"/>
        <h2 className="text-[15px] font-bold text-slate-900">Tus datos</h2>
      </div>
      <p className="text-[12px] text-slate-500 mb-4">Dónde viven y cómo se protegen. Solo afirmamos lo que podemos evidenciar; lo demás aparece como pendiente.</p>
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
      {!info && !err && <p className="text-[12px] text-slate-400">Cargando…</p>}
      {info && (
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-100 bg-white/50 p-3 text-[12px]">
            <p><span className="font-semibold text-slate-800">Proveedor:</span> {info.proveedor.nombre}</p>
            <p><span className="font-semibold text-slate-800">Región:</span> {info.proveedor.region}</p>
            <p className="text-[11px] text-slate-500 mt-1">Evidencia: {info.proveedor.evidencia}</p>
          </div>
          {info.afirmaciones.map(a => (
            <div key={a.clave} className="rounded-xl border border-slate-100 bg-white/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-800">{a.titulo}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${estilo[a.estado].cls}`}>{estilo[a.estado].label}</span>
              </div>
              <p className="text-[12px] text-slate-700 mt-1">{a.detalle}</p>
              <p className="text-[10px] text-slate-500 mt-1">Evidencia: {a.evidencia}</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 text-[12px] pt-1">
            <a href={info.enlaces.avisoPrivacidad} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">Aviso de privacidad →</a>
            <Link to={info.enlaces.auditoria} className="text-emerald-700 hover:underline">Audit trail con hash →</Link>
            <Link to="/defensa" className="text-emerald-700 hover:underline">Certificado de integridad (Defensa) →</Link>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusCard({ v }: { v: UserVerificationRecord }) {
  const map = {
    pending:   { label: 'Sin verificar', icon: AlertCircle, palette: 'bg-orange-50 border-orange-200 text-orange-800' },
    submitted: { label: 'Pendiente de revisión', icon: Clock, palette: 'bg-amber-50 border-amber-200 text-amber-800' },
    verified:  { label: 'Verificado', icon: BadgeCheck, palette: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    rejected:  { label: 'Rechazado', icon: AlertCircle, palette: 'bg-rose-50 border-rose-200 text-rose-800' },
    expired:   { label: 'Patente expirada', icon: AlertCircle, palette: 'bg-rose-50 border-rose-200 text-rose-800' },
  }[v.status]
  const Icon = map.icon
  return (
    <div className={`rounded-2xl border p-4 ${map.palette} flex items-start gap-3`}>
      <Icon className="w-6 h-6 shrink-0 mt-0.5"/>
      <div className="flex-1">
        <p className="text-[13px] font-bold">{map.label}</p>
        {v.status === 'submitted' && v.submittedAt && (
          <p className="text-[11px] mt-0.5">Enviado el {new Date(v.submittedAt).toLocaleString('es-MX')}. Un administrador revisará tu documentación.</p>
        )}
        {v.status === 'verified' && v.verifiedAt && (
          <p className="text-[11px] mt-0.5">Verificado el {new Date(v.verifiedAt).toLocaleString('es-MX')}. Acceso completo activo.</p>
        )}
        {v.status === 'rejected' && v.rejectionReason && (
          <p className="text-[11px] mt-0.5"><strong>Razón:</strong> {v.rejectionReason}</p>
        )}
        {v.status === 'expired' && v.agentExpiry && (
          <p className="text-[11px] mt-0.5">Tu patente expiró el {new Date(v.agentExpiry).toISOString().slice(0, 10)}. Renueva tu verificación.</p>
        )}
      </div>
    </div>
  )
}

function DocField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-slate-600 mb-1 block">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={hint ?? 'URL del documento'}
        className="w-full text-[12px] font-mono border border-slate-200 rounded-lg px-3 py-2"/>
    </div>
  )
}
