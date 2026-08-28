/**
 * Regulariza la bandeja de Aprobaciones de UN tenant (cuarta revisión, prio 4).
 *
 * Qué arregla: registros SEMBRADOS (isDemoData) que quedaron en
 * `pending_approval` y que nadie propuso — inflan la bandeja y no esperan
 * revisión de nadie. Vuelven a `approved` (su estado sembrado) con un evento
 * encadenado `APPROVAL_SEED_RESTORED` por fila. NO inventa aprobador.
 *
 * Idempotente: la segunda corrida no encuentra candidatos.
 * Acotado: todo `where` lleva el tenantId que se pasa; nunca toca otro tenant.
 *
 *   npx tsx src/scripts/regularizar-aprobaciones.ts --tenant demo-tenant
 *   npx tsx src/scripts/regularizar-aprobaciones.ts --tenant demo-tenant --aplicar
 *
 * Sin `--aplicar` sólo diagnostica (dry-run).
 */
import { prisma } from '../lib/prisma';
import { diagnosticarBandeja, regularizarAprobacionesSembradas } from '../services/aprobaciones';

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const tenantId = arg('tenant');
  if (!tenantId) {
    console.error('Falta --tenant <id>. El script es deliberadamente por tenant.');
    process.exit(1);
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) {
    console.error(`Tenant ${tenantId} no existe.`);
    process.exit(1);
  }
  const aplicar = process.argv.includes('--aplicar');
  const usuario = arg('usuario') ?? null;

  const antes = await diagnosticarBandeja(tenantId);
  console.log(`\nTenant: ${tenant.name} (${tenant.id})`);
  console.log('Diagnóstico ANTES');
  console.log(`  sembrados en la bandeja      : ${antes.sembradosPendientes.clasificaciones} clasificaciones, ${antes.sembradosPendientes.cotizaciones} cotizaciones`);
  console.log(`  propuestos de verdad         : ${antes.propuestosDeVerdad.clasificaciones} clasificaciones, ${antes.propuestosDeVerdad.cotizaciones} cotizaciones`);
  console.log(`  approved SIN aprobador       : ${antes.aprobadosSinAprobador.clasificaciones} clasificaciones, ${antes.aprobadosSinAprobador.cotizaciones} cotizaciones`);
  console.log('    (esos últimos son el legado de `status @default("approved")`: se dejan como están;');
  console.log('     el paquete de Defensa los rotula "aprobación anterior al registro de aprobadores (sin dato)")\n');

  const r = await regularizarAprobacionesSembradas(tenantId, { dryRun: !aplicar, userId: usuario });
  console.log(aplicar ? 'APLICADO' : 'DRY-RUN (usa --aplicar para escribir)');
  console.log(`  clasificaciones: ${r.clasificaciones.candidatas} candidatas → ${r.clasificaciones.regularizadas} regularizadas`);
  console.log(`  cotizaciones   : ${r.cotizaciones.candidatas} candidatas → ${r.cotizaciones.regularizadas} regularizadas`);
  console.log(`  pendientes que quedan en la bandeja: ${r.pendientesRestantes}\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
