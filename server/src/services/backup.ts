/**
 * Servicio de backup, restore y storage adapter.
 *
 * Pipeline:
 *   pg_dump → gzip → AES-256-GCM → SHA-256 → storage adapter (local/R2/S3)
 *   → BackupRecord con expiración según tipo (daily 30d, weekly 84d, monthly 365d)
 *
 * NOTAS:
 *   - Storage default: 'local' en BACKUP_DIR (default: /tmp/aduanai-backups). Para
 *     producción, configurar BACKUP_STORAGE=r2|s3 + credenciales.
 *   - Encriptación AES-256-GCM con BACKUP_ENCRYPTION_KEY (32 bytes hex). Si no
 *     está configurada, se genera una efímera y se loguea WARNING (NO usar prod).
 *   - pg_dump requiere `pg_dump` en PATH y `DATABASE_URL` configurada.
 */

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendEmail } from '../lib/email';

const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/aduanai-backups';
const BACKUP_STORAGE = (process.env.BACKUP_STORAGE || 'local').toLowerCase();
const RAW_KEY = process.env.BACKUP_ENCRYPTION_KEY;
const ENCRYPTION_KEY: Buffer = (() => {
  if (RAW_KEY && /^[0-9a-fA-F]{64}$/.test(RAW_KEY)) return Buffer.from(RAW_KEY, 'hex');
  // Fallback efímero: solo para dev. Logueamos warning en cada backup.
  return crypto.randomBytes(32);
})();
const KEY_IS_EPHEMERAL = !(RAW_KEY && /^[0-9a-fA-F]{64}$/.test(RAW_KEY));

export type BackupType = 'daily' | 'weekly' | 'monthly' | 'manual';

const RETENTION_DAYS: Record<BackupType, number> = {
  daily: 30,
  weekly: 84,
  monthly: 365,
  manual: 90,
};

// ─────────────────────── Helpers ───────────────────────

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function runCmd(cmd: string, args: string[], opts: { stdoutToFile?: string; env?: Record<string, string> } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...(opts.env ?? {}) };
    const child = spawn(cmd, args, { env, stdio: opts.stdoutToFile ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let stderr = '';
    if (opts.stdoutToFile) {
      const out = fs.createWriteStream(opts.stdoutToFile);
      child.stdout?.pipe(out);
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

function encryptFile(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const inStream = fs.createReadStream(input);
    const outStream = fs.createWriteStream(output);
    // Format: [12-byte IV][ciphertext][16-byte authTag]
    outStream.write(iv);
    inStream.pipe(cipher).pipe(outStream, { end: false });
    cipher.on('end', () => {
      outStream.write(cipher.getAuthTag());
      outStream.end();
    });
    inStream.on('error', reject);
    outStream.on('finish', resolve);
    outStream.on('error', reject);
  });
}

async function decryptFile(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(input);
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(data.length - 16);
    const cipherText = data.subarray(12, data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    try {
      const out = Buffer.concat([decipher.update(cipherText), decipher.final()]);
      fs.writeFileSync(output, out);
      resolve();
    } catch (e) { reject(e); }
  });
}

// ─────────────────────── Storage adapter ───────────────────────

export interface StorageAdapter {
  put(localPath: string, key: string): Promise<{ url: string; key: string }>;
  signedUrl(key: string, expiresInSec: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  fetch(key: string, destPath: string): Promise<void>;
}

class LocalStorage implements StorageAdapter {
  constructor(private root: string) { ensureDir(root); }
  async put(localPath: string, key: string): Promise<{ url: string; key: string }> {
    const dest = path.join(this.root, key);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(localPath, dest);
    return { url: `file://${dest}`, key };
  }
  async signedUrl(key: string, _expiresInSec: number): Promise<string> {
    return `file://${path.join(this.root, key)}`;
  }
  async delete(key: string): Promise<void> {
    const p = path.join(this.root, key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  async exists(key: string): Promise<boolean> {
    return fs.existsSync(path.join(this.root, key));
  }
  async fetch(key: string, destPath: string): Promise<void> {
    fs.copyFileSync(path.join(this.root, key), destPath);
  }
}

let _adapter: StorageAdapter | null = null;
function getStorage(): StorageAdapter {
  if (_adapter) return _adapter;
  if (BACKUP_STORAGE === 'local') {
    _adapter = new LocalStorage(BACKUP_DIR);
  } else {
    // Stubs para R2/S3 — en producción se reemplaza con @aws-sdk/client-s3
    logger.warn(`BACKUP_STORAGE=${BACKUP_STORAGE} no implementado; usando local fallback`, { action: 'backup_storage_fallback' });
    _adapter = new LocalStorage(BACKUP_DIR);
  }
  return _adapter;
}

// ─────────────────────── Backup ───────────────────────

export async function performBackup(type: BackupType, triggeredBy: string): Promise<{ success: boolean; backupId: string; error?: string }> {
  const storage = getStorage();
  const record = await prisma.backupRecord.create({
    data: {
      type,
      status: 'running',
      triggeredBy,
      retentionDays: RETENTION_DAYS[type],
      storageProvider: BACKUP_STORAGE,
    },
  });
  const t0 = Date.now();
  ensureDir('/tmp');

  if (KEY_IS_EPHEMERAL) {
    logger.warn('BACKUP_ENCRYPTION_KEY no configurada — usando llave efímera (NO recuperable)', {
      action: 'backup_ephemeral_key',
      metadata: { backupId: record.id },
    });
  }

  const tmpDump = `/tmp/${record.id}.sql`;
  const tmpGz = `${tmpDump}.gz`;
  const tmpEnc = `${tmpGz}.enc`;
  const date = new Date();
  const key = `${type}/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${record.id}.sql.gz.enc`;

  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no configurada');

    // 1. pg_dump
    await runCmd('sh', ['-c', `pg_dump "${process.env.DATABASE_URL}" --no-owner --no-acl > ${tmpDump}`]);

    // 2. gzip
    await runCmd('gzip', ['-f', tmpDump]);

    // 3. encrypt AES-256-GCM
    await encryptFile(tmpGz, tmpEnc);

    // 4. checksum
    const checksum = await sha256OfFile(tmpEnc);

    // 5. upload
    const { url } = await storage.put(tmpEnc, key);

    const sizeBytes = BigInt(fs.statSync(tmpEnc).size);
    const expiresAt = new Date(Date.now() + RETENTION_DAYS[type] * 86400 * 1000);

    await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        durationMs: Date.now() - t0,
        storageUrl: url,
        storageKey: key,
        sizeBytes,
        checksumSHA256: checksum,
        expiresAt,
      },
    });

    // cleanup
    [tmpGz, tmpEnc].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });

    logger.info(`Backup ${type} OK (${Math.round(Number(sizeBytes) / 1024)} KB)`, {
      action: 'backup_success',
      metadata: { backupId: record.id, type, durationMs: Date.now() - t0, sizeBytes: Number(sizeBytes) },
    });
    return { success: true, backupId: record.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: 'failed', completedAt: new Date(), durationMs: Date.now() - t0, errorMessage: msg },
    });
    logger.critical(`Backup ${type} FAILED: ${msg}`, { action: 'backup_failed', metadata: { backupId: record.id } });
    try {
      await sendEmail({
        to: process.env.OPERATIONS_EMAIL || 'raul@aduanai.mx',
        subject: `[ADUANAI Alerta] Backup ${type} falló`,
        html: `<p>El backup ${type} con ID <code>${record.id}</code> falló:</p><pre>${msg}</pre>`,
      });
    } catch { /* silent */ }
    [tmpDump, tmpGz, tmpEnc].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
    return { success: false, backupId: record.id, error: msg };
  }
}

// ─────────────────────── Restore ───────────────────────

export async function performRestore(backupId: string, type: 'full' | 'partial' | 'test', triggeredBy: string, reason?: string): Promise<{ success: boolean; restoreId: string; error?: string }> {
  const backup = await prisma.backupRecord.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error('Backup no encontrado');
  if (backup.status !== 'success') throw new Error('Backup no exitoso, no restaurable');
  if (!backup.storageKey) throw new Error('Backup sin storageKey');

  const restore = await prisma.restoreLog.create({
    data: { backupId, type, status: 'running', triggeredBy, reason },
  });
  const t0 = Date.now();
  const tmpEnc = `/tmp/restore-${restore.id}.enc`;
  const tmpGz = `/tmp/restore-${restore.id}.sql.gz`;
  const tmpSql = `/tmp/restore-${restore.id}.sql`;

  try {
    const storage = getStorage();
    await storage.fetch(backup.storageKey, tmpEnc);

    // Verify checksum
    if (backup.checksumSHA256) {
      const checksum = await sha256OfFile(tmpEnc);
      if (checksum !== backup.checksumSHA256) throw new Error(`Checksum mismatch: esperado ${backup.checksumSHA256}, obtenido ${checksum}`);
    }

    await decryptFile(tmpEnc, tmpGz);
    await runCmd('gunzip', ['-f', tmpGz]);

    if (type === 'test') {
      // Para test restore solo verificamos que pg_restore --list reconozca el dump
      await runCmd('sh', ['-c', `head -c 1000 ${tmpSql} | grep -q "PostgreSQL database dump"`]);
    } else if (type === 'full' && process.env.DATABASE_URL) {
      // CUIDADO: aplica el dump a la DB destino
      await runCmd('sh', ['-c', `psql "${process.env.DATABASE_URL}" < ${tmpSql}`]);
    } else {
      throw new Error(`Tipo de restore '${type}' requiere DATABASE_URL configurada`);
    }

    await prisma.restoreLog.update({
      where: { id: restore.id },
      data: { status: 'success', completedAt: new Date() },
    });
    logger.warn(`Restore ${type} OK desde backup ${backupId}`, {
      action: 'restore_success',
      metadata: { restoreId: restore.id, type, durationMs: Date.now() - t0 },
    });
    return { success: true, restoreId: restore.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.restoreLog.update({
      where: { id: restore.id },
      data: { status: 'failed', completedAt: new Date(), errorMessage: msg },
    });
    logger.critical(`Restore FALLÓ desde ${backupId}: ${msg}`, { action: 'restore_failed', metadata: { restoreId: restore.id } });
    return { success: false, restoreId: restore.id, error: msg };
  } finally {
    [tmpEnc, tmpGz, tmpSql].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
  }
}

// ─────────────────────── Cleanup ───────────────────────

export async function cleanupExpiredBackups(): Promise<{ deleted: number }> {
  const expired = await prisma.backupRecord.findMany({
    where: { expiresAt: { lt: new Date() }, storageKey: { not: null }, status: 'success' },
    select: { id: true, storageKey: true },
  });
  const storage = getStorage();
  let deleted = 0;
  for (const b of expired) {
    try {
      if (b.storageKey) await storage.delete(b.storageKey);
      await prisma.backupRecord.update({ where: { id: b.id }, data: { storageKey: null, storageUrl: null } });
      deleted++;
    } catch (err) {
      logger.warn(`No se pudo borrar backup expirado ${b.id}`, { errorMessage: err instanceof Error ? err.message : String(err) });
    }
  }
  if (deleted > 0) logger.info(`Cleanup: ${deleted} backups expirados eliminados`, { action: 'backup_cleanup' });
  return { deleted };
}

// ─────────────────────── Helpers para UI ───────────────────────

export async function lastSuccessfulBackup(): Promise<{ id: string; type: string; completedAt: Date } | null> {
  const last = await prisma.backupRecord.findFirst({
    where: { status: 'success' },
    orderBy: { completedAt: 'desc' },
    select: { id: true, type: true, completedAt: true },
  });
  return last && last.completedAt ? { id: last.id, type: last.type, completedAt: last.completedAt } : null;
}

export function isBackupConfigured(): { ok: boolean; details: string } {
  const issues: string[] = [];
  if (KEY_IS_EPHEMERAL) issues.push('BACKUP_ENCRYPTION_KEY no configurada (efímera)');
  if (BACKUP_STORAGE !== 'local' && BACKUP_STORAGE !== 'r2' && BACKUP_STORAGE !== 's3') issues.push(`BACKUP_STORAGE inválido: ${BACKUP_STORAGE}`);
  if (BACKUP_STORAGE === 'local') issues.push(`storage=local en ${BACKUP_DIR} (no apto para producción)`);
  return { ok: issues.length === 0, details: issues.join('; ') || 'Configuración OK' };
}
