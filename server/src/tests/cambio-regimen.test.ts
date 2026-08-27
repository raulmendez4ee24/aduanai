/**
 * Asistente de cambio de régimen (Operación 2026-08): cálculo por partida con
 * el motor del Cotizador y TC inyectado; rechazo de importaciones de otro
 * tenant; RT sin contribuciones; expediente con folio; accesorios editables.
 *   npm run test:cambio-regimen
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { computeQuoteAmounts } from '../services/quoter';
import { calcularCambioRegimen, crearExpediente, actualizarExpediente, obtenerExpediente, listarExpedientes, listarCandidatas, DOCUMENTOS_REQUERIDOS, folioDe, type CalculoExpediente } from '../services/cambio-regimen';
import { clienteIdDe, filtroCliente, enAlcance, validarClienteEnAlcance } from '../lib/cliente-contexto';
import type { Request } from 'express';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}
const SUFIJO = `cr-${Date.now()}`;

(async () => {
  // Fracción real del catálogo con NMF conocida (activa) — se lee, no se inventa.
  // #15: elegimos una fracción SIN cuota compensatoria ni IEPS cargados para que
  // el escenario base siga limpio y la cuota/IEPS de prueba sean las únicas.
  const candidatas = await prisma.fraction.findMany({ where: { active: true, tariffNMF: { not: null }, iepsRate: null }, select: { code: true, tariffNMF: true }, take: 40 });
  let fx: { code: string; tariffNMF: number | null } | null = null;
  for (const c of candidatas) {
    const conCuota = await prisma.antidumpingDuty.count({ where: { fractionCode: c.code } });
    const conIeps = await prisma.iEPSRate.count({ where: { OR: [{ fractionCode: c.code }, ...[2, 4, 6].map(n => ({ fractionCode: c.code.slice(0, n), matchType: 'prefix' }))] } });
    if (conCuota === 0 && conIeps === 0) { fx = c; break; }
  }
  assert.ok(fx, 'catálogo LIGIE sembrado (fracción sin cuota ni IEPS)');
  const tenant = await prisma.tenant.create({ data: { name: `Test ${SUFIJO}`, status: 'ACTIVE' } });
  const otro = await prisma.tenant.create({ data: { name: `Otro ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: `${SUFIJO}@test.local`, password: 'x', name: 'T', tenantId: tenant.id, role: 'ADMIN' } });
  const userOtro = await prisma.user.create({ data: { email: `${SUFIJO}-o@test.local`, password: 'x', name: 'O', tenantId: otro.id, role: 'ADMIN' } });
  const base = { fractionCode: fx!.code, description: 'Insumo', unit: 'Kg', entryDate: new Date('2026-01-10'), expirationDate: new Date('2027-07-10'), status: 'ACTIVE' as const };
  const t1 = await prisma.temporaryImport.create({ data: { ...base, tenantId: tenant.id, userId: user.id, pedimento: '26 47 3461 4000001', quantity: 1000, quantityDischarged: 250, customsValue: 20000 } });
  const t2 = await prisma.temporaryImport.create({ data: { ...base, tenantId: tenant.id, userId: user.id, pedimento: '26 47 3461 4000002', quantity: 10, quantityDischarged: 0, customsValue: 50000, tipo: 'ACTIVO_FIJO', vidaUtilMeses: 60 } });
  const ajena = await prisma.temporaryImport.create({ data: { ...base, tenantId: otro.id, userId: userOtro.id, pedimento: '26 47 3461 4000009', quantity: 5, customsValue: 1000 } });
  const RES = `TEST-CR-${SUFIJO}`;
  const limpiar = async () => {
    await prisma.antidumpingDuty.deleteMany({ where: { resolutionNumber: RES } });
    await prisma.iEPSRate.deleteMany({ where: { decree: RES } });
    await prisma.cambioRegimenExpediente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.temporaryImport.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
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
      // #15: sin país de origen registrado solo queda la nota informativa de cuota no verificada.
      assert.deepEqual(af.notas.filter(n => !/país de origen/.test(n)), []);
    });
    await prueba('RT: retorno no causa IGI/IVA (montos en cero) y sin advertencia de accesorios', async () => {
      const c = await calcularCambioRegimen(tenant.id, [t1.id], { tipo: 'RT', tc: 18.5 });
      assert.equal(c.subtotales.contribuciones, 0);
      assert.equal(c.partidas[0]!.tasas.igiPct, 0);
      assert.ok(c.partidas[0]!.notas.some(n => n.startsWith('Retorno (RT)')));
      assert.ok(!c.advertencias.some(a => a.includes('Actualización')));
    });
    await prueba('#15 F4 con cuota compensatoria vigente (origen CN, tasa por exportador) e IEPS de IEPSRate: siguen al Cotizador y entran a la base del IVA', async () => {
      await prisma.antidumpingDuty.create({ data: {
        resolutionNumber: RES, fractionCode: fx!.code, countryOfOrigin: 'CN', rateType: 'percentage', rate: 30, rateUnit: '%', status: 'vigente', active: true,
        effectiveDate: new Date('2025-01-01'), expiryDate: new Date('2031-01-01'), publishDateDOF: new Date('2024-12-15'),
        exportadorTasas: [{ empresa: 'Ningbo Bolts Manufacturing Co., Ltd.', tasa: 12.5 }],
      } });
      await prisma.iEPSRate.create({ data: { fractionCode: fx!.code, matchType: 'exact', productCategory: 'test', rate: 8, rateType: 'ad_valorem', unit: '%', effectiveDate: new Date('2025-01-01'), decree: RES } });
      const tCN = await prisma.temporaryImport.create({ data: { ...base, tenantId: tenant.id, userId: user.id, pedimento: '26 47 3461 4000021', quantity: 100, quantityDischarged: 0, customsValue: 10000, originCountry: 'CN', supplier: 'NINGBO BOLTS MANUFACTURING' } });
      try {
        const c = await calcularCambioRegimen(tenant.id, [tCN.id], { tipo: 'F4', tc: 18.5 });
        const p = c.partidas[0]!;
        assert.equal(p.cuotaCompensatoria?.resolucion, RES);
        assert.equal(p.cuotaCompensatoria?.tasa, 12.5, 'tasa por exportador, no la general');
        assert.equal(p.tasas.cuotaCompensatoriaPct, 12.5);
        assert.equal(p.tasas.iepsPct, 8, 'IEPS desde IEPSRate (Fraction.iepsRate es null)');
        const esperado = computeQuoteAmounts({ valueUSD: 10000, exchangeRate: 18.5, rates: { igiPct: fx!.tariffNMF!, dtaPct: 0.8, ivaPct: 16, iepsPct: 8, countervailingPct: 12.5 } });
        assert.equal(p.montos.cuotaCompensatoria, esperado.countervailingDuty);
        assert.ok(esperado.countervailingDuty > 0);
        assert.equal(p.montos.ieps, esperado.ieps);
        assert.equal(p.montos.iva, esperado.iva, 'la cuota y el IEPS alteran la base del IVA');
        assert.equal(p.montos.total, esperado.totalTaxes);
        assert.equal(c.subtotales.cuotaCompensatoria, esperado.countervailingDuty);
        assert.ok(p.notas.some(n => n.includes(RES)));
        // RT: sin cuota ni IEPS.
        const rt = await calcularCambioRegimen(tenant.id, [tCN.id], { tipo: 'RT', tc: 18.5 });
        assert.equal(rt.partidas[0]!.montos.total, 0); assert.equal(rt.partidas[0]!.cuotaCompensatoria ?? null, null);
        // Sin país de origen → sin cuota, con nota.
        const sinPais = await calcularCambioRegimen(tenant.id, [t1.id], { tipo: 'F4', tc: 18.5 });
        assert.equal(sinPais.partidas[0]!.cuotaCompensatoria ?? null, null);
        assert.ok(sinPais.partidas[0]!.notas.some(n => /país de origen/.test(n)));
      } finally {
        await prisma.temporaryImport.delete({ where: { id: tCN.id } });
        await prisma.antidumpingDuty.deleteMany({ where: { resolutionNumber: RES } });
        await prisma.iEPSRate.deleteMany({ where: { decree: RES } });
      }
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
    await prueba('#25 expediente en estado ≠ borrador: editar accesorios NO recalcula sobre saldos vivos (contribuciones congeladas, total = contribuciones + accesorios)', async () => {
      const exp = await crearExpediente({ tenantId: tenant.id, userId: user.id, clienteId: null, ids: [t1.id], opts: { tipo: 'F4', tc: 18.5 } });
      const c0 = exp.calculo as unknown as CalculoExpediente & { folio: string };
      await actualizarExpediente(tenant.id, exp.id, { estado: 'presentado' });
      // Descargo posterior: el saldo vivo baja de 750 a 250.
      await prisma.temporaryImport.update({ where: { id: t1.id }, data: { quantityDischarged: 750 } });
      try {
        const upd = await actualizarExpediente(tenant.id, exp.id, { recargosMXN: 321, actualizacionMXN: 100 });
        const c1 = upd!.calculo as unknown as CalculoExpediente & { folio: string };
        assert.equal(c1.folio, c0.folio);
        assert.equal(c1.subtotales.contribuciones, c0.subtotales.contribuciones, 'contribuciones intactas');
        assert.equal(c1.partidas[0]!.saldoCantidad, 750, 'la partida persistida no cambia');
        assert.equal(c1.recargos.montoMXN, 321); assert.equal(c1.actualizacion.montoMXN, 100);
        assert.equal(c1.total, Math.round((c0.subtotales.contribuciones + 421) * 100) / 100);
        // En borrador sí recalcula (saldo vivo 250).
        const exp2 = await crearExpediente({ tenantId: tenant.id, userId: user.id, clienteId: null, ids: [t1.id], opts: { tipo: 'F4', tc: 18.5 } });
        const upd2 = await actualizarExpediente(tenant.id, exp2.id, { recargosMXN: 1 });
        assert.equal((upd2!.calculo as unknown as CalculoExpediente).partidas[0]!.saldoCantidad, 250);
      } finally {
        await prisma.temporaryImport.update({ where: { id: t1.id }, data: { quantityDischarged: 250 } });
      }
    });
    await prueba('alcance por cliente (revisión B): restringido a [A,B] → candidatas (incluso con ids), lista y detalle excluyen al cliente C', async () => {
      const cA = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `CRA${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente A' } });
      const cB = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `CRB${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente B' } });
      const cC = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `CRC${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente C' } });
      const tB = await prisma.temporaryImport.create({ data: { ...base, tenantId: tenant.id, userId: user.id, clienteId: cB.id, pedimento: '26 47 3461 4000011', quantity: 100, customsValue: 1000 } });
      const tC = await prisma.temporaryImport.create({ data: { ...base, tenantId: tenant.id, userId: user.id, clienteId: cC.id, pedimento: '26 47 3461 4000012', quantity: 100, customsValue: 1000 } });
      const req = { headers: {}, query: {}, clienteIdsPermitidos: [cA.id, cB.id] } as unknown as Request;
      assert.equal(clienteIdDe(req), null, 'con 2 permitidos clienteIdDe es null (el bug original dejaba candidatas/lista sin filtro)');
      const cand = await listarCandidatas(tenant.id, { clienteId: filtroCliente(req).clienteId });
      assert.ok(cand.some(r => r.id === tB.id) && !cand.some(r => r.id === tC.id), 'candidatas sin ids: B sí, C no');
      const porIds = await listarCandidatas(tenant.id, { ids: [tB.id, tC.id], clienteId: filtroCliente(req).clienteId });
      assert.deepEqual(porIds.map(r => r.id), [tB.id], 'candidatas?ids= NO salta el filtro de cliente');
      const sinRestriccion = await listarCandidatas(tenant.id, { ids: [tB.id, tC.id] });
      assert.equal(sinRestriccion.length, 2, 'sin restricción los ids prellenan ambas');
      const eB = await crearExpediente({ tenantId: tenant.id, userId: user.id, clienteId: cB.id, ids: [tB.id], opts: { tipo: 'F4', tc: 18.5 } });
      const eC = await crearExpediente({ tenantId: tenant.id, userId: user.id, clienteId: cC.id, ids: [tC.id], opts: { tipo: 'F4', tc: 18.5 } });
      const lista = await listarExpedientes(tenant.id, filtroCliente(req).clienteId);
      assert.ok(lista.some(e => e.id === eB.id) && !lista.some(e => e.id === eC.id), 'listarExpedientes con { in } excluye C');
      assert.equal(enAlcance(req, eB.clienteId), true);
      assert.equal(enAlcance(req, eC.clienteId), false, 'detalle/imprimible de C fuera de alcance → la ruta responde 404');
      await assert.rejects(() => validarClienteEnAlcance(req, tenant.id, cC.id), (e: unknown) => (e as { statusCode?: number }).statusCode === 403, 'clienteId del body fuera del alcance → 403');
    });
  } finally {
    await limpiar();
  }
  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
})();
