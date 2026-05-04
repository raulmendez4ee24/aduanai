import { Link } from 'react-router-dom'

export function PrivacyPage() {
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
          <h1 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-8" style={{ fontFamily: "'Outfit', sans-serif" }}>Aviso de Privacidad</h1>
          <p className="text-[12px] text-[#999] mb-8">Última actualización: abril 2026 — En cumplimiento con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</p>

          <div className="prose-sm space-y-6 text-[14px] text-[#666] leading-relaxed">
            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">1. Responsable del Tratamiento</h2>
              <p>ADUANAI, con domicilio en Zapopan, Jalisco, México, es responsable del tratamiento de sus datos personales conforme al presente aviso de privacidad.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">2. Datos que Recopilamos</h2>
              <p>Recopilamos los siguientes datos personales:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-[#1a1a1a]">Datos de identificación:</strong> nombre, email, teléfono, empresa</li>
                <li><strong className="text-[#1a1a1a]">Datos de uso:</strong> clasificaciones realizadas, cotizaciones, operaciones de comercio exterior</li>
                <li><strong className="text-[#1a1a1a]">Datos técnicos:</strong> dirección IP, tipo de navegador, páginas visitadas</li>
                <li><strong className="text-[#1a1a1a]">Datos de operaciones:</strong> fracciones arancelarias, valores aduaneros, pedimentos (cuando el usuario los ingresa voluntariamente)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">3. Finalidades del Tratamiento</h2>
              <p>Sus datos personales serán utilizados para:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Proveer los servicios contratados de clasificación arancelaria, cotización y compliance</li>
                <li>Crear y gestionar su cuenta de usuario</li>
                <li>Enviar notificaciones sobre cambios regulatorios que afecten sus operaciones</li>
                <li>Mejorar nuestros algoritmos de inteligencia artificial (usando datos anonimizados)</li>
                <li>Contactarlo en relación con su cuenta o solicitudes de soporte</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">4. No Vendemos sus Datos</h2>
              <p><strong className="text-[#1a1a1a]">ADUANAI no vende, alquila ni comparte sus datos personales con terceros para fines de marketing.</strong> Sus datos solo se comparten con proveedores de servicios necesarios para la operación de la plataforma (hosting, procesamiento de pagos) bajo estrictos acuerdos de confidencialidad.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">5. Derechos ARCO</h2>
              <p>Usted tiene derecho a:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong className="text-[#1a1a1a]">Acceder</strong> a sus datos personales en nuestro poder</li>
                <li><strong className="text-[#1a1a1a]">Rectificar</strong> sus datos cuando sean inexactos o incompletos</li>
                <li><strong className="text-[#1a1a1a]">Cancelar</strong> sus datos cuando considere que no se requieren para las finalidades señaladas</li>
                <li><strong className="text-[#1a1a1a]">Oponerse</strong> al tratamiento de sus datos para fines específicos</li>
              </ul>
              <p className="mt-2">Para ejercer sus derechos ARCO, envíe una solicitud a: <strong className="text-[#1a1a1a]">privacidad@aduanai.mx</strong></p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">6. Seguridad</h2>
              <p>Implementamos medidas de seguridad técnicas, administrativas y físicas para proteger sus datos personales contra daño, pérdida, alteración, destrucción o uso no autorizado. Los datos se transmiten mediante conexiones cifradas (HTTPS/TLS) y se almacenan en servidores seguros.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">7. Cambios al Aviso</h2>
              <p>Nos reservamos el derecho de modificar este aviso de privacidad. Los cambios serán notificados a través de la plataforma.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">8. Contacto</h2>
              <p>Para dudas sobre este aviso: <strong className="text-[#1a1a1a]">privacidad@aduanai.mx</strong></p>
              <p className="mt-1">Zapopan, Jalisco, México</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
