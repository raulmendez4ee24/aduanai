/**
 * Vigencias normativas que modifican temporalmente el scoring.
 *
 * FUENTE ÚNICA DE VERDAD del plazo de la Manifestación de Valor (E2)
 * — decisión de Raúl, cierre del DEFERRED #21 (21-ago-2026): este archivo
 * MANDA; el corpus del Copilot lleva el transitorio anticipado sembrado como
 * documento etiquetado (reference "Transitorios VA-SAT 31-07-2026 RGCE") para
 * que Copilot y Risk Scorer digan lo mismo:
 *   · el DOF (1a RM, 14-may-2026) dice 31-may-2026;
 *   · la versión anticipada más reciente (2ª RM, 3a VA, Portal SAT
 *     31-jul-2026) dice 30-sep-2026, con efectos conforme a la regla 1.1.2
 *     RGCE, pendiente de publicación en el DOF.
 */
export interface InstrumentoVigencia {
  instrumento: string;
  version: string;
  /** Etiqueta canónica para UI/fundamentos: dice QUÉ es el instrumento. */
  etiqueta: string;
  fechaPublicacionPortal: string;
  fechaEfectos: string;
  estado: 'VERSION_ANTICIPADA' | 'PUBLICADA_DOF';
  dofFecha: string | null;
  urlOficial: string;
  textoTransitorio: string;
  prorrogaHasta: string;
  fechaCotejo: string;
  /** Por qué una versión anticipada surte efectos antes del DOF (verbatim). */
  fundamentoEfectos: {
    regla: string;
    texto: string;
    transitorioInstrumento: string;
  };
  /** Último plazo PUBLICADO EN DOF para la misma obligación (para que la
   *  respuesta explique ambos: "el DOF dice X; la anticipada dice Y"). */
  plazoDOF: {
    instrumento: string;
    dofFecha: string;
    prorrogaHasta: string;
    urlOficial: string;
  };
}

export const PRORROGA_E2: InstrumentoVigencia = {
  instrumento: 'Segunda Resolución de Modificaciones a las RGCE 2026',
  version: '3a versión anticipada (reforma el Transitorio Décimo Primero; la 1a VA daba hasta 31-jul-2026)',
  etiqueta: '2ª RM — versión anticipada Portal SAT, efectos conforme regla 1.1.2, pendiente DOF',
  fechaPublicacionPortal: '2026-07-31',
  fechaEfectos: '2026-07-31',
  estado: 'VERSION_ANTICIPADA',
  dofFecha: null,
  urlOficial: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/anticipadas/2aRMRGCE_2026_Tercera_anticipada.pdf',
  textoTransitorio: 'Para los efectos del artículo 59, fracción III de la Ley y de la regla 1.5.1., hasta el 30 de septiembre de 2026, quienes introduzcan mercancías a territorio nacional podrán cumplir con las referidas disposiciones, en términos de lo establecido en el Transitorio Quinto, segundo párrafo de las RGCE para 2025, publicadas en el DOF el 30 de diciembre de 2024.',
  prorrogaHasta: '2026-09-30',
  fechaCotejo: '2026-08-21',
  fundamentoEfectos: {
    regla: 'Regla 1.1.2 RGCE 2026',
    texto: 'Para los efectos del artículo 33, primer párrafo, fracción I, inciso g) del CFF, el SAT podrá dar a conocer en el Portal del SAT, de forma anticipada y únicamente con fines informativos, las RGCE y Anexos que faciliten el cumplimiento de las obligaciones aduaneras de los usuarios del comercio exterior. Los beneficios contenidos en dichas reglas y Anexos, serán aplicables a partir de que se den a conocer en el Portal del SAT, salvo que se señale fecha expresa para tales efectos.',
    transitorioInstrumento: 'Transitorio Único de la 2ª RM (3a VA): "Por lo que se refiere a las disposiciones dadas a conocer de manera anticipada en el Portal del SAT, su contenido surtirá sus efectos en términos de la regla 1.1.2."',
  },
  plazoDOF: {
    instrumento: 'Primera Resolución de Modificaciones a las RGCE 2026 (reforma el Transitorio Décimo Primero)',
    dofFecha: '2026-05-14',
    prorrogaHasta: '2026-05-31',
    urlOficial: 'https://dof.gob.mx/nota_detalle.php?codigo=5787425&fecha=14/05/2026',
  },
};

/** La prórroga es inclusiva; E2 se vuelve exigible al día siguiente. */
export function e2Exigible(fechaISO: string): boolean {
  return fechaISO > PRORROGA_E2.prorrogaHasta;
}
