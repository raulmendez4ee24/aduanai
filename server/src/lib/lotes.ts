/** Parte un arreglo en lotes de `tamano` (jobs por tenant: procesar de 50 en 50). */
export const TAMANO_LOTE_TENANTS = 50;

export function enLotes<T>(items: readonly T[], tamano = TAMANO_LOTE_TENANTS): T[][] {
  const n = Math.max(1, Math.floor(tamano));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
