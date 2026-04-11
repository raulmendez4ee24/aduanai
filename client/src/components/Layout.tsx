import { Link, useLocation } from 'react-router-dom';
import { Search, Calculator, MessageSquare, LayoutDashboard, LogOut, History, Menu, X, Bell, FolderOpen } from 'lucide-react';
import { type ReactNode, useState } from 'react';

const NAV_ITEMS = [
  { path: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clasificador', label: 'Clasificador', icon: Search },
  { path: '/cotizador', label: 'Cotizador', icon: Calculator },
  { path: '/copilot', label: 'Copilot', icon: MessageSquare },
  { path: '/historial', label: 'Historial', icon: History },
  { path: '/expediente', label: 'Expediente', icon: FolderOpen },
  { path: '/alertas', label: 'Alertas', icon: Bell },
];

export function Layout({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden bg-[#0D1B2A] border border-[#1B2D45] rounded-lg p-2 text-slate-400 hover:text-white transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-[#0D1B2A] border-r border-[#1B2D45] flex flex-col transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        {/* Logo */}
        <div className="p-6 border-b border-[#1B2D45] flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-[#C9A84C]">ADUANA</span>
              <span className="text-white">I</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">Comercio Exterior con IA</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20'
                    : 'text-slate-400 hover:text-white hover:bg-[#1B2D45]'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-[#1B2D45]">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-400/5 transition-all w-full"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-[#0A1628] overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 pt-16 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
