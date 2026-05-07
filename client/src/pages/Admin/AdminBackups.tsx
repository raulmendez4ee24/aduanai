import { useEffect, useState } from 'react'
import { Database, AlertTriangle, RefreshCw, Trash2, Settings, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import type { BackupRecord, BackupConfig, RestoreLogRecord } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'backups' | 'restores' | 'config'

export function AdminBackupsPage() {
  const [tab, setTab] = useState<Tab>('backups')
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Backups y Recuperación</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">pg_dump → AES-256-GCM → SHA-256 → storage. Retención: daily 30d, weekly 84d, monthly 365d.</p>
        <div className="flex gap-2 flex-wrap">
          {(['backups', 'restores', 'config'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {t === 'backups' ? 'Backups' : t === 'restores' ? 'Restauraciones' : 'Configuración'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'backups' && <BackupsTab/>}
      {tab === 'restores' && <RestoresTab/>}
      {tab === 'config' && <ConfigTab/>}
    </div>
  )
}

function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function BackupsTab() {
  const [items, setItems] = useState<BackupRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    try { const r = await api.backupsList(); setItems(r.data) } catch {}
  }
  useEffect(() => { load() }, [])

  async function runBackup(type: 'manual' | 'daily' | 'weekly' | 'monthly') {
    setBusy(true)
    try { await api.backupRun(type); await load() } catch {}
    setBusy(false)
  }

  async function restore(id: string, type: 'test' | 'full') {
    if (type === 'full') {
      const reason = prompt('Razón del restore producción (CUIDADO: SOBREESCRIBE LA DB):')
      if (!reason || reason.length < 5) return
      const confirm1 = prompt('Escribe "RESTORE_PRODUCTION" para confirmar:')
      if (confirm1 !== 'RESTORE_PRODUCTION') { alert('Confirmación incorrecta'); return }
      setBusy(true)
      try {
        const r = await api.backupRestore(id, 'full', reason, 'RESTORE_PRODUCTION')
        alert(r.data.success ? 'Restore exitoso' : `Falló: ${r.data.error}`)
      } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
      setBusy(false)
    } else {
      setBusy(true)
      try {
        const r = await api.backupRestore(id, 'test', 'verificación')
        alert(r.data.success ? 'Test restore OK' : `Falló: ${r.data.error}`)
      } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
      setBusy(false)
    }
  }

  async function del(id: string) {
    if (!confirm('¿Eliminar backup?')) return
    setBusy(true)
    try { await api.backupDelete(id); await load() } catch {}
    setBusy(false)
  }

  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => runBackup('manual')} disabled={busy} className="flex items-center gap-1 text-[11px] bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-full">
          <Plus className="w-3 h-3"/> Backup ahora
        </button>
        <button onClick={load} className="text-[11px] bg-white border border-slate-200 px-3 py-1.5 rounded-full hover:bg-slate-50 flex items-center gap-1">
          <RefreshCw className="w-3 h-3"/> Refrescar
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-slate-400">Sin backups aún. Click "Backup ahora" para crear el primero.</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Fecha</th>
              <th className="py-2 text-slate-500 font-medium">Tipo</th>
              <th className="py-2 text-slate-500 font-medium">Estado</th>
              <th className="py-2 text-slate-500 font-medium text-right">Tamaño</th>
              <th className="py-2 text-slate-500 font-medium">Expira</th>
              <th className="py-2 text-slate-500 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map(b => (
              <>
                <tr key={b.id} onClick={() => setExpandedId(expandedId === b.id ? null : b.id)} className="border-b border-slate-100/50 hover:bg-slate-50 cursor-pointer">
                  <td className="py-2 font-mono">{new Date(b.startedAt).toLocaleString('es-MX')}</td>
                  <td className="py-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100">{b.type.toUpperCase()}</span></td>
                  <td className="py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    b.status === 'success' ? 'bg-emerald-100 text-emerald-800' :
                    b.status === 'failed' ? 'bg-rose-100 text-rose-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>{b.status.toUpperCase()}</span></td>
                  <td className="py-2 text-right font-mono">{fmtBytes(b.sizeBytes)}</td>
                  <td className="py-2 text-slate-500 font-mono">{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString('es-MX') : '—'}</td>
                  <td className="py-2 text-right">
                    <div className="inline-flex gap-1" onClick={e => e.stopPropagation()}>
                      {b.status === 'success' && (
                        <>
                          <button onClick={() => restore(b.id, 'test')} disabled={busy} className="text-[10px] bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white px-2 py-1 rounded">Test</button>
                          <button onClick={() => restore(b.id, 'full')} disabled={busy} className="text-[10px] bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white px-2 py-1 rounded">Restore</button>
                        </>
                      )}
                      <button onClick={() => del(b.id)} disabled={busy} className="text-[10px] text-slate-500 hover:text-rose-600 px-2 py-1"><Trash2 className="w-3 h-3"/></button>
                    </div>
                  </td>
                </tr>
                {expandedId === b.id && (
                  <tr><td colSpan={6} className="bg-slate-50/60 py-2 px-3 text-[10px] font-mono text-slate-600">
                    <div>id: {b.id}</div>
                    <div>storage: {b.storageProvider} · key: {b.storageKey ?? '—'}</div>
                    <div>checksum: {b.checksumSHA256 ?? '—'}</div>
                    {b.errorMessage && <div className="text-rose-700 mt-1">error: {b.errorMessage}</div>}
                    {b.durationMs && <div>duración: {b.durationMs} ms</div>}
                  </td></tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RestoresTab() {
  const [items, setItems] = useState<RestoreLogRecord[]>([])
  useEffect(() => { api.backupRestoreLog().then(r => setItems(r.data)).catch(() => setItems([])) }, [])
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <p className="text-[12px] font-semibold text-slate-700 mb-3">Historial de restauraciones</p>
      {items.length === 0 ? <p className="text-[12px] text-slate-400">Sin restauraciones</p> : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="py-2 text-slate-500 font-medium">Fecha</th>
              <th className="py-2 text-slate-500 font-medium">Tipo</th>
              <th className="py-2 text-slate-500 font-medium">Estado</th>
              <th className="py-2 text-slate-500 font-medium">Por</th>
              <th className="py-2 text-slate-500 font-medium">Razón</th>
              <th className="py-2 text-slate-500 font-medium">Backup origen</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-b border-slate-100/50">
                <td className="py-2 font-mono">{new Date(r.startedAt).toLocaleString('es-MX')}</td>
                <td className="py-2">{r.type}</td>
                <td className="py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.status === 'success' ? 'bg-emerald-100 text-emerald-800' : r.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{r.status}</span></td>
                <td className="py-2">{r.triggeredBy}</td>
                <td className="py-2 text-slate-600">{r.reason ?? '—'}</td>
                <td className="py-2 font-mono text-slate-500">{r.backup.type} · {r.backup.completedAt?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ConfigTab() {
  const [config, setConfig] = useState<BackupConfig | null>(null)
  useEffect(() => { api.backupConfig().then(r => setConfig(r.data)).catch(() => setConfig(null)) }, [])
  if (!config) return <div className={`${GLASS} rounded-2xl p-6 text-[12px] text-slate-500`}>Cargando…</div>
  return (
    <div className={`${GLASS} rounded-2xl p-5 space-y-3`}>
      <div className={`rounded-xl border p-3 ${config.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        <div className="flex items-center gap-2">
          {config.ok ? <Settings className="w-4 h-4"/> : <AlertTriangle className="w-4 h-4"/>}
          <p className="text-[12px] font-bold">{config.ok ? 'Configuración OK' : 'Configuración con observaciones'}</p>
        </div>
        <p className="text-[11px] mt-1">{config.details}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
        <Card label="Storage" value={config.provider}/>
        <Card label="Encryption key" value={config.encryptionKeyConfigured ? '✓ Configurada' : '⚠ Efímera'}/>
        <Card label="Backup dir" value={config.backupDir}/>
        <Card label="Email alertas" value={config.operationsEmail}/>
        <Card label="Retención daily" value={`${config.retention.daily}d`}/>
        <Card label="Retención weekly/monthly" value={`${config.retention.weekly}d / ${config.retention.monthly}d`}/>
      </div>
      {config.lastSuccessful && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px]">
          <p>Último backup exitoso: <strong>{config.lastSuccessful.type}</strong> el {new Date(config.lastSuccessful.completedAt).toLocaleString('es-MX')}</p>
        </div>
      )}
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-[12px] font-mono text-slate-900 mt-0.5 truncate">{value}</p>
    </div>
  )
}
