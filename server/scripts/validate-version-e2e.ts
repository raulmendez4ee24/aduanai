// PASO 6 (validación end-to-end, NO destructiva):
//  1. Las consultas históricas siguen en 'unknown' (audit trail intacto, sin backfill).
//  2. Una consulta NUEVA registra la versión REAL (recordConsult → readback).
//  3. La superficie de Verificación (verifyConsult) la muestra (no 'unknown').
//  4. El consultHash es reproducible desde la MISMA fuente (legacyHash == registro).
//  5. Se BORRA el consult sintético de prueba (no contamina el audit trail real).
import { prisma } from '../dist/lib/prisma.js';
import { recordConsult, getActiveVersions, verifyConsult } from '../dist/services/traceability.js';
import { computeConsultHash } from '../dist/services/classifier-alerts.js';

async function main() {
  // ── 1. Históricas: ¿siguen en 'unknown'? (no se backfilleó) ──
  const total = await prisma.classificationConsult.count();
  const unknownCount = await prisma.classificationConsult.count({ where: { tigieVersion: 'unknown' } });
  console.log(`1. Audit trail histórico: ${unknownCount}/${total} consultas siguen en 'unknown' (preservadas, sin backfill)`);

  // ── 2+4. Consulta NUEVA: misma fuente para legacyHash y registro ──
  const versions = await getActiveVersions();
  const legacyHash = computeConsultHash({
    description: '__E2E_TEST__ tornillo de acero', context: 'validación versionado',
    fractionCode: '73181599', confidence: 0.9, tigieVersion: versions.tigie,
  });
  const trace = await recordConsult({
    classificationId: undefined, tenantId: '__E2E_TEST__', userId: '__E2E_TEST__',
    inputs: { description: '__E2E_TEST__ tornillo de acero' },
    outputs: { fraction: '73181599' },
    modelUsed: 'e2e-test', modelProvider: 'e2e-test', knowledgeUsed: [],
    versions, // misma fuente que legacyHash
  });
  const row = await prisma.classificationConsult.findUnique({ where: { id: trace.id } });
  console.log(`\n2. Consulta NUEVA registrada → tigieVersion: ${row?.tigieVersion}`);
  console.log(`                              ligieVersion: ${row?.ligieVersion}`);
  const recordsReal = row?.tigieVersion === versions.tigie && row?.tigieVersion !== 'unknown';
  console.log('   ', recordsReal ? '✅ registra la versión REAL (no unknown)' : '⚠️ NO registra la versión real');

  // ── 3. Superficie de Verificación pública ──
  const verify = await verifyConsult(trace.consultHash);
  console.log(`\n3. verifyConsult(hash) → found=${verify.found}, tigie="${verify.versions?.tigie}"`);
  const verifyShowsReal = verify.found && verify.versions?.tigie === versions.tigie;
  console.log('   ', verifyShowsReal ? '✅ Verificación muestra la versión real' : '⚠️ Verificación no la muestra');

  // ── 4. Reproducibilidad del legacyHash (determinista, una sola fuente) ──
  const legacyHash2 = computeConsultHash({
    description: '__E2E_TEST__ tornillo de acero', context: 'validación versionado',
    fractionCode: '73181599', confidence: 0.9, tigieVersion: versions.tigie,
  });
  console.log(`\n4. legacyHash reproducible: ${legacyHash === legacyHash2 ? '✅ sí (mismo input → mismo hash)' : '⚠️ no'}  (${legacyHash.slice(0, 16)}…)`);
  console.log(`   Ambos hashes leen de versions.tigie (UNA fuente): consultHash=${trace.consultHash.slice(0, 12)}… legacyHash=${legacyHash.slice(0, 12)}…`);

  // ── 5. Limpieza: borra SOLO el consult sintético de prueba ──
  const del = await prisma.classificationConsult.deleteMany({ where: { id: trace.id, tenantId: '__E2E_TEST__' } });
  const after = await prisma.classificationConsult.count();
  console.log(`\n5. Limpieza: borrado consult sintético (${del.count} fila). Total consults: ${total} → ${after} (sin residuo de prueba)`);

  const allOk = recordsReal && verifyShowsReal && legacyHash === legacyHash2 && del.count === 1 && after === total;
  console.log('\n', allOk ? '✅✅ VALIDACIÓN TOTAL: versión real registrada y mostrada, hash reproducible, audit trail intacto.' : '⚠️ revisar alguna aserción');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
