/**
 * Ola 3 — Analytics real que cuadra con el Historial.
 *
 * Siembra un tenant PROPIO (borrado al final) con dos clientes, clasificaciones,
 * cotizaciones y un job, y verifica:
 *  - totales == count con el MISMO where que GET /api/classify/history (tenantId
 *    [+clienteId]) y que count(Quote);
 *  - filtro por cliente (X-Cliente-Id / ?clienteId=) acota todo;
 *  - ahorro T-MEC calculado con tasas conocidas del catálogo (NMF − T-MEC);
 *  - equipo: tiempo medio del job = finishedAt − createdAt.
 *
 *   npm run test:analytics   (solo DB local)
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { calcularAnalytics } from '../services/analytics';
import { filtroCliente } from '../lib/cliente-contexto';
import type { Request } from 'express';

/** Simula la petición de un usuario restringido (lo que deja clienteScope en req.clienteIdsPermitidos). */
const reqRestringida = (clienteIds: string[] | null, header?: string): Request =>
  ({ headers: header ? { 'x-cliente-id': header } : {}, query: {}, clienteIdsPermitidos: clienteIds } as unknown as Request);

let pasan = 0, fallan = 0;
async function caso(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasan++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallan++; console.log(`  ✗ ${nombre}\n    ${(e as Error).message}`); }
}
function soloLocal(): void {
  let host = '';
  try { host = new URL(process.env.DATABASE_URL ?? '').hostname; } catch { /* */ }
  if (!/^(localhost|127\.0\.0\.1)$/.test(host)) throw new Error(`REFUSED: solo DB local (host=${host || '?'})`);
}

async function main() {
  soloLocal();
  console.log('Analytics real — cuadra con Historial, por cliente y periodo');
  const nonce = `${Date.now()}`;
  let tenantId: string | undefined;

  // Fracción real con tasas conocidas: NMF > T-MEC.
  const fr = await prisma.fraction.findFirst({ where: { active: true, tariffNMF: { gt: 0 }, tariffTMEC: 0 }, select: { code: true, tariffNMF: true, tariffTMEC: true } });
  assert.ok(fr, 'se necesita una fracción activa con NMF > 0 y T-MEC = 0 en el catálogo local');
  const NMF = fr!.tariffNMF!, TMEC = fr!.tariffTMEC!;

  try {
    const tenant = await prisma.tenant.create({ data: { name: `__ola3_analytics_test__ ${nonce}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({ data: { email: `ola3-analytics-${nonce}@test.local`, password: 'x', name: 'Tester Ola3', tenantId } });
    const cA = await prisma.cliente.create({ data: { tenantId, rfc: `AAA${nonce.slice(-9)}A1`, razonSocial: 'Cliente A' } });
    const cB = await prisma.cliente.create({ data: { tenantId, rfc: `BBB${nonce.slice(-9)}B2`, razonSocial: 'Cliente B' } });

    const ahora = new Date();
    const hace10 = new Date(ahora.getTime() - 10 * 86400000);
    const hace200 = new Date(ahora.getTime() - 200 * 86400000);
    const base = { tenantId, userId: user.id, fractionCode: fr!.code, confidence: 90, inputDescription: 'prueba' };
    await prisma.classification.createMany({ data: [
      { ...base, clienteId: cA.id, inputCountryOfOrigin: 'US', inputDeclaredValueUSD: 1000, createdAt: hace10, feedback: 'correct' },
      { ...base, clienteId: cA.id, inputCountryOfOrigin: 'CN', inputDeclaredValueUSD: 500, createdAt: hace10 },
      { ...base, clienteId: cA.id, inputCountryOfOrigin: 'US', inputDeclaredValueUSD: 2000, createdAt: hace200 }, // fuera del periodo
      { ...base, clienteId: cB.id, inputCountryOfOrigin: 'US', inputDeclaredValueUSD: 100, createdAt: hace10 },
      { ...base, clienteId: null, createdAt: hace10 },
    ] });
    const quoteA = await prisma.quote.create({ data: {
      tenantId, userId: user.id, clienteId: cA.id, fractionCode: fr!.code, customsValue: 10000, origin: 'US', result: '{}', createdAt: hace10,
      items: { create: [
        // IGI cotizado = NMF con origen US → T-MEC NO aplicado
        { numeroPartida: 1, fractionCode: fr!.code, countryOfOrigin: 'US', quantity: 1, unitValueUSD: 10000, totalValueUSD: 10000, customsValueUSD: 10000, customsValueMXN: 180000, igiRate: NMF, igi: 10000 * NMF / 100, dta: 0, iva: 0, totalDuties: 0, totalCost: 0 },
        // IGI cotizado = T-MEC → ahorro APLICADO
        { numeroPartida: 2, fractionCode: fr!.code, countryOfOrigin: 'CA', quantity: 1, unitValueUSD: 4000, totalValueUSD: 4000, customsValueUSD: 4000, customsValueMXN: 72000, igiRate: TMEC, igi: 0, dta: 0, iva: 0, totalDuties: 0, totalCost: 0 },
      ] },
    } });
    await prisma.quote.create({ data: { tenantId, userId: user.id, clienteId: cB.id, fractionCode: fr!.code, customsValue: 1, origin: 'CN', result: '{}', createdAt: hace10 } });
    await prisma.classificationJob.create({ data: { tenantId, userId: user.id, clienteId: cA.id, status: 'done', inputs: {}, createdAt: hace10, finishedAt: new Date(hace10.getTime() + 8000) } });

    const filtro = { tenantId, desde: new Date(ahora.getTime() - 90 * 86400000), hasta: ahora };
    const todo = await calcularAnalytics(filtro);
    const soloA = await calcularAnalytics({ ...filtro, clienteId: cA.id });

    await caso('totales cuadran con el where del Historial (tenantId) y con count(Quote)', async () => {
      const whereHistory = { tenantId };
      assert.equal(todo.totales.clasificaciones, await prisma.classification.count({ where: whereHistory }));
      assert.equal(todo.totales.clasificaciones, 5);
      assert.equal(todo.totales.cotizaciones, await prisma.quote.count({ where: whereHistory }));
      assert.equal(todo.totales.cotizaciones, 2);
    });
    await caso('filtro por cliente: totales cuadran con Historial filtrado por clienteId', async () => {
      assert.equal(soloA.totales.clasificaciones, await prisma.classification.count({ where: { tenantId, clienteId: cA.id } }));
      assert.equal(soloA.totales.clasificaciones, 3);
      assert.equal(soloA.totales.cotizaciones, 1);
      assert.equal(soloA.totales.clasificacionesPeriodo, 2, 'la de hace 200 días queda fuera del periodo');
    });
    await caso('ahorro T-MEC no aplicado = valor × (NMF − TMEC)/100 con tasas del catálogo', () => {
      // Clasificaciones US en periodo (A:1000, B:100) + partida 1 de la cotización (10000 a NMF)
      const esperado = Math.round((1000 + 100 + 10000) * (NMF - TMEC) / 100 * 100) / 100;
      assert.equal(todo.ahorro.tmecNoAplicado.totalUSD, esperado);
      assert.equal(todo.ahorro.tmecNoAplicado.lineas.length, 3);
      const l = todo.ahorro.tmecNoAplicado.lineas.find(x => x.origen === 'cotizacion')!;
      assert.equal(l.tasaGeneral, NMF); assert.equal(l.tasaPreferencial, TMEC); assert.equal(l.tasaAplicada, NMF);
      assert.equal(todo.ahorro.tmecNoAplicado.sinTasa, 0);
      assert.match(todo.ahorro.tmecNoAplicado.formula, /NMF/);
    });
    await caso('ahorro aplicado: partida cotizada a tasa T-MEC', () => {
      assert.equal(todo.ahorro.aplicado.totalUSD, Math.round(4000 * (NMF - TMEC) / 100 * 100) / 100);
      assert.equal(todo.ahorro.aplicado.lineas.length, 1);
    });
    await caso('filtro por cliente acota el ahorro (solo A)', () => {
      const esperadoA = Math.round((1000 + 10000) * (NMF - TMEC) / 100 * 100) / 100;
      assert.equal(soloA.ahorro.tmecNoAplicado.totalUSD, esperadoA);
      assert.equal(soloA.ahorro.tmecNoAplicado.lineas.length, 2);
    });
    await caso('equipo: clasificaciones por usuario, % validado y tiempo medio del job (8 s)', () => {
      const u = todo.equipo.porUsuario.find(x => x.userId === user.id)!;
      assert.ok(u); assert.equal(u.clasificaciones, 4); assert.equal(u.validadas, 1); assert.equal(u.pctValidado, 25); assert.equal(u.pctCorrecto, 100);
      assert.equal(u.tiempoMedioSeg, 8); assert.equal(u.jobs, 1);
    });
    await caso('riesgo: la fracción aparece con sus apariciones y valor (sensible solo si cruza con tablas reales)', () => {
      const s = todo.riesgo.fraccionesSensibles.find(x => x.fractionCode === fr!.code);
      if (s) { assert.ok(s.apariciones >= 4); assert.ok(s.cuotaCompensatoria.count > 0 || s.nomObligatoria.length > 0 || s.precioEstimado || s.anexo10); }
      assert.match(todo.riesgo.formula, /antidumping_duties/);
      assert.equal(todo.riesgo.riskScorer.evaluaciones, 0);
    });
    await caso('usuario restringido a A sin cliente activo: filtroCliente → clienteId=A y los totales son los de A (no todo el tenant)', async () => {
      const f = filtroCliente(reqRestringida([cA.id]));
      assert.equal(f.clienteId, cA.id);
      const r = await calcularAnalytics({ ...filtro, clienteId: f.clienteId });
      assert.equal(r.totales.clasificaciones, 3);
      assert.equal(r.totales.cotizaciones, 1);
      assert.equal(r.filtro.clienteId, cA.id);
      assert.equal(r.ahorro.tmecNoAplicado.lineas.length, 2);
    });
    await caso('usuario restringido a A y B sin cliente activo: filtro {in} → suma de A y B, excluye la fila sin cliente', async () => {
      const f = filtroCliente(reqRestringida([cA.id, cB.id]));
      assert.deepEqual(f.clienteId, { in: [cA.id, cB.id] });
      const r = await calcularAnalytics({ ...filtro, clienteId: f.clienteId });
      assert.equal(r.totales.clasificaciones, 4, '5 del tenant menos la que no tiene cliente');
      assert.equal(r.totales.cotizaciones, 2);
      assert.equal(r.filtro.clienteId, null);
      assert.deepEqual(r.filtro.clienteIds, [cA.id, cB.id]);
      assert.equal(r.ahorro.tmecNoAplicado.lineas.length, 3);
      assert.match(r.totales.formula, /clientes permitidos/);
    });
    await caso('restringido a nada ([]) → {in: []} → cero registros', async () => {
      const r = await calcularAnalytics({ ...filtro, clienteId: filtroCliente(reqRestringida([])).clienteId });
      assert.equal(r.totales.clasificaciones, 0);
      assert.equal(r.totales.cotizaciones, 0);
    });
    await caso('la cotización sembrada se conserva con sus 2 partidas', async () => {
      assert.equal(await prisma.quoteItem.count({ where: { quoteId: quoteA.id } }), 2);
    });
  } finally {
    if (tenantId) {
      await prisma.classificationJob.deleteMany({ where: { tenantId } });
      await prisma.quote.deleteMany({ where: { tenantId } });
      await prisma.classification.deleteMany({ where: { tenantId } });
      await prisma.cliente.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  }
  console.log(`\n${pasan} passed, ${fallan} failed`);
  if (fallan > 0) process.exit(1);
}

void main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
