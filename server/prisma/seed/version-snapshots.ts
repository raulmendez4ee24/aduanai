/**
 * Seed: Snapshots de versiones normativas — fuente única de verdad para trazabilidad.
 *
 * Cada vez que ADUANAI consulta normativa (TIGIE, LIGIE, RGCE, etc.) registra
 * cuál versión estaba activa en `ClassificationConsult.tigieVersion/...` para
 * que un auditor SAT pueda reconstruir la consulta exactamente como ocurrió.
 *
 * Idempotente: clave compuesta `(type, version)`. Re-ejecutar no duplica.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { TARIFF_VERSION } from '../../src/lib/tariff-version';

interface VersionSeed {
  type: 'TIGIE' | 'LIGIE' | 'RGCE' | 'DOF' | 'TMEC' | 'ANEXO_22' | 'ACUERDO_NOMs';
  version: string;
  publishDate: string;
  effectiveDate: string;
  expiryDate?: string;
  source?: string;
  notes?: string;
  active?: boolean;
  /** Si se omite, se calcula sobre type+version+publishDate */
  contentHash?: string;
}

function defaultHash(s: VersionSeed): string {
  return crypto.createHash('sha256')
    .update(`${s.type}|${s.version}|${s.publishDate}|${s.effectiveDate}`)
    .digest('hex');
}

export const VERSION_SNAPSHOTS: VersionSeed[] = [
  // TIGIE — versión REAL del catálogo cargado (deriva de la fuente única)
  {
    type: 'TIGIE',
    version: TARIFF_VERSION.tigie,
    publishDate: TARIFF_VERSION.publishDate,
    effectiveDate: TARIFF_VERSION.effectiveDate,
    source: TARIFF_VERSION.source,
    notes: `Vigente desde ${TARIFF_VERSION.effectiveDate} — extracto Base Única SNICE ${TARIFF_VERSION.snapshotDate} cargado en el catálogo.`,
    active: true,
  },
  {
    type: 'TIGIE',
    version: '2024-04-22',
    publishDate: '2024-04-22',
    effectiveDate: '2024-04-22',
    expiryDate: '2025-12-31',
    source: 'DOF 2024-04-22',
    notes: 'Versión anterior — consultas previas a 2026 deben referenciar esta.',
    active: false,
  },

  // LIGIE — versión REAL del catálogo cargado (deriva de la fuente única)
  {
    type: 'LIGIE',
    version: TARIFF_VERSION.ligie,
    publishDate: TARIFF_VERSION.publishDate,
    effectiveDate: TARIFF_VERSION.effectiveDate,
    source: TARIFF_VERSION.source,
    notes: 'Reforma estructural de la Ley de los Impuestos Generales de Importación y Exportación (DOF 29-dic-2025).',
    active: true,
  },
  {
    type: 'LIGIE',
    version: '2007-06-18',
    publishDate: '2007-06-18',
    effectiveDate: '2007-06-18',
    expiryDate: '2025-12-31',
    notes: 'LIGIE pre-reforma 2025. Aplica a operaciones anteriores al 2026-01-01.',
    active: false,
  },

  // RGCE
  {
    type: 'RGCE',
    version: '2026',
    publishDate: '2025-12-30',
    effectiveDate: '2026-01-01',
    source: 'DOF — Reglas Generales de Comercio Exterior 2026',
    notes: 'RGCE vigentes para operaciones del año fiscal 2026.',
    active: true,
  },

  // Anexo 22 (Pedimento)
  {
    type: 'ANEXO_22',
    version: '2026-01-01',
    publishDate: '2025-12-30',
    effectiveDate: '2026-01-01',
    source: 'DOF — Anexo 22 RGCE',
    notes: 'Instructivo de llenado del pedimento — formato y validaciones.',
    active: true,
  },

  // TMEC
  {
    type: 'TMEC',
    version: '2020-07-01',
    publishDate: '2020-06-30',
    effectiveDate: '2020-07-01',
    source: 'DOF 2020-06-30 — Decreto Promulgatorio T-MEC / USMCA',
    notes: 'Tratado entre México, EEUU y Canadá. Anexo 4-B automotriz vigente desde 2023-07-01.',
    active: true,
  },

  // Acuerdo NOMs
  {
    type: 'ACUERDO_NOMs',
    version: '2024-12-19',
    publishDate: '2024-12-19',
    effectiveDate: '2024-12-19',
    source: 'DOF 2024-12-19 — Acuerdo de NOMs (Anexo 2.4.1)',
    notes: 'Identifica fracciones TIGIE sujetas a NOMs y excepciones del Anexo 2.4.1.',
    active: true,
  },
];

export async function seedVersionSnapshots(prisma: PrismaClient): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const v of VERSION_SNAPSHOTS) {
    const data = {
      publishDate: new Date(v.publishDate),
      effectiveDate: new Date(v.effectiveDate),
      expiryDate: v.expiryDate ? new Date(v.expiryDate) : null,
      contentHash: v.contentHash ?? defaultHash(v),
      source: v.source,
      notes: v.notes,
      active: v.active ?? true,
    };
    const result = await prisma.versionSnapshot.upsert({
      where: { type_version: { type: v.type, version: v.version } },
      update: data,
      create: { type: v.type, version: v.version, ...data },
    });
    if (result.createdAt.getTime() === result.createdAt.getTime()) {
      // Discriminar insert vs update no es directo; contamos por presencia previa
    }
    inserted++; // upsert cuenta como insertado/actualizado
  }

  return { inserted, updated };
}
