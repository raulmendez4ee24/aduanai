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

CMD ["sh", "-c", "npx prisma db push --url \"$DATABASE_URL\" --accept-data-loss 2>&1; node dist/index.js"]
