FROM node:20-alpine

# pg_dump/psql para el pipeline de backup/restore (backup.ts). La versión del
# cliente debe ser >= a la del servidor: prod corre PostgreSQL 18.x.
RUN apk add --no-cache postgresql18-client

WORKDIR /app

# Copy everything
COPY server/ ./server/
COPY client/ ./client/

# Build server
WORKDIR /app/server
RUN npm ci
RUN npx prisma generate
RUN npm run build

# Build client
WORKDIR /app/client
RUN npm ci
RUN npm run typecheck
RUN npm run build

# Copy client build to server public
RUN mkdir -p /app/server/public && cp -r /app/client/dist/* /app/server/public/

# Clean up client source (keep only server)
RUN rm -rf /app/client

WORKDIR /app/server

ENV NODE_ENV=production

# Tanda 3 (punto 3): migraciones versionadas. `migrate deploy` aplica solo
# migraciones de prisma/migrations (historial en git; baseline 0_init resuelto
# en prod con `migrate resolve --applied`). El `&&` es deliberado: si una
# migración falla, el contenedor sale ≠0, Railway marca el deploy FAILED y el
# deployment anterior sigue sirviendo — fallo ruidoso sin downtime, nunca un
# arranque con esquema a medias. Runbook: docs/MIGRATIONS.md.
#
# D7 (24-ago-2026): verify-no-aduana-shopping.mjs corre en CADA deploy, tras
# las migraciones y antes de arrancar — fail-closed: si alguna fila de
# glosa_risk_rules recomienda cambiar de aduana/puerto/patente, el deploy
# queda FAILED. Una corrida manual no cierra la clase; esta sí.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed/verify-no-aduana-shopping.mjs && node dist/index.js"]
