import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Eye, Search, Plus, Trash2 } from 'lucide-react';
import { api, type Alert, type FractionSearchResult } from '../lib/api';

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [watched, setWatched] = useState<FractionSearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FractionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<'alerts' | 'monitor'>('alerts');

  useEffect(() => {
    api.alerts().then(r => setAlerts(r.data)).catch(() => {});
    api.watchedFractions().then(r => setWatched(r.data)).catch(() => {});
  }, []);

  const markAllRead = async () => {
    await api.alertMarkAllRead();
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  const searchFractions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await api.searchFractions(searchQuery);
      setSearchResults(res.data);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const addWatch = async (code: string) => {
    await api.watchFraction(code);
    const res = await api.watchedFractions();
    setWatched(res.data);
    setSearchResults([]);
    setSearchQuery('');
  };

  const removeWatch = async (code: string) => {
    await api.unwatchFraction(code);
    setWatched(prev => prev.filter(f => f.code !== code));
  };

  const unreadCount = alerts.filter(a => !a.read && a.type !== 'watch').length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Bell size={24} className="text-[#C9A84C]" />
          Alertas y Monitoreo
        </h1>
        <p className="text-slate-400">Recibe alertas de cambios regulatorios en tus fracciones</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setTab('alerts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'alerts' ? 'bg-[#C9A84C]/10 text-[#C9A84C]' : 'text-slate-400 hover:text-white'
          }`}
        >
          Alertas {unreadCount > 0 && <span className="ml-1 bg-[#C9A84C] text-[#0A1628] text-xs px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
        </button>
        <button
          onClick={() => setTab('monitor')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'monitor' ? 'bg-[#C9A84C]/10 text-[#C9A84C]' : 'text-slate-400 hover:text-white'
          }`}
        >
          Monitoreo ({watched.length})
        </button>
      </div>

      {tab === 'alerts' && (
        <div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-[#C9A84C] mb-4 transition-colors"
            >
              <CheckCheck size={14} />
              Marcar todas como leídas
            </button>
          )}

          {alerts.filter(a => a.type !== 'watch').length === 0 ? (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-12 text-center">
              <Bell size={36} className="text-[#1B2D45] mx-auto mb-4" />
              <p className="text-slate-500 mb-2">No tienes alertas</p>
              <p className="text-xs text-slate-600">Agrega fracciones al monitoreo para recibir alertas de cambios regulatorios</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.filter(a => a.type !== 'watch').map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-[#0D1B2A] border rounded-xl p-5 transition-colors ${
                    alert.read ? 'border-[#1B2D45]' : 'border-[#C9A84C]/20 bg-[#C9A84C]/5'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {!alert.read && <div className="w-2 h-2 bg-[#C9A84C] rounded-full" />}
                        <h3 className="text-sm font-semibold text-white">{alert.title}</h3>
                      </div>
                      <p className="text-sm text-slate-400">{alert.content}</p>
                      {alert.fractionCodes.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {alert.fractionCodes.map(code => (
                            <span key={code} className="font-mono text-xs bg-[#1B2D45] text-slate-300 px-2 py-0.5 rounded">{code}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 whitespace-nowrap">
                        {new Date(alert.createdAt).toLocaleDateString('es-MX')}
                      </span>
                      {!alert.read && (
                        <button
                          onClick={async () => {
                            await api.alertMarkRead(alert.id);
                            setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, read: true } : a));
                          }}
                          className="text-slate-500 hover:text-white"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'monitor' && (
        <div>
          {/* Search to add */}
          <form onSubmit={searchFractions} className="flex gap-3 mb-6">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0D1B2A] border border-[#1B2D45] rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
                placeholder="Buscar fracción para monitorear..."
              />
            </div>
            <button
              type="submit"
              disabled={searching || searchQuery.length < 2}
              className="bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] font-semibold px-6 rounded-xl transition-colors disabled:opacity-50"
            >
              Buscar
            </button>
          </form>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl mb-6 overflow-hidden">
              <p className="text-xs text-slate-500 px-4 pt-3">Resultados de búsqueda</p>
              {searchResults.map((f) => (
                <div key={f.code} className="flex items-center justify-between px-4 py-3 border-b border-[#1B2D45]/50 last:border-0 hover:bg-[#1B2D45]/20">
                  <div>
                    <span className="font-mono text-white text-sm">{f.codeFormatted}</span>
                    <p className="text-xs text-slate-400 mt-0.5 max-w-md truncate">{f.description}</p>
                  </div>
                  <button
                    onClick={() => addWatch(f.code)}
                    className="flex items-center gap-1 text-xs text-[#C9A84C] hover:text-[#E8D48B] transition-colors"
                  >
                    <Plus size={14} />
                    Monitorear
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Watched fractions */}
          <h3 className="text-sm font-semibold text-white mb-3">Fracciones monitoreadas ({watched.length})</h3>
          {watched.length === 0 ? (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-8 text-center">
              <p className="text-slate-500 text-sm">No tienes fracciones monitoreadas</p>
              <p className="text-xs text-slate-600 mt-1">Busca una fracción arriba para agregarla</p>
            </div>
          ) : (
            <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl overflow-hidden">
              {watched.map((f) => (
                <div key={f.code} className="flex items-center justify-between px-4 py-3 border-b border-[#1B2D45]/50 last:border-0">
                  <div>
                    <span className="font-mono text-white text-sm">{f.codeFormatted}</span>
                    <span className="text-xs text-slate-500 ml-3">NMF: {f.tariffNMF}%</span>
                    <p className="text-xs text-slate-400 mt-0.5 max-w-md truncate">{f.description}</p>
                  </div>
                  <button
                    onClick={() => removeWatch(f.code)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
