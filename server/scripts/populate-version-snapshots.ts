// PASO 4: pobla version_snapshots en prod con la versión REAL del catálogo.
// Deriva TIGIE/LIGIE de la fuente única (TARIFF_VERSION). Idempotente (upsert
// por clave [type, version]). NO toca ClassificationConsult (las 32 históricas
// se dejan en 'unknown' por integridad del audit trail).
import { prisma } from '../dist/lib/prisma.js';
import { TARIFF_VERSION } from '../dist/lib/tariff-version.js';
import crypto from 'crypto';

const hash = (type: string, version: string, p: string, e: string) =>
  crypto.createHash('sha256').update(`${type}|${version}|${p}|${e}`).digest('hex');

interface Row { type: string; version: string; publishDate: string; effectiveDate: string; expiryDate?: string; source?: string; notes?: string; active: boolean; }

const ROWS: Row[] = [
  // TIGIE / LIGIE — versión REAL cargada (fuente única)
  { type: 'TIGIE', version: TARIFF_VERSION.tigie, publishDate: TARIFF_VERSION.publishDate, effectiveDate: TARIFF_VERSION.effectiveDate, source: TARIFF_VERSION.source, notes: `Extracto Base Única SNICE ${TARIFF_VERSION.snapshotDate} cargado en el catálogo.`, active: true },
  { type: 'LIGIE', version: TARIFF_VERSION.ligie, publishDate: TARIFF_VERSION.publishDate, effectiveDate: TARIFF_VERSION.effectiveDate, source: TARIFF_VERSION.source, notes: 'Reforma estructural LIGIE (DOF 29-dic-2025).', active: true },
  // Históricas inactivas (referencia para operaciones previas)
  { type: 'TIGIE', version: '2024-04-22', publishDate: '2024-04-22', effectiveDate: '2024-04-22', expiryDate: '2025-12-31', source: 'DOF 2024-04-22', notes: 'Versión anterior — consultas previas a 2026.', active: false },
  { type: 'LIGIE', version: '2007-06-18', publishDate: '2007-06-18', effectiveDate: '2007-06-18', expiryDate: '2025-12-31', notes: 'LIGIE pre-reforma 2025.', active: false },
  // Otras normativas activas
  { type: 'RGCE', version: '2026', publishDate: '2025-12-30', effectiveDate: '2026-01-01', source: 'DOF — Reglas Generales de Comercio Exterior 2026', notes: 'RGCE vigentes para 2026.', active: true },
  { type: 'ANEXO_22', version: '2026-01-01', publishDate: '2025-12-30', effectiveDate: '2026-01-01', source: 'DOF — Anexo 22 RGCE', notes: 'Instructivo de llenado del pedimento.', active: true },
  { type: 'TMEC', version: '2020-07-01', publishDate: '2020-06-30', effectiveDate: '2020-07-01', source: 'DOF 2020-06-30 — Decreto Promulgatorio T-MEC', notes: 'Tratado MX-EEUU-Canadá.', active: true },
  { type: 'ACUERDO_NOMs', version: '2024-12-19', publishDate: '2024-12-19', effectiveDate: '2024-12-19', source: 'DOF 2024-12-19 — Acuerdo de NOMs (Anexo 2.4.1)', notes: 'Fracciones TIGIE sujetas a NOMs.', active: true },
];

async function main() {
  console.log('version_snapshots ANTES:', await prisma.versionSnapshot.count());
  for (const r of ROWS) {
    const data = {
      publishDate: new Date(r.publishDate),
      effectiveDate: new Date(r.effectiveDate),
      expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
      contentHash: hash(r.type, r.version, r.publishDate, r.effectiveDate),
      source: r.source ?? null,
      notes: r.notes ?? null,
      active: r.active,
    };
    await prisma.versionSnapshot.upsert({
      where: { type_version: { type: r.type as any, version: r.version } },
      update: data,
      create: { type: r.type as any, version: r.version, ...data },
    });
    console.log(`  ✓ ${r.active ? 'ACTIVA  ' : 'inactiva'} ${r.type} → ${r.version.slice(0, 60)}`);
  }
  console.log('version_snapshots DESPUÉS:', await prisma.versionSnapshot.count());

  // Verificación: la fuente única (tabla) ahora devuelve la versión real
  const { getActiveVersions } = await import('../dist/services/traceability.js');
  const v = await getActiveVersions();
  console.log('\ngetActiveVersions() (desde la TABLA) →');
  console.log('  tigie:', v.tigie);
  console.log('  ligie:', v.ligie);
  console.log('  rgce :', v.rgce, '| tmec:', v.tmec, '| acuerdoNoms:', v.acuerdoNoms);
  const ok = v.tigie === TARIFF_VERSION.tigie && v.ligie === TARIFF_VERSION.ligie;
  console.log('\n', ok ? '✅ La tabla coincide con la fuente única (Paso 4)' : '⚠️ divergencia tabla vs constante');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
