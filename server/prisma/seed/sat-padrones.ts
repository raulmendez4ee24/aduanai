/**
 * Seed de Padrones SAT — Anexo 10 RGCE.
 *
 * Padrón General de Importadores (Art. 59 LA fracción IV) + los 16 Padrones
 * del Padrón de Importadores de Sectores Específicos del Anexo 10, Apartado A.
 * FUENTE OFICIAL: Anexo 10 de las RGCE, DOF 19 de enero de 2024.
 * Cada padrón define qué fracciones requieren la inscripción mediante patrones
 * (prefix matching, aproximación por capítulo — cobertura fina en DEFERRED_WORK).
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

  // ── Sectoriales — Padrón de Importadores de Sectores Específicos ──
  // FUENTE OFICIAL: Anexo 10 de las RGCE, Apartado A, publicado en el DOF el
  // 19 de enero de 2024 (RGCE 2024). Numeración y nombres TEXTUALES del Anexo.
  // Reemplaza el mapeo anterior, que tenía números corridos y 7 "sectores"
  // fabricados (animales, farmacéuticos, vegetales, lácteos, madera, vehículos
  // usados, bebidas alcohólicas) que NO existen en el Apartado A.
  // NOTA: fractionPatterns es una aproximación por capítulo para la UI; la
  // cobertura completa por fracción del Anexo 10 está pendiente (ver DEFERRED_WORK).
  {
    type: 'sectorial', sectorialCode: '1', sectorialName: 'Productos químicos',
    description: 'Productos químicos en general — sustancias químicas controladas y sensibles para salud o seguridad.',
    legalBasis: 'Anexo 10 RGCE Sector 1 (DOF 19-ene-2024)', authority: 'SAT-AGACE',
    fractionPatterns: ['28', '29', '38'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '2', sectorialName: 'Radiactivos y nucleares',
    description: 'Materiales radiactivos, isótopos y elementos de la industria nuclear. Requiere autorización CNSNS.',
    legalBasis: 'Anexo 10 RGCE Sector 2 (DOF 19-ene-2024)', authority: 'SAT-AGACE + CNSNS',
    fractionPatterns: ['2844', '2845'], estimatedDays: 60, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '3', sectorialName: 'Precursores químicos y químicos esenciales',
    description: 'Precursores controlados por la Convención de Viena 1988. Requiere autorización COFEPRIS.',
    legalBasis: 'Anexo 10 RGCE Sector 3 (DOF 19-ene-2024) · Ley General de Salud', authority: 'SAT-AGACE + COFEPRIS',
    fractionPatterns: ['2914.1', '2932.91', '2939.4'], estimatedDays: 45, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '4', sectorialName: 'Armas de fuego y sus partes, refacciones, accesorios y municiones',
    description: 'Armas de fuego, partes, refacciones, accesorios y municiones. Requiere permiso SEDENA.',
    legalBasis: 'Anexo 10 RGCE Sector 4 (DOF 19-ene-2024) · Ley Federal de Armas de Fuego', authority: 'SAT-AGACE + SEDENA',
    fractionPatterns: ['93'], estimatedDays: 90, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '5', sectorialName: 'Explosivos y material relacionado con explosivos',
    description: 'Explosivos y material relacionado. Requiere permiso SEDENA.',
    legalBasis: 'Anexo 10 RGCE Sector 5 (DOF 19-ene-2024)', authority: 'SAT-AGACE + SEDENA',
    fractionPatterns: ['3601', '3602', '3603'], estimatedDays: 90, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '6', sectorialName: 'Sustancias químicas, materiales para usos pirotécnicos y artificios relacionados con el empleo de explosivos',
    description: 'Artículos de pirotecnia y artificios relacionados con explosivos. Requiere permiso SEDENA.',
    legalBasis: 'Anexo 10 RGCE Sector 6 (DOF 19-ene-2024)', authority: 'SAT-AGACE + SEDENA',
    fractionPatterns: ['3604'], estimatedDays: 90, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '7', sectorialName: 'Las demás armas y accesorios. Armas blancas y accesorios. Explosores',
    description: 'Las demás armas y accesorios; armas blancas y accesorios; explosores. Requiere permiso SEDENA.',
    legalBasis: 'Anexo 10 RGCE Sector 7 (DOF 19-ene-2024)', authority: 'SAT-AGACE + SEDENA',
    fractionPatterns: ['9307'], estimatedDays: 90, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '8', sectorialName: 'Máquinas, aparatos, dispositivos y artefactos, relacionados con armas y otros',
    description: 'Máquinas, aparatos, dispositivos y artefactos relacionados con armas y otros.',
    legalBasis: 'Anexo 10 RGCE Sector 8 (DOF 19-ene-2024)', authority: 'SAT-AGACE + SEDENA',
    fractionPatterns: [], estimatedDays: 90, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '9', sectorialName: 'Cigarros',
    description: 'Cigarros y tabacos labrados. Sujetos a IEPS y control sanitario.',
    legalBasis: 'Anexo 10 RGCE Sector 9 (DOF 19-ene-2024) · LIEPS', authority: 'SAT-AGACE',
    fractionPatterns: ['24'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '10', sectorialName: 'Calzado',
    description: 'Calzado, polainas y artículos análogos. Sector con precio estimado SAT y antidumping vs. China.',
    legalBasis: 'Anexo 10 RGCE Sector 10 (DOF 19-ene-2024)', authority: 'SAT-AGACE',
    fractionPatterns: ['64'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '11', sectorialName: 'Textil y confección',
    description: 'Hilados, tejidos, prendas de vestir y accesorios textiles. Sector altamente fiscalizado por subvaluación y origen falso.',
    legalBasis: 'Anexo 10 RGCE Sector 11 (DOF 19-ene-2024)', authority: 'SAT-AGACE',
    fractionPatterns: ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '12', sectorialName: 'Alcohol etílico',
    description: 'Alcohol etílico (partida 2207). NOTA: los licores terminados (2208) no están confirmados en este sector — pendiente de verificar (ver DEFERRED_WORK).',
    legalBasis: 'Anexo 10 RGCE Sector 12 (DOF 19-ene-2024)', authority: 'SAT-AGACE',
    fractionPatterns: ['2207'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '13', sectorialName: 'Hidrocarburos y combustibles',
    description: 'Petróleo crudo, gasolinas, diésel, turbosina, gas natural, gas LP y derivados. Requiere permiso CRE.',
    legalBasis: 'Anexo 10 RGCE Sector 13 (DOF 19-ene-2024) · Ley de Hidrocarburos', authority: 'SAT-AGACE + CRE',
    fractionPatterns: ['2709', '2710', '2711'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '14', sectorialName: 'Siderúrgico',
    description: 'Sector siderúrgico — fundición, hierro y acero (cap. 72). Altamente sancionable por antidumping. Aproximación por capítulo; split fino 14/15 pendiente (ver DEFERRED_WORK).',
    legalBasis: 'Anexo 10 RGCE Sector 14 (DOF 19-ene-2024)', authority: 'SAT-AGACE',
    fractionPatterns: ['72'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '15', sectorialName: 'Productos siderúrgicos',
    description: 'Manufacturas de hierro o acero (cap. 73). Aproximación por capítulo; split fino 14/15 pendiente (ver DEFERRED_WORK).',
    legalBasis: 'Anexo 10 RGCE Sector 15 (DOF 19-ene-2024)', authority: 'SAT-AGACE',
    fractionPatterns: ['73'], estimatedDays: 30, validityMonths: 12,
  },
  {
    type: 'sectorial', sectorialCode: '16', sectorialName: 'Automotriz',
    description: 'Sector automotriz. Aproximación por capítulo 87.',
    legalBasis: 'Anexo 10 RGCE Sector 16 (DOF 19-ene-2024)', authority: 'SAT-AGACE',
    fractionPatterns: ['87'], estimatedDays: 30, validityMonths: 12,
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
