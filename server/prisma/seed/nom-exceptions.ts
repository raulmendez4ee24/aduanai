/**
 * Seed: Excepciones del Anexo 2.4.1 del Acuerdo de NOMs.
 *
 * El 80% de demoras en aduana por NOMs son por mal manejo de excepciones —
 * no por la NOM en sí. Este seed carga las fracciones del Anexo 2.4.1 más
 * usadas en práctica aduanera.
 *
 * Fuente: Acuerdo que identifica las fracciones arancelarias de la TIGIE
 * en las que se clasifican las mercancías sujetas al cumplimiento de NOMs
 * (DOF última publicación + reformas).
 *
 * Las condiciones (`conditions`) son banderas booleanas que el evaluador
 * cruza con el contexto de la operación. Si TODAS las condiciones se
 * cumplen, la excepción aplica.
 */

import { PrismaClient } from '@prisma/client';

interface NOMExceptionSeed {
  nomCode?: string;            // específica para un NOM; sin nomCode = genérica
  nomScope?: 'ALL' | 'INFO' | 'SEG';  // alcance de la excepción cuando es genérica
  exceptionCode: string;       // ej "Anexo 2.4.1 fracción I"
  fraction: string;            // número romano
  description: string;
  conditions: Record<string, boolean | string | number>;
  requiredDoc?: string;
  legalBasis?: string;
}

export const NOM_EXCEPTIONS: NOMExceptionSeed[] = [
  // Genéricas — aplican a cualquier NOM informativa/comercial salvo NOMs de seguridad esencial
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción I',
    fraction: 'I',
    description:
      'Mercancía importada por la industria automotriz terminal o manufacturera de vehículos, ' +
      'destinada a su proceso productivo. No requiere etiquetado de información comercial en punto de entrada.',
    conditions: { automotive: true, productive: true },
    requiredDoc: 'Carta industrial automotriz',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.I',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción II',
    fraction: 'II',
    description:
      'Mercancía importada al amparo de programa IMMEX para utilizarse como insumo productivo, ' +
      'en proceso de transformación, elaboración o reparación. NO destinada al consumidor final tal cual.',
    conditions: { immex: true, productive: true, consumerFinal: false },
    requiredDoc: 'Carta de No Comercialización al consumidor final + número de programa IMMEX',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.II',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción III',
    fraction: 'III',
    description:
      'Mercancía no destinada al consumidor final (B2B) — venta a otra industria que la transformará, ' +
      'distribuidor mayorista que reetiquetará, o usuario industrial.',
    conditions: { consumerFinal: false },
    requiredDoc: 'Carta de No Comercialización al consumidor final',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.III',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción IV',
    fraction: 'IV',
    description:
      'Mercancía importada en cantidades mínimas para uso personal del importador (no comercialización). ' +
      'Aplica límite por valor y cantidad por persona.',
    conditions: { personalUse: true },
    requiredDoc: 'Declaración bajo protesta de uso personal',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.IV',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción V',
    fraction: 'V',
    description:
      'Muestras y muestrarios sin valor comercial (con perforaciones, sellos o leyendas que las inutilicen ' +
      'como producto comercial), exclusivamente para fines de demostración o pruebas de laboratorio.',
    conditions: { samples: true },
    requiredDoc: 'Carta de muestras sin valor comercial + factura con valor estadístico',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.V',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción VI',
    fraction: 'VI',
    description:
      'Maquinaria y equipo industrial destinado al activo fijo del importador (uso propio, no reventa).',
    conditions: { industrialEquipment: true, ownUse: true, consumerFinal: false },
    requiredDoc: 'Carta de uso industrial / activo fijo + acta constitutiva o RFC del importador',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.VI',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción VII',
    fraction: 'VII',
    description:
      'Mercancías que se importen para someter a un proceso de reparación, reconstrucción o reacondicionamiento, ' +
      'que serán retornadas al extranjero.',
    conditions: { repair: true, reExport: true },
    requiredDoc: 'Carta de retorno al extranjero / pedimento de retorno',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.VII',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción VIII',
    fraction: 'VIII',
    description:
      'Mercancías importadas por dependencias y entidades de la Administración Pública Federal para uso oficial.',
    conditions: { governmentImport: true },
    requiredDoc: 'Oficio de la dependencia importadora',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.VIII',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción IX',
    fraction: 'IX',
    description:
      'Mercancías que se etiquetarán en territorio nacional antes de su comercialización (etiquetado en bodega).',
    conditions: { willLabelInMexico: true },
    requiredDoc: 'Carta de compromiso de etiquetado previo a comercialización',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.IX',
  },
  {
    nomScope: 'INFO',
    exceptionCode: 'Anexo 2.4.1 fracción X',
    fraction: 'X',
    description:
      'Mercancías destinadas a exposiciones, ferias comerciales, demostraciones científicas, técnicas o culturales, ' +
      'o eventos similares, que serán retornadas al extranjero.',
    conditions: { fair: true, reExport: true },
    requiredDoc: 'Carta de exposición / pedimento temporal',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.X',
  },

  // Específicas más frecuentes
  {
    nomCode: 'NOM-024-SCFI-2013',
    exceptionCode: 'Anexo 2.4.1 fracción II + nota NOM-024',
    fraction: 'II',
    description:
      'Productos electrónicos / electrodomésticos importados al amparo de IMMEX como insumo productivo. ' +
      'Aplica para PCBs, componentes electrónicos, displays y subensambles que serán incorporados a producto terminado.',
    conditions: { immex: true, productive: true },
    requiredDoc: 'Carta de No Comercialización + lista de materiales (BOM)',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.II — NOM-024',
  },
  {
    nomCode: 'NOM-050-SCFI-2004',
    exceptionCode: 'Anexo 2.4.1 fracción III',
    fraction: 'III',
    description:
      'Productos sujetos a NOM-050 (información comercial general) destinados a B2B o transformación, ' +
      'no a consumidor final.',
    conditions: { consumerFinal: false },
    requiredDoc: 'Carta de No Comercialización al consumidor final',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.III — NOM-050',
  },
  {
    nomCode: 'NOM-051-SCFI/SSA1-2010',
    exceptionCode: 'Anexo 2.4.1 fracción IX',
    fraction: 'IX',
    description:
      'Productos alimenticios y bebidas no alcohólicas que serán etiquetados en territorio nacional antes de comercializar.',
    conditions: { willLabelInMexico: true },
    requiredDoc: 'Carta de compromiso de etiquetado en bodega autorizada',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.IX — NOM-051',
  },
  {
    nomCode: 'NOM-003-SCFI-2014',
    exceptionCode: 'Anexo 2.4.1 fracción VI (uso industrial)',
    fraction: 'VI',
    description:
      'Productos eléctricos sujetos a NOM-003 destinados a uso industrial / activo fijo del importador, ' +
      'no a comercialización al público.',
    conditions: { industrialEquipment: true, consumerFinal: false },
    requiredDoc: 'Carta de uso industrial firmada por representante legal',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1.VI — NOM-003',
  },

  // NOMs de seguridad — sin excepción posible (deben cumplirse siempre)
  {
    nomCode: 'NOM-220-SE-2018',
    nomScope: 'SEG',
    exceptionCode: 'Sin excepción — NOM de seguridad',
    fraction: '—',
    description:
      'NOM de seguridad infantil (juguetes). NO admite excepción del Anexo 2.4.1 — debe cumplirse siempre, ' +
      'incluso para IMMEX, salvo retorno al extranjero como mercancía no apta.',
    conditions: { _denyAll: true },
    legalBasis: 'NOM-220-SE-2018 cláusula obligatoria',
  },
];

export async function seedNOMExceptions(prisma: PrismaClient): Promise<{ inserted: number }> {
  await prisma.nOMException.deleteMany({});

  let inserted = 0;
  for (const ex of NOM_EXCEPTIONS) {
    await prisma.nOMException.create({
      data: {
        nomCode: ex.nomCode,
        nomScope: ex.nomScope,
        exceptionCode: ex.exceptionCode,
        fraction: ex.fraction,
        description: ex.description,
        conditions: ex.conditions,
        requiredDoc: ex.requiredDoc,
        legalBasis: ex.legalBasis,
      },
    });
    inserted++;
  }
  return { inserted };
}
