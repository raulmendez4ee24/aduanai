FROM node:20-alpine

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
RUN npm run build

# Copy client build to server public
RUN mkdir -p /app/server/public && cp -r /app/client/dist/* /app/server/public/

# Clean up client source (keep only server)
RUN rm -rf /app/client

WORKDIR /app/server

ENV NODE_ENV=production

# Fase 4.6 (hotfix): Prisma 7 eliminó `--url` — el comando anterior FALLABA en
# cada arranque y el error se tragaba con `2>&1;` (el esquema dejaba de migrarse
# en deploy sin que nadie lo viera). Ahora la URL se lee de prisma.config.ts
# (env DATABASE_URL). Se quita --accept-data-loss: los cambios ADITIVOS se
# aplican solos; un cambio destructivo hace fallar el push (ruidoso) y requiere
# intervención manual deliberada. El boot continúa para no tumbar el servicio.
CMD ["sh", "-c", "npx prisma db push || echo '⚠️⚠️ prisma db push FALLÓ — el esquema NO se migró; revisa el log ⚠️⚠️'; node dist/index.js"]
