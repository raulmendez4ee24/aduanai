/**
 * SELLO · Shell v2 — Command palette (Cmd+K / Ctrl+K).
 * Dos fuentes: saltar a rutas (nav.ts) y buscar fracción arancelaria
 * (endpoint real: api.searchFractions → /fractions/search). Teclado completo:
 * ↑/↓ navega, Enter abre, Escape cierra. En móvil se abre con el botón de
 * búsqueda del topbar.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { api, type FractionSearchResult } from '../../lib/api'
import { rutasParaPalette, type NavItem } from './nav'

interface CommandPaletteProps {
  abierto: boolean
  onCerrar: () => void
  esSuperAdmin: boolean
}

type Resultado =
  | { tipo: 'ruta'; item: NavItem }
  | { tipo: 'fraccion'; item: FractionSearchResult }

export function CommandPalette({ abierto, onCerrar, esSuperAdmin }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [fracciones, setFracciones] = useState<FractionSearchResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  const rutas = useMemo(() => rutasParaPalette(esSuperAdmin), [esSuperAdmin])

  // Reset al abrir + autofocus
  useEffect(() => {
    if (abierto) {
      setQ(''); setFracciones([]); setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [abierto])

  // Búsqueda de fracciones (endpoint real), con debounce de 250ms.
  // Dispara con 3+ caracteres si parece código (dígitos/puntos) o 4+ si es texto.
  useEffect(() => {
    if (!abierto) return
    const limpio = q.trim()
    const pareceCodigo = /^[\d.]+$/.test(limpio)
    if ((pareceCodigo && limpio.replace(/\D/g, '').length < 3) || (!pareceCodigo && limpio.length < 4)) {
      setFracciones([]); setBuscando(false)
      return
    }
    setBuscando(true)
    const t = setTimeout(() => {
      api.searchFractions(limpio)
        .then(res => setFracciones(res.data.slice(0, 6)))
        .catch(() => setFracciones([]))
        .finally(() => setBuscando(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, abierto])

  const rutasFiltradas = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return rutas.slice(0, 8)
    return rutas.filter(r => r.label.toLowerCase().includes(n) || r.path.includes(n)).slice(0, 8)
  }, [q, rutas])

  const resultados: Resultado[] = useMemo(() => [
    ...rutasFiltradas.map(item => ({ tipo: 'ruta' as const, item })),
    ...fracciones.map(item => ({ tipo: 'fraccion' as const, item })),
  ], [rutasFiltradas, fracciones])

  useEffect(() => { setCursor(0) }, [resultados.length])

  function ejecutar(r: Resultado) {
    if (r.tipo === 'ruta') navigate(r.item.path)
    else navigate(`/fracciones?q=${encodeURIComponent(r.item.code)}`)
    onCerrar()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter' && resultados[cursor]) { e.preventDefault(); ejecutar(resultados[cursor]) }
    else if (e.key === 'Escape') { e.preventDefault(); onCerrar() }
  }

  // Mantener el ítem activo a la vista
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-tinta/30 flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar y navegar"
    >
      <div className="w-full max-w-xl bg-superficie border border-linea rounded-sello shadow-sello-float overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-linea">
          <Search className="w-4 h-4 text-tinta-suave shrink-0" strokeWidth={1.5} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar pantalla o fracción arancelaria…"
            className="w-full py-3.5 text-base font-sello-ui text-tinta bg-transparent placeholder:text-tinta-suave/60 focus:outline-none"
            aria-label="Buscar pantalla o fracción arancelaria"
          />
          <kbd className="hidden sm:block text-13 font-sello-mono text-tinta-suave border border-linea rounded-sello-sm px-1.5 py-0.5">esc</kbd>
        </div>

        <ul ref={listaRef} className="max-h-80 overflow-y-auto py-2" role="listbox" aria-label="Resultados">
          {rutasFiltradas.length > 0 && (
            <li className="px-4 py-1 text-13 uppercase tracking-wide text-tinta-suave font-sello-ui" aria-hidden>Ir a</li>
          )}
          {resultados.map((r, i) => (
            <li
              key={r.tipo === 'ruta' ? `r-${r.item.path}` : `f-${r.item.code}`}
              data-idx={i}
              role="option"
              aria-selected={i === cursor}
            >
              {r.tipo === 'fraccion' && i === rutasFiltradas.length && (
                <p className="px-4 pt-2 pb-1 text-13 uppercase tracking-wide text-tinta-suave font-sello-ui border-t border-linea mt-1" aria-hidden>Fracciones (catálogo TIGIE)</p>
              )}
              <button
                type="button"
                onClick={() => ejecutar(r)}
                onMouseEnter={() => setCursor(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left font-sello-ui transition-colors duration-150 ${i === cursor ? 'bg-petroleo-suave text-petroleo' : 'text-tinta hover:bg-papel-2'}`}
              >
                {r.tipo === 'ruta' ? (
                  <>
                    <r.item.icono className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    <span className="text-sm">{r.item.label}</span>
                    <span className="ml-auto text-13 font-sello-mono text-tinta-suave">{r.item.path}</span>
                  </>
                ) : (
                  <>
                    <span className="font-sello-mono text-sm shrink-0">{r.item.codeFormatted}</span>
                    <span className="text-sm text-tinta-suave truncate">{r.item.description}</span>
                  </>
                )}
                {i === cursor && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 ml-2" strokeWidth={1.5} aria-hidden />}
              </button>
            </li>
          ))}
          {resultados.length === 0 && (
            <li className="px-4 py-6 text-sm text-tinta-suave font-sello-ui text-center">
              {buscando ? 'Buscando en el catálogo…' : 'Sin resultados. Prueba con el nombre de una pantalla o una fracción (ej. 7318.15.01).'}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
