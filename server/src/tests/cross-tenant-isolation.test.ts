/**
 * Regresión P1 — aislamiento cross-tenant en las rutas corregidas.
 *
 * Parte PURA (siempre corre): la guarda de rol de /api/leads (fuga de la CRM de
 * ventas de ADUANAI a usuarios de cualquier tenant → ahora SUPERADMIN).
 *
 * Parte DB (solo en base de PRUEBAS): un usuario del tenant A que pide/muta un
 * id del tenant B obtiene "no encontrado" (count 0 / null) en cada ruta
 * corregida — alerts, classify feedback, operations documents. Se rehúsa a
 * correr salvo:
 *   ALLOW_XTENANT_TEST=test DATABASE_URL=postgresql://.../aduanai_test \
 *     node --import tsx src/tests/cross-tenant-isolation.test.ts
 *
 *   npm run test:xtenant
 */
import { strict as assert } from 'node:assert';
import type { NextFunction } from 'express';
import { requireRole, type AuthRequest } from '../middlewares/auth';
import { AppError } from '../middlewares/error';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

// Ejecuta la guarda requireRole('SUPERADMIN') con un rol dado y reporta el resultado.
function correrGuard(rol: string | undefined): { status?: number; ok: boolean } {
  const mw = requireRole('SUPERADMIN');
  const req = { userRole: rol } as unknown as AuthRequest;
  let capturado: { status?: number; ok: boolean } = { ok: false };
  const next: NextFunction = (err?: unknown) => {
    if (err instanceof AppError) capturado = { status: err.statusCode, ok: false };
    else capturado = { ok: true };
  };
  mw(req, {} as never, next);
  return capturado;
}

function baseDePruebasSegura(): boolean {
  if (process.env.ALLOW_XTENANT_TEST !== 'test') return false;
  let db = '';
  try { db = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : ''; } catch { /* */ }
  return /test/i.test(db);
}

async function main(): Promise<void> {
  console.log('— /api/leads: SOLO staff interno (SUPERADMIN) —');
  await prueba('un USER (tenant cliente) NO pasa la guarda → 403', () => {
    const r = correrGuard('USER'); assert.equal(r.ok, false); assert.equal(r.status, 403);
  });
  await prueba('un ADMIN de tenant tampoco pasa (ADMIN es rol por-tenant) → 403', () => {
    const r = correrGuard('ADMIN'); assert.equal(r.ok, false); assert.equal(r.status, 403);
  });
  await prueba('sin rol → 403', () => {
    const r = correrGuard(undefined); assert.equal(r.ok, false); assert.equal(r.status, 403);
  });
  await prueba('SUPERADMIN (staff ADUANAI) sí pasa', () => {
    const r = correrGuard('SUPERADMIN'); assert.equal(r.ok, true);
  });

  if (!baseDePruebasSegura()) {
    console.log('\n(omitida la parte de DB: define ALLOW_XTENANT_TEST=test + DATABASE_URL de una base *_test)');
    return;
  }

  const { prisma } = await import('../lib/prisma');
  const marca = `xtenant-${Date.now()}`;
  const tA = `tenantA-${marca}`, tB = `tenantB-${marca}`;
  const creado: { alertB?: string; clsB?: string; opA?: string; opB?: string; docB?: string } = {};
  try {
    console.log('\n— cross-tenant en rutas corregidas (base de pruebas) —');
    const uB = `user-${marca}`;
    const alertB = await prisma.alert.create({ data: { tenantId: tB, type: 'watch', title: marca, content: marca } as never });
    creado.alertB = alertB.id;
    await prueba('alerts: A no muta la alerta de B (updateMany count 0 → 404); B sí', async () => {
      const ajeno = await prisma.alert.updateMany({ where: { id: creado.alertB!, tenantId: tA }, data: { read: true } });
      assert.equal(ajeno.count, 0);
      const propio = await prisma.alert.updateMany({ where: { id: creado.alertB!, tenantId: tB }, data: { read: true } });
      assert.equal(propio.count, 1);
    });

    const clsB = await prisma.classification.create({ data: { tenantId: tB, userId: uB, inputDescription: marca, fractionCode: '00000000', confidence: 0.5 } as never });
    creado.clsB = clsB.id;
    await prueba('classify feedback: A no encuentra la clasificación de B (findFirst → null → 404); B sí', async () => {
      assert.equal(await prisma.classification.findFirst({ where: { id: creado.clsB!, tenantId: tA }, select: { id: true } }), null);
      assert.ok(await prisma.classification.findFirst({ where: { id: creado.clsB!, tenantId: tB }, select: { id: true } }));
    });

    const opA = await prisma.operation.create({ data: { tenantId: tA, userId: uB, reference: `${marca}-A`, type: 'IMPORT' } as never });
    const opB = await prisma.operation.create({ data: { tenantId: tB, userId: uB, reference: `${marca}-B`, type: 'IMPORT' } as never });
    creado.opA = opA.id; creado.opB = opB.id;
    const docB = await prisma.document.create({ data: { tenantId: tB, operationId: opB.id, name: marca, type: 'INVOICE', status: 'UPLOADED' } as never });
    creado.docB = docB.id;
    await prueba('operations: docId de B + opId de A → no pertenece (findFirst → null → 404); opId de B sí', async () => {
      assert.equal(await prisma.document.findFirst({ where: { id: creado.docB!, operationId: creado.opA! }, select: { id: true } }), null);
      assert.ok(await prisma.document.findFirst({ where: { id: creado.docB!, operationId: creado.opB! }, select: { id: true } }));
    });
  } finally {
    const p = (await import('../lib/prisma')).prisma;
    if (creado.docB) await p.document.deleteMany({ where: { id: creado.docB } }).catch(() => {});
    if (creado.opA || creado.opB) await p.operation.deleteMany({ where: { id: { in: [creado.opA, creado.opB].filter(Boolean) as string[] } } }).catch(() => {});
    if (creado.clsB) await p.classification.deleteMany({ where: { id: creado.clsB } }).catch(() => {});
    if (creado.alertB) await p.alert.deleteMany({ where: { id: creado.alertB } }).catch(() => {});
  }
}

main().then(() => {
  console.log(`\nResultado: ${pasadas} pruebas pasaron, ${falladas} fallaron.`);
  process.exit(falladas > 0 ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
