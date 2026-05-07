import { useState, useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Search, Bell, Settings, Menu, X, ChevronLeft,
  Boxes, Calculator, Bot, Clock, FolderOpen, ShieldCheck, FileText,
  Truck, Megaphone, LineChart, Warehouse, RefreshCw, Globe, Package,
  HelpCircle, MessageCircle, Users, Rocket, Building2, TrendingUp, RotateCcw,
  Shield, BookOpen, Database, Sparkles, Scale, BadgeCheck, Briefcase, AlertTriangle,
  Anchor
} from 'lucide-react'
import { api } from '../lib/api'
import type { FractionSearchResult } from '../lib/api'
import { PilotBanner } from './PilotBanner'

const GLASS = 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'

const NAV_ITEMS = [
  { label: 'Vista General', path: '/app', icon: LayoutDashboard },
  { label: 'Clasificador IA', path: '/clasificador', icon: Boxes },
  { label: 'Cotizador', path: '/cotizador', icon: Calculator },
  { label: 'Copilot', path: '/copilot', icon: Bot },
  { label: 'Historial', path: '/historial', icon: Clock },
  { label: 'Expedientes', path: '/expediente', icon: FolderOpen },
  { label: 'Expedientes IA', path: '/expediente-ia', icon: Sparkles },
  { label: 'Pre-validador', path: '/prevalidador', icon: ShieldCheck },
  { label: 'Alertas', path: '/alertas', icon: Megaphone },
  { label: 'Analytics', path: '/analytics', icon: LineChart },
  { label: 'Inventario IMMEX', path: '/inventario', icon: Warehouse },
  { label: 'Fiscal Guardian', path: '/fiscal', icon: Package },
  { label: 'Auto MVE', path: '/mve', icon: FileText },
  { label: 'Origen TMEC', path: '/origen-tmec', icon: Globe },
  { label: 'Precedentes', path: '/precedentes', icon: Scale },
  { label: 'Logística', path: '/logistics', icon: Truck },
  { label: 'Actualizaciones', path: '/updates', icon: RefreshCw },
  { label: 'Mis padrones SAT', path: '/settings/padrones', icon: Shield },
]

const ADMIN_NAV_ITEMS = [
  { label: 'Panel Admin', path: '/admin', icon: TrendingUp },
  { label: 'Leads', path: '/admin/leads', icon: Users },
  { label: 'Conocimiento', path: '/admin/knowledge', icon: BookOpen },
  { label: 'Pilotos', path: '/admin/pilotos', icon: Rocket },
  { label: 'Empresas', path: '/admin/empresas', icon: Building2 },
  { label: 'Renovaciones', path: '/admin/renovaciones', icon: RotateCcw },
  { label: 'Métricas', path: '/admin/metricas', icon: LineChart },
  { label: 'Datos Demo', path: '/admin/demo', icon: Database },
  { label: 'Audit Trail', path: '/admin/audit', icon: Shield },
  { label: 'Cumplimiento normativo', path: '/admin/compliance', icon: ShieldCheck },
  { label: 'Monitoreo', path: '/admin/monitoring', icon: LineChart },
  { label: 'Seguridad', path: '/admin/security', icon: Shield },
  { label: 'Verificaciones', path: '/admin/verifications', icon: BadgeCheck },
  { label: 'Backups', path: '/admin/backups', icon: Database },
  { label: 'Demos por sector', path: '/admin/demo-profiles', icon: Briefcase },
  { label: 'Docs legales (RAG)', path: '/admin/legal-docs', icon: BookOpen },
  { label: 'Cuotas compensatorias', path: '/admin/antidumping', icon: AlertTriangle },
  { label: 'Anclajes Bitcoin (OTS)', path: '/admin/timestamps', icon: Anchor },
  { label: 'Padrones SAT', path: '/admin/padrones', icon: BadgeCheck },
]

interface Props {
  children: ReactNode
  onLogout: () => void
  userRole?: string
}

export function AppLayout({ children, onLogout, userRole }: Props) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FractionSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [adminExpanded, setAdminExpanded] = useState(true)
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN'
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

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
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => linkClass(isActive)}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}

            {isAdmin && (
              <>
                <div className="pt-3 pb-1">
                  {!collapsed ? (
                    <button
                      onClick={() => setAdminExpanded(!adminExpanded)}
                      className="w-full flex items-center gap-2 px-3 text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-600"
                    >
                      <Shield className="w-3 h-3" />
                      <span>Administración</span>
                      <ChevronLeft className={`w-3 h-3 ml-auto transition-transform ${adminExpanded ? '-rotate-90' : 'rotate-180'}`} />
                    </button>
                  ) : (
                    <div className="h-px bg-slate-200/60 mx-2" />
                  )}
                </div>
                {(adminExpanded || collapsed) && ADMIN_NAV_ITEMS.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/admin'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => linkClass(isActive)}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </>
            )}
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
              <button onClick={() => setSearchOpen(true)} className="w-9 h-9 rounded-full bg-white/50 flex items-center justify-center hover:bg-white/70 transition-colors" title="Buscar (⌘K)">
                <Search className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => navigate('/alertas')} className="w-9 h-9 rounded-full bg-white/50 flex items-center justify-center hover:bg-white/70 transition-colors relative">
                <Bell className="w-4 h-4 text-slate-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <button className="hidden sm:flex w-9 h-9 rounded-full bg-white/50 items-center justify-center hover:bg-white/70 transition-colors">
                <Settings className="w-4 h-4 text-slate-500" />
              </button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center ml-1 cursor-pointer">
                <span className="text-white text-[11px] font-bold">U</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pilot banner (only shown to PILOT tenants) */}
        <PilotBanner />

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

      {/* ── Floating Help & WhatsApp ── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5">
        <a href="https://wa.me/5215500000000?text=Hola%2C%20necesito%20ayuda%20con%20ADUANAI" target="_blank" rel="noopener noreferrer"
          className="w-11 h-11 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg shadow-[#25D366]/20 hover:scale-110 transition-transform" title="Contactar asesor">
          <MessageCircle className="w-5 h-5 text-white" />
        </a>
        <button onClick={() => navigate('/copilot')}
          className="w-11 h-11 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-110 transition-transform" title="Ayuda / Copilot IA">
          <HelpCircle className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  )
}
