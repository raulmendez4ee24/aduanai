/**
 * Cierre mensual con candado: lista de periodos sellados (hash), estado del
 * candado y cierre de un periodo con confirmación explícita.
 */
import { useEffect, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { anexo24Api, type CierreResumen } from '../../lib/api/anexo24'
import { Badge, Button, Card, DataTable, EmptyState, Input, Textarea } from '../ui'
import { Aviso, Dialogo, fmtFecha, fmtNum, mensajeDe, periodoAnterior } from './comunes'

export function CierresTab({ puedeCerrar }: { puedeCerrar: boolean }) {
  const [cierres, setCierres] = useState<CierreResumen[] | null>(null)
  const [ultimo, setUltimo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [abrirCierre, setAbrirCierre] = useState(false)
  const [form, setForm] = useState({ periodo: periodoAnterior(), notas: '', confirmar: '' })
  const [cargando, setCargando] = useState(false)

  async function cargar() {
    try { const r = await anexo24Api.cierres(); setCierres(r.data); setUltimo(r.ultimoPeriodoCerrado) }
    catch (e) { setError(mensajeDe(e)); setCierres([]) }
  }
  useEffect(() => { cargar() }, [])

  async function cerrar() {
    if (form.confirmar !== form.periodo) { setError(`Escribe ${form.periodo} para confirmar`); return }
    setCargando(true); setError('')
    try {
      await anexo24Api.cerrarPeriodo(form.periodo, form.notas || undefined)
      setAbrirCierre(false); setForm({ periodo: periodoAnterior(), notas: '', confirmar: '' })
      await cargar()
    } catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }

  return (
    <div className="space-y-4 font-sello-ui">
      <Card denso header={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {ultimo ? <Lock className="w-5 h-5 text-petroleo" aria-hidden /> : <LockOpen className="w-5 h-5 text-tinta-suave" aria-hidden />}
            <div>
              <p className="text-base font-medium text-tinta">{ultimo ? `Inventario sellado hasta ${ultimo}` : 'Ningún periodo cerrado'}</p>
              <p className="text-13 text-tinta-suave">{ultimo ? 'Ningún movimiento (alta, descargo, traslado) puede fecharse dentro de un periodo cerrado ni antes.' : 'Cierra el mes concluido para congelar saldos con hash SHA-256.'}</p>
            </div>
          </div>
          {puedeCerrar && <Button onClick={() => setAbrirCierre(true)}>Cerrar un periodo</Button>}
        </div>
      }>
        {error && !abrirCierre && <div className="mb-3"><Aviso tono="carmin">{error}</Aviso></div>}
        {cierres === null ? <p className="text-sm text-tinta-suave">Cargando…</p> : cierres.length === 0 ? (
          <EmptyState icono={LockOpen} titulo="Sin cierres mensuales" descripcion="Al cerrar un periodo se guardan los saldos por parte y por pedimento al último día del mes y su hash." accion={puedeCerrar ? { label: 'Cerrar un periodo', onClick: () => setAbrirCierre(true) } : undefined} />
        ) : (
          <DataTable
            columnas={[
              { key: 'periodo', header: 'Periodo', mono: true, render: c => <span className="flex items-center gap-2">{c.periodo} <Badge tono="petroleo">cerrado</Badge></span> },
              { key: 'fecha', header: 'Cerrado', mono: true, render: c => fmtFecha(c.cerradoAt) },
              { key: 'lotes', header: 'Lotes', align: 'right', mono: true, render: c => fmtNum(c.totales?.lotes ?? null, 0) },
              { key: 'partes', header: 'Partes', align: 'right', mono: true, render: c => fmtNum(c.totales?.partes ?? null, 0) },
              { key: 'saldo', header: 'Saldo total', align: 'right', mono: true, render: c => fmtNum(c.totales?.saldo ?? null) },
              { key: 'hash', header: 'Hash SHA-256', mono: true, render: c => <span title={c.hash ?? ''}>{c.hash ? `${c.hash.slice(0, 16)}…` : '—'}</span> },
              { key: 'notas', header: 'Notas', render: c => c.notas ?? '—' },
            ]}
            filas={cierres}
            filaKey={c => c.id}
          />
        )}
      </Card>

      {abrirCierre && (
        <Dialogo titulo="Cerrar periodo mensual" onClose={() => setAbrirCierre(false)}>
          <div className="space-y-4">
            <Aviso>Cerrar es irreversible desde la aplicación: el sistema rechazará cualquier movimiento fechado en {form.periodo || 'ese periodo'} o antes. Verifica que todas las entradas y descargos del mes ya estén capturados.</Aviso>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Periodo (YYYY-MM)" requerido mono value={form.periodo} onChange={e => setForm({ ...form, periodo: e.target.value })} placeholder="2026-07" />
              <Input label={`Escribe ${form.periodo || 'el periodo'} para confirmar`} requerido mono value={form.confirmar} onChange={e => setForm({ ...form, confirmar: e.target.value })} />
            </div>
            <Textarea label="Notas del cierre" rows={2} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
            {error && <Aviso tono="carmin">{error}</Aviso>}
            <div className="flex justify-end gap-2">
              <Button variante="secundario" onClick={() => setAbrirCierre(false)}>Cancelar</Button>
              <Button variante="destructivo" onClick={cerrar} loading={cargando} disabled={form.confirmar !== form.periodo}>Sellar {form.periodo}</Button>
            </div>
          </div>
        </Dialogo>
      )}
    </div>
  )
}
