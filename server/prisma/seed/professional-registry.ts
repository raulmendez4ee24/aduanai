/**
 * Seed: Registro placeholder de patentes de agentes aduanales mexicanos.
 *
 * NOTA: la lista oficial vive en CAAAREM (Confederación de Asociaciones de
 * Agentes Aduanales de la República Mexicana) — directorio público actualizado
 * periódicamente. Esta seed contiene placeholders documentados con `source: 'placeholder'`
 * para desarrollo y demos. En producción debe reemplazarse por sync con la
 * API/scrape de CAAAREM (campo `source: 'CAAAREM_2026'`).
 *
 * Cualquier verificación contra esta tabla es preliminar — el documento físico
 * de patente sigue siendo la fuente final de verdad.
 */

import { PrismaClient } from '@prisma/client';

interface RegistrySeed {
  patente: string;
  socialName: string;
  active: boolean;
  expiry?: string;
  port?: string;
  professionalType?: string;
  source: string;
}

const today = new Date();
const yearsAhead = (n: number): string => new Date(today.getFullYear() + n, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

export const PROFESSIONAL_REGISTRY: RegistrySeed[] = [
  // Aduana de Nuevo Laredo
  { patente: '1101', socialName: 'Despacho Aduanal Frontera Norte SC', active: true, expiry: yearsAhead(3), port: 'Nuevo Laredo', source: 'placeholder' },
  { patente: '1102', socialName: 'Logística Internacional Tamaulipas SA de CV', active: true, expiry: yearsAhead(2), port: 'Nuevo Laredo', source: 'placeholder' },
  { patente: '1103', socialName: 'Customs Brokers Border SA de CV', active: true, expiry: yearsAhead(4), port: 'Nuevo Laredo', source: 'placeholder' },

  // Aduana de Tijuana
  { patente: '1201', socialName: 'Pacific Customs Agency SC', active: true, expiry: yearsAhead(3), port: 'Tijuana', source: 'placeholder' },
  { patente: '1202', socialName: 'Baja Comex Servicios Aduanales SC', active: true, expiry: yearsAhead(1), port: 'Tijuana', source: 'placeholder' },

  // Aduana de Ciudad Juárez
  { patente: '1301', socialName: 'Frontera Aduanal Chihuahua SC', active: true, expiry: yearsAhead(2), port: 'Ciudad Juárez', source: 'placeholder' },
  { patente: '1302', socialName: 'Despacho Internacional Norte SA de CV', active: true, expiry: yearsAhead(5), port: 'Ciudad Juárez', source: 'placeholder' },

  // Aduana de Veracruz
  { patente: '1401', socialName: 'Veracruz Customs Solutions SC', active: true, expiry: yearsAhead(3), port: 'Veracruz', source: 'placeholder' },
  { patente: '1402', socialName: 'Marítima Comex Servicios SA de CV', active: true, expiry: yearsAhead(4), port: 'Veracruz', source: 'placeholder' },

  // Aduana de Manzanillo
  { patente: '1501', socialName: 'Pacífico Aduanal Manzanillo SC', active: true, expiry: yearsAhead(2), port: 'Manzanillo', source: 'placeholder' },
  { patente: '1502', socialName: 'Costa Pacífico Despacho Aduanal SC', active: true, expiry: yearsAhead(3), port: 'Manzanillo', source: 'placeholder' },

  // Aduana de Lázaro Cárdenas
  { patente: '1601', socialName: 'Lázaro Customs Services SC', active: true, expiry: yearsAhead(4), port: 'Lázaro Cárdenas', source: 'placeholder' },

  // Aduana de Altamira
  { patente: '1701', socialName: 'Altamira Trade Logistics SA de CV', active: true, expiry: yearsAhead(2), port: 'Altamira', source: 'placeholder' },

  // AICM / DF / Pantaco
  { patente: '1801', socialName: 'Aeropuerto Aduanal Servicios SC', active: true, expiry: yearsAhead(3), port: 'AICM', source: 'placeholder' },
  { patente: '1802', socialName: 'Pantaco Despacho Internacional SA', active: true, expiry: yearsAhead(2), port: 'México (Pantaco)', source: 'placeholder' },
  { patente: '1803', socialName: 'CDMX Comex Aduanal SC', active: true, expiry: yearsAhead(5), port: 'México (Pantaco)', source: 'placeholder' },

  // Aduana de Querétaro / Bajío
  { patente: '1901', socialName: 'Bajío Aduanal Querétaro SA de CV', active: true, expiry: yearsAhead(4), port: 'Querétaro', source: 'placeholder' },
  { patente: '1902', socialName: 'Centro Industrial Despacho Aduanal SC', active: true, expiry: yearsAhead(3), port: 'Guanajuato', source: 'placeholder' },

  // Aduana de Monterrey / Colombia
  { patente: '2001', socialName: 'Monterrey Customs Brokers SA de CV', active: true, expiry: yearsAhead(2), port: 'Monterrey', source: 'placeholder' },
  { patente: '2002', socialName: 'Nuevo León Despacho Aduanal SC', active: true, expiry: yearsAhead(3), port: 'Colombia', source: 'placeholder' },

  // Otros — diversos
  { patente: '2101', socialName: 'Mexicali Customs Solutions SA', active: true, expiry: yearsAhead(2), port: 'Mexicali', source: 'placeholder' },
  { patente: '2102', socialName: 'Reynosa Frontera Aduanal SC', active: true, expiry: yearsAhead(4), port: 'Reynosa', source: 'placeholder' },
  { patente: '2103', socialName: 'Progreso Marítimo Aduanal SC', active: true, expiry: yearsAhead(3), port: 'Progreso', source: 'placeholder' },
  { patente: '2104', socialName: 'Cancún Aduanal Servicios SA', active: true, expiry: yearsAhead(2), port: 'Cancún', source: 'placeholder' },
  { patente: '2105', socialName: 'Ensenada Pacífico Customs SC', active: true, expiry: yearsAhead(3), port: 'Ensenada', source: 'placeholder' },

  // Algunos para casos negativos (expirados o inactivos)
  { patente: '9001', socialName: 'Ex-Despacho Cancelado SA', active: false, expiry: '2023-12-31', port: 'Veracruz', source: 'placeholder' },
  { patente: '9002', socialName: 'Patente Expirada SC', active: true, expiry: '2024-06-30', port: 'Tijuana', source: 'placeholder' },
];

export async function seedProfessionalRegistry(prisma: PrismaClient): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const r of PROFESSIONAL_REGISTRY) {
    const result = await prisma.professionalRegistry.upsert({
      where: { patente: r.patente },
      update: {
        socialName: r.socialName,
        active: r.active,
        expiry: r.expiry ? new Date(r.expiry) : null,
        port: r.port,
        professionalType: r.professionalType ?? 'agent_customs',
        source: r.source,
        lastSyncedAt: new Date(),
      },
      create: {
        patente: r.patente,
        socialName: r.socialName,
        active: r.active,
        expiry: r.expiry ? new Date(r.expiry) : null,
        port: r.port,
        professionalType: r.professionalType ?? 'agent_customs',
        source: r.source,
        lastSyncedAt: new Date(),
      },
    });
    if (result.createdAt.getTime() > Date.now() - 5000) inserted++; else updated++;
  }
  return { inserted, updated };
}
