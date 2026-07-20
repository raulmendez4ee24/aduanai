/** Vigencias normativas que modifican temporalmente el scoring. */
export interface InstrumentoVigencia {
  instrumento: string;
  version: string;
  fechaPublicacionPortal: string;
  fechaEfectos: string;
  estado: 'VERSION_ANTICIPADA' | 'PUBLICADA_DOF';
  dofFecha: string | null;
  urlOficial: string;
  textoTransitorio: string;
  prorrogaHasta: string;
  fechaCotejo: string;
}

export const PRORROGA_E2: InstrumentoVigencia = {
  instrumento: 'Segunda Resolución de Modificaciones a las RGCE 2026',
  version: '1a versión anticipada (la 2a VA del 04-jun-2026 no altera este transitorio según cotejo 2026-07-19)',
  fechaPublicacionPortal: '2026-06-02',
  fechaEfectos: '2026-06-01',
  estado: 'VERSION_ANTICIPADA',
  dofFecha: null,
  urlOficial: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/anticipadas/2aRMRGCE2026_1aVersionAnticipada.pdf',
  textoTransitorio: 'Para los efectos del artículo 59, fracción III de la Ley y de la regla 1.5.1., hasta el 31 de julio de 2026, quienes introduzcan mercancías a territorio nacional podrán cumplir con las referidas disposiciones, en términos de lo establecido en el Transitorio Quinto, segundo párrafo de las RGCE para 2025, publicadas en el DOF el 30 de diciembre de 2024.',
  prorrogaHasta: '2026-07-31',
  fechaCotejo: '2026-07-19',
};

/** La prórroga es inclusiva; E2 se vuelve exigible al día siguiente. */
export function e2Exigible(fechaISO: string): boolean {
  return fechaISO > PRORROGA_E2.prorrogaHasta;
}
