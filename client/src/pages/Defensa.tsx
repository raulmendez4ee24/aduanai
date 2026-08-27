/**
 * Defensa (Ola 3) — Cumplimiento + Auditoría en una vista, por operación /
 * clasificación: versión de TIGIE/RGCE usada, reglas que corrieron, quién
 * aprobó qué y cuándo, hash de la bitácora y certificado de integridad PDF
 * (vista imprimible con folio + hash + URL pública de verificación).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck, FileText, CheckCircle2, AlertTriangle, ExternalLink, AlertCircle } from 'lucide-react'
import { defensaListar, defensaPaquete, abrirCertificado, type TipoDefensa, type EntidadDefensa, type PaqueteDefensa } from '../lib/api/ola3'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

export const GUIA_MODULO = {
  titulo: 'Defensa',
  pasos: [
    'Elige el tipo (clasificación, cotización, operación, Pre-Glosa, Risk Scorer) y la entidad; el cliente activo filtra la lista.',
    'El paquete muestra la versión normativa usada vs la vigente hoy, las reglas que corrieron, quién aprobó y cuándo, y la bitácora encadenada con su hash.',
    '"Certificado de integridad" abre una vista imprimible (guardar como PDF) con folio, SHA-256 del paquete y URLs públicas de verificación.',
    'La bitácora completa de la empresa vive en Auditoría. Constancia NOM-151 vía PSC: no integrada.',
  ],
}

const TIPOS: { value: TipoDefensa; label: string }[] = [
  { value: 'classification', label: 'Clasificación' },
  { value: 'quote', label: 'Cotización' },
  { value: 'operation', label: 'Operación / expediente' },
  { value: 'glosa', label: 'Pre-Glosa' },
  { value: 'risk', label: 'Risk Scorer' },
]
const esTipo = (s: string | null): s is TipoDefensa => !!s && TIPOS.some(t => t.value === s)

export function DefensaPage() {
  const [params, setParams] = useSearchParams()
  const tipo: TipoDefensa = esTipo(params.get('tipo')) ? (params.get('tipo') as TipoDefensa) : 'classification'
  const id = params.get('id') ?? ''
  const [lista, setLista] = useState<EntidadDefensa[]>([])
  const [paquete, setPaquete] = useState<PaqueteDefensa | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    defensaListar(tipo).then(r => { if (vivo) setLista(r.data) }).catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'Error') })
    const onCliente = () => defensaListar(tipo).then(r => { if (vivo) setLista(r.data) }).catch(() => undefined)
    window.addEventListener('aduanai:cliente', onCliente)
    return () => { vivo = false; window.removeEventListener('aduanai:cliente', onCliente) }
  }, [tipo])

  useEffect(() => {
    if (!id) { setPaquete(null); return }
    let vivo = true
    setCargando(true); setError('')
    defensaPaquete(tipo, id).then(r => { if (vivo) setPaquete(r.data) })
      .catch(e => { if (vivo) { setPaquete(null); setError(e instanceof Error ? e.message : 'Error') } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [tipo, id])

  const elegir = (t: TipoDefensa, i: string) => setParams(i ? { tipo: t, id: i } : { tipo: t })

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-slate-900">Defensa</h1>
          </div>
          <Link to="/audit" className="text-[12px] text-emerald-700 hover:underline">Bitácora completa (Auditoría) →</Link>
        </div>
        <p className="text-[12px] text-slate-500 mt-1">Por operación o clasificación: qué versión normativa se usó, qué reglas corrieron, quién aprobó y cuándo, y el hash de la bitácora. Todo con su fuente.</p>
        <div className="grid md:grid-cols-[220px_1fr] gap-2 mt-4">
          <select value={tipo} onChange={e => elegir(e.target.value as TipoDefensa, '')} className="text-[12px] border border-slate-200 rounded-lg px-2 py-2 bg-white">
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={id} onChange={e => elegir(tipo, e.target.value)} className="text-[12px] border border-slate-200 rounded-lg px-2 py-2 bg-white min-w-0">
            <option value="">— elige una entidad ({lista.length} recientes{lista.length === 0 ? '; aún no hay' : ''}) —</option>
            {lista.map(e => <option key={e.id} value={e.id}>{e.fecha.slice(0, 10)} · {e.resumen} · {e.status}</option>)}
            {id && !lista.some(e => e.id === id) && <option value={id}>{id}</option>}
          </select>
        </div>
      </div>

      {error && <div className={`${GLASS} rounded-2xl p-4 text-[12px] text-rose-700 flex items-center gap-2`}><AlertCircle className="w-4 h-4" />{error}</div>}
      {cargando && <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Armando paquete…</div>}
      {!id && !cargando && <div className={`${GLASS} rounded-2xl p-8 text-center text-[12px] text-slate-500`}>Elige una entidad para ver su paquete de defensa.</div>}
      {paquete && !cargando && <Paquete p={paquete} />}
    </div>
  )
}

function Paquete({ p }: { p: PaqueteDefensa }) {
  const [errCert, setErrCert] = useState('')
  const v = p.versiones, a = p.aprobaciones, b = p.bitacora, c = p.certificado
  return (
    <>
      <div className={`${GLASS} rounded-2xl p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-slate-900">{p.entidad.resumen}</p>
            <p className="text-[11px] text-slate-500 font-mono">{p.entidad.tipo} · {p.entidad.id} · creada {p.entidad.fecha.replace('T', ' ').slice(0, 19)} UTC</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button onClick={() => { setErrCert(''); abrirCertificado(p.entidad.tipo, p.entidad.id).catch(e => setErrCert(e instanceof Error ? e.message : 'Error')) }}
              className="flex items-center gap-1.5 text-[12px] bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-800"><FileText className="w-3.5 h-3.5" />Certificado de integridad (PDF)</button>
            {errCert && <span className="text-[11px] text-rose-700">{errCert}</span>}
            <span className="text-[10px] text-slate-500">Se abre como vista imprimible: guardar como PDF.</span>
          </div>
        </div>
        <div className="mt-3 grid md:grid-cols-3 gap-2 text-[11px]">
          <Dato k="Folio" v={<b className="font-mono">{c.folio}</b>} />
          <Dato k="Hash del paquete (SHA-256)" v={<span className="font-mono break-all">{c.hashPaquete}</span>} />
          <Dato k="Cadena de bitácora" v={b.cadena.valid ? <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />íntegra · {b.cadena.checkedCount} registros</span> : <span className="text-rose-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />ROTA en {b.cadena.brokenAt}</span>} />
        </div>
      </div>

      <Seccion titulo="Versión normativa usada" fuente={v.fuente}>
        <div className="grid md:grid-cols-2 gap-2 text-[11px]">
          <Dato k="TIGIE usada" v={v.usadas.tigie ?? <SinDato />} />
          <Dato k="TIGIE vigente hoy" v={v.vigentesHoy.tigie} />
          <Dato k="LIGIE usada" v={v.usadas.ligie ?? <SinDato />} />
          <Dato k="LIGIE vigente hoy" v={v.vigentesHoy.ligie} />
          <Dato k="RGCE usada" v={v.usadas.rgce ?? <SinDato />} />
          <Dato k="RGCE vigente hoy" v={v.vigentesHoy.rgce ?? <SinDato />} />
          <Dato k="Acuerdo NOMs / T-MEC usados" v={`${v.usadas.acuerdoNoms ?? '—'} / ${v.usadas.tmec ?? '—'}`} />
          <Dato k="¿Desactualizada respecto a hoy?" v={v.desactualizada === null ? <SinDato texto="sin versión registrada en la entidad" /> : v.desactualizada ? <span className="text-amber-700 font-semibold">sí — revisar antes de despachar</span> : <span className="text-emerald-700">no</span>} />
          {v.usadas.consultHash && <Dato k="consultHash" v={<a href={`/verify/${v.usadas.consultHash}`} target="_blank" rel="noreferrer" className="font-mono text-emerald-700 hover:underline break-all">{v.usadas.consultHash}</a>} />}
        </div>
        {v.snapshots.length > 0 && (
          <details className="mt-2 text-[11px]"><summary className="cursor-pointer text-slate-600">Snapshots normativos activos ({v.snapshots.length})</summary>
            <ul className="mt-1 ml-4 list-disc text-slate-600">{v.snapshots.map(s => <li key={s.type + s.version}><b>{s.type}</b> {s.version} · DOF {s.publishDate} · vigente {s.effectiveDate}{s.source ? <> · <a href={s.source} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">fuente</a></> : null}</li>)}</ul>
          </details>
        )}
      </Seccion>

      <Seccion titulo="Reglas que corrieron" fuente={p.reglas.fuente}>
        <p className="text-[12px] text-slate-700 mb-2">{p.reglas.descripcion}</p>
        {p.reglas.datos ? <pre className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap">{JSON.stringify(p.reglas.datos, null, 2)}</pre> : <SinDato />}
      </Seccion>

      <Seccion titulo="Quién aprobó qué y cuándo" fuente={a.fuente}>
        <div className="grid md:grid-cols-2 gap-2 text-[11px]">
          <Dato k="Estado" v={a.status ?? <SinDato />} />
          <Dato k="Creado por" v={a.creadoPor ? `${a.creadoPor.nombre} <${a.creadoPor.email}>` : <SinDato />} />
          <Dato k="Aprobado por" v={a.aprobadoPor ? `${a.aprobadoPor.nombre} <${a.aprobadoPor.email}>` : <SinDato texto="sin aprobación registrada" />} />
          <Dato k="Fecha de aprobación" v={a.approvedAt ? `${a.approvedAt.replace('T', ' ').slice(0, 19)} UTC` : <SinDato />} />
        </div>
        {a.permisos.length > 0 && (
          <details className="mt-2 text-[11px]"><summary className="cursor-pointer text-slate-600">Cambios de roles/permisos de los involucrados ({a.permisos.length})</summary>
            <ul className="mt-1 ml-4 list-disc text-slate-600">{a.permisos.map((x, i) => <li key={i}>{x.createdAt.replace('T', ' ').slice(0, 19)} · {x.action}{x.targetUserId ? ` → ${x.targetUserId}` : ''}</li>)}</ul>
          </details>
        )}
      </Seccion>

      <Seccion titulo="Bitácora encadenada" fuente={b.fuente}>
        {b.eventos.length === 0 ? <SinDato texto="sin eventos de bitácora ligados a esta entidad" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-left border-b border-slate-100"><th className="py-1.5 pr-3 text-slate-500 font-medium">Fecha (UTC)</th><th className="py-1.5 pr-3 text-slate-500 font-medium">Acción</th><th className="py-1.5 pr-3 text-slate-500 font-medium">Endpoint</th><th className="py-1.5 pr-3 text-slate-500 font-medium">Hash</th><th className="py-1.5 pr-3 text-slate-500 font-medium">Anterior</th></tr></thead>
              <tbody>{b.eventos.map(e => (
                <tr key={e.id} className="border-b border-slate-100/60">
                  <td className="py-1.5 pr-3 text-slate-600">{e.createdAt.replace('T', ' ').slice(0, 19)}</td>
                  <td className="py-1.5 pr-3">{e.action}</td>
                  <td className="py-1.5 pr-3 text-slate-500 font-mono">{e.endpoint ?? '—'}</td>
                  <td className="py-1.5 pr-3 font-mono"><a href={`/verify/audit/${e.hash}`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">{e.hash.slice(0, 16)}…</a></td>
                  <td className="py-1.5 pr-3 font-mono text-slate-400">{e.prevHash ? `${e.prevHash.slice(0, 12)}…` : 'génesis'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-600 mt-2">Último hash de la entidad: <span className="font-mono break-all">{b.ultimoHash ?? '—'}</span> · último hash del tenant: <span className="font-mono">{b.ultimoHashTenant ? `${b.ultimoHashTenant.slice(0, 16)}…` : '—'}</span></p>
      </Seccion>

      <Seccion titulo="Verificación pública y sellado" fuente="routes/verification · routes/audit · services/timestamp">
        <div className="grid md:grid-cols-2 gap-2 text-[11px]">
          <Dato k="Consulta IA" v={c.verifyConsultUrl ? <a href={c.verifyConsultUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline inline-flex items-center gap-1">{c.verifyConsultUrl}<ExternalLink className="w-3 h-3" /></a> : <SinDato texto="sin consultHash" />} />
          <Dato k="Último evento de bitácora" v={c.verifyAuditUrl ? <a href={c.verifyAuditUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline inline-flex items-center gap-1 break-all">{c.verifyAuditUrl}<ExternalLink className="w-3 h-3" /></a> : <SinDato texto="sin eventos con hash" />} />
          <Dato k="NOM-151" v={<span className="text-amber-700">{c.nom151}</span>} />
          <Dato k="Sellado" v={c.sellado} />
        </div>
      </Seccion>
    </>
  )
}

function Seccion({ titulo, fuente, children }: { titulo: string; fuente: string; children: ReactNode }) {
  return (
    <section className={`${GLASS} rounded-2xl p-5`}>
      <h2 className="text-[13px] font-semibold text-slate-900 mb-2">{titulo}</h2>
      {children}
      <p className="text-[10px] text-slate-400 mt-3 border-t border-slate-100 pt-2">Fuente: {fuente}</p>
    </section>
  )
}
function Dato({ k, v }: { k: string; v: ReactNode }) {
  return <div className="bg-white/50 border border-slate-100 rounded-lg px-3 py-2 min-w-0"><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p><div className="text-slate-800 break-words">{v}</div></div>
}
const SinDato = ({ texto }: { texto?: string }) => <span className="text-slate-400 italic">{texto ?? 'sin dato'}</span>
