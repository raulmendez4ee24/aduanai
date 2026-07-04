import { useState, useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Search, Bell, Settings, Menu, X, ChevronLeft,
  Boxes, Calculator, Bot, Clock, FolderOpen, ShieldCheck, FileText,
  Truck, Megaphone, LineChart, Warehouse, Globe, Package,
  HelpCircle, MessageCircle, Users, Rocket, Building2, TrendingUp, RotateCcw,
  Shield, BookOpen, Database, Sparkles, BadgeCheck, Briefcase, AlertTriangle,
  Anchor, UserCircle2, LogOut, Target, Scale
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import type { FractionSearchResult } from '../lib/api'
import { PilotBanner } from './PilotBanner'
import { DemoBanner } from './DemoBanner'
import { ToastHost } from './Toast'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

function DropdownItem({ icon: Icon, label, onClick, href, danger }: { icon: LucideIcon; label: string; onClick?: () => void; href?: string; danger?: boolean }) {
  const cls = `w-full text-left px-4 py-2 flex items-center gap-2.5 hover:bg-white/60 transition-colors text-[12px] ${danger ? 'text-rose-600 hover:text-rose-700' : 'text-slate-700'}`
  if (href) return <a href={href} className={cls}><Icon className="w-3.5 h-3.5"/>{label}</a>
  return <button onClick={onClick} className={cls}><Icon className="w-3.5 h-3.5"/>{label}</button>
}

function NavSection({
  group, collapsed, isCollapsedSection, onToggle, onItemClick, linkClass, isAdminGroup,
}: {
  group: { section: string; items: { label: string; path: string; icon: LucideIcon }[] }
  collapsed: boolean
  isCollapsedSection: boolean
  onToggle: () => void
  onItemClick: () => void
  linkClass: (a: boolean) => string
  isAdminGroup?: boolean
}) {
  return (
    <div className={isAdminGroup ? 'pt-3' : 'pt-2 first:pt-0'}>
      {!collapsed ? (
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-1.5 px-3 mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 hover:text-slate-600"
        >
          <span className="truncate">{group.section}</span>
          <ChevronLeft className={`w-3 h-3 ml-auto transition-transform ${!isCollapsedSection ? '-rotate-90' : 'rotate-180'}`}/>
        </button>
      ) : (
        <div className="h-px bg-slate-200/60 mx-2 my-1.5"/>
      )}
      {(!isCollapsedSection || collapsed) && group.items.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/admin' || item.path === '/app'}
          onClick={onItemClick}
          className={({ isActive }) => linkClass(isActive)}
          title={collapsed ? item.label : undefined}
        >
          <item.icon className="w-4 h-4 shrink-0"/>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </NavLink>
      ))}
    </div>
  )
}

interface NavItem { label: string; path: string; icon: LucideIcon }
interface NavGroup { section: string; items: NavItem[] }

const USER_NAV_GROUPS: NavGroup[] = [
  {
    section: 'Operación diaria',
    items: [
      { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
      { label: 'Clasificador IA', path: '/clasificador', icon: Boxes },
      { label: 'Cotizador', path: '/cotizador', icon: Calculator },
      { label: 'Pre-validador', path: '/prevalidador', icon: ShieldCheck },
      { label: 'Auto MVE', path: '/mve', icon: FileText },
      { label: 'Origen TMEC', path: '/origen-tmec', icon: Globe },
      { label: 'Simulador de Glosa', path: '/simulador-glosa', icon: Target },
      { label: 'Risk Scorer', path: '/risk-scorer', icon: Scale },
      { label: 'Expedientes IA', path: '/expediente-ia', icon: Sparkles },
      { label: 'Copilot', path: '/copilot', icon: Bot },
    ],
  },
  {
    section: 'Gestión',
    items: [
      { label: 'Inventario IMMEX', path: '/inventario', icon: Warehouse },
      { label: 'Logística', path: '/logistics', icon: Truck },
      { label: 'Fiscal Guardian', path: '/fiscal', icon: Package },
      { label: 'Alertas', path: '/alertas', icon: Megaphone },
      { label: 'Analytics', path: '/analytics', icon: LineChart },
      { label: 'Historial', path: '/historial', icon: Clock },
      { label: 'Expedientes', path: '/expediente', icon: FolderOpen },
    ],
  },
  {
    section: 'Consulta normativa',
    items: [
      // Fase 2.3 — ocultos del menú (rutas siguen vivas por URL directa, reversible):
      // Precedentes: corpus sintético no citable, pendiente de cotejo TFJA/SAT (DEFERRED_WORK #12).
      // Actualizaciones: 0 filas y sin pipeline DOF; su analizador de decretos sigue en /updates (DEFERRED_WORK #13).
      // { label: 'Precedentes', path: '/precedentes', icon: Scale },
      // { label: 'Actualizaciones', path: '/updates', icon: RefreshCw },
      { label: 'Biblioteca Legal', path: '/biblioteca-legal', icon: BookOpen },
      { label: 'Cuotas activas', path: '/cuotas-activas', icon: AlertTriangle },
      { label: 'Cumplimiento', path: '/cumplimiento', icon: ShieldCheck },
    ],
  },
  {
    section: 'Mi empresa',
    items: [
      { label: 'Empresa', path: '/settings/empresa', icon: Building2 },
      { label: 'Usuarios y roles', path: '/settings/users', icon: Users },
      { label: 'Mis padrones SAT', path: '/settings/padrones', icon: Shield },
      { label: 'Audit Trail', path: '/audit', icon: FileText },
      { label: 'Verificación profesional', path: '/verificacion', icon: BadgeCheck },
    ],
  },
]

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    section: 'Administración',
    items: [
      { label: 'Panel Admin', path: '/admin', icon: TrendingUp },
      { label: 'Empresas', path: '/admin/empresas', icon: Building2 },
      { label: 'Leads', path: '/admin/leads', icon: Users },
      { label: 'Pilotos', path: '/admin/pilotos', icon: Rocket },
      { label: 'Renovaciones', path: '/admin/renovaciones', icon: RotateCcw },
      { label: 'Métricas', path: '/admin/metricas', icon: LineChart },
      { label: 'Datos Demo', path: '/admin/demo', icon: Database },
      { label: 'Demos por sector', path: '/admin/demo-profiles', icon: Briefcase },
      { label: 'Verificaciones', path: '/admin/verifications', icon: BadgeCheck },
      { label: 'Glosa Simulator', path: '/admin/glosa-simulations', icon: Target },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { label: 'Audit Trail', path: '/admin/audit', icon: Shield },
      { label: 'Cumplimiento normativo', path: '/admin/compliance', icon: ShieldCheck },
      { label: 'Monitoreo', path: '/admin/monitoring', icon: LineChart },
      { label: 'Seguridad', path: '/admin/security', icon: Shield },
      { label: 'Backups', path: '/admin/backups', icon: Database },
    ],
  },
  {
    section: 'Catálogos maestros',
    items: [
      { label: 'Conocimiento', path: '/admin/knowledge', icon: BookOpen },
      { label: 'Catálogo Docs Legales', path: '/admin/legal-docs', icon: BookOpen },
      { label: 'Catálogo Cuotas Compensatorias', path: '/admin/antidumping', icon: AlertTriangle },
      { label: 'Catálogo Padrones SAT', path: '/admin/padrones', icon: BadgeCheck },
      { label: 'Anclajes Bitcoin (OTS)', path: '/admin/timestamps', icon: Anchor },
    ],
  },
]

interface Props {
  children: ReactNode
  onLogout: () => void
  userRole?: string
  userName?: string
  userEmail?: string
  tenantName?: string
}

interface RecentAlert {
  id: string
  title: string
  severity: string
  createdAt: string
  type?: string
  affectedFraction?: string | null
}

export function AppLayout({ children, onLogout, userRole, userName, userEmail, tenantName }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FractionSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('sidebar:collapsedSections:v1')
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })
  function toggleSection(name: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      try { localStorage.setItem('sidebar:collapsedSections:v1', JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }
  const [openDropdown, setOpenDropdown] = useState<'notifications' | 'settings' | 'user' | null>(null)
  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([])
  const notifOpen = openDropdown === 'notifications'
  const settingsMenuOpen = openDropdown === 'settings'
  const userMenuOpen = openDropdown === 'user'
  const closeDropdown = () => setOpenDropdown(null)
  const toggleDropdown = (which: 'notifications' | 'settings' | 'user') =>
    setOpenDropdown(prev => prev === which ? null : which)
  // El nav admin del sistema solo es para SUPERADMIN.
  // ADMIN está reservado para "admin de empresa cliente" (sin acceso a paneles del sistema).
  const isAdmin = userRole === 'SUPERADMIN'
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const settingsMenuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const initial = (userName ?? userEmail ?? 'U').charAt(0).toUpperCase()

  // Load unread count
  useEffect(() => {
    async function loadBadge() {
      try {
        const [a, u] = await Promise.allSettled([
          api.alertsUnreadCount(),
          api.updaterUnreadCount(),
        ])
        let total = 0
        if (a.status === 'fulfilled') total += a.value.data.count
        if (u.status === 'fulfilled') total += u.value.data.count
        setUnreadCount(total)
      } catch { /* silent */ }
    }
    loadBadge()
    const interval = setInterval(loadBadge, 60000)
    return () => clearInterval(interval)
  }, [])

  // Search fractions with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.searchFractions(searchQuery)
        setSearchResults(res.data.slice(0, 8))
      } catch {
        setSearchResults([])
      }
      setSearching(false)
    }, 300)
  }, [searchQuery])

  // Focus search input when modal opens
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  // Close search on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close header dropdowns on outside click — uno solo abierto a la vez
  useEffect(() => {
    if (!openDropdown) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      const inNotif = notifRef.current?.contains(t)
      const inSettings = settingsMenuRef.current?.contains(t)
      const inUser = userMenuRef.current?.contains(t)
      if (!inNotif && !inSettings && !inUser) setOpenDropdown(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openDropdown])

  // Keyboard shortcut: Cmd+K + Escape para todos los dropdowns
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setOpenDropdown(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Cargar alertas recientes al abrir el dropdown + marcar como leídas
  useEffect(() => {
    if (!notifOpen) return
    void (async () => {
      try {
        const r = await api.alerts()
        const items = (r.data as unknown as { id: string; title: string; severity: string; createdAt: string; type?: string; affectedFraction?: string | null }[])
          .slice(0, 10)
        setRecentAlerts(items)
        await api.alertMarkAllRead().catch(() => {})
        setUnreadCount(0)
      } catch { setRecentAlerts([]) }
    })()
  }, [notifOpen])

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
      isActive
        ? 'bg-emerald-500/10 text-emerald-700'
        : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
    }`

  return (
    <div className="h-screen w-full relative overflow-hidden flex" style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* ── Background ── */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-emerald-50/20 to-slate-50" />
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #94a3b8 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`relative z-50 shrink-0 h-full flex flex-col transition-all duration-300 ${
        mobileOpen ? 'fixed inset-y-0 left-0 w-64' : 'hidden lg:flex'
      } ${collapsed ? 'lg:w-[72px]' : 'lg:w-60'}`}>
        <div className={`${GLASS} rounded-[1.5rem] m-3 mr-0 flex-1 flex flex-col overflow-hidden`}>
          {/* Logo */}
          <div className="px-4 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-white" />
              </div>
              {!collapsed && <span className="text-[15px] font-bold text-slate-900 tracking-tight whitespace-nowrap">ADUANAI</span>}
            </div>
            <button onClick={() => { setCollapsed(!collapsed); setMobileOpen(false) }} className="hidden lg:flex w-6 h-6 rounded-lg bg-white/60 items-center justify-center hover:bg-white transition-colors">
              <ChevronLeft className={`w-3.5 h-3.5 text-slate-500 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setMobileOpen(false)} className="lg:hidden">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
            {USER_NAV_GROUPS.map(group => (
              <NavSection
                key={group.section}
                group={group}
                collapsed={collapsed}
                isCollapsedSection={collapsedSections.has(group.section)}
                onToggle={() => toggleSection(group.section)}
                onItemClick={() => setMobileOpen(false)}
                linkClass={linkClass}
              />
            ))}

            {isAdmin && ADMIN_NAV_GROUPS.map(group => (
              <NavSection
                key={group.section}
                group={group}
                collapsed={collapsed}
                isCollapsedSection={collapsedSections.has(group.section)}
                onToggle={() => toggleSection(group.section)}
                onItemClick={() => setMobileOpen(false)}
                linkClass={linkClass}
                isAdminGroup
              />
            ))}
          </nav>

          {/* Footer */}
          <div className="px-3 pb-4">
            <button onClick={onLogout} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-rose-500 hover:bg-rose-50/50 transition-all w-full`}>
              <X className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Cerrar sesión</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <div className="shrink-0 px-3 pt-3 pb-0">
          <div className={`${GLASS} rounded-[1.5rem] px-4 md:px-5 py-3 flex items-center justify-between`}>
            {/* Left: hamburger (mobile) */}
            <button onClick={() => setMobileOpen(true)} className="lg:hidden w-9 h-9 rounded-full bg-white/50 flex items-center justify-center">
              <Menu className="w-4 h-4 text-slate-600" />
            </button>

            {/* Center: breadcrumb or spacer */}
            <div className="hidden lg:block" />

            {/* Right actions */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={() => setSearchOpen(true)} aria-label="Buscar (⌘K)" className="w-9 h-9 rounded-full bg-white/50 flex items-center justify-center hover:bg-white/70 transition-colors" title="Buscar (⌘K)">
                <Search className="w-4 h-4 text-slate-500" />
              </button>

              {/* Campana */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => { toggleDropdown('notifications') }}
                  aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
                  aria-expanded={notifOpen}
                  className={`w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/80 transition-colors relative ${notifOpen ? 'bg-white/90 ring-1 ring-slate-300' : 'bg-white/50'}`}
                >
                  <Bell className="w-4 h-4 text-slate-500" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className={`${GLASS} absolute right-0 mt-2 w-[340px] rounded-2xl shadow-xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-1 duration-150`}>
                    <div className="px-4 py-3 border-b border-slate-200/50 flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-slate-900">Notificaciones</p>
                      <button onClick={() => { closeDropdown(); navigate('/alertas') }} className="text-[11px] text-emerald-700 hover:underline">Ver todas →</button>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {recentAlerts.length === 0 ? (
                        <p className="px-4 py-8 text-center text-[12px] text-slate-400 italic">Sin notificaciones</p>
                      ) : recentAlerts.map(a => (
                        <button
                          key={a.id}
                          onClick={() => { closeDropdown(); navigate(`/alertas?id=${a.id}`) }}
                          className="w-full text-left px-4 py-3 hover:bg-white/60 border-b border-slate-100/60 last:border-b-0"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                              a.severity === 'critical' ? 'bg-rose-500' :
                              a.severity === 'high' ? 'bg-amber-500' :
                              a.severity === 'medium' ? 'bg-sky-500' : 'bg-slate-400'
                            }`}/>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium text-slate-900 truncate">{a.title}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {new Date(a.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                                {a.affectedFraction && <span className="ml-2 font-mono">{a.affectedFraction}</span>}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Engrane */}
              <div className="relative hidden sm:block" ref={settingsMenuRef}>
                <button
                  onClick={() => { toggleDropdown('settings') }}
                  aria-label="Configuración"
                  aria-expanded={settingsMenuOpen}
                  className={`w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/80 transition-colors ${settingsMenuOpen ? 'bg-white/90 ring-1 ring-slate-300' : 'bg-white/50'}`}
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                </button>
                {settingsMenuOpen && (
                  <div className={`${GLASS} absolute right-0 mt-2 w-[240px] rounded-2xl shadow-xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-1 duration-150`}>
                    <DropdownItem icon={UserCircle2} label="Mi perfil" onClick={() => { closeDropdown(); navigate('/settings/profile') }}/>
                    <DropdownItem icon={Building2} label="Empresa" onClick={() => { closeDropdown(); navigate('/settings/empresa') }}/>
                    <DropdownItem icon={Shield} label="Mis padrones SAT" onClick={() => { closeDropdown(); navigate('/settings/padrones') }}/>
                    <DropdownItem icon={BadgeCheck} label="Verificación profesional" onClick={() => { closeDropdown(); navigate('/verificacion') }}/>
                    <DropdownItem icon={Bell} label="Notificaciones" onClick={() => { closeDropdown(); navigate('/settings/notifications') }}/>
                    <div className="border-t border-slate-200/50 my-1"/>
                    <DropdownItem icon={HelpCircle} label="Centro de ayuda" onClick={() => { closeDropdown(); navigate('/help') }}/>
                    <DropdownItem icon={MessageCircle} label="Soporte" href="mailto:soporte@aduanai.mx"/>
                    <div className="border-t border-slate-200/50 my-1"/>
                    <DropdownItem icon={LogOut} label="Cerrar sesión" onClick={() => { closeDropdown(); onLogout() }} danger/>
                  </div>
                )}
              </div>

              {/* Avatar usuario */}
              <div className="relative ml-1" ref={userMenuRef}>
                <button
                  onClick={() => { toggleDropdown('user') }}
                  aria-label="Menú de usuario"
                  aria-expanded={userMenuOpen}
                  className={`w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center transition-all ${userMenuOpen ? 'ring-2 ring-emerald-300' : 'hover:ring-2 hover:ring-emerald-300/50'}`}
                >
                  <span className="text-white text-[11px] font-bold">{initial}</span>
                </button>
                {userMenuOpen && (
                  <div className={`${GLASS} absolute right-0 mt-2 w-[260px] rounded-2xl shadow-xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-1 duration-150`}>
                    <div className="px-4 py-3 border-b border-slate-200/50">
                      <p className="text-[13px] font-semibold text-slate-900 truncate">{userName ?? '—'}</p>
                      {userEmail && <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {userRole && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 rounded">{userRole}</span>}
                        {tenantName && <span className="text-[10px] text-slate-500 truncate">· {tenantName}</span>}
                      </div>
                    </div>
                    <DropdownItem icon={UserCircle2} label="Mi perfil" onClick={() => { closeDropdown(); navigate('/settings/profile') }}/>
                    <DropdownItem icon={Building2} label="Empresa" onClick={() => { closeDropdown(); navigate('/settings/empresa') }}/>
                    <DropdownItem icon={Shield} label="Mis padrones SAT" onClick={() => { closeDropdown(); navigate('/settings/padrones') }}/>
                    <div className="border-t border-slate-200/50 my-1"/>
                    <DropdownItem icon={LogOut} label="Cerrar sesión" onClick={() => { closeDropdown(); onLogout() }} danger/>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pilot banner (only shown to PILOT tenants) */}
        <PilotBanner />
        {/* Demo-data banner (Fase 2.1) — persistente mientras haya datos sembrados */}
        <DemoBanner />
        <ToastHost />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {children}
        </div>
      </div>

      {/* ── Search Modal ── */}
      {searchOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/20 backdrop-blur-sm">
          <div ref={searchRef} className={`${GLASS} rounded-2xl w-full max-w-lg mx-4 overflow-hidden`}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/50">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar fracción arancelaria..."
                className="flex-1 bg-transparent text-[14px] text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <kbd className="hidden sm:block text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {searching && (
                <div className="px-5 py-8 text-center">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[12px] text-slate-400 mt-2">Buscando...</p>
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="p-2">
                  {searchResults.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate('/fracciones') }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/60 transition-colors text-left"
                    >
                      <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[13px] font-semibold text-slate-900">{f.codeFormatted}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{f.description}</p>
                      </div>
                      {f.tariffNMF !== null && (
                        <span className="text-[10px] font-medium text-slate-400 shrink-0">{f.tariffNMF}% IGI</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="text-[12px] text-slate-400">Sin resultados para "{searchQuery}"</p>
                </div>
              )}

              {!searching && !searchQuery.trim() && (
                <div className="px-5 py-8 text-center">
                  <p className="text-[12px] text-slate-400">Escribe un código o descripción de fracción</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Help & WhatsApp ── (oculto en /copilot para no tapar el input) */}
      {location.pathname !== '/copilot' && (
        <div className="fixed bottom-5 right-5 z-30 flex flex-col gap-2.5">
          <a href="https://wa.me/523326617755?text=Hola%2C%20necesito%20ayuda%20con%20ADUANAI" target="_blank" rel="noopener noreferrer"
            className="w-11 h-11 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg shadow-[#25D366]/20 hover:scale-110 transition-transform" title="Contactar asesor">
            <MessageCircle className="w-5 h-5 text-white" />
          </a>
          <button onClick={() => navigate('/copilot')}
            className="w-11 h-11 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-110 transition-transform" title="Ayuda / Copilot IA">
            <HelpCircle className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  )
}
