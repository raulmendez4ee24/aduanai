/**
 * Seed de Padrones SAT — Anexo 10 RGCE.
 *
 * Padrón General de Importadores (Art. 59 LA fracción IV) + 17 Padrones
 * Sectoriales del Anexo 10 (Sectores 1-17). Cada padrón define qué
 * fracciones requieren la inscripción mediante patrones (prefix matching).
 */

import type { PrismaClient } from '@prisma/client';

interface PadronSeed {
  type: 'general' | 'sectorial' | 'encargo_conferido';
  sectorialCode?: string | null;
  sectorialName: string;
  description: string;
  legalBasis: string;
  authority: string;
  fractionCodes?: string[];
  fractionPatterns?: string[];
  estimatedDays?: number;
  costMXN?: number;
  validityMonths?: number;
}

const SEEDS: PadronSeed[] = [
  // ── General ──
  {
    type: 'general',
    sectorialCode: null,
    sectorialName: 'Padrón General de Importadores',
    description: 'Inscripción obligatoria para toda persona física o moral que pretenda importar mercancías al territorio nacional (Art. 59 fr. IV LA). Sin esta inscripción, el SAT puede embargar la mercancía y aplicar multa del 70-100% del valor (Art. 144 LA).',
    legalBasis: 'Art. 59 fr. IV LA · Anexo 1-A RGCE Trámite 5/LA',
    authority: 'SAT-AGACE',
    fractionPatterns: ['*'],
    estimatedDays: 15,
    validityMonths: 12,
  },

  // ── Sectoriales (Anexo 10 RGCE) ──
  {
    type: 'sectorial',
    sectorialCode: '1',
    sectorialName: 'Productos químicos',
    description: 'Productos químicos en general — incluye precursores químicos no esenciales, sustancias químicas controladas y otros químicos sensibles para salud o seguridad.',
    legalBasis: 'Anexo 10 RGCE Sector 1',
    authority: 'SAT-AGACE',
    fractionPatterns: ['28', '29', '38'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '2',
    sectorialName: 'Radiactivos y nucleares',
    description: 'Materiales radiactivos, isótopos y elementos relacionados con la industria nuclear. Requiere autorización adicional de la CNSNS.',
    legalBasis: 'Anexo 10 RGCE Sector 2',
    authority: 'SAT-AGACE + CNSNS',
    fractionPatterns: ['2844', '2845'],
    estimatedDays: 60,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '3',
    sectorialName: 'Precursores químicos y químicos esenciales',
    description: 'Sustancias controladas por la Convención de Viena 1988 — precursores para fabricación de drogas. Requiere autorización COFEPRIS.',
    legalBasis: 'Anexo 10 RGCE Sector 3 · Ley General de Salud',
    authority: 'SAT-AGACE + COFEPRIS',
    fractionCodes: ['2914.11.01', '2914.12.01', '2932.91.01', '2939.41.01', '2939.42.01'],
    fractionPatterns: ['2914.1', '2932.91', '2939.4'],
    estimatedDays: 45,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '4',
    sectorialName: 'Armas de fuego y explosivos',
    description: 'Armas, municiones, explosivos, partes y accesorios. Requiere permiso adicional de SEDENA.',
    legalBasis: 'Anexo 10 RGCE Sector 4 · Ley Federal de Armas de Fuego',
    authority: 'SAT-AGACE + SEDENA',
    fractionPatterns: ['93', '36'],
    estimatedDays: 90,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '5',
    sectorialName: 'Hidrocarburos y combustibles',
    description: 'Petróleo crudo, gasolinas, diésel, turbosina, gas natural, gas LP, lubricantes y otros derivados de hidrocarburos. Requiere permiso de la CRE.',
    legalBasis: 'Anexo 10 RGCE Sector 5 · Ley de Hidrocarburos',
    authority: 'SAT-AGACE + CRE',
    fractionPatterns: ['2709', '2710', '2711'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '6',
    sectorialName: 'Hierro y acero',
    description: 'Sector siderúrgico — laminados planos y largos, alambre, tubería, tornillería, cables y manufacturas de hierro o acero. Sector altamente sancionable por antidumping.',
    legalBasis: 'Anexo 10 RGCE Sector 6',
    authority: 'SAT-AGACE',
    fractionPatterns: ['72', '73'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '7',
    sectorialName: 'Productos siderúrgicos específicos',
    description: 'Subgrupo del sector 6 — productos siderúrgicos planos como bobinas y láminas que requieren control adicional por exposición a cuotas compensatorias.',
    legalBasis: 'Anexo 10 RGCE Sector 7',
    authority: 'SAT-AGACE',
    fractionPatterns: ['7206', '7207', '7208', '7209', '7210', '7211'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '8',
    sectorialName: 'Textiles y confección',
    description: 'Hilados, tejidos, prendas de vestir y accesorios textiles. Sector altamente fiscalizado por subvaluación y origen falso.',
    legalBasis: 'Anexo 10 RGCE Sector 8',
    authority: 'SAT-AGACE',
    fractionPatterns: ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '9',
    sectorialName: 'Calzado',
    description: 'Calzado, polainas y artículos análogos. Sector con precio estimado SAT y antidumping vs. China.',
    legalBasis: 'Anexo 10 RGCE Sector 9',
    authority: 'SAT-AGACE',
    fractionPatterns: ['64'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '10',
    sectorialName: 'Cigarros y tabacos labrados',
    description: 'Tabaco crudo, cigarros, puros, picadura. Sujetos a IEPS por unidad y arbitrios sanitarios.',
    legalBasis: 'Anexo 10 RGCE Sector 10 · LIEPS',
    authority: 'SAT-AGACE',
    fractionPatterns: ['24'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '11',
    sectorialName: 'Bebidas alcohólicas',
    description: 'Cerveza, vino, destilados y otras bebidas con contenido alcohólico. Requiere marbete y pago IEPS por grado.',
    legalBasis: 'Anexo 10 RGCE Sector 11 · LIEPS',
    authority: 'SAT-AGACE',
    fractionPatterns: ['2203', '2204', '2205', '2206', '2207', '2208'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '12',
    sectorialName: 'Animales vivos y productos de origen animal',
    description: 'Animales vivos, carnes, pescados, lácteos, huevos y otros productos pecuarios. Requiere certificado SENASICA.',
    legalBasis: 'Anexo 10 RGCE Sector 12',
    authority: 'SAT-AGACE + SENASICA',
    fractionPatterns: ['01', '02', '03', '04', '05'],
    estimatedDays: 45,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '13',
    sectorialName: 'Productos farmacéuticos',
    description: 'Medicamentos terminados, principios activos, insumos para la salud. Requiere registro sanitario COFEPRIS.',
    legalBasis: 'Anexo 10 RGCE Sector 13 · Ley General de Salud',
    authority: 'SAT-AGACE + COFEPRIS',
    fractionPatterns: ['30'],
    estimatedDays: 60,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '14',
    sectorialName: 'Vegetales y semillas',
    description: 'Productos vegetales, frutas, hortalizas, semillas, cereales. Requiere certificación SENASICA fitosanitaria.',
    legalBasis: 'Anexo 10 RGCE Sector 14',
    authority: 'SAT-AGACE + SENASICA',
    fractionPatterns: ['07', '08', '12'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '15',
    sectorialName: 'Productos lácteos',
    description: 'Leche, yogurt, mantequilla, quesos, lactosueros. Sector con precios estimados y trazabilidad obligatoria.',
    legalBasis: 'Anexo 10 RGCE Sector 15',
    authority: 'SAT-AGACE + SENASICA',
    fractionPatterns: ['0401', '0402', '0403', '0404', '0405', '0406'],
    estimatedDays: 30,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '16',
    sectorialName: 'Madera y productos derivados',
    description: 'Madera en bruto, aserrada, tableros, productos de carpintería. Requiere permiso SEMARNAT cuando aplique CITES.',
    legalBasis: 'Anexo 10 RGCE Sector 16',
    authority: 'SAT-AGACE + SEMARNAT',
    fractionPatterns: ['44'],
    estimatedDays: 45,
    validityMonths: 12,
  },
  {
    type: 'sectorial',
    sectorialCode: '17',
    sectorialName: 'Vehículos usados',
    description: 'Importación definitiva de vehículos automotores usados. Requiere cumplir NOM-194-SCFI y otras restricciones por año-modelo.',
    legalBasis: 'Anexo 10 RGCE Sector 17 · Decreto vehículos usados',
    authority: 'SAT-AGACE',
    fractionCodes: ['8703.99.99'],
    fractionPatterns: [],
    estimatedDays: 60,
    validityMonths: 12,
  },
];

export async function seedSATPadrones(prisma: PrismaClient): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const s of SEEDS) {
    const where = s.sectorialCode
      ? { type_sectorialCode: { type: s.type, sectorialCode: s.sectorialCode } }
      : null;

    const existing = s.sectorialCode
      ? await prisma.sATPadron.findFirst({ where: { type: s.type, sectorialCode: s.sectorialCode } })
      : await prisma.sATPadron.findFirst({ where: { type: s.type } });

    const data = {
      type: s.type,
      sectorialCode: s.sectorialCode ?? null,
      sectorialName: s.sectorialName,
      description: s.description,
      legalBasis: s.legalBasis,
      authority: s.authority,
      fractionCodes: s.fractionCodes ?? [],
      fractionPatterns: s.fractionPatterns ?? [],
      estimatedDays: s.estimatedDays ?? null,
      costMXN: s.costMXN ?? null,
      validityMonths: s.validityMonths ?? 12,
      requiresEFirma: true,
      renewalRequired: true,
      renewalAdvance: 30,
      active: true,
    };

    if (existing) {
      await prisma.sATPadron.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.sATPadron.create({ data });
      created++;
    }
    void where;
  }
  return { created, updated };
}
