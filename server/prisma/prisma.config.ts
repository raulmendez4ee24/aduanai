import path from 'node:path';
import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai?schema=public';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  migrate: {
    url: DATABASE_URL,
  },
  datasource: {
    url: DATABASE_URL,
  },
});
