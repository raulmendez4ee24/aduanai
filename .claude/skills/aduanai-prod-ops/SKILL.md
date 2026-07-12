---
name: aduanai-prod-ops
description: Use when operating ADUANAI production on Railway - checking deploys, reading logs, querying the prod database, verifying health, or running one-off scripts against prod. Also when local .env data differs from what users see (local is a replica; prod is only reachable via railway ssh).
---

# ADUANAI Prod Ops (Railway)

Proyecto Railway `aduanai`, servicio de la app = **`kanaduana`** (los demás servicios son Postgres; el vivo es **Postgres-OSSC**). `server/.env` local apunta a una **réplica local** — nunca es prod.

## Deploys
```sh
railway deployment list --service kanaduana | head -3   # estado (SUCCESS/BUILDING/FAILED)
railway logs --service kanaduana | grep -E "migrat|timer|error"
curl -s https://kanaduana-production.up.railway.app/api/health
```
El deployment más reciente sale de cada push a `main`. Si un deploy FAILED, el anterior sigue sirviendo.

## Queries y scripts contra la DB de prod
El único camino es `railway ssh` al servicio de la app. Reglas aprendidas (costaron iteraciones):
1. El script DEBE vivir en `/app/server` (resolución de node_modules) — `/tmp` falla.
2. Usa `pg` directo (`new Client({connectionString: process.env.DATABASE_URL})`); `new PrismaClient()` truena en Prisma 7 (exige adapter).
3. Patrón base64 (evita todo problema de quoting):
```sh
B64=$(base64 -i script.js | tr -d '\n')
railway ssh --service kanaduana "echo '$B64' | base64 -d > /app/server/__x.js && node /app/server/__x.js; rm -f /app/server/__x.js"
```

## Migraciones y backups
- Esquema: prod corre `prisma migrate deploy` en el arranque (falla ruidosa). Flujo completo y recuperación: `docs/MIGRATIONS.md`. **`prisma db push` contra prod está prohibido.**
- Backups y restore: `docs/BACKUPS.md` (pipeline cifrado, variables `BACKUP_*`, restore de prueba).

## Errores conocidos
- `psql` no está en PATH local: usar `/opt/homebrew/opt/postgresql@16/bin`.
- La URL local lleva `?schema=public` — quitarlo para `psql`/`pg_dump`.
- zsh aborta cadenas enteras si un glob no matchea (`rm -f /tmp/x-*.json && …`): separa comandos.
