/**
 * ORIGEN DE LA SEÑAL — etiqueta ÚNICA para todo el producto.
 * El motor emite `origenEfectivo` (verificado | declarado | mixto | no_evaluado).
 * Un factor declarativo SIN RESPUESTA puntúa (noConfirmado) y llega como
 * 'declarado': se pinta "DECLARADO POR USUARIO", idéntico en /risk-scorer y
 * en /radar — no existe un tercer término (Fase A, Raúl 21-ago-2026).
 */
import { ShieldCheck } from 'lucide-react'

export function OrigenBadge({ origen, motivo }: { origen: string; motivo?: string }) {
  if (origen === 'no_evaluado') {
    // El motivo viene del motor (7.3): dataset vencido, sin ingesta o dato
    // faltante — la regla no sumó puntos ni activó bandera.
    return <span title={motivo ?? 'Señal no disponible — no suma puntos ni activa bandera'} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 cursor-help">No evaluado</span>
  }
  if (origen === 'verificado') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200"><ShieldCheck className="w-3 h-3" />VERIFICADO POR EL SISTEMA</span>
  }
  if (origen === 'mixto') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">MIXTO (sistema + usuario)</span>
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">DECLARADO POR USUARIO</span>
}
