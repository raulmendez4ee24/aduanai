import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import dotenv from 'dotenv';
import { conGuardaDeTenant } from './tenant-guard';

dotenv.config();

export function buildPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  return {
    connectionString: env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai',
    max: Number(env.PG_POOL_MAX) || 10,
    connectionTimeoutMillis: Number(env.PG_CONNECT_TIMEOUT_MS) || 8000,
    idleTimeoutMillis: Number(env.PG_IDLE_TIMEOUT_MS) || 60000,
    statement_timeout: Number(env.PG_STATEMENT_TIMEOUT_MS) || 30000,
    query_timeout: Number(env.PG_QUERY_TIMEOUT_MS) || 35000,
    keepAlive: true,
  };
}

const adapter = new PrismaPg(buildPoolConfig());

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Defensa de capa contra fugas cross-tenant: la guarda exige tenantId en
// findUnique/findFirst sobre modelos multi-tenant (ver lib/tenant-guard.ts).
// Warn por defecto; con TENANT_GUARD_STRICT=1 lanza (dev/CI).
export const prisma = globalForPrisma.prisma ?? conGuardaDeTenant(new PrismaClient({ adapter }));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
