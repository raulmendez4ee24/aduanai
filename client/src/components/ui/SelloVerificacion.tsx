/**
 * SELLO · SelloVerificacion — EL COMPONENTE FIRMA DEL PRODUCTO
 * (docs/DESIGN_SYSTEM.md §7)
 *
 * Aparece junto a CADA dato legal de la app: dice si el dato está verificado
 * contra fuente oficial, cuándo se publicó y cómo lo comprobamos. Compacto,
 * accesible por teclado (Enter/Espacio abre, Escape cierra) y con popover
 * de procedencia completa — la única sombra permitida fuera de modales.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { BadgeCheck, AlertTriangle, ExternalLink, CircleHelp } from 'lucide-react'

export type EstadoSello = 'verificado' | 'sin_verificar' | 'vencido' | 'no_revisado'

export interface SelloVerificacionProps {
  estado: EstadoSello
  /** "DOF", "Diputados LeyesBiblio", "SNICE"… */
  fuenteNombre?: string
  fuenteUrl?: string
  /** ISO (YYYY-MM-DD…) — se muestra como "12-jun-2026" */
  fechaPublicacion?: string
  fechaVerificacion?: string
  metodo?: 'manual' | 'scraper'
  className?: string
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-06-12" → "12-jun-2026" (formato de fecha visible del sistema Sello). */
export function formatFechaSello(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`
}

const METODO_LABEL: Record<NonNullable<SelloVerificacionProps['metodo']>, string> = {
  manual: 'Cotejo manual contra fuente oficial',
  scraper: 'Verificación automática (scraper)',
}

export function SelloVerificacion({
  estado, fuenteNombre, fuenteUrl, fechaPublicacion, fechaVerificacion, metodo, className = '',
}: SelloVerificacionProps) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLSpanElement>(null)
  const popId = useId()

  useEffect(() => {
    if (!abierto) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setAbierto(false) }
    function onClick(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [abierto])

  const fPub = formatFechaSello(fechaPublicacion)
  const fVer = formatFechaSello(fechaVerificacion)

  const badge = (() => {
    switch (estado) {
      case 'verificado':
        return (
          <span className="inline-flex items-center gap-1 bg-sello text-white text-13 font-medium px-1.5 py-0.5 rounded-sello-sm">
            <BadgeCheck className="w-3.5 h-3.5" aria-hidden />
            {fuenteNombre ?? 'Verificado'}
            {fPub && <span className="font-sello-mono font-normal">· {fPub}</span>}
          </span>
        )
      case 'sin_verificar':
        return (
          <span className="inline-flex items-center gap-1 bg-transparent text-ambar text-13 font-medium px-1.5 py-0.5 rounded-sello-sm border border-ambar/50">
            <CircleHelp className="w-3.5 h-3.5" aria-hidden />
            Sin verificar
          </span>
        )
      case 'vencido':
        return (
          <span className="inline-flex items-center gap-1 bg-papel-2 text-tinta-suave text-13 font-medium px-1.5 py-0.5 rounded-sello-sm border border-linea">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
            Requiere revalidación
          </span>
        )
      case 'no_revisado':
        return (
          <span className="inline-flex items-center gap-1 bg-transparent text-carmin text-13 font-medium px-1.5 py-0.5 rounded-sello-sm border border-carmin/50">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
            No revisado
          </span>
        )
    }
  })()

  const tieneDetalle = fuenteNombre || fuenteUrl || fPub || fVer || metodo

  return (
    <span ref={raiz} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => tieneDetalle && setAbierto(v => !v)}
        onMouseEnter={() => tieneDetalle && setAbierto(true)}
        aria-expanded={abierto}
        aria-controls={abierto ? popId : undefined}
        aria-label={`Estado de verificación: ${estado === 'verificado' ? 'verificado' : estado === 'sin_verificar' ? 'sin verificar' : estado === 'no_revisado' ? 'no revisado' : 'requiere revalidación'}. ${tieneDetalle ? 'Ver procedencia.' : ''}`}
        className="inline-flex cursor-pointer rounded-sello-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-1 disabled:cursor-default"
        disabled={!tieneDetalle}
      >
        {badge}
      </button>

      {abierto && tieneDetalle && (
        <div
          id={popId}
          role="dialog"
          aria-label="Procedencia del dato"
          onMouseLeave={() => setAbierto(false)}
          className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-superficie border border-linea rounded-sello shadow-sello-float p-4 text-left"
        >
          <p className="text-13 text-tinta-suave font-sello-ui mb-2">Procedencia del dato</p>
          <dl className="space-y-1.5 text-sm font-sello-ui text-tinta">
            {fuenteNombre && (
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-suave">Fuente</dt>
                <dd className="text-right">
                  {fuenteUrl ? (
                    <a
                      href={fuenteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-petroleo underline decoration-linea underline-offset-2 hover:decoration-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm"
                    >
                      {fuenteNombre} <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  ) : fuenteNombre}
                </dd>
              </div>
            )}
            {fPub && (
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-suave">Publicación</dt>
                <dd className="font-sello-mono">{fPub}</dd>
              </div>
            )}
            {fVer && (
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-suave">Última verificación</dt>
                <dd className="font-sello-mono">{fVer}</dd>
              </div>
            )}
            {metodo && (
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-suave">Método</dt>
                <dd className="text-right">{METODO_LABEL[metodo]}</dd>
              </div>
            )}
          </dl>
          {estado === 'vencido' && (
            <p className="mt-2 pt-2 border-t border-linea text-13 text-tinta-suave">
              La fuente pudo haber cambiado desde la última verificación.
            </p>
          )}
          {estado === 'sin_verificar' && (
            <p className="mt-2 pt-2 border-t border-linea text-13 text-ambar">
              Dato no cotejado contra fuente oficial — trátalo como referencia.
            </p>
          )}
          {estado === 'no_revisado' && (
            <p className="mt-2 pt-2 border-t border-linea text-13 text-carmin">
              El sistema no pudo consultar la fuente para este dato — el resultado NO lo cubre.
            </p>
          )}
        </div>
      )}
    </span>
  )
}
