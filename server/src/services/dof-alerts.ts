import { PrismaClient } from '@prisma/client';

// Servicio de generación de alertas regulatorias
// En producción: scrapea DOF diariamente
// Por ahora: genera alertas de ejemplo para demo

const SAMPLE_ALERTS = [
  {
    type: 'tariff_change',
    title: 'Cambio de arancel — Capítulo 72 (Acero)',
    content: 'Se publicó en el DOF un decreto que modifica temporalmente los aranceles de importación de productos de acero laminado (partidas 7208-7212). Arancel temporal del 25% vigente hasta el 31/dic/2026.',
    fractionCodes: ['72082501'],
  },
  {
    type: 'new_regulation',
    title: 'Nueva NOM para electrodomésticos',
    content: 'La NOM-015-ENER-2018 se actualiza a NOM-015-ENER-2026, con nuevos requisitos de eficiencia energética para refrigeradores y congeladores domésticos. Entrada en vigor: 1/jul/2026.',
    fractionCodes: ['84182101'],
  },
  {
    type: 'tariff_change',
    title: 'Extensión de arancel preferencial TMEC — Textiles',
    content: 'Se amplía la cuota de importación preferencial para prendas de vestir de algodón originarias de EE.UU. y Canadá bajo el TMEC. Aplica a fracciones del capítulo 61 y 62.',
    fractionCodes: ['61091001', '62034201'],
  },
  {
    type: 'new_regulation',
    title: 'Actualización padrón sectorial — Calzado',
    content: 'Se modifica el Anexo 10 de las RGCE 2026. Nuevos requisitos para el padrón sectorial de importadores de calzado. Plazo de cumplimiento: 90 días naturales.',
    fractionCodes: ['64039901'],
  },
  {
    type: 'weekly_summary',
    title: 'Resumen semanal — Cambios regulatorios',
    content: 'Esta semana se publicaron 3 decretos en el DOF relacionados con comercio exterior: 1) Modificación de aranceles temporales para acero, 2) Actualización de NOM-015-ENER, 3) Cuotas compensatorias para calzado de origen chino.',
    fractionCodes: [],
  },
  {
    type: 'tariff_change',
    title: 'Cuotas compensatorias — Calzado origen China',
    content: 'Se imponen cuotas compensatorias definitivas a la importación de calzado con suela de caucho o plástico originario de China. Cuota: 1.31 USD/par. Vigencia: 5 años.',
    fractionCodes: ['64029901', '64039901'],
  },
  {
    type: 'new_regulation',
    title: 'COFEPRIS — Nuevos requisitos cosméticos',
    content: 'Se publica el Acuerdo que establece nuevos requisitos sanitarios para la importación de productos cosméticos y de higiene personal. Aplica a fracciones del capítulo 33.',
    fractionCodes: ['33049901'],
  },
];

export async function generateDemoAlerts(prisma: PrismaClient, tenantId: string) {
  const existing = await prisma.alert.count({
    where: { tenantId, type: { not: 'watch' } },
  });

  // Solo generar si no hay alertas previas (excepto watches)
  if (existing > 0) return;

  for (const alert of SAMPLE_ALERTS) {
    await prisma.alert.create({
      data: {
        tenantId,
        channel: 'IN_APP',
        type: alert.type,
        title: alert.title,
        content: alert.content,
        fractionCodes: alert.fractionCodes,
        read: false,
      },
    });
  }

  console.log(`📢 ${SAMPLE_ALERTS.length} alertas demo generadas para tenant ${tenantId}`);
}
