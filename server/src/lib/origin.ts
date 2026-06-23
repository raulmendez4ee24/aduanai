/**
 * Origen nacional vs. importación.
 *
 * Si la mercancía es de ORIGEN MÉXICO no se está importando, por lo que NO
 * aplican los requisitos de importación: padrón de importadores, certificado de
 * país de origen, permisos de importación (fitosanitario de importación, etc.),
 * cuotas compensatorias (antidumping, que por definición gravan importaciones de
 * cierto país extranjero) ni preferencias arancelarias de tratados.
 */
export function isDomesticOrigin(country?: string | null): boolean {
  if (!country) return false;
  const c = country.trim().toUpperCase();
  return c === 'MX' || c === 'MEX' || c === 'MEXICO' || c === 'MÉXICO' || c === 'MX-MX';
}

export const DOMESTIC_ORIGIN_NOTE =
  'Mercancía de origen nacional (México): los requisitos de importación —padrón de ' +
  'importadores, certificado de país de origen, permisos de importación, cuotas ' +
  'compensatorias y preferencias arancelarias de tratados— NO aplican. Para exportación ' +
  'o comercio nacional los requisitos son distintos.';
