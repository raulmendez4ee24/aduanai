/**
 * Fuente única de las reglas de origen sembradas (movida de prisma/seed/
 * el 24-ago-2026 para que el paso de arranque "sembrar si está vacía" en
 * src/index.ts pueda importarla sin romper el rootDir del build — el seed
 * standalone re-exporta desde aquí).
 */
import { PrismaClient } from '@prisma/client';

interface OriginRuleSeed {
  fractionCode: string;
  matchType?: 'exact' | 'prefix';
  agreement: string;
  ruleType: 'wholly_obtained' | 'tariff_shift' | 'rvc' | 'specific_process' | 'combined';
  description: string;
  rvcRequired?: number;
  rvcRequiredNetCost?: number;
  rvcMethod?: 'transaction_value' | 'net_cost' | 'either' | 'build_up' | 'build_down';
  tariffShift?: string;
  tariffShiftCode?: string;
  specificProcess?: string;
  annex?: string;
  isAutomotive?: boolean;
  autoCategory?: 'vehicle' | 'core_part' | 'principal_part' | 'complementary_part';
  laborValueContent?: number;
  steelAluminumPercent?: number;
  textileRule?: 'yarn_forward' | 'fiber_forward' | 'fabric_forward';
  notes?: string;
}

export const ORIGIN_RULES: OriginRuleSeed[] = [
  // ════════════════════════════════════════════════════════════════════
  // TMEC — Anexo 4-B Automotriz (RVC 75% para vehículos ligeros desde 2023)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '8703', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Vehículos automóviles para transporte de personas — RVC 75% (transaction value) o 66% (net cost) + LVC 40-45% + acero/aluminio 70%',
    rvcRequired: 75, rvcMethod: 'transaction_value',
    tariffShift: 'Cambio a partida 8703 desde cualquier otra partida',
    annex: '4-B', notes: 'Vehículos ligeros — fase final desde 2023-07-01. LVC labor value content 40-45% adicional.' },

  { fractionCode: '8704', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Vehículos para transporte de mercancías — RVC 75% / LVC 45-50%',
    rvcRequired: 75, rvcMethod: 'transaction_value',
    annex: '4-B', notes: 'Camiones y vehículos de carga.' },

  { fractionCode: '8708', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Partes y accesorios automotrices — RVC 65-75% según parte (core, principal, complementaria)',
    rvcRequired: 65, rvcMethod: 'transaction_value',
    annex: '4-B', notes: 'Tres categorías: core parts (75%), principal (70%), complementarias (65%).' },

  { fractionCode: '870600', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Chasis con motor — RVC 75% (transaction value)',
    rvcRequired: 75, rvcMethod: 'transaction_value',
    annex: '4-B' },

  { fractionCode: '870870', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Ruedas, partes y accesorios — RVC 70%',
    rvcRequired: 70, rvcMethod: 'transaction_value',
    annex: '4-B', notes: 'Parte principal automotriz.' },

  { fractionCode: '870899', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Las demás partes y accesorios — RVC 65%',
    rvcRequired: 65, rvcMethod: 'transaction_value',
    annex: '4-B', notes: 'Parte complementaria automotriz.' },

  // ════════════════════════════════════════════════════════════════════
  // TMEC — Textiles (yarn-forward / fiber-forward, capítulos 50-63)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '50', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Seda — fiber forward: hilatura y tejido en territorio',
    specificProcess: 'Hilatura y tejido en territorio TMEC',
    notes: 'Capítulo 50.' },

  { fractionCode: '52', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Algodón — yarn forward: hilatura desde fibra cardada/peinada en territorio',
    specificProcess: 'Hilatura desde fibra natural en territorio TMEC + tejido en territorio',
    notes: 'Capítulo 52 — algodón.' },

  { fractionCode: '54', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Filamentos sintéticos — yarn forward: hilado y tejido en territorio',
    specificProcess: 'Producción de filamento + tejido en territorio TMEC',
    notes: 'Capítulo 54 — filamentos sintéticos/artificiales.' },

  { fractionCode: '55', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Fibras sintéticas discontinuas — fiber forward',
    specificProcess: 'Producción de fibra + hilatura + tejido en territorio TMEC',
    notes: 'Capítulo 55.' },

  { fractionCode: '60', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Tejidos de punto — yarn forward',
    specificProcess: 'Hilatura + producción del tejido en territorio TMEC',
    notes: 'Capítulo 60.' },

  { fractionCode: '61', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Prendas de vestir punto — yarn forward (la prenda y los tejidos visibles deben ser de hilados originarios)',
    specificProcess: 'Hilatura + tejido + confección en territorio TMEC',
    notes: 'Capítulo 61. Prendas de punto.' },

  { fractionCode: '62', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Prendas de vestir tejidas — yarn forward + visible lining originario',
    specificProcess: 'Hilatura + tejido + corte y confección en territorio TMEC',
    notes: 'Capítulo 62. Forros visibles deben ser originarios.' },

  { fractionCode: '63', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Otros confeccionados textiles — fabric forward',
    specificProcess: 'Tejido + corte y confección en territorio TMEC',
    notes: 'Capítulo 63.' },

  // ════════════════════════════════════════════════════════════════════
  // TMEC — Acero (melt and pour, capítulos 72-73)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '72', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Acero — melt and pour: fundido y vaciado en territorio TMEC',
    specificProcess: 'Fundición y colada inicial del acero en territorio TMEC',
    notes: 'Vigente desde 2027-07-01 para acero usado en autos. Para el resto, fiel al melt-and-pour desde 2024.' },

  { fractionCode: '7208', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Lámina caliente — melt and pour + cambio de partida',
    specificProcess: 'Fundido y vaciado en territorio + producción del producto plano',
    tariffShift: 'Cambio a 7208 desde cualquier otra partida' },

  { fractionCode: '7209', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Lámina rolada en frío — melt and pour',
    specificProcess: 'Acero fundido y vaciado en territorio TMEC' },

  { fractionCode: '7210', matchType: 'prefix', agreement: 'TMEC', ruleType: 'specific_process',
    description: 'Lámina galvanizada — melt and pour',
    specificProcess: 'Acero fundido y vaciado en territorio TMEC' },

  { fractionCode: '73', matchType: 'prefix', agreement: 'TMEC', ruleType: 'tariff_shift',
    description: 'Manufacturas de hierro/acero — cambio de partida desde cualquier otra partida (con excepciones)',
    tariffShift: 'Cambio a la partida del producto desde cualquier otra partida',
    notes: 'Capítulo 73. Algunas subpartidas requieren melt-and-pour adicional.' },

  // ════════════════════════════════════════════════════════════════════
  // TMEC — Electrónicos (capítulos 84-85)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '84', matchType: 'prefix', agreement: 'TMEC', ruleType: 'tariff_shift',
    description: 'Maquinaria — cambio de partida o RVC 60%/50% (TV/NC)',
    tariffShift: 'Cambio a la partida desde cualquier otra partida',
    rvcRequired: 60, rvcMethod: 'either',
    notes: 'Capítulo 84. Alternativa cambio arancelario o RVC.' },

  { fractionCode: '8471', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Computadoras — cambio de partida + RVC 50% (NC) / 60% (TV)',
    tariffShift: 'Cambio a 8471 desde cualquier otra partida',
    rvcRequired: 50, rvcMethod: 'net_cost' },

  { fractionCode: '85', matchType: 'prefix', agreement: 'TMEC', ruleType: 'tariff_shift',
    description: 'Aparatos eléctricos — cambio de partida o RVC 60% (TV) / 50% (NC)',
    tariffShift: 'Cambio a la partida desde cualquier otra partida',
    rvcRequired: 60, rvcMethod: 'either' },

  { fractionCode: '8517', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Equipos telecomunicaciones — cambio de partida + RVC 60%/50%',
    tariffShift: 'Cambio a 8517 desde cualquier otra partida',
    rvcRequired: 50, rvcMethod: 'net_cost' },

  { fractionCode: '8528', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Monitores y receptores TV — cambio de partida + RVC',
    tariffShift: 'Cambio a 8528 desde cualquier otra partida (con excepciones)',
    rvcRequired: 60, rvcMethod: 'transaction_value' },

  // ── Partida 85.44 — reglas REALES del T-MEC por subpartida (BUG-12,
  // re-verificación 24-ago-2026). Regla del GRUPO 8544.11–8544.60 (incluye
  // 8544.30 juegos de cables para medios de transporte, el caso auditado):
  //   (A) cambio a la subpartida desde cualquier subpartida FUERA del grupo,
  //       excepto desde las partidas 74.08, 74.13, 76.05 o 76.14; o
  //   (B) cambio desde otra subpartida DENTRO del grupo o desde 74.08/74.13/
  //       76.05/76.14, cumpliendo VCR ≥ 60% (valor de transacción) o
  //       ≥ 50% (costo neto).
  // Cotejado 24-ago-2026 contra HTSUS General Note 11 (USMCA) Rev. 17 (2026),
  // reglas 114-115 del capítulo 85 (texto oficial en inglés, mismo contenido
  // del tratado; redacción en español del Anexo 4-B DOF 29-jun-2020 pendiente
  // de cotejo literal). Fuente: https://hts.usitc.gov (General Note 11).
  ...(['854411', '854419', '854420', '854430', '854442', '854449', '854460'] as const).map(sub => ({
    fractionCode: sub,
    matchType: 'prefix' as const,
    agreement: 'TMEC',
    ruleType: 'combined' as const,
    description: `Subpartida ${sub.slice(0, 4)}.${sub.slice(4)} — cambio de subpartida desde fuera del grupo 8544.11-8544.60 (excepto partidas 74.08, 74.13, 76.05 y 76.14); o cambio dentro del grupo / desde esas partidas con VCR 60% (VT) o 50% (CN)`,
    tariffShift: 'Cambio a las subpartidas 8544.11 a 8544.60 desde cualquier subpartida fuera de ese grupo, excepto de las partidas 74.08, 74.13, 76.05 o 76.14',
    tariffShiftCode: 'CTSH',
    rvcRequired: 60,
    rvcRequiredNetCost: 50,
    rvcMethod: 'either' as const,
    annex: '4-B',
    isAutomotive: sub === '854430',
    notes: sub === '854430'
      ? 'Regla 114 cap. 85 (GN 11 USMCA Rev.17-2026). Para uso en vehículo automotor del capítulo 87 la mercancía está señalada en el tratado: al calcular el VCR del VEHÍCULO aplican además las disposiciones del Apéndice automotriz al Anexo 4-B. VCR alternativo: 50% por costo neto.'
      : 'Regla 114 cap. 85 (GN 11 USMCA Rev.17-2026). VCR alternativo: 50% por costo neto.',
  })),
  { fractionCode: '854470', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Cables de fibra óptica — cambio de subpartida desde cualquier otra (excepto partidas 70.02 o 90.01); o desde 70.02/90.01 con VCR 60% (VT) o 50% (CN)',
    tariffShift: 'Cambio a la subpartida 8544.70 desde cualquier otra subpartida, excepto de las partidas 70.02 o 90.01',
    tariffShiftCode: 'CTSH',
    rvcRequired: 60, rvcRequiredNetCost: 50, rvcMethod: 'either', annex: '4-B',
    notes: 'Regla 115 cap. 85 (GN 11 USMCA Rev.17-2026). VCR alternativo: 50% por costo neto.' },

  // ════════════════════════════════════════════════════════════════════
  // TMEC — Productos básicos / agropecuarios (wholly obtained)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '01', matchType: 'prefix', agreement: 'TMEC', ruleType: 'wholly_obtained',
    description: 'Animales vivos — wholly obtained: nacidos y criados en territorio',
    notes: 'Capítulo 01.' },

  { fractionCode: '02', matchType: 'prefix', agreement: 'TMEC', ruleType: 'wholly_obtained',
    description: 'Carne y despojos — de animales originarios',
    notes: 'Capítulo 02.' },

  { fractionCode: '07', matchType: 'prefix', agreement: 'TMEC', ruleType: 'wholly_obtained',
    description: 'Hortalizas — cosechadas en territorio',
    notes: 'Capítulo 07.' },

  // ════════════════════════════════════════════════════════════════════
  // TMEC — Plásticos (39) y químicos (28-29)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '28', matchType: 'prefix', agreement: 'TMEC', ruleType: 'tariff_shift',
    description: 'Productos químicos inorgánicos — cambio de partida o reacción química',
    tariffShift: 'Cambio a la partida desde cualquier otra partida',
    notes: 'Alternativa: regla de reacción química.' },

  { fractionCode: '29', matchType: 'prefix', agreement: 'TMEC', ruleType: 'tariff_shift',
    description: 'Productos químicos orgánicos — cambio de partida o reacción química',
    tariffShift: 'Cambio a la partida desde cualquier otra partida' },

  { fractionCode: '39', matchType: 'prefix', agreement: 'TMEC', ruleType: 'tariff_shift',
    description: 'Plásticos — cambio de partida desde fuera del capítulo',
    tariffShift: 'Cambio a la partida desde cualquier otro capítulo (39 a 39 no permitido)',
    notes: 'Excepción: polímeros 3901-3914 requieren cambio desde fuera del subcapítulo.' },

  // ════════════════════════════════════════════════════════════════════
  // TLCUEM — Reglas básicas (porcentaje VNM diferente)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '8703', matchType: 'prefix', agreement: 'TLCUEM', ruleType: 'rvc',
    description: 'Vehículos UE — VNM ≤45% del precio franco fábrica (equivalente RVC ≥55%)',
    rvcRequired: 55, rvcMethod: 'transaction_value',
    notes: 'Regla expresada en % VNM, equivalente a RVC mínimo.' },

  { fractionCode: '61', matchType: 'prefix', agreement: 'TLCUEM', ruleType: 'specific_process',
    description: 'Prendas de vestir UE — confección a partir de hilados',
    specificProcess: 'Confección desde hilados (no requiere yarn-forward completo)' },

  // ════════════════════════════════════════════════════════════════════
  // CPTPP — Reglas comunes
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '8703', matchType: 'prefix', agreement: 'CPTPP', ruleType: 'rvc',
    description: 'Vehículos CPTPP — RVC 45% (build-down) o 55% (build-up)',
    rvcRequired: 45, rvcMethod: 'transaction_value',
    notes: 'CPTPP usa build-down/build-up — más laxo que TMEC.' },

  { fractionCode: '61', matchType: 'prefix', agreement: 'CPTPP', ruleType: 'specific_process',
    description: 'Prendas CPTPP — yarn forward similar a TMEC',
    specificProcess: 'Hilatura + tejido + confección en territorio CPTPP' },
];

// ════════════════════════════════════════════════════════════════════
// ANEXO 4-B AUTOMOTRIZ — reglas detalladas con LVC y SA
// ════════════════════════════════════════════════════════════════════
export const AUTO_4B_RULES: OriginRuleSeed[] = [
  {
    fractionCode: '8703', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Vehículos automóviles para transporte de personas — Anexo 4-B vehículo ligero',
    rvcRequired: 75, rvcMethod: 'net_cost',
    tariffShift: 'Cambio a partida 8703 desde cualquier otra partida', tariffShiftCode: 'CTH',
    annex: '4-B', isAutomotive: true, autoCategory: 'vehicle',
    laborValueContent: 40, steelAluminumPercent: 70,
    notes: 'Vehículos ligeros (gasolina/diésel/eléctricos) — fase final desde 2023-07-01. RVC 75% net cost + LVC 40% (mano de obra >$16 USD/hr) + 70% acero/aluminio NA.',
  },
  {
    fractionCode: '8704', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined',
    description: 'Vehículos para transporte de mercancías — Anexo 4-B',
    rvcRequired: 75, rvcMethod: 'net_cost',
    tariffShiftCode: 'CTH',
    annex: '4-B', isAutomotive: true, autoCategory: 'vehicle',
    laborValueContent: 45, steelAluminumPercent: 70,
    notes: 'Camiones y vehículos de carga — LVC 45% (más estricto que vehículos ligeros).',
  },
  {
    fractionCode: '870870', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Ruedas y partes principales — Anexo 4-B principal part',
    rvcRequired: 70, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'principal_part',
    notes: 'Parte principal — RVC 70% net cost o 76% transaction value.',
  },
  {
    fractionCode: '870840', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Cajas de cambio — Anexo 4-B core part',
    rvcRequired: 75, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'core_part',
    notes: 'Core part — RVC 75% net cost.',
  },
  {
    fractionCode: '870850', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Ejes con diferencial — Anexo 4-B core part',
    rvcRequired: 75, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'core_part',
  },
  {
    fractionCode: '8407', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Motores de émbolo (gasolina) para vehículos — Anexo 4-B core part',
    rvcRequired: 75, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'core_part',
  },
  {
    fractionCode: '8408', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Motores diésel para vehículos — Anexo 4-B core part',
    rvcRequired: 75, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'core_part',
  },
  {
    fractionCode: '870899', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Las demás partes y accesorios — Anexo 4-B complementary',
    rvcRequired: 65, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'complementary_part',
  },
  {
    fractionCode: '870821', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Cinturones de seguridad — Anexo 4-B principal part',
    rvcRequired: 70, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'principal_part',
  },
  {
    fractionCode: '870830', matchType: 'prefix', agreement: 'TMEC', ruleType: 'rvc',
    description: 'Frenos y servofrenos — Anexo 4-B principal part',
    rvcRequired: 70, rvcMethod: 'net_cost',
    annex: '4-B', isAutomotive: true, autoCategory: 'principal_part',
  },
];

export async function seedOriginRules(prisma: PrismaClient): Promise<{ inserted: number }> {
  await prisma.originRule.deleteMany({});

  let inserted = 0;
  // Combina las reglas básicas + el Anexo 4-B automotriz detallado
  const allRules = [...ORIGIN_RULES, ...AUTO_4B_RULES];
  for (const rule of allRules) {
    await prisma.originRule.create({
      data: {
        fractionCode: rule.fractionCode,
        matchType: rule.matchType ?? 'exact',
        agreement: rule.agreement,
        ruleType: rule.ruleType,
        description: rule.description,
        rvcRequired: rule.rvcRequired,
        rvcRequiredNetCost: rule.rvcRequiredNetCost,
        rvcMethod: rule.rvcMethod,
        tariffShift: rule.tariffShift,
        tariffShiftCode: rule.tariffShiftCode,
        specificProcess: rule.specificProcess,
        annex: rule.annex,
        isAutomotive: rule.isAutomotive ?? false,
        autoCategory: rule.autoCategory,
        laborValueContent: rule.laborValueContent,
        steelAluminumPercent: rule.steelAluminumPercent,
        textileRule: rule.textileRule,
        notes: rule.notes,
      },
    });
    inserted++;
  }
  return { inserted };
}
