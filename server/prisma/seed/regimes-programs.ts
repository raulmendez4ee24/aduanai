/**
 * Seed: PROSEC, Regla 8va, IEPS, ISAN.
 *
 * Datos basados en publicaciones DOF y Decreto PROSEC vigentes. Las cifras
 * pueden cambiar en cada ejercicio fiscal — verifica DOF antes de operar real.
 */

import { PrismaClient } from '@prisma/client';

// ════════════════════════════════════════════════════════════════════
// PROSEC — 24 sectores
// ════════════════════════════════════════════════════════════════════

interface PROSECSeed {
  fractionCode: string;
  matchType?: 'exact' | 'prefix';
  sector: string;
  prosecRate?: number;
  conditions?: Record<string, unknown>;
  effectiveDate?: string;
  notes?: string;
  /** Referencia DOF de la fila (Frontera Canónica). Sin decree+fechaCotejo,
   *  checkPROSEC la presenta 'sin_verificar'. */
  decree?: string;
  fechaCotejo?: string;
}

export const PROSEC_ELIGIBILITY: PROSECSeed[] = [
  // ── COTEJADAS VERBATIM: Segundo del "DECRETO por el que se modifica la
  // Tarifa de la LIGIE, y el Decreto PROSEC" (DOF 23-abr-2026, vespertina;
  // vigente 24-abr-2026). Arancel "Ex." = 0. Las acotaciones son parte del
  // decreto (incluida la errata «0; 0008%» del propio DOF — verbatim).
  // Espejo de la migración 20260820010000 (paridad: re-seed no las pierde).
  { fractionCode: '72083901', matchType: 'exact', sector: 'electric', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. I PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Eléctrica', conditions: { descripcionDecreto: 'De espesor inferior a 3 mm.', arancelDecreto: 'Ex.', acotacion: null } },
  { fractionCode: '72085104', matchType: 'exact', sector: 'electric', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. I PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Eléctrica', conditions: { descripcionDecreto: 'De espesor superior a 10 mm.', arancelDecreto: 'Ex.', acotacion: 'Excepto: Placas de acero de espesor superior a 10 mm, grados SHT-80, SHT-110, AR-400, SMM-400 o A-516, y placas de acero de espesor superior a 70 mm, grado A-36' } },
  { fractionCode: '72112999', matchType: 'exact', sector: 'electric', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. I PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Eléctrica', conditions: { descripcionDecreto: 'Los demás.', arancelDecreto: 'Ex.', acotacion: 'Únicamente: Flejes con un contenido de carbono igual o superior a 0.6%' } },
  { fractionCode: '72251999', matchType: 'exact', sector: 'electronics', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. II b) PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Electrónica', conditions: { descripcionDecreto: 'Los demás.', arancelDecreto: 'Ex.', acotacion: null } },
  { fractionCode: '72082601', matchType: 'exact', sector: 'automotive', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Automotriz y de Autopartes', conditions: { descripcionDecreto: 'De espesor superior o igual a 3 mm pero inferior a 4.75 mm.', arancelDecreto: 'Ex.', acotacion: null } },
  { fractionCode: '72082701', matchType: 'exact', sector: 'automotive', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Automotriz y de Autopartes', conditions: { descripcionDecreto: 'De espesor inferior a 3 mm.', arancelDecreto: 'Ex.', acotacion: null } },
  { fractionCode: '72091601', matchType: 'exact', sector: 'automotive', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Automotriz y de Autopartes', conditions: { descripcionDecreto: 'De espesor superior a 1 mm pero inferior a 3 mm.', arancelDecreto: 'Ex.', acotacion: null } },
  { fractionCode: '72091701', matchType: 'exact', sector: 'automotive', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Automotriz y de Autopartes', conditions: { descripcionDecreto: 'De espesor superior o igual a 0.5 mm pero inferior o igual a 1 mm.', arancelDecreto: 'Ex.', acotacion: null } },
  { fractionCode: '72112999', matchType: 'exact', sector: 'automotive', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Automotriz y de Autopartes', conditions: { descripcionDecreto: 'Los demás.', arancelDecreto: 'Ex.', acotacion: 'Únicamente: Flejes con un contenido de carbono igual o superior a 0.6%.' } },
  { fractionCode: '72253091', matchType: 'exact', sector: 'automotive', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Automotriz y de Autopartes', conditions: { descripcionDecreto: 'Los demás, simplemente laminados en caliente, enrollados.', arancelDecreto: 'Ex.', acotacion: 'Excepto: Con un contenido de boro superior o igual a 0; 0008%, de espesor superior a 10 mm; con un contenido de boro superior o igual a 0; 0008%, de espesor superior o igual a 4; 75 mm, pero inferior o igual a 10 mm; con un contenido de boro superior o igual a 0; 0008%, de espesor superior o igual a 3 mm, pero inferior a 4; 75 mm; con un contenido de boro superior o igual a 0; 0008%, de espesor inferior a 3 mm; de acero rápido. (Errata tipográfica del propio DOF: «0; 0008%» por 0.0008% — se conserva VERBATIM)' } },
  { fractionCode: '72254091', matchType: 'exact', sector: 'automotive', prosecRate: 0, effectiveDate: '2026-04-24', decree: 'DOF 23-04-2026 (Tarifa 15 · Segundo, Art. 5 fr. XIX PROSEC)', fechaCotejo: '2026-08-19', notes: 'Industria Automotriz y de Autopartes', conditions: { descripcionDecreto: 'Los demás, simplemente laminados en caliente, sin enrollar.', arancelDecreto: 'Ex.', acotacion: 'Únicamente: Con un contenido de boro superior o igual a 0.0008%, de espesor superior a 10 mm, excepto de grado herramienta.' } },

  // Sector ELÉCTRICO
  { fractionCode: '85', matchType: 'prefix', sector: 'electric', notes: 'Productos eléctricos del cap 85' },
  { fractionCode: '8501', matchType: 'prefix', sector: 'electric' },
  { fractionCode: '8504', matchType: 'prefix', sector: 'electric' },
  { fractionCode: '8536', matchType: 'prefix', sector: 'electric' },
  { fractionCode: '8544', matchType: 'prefix', sector: 'electric' },

  // Sector ELECTRÓNICO
  { fractionCode: '8471', matchType: 'prefix', sector: 'electronics', notes: 'Computadoras' },
  { fractionCode: '8473', matchType: 'prefix', sector: 'electronics', notes: 'Partes computadoras' },
  { fractionCode: '8517', matchType: 'prefix', sector: 'electronics', notes: 'Telefonía y comunicaciones' },
  { fractionCode: '8528', matchType: 'prefix', sector: 'electronics', notes: 'Monitores/TV' },
  { fractionCode: '8541', matchType: 'prefix', sector: 'electronics', notes: 'Semiconductores' },
  { fractionCode: '8542', matchType: 'prefix', sector: 'electronics', notes: 'Circuitos integrados' },

  // Sector MUEBLE
  { fractionCode: '94', matchType: 'prefix', sector: 'furniture', notes: 'Muebles cap 94' },

  // Sector JUGUETES
  { fractionCode: '95', matchType: 'prefix', sector: 'toys', notes: 'Juguetes cap 95' },

  // Sector CALZADO
  { fractionCode: '64', matchType: 'prefix', sector: 'footwear', notes: 'Calzado cap 64' },

  // Sector MINERO/METALÚRGICO
  { fractionCode: '71', matchType: 'prefix', sector: 'mining_metallurgy' },
  { fractionCode: '74', matchType: 'prefix', sector: 'mining_metallurgy' },
  { fractionCode: '75', matchType: 'prefix', sector: 'mining_metallurgy' },
  { fractionCode: '76', matchType: 'prefix', sector: 'mining_metallurgy', notes: 'Aluminio' },
  { fractionCode: '78', matchType: 'prefix', sector: 'mining_metallurgy' },
  { fractionCode: '79', matchType: 'prefix', sector: 'mining_metallurgy' },

  // Sector BIENES DE CAPITAL
  { fractionCode: '8413', matchType: 'prefix', sector: 'capital_goods', notes: 'Bombas' },
  { fractionCode: '8414', matchType: 'prefix', sector: 'capital_goods' },
  { fractionCode: '8418', matchType: 'prefix', sector: 'capital_goods' },
  { fractionCode: '8419', matchType: 'prefix', sector: 'capital_goods' },
  { fractionCode: '8421', matchType: 'prefix', sector: 'capital_goods' },

  // Sector FOTOGRÁFICO
  { fractionCode: '9006', matchType: 'prefix', sector: 'photographic' },
  { fractionCode: '9007', matchType: 'prefix', sector: 'photographic' },

  // Sector MAQUINARIA AGRÍCOLA
  { fractionCode: '8432', matchType: 'prefix', sector: 'agricultural_machinery' },
  { fractionCode: '8433', matchType: 'prefix', sector: 'agricultural_machinery' },
  { fractionCode: '8436', matchType: 'prefix', sector: 'agricultural_machinery' },

  // Sector QUÍMICO
  { fractionCode: '28', matchType: 'prefix', sector: 'chemical', notes: 'Químicos inorgánicos' },
  { fractionCode: '29', matchType: 'prefix', sector: 'chemical', notes: 'Químicos orgánicos' },
  { fractionCode: '32', matchType: 'prefix', sector: 'chemical' },
  { fractionCode: '34', matchType: 'prefix', sector: 'chemical' },
  { fractionCode: '38', matchType: 'prefix', sector: 'chemical' },

  // Sector MANUFACTURAS DE CAUCHO Y PLÁSTICO
  { fractionCode: '39', matchType: 'prefix', sector: 'rubber_plastic', notes: 'Plásticos' },
  { fractionCode: '40', matchType: 'prefix', sector: 'rubber_plastic', notes: 'Caucho' },

  // Sector SIDERÚRGICO
  { fractionCode: '72', matchType: 'prefix', sector: 'steel', notes: 'Acero cap 72' },
  { fractionCode: '73', matchType: 'prefix', sector: 'steel', notes: 'Manufacturas de acero cap 73' },

  // Sector PRODUCTOS FARMOQUÍMICOS
  { fractionCode: '2933', matchType: 'prefix', sector: 'pharma_chemicals' },
  { fractionCode: '2934', matchType: 'prefix', sector: 'pharma_chemicals' },
  { fractionCode: '2941', matchType: 'prefix', sector: 'pharma_chemicals' },
  { fractionCode: '30', matchType: 'prefix', sector: 'pharma_chemicals', notes: 'Productos farmacéuticos' },

  // Sector ALIMENTOS
  { fractionCode: '15', matchType: 'prefix', sector: 'food' },
  { fractionCode: '16', matchType: 'prefix', sector: 'food' },
  { fractionCode: '17', matchType: 'prefix', sector: 'food' },
  { fractionCode: '19', matchType: 'prefix', sector: 'food' },
  { fractionCode: '20', matchType: 'prefix', sector: 'food' },
  { fractionCode: '21', matchType: 'prefix', sector: 'food' },

  // Sector FERTILIZANTES
  { fractionCode: '31', matchType: 'prefix', sector: 'fertilizers' },

  // Sector CERÁMICA
  { fractionCode: '69', matchType: 'prefix', sector: 'ceramic' },

  // Sector VIDRIO
  { fractionCode: '70', matchType: 'prefix', sector: 'glass' },

  // Sector HULE (separado de plásticos)
  { fractionCode: '4001', matchType: 'prefix', sector: 'rubber' },
  { fractionCode: '4002', matchType: 'prefix', sector: 'rubber' },

  // Sector TABACO
  { fractionCode: '24', matchType: 'prefix', sector: 'tobacco' },

  // Sector PAPEL Y CARTÓN
  { fractionCode: '47', matchType: 'prefix', sector: 'paper' },
  { fractionCode: '48', matchType: 'prefix', sector: 'paper' },

  // Sector MADERA
  { fractionCode: '44', matchType: 'prefix', sector: 'wood' },

  // Sector CUERO Y PIELES
  { fractionCode: '41', matchType: 'prefix', sector: 'leather' },
  { fractionCode: '42', matchType: 'prefix', sector: 'leather' },
  { fractionCode: '43', matchType: 'prefix', sector: 'leather' },

  // Sector AUTOMOTRIZ Y AUTOPARTES
  { fractionCode: '8407', matchType: 'prefix', sector: 'automotive' },
  { fractionCode: '8408', matchType: 'prefix', sector: 'automotive' },
  { fractionCode: '8483', matchType: 'prefix', sector: 'automotive' },
  { fractionCode: '8703', matchType: 'prefix', sector: 'automotive' },
  { fractionCode: '8704', matchType: 'prefix', sector: 'automotive' },
  { fractionCode: '8708', matchType: 'prefix', sector: 'automotive', notes: 'Autopartes' },

  // Sector TEXTIL Y CONFECCIÓN
  { fractionCode: '50', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '51', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '52', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '53', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '54', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '55', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '60', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '61', matchType: 'prefix', sector: 'textile_apparel' },
  { fractionCode: '62', matchType: 'prefix', sector: 'textile_apparel' },
];

// ════════════════════════════════════════════════════════════════════
// REGLA 8VA — Componentes para producto terminado
// ════════════════════════════════════════════════════════════════════

interface Regla8vaSeed {
  vehicleFraction: string;
  vehicleDesc: string;
  partsAllowed: { fraction: string; desc: string; maxValue?: number }[];
  preferentialRate: number;
  conditions?: string;
}

export const REGLA_8VA_MAPPINGS: Regla8vaSeed[] = [
  {
    vehicleFraction: '8703',
    vehicleDesc: 'Vehículos automóviles para transporte de personas',
    partsAllowed: [
      { fraction: '8407', desc: 'Motores de émbolo (gasolina)' },
      { fraction: '8408', desc: 'Motores diésel' },
      { fraction: '8708', desc: 'Partes y accesorios de vehículos' },
      { fraction: '7318', desc: 'Tornillería para ensamble' },
      { fraction: '8536', desc: 'Conectores eléctricos' },
      { fraction: '8544', desc: 'Cables y arneses' },
      { fraction: '4011', desc: 'Llantas neumáticas' },
    ],
    preferentialRate: 0,
    conditions: 'Empresa con programa IMMEX o registro PROSEC sector automotriz. Documentar uso final en ensamble vehicular.',
  },
  {
    vehicleFraction: '8704',
    vehicleDesc: 'Vehículos para transporte de mercancías',
    partsAllowed: [
      { fraction: '8407', desc: 'Motores' },
      { fraction: '8408', desc: 'Motores diésel' },
      { fraction: '8708', desc: 'Partes' },
    ],
    preferentialRate: 0,
    conditions: 'Mismas que 8703.',
  },
  {
    vehicleFraction: '8517',
    vehicleDesc: 'Smartphones y equipos de telecomunicación',
    partsAllowed: [
      { fraction: '8542', desc: 'Circuitos integrados' },
      { fraction: '8541', desc: 'Semiconductores' },
      { fraction: '8528', desc: 'Pantallas' },
      { fraction: '8504', desc: 'Cargadores y fuentes' },
    ],
    preferentialRate: 0,
    conditions: 'IMMEX electrónico o PROSEC electrónica.',
  },
  {
    vehicleFraction: '8471',
    vehicleDesc: 'Máquinas automáticas para procesamiento de datos (computadoras)',
    partsAllowed: [
      { fraction: '8473', desc: 'Partes y accesorios computadoras' },
      { fraction: '8542', desc: 'Procesadores' },
      { fraction: '8534', desc: 'Circuitos impresos' },
    ],
    preferentialRate: 0,
  },
  {
    vehicleFraction: '8528',
    vehicleDesc: 'Monitores y receptores de televisión',
    partsAllowed: [
      { fraction: '8529', desc: 'Partes para receptores TV' },
      { fraction: '8542', desc: 'Circuitos integrados' },
    ],
    preferentialRate: 0,
  },
  {
    vehicleFraction: '8804',
    vehicleDesc: 'Paracaídas',
    partsAllowed: [
      { fraction: '5407', desc: 'Tejidos sintéticos' },
      { fraction: '5607', desc: 'Cordeles y cuerdas' },
    ],
    preferentialRate: 0,
    conditions: 'Industria aeroespacial / militar.',
  },
];

// ════════════════════════════════════════════════════════════════════
// IEPS — tasas vigentes
// ════════════════════════════════════════════════════════════════════

interface IEPSSeed {
  fractionCode: string;
  matchType?: 'exact' | 'prefix';
  productCategory: string;
  rate: number;
  rateType: 'ad_valorem' | 'specific';
  unit?: string;
  description?: string;
  effectiveDate?: string;
  notes?: string;
}

export const IEPS_RATES: IEPSSeed[] = [
  // Combustibles
  { fractionCode: '27101201', matchType: 'exact', productCategory: 'gasoline', rate: 5.4917, rateType: 'specific', unit: 'MXN/L', description: 'Gasolina magna' },
  { fractionCode: '27101202', matchType: 'exact', productCategory: 'gasoline', rate: 4.6371, rateType: 'specific', unit: 'MXN/L', description: 'Gasolina premium' },
  { fractionCode: '27101905', matchType: 'exact', productCategory: 'diesel', rate: 6.0354, rateType: 'specific', unit: 'MXN/L', description: 'Diésel' },

  // Bebidas alcohólicas
  { fractionCode: '2203', matchType: 'prefix', productCategory: 'alcohol', rate: 26.5, rateType: 'ad_valorem', unit: '%', description: 'Cerveza' },
  { fractionCode: '2204', matchType: 'prefix', productCategory: 'alcohol', rate: 26.5, rateType: 'ad_valorem', unit: '%', description: 'Vino — graduación <14°' },
  { fractionCode: '2208', matchType: 'prefix', productCategory: 'alcohol', rate: 53, rateType: 'ad_valorem', unit: '%', description: 'Bebidas destiladas >20° (whisky, tequila, vodka)' },
  { fractionCode: '22082001', matchType: 'exact', productCategory: 'alcohol', rate: 53, rateType: 'ad_valorem', unit: '%', description: 'Tequila' },
  { fractionCode: '22082002', matchType: 'exact', productCategory: 'alcohol', rate: 53, rateType: 'ad_valorem', unit: '%', description: 'Mezcal' },
  { fractionCode: '22083004', matchType: 'exact', productCategory: 'alcohol', rate: 53, rateType: 'ad_valorem', unit: '%', description: 'Whisky' },

  // Tabacos labrados
  { fractionCode: '2402', matchType: 'prefix', productCategory: 'tobacco', rate: 160, rateType: 'ad_valorem', unit: '%', description: 'Cigarros, puros, cigarrillos' },
  { fractionCode: '2403', matchType: 'prefix', productCategory: 'tobacco', rate: 160, rateType: 'ad_valorem', unit: '%', description: 'Otros tabacos labrados' },

  // Bebidas saborizadas con azúcares añadidos
  { fractionCode: '22021000', matchType: 'exact', productCategory: 'soda', rate: 1.6451, rateType: 'specific', unit: 'MXN/L', description: 'Refrescos / aguas saborizadas' },
  { fractionCode: '22029999', matchType: 'exact', productCategory: 'soda', rate: 1.6451, rateType: 'specific', unit: 'MXN/L', description: 'Bebidas no alcohólicas' },

  // Alimentos alta densidad calórica
  { fractionCode: '17049099', matchType: 'exact', productCategory: 'high_calorie', rate: 8, rateType: 'ad_valorem', unit: '%', description: 'Confites/dulces ≥275 kcal/100g' },
  { fractionCode: '18063299', matchType: 'exact', productCategory: 'high_calorie', rate: 8, rateType: 'ad_valorem', unit: '%', description: 'Chocolate >70% cacao' },
  { fractionCode: '19053101', matchType: 'exact', productCategory: 'high_calorie', rate: 8, rateType: 'ad_valorem', unit: '%', description: 'Galletas con alta densidad calórica' },
  { fractionCode: '21069099', matchType: 'exact', productCategory: 'high_calorie', rate: 8, rateType: 'ad_valorem', unit: '%', description: 'Preparaciones alimenticias densas' },

  // Plaguicidas (variable según toxicidad)
  { fractionCode: '3808', matchType: 'prefix', productCategory: 'pesticide', rate: 9, rateType: 'ad_valorem', unit: '%', description: 'Plaguicidas categoría toxicidad alta' },
];

// ════════════════════════════════════════════════════════════════════
// ISAN — tarifa progresiva 2026 (representativa)
// ════════════════════════════════════════════════════════════════════

interface ISANSeed {
  fractionCode: string;
  vehicleType: string;
  priceRangeMin: number;
  priceRangeMax: number | null;
  fixedAmount: number;
  marginalRate: number;
  exempt?: boolean;
  fiscalYear?: number;
  notes?: string;
}

// Tarifa ISAN 2026 — FUENTE PRIMARIA: DOF 28-dic-2025, Anexo 15 RMF, sección A
// "Tarifa para determinar el ISAN para el año 2026" (Art. 3 LFISAN).
// COTEJADO tramo por tramo contra el PDF oficial del SAT el 2026-06-25:
//   https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-15-RMF-2026_DOF-2812225.pdf
// Los 5 tramos (límites + cuotas fijas) y los escalares (umbral 7% $1,060,189.93,
// Art. 8-II $356,934.05 / $452,116.48) coinciden EXACTO con la fuente. Tasas
// marginales reales: 2 / 5 / 10 / 15 / 17 %. (Las cuotas fijas del DOF traen
// ±0.18 de redondeo propio sobre el acumulado; es así en el documento oficial.)
const ISAN_2026_DOF = 'DOF 28-dic-2025 — Anexo 15 RMF 2026, sección A (Tarifa ISAN, Art. 3 LFISAN). Cotejado vs PDF oficial SAT el 2026-06-25.';
export const ISAN_RATES: ISANSeed[] = [
  { fractionCode: '8703', vehicleType: 'passenger', priceRangeMin: 0.01,      priceRangeMax: 383940.35, fixedAmount: 0.00,     marginalRate: 2,  notes: ISAN_2026_DOF },
  { fractionCode: '8703', vehicleType: 'passenger', priceRangeMin: 383940.36, priceRangeMax: 460728.35, fixedAmount: 7678.67,  marginalRate: 5,  notes: ISAN_2026_DOF },
  { fractionCode: '8703', vehicleType: 'passenger', priceRangeMin: 460728.36, priceRangeMax: 537516.64, fixedAmount: 11518.25, marginalRate: 10, notes: ISAN_2026_DOF },
  { fractionCode: '8703', vehicleType: 'passenger', priceRangeMin: 537516.65, priceRangeMax: 691092.34, fixedAmount: 19197.04, marginalRate: 15, notes: ISAN_2026_DOF },
  { fractionCode: '8703', vehicleType: 'passenger', priceRangeMin: 691092.35, priceRangeMax: null,      fixedAmount: 42233.35, marginalRate: 17, notes: ISAN_2026_DOF },
  // Nota: el descuento 7% (precio > $1,060,189.93) y la exención Art. 8-II
  // (≤$356,934.05 = 100%; ≤$452,116.48 = 50%) viven como parámetros escalares
  // en ISAN_2026 (services/regimes-programs.ts), derivados del MISMO DOF.
  // Eléctricos/híbridos: exentos — se maneja por el flag isElectric en el cálculo.
];

// ════════════════════════════════════════════════════════════════════
// Seed runner
// ════════════════════════════════════════════════════════════════════

export async function seedRegimesPrograms(prisma: PrismaClient): Promise<{ prosec: number; regla8va: number; ieps: number; isan: number }> {
  // PROSEC
  await prisma.pROSECEligibility.deleteMany({});
  let prosec = 0;
  for (const p of PROSEC_ELIGIBILITY) {
    await prisma.pROSECEligibility.create({
      data: {
        fractionCode: p.fractionCode,
        matchType: p.matchType ?? 'exact',
        sector: p.sector,
        prosecRate: p.prosecRate ?? 0,
        conditions: p.conditions as never,
        effectiveDate: new Date(p.effectiveDate ?? '2026-01-01'),
        decree: p.decree ?? null,
        fechaCotejo: p.fechaCotejo ? new Date(p.fechaCotejo) : null,
        notes: p.notes,
      },
    });
    prosec++;
  }

  // Regla 8va
  await prisma.regla8vaMapping.deleteMany({});
  let regla8va = 0;
  for (const r of REGLA_8VA_MAPPINGS) {
    await prisma.regla8vaMapping.create({
      data: {
        vehicleFraction: r.vehicleFraction,
        vehicleDesc: r.vehicleDesc,
        partsAllowed: r.partsAllowed as never,
        preferentialRate: r.preferentialRate,
        conditions: r.conditions,
        effectiveDate: new Date('2026-01-01'),
      },
    });
    regla8va++;
  }

  // IEPS
  await prisma.iEPSRate.deleteMany({});
  let ieps = 0;
  for (const i of IEPS_RATES) {
    await prisma.iEPSRate.create({
      data: {
        fractionCode: i.fractionCode,
        matchType: i.matchType ?? 'exact',
        productCategory: i.productCategory,
        rate: i.rate,
        rateType: i.rateType,
        unit: i.unit,
        description: i.description,
        effectiveDate: new Date(i.effectiveDate ?? '2026-01-01'),
        notes: i.notes,
      },
    });
    ieps++;
  }

  // ISAN
  await prisma.iSANRate.deleteMany({});
  let isan = 0;
  for (const r of ISAN_RATES) {
    await prisma.iSANRate.create({
      data: {
        fractionCode: r.fractionCode,
        vehicleType: r.vehicleType,
        priceRangeMin: r.priceRangeMin,
        priceRangeMax: r.priceRangeMax,
        fixedAmount: r.fixedAmount,
        marginalRate: r.marginalRate,
        exempt: r.exempt ?? false,
        fiscalYear: r.fiscalYear ?? 2026,
        notes: r.notes,
      },
    });
    isan++;
  }

  return { prosec, regla8va, ieps, isan };
}
