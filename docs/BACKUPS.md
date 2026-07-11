# Runbook de backups y restore

Estado documentado el 2026-07-11 (Tanda 3, punto 4).

## Arquitectura

Pipeline en `server/src/services/backup.ts`:

```
pg_dump → gzip → AES-256-GCM → SHA-256 → storage adapter (local | r2 | s3)
```

- Registro en tablas `BackupRecord` / `RestoreLog` (visibles en `/admin` → Backups).
- Cron in-process (`backup_cron` en `index.ts`, cada 30 min): daily 03:00 UTC,
  weekly domingo 04:00, monthly día 1 05:00, cleanup 06:00. Solo corre si
  `BACKUP_ENABLED=true`.
- Retención: daily 30d, weekly 84d, monthly 365d, manual 90d.
- La imagen Docker instala `postgresql18-client` (pg_dump 18.4, igual que el
  servidor de prod).

## Comportamiento fail-closed (desde Tanda 3)

- `BACKUP_ENCRYPTION_KEY` ausente o inválida **en producción** → el backup se
  aborta con `backup_ephemeral_key_refused` (un backup cifrado con llave
  efímera es irrecuperable; aparentar que existe es peor que fallar).
- `BACKUP_STORAGE=r2|s3` sin credenciales completas → error explícito con la
  lista de variables faltantes. Ya **no** degrada en silencio a storage local.
- `BACKUP_STORAGE=local` en producción → warning `backup_storage_local_prod`
  en cada arranque del adapter (el destino es efímero: se pierde en cada deploy).

## Variables de entorno

| Variable | Requerida | Notas |
|---|---|---|
| `BACKUP_ENABLED` | para activar el cron | `true` para que el cron dispare backups |
| `BACKUP_ENCRYPTION_KEY` | sí (prod) | 64 hex chars (32 bytes). Generar: `openssl rand -hex 32`. **Guardarla también fuera de Railway** (gestor de secretos); sin ella los backups no se pueden descifrar |
| `BACKUP_STORAGE` | sí | `r2` (Cloudflare) o `s3` (AWS). `local` solo dev |
| `BACKUP_S3_BUCKET` | r2/s3 | nombre del bucket |
| `BACKUP_S3_ACCESS_KEY_ID` | r2/s3 | credencial |
| `BACKUP_S3_SECRET_ACCESS_KEY` | r2/s3 | credencial |
| `BACKUP_S3_ENDPOINT` | r2 | `https://<account_id>.r2.cloudflarestorage.com` |
| `BACKUP_S3_REGION` | s3 | p.ej. `us-east-1` (R2 usa `auto` por default) |
| `BACKUP_DIR` | no | solo storage local (default `/tmp/aduanai-backups`) |
| `OPERATIONS_EMAIL` | no | destinatario de alertas de backup fallido |

## Qué falta configurar en prod (a 2026-07-11)

Ninguna variable `BACKUP_*` existe en el servicio `kanaduana`. Para dejar el
backup de aplicación operando se necesita (no inventamos credenciales — las
provee el operador):

1. Crear bucket R2/S3 dedicado (sugerido: `aduanai-backups`, acceso privado).
2. En Railway → kanaduana → Variables: `BACKUP_ENABLED=true`,
   `BACKUP_ENCRYPTION_KEY=<openssl rand -hex 32>`, `BACKUP_STORAGE=r2|s3` y las
   credenciales de la tabla de arriba.
3. Redeploy y verificar el primer backup: `POST /api/admin/backups/run` o
   esperar el cron de las 03:00 UTC; revisar `BackupRecord` y el log
   `backup_success`.

## Backups administrados de Railway

Verificado por API el 2026-07-11: el volumen del Postgres de prod
(`postgres-volume-isHw` / servicio Postgres-OSSC) tiene **0 backups y 0
schedules** — no hay red de seguridad administrada hoy. Railway soporta
backups nativos de volumen (incrementales, se configuran por volumen en el
dashboard: Postgres-OSSC → Volume → Backups). Recomendado activarlos como
segunda capa además del backup de aplicación (el dump lógico cifrado es el
que permite restore selectivo y a otra infraestructura).

## Restore

- **Prueba de integridad** (no toca datos): `performRestore(backupId, 'test', …)`
  — descarga, verifica SHA-256, descifra, descomprime y valida el header del dump.
- **Restore real**: `performRestore(backupId, 'full', …)` aplica el dump con
  `psql "$DATABASE_URL"`. ⚠️ Sobreescribe la DB destino; hacerlo contra una DB
  limpia o instancia nueva, nunca directo sobre prod sin decisión explícita.
- **Manual (sin app)**: descargar el `.sql.gz.enc` y descifrarlo con Node
  (formato: `[12B IV][ciphertext][16B authTag]`, AES-256-GCM, misma lógica que
  `decryptFile` en `backup.ts`):
  ```sh
  node -e '
  const c=require("crypto"),f=require("fs");
  const [inF,outF]=process.argv.slice(1);
  const d=f.readFileSync(inF);
  const dec=c.createDecipheriv("aes-256-gcm",Buffer.from(process.env.BACKUP_ENCRYPTION_KEY,"hex"),d.subarray(0,12));
  dec.setAuthTag(d.subarray(d.length-16));
  f.writeFileSync(outF,Buffer.concat([dec.update(d.subarray(12,d.length-16)),dec.final()]));
  ' archivo.sql.gz.enc archivo.sql.gz
  gunzip archivo.sql.gz
  psql "$DATABASE_URL_DESTINO" < archivo.sql
  ```

## Prueba realizada (2026-07-11, local)

Backup manual de la DB local (réplica de prod, PG16) → restore `test` OK
(checksum + descifrado + header) → restore real a una DB scratch
`aduanai_restore_test` con `psql`, verificando conteo de tablas y filas de
`fractions` idéntico al origen. Evidencia en el reporte de la Tanda 3.
