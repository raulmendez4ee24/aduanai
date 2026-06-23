import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../../lib/api'
import { useTotalFractions } from '../../hooks/useTotalFractions'
import { FadeIn, SlideIn, CountUp, Expandable, motion, staggerContainer, staggerItem } from '../../lib/animations'
import { DemoClassifier } from '../../components/DemoClassifier'
import {
  AlertTriangle, Files, Puzzle, PenLine, Cpu, FileCheck2, ArrowRight, Check, X as XIcon,
  Boxes, Calculator, Bot, Warehouse, ShieldCheck, FileText,
  Truck, Megaphone, BarChart3, FolderOpen, RefreshCw, Package, Zap, Globe, Languages,
  Star, Quote, Building2, Factory, Briefcase, Plane,
  Sparkles, Lock, Database, FileCode,
} from 'lucide-react'

const WA_NUMBER = '523326617755'
const WA_MSG = encodeURIComponent('Hola, me interesa una demo de ADUANAI para mi empresa')

// ── Data ──────────────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    icon: AlertTriangle,
    title: 'Pagas miles de pesos por una clasificación que tarda días en llegar',
    body: 'Cada producto nuevo es una cotización que se convierte en una espera. Mientras, tu mercancía se queda detenida o arriesgas pasarla mal.',
  },
  {
    icon: Files,
    title: 'Tus expedientes están en Excel, emails y carpetas que nadie encuentra',
    body: 'Cuando el SAT llega con una auditoría, empieza la cacería de documentos. Uno o dos faltantes significan multas, recargos y más estrés.',
  },
  {
    icon: Puzzle,
    title: 'Manejas 7 sistemas que no se hablan entre sí y cada uno cuesta una fortuna',
    body: 'Clasificador en un lado, inventario en otro, impuestos en un tercero. Duplicas datos, duplicas errores y triplicas facturas.',
  },
]

const STEPS = [
  {
    n: 1,
    icon: PenLine,
    title: 'Describe tu producto',
    body: 'Escríbelo en tus palabras. "Tela de algodón 100%, 150cm ancho, teñida azul marino." Eso es todo.',
  },
  {
    n: 2,
    icon: Cpu,
    title: 'La IA clasifica en 15 segundos',
    body: 'Nuestro motor aplica las 6 Reglas Generales Interpretativas contra 8,183 fracciones y elige la correcta con su base legal.',
  },
  {
    n: 3,
    icon: FileCheck2,
    title: 'Obtén fracción, aranceles, NOMs y todo',
    body: 'Recibes fracción, IGI/IVA/IEPS, preferencias T-MEC/TLCUE/CPTPP, NOMs aplicables, permisos y razonamiento legal.',
  },
]

const MAIN_MODULES = [
  { icon: Boxes, title: 'Clasificador IA', desc: 'Fracción arancelaria en 15 segundos' },
  { icon: Calculator, title: 'Cotizador', desc: 'Desglose completo de impuestos al instante' },
  { icon: Bot, title: 'Copilot', desc: 'Tu abogado aduanero con IA disponible 24/7' },
  { icon: Warehouse, title: 'Inventario IMMEX', desc: 'Control de Anexo 24/30 con alertas' },
  { icon: ShieldCheck, title: 'Fiscal Guardian', desc: 'Protege tu certificación IVA/IEPS' },
  { icon: FileText, title: 'Auto MVE', desc: 'Manifestación de valor sin captura manual' },
]

const EXTRA_MODULES = [
  { icon: FolderOpen, title: 'Expediente Digital', desc: 'Documentos ordenados con completeness automático' },
  { icon: ShieldCheck, title: 'Pre-validador', desc: 'Detecta errores antes del despacho aduanero' },
  { icon: Megaphone, title: 'Alertas', desc: 'Cambios en aranceles, NOMs y regulaciones' },
  { icon: BarChart3, title: 'Analytics', desc: 'Dashboards de operación y comportamiento' },
  { icon: Truck, title: 'Logística 3D', desc: 'Cubicaje óptimo en contenedores y camiones' },
  { icon: RefreshCw, title: 'TIGIE Updater', desc: 'Decretos del DOF aplicados el mismo día' },
  { icon: Package, title: 'Operaciones', desc: 'Todas tus importaciones en una línea de tiempo' },
  { icon: Zap, title: 'Motor de Reglas', desc: 'Automatiza validaciones por país, fracción o permiso' },
  { icon: FileCode, title: 'COVE', desc: 'Generación y firma digital del valor oficial' },
  { icon: Globe, title: 'WhatsApp Bot', desc: 'Consulta fracciones y aranceles desde tu celular' },
  { icon: Languages, title: 'Traductor Técnico', desc: 'Descripciones comerciales → lenguaje TIGIE' },
  { icon: Database, title: 'Historial Inteligente', desc: 'Busca operaciones previas y reutiliza criterios' },
  { icon: Sparkles, title: 'API pública', desc: '114+ endpoints para integrar en tu ERP o TMS' },
]

const COMPARATIVA = [
  { f: 'Clasificación arancelaria', manual: 'Días', ajr: 'No tiene', aduanai: '15 segundos con IA', highlight: true },
  { f: 'Módulos integrados', manual: '—', ajr: '7 separados', aduanai: '19 unificados', highlight: true },
  { f: 'Inteligencia artificial', manual: <XIcon className="w-4 h-4 text-rose-400 inline" />, ajr: <XIcon className="w-4 h-4 text-rose-400 inline" />, aduanai: <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><Check className="w-4 h-4" /> En todo</span> },
  { f: 'Soporte por WhatsApp', manual: <XIcon className="w-4 h-4 text-rose-400 inline" />, ajr: <XIcon className="w-4 h-4 text-rose-400 inline" />, aduanai: <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><Check className="w-4 h-4" /> 24/7</span> },
  { f: 'Actualizaciones TIGIE', manual: 'Manual', ajr: 'Semanas', aduanai: 'Mismo día' },
  { f: 'Onboarding guiado', manual: <XIcon className="w-4 h-4 text-rose-400 inline" />, ajr: <XIcon className="w-4 h-4 text-rose-400 inline" />, aduanai: <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><Check className="w-4 h-4" /> 6 pasos</span> },
  { f: 'Inversión mensual', manual: 'Consultores por hora', ajr: 'Millones al año', aduanai: 'Desde $2,999 MXN/mes', highlight: true },
]

const TRUST_PILLS = [
  '8,183 fracciones TIGIE 2026',
  'Aranceles LIGIE actualizados',
  'Compatible SAT • VUCEM • T-MEC',
  'Reforma aduanera 2026 incluida',
  'Datos encriptados en tránsito y reposo',
  'Hospedaje en México (MX-Central)',
]

const TESTIMONIALS = [
  {
    quote: 'Por fin un sistema que entiende comex mexicano. No es un SaaS genérico adaptado; se nota que lo construyeron con maestros aduanales.',
    name: 'Ricardo M.',
    role: 'Gerente de Comex · Sector automotriz',
    initials: 'RM',
  },
  {
    quote: 'La IA clasificó correctamente productos que nos tomaban horas de investigar con la TIGIE abierta en varias pestañas.',
    name: 'Ana P.',
    role: 'Agente Aduanal · Guadalajara',
    initials: 'AP',
  },
  {
    quote: 'Dejamos AJR después de 5 años. No hay comparación: todo en un lugar, sin exportar archivos ni pelear con licencias.',
    name: 'Héctor L.',
    role: 'Director de Operaciones · IMMEX textil',
    initials: 'HL',
  },
]

const FOR_WHO = [
  {
    icon: Briefcase,
    tag: 'PYMEs que importan',
    title: 'Tu primera importación sin miedo a multas',
    body: 'La IA te guía desde clasificar hasta preparar el expediente completo.',
  },
  {
    icon: Building2,
    tag: 'Empresas medianas',
    title: 'Deja de pagar de más por software obsoleto',
    body: 'Un plan, 19 módulos, sin licencias por usuario escondidas en cada esquina.',
  },
  {
    icon: Factory,
    tag: 'Maquilas IMMEX',
    title: 'Control total de Anexo 24/30 con IA predictiva',
    body: 'Descarga pedimentos, evita vencimientos y genera reportes al SAT en minutos.',
  },
  {
    icon: Plane,
    tag: 'Agencias aduanales',
    title: 'Clasifica más rápido, atiende más clientes',
    body: 'Delega la parte técnica a la IA y escala tu operación sin contratar más gente.',
  },
]

const FAQ_ITEMS = [
  {
    q: '¿La clasificación con IA es legal?',
    a: 'Sí. ADUANAI aplica las 6 Reglas Generales Interpretativas de la LIGIE (la misma metodología que un clasificador humano) y documenta la base legal de cada decisión. El criterio final sigue siendo tuyo o de tu agente aduanal, pero llegan ahí con trabajo previo completo.',
  },
  {
    q: '¿Qué tan preciso es el clasificador?',
    a: 'Tenemos 95%+ de acierto a nivel de capítulo en un benchmark interno de +12,000 productos reales. La plataforma también devuelve alternativas ranqueadas cuando hay ambigüedad, y conserva la razón por la que descartó cada partida.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Todo viaja y se guarda encriptado (TLS 1.3 + AES-256). El acceso es multi-tenant aislado por empresa, con bitácora de auditoría inmutable. No entrenamos modelos con tu información.',
  },
  {
    q: '¿Se conecta al SAT?',
    a: 'Hoy generamos archivos listos para VUCEM y para los formatos del SAT (Anexo 24/30, COVE, MVE). Estamos trabajando la integración directa con VUCEM API para empresas con certificado de sello.',
  },
  {
    q: '¿Funciona para empresas IMMEX?',
    a: 'Sí: Inventario IMMEX, Fiscal Guardian y Auto-MVE fueron pensados específicamente para maquilas. Soportamos las 4 modalidades de certificación IVA/IEPS y plazos de 18 o 36 meses.',
  },
  {
    q: '¿Puedo probarlo antes de contratar?',
    a: 'Tres caminos: (1) el clasificador demo en esta misma página, (2) una demo personalizada de 30 minutos con tus productos reales, (3) un piloto gratuito de 30 días con acceso completo a los 19 módulos.',
  },
  {
    q: '¿Qué pasa si la IA se equivoca?',
    a: 'Marcas la clasificación como incorrecta y la plataforma la archiva como caso para revisión humana. El motor aprende de tus correcciones y mejora con el tiempo para tu operación específica.',
  },
]

// ── Components ────────────────────────────────────────────────────────────

export function AboutPage() {
  const { total, formatted } = useTotalFractions()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showAllModules, setShowAllModules] = useState(false)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#8B8B6A' }}>
      <div className="max-w-[1400px] mx-auto px-3 md:px-5 py-3 md:py-5 space-y-3 md:space-y-4">

        {/* ═══ HERO ═══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl md:rounded-3xl overflow-hidden">
          <nav className="px-6 md:px-10 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#1a1a1a] flex items-center justify-center">
                <span className="text-white text-[10px] font-bold" style={{ fontFamily: 'system-ui' }}>AI</span>
              </div>
              <span className="text-lg font-semibold text-[#1a1a1a] tracking-tight">ADUANAI</span>
            </div>
            <div className="hidden md:flex items-center gap-7">
              <a href="#problema" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">Problema</a>
              <a href="#como" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">Cómo funciona</a>
              <a href="#modulos" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">Módulos</a>
              <a href="#comparativa" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">Comparativa</a>
              <a href="#demo" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">Demo</a>
              <a href="#faq" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">FAQ</a>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <Link to="/login" className="text-[13px] text-[#666] hover:text-[#1a1a1a] px-4 py-2 rounded-full border border-[#e0e0e0] hover:border-[#ccc] transition-all">Iniciar sesión</Link>
              <a href="#demo" className="text-[13px] text-white bg-[#1a1a1a] px-5 py-2 rounded-full hover:bg-[#333] transition-colors">Agendar Demo</a>
            </div>
            <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Abrir menú">
              <div className="space-y-1">
                <span className={`block w-5 h-[1.5px] bg-[#1a1a1a] transition-all ${mobileOpen ? 'rotate-45 translate-y-[5.5px]' : ''}`} />
                <span className={`block w-5 h-[1.5px] bg-[#1a1a1a] transition-all ${mobileOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-5 h-[1.5px] bg-[#1a1a1a] transition-all ${mobileOpen ? '-rotate-45 -translate-y-[5.5px]' : ''}`} />
              </div>
            </button>
          </nav>
          {mobileOpen && (
            <div className="md:hidden px-6 pb-4 space-y-2 border-t border-[#f0f0f0]">
              <a href="#problema" onClick={() => setMobileOpen(false)} className="block text-sm text-[#666] py-2">Problema</a>
              <a href="#como" onClick={() => setMobileOpen(false)} className="block text-sm text-[#666] py-2">Cómo funciona</a>
              <a href="#modulos" onClick={() => setMobileOpen(false)} className="block text-sm text-[#666] py-2">Módulos</a>
              <a href="#comparativa" onClick={() => setMobileOpen(false)} className="block text-sm text-[#666] py-2">Comparativa</a>
              <a href="#demo" onClick={() => setMobileOpen(false)} className="block text-sm text-[#666] py-2">Demo</a>
              <a href="#faq" onClick={() => setMobileOpen(false)} className="block text-sm text-[#666] py-2">FAQ</a>
              <Link to="/login" onClick={() => setMobileOpen(false)} className="block text-center text-sm text-[#1a1a1a] py-2.5 border border-[#e0e0e0] rounded-full mt-2">Iniciar sesión</Link>
              <a href="#demo" onClick={() => setMobileOpen(false)} className="block text-center text-sm text-white bg-[#1a1a1a] px-5 py-2.5 rounded-full">Agendar Demo</a>
            </div>
          )}

          <div className="px-6 md:px-10 pt-10 md:pt-16 pb-10 md:pb-16">
            <div className="max-w-3xl">
              <FadeIn>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#999] font-medium mb-5">Software de comercio exterior con IA</p>
              </FadeIn>
              <FadeIn delay={0.1}>
                <h1 className="text-[clamp(2rem,5.5vw,4rem)] font-bold text-[#1a1a1a] leading-[1.05] tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Clasifica en segundos lo que antes tomaba días
                </h1>
              </FadeIn>
              <FadeIn delay={0.2}>
                <p className="mt-6 text-[17px] text-[#666] leading-relaxed max-w-xl">
                  19 módulos de comercio exterior con IA. {formatted} fracciones arancelarias. Una sola plataforma.
                </p>
              </FadeIn>
              <FadeIn delay={0.3}>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <a href="#demo" className="inline-flex items-center justify-center gap-2 text-[13px] text-white bg-[#1a1a1a] px-7 py-3.5 rounded-full hover:bg-[#333] transition-colors font-medium">
                    Agendar Demo Personalizada
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                  <a href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 text-[13px] text-[#1a1a1a] px-7 py-3.5 rounded-full border border-[#e0e0e0] hover:bg-[#f5f5f3] transition-colors font-medium">
                    <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Hablar con un asesor
                  </a>
                </div>
              </FadeIn>
            </div>

            <motion.div
              className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
            >
              {[
                { n: 19, l: 'Módulos', s: '' },
                { n: total, l: 'Fracciones TIGIE', s: '' },
                { n: 95, l: 'Precisión a nivel capítulo', s: '%' },
                { n: 15, l: 'Tiempo de respuesta', s: 's', p: '<' },
              ].map((s, i) => (
                <motion.div key={i} variants={staggerItem}>
                  <p className="text-3xl md:text-4xl font-bold text-[#1a1a1a] tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    <CountUp target={s.n} prefix={s.p} suffix={s.s} />
                  </p>
                  <p className="text-[13px] text-[#999] mt-1">{s.l}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className="px-6 md:px-10 pb-0">
            <div className="relative rounded-t-2xl overflow-hidden bg-[#e8e8e4]" style={{ aspectRatio: '21/8' }}>
              <img src="https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=1400&h=550&fit=crop&q=80" alt="Puerto comercial" className="w-full h-full object-cover object-center" loading="eager" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-sm rounded-xl px-5 py-3">
                <p className="text-[11px] text-[#999] uppercase tracking-wider font-medium">Plataforma líder</p>
                <p className="text-sm font-semibold text-[#1a1a1a] mt-0.5">Comercio exterior inteligente</p>
              </div>
              <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-sm rounded-xl px-5 py-3">
                <p className="text-[11px] text-[#999] uppercase tracking-wider font-medium">Prueba piloto</p>
                <p className="text-sm font-semibold text-[#1a1a1a] mt-0.5">30 días sin compromiso</p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ PROBLEMA ═══════════════════════════════════════════════════ */}
        <FadeIn>
          <div id="problema" className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="max-w-2xl mb-10">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/EL PROBLEMA</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                ¿Te suena familiar?
              </h2>
            </div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {PROBLEMS.map((p, i) => (
                <motion.div
                  key={i}
                  variants={staggerItem}
                  className="bg-[#f8f8f6] rounded-2xl p-7 border border-transparent hover:border-[#e8e8e4] transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center mb-5">
                    <p.icon className="w-5 h-5 text-rose-500" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#1a1a1a] leading-snug mb-2">{p.title}</h3>
                  <p className="text-[13px] text-[#888] leading-relaxed">{p.body}</p>
                </motion.div>
              ))}
            </motion.div>

            <div className="mt-10 text-center">
              <p className="text-2xl md:text-3xl font-bold text-[#1a1a1a]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                No tiene que ser así.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* ═══ SOLUCIÓN — CÓMO FUNCIONA ══════════════════════════════════ */}
        <FadeIn>
          <div id="como" className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="max-w-2xl mb-10">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/CÓMO FUNCIONA</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Así de simple
              </h2>
            </div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-5 relative"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.n}
                  variants={staggerItem}
                  className="relative bg-[#f8f8f6] rounded-2xl p-7 overflow-hidden"
                >
                  <span className="absolute top-5 right-6 text-[100px] font-bold text-[#ececec] leading-none select-none" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {s.n}
                  </span>
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center mb-5">
                      <s.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-[17px] font-bold text-[#1a1a1a] mb-2">{s.title}</h3>
                    <p className="text-[13px] text-[#666] leading-relaxed">{s.body.replace('8,183', formatted)}</p>
                  </div>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="hidden md:block absolute top-1/2 -right-5 -translate-y-1/2 w-4 h-4 text-[#ccc] z-10" />
                  )}
                </motion.div>
              ))}
            </motion.div>

            <div className="mt-10 text-center max-w-2xl mx-auto">
              <p className="text-[15px] text-[#666] leading-relaxed">
                Y eso es solo el clasificador. ADUANAI tiene <strong className="text-[#1a1a1a]">18 módulos más</strong> para cotizar, validar, controlar inventario IMMEX y mantener tu compliance fiscal al día.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* ═══ DEMO INTERACTIVO ═══════════════════════════════════════════ */}
        <div id="demo-clasificador" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <FadeIn>
            <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14 flex flex-col justify-center h-full">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/PRUÉBALO TÚ MISMO</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Este es tu momento “ah, sí funciona”
              </h2>
              <p className="text-[14px] text-[#666] leading-relaxed mb-6">
                Escribe cualquier producto (laptop, tequila, camiseta…) y la IA te devuelve la fracción arancelaria exacta con sus aranceles, NOMs y base legal. Sin registro, tres usos gratis.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  { i: Zap, t: 'Resultados en 15 segundos' },
                  { i: ShieldCheck, t: `95%+ de precisión sobre ${formatted} fracciones` },
                  { i: Lock, t: 'Sin guardar tu información ni spam posterior' },
                ].map(({ i: Icon, t }, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-[13px] text-[#666]">{t}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <DemoClassifier />
          </FadeIn>
        </div>

        {/* ═══ MÓDULOS ════════════════════════════════════════════════════ */}
        <FadeIn>
          <div id="modulos" className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="max-w-2xl mb-10">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/LOS MÓDULOS</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Todo lo que necesitas. En un solo lugar.
              </h2>
            </div>

            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {MAIN_MODULES.map((m, i) => (
                <motion.div
                  key={i}
                  variants={staggerItem}
                  className="group bg-[#f8f8f6] rounded-2xl p-6 hover:bg-white hover:shadow-md border border-transparent hover:border-[#eaeae4] transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <m.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1.5">{m.title}</h3>
                  <p className="text-[13px] text-[#888] leading-relaxed">{m.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            {showAllModules && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 overflow-hidden"
              >
                {EXTRA_MODULES.map((m, i) => (
                  <div key={i} className="bg-[#f8f8f6] rounded-2xl p-6 border border-[#f0f0ec]">
                    <div className="w-11 h-11 rounded-xl bg-[#1a1a1a] flex items-center justify-center mb-4">
                      <m.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1.5">{m.title}</h3>
                    <p className="text-[13px] text-[#888] leading-relaxed">{m.desc}</p>
                  </div>
                ))}
              </motion.div>
            )}

            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setShowAllModules(v => !v)}
                className="inline-flex items-center gap-2 text-[13px] text-[#1a1a1a] px-6 py-2.5 rounded-full border border-[#e0e0e0] hover:border-[#ccc] hover:bg-[#f5f5f3] transition-all font-medium"
              >
                {showAllModules ? 'Ocultar módulos' : `Ver los 19 módulos`}
                <ArrowRight className={`w-3.5 h-3.5 transition-transform ${showAllModules ? 'rotate-90' : ''}`} />
              </button>
            </div>
          </div>
        </FadeIn>

        {/* ═══ COMPARATIVA ════════════════════════════════════════════════ */}
        <FadeIn>
          <div id="comparativa" className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="max-w-2xl mb-10">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/POR QUÉ ADUANAI</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Lo que te ofrecemos vs lo que tienes hoy
              </h2>
            </div>

            <div className="overflow-x-auto -mx-6 md:mx-0 px-6 md:px-0">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#eee]">
                    <th className="text-left py-4 pr-3 text-[11px] text-[#999] uppercase tracking-wider font-medium w-1/4">Característica</th>
                    <th className="text-left py-4 px-3 text-[11px] text-[#999] uppercase tracking-wider font-medium">Manual</th>
                    <th className="text-left py-4 px-3 text-[11px] text-[#999] uppercase tracking-wider font-medium">Software legado (AJR)</th>
                    <th className="text-left py-4 pl-3 text-[11px] text-emerald-700 uppercase tracking-wider font-semibold">ADUANAI</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARATIVA.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-[#f5f5f5] last:border-b-0 ${row.highlight ? 'bg-emerald-50/30' : ''}`}
                    >
                      <td className="py-4 pr-3 text-[13px] font-medium text-[#1a1a1a]">{row.f}</td>
                      <td className="py-4 px-3 text-[13px] text-[#888]">{row.manual}</td>
                      <td className="py-4 px-3 text-[13px] text-[#888]">{row.ajr}</td>
                      <td className="py-4 pl-3 text-[13px] text-[#1a1a1a]">{row.aduanai}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
              <p className="text-[13px] text-emerald-800">
                <strong>Piloto gratuito de 30 días</strong> — sin tarjeta, sin contrato, acceso a los 19 módulos.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* ═══ CONFIANZA ═════════════════════════════════════════════════ */}
        <FadeIn>
          <div id="confianza" className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="text-center mb-8">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/RESPALDADO POR DATOS OFICIALES</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Hecho con la ley en la mesa
              </h2>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 mb-10">
              {TRUST_PILLS.map((pill, i) => (
                <span key={i} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f8f8f6] border border-[#eaeae4] text-[12px] font-medium text-[#333]">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  {pill.replace('8,183', formatted)}
                </span>
              ))}
            </div>

            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#ccc] font-medium mb-6">Empresas que confían en ADUANAI</p>
              <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-40">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="w-24 h-10 bg-[#e8e8e4] rounded-lg flex items-center justify-center">
                    <span className="text-[10px] text-[#999]">Logo {i}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#ccc] mt-4">Logos se agregan conforme inician empresas piloto</p>
            </div>
          </div>
        </FadeIn>

        {/* ═══ TESTIMONIOS ═══════════════════════════════════════════════ */}
        <FadeIn>
          <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-10">
              <div className="max-w-xl">
                <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/TESTIMONIOS</p>
                <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Lo que dicen nuestros usuarios
                </h2>
              </div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-100 text-[11px] font-medium text-amber-700">
                Beta testers · actualizaremos con citas públicas
              </span>
            </div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {TESTIMONIALS.map((t, i) => (
                <motion.div key={i} variants={staggerItem} className="bg-[#f8f8f6] rounded-2xl p-7 flex flex-col h-full">
                  <div className="flex items-center gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <Quote className="w-6 h-6 text-[#d0d0c8] mb-3" />
                  <p className="text-[14px] text-[#333] leading-relaxed flex-1 mb-5">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-3 pt-4 border-t border-[#eee]">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[13px] font-semibold shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">{t.name}</p>
                      <p className="text-[11px] text-[#888]">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </FadeIn>

        {/* ═══ PARA QUIÉN ═══════════════════════════════════════════════ */}
        <FadeIn>
          <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="max-w-2xl mb-10">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/PARA QUIÉN</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                ¿ADUANAI es para ti?
              </h2>
            </div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {FOR_WHO.map((w, i) => (
                <motion.div
                  key={i}
                  variants={staggerItem}
                  className="group bg-[#f8f8f6] rounded-2xl p-7 flex gap-5 hover:bg-white hover:shadow-md border border-transparent hover:border-[#eaeae4] transition-all"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] flex items-center justify-center shrink-0 group-hover:bg-emerald-500 transition-colors">
                    <w.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-medium mb-1">{w.tag}</p>
                    <h3 className="text-[16px] font-bold text-[#1a1a1a] mb-2 leading-snug">{w.title}</h3>
                    <p className="text-[13px] text-[#666] leading-relaxed">{w.body}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </FadeIn>

        {/* ═══ DEMO FORM ═══════════════════════════════════════════════ */}
        <FadeIn>
          <div id="demo" className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
            <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
              <div className="lg:max-w-md shrink-0">
                <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/AGENDA TU DEMO</p>
                <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Agenda tu demo personalizada
                </h2>
                <p className="text-[14px] text-[#666] leading-relaxed mt-4">
                  Te mostramos ADUANAI funcionando con <strong className="text-[#1a1a1a]">TUS productos</strong> y <strong className="text-[#1a1a1a]">TUS operaciones</strong>. 30 minutos. Sin compromiso.
                </p>
                <div className="mt-6 space-y-3">
                  {[
                    { i: '🎯', t: 'Demo en vivo con tus productos reales' },
                    { i: '⏱️', t: '30 minutos, una videollamada' },
                    { i: '🔒', t: 'Piloto gratuito de 30 días disponible' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#f8f8f6] rounded-lg flex items-center justify-center shrink-0"><span className="text-[13px]">{item.i}</span></div>
                      <p className="text-[13px] text-[#666]">{item.t}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-4 bg-[#f8f8f6] rounded-xl">
                  <p className="text-[12px] text-[#666] mb-2">O escríbenos directo:</p>
                  <a href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[13px] text-[#25D366] font-semibold hover:underline">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    +52 33 2661 7755
                  </a>
                </div>
              </div>

              <SlideIn direction="right" delay={0.2} className="flex-1">
                <DemoForm />
              </SlideIn>
            </div>
          </div>
        </FadeIn>

        {/* ═══ FAQ ═══════════════════════════════════════════════════════ */}
        <FadeIn>
          <FaqPanel items={FAQ_ITEMS} />
        </FadeIn>

        {/* ═══ FINAL CTA ════════════════════════════════════════════════ */}
        <FadeIn>
          <div className="bg-[#1a1a1a] rounded-2xl md:rounded-3xl px-6 md:px-10 py-12 md:py-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight max-w-2xl mx-auto" style={{ fontFamily: "'Outfit', sans-serif" }}>
              ¿Listo para modernizar tu operación aduanera?
            </h2>
            <p className="text-[14px] text-[#888] mt-4 max-w-md mx-auto leading-relaxed">
              Empieza con un piloto gratuito de 30 días. Sin tarjeta, sin compromiso.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a href="#demo" className="text-[13px] text-[#1a1a1a] bg-white px-7 py-3 rounded-full font-medium hover:bg-[#f0f0f0] transition-colors">
                Agendar Demo
              </a>
              <a href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
                className="text-[13px] text-white px-7 py-3 rounded-full font-medium border border-[#333] hover:border-[#555] transition-colors">
                WhatsApp
              </a>
            </div>
          </div>
        </FadeIn>

        {/* ═══ FOOTER ═══════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-md bg-[#1a1a1a] flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold" style={{ fontFamily: 'system-ui' }}>AI</span>
                </div>
                <span className="text-lg font-semibold text-[#1a1a1a] tracking-tight">ADUANAI</span>
              </div>
              <p className="text-[13px] text-[#888] leading-relaxed mb-5">La plataforma de comercio exterior con IA más completa de México.</p>
              <div className="flex items-center gap-3">
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-[#f5f5f3] rounded-lg flex items-center justify-center hover:bg-[#eaeae7] transition-colors" aria-label="LinkedIn">
                  <svg className="w-3.5 h-3.5 text-[#666]" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-[#f5f5f3] rounded-lg flex items-center justify-center hover:bg-[#eaeae7] transition-colors" aria-label="Instagram">
                  <svg className="w-3.5 h-3.5 text-[#666]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-[#f5f5f3] rounded-lg flex items-center justify-center hover:bg-[#eaeae7] transition-colors" aria-label="Facebook">
                  <svg className="w-3.5 h-3.5 text-[#666]" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold text-[#1a1a1a] uppercase tracking-wider mb-4">Producto</p>
              <div className="space-y-2.5">
                <a href="#modulos" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Clasificador IA</a>
                <a href="#modulos" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Cotizador</a>
                <a href="#modulos" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Copilot</a>
                <a href="#modulos" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Inventario IMMEX</a>
                <a href="#modulos" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Fiscal Guardian</a>
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold text-[#1a1a1a] uppercase tracking-wider mb-4">Empresa</p>
              <div className="space-y-2.5">
                <a href="#como" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Cómo funciona</a>
                <a href="#comparativa" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Comparativa</a>
                <a href="#demo" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Contacto</a>
                <span className="block text-[13px] text-[#ccc]">Blog (próximamente)</span>
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold text-[#1a1a1a] uppercase tracking-wider mb-4">Legal</p>
              <div className="space-y-2.5">
                <Link to="/terminos" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Términos y condiciones</Link>
                <Link to="/privacidad" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Aviso de privacidad</Link>
                <Link to="/cookies" className="block text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">Política de cookies</Link>
              </div>
            </div>
          </div>

          <div className="border-t border-[#f0f0f0] pt-6 mb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#ccc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                <span className="text-[12px] text-[#999]">Zapopan, Jalisco, México</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#ccc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                <span className="text-[12px] text-[#999]">contacto@aduanai.mx</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#ccc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                <span className="text-[12px] text-[#999]">+52 33 2661 7755</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#f0f0f0] pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-[#ccc]">&copy; {new Date().getFullYear()} ADUANAI. Todos los derechos reservados.</p>
            <p className="text-[11px] text-[#ccc]">Hecho con IA en México</p>
          </div>
        </div>
      </div>

      {/* ═══ FLOATING WHATSAPP ═══ */}
      <a href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
        aria-label="Abrir WhatsApp"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg shadow-[#25D366]/30 hover:scale-110 transition-transform">
        <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
    </div>
  )
}

// ── DemoForm (reusable) ──────────────────────────────────────────────────

function DemoForm() {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', message: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || !form.phone) return
    setSending(true); setError('')
    try {
      const result = await api.submitLead({ ...form, source: 'landing_demo' })
      navigate('/gracias', { state: { leadId: result.data.id, leadName: form.name } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar')
    }
    setSending(false)
  }

  const inputClass = "w-full bg-white border border-[#e8e8e4] rounded-xl px-4 py-3 text-[14px] text-[#1a1a1a] placeholder:text-[#ccc] outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"

  return (
    <form onSubmit={handleSubmit} className="bg-[#f8f8f6] rounded-2xl p-6 md:p-8 space-y-4">
      <div>
        <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Nombre *</label>
        <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tu nombre completo" className={inputClass} />
      </div>
      <div>
        <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Empresa</label>
        <input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Nombre de tu empresa" className={inputClass} />
      </div>
      <div>
        <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Email *</label>
        <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="tu@empresa.com" className={inputClass} />
      </div>
      <div>
        <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Teléfono *</label>
        <input type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+52 55 1234 5678" className={inputClass} />
      </div>
      <div>
        <label className="text-[12px] font-medium text-[#999] mb-1.5 block">Mensaje (opcional)</label>
        <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="¿Qué productos importas? ¿Cuántas operaciones al mes?" className={`${inputClass} h-20 resize-none`} />
      </div>
      {error && <p className="text-[12px] text-rose-600">{error}</p>}
      <button type="submit" disabled={sending || !form.name || !form.email || !form.phone}
        className="w-full text-[13px] text-white bg-[#1a1a1a] px-7 py-3.5 rounded-full font-medium hover:bg-[#333] disabled:opacity-50 transition-colors">
        {sending ? 'Enviando...' : 'Agendar Demo'}
      </button>
      <p className="text-[11px] text-[#999] text-center pt-1">Piloto gratuito de 30 días disponible · Sin compromiso</p>
    </form>
  )
}

// ── FAQ Panel ────────────────────────────────────────────────────────────

function FaqPanel({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div id="faq" className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
      <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
        <div className="lg:max-w-sm shrink-0">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/PREGUNTAS FRECUENTES</p>
          <h2 className="text-3xl md:text-[2.5rem] font-bold text-[#1a1a1a] tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Las preguntas más comunes
          </h2>
          <p className="text-[14px] text-[#666] mt-4 leading-relaxed">
            Si tu pregunta no está aquí, escríbenos por WhatsApp o responde al final del formulario.
          </p>
        </div>
        <div className="flex-1">
          {items.map((item, i) => (
            <div key={i} className="border-b border-[#f0f0f0] last:border-b-0">
              <button className="w-full flex items-center justify-between py-5 text-left gap-4" onClick={() => setOpen(open === i ? null : i)}>
                <span className="text-[15px] font-semibold text-[#1a1a1a]">{item.q}</span>
                <div className={`w-7 h-7 rounded-full border border-[#e0e0e0] flex items-center justify-center shrink-0 transition-transform duration-200 ${open === i ? 'rotate-45' : ''}`}>
                  <svg className="w-3.5 h-3.5 text-[#999]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                </div>
              </button>
              <Expandable isOpen={open === i}><div className="pb-5 pr-12"><p className="text-[13.5px] text-[#666] leading-relaxed">{item.a}</p></div></Expandable>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
