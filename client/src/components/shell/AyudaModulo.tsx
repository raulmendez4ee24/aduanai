/**
 * Botón "?" del topbar + modal de guía por módulo (Operación 2026-08).
 * - Se abre al pulsar "?" o con la tecla "?" fuera de un input.
 * - Primera visita a un módulo: se abre solo una vez (localStorage).
 * - Muestra pasos y la captura real de la pantalla si existe.
 */
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpCircle, X } from 'lucide-react'
import { guiaDeRuta, ayudaYaVista, marcarAyudaVista, type GuiaModulo } from '../../ayuda/guias'

export function BotonAyudaModulo() {
  const location = useLocation()
  const guia = guiaDeRuta(location.pathname)
  const [abierta, setAbierta] = useState(false)

  // Primera visita al módulo → abrir una vez.
  useEffect(() => {
    if (!guia) return
    if (!ayudaYaVista(guia.slug)) {
      const t = setTimeout(() => setAbierta(true), 400)
      return () => clearTimeout(t)
    }
  }, [guia?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tecla "?" (fuera de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const enCampo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (e.key === '?' && !enCampo && guia) { e.preventDefault(); setAbierta(true) }
      if (e.key === 'Escape') { if (guia) marcarAyudaVista(guia.slug); setAbierta(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guia])

  if (!guia) return null

  const cerrar = () => { marcarAyudaVista(guia.slug); setAbierta(false) }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={`Cómo se usa ${guia.titulo}`}
        title="¿Cómo se usa este módulo? (tecla ?)"
        className="p-1.5 text-tinta-suave hover:text-tinta rounded-sello-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
      >
        <HelpCircle className="w-5 h-5" strokeWidth={1.5} />
      </button>
      {abierta && <ModalGuia guia={guia} onCerrar={cerrar} />}
    </>
  )
}

function ModalGuia({ guia, onCerrar }: { guia: GuiaModulo; onCerrar: () => void }) {
  const [capturaOk, setCapturaOk] = useState(true)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="ayuda-titulo">
      <div className="absolute inset-0 bg-tinta/40" onClick={onCerrar} aria-hidden />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-papel border border-linea rounded-sello shadow-none">
        <div className="flex items-start gap-3 px-6 pt-5 pb-3 border-b border-linea">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.15em] text-tinta-suave font-medium">¿Cómo se usa?</p>
            <h2 id="ayuda-titulo" className="text-xl font-semibold text-tinta">{guia.titulo}</h2>
            <p className="text-sm text-tinta-suave mt-1">{guia.resumen}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="ml-auto p-1.5 text-tinta-suave hover:text-tinta rounded-sello-sm">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 px-6 py-5">
          <ol className="md:col-span-2 space-y-3 text-sm text-tinta">
            {guia.pasos.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-petroleo-suave text-petroleo text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                <span className="leading-relaxed">{p}</span>
              </li>
            ))}
          </ol>
          <div className="md:col-span-3">
            {guia.captura && capturaOk ? (
              <img
                src={guia.captura}
                alt={`Captura de ${guia.titulo}`}
                className="w-full rounded-sello-sm border border-linea"
                onError={() => setCapturaOk(false)}
              />
            ) : (
              <div className="w-full aspect-video rounded-sello-sm border border-dashed border-linea flex items-center justify-center text-xs text-tinta-suave">
                Captura de pantalla pendiente para este módulo
              </div>
            )}
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end">
          <button type="button" onClick={onCerrar} className="text-sm font-medium px-4 py-2 rounded-sello-sm bg-tinta text-papel hover:opacity-90">
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
