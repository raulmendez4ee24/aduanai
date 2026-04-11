import { Link } from 'react-router-dom';
import { Search, Calculator, MessageSquare, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type StatsData } from '../lib/api';

const FEATURES = [
  {
    title: 'Clasificador IA',
    description: 'Clasifica productos en fracciones TIGIE con inteligencia artificial',
    icon: Search,
    path: '/clasificador',
    color: '#C9A84C',
  },
  {
    title: 'Cotizador',
    description: 'Calcula impuestos, aranceles y landed cost en segundos',
    icon: Calculator,
    path: '/cotizador',
    color: '#4CAF50',
  },
  {
    title: 'Compliance Copilot',
    description: 'Consulta normatividad aduanera mexicana con IA',
    icon: MessageSquare,
    path: '/copilot',
    color: '#2196F3',
  },
];

const feedbackIcon = (fb: string | null) => {
  if (fb === 'correct') return <CheckCircle size={14} className="text-green-400" />;
  if (fb === 'incorrect') return <XCircle size={14} className="text-red-400" />;
  if (fb === 'partial') return <AlertCircle size={14} className="text-yellow-400" />;
  return null;
};

export function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    api.stats().then((res) => setStats(res.data)).catch(() => {});
  }, []);

  const counts = stats?.counts ?? { classifications: 0, quotes: 0, copilotMessages: 0 };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Bienvenido a ADUANAI</h1>
        <p className="text-slate-400">Tu plataforma de comercio exterior con inteligencia artificial</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Clasificaciones', value: counts.classifications, icon: Search, delay: 'delay-100' },
          { label: 'Cotizaciones', value: counts.quotes, icon: Calculator, delay: 'delay-200' },
          { label: 'Consultas Copilot', value: counts.copilotMessages, icon: MessageSquare, delay: 'delay-300' },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-5 flex items-center gap-4 animate-fade-in ${stat.delay}`}
          >
            <div className="bg-[#C9A84C]/10 p-3 rounded-lg">
              <stat.icon size={20} className="text-[#C9A84C]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-sm text-slate-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent classifications */}
      {stats?.recentClassifications && stats.recentClassifications.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={18} className="text-[#C9A84C]" />
            Clasificaciones recientes
          </h2>
          <div className="bg-[#0D1B2A] border border-[#1B2D45] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1B2D45]">
                  <th className="text-left p-4 text-slate-500 font-normal">Producto</th>
                  <th className="text-left p-4 text-slate-500 font-normal">Fracción</th>
                  <th className="text-center p-4 text-slate-500 font-normal">Confianza</th>
                  <th className="text-center p-4 text-slate-500 font-normal">Estado</th>
                  <th className="text-right p-4 text-slate-500 font-normal">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentClassifications.map((c) => (
                  <tr key={c.id} className="border-b border-[#1B2D45]/50 last:border-0 hover:bg-[#1B2D45]/20">
                    <td className="p-4 text-slate-300 max-w-[200px] truncate">{c.inputDescription}</td>
                    <td className="p-4 font-mono text-white">{c.fractionCode}</td>
                    <td className="p-4 text-center">
                      <span className={`font-semibold ${
                        c.confidence >= 80 ? 'text-green-400' :
                        c.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {c.confidence}%
                      </span>
                    </td>
                    <td className="p-4 text-center">{feedbackIcon(c.feedback)}</td>
                    <td className="p-4 text-right text-slate-500 text-xs">
                      {new Date(c.createdAt).toLocaleDateString('es-MX')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feature cards */}
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-[#C9A84C]" />
        Herramientas
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map((feature, i) => (
          <Link
            key={feature.path}
            to={feature.path}
            className={`group bg-[#0D1B2A] border border-[#1B2D45] rounded-xl p-6 hover:border-[#C9A84C]/30 transition-all animate-slide-in ${i === 0 ? 'delay-200' : i === 1 ? 'delay-300' : 'delay-400'}`}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ backgroundColor: `${feature.color}15` }}
            >
              <feature.icon size={20} style={{ color: feature.color }} />
            </div>
            <h3 className="text-white font-semibold mb-1 group-hover:text-[#C9A84C] transition-colors">
              {feature.title}
            </h3>
            <p className="text-sm text-slate-400">{feature.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
