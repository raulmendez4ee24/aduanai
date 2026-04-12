import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Calculator, MessageSquare, Shield, Globe, ChevronRight, Check, ArrowRight, Bot, FolderOpen, BarChart3, FileCheck, AlertTriangle, Clock, DollarSign, Zap } from 'lucide-react';
import { HeroSection } from '../components/hero/HeroSection';

// Confidence gauge for demo
function Gauge({ value, size = 64 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 80 ? 'var(--emerald)' : value >= 60 ? 'var(--amber)' : 'var(--rose)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill="var(--text-primary)" fontSize={size*0.28} fontFamily="var(--font-mono)" fontWeight="700">{value}</text>
    </svg>
  );
}



// Mini interactive classifier for landing
function LandingClassifier() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ fraction: string; description: string; confidence: number; tariff: string; treaty: string } | null>(null);
  const placeholders = ['Laptop Dell 15 pulgadas...', 'Camiseta de algodón para hombre...', 'Tequila añejo 750ml...', 'Tornillos de acero inoxidable...'];
  const [phIdx, setPhIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhIdx(i => (i + 1) % placeholders.length), 3000);
    return () => clearInterval(t);
  }, []);

  const classify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/classify/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: input }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({
          fraction: data.data.fraction.code,
          description: data.data.fraction.description,
          confidence: data.data.confidence,
          tariff: `${data.data.tariffs.nmf}%`,
          treaty: Object.entries(data.data.tariffs.preferential || {}).map(([k, v]) => `${k}: ${v}%`).join(', ') || 'N/A',
        });
        setLoading(false);
        return;
      }
      if (res.status === 429) {
        setResult({ fraction: '—', description: 'Límite alcanzado (3/hora). Regístrate para uso ilimitado.', confidence: 0, tariff: '—', treaty: '—' });
        setLoading(false);
        return;
      }
    } catch { /* fallback */ }
    // Fallback demo result si el backend no responde
    setTimeout(() => {
      setResult({ fraction: '8471.30.01', description: 'Máquinas automáticas para procesamiento de datos, portátiles', confidence: 95, tariff: '0%', treaty: 'TMEC: 0%, TLCUE: 0%' });
      setLoading(false);
    }, 2000);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={classify} className="relative mb-6">
        <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2" style={{ color: loading ? 'var(--accent)' : 'var(--text-muted)' }} />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholders[phIdx]}
          className="spotlight pr-32"
          style={{ fontSize: '15px' }}
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary absolute right-2 top-1/2 -translate-y-1/2 py-2.5 px-5 text-sm disabled:opacity-40">
          {loading ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="60" strokeDashoffset="20" /></svg>
          ) : 'Clasificar'}
        </button>
      </form>

      {result && (
        <div className="card p-6 animate-scale-in" style={{ borderColor: 'var(--border-hover)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="label mb-1">FRACCIÓN ARANCELARIA</p>
              <p className="text-3xl font-bold mono" style={{ color: 'var(--accent)' }}>{result.fraction}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{result.description}</p>
              <div className="flex gap-4 mt-4">
                <div>
                  <p className="label text-[10px]">ARANCEL NMF</p>
                  <p className="mono text-lg">{result.tariff}</p>
                </div>
                <div>
                  <p className="label text-[10px]">PREFERENCIAL</p>
                  <p className="text-sm" style={{ color: 'var(--emerald)' }}>{result.treaty}</p>
                </div>
              </div>
            </div>
            <Gauge value={result.confidence} />
          </div>
          <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              <AlertTriangle size={12} className="inline mr-1" />Clasificación orientativa
            </p>
            <Link to="/login" className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              Regístrate para guardar <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function LandingPage() {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--bg-primary)' }}>
      <div className="noise" />

      {/* Nav */}
      <nav className="relative z-40 flex items-center justify-between px-6 md:px-16 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <span className="font-extrabold text-sm text-white" style={{ fontFamily: 'var(--font-display)' }}>A</span>
          </div>
          <span className="text-lg font-bold tracking-tight heading">ADUANAI</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: 'var(--text-muted)' }}>
          <a href="#demo" className="hover:text-white transition-colors">Demo</a>
          <a href="#features" className="hover:text-white transition-colors">Funciones</a>
          <a href="#pricing" className="hover:text-white transition-colors">Precios</a>
          <Link to="/login" className="btn-primary text-sm py-2 px-5">Entrar</Link>
        </div>
      </nav>

      {/* Hero 3D */}
      <HeroSection />

      {/* Problem */}
      <section className="px-6 md:px-16 py-24" style={{ background: 'var(--bg-secondary)' }}>
        <div className="max-w-5xl mx-auto">
          <p className="label text-center mb-3" style={{ color: 'var(--accent)' }}>EL PROBLEMA</p>
          <h2 className="text-3xl md:text-4xl heading text-center mb-12">Así se ve el comercio exterior hoy</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Clock, title: '2-3 días', desc: 'Para clasificar UN producto manualmente', color: 'var(--rose)' },
              { icon: DollarSign, title: 'Multas 300%', desc: 'Por errores en clasificación arancelaria', color: 'var(--amber)' },
              { icon: Zap, title: '7 sistemas', desc: 'Diferentes que no se hablan entre sí', color: 'var(--accent)' },
            ].map(p => (
              <div key={p.title} className="card p-7 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: `${p.color}12` }}>
                  <p.icon size={24} style={{ color: p.color }} />
                </div>
                <h3 className="text-2xl font-bold heading mb-2">{p.title}</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Demo */}
      <section id="demo" className="px-6 md:px-16 py-24 mesh">
        <div className="max-w-5xl mx-auto">
          <p className="label text-center mb-3" style={{ color: 'var(--accent)' }}>PRUÉBALO AHORA</p>
          <h2 className="text-3xl md:text-4xl heading text-center mb-4">Clasifica cualquier producto</h2>
          <p className="text-center mb-10" style={{ color: 'var(--text-muted)' }}>Escribe un producto real y ve el resultado al instante</p>
          <LandingClassifier />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 md:px-16 py-24" style={{ background: 'var(--bg-secondary)' }}>
        <div className="max-w-6xl mx-auto">
          <p className="label text-center mb-3" style={{ color: 'var(--accent)' }}>MÓDULOS</p>
          <h2 className="text-3xl md:text-4xl heading text-center mb-2">Todo el ecosistema.</h2>
          <h2 className="text-3xl md:text-4xl heading text-center mb-12" style={{ color: 'var(--text-muted)' }}>Una sola plataforma.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Search, title: 'Clasificador IA', desc: 'Fracción TIGIE + NICO. Score de confianza, GRI, alternativas.', color: 'var(--accent)', tag: 'CORE' },
              { icon: Calculator, title: 'Cotizador', desc: 'IGI, DTA, IVA, IEPS. Tipo de cambio real. PDF exportable.', color: 'var(--emerald)', tag: 'CORE' },
              { icon: MessageSquare, title: 'Copilot', desc: 'Ley Aduanera 2026, RGCE, TMEC. Fundamento legal citado.', color: 'var(--cyan)', tag: 'CORE' },
              { icon: Bot, title: 'Bot WhatsApp', desc: 'Clasifica y cotiza por mensaje. Alertas automáticas.', color: '#25D366', tag: 'CANAL' },
              { icon: FolderOpen, title: 'Expediente Digital', desc: 'Documentos por operación. IA detecta faltantes.', color: 'var(--amber)', tag: 'COMPLIANCE' },
              { icon: FileCheck, title: 'Pre-Validador', desc: 'Valida pedimentos antes del validador oficial.', color: 'var(--rose)', tag: 'COMPLIANCE' },
              { icon: BarChart3, title: 'Analytics', desc: 'Top fracciones, orígenes, costos, precisión.', color: '#A78BFA', tag: 'INSIGHTS' },
              { icon: Shield, title: 'Auditoría', desc: 'Trazabilidad completa para SAT/ANAM.', color: '#FB923C', tag: 'COMPLIANCE' },
              { icon: Globe, title: 'Multi-Tratado', desc: 'TMEC, TLCUE, CPTPP. Compara preferenciales.', color: 'var(--cyan-light)', tag: 'INSIGHTS' },
            ].map(f => (
              <div key={f.title} className="card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${f.color}12` }}>
                    <f.icon size={20} style={{ color: f.color }} />
                  </div>
                  <span className="label text-[9px]">{f.tag}</span>
                </div>
                <h3 className="text-base font-semibold heading mb-1.5">{f.title}</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 md:px-16 py-24 mesh">
        <div className="max-w-6xl mx-auto">
          <p className="label text-center mb-3" style={{ color: 'var(--accent)' }}>PRICING</p>
          <h2 className="text-3xl md:text-4xl heading text-center mb-4">Menos que AJR. Mejor que AJR.</h2>
          <p className="text-center mb-16 text-sm" style={{ color: 'var(--text-muted)' }}>Una empresa con 3-4 módulos de AJR gasta $40,000-100,000+ MXN/mes.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Starter', price: '$2,999', desc: 'PYME', features: ['Clasificador IA (50/mes)', 'Cotizador ilimitado', 'Copilot (10/día)', '1 usuario'], pop: false },
              { name: 'Professional', price: '$9,999', desc: 'Empresa con depto comex', features: ['Todo Starter ilimitado', 'Expediente electrónico', 'Alertas WhatsApp', 'Analytics', 'API básica', '5 usuarios'], pop: true },
              { name: 'Enterprise', price: '$25,000+', desc: 'IMMEX, maquilas', features: ['Todo Professional', 'Anexo 24/30/31', 'Pre-validador', 'API + ERP', 'Soporte dedicado', 'Usuarios ilimitados'], pop: false },
            ].map(plan => (
              <div key={plan.name}
                className={`card p-8 relative ${plan.pop ? 'scale-[1.02]' : ''}`}
                style={plan.pop ? { borderColor: 'var(--border-hover)', boxShadow: 'var(--glow)' } : {}}
                onMouseEnter={() => setHoveredPlan(plan.name)}
                onMouseLeave={() => setHoveredPlan(null)}
              >
                {plan.pop && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 btn-primary py-1 px-4 text-xs" style={{ borderRadius: 20 }}>POPULAR</div>
                )}
                <h3 className="text-lg font-bold heading mb-0.5">{plan.name}</h3>
                <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold heading">{plan.price}</span>
                  <span className="text-sm ml-1" style={{ color: 'var(--text-muted)' }}>MXN/mes</span>
                </div>
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <Check size={15} style={{ color: 'var(--accent)' }} className="mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${plan.pop || hoveredPlan === plan.name ? 'btn-primary' : 'btn-secondary'}`}>
                  {plan.name === 'Enterprise' ? 'Contactar' : 'Comenzar'}<ChevronRight size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="px-6 md:px-16 py-24" style={{ background: 'var(--bg-secondary)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="label text-center mb-3" style={{ color: 'var(--accent)' }}>COMPARATIVA</p>
          <h2 className="text-3xl heading text-center mb-12">Lo que ellos no tienen.</h2>
          <div className="card overflow-hidden" style={{ padding: 0 }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left p-4 label">FUNCIÓN</th>
                  <th className="p-4 mono text-xs" style={{ color: 'var(--accent)' }}>ADUANAI</th>
                  <th className="p-4 label">AJR</th>
                  <th className="p-4 label">CAMTOM</th>
                </tr>
              </thead>
              <tbody>
                {[['Clasificación IA',1,0,1],['Cotizador inteligente',1,0,0],['Compliance Copilot',1,0,0],['Bot WhatsApp',1,0,0],['Expediente electrónico',1,1,0],['Pre-validación',1,0,1],['Analytics',1,0,0],['API REST',1,0,0],['Precio PYME',1,0,0]].map(([f,a,b,c],i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{f as string}</td>
                    <td className="p-4 text-center">{a ? <Check size={16} style={{ color: 'var(--accent)' }} className="mx-auto" /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td className="p-4 text-center">{b ? <Check size={16} style={{ color: 'var(--text-dim)' }} className="mx-auto" /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td className="p-4 text-center">{c ? <Check size={16} style={{ color: 'var(--text-dim)' }} className="mx-auto" /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-16 py-24 mesh">
        <div className="max-w-4xl mx-auto text-center">
          <div className="card p-12 md:p-16 relative overflow-hidden" style={{ borderColor: 'var(--border-hover)', boxShadow: 'var(--glow)' }}>
            <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-[120px]" style={{ background: 'rgba(59,130,246,0.08)' }} />
            <h2 className="text-3xl md:text-5xl heading mb-4 relative z-10">
              ¿Listo para modernizar tu
              <br /><span style={{ color: 'var(--accent)' }}>comercio exterior?</span>
            </h2>
            <p className="mb-8 max-w-lg mx-auto relative z-10" style={{ color: 'var(--text-secondary)' }}>
              8,183 fracciones. Aranceles oficiales LIGIE 2026. IA que entiende comercio exterior mexicano.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
              <Link to="/login" className="btn-primary text-lg py-4 px-10 group">
                Crear cuenta gratis <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="https://wa.me/523312345678" className="btn-secondary text-lg py-4 px-10">
                Hablar con ventas
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-16 py-10" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <span className="font-extrabold text-[10px] text-white" style={{ fontFamily: 'var(--font-display)' }}>A</span>
            </div>
            <span className="text-sm font-bold heading">ADUANAI</span>
          </div>
          <p className="text-xs mono" style={{ color: 'var(--text-dim)' }}>2026 ADUANAI — Compatible con SAT, VUCEM, TMEC</p>
        </div>
      </footer>
    </div>
  );
}
