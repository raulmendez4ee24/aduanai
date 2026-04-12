import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Calculator, MessageSquare, LayoutDashboard, LogOut, History, Menu, X, Bell, FolderOpen, BarChart3, Warehouse, Shield, FileSignature, Package, RefreshCw, FileCheck, Phone, BookOpen, ChevronDown } from 'lucide-react';
import { type ReactNode, useState, useEffect, useRef } from 'react';
import { api, type FractionSearchResult } from '../lib/api';

const NAV_SECTIONS = [
  {
    label: 'PRINCIPAL',
    items: [
      { path: '/app', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/clasificador', label: 'Clasificador', icon: Search },
      { path: '/cotizador', label: 'Cotizador', icon: Calculator },
      { path: '/copilot', label: 'Copilot', icon: MessageSquare },
    ],
  },
  {
    label: 'OPERACIONES',
    items: [
      { path: '/expediente', label: 'Expediente', icon: FolderOpen },
      { path: '/prevalidador', label: 'Pre-Validador', icon: FileCheck },
      { path: '/mve', label: 'Auto MVE', icon: FileSignature },
      { path: '/logistics', label: 'Logística', icon: Package },
      { path: '/inventario', label: 'Inventario IMMEX', icon: Warehouse },
    ],
  },
  {
    label: 'COMPLIANCE',
    items: [
      { path: '/fiscal', label: 'Fiscal Guardian', icon: Shield },
      { path: '/alertas', label: 'Alertas', icon: Bell },
      { path: '/updates', label: 'Actualizaciones', icon: RefreshCw },
    ],
  },
  {
    label: 'DATOS',
    items: [
      { path: '/fracciones', label: 'Fracciones TIGIE', icon: BookOpen },
      { path: '/historial', label: 'Historial', icon: History },
      { path: '/analytics', label: 'Analytics', icon: BarChart3 },
      { path: '/whatsapp', label: 'WhatsApp Bot', icon: Phone },
    ],
  },
];

function HeaderSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FractionSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = (q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      api.searchFractions(q)
        .then(r => { setResults(r.data.slice(0, 8)); setOpen(true); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
  };

  return (
    <div ref={ref} className="relative flex-1 max-w-md">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: loading ? 'var(--cyan)' : 'var(--text-dim)' }} />
      <input
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder="Buscar fracción, producto..."
        className="input pl-10 py-2.5 text-xs"
        style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 glass rounded-xl overflow-hidden z-50 shadow-lg" style={{ border: '1px solid var(--border-hover)' }}>
          {results.map(f => (
            <button key={f.code} onClick={() => { navigate('/fracciones'); setOpen(false); setQuery(''); }}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.03] transition-colors"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-bold shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{f.codeFormatted}</span>
              <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{f.description}</span>
              {f.tariffNMF !== null && (
                <span className="text-[10px] shrink-0 ml-auto" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{f.tariffNMF}%</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    api.updaterUnreadCount()
      .then(r => setCount(r.data.count))
      .catch(() => {});
  }, []);

  return (
    <Link to="/updates" className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/[0.05]">
      <Bell size={17} style={{ color: 'var(--text-muted)' }} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[9px] font-bold px-1"
          style={{ background: 'var(--rose)', color: 'white', fontFamily: 'var(--font-mono)' }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

export function Layout({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (label: string) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  };

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

        <nav className="flex-1 p-3 overflow-y-auto">
          {NAV_SECTIONS.map(section => {
            const isCollapsed = collapsed[section.label];
            return (
              <div key={section.label} className="mb-1">
                <button onClick={() => toggleSection(section.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 mb-0.5"
                  style={{ color: 'var(--text-dim)' }}>
                  <span className="text-[9px] font-bold tracking-widest" style={{ fontFamily: 'var(--font-mono)' }}>{section.label}</span>
                  <ChevronDown size={10} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {section.items.map(item => {
                      const active = location.pathname === item.path;
                      const Icon = item.icon;
                      return (
                        <Link key={item.path} to={item.path} onClick={() => setOpen(false)}
                          className="flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all"
                          style={{
                            background: active ? 'var(--cyan-glow)' : 'transparent',
                            color: active ? 'var(--cyan)' : 'var(--text-muted)',
                            border: active ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
                          }}>
                          <Icon size={16} />{item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onLogout} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] w-full transition-all" style={{ color: 'var(--text-dim)' }}>
            <LogOut size={17} />Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-6 md:px-8 py-3" style={{ background: 'rgba(11,17,32,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
          <div className="md:hidden w-10" /> {/* spacer for mobile menu button */}
          <HeaderSearch />
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto mesh-gradient">
          <div className="max-w-6xl mx-auto p-6 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
