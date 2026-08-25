/**
 * Dedup por RFC del listado 69-B — prevalece la situación con FECHA DE
 * PUBLICACIÓN más reciente (radiografía §7.3, corregido 25-ago-2026).
 *
 * Cada fila del CSV del SAT trae las fechas de publicación del acto de SU
 * situación (presunción / desvirtuado / definitivo / sentencia favorable).
 * La cronología REAL decide: un presunto NUEVO posterior a una sentencia
 * favorable vieja prevalece, y un desvirtuado o sentencia posterior no queda
 * eclipsado por una fila más severa anterior.
 *
 * Solo cuando alguna fila no trae fecha parseable se cae al orden típico del
 * proceso (presunto → definitivo → desvirtuado → sentencia favorable) como
 * aproximación explícita — es fallback, no la regla.
 *
 * Vive en src/lib para que la ingesta (scripts/) y los tests la compartan
 * sin romper el rootDir del build.
 */
export interface Fila69B {
  rfc: string;
  razonSocial: string;
  situacion: string;
  /** Fecha de publicación del acto de ESTA situación (null si no parseable). */
  fecha?: Date | null;
}

const ETAPA_FALLBACK: Record<string, number> = { PRESUNTO: 1, DEFINITIVO: 2, DESVIRTUADO: 3, SENTENCIA_FAVORABLE: 4 };

function gana(nueva: Fila69B, previa: Fila69B): boolean {
  if (nueva.fecha && previa.fecha && nueva.fecha.getTime() !== previa.fecha.getTime()) {
    return nueva.fecha.getTime() > previa.fecha.getTime();
  }
  return (ETAPA_FALLBACK[nueva.situacion] ?? 0) > (ETAPA_FALLBACK[previa.situacion] ?? 0);
}

export function dedupPorRfc(rows: Fila69B[]): Fila69B[] {
  const porRfc = new Map<string, Fila69B>();
  for (const r of rows) {
    const prev = porRfc.get(r.rfc);
    if (!prev || gana(r, prev)) porRfc.set(r.rfc, r);
  }
  return [...porRfc.values()];
}
