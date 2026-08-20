/**
 * FUENTE ÚNICA de la versión de la tarifa vigente cargada en el sistema.
 *
 * Refleja el DATO REAL cargado (no el aspiracional): la TIGIE post-reforma
 * vigente desde el 01-ene-2026 (Decreto DOF 29-dic-2025), según el extracto
 * "Base Única" del SNICE del 30-mar-2026 que poblamos el catálogo.
 *
 * TODO lo que registre o muestre la versión (consultHash, traceability,
 * Cumplimiento, Verificación) debe leer de aquí — no de strings sueltos.
 * El seed de version_snapshots se deriva de estas constantes, y
 * getActiveVersions() cae a ellas si la tabla está vacía (nunca "unknown").
 */
export const TARIFF_VERSION = {
  // Lote 0.5 Corpus Íntegro (19-ago-2026): cotejo del decreto Tarifa 15
  // (DOF 23-abr-2026) contra el snapshot — 4 aranceles corregidos verbatim
  // (migración 20260819120000). El catálogo ya NO es solo el extracto 30-mar.
  tigie: 'TIGIE 2026 (reforma DOF 29-dic-2025, vigente 01-ene-2026) · Base Única SNICE 30-mar-2026 · Tarifa 15 DOF 23-abr-2026',
  ligie: 'LIGIE 2020 (reforma DOF 29-dic-2025) · Base Única SNICE 30-mar-2026',
  source: 'Base Única SNICE — extracto 2026-03-30 (DOF reforma 29-dic-2025) + Tarifa 15 DOF 23-abr-2026',
  publishDate: '2025-12-29',   // DOF del decreto de reforma
  effectiveDate: '2026-01-01', // entrada en vigor de la reforma
  snapshotDate: '2026-03-30',  // fecha del extracto Base Única cargado
  cotejoDate: '2026-08-19',    // último cotejo del catálogo contra el DOF (Tarifa 15 aplicada)
} as const;

// Alias retrocompatibles (otros módulos ya importan estos nombres).
export const TIGIE_VERSION = TARIFF_VERSION.tigie;
export const LIGIE_VERSION = TARIFF_VERSION.ligie;
