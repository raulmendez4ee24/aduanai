import { useEffect, useMemo, useState } from 'react'
import { Shield, FileText, Download, Upload, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search } from 'lucide-react'
import { api } from '../../lib/api'
import type { SATPadronRecord, TenantPadronStatusRecord, PadronDeclareInput } from '../../lib/api'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

type Tab = 'mine' | 'available'

const STATUS_CHIP: Record<string, { color: string; label: string }> = {
  active:         { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Vigente' },
  expired:        { color: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Vencido' },
  in_process:     { color: 'bg-sky-100 text-sky-800 border-sky-200', label: 'En proceso' },
  suspended:      { color: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Suspendido' },
  rejected:       { color: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Rechazado' },
  not_registered: { color: 'bg-slate-100 text-slate-700 border-slate-200', label: 'No inscrito' },
}

export function PadronesPage() {
  const [tab, setTab] = useState<Tab>('mine')
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={`${GLASS} rounded-[2rem] p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-emerald-600"/>
          <h1 className="text-xl font-bold text-slate-900">Padrones SAT</h1>
        </div>
        <p className="text-[12px] text-slate-500 mb-4">Tu inscripción al Padrón General y Padrones Sectoriales (Anexo 10 RGCE). Sin padrón vigente, el SAT puede embargar mercancía y aplicar multa 70-100% del valor (Art. 144, 178 LA).</p>
        <div className="flex gap-2">
          {(['mine', 'available'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {t === 'mine' ? 'Mis padrones' : 'Padrones disponibles'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'mine' && <MineTab/>}
      {tab === 'available' && <AvailableTab/>}
    </div>
  )
}

function MineTab() {
  const [items, setItems] = useState<TenantPadronStatusRecord[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { const r = await api.padronesMine(); setItems(r.data) } catch { setItems([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (loading) return <div className={`${GLASS} rounded-2xl p-6 text-center text-[12px] text-slate-500`}>Cargando…</div>
  if (items.length === 0) {
    return (
      <div className={`${GLASS} rounded-2xl p-8 text-center`}>
        <p className="text-[14px] text-slate-700 mb-1">No tienes padrones registrados</p>
        <p className="text-[12px] text-slate-500">Ve a "Padrones disponibles" para autodeclarar tu inscripción al Padrón General y los sectoriales que apliquen.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map(s => {
        const chip = STATUS_CHIP[s.status] ?? STATUS_CHIP.not_registered!
        const days = s.expirationDate ? Math.ceil((new Date(s.expirationDate).getTime() - Date.now()) / 86400000) : null
        const expiringSoon = s.status === 'active' && days != null && days <= 30 && days > 0
        const padronTitle = s.padron.type === 'general'
          ? 'Padrón General de Importadores'
          : `Padrón Sectorial ${s.padron.sectorialCode} — ${s.padron.sectorialName}`
        return (
          <div key={s.id} className={`${GLASS} rounded-2xl p-4`}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${chip.color}`}>{chip.label}</span>
              <p className="text-[13px] font-semibold text-slate-900">{padronTitle}</p>
              {expiringSoon && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">⚠ Vence en {days} días</span>}
              {s.verifiedBy === 'self_declared' && <span className="text-[9px] text-slate-500 italic ml-auto">Pendiente de verificación admin</span>}
              {s.verifiedBy === 'manual' && <span className="text-[9px] text-emerald-600 italic ml-auto">Verificado por admin</span>}
            </div>
            <p className="text-[11px] text-slate-600 mb-2">{s.padron.description}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div><span className="text-slate-500">Inscripción:</span> <span className="font-mono">{s.registrationDate ? new Date(s.registrationDate).toLocaleDateString('es-MX') : '—'}</span></div>
              <div><span className="text-slate-500">Vencimiento:</span> <span className={`font-mono ${days != null && days <= 30 ? 'text-rose-700 font-semibold' : ''}`}>{s.expirationDate ? new Date(s.expirationDate).toLocaleDateString('es-MX') : '—'}</span></div>
              <div><span className="text-slate-500">Autoridad:</span> {s.padron.authority}</div>
              <div><span className="text-slate-500">Fundamento:</span> <span className="font-mono text-[10px]">{s.padron.legalBasis}</span></div>
            </div>
            {s.rejectionReason && <p className="text-[11px] text-rose-700 mt-2"><strong>Motivo de rechazo:</strong> {s.rejectionReason}</p>}
            {s.notes && <p className="text-[11px] text-slate-600 mt-2 italic">{s.notes}</p>}
            <div className="flex gap-2 mt-3 flex-wrap">
              <DeclareButton padron={s.padron} existing={s} onSaved={load}/>
              <a href={api.padronesLetterURL(s.padronId)} className="text-[11px] bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Download className="w-3 h-3"/> Carta solicitud
              </a>
              {s.status === 'active' && days != null && days <= 60 && (
                <span className="text-[11px] text-amber-700 self-center"><RefreshCw className="w-3 h-3 inline mr-1"/>Próximo a vencer — renueva pronto</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AvailableTab() {
  const [all, setAll] = useState<SATPadronRecord[]>([])
  const [mine, setMine] = useState<TenantPadronStatusRecord[]>([])
  const [filter, setFilter] = useState<'all' | 'general' | 'sectorial'>('all')
  const [search, setSearch] = useState('')

  async function load() {
    try { const r = await api.padronesList(); setAll(r.data) } catch { setAll([]) }
    try { const r = await api.padronesMine(); setMine(r.data) } catch { setMine([]) }
  }
  useEffect(() => { load() }, [])

  const myMap = useMemo(() => new Map(mine.map(m => [m.padronId, m])), [mine])

  const filtered = all.filter(p => {
    if (filter !== 'all' && p.type !== filter) return false
    if (search && !`${p.sectorialCode ?? ''} ${p.sectorialName ?? ''} ${p.description}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className={`${GLASS} rounded-2xl p-4 flex flex-wrap gap-2 items-center`}>
        <select value={filter} onChange={e => setFilter(e.target.value as 'all' | 'general' | 'sectorial')} className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="all">Todos</option>
          <option value="general">General</option>
          <option value="sectorial">Sectoriales</option>
        </select>
        <div className="flex-1 relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por sector o palabra clave…" className="w-full text-[12px] border border-slate-200 rounded-lg pl-7 pr-3 py-1.5"/>
        </div>
        <span className="text-[11px] text-slate-500">{filtered.length} padrón(es)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {filtered.map(p => {
          const existing = myMap.get(p.id)
          const inscribed = existing?.status === 'active'
          const padronTitle = p.type === 'general'
            ? 'Padrón General de Importadores'
            : `Sector ${p.sectorialCode} — ${p.sectorialName}`
          return (
            <div key={p.id} className={`${GLASS} rounded-2xl p-4`}>
              <div className="flex items-start gap-2 mb-1">
                <p className="text-[13px] font-semibold text-slate-900 flex-1">{padronTitle}</p>
                {inscribed
                  ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">✓ Inscrito</span>
                  : existing
                    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{STATUS_CHIP[existing.status]?.label ?? existing.status}</span>
                    : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">No inscrito</span>}
              </div>
              <p className="text-[11px] text-slate-600 mb-2">{p.description}</p>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 mb-3">
                <div><strong>Trámite:</strong> {p.estimatedDays ?? '—'} días</div>
                <div><strong>Vigencia:</strong> {p.validityMonths} meses</div>
                <div className="col-span-2 truncate"><strong>Autoridad:</strong> {p.authority}</div>
                <div className="col-span-2 truncate"><strong>Fundamento:</strong> {p.legalBasis}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <DeclareButton padron={p} existing={existing ?? null} onSaved={load}/>
                <a href={api.padronesLetterURL(p.id)} className="text-[10px] bg-white border border-slate-200 hover:bg-slate-50 px-2 py-1 rounded-lg flex items-center gap-1">
                  <FileText className="w-3 h-3"/> Carta
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeclareButton({ padron, existing, onSaved }: { padron: SATPadronRecord; existing: TenantPadronStatusRecord | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<PadronDeclareInput['status']>(existing?.status as PadronDeclareInput['status'] ?? 'active')
  const [registrationDate, setRegDate] = useState(existing?.registrationDate?.slice(0, 10) ?? '')
  const [expirationDate, setExpDate] = useState(existing?.expirationDate?.slice(0, 10) ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [evidence, setEvidence] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 1_000_000) { setErr('Archivo muy grande (máx 1 MB)'); return }
    const reader = new FileReader()
    reader.onload = () => setEvidence(String(reader.result ?? ''))
    reader.readAsDataURL(f)
  }

  async function save() {
    setSaving(true); setErr('')
    try {
      await api.padronesDeclare({
        padronId: padron.id,
        status,
        registrationDate: registrationDate ? new Date(registrationDate).toISOString() : undefined,
        expirationDate: expirationDate ? new Date(expirationDate).toISOString() : undefined,
        notes: notes || undefined,
        evidence: evidence ?? undefined,
      })
      setOpen(false)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-lg flex items-center gap-1">
        <Upload className="w-3 h-3"/> {existing ? 'Actualizar' : 'Declarar inscripción'}
      </button>
    )
  }

  return (
    <div className="w-full mt-2 border-t border-slate-200 pt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-slate-600">Estado
          <select value={status} onChange={e => setStatus(e.target.value as PadronDeclareInput['status'])} className="w-full text-[12px] border border-slate-200 rounded px-2 py-1 mt-0.5">
            <option value="active">Vigente</option>
            <option value="in_process">En proceso</option>
            <option value="expired">Vencido</option>
            <option value="suspended">Suspendido</option>
            <option value="rejected">Rechazado</option>
          </select>
        </label>
        <label className="text-[10px] text-slate-600">Fecha inscripción
          <input type="date" value={registrationDate} onChange={e => setRegDate(e.target.value)} className="w-full text-[12px] border border-slate-200 rounded px-2 py-1 mt-0.5"/>
        </label>
        <label className="text-[10px] text-slate-600 col-span-2">Vencimiento
          <input type="date" value={expirationDate} onChange={e => setExpDate(e.target.value)} className="w-full text-[12px] border border-slate-200 rounded px-2 py-1 mt-0.5"/>
        </label>
        <label className="text-[10px] text-slate-600 col-span-2">Notas
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full text-[12px] border border-slate-200 rounded px-2 py-1 mt-0.5"/>
        </label>
        <label className="text-[10px] text-slate-600 col-span-2">Constancia (PDF/imagen, máx 1MB)
          <input type="file" accept=".pdf,image/*" onChange={handleFile} className="w-full text-[11px] mt-0.5"/>
          {evidence && <span className="text-[10px] text-emerald-700">✓ Archivo cargado</span>}
        </label>
      </div>
      {err && <p className="text-[11px] text-rose-700">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="text-[11px] text-slate-600 hover:text-slate-800 px-3 py-1.5">Cancelar</button>
        <button onClick={save} disabled={saving} className="text-[11px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// Banner reutilizable para clasificador / cotizador / pre-validador
export function PadronCheckBanner({ check }: { check: { canOperate: boolean; blocking: { type: string; sectorialCode: string | null; sectorialName: string; legalBasis: string; estimatedDays: number | null; authority: string }[]; warnings: { sectorialName: string; daysToExpiration: number | null }[] } }) {
  if (check.blocking.length === 0 && check.warnings.length === 0) return null
  if (check.blocking.length > 0) {
    return (
      <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/70 p-4">
        <p className="text-[14px] font-bold text-rose-900 flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5"/> BLOQUEO POR PADRONES NO VIGENTES
        </p>
        <p className="text-[11px] text-rose-900 mb-2">Para operar esta fracción tu empresa requiere estar inscrita en:</p>
        <ul className="space-y-1 mb-3">
          {check.blocking.map((b, i) => (
            <li key={i} className="text-[11px] text-rose-900">
              ❌ <strong>{b.type === 'general' ? 'Padrón General de Importadores' : `Padrón Sectorial ${b.sectorialCode} (${b.sectorialName})`}:</strong> NO INSCRITO
              <span className="block ml-4 text-[10px] text-rose-700">Trámite ~{b.estimatedDays ?? '—'} días ante {b.authority} · {b.legalBasis}</span>
            </li>
          ))}
        </ul>
        <div className="bg-white/70 rounded-lg p-3 text-[11px] text-rose-900 mb-2">
          <p className="font-semibold mb-1">SIN ESTAS INSCRIPCIONES:</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>El SAT puede embargar la mercancía (Art. 144 fr. III LA)</li>
            <li>Multa: 70% al 100% del valor de la mercancía (Art. 178 fr. I LA)</li>
            <li>Suspensión de operaciones aduaneras</li>
          </ul>
        </div>
        <a href="/settings/padrones" className="text-[11px] inline-flex items-center gap-1 bg-rose-700 hover:bg-rose-800 text-white px-3 py-1.5 rounded-lg">
          <Shield className="w-3 h-3"/> Gestionar mis padrones
        </a>
      </div>
    )
  }
  // Solo warnings
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-3">
      <p className="text-[12px] font-bold text-amber-900 flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4"/> Padrones próximos a vencer
      </p>
      <ul className="space-y-0.5 mb-2">
        {check.warnings.map((w, i) => (
          <li key={i} className="text-[11px] text-amber-900">⚠ <strong>{w.sectorialName}</strong>: vence en {w.daysToExpiration} días</li>
        ))}
      </ul>
      <a href="/settings/padrones" className="text-[10px] text-amber-700 hover:underline">Renovar →</a>
    </div>
  )
}

// Estado OK — banner discreto
export function PadronOkBadge({ totalRequired }: { totalRequired: number }) {
  if (totalRequired === 0) return null
  return (
    <div className="text-[10px] text-emerald-700 inline-flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3"/> {totalRequired} padrón(es) verificado(s) — operación habilitada
    </div>
  )
}
