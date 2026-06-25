// PASO 2 (prueba del blindaje): con la tabla version_snapshots VACÍA en prod,
// getActiveVersions() NO debe devolver 'unknown' — debe caer a la constante real.
import { prisma } from '../dist/lib/prisma.js';
import { getActiveVersions } from '../dist/services/traceability.js';

async function main() {
  const count = await prisma.versionSnapshot.count();
  console.log('version_snapshots filas:', count, count === 0 ? '(VACÍA — probamos el fallback)' : '(ya tiene datos)');

  const v = await getActiveVersions();
  console.log('getActiveVersions() →');
  console.log('  tigie:', v.tigie);
  console.log('  ligie:', v.ligie);

  const hasUnknown = v.tigie === 'unknown' || v.ligie === 'unknown';
  console.log('\n', hasUnknown
    ? '⚠️ AÚN devuelve unknown — el blindaje NO está activo'
    : '✅ SIN unknown — fallback a la constante real OK (Paso 2)');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
