import { Link } from 'react-router-dom';
import { Search, Calculator, MessageSquare, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle, ArrowRight, AlertTriangle, ShieldAlert, BarChart3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type StatsData, type Alert, type VolumeDay } from '../lib/api';

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

// SVG bar chart for volume data
function VolumeChart({ data }: { data: VolumeDay[] }) {
  // Show last 14 days for readability
  const days = data.slice(-14);
  if (days.length === 0) return null;

  const maxVal = Math.max(...days.map(d => d.classifications + d.quotes), 1);
  const barW = 100 / days.length;
  const h = 140;
  const pad = 24;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <BarChart3 size={15} style={{ color: 'var(--cyan)' }} />Volumen de Operaciones
        </h2>
        <div className="flex items-center gap-4 text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--cyan)' }} />Clasificaciones</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--emerald)' }} />Cotizaciones</span>
        </div>
      </div>
      <div className="px-5 pb-5">
        <svg width="100%" height={h + pad} viewBox={`0 0 ${days.length * barW} ${h + pad}`} preserveAspectRatio="none">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => (
            <line key={pct} x1="0" y1={h * (1 - pct)} x2={days.length * barW} y2={h * (1 - pct)}
              stroke="var(--border)" strokeWidth="0.3" />
          ))}
          {days.map((d, i) => {
            const classH = (d.classifications / maxVal) * h;
            const quoteH = (d.quotes / maxVal) * h;
            const x = i * barW + barW * 0.15;
            const w = barW * 0.32;
            const dayLabel = d.date.slice(8, 10);
            return (
              <g key={d.date}>
                {/* Classification bar */}
                <rect x={x} y={h - classH} width={w} height={classH}
                  rx="2" fill="var(--cyan)" opacity="0.85">
                  <animate attributeName="height" from="0" to={classH} dur="0.5s" fill="freeze" />
                  <animate attributeName="y" from={h} to={h - classH} dur="0.5s" fill="freeze" />
                </rect>
                {/* Quotes bar */}
                <rect x={x + w + barW * 0.02} y={h - quoteH} width={w} height={quoteH}
                  rx="2" fill="var(--emerald)" opacity="0.85">
                  <animate attributeName="height" from="0" to={quoteH} dur="0.5s" fill="freeze" />
                  <animate attributeName="y" from={h} to={h - quoteH} dur="0.5s" fill="freeze" />
                </rect>
                {/* Day label */}
                <text x={x + w} y={h + 14} textAnchor="middle" fontSize="7"
                  fontFamily="var(--font-mono)" fill="var(--text-dim)">{dayLabel}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
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

const alertIcon = (type: string) => {
  if (type === 'compliance' || type === 'nom_change') return <ShieldAlert size={14} style={{ color: 'var(--rose)' }} />;
  if (type === 'tariff_change') return <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />;
  return <AlertCircle size={14} style={{ color: 'var(--cyan)' }} />;
};

export function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [volume, setVolume] = useState<VolumeDay[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    api.stats().then(r => setStats(r.data)).catch(() => {});
    api.statsVolume(30).then(r => setVolume(r.data)).catch(() => {});
    api.alerts().then(r => setAlerts(r.data.slice(0, 5))).catch(() => {});
  }, []);

  const c = stats?.counts ?? { classifications: 0, quotes: 0, copilotMessages: 0 };

  return (
    <div>
      <div className="mb-8 animate-fade-up">
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>Command Center</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Resumen de operaciones y herramientas</p>
      </div>

      {/* KPI Cards */}
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

      {/* Volume Chart */}
      {volume.length > 0 && (
        <div className="mb-8 animate-fade-up delay-200">
          <VolumeChart data={volume} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Classifications */}
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

        {/* Right Column: Alerts + Tools */}
        <div className="space-y-6 animate-fade-up delay-400">
          {/* Compliance Alerts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                <ShieldAlert size={15} style={{ color: 'var(--rose)' }} />Alertas Compliance
              </h2>
              <Link to="/alertas" className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Ver todas<ArrowRight size={12} /></Link>
            </div>
            {alerts.length > 0 ? (
              <div className="space-y-2">
                {alerts.map(a => (
                  <div key={a.id} className="glass rounded-xl p-3.5 flex items-start gap-3" style={{ opacity: a.read ? 0.6 : 1 }}>
                    <div className="mt-0.5 shrink-0">{alertIcon(a.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ fontFamily: 'var(--font-display)' }}>{a.title}</p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{a.content}</p>
                      {a.fractionCodes.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {a.fractionCodes.slice(0, 3).map(code => (
                            <span key={code} className="badge-cyan" style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{code}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="glass rounded-xl p-6 text-center">
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Sin alertas pendientes</p>
              </div>
            )}
          </div>

          {/* Quick Tools */}
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              <TrendingUp size={15} style={{ color: 'var(--cyan)' }} />Herramientas
            </h2>
            {TOOLS.map(t => (
              <Link key={t.path} to={t.path} className="glass card-hover rounded-xl p-4 flex items-center gap-4 block mb-2">
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
    </div>
  );
}
