/**
 * Backfill de `clienteId` acotado por tenant (Operación 2026-08, Ola 1).
 *
 * Crea (idempotente) el Cliente propio del tenant (su RFC) y liga a él las
 * filas históricas con `clienteId = null`. NUNCA cruza tenants.
 *
 *   npx tsx src/scripts/backfill-cliente.ts <tenantId> [clienteIdDestino]
 *   npx tsx src/scripts/backfill-cliente.ts --todos        (cada tenant → su propio cliente)
 */
import { prisma } from '../lib/prisma';
import { backfillClienteDelTenant } from '../services/clientes';
import { logger } from '../lib/logger';

async function main(): Promise<void> {
  const [arg, destino] = process.argv.slice(2);
  if (!arg) {
    console.error('Uso: backfill-cliente.ts <tenantId> [clienteId] | --todos');
    process.exit(1);
  }
  const tenantIds = arg === '--todos'
    ? (await prisma.tenant.findMany({ select: { id: true } })).map(t => t.id)
    : [arg];
  for (const tenantId of tenantIds) {
    const r = await backfillClienteDelTenant(tenantId, arg === '--todos' ? undefined : destino);
    const total = Object.values(r.tocadas).reduce((a, b) => a + b, 0);
    logger.info('[backfill-cliente] tenant listo', { tenantId, metadata: { clienteId: r.clienteId, total, tocadas: r.tocadas } });
    console.log(`${tenantId} → cliente ${r.clienteId}: ${total} filas`, r.tocadas);
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
