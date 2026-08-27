/**
 * Plazos de permanencia de mercancías importadas temporalmente al amparo de
 * un programa IMMEX (Ola 1 · anexo24-real, 27-ago-2026).
 *
 * REGLA DE LA CASA: nada de plazos inventados. Cada entrada del catálogo dice
 * de dónde sale y si está respaldada por algo que vive en este repo
 * (`LegalDocument` del corpus, docs/) o si su cotejo contra la fuente oficial
 * está PENDIENTE. Cuando el cotejo está pendiente, el sistema aplica el plazo
 * general (18 meses) y devuelve un aviso visible para el usuario.
 *
 * Fuentes en el repo (27-ago-2026):
 *  - LegalDocument "Regla 4.3.1 RGCE 2026" (resumen en corpus): "18 meses
 *    general; 36 meses para empresas certificadas IVA-IEPS modalidad AAA".
 *  - LegalDocument "Regla 7.1.5 RGCE 2026": modalidades A / AA / AAA.
 *  - Ninguna entrada del corpus contiene el texto del Art. 108 LA ni de los
 *    Anexos I BIS / I TER del Decreto IMMEX: esos plazos quedan `pendiente`.
 */

export type TipoTemporal = 'INSUMO' | 'ACTIVO_FIJO';
export type Certificacion = 'A' | 'AA' | 'AAA' | null | undefined;
export type CotejoPlazo = 'corpus' | 'pendiente';

export interface PlazoInput {
  tipo: TipoTemporal;
  certificacion?: Certificacion;
  /** Fracción arancelaria (8 dígitos). Hoy NO se usa para derivar el anexo:
   *  no existe en el repo la lista de fracciones de los Anexos I BIS / I TER. */
  fraccion?: string | null;
  /** El llamador declara si la mercancía está en el Anexo I BIS / I TER del
   *  Decreto IMMEX (mercancías sensibles con plazo diferenciado). */
  esAnexoIBis?: boolean;
  esAnexoITer?: boolean;
}

export interface PlazoResult {
  /** Meses de permanencia; `null` = vigencia del programa (activo fijo). */
  meses: number | null;
  /** true cuando la mercancía permanece mientras el programa esté vigente. */
  vigenciaPrograma: boolean;
  /** Clave del catálogo que decidió el plazo. */
  regla: string;
  fundamento: string;
  cotejo: CotejoPlazo;
  /** Aviso para UI cuando se aplicó el general por falta de fuente. */
  aviso: string | null;
}

export interface EntradaCatalogoPlazo {
  clave: string;
  descripcion: string;
  /** Meses propuestos por la norma; `null` cuando no hay fuente en el repo
   *  (o cuando el plazo es la vigencia del programa). */
  meses: number | null;
  vigenciaPrograma: boolean;
  fundamento: string;
  /** Qué respalda el número dentro del repo. */
  fuenteRepo: string | null;
  cotejo: CotejoPlazo;
}

export const PLAZO_GENERAL_MESES = 18;

/** Catálogo de plazos IMMEX. Orden = prioridad de aplicación. */
export const CATALOGO_PLAZOS_IMMEX: EntradaCatalogoPlazo[] = [
  {
    clave: 'INSUMO_GENERAL',
    descripcion: 'Materias primas, partes, componentes, envases, empaques, combustibles (insumos del proceso productivo)',
    meses: 18,
    vigenciaPrograma: false,
    fundamento: 'Art. 108 fr. I Ley Aduanera; Regla 4.3.1 RGCE 2026',
    fuenteRepo: 'LegalDocument "Regla 4.3.1 RGCE 2026" (corpus, resumen: "18 meses general")',
    cotejo: 'corpus',
  },
  {
    clave: 'INSUMO_CERT_AAA',
    descripcion: 'Insumos de empresa con certificación IVA/IEPS modalidad AAA',
    meses: 36,
    vigenciaPrograma: false,
    fundamento: 'Regla 4.3.1 RGCE 2026 (beneficio de la certificación IVA/IEPS AAA)',
    fuenteRepo: 'LegalDocument "Regla 4.3.1 RGCE 2026" (corpus, resumen: "36 meses para empresas certificadas IVA-IEPS modalidad AAA")',
    cotejo: 'corpus',
  },
  {
    clave: 'INSUMO_CERT_A_AA',
    descripcion: 'Insumos de empresa con certificación IVA/IEPS modalidad A o AA',
    meses: null,
    vigenciaPrograma: false,
    fundamento: 'Reglas 7.3.1 / 7.3.3 RGCE 2026 (beneficios por modalidad) — el corpus solo respalda la ampliación para AAA',
    fuenteRepo: null,
    cotejo: 'pendiente',
  },
  {
    clave: 'ANEXO_I_BIS',
    descripcion: 'Mercancías del Anexo I BIS del Decreto IMMEX (sensibles: plazo reducido)',
    meses: null,
    vigenciaPrograma: false,
    fundamento: 'Art. 4 fr. I Decreto IMMEX (párrafos relativos al Anexo I BIS)',
    fuenteRepo: null,
    cotejo: 'pendiente',
  },
  {
    clave: 'ANEXO_I_TER',
    descripcion: 'Mercancías del Anexo I TER del Decreto IMMEX (acero y otras: plazo reducido)',
    meses: null,
    vigenciaPrograma: false,
    fundamento: 'Art. 4 fr. I Decreto IMMEX (párrafos relativos al Anexo I TER)',
    fuenteRepo: null,
    cotejo: 'pendiente',
  },
  {
    clave: 'ACTIVO_FIJO',
    descripcion: 'Maquinaria, equipo, herramientas, moldes, refacciones y equipo de control de calidad/ambiental (activo fijo)',
    meses: null,
    vigenciaPrograma: true,
    fundamento: 'Art. 108 fr. III Ley Aduanera (permanencia por la vigencia del programa IMMEX)',
    fuenteRepo: null,
    cotejo: 'pendiente',
  },
];

function entrada(clave: string): EntradaCatalogoPlazo {
  const e = CATALOGO_PLAZOS_IMMEX.find(x => x.clave === clave);
  if (!e) throw new Error(`Catálogo de plazos IMMEX: clave desconocida ${clave}`);
  return e;
}

const AVISO_GENERAL = (e: EntradaCatalogoPlazo): string =>
  `Plazo diferenciado (${e.descripcion}) pendiente de cotejo contra fuente oficial (${e.fundamento}); ` +
  `se aplicó el plazo general de ${PLAZO_GENERAL_MESES} meses. Verifique el plazo real antes de confiar en la fecha de vencimiento.`;

/**
 * Decide el plazo de permanencia. Función pura y determinista.
 *
 * Prioridad: activo fijo (vigencia del programa) > anexos sensibles
 * (I BIS / I TER, más restrictivos que el general — hoy pendientes) >
 * certificación (AAA ampliado; A/AA pendiente) > general.
 */
export function plazoMeses(input: PlazoInput): PlazoResult {
  if (input.tipo === 'ACTIVO_FIJO') {
    const e = entrada('ACTIVO_FIJO');
    return {
      meses: null,
      vigenciaPrograma: true,
      regla: e.clave,
      fundamento: e.fundamento,
      cotejo: e.cotejo,
      aviso: e.cotejo === 'pendiente'
        ? 'Activo fijo: permanece por la vigencia del programa IMMEX (Art. 108 fr. III LA). Texto del artículo pendiente de cotejo en el corpus; no se calcula fecha de vencimiento.'
        : null,
    };
  }

  // Anexos sensibles: el plazo real es MÁS CORTO que el general. Como no hay
  // fuente en el repo, se aplica el general y se avisa (el aviso es lo que
  // impide confiar en la fecha).
  if (input.esAnexoIBis || input.esAnexoITer) {
    const e = entrada(input.esAnexoIBis ? 'ANEXO_I_BIS' : 'ANEXO_I_TER');
    if (e.meses != null && e.cotejo === 'corpus') {
      return { meses: e.meses, vigenciaPrograma: false, regla: e.clave, fundamento: e.fundamento, cotejo: e.cotejo, aviso: null };
    }
    return { meses: PLAZO_GENERAL_MESES, vigenciaPrograma: false, regla: e.clave, fundamento: e.fundamento, cotejo: 'pendiente', aviso: AVISO_GENERAL(e) };
  }

  const cert = (input.certificacion ?? '').toString().trim().toUpperCase();
  if (cert === 'AAA') {
    const e = entrada('INSUMO_CERT_AAA');
    return { meses: e.meses, vigenciaPrograma: false, regla: e.clave, fundamento: e.fundamento, cotejo: e.cotejo, aviso: null };
  }
  if (cert === 'A' || cert === 'AA') {
    const e = entrada('INSUMO_CERT_A_AA');
    return {
      meses: PLAZO_GENERAL_MESES,
      vigenciaPrograma: false,
      regla: e.clave,
      fundamento: e.fundamento,
      cotejo: 'pendiente',
      aviso: `Certificación ${cert}: posible ampliación del plazo no respaldada en el repo (${e.fundamento}); se aplicó el general de ${PLAZO_GENERAL_MESES} meses.`,
    };
  }

  const e = entrada('INSUMO_GENERAL');
  return { meses: e.meses, vigenciaPrograma: false, regla: e.clave, fundamento: e.fundamento, cotejo: e.cotejo, aviso: null };
}

/**
 * `TemporaryImport.expirationDate` es NOT NULL en el esquema (Fase 0 no lo
 * relajó). Para activo fijo —que permanece por la vigencia del programa— se
 * guarda este centinela y `esVigenciaPrograma()` lo reconoce. SCHEMA REQUERIDO
 * (reporte final): `expirationDate DateTime?`.
 */
export const VIGENCIA_PROGRAMA_CENTINELA = new Date('9999-12-31T00:00:00.000Z');

export function esVigenciaPrograma(imp: { tipo?: string | null; expirationDate?: Date | null }): boolean {
  if (imp.tipo === 'ACTIVO_FIJO') return true;
  return !!imp.expirationDate && imp.expirationDate.getTime() >= VIGENCIA_PROGRAMA_CENTINELA.getTime();
}

/** Suma meses calendario (UTC) sin desbordar el día (31-ene + 1 mes = 28/29-feb). */
export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

/** Fecha de vencimiento a partir del plazo decidido (centinela para activo fijo). */
export function fechaVencimiento(entrada: Date, plazo: PlazoResult): Date {
  if (plazo.vigenciaPrograma || plazo.meses == null) return VIGENCIA_PROGRAMA_CENTINELA;
  return sumarMeses(entrada, plazo.meses);
}
