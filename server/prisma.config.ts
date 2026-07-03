/**
 * Config de Prisma 7 (Fase 4.6 — hotfix de drift de esquema).
 *
 * Prisma 7 eliminó los flags `--url` de la CLI (db push/execute/migrate diff)
 * y lee el datasource de ESTE archivo. El CMD del Dockerfile venía corriendo
 * `prisma db push --url "$DATABASE_URL"` que FALLA silenciosamente desde el
 * upgrade a v7 (el `2>&1;` tragaba el error) → el esquema de prod dejó de
 * migrarse (p. ej. `classifications.status` nunca llegó a prod y los INSERT
 * de Classification tronaban con P2022).
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
