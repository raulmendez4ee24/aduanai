/**
 * SELLO · Shell v2 — layout autenticado del rediseño (docs/DESIGN_SYSTEM.md).
 *
 * Sidebar fija (papel-2, borde derecho línea) + contenido (papel) + topbar con
 * breadcrumb y acciones contextuales + command palette (Cmd+K/Ctrl+K).
 * Responsive: <1024px la sidebar colapsa a drawer (hamburguesa; Escape y
 * click-fuera cierran; navegar cierra). Teclado completo y focus visible.
 *
 * Reemplaza a AppLayout (v1) como layout route: las páginas se renderizan vía
 * <Outlet/> SIN rediseñar su contenido (prompts 4-6). Monta los globales que
 * vivían en AppLayout para no romper nada: ToastHost, PilotBanner, DemoBanner.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, Search, LogOut, ChevronDown, ChevronRight } from 'lucide-react'
import { ToastHost } from '../Toast'
import { PilotBanner } from '../PilotBanner'
import { DemoBanner } from '../DemoBanner'
import { CommandPalette } from './CommandPalette'
import { NAV_PRINCIPAL, NAV_HERRAMIENTAS, NAV_ADMIN, labelDeRuta, type NavItem } from './nav'

// ── Acciones contextuales del topbar ─────────────────────────────────────
// Las páginas (cuando migren) publican sus acciones con useShellActions(<botones/>).
const ShellActionsContext = createContext<{ setAcciones: (n: ReactNode) => void }>({ setAcciones: () => {} })

export function useShellActions(nodo: ReactNode) {
  const { setAcciones } = useContext(ShellActionsContext)
  useEffect(() => {
    setAcciones(nodo)
    return () => setAcciones(null)
  }, [nodo, setAcciones])
}

// ── Ítem de navegación ────────────────────────────────────────────────────
function NavEntry({ item, onNavegar, compacto = false }: { item: NavItem; onNavegar: () => void; compacto?: boolean }) {
  return (
    <NavLink
      to={item.path}
      onClick={onNavegar}
      className={({ isActive }) => [
        'relative flex items-center gap-3 font-sello-ui rounded-sello-sm mx-2',
        compacto ? 'px-3 py-1.5 text-sm' : 'px-3 py-2 text-sm',
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-1 focus-visible:ring-offset-papel-2',
        isActive
          ? 'bg-petroleo-suave text-petroleo font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-petroleo'
          : 'text-tinta-suave hover:text-tinta hover:bg-papel',
      ].join(' ')}
    >
      <item.icono className="w-[18px] h-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

function GrupoColapsable({ titulo, items, onNavegar, defaultAbierto = false }: {
  titulo: string; items: NavItem[]; onNavegar: () => void; defaultAbierto?: boolean
}) {
  const location = useLocation()
  const contieneActiva = items.some(i => i.path === location.pathname)
  const [abierto, setAbierto] = useState(defaultAbierto || contieneActiva)
  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-5 py-2 text-13 uppercase tracking-wide text-tinta-suave font-sello-ui hover:text-tinta transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-1 focus-visible:ring-offset-papel-2 rounded-sello-sm"
      >
        {abierto ? <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden /> : <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />}
        {titulo}
      </button>
      {abierto && (
        <div className="space-y-0.5 pb-2">
          {items.map(i => <NavEntry key={i.path} item={i} onNavegar={onNavegar} compacto />)}
        </div>
      )}
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────
export interface AppShellProps {
  onLogout: () => void
  userRole?: string
  userName?: string
  userEmail?: string
  tenantName?: string
}

export function AppShell({ onLogout, userRole, userName, userEmail, tenantName }: AppShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const [paletteAbierto, setPaletteAbierto] = useState(false)
  const [acciones, setAcciones] = useState<ReactNode>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const esSuperAdmin = userRole === 'SUPERADMIN'

  // Cmd+K / Ctrl+K abre el palette; Escape cierra drawer y palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteAbierto(v => !v)
      } else if (e.key === 'Escape') {
        setDrawerAbierto(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Navegar cierra el drawer (móvil)
  useEffect(() => { setDrawerAbierto(false) }, [location.pathname])

  const ctxAcciones = useMemo(() => ({ setAcciones }), [])

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Wordmark */}
      <div className="px-5 pt-5 pb-4 border-b border-linea">
        <NavLink
          to="/app"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-2 focus-visible:ring-offset-papel-2 rounded-sello-sm inline-block"
        >
          <span className="font-sello-display text-22 text-tinta">ADUANAI</span>
        </NavLink>
        <p className="text-13 text-tinta-suave font-sello-ui mt-0.5">Cumplimiento aduanero verificable</p>
      </div>

      {/* Búsqueda (abre palette) */}
      <button
        type="button"
        onClick={() => setPaletteAbierto(true)}
        className="mx-4 mt-4 mb-2 flex items-center gap-2 px-3 py-2 bg-superficie border border-linea rounded-sello-sm text-sm text-tinta-suave font-sello-ui hover:border-petroleo/40 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-2 focus-visible:ring-offset-papel-2"
      >
        <Search className="w-4 h-4" strokeWidth={1.5} aria-hidden />
        <span>Buscar…</span>
        <kbd className="ml-auto text-13 font-sello-mono border border-linea rounded-sello-sm px-1.5">⌘K</kbd>
      </button>

      {/* Navegación principal */}
      <nav aria-label="Navegación principal" className="mt-2 space-y-0.5">
        {NAV_PRINCIPAL.map(i => <NavEntry key={i.path} item={i} onNavegar={() => setDrawerAbierto(false)} />)}
      </nav>

      {/* Resto de herramientas + admin (colapsables; nada huérfano) */}
      <div className="mt-4 flex-1 overflow-y-auto border-t border-linea pt-2" aria-label="Más herramientas">
        <GrupoColapsable titulo="Más herramientas" items={NAV_HERRAMIENTAS} onNavegar={() => setDrawerAbierto(false)} />
        {esSuperAdmin && (
          <GrupoColapsable titulo="Administración" items={NAV_ADMIN} onNavegar={() => setDrawerAbierto(false)} />
        )}
      </div>

      {/* Menú de usuario */}
      <div className="border-t border-linea px-5 py-4">
        <p className="text-sm font-medium text-tinta font-sello-ui truncate">{userName ?? userEmail ?? 'Usuario'}</p>
        {tenantName && <p className="text-13 text-tinta-suave font-sello-ui truncate">{tenantName}</p>}
        <button
          type="button"
          onClick={() => { onLogout(); navigate('/login') }}
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-carmin font-sello-ui transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-2 focus-visible:ring-offset-papel-2 rounded-sello-sm"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} aria-hidden />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <ShellActionsContext.Provider value={ctxAcciones}>
      <div className="min-h-screen bg-papel text-tinta font-sello-ui">
        {/* Sidebar fija (≥1024px) */}
        <aside className="hidden lg:flex print:lg:hidden fixed inset-y-0 left-0 w-64 bg-papel-2 border-r border-linea flex-col z-30">
          {sidebar}
        </aside>

        {/* Drawer (<1024px) */}
        {drawerAbierto && (
          <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menú de navegación">
            <div className="absolute inset-0 bg-tinta/30" onMouseDown={() => setDrawerAbierto(false)} />
            <div ref={drawerRef} className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-papel-2 border-r border-linea shadow-sello-float flex flex-col">
              <button
                type="button"
                onClick={() => setDrawerAbierto(false)}
                aria-label="Cerrar menú"
                className="absolute top-4 right-3 p-1.5 text-tinta-suave hover:text-tinta rounded-sello-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
              {sidebar}
            </div>
          </div>
        )}

        {/* Contenido */}
        <div className="lg:pl-64 print:lg:pl-0 flex flex-col min-h-screen">
          {/* Topbar */}
          <header className="sticky top-0 z-20 bg-papel/95 border-b border-linea print:hidden">
            <div className="flex items-center gap-3 px-4 lg:px-8 h-14">
              <button
                type="button"
                onClick={() => setDrawerAbierto(true)}
                aria-label="Abrir menú"
                className="lg:hidden p-1.5 text-tinta-suave hover:text-tinta rounded-sello-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
              >
                <Menu className="w-5 h-5" strokeWidth={1.5} />
              </button>

              {/* Breadcrumb */}
              <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex items-center gap-2 text-sm font-sello-ui">
                  <li className="hidden sm:block text-tinta-suave">ADUANAI</li>
                  <li className="hidden sm:block text-tinta-suave" aria-hidden>/</li>
                  <li className="text-tinta font-medium truncate" aria-current="page">{labelDeRuta(location.pathname)}</li>
                </ol>
              </nav>

              {/* Acciones contextuales de la página + búsqueda móvil */}
              <div className="ml-auto flex items-center gap-2">
                {acciones}
                <button
                  type="button"
                  onClick={() => setPaletteAbierto(true)}
                  aria-label="Buscar (⌘K)"
                  className="lg:hidden p-1.5 text-tinta-suave hover:text-tinta rounded-sello-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
                >
                  <Search className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </header>

          {/* Banners globales heredados (sin rediseñar aún) */}
          <PilotBanner />
          <DemoBanner />

          <main className="flex-1 px-4 lg:px-8 py-6">
            <Outlet />
          </main>
        </div>

        <CommandPalette abierto={paletteAbierto} onCerrar={() => setPaletteAbierto(false)} esSuperAdmin={esSuperAdmin} />
        <ToastHost />
      </div>
    </ShellActionsContext.Provider>
  )
}
