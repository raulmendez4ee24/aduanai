/**
 * Criterios normativos visibles en producto ("regulación en vivo").
 * FUENTE ÚNICA: los mismos objetos de vigencias.ts que consume el motor —
 * el panel del cliente no puede divergir del scoring porque lee este dato.
 * Para agregar un criterio nuevo: agregar el InstrumentoVigencia en
 * vigencias.ts y espejarlo aquí (lista pensada para crecer).
 */
import { PRORROGA_E2 } from './vigencias';
import { RULES_VERSION } from './rules';

export interface CriterioNormativo {
  id: string;
  titulo: string;
  detalle: string;
  vigenciaHasta: string;
  instrumento: string;
  version: string;
  estado: 'VERSION_ANTICIPADA' | 'PUBLICADA_DOF';
  dofFecha: string | null;
  fechaPublicacionPortal: string;
  fechaCotejo: string;
  urlOficial: string;
}

export function listaCriterios(): { rulesVersion: string; criterios: CriterioNormativo[] } {
  return {
    rulesVersion: RULES_VERSION,
    criterios: [
      {
        id: 'PRORROGA_MVE_E2',
        titulo: 'Prórroga MVE (E2) vigente',
        detalle: `La manifestación de valor electrónica (art. 59-III LA, regla 1.5.1) no es exigible hasta el ${PRORROGA_E2.prorrogaHasta} inclusive; hasta esa fecha aplica el esquema de las RGCE 2025.`,
        vigenciaHasta: PRORROGA_E2.prorrogaHasta,
        instrumento: PRORROGA_E2.instrumento,
        version: PRORROGA_E2.version,
        estado: PRORROGA_E2.estado,
        dofFecha: PRORROGA_E2.dofFecha,
        fechaPublicacionPortal: PRORROGA_E2.fechaPublicacionPortal,
        fechaCotejo: PRORROGA_E2.fechaCotejo,
        urlOficial: PRORROGA_E2.urlOficial,
      },
    ],
  };
}
