/**
 * SELLO · versión del corpus/tarifa que el sistema usa al generar reportes.
 *
 * Espejo de `server/src/lib/tariff-version.ts` (TARIFF_VERSION). Hoy el
 * producto opera sobre UN snapshot estático del catálogo (Base Única SNICE
 * 30-mar-2026), así que reflejarlo en cliente es fiel. Las fechas son cotejos
 * REALES de fases previas (DOF de la reforma + fecha del extracto SNICE).
 *
 * GAP conocido (docs/GAP_API_EXPEDIENTE.md): el endpoint de glosa NO devuelve
 * la versión que usó en esa corrida; debería eco-devolverla para que el folio
 * del reporte sea fiel a ESE run. Mientras el snapshot sea único, este espejo
 * es correcto.
 */
export const CORPUS_VERSION = {
  tigie: 'TIGIE 2026 (reforma DOF 29-dic-2025, vigente 01-ene-2026)',
  baseUnica: 'Base Única SNICE — extracto 30-mar-2026',
  fuenteNombre: 'Base Única SNICE · DOF',
  fuenteUrl: 'https://www.snice.gob.mx',
  fechaPublicacion: '2025-12-29', // DOF del decreto de reforma de la TIGIE
  fechaVerificacion: '2026-03-30', // fecha del extracto Base Única cargado
} as const
