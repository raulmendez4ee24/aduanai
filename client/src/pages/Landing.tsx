import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Calculator, MessageSquare, Shield, Zap, Globe, ChevronRight, Check, ArrowRight, Bot } from 'lucide-react';

export function LandingPage() {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#060D18] text-white overflow-x-hidden">
      {/* Noise overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat' }}
      />

      {/* Nav */}
      <nav className="relative z-40 flex items-center justify-between px-8 md:px-16 py-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#C9A84C] to-[#8B6914] rounded-lg flex items-center justify-center">
            <span className="text-[#060D18] font-black text-sm">A</span>
          </div>
          <span className="text-xl font-bold tracking-tight">
            <span className="text-[#C9A84C]">ADUANA</span>I
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Funciones</a>
          <a href="#pricing" className="hover:text-white transition-colors">Precios</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          <Link to="/login" className="bg-[#C9A84C] text-[#060D18] px-5 py-2 rounded-lg font-semibold hover:bg-[#E8D48B] transition-colors">
            Entrar
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-8 md:px-16 pt-16 pb-32">
        {/* Gradient orbs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#C9A84C]/5 rounded-full blur-[150px]" />
        <div className="absolute top-32 right-1/4 w-[400px] h-[400px] bg-[#1a3a5c]/30 rounded-full blur-[120px]" />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-full px-4 py-1.5 mb-8 animate-fade-in">
            <Zap size={14} className="text-[#C9A84C]" />
            <span className="text-sm text-[#C9A84C] font-medium">Powered by IA</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tight mb-8">
            <span className="block text-white animate-fade-in delay-100">Comercio</span>
            <span className="block text-white animate-fade-in delay-200">exterior</span>
            <span className="block bg-gradient-to-r from-[#C9A84C] via-[#E8D48B] to-[#C9A84C] bg-clip-text text-transparent animate-fade-in delay-300">
              inteligente.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-in delay-400">
            Clasifica productos, calcula impuestos y consulta normatividad
            aduanera mexicana en segundos. No en horas.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in delay-500">
            <Link
              to="/login"
              className="group bg-gradient-to-r from-[#C9A84C] to-[#A68A3E] text-[#060D18] px-8 py-4 rounded-xl font-bold text-lg hover:shadow-[0_0_40px_rgba(201,168,76,0.3)] transition-all flex items-center gap-2"
            >
              Comenzar gratis
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#demo"
              className="border border-[#1B2D45] text-slate-300 px-8 py-4 rounded-xl font-medium hover:border-[#C9A84C]/30 hover:text-white transition-all"
            >
              Ver demo
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto mt-20 pt-12 border-t border-[#1B2D45]/50">
            {[
              { value: '8,177', label: 'Fracciones TIGIE' },
              { value: '95%', label: 'Precisión IA' },
              { value: '<15s', label: 'Por clasificación' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative px-8 md:px-16 py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A1628]/50 to-transparent" />
        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#C9A84C] text-sm font-semibold tracking-widest uppercase mb-4">Herramientas</p>
            <h2 className="text-4xl md:text-5xl font-bold">Todo lo que necesitas.</h2>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-500">Nada que no.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Search,
                title: 'Clasificador IA',
                desc: 'Describe tu producto en lenguaje natural. La IA identifica la fracción TIGIE, NICO, aranceles, RRNA y NOMs aplicables.',
                color: '#C9A84C',
                tag: 'Core',
              },
              {
                icon: Calculator,
                title: 'Cotizador',
                desc: 'Fracción + valor + origen = desglose completo. IGI, DTA, IVA, IEPS, preferenciales TMEC/TLCUE/CPTPP.',
                color: '#4CAF50',
                tag: 'Core',
              },
              {
                icon: MessageSquare,
                title: 'Compliance Copilot',
                desc: 'Chat con IA especializada en Ley Aduanera 2026, RGCE, tratados y normatividad. Con fundamento legal citado.',
                color: '#2196F3',
                tag: 'Core',
              },
              {
                icon: Bot,
                title: 'Bot WhatsApp',
                desc: 'Clasifica y cotiza desde WhatsApp. Recibe alertas de cambios regulatorios. Sin app, sin login.',
                color: '#25D366',
                tag: 'Integración',
              },
              {
                icon: Shield,
                title: 'Auditoría Total',
                desc: 'Cada clasificación, cotización y consulta queda logueada. Trazabilidad completa para auditorías SAT.',
                color: '#FF5722',
                tag: 'Compliance',
              },
              {
                icon: Globe,
                title: 'Multi-tratado',
                desc: 'Compara aranceles con y sin preferencia. TMEC, TLCUE, CPTPP y más. Maximiza el ahorro de tus clientes.',
                color: '#9C27B0',
                tag: 'Analytics',
              },
            ].map((feature, i) => (
              <div
                key={feature.title}
                className={`group bg-[#0A1628]/80 border border-[#1B2D45] rounded-2xl p-8 hover:border-[#C9A84C]/20 transition-all duration-300 animate-fade-in ${i < 3 ? ['delay-100', 'delay-200', 'delay-300'][i] : ['delay-400', 'delay-500', 'delay-600'][i - 3]}`}
              >
                <div className="flex items-start justify-between mb-6">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${feature.color}12` }}
                  >
                    <feature.icon size={22} style={{ color: feature.color }} />
                  </div>
                  <span className="text-[10px] font-semibold tracking-widest uppercase text-slate-600">{feature.tag}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2 group-hover:text-[#C9A84C] transition-colors">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-8 md:px-16 py-24">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#C9A84C] text-sm font-semibold tracking-widest uppercase mb-4 text-center">Cómo funciona</p>
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">Tres pasos. Cero complicaciones.</h2>

          <div className="space-y-12">
            {[
              { step: '01', title: 'Describe tu producto', desc: '"Tornillos de acero inoxidable de cabeza hexagonal, 10mm, uso industrial"' },
              { step: '02', title: 'La IA clasifica', desc: 'Fracción 7318.15.01 — Confianza 95% — Arancel NMF 5% — TMEC 0% — Sin RRNA' },
              { step: '03', title: 'Cotiza y exporta', desc: 'Desglose de impuestos, landed cost, comparativa con/sin tratado. PDF listo.' },
            ].map((item) => (
              <div key={item.step} className="flex gap-8 items-start">
                <span className="text-6xl font-black text-[#C9A84C]/10 shrink-0 leading-none">{item.step}</span>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-slate-400 leading-relaxed font-mono text-sm bg-[#0A1628] border border-[#1B2D45] rounded-lg px-4 py-3">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-8 md:px-16 py-24">
        <div className="max-w-6xl mx-auto">
          <p className="text-[#C9A84C] text-sm font-semibold tracking-widest uppercase mb-4 text-center">Precios</p>
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">Menos que AJR. Mejor que AJR.</h2>
          <p className="text-slate-500 text-center mb-16 max-w-xl mx-auto">Una empresa con 3-4 módulos de AJR gasta $40,000-100,000+ MXN/mes. Tú obtienes todo por una fracción.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Starter',
                price: '$2,999',
                period: 'MXN/mes',
                desc: 'PYME que importa/exporta poco',
                features: [
                  'Clasificador IA (50/mes)',
                  'Cotizador ilimitado',
                  'Copilot (10 consultas/día)',
                  'Historial de operaciones',
                  '1 usuario',
                ],
                cta: 'Comenzar',
                popular: false,
              },
              {
                name: 'Professional',
                price: '$9,999',
                period: 'MXN/mes',
                desc: 'Empresa con depto de comex',
                features: [
                  'Todo Starter ilimitado',
                  'Expediente electrónico',
                  'Alertas WhatsApp',
                  'Reportes y analytics',
                  'API básica',
                  '5 usuarios',
                ],
                cta: 'Comenzar',
                popular: true,
              },
              {
                name: 'Enterprise',
                price: '$25,000+',
                period: 'MXN/mes',
                desc: 'IMMEX, maquilas, +100 ops/mes',
                features: [
                  'Todo Professional',
                  'Control Anexo 24/30/31',
                  'Pre-validador pedimentos',
                  'API completa + ERP',
                  'Soporte dedicado',
                  'Usuarios ilimitados',
                ],
                cta: 'Contactar',
                popular: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 transition-all duration-300 ${
                  plan.popular
                    ? 'bg-gradient-to-b from-[#C9A84C]/10 to-[#0A1628] border-2 border-[#C9A84C]/30 scale-[1.02]'
                    : 'bg-[#0A1628]/80 border border-[#1B2D45] hover:border-[#C9A84C]/20'
                }`}
                onMouseEnter={() => setHoveredPlan(plan.name)}
                onMouseLeave={() => setHoveredPlan(null)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C9A84C] text-[#060D18] text-xs font-bold px-4 py-1 rounded-full">
                    Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-xs text-slate-500 mb-6">{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-black text-white">{plan.price}</span>
                  <span className="text-sm text-slate-500 ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check size={16} className="text-[#C9A84C] mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    plan.popular || hoveredPlan === plan.name
                      ? 'bg-[#C9A84C] text-[#060D18] hover:bg-[#E8D48B]'
                      : 'border border-[#1B2D45] text-slate-300 hover:border-[#C9A84C]/30'
                  }`}
                >
                  {plan.cta}
                  <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Competitors */}
      <section className="px-8 md:px-16 py-24">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#C9A84C] text-sm font-semibold tracking-widest uppercase mb-4 text-center">Comparativa</p>
          <h2 className="text-4xl font-bold text-center mb-12">Lo que ellos no tienen.</h2>

          <div className="bg-[#0A1628]/80 border border-[#1B2D45] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1B2D45]">
                  <th className="text-left p-4 text-slate-500 font-normal">Función</th>
                  <th className="p-4 text-[#C9A84C] font-bold">ADUANAI</th>
                  <th className="p-4 text-slate-500">AJR</th>
                  <th className="p-4 text-slate-500">Camtom</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Clasificación con IA', true, false, true],
                  ['Cotizador de importación', true, false, false],
                  ['Compliance Copilot', true, false, false],
                  ['Bot WhatsApp', true, false, false],
                  ['Expediente electrónico', true, true, false],
                  ['Control Anexo 24/30', true, true, false],
                  ['Pre-validación pedimentos', true, false, true],
                  ['Multi-tenant', true, false, false],
                  ['API REST', true, false, false],
                  ['Precio accesible PYME', true, false, false],
                ].map(([feature, us, ajr, camtom], i) => (
                  <tr key={i} className="border-b border-[#1B2D45]/50 last:border-0">
                    <td className="p-4 text-slate-300">{feature as string}</td>
                    <td className="p-4 text-center">{us ? <Check size={16} className="text-[#C9A84C] mx-auto" /> : <span className="text-slate-600">—</span>}</td>
                    <td className="p-4 text-center">{ajr ? <Check size={16} className="text-slate-500 mx-auto" /> : <span className="text-slate-600">—</span>}</td>
                    <td className="p-4 text-center">{camtom ? <Check size={16} className="text-slate-500 mx-auto" /> : <span className="text-slate-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-8 md:px-16 py-24">
        <div className="max-w-3xl mx-auto">
          <p className="text-[#C9A84C] text-sm font-semibold tracking-widest uppercase mb-4 text-center">FAQ</p>
          <h2 className="text-4xl font-bold text-center mb-12">Preguntas frecuentes</h2>

          <div className="space-y-4">
            {[
              {
                q: '¿La clasificación con IA es legal?',
                a: 'ADUANAI es una herramienta de asistencia. La responsabilidad legal siempre recae en el importador y su agente aduanal. Cada resultado incluye un disclaimer legal.',
              },
              {
                q: '¿Qué tan precisa es la clasificación?',
                a: 'Nuestro clasificador alcanza >95% de precisión en los capítulos más comunes. Cada resultado incluye un score de confianza y fracciones alternativas para que tu agente aduanal tome la decisión final.',
              },
              {
                q: '¿Por qué no usar Camtom o AJR?',
                a: 'Camtom solo cubre clasificación para agencias. AJR vende 7 productos separados sin IA. ADUANAI unifica todo en una plataforma con IA nativa, desde PYMEs hasta IMMEX.',
              },
              {
                q: '¿Puedo integrar ADUANAI con mi ERP?',
                a: 'Sí. Los planes Professional y Enterprise incluyen API REST. Integraciones con SAP, Oracle y otros ERPs disponibles en Enterprise.',
              },
            ].map((item) => (
              <details key={item.q} className="group bg-[#0A1628]/80 border border-[#1B2D45] rounded-xl">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                  <span className="font-medium text-white pr-4">{item.q}</span>
                  <ChevronRight size={16} className="text-slate-500 group-open:rotate-90 transition-transform shrink-0" />
                </summary>
                <div className="px-6 pb-6 text-sm text-slate-400 leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 md:px-16 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-[#0A1628] to-[#0D1B2A] border border-[#C9A84C]/20 rounded-3xl p-12 md:p-16 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#C9A84C]/5 rounded-full blur-[100px]" />
            <h2 className="text-4xl md:text-5xl font-bold mb-4 relative z-10">
              Deja de pagar de más por
              <br />
              <span className="text-[#C9A84C]">clasificaciones lentas.</span>
            </h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto relative z-10">
              Únete a las empresas que ya clasifican, cotizan y consultan normatividad en segundos.
            </p>
            <Link
              to="/login"
              className="relative z-10 inline-flex items-center gap-2 bg-[#C9A84C] text-[#060D18] px-8 py-4 rounded-xl font-bold text-lg hover:shadow-[0_0_40px_rgba(201,168,76,0.3)] transition-all"
            >
              Empezar ahora
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 md:px-16 py-12 border-t border-[#1B2D45]/30">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-[#C9A84C] to-[#8B6914] rounded flex items-center justify-center">
              <span className="text-[#060D18] font-black text-[10px]">A</span>
            </div>
            <span className="text-sm font-bold">
              <span className="text-[#C9A84C]">ADUANA</span>I
            </span>
          </div>
          <p className="text-xs text-slate-600">
            2026 ADUANAI. La clasificación arancelaria con IA es herramienta de asistencia.
          </p>
        </div>
      </footer>
    </div>
  );
}
