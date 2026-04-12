import { Link, useLocation } from 'react-router-dom';
import { Search, Calculator, MessageSquare, LayoutDashboard, LogOut, History, Menu, X, Bell, FolderOpen, BarChart3, Warehouse, Shield, FileSignature, Package, RefreshCw } from 'lucide-react';
import { type ReactNode, useState } from 'react';

const NAV_ITEMS = [
  { path: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clasificador', label: 'Clasificador', icon: Search },
  { path: '/cotizador', label: 'Cotizador', icon: Calculator },
  { path: '/copilot', label: 'Copilot', icon: MessageSquare },
  { path: '/historial', label: 'Historial', icon: History },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/inventario', label: 'Inventario IMMEX', icon: Warehouse },
  { path: '/fiscal', label: 'Fiscal Guardian', icon: Shield },
  { path: '/mve', label: 'Auto MVE', icon: FileSignature },
  { path: '/logistics', label: 'Logistica', icon: Package },
  { path: '/updates', label: 'Actualizaciones', icon: RefreshCw },
  { path: '/expediente', label: 'Expediente', icon: FolderOpen },
  { path: '/alertas', label: 'Alertas', icon: Bell },
];

export function Layout({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-deep)' }}>
      <button onClick={() => setOpen(true)} className="fixed top-4 left-4 z-50 md:hidden w-10 h-10 rounded-xl flex items-center justify-center glass">
        <Menu size={18} style={{ color: 'var(--text-secondary)' }} />
      </button>

      {open && <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setOpen(false)} />}

      <aside className={`fixed md:static z-50 md:z-auto w-60 h-full flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} style={{ background: 'var(--bg-base)', borderRight: '1px solid var(--border)' }}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dim))' }}>
              <span className="font-black text-xs" style={{ fontFamily: 'var(--font-display)', color: 'var(--bg-deep)' }}>A</span>
            </div>
            <div>
              <span className="text-base font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}><span style={{ color: 'var(--cyan)' }}>ADUANA</span>I</span>
              <p className="text-[10px] -mt-0.5" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>COMMAND CENTER</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="md:hidden" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
                style={{ background: active ? 'var(--cyan-glow)' : 'transparent', color: active ? 'var(--cyan)' : 'var(--text-muted)', border: active ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent' }}>
                <Icon size={17} />{item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onLogout} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] w-full transition-all" style={{ color: 'var(--text-dim)' }}>
            <LogOut size={17} />Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-h-screen mesh-gradient">
        <div className="max-w-6xl mx-auto p-6 md:p-8 pt-16 md:pt-8">{children}</div>
      </main>
    </div>
  );
}
