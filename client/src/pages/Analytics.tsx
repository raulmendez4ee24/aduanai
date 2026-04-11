import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Target, DollarSign, Globe, Hash, ThumbsUp, ThumbsDown, AlertCircle } from 'lucide-react';

interface AnalyticsData {
  summary: {
    totalClassifications: number;
    totalQuotes: number;
    totalCopilot: number;
    avgConfidence: number;
    totalCustomsValue: number;
    avgCustomsValue: number;
  };
  topFractions: { fractionCode: string; count: number }[];
  topOrigins: { origin: string; count: number }[];
  feedbackStats: { feedback: string; count: number }[];
  operationStats: { status: string; count: number; avg_completeness: number }[];
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('aduanai_token')}` },
    })
      .then(r => r.json())
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(n);

  if (loading) return <div className="text-center text-slate-500 py-20">Cargando analytics...</div>;
  if (!data) return <div className="text-center text-slate-500 py-20">Error al cargar datos</div>;

  const s = data.summary;
  const totalFeedback = data.feedbackStats.reduce((acc, f) => acc + f.count, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <BarChart3 size={24} className="text-[#C9A84C]" />
            Analytics
          </h1>
          <p className="text-slate-400">Métricas de uso y rendimiento</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-[#0D1B2A] border border-[#1B2D45] rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-[#C9A84C]"
        >
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
          <option value={365}>Último año</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Clasificaciones', value: s.totalClassifications, icon: Target, color: '#C9A84C' },
          { label: 'Confianza promedio', value: `${s.avgConfidence}%`, icon: TrendingUp, color: s.avgConfidence >= 80 ? '#4CAF50' : '#FF9800' },
          { label: 'Cotizaciones', value: s.totalQuotes, icon: DollarSign, color: '#4CAF50' },
          { label: 'Valor total cotizado', value: fmt(s.totalCustomsValue), icon: DollarSign, color: '#2196F3', small: true },
        ].map((card) => (
          <div key={card.label} className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <card.icon size={16} style={{ color: card.color }} />
              <span className="text-xs text-slate-500">{card.label}</span>
            </div>
            <p className={`font-bold text-white ${card.small ? 'text-lg' : 'text-2xl'}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top fracciones */}
        <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Hash size={14} className="text-[#C9A84C]" />
            Top fracciones clasificadas
          </h3>
          {data.topFractions.length === 0 ? (
            <p className="text-sm text-slate-500">Sin datos aún</p>
          ) : (
            <div className="space-y-3">
              {data.topFractions.map((f, i) => (
                <div key={f.fractionCode} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-4">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm text-white">{f.fractionCode}</span>
                      <span className="text-xs text-slate-400">{f.count}x</span>
                    </div>
                    <div className="bg-[#1B2D45] rounded-full h-1.5">
                      <div
                        className="bg-[#C9A84C] h-1.5 rounded-full"
                        style={{ width: `${(f.count / (data.topFractions[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top origins */}
        <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Globe size={14} className="text-[#C9A84C]" />
            Top países de origen
          </h3>
          {data.topOrigins.length === 0 ? (
            <p className="text-sm text-slate-500">Sin datos aún</p>
          ) : (
            <div className="space-y-3">
              {data.topOrigins.map((o, i) => (
                <div key={o.origin} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-4">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white">{o.origin}</span>
                      <span className="text-xs text-slate-400">{o.count}x</span>
                    </div>
                    <div className="bg-[#1B2D45] rounded-full h-1.5">
                      <div
                        className="bg-[#4CAF50] h-1.5 rounded-full"
                        style={{ width: `${(o.count / (data.topOrigins[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feedback */}
        <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Feedback de clasificaciones</h3>
          {totalFeedback === 0 ? (
            <p className="text-sm text-slate-500">Sin feedback aún</p>
          ) : (
            <div className="space-y-3">
              {data.feedbackStats.map((f) => {
                const icon = f.feedback === 'correct' ? ThumbsUp : f.feedback === 'incorrect' ? ThumbsDown : AlertCircle;
                const color = f.feedback === 'correct' ? 'text-green-400' : f.feedback === 'incorrect' ? 'text-red-400' : 'text-yellow-400';
                const label = f.feedback === 'correct' ? 'Correctas' : f.feedback === 'incorrect' ? 'Incorrectas' : 'Parciales';
                const Icon = icon;
                return (
                  <div key={f.feedback} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={color} />
                      <span className="text-sm text-slate-300">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{f.count}</span>
                      <span className="text-xs text-slate-500">({Math.round(f.count / totalFeedback * 100)}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Operations */}
        <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Estado de expedientes</h3>
          {data.operationStats.length === 0 ? (
            <p className="text-sm text-slate-500">Sin expedientes aún</p>
          ) : (
            <div className="space-y-3">
              {data.operationStats.map((o) => {
                const labels: Record<string, string> = { DRAFT: 'Borrador', IN_PROGRESS: 'En progreso', COMPLETE: 'Completo', ARCHIVED: 'Archivado' };
                const colors: Record<string, string> = { DRAFT: 'bg-slate-400', IN_PROGRESS: 'bg-yellow-400', COMPLETE: 'bg-green-400', ARCHIVED: 'bg-slate-500' };
                return (
                  <div key={o.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${colors[o.status] || 'bg-slate-400'}`} />
                      <span className="text-sm text-slate-300">{labels[o.status] || o.status}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">{o.count}</span>
                      <span className="text-xs text-slate-500">{Math.round(o.avg_completeness)}% promedio</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
