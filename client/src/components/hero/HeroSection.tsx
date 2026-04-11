import { useEffect, useRef, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import gsap from 'gsap';
import { Globe3D } from './Globe3D';

function HeroLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-20 h-20 rounded-full" style={{
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 1s linear infinite',
      }} />
    </div>
  );
}

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const pRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.fromTo(badgeRef.current,
        { opacity: 0, y: 20, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6 }
      )
      .fromTo(h1Ref.current?.children || [],
        { opacity: 0, y: 40, rotateX: 15 },
        { opacity: 1, y: 0, rotateX: 0, duration: 0.8, stagger: 0.12 },
        '-=0.3'
      )
      .fromTo(pRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6 },
        '-=0.4'
      )
      .fromTo(ctaRef.current?.children || [],
        { opacity: 0, y: 20, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1 },
        '-=0.3'
      )
      .fromTo(statsRef.current?.children || [],
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 },
        '-=0.2'
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* 3D Globe background */}
      <Suspense fallback={<HeroLoader />}>
        <Globe3D />
      </Suspense>

      {/* Gradient overlays for text readability */}
      <div className="absolute inset-0 z-[1]" style={{
        background: 'linear-gradient(to right, rgba(11,17,32,0.95) 0%, rgba(11,17,32,0.7) 40%, rgba(11,17,32,0.2) 100%)',
      }} />
      <div className="absolute bottom-0 left-0 right-0 h-32 z-[1]" style={{
        background: 'linear-gradient(to top, var(--bg-primary), transparent)',
      }} />

      {/* Content */}
      <div className="relative z-10 px-6 md:px-16 w-full max-w-7xl mx-auto">
        <div className="max-w-2xl">
          {/* Badge */}
          <div ref={badgeRef} className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8" style={{
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.2)',
          }}>
            <div className="w-2 h-2 rounded-full" style={{
              background: 'var(--emerald)',
              animation: 'pulseDot 2s infinite',
            }} />
            <span className="text-xs mono" style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>
              SISTEMA OPERATIVO DEL COMERCIO EXTERIOR
            </span>
          </div>

          {/* Headline */}
          <h1 ref={h1Ref} className="mb-6" style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}>
            <span className="block text-4xl md:text-6xl lg:text-[72px]">
              Clasifica en segundos
            </span>
            <span className="block text-4xl md:text-6xl lg:text-[72px]">
              lo que antes tomaba
            </span>
            <span className="block text-4xl md:text-6xl lg:text-[72px]" style={{
              background: 'linear-gradient(135deg, #60A5FA 0%, #3B82F6 40%, #06B6D4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              días.
            </span>
          </h1>

          {/* Subheadline */}
          <p ref={pRef} className="text-base md:text-lg leading-relaxed mb-10 max-w-lg" style={{
            color: 'var(--text-secondary)',
          }}>
            IA + 8,183 fracciones arancelarias oficiales TIGIE 2026.
            Aranceles LIGIE actualizados. El futuro del despacho aduanero.
          </p>

          {/* CTAs */}
          <div ref={ctaRef} className="flex flex-col sm:flex-row items-start gap-4">
            <Link to="/login" className="btn-primary text-base py-4 px-8 group" style={{ fontSize: '16px' }}>
              Empieza gratis
              <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform duration-300" />
            </Link>
            <a href="#demo" className="btn-secondary text-base py-4 px-8" style={{ fontSize: '16px' }}>
              Probar ahora
            </a>
          </div>

          {/* Stats */}
          <div ref={statsRef} className="flex gap-10 mt-14 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
            {[
              { value: '8,183', label: 'Fracciones TIGIE' },
              { value: '96', label: 'Capítulos' },
              { value: '<15s', label: 'Por clasificación' },
              { value: '95%', label: 'Precisión IA' },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-xl md:text-2xl font-bold mono" style={{ color: 'var(--accent)' }}>
                  {stat.value}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
