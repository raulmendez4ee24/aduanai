import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, X, Mail, Phone, FileText, Building2, BarChart3,
  Shield, Monitor, Users, Flame, Thermometer, Snowflake, Play, Rocket,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { LeadRecord, LeadStatsData, DemoAccountRecord } from '../../lib/api'

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  demo_scheduled: 'Demo agendada',
  demo_done: 'Demo realizada',
  pilot: 'Piloto',
  negotiating: 'Negociando',
  converted: 'Convertido',
  discarded: 'Descartado',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  contacted: 'bg-amber-50 text-amber-700',
  demo_scheduled: 'bg-purple-50 text-purple-700',
  demo_done: 'bg-indigo-50 text-indigo-700',
  pilot: 'bg-orange-50 text-orange-700',
  negotiating: 'bg-yellow-50 text-yellow-700',
  converted: 'bg-emerald-50 text-emerald-700',
  discarded: 'bg-gray-100 text-gray-500',
}

function scoreBadge(score: number): string {
  if (score >= 60) return 'inline-flex items-center justify-center w-10 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[12px] font-bold'
  if (score >= 30) return 'inline-flex items-center justify-center w-10 h-6 rounded-full bg-amber-100 text-amber-700 text-[12px] font-bold'
  return 'inline-flex items-center justify-center w-10 h-6 rounded-full bg-gray-100 text-gray-500 text-[12px] font-bold'
}

function scoreColor(score: number): string {
  if (score >= 60) return 'text-emerald-600'
  if (score >= 30) return 'text-amber-600'
  return 'text-gray-400'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function formatBreakdownKey(key: string): string {
  const map: Record<string, string> = {
    corporateEmail: 'Email corporativo',
    validRFC: 'RFC válido',
    hasIMMEX: 'Programa IMMEX',
    highVolume: 'Alto volumen',
    mediumVolume: 'Volumen medio',
    usesAJR: 'Sistema legado declarado',
    manualProcess: 'Proceso manual',
    maquiladora: 'Maquiladora',
    tradeIndustry: 'Sector comex',
    multipleProblems: 'Múltiples necesidades',
  }
  return map[key] || key
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} className="text-gray-300 shrink-0" />
      <div>
        <p className="text-[11px] text-gray-400">{label}</p>
        <p className="text-[13px] text-[#1a1a1a]">{value}</p>
      </div>
    </div>
  )
}

export function AdminLeadsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [stats, setStats] = useState<LeadStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [scoreFilter, setScoreFilter] = useState('')
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null)
  const [demoAccount, setDemoAccount] = useState<DemoAccountRecord | null>(null)
  const [preparingDemo, setPreparingDemo] = useState<string | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [activatingPilot, setActivatingPilot] = useState<string | null>(null)
  const [pilotResult, setPilotResult] = useState<{ tenant: { id: string; name: string; plan: string; pilotEndsAt: string }; credentials: { email: string; password: string } } | null>(null)

  async function loadData() {
    try {
      setError(null)
      const minScore = scoreFilter === 'hot' ? 60 : scoreFilter === 'warm' ? 30 : undefined
      const [leadsRes, statsRes] = await Promise.all([
        api.adminLeads(statusFilter || undefined, minScore),
        api.adminLeadStats(),
      ])
      let filteredLeads = leadsRes.data
      if (scoreFilter === 'warm') {
        filteredLeads = filteredLeads.filter(l => l.score >= 30 && l.score < 60)
      } else if (scoreFilter === 'cold') {
        filteredLeads = filteredLeads.filter(l => l.score < 30)
      }
      setLeads(filteredLeads)
      setStats(statsRes.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar leads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [statusFilter, scoreFilter])

  async function handleStatusChange(leadId: string, newStatus: string) {
    try {
      await api.updateLeadStatus(leadId, newStatus)
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
      if (selectedLead?.id === leadId) setSelectedLead(prev => prev ? { ...prev, status: newStatus } : null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al actualizar estado')
    }
  }

  async function handlePrepareDemo(leadId: string) {
    setPreparingDemo(leadId)
    try {
      const res = await api.adminPrepareDemoForLead(leadId)
      setDemoAccount(res.data.demoAccount)
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'demo_scheduled' } : l))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al preparar demo')
    } finally {
      setPreparingDemo(null)
    }
  }

  async function handleActivatePilot(leadId: string) {
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return
    if (!window.confirm(`¿Activar piloto de 30 días para ${lead.company || lead.name}? Se creará una cuenta con plan PILOT y se enviará email con credenciales.`)) return
    setActivatingPilot(leadId)
    try {
      const res = await api.adminActivatePilot(leadId, lead.company || undefined)
      setPilotResult(res.data)
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'pilot' } : l))
      if (selectedLead?.id === leadId) setSelectedLead(prev => prev ? { ...prev, status: 'pilot' } : null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al activar piloto')
    } finally {
      setActivatingPilot(null)
    }
  }

  async function handleSendInvite(demoId: string) {
    setSendingInvite(true)
    try {
      await api.adminSendDemoInvite(demoId)
      alert('Invitación enviada correctamente')
      setDemoAccount(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al enviar invitación')
    } finally {
      setSendingInvite(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-500 text-[14px]">{error}</p>
        <button onClick={loadData} className="text-[13px] text-emerald-600 hover:underline">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
          <Users size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Admin Leads</h1>
          <p className="text-[12px] text-gray-400">Gestión de prospectos y demos</p>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-[22px] font-bold text-[#1a1a1a]">{stats.total}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Total leads</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-[22px] font-bold text-blue-600">{stats.new}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Nuevos</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-100">
            <div className="flex items-center gap-1.5">
              <Flame size={14} className="text-emerald-500" />
              <p className="text-[22px] font-bold text-emerald-600">{stats.hotLeads}</p>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Hot (60+)</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-amber-100">
            <div className="flex items-center gap-1.5">
              <Thermometer size={14} className="text-amber-500" />
              <p className="text-[22px] font-bold text-amber-600">{stats.warmLeads}</p>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Warm (30-59)</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-1.5">
              <Snowflake size={14} className="text-gray-400" />
              <p className="text-[22px] font-bold text-gray-500">{stats.coldLeads}</p>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Cold (&lt;30)</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
            <p className="text-[22px] font-bold text-green-600">{stats.converted}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Convertidos</p>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={scoreFilter}
          onChange={e => setScoreFilter(e.target.value)}
          className="text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los scores</option>
          <option value="hot">Hot (60+)</option>
          <option value="warm">Warm (30-59)</option>
          <option value="cold">Cold (&lt;30)</option>
        </select>
        <span className="text-[12px] text-gray-400 ml-auto">{leads.length} resultado{leads.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Leads table */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-5 py-3">Lead</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Score</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Estado</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3 hidden md:table-cell">Fuente</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3 hidden sm:table-cell">Fecha</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[13px] text-gray-400 py-12">
                    No hay leads con los filtros seleccionados
                  </td>
                </tr>
              )}
              {leads.map(lead => (
                <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-[14px] text-[#1a1a1a]">{lead.name}</p>
                    <p className="text-[12px] text-gray-400">
                      {[lead.company, lead.email].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={scoreBadge(lead.score)}>{lead.score}</span>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={lead.status}
                      onChange={e => handleStatusChange(lead.id, e.target.value)}
                      className={`text-[11px] font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-600'}`}
                    >
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="text-[13px] text-gray-500">{lead.source}</span>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <span className="text-[13px] text-gray-400">{formatDate(lead.createdAt)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setSelectedLead(lead)}
                        title="Ver detalle"
                        className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-500"
                      >
                        <Eye size={14} />
                      </button>
                      {lead.status !== 'demo_scheduled' && lead.status !== 'demo_done' && lead.status !== 'pilot' && (
                        <button
                          onClick={() => handlePrepareDemo(lead.id)}
                          disabled={preparingDemo === lead.id}
                          title="Preparar demo"
                          className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-colors text-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {preparingDemo === lead.id ? (
                            <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Play size={12} />
                          )}
                        </button>
                      )}
                      {(lead.status === 'demo_done' || lead.status === 'negotiating') && (
                        <button
                          onClick={() => handleActivatePilot(lead.id)}
                          disabled={activatingPilot === lead.id}
                          title="Activar piloto 30 días"
                          className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center hover:bg-orange-100 transition-colors text-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {activatingPilot === lead.id ? (
                            <div className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Rocket size={12} />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead detail slide-over */}
      <AnimatePresence>
        {selectedLead && (
          <motion.div
            className="fixed inset-0 z-50 flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedLead(null)} />
            <motion.div
              className="relative w-full max-w-md bg-white h-full shadow-xl overflow-y-auto"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            >
              <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-[#1a1a1a]">{selectedLead.name}</h2>
                    {selectedLead.company && <p className="text-gray-400 text-sm">{selectedLead.company}</p>}
                  </div>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-500"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Score */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Score</span>
                    <span className={`text-2xl font-bold ${scoreColor(selectedLead.score)}`}>{selectedLead.score}</span>
                  </div>
                  {selectedLead.scoreBreakdown && (() => {
                    try {
                      const breakdown = JSON.parse(selectedLead.scoreBreakdown)
                      return (
                        <div className="mt-3 space-y-1">
                          {Object.entries(breakdown).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-[12px]">
                              <span className="text-gray-400">{formatBreakdownKey(k)}</span>
                              <span className="text-emerald-600 font-medium">+{v as number}</span>
                            </div>
                          ))}
                        </div>
                      )
                    } catch {
                      return null
                    }
                  })()}
                </div>

                {/* Estado inline */}
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">Estado</p>
                  <select
                    value={selectedLead.status}
                    onChange={e => handleStatusChange(selectedLead.id, e.target.value)}
                    className={`text-[12px] font-medium px-3 py-1.5 rounded-xl border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${STATUS_COLORS[selectedLead.status] || 'bg-gray-100 text-gray-600'}`}
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                {/* Contact info */}
                <div className="space-y-3">
                  <InfoRow icon={Mail} label="Email" value={selectedLead.email} />
                  <InfoRow icon={Phone} label="Teléfono" value={selectedLead.phone} />
                  {selectedLead.rfc && <InfoRow icon={FileText} label="RFC" value={selectedLead.rfc} />}
                  {selectedLead.industry && <InfoRow icon={Building2} label="Giro" value={selectedLead.industry} />}
                  {selectedLead.monthlyOps && <InfoRow icon={BarChart3} label="Ops/mes" value={selectedLead.monthlyOps} />}
                  {selectedLead.hasIMMEX !== null && selectedLead.hasIMMEX !== undefined && (
                    <InfoRow icon={Shield} label="IMMEX" value={selectedLead.hasIMMEX ? 'Sí' : 'No'} />
                  )}
                  {selectedLead.currentSoftware && <InfoRow icon={Monitor} label="Software" value={selectedLead.currentSoftware} />}
                  {selectedLead.message && <InfoRow icon={FileText} label="Mensaje" value={selectedLead.message} />}
                  {selectedLead.referralSource && <InfoRow icon={Users} label="Referido por" value={selectedLead.referralSource} />}
                </div>

                {/* Problems */}
                {selectedLead.problems?.length > 0 && (
                  <div>
                    <p className="text-[12px] text-gray-400 uppercase tracking-wider mb-2">Problemas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedLead.problems.map(p => (
                        <span key={p} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <a
                    href={`https://wa.me/52${selectedLead.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
                  >
                    WhatsApp
                  </a>
                  <a
                    href={`mailto:${selectedLead.email}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Enviar email
                  </a>
                  {selectedLead.status !== 'demo_scheduled' && selectedLead.status !== 'demo_done' && selectedLead.status !== 'pilot' && (
                    <button
                      onClick={() => { handlePrepareDemo(selectedLead.id); setSelectedLead(null) }}
                      disabled={preparingDemo === selectedLead.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1a1a1a] text-white text-[13px] font-medium hover:bg-[#333] transition-colors disabled:opacity-50"
                    >
                      Preparar demo
                    </button>
                  )}
                  {(selectedLead.status === 'demo_done' || selectedLead.status === 'negotiating') && (
                    <button
                      onClick={() => { handleActivatePilot(selectedLead.id) }}
                      disabled={activatingPilot === selectedLead.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                    >
                      <Rocket size={14} />
                      {activatingPilot === selectedLead.id ? 'Activando...' : 'Activar piloto 30 días'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pilot activated modal */}
      <AnimatePresence>
        {pilotResult && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30" onClick={() => setPilotResult(null)} />
            <motion.div
              className="relative bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                  <Rocket size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-[#1a1a1a]">Piloto activado</h3>
                  <p className="text-[12px] text-gray-400">{pilotResult.tenant.name}</p>
                </div>
                <button onClick={() => setPilotResult(null)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-500">
                  <X size={14} />
                </button>
              </div>
              <p className="text-[13px] text-gray-600 mb-3">Credenciales enviadas por email al lead. También puedes copiarlas:</p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-4">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Email</p>
                  <p className="font-mono text-[14px] font-medium text-[#1a1a1a] break-all">{pilotResult.credentials.email}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Contraseña</p>
                  <p className="font-mono text-[14px] font-medium text-[#1a1a1a]">{pilotResult.credentials.password}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Vence</p>
                  <p className="text-[13px] text-gray-600">{new Date(pilotResult.tenant.pilotEndsAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${pilotResult.credentials.email}\nContraseña: ${pilotResult.credentials.password}`)
                  setPilotResult(null)
                }}
                className="w-full py-2.5 rounded-xl bg-[#1a1a1a] text-white text-[13px] font-medium hover:bg-[#333] transition-colors"
              >
                Copiar y cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Demo prepared modal */}
      <AnimatePresence>
        {demoAccount && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30" onClick={() => setDemoAccount(null)} />
            <motion.div
              className="relative bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-[#1a1a1a]">Demo preparada</h3>
                <button
                  onClick={() => setDemoAccount(null)}
                  className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-500"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-4">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Email</p>
                  <p className="font-mono text-[14px] font-medium text-[#1a1a1a]">{demoAccount.email}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Contraseña</p>
                  <p className="font-mono text-[14px] font-medium text-[#1a1a1a]">{demoAccount.password}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Expira</p>
                  <p className="text-[13px] text-gray-600">{new Date(demoAccount.expiresAt).toLocaleString('es-MX')}</p>
                </div>
              </div>
              <p className="text-[12px] text-gray-400 mb-4">
                Productos pre-cargados: {demoAccount.products.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSendInvite(demoAccount.id)}
                  disabled={sendingInvite}
                  className="flex-1 bg-[#1a1a1a] text-white text-[13px] font-medium py-2.5 rounded-xl hover:bg-[#333] transition-colors disabled:opacity-50"
                >
                  {sendingInvite ? 'Enviando...' : 'Enviar invitación'}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Email: ${demoAccount.email}\nContraseña: ${demoAccount.password}`)
                  }}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Copiar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
