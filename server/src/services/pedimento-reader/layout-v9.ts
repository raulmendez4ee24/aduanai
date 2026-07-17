/**
 * LECTOR DE PEDIMENTOS — layout del archivo de validación SAAI M3.
 *
 * Fuente canónica (verbatim, extraída del PDF oficial el 2026-07-16):
 *   "Lineamientos Técnicos de Registros VOCE-SAAI M3", versión 9.0, agosto 2021,
 *   AGA / Administración Central de Modernización Aduanera, 139 pp.
 *   https://www.ventanillaunica.gob.mx/vucem/Manualesa/SistemasCE/LineamientosTR.pdf
 *
 * Formato del archivo (v9.0 pp. 7-8): texto ASCII, registros separados por
 * line feed, campos separados por pipe "|", longitudes MÁXIMAS (variables),
 * nombre irrepetible `mppppnnn.ddd` (m + patente + consecutivo diario + día juliano).
 *
 * VALIDADO CONTRA LAYOUT OFICIAL; VALIDACIÓN CON ARCHIVOS REALES PENDIENTE
 * (dependencia humana — ver docs/PEDIMENTO_READER_FASE1_DESIGN.md). Los layouts
 * públicos datan de ago-2021: ante cualquier desajuste el parser FALLA CERRADO.
 */

export const LAYOUT_VERSION = 'VOCE-SAAI-M3-v9.0-ago2021';
export const LAYOUT_FUENTE_URL =
  'https://www.ventanillaunica.gob.mx/vucem/Manualesa/SistemasCE/LineamientosTR.pdf';

/** Tipos de dato de la spec: N numérico entero, A alfanumérico, D decimal, F fecha AAAAMMDD. */
export type TipoDato = 'N' | 'A' | 'D' | 'F';

export interface CampoDef {
  /** Posición 1-based conforme a la spec. */
  campo: number;
  nombre: string;
  tipo: TipoDato;
  /** Longitud máxima (para D: enteros + decimales de la spec). */
  max: number;
}

/**
 * Aridad EXACTA por tipo de registro (verbatim v9.0, secciones "Formato de
 * registros" pp. 17-32). Un registro con conteo de campos distinto = drift
 * de layout → fallo cerrado del archivo.
 */
export const ARIDAD: Record<number, number> = {
  500: 6, 501: 35, 502: 9, 503: 4, 504: 4, 505: 17, 506: 4, 507: 6,
  508: 12, 509: 5, 510: 5, 511: 4, 512: 10, 513: 8, 514: 9, 515: 9,
  516: 4, 520: 10, 551: 26, 552: 6, 553: 9, 554: 8, 555: 13, 556: 7,
  557: 7, 558: 6, 560: 12, 601: 11, 701: 11, 702: 5,
  301: 11, 302: 6, 351: 11, 352: 11, 353: 6, 355: 8, 358: 7,
  800: 5, 801: 5,
};

/** Registros de los que v1 EXTRAE datos (diseño §a — el resto se cuenta y reporta). */
export const REGISTROS_INCLUIDOS = new Set([500, 501, 505, 506, 507, 509, 510, 512, 551, 553, 554, 556, 557, 800, 801]);

/**
 * Posición del campo "Número de Pedimento" en cada registro (validación
 * cruzada: debe coincidir con el 500.4 vigente). Verbatim v9.0: campo 2 en
 * la mayoría; campo 3 en 501/515/601/701/301 (campo 2 es la patente).
 */
export const POS_NUMERO_PEDIMENTO: Record<number, number> = {
  501: 3, 502: 2, 503: 2, 504: 2, 505: 2, 506: 2, 507: 2, 508: 2, 509: 2,
  510: 2, 511: 2, 512: 2, 513: 2, 514: 2, 515: 3, 516: 2, 520: 2, 551: 2,
  552: 2, 553: 2, 554: 2, 555: 2, 556: 2, 557: 2, 558: 2, 560: 2, 601: 3,
  701: 3, 702: 2, 301: 3, 302: 2, 351: 2, 352: 2, 353: 2, 355: 2, 358: 2,
  800: 2,
};

/**
 * Definiciones campo a campo SOLO de los registros incluidos (verbatim v9.0).
 * La validación de tipo aplica únicamente a campos NO vacíos: la spec permite
 * vacío en múltiples campos opcionales ("podrá declararse vacío") y la
 * obligatoriedad fina por campo vive en los criterios de llenado del documento.
 */
export const CAMPOS: Record<number, CampoDef[]> = {
  500: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Tipo de Movimiento', tipo: 'N', max: 2 },
    { campo: 3, nombre: 'Patente o autorización', tipo: 'N', max: 4 },
    { campo: 4, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 5, nombre: 'Aduana-Sección de Despacho', tipo: 'A', max: 3 },
    // Solo se declara al eliminar/desistir/confirmar pago (criterios 500.6):
    { campo: 6, nombre: 'Acuse Electrónico de Validación', tipo: 'A', max: 8 },
  ],
  501: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Patente o autorización', tipo: 'N', max: 4 },
    { campo: 3, nombre: 'Número de pedimento', tipo: 'N', max: 7 },
    { campo: 4, nombre: 'Aduana-sección de Despacho', tipo: 'A', max: 3 },
    { campo: 5, nombre: 'Tipo de Operación', tipo: 'N', max: 1 },
    { campo: 6, nombre: 'Clave de pedimento', tipo: 'A', max: 2 },
    { campo: 7, nombre: 'Aduana-sección de Entrada o Salida', tipo: 'A', max: 3 },
    { campo: 8, nombre: 'CURP del Importador o Exportador', tipo: 'A', max: 18 },
    { campo: 9, nombre: 'RFC del Importador o Exportador', tipo: 'A', max: 13 },
    { campo: 10, nombre: 'CURP del agente/representante/apoderado/mandatario', tipo: 'A', max: 18 },
    { campo: 11, nombre: 'Tipo de cambio', tipo: 'D', max: 15 }, // Decimal 9,5
    { campo: 12, nombre: 'Importe del Pago de Fletes', tipo: 'N', max: 12 },
    { campo: 13, nombre: 'Importe del Pago de Primas de Seguros', tipo: 'N', max: 12 },
    { campo: 14, nombre: 'Importe del Pago de Embalajes', tipo: 'N', max: 12 },
    { campo: 15, nombre: 'Importe del Pago de Otros Incrementables', tipo: 'N', max: 12 },
    { campo: 16, nombre: 'Uso futuro', tipo: 'A', max: 0 },
    { campo: 17, nombre: 'Peso Bruto Total de la Mercancía', tipo: 'D', max: 18 }, // Decimal 14,3
    { campo: 18, nombre: 'Medio de Transporte de Salida', tipo: 'N', max: 2 },
    { campo: 19, nombre: 'Medio de Transporte de arribo', tipo: 'N', max: 2 },
    { campo: 20, nombre: 'Medio de Transporte Entrada/Salida', tipo: 'N', max: 2 },
    { campo: 21, nombre: 'Origen o Destino de la mercancía', tipo: 'N', max: 2 },
    { campo: 22, nombre: 'Nombre del Importador o Exportador', tipo: 'A', max: 120 },
    { campo: 23, nombre: 'Calle del domicilio', tipo: 'A', max: 80 },
    { campo: 24, nombre: 'Número interior', tipo: 'A', max: 10 },
    { campo: 25, nombre: 'Número exterior', tipo: 'A', max: 10 },
    { campo: 26, nombre: 'Código postal', tipo: 'A', max: 10 },
    { campo: 27, nombre: 'Municipio', tipo: 'A', max: 80 },
    { campo: 28, nombre: 'Entidad federativa', tipo: 'A', max: 3 },
    { campo: 29, nombre: 'País del domicilio fiscal', tipo: 'A', max: 3 },
    { campo: 30, nombre: 'RFC de quien emite el CFDI de los Servicios', tipo: 'A', max: 13 },
    { campo: 31, nombre: 'Decrementables por Fletes', tipo: 'N', max: 12 },
    { campo: 32, nombre: 'Decrementables por Seguros', tipo: 'N', max: 12 },
    { campo: 33, nombre: 'Decrementables por Carga', tipo: 'N', max: 12 },
    { campo: 34, nombre: 'Decrementables por Descarga', tipo: 'N', max: 12 },
    { campo: 35, nombre: 'Otros Decrementables', tipo: 'N', max: 12 },
  ],
  505: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Fecha de CFDI o documento equivalente', tipo: 'F', max: 8 },
    { campo: 4, nombre: 'Número de CFDI o documento equivalente o acuse de valor', tipo: 'A', max: 40 },
    { campo: 5, nombre: 'Término de Facturación', tipo: 'A', max: 3 },
    { campo: 6, nombre: 'Moneda del CFDI', tipo: 'A', max: 3 },
    { campo: 7, nombre: 'Valor Total de las Mercancías en Dólares (USD)', tipo: 'D', max: 17 }, // 14,2
    { campo: 8, nombre: 'Valor Total en la unidad monetaria del CFDI', tipo: 'D', max: 17 },
    { campo: 9, nombre: 'País del CFDI', tipo: 'A', max: 3 },
    { campo: 10, nombre: 'Entidad Federativa del CFDI', tipo: 'A', max: 3 },
    { campo: 11, nombre: 'Identificación Fiscal del Proveedor o Comprador', tipo: 'A', max: 30 },
    { campo: 12, nombre: 'Nombre del Proveedor o Comprador', tipo: 'A', max: 120 },
    { campo: 13, nombre: 'Calle del domicilio del Proveedor o Comprador', tipo: 'A', max: 80 },
    { campo: 14, nombre: 'Número interior', tipo: 'A', max: 10 },
    { campo: 15, nombre: 'Número exterior', tipo: 'A', max: 10 },
    { campo: 16, nombre: 'Código postal', tipo: 'A', max: 10 },
    { campo: 17, nombre: 'Municipio', tipo: 'A', max: 80 },
  ],
  506: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Tipo de fecha', tipo: 'N', max: 2 },
    { campo: 4, nombre: 'Fecha', tipo: 'F', max: 8 },
  ],
  507: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Clave del Identificador', tipo: 'A', max: 2 },
    { campo: 4, nombre: 'Complemento 1', tipo: 'A', max: 20 },
    { campo: 5, nombre: 'Complemento 2', tipo: 'A', max: 30 },
    { campo: 6, nombre: 'Complemento 3', tipo: 'A', max: 40 },
  ],
  509: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Clave de la Contribución', tipo: 'N', max: 2 },
    { campo: 4, nombre: 'Tasa de Contribución', tipo: 'D', max: 26 }, // 15,10
    { campo: 5, nombre: 'Clave del Tipo de Tasa', tipo: 'N', max: 2 },
  ],
  510: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Clave de la Contribución', tipo: 'N', max: 2 },
    { campo: 4, nombre: 'Clave de la Forma de Pago', tipo: 'N', max: 3 },
    { campo: 5, nombre: 'Importe de la Contribución', tipo: 'N', max: 12 },
  ],
  512: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Patente o autorización original', tipo: 'N', max: 4 },
    { campo: 4, nombre: 'Número de Pedimento original o última rectificación', tipo: 'N', max: 7 },
    { campo: 5, nombre: 'Aduana-sección de la operación original', tipo: 'A', max: 3 },
    { campo: 6, nombre: 'Clave de documento de la operación original', tipo: 'A', max: 2 },
    { campo: 7, nombre: 'Fecha de pago del pedimento original', tipo: 'F', max: 8 },
    { campo: 8, nombre: 'Fracción arancelaria que se descarga', tipo: 'A', max: 8 },
    { campo: 9, nombre: 'Clave de unidad de medida LIGIE', tipo: 'N', max: 2 },
    { campo: 10, nombre: 'Cantidad de mercancía que se descarga', tipo: 'D', max: 24 },
  ],
  551: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Fracción Arancelaria', tipo: 'A', max: 8 },
    { campo: 4, nombre: 'Número de Partida', tipo: 'N', max: 5 },
    { campo: 5, nombre: 'Subdivisión de la Fracción', tipo: 'A', max: 2 },
    { campo: 6, nombre: 'Descripción de la Mercancía', tipo: 'A', max: 250 },
    { campo: 7, nombre: 'Precio Unitario', tipo: 'D', max: 21 }, // 15,5
    { campo: 8, nombre: 'Valor en Aduana', tipo: 'N', max: 12 },
    { campo: 9, nombre: 'Importe del precio pagado o Valor Comercial', tipo: 'N', max: 12 },
    { campo: 10, nombre: 'Valor en Dólares (USD)', tipo: 'D', max: 17 }, // 14,2
    { campo: 11, nombre: 'Cantidad en Unidades de Medida de Comercialización', tipo: 'D', max: 19 }, // 15,3
    { campo: 12, nombre: 'Unidad de Medida de Comercialización', tipo: 'N', max: 2 },
    { campo: 13, nombre: 'Cantidad en Unidades de la LIGIE', tipo: 'D', max: 24 }, // 18,5
    { campo: 14, nombre: 'Unidad de Medida de la LIGIE', tipo: 'N', max: 2 },
    { campo: 15, nombre: 'Valor Agregado', tipo: 'N', max: 12 },
    { campo: 16, nombre: 'Vinculación', tipo: 'A', max: 1 },
    { campo: 17, nombre: 'Método de Valoración', tipo: 'N', max: 2 },
    { campo: 18, nombre: 'Código del producto', tipo: 'A', max: 20 },
    { campo: 19, nombre: 'Marca de la mercancía', tipo: 'A', max: 80 },
    { campo: 20, nombre: 'Modelo o Lote de la mercancía', tipo: 'A', max: 80 },
    { campo: 21, nombre: 'País de Origen o Destino de la mercancía', tipo: 'A', max: 3 },
    { campo: 22, nombre: 'País Vendedor o Comprador', tipo: 'A', max: 3 },
    { campo: 23, nombre: 'Entidad Federativa de Origen', tipo: 'A', max: 3 },
    { campo: 24, nombre: 'Entidad Federativa de Destino', tipo: 'A', max: 3 },
    { campo: 25, nombre: 'Entidad Federativa del Comprador', tipo: 'A', max: 3 },
    { campo: 26, nombre: 'Entidad Federativa del Vendedor', tipo: 'A', max: 3 },
  ],
  553: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Fracción Arancelaria', tipo: 'A', max: 8 },
    { campo: 4, nombre: 'Número de Partida', tipo: 'N', max: 5 },
    { campo: 5, nombre: 'Clave del Permiso', tipo: 'A', max: 3 },
    { campo: 6, nombre: 'Firma de descargo / Certificado NOM / Autorización', tipo: 'A', max: 32 },
    { campo: 7, nombre: 'Número de permiso o autorización', tipo: 'A', max: 50 },
    { campo: 8, nombre: 'Valor comercial en dólares (USD)', tipo: 'D', max: 17 },
    { campo: 9, nombre: 'Cantidad de Mercancía en UMT o UMC', tipo: 'D', max: 24 },
  ],
  554: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Fracción Arancelaria', tipo: 'A', max: 8 },
    { campo: 4, nombre: 'Número de Partida', tipo: 'N', max: 5 },
    { campo: 5, nombre: 'Clave del identificador', tipo: 'A', max: 2 },
    { campo: 6, nombre: 'Complemento 1', tipo: 'A', max: 20 },
    { campo: 7, nombre: 'Complemento 2', tipo: 'A', max: 50 },
    { campo: 8, nombre: 'Complemento 3', tipo: 'A', max: 40 },
  ],
  556: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Fracción Arancelaria', tipo: 'A', max: 8 },
    { campo: 4, nombre: 'Número de Partida', tipo: 'N', max: 5 },
    { campo: 5, nombre: 'Clave de la Contribución a pagar', tipo: 'N', max: 2 },
    { campo: 6, nombre: 'Tasa de la Contribución', tipo: 'D', max: 26 },
    { campo: 7, nombre: 'Tipo de tasa aplicable', tipo: 'N', max: 2 },
  ],
  557: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Fracción Arancelaria', tipo: 'A', max: 8 },
    { campo: 4, nombre: 'Número de Partida', tipo: 'N', max: 5 },
    { campo: 5, nombre: 'Clave de la Contribución a pagar', tipo: 'N', max: 2 },
    { campo: 6, nombre: 'Forma de pago', tipo: 'N', max: 3 },
    { campo: 7, nombre: 'Importe de la Contribución', tipo: 'N', max: 12 },
  ],
  800: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Número de Pedimento', tipo: 'N', max: 7 },
    { campo: 3, nombre: 'Tipo de figura', tipo: 'N', max: 1 },
    { campo: 4, nombre: 'e.firma del agente, apoderado aduanal o mandatario', tipo: 'A', max: 360 },
    { campo: 5, nombre: 'Número de serie del certificado de la e.firma', tipo: 'A', max: 25 },
  ],
  801: [
    { campo: 1, nombre: 'Clave del Tipo de Registro', tipo: 'N', max: 3 },
    { campo: 2, nombre: 'Nombre del Archivo', tipo: 'A', max: 12 },
    { campo: 3, nombre: 'Cantidad de Pedimentos', tipo: 'N', max: 5 },
    // Verbatim v9.0: "Número total de registros que componen el archivo, sin considerar el registro 801."
    { campo: 4, nombre: 'Cantidad de Registros', tipo: 'N', max: 5 },
    { campo: 5, nombre: 'Clave de Prevalidador', tipo: 'A', max: 5 },
  ],
};

/** Catálogo de tipos de movimiento del 500.2 (verbatim v9.0, criterios de llenado). */
export const MOVIMIENTOS: Record<string, string> = {
  '1': 'Pedimento Nuevo',
  '2': 'Eliminación',
  '3': 'Desistimiento',
  '5': 'Informe de la Industria Automotriz',
  '6': 'Pedimento Complementario',
  '7': 'Despacho Anticipado',
  '8': 'Confirmación de Pago',
  '9': 'Global Complementario',
};

/** v1 procesa exclusivamente Pedimento Nuevo (diseño §a, política de movimientos). */
export const MOVIMIENTO_PROCESABLE = '1';

/** Nombre de archivo conforme a criterios 801.2: mppppnnn.ddd. */
export const NOMBRE_ARCHIVO_REGEX = /^m\d{7}\.\d{3}$/i;

/**
 * Tolerancias aritméticas EXPLÍCITAS (adición aprobada 17-jul — nada de "≈"):
 * - Contribuciones: los importes 510/557 son enteros en MXN ("Numérico 12").
 *   Por cada clave de contribución: |Σ557(clave) − Σ510(clave)| ≤ (nº de
 *   registros 557 con esa clave) × 1 MXN — un peso de redondeo por partida.
 *   Solo se comparan claves presentes en 557: las contribuciones exclusivamente
 *   globales (p.ej. DTA/PRV, sin desglose por partida) no generan comparación.
 * - Valores: |Σ551.10 − Σ505.7| ≤ (nº 551 + nº 505) × 0.01 USD — un centavo
 *   de redondeo por renglón declarado.
 * Exceder la tolerancia NO tumba el archivo (la forma ya validó): genera
 * advertencia de integridad visible en el radar (posible drift semántico).
 */
export const TOLERANCIA_MXN_POR_PARTIDA = 1;
export const TOLERANCIA_USD_POR_RENGLON = 0.01;
