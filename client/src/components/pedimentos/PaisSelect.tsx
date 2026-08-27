/**
 * SELLO · Combo de país (ISO-2 + nombre) sobre client/src/lib/paises.ts.
 * "VIETNAM" nunca más como texto libre: el valor siempre es ISO-2.
 */
import { Select, type SelectProps } from '../ui'
import { PAISES, normalizarIso2 } from '../../lib/paises'

export interface PaisSelectProps extends Omit<SelectProps, 'value' | 'onChange' | 'children'> {
  value: string
  onChange: (iso2: string) => void
  /** Muestra la etiqueta de tratado (T-MEC / TLCUEM / CPTPP) junto al nombre. */
  conTratados?: boolean
  permitirVacio?: boolean
}

export function PaisSelect({ value, onChange, conTratados = true, permitirVacio = true, ...rest }: PaisSelectProps) {
  const v = normalizarIso2(value)
  const desconocido = v && !PAISES.some(p => p.iso2 === v)
  return (
    <Select {...rest} value={v} onChange={e => onChange(e.target.value)}>
      {permitirVacio && <option value="">Selecciona país…</option>}
      {desconocido && <option value={v}>{v} — (no está en el catálogo ISO)</option>}
      {PAISES.map(p => (
        <option key={p.iso2} value={p.iso2}>
          {p.iso2} — {p.nombre}{conTratados && p.tratados?.length ? ` · ${p.tratados.join('/')}` : ''}
        </option>
      ))}
    </Select>
  )
}
