import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Calculator, MessageSquare, Shield, Globe, ChevronRight, Check, ArrowRight, Bot, FolderOpen, BarChart3, FileCheck } from 'lucide-react';

function TradeGlobe() {
  return (
    <div className="relative w-[420px] h-[420px] md:w-[520px] md:h-[520px] mx-auto">
      <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.03) 40%, transparent 70%)' }} />
      <svg viewBox="0 0 500 500" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 40px rgba(6,182,212,0.15))' }}>
        <circle cx="250" cy="250" r="180" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="1" />
        <circle cx="250" cy="250" r="180" fill="none" stroke="rgba(6,182,212,0.08)" strokeWidth="40" />
        {[-60,-30,0,30,60].map(lat => { const y=250+lat*2.5; const r=Math.sqrt(180*180-(lat*2.5)**2); return <ellipse key={lat} cx="250" cy={y} rx={r} ry={r*0.3} fill="none" stroke="rgba(6,182,212,0.06)" strokeWidth="0.5" />; })}
        <path d="M 130 200 Q 200 150 280 180" fill="none" stroke="var(--cyan)" strokeWidth="2" opacity="0.6" className="trade-route" style={{animationDelay:'0s'}} />
        <path d="M 280 180 Q 350 200 380 280" fill="none" stroke="var(--cyan)" strokeWidth="1.5" opacity="0.4" className="trade-route" style={{animationDelay:'0.5s'}} />
        <path d="M 150 300 Q 250 250 350 270" fill="none" stroke="var(--cyan-light)" strokeWidth="1.5" opacity="0.5" className="trade-route" style={{animationDelay:'1s'}} />
        <path d="M 200 320 Q 300 280 370 220" fill="none" stroke="var(--amber)" strokeWidth="1.5" opacity="0.4" className="trade-route" style={{animationDelay:'1.5s'}} />
        <path d="M 120 250 Q 200 220 300 300" fill="none" stroke="var(--emerald)" strokeWidth="1.5" opacity="0.4" className="trade-route" style={{animationDelay:'2s'}} />
        {[{x:130,y:200,size:5},{x:280,y:180,size:4},{x:380,y:280,size:4},{x:350,y:270,size:3},{x:150,y:300,size:3},{x:300,y:300,size:3},{x:200,y:320,size:3}].map((n,i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={n.size+8} fill="none" stroke="rgba(6,182,212,0.2)" strokeWidth="1"><animate attributeName="r" values={`${n.size+5};${n.size+12};${n.size+5}`} dur="3s" repeatCount="indefinite" begin={`${i*0.4}s`} /><animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" begin={`${i*0.4}s`} /></circle>
            <circle cx={n.x} cy={n.y} r={n.size} fill="var(--cyan)" opacity="0.8"><animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" begin={`${i*0.3}s`} /></circle>
          </g>
        ))}
        <circle cx="250" cy="250" r="210" fill="none" stroke="rgba(6,182,212,0.05)" strokeWidth="1" strokeDasharray="8 12"><animateTransform attributeName="transform" type="rotate" values="0 250 250;360 250 250" dur="60s" repeatCount="indefinite" /></circle>
        <circle cx="250" cy="250" r="220" fill="none" stroke="rgba(129,140,248,0.04)" strokeWidth="1" strokeDasharray="4 16"><animateTransform attributeName="transform" type="rotate" values="360 250 250;0 250 250" dur="45s" repeatCount="indefinite" /></circle>
      </svg>
    </div>
  );
}

export function LandingPage() {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] overflow-x-hidden grid-bg">
      <div className="noise-overlay" />

      <nav className="relative z-40 flex items-center justify-between px-6 md:px-16 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center glow-cyan" style={{ background: 'linear-gradient(135deg, var(--cyan) 0%, var(--cyan-dim) 100%)' }}>
            <span className="text-[var(--bg-deep)] font-black text-sm" style={{ fontFamily: 'var(--font-display)' }}>A</span>
          </div>
          <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--cyan)' }}>ADUANA</span>I
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: 'var(--text-muted)' }}>
          <a href="#features" className="hover:text-white transition-colors">Funciones</a>
          <a href="#pricing" className="hover:text-white transition-colors">Precios</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          <Link to="/login" className="btn-primary text-sm py-2 px-5">Entrar</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 md:px-16 pt-8 pb-24">
        <div className="relative z-10 max-w-7xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 mb-8 animate-fade-up">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--emerald)' }} />
              <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>PLATAFORMA ACTIVA</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="block animate-fade-up">Centro de</span>
              <span className="block animate-fade-up delay-100">control de</span>
              <span className="block animate-fade-up delay-200" style={{ background: 'linear-gradient(135deg, var(--cyan-light) 0%, var(--cyan) 50%, var(--indigo) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                comercio exterior.
              </span>
            </h1>
            <p className="text-base md:text-lg max-w-lg mb-10 leading-relaxed animate-fade-up delay-300" style={{ color: 'var(--text-secondary)' }}>
              Clasifica, cotiza y cumple normatividad aduanera mexicana con inteligencia artificial. 8,183 fracciones TIGIE. Aranceles oficiales LIGIE 2026.
            </p>
            <div className="flex flex-col sm:flex-row items-start gap-4 animate-fade-up delay-400">
              <Link to="/login" className="btn-primary text-base py-3.5 px-8 flex items-center gap-2 group">
                Comenzar gratis <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#features" className="btn-secondary text-base py-3.5 px-8">Ver funciones</a>
            </div>
            <div className="flex gap-8 mt-12 pt-8 animate-fade-up delay-500" style={{ borderTop: '1px solid var(--border)' }}>
              {[{ value: '8,183', label: 'Fracciones TIGIE' },{ value: '95%', label: 'Precisión IA' },{ value: '<15s', label: 'Clasificación' }].map(stat => (
                <div key={stat.label}>
                  <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{stat.value}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden md:block animate-fade-in delay-300"><TradeGlobe /></div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative px-6 md:px-16 py-24 mesh-gradient">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>MÓDULOS</p>
            <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              Todo el ecosistema.<br /><span style={{ color: 'var(--text-muted)' }}>Una sola plataforma.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Search, title: 'Clasificador IA', desc: 'Fracción TIGIE + NICO en segundos. Score de confianza, GRI aplicadas, alternativas.', color: 'var(--cyan)', tag: 'CORE' },
              { icon: Calculator, title: 'Cotizador', desc: 'Desglose IGI, DTA, IVA, IEPS. Tipo de cambio real. Comparativa con/sin tratado.', color: 'var(--emerald)', tag: 'CORE' },
              { icon: MessageSquare, title: 'Copilot', desc: 'IA especializada en Ley Aduanera 2026, RGCE, TMEC. Con fundamento legal citado.', color: 'var(--indigo)', tag: 'CORE' },
              { icon: Bot, title: 'Bot WhatsApp', desc: 'Clasifica y cotiza por mensaje. Alertas de cambios regulatorios automáticas.', color: '#25D366', tag: 'CANAL' },
              { icon: FolderOpen, title: 'Expediente Digital', desc: 'Documentos por operación. IA detecta faltantes. Alertas de vencimiento.', color: 'var(--amber)', tag: 'COMPLIANCE' },
              { icon: FileCheck, title: 'Pre-Validador', desc: 'Valida pedimentos contra Anexo 22 y TIGIE antes del validador oficial.', color: 'var(--red)', tag: 'COMPLIANCE' },
              { icon: BarChart3, title: 'Analytics', desc: 'Top fracciones, orígenes, costos. Métricas de precisión y feedback.', color: '#A78BFA', tag: 'INSIGHTS' },
              { icon: Shield, title: 'Auditoría Total', desc: 'Cada acción logueada. Trazabilidad completa para auditorías SAT/ANAM.', color: '#FB923C', tag: 'COMPLIANCE' },
              { icon: Globe, title: 'Multi-Tratado', desc: 'TMEC, TLCUE, CPTPP. Compara aranceles preferenciales automáticamente.', color: 'var(--cyan-light)', tag: 'INSIGHTS' },
            ].map((f) => (
              <div key={f.title} className="glass card-hover rounded-2xl p-7">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${f.color}12` }}>
                    <f.icon size={20} style={{ color: f.color }} />
                  </div>
                  <span className="text-[9px] font-bold tracking-[0.15em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{f.tag}</span>
                </div>
                <h3 className="text-base font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-16 py-24">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>PROCESO</p>
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16" style={{ fontFamily: 'var(--font-display)' }}>Tres pasos. Cero fricción.</h2>
          <div className="space-y-8">
            {[
              { step: '01', title: 'Describe tu producto', desc: '"Tornillos de acero inoxidable de cabeza hexagonal, 10mm, uso industrial"' },
              { step: '02', title: 'La IA clasifica', desc: '7318.15.01 — Confianza 95% — NMF 10% — TMEC 0% — Sin RRNA' },
              { step: '03', title: 'Cotiza y exporta', desc: 'Desglose de impuestos, landed cost, PDF con branding. Listo.' },
            ].map((item, i) => (
              <div key={item.step} className="flex gap-6 items-start glass rounded-2xl p-6 card-hover">
                <div className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: i === 1 ? 'linear-gradient(135deg, var(--cyan), var(--cyan-dim))' : 'var(--bg-surface)' }}>
                  <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-mono)', color: i === 1 ? 'var(--bg-deep)' : 'var(--cyan)' }}>{item.step}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>{item.title}</h3>
                  <p className="text-sm leading-relaxed px-4 py-2.5 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 md:px-16 py-24 mesh-gradient">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>PRICING</p>
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4" style={{ fontFamily: 'var(--font-display)' }}>Menos que AJR. Mejor que AJR.</h2>
          <p className="text-center mb-16 max-w-xl mx-auto text-sm" style={{ color: 'var(--text-muted)' }}>Una empresa con 3-4 módulos de AJR gasta $40,000-100,000+ MXN/mes.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Starter', price: '$2,999', period: 'MXN/mes', desc: 'PYME que importa/exporta poco', features: ['Clasificador IA (50/mes)', 'Cotizador ilimitado', 'Copilot (10/día)', 'Historial', '1 usuario'], popular: false },
              { name: 'Professional', price: '$9,999', period: 'MXN/mes', desc: 'Empresa con depto de comex', features: ['Todo Starter ilimitado', 'Expediente electrónico', 'Alertas WhatsApp', 'Analytics + reportes', 'API básica', '5 usuarios'], popular: true },
              { name: 'Enterprise', price: '$25,000+', period: 'MXN/mes', desc: 'IMMEX, maquilas, +100 ops/mes', features: ['Todo Professional', 'Anexo 24/30/31', 'Pre-validador', 'API completa + ERP', 'Soporte dedicado', 'Usuarios ilimitados'], popular: false },
            ].map((plan) => (
              <div key={plan.name} className={`relative glass rounded-2xl p-8 transition-all duration-300 ${plan.popular ? 'glow-cyan scale-[1.02]' : 'card-hover'}`} style={plan.popular ? { borderColor: 'rgba(6,182,212,0.3)' } : {}} onMouseEnter={() => setHoveredPlan(plan.name)} onMouseLeave={() => setHoveredPlan(null)}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold" style={{ background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dim))', color: 'var(--bg-deep)', fontFamily: 'var(--font-mono)' }}>POPULAR</div>
                )}
                <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>{plan.name}</h3>
                <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>{plan.price}</span>
                  <span className="text-sm ml-1" style={{ color: 'var(--text-muted)' }}>{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <Check size={15} style={{ color: 'var(--cyan)' }} className="mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${plan.popular || hoveredPlan === plan.name ? 'btn-primary' : 'btn-secondary'}`}>
                  {plan.name === 'Enterprise' ? 'Contactar' : 'Comenzar'} <ChevronRight size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparativa */}
      <section className="px-6 md:px-16 py-24">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>VENTAJA</p>
          <h2 className="text-3xl font-bold text-center mb-12" style={{ fontFamily: 'var(--font-display)' }}>Lo que ellos no tienen.</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left p-4 font-normal text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>FUNCIÓN</th>
                  <th className="p-4 font-bold text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>ADUANAI</th>
                  <th className="p-4 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>AJR</th>
                  <th className="p-4 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>CAMTOM</th>
                </tr>
              </thead>
              <tbody>
                {[['Clasificación con IA',true,false,true],['Cotizador inteligente',true,false,false],['Compliance Copilot',true,false,false],['Bot WhatsApp',true,false,false],['Expediente electrónico',true,true,false],['Pre-validación',true,false,true],['Analytics',true,false,false],['API REST',true,false,false],['Precio PYME',true,false,false]].map(([feature,us,ajr,camtom],i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{feature as string}</td>
                    <td className="p-4 text-center">{us ? <Check size={16} style={{ color: 'var(--cyan)' }} className="mx-auto" /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td className="p-4 text-center">{ajr ? <Check size={16} style={{ color: 'var(--text-dim)' }} className="mx-auto" /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td className="p-4 text-center">{camtom ? <Check size={16} style={{ color: 'var(--text-dim)' }} className="mx-auto" /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-6 md:px-16 py-24 mesh-gradient">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>FAQ</p>
          <h2 className="text-3xl font-bold text-center mb-12" style={{ fontFamily: 'var(--font-display)' }}>Preguntas frecuentes</h2>
          <div className="space-y-3">
            {[
              { q: '¿La clasificación con IA es legal?', a: 'ADUANAI es herramienta de asistencia. La responsabilidad legal recae en el importador y su agente aduanal.' },
              { q: '¿Qué tan precisa es?', a: 'Nuestro clasificador alcanza >95% de precisión. Cada resultado incluye score de confianza y alternativas.' },
              { q: '¿Por qué no usar AJR?', a: 'AJR vende 7 productos separados sin IA, con interfaces de 2015. ADUANAI unifica todo con IA nativa.' },
              { q: '¿Se integra con mi ERP?', a: 'Sí. Los planes Professional y Enterprise incluyen API REST.' },
            ].map(item => (
              <details key={item.q} className="group glass rounded-xl">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <span className="font-medium text-sm pr-4">{item.q}</span>
                  <ChevronRight size={15} className="group-open:rotate-90 transition-transform shrink-0" style={{ color: 'var(--text-muted)' }} />
                </summary>
                <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-16 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass rounded-3xl p-12 md:p-16 relative overflow-hidden glow-cyan">
            <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-[120px]" style={{ background: 'rgba(6,182,212,0.08)' }} />
            <div className="absolute bottom-0 left-0 w-[200px] h-[200px] rounded-full blur-[100px]" style={{ background: 'rgba(129,140,248,0.06)' }} />
            <h2 className="text-3xl md:text-5xl font-bold mb-4 relative z-10" style={{ fontFamily: 'var(--font-display)' }}>
              Deja de pagar de más.<br /><span style={{ color: 'var(--cyan)' }}>Empieza a clasificar.</span>
            </h2>
            <p className="mb-8 max-w-lg mx-auto relative z-10" style={{ color: 'var(--text-secondary)' }}>
              8,183 fracciones. Aranceles oficiales. IA que entiende comercio exterior mexicano.
            </p>
            <Link to="/login" className="btn-primary text-lg py-4 px-10 inline-flex items-center gap-2 relative z-10 group">
              Empezar ahora <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-16 py-10" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dim))' }}>
              <span className="font-black text-[10px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--bg-deep)' }}>A</span>
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}><span style={{ color: 'var(--cyan)' }}>ADUANA</span>I</span>
          </div>
          <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>2026 ADUANAI — Clasificación arancelaria con IA es herramienta de asistencia.</p>
        </div>
      </footer>
    </div>
  );
}
