/**
 * Configuración → Digest semanal (Operación 2026-08) — /settings/digest.
 * Elige el canal (email / WhatsApp / ambos / apagado), ve la vista previa real
 * agrupada por cliente y envía ahora. Si el canal no está configurado en el
 * servidor o no hay destinatarios, el resultado lo dice: no se promete envío.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Send, AlertTriangle } from 'lucide-react'
import { Button, Card, Badge } from '../../components/ui'
import { regulatorioApi, type Digest, type CanalDigest, type ResultadoEnvioDigest } from '../../lib/api/regulatorio'

const fecha = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-MX') : 'nunca'

export function DigestSettingsPage() {
  const navigate = useNavigate()
  const [digest, setDigest] = useState<Digest | null>(null)
  const [canal, setCanal] = useState<CanalDigest | null>(null)
  const [ultimo, setUltimo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoEnvioDigest | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function cargar() {
    setError(null)
    try { const r = await regulatorioApi.digestPreview(); setDigest(r.data.digest); setCanal(r.data.canal); setUltimo(r.data.ultimoEnvioAt) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la vista previa') }
  }
  useEffect(() => { cargar() }, [])

  async function guardarCanal(c: CanalDigest | null) {
    setError(null)
    try { const r = await regulatorioApi.digestCanal(c); setCanal(r.data.digestSemanalCanal as CanalDigest | null) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar (requiere permiso de configuración)') }
  }
  async function enviar() {
    setEnviando(true); setError(null); setResultado(null)
    try { const r = await regulatorioApi.digestEnviarAhora(); setResultado(r.data); await cargar() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar') }
    setEnviando(false)
  }

  const opciones: { v: CanalDigest | null; label: string }[] = [{ v: null, label: 'Apagado' }, { v: 'email', label: 'Email' }, { v: 'whatsapp', label: 'WhatsApp' }, { v: 'ambos', label: 'Ambos' }]

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Card header={<div className="flex items-center gap-2"><Mail className="w-[18px] h-[18px] text-petroleo" strokeWidth={1.5} /><h1 className="font-sello-display text-lg text-tinta">Digest semanal</h1></div>}>
        <p className="text-sm text-tinta-suave">Cada lunes: alertas nuevas, vencimientos ≤30 días y obligaciones del calendario, agrupado por cliente/RFC. Va a los administradores de la empresa (email verificado / teléfono en perfil).</p>
        <div className="mt-3 flex gap-2 flex-wrap items-center">
          <span className="text-sm text-tinta">Canal:</span>
          {opciones.map(o => (
            <button key={o.label} type="button" onClick={() => guardarCanal(o.v)}
              className={`text-sm px-3 py-1 rounded-sello-sm border ${canal === o.v ? 'bg-petroleo text-white border-petroleo' : 'bg-superficie text-tinta border-linea hover:bg-papel-2'}`}>{o.label}</button>
          ))}
          <span className="ml-auto text-[12px] text-tinta-suave">Último envío: {fecha(ultimo)}</span>
        </div>
        <div className="mt-3 flex gap-2 items-center">
          <Button variante="primario" tamano="sm" loading={enviando} onClick={enviar}><Send className="w-4 h-4" /> Enviar ahora</Button>
          <Button variante="ghost" tamano="sm" onClick={() => navigate('/alertas')}>Ver alertas</Button>
        </div>
        {error && <p className="mt-3 text-sm text-carmin flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {error}</p>}
        {resultado && (
          <div className={`mt-3 rounded-sello-sm border p-3 text-sm ${resultado.enviado ? 'border-petroleo bg-petroleo-suave/40' : 'border-ambar bg-ambar-suave/40'}`}>
            <p className="text-tinta font-medium">{resultado.enviado ? 'Enviado' : `No enviado — ${resultado.motivo}`}</p>
            {resultado.email.intentado && <p className="text-tinta-suave">Email: {resultado.email.destinatarios.join(', ') || resultado.email.error}</p>}
            {!resultado.email.intentado && resultado.email.error && <p className="text-tinta-suave">Email: {resultado.email.error}</p>}
            {resultado.whatsapp.intentado && <p className="text-tinta-suave">WhatsApp: {resultado.whatsapp.destinatarios.join(', ') || resultado.whatsapp.error}</p>}
            {!resultado.whatsapp.intentado && resultado.whatsapp.error && <p className="text-tinta-suave">WhatsApp: {resultado.whatsapp.error}</p>}
            <p className="text-[12px] text-tinta-suave">El resumen quedó guardado como alerta "Resumen semanal" aunque no se haya enviado.</p>
          </div>
        )}
      </Card>

      <Card header={<div className="flex items-center gap-2 flex-wrap"><h2 className="font-sello-display text-base text-tinta">Vista previa</h2>
        {digest && <><Badge tono="neutral">{digest.periodo.desde} → {digest.periodo.hasta}</Badge><Badge tono="carmin">{digest.totales.alertas} alertas</Badge><Badge tono="ambar">{digest.totales.vencimientos} vencimientos</Badge><Badge tono="petroleo">{digest.totales.obligaciones} obligaciones</Badge></>}</div>}>
        {!digest ? <p className="text-sm text-tinta-suave">Cargando…</p> : digest.clientes.length === 0 ? <p className="text-sm text-tinta-suave">Sin novedades esta semana: nada que enviar.</p> : (
          <div className="space-y-4">
            {digest.clientes.map(c => (
              <div key={c.clienteId ?? 'sin'} className="rounded-sello-sm border border-linea p-3">
                <p className="text-sm font-medium text-tinta">{c.nombre} {c.rfc && <span className="font-mono text-[12px] text-tinta-suave">{c.rfc}</span>}</p>
                {c.alertas.length > 0 && <ul className="mt-1 text-sm text-tinta list-disc pl-5">{c.alertas.slice(0, 8).map(a => <li key={a.id}><span className="text-[11px] uppercase text-tinta-suave">{a.severity}</span> {a.title}{a.estimatedImpactMXN != null ? ` — $${Math.round(Math.abs(a.estimatedImpactMXN)).toLocaleString('es-MX')} MXN` : ''}</li>)}</ul>}
                {c.vencimientos.length > 0 && <ul className="mt-1 text-sm text-tinta list-disc pl-5">{c.vencimientos.slice(0, 8).map(v => <li key={v.id}>Vence en {v.dias} d: pedimento {v.pedimento}, {v.fractionCode}, saldo {v.saldo} {v.unit}</li>)}</ul>}
                {c.obligaciones.length > 0 && <ul className="mt-1 text-sm text-tinta list-disc pl-5">{c.obligaciones.slice(0, 8).map(o => <li key={o.id}>{o.estado === 'vencida' ? 'VENCIDA' : `${o.dias} d`}: {o.titulo}</li>)}</ul>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
