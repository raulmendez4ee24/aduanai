import path from 'node:path';
import { defineConfig } from 'prisma/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai?schema=public';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  migrate: {
    async url() {
      return DATABASE_URL;
    },
  },
  datasource: {
    async url() {
      return DATABASE_URL;
    },
  },
});
