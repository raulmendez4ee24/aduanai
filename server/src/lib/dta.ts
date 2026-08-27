/**
 * DTA — Derecho de Trámite Aduanero por tipo de operación (Ola 2, Cotizador).
 *
 * Fundamento: Art. 49 de la Ley Federal de Derechos (LFD). Hasta hoy el
 * cotizador aplicaba SIEMPRE 8 al millar; una importación temporal IMMEX, un
 * activo fijo o una operación al amparo de un tratado pagan cuota fija o
 * 1.76 al millar. Este catálogo es la única fuente para el cotizador.
 *
 * Regla de la casa (docs/REGLAS_AGENTES_OPERACION.md): nada de datos legales
 * inventados. Cada entrada declara su fracción del Art. 49 y el monto; el
 * respaldo se comprueba CONTRA EL CORPUS (`LegalDocument` reference
 * "Art. 49 LFD") en `respaldarDTAConCorpus`: si el monto aparece en el texto
 * del corpus → cotejo 'corpus'; si no → 'pendiente' y la UI muestra el aviso.
 * Nunca se marca 'verificado' desde aquí: eso exige cotejo humano contra DOF.
 */

export type TipoOperacionDTA =
  | 'general'            // A1 definitiva y cualquier caso no listado — fracc. I
  | 'activo_fijo_immex'  // AF — activo fijo IMMEX — fracc. II
  | 'temporal_immex'     // IN — insumos temporales IMMEX — fracc. III
  | 'tratado'            // originaria bajo tratado (sin cargos sobre el valor) — fracc. IV
  | 'exenta_retorno'     // exentas / retorno / temporales para retornar en el mismo estado — fracc. IV
  | 'exportacion'        // A1 exportación / RT — fracc. V
  | 'transito_interno'   // fracc. VII a)
  | 'transito_internacional' // fracc. VII b)
  | 'rectificacion';     // fracc. VII e)

export type CotejoDTA = 'verificado' | 'corpus' | 'pendiente';

export interface EntradaDTA {
  tipo: TipoOperacionDTA;
  etiqueta: string;
  /** Claves de pedimento típicas (Apéndice 2 Anexo 22) — orientativas. */
  claves: string[];
  base: 'millar' | 'fija';
  /** Si base='millar': al millar sobre valor en aduana. Si 'fija': MXN por operación. */
  valor: number;
  fraccionArt49: string;
  fundamento: string;
  /** Texto literal a buscar en el corpus para respaldar el monto. */
  huellaCorpus: string;
  /** Se llena en runtime con `respaldarDTAConCorpus`; default 'pendiente'. */
  cotejo: CotejoDTA;
  nota?: string;
}

const FUND = 'Art. 49 Ley Federal de Derechos (LFD), vigente 2026';

export const CATALOGO_DTA: EntradaDTA[] = [
  { tipo: 'general', etiqueta: 'Importación definitiva (general, 8 al millar)', claves: ['A1', 'A3', 'C1', 'F4', 'F5', 'G1', 'V1'], base: 'millar', valor: 8, fraccionArt49: 'I', fundamento: `${FUND}, fracc. I`, huellaCorpus: 'Del 8 al millar', cotejo: 'pendiente' },
  { tipo: 'activo_fijo_immex', etiqueta: 'Activo fijo IMMEX (AF, 1.76 al millar)', claves: ['AF'], base: 'millar', valor: 1.76, fraccionArt49: 'II', fundamento: `${FUND}, fracc. II`, huellaCorpus: 'Del 1.76 al millar', cotejo: 'pendiente', nota: 'Si el resultado es menor a la cuota de la fracc. III, se paga esta última (último párrafo Art. 49).' },
  { tipo: 'temporal_immex', etiqueta: 'Temporal IMMEX insumos (IN, cuota fija)', claves: ['IN', 'AJ'], base: 'fija', valor: 461.61, fraccionArt49: 'III', fundamento: `${FUND}, fracc. III`, huellaCorpus: 'Exportación IMMEX): $461.61', cotejo: 'pendiente', nota: 'Cuota fija por operación (pedimento); no se paga por el retorno (RT) de estas mercancías.' },
  { tipo: 'tratado', etiqueta: 'Originaria bajo tratado (cuota fija)', claves: ['A1 + trato arancelario preferencial'], base: 'fija', valor: 461.61, fraccionArt49: 'IV', fundamento: `${FUND}, fracc. IV`, huellaCorpus: 'por cada operación: $461.61', cotejo: 'pendiente', nota: 'Aplica cuando el tratado prohíbe cargos sobre el valor (p. ej. T-MEC Art. 2.16). Requiere certificado/certificación de origen válido.' },
  { tipo: 'exenta_retorno', etiqueta: 'Exenta / retorno / temporal mismo estado (cuota fija)', claves: ['RT', 'K1', 'H1', 'A3'], base: 'fija', valor: 461.61, fraccionArt49: 'IV', fundamento: `${FUND}, fracc. IV`, huellaCorpus: 'por cada operación: $461.61', cotejo: 'pendiente' },
  { tipo: 'exportacion', etiqueta: 'Exportación (cuota fija)', claves: ['A1 exportación', 'RT'], base: 'fija', valor: 462.86, fraccionArt49: 'V', fundamento: `${FUND}, fracc. V`, huellaCorpus: 'En las operaciones de exportación: $462.86', cotejo: 'pendiente' },
  { tipo: 'transito_interno', etiqueta: 'Tránsito interno (cuota fija)', claves: ['T3', 'T6'], base: 'fija', valor: 461.61, fraccionArt49: 'VII a)', fundamento: `${FUND}, fracc. VII inciso a)`, huellaCorpus: 'De tránsito interno: $461.61', cotejo: 'pendiente' },
  { tipo: 'transito_internacional', etiqueta: 'Tránsito internacional (cuota fija)', claves: ['T7', 'T9'], base: 'fija', valor: 438.36, fraccionArt49: 'VII b)', fundamento: `${FUND}, fracc. VII inciso b)`, huellaCorpus: 'De tránsito internacional: $438.36', cotejo: 'pendiente' },
  { tipo: 'rectificacion', etiqueta: 'Rectificación de pedimento (cuota fija)', claves: ['R1'], base: 'fija', valor: 444.42, fraccionArt49: 'VII e)', fundamento: `${FUND}, fracc. VII inciso e)`, huellaCorpus: 'Por cada rectificación de pedimento: $444.42', cotejo: 'pendiente' },
];

export const TIPOS_OPERACION_DTA = CATALOGO_DTA.map(e => e.tipo) as TipoOperacionDTA[];

export function esTipoOperacionDTA(x: unknown): x is TipoOperacionDTA {
  return typeof x === 'string' && (TIPOS_OPERACION_DTA as string[]).includes(x);
}

export function entradaDTA(tipo: TipoOperacionDTA | null | undefined): EntradaDTA {
  return CATALOGO_DTA.find(e => e.tipo === (tipo ?? 'general')) ?? CATALOGO_DTA[0]!;
}

export interface DTAResuelto {
  tipo: TipoOperacionDTA;
  etiqueta: string;
  base: 'millar' | 'fija';
  /** % equivalente para el cálculo (8 al millar = 0.8 %). 0 si cuota fija. */
  dtaPct: number;
  /** Monto fijo MXN por operación. 0 si al millar. */
  montoFijoMXN: number;
  fraccionArt49: string;
  fundamento: string;
  cotejo: CotejoDTA;
  /** Aviso visible cuando el monto no está respaldado por fuente cotejada. */
  aviso: string | null;
  nota: string | null;
}

/** Resuelve la regla DTA para el cálculo. Puro. */
export function resolverDTA(tipo: TipoOperacionDTA | null | undefined, catalogo: EntradaDTA[] = CATALOGO_DTA): DTAResuelto {
  const e = catalogo.find(x => x.tipo === (tipo ?? 'general')) ?? catalogo[0]!;
  const aviso = e.cotejo === 'verificado'
    ? null
    : e.cotejo === 'corpus'
      ? `DTA ${e.base === 'millar' ? `${e.valor} al millar` : `$${e.valor.toFixed(2)} MXN`} respaldado en el corpus (${e.fundamento}); cotejo formal contra DOF pendiente.`
      : `DTA ${e.etiqueta}: monto pendiente de fuente oficial (${e.fundamento}) — verifica antes de cotizar al cliente.`;
  return {
    tipo: e.tipo,
    etiqueta: e.etiqueta,
    base: e.base,
    dtaPct: e.base === 'millar' ? e.valor / 10 : 0,
    montoFijoMXN: e.base === 'fija' ? e.valor : 0,
    fraccionArt49: e.fraccionArt49,
    fundamento: e.fundamento,
    cotejo: e.cotejo,
    aviso,
    nota: e.nota ?? null,
  };
}

/**
 * Cruza el catálogo contra el texto del corpus (contenido del LegalDocument
 * "Art. 49 LFD"). Puro: recibe el texto; el wrapper con DB vive en
 * services/cotizador-dta.ts. Devuelve un catálogo NUEVO (no muta).
 */
export function verificarDTAContraTexto(
  textoCorpus: string | null,
  opts: { verbatimCotejado?: boolean } = {},
  catalogo: EntradaDTA[] = CATALOGO_DTA,
): EntradaDTA[] {
  const texto = (textoCorpus ?? '').replace(/\s+/g, ' ');
  return catalogo.map(e => {
    const hallado = texto.length > 0 && texto.includes(e.huellaCorpus);
    const cotejo: CotejoDTA = !hallado ? 'pendiente' : opts.verbatimCotejado ? 'verificado' : 'corpus';
    return { ...e, cotejo };
  });
}
