/**
 * SELLO · "Reglas del prevalidador" — catálogo documentado (Operación 2026-08).
 * Mismo espíritu que docs/RISK_SCORER_LEGAL.md: código, qué revisa, fundamento
 * y estado del cotejo. Fuente: GET /api/prevalidate/reglas.
 */
import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge, Button, SelloVerificacion } from '../ui'
import { apiPedimentos, type ReglaPrevalidador } from '../../lib/api/pedimentos'

const SEV: Record<ReglaPrevalidador['severidad'], { label: string; tono: 'carmin' | 'ambar' | 'neutral' }> = {
  error: { label: 'Error', tono: 'carmin' }, warning: { label: 'Advertencia', tono: 'ambar' }, info: { label: 'Informativo', tono: 'neutral' },
}

export function ReglasPrevalidador({ abiertoInicial = false }: { abiertoInicial?: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [reglas, setReglas] = useState<ReglaPrevalidador[] | null>(null)
  const [nota, setNota] = useState<{ nota: string; pendientes: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto || reglas) return
    apiPedimentos.reglas().then(r => { setReglas(r.data); setNota({ nota: r.nota, pendientes: r.catalogosPendientes }) })
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo de reglas.'))
  }, [abierto, reglas])

  return (
    <section className="rounded-sello border border-linea bg-superficie font-sello-ui">
      <button type="button" onClick={() => setAbierto(a => !a)} className="w-full flex items-center gap-2 px-5 py-4 text-left">
        <BookOpen className="w-5 h-5 text-tinta-suave" strokeWidth={1.5} aria-hidden />
        <span className="text-base font-medium text-tinta">Reglas del prevalidador</span>
        <span className="text-sm text-tinta-suave">— qué revisa, con qué fundamento y qué falta por cotejar</span>
        {abierto ? <ChevronUp className="w-4 h-4 ml-auto text-tinta-suave" aria-hidden /> : <ChevronDown className="w-4 h-4 ml-auto text-tinta-suave" aria-hidden />}
      </button>
      {abierto && (
        <div className="px-5 pb-5 border-t border-linea">
          {error && <p className="text-sm text-carmin mt-3">{error}</p>}
          {!reglas && !error && <p className="text-sm text-tinta-suave mt-3">Cargando catálogo…</p>}
          {nota && <p className="text-sm text-tinta-suave mt-3 leading-relaxed">{nota.nota}</p>}
          {nota && <p className="text-13 text-ambar mt-1 leading-relaxed">Catálogos pendientes: {nota.pendientes}</p>}
          {reglas && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-linea">
                    {['Código', 'Nivel', 'Qué revisa', 'Fundamento', 'Severidad'].map(h => (
                      <th key={h} scope="col" className="text-13 uppercase tracking-wide font-medium text-tinta-suave px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reglas.map(r => (
                    <tr key={r.codigo} className="border-b border-linea/60 align-top">
                      <td className="px-3 py-2 font-sello-mono text-13 text-tinta whitespace-nowrap">{r.codigo}</td>
                      <td className="px-3 py-2 text-13 text-tinta-suave">{r.nivel}</td>
                      <td className="px-3 py-2 text-sm text-tinta">
                        <span className="font-medium">{r.nombre}.</span> {r.descripcion}
                        {r.requiere && <span className="block text-13 text-tinta-suave mt-0.5">Requiere: {r.requiere}</span>}
                      </td>
                      <td className="px-3 py-2 text-13 text-tinta">
                        <span>{r.fundamento}</span>
                        <SelloVerificacion estado={r.cotejoFundamento === 'verificado' ? 'verificado' : 'sin_verificar'} className="mt-1" />
                      </td>
                      <td className="px-3 py-2"><Badge tono={SEV[r.severidad].tono}>{SEV[r.severidad].label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3"><Button variante="ghost" tamano="sm" type="button" onClick={() => setAbierto(false)}>Cerrar</Button></div>
        </div>
      )}
    </section>
  )
}
