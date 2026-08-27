/**
 * "Compara contra las hermanas" (Ola 1, Operación 2026-08): subpartidas de la
 * misma partida presentes en el catálogo TIGIE, con la elegida marcada. Capa
 * de contraste para el ojo humano — no cambia la propuesta.
 */
import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { Badge } from '../ui'
import type { SubpartidaHermana } from '../../lib/api/clasificacion-lote'

export function HermanasClasificacion({ hermanas }: { hermanas: SubpartidaHermana[] }) {
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  if (hermanas.length === 0) {
    return <p className="text-sm text-tinta-suave">La partida de esta fracción no está en el catálogo TIGIE cargado — no hay hermanas que comparar.</p>
  }
  const partida = hermanas[0]!.code.slice(0, 4)
  return (
    <div className="space-y-2">
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
