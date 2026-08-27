/**
 * FUENTE ÚNICA — Catálogos del Anexo 22 de las RGCE 2026.
 *
 * Fase 4.1/4.2 del audit: el Simulador de Glosa usaba claves de aduana
 * inventadas de 3 letras (con "ZLO" etiquetado "Zaragoza Coahuila" — ZLO ni
 * siquiera es clave del Apéndice 1; es el IATA del aeropuerto de Manzanillo)
 * y el Pre-validador mezclaba regímenes reales del Apéndice 16 con claves
 * inventadas (IMM, EXT). Ambos módulos consumen AHORA este archivo (vía
 * GET /api/catalogs/anexo22); los validadores del server lo importan directo.
 *
 * FUENTE OFICIAL (cotejo 2026-07-02): "ANEXOS 21, 22, ... y 30 de las Reglas
 * Generales de Comercio Exterior para 2026", DOF 15-ene-2026
 * (dof.gob.mx nota_detalle codigo=5778300). Denominaciones TEXTUALES.
 */

/**
 * Apéndice 1 — Claves de aduana (sección 0, aduana principal).
 *
 * `tipo` (Operación 2026-08, M3/prevalidador): clasificación operativa de la
 * aduana para la congruencia aduana↔medio de transporte
 * (ADUANA_TRANSPORTE_INCONGRUENTE). El Apéndice 1 NO publica una columna de
 * tipo: el atributo se deriva de la denominación oficial y de la geografía
 * (puerto marítimo / cruce fronterizo terrestre / aeropuerto / aduana
 * interior). Estado: `cotejoTipo: 'pendiente'` hasta contrastar con el
 * listado de aduanas por tipo de tráfico de la ANAM. Una aduana puede admitir
 * más de un tipo (p. ej. Tijuana: cruce terrestre y aeropuerto).
 */
export type TipoAduana = 'maritima' | 'fronteriza' | 'aerea' | 'interior';
export interface Aduana { clave: string; denominacion: string; tipo?: TipoAduana[]; cotejoTipo?: 'pendiente' }
export const ADUANAS: Aduana[] = [
  { clave: '01', denominacion: 'Acapulco, Guerrero', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '02', denominacion: 'Agua Prieta, Sonora', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '05', denominacion: 'Subteniente López, Quintana Roo', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '06', denominacion: 'Ciudad del Carmen, Campeche', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '07', denominacion: 'Ciudad Juárez, Chihuahua', tipo: ['fronteriza', 'aerea'], cotejoTipo: 'pendiente' },
  { clave: '08', denominacion: 'Coatzacoalcos, Veracruz', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '11', denominacion: 'Ensenada, Baja California', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '12', denominacion: 'Guaymas, Sonora', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '14', denominacion: 'La Paz, Baja California Sur', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '16', denominacion: 'Manzanillo, Colima', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '17', denominacion: 'Matamoros, Tamaulipas', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '18', denominacion: 'Mazatlán, Sinaloa', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '19', denominacion: 'Mexicali, Baja California', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '20', denominacion: 'México, Ciudad de México', tipo: ['interior'], cotejoTipo: 'pendiente' },
  { clave: '22', denominacion: 'Naco, Sonora', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '23', denominacion: 'Nogales, Sonora', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '24', denominacion: 'Nuevo Laredo, Tamaulipas', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '25', denominacion: 'Ojinaga, Chihuahua', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '26', denominacion: 'Puerto Palomas, Chihuahua', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '27', denominacion: 'Piedras Negras, Coahuila de Zaragoza', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '28', denominacion: 'Progreso, Yucatán', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '30', denominacion: 'Ciudad Reynosa, Tamaulipas', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '31', denominacion: 'Salina Cruz, Oaxaca', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '33', denominacion: 'San Luis Río Colorado, Sonora', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '34', denominacion: 'Ciudad Miguel Alemán, Tamaulipas', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '37', denominacion: 'Ciudad Hidalgo, Chiapas', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '38', denominacion: 'Tampico, Tamaulipas', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '39', denominacion: 'Tecate, Baja California', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '40', denominacion: 'Tijuana, Baja California', tipo: ['fronteriza', 'aerea'], cotejoTipo: 'pendiente' },
  { clave: '42', denominacion: 'Tuxpan, Veracruz', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '43', denominacion: 'Veracruz, Veracruz', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '44', denominacion: 'Ciudad Acuña, Coahuila de Zaragoza', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '46', denominacion: 'Torreón, Coahuila de Zaragoza', tipo: ['interior'], cotejoTipo: 'pendiente' },
  { clave: '47', denominacion: 'Aeropuerto Internacional de la Ciudad de México', tipo: ['aerea'], cotejoTipo: 'pendiente' },
  { clave: '48', denominacion: 'Guadalajara, Jalisco', tipo: ['interior', 'aerea'], cotejoTipo: 'pendiente' },
  { clave: '50', denominacion: 'Sonoyta, Sonora', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '51', denominacion: 'Lázaro Cárdenas, Michoacán', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '52', denominacion: 'Monterrey, Nuevo León', tipo: ['interior', 'aerea'], cotejoTipo: 'pendiente' },
  { clave: '53', denominacion: 'Cancún, Quintana Roo', tipo: ['aerea'], cotejoTipo: 'pendiente' },
  { clave: '64', denominacion: 'Querétaro, Querétaro', tipo: ['interior', 'aerea'], cotejoTipo: 'pendiente' },
  { clave: '65', denominacion: 'Toluca, Estado de México', tipo: ['interior', 'aerea'], cotejoTipo: 'pendiente' },
  { clave: '67', denominacion: 'Chihuahua, Chihuahua', tipo: ['interior', 'aerea'], cotejoTipo: 'pendiente' },
  { clave: '73', denominacion: 'Aguascalientes, Aguascalientes', tipo: ['interior'], cotejoTipo: 'pendiente' },
  { clave: '75', denominacion: 'Puebla, Puebla', tipo: ['interior'], cotejoTipo: 'pendiente' },
  { clave: '80', denominacion: 'Colombia, Nuevo León', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '81', denominacion: 'Altamira, Tamaulipas', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '82', denominacion: 'Ciudad Camargo, Tamaulipas', tipo: ['fronteriza'], cotejoTipo: 'pendiente' },
  { clave: '83', denominacion: 'Dos Bocas, Tabasco', tipo: ['maritima'], cotejoTipo: 'pendiente' },
  { clave: '84', denominacion: 'Guanajuato, Guanajuato', tipo: ['interior'], cotejoTipo: 'pendiente' },
  { clave: '85', denominacion: 'Aeropuerto Internacional Felipe Ángeles, Estado de México', tipo: ['aerea'], cotejoTipo: 'pendiente' },
];

/**
 * Aliases de compatibilidad: códigos de 3-4 letras que usaba la UI ANTES del
 * cotejo (no son claves oficiales). Los registros históricos de GlosaSimulation
 * los conservan; el scoring del server los normaliza con esto.
 * OJO: 'ZLO' estaba etiquetado "Zaragoza Coahuila" — es el IATA de MANZANILLO.
 */
export const LEGACY_CUSTOMS_ALIASES: Record<string, string> = {
  MAN: '16', VER: '43', TIJ: '40', NLD: '24', ZLO: '16',
  LZC: '51', ALT: '81', PRO: '28', AICM: '47', NUS: '23',
};

export function normalizeCustomsCode(code: string): string {
  const up = code.trim().toUpperCase();
  return LEGACY_CUSTOMS_ALIASES[up] ?? up;
}

/** Apéndice 16 — Regímenes (claves y descripciones TEXTUALES). */
export interface Regimen { clave: string; descripcion: string }
export const REGIMENES: Regimen[] = [
  { clave: 'IMD', descripcion: 'Definitivo de importación' },
  { clave: 'EXD', descripcion: 'Definitivo de exportación' },
  { clave: 'ITR', descripcion: 'Temporales de importación para retornar al extranjero en el mismo estado' },
  { clave: 'ITE', descripcion: 'Temporales de importación para elaboración, transformación o reparación para empresas con programa IMMEX' },
  { clave: 'ETR', descripcion: 'Temporales de exportación para retornar al país en el mismo estado' },
  { clave: 'ETE', descripcion: 'Temporales de exportación para elaboración, transformación o reparación' },
  { clave: 'DFI', descripcion: 'Depósito fiscal' },
  { clave: 'RFE', descripcion: 'Elaboración, transformación o reparación en recinto fiscalizado' },
  { clave: 'TRA', descripcion: 'Tránsitos' },
  { clave: 'RFS', descripcion: 'Recinto fiscalizado estratégico' },
];

/**
 * Apéndice 2 — Claves de pedimento (subconjunto que usa la plataforma).
 * `regimenes` = claves del Apéndice 16 compatibles según la propia descripción
 * oficial del Apéndice 2 (A1 cubre impo Y expo definitiva → IMD/EXD; las
 * temporales IMMEX IN/AF/RT operan bajo ITE; BA ampara temporal impo/expo
 * mismo estado → ITR/ETR; F4/F5 son cambio DE régimen HACIA definitivo).
 * Lista vacía = la clave aplica a cualquier régimen (R1 rectifica el pedimento
 * original sea cual sea; V1 ampara virtuales de varios regímenes).
 */
export interface ClavePedimento {
  clave: string; descripcion: string; regimenes: string[];
  /** 'pendiente' = agregada por uso operativo (Operación 2026-08) SIN cotejo
   *  verbatim contra el Apéndice 2 en el repo: descripción indicativa y
   *  `regimenes: []` (no restringe) hasta cotejar. Ausente = cotejada 2026-07-02. */
  cotejo?: 'pendiente';
}
export const CLAVES_PEDIMENTO: ClavePedimento[] = [
  { clave: 'A1', descripcion: 'Importación o exportación definitiva', regimenes: ['IMD', 'EXD'] },
  { clave: 'A3', descripcion: 'Regularización de mercancías (importación definitiva)', regimenes: ['IMD'] },
  { clave: 'A4', descripcion: 'Introducción para depósito fiscal (AGD)', regimenes: ['DFI'] },
  { clave: 'IN', descripcion: 'Importación temporal de bienes que serán sujetos a transformación, elaboración o reparación (IMMEX)', regimenes: ['ITE'] },
  { clave: 'AF', descripcion: 'Importación temporal de bienes de activo fijo (IMMEX)', regimenes: ['ITE'] },
  { clave: 'RT', descripcion: 'Retorno de mercancías (IMMEX)', regimenes: ['ITE'] },
  { clave: 'BA', descripcion: 'Importación y exportación temporal de bienes para ser retornados en su mismo estado', regimenes: ['ITR', 'ETR'] },
  { clave: 'H1', descripcion: 'Retorno de mercancías en su mismo estado', regimenes: ['ITR'] },
  { clave: 'F4', descripcion: 'Cambio de régimen de insumos o de mercancía exportada temporalmente', regimenes: ['IMD', 'EXD'] },
  { clave: 'F5', descripcion: 'Cambio de régimen de mercancías de importación temporal a definitiva', regimenes: ['IMD'] },
  { clave: 'V1', descripcion: 'Transferencias de mercancías (importación temporal virtual; introducción virtual a depósito fiscal o recinto fiscalizado estratégico)', regimenes: [] },
  { clave: 'T3', descripcion: 'Tránsito interno', regimenes: ['TRA'] },
  { clave: 'T7', descripcion: 'Tránsito internacional por territorio nacional', regimenes: ['TRA'] },
  { clave: 'R1', descripcion: 'Rectificación de pedimentos', regimenes: [] },
  // ── Operación 2026-08: claves de uso frecuente en archivos M3 que faltaban.
  // PENDIENTES DE COTEJO verbatim contra el Apéndice 2 (DOF 15-ene-2026): la
  // descripción es indicativa y `regimenes` va vacío a propósito para que el
  // prevalidador NO dispare CLAVE_REGIMEN_MISMATCH sobre un dato no cotejado.
  { clave: 'A5', descripcion: 'Importación/exportación definitiva vinculada a depósito fiscal (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'C1', descripcion: 'Importación definitiva a la franja fronteriza norte y región fronteriza (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'E1', descripcion: 'Extracción de depósito fiscal de bienes para importación temporal IMMEX (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'E2', descripcion: 'Extracción de depósito fiscal de bienes para retorno al extranjero (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'F2', descripcion: 'Extracción de depósito fiscal de bienes de la industria automotriz terminal para importación definitiva (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'F3', descripcion: 'Extracción de depósito fiscal de bienes de la industria automotriz terminal para retorno al extranjero (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'G1', descripcion: 'Extracción de depósito fiscal para importación definitiva (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'G2', descripcion: 'Extracción de depósito fiscal para exportación definitiva (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'K1', descripcion: 'Desistimiento de régimen / retorno de mercancía de depósito fiscal (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'K2', descripcion: 'Retorno de mercancía de depósito fiscal — industria automotriz (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
  { clave: 'V5', descripcion: 'Operación virtual de transferencia (descripción pendiente de cotejo)', regimenes: [], cotejo: 'pendiente' },
];

/** Claves agregadas sin cotejo verbatim — para etiquetar en UI. */
export const CLAVES_PEDIMENTO_PENDIENTES: string[] = CLAVES_PEDIMENTO.filter((c) => c.cotejo === 'pendiente').map((c) => c.clave);

/** Mapa clave→regímenes compatibles, derivado de CLAVES_PEDIMENTO (fuente única). */
export const REGIMENES_POR_CLAVE: Record<string, string[]> =
  Object.fromEntries(CLAVES_PEDIMENTO.map((c) => [c.clave, c.regimenes]));

/**
 * Número de pedimento (instructivo del Anexo 22, texto oficial): "integrado
 * con quince dígitos, que corresponden a: 2 dígitos, del año de validación...
 * 2 dígitos, de la aduana de despacho... 4 dígitos, del número de la patente
 * o autorización... 7 dígitos, del consecutivo". Orden: AÑO ADUANA PATENTE
 * CONSECUTIVO (el generador demo previo lo armaba año-PATENTE-ADUANA-consec).
 */
export const PEDIMENTO_NUMERO_REGEX = /^(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{7})$/;

export function formatPedimentoNumero(year2: string, aduanaClave: string, patente: string, consecutivo: string): string {
  return `${year2} ${aduanaClave} ${patente} ${consecutivo}`;
}

export function validatePedimentoNumero(numero: string): { valid: boolean; reason?: string } {
  const m = PEDIMENTO_NUMERO_REGEX.exec(numero.trim());
  if (!m) return { valid: false, reason: 'Formato esperado: AÑO(2) ADUANA(2) PATENTE(4) CONSECUTIVO(7) — 15 dígitos (Anexo 22)' };
  const aduana = m[2];
  if (!ADUANAS.some((a) => a.clave === aduana)) {
    return { valid: false, reason: `La posición de aduana ("${aduana}") no es una clave del Apéndice 1 — verifica el orden AÑO ADUANA PATENTE CONSECUTIVO` };
  }
  return { valid: true };
}

/**
 * Apéndice 3 — Medios de transporte (clave numérica que viaja en 501.18-20
 * del archivo M3). Estado: `cotejo: 'pendiente'` — capturado por uso
 * operativo, pendiente de cotejo verbatim contra DOF 15-ene-2026.
 */
export type ViaTransporte = 'maritima' | 'terrestre' | 'aerea' | 'otro';
export interface MedioTransporte { clave: string; descripcion: string; via: ViaTransporte; cotejo?: 'pendiente' }
export const MEDIOS_TRANSPORTE: MedioTransporte[] = [
  { clave: '1', descripcion: 'Marítimo', via: 'maritima', cotejo: 'pendiente' },
  { clave: '2', descripcion: 'Ferroviario de doble estiba', via: 'terrestre', cotejo: 'pendiente' },
  { clave: '3', descripcion: 'Carretero-ferroviario', via: 'terrestre', cotejo: 'pendiente' },
  { clave: '4', descripcion: 'Aéreo', via: 'aerea', cotejo: 'pendiente' },
  { clave: '5', descripcion: 'Postal', via: 'otro', cotejo: 'pendiente' },
  { clave: '6', descripcion: 'Ferroviario', via: 'terrestre', cotejo: 'pendiente' },
  { clave: '7', descripcion: 'Carretero', via: 'terrestre', cotejo: 'pendiente' },
  { clave: '8', descripcion: 'Tubería', via: 'otro', cotejo: 'pendiente' },
  { clave: '9', descripcion: 'Cables', via: 'otro', cotejo: 'pendiente' },
  { clave: '10', descripcion: 'Ductos', via: 'otro', cotejo: 'pendiente' },
  { clave: '11', descripcion: 'Peatonal', via: 'terrestre', cotejo: 'pendiente' },
  { clave: '98', descripcion: 'Otros', via: 'otro', cotejo: 'pendiente' },
  { clave: '99', descripcion: 'Desconocido', via: 'otro', cotejo: 'pendiente' },
];

/** Texto libre de la UI del prevalidador ("Marítimo", "Aéreo"…) o clave → vía. */
export function viaDeTransporte(valor: string | null | undefined): ViaTransporte | null {
  if (!valor) return null;
  const v = valor.trim();
  const porClave = MEDIOS_TRANSPORTE.find((m) => m.clave === v);
  if (porClave) return porClave.via;
  const t = v.toLowerCase();
  if (/mar[ií]t/.test(t)) return 'maritima';
  if (/a[eé]re/.test(t)) return 'aerea';
  if (/terrest|carret|ferro|cami[oó]n|multimodal|peaton/.test(t)) return 'terrestre';
  return null;
}

/**
 * Apéndice 7 — Unidades de medida (clave numérica que viaja en 551.12 UMC y
 * 551.14 UMT). Estado: `cotejo: 'pendiente'` — pendiente de cotejo verbatim.
 * `simbolos` = tokens que usa el catálogo Fraction.unit local (Kg, Pza, M², L…).
 */
export interface UnidadMedida { clave: string; descripcion: string; simbolos: string[]; cotejo?: 'pendiente' }
export const UNIDADES_MEDIDA: UnidadMedida[] = [
  { clave: '1', descripcion: 'Kilo', simbolos: ['KG', 'KILO', 'KILOGRAMO'], cotejo: 'pendiente' },
  { clave: '2', descripcion: 'Gramo', simbolos: ['G', 'GR', 'GRAMO'], cotejo: 'pendiente' },
  { clave: '3', descripcion: 'Metro lineal', simbolos: ['M', 'METRO', 'ML'], cotejo: 'pendiente' },
  { clave: '4', descripcion: 'Metro cuadrado', simbolos: ['M²', 'M2'], cotejo: 'pendiente' },
  { clave: '5', descripcion: 'Metro cúbico', simbolos: ['M³', 'M3'], cotejo: 'pendiente' },
  { clave: '6', descripcion: 'Pieza', simbolos: ['PZA', 'PIEZA', 'PZ'], cotejo: 'pendiente' },
  { clave: '7', descripcion: 'Cabeza', simbolos: ['CBZA', 'CABEZA'], cotejo: 'pendiente' },
  { clave: '8', descripcion: 'Litro', simbolos: ['L', 'LT', 'LITRO'], cotejo: 'pendiente' },
  { clave: '9', descripcion: 'Par', simbolos: ['PAR'], cotejo: 'pendiente' },
  { clave: '10', descripcion: 'Kilowatt', simbolos: ['KW'], cotejo: 'pendiente' },
  { clave: '11', descripcion: 'Millar', simbolos: ['MLL', 'MILLAR'], cotejo: 'pendiente' },
  { clave: '12', descripcion: 'Juego', simbolos: ['JGO', 'JUEGO'], cotejo: 'pendiente' },
  { clave: '13', descripcion: 'Kilowatt/hora', simbolos: ['KWH'], cotejo: 'pendiente' },
  { clave: '14', descripcion: 'Tonelada', simbolos: ['T', 'TON', 'TONELADA'], cotejo: 'pendiente' },
  { clave: '15', descripcion: 'Barril', simbolos: ['BARR', 'BARRIL'], cotejo: 'pendiente' },
  { clave: '16', descripcion: 'Gramo neto', simbolos: ['GN'], cotejo: 'pendiente' },
  { clave: '17', descripcion: 'Decenas', simbolos: ['DEC'], cotejo: 'pendiente' },
  { clave: '18', descripcion: 'Cientos', simbolos: ['CIEN'], cotejo: 'pendiente' },
  { clave: '19', descripcion: 'Docenas', simbolos: ['DOC', 'DOCENA'], cotejo: 'pendiente' },
  { clave: '20', descripcion: 'Caja', simbolos: ['CAJA'], cotejo: 'pendiente' },
  { clave: '21', descripcion: 'Botella', simbolos: ['BOT', 'BOTELLA'], cotejo: 'pendiente' },
  { clave: '22', descripcion: 'Carats', simbolos: ['CARAT', 'CT'], cotejo: 'pendiente' },
];

/** Símbolo/clave/nombre → clave del Apéndice 7 (null si no se reconoce). */
export function claveUnidadMedida(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const v = valor.trim().toUpperCase();
  if (UNIDADES_MEDIDA.some((u) => u.clave === v)) return v;
  const hit = UNIDADES_MEDIDA.find((u) => u.simbolos.includes(v) || u.descripcion.toUpperCase() === v);
  return hit ? hit.clave : null;
}

/**
 * Factores de conversión conocidos entre unidades del Apéndice 7
 * (de → a: cantidad_a = cantidad_de × factor). Solo conversiones físicas
 * inequívocas; todo lo demás es "no verificable".
 */
export const CONVERSION_UNIDADES: Record<string, number> = {
  '2>1': 0.001, '1>2': 1000,        // gramo ↔ kilo
  '14>1': 1000, '1>14': 0.001,      // tonelada ↔ kilo
  '16>1': 0.001, '1>16': 1000,      // gramo neto ↔ kilo
  '17>6': 10, '6>17': 0.1,          // decenas ↔ pieza
  '18>6': 100, '6>18': 0.01,        // cientos ↔ pieza
  '19>6': 12, '6>19': 1 / 12,       // docenas ↔ pieza
  '11>6': 1000, '6>11': 0.001,      // millar ↔ pieza
};
export function factorConversion(de: string, a: string): number | null {
  if (de === a) return 1;
  const f = CONVERSION_UNIDADES[`${de}>${a}`];
  return f === undefined ? null : f;
}

/**
 * Apéndice 8 — Identificadores (clave de 2 letras en 507.3 nivel pedimento y
 * 554.5 nivel partida). Subconjunto operativo con complementos. Estado:
 * `cotejo: 'pendiente'` en todos — descripciones indicativas hasta cotejo
 * verbatim contra DOF 15-ene-2026. `obligatorioCuando` documenta la
 * condición que usa IDENTIFICADOR_OBLIGATORIO_FALTANTE.
 */
export interface Identificador {
  clave: string; descripcion: string; nivel: 'pedimento' | 'partida' | 'ambos';
  complemento1?: string; complemento2?: string; complemento3?: string;
  obligatorioCuando?: string; cotejo?: 'pendiente';
}
export const IDENTIFICADORES: Identificador[] = [
  { clave: 'CC', descripcion: 'Cuota compensatoria', nivel: 'partida', complemento1: 'Clave/resolución de la cuota', obligatorioCuando: 'La fracción y el país de origen tienen cuota compensatoria vigente', cotejo: 'pendiente' },
  { clave: 'NM', descripcion: 'Norma Oficial Mexicana (cumplimiento o excepción)', nivel: 'partida', complemento1: 'Clave de cumplimiento/excepción', complemento2: 'NOM', obligatorioCuando: 'La fracción está sujeta a NOM en el catálogo', cotejo: 'pendiente' },
  { clave: 'TL', descripcion: 'Trato arancelario preferencial por tratado', nivel: 'partida', complemento1: 'Clave del tratado (Apéndice 4)', obligatorioCuando: 'Se declara preferencia arancelaria (T-MEC, TLCUEM, CPTPP…)', cotejo: 'pendiente' },
  { clave: 'IM', descripcion: 'Programa IMMEX', nivel: 'pedimento', complemento1: 'Número de programa IMMEX', obligatorioCuando: 'Clave de pedimento IN, AF o RT (operación IMMEX)', cotejo: 'pendiente' },
  { clave: 'PS', descripcion: 'Programa de Promoción Sectorial (PROSEC)', nivel: 'partida', complemento1: 'Sector PROSEC', cotejo: 'pendiente' },
  { clave: 'EC', descripcion: 'Empresa certificada', nivel: 'pedimento', complemento1: 'Modalidad/registro', cotejo: 'pendiente' },
  { clave: 'PC', descripcion: 'Pedimento consolidado', nivel: 'pedimento', cotejo: 'pendiente' },
];

/** Claves de pedimento que exigen el identificador IM (programa IMMEX). */
export const CLAVES_IMMEX = ['IN', 'AF', 'RT'];

/**
 * Apéndice 9 — Regulaciones y restricciones no arancelarias (clave del
 * permiso en 553.5). ESTRUCTURA + pipeline: sin cotejo verbatim en el repo,
 * se listan claves de uso frecuente con `cotejo: 'pendiente'`; el
 * prevalidador solo las muestra, no infiere obligatoriedad desde aquí.
 */
export interface Regulacion { clave: string; descripcion: string; autoridad?: string; cotejo?: 'pendiente' }
export const REGULACIONES: Regulacion[] = [
  { clave: 'C1', descripcion: 'Permiso previo de importación/exportación de la Secretaría de Economía (descripción pendiente de cotejo)', autoridad: 'SE', cotejo: 'pendiente' },
  { clave: 'C2', descripcion: 'Aviso automático de importación/exportación (descripción pendiente de cotejo)', autoridad: 'SE', cotejo: 'pendiente' },
  { clave: 'C3', descripcion: 'Cupo de importación/exportación (descripción pendiente de cotejo)', autoridad: 'SE', cotejo: 'pendiente' },
  { clave: 'C6', descripcion: 'Certificado NOM / constancia de conformidad (descripción pendiente de cotejo)', autoridad: 'SE / organismo de certificación', cotejo: 'pendiente' },
];

export const ANEXO22_APENDICES_PENDIENTES =
  'Apéndices 3 (medios de transporte), 7 (unidades de medida), 8 (identificadores) y 9 (regulaciones), el atributo `tipo` de aduanas y las claves de pedimento marcadas: pendientes de cotejo verbatim contra DOF 15-ene-2026.';

export const ANEXO22_FUENTE =
  'Anexo 22 RGCE 2026, Apéndices 1, 2 y 16 — DOF 15-ene-2026 (cotejo 2026-07-02)';
