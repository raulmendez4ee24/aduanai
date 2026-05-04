import { Link } from 'react-router-dom'

export function TermsPage() {
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
          <h1 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-8" style={{ fontFamily: "'Outfit', sans-serif" }}>Términos y Condiciones</h1>
          <p className="text-[12px] text-[#999] mb-8">Última actualización: abril 2026</p>

          <div className="prose-sm space-y-6 text-[14px] text-[#666] leading-relaxed">
            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">1. Uso de la Plataforma</h2>
              <p>ADUANAI es una plataforma de software como servicio (SaaS) que proporciona herramientas de inteligencia artificial para operaciones de comercio exterior en México. Al acceder y utilizar ADUANAI, usted acepta estos términos y condiciones en su totalidad.</p>
              <p className="mt-2">El servicio está destinado a profesionales de comercio exterior, agentes aduanales, importadores, exportadores y empresas con operaciones de comercio internacional en México.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">2. Clasificación Arancelaria — Descargo de Responsabilidad</h2>
              <p><strong className="text-[#1a1a1a]">La clasificación arancelaria proporcionada por ADUANAI es una sugerencia generada por inteligencia artificial y NO constituye asesoría legal, fiscal ni aduanera.</strong></p>
              <p className="mt-2">El usuario es el único responsable de verificar la fracción arancelaria sugerida antes de utilizarla en pedimentos, declaraciones o cualquier trámite ante autoridades aduaneras. ADUANAI no se hace responsable por errores en la clasificación, cálculos de impuestos o cualquier consecuencia derivada del uso de las sugerencias proporcionadas.</p>
              <p className="mt-2">Recomendamos siempre consultar con un agente aduanal certificado para operaciones de importación y exportación.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">3. Propiedad Intelectual</h2>
              <p>Todo el software, algoritmos, diseño, contenido y marcas de ADUANAI son propiedad exclusiva de sus creadores. Queda prohibida la reproducción, distribución o modificación del software sin autorización expresa por escrito.</p>
              <p className="mt-2">Los datos ingresados por el usuario (descripciones de productos, operaciones, documentos) son propiedad del usuario. ADUANAI puede utilizar datos anonimizados para mejorar los algoritmos de clasificación.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">4. Limitación de Responsabilidad</h2>
              <p>ADUANAI proporciona sus servicios "tal cual" y "según disponibilidad". No garantizamos que el servicio sea ininterrumpido, libre de errores o que los resultados sean 100% precisos.</p>
              <p className="mt-2">En ningún caso ADUANAI será responsable por daños indirectos, incidentales, especiales o consecuentes derivados del uso o la imposibilidad de uso del servicio, incluyendo pero no limitado a: multas aduaneras, retenciones de mercancía, pérdidas comerciales o daños reputacionales.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">5. Cuenta y Seguridad</h2>
              <p>El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso. Cualquier actividad realizada bajo su cuenta será su responsabilidad. Notifique inmediatamente cualquier uso no autorizado.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">6. Modificaciones</h2>
              <p>ADUANAI se reserva el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados a través de la plataforma y entrarán en vigor inmediatamente después de su publicación.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">7. Jurisdicción</h2>
              <p>Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia será sometida a los tribunales competentes de <strong className="text-[#1a1a1a]">Zapopan, Jalisco, México</strong>, renunciando expresamente a cualquier otro fuero que pudiera corresponder.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-3">8. Contacto</h2>
              <p>Para cualquier pregunta sobre estos términos: <strong className="text-[#1a1a1a]">contacto@aduanai.mx</strong></p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
