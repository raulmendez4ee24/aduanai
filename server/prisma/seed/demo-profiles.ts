/**
 * Seed: Perfiles demo segmentados por sector industrial.
 *
 * Cada perfil define:
 *   - identidad de la empresa demo (nombre, RFC, IMMEX, certificaciones)
 *   - capítulos TIGIE típicos del sector
 *   - países de origen frecuentes
 *   - catálogo de productos con descripciones reales y fracciones esperadas
 *
 * El loader (`demo-loader.ts`) usa estos catálogos para materializar imports,
 * clasificaciones, cotizaciones y alertas temáticas al sector.
 */

import { PrismaClient } from '@prisma/client';

interface ProductCatalogItem {
  sku: string;
  description: string;
  fraction: string;
}

interface DemoProfileSeed {
  industryCode: string;
  industryName: string;
  description: string;
  longDescription?: string;
  companyName: string;
  rfc: string;
  primarySector: string;
  immexModality: string | null;
  certifications: string[];
  fractionsRange: { chapters: number[]; typical: string[] };
  countriesOfOrigin: string[];
  productCatalog: ProductCatalogItem[];
  isDefault?: boolean;
}

export const DEMO_PROFILES: DemoProfileSeed[] = [
  // ────────────────────────────────────────────────────────────────────
  // AUTOMOTRIZ (default)
  // ────────────────────────────────────────────────────────────────────
  {
    industryCode: 'automotive',
    industryName: 'Maquiladora Automotriz',
    description: 'Tier 1/2 que importa insumos para ensamble vehicular bajo IMMEX',
    longDescription: 'Importa tornillería específica, arneses, sensores y plásticos OEM. Programa IMMEX modalidad maquila con certificación IVA/IEPS. Aduanas: Nuevo Laredo, Ciudad Juárez.',
    companyName: 'Maquiladora Automotriz Ejemplo SA de CV',
    rfc: 'MAE241015A1B',
    primarySector: 'Automotriz',
    immexModality: 'maquila',
    certifications: ['IVA-IEPS-AA'],
    fractionsRange: {
      chapters: [73, 84, 85, 87, 39, 40],
      typical: ['85366901', '85443099', '73181505', '87089999', '90328905', '39269099'],
    },
    countriesOfOrigin: ['CN', 'US', 'DE', 'JP', 'KR'],
    productCatalog: [
      { sku: 'AUTO-001', description: 'Tornillo hexagonal M8x25 acero al carbono galvanizado para ensamble vehicular', fraction: '73181505' },
      { sku: 'AUTO-002', description: 'Arnés eléctrico de 45 circuitos con conectores Molex para tablero automotriz', fraction: '85443099' },
      { sku: 'AUTO-003', description: 'Sensor de presión de aceite con conector estándar para motor de combustión', fraction: '90328905' },
      { sku: 'AUTO-004', description: 'Conector eléctrico hembra 4 vías para arnés automotriz', fraction: '85366901' },
      { sku: 'AUTO-005', description: 'Tablero de instrumentos plástico moldeado para vehículo compacto', fraction: '87082999' },
      { sku: 'AUTO-006', description: 'Pieza plástica panel interior puerta delantera', fraction: '87082999' },
      { sku: 'AUTO-007', description: 'Manguera de hule reforzada para sistema de admisión turbo', fraction: '40169301' },
      { sku: 'AUTO-008', description: 'Tuerca hexagonal M10 acero zincado uso automotriz', fraction: '73181606' },
      { sku: 'AUTO-009', description: 'Soporte estampado de acero para motor 1.5L', fraction: '87089999' },
      { sku: 'AUTO-010', description: 'Cable de alimentación 12V para sistema de iluminación', fraction: '85443001' },
    ],
    isDefault: true,
  },

  // ────────────────────────────────────────────────────────────────────
  // TEXTIL Y CONFECCIÓN
  // ────────────────────────────────────────────────────────────────────
  {
    industryCode: 'textile',
    industryName: 'Textilera y Confección',
    description: 'Maquila textil que importa telas y exporta prendas terminadas',
    longDescription: 'IMMEX servicios — corte y confección de prendas para marcas internacionales. Insumos: hilados, telas, accesorios. Aduanas: Veracruz, Manzanillo.',
    companyName: 'Textiles del Bajío SA de CV',
    rfc: 'TBJ190822C5D',
    primarySector: 'Textil',
    immexModality: 'servicios',
    certifications: ['IVA-IEPS-A'],
    fractionsRange: {
      chapters: [50, 51, 52, 53, 54, 55, 60, 61, 62, 63, 64],
      typical: ['52083201', '54076101', '60053501', '61091001', '62034201', '64041901'],
    },
    countriesOfOrigin: ['CN', 'VN', 'BD', 'IN', 'TR', 'US'],
    productCatalog: [
      { sku: 'TEX-001', description: 'Tela de algodón 100% peinado teñida color azul ancho 1.50m peso 180g/m2', fraction: '52083201' },
      { sku: 'TEX-002', description: 'Camiseta tejido de punto algodón 100% para hombre talla M color blanco manga corta', fraction: '61091001' },
      { sku: 'TEX-003', description: 'Pantalón jean denim algodón 100% azul talla 32 hombre', fraction: '62034201' },
      { sku: 'TEX-004', description: 'Hilado texturado poliéster 150D para tejido de punto', fraction: '54023301' },
      { sku: 'TEX-005', description: 'Tela poliéster 100% para forros 90g/m2 color negro', fraction: '54076101' },
      { sku: 'TEX-006', description: 'Tejido de punto fibras sintéticas para ropa deportiva', fraction: '60053501' },
      { sku: 'TEX-007', description: 'Tenis deportivo confección textil suela caucho talla 27 unisex', fraction: '64041901' },
      { sku: 'TEX-008', description: 'Blusa mujer algodón 100% manga corta color rosa talla S', fraction: '61062001' },
      { sku: 'TEX-009', description: 'Calcetines algodón 100% paquete 6 pares talla universal', fraction: '61152101' },
      { sku: 'TEX-010', description: 'Botones plástico 4 agujeros 12mm color blanco para camisas', fraction: '96062201' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────
  // ELECTRÓNICA DE CONSUMO
  // ────────────────────────────────────────────────────────────────────
  {
    industryCode: 'electronics',
    industryName: 'Comercializadora Electrónica',
    description: 'Importador de equipos electrónicos para retail',
    longDescription: 'Importación definitiva (no IMMEX) de smartphones, laptops, accesorios. Certificación OEA. Aduanas: AICM, Pantaco, Manzanillo.',
    companyName: 'ElectrónicaPro Comercializadora SA de CV',
    rfc: 'ECP200310X9Z',
    primarySector: 'Electrónica de consumo',
    immexModality: null,
    certifications: ['OEA'],
    fractionsRange: {
      chapters: [84, 85, 90, 91, 95],
      typical: ['85176290', '84713001', '85183001', '85285201', '85044001'],
    },
    countriesOfOrigin: ['CN', 'VN', 'KR', 'TW', 'MY', 'TH'],
    productCatalog: [
      { sku: 'ELC-001', description: 'Smartphone 6.7 pulgadas pantalla AMOLED 256GB RAM 8GB Android 14', fraction: '85176290' },
      { sku: 'ELC-002', description: 'Laptop portátil 15.6 pulgadas Intel Core i7 16GB RAM 512GB SSD Windows 11', fraction: '84713001' },
      { sku: 'ELC-003', description: 'Audífonos inalámbricos bluetooth con cancelación de ruido carga rápida', fraction: '85183001' },
      { sku: 'ELC-004', description: 'Monitor LED 27 pulgadas resolución 2K HDMI USB-C panel IPS', fraction: '85285201' },
      { sku: 'ELC-005', description: 'Cargador USB-C 65W carga rápida con cable incluido', fraction: '85044001' },
      { sku: 'ELC-006', description: 'Cable HDMI 2.1 de 2 metros con conectores dorados 4K 120Hz', fraction: '85444299' },
      { sku: 'ELC-007', description: 'Smartwatch con monitor cardiaco y GPS pantalla AMOLED', fraction: '85176901' },
      { sku: 'ELC-008', description: 'Tableta 10 pulgadas Android 64GB con stylus incluido', fraction: '84713001' },
      { sku: 'ELC-009', description: 'Bocina bluetooth portátil resistente al agua 20W batería 12 horas', fraction: '85182101' },
      { sku: 'ELC-010', description: 'SSD interno 1TB NVMe M.2 PCIe lectura 5000MB/s', fraction: '84717001' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────
  // ALIMENTOS Y BEBIDAS
  // ────────────────────────────────────────────────────────────────────
  {
    industryCode: 'food',
    industryName: 'Importadora de Alimentos',
    description: 'Importador de alimentos y bebidas gourmet',
    longDescription: 'Importación definitiva con NOMs sanitarias COFEPRIS y SENASICA. Certificación OEA. Aduanas: Manzanillo, Veracruz, AICM.',
    companyName: 'Importadora Alimentaria del Pacífico SA de CV',
    rfc: 'IAP180415F2K',
    primarySector: 'Alimentos y bebidas',
    immexModality: null,
    certifications: ['OEA'],
    fractionsRange: {
      chapters: [1, 2, 3, 4, 7, 8, 15, 16, 17, 18, 19, 20, 21, 22],
      typical: ['09011', '18063', '21069', '19053', '22029', '22083'],
    },
    countriesOfOrigin: ['US', 'BR', 'CO', 'ES', 'IT', 'FR'],
    productCatalog: [
      { sku: 'FOO-001', description: 'Café arábica tostado en grano de origen Colombia bolsa 1kg', fraction: '09012101' },
      { sku: 'FOO-002', description: 'Chocolate amargo 70% cacao tablilla 100g de origen Bélgica', fraction: '18063299' },
      { sku: 'FOO-003', description: 'Aceite de oliva extra virgen italiano botella 500ml', fraction: '15091001' },
      { sku: 'FOO-004', description: 'Galletas mantequilla danesas lata 500g surtido', fraction: '19053101' },
      { sku: 'FOO-005', description: 'Vino tinto cabernet sauvignon Chile 750ml cosecha 2022', fraction: '22042101' },
      { sku: 'FOO-006', description: 'Whisky escocés single malt 12 años botella 750ml', fraction: '22083004' },
      { sku: 'FOO-007', description: 'Bebida energética sin azúcar lata 250ml caja 24 unidades', fraction: '22029999' },
      { sku: 'FOO-008', description: 'Pasta italiana 500g fettuccine de durum', fraction: '19021999' },
      { sku: 'FOO-009', description: 'Queso parmesano italiano cuña 250g maduración 24 meses', fraction: '04069099' },
      { sku: 'FOO-010', description: 'Atún en conserva aceite de oliva lata 200g España', fraction: '16041499' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────
  // FARMACÉUTICA Y MÉDICO
  // ────────────────────────────────────────────────────────────────────
  {
    industryCode: 'pharma',
    industryName: 'Farmacéutica y Médico',
    description: 'Laboratorio farmacéutico que importa principios activos y dispositivos médicos',
    longDescription: 'IMMEX servicios + importación definitiva. Registros sanitarios COFEPRIS. Certificación OEA + IVA/IEPS-AAA. Aduanas: AICM, Toluca.',
    companyName: 'Farmacéutica del Norte SA de CV',
    rfc: 'FNO150612P8Q',
    primarySector: 'Farmacéutico',
    immexModality: 'servicios',
    certifications: ['OEA', 'IVA-IEPS-AAA'],
    fractionsRange: {
      chapters: [29, 30, 33, 90],
      typical: ['30049099', '30024101', '90183901', '29336901', '90189090'],
    },
    countriesOfOrigin: ['US', 'DE', 'CH', 'IN', 'CN'],
    productCatalog: [
      { sku: 'FAR-001', description: 'Antibiótico amoxicilina 500mg tabletas caja 100 piezas', fraction: '30042099' },
      { sku: 'FAR-002', description: 'Vacuna antigripal monodosis vial 0.5mL', fraction: '30024101' },
      { sku: 'FAR-003', description: 'Jeringas estériles 5mL con aguja 21G caja 100 unidades', fraction: '90183901' },
      { sku: 'FAR-004', description: 'Catéter venoso periférico 22G calibre estéril uso individual', fraction: '90189090' },
      { sku: 'FAR-005', description: 'Principio activo paracetamol grado farmacéutico tambor 25kg', fraction: '29242999' },
      { sku: 'FAR-006', description: 'Monitor de signos vitales multiparamétrico equipo médico', fraction: '90189001' },
      { sku: 'FAR-007', description: 'Termómetro digital infrarrojo para uso médico', fraction: '90251101' },
      { sku: 'FAR-008', description: 'Material para suturas absorbibles caja 12 piezas', fraction: '90189090' },
      { sku: 'FAR-009', description: 'Solución salina fisiológica 0.9% bolsa 500mL caja 24', fraction: '30049099' },
      { sku: 'FAR-010', description: 'Mascarillas quirúrgicas tres capas con elásticos caja 50 piezas', fraction: '63079099' },
    ],
  },
];

export async function seedDemoProfiles(prisma: PrismaClient): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const p of DEMO_PROFILES) {
    const existing = await prisma.demoProfile.findUnique({ where: { industryCode: p.industryCode }, select: { id: true } });
    await prisma.demoProfile.upsert({
      where: { industryCode: p.industryCode },
      update: {
        industryName: p.industryName,
        description: p.description,
        longDescription: p.longDescription,
        companyName: p.companyName,
        rfc: p.rfc,
        primarySector: p.primarySector,
        immexModality: p.immexModality,
        certifications: p.certifications as never,
        fractionsRange: p.fractionsRange as never,
        countriesOfOrigin: p.countriesOfOrigin as never,
        productCatalog: p.productCatalog as never,
        isDefault: p.isDefault ?? false,
        active: true,
      },
      create: {
        industryCode: p.industryCode,
        industryName: p.industryName,
        description: p.description,
        longDescription: p.longDescription,
        companyName: p.companyName,
        rfc: p.rfc,
        primarySector: p.primarySector,
        immexModality: p.immexModality,
        certifications: p.certifications as never,
        fractionsRange: p.fractionsRange as never,
        countriesOfOrigin: p.countriesOfOrigin as never,
        productCatalog: p.productCatalog as never,
        isDefault: p.isDefault ?? false,
      },
    });
    if (existing) updated++; else inserted++;
  }
  return { inserted, updated };
}
