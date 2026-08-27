/**
 * Asistente de cambio de régimen (Operación 2026-08): cálculo por partida con
 * el motor del Cotizador y TC inyectado; rechazo de importaciones de otro
 * tenant; RT sin contribuciones; expediente con folio; accesorios editables.
 *   npm run test:cambio-regimen
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { computeQuoteAmounts } from '../services/quoter';
import { calcularCambioRegimen, crearExpediente, actualizarExpediente, obtenerExpediente, DOCUMENTOS_REQUERIDOS, folioDe, type CalculoExpediente } from '../services/cambio-regimen';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}
const SUFIJO = `cr-${Date.now()}`;

(async () => {
  // Fracción real del catálogo con NMF conocida (activa) — se lee, no se inventa.
  const fx = await prisma.fraction.findFirst({ where: { active: true, tariffNMF: { not: null }, iepsRate: null }, select: { code: true, tariffNMF: true } });
  assert.ok(fx, 'catálogo LIGIE sembrado');
  const tenant = await prisma.tenant.create({ data: { name: `Test ${SUFIJO}`, status: 'ACTIVE' } });
  const otro = await prisma.tenant.create({ data: { name: `Otro ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: `${SUFIJO}@test.local`, password: 'x', name: 'T', tenantId: tenant.id, role: 'ADMIN' } });
  const userOtro = await prisma.user.create({ data: { email: `${SUFIJO}-o@test.local`, password: 'x', name: 'O', tenantId: otro.id, role: 'ADMIN' } });
  const base = { fractionCode: fx!.code, description: 'Insumo', unit: 'Kg', entryDate: new Date('2026-01-10'), expirationDate: new Date('2027-07-10'), status: 'ACTIVE' as const };
  const t1 = await prisma.temporaryImport.create({ data: { ...base, tenantId: tenant.id, userId: user.id, pedimento: '26 47 3461 4000001', quantity: 1000, quantityDischarged: 250, customsValue: 20000 } });
  const t2 = await prisma.temporaryImport.create({ data: { ...base, tenantId: tenant.id, userId: user.id, pedimento: '26 47 3461 4000002', quantity: 10, quantityDischarged: 0, customsValue: 50000, tipo: 'ACTIVO_FIJO', vidaUtilMeses: 60 } });
  const ajena = await prisma.temporaryImport.create({ data: { ...base, tenantId: otro.id, userId: userOtro.id, pedimento: '26 47 3461 4000009', quantity: 5, customsValue: 1000 } });
  const limpiar = async () => {
    await prisma.cambioRegimenExpediente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.temporaryImport.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otro.id] } } });
  };
  try {
    console.log('— cálculo por partida (TC inyectado = 18.5) —');
    await prueba('F4: IGI/DTA/IVA sobre el saldo con la fórmula del Cotizador', async () => {
      const c = await calcularCambioRegimen(tenant.id, [t1.id], { tipo: 'F4', tc: 18.5 });
      assert.equal(c.partidas.length, 1);
      const p = c.partidas[0]!;
      assert.equal(p.saldoCantidad, 750);
      assert.equal(p.saldoValorUSD, 15000);
      const esperado = computeQuoteAmounts({ valueUSD: 15000, exchangeRate: 18.5, rates: { igiPct: fx!.tariffNMF!, dtaPct: 0.8, ivaPct: 16, iepsPct: 0 } });
      assert.equal(p.saldoValorMXN, esperado.valueMXN);
      assert.equal(p.montos.igi, esperado.igi);
      assert.equal(p.montos.dta, esperado.dta);
      assert.equal(p.montos.iva, esperado.iva);
      assert.equal(p.montos.total, esperado.totalTaxes);
      assert.equal(c.subtotales.contribuciones, esperado.totalTaxes);
      assert.equal(c.total, esperado.totalTaxes, 'sin accesorios capturados');
      assert.equal(c.tc.valor, 18.5);
      assert.equal(c.tc.fuente, 'manual');
      assert.equal(c.actualizacion.cotejo, 'pendiente');
      assert.ok(c.actualizacion.fundamento.includes('17-A') && c.recargos.fundamento.includes('21 CFF'));
      assert.equal(c.clavePedimento?.clave, 'F4');
      assert.deepEqual(c.documentos, DOCUMENTOS_REQUERIDOS.F4);
    });
    await prueba('N partidas: subtotales suman; F5 sobre insumo avisa; accesorios entran al total', async () => {
      const c = await calcularCambioRegimen(tenant.id, [t1.id, t2.id], { tipo: 'F5', tc: 18.5, actualizacionMXN: 1234.5, recargosMXN: 100 });
      assert.equal(c.partidas.length, 2);
      const suma = Math.round(c.partidas.reduce((a, p) => a + p.montos.total, 0) * 100) / 100;
      assert.equal(c.subtotales.contribuciones, suma);
      assert.equal(c.total, Math.round((suma + 1334.5) * 100) / 100);
      const insumo = c.partidas.find(p => p.temporaryImportId === t1.id)!;
      assert.ok(insumo.notas.some(n => n.includes('no está marcada como activo fijo')));
      const af = c.partidas.find(p => p.temporaryImportId === t2.id)!;
      assert.equal(af.notas.length, 0);
    });
    await prueba('RT: retorno no causa IGI/IVA (montos en cero) y sin advertencia de accesorios', async () => {
      const c = await calcularCambioRegimen(tenant.id, [t1.id], { tipo: 'RT', tc: 18.5 });
      assert.equal(c.subtotales.contribuciones, 0);
      assert.equal(c.partidas[0]!.tasas.igiPct, 0);
      assert.ok(c.partidas[0]!.notas.some(n => n.startsWith('Retorno (RT)')));
      assert.ok(!c.advertencias.some(a => a.includes('Actualización')));
    });
    await prueba('A3 dentro de plazo avisa y sugiere F4/RT', async () => {
      const c = await calcularCambioRegimen(tenant.id, [t1.id], { tipo: 'A3', tc: 18.5 });
      assert.ok(c.partidas[0]!.notas.some(n => n.includes('dentro de plazo')));
      assert.ok(c.advertencias.some(a => a.includes('17-A')));
    });

    console.log('— guardas —');
    await prueba('rechaza importaciones de otro tenant (404 sin revelar existencia)', async () => {
      await assert.rejects(() => calcularCambioRegimen(tenant.id, [t1.id, ajena.id], { tipo: 'F4', tc: 18.5 }), (e: unknown) => (e as { statusCode?: number }).statusCode === 404);
      await assert.rejects(() => calcularCambioRegimen(otro.id, [t1.id], { tipo: 'F4', tc: 18.5 }), (e: unknown) => (e as { statusCode?: number }).statusCode === 404);
    });
    await prueba('rechaza tipo inválido, lista vacía y TC inválido', async () => {
      await assert.rejects(() => calcularCambioRegimen(tenant.id, [t1.id], { tipo: 'ZZ' as 'F4', tc: 18.5 }), /Tipo inválido/);
      await assert.rejects(() => calcularCambioRegimen(tenant.id, [], { tipo: 'F4', tc: 18.5 }), /al menos una/);
      await assert.rejects(() => calcularCambioRegimen(tenant.id, [t1.id], { tipo: 'F4', tc: 0 }), /TC inválido/);
    });

    console.log('— expediente —');
    await prueba('crear expediente: folio, cálculo persistido, ids; editar accesorios recalcula total conservando folio y TC', async () => {
      const exp = await crearExpediente({ tenantId: tenant.id, userId: user.id, clienteId: null, ids: [t1.id, t2.id], opts: { tipo: 'F4', tc: 18.5 }, notas: 'prueba' });
      const calc = exp.calculo as unknown as CalculoExpediente & { folio: string };
      assert.equal(calc.folio, folioDe(exp.id, exp.createdAt));
      assert.match(calc.folio, /^CR-\d{8}-[A-Z0-9]{6}$/);
      assert.deepEqual(exp.temporaryImportIds, [t1.id, t2.id]);
      assert.equal(exp.estado, 'borrador');
      const upd = await actualizarExpediente(tenant.id, exp.id, { estado: 'listo', recargosMXN: 500 });
      const c2 = upd!.calculo as unknown as CalculoExpediente & { folio: string };
      assert.equal(upd!.estado, 'listo');
      assert.equal(c2.folio, calc.folio);
      assert.equal(c2.tc.valor, 18.5);
      assert.equal(c2.total, Math.round((calc.subtotales.contribuciones + 500) * 100) / 100);
      assert.equal(await obtenerExpediente(otro.id, exp.id), null, 'otro tenant no lo ve');
      assert.equal(await actualizarExpediente(otro.id, exp.id, { estado: 'presentado' }), null);
    });
  } finally {
    await limpiar();
  }
  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
})();
