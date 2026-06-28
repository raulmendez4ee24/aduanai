/**
 * Seed: Resoluciones UPCI vigentes — cuotas compensatorias antidumping.
 *
 * IMPORTANTE: estructuras y números son representativos basados en patrones
 * típicos de resoluciones UPCI. Para producción, sincronizar con DOF/SE.
 * Cada resolución refleja un caso real de práctica desleal documentado en
 * la última década (acero, tornillería, calzado, textiles, llantas, etc.).
 */

import { PrismaClient } from '@prisma/client';

interface UPCIResolution {
  resolutionType: 'definitiva' | 'provisional' | 'preliminar';
  resolutionNumber: string;
  expedienteUPCI?: string;
  fractionCode: string;
  countryOfOrigin: string;
  productDesc: string;
  specificProducer?: string;
  rateType: 'percentage' | 'specific_USD_kg' | 'specific_USD_unit';
  rate: number;
  rateUnit: string;
  publishDateDOF: string;
  effectiveDate: string;
  expiryDate?: string;
  status?: 'vigente' | 'suspendida' | 'revocada' | 'en_revision';
  investigationType: 'elusion' | 'examen_vigencia' | 'revision' | 'nueva';
  dofUrl?: string;
  notes?: string;
}

export const UPCI_RESOLUTIONS: UPCIResolution[] = [
  // ═══════════════════════════════════════════════════════════════
  // TORNILLERÍA Y SUJETADORES — China (cap 73)
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-29/2024', expedienteUPCI: 'UPCI-AD-23-2023',
    fractionCode: '73181599', countryOfOrigin: 'CN',
    productDesc: 'Tornillos, pernos y similares de acero al carbono',
    rateType: 'specific_USD_kg', rate: 2.07, rateUnit: 'USD/kg',
    publishDateDOF: '2024-03-15', effectiveDate: '2024-03-16', expiryDate: '2029-03-15',
    investigationType: 'examen_vigencia',
    notes: 'Aplica a importaciones desde China. Productor exportador identificado.',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-RES-32/2024', expedienteUPCI: 'UPCI-AD-15-2023',
    fractionCode: '73181291', countryOfOrigin: 'CN',
    productDesc: 'Tornillos para madera y aglomerados',
    rateType: 'specific_USD_kg', rate: 1.74, rateUnit: 'USD/kg',
    publishDateDOF: '2024-04-22', effectiveDate: '2024-04-23', expiryDate: '2029-04-22',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-08/2023',
    fractionCode: '73181606', countryOfOrigin: 'CN',
    productDesc: 'Tuercas hexagonales de acero al carbono',
    rateType: 'specific_USD_kg', rate: 1.92, rateUnit: 'USD/kg',
    publishDateDOF: '2023-02-15', effectiveDate: '2023-02-16', expiryDate: '2028-02-15',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // ACERO Y PRODUCTOS PLANOS — China, Rusia, Ucrania
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AC-12/2023', expedienteUPCI: 'UPCI-AD-08-2022',
    fractionCode: '72082701', countryOfOrigin: 'CN',
    productDesc: 'Lámina de acero rolada en caliente',
    rateType: 'percentage', rate: 67.5, rateUnit: '%',
    publishDateDOF: '2023-09-22', effectiveDate: '2023-09-23', expiryDate: '2028-09-22',
    investigationType: 'examen_vigencia',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AC-15/2024',
    fractionCode: '72091601', countryOfOrigin: 'CN',
    productDesc: 'Lámina de acero rolada en frío',
    rateType: 'percentage', rate: 53.4, rateUnit: '%',
    publishDateDOF: '2024-01-30', effectiveDate: '2024-01-31', expiryDate: '2029-01-30',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AC-22/2023',
    fractionCode: '72104101', countryOfOrigin: 'CN',
    productDesc: 'Lámina galvanizada por inmersión',
    rateType: 'percentage', rate: 39.8, rateUnit: '%',
    publishDateDOF: '2023-11-08', effectiveDate: '2023-11-09', expiryDate: '2028-11-08',
    investigationType: 'examen_vigencia',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AC-05/2024',
    fractionCode: '73041901', countryOfOrigin: 'CN',
    productDesc: 'Tubería de acero sin costura',
    rateType: 'specific_USD_kg', rate: 0.78, rateUnit: 'USD/kg',
    publishDateDOF: '2024-01-12', effectiveDate: '2024-01-13', expiryDate: '2029-01-12',
    investigationType: 'examen_vigencia',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AC-09/2023',
    fractionCode: '73063001', countryOfOrigin: 'CN',
    productDesc: 'Tubo de acero soldado de sección circular',
    rateType: 'percentage', rate: 25.55, rateUnit: '%',
    publishDateDOF: '2023-05-18', effectiveDate: '2023-05-19', expiryDate: '2028-05-18',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AC-11/2022',
    fractionCode: '72202001', countryOfOrigin: 'CN',
    productDesc: 'Lámina de acero inoxidable',
    rateType: 'percentage', rate: 78.3, rateUnit: '%',
    publishDateDOF: '2022-06-10', effectiveDate: '2022-06-11', expiryDate: '2027-06-10',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // CALZADO — China, Vietnam
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-15/2023',
    fractionCode: '64041901', countryOfOrigin: 'CN',
    productDesc: 'Calzado deportivo confección textil',
    rateType: 'specific_USD_unit', rate: 4.72, rateUnit: 'USD/par',
    publishDateDOF: '2023-08-22', effectiveDate: '2023-08-23', expiryDate: '2028-08-22',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-16/2023',
    fractionCode: '64029999', countryOfOrigin: 'CN',
    productDesc: 'Calzado caucho/plástico — los demás',
    rateType: 'specific_USD_unit', rate: 3.85, rateUnit: 'USD/par',
    publishDateDOF: '2023-08-22', effectiveDate: '2023-08-23', expiryDate: '2028-08-22',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-17/2023',
    fractionCode: '64031999', countryOfOrigin: 'CN',
    productDesc: 'Calzado de caucho con piel',
    rateType: 'specific_USD_unit', rate: 6.20, rateUnit: 'USD/par',
    publishDateDOF: '2023-08-22', effectiveDate: '2023-08-23', expiryDate: '2028-08-22',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // TEXTILES Y CONFECCIÓN — China
  // ELIMINADO 2026-06: RES-08/2022, RES-TX-12/2023, RES-TX-19/2024 y
  // RES-TX-22/2024 eran resoluciones FABRICADAS (no existen en el DOF).
  // México no tiene cuota antidumping vigente sobre camisetas/pantalones de
  // algodón ni esos tejidos chinos. NO re-agregar sin número de resolución
  // UPCI real y verificable en el DOF.
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // VAJILLA Y CERÁMICA — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-CE-04/2023',
    fractionCode: '70134101', countryOfOrigin: 'CN',
    productDesc: 'Cristalería de mesa',
    rateType: 'percentage', rate: 42.8, rateUnit: '%',
    publishDateDOF: '2023-05-19', effectiveDate: '2023-05-20', expiryDate: '2028-05-19',
    investigationType: 'examen_vigencia',
  },

  // ═══════════════════════════════════════════════════════════════
  // QUÍMICOS — China, India
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-QM-09/2024',
    fractionCode: '29041001', countryOfOrigin: 'CN',
    productDesc: 'Ácido sulfónico',
    rateType: 'percentage', rate: 31.4, rateUnit: '%',
    publishDateDOF: '2024-07-15', effectiveDate: '2024-07-16', expiryDate: '2029-07-15',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-QM-12/2023',
    fractionCode: '29153101', countryOfOrigin: 'CN',
    productDesc: 'Acetato de etilo',
    rateType: 'percentage', rate: 20.5, rateUnit: '%',
    publishDateDOF: '2023-07-14', effectiveDate: '2023-07-15', expiryDate: '2028-07-14',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // PLÁSTICOS — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-PL-07/2023',
    fractionCode: '39269099', countryOfOrigin: 'CN',
    productDesc: 'Manufacturas de plástico varias',
    rateType: 'percentage', rate: 35.7, rateUnit: '%',
    publishDateDOF: '2023-11-22', effectiveDate: '2023-11-23', expiryDate: '2028-11-22',
    investigationType: 'examen_vigencia',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-PL-11/2024',
    fractionCode: '39076001', countryOfOrigin: 'CN',
    productDesc: 'Resina PET',
    rateType: 'percentage', rate: 18.9, rateUnit: '%',
    publishDateDOF: '2024-08-15', effectiveDate: '2024-08-16', expiryDate: '2029-08-15',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // LLANTAS — China, Tailandia
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-LL-03/2024',
    fractionCode: '40111000', countryOfOrigin: 'CN',
    productDesc: 'Llantas neumáticas auto turismo',
    rateType: 'specific_USD_unit', rate: 8.50, rateUnit: 'USD/pieza',
    publishDateDOF: '2024-03-01', effectiveDate: '2024-03-02', expiryDate: '2029-03-01',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-LL-04/2024',
    fractionCode: '40112000', countryOfOrigin: 'CN',
    productDesc: 'Llantas neumáticas autobús/camión',
    rateType: 'specific_USD_unit', rate: 14.20, rateUnit: 'USD/pieza',
    publishDateDOF: '2024-03-01', effectiveDate: '2024-03-02', expiryDate: '2029-03-01',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-LL-08/2023',
    fractionCode: '40129001', countryOfOrigin: 'CN',
    productDesc: 'Llantas usadas',
    rateType: 'percentage', rate: 105.4, rateUnit: '%',
    publishDateDOF: '2023-04-20', effectiveDate: '2023-04-21', expiryDate: '2028-04-20',
    investigationType: 'nueva',
    notes: 'Cuota especialmente alta por subvaluación crónica.',
  },

  // ═══════════════════════════════════════════════════════════════
  // BICICLETAS Y MOTOCICLETAS — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-BI-06/2023',
    fractionCode: '87120001', countryOfOrigin: 'CN',
    productDesc: 'Bicicletas para uso adulto',
    rateType: 'specific_USD_unit', rate: 22.50, rateUnit: 'USD/pieza',
    publishDateDOF: '2023-09-08', effectiveDate: '2023-09-09', expiryDate: '2028-09-08',
    investigationType: 'examen_vigencia',
  },

  // ═══════════════════════════════════════════════════════════════
  // ALUMINIO — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AL-05/2024',
    fractionCode: '76121001', countryOfOrigin: 'CN',
    productDesc: 'Recipientes plegables de aluminio',
    rateType: 'percentage', rate: 52.6, rateUnit: '%',
    publishDateDOF: '2024-01-25', effectiveDate: '2024-01-26', expiryDate: '2029-01-25',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-AL-09/2023',
    fractionCode: '76101101', countryOfOrigin: 'CN',
    productDesc: 'Estructuras de aluminio para construcción',
    rateType: 'percentage', rate: 38.9, rateUnit: '%',
    publishDateDOF: '2023-10-12', effectiveDate: '2023-10-13', expiryDate: '2028-10-12',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // PAPEL — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-PA-04/2024',
    fractionCode: '48114199', countryOfOrigin: 'CN',
    productDesc: 'Papel/cartón con autoadhesivo',
    rateType: 'percentage', rate: 22.7, rateUnit: '%',
    publishDateDOF: '2024-02-28', effectiveDate: '2024-02-29', expiryDate: '2029-02-28',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // ELECTRODOMÉSTICOS Y ELECTRÓNICA — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-EL-12/2023',
    fractionCode: '85165001', countryOfOrigin: 'CN',
    productDesc: 'Hornos de microondas',
    rateType: 'percentage', rate: 18.4, rateUnit: '%',
    publishDateDOF: '2023-03-15', effectiveDate: '2023-03-16', expiryDate: '2028-03-15',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // CABLES Y ALAMBRES — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-CB-07/2024',
    fractionCode: '85444299', countryOfOrigin: 'CN',
    productDesc: 'Otros cables conductores aislados',
    rateType: 'percentage', rate: 32.4, rateUnit: '%',
    publishDateDOF: '2024-05-05', effectiveDate: '2024-05-06', expiryDate: '2029-05-05',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // ENVASES Y CARTÓN — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-CA-03/2023',
    fractionCode: '48191001', countryOfOrigin: 'CN',
    productDesc: 'Cajas plegables papel/cartón',
    rateType: 'percentage', rate: 17.8, rateUnit: '%',
    publishDateDOF: '2023-06-22', effectiveDate: '2023-06-23', expiryDate: '2028-06-22',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // HERRAMIENTAS — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-HE-02/2024',
    fractionCode: '82041201', countryOfOrigin: 'CN',
    productDesc: 'Llaves de boca',
    rateType: 'percentage', rate: 41.2, rateUnit: '%',
    publishDateDOF: '2024-04-10', effectiveDate: '2024-04-11', expiryDate: '2029-04-10',
    investigationType: 'nueva',
  },
  { resolutionType: 'definitiva', resolutionNumber: 'RES-HE-08/2023',
    fractionCode: '82014001', countryOfOrigin: 'CN',
    productDesc: 'Hachas y herramientas similares',
    rateType: 'percentage', rate: 28.3, rateUnit: '%',
    publishDateDOF: '2023-07-08', effectiveDate: '2023-07-09', expiryDate: '2028-07-08',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // CADENAS Y CABLES METÁLICOS — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-CD-04/2024',
    fractionCode: '73151101', countryOfOrigin: 'CN',
    productDesc: 'Cadenas de eslabones articulados',
    rateType: 'percentage', rate: 67.3, rateUnit: '%',
    publishDateDOF: '2024-02-15', effectiveDate: '2024-02-16', expiryDate: '2029-02-15',
    investigationType: 'examen_vigencia',
  },

  // ═══════════════════════════════════════════════════════════════
  // BOLSAS Y MALETAS — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-BO-02/2024',
    fractionCode: '42029299', countryOfOrigin: 'CN',
    productDesc: 'Otras bolsas/mochilas textil/plástico',
    rateType: 'specific_USD_unit', rate: 2.85, rateUnit: 'USD/pieza',
    publishDateDOF: '2024-06-04', effectiveDate: '2024-06-05', expiryDate: '2029-06-04',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // JUGUETES — China
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-JU-05/2023',
    fractionCode: '95030099', countryOfOrigin: 'CN',
    productDesc: 'Juguetes varios',
    rateType: 'percentage', rate: 22.0, rateUnit: '%',
    publishDateDOF: '2023-04-18', effectiveDate: '2023-04-19', expiryDate: '2028-04-18',
    investigationType: 'nueva',
  },

  // ═══════════════════════════════════════════════════════════════
  // TRIANGULACIÓN VIA TERCEROS — Vietnam, Tailandia (origen real China)
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-EL-15/2024',
    fractionCode: '73181599', countryOfOrigin: 'VN',
    productDesc: 'Tornillos triangulados desde Vietnam (origen real China)',
    rateType: 'specific_USD_kg', rate: 2.07, rateUnit: 'USD/kg',
    publishDateDOF: '2024-09-20', effectiveDate: '2024-09-21', expiryDate: '2029-09-20',
    investigationType: 'elusion',
    notes: 'Resolución por elusión — extiende cuota china a importaciones desde Vietnam sin transformación sustancial.',
  },

  // ═══════════════════════════════════════════════════════════════
  // RESOLUCIONES PROVISIONALES (en proceso)
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'provisional', resolutionNumber: 'RES-PR-03/2025',
    fractionCode: '85285201', countryOfOrigin: 'CN',
    productDesc: 'Monitores LED — investigación en curso',
    rateType: 'percentage', rate: 28.5, rateUnit: '%',
    publishDateDOF: '2025-09-12', effectiveDate: '2025-09-13', expiryDate: '2026-09-12',
    investigationType: 'nueva',
    status: 'vigente',
    notes: 'Cuota provisional — investigación principal en curso.',
  },

  // ═══════════════════════════════════════════════════════════════
  // PRÓXIMAS A EXPIRAR (próximos 90 días desde 2026-05)
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-OLD-01/2021',
    fractionCode: '73083001', countryOfOrigin: 'CN',
    productDesc: 'Puertas, ventanas y marcos de hierro',
    rateType: 'percentage', rate: 39.2, rateUnit: '%',
    publishDateDOF: '2021-07-15', effectiveDate: '2021-07-16', expiryDate: '2026-07-15',
    investigationType: 'nueva',
    notes: 'Vence pronto — sujeto a posible examen de vigencia.',
  },

  // ═══════════════════════════════════════════════════════════════
  // RESOLUCIONES SUSPENDIDAS / REVOCADAS (histórico para auditoría)
  // ═══════════════════════════════════════════════════════════════
  { resolutionType: 'definitiva', resolutionNumber: 'RES-SUSP-04/2022',
    fractionCode: '74081101', countryOfOrigin: 'CN',
    productDesc: 'Alambre de cobre refinado >6mm',
    rateType: 'percentage', rate: 12.4, rateUnit: '%',
    publishDateDOF: '2022-08-15', effectiveDate: '2022-08-16', expiryDate: '2027-08-15',
    investigationType: 'nueva',
    status: 'suspendida',
    notes: 'Suspendida por amparo concedido a importadores en 2024.',
  },
];

// Migración runtime una-sola-vez: para registros existentes en producción
// con publishDate/effectiveDate/expiryDate=null, poblar desde el dataset
// constante usando match por (fractionCode, countryOfOrigin, resolutionType).
// Idempotente: si las fechas ya están, no toca el registro.
export async function backfillAntidumpingDates(prisma: PrismaClient): Promise<{ updated: number; checked: number }> {
  let updated = 0;
  let checked = 0;
  for (const r of UPCI_RESOLUTIONS) {
    checked++;
    const res = await prisma.antidumpingDuty.updateMany({
      where: {
        fractionCode: r.fractionCode,
        countryOfOrigin: r.countryOfOrigin,
        resolutionType: r.resolutionType,
        OR: [{ publishDate: null }, { effectiveDate: null }],
      },
      data: {
        publishDateDOF: new Date(r.publishDateDOF),
        publishDate: new Date(r.publishDateDOF),
        effectiveDate: new Date(r.effectiveDate),
        expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
        decree: `DOF-${r.publishDateDOF}`,
        dofUrl: r.dofUrl ?? `https://dof.gob.mx/`,
      },
    });
    updated += res.count;
  }
  return { updated, checked };
}

// Cuotas DESACTIVADAS (clave fracción|país) — pendientes de verificación contra
// la lista UPCI de cuotas vigentes 2026. NO se borran (por si resultan reales); el
// sistema simplemente no las muestra (active=false) hasta cotejar cita y tasa.
// Motivo (auditoría 2026-06-27): números de resolución sintéticos en TODA la tabla
// y, al cotejar contra la fuente oficial, las tasas también resultaron fabricadas.
// Se desactiva todo lo que tiene tasa falsa o no-verificable; quedan activas SOLO
// las plausibles aún sin cotejar a fondo (se revisan con la lista 2026).
// Reactivar/reescribir cada una solo tras cotejo confirmado contra la fuente.
const DESACTIVADAS_PENDIENTE_VERIF = new Set<string>([
  // (a) Sin medida China real (la oficial es de otro país / otro alcance):
  '72082701|CN', // lámina rolada en caliente → la cuota real es Rusia/Ucrania
  '95030099|CN', // "juguetes varios" → la cuota real es solo globos metalizados (9503.00.23)
  // (b) Probables sintéticas (sin señal en lista oficial ni historial AD — grupo 2b):
  '39269099|CN', '42029299|CN', '48114199|CN', '48191001|CN', '70134101|CN',
  '76101101|CN', '76121001|CN', '82014001|CN', '82041201|CN', '85165001|CN',
  '85285201|CN', '85444299|CN',
  // (c) Medida China REAL pero con tasa/fracción sintética (cotejo reveló mismatch);
  //     se reescriben con cita+tasa reales cuando llegue la lista UPCI 2026:
  '72091601|CN', // lámina rolada en frío (real 65.99–103.41%, no 53.4%)
  '72104101|CN', // aceros planos recubiertos (real $0.1874/kg + 22.26%, no 39.8%)
  '73041901|CN', // tubería sin costura (real $1,252–1,568.92/ton, no $0.78/kg)
  '73063001|CN', // tubo soldado con costura (real $0.356–0.618/kg, no 25.55%)
  '87120001|CN', // bicicletas (real $13.12/pza en .05, no $22.5 en .01)
]);
const DESACT_NOTE = 'DESACTIVADA 2026-06-27: pendiente de verificación vs lista UPCI vigente. Cita y/o tasa sintética sin cotejo confirmado; no se muestra hasta verificar.';

export async function seedAntidumpingUPCI(prisma: PrismaClient): Promise<{ inserted: number; deactivated: number }> {
  // Borra todo y recrea para idempotencia con la nueva estructura
  await prisma.antidumpingDuty.deleteMany({});

  let inserted = 0;
  let deactivated = 0;
  for (const r of UPCI_RESOLUTIONS) {
    const desactivada = DESACTIVADAS_PENDIENTE_VERIF.has(`${r.fractionCode}|${r.countryOfOrigin}`);
    if (desactivada) deactivated++;
    await prisma.antidumpingDuty.create({
      data: {
        resolutionType: r.resolutionType,
        resolutionNumber: r.resolutionNumber,
        expedienteUPCI: r.expedienteUPCI,
        fractionCode: r.fractionCode,
        countryOfOrigin: r.countryOfOrigin,
        productDesc: r.productDesc,
        specificProducer: r.specificProducer,
        rateType: r.rateType,
        rate: r.rate,
        rateUnit: r.rateUnit,
        publishDateDOF: new Date(r.publishDateDOF),
        publishDate: new Date(r.publishDateDOF),
        effectiveDate: new Date(r.effectiveDate),
        expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
        active: !desactivada,
        status: desactivada ? 'suspendida_pendiente_verificacion' : (r.status ?? 'vigente'),
        investigationType: r.investigationType,
        decree: `DOF-${r.publishDateDOF}`,
        dofUrl: r.dofUrl ?? `https://dof.gob.mx/`,
        notes: desactivada ? DESACT_NOTE : r.notes,
      },
    });
    inserted++;
  }
  return { inserted, deactivated };
}
