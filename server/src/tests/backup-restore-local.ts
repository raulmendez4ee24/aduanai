/**
 * Prueba local de backup + restore (Tanda 3, punto 4). NO es un test de CI:
 * requiere Postgres local y pg_dump en PATH. Se ejecuta manualmente:
 *
 *   BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32) \
 *   BACKUP_STORAGE=local BACKUP_DIR=/tmp/aduanai-backup-test \
 *   npx tsx src/tests/backup-restore-local.ts
 *
 * Ejercita: pg_dump → gzip → AES-256-GCM → checksum → storage local →
 * restore 'test' (checksum + descifrado + header del dump). El restore real a
 * una DB scratch se hace por fuera (ver docs/BACKUPS.md).
 */
import { performBackup, performRestore } from '../services/backup';
import { prisma } from '../lib/prisma';

async function main(): Promise<void> {
  if (!process.env.BACKUP_ENCRYPTION_KEY || !/^[0-9a-fA-F]{64}$/.test(process.env.BACKUP_ENCRYPTION_KEY)) {
    throw new Error('Configura BACKUP_ENCRYPTION_KEY (64 hex) para la prueba');
  }
  if ((process.env.BACKUP_STORAGE || 'local') !== 'local') {
    throw new Error('Esta prueba usa BACKUP_STORAGE=local');
  }

  const b = await performBackup('manual', 'backup-restore-local-test');
  if (!b.success) throw new Error(`Backup falló: ${b.error}`);
  const rec = await prisma.backupRecord.findUnique({ where: { id: b.backupId } });
  console.log(`backup OK id=${b.backupId} key=${rec?.storageKey} bytes=${rec?.sizeBytes} sha256=${rec?.checksumSHA256?.slice(0, 12)}…`);

  const r = await performRestore(b.backupId, 'test', 'backup-restore-local-test', 'verificación Tanda 3');
  if (!r.success) throw new Error(`Restore test falló: ${r.error}`);
  console.log(`restore(test) OK id=${r.restoreId}`);

  console.log(`ARTIFACT=${process.env.BACKUP_DIR}/${rec?.storageKey}`);
  console.log('backup-restore-local: 2 passed, 0 failed');
  await prisma.$disconnect();
}

void main().catch(err => { console.error(err); process.exit(1); });
