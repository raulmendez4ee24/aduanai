import { useEffect, useState } from 'react';
import { Search, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type ClassificationRecord } from '../lib/api';

const feedbackBadge = (fb: string | null | undefined) => {
  if (fb === 'correct') return <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-400 text-xs px-2 py-0.5 rounded"><CheckCircle size={10} /> Correcta</span>;
  if (fb === 'incorrect') return <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded"><XCircle size={10} /> Incorrecta</span>;
  if (fb === 'partial') return <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-400 text-xs px-2 py-0.5 rounded"><AlertCircle size={10} /> Parcial</span>;
  return <span className="text-xs text-slate-600">Sin feedback</span>;
};

export function HistoryPage() {
  const [records, setRecords] = useState<ClassificationRecord[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async (s: string, p: number) => {
    setLoading(true);
    try {
      const res = await api.classifyHistory(s || undefined, p);
      setRecords(res.data);
      setTotal(res.pagination.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(search, page);
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchHistory(search, 1);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Historial de Clasificaciones</h1>
        <p className="text-slate-400">{total} clasificaciones realizadas</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0D1B2A] border border-[#1B2D45] rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
            placeholder="Buscar por producto o fracción..."
          />
        </div>
        <button
          type="submit"
          className="bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] font-semibold px-6 rounded-xl transition-colors"
        >
          Buscar
        </button>
      </form>

      {/* Table */}
      <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Cargando...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            {search ? 'No se encontraron resultados' : 'Aún no hay clasificaciones'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1B2D45]">
                <th className="text-left p-4 text-slate-500 font-normal">Producto</th>
                <th className="text-left p-4 text-slate-500 font-normal">Fracción</th>
                <th className="text-center p-4 text-slate-500 font-normal">Confianza</th>
                <th className="text-center p-4 text-slate-500 font-normal">Feedback</th>
                <th className="text-right p-4 text-slate-500 font-normal">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-[#1B2D45]/50 last:border-0 hover:bg-[#1B2D45]/20">
                  <td className="p-4 text-slate-300 max-w-[300px]">
                    <p className="truncate">{r.inputDescription}</p>
                  </td>
                  <td className="p-4 font-mono text-white">{r.fractionCode}</td>
                  <td className="p-4 text-center">
                    <span className={`font-semibold ${
                      r.confidence >= 80 ? 'text-green-400' :
                      r.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {r.confidence}%
                    </span>
                  </td>
                  <td className="p-4 text-center">{feedbackBadge(r.feedback)}</td>
                  <td className="p-4 text-right text-slate-500 text-xs whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString('es-MX', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-[#1B2D45] text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg bg-[#1B2D45] text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
