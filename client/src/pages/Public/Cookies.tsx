import { Link } from 'react-router-dom'

export function CookiesPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#8B8B6A' }}>
      <div className="max-w-[900px] mx-auto px-3 md:px-5 py-3 md:py-5 space-y-3">
        <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#1a1a1a] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold" style={{ fontFamily: 'system-ui' }}>AI</span>
            </div>
            <span className="text-lg font-semibold text-[#1a1a1a] tracking-tight">ADUANAI</span>
          </Link>
          <Link to="/" className="text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors">← Volver</Link>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl px-6 md:px-10 py-10 md:py-14">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[#999] font-medium mb-3">/LEGAL</p>
          <h1 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-8" style={{ fontFamily: "'Outfit', sans-serif" }}>Política de Cookies</h1>
          <p className="text-[12px] text-[#999] mb-8">Última actualización: abril 2026</p>

          <div className="prose-sm space-y-6 text-[14px] text-[#666] leading-relaxed">
            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">1. ¿Qué son las Cookies?</h2>
              <p>Las cookies son pequeños archivos de texto que se almacenan en su dispositivo cuando visita nuestro sitio web. Nos ayudan a hacer que el sitio funcione correctamente, a hacerlo más seguro y a proporcionarle una mejor experiencia.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">2. Cookies que Utilizamos</h2>

              <div className="bg-[#f8f8f6] rounded-xl p-4 mb-3">
                <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Cookies Técnicas (Necesarias)</p>
                <p className="text-[12px] text-[#888]">Esenciales para el funcionamiento de la plataforma. Incluyen la cookie de sesión (JWT token) que mantiene su sesión activa y preferencias de idioma. No se pueden desactivar.</p>
              </div>

              <div className="bg-[#f8f8f6] rounded-xl p-4 mb-3">
                <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Cookies de Funcionalidad</p>
                <p className="text-[12px] text-[#888]">Almacenan sus preferencias de uso como el estado del sidebar, filtros aplicados y configuración de la interfaz para mejorar su experiencia.</p>
              </div>

              <div className="bg-[#f8f8f6] rounded-xl p-4">
                <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Cookies de Analytics (Próximamente)</p>
                <p className="text-[12px] text-[#888]">En el futuro podríamos implementar cookies de analytics para entender cómo los usuarios interactúan con la plataforma y mejorar el servicio. Estas serán opcionales y requerirán su consentimiento.</p>
              </div>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">3. Cómo Desactivar Cookies</h2>
              <p>Puede configurar su navegador para rechazar todas las cookies o para que le avise cuando se envía una cookie. Sin embargo, si desactiva las cookies técnicas, es posible que algunas partes de la plataforma no funcionen correctamente.</p>
              <p className="mt-2">Instrucciones por navegador:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-[#1a1a1a]">Chrome:</strong> Configuración → Privacidad y seguridad → Cookies</li>
                <li><strong className="text-[#1a1a1a]">Firefox:</strong> Preferencias → Privacidad y seguridad → Cookies</li>
                <li><strong className="text-[#1a1a1a]">Safari:</strong> Preferencias → Privacidad → Gestionar datos de sitios web</li>
                <li><strong className="text-[#1a1a1a]">Edge:</strong> Configuración → Cookies y permisos del sitio</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">4. Contacto</h2>
              <p>Para dudas sobre nuestra política de cookies: <strong className="text-[#1a1a1a]">contacto@aduanai.mx</strong></p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
