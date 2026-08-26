/**
 * Fracciones RETIRADAS de la TIGIE vigente que sobreviven como datos legacy en
 * tigie-data.ts (misión CIERRE TOTAL 25-ago-2026, Bloque 1).
 *
 * El seed legacy las recreaba ACTIVAS en una DB limpia (el upsert no fijaba
 * `active` y el default del schema es true), resucitando fracciones que las
 * migraciones ya habían retirado — p. ej. 8544.42.01, retirada por la
 * migración 20260824234500 tras cotejarse contra la Base Única LIGIE 2026.
 *
 * Fuente única: todo camino de seed que cree fracciones debe pasar por
 * `activeParaSeed`. Al cotejar otra legacy y retirarla por migración, se
 * AGREGA aquí en el mismo commit — la migración cura la DB existente y esta
 * lista impide que el seed la resucite en DBs limpias.
 *
 * Backlog conocido (censo 25-ago): quedan 12 fracciones legacy activas por
 * cotejar (migración 20260824234500) y 13 subpartidas pre-HS2022 documentadas
 * en la migración 20260813193051. Solo se listan aquí las YA cotejadas y
 * retiradas — esta lista registra hechos, no sospechas.
 */

export const RETIRADAS_TIGIE = new Set<string>([
  '85444201', // retirada 24-ago-2026 (migración 20260824234500) — TIGIE 2026: 8544.42.05 / 8544.42.99
]);

/** ¿Con qué valor de `active` debe sembrarse esta fracción? */
export function activeParaSeed(code: string): boolean {
  return !RETIRADAS_TIGIE.has(code.replace(/[.\s-]/g, ''));
}
