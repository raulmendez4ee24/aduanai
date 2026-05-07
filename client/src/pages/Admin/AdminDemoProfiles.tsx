import { useEffect, useState } from 'react'
import { Briefcase, RefreshCw, Users, Package, Globe } from 'lucide-react'
import { api } from '../../lib/api'
import type { DemoProfile } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const SECTOR_ICONS: Record<string, string> = {
  automotive: '🚗',
  textile: '👕',
  electronics: '💻',
  food: '🍫',
  pharma: '💊',
}

export function AdminDemoProfilesPage() {
  const [profiles, setProfiles] = useState<DemoProfile[]>([])
  const [tenantId, setTenantId] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdInfo, setCreatedInfo] = useState<{ created: { profileCode: string; tenantId: string; email: string }[]; password: string } | null>(null)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    api.demoProfiles().then(r => setProfiles(r.data)).catch(() => setProfiles([]))
    const t = localStorage.getItem('aduanai_tenantId')
    if (t) setTenantId(t)
  }, [])

  async function loadProfile(p: DemoProfile) {
    if (!tenantId) { alert('Tenant ID requerido'); return }
    if (!confirm(`Cargar demo ${p.industryName} en tenant ${tenantId}? Esto borrará los datos demo actuales.`)) return
    setBusy(true); setFeedback('')
    try {
      const r = await api.demoProfileLoad(p.industryCode, tenantId)
      setFeedback(`✅ ${p.industryName} cargado: ${r.data.imports} imports, ${r.data.classifications} clasificaciones, ${r.data.quotes} quotes, ${r.data.alerts} alertas`)
    } catch (e) { setFeedback(`❌ ${e instanceof Error ? e.message : 'Error'}`) }
    setBusy(false)
  }

  async function createAllTenants() {
    if (!confirm('Crear los 5 tenants demo (uno por sector) con sus datasets?')) return
    setBusy(true); setFeedback('')
    try {
      const r = await api.demoProfileCreateAll()
      setCreatedInfo(r.data)
      setFeedback(`✅ ${r.data.created.length} tenants demo creados`)
    } catch (e) { setFeedback(`❌ ${e instanceof Error ? e.message : 'Error'}`) }
    setBusy(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6 md:p-8`}>
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="w-5 h-5 text-emerald-500"/>
          <h1 className="text-xl font-bold text-slate-900">Perfiles Demo por Sector</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">
          Cinco perfiles industriales pre-configurados. Selecciona el más relevante para tu prospecto.
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          <input value={tenantId} onChange={e => setTenantId(e.target.value)}
            placeholder="Tenant ID destino"
            className="flex-1 min-w-[200px] text-[13px] font-mono border border-slate-200 rounded-lg px-3 py-2"/>
          <button onClick={createAllTenants} disabled={busy}
            className="text-[12px] bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white px-4 py-2 rounded-full flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5"/> Crear 5 tenants demo
          </button>
        </div>
        {feedback && <p className={`mt-3 text-[12px] ${feedback.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>{feedback}</p>}
      </div>

      {createdInfo && (
        <div className={`${GLASS} rounded-2xl p-5 bg-violet-50/30 border-violet-100`}>
          <p className="text-[12px] font-semibold text-violet-800 mb-2">Tenants demo creados (password: <code>{createdInfo.password}</code>)</p>
          <ul className="space-y-1 text-[11px] font-mono">
            {createdInfo.created.map(c => (
              <li key={c.tenantId} className="text-slate-700">{c.email} · tenant: {c.tenantId}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {profiles.map(p => (
          <ProfileCard key={p.id} p={p} onLoad={() => loadProfile(p)} disabled={busy || !tenantId}/>
        ))}
      </div>
    </div>
  )
}

function ProfileCard({ p, onLoad, disabled }: { p: DemoProfile; onLoad: () => void; disabled: boolean }) {
  return (
    <div className={`${GLASS} rounded-2xl p-5`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-[28px]">{SECTOR_ICONS[p.industryCode] ?? '📦'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-bold text-slate-900">{p.industryName}</p>
            {p.isDefault && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">DEFAULT</span>}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{p.description}</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3 text-[11px]">
        <Row label="Razón social" value={p.companyName}/>
        <Row label="RFC" value={p.rfc} mono/>
        <Row label="Sector" value={p.primarySector}/>
        <Row label="IMMEX" value={p.immexModality ?? 'Importación definitiva'}/>
        <Row label="Certificaciones" value={(p.certifications ?? []).join(', ') || '—'}/>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        <span className="text-[9px] uppercase tracking-wider text-slate-500">Capítulos:</span>
        {p.fractionsRange.chapters.slice(0, 8).map(c => (
          <span key={c} className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{c}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        <span className="text-[9px] uppercase tracking-wider text-slate-500"><Globe className="w-3 h-3 inline"/> Países:</span>
        {p.countriesOfOrigin.slice(0, 8).map(c => (
          <span key={c} className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{c}</span>
        ))}
      </div>

      <p className="text-[10px] text-slate-500 mb-3 flex items-center gap-1">
        <Package className="w-3 h-3"/> {p.productCatalog?.length ?? 0} productos en catálogo
      </p>

      <button onClick={onLoad} disabled={disabled}
        className="w-full text-[12px] bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-2 rounded-full flex items-center justify-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5"/> Cargar este demo
      </button>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className={`text-slate-700 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
