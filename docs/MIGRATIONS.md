# Runbook de migraciones de esquema (Prisma Migrate)

Vigente desde la Tanda 3 (2026-07-11). Antes de esto prod corría `prisma db
push` en cada arranque, sin historial ni gate. Ahora el esquema se versiona en
`server/prisma/migrations/` y prod solo aplica migraciones con `migrate deploy`.

## Cómo quedó armado

- **Baseline**: `0_init` (2,815 líneas, 84 tablas) generado con
  `migrate diff --from-empty`, validado reconstruyendo una DB limpia, y
  registrado en prod con `migrate resolve --applied 0_init` (solo metadata en
  `_prisma_migrations`; cero DDL sobre datos existentes).
- **Arranque de prod** (CMD del Dockerfile):
  `npx prisma migrate deploy && node dist/index.js` — si una migración falla,
  el contenedor sale con código ≠ 0, Railway marca el deploy **FAILED** y el
  deployment anterior sigue sirviendo. No hay modo silencioso.
- Prisma 7 lee el datasource de `server/prisma.config.ts` (env `DATABASE_URL`).

## Crear una migración (flujo normal)

1. Edita `server/prisma/schema.prisma`.
2. En local (usa tu réplica, nunca prod):
   ```sh
   cd server
   npx prisma migrate dev --name descripcion_corta
   ```
   Esto genera `prisma/migrations/<timestamp>_descripcion_corta/migration.sql`,
   lo aplica a tu DB local y regenera el client.
3. Revisa el SQL generado (especialmente `DROP`/`ALTER` con pérdida potencial).
4. Commit del schema + la carpeta de migración. Al hacer push, el deploy de
   Railway ejecuta `migrate deploy` y la aplica en prod antes de arrancar.

## Si el deploy falla por migración

1. El deployment queda FAILED; el anterior sigue vivo. Lee el log del deploy —
   `migrate deploy` imprime qué migración falló y por qué.
2. Una migración fallida queda registrada como *failed* en
   `_prisma_migrations` y bloquea las siguientes. Opciones:
   - Si NO llegó a aplicar nada: corrige el SQL y
     `npx prisma migrate resolve --rolled-back <nombre>` (vía
     `railway ssh --service kanaduana`, en `/app/server`), luego redeploy.
   - Si aplicó parcialmente: repara a mano el estado (SQL directo), después
     `migrate resolve --applied <nombre>` o `--rolled-back` según el estado
     real, y redeploy. Documenta lo que hiciste en el PR.

## Rollback

Nunca edites una migración ya aplicada (el checksum en `_prisma_migrations`
la detectaría y todo deploy fallaría). Para revertir un cambio: nueva
migración inversa (`migrate dev --name revert_x`).

## Reglas

- `prisma db push` queda **prohibido contra prod** (solo prototipos locales).
- `migrate resolve` es herramienta de excepción (baseline/reparación), no
  parte del flujo normal.
- `server/prisma/migrations/` vive en git (se quitó del .gitignore en dc08b13).
- Cambio destructivo (DROP columna/tabla): plan de dos pasos (expand/contract)
  y backup manual previo (`docs/BACKUPS.md`).
