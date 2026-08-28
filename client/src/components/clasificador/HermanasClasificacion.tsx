/**
 * "Compara contra las hermanas" (Ola 1, Operación 2026-08): subpartidas de la
 * misma partida presentes en el catálogo TIGIE, con la elegida marcada.
 *
 * 4ª revisión (prioridad 1): además de la lista, muestra el VEREDICTO de la
 * RGI 6 específica-vs-residual — cuál ganó, por qué, y el descarte textual de
 * la perdedora. Cuando el pase no pudo correr se dice, no se inventa.
 */
import { useState } from 'react'
import { ChevronDown, Check, Scale, AlertTriangle } from 'lucide-react'
import { Badge } from '../ui'
import type { SubpartidaHermana } from '../../lib/api/clasificacion-lote'
import { rgi6Visible, type ComparacionRGI6 } from '../../lib/api/rgi6'

/** Veredicto escrito de la RGI 6 — sin veredicto no se pinta nada. */
function VeredictoRGI6({ rgi6 }: { rgi6: ComparacionRGI6 }) {
  const noCorrio = rgi6.estado === 'no_ejecutado'
  const sinCandidata = rgi6.estado === 'sin_candidata'
  const Icono = noCorrio ? AlertTriangle : Scale
  return (
    <div className={`border rounded-sello p-3 space-y-2 ${noCorrio ? 'border-ambar/40 bg-ambar-suave' : 'border-linea bg-petroleo-suave/50'}`}>
      <div className="flex items-start gap-2">
        <Icono className="w-4 h-4 mt-0.5 shrink-0 text-tinta-suave" strokeWidth={1.5} aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium text-tinta leading-relaxed">
            RGI 6 — subpartida específica frente a residual
          </p>
          <p className="text-sm text-tinta-suave leading-relaxed">{rgi6.aviso}</p>
        </div>
      </div>
      {rgi6.residual && rgi6.candidata && (
        <p className="text-sm text-tinta-suave leading-relaxed">
          Se comparó <span className="font-sello-mono text-tinta">{rgi6.residual.codeFormatted}</span> ({rgi6.residual.description.trim()}) contra{' '}
          <span className="font-sello-mono text-tinta">{rgi6.candidata.codeFormatted}</span> ({rgi6.candidata.description.trim()}).
        </p>
      )}
      {rgi6.justificacion && (
        <p className="text-sm text-tinta leading-relaxed"><span className="text-tinta-suave">Justificación:</span> {rgi6.justificacion}</p>
      )}
      {rgi6.descarte && (
        <p className="text-sm text-tinta leading-relaxed"><span className="text-tinta-suave">Descarte:</span> {rgi6.descarte}</p>
      )}
      {sinCandidata && rgi6.residual && (
        <p className="text-sm text-tinta-suave leading-relaxed">{rgi6.residual.motivo}</p>
      )}
      {rgi6.notas.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-linea">
          {rgi6.notas.map(n => (
            <li key={n.source} className="text-xs text-tinta-suave leading-relaxed">
              <span className="text-tinta">{n.source}</span>
              {n.cotejo === 'pendiente' && <span> · pendiente de cotejo contra fuente oficial</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function HermanasClasificacion({ hermanas, rgi6 }: { hermanas: SubpartidaHermana[]; rgi6?: ComparacionRGI6 | null }) {
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const veredicto = rgi6Visible(rgi6) ? <VeredictoRGI6 rgi6={rgi6} /> : null
  if (hermanas.length === 0) {
    return (
      <div className="space-y-2">
        {veredicto}
        <p className="text-sm text-tinta-suave">La partida de esta fracción no está en el catálogo TIGIE cargado — no hay hermanas que comparar.</p>
      </div>
    )
  }
  const partida = hermanas[0]!.code.slice(0, 4)
  return (
    <div className="space-y-2">
      {veredicto}
      <p className="text-sm text-tinta-suave leading-relaxed">
        Subpartidas de la partida <span className="font-sello-mono text-tinta">{partida}</span> en el catálogo ({hermanas.length}). Si la descripción de una hermana encaja mejor con tu producto, revisa antes de usar la propuesta.
      </p>
      <ul className="divide-y divide-linea border border-linea rounded-sello">
        {hermanas.map(h => {
          const abierta = abiertas[h.code] ?? h.elegida
          return (
            <li key={h.code} className={h.elegida ? 'bg-petroleo-suave/50' : ''}>
              <button
                type="button"
                onClick={() => setAbiertas(a => ({ ...a, [h.code]: !abierta }))}
                aria-expanded={abierta}
                className="w-full text-left px-3 py-2.5 flex items-start gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello"
              >
                <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-tinta-suave transition-transform duration-150 ${abierta ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden />
                <span className="font-sello-mono text-base text-tinta shrink-0">{h.codeFormatted}</span>
                <span className="text-sm text-tinta leading-relaxed flex-1">{h.description}</span>
                {h.elegida && <Badge tono="petroleo"><Check className="w-3 h-3" strokeWidth={2} aria-hidden /> elegida</Badge>}
              </button>
              {abierta && h.fracciones.length > 0 && (
                <ul className="pl-9 pr-3 pb-2.5 space-y-1">
                  {h.fracciones.map(f => (
                    <li key={f.code} className={`flex items-start gap-2 text-sm leading-relaxed ${f.elegida ? 'text-petroleo font-medium' : 'text-tinta-suave'}`}>
                      <span className="font-sello-mono shrink-0">{f.codeFormatted}</span>
                      <span>{f.description}</span>
                      {f.elegida && <Check className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-label="Fracción elegida" />}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
