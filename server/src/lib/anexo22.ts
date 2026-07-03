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

/** Apéndice 1 — Claves de aduana (sección 0, aduana principal). */
export interface Aduana { clave: string; denominacion: string }
export const ADUANAS: Aduana[] = [
  { clave: '01', denominacion: 'Acapulco, Guerrero' },
  { clave: '02', denominacion: 'Agua Prieta, Sonora' },
  { clave: '05', denominacion: 'Subteniente López, Quintana Roo' },
  { clave: '06', denominacion: 'Ciudad del Carmen, Campeche' },
  { clave: '07', denominacion: 'Ciudad Juárez, Chihuahua' },
  { clave: '08', denominacion: 'Coatzacoalcos, Veracruz' },
  { clave: '11', denominacion: 'Ensenada, Baja California' },
  { clave: '12', denominacion: 'Guaymas, Sonora' },
  { clave: '14', denominacion: 'La Paz, Baja California Sur' },
  { clave: '16', denominacion: 'Manzanillo, Colima' },
  { clave: '17', denominacion: 'Matamoros, Tamaulipas' },
  { clave: '18', denominacion: 'Mazatlán, Sinaloa' },
  { clave: '19', denominacion: 'Mexicali, Baja California' },
  { clave: '20', denominacion: 'México, Ciudad de México' },
  { clave: '22', denominacion: 'Naco, Sonora' },
  { clave: '23', denominacion: 'Nogales, Sonora' },
  { clave: '24', denominacion: 'Nuevo Laredo, Tamaulipas' },
  { clave: '25', denominacion: 'Ojinaga, Chihuahua' },
  { clave: '26', denominacion: 'Puerto Palomas, Chihuahua' },
  { clave: '27', denominacion: 'Piedras Negras, Coahuila de Zaragoza' },
  { clave: '28', denominacion: 'Progreso, Yucatán' },
  { clave: '30', denominacion: 'Ciudad Reynosa, Tamaulipas' },
  { clave: '31', denominacion: 'Salina Cruz, Oaxaca' },
  { clave: '33', denominacion: 'San Luis Río Colorado, Sonora' },
  { clave: '34', denominacion: 'Ciudad Miguel Alemán, Tamaulipas' },
  { clave: '37', denominacion: 'Ciudad Hidalgo, Chiapas' },
  { clave: '38', denominacion: 'Tampico, Tamaulipas' },
  { clave: '39', denominacion: 'Tecate, Baja California' },
  { clave: '40', denominacion: 'Tijuana, Baja California' },
  { clave: '42', denominacion: 'Tuxpan, Veracruz' },
  { clave: '43', denominacion: 'Veracruz, Veracruz' },
  { clave: '44', denominacion: 'Ciudad Acuña, Coahuila de Zaragoza' },
  { clave: '46', denominacion: 'Torreón, Coahuila de Zaragoza' },
  { clave: '47', denominacion: 'Aeropuerto Internacional de la Ciudad de México' },
  { clave: '48', denominacion: 'Guadalajara, Jalisco' },
  { clave: '50', denominacion: 'Sonoyta, Sonora' },
  { clave: '51', denominacion: 'Lázaro Cárdenas, Michoacán' },
  { clave: '52', denominacion: 'Monterrey, Nuevo León' },
  { clave: '53', denominacion: 'Cancún, Quintana Roo' },
  { clave: '64', denominacion: 'Querétaro, Querétaro' },
  { clave: '65', denominacion: 'Toluca, Estado de México' },
  { clave: '67', denominacion: 'Chihuahua, Chihuahua' },
  { clave: '73', denominacion: 'Aguascalientes, Aguascalientes' },
  { clave: '75', denominacion: 'Puebla, Puebla' },
  { clave: '80', denominacion: 'Colombia, Nuevo León' },
  { clave: '81', denominacion: 'Altamira, Tamaulipas' },
  { clave: '82', denominacion: 'Ciudad Camargo, Tamaulipas' },
  { clave: '83', denominacion: 'Dos Bocas, Tabasco' },
  { clave: '84', denominacion: 'Guanajuato, Guanajuato' },
  { clave: '85', denominacion: 'Aeropuerto Internacional Felipe Ángeles, Estado de México' },
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
export interface ClavePedimento { clave: string; descripcion: string; regimenes: string[] }
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
];

/** Mapa clave→regímenes compatibles, derivado de CLAVES_PEDIMENTO (fuente única). */
export const REGIMENES_POR_CLAVE: Record<string, string[]> =
  Object.fromEntries(CLAVES_PEDIMENTO.map((c) => [c.clave, c.regimenes]));

export const ANEXO22_FUENTE =
  'Anexo 22 RGCE 2026, Apéndices 1, 2 y 16 — DOF 15-ene-2026 (cotejo 2026-07-02)';
