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
  version: '3a versión anticipada (reforma el Transitorio Décimo Primero; la 1a VA daba hasta 31-jul-2026)',
  fechaPublicacionPortal: '2026-07-31',
  fechaEfectos: '2026-07-31',
  estado: 'VERSION_ANTICIPADA',
  dofFecha: null,
  urlOficial: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/anticipadas/2aRMRGCE_2026_Tercera_anticipada.pdf',
  textoTransitorio: 'Para los efectos del artículo 59, fracción III de la Ley y de la regla 1.5.1., hasta el 30 de septiembre de 2026, quienes introduzcan mercancías a territorio nacional podrán cumplir con las referidas disposiciones, en términos de lo establecido en el Transitorio Quinto, segundo párrafo de las RGCE para 2025, publicadas en el DOF el 30 de diciembre de 2024.',
  prorrogaHasta: '2026-09-30',
  fechaCotejo: '2026-08-12',
};

/** La prórroga es inclusiva; E2 se vuelve exigible al día siguiente. */
export function e2Exigible(fechaISO: string): boolean {
  return fechaISO > PRORROGA_E2.prorrogaHasta;
}
