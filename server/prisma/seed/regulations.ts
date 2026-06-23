/**
 * Seed: cuotas compensatorias activas + NOMs/RRNA/padrones más comunes.
 *
 * Fuentes referenciadas:
 *  - Decretos publicados en DOF (cuotas antidumping vigentes)
 *  - Anexo 2.4.1 LIGIE (NOMs)
 *  - Anexo 10 RGCE (padrones sectoriales)
 *
 * Las tasas y referencias de decreto reflejan información pública conocida;
 * idealmente se sincronizan con un agente que monitoree el DOF.
 */

import { PrismaClient } from '@prisma/client';

interface AntidumpingSeed {
  fractionCode: string;
  countryOfOrigin: string;
  rate: number;
  type?: 'definitiva' | 'provisional';
  decree?: string;
  publishDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  notes?: string;
}

interface RegulationSeed {
  fractionCode: string;
  matchType?: 'exact' | 'prefix';
  type: 'NOM' | 'RRNA' | 'padron_sectorial' | 'permiso_previo';
  authority: string;
  code: string;
  description: string;
  required?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// CUOTAS COMPENSATORIAS — vigentes (resumen no exhaustivo)
// ──────────────────────────────────────────────────────────────────────────

export const ANTIDUMPING_DUTIES: AntidumpingSeed[] = [
  // Acero / metalurgia (caps 72-73)
  { fractionCode: '73181599', countryOfOrigin: 'CN', rate: 25.50, decree: 'DOF-2024-03-15', publishDate: '2024-03-15', effectiveDate: '2024-03-16', notes: 'Tornillos de acero al carbono originarios de China' },
  { fractionCode: '73181599', countryOfOrigin: 'CN', rate: 25.50, decree: 'DOF-2024-03-15', notes: 'Tornillos de acero — extensión de cuota compensatoria' },
  { fractionCode: '72082701', countryOfOrigin: 'CN', rate: 26.69, decree: 'DOF-2023-09-22', notes: 'Lámina rolada en caliente' },
  { fractionCode: '72091601', countryOfOrigin: 'CN', rate: 65.99, decree: 'DOF-2023-09-22', notes: 'Lámina rolada en frío' },
  { fractionCode: '72104101', countryOfOrigin: 'CN', rate: 50.84, decree: 'DOF-2023-11-08', notes: 'Lámina galvanizada' },
  { fractionCode: '73041901', countryOfOrigin: 'CN', rate: 51.46, decree: 'DOF-2024-01-12', notes: 'Tubería de acero sin costura' },
  { fractionCode: '73066101', countryOfOrigin: 'CN', rate: 47.31, decree: 'DOF-2023-07-30', notes: 'Tubo de acero soldado, sección rectangular' },
  { fractionCode: '72283099', countryOfOrigin: 'CN', rate: 35.00, decree: 'DOF-2024-02-05', notes: 'Barras de acero aleado' },

  // Textiles (caps 50-63)
  { fractionCode: '52051201', countryOfOrigin: 'IN', rate: 21.50, decree: 'DOF-2023-04-18', notes: 'Hilados de algodón sin acondicionar — India' },
  { fractionCode: '54076101', countryOfOrigin: 'CN', rate: 18.20, decree: 'DOF-2023-12-01', notes: 'Tejidos de filamentos de poliéster' },
  { fractionCode: '60053501', countryOfOrigin: 'CN', rate: 22.40, decree: 'DOF-2024-04-10', notes: 'Tejidos de punto de fibras sintéticas' },
  { fractionCode: '61091001', countryOfOrigin: 'CN', rate: 110.00, decree: 'DOF-2023-06-14', notes: 'Camisetas de algodón — cuota antidumping vigente' },
  { fractionCode: '62034201', countryOfOrigin: 'CN', rate: 30.20, decree: 'DOF-2024-05-22', notes: 'Pantalones de algodón para hombre' },

  // Calzado (cap 64)
  { fractionCode: '64029999', countryOfOrigin: 'CN', rate: 232.00, decree: 'DOF-2023-08-09', notes: 'Calzado con suela y parte superior de caucho/plástico' },
  { fractionCode: '64041901', countryOfOrigin: 'CN', rate: 95.00, decree: 'DOF-2023-08-09', notes: 'Calzado deportivo — confección textil' },
  { fractionCode: '64031999', countryOfOrigin: 'CN', rate: 148.00, decree: 'DOF-2023-08-09', notes: 'Calzado con suela de caucho y parte superior de cuero' },

  // Papel y cartón
  { fractionCode: '48114199', countryOfOrigin: 'CN', rate: 22.86, decree: 'DOF-2024-02-28', notes: 'Papel y cartón autoadhesivos' },

  // Aluminio y manufacturas
  { fractionCode: '76121001', countryOfOrigin: 'CN', rate: 35.00, decree: 'DOF-2024-01-25', notes: 'Recipientes plegables de aluminio' },
  { fractionCode: '76101101', countryOfOrigin: 'CN', rate: 28.40, decree: 'DOF-2023-10-12', notes: 'Estructuras de aluminio para construcción' },

  // Eléctricos / electrónicos
  { fractionCode: '85044001', countryOfOrigin: 'CN', rate: 19.50, decree: 'DOF-2024-04-30', notes: 'Convertidores estáticos / cargadores' },
  { fractionCode: '85287201', countryOfOrigin: 'CN', rate: 12.40, type: 'provisional', decree: 'DOF-2025-01-08', notes: 'Receptores de televisión — provisional' },

  // Plástico
  { fractionCode: '39269099', countryOfOrigin: 'CN', rate: 16.20, decree: 'DOF-2023-11-22', notes: 'Manufacturas de plástico — productos varios' },
  { fractionCode: '42029299', countryOfOrigin: 'CN', rate: 24.30, decree: 'DOF-2024-06-04', notes: 'Bolsas y mochilas de material textil/plástico' },

  // Vidrio y cerámica
  { fractionCode: '70134101', countryOfOrigin: 'CN', rate: 32.00, decree: 'DOF-2023-05-19', notes: 'Cristalería de mesa de vidrio sódico-cálcico' },

  // Químicos
  { fractionCode: '29041001', countryOfOrigin: 'CN', rate: 27.50, decree: 'DOF-2024-07-15', notes: 'Ácido sulfónico' },
];

// ──────────────────────────────────────────────────────────────────────────
// REGULACIONES — NOMs / RRNA / Padrones sectoriales
// ──────────────────────────────────────────────────────────────────────────

export const FRACTION_REGULATIONS: RegulationSeed[] = [
  // ── NOMs textiles (caps 50-63) ──
  { fractionCode: '50', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '51', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '52', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '53', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '54', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '55', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '56', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '57', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '58', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '59', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '60', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '61', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '62', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },
  { fractionCode: '63', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-004-SE-2006', description: 'Información comercial — Etiquetado de productos textiles, prendas de vestir y ropa de casa' },

  // ── NOM calzado (cap 64) ──
  { fractionCode: '64', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-020-SCFI-1997', description: 'Información comercial — Etiquetado de cuero, piel y materiales sintéticos del calzado' },

  // ── NOMs electrónicos (caps 84-85) ──
  { fractionCode: '8517', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-024-SCFI-2013', description: 'Información comercial — Información proporcionada por el fabricante de productos electrónicos eléctricos y electrodomésticos' },
  { fractionCode: '8528', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-024-SCFI-2013', description: 'Información comercial — Información proporcionada por el fabricante de productos electrónicos eléctricos y electrodomésticos' },
  { fractionCode: '8471', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-024-SCFI-2013', description: 'Información comercial — Información proporcionada por el fabricante de productos electrónicos eléctricos y electrodomésticos' },
  { fractionCode: '8504', matchType: 'prefix', type: 'NOM', authority: 'SE', code: 'NOM-001-SCFI-2018', description: 'Aparatos electrónicos — Requisitos de seguridad y métodos de prueba' },

  // ── NOM bebidas (cap 22) ──
  { fractionCode: '2204', matchType: 'prefix', type: 'NOM', authority: 'SSA', code: 'NOM-142-SSA1-SCFI-2014', description: 'Bebidas alcohólicas — Especificaciones sanitarias. Etiquetado sanitario y comercial' },
  { fractionCode: '2208', matchType: 'prefix', type: 'NOM', authority: 'SSA', code: 'NOM-142-SSA1-SCFI-2014', description: 'Bebidas alcohólicas — Especificaciones sanitarias. Etiquetado sanitario y comercial' },

  // ── NOM alimentos preenvasados (caps 19, 21) ──
  { fractionCode: '19', matchType: 'prefix', type: 'NOM', authority: 'SSA', code: 'NOM-051-SCFI-SSA1-2010', description: 'Especificaciones generales de etiquetado para alimentos y bebidas no alcohólicas preenvasados' },
  { fractionCode: '21', matchType: 'prefix', type: 'NOM', authority: 'SSA', code: 'NOM-051-SCFI-SSA1-2010', description: 'Especificaciones generales de etiquetado para alimentos y bebidas no alcohólicas preenvasados' },

  // ── COFEPRIS — productos farmacéuticos y cosméticos ──
  { fractionCode: '30', matchType: 'prefix', type: 'RRNA', authority: 'COFEPRIS', code: 'Aviso sanitario', description: 'Aviso sanitario de importación COFEPRIS para productos farmacéuticos' },
  { fractionCode: '3303', matchType: 'prefix', type: 'NOM', authority: 'SSA', code: 'NOM-189-SSA1-SCFI-2018', description: 'Productos y servicios — Etiquetado y envasado de perfumes y productos de aseo' },
  { fractionCode: '3304', matchType: 'prefix', type: 'NOM', authority: 'SSA', code: 'NOM-189-SSA1-SCFI-2018', description: 'Etiquetado de productos cosméticos preenvasados' },

  // ── SEMARNAT ──
  { fractionCode: '2710', matchType: 'prefix', type: 'RRNA', authority: 'SEMARNAT', code: 'Autorización SEMARNAT', description: 'Autorización para importación de combustibles y residuos peligrosos' },

  // ── Padrones sectoriales (Anexo 10 RGCE) ──
  { fractionCode: '72', matchType: 'prefix', type: 'padron_sectorial', authority: 'SAT', code: 'Sector 11 — Hierro y acero', description: 'Inscripción en el Padrón de Importadores de Sectores Específicos — Sector 11 (hierro y acero)' },
  { fractionCode: '73', matchType: 'prefix', type: 'padron_sectorial', authority: 'SAT', code: 'Sector 11 — Hierro y acero', description: 'Inscripción en el Padrón de Importadores de Sectores Específicos — Sector 11 (hierro y acero)' },
  { fractionCode: '64', matchType: 'prefix', type: 'padron_sectorial', authority: 'SAT', code: 'Sector 6 — Calzado', description: 'Inscripción en el Padrón de Importadores de Sectores Específicos — Sector 6 (calzado)' },
  { fractionCode: '24', matchType: 'prefix', type: 'padron_sectorial', authority: 'SAT', code: 'Sector 4 — Tabaco labrado', description: 'Inscripción en el Padrón de Importadores de Sectores Específicos — Sector 4 (tabaco)' },
  { fractionCode: '2207', matchType: 'prefix', type: 'padron_sectorial', authority: 'SAT', code: 'Sector 1 — Alcoholes', description: 'Padrón de Importadores de Sectores Específicos — Sector 1 (alcohol etílico)' },
  { fractionCode: '2208', matchType: 'prefix', type: 'padron_sectorial', authority: 'SAT', code: 'Sector 1 — Alcoholes y bebidas alcohólicas', description: 'Padrón de Importadores de Sectores Específicos — Sector 1' },
  { fractionCode: '39', matchType: 'prefix', type: 'padron_sectorial', authority: 'SAT', code: 'Sector 13 — Plástico', description: 'Padrón de Importadores de Sectores Específicos — Sector 13 (plástico)' },
];

// ──────────────────────────────────────────────────────────────────────────
// Seeder
// ──────────────────────────────────────────────────────────────────────────

export async function seedRegulations(prisma: PrismaClient): Promise<{ antidumping: number; regulations: number }> {
  // El seed de cuotas compensatorias se delegó a `seedAntidumpingUPCI` (resoluciones UPCI completas).
  // Aquí solo contamos las existentes para el reporte.
  const adCount = await prisma.antidumpingDuty.count({ where: { status: 'vigente' } });
  void ANTIDUMPING_DUTIES; // silenciar lint legacy

  // Para FractionRegulation no hay unique compuesto — borramos seed-managed y recreamos
  await prisma.fractionRegulation.deleteMany({});
  let regCount = 0;
  for (const reg of FRACTION_REGULATIONS) {
    await prisma.fractionRegulation.create({
      data: {
        fractionCode: reg.fractionCode,
        matchType: reg.matchType ?? 'exact',
        type: reg.type,
        authority: reg.authority,
        code: reg.code,
        description: reg.description,
        required: reg.required ?? true,
      },
    });
    regCount++;
  }

  return { antidumping: adCount, regulations: regCount };
}
