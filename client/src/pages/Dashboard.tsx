import { Link } from 'react-router-dom';
import { Search, Calculator, MessageSquare, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type StatsData } from '../lib/api';

function GaugeCircle({ value, size = 36 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 80 ? 'var(--emerald)' : value >= 60 ? 'var(--amber)' : 'var(--red)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-surface)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill="var(--text-primary)" fontSize={size * 0.25} fontFamily="var(--font-mono)" fontWeight="700">{value}</text>
    </svg>
  );
}

const TOOLS = [
  { title: 'Clasificador IA', desc: 'Clasifica productos con IA', icon: Search, path: '/clasificador', color: 'var(--cyan)' },
  { title: 'Cotizador', desc: 'Calcula landed cost', icon: Calculator, path: '/cotizador', color: 'var(--emerald)' },
  { title: 'Copilot', desc: 'Consulta normatividad', icon: MessageSquare, path: '/copilot', color: 'var(--indigo)' },
];

const fbIcon = (fb: string | null) => {
  if (fb === 'correct') return <CheckCircle size={13} style={{ color: 'var(--emerald)' }} />;
  if (fb === 'incorrect') return <XCircle size={13} style={{ color: 'var(--red)' }} />;
  if (fb === 'partial') return <AlertCircle size={13} style={{ color: 'var(--amber)' }} />;
  return null;
};

export function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  useEffect(() => { api.stats().then(r => setStats(r.data)).catch(() => {}); }, []);
  const c = stats?.counts ?? { classifications: 0, quotes: 0, copilotMessages: 0 };

  return (
    <div>
      <div className="mb-8 animate-fade-up">
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>Command Center</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Resumen de operaciones y herramientas</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Clasificaciones', value: c.classifications, icon: Search, color: 'var(--cyan)' },
          { label: 'Cotizaciones', value: c.quotes, icon: Calculator, color: 'var(--emerald)' },
          { label: 'Consultas', value: c.copilotMessages, icon: MessageSquare, color: 'var(--indigo)' },
        ].map((stat, i) => (
          <div key={stat.label} className={`glass card-hover rounded-2xl p-5 flex items-center gap-4 animate-fade-up delay-${(i+1)*100}`}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${stat.color}12` }}>
              <stat.icon size={20} style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{stat.value}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 animate-fade-up delay-300">
          {stats?.recentClassifications && stats.recentClassifications.length > 0 ? (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                  <Clock size={15} style={{ color: 'var(--cyan)' }} />Recientes
                </h2>
                <Link to="/historial" className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Ver todo<ArrowRight size={12} /></Link>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['PRODUCTO','FRACCIÓN','CONF','FB'].map(h => (
                      <th key={h} className={`${h==='PRODUCTO'?'text-left px-5':'px-3 text-center'} py-2 font-normal text-xs`} style={{ fontFamily:'var(--font-mono)', color:'var(--text-dim)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recentClassifications.map(cl => (
                    <tr key={cl.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3 max-w-[200px] truncate" style={{ color: 'var(--text-secondary)' }}>{cl.inputDescription}</td>
                      <td className="px-3 py-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{cl.fractionCode}</td>
                      <td className="px-3 py-3 text-center"><GaugeCircle value={cl.confidence} /></td>
                      <td className="px-3 py-3 text-center">{fbIcon(cl.feedback)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-surface)' }}>
                <Search size={24} style={{ color: 'var(--text-dim)' }} />
              </div>
              <p className="font-medium mb-1" style={{ fontFamily: 'var(--font-display)' }}>Sin clasificaciones</p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Haz tu primera clasificación</p>
              <Link to="/clasificador" className="btn-primary text-sm py-2.5 px-6 inline-flex items-center gap-2">Clasificar<ArrowRight size={14} /></Link>
            </div>
          )}
        </div>

        <div className="space-y-3 animate-fade-up delay-400">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            <TrendingUp size={15} style={{ color: 'var(--cyan)' }} />Herramientas
          </h2>
          {TOOLS.map(t => (
            <Link key={t.path} to={t.path} className="glass card-hover rounded-xl p-4 flex items-center gap-4 block">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${t.color}12` }}>
                <t.icon size={18} style={{ color: t.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{t.title}</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.desc}</p>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--text-dim)' }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
