/**
 * Dedup por RFC del listado 69-B — prevalece la situación MÁS RECIENTE del
 * proceso, no la más severa (radiografía §7.3, corregido 24-ago-2026).
 * El proceso jurídico avanza presunto → desvirtuado (favorable, cierra) o
 * definitivo → sentencia favorable (revoca el definitivo). Con el ranking
 * anterior por severidad, un desvirtuado o una sentencia favorable POSTERIOR
 * quedaba eclipsado por la fila más grave y el RFC seguía puntuando como
 * definitivo/presunto. Vive en src/lib para que la ingesta (scripts/) y los
 * tests la compartan sin romper el rootDir del build.
 */
export interface Fila69B { rfc: string; razonSocial: string; situacion: string }

export function dedupPorRfc(rows: Fila69B[]): Fila69B[] {
  const etapa: Record<string, number> = { PRESUNTO: 1, DEFINITIVO: 2, DESVIRTUADO: 3, SENTENCIA_FAVORABLE: 4 };
  const porRfc = new Map<string, Fila69B>();
  for (const r of rows) {
    const prev = porRfc.get(r.rfc);
    if (!prev || (etapa[r.situacion] ?? 0) > (etapa[prev.situacion] ?? 0)) porRfc.set(r.rfc, r);
  }
  return [...porRfc.values()];
}
