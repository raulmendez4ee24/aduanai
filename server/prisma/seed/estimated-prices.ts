/**
 * Seed: Precios estimados del SAT (Art. 84-A Ley Aduanera) y precios
 * de referencia internos para fracciones críticas con alta incidencia
 * de subvaluación.
 *
 * Cobertura: ~200 fracciones en los capítulos más sensibles (tornillería,
 * textiles, calzado, electrónicos, acero, llantas, juguetes, plásticos,
 * cuero, vidrio, químicos, partes automotrices, etc.).
 *
 * Fuentes:
 *   - Resoluciones DOF que modifican el Anexo 2 RGCE (precios estimados)
 *   - Estudios de mercado SAT/AGA
 *   - Estimaciones internas (marcadas con source: 'internal') basadas en
 *     precios típicos de mercado verificables vía facturas comparables.
 *
 * NOTA: las cifras DOF son aproximaciones documentadas; idealmente se
 * sincronizan con el monitor DOF en producción. Las cifras `internal`
 * deben usarse como guía y verificar la última publicación oficial.
 */

import { PrismaClient } from '@prisma/client';

interface EstimatedPriceSeed {
  fractionCode: string;
  countryOfOrigin?: string;
  estimatedValue: number;
  unit: string;
  decree?: string;
  publishDate: string;
  effectiveDate: string;
  expiryDate?: string;
  source: 'DOF' | 'SAT' | 'internal';
  notes?: string;
}

// Helpers para reducir verbosidad
const D = (decree: string, date: string) => ({ decree, publishDate: date, effectiveDate: date, source: 'DOF' as const });
const I = (date = '2024-01-15') => ({ publishDate: date, effectiveDate: date, source: 'internal' as const });

export const ESTIMATED_PRICES: EstimatedPriceSeed[] = [
  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 29 — Productos químicos orgánicos
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '29041001', countryOfOrigin: 'CN', estimatedValue: 1.80, unit: 'USD/kg', notes: 'Ácido sulfónico', ...D('DOF-2024-07-15', '2024-07-15') },
  { fractionCode: '29153101', countryOfOrigin: 'CN', estimatedValue: 1.95, unit: 'USD/kg', notes: 'Acetato de etilo', ...I() },
  { fractionCode: '29173901', countryOfOrigin: 'CN', estimatedValue: 1.20, unit: 'USD/kg', notes: 'Anhídrido ftálico', ...I() },
  { fractionCode: '29299001', countryOfOrigin: 'CN', estimatedValue: 3.60, unit: 'USD/kg', notes: 'Otros compuestos con función nitrógeno', ...I() },
  { fractionCode: '29336901', countryOfOrigin: 'IN', estimatedValue: 5.20, unit: 'USD/kg', notes: 'Compuestos heterocíclicos farmacéuticos', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 32 — Pinturas, tintes, barnices
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '32041701', countryOfOrigin: 'CN', estimatedValue: 8.50, unit: 'USD/kg', notes: 'Pigmentos orgánicos sintéticos', ...I() },
  { fractionCode: '32081001', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Pinturas/barnices base poliéster', ...I() },
  { fractionCode: '32091001', estimatedValue: 3.90, unit: 'USD/kg', notes: 'Pinturas a base agua acrílicas', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 34 — Jabones, agentes superficie
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '34022001', countryOfOrigin: 'CN', estimatedValue: 2.40, unit: 'USD/kg', notes: 'Detergentes acondicionados venta menor', ...I() },
  { fractionCode: '34029099', countryOfOrigin: 'CN', estimatedValue: 1.95, unit: 'USD/kg', notes: 'Otros agentes superficie', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 39 — Plásticos
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '39011001', countryOfOrigin: 'CN', estimatedValue: 1.25, unit: 'USD/kg', notes: 'Polietileno densidad <0.94', ...I() },
  { fractionCode: '39021001', countryOfOrigin: 'CN', estimatedValue: 1.30, unit: 'USD/kg', notes: 'Polipropileno', ...I() },
  { fractionCode: '39076001', countryOfOrigin: 'CN', estimatedValue: 1.55, unit: 'USD/kg', notes: 'PET resina', ...I() },
  { fractionCode: '39231001', countryOfOrigin: 'CN', estimatedValue: 4.20, unit: 'USD/kg', notes: 'Cajas, jaulas plástico', ...I() },
  { fractionCode: '39232101', countryOfOrigin: 'CN', estimatedValue: 3.10, unit: 'USD/kg', notes: 'Sacos y bolsas polietileno', ...I() },
  { fractionCode: '39239001', countryOfOrigin: 'CN', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Otros artículos transporte plástico', ...I() },
  { fractionCode: '39241001', countryOfOrigin: 'CN', estimatedValue: 6.50, unit: 'USD/kg', notes: 'Vajilla y artículos cocina plástico', ...I() },
  { fractionCode: '39249099', countryOfOrigin: 'CN', estimatedValue: 5.80, unit: 'USD/kg', notes: 'Otros artículos uso doméstico plástico', ...I() },
  { fractionCode: '39269099', countryOfOrigin: 'CN', estimatedValue: 7.80, unit: 'USD/kg', notes: 'Manufacturas plástico varias', ...D('DOF-2023-11-22', '2023-11-22') },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 40 — Caucho y llantas
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '40111000', estimatedValue: 38.00, unit: 'USD/pieza', notes: 'Llantas neumáticas auto turismo', ...I('2024-03-01') },
  { fractionCode: '40112000', estimatedValue: 55.00, unit: 'USD/pieza', notes: 'Llantas neumáticas autobús/camión', ...I('2024-03-01') },
  { fractionCode: '40121100', estimatedValue: 28.00, unit: 'USD/pieza', notes: 'Llantas recauchutadas auto', ...I('2024-03-01') },
  { fractionCode: '40122000', estimatedValue: 18.00, unit: 'USD/pieza', notes: 'Llantas usadas — alta vigilancia SAT', ...I('2024-03-01') },
  { fractionCode: '40129001', estimatedValue: 12.00, unit: 'USD/pieza', notes: 'Otras llantas — referencia', ...I('2024-03-01') },
  { fractionCode: '40131001', estimatedValue: 5.50, unit: 'USD/pieza', notes: 'Cámaras de aire tipo turismo', ...I() },
  { fractionCode: '40169301', countryOfOrigin: 'CN', estimatedValue: 9.20, unit: 'USD/kg', notes: 'Juntas y empaques de caucho', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 42 — Manufacturas de cuero
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '42021201', countryOfOrigin: 'CN', estimatedValue: 22.00, unit: 'USD/pieza', notes: 'Maletas con superficie plástico/textil', ...D('DOF-2024-06-04', '2024-06-04') },
  { fractionCode: '42022101', countryOfOrigin: 'CN', estimatedValue: 35.00, unit: 'USD/pieza', notes: 'Bolsos de mano cuero natural', ...I() },
  { fractionCode: '42022201', countryOfOrigin: 'CN', estimatedValue: 14.50, unit: 'USD/pieza', notes: 'Bolsos plástico/textil', ...I() },
  { fractionCode: '42029201', countryOfOrigin: 'CN', estimatedValue: 16.00, unit: 'USD/pieza', notes: 'Mochilas escolares textiles', ...I() },
  { fractionCode: '42029299', countryOfOrigin: 'CN', estimatedValue: 18.50, unit: 'USD/pieza', notes: 'Otras bolsas/mochilas textil/plástico', ...D('DOF-2024-06-04', '2024-06-04') },
  { fractionCode: '42032901', countryOfOrigin: 'CN', estimatedValue: 8.50, unit: 'USD/par', notes: 'Guantes de cuero', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 48 — Papel y cartón
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '48114199', countryOfOrigin: 'CN', estimatedValue: 2.20, unit: 'USD/kg', notes: 'Papel/cartón autoadhesivo', ...D('DOF-2024-02-28', '2024-02-28') },
  { fractionCode: '48191001', countryOfOrigin: 'CN', estimatedValue: 1.40, unit: 'USD/kg', notes: 'Cajas plegables papel/cartón', ...I() },
  { fractionCode: '48192001', countryOfOrigin: 'CN', estimatedValue: 1.65, unit: 'USD/kg', notes: 'Cajas plegables corrugadas', ...I() },
  { fractionCode: '48201001', countryOfOrigin: 'CN', estimatedValue: 3.20, unit: 'USD/kg', notes: 'Libros registro/agendas/cuadernos', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 50-52 — Hilados naturales
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '52051201', countryOfOrigin: 'IN', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Hilados algodón sin acondicionar — origen India', ...D('DOF-2023-04-18', '2023-04-18') },
  { fractionCode: '52051201', countryOfOrigin: 'CN', estimatedValue: 4.95, unit: 'USD/kg', notes: 'Hilados algodón — origen China', ...I() },
  { fractionCode: '52081101', countryOfOrigin: 'IN', estimatedValue: 5.40, unit: 'USD/kg', notes: 'Tejidos algodón crudo', ...I() },
  { fractionCode: '52083201', countryOfOrigin: 'IN', estimatedValue: 6.80, unit: 'USD/kg', notes: 'Tejidos algodón teñido', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 54-55 — Filamentos / fibras sintéticas
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '54023301', countryOfOrigin: 'CN', estimatedValue: 3.20, unit: 'USD/kg', notes: 'Hilado texturado de poliéster', ...I() },
  { fractionCode: '54076101', countryOfOrigin: 'CN', estimatedValue: 6.20, unit: 'USD/kg', notes: 'Tejidos filamento poliéster', ...D('DOF-2023-12-01', '2023-12-01') },
  { fractionCode: '54077301', countryOfOrigin: 'CN', estimatedValue: 7.00, unit: 'USD/kg', notes: 'Tejidos filamento sintético teñido', ...I() },
  { fractionCode: '55032001', countryOfOrigin: 'CN', estimatedValue: 2.40, unit: 'USD/kg', notes: 'Fibras discontinuas poliéster', ...I() },
  { fractionCode: '55141101', countryOfOrigin: 'CN', estimatedValue: 6.40, unit: 'USD/kg', notes: 'Tejidos fibra sintética con algodón', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 57 — Alfombras
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '57033001', countryOfOrigin: 'CN', estimatedValue: 8.20, unit: 'USD/m', notes: 'Alfombras con pelo insertado fibra sintética', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 60 — Tejidos de punto
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '60053501', countryOfOrigin: 'CN', estimatedValue: 7.30, unit: 'USD/kg', notes: 'Tejidos punto fibras sintéticas', ...I('2024-04-10') },
  { fractionCode: '60063101', countryOfOrigin: 'CN', estimatedValue: 6.80, unit: 'USD/kg', notes: 'Otros tejidos punto fibras sintéticas', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 61 — Prendas de punto (tejido)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '61012001', countryOfOrigin: 'CN', estimatedValue: 18.00, unit: 'USD/pieza', notes: 'Abrigos hombre punto algodón', ...I() },
  { fractionCode: '61022001', countryOfOrigin: 'CN', estimatedValue: 17.50, unit: 'USD/pieza', notes: 'Abrigos mujer punto algodón', ...I() },
  { fractionCode: '61031001', countryOfOrigin: 'CN', estimatedValue: 15.00, unit: 'USD/pieza', notes: 'Trajes hombre punto', ...I() },
  { fractionCode: '61046201', countryOfOrigin: 'CN', estimatedValue: 8.50, unit: 'USD/pieza', notes: 'Pantalones mujer algodón punto', ...I() },
  { fractionCode: '61051001', countryOfOrigin: 'CN', estimatedValue: 6.20, unit: 'USD/pieza', notes: 'Camisas hombre punto algodón', ...I() },
  { fractionCode: '61062001', countryOfOrigin: 'CN', estimatedValue: 5.80, unit: 'USD/pieza', notes: 'Blusas mujer punto sintético', ...I() },
  { fractionCode: '61071101', countryOfOrigin: 'CN', estimatedValue: 2.80, unit: 'USD/pieza', notes: 'Calzoncillos hombre algodón', ...I() },
  { fractionCode: '61082101', countryOfOrigin: 'CN', estimatedValue: 2.40, unit: 'USD/pieza', notes: 'Bragas mujer algodón', ...I() },
  { fractionCode: '61091001', countryOfOrigin: 'CN', estimatedValue: 4.20, unit: 'USD/pieza', notes: 'Camisetas algodón — alta subvaluación histórica', ...D('DOF-2023-06-14', '2023-06-14') },
  { fractionCode: '61091001', countryOfOrigin: 'BD', estimatedValue: 3.80, unit: 'USD/pieza', notes: 'Camisetas algodón — origen Bangladesh', ...I() },
  { fractionCode: '61091001', countryOfOrigin: 'VN', estimatedValue: 4.00, unit: 'USD/pieza', notes: 'Camisetas algodón — origen Vietnam', ...I() },
  { fractionCode: '61099099', countryOfOrigin: 'CN', estimatedValue: 4.50, unit: 'USD/pieza', notes: 'T-shirts y similares fibra sintética', ...I() },
  { fractionCode: '61102001', countryOfOrigin: 'CN', estimatedValue: 9.00, unit: 'USD/pieza', notes: 'Suéteres algodón', ...I() },
  { fractionCode: '61102099', countryOfOrigin: 'CN', estimatedValue: 8.50, unit: 'USD/pieza', notes: 'Suéteres punto algodón — los demás', ...I() },
  { fractionCode: '61112001', countryOfOrigin: 'CN', estimatedValue: 3.20, unit: 'USD/pieza', notes: 'Prendas y complementos vestir bebé', ...I() },
  { fractionCode: '61152101', countryOfOrigin: 'CN', estimatedValue: 1.80, unit: 'USD/par', notes: 'Calcetines fibra sintética', ...I() },
  { fractionCode: '61169301', countryOfOrigin: 'CN', estimatedValue: 3.50, unit: 'USD/par', notes: 'Guantes punto fibra sintética', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 62 — Prendas tejidas (no de punto)
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '62011201', countryOfOrigin: 'CN', estimatedValue: 22.00, unit: 'USD/pieza', notes: 'Abrigos hombre algodón', ...I() },
  { fractionCode: '62021201', countryOfOrigin: 'CN', estimatedValue: 20.00, unit: 'USD/pieza', notes: 'Abrigos mujer algodón', ...I() },
  { fractionCode: '62031101', countryOfOrigin: 'CN', estimatedValue: 24.00, unit: 'USD/pieza', notes: 'Trajes hombre lana', ...I() },
  { fractionCode: '62034201', countryOfOrigin: 'CN', estimatedValue: 9.50, unit: 'USD/pieza', notes: 'Pantalones algodón hombre', ...D('DOF-2024-05-22', '2024-05-22') },
  { fractionCode: '62034201', countryOfOrigin: 'VN', estimatedValue: 8.80, unit: 'USD/pieza', notes: 'Pantalones algodón — origen Vietnam', ...I() },
  { fractionCode: '62034201', countryOfOrigin: 'BD', estimatedValue: 7.20, unit: 'USD/pieza', notes: 'Pantalones algodón — origen Bangladesh', ...I() },
  { fractionCode: '62043201', countryOfOrigin: 'CN', estimatedValue: 8.00, unit: 'USD/pieza', notes: 'Chaquetas algodón mujer', ...I() },
  { fractionCode: '62046201', countryOfOrigin: 'CN', estimatedValue: 9.50, unit: 'USD/pieza', notes: 'Pantalones algodón mujer', ...I() },
  { fractionCode: '62052001', countryOfOrigin: 'CN', estimatedValue: 5.50, unit: 'USD/pieza', notes: 'Camisas algodón hombre', ...I() },
  { fractionCode: '62063001', countryOfOrigin: 'CN', estimatedValue: 5.80, unit: 'USD/pieza', notes: 'Blusas algodón mujer', ...I() },
  { fractionCode: '62092001', countryOfOrigin: 'CN', estimatedValue: 3.40, unit: 'USD/pieza', notes: 'Prendas algodón bebé', ...I() },
  { fractionCode: '62113201', countryOfOrigin: 'CN', estimatedValue: 6.50, unit: 'USD/pieza', notes: 'Demás prendas hombre algodón', ...I() },
  { fractionCode: '62121001', countryOfOrigin: 'CN', estimatedValue: 5.00, unit: 'USD/pieza', notes: 'Sostenes', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 63 — Otros confeccionados textiles
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '63022101', countryOfOrigin: 'CN', estimatedValue: 6.50, unit: 'USD/kg', notes: 'Ropa de cama estampada algodón', ...I() },
  { fractionCode: '63029101', countryOfOrigin: 'CN', estimatedValue: 5.80, unit: 'USD/kg', notes: 'Ropa de tocador algodón', ...I() },
  { fractionCode: '63041901', countryOfOrigin: 'CN', estimatedValue: 7.20, unit: 'USD/kg', notes: 'Cubrecamas y similares', ...I() },
  { fractionCode: '63062201', countryOfOrigin: 'CN', estimatedValue: 6.80, unit: 'USD/kg', notes: 'Tiendas de campaña fibra sintética', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 64 — Calzado
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '64019201', countryOfOrigin: 'CN', estimatedValue: 9.50, unit: 'USD/par', notes: 'Calzado impermeable caucho/plástico', ...I() },
  { fractionCode: '64022001', countryOfOrigin: 'CN', estimatedValue: 5.20, unit: 'USD/par', notes: 'Calzado tira/correa fijada por tetones', ...I() },
  { fractionCode: '64029101', countryOfOrigin: 'CN', estimatedValue: 8.80, unit: 'USD/par', notes: 'Calzado caucho que cubra tobillo', ...I() },
  { fractionCode: '64029999', countryOfOrigin: 'CN', estimatedValue: 7.20, unit: 'USD/par', notes: 'Calzado caucho/plástico — origen China', ...D('DOF-2023-08-09', '2023-08-09') },
  { fractionCode: '64029999', countryOfOrigin: 'VN', estimatedValue: 8.40, unit: 'USD/par', notes: 'Calzado caucho — origen Vietnam', ...I() },
  { fractionCode: '64031999', countryOfOrigin: 'CN', estimatedValue: 14.80, unit: 'USD/par', notes: 'Calzado caucho con piel', ...D('DOF-2023-08-09', '2023-08-09') },
  { fractionCode: '64039101', countryOfOrigin: 'CN', estimatedValue: 18.00, unit: 'USD/par', notes: 'Calzado piel que cubra tobillo', ...I() },
  { fractionCode: '64039999', countryOfOrigin: 'CN', estimatedValue: 16.50, unit: 'USD/par', notes: 'Otro calzado piel', ...I() },
  { fractionCode: '64041901', countryOfOrigin: 'CN', estimatedValue: 11.50, unit: 'USD/par', notes: 'Calzado deportivo confección textil', ...D('DOF-2023-08-09', '2023-08-09') },
  { fractionCode: '64041999', countryOfOrigin: 'CN', estimatedValue: 9.80, unit: 'USD/par', notes: 'Calzado textil — los demás', ...I() },
  { fractionCode: '64042099', countryOfOrigin: 'CN', estimatedValue: 8.50, unit: 'USD/par', notes: 'Calzado textil suela cuero/regenerado', ...I() },
  { fractionCode: '64052001', countryOfOrigin: 'CN', estimatedValue: 6.20, unit: 'USD/par', notes: 'Calzado parte superior textil — los demás', ...I() },
  { fractionCode: '64062001', countryOfOrigin: 'CN', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Suelas y tacones de caucho/plástico', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 70 — Vidrio y manufacturas
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '70071101', countryOfOrigin: 'CN', estimatedValue: 4.20, unit: 'USD/kg', notes: 'Vidrio templado tamaño/forma vehículos', ...I() },
  { fractionCode: '70091001', countryOfOrigin: 'CN', estimatedValue: 5.50, unit: 'USD/pieza', notes: 'Espejos retrovisores vehículos', ...I() },
  { fractionCode: '70134101', countryOfOrigin: 'CN', estimatedValue: 3.40, unit: 'USD/kg', notes: 'Cristalería de mesa', ...D('DOF-2023-05-19', '2023-05-19') },
  { fractionCode: '70139901', countryOfOrigin: 'CN', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Otras manufacturas vidrio mesa/cocina', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 72 — Acero plano y largo
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '72082701', countryOfOrigin: 'CN', estimatedValue: 0.85, unit: 'USD/kg', notes: 'Lámina rolada en caliente', ...D('DOF-2023-09-22', '2023-09-22') },
  { fractionCode: '72083901', countryOfOrigin: 'CN', estimatedValue: 0.92, unit: 'USD/kg', notes: 'Lámina caliente espesor <3mm', ...I() },
  { fractionCode: '72091601', countryOfOrigin: 'CN', estimatedValue: 1.05, unit: 'USD/kg', notes: 'Lámina rolada en frío', ...D('DOF-2023-09-22', '2023-09-22') },
  { fractionCode: '72101201', countryOfOrigin: 'CN', estimatedValue: 1.45, unit: 'USD/kg', notes: 'Lámina con estaño electrolítico', ...I() },
  { fractionCode: '72103001', countryOfOrigin: 'CN', estimatedValue: 1.28, unit: 'USD/kg', notes: 'Lámina cincada electrolíticamente', ...I() },
  { fractionCode: '72104101', countryOfOrigin: 'CN', estimatedValue: 1.32, unit: 'USD/kg', notes: 'Lámina galvanizada por inmersión', ...D('DOF-2023-11-08', '2023-11-08') },
  { fractionCode: '72107001', countryOfOrigin: 'CN', estimatedValue: 1.55, unit: 'USD/kg', notes: 'Lámina pintada/barnizada', ...I() },
  { fractionCode: '72131001', countryOfOrigin: 'CN', estimatedValue: 0.78, unit: 'USD/kg', notes: 'Alambrón de hierro/acero', ...I() },
  { fractionCode: '72142001', countryOfOrigin: 'CN', estimatedValue: 0.85, unit: 'USD/kg', notes: 'Barras de hierro/acero', ...I() },
  { fractionCode: '72202001', countryOfOrigin: 'CN', estimatedValue: 2.85, unit: 'USD/kg', notes: 'Lámina inox laminada en frío', ...I() },
  { fractionCode: '72283099', countryOfOrigin: 'CN', estimatedValue: 1.45, unit: 'USD/kg', notes: 'Barras acero aleado', ...I('2024-02-05') },
  { fractionCode: '72292001', countryOfOrigin: 'CN', estimatedValue: 2.20, unit: 'USD/kg', notes: 'Alambre de acero aleado', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 73 — Manufacturas de hierro/acero
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '73041901', countryOfOrigin: 'CN', estimatedValue: 1.65, unit: 'USD/kg', notes: 'Tubería acero sin costura', ...D('DOF-2024-01-12', '2024-01-12') },
  { fractionCode: '73053101', countryOfOrigin: 'CN', estimatedValue: 1.30, unit: 'USD/kg', notes: 'Tubería diámetro >406mm soldada', ...I() },
  { fractionCode: '73063001', countryOfOrigin: 'CN', estimatedValue: 1.18, unit: 'USD/kg', notes: 'Tubo soldado sección circular', ...I() },
  { fractionCode: '73066101', countryOfOrigin: 'CN', estimatedValue: 1.20, unit: 'USD/kg', notes: 'Tubo acero soldado rectangular', ...I('2023-07-30') },
  { fractionCode: '73083001', countryOfOrigin: 'CN', estimatedValue: 2.30, unit: 'USD/kg', notes: 'Puertas, ventanas y marcos hierro', ...I() },
  { fractionCode: '73089099', countryOfOrigin: 'CN', estimatedValue: 1.95, unit: 'USD/kg', notes: 'Construcciones y partes hierro', ...I() },
  { fractionCode: '73144101', countryOfOrigin: 'CN', estimatedValue: 2.60, unit: 'USD/kg', notes: 'Tela metálica recubierta cinc', ...I() },
  { fractionCode: '73181101', countryOfOrigin: 'CN', estimatedValue: 4.50, unit: 'USD/kg', notes: 'Tirafondos acero', ...I() },
  { fractionCode: '73181201', countryOfOrigin: 'CN', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Tornillos para madera', ...I() },
  { fractionCode: '73181599', countryOfOrigin: 'CN', estimatedValue: 5.40, unit: 'USD/kg', notes: 'Tornillos acero al carbono — origen China (antes 7318.15.01/.05)', ...D('DOF-2024-09-12', '2024-09-12') },
  { fractionCode: '73181599', countryOfOrigin: 'IN', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Tornillos acero — origen India', ...I() },
  { fractionCode: '73181599', countryOfOrigin: 'TW', estimatedValue: 5.95, unit: 'USD/kg', notes: 'Tornillos acero — origen Taiwán', ...I() },
  { fractionCode: '73181606', countryOfOrigin: 'CN', estimatedValue: 5.10, unit: 'USD/kg', notes: 'Tuercas hex acero — referencia interna', ...I() },
  { fractionCode: '73182101', countryOfOrigin: 'CN', estimatedValue: 5.40, unit: 'USD/kg', notes: 'Arandelas elásticas acero', ...I() },
  { fractionCode: '73182201', countryOfOrigin: 'CN', estimatedValue: 4.95, unit: 'USD/kg', notes: 'Otras arandelas acero', ...I() },
  { fractionCode: '73269001', countryOfOrigin: 'CN', estimatedValue: 4.80, unit: 'USD/kg', notes: 'Manufacturas de hierro/acero', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 74 — Cobre
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '74081101', countryOfOrigin: 'CN', estimatedValue: 8.40, unit: 'USD/kg', notes: 'Alambre cobre refinado >6mm', ...I() },
  { fractionCode: '74130001', countryOfOrigin: 'CN', estimatedValue: 9.50, unit: 'USD/kg', notes: 'Cables cobre sin aislar', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 76 — Aluminio
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '76042901', countryOfOrigin: 'CN', estimatedValue: 3.80, unit: 'USD/kg', notes: 'Barras y perfiles aleación aluminio', ...I() },
  { fractionCode: '76061101', countryOfOrigin: 'CN', estimatedValue: 4.60, unit: 'USD/kg', notes: 'Chapas aluminio espesor >0.2mm', ...I() },
  { fractionCode: '76072001', countryOfOrigin: 'CN', estimatedValue: 6.20, unit: 'USD/kg', notes: 'Hojas aluminio soporte', ...I() },
  { fractionCode: '76101101', countryOfOrigin: 'CN', estimatedValue: 4.20, unit: 'USD/kg', notes: 'Estructuras aluminio construcción', ...D('DOF-2023-10-12', '2023-10-12') },
  { fractionCode: '76121001', countryOfOrigin: 'CN', estimatedValue: 6.50, unit: 'USD/kg', notes: 'Recipientes plegables aluminio', ...D('DOF-2024-01-25', '2024-01-25') },
  { fractionCode: '76151001', countryOfOrigin: 'CN', estimatedValue: 6.80, unit: 'USD/kg', notes: 'Artículos uso doméstico aluminio', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 82 — Herramientas
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '82014001', countryOfOrigin: 'CN', estimatedValue: 4.20, unit: 'USD/pieza', notes: 'Hachas, hocinos y herramientas similares', ...I() },
  { fractionCode: '82041201', countryOfOrigin: 'CN', estimatedValue: 3.80, unit: 'USD/pieza', notes: 'Llaves de boca', ...I() },
  { fractionCode: '82055901', countryOfOrigin: 'CN', estimatedValue: 6.50, unit: 'USD/pieza', notes: 'Otras herramientas mano metal', ...I() },
  { fractionCode: '82079001', countryOfOrigin: 'CN', estimatedValue: 8.20, unit: 'USD/pieza', notes: 'Útiles intercambiables otros', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 83 — Manufacturas diversas metal común
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '83014001', countryOfOrigin: 'CN', estimatedValue: 2.80, unit: 'USD/pieza', notes: 'Cerraduras otras', ...I() },
  { fractionCode: '83024101', countryOfOrigin: 'CN', estimatedValue: 5.40, unit: 'USD/kg', notes: 'Guarniciones edificios', ...I() },
  { fractionCode: '83025001', countryOfOrigin: 'CN', estimatedValue: 6.80, unit: 'USD/kg', notes: 'Colgaderos, perchas y similares', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 84 — Maquinaria y aparatos
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '84099101', estimatedValue: 18.00, unit: 'USD/kg', notes: 'Partes motores explosión', ...I() },
  { fractionCode: '84133001', estimatedValue: 65.00, unit: 'USD/pieza', notes: 'Bombas combustible/lubricantes vehículos', ...I() },
  { fractionCode: '84149001', estimatedValue: 24.00, unit: 'USD/kg', notes: 'Partes ventiladores/extractores', ...I() },
  { fractionCode: '84158101', estimatedValue: 280.00, unit: 'USD/pieza', notes: 'Aire acondicionado split', ...I() },
  { fractionCode: '84181001', estimatedValue: 320.00, unit: 'USD/pieza', notes: 'Refrigeradores combinados', ...I() },
  { fractionCode: '84219901', estimatedValue: 8.50, unit: 'USD/pieza', notes: 'Filtros y partes filtración', ...I() },
  { fractionCode: '84431301', estimatedValue: 480.00, unit: 'USD/pieza', notes: 'Impresoras láser color', ...I() },
  { fractionCode: '84431901', estimatedValue: 220.00, unit: 'USD/pieza', notes: 'Otras impresoras', ...I() },
  { fractionCode: '84472001', estimatedValue: 95.00, unit: 'USD/pieza', notes: 'Máquinas de coser tipo doméstico', ...I() },
  { fractionCode: '84713001', estimatedValue: 350.00, unit: 'USD/pieza', notes: 'Laptops portátiles', ...I('2024-01-01') },
  { fractionCode: '84715001', estimatedValue: 280.00, unit: 'USD/pieza', notes: 'CPU computadoras', ...I() },
  { fractionCode: '84717001', estimatedValue: 65.00, unit: 'USD/pieza', notes: 'Discos duros/SSD', ...I() },
  { fractionCode: '84733001', estimatedValue: 18.50, unit: 'USD/kg', notes: 'Partes y accesorios computadoras', ...I() },
  { fractionCode: '84799099', estimatedValue: 32.00, unit: 'USD/kg', notes: 'Partes maquinaria industrial NEP', ...I() },
  { fractionCode: '84812001', estimatedValue: 5.80, unit: 'USD/pieza', notes: 'Válvulas hidráulicas/neumáticas', ...I() },
  { fractionCode: '84818001', estimatedValue: 7.20, unit: 'USD/pieza', notes: 'Otros artículos grifería válvulas', ...I() },
  { fractionCode: '84821001', estimatedValue: 8.50, unit: 'USD/pieza', notes: 'Rodamientos de bolas', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 85 — Eléctricos y electrónicos
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '85011001', estimatedValue: 4.80, unit: 'USD/pieza', notes: 'Motores eléctricos <37.5W', ...I() },
  { fractionCode: '85011099', estimatedValue: 7.20, unit: 'USD/pieza', notes: 'Motores eléctricos pequeños — los demás', ...I('2024-01-01') },
  { fractionCode: '85016401', estimatedValue: 1850.00, unit: 'USD/pieza', notes: 'Generadores corriente alterna >750kVA', ...I() },
  { fractionCode: '85044001', countryOfOrigin: 'CN', estimatedValue: 8.50, unit: 'USD/pieza', notes: 'Convertidores estáticos / cargadores', ...I('2024-04-30') },
  { fractionCode: '85044012', estimatedValue: 12.00, unit: 'USD/pieza', notes: 'Convertidores ≤1 kVA', ...I('2024-04-30') },
  { fractionCode: '85049001', estimatedValue: 14.50, unit: 'USD/kg', notes: 'Partes transformadores', ...I() },
  { fractionCode: '85072001', estimatedValue: 35.00, unit: 'USD/pieza', notes: 'Acumuladores plomo arranque', ...I() },
  { fractionCode: '85076001', estimatedValue: 18.00, unit: 'USD/pieza', notes: 'Acumuladores ion-litio', ...I() },
  { fractionCode: '85094001', estimatedValue: 22.00, unit: 'USD/pieza', notes: 'Trituradores eléctricos uso doméstico', ...I() },
  { fractionCode: '85161001', estimatedValue: 38.00, unit: 'USD/pieza', notes: 'Calentadores agua eléctricos', ...I() },
  { fractionCode: '85162901', estimatedValue: 35.00, unit: 'USD/pieza', notes: 'Calefactores ambiente eléctricos', ...I() },
  { fractionCode: '85165001', estimatedValue: 95.00, unit: 'USD/pieza', notes: 'Hornos de microondas', ...I() },
  { fractionCode: '85176201', estimatedValue: 65.00, unit: 'USD/pieza', notes: 'Aparatos transmisión/recepción telefónica', ...I() },
  { fractionCode: '85176290', estimatedValue: 45.00, unit: 'USD/pieza', notes: 'Aparatos comunicación inalámbrica', ...I('2024-01-01') },
  { fractionCode: '85176901', estimatedValue: 28.00, unit: 'USD/pieza', notes: 'Otros aparatos transmisión datos', ...I() },
  { fractionCode: '85182101', estimatedValue: 18.00, unit: 'USD/pieza', notes: 'Altavoz único en su caja', ...I() },
  { fractionCode: '85183001', estimatedValue: 25.00, unit: 'USD/pieza', notes: 'Audífonos con micrófono', ...I() },
  { fractionCode: '85258102', estimatedValue: 380.00, unit: 'USD/pieza', notes: 'Cámaras digitales fotografía', ...I() },
  { fractionCode: '85285201', estimatedValue: 95.00, unit: 'USD/pieza', notes: 'Monitor LED ≥17"', ...I('2024-04-30') },
  { fractionCode: '85287201', countryOfOrigin: 'CN', estimatedValue: 165.00, unit: 'USD/pieza', notes: 'Receptores TV — origen China', ...I('2025-01-08') },
  { fractionCode: '85287299', estimatedValue: 220.00, unit: 'USD/pieza', notes: 'Demás aparatos receptores TV color', ...I() },
  { fractionCode: '85318001', estimatedValue: 8.40, unit: 'USD/pieza', notes: 'Aparatos eléctricos señalización acústica', ...I() },
  { fractionCode: '85332101', estimatedValue: 0.18, unit: 'USD/pieza', notes: 'Resistencias fijas', ...I() },
  { fractionCode: '85365001', estimatedValue: 4.20, unit: 'USD/pieza', notes: 'Interruptores ≤1000V', ...I('2024-01-01') },
  { fractionCode: '85366901', estimatedValue: 0.55, unit: 'USD/pieza', notes: 'Conectores eléctricos', ...I('2024-01-01') },
  { fractionCode: '85369001', estimatedValue: 3.80, unit: 'USD/pieza', notes: 'Otros aparatos eléctricos protección', ...I() },
  { fractionCode: '85393201', estimatedValue: 2.40, unit: 'USD/pieza', notes: 'Lámparas LED', ...I() },
  { fractionCode: '85414201', estimatedValue: 1.50, unit: 'USD/pieza', notes: 'Diodos emisores luz LED', ...I() },
  { fractionCode: '85423101', estimatedValue: 12.50, unit: 'USD/pieza', notes: 'Procesadores y controladores', ...I() },
  { fractionCode: '85423201', estimatedValue: 8.20, unit: 'USD/pieza', notes: 'Memorias circuitos integrados', ...I() },
  { fractionCode: '85423901', estimatedValue: 4.80, unit: 'USD/pieza', notes: 'Otros circuitos integrados', ...I() },
  { fractionCode: '85443001', countryOfOrigin: 'CN', estimatedValue: 12.50, unit: 'USD/kg', notes: 'Juegos cables encendido vehículos', ...I() },
  { fractionCode: '85443099', estimatedValue: 13.50, unit: 'USD/kg', notes: 'Arneses cables automotriz', ...I('2024-01-01') },
  // 8544.42.01 retirada de la TIGIE 2026 (migración 20260824234500): el
  // precio se siembra sobre la residual sobreviviente 8544.42.99, igual que
  // el reapunte que la migración aplicó en prod.
  { fractionCode: '85444299', estimatedValue: 8.40, unit: 'USD/kg', notes: 'Otros cables conductores aislados', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 87 — Vehículos y partes
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '87042101', estimatedValue: 12500.00, unit: 'USD/pieza', notes: 'Vehículos transporte mercancías ≤5T', ...I() },
  { fractionCode: '87082101', estimatedValue: 16.50, unit: 'USD/pieza', notes: 'Cinturones de seguridad vehículos', ...I('2024-01-01') },
  { fractionCode: '87082999', estimatedValue: 28.00, unit: 'USD/pieza', notes: 'Partes carrocería vehículos', ...I('2024-01-01') },
  { fractionCode: '87083001', estimatedValue: 45.00, unit: 'USD/pieza', notes: 'Frenos y servofrenos', ...I() },
  { fractionCode: '87084001', estimatedValue: 380.00, unit: 'USD/pieza', notes: 'Cajas de cambio ensambladas', ...I() },
  { fractionCode: '87085001', estimatedValue: 220.00, unit: 'USD/pieza', notes: 'Ejes con diferencial vehículos', ...I() },
  { fractionCode: '87087001', estimatedValue: 38.00, unit: 'USD/pieza', notes: 'Ruedas de aluminio vehículos', ...I() },
  { fractionCode: '87089201', estimatedValue: 18.50, unit: 'USD/kg', notes: 'Silenciadores y tubos escape', ...I() },
  { fractionCode: '87089299', estimatedValue: 14.20, unit: 'USD/kg', notes: 'Silenciadores y tubos escape — los demás', ...I() },
  { fractionCode: '87089999', estimatedValue: 22.00, unit: 'USD/pieza', notes: 'Partes y accesorios vehículos automóviles', ...I('2024-01-01') },
  { fractionCode: '87141001', estimatedValue: 32.00, unit: 'USD/kg', notes: 'Partes y accesorios motocicletas', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 90 — Instrumentos
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '90049001', estimatedValue: 18.00, unit: 'USD/pieza', notes: 'Gafas correctivas y similares', ...I() },
  { fractionCode: '90158001', estimatedValue: 220.00, unit: 'USD/pieza', notes: 'Otros instrumentos topografía/geofísica', ...I() },
  { fractionCode: '90183901', estimatedValue: 15.00, unit: 'USD/pieza', notes: 'Jeringas con/sin aguja', ...I() },
  { fractionCode: '90189001', estimatedValue: 85.00, unit: 'USD/pieza', notes: 'Instrumentos médicos los demás', ...I() },
  { fractionCode: '90251101', estimatedValue: 4.50, unit: 'USD/pieza', notes: 'Termómetros líquido lectura directa', ...I() },
  { fractionCode: '90328905', estimatedValue: 11.20, unit: 'USD/pieza', notes: 'Sensores control automotriz', ...I('2024-01-01') },
  { fractionCode: '90329001', estimatedValue: 9.80, unit: 'USD/pieza', notes: 'Partes y accesorios instrumentos regulación', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 91 — Relojería
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '91021101', countryOfOrigin: 'CN', estimatedValue: 18.00, unit: 'USD/pieza', notes: 'Relojes pulsera mecánicos', ...I() },
  { fractionCode: '91022101', countryOfOrigin: 'CN', estimatedValue: 12.50, unit: 'USD/pieza', notes: 'Relojes pulsera con función adicional', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 94 — Muebles
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '94013001', countryOfOrigin: 'CN', estimatedValue: 32.00, unit: 'USD/pieza', notes: 'Asientos giratorios altura ajustable', ...I() },
  { fractionCode: '94016101', countryOfOrigin: 'CN', estimatedValue: 95.00, unit: 'USD/pieza', notes: 'Asientos tapizados con armazón madera', ...I() },
  { fractionCode: '94036001', countryOfOrigin: 'CN', estimatedValue: 14.50, unit: 'USD/kg', notes: 'Otros muebles madera', ...I() },
  { fractionCode: '94042101', countryOfOrigin: 'CN', estimatedValue: 32.00, unit: 'USD/kg', notes: 'Colchones caucho/plástico celular', ...I() },
  { fractionCode: '94052001', countryOfOrigin: 'CN', estimatedValue: 18.00, unit: 'USD/pieza', notes: 'Lámparas mesa, escritorio', ...I() },
  { fractionCode: '94054001', countryOfOrigin: 'CN', estimatedValue: 12.50, unit: 'USD/pieza', notes: 'Otros aparatos eléctricos alumbrado', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 95 — Juguetes y artículos deportivos
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '95030001', estimatedValue: 12.00, unit: 'USD/kg', notes: 'Triciclos, patinetes y similares', ...I('2024-01-15') },
  { fractionCode: '95030008', estimatedValue: 6.50, unit: 'USD/kg', notes: 'Juguetes de plástico variados', ...I('2024-01-15') },
  { fractionCode: '95030099', countryOfOrigin: 'CN', estimatedValue: 8.40, unit: 'USD/kg', notes: 'Otros juguetes', ...I() },
  { fractionCode: '95049090', estimatedValue: 8.00, unit: 'USD/kg', notes: 'Juegos y videoconsolas', ...I('2024-01-15') },
  { fractionCode: '95051001', countryOfOrigin: 'CN', estimatedValue: 6.20, unit: 'USD/kg', notes: 'Artículos para fiestas Navidad', ...I() },
  { fractionCode: '95066201', countryOfOrigin: 'CN', estimatedValue: 4.80, unit: 'USD/pieza', notes: 'Pelotas inflables deportivas', ...I() },
  { fractionCode: '95069101', countryOfOrigin: 'CN', estimatedValue: 18.00, unit: 'USD/kg', notes: 'Aparatos gimnasia/atletismo', ...I() },

  // ════════════════════════════════════════════════════════════════════
  // CAPÍTULO 96 — Manufacturas diversas
  // ════════════════════════════════════════════════════════════════════
  { fractionCode: '96032901', countryOfOrigin: 'CN', estimatedValue: 8.50, unit: 'USD/kg', notes: 'Cepillos dientes/pelo aseo personal', ...I() },
  { fractionCode: '96062201', countryOfOrigin: 'CN', estimatedValue: 14.50, unit: 'USD/kg', notes: 'Botones metal común sin recubrir', ...I() },
  { fractionCode: '96081001', countryOfOrigin: 'CN', estimatedValue: 0.65, unit: 'USD/pieza', notes: 'Bolígrafos', ...I() },
  { fractionCode: '96190001', countryOfOrigin: 'CN', estimatedValue: 6.20, unit: 'USD/kg', notes: 'Toallas sanitarias y artículos higiene', ...I() },
];

export async function seedEstimatedPrices(prisma: PrismaClient): Promise<{ inserted: number; updated: number }> {
  // No hay unique compuesto en el modelo (decree es opcional), así que limpiamos
  // y recreamos para mantener idempotencia.
  await prisma.estimatedPrice.deleteMany({});

  let inserted = 0;
  for (const ep of ESTIMATED_PRICES) {
    await prisma.estimatedPrice.create({
      data: {
        fractionCode: ep.fractionCode,
        countryOfOrigin: ep.countryOfOrigin,
        estimatedValue: ep.estimatedValue,
        unit: ep.unit,
        decree: ep.decree,
        publishDate: new Date(ep.publishDate),
        effectiveDate: new Date(ep.effectiveDate),
        expiryDate: ep.expiryDate ? new Date(ep.expiryDate) : null,
        source: ep.source,
        notes: ep.notes,
      },
    });
    inserted++;
  }
  return { inserted, updated: 0 };
}
