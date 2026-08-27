/**
 * Portal público para proveedores (Ola 2 origen-cuotas): /proveedor/:token
 * Sin cuenta. Solo ve y sube el certificado de SU solicitud (token único).
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck, Upload, AlertTriangle, FileText } from 'lucide-react'
import { origenApi, archivoABase64, type VistaPortal } from '../../lib/api/origen'

export function PortalProveedorPage() {
  const { token = '' } = useParams()
  const [vista, setVista] = useState<VistaPortal | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vigenciaDesde, setVigenciaDesde] = useState('')
  const [vigenciaHasta, setVigenciaHasta] = useState('')
  const [numero, setNumero] = useState('')
  const [busy, setBusy] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    setLoading(true)
    origenApi.portalVer(token)
      .then(r => { setVista(r.data); setVigenciaDesde(r.data.vigenciaDesde ?? ''); setVigenciaHasta(r.data.vigenciaHasta ?? '') })
      .catch(e => setError(e instanceof Error ? e.message : 'Enlace inválido o vencido'))
      .finally(() => setLoading(false))
  }, [token])

  async function subir() {
    if (!archivo || !vigenciaHasta) return
    setBusy(true); setError('')
    try {
      if (archivo.size > 5 * 1024 * 1024) throw new Error('El archivo supera 5 MB')
      const b64 = await archivoABase64(archivo)
      const r = await origenApi.portalSubir(token, { archivoBase64: b64, mimeType: archivo.type || 'application/pdf', nombreArchivo: archivo.name, vigenciaDesde: vigenciaDesde || undefined, vigenciaHasta, numeroCertificado: numero || undefined })
      setVista(r.data); setListo(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo subir el archivo') }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 md:p-10">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-lg font-bold text-slate-900">Certificación de origen — portal de proveedores</h1>
        </div>
        {loading && <p className="text-[13px] text-slate-500">Cargando…</p>}
        {!loading && !vista && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-[13px] text-rose-800 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5"/> <span>{error || 'Enlace inválido o vencido.'} Pide a su cliente un nuevo enlace.</span></div>
        )}
        {vista && (
          <>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-[13px] text-slate-700 space-y-1">
              <p><strong>{vista.solicitante}</strong> solicita a <strong>{vista.proveedorNombre}</strong> ({vista.proveedorPais}) la certificación de origen bajo <strong>{vista.tratado}</strong>.</p>
              {vista.producto && <p>Mercancía: {vista.producto.productCode} — {vista.producto.description}</p>}
              {vista.fractionCode && <p>Fracción: <span className="font-mono">{vista.fractionCode}</span></p>}
              <p>Estado: <span className="font-semibold">{vista.estado}</span>{vista.recibidoAt ? ` · recibido ${vista.recibidoAt.slice(0, 10)}` : ''}{vista.vigenciaHasta ? ` · vigente hasta ${vista.vigenciaHasta}` : ''}</p>
            </div>
            {listo ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-[13px] text-emerald-800 flex items-start gap-2"><FileText className="w-4 h-4 mt-0.5"/> <span>Certificación recibida. Gracias — su cliente ya puede consultarla. Puede cerrar esta página.</span></div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12px] text-slate-600">Suba la certificación de origen (PDF, JPG o PNG, máx. 5 MB) e indique su vigencia. Bajo el T-MEC la certificación es de formato libre con los 9 elementos del Anexo 5-A y puede amparar hasta 12 meses.</p>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Archivo *</span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-[12px] mt-1"/>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className="block"><span className="text-[10px] uppercase tracking-wider text-slate-500">Vigente desde</span><input type="date" value={vigenciaDesde} onChange={e => setVigenciaDesde(e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1"/></label>
                  <label className="block"><span className="text-[10px] uppercase tracking-wider text-slate-500">Vigente hasta *</span><input type="date" value={vigenciaHasta} onChange={e => setVigenciaHasta(e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1"/></label>
                  <label className="block"><span className="text-[10px] uppercase tracking-wider text-slate-500">No. de certificado</span><input value={numero} onChange={e => setNumero(e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1"/></label>
                </div>
                {error && <p className="text-[12px] text-rose-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/> {error}</p>}
                <button onClick={subir} disabled={busy || !archivo || !vigenciaHasta} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full">
                  <Upload className="w-4 h-4"/> {busy ? 'Subiendo…' : 'Enviar certificación'}
                </button>
              </div>
            )}
          </>
        )}
        <p className="text-[10px] text-slate-400">Este enlace es personal y solo da acceso a esta solicitud. ADUANAI no solicita contraseñas por este medio.</p>
      </div>
    </div>
  )
}
