import { useState } from 'react';
import { Search, BookOpen, Eye } from 'lucide-react';
import { api, type FractionSearchResult } from '../lib/api';

export function FractionsPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FractionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const r = await api.searchFractions(query);
      setResults(r.data);
    } catch { setResults([]); }
    setSearched(true);
    setLoading(false);
  };

  return (
    <div>
      <div className="mb-8 animate-fade-up">
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>Fracciones TIGIE</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Consulta las 8,183 fracciones arancelarias</p>
      </div>

      <form onSubmit={search} className="relative mb-8 max-w-2xl animate-fade-up delay-100">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: loading ? 'var(--cyan)' : 'var(--text-muted)' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Busca por código, descripción o palabra clave..."
          className="spotlight pr-28"
          style={{ fontSize: '14px' }}
        />
        <button type="submit" disabled={loading || !query.trim()}
          className="btn-primary absolute right-2 top-1/2 -translate-y-1/2 py-2.5 px-5 text-sm disabled:opacity-40">
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden animate-fade-up delay-200">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['FRACCIÓN', 'DESCRIPCIÓN', 'ARANCEL', 'UNIDAD', 'PERMISOS'].map(h => (
                  <th key={h} className="text-left px-5 py-3 font-normal text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(f => (
                <tr key={f.code} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{f.codeFormatted}</td>
                  <td className="px-5 py-3 max-w-[300px]" style={{ color: 'var(--text-secondary)' }}>
                    <p className="text-xs leading-relaxed">{f.description}</p>
                  </td>
                  <td className="px-5 py-3" style={{ fontFamily: 'var(--font-mono)' }}>
                    {f.tariffNMF !== null ? `${f.tariffNMF}%` : '—'}
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{f.unit || '—'}</td>
                  <td className="px-5 py-3">
                    {f.requiresPermit ? (
                      <span className="badge badge-amber text-[10px]">{f.permitType || 'Permiso'}</span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {searched && results.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center animate-fade-up">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No se encontraron fracciones para "{query}"</p>
        </div>
      )}

      {!searched && (
        <div className="glass rounded-2xl p-12 text-center animate-fade-up delay-200">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-surface)' }}>
            <BookOpen size={24} style={{ color: 'var(--text-dim)' }} />
          </div>
          <p className="font-medium mb-1" style={{ fontFamily: 'var(--font-display)' }}>Base de datos TIGIE</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Busca cualquier fracción arancelaria por código o descripción</p>
        </div>
      )}
    </div>
  );
}
