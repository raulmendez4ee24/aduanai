/**
 * Fiscal Guardian — calendario vivo de la certificación (Ola 2).
 *
 * Ejecutar: npm run test:fiscal
 *
 * Parte pura (catálogo, semáforo, conciliación, simulador con TC inyectado) y
 * parte DB local (avisos idempotentes, descargo con saldo y audit trail).
 * Rechaza cualquier DATABASE_URL que no sea localhost.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import {
  OBLIGACIONES_CERT, evaluarCertificacion, rubroDe, VIGENCIA_REGISTRO_MESES, AVISOS, PLAZO_RENOVACION_DIAS,
  type ContextoCertificacion,
} from '../lib/certificacion-iva-ieps';
import {
  rangoDePeriodo, bucketDeAntiguedad, conciliar, calcularSimulador, repartirMonto,
  registrarAviso, sincronizarRenovacion, listarAvisos, descargarCredito, semaforoCertificacion, conciliacionPeriodo, simuladorPerdida,
  conciliacionAXlsx, reporteCreditosXlsx,
} from '../services/fiscal-certificacion';
import type { OfficialRate } from '../services/exchange-rate';
import { getFiscalAccount } from '../services/fiscal-guardian';

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.stack ?? e.message : e}`); }
}
function soloLocal(): void {
  let host = '';
  try { host = new URL(process.env.DATABASE_URL ?? '').hostname; } catch { /* abajo */ }
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`REFUSED: solo corre contra localhost (host=${host || '?'})`);
}

const HOY = new Date('2026-08-27T12:00:00Z');
const ctxBase = (over: Partial<ContextoCertificacion> = {}): ContextoCertificacion => ({
  hoy: HOY,
  perfil: { modality: 'AA', status: 'ACTIVE', issueDate: new Date('2026-01-15'), expiryDate: new Date('2027-01-15'), renewalDeadline: null },
  antiguedadAnios: 5.2,
  padronImportadores: 'activo',
  padronesSectoriales: { requeridos: 1, activos: 1 },
  opinion32D: { positiva: true, fecha: new Date('2026-08-10') },
  garantiasActivas: 0, garantiasPorVencer30d: 0,
  creditosVencidosSinDescargo: 0,
  anexo30UltimoPeriodo: '2026-Q2', anexo30EsperadoPeriodo: '2026-Q2',
  avisosVencidos: 0, avisosPendientes: 0,
  inventarioConMovimientos: true,
  ...over,
});

async function main(): Promise<void> {
  console.log('\n== Fiscal: catálogo y semáforo por rubro ==');

  await test('catálogo: vigencia 1 año para todos los rubros (7.1.6) y respaldo declarado por obligación', () => {
    assert.equal(VIGENCIA_REGISTRO_MESES, 12);
    assert.ok(OBLIGACIONES_CERT.length >= 10);
    for (const o of OBLIGACIONES_CERT) {
      assert.ok(['corpus', 'pendiente'].includes(o.cotejo));
      if (o.cotejo === 'corpus') assert.ok(o.fuente, `${o.clave} dice corpus pero no cita fuente`);
      else assert.ok(o.fundamento.includes('pendiente de cotejo'), `${o.clave} pendiente debe decirlo en el fundamento`);
    }
    assert.equal(rubroDe('aaa'), 'AAA');
    assert.equal(rubroDe('Operador Económico Autorizado'), null);
  });

  await test('rubro AA sano → global verde; ANTIGUEDAD aplica a AA/AAA y no a A', () => {
    const s = evaluarCertificacion(ctxBase());
    assert.equal(s.rubro, 'AA');
    assert.equal(s.global, 'verde');
    const ant = s.obligaciones.find((o) => o.clave === 'ANTIGUEDAD_OPERATIVA')!;
    assert.equal(ant.aplica, true); assert.equal(ant.estado, 'verde');
    const garantia = s.obligaciones.find((o) => o.clave === 'GARANTIA_INTERES_FISCAL')!;
    assert.equal(garantia.aplica, false, 'la garantía del rubro A no aplica a AA');
    const sA = evaluarCertificacion(ctxBase({ perfil: { ...ctxBase().perfil!, modality: 'A' } }));
    assert.equal(sA.obligaciones.find((o) => o.clave === 'ANTIGUEDAD_OPERATIVA')!.aplica, false);
    assert.ok(s.pendientesDeCotejo > 0, 'se declara cuántas quedan pendientes de cotejo');
  });

  await test('vencimiento próximo → ámbar; vencido/suspendido/aviso vencido → rojo; sin perfil → gris', () => {
    const proximo = evaluarCertificacion(ctxBase({ perfil: { ...ctxBase().perfil!, expiryDate: new Date('2026-09-15') } }));
    assert.equal(proximo.obligaciones.find((o) => o.clave === 'REGISTRO_VIGENTE')!.estado, 'ambar');
    assert.equal(proximo.obligaciones.find((o) => o.clave === 'RENOVACION_ANUAL')!.estado, 'rojo', 'la fecha de trabajo para renovar (30 días antes) ya pasó');
    assert.equal(proximo.global, 'rojo');
    const vencido = evaluarCertificacion(ctxBase({ perfil: { ...ctxBase().perfil!, expiryDate: new Date('2026-08-01') } }));
    assert.equal(vencido.obligaciones.find((o) => o.clave === 'REGISTRO_VIGENTE')!.estado, 'rojo');
    const suspendido = evaluarCertificacion(ctxBase({ perfil: { ...ctxBase().perfil!, status: 'SUSPENDED' } }));
    assert.equal(suspendido.global, 'rojo');
    const avisos = evaluarCertificacion(ctxBase({ avisosVencidos: 2 }));
    assert.equal(avisos.obligaciones.find((o) => o.clave === 'AVISOS_CAMBIOS')!.estado, 'rojo');
    const sinPerfil = evaluarCertificacion(ctxBase({ perfil: null, antiguedadAnios: null, padronImportadores: 'desconocido', padronesSectoriales: null, opinion32D: null, anexo30UltimoPeriodo: null, inventarioConMovimientos: false }));
    assert.equal(sinPerfil.rubro, null);
    assert.equal(sinPerfil.obligaciones.find((o) => o.clave === 'REGISTRO_VIGENTE')!.estado, 'gris');
    assert.equal(sinPerfil.global, 'verde', 'sin datos: solo lo verificable (créditos/avisos) queda verde; el resto gris, nunca inventado');
    assert.ok(sinPerfil.resumen.gris >= 6);
  });

  console.log('\n== Fiscal: conciliación con buckets ==');

  await test('rangoDePeriodo acepta trimestre, mes y año; buckets 0-6/6-12/12-18/>18', () => {
    const q = rangoDePeriodo('2026-q2');
    assert.equal(q.inicio.toISOString().slice(0, 10), '2026-04-01');
    assert.equal(q.fin.toISOString().slice(0, 10), '2026-06-30');
    assert.equal(rangoDePeriodo('2026-08').fin.toISOString().slice(0, 10), '2026-08-31');
    assert.equal(rangoDePeriodo('2025').fin.toISOString().slice(0, 10), '2025-12-31');
    assert.throws(() => rangoDePeriodo('agosto'), AppError);
    assert.equal(bucketDeAntiguedad(2), '0-6'); assert.equal(bucketDeAntiguedad(6), '6-12'); assert.equal(bucketDeAntiguedad(13), '12-18'); assert.equal(bucketDeAntiguedad(20), '>18');
  });

  const creditos = [
    { id: 'c1', pedimento: 'P1', fractionCode: '73181599', ivaAmount: 1000, iepsAmount: 0, creditDate: new Date('2026-05-10'), dischargeDeadline: new Date('2027-11-10'), status: 'PARTIALLY_USED', usages: [{ ivaApplied: 400, iepsApplied: 0, usageDate: new Date('2026-06-01') }, { ivaApplied: 600, iepsApplied: 0, usageDate: new Date('2026-08-01') }] },
    { id: 'c2', pedimento: 'P2', fractionCode: '84713001', ivaAmount: 2000, iepsAmount: 500, creditDate: new Date('2025-10-01'), dischargeDeadline: new Date('2027-04-01'), status: 'ACTIVE', usages: [] },
    { id: 'c3', pedimento: 'P3', fractionCode: '39269099', ivaAmount: 300, iepsAmount: 0, creditDate: new Date('2025-01-15'), dischargeDeadline: new Date('2026-07-15'), status: 'ACTIVE', usages: [] },
    { id: 'c4', pedimento: 'P4', fractionCode: '72104999', ivaAmount: 900, iepsAmount: 0, creditDate: new Date('2026-07-20'), dischargeDeadline: new Date('2028-01-20'), status: 'ACTIVE', usages: [] }, // posterior al periodo
  ];

  await test('conciliar 2026-Q2: otorgado/descargado del periodo, saldo al cierre reconstruido, buckets, diferencias vs Anexo 30', () => {
    const c = conciliar(rangoDePeriodo('2026-Q2'), creditos, { period: '2026-Q2', totalCredits: 1000, totalDebits: 400, balance: 3400, ivaDeferred: 0 });
    assert.equal(c.creditos.otorgadoEnPeriodo, 1000);
    assert.equal(c.creditos.descargadoEnPeriodo, 400, 'el descargo de agosto NO cuenta en Q2');
    assert.equal(c.creditos.saldoAlCierre, 600 + 2500 + 300, 'c4 aún no existía al cierre');
    assert.equal(c.creditos.activos, 3);
    assert.equal(c.creditos.porBucket['0-6'].saldo, 600);
    assert.equal(c.creditos.porBucket['6-12'].saldo, 2500);
    assert.equal(c.creditos.porBucket['12-18'].saldo, 300);
    assert.equal(c.creditos.porBucket['>18'].creditos, 0);
    assert.equal(c.cuadra, true);
    const mal = conciliar(rangoDePeriodo('2026-Q2'), creditos, { period: '2026-Q2', totalCredits: 1200, totalDebits: 400, balance: 3400, ivaDeferred: 0 });
    assert.equal(mal.cuadra, false);
    assert.equal(mal.diferencias.length, 1);
    assert.equal(mal.diferencias[0].diferencia, -200);
    const sin = conciliar(rangoDePeriodo('2026-Q2'), creditos, null);
    assert.equal(sin.cuadra, null);
    assert.ok(sin.nota.includes('Sin estado de cuenta Anexo 30'));
    assert.ok(conciliacionAXlsx(c).length > 1000);
  });

  console.log('\n== Fiscal: simulador con TC inyectado ==');

  await test('IVA mensual = valor en aduana × 16% × TC; garantía solo con % capturado; IEPS honesto en null', () => {
    const tc: OfficialRate = { rate: 18.5, source: 'banxico', asOf: new Date('2026-08-26'), isOfficial: true, warning: null };
    const imps = [
      { entryDate: new Date('2026-07-05'), customsValue: 10000 },
      { entryDate: new Date('2026-07-20'), customsValue: 5000 },
      { entryDate: new Date('2026-06-10'), customsValue: 6000 },
      { entryDate: new Date('2026-05-10'), customsValue: 3000 },
      { entryDate: new Date('2026-08-10'), customsValue: 99999 }, // mes en curso: fuera
      { entryDate: new Date('2026-04-10'), customsValue: 99999 }, // >3 meses: fuera
    ];
    const s = calcularSimulador({ hoy: HOY, importaciones: imps, tc, pctGarantia: null });
    assert.equal(s.base.ultimoMes.valorAduanaUSD, 15000);
    assert.equal(s.ivaMensualMXN.ultimoMes, Math.round(15000 * 0.16 * 18.5 * 100) / 100);
    assert.equal(s.base.promedio3Meses.valorAduanaUSDMensual, 8000);
    assert.equal(s.ivaMensualMXN.promedio3Meses, Math.round(8000 * 0.16 * 18.5 * 100) / 100);
    assert.equal(s.iepsMensualMXN, null);
    assert.equal(s.garantia.pct, null); assert.equal(s.garantia.costoMensualMXN, null);
    assert.ok(s.garantia.nota.includes('No se inventa'));
    assert.equal(s.tipoCambio.rate, 18.5);
    const con = calcularSimulador({ hoy: HOY, importaciones: imps, tc, pctGarantia: 2.5 });
    assert.equal(con.garantia.costoMensualMXN, Math.round(con.ivaMensualMXN.promedio3Meses * 0.025 * 100) / 100);
    const vacio = calcularSimulador({ hoy: HOY, importaciones: [], tc, pctGarantia: null });
    assert.equal(vacio.sinDatos, true); assert.equal(vacio.ivaMensualMXN.ultimoMes, 0);
  });

  await test('repartirMonto: IVA primero, luego IEPS, sin exceder disponibles', () => {
    assert.deepEqual(repartirMonto(700, 500, 300), { ivaApplied: 500, iepsApplied: 200 });
    assert.deepEqual(repartirMonto(100, 500, 0), { ivaApplied: 100, iepsApplied: 0 });
  });

  console.log('\n== Fiscal: DB local (avisos idempotentes, descargo con saldo + audit) ==');
  soloLocal();
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenant = await prisma.tenant.create({ data: { name: `__fiscal_ola2_test__ ${nonce}` } });
  try {
    const cliente = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: 'FIS010101AAA', razonSocial: 'Fiscal Test', certificacionIVAIEPS: 'AA', padronImportadores: true, isDemoData: true } });
    await prisma.certificationProfile.create({ data: { tenantId: tenant.id, modality: 'AA', status: 'ACTIVE', issueDate: new Date('2026-01-15'), expiryDate: new Date('2027-01-15'), isDemoData: true } });

    await test('POST avisos es idempotente por (tenant, tipo, fecha): mismo evento dos veces = una fila', async () => {
      const a = await registrarAviso(tenant.id, { tipo: 'cambio_domicilio', fechaEvento: '2026-08-20', descripcion: 'Nueva planta Tijuana', clienteId: cliente.id });
      const b = await registrarAviso(tenant.id, { tipo: 'cambio_domicilio', fechaEvento: '2026-08-20', descripcion: 'Nueva planta Tijuana (repetido)', clienteId: cliente.id });
      assert.equal(a.creada, true); assert.equal(b.creada, false); assert.equal(a.obligacion.id, b.obligacion.id);
      assert.equal(a.obligacion.tipo, 'AVISO_IMMEX');
      assert.equal(a.obligacion.clienteId, cliente.id);
      assert.equal(a.obligacion.fechaLimite.toISOString().slice(0, 10), '2026-08-30', `plazo de trabajo ${AVISOS.cambio_domicilio.plazoDias} días`);
      assert.ok(a.obligacion.fundamento?.includes('pendiente de cotejo'));
      const c = await registrarAviso(tenant.id, { tipo: 'cambio_socios', fechaEvento: '2026-08-20', clienteId: cliente.id });
      assert.equal(c.creada, true); assert.equal(c.obligacion.tipo, 'CERT_IVA_IEPS');
      await assert.rejects(registrarAviso(tenant.id, { tipo: 'inventado' as never, fechaEvento: '2026-08-20', clienteId: null }), /inválido/);
    });

    await test('renovación: expiryDate − 30 días, idempotente, fundamento 7.1.6', async () => {
      const r1 = await sincronizarRenovacion(tenant.id, cliente.id);
      const r2 = await sincronizarRenovacion(tenant.id, cliente.id);
      assert.equal(r1.creada, true); assert.equal(r2.creada, false);
      assert.equal(r1.obligacion!.fechaLimite.toISOString().slice(0, 10), new Date(new Date('2027-01-15').getTime() - PLAZO_RENOVACION_DIAS * 86_400_000).toISOString().slice(0, 10));
      assert.ok(r1.obligacion!.fundamento?.includes('7.1.6'));
      const lista = await listarAvisos(tenant.id, cliente.id);
      assert.equal(lista.length, 3);
      const sem = await semaforoCertificacion(tenant.id, cliente.id, HOY);
      assert.equal(sem.rubro, 'AA');
      assert.equal(sem.obligaciones.find((o) => o.clave === 'AVISOS_CAMBIOS')!.estado, 'ambar', '3 avisos pendientes dentro de plazo');
      assert.equal(sem.obligaciones.find((o) => o.clave === 'PADRON_IMPORTADORES')!.estado, 'verde', 'padrón desde Cliente');
    });

    await test('descargo: rechaza sobre-saldo, reparte IVA/IEPS, actualiza saldo y deja audit trail', async () => {
      const credito = await prisma.taxCredit.create({ data: { tenantId: tenant.id, clienteId: cliente.id, pedimento: '26 07 3461 6000123', fractionCode: '73181599', ivaAmount: 1000, iepsAmount: 200, creditDate: new Date('2026-05-10'), dischargeDeadline: new Date('2027-11-10'), remaining: 1200, isDemoData: true } });
      await assert.rejects(descargarCredito({ creditId: credito.id, tenantId: tenant.id, userId: null, monto: 1500, pedimentoDescargo: '26 07 3461 7000001', fecha: '2026-08-20' }), (e: unknown) => e instanceof AppError && e.statusCode === 409);
      await assert.rejects(descargarCredito({ creditId: credito.id, tenantId: tenant.id, userId: null, monto: 100, pedimentoDescargo: '26 07 3461 7000001', fecha: '2099-01-01' }), /futura/);
      await assert.rejects(descargarCredito({ creditId: credito.id, tenantId: 'otro-tenant', userId: null, monto: 100, pedimentoDescargo: 'X', fecha: '2026-08-20' }), /no encontrado/);
      const r = await descargarCredito({ creditId: credito.id, tenantId: tenant.id, userId: null, monto: 1100, pedimentoDescargo: '26 07 3461 7000001', fecha: '2026-08-20' });
      assert.equal(r.usage.ivaApplied, 1000); assert.equal(r.usage.iepsApplied, 100);
      assert.equal(r.credito!.remaining, 100); assert.equal(r.credito!.status, 'PARTIALLY_USED');
      await assert.rejects(descargarCredito({ creditId: credito.id, tenantId: tenant.id, userId: null, monto: 100.5, pedimentoDescargo: 'Y', fecha: '2026-08-21' }), (e: unknown) => e instanceof AppError && e.statusCode === 409);
      const fin = await descargarCredito({ creditId: credito.id, tenantId: tenant.id, userId: null, ivaApplied: 0, iepsApplied: 100, pedimentoDescargo: 'Y', fecha: '2026-08-21' });
      assert.equal(fin.credito!.status, 'FULLY_USED');
      const audit = await prisma.auditLog.findMany({ where: { tenantId: tenant.id, action: 'DESCARGO_CREDITO', entityId: credito.id } });
      assert.equal(audit.length, 2, 'un registro de auditoría por descargo');
      assert.ok(audit[0].hash);
      const conc = await conciliacionPeriodo(tenant.id, cliente.id, '2026-Q3');
      assert.equal(conc.creditos.descargadoEnPeriodo, 1200);
      assert.equal(conc.creditos.saldoAlCierre, 0);
      assert.ok((await reporteCreditosXlsx(tenant.id, cliente.id)).length > 1000);
      // Parte B: tope de filas del export → 413; estado de cuenta agregado en DB cuadra con las filas.
      await assert.rejects(reporteCreditosXlsx(tenant.id, cliente.id, 0), (e: unknown) => (e as { statusCode?: number }).statusCode === 413);
      const cuenta = await getFiscalAccount(tenant.id);
      const agg = await prisma.taxCredit.aggregate({ where: { tenantId: tenant.id }, _sum: { ivaAmount: true, iepsAmount: true, discharged: true, remaining: true }, _count: { _all: true } });
      assert.equal(cuenta.totalCredits, agg._count._all);
      assert.equal(Math.round(cuenta.totalGranted * 100), Math.round(((agg._sum.ivaAmount ?? 0) + (agg._sum.iepsAmount ?? 0)) * 100));
      assert.equal(Math.round(cuenta.totalUsed * 100), Math.round((agg._sum.discharged ?? 0) * 100));
      assert.equal(Math.round(cuenta.byMonth.reduce((a, m) => a + m.granted, 0) * 100), Math.round(cuenta.totalGranted * 100));
      assert.equal(cuenta.byFraction.reduce((a, f) => a + f.count, 0), cuenta.totalCredits);
    });

    await test('simulador contra DB con TC inyectado y sin importaciones → estado vacío honesto', async () => {
      const tc: OfficialRate = { rate: 17, source: 'manual', asOf: HOY, isOfficial: false, warning: 'TC manual' };
      const s = await simuladorPerdida(tenant.id, cliente.id, { tc, hoy: HOY, pctGarantia: null });
      assert.equal(s.sinDatos, true);
      assert.equal(s.ivaMensualMXN.promedio3Meses, 0);
      assert.equal(s.tipoCambio.warning, 'TC manual');
    });
    await test('alcance por cliente (revisión A): otro cliente del tenant no ve avisos/créditos; {in} de varios sí; null = todo el tenant', async () => {
      const cliente2 = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: 'FIS020202BBB', razonSocial: 'Fiscal Test 2', isDemoData: true } });
      assert.equal((await listarAvisos(tenant.id, cliente2.id)).length, 0, 'restringido a cliente2 no ve los avisos de cliente1');
      assert.equal((await listarAvisos(tenant.id, { in: [cliente.id, cliente2.id] })).length, 3, 'alcance de varios clientes = filtro IN');
      assert.equal((await listarAvisos(tenant.id, null)).length, 3);
      const c2 = await conciliacionPeriodo(tenant.id, cliente2.id, '2026-Q3');
      assert.equal(c2.creditos.descargadoEnPeriodo, 0, 'el crédito de cliente1 no cuenta para cliente2');
      const cIn = await conciliacionPeriodo(tenant.id, { in: [cliente.id, cliente2.id] }, '2026-Q3');
      assert.equal(cIn.creditos.descargadoEnPeriodo, 1200);
      const sem = await semaforoCertificacion(tenant.id, { in: [cliente.id, cliente2.id] }, HOY);
      assert.equal(sem.obligaciones.find((o) => o.clave === 'AVISOS_CAMBIOS')!.estado, 'ambar');
    });

    await test('permisos: fiscalGuardian.create/delete existen en todos los roles del seed (TENANT_ADMIN sí, VIEWER/CLIENTE_CONSULTA no)', async () => {
      const { SYSTEM_ROLES, hasPermission } = await import('../services/permissions');
      for (const r of SYSTEM_ROLES) {
        const fg = r.permissions.modules.fiscalGuardian!;
        assert.equal(typeof fg.create, 'boolean', `${r.code}: create definido`);
        assert.equal(typeof fg.delete, 'boolean', `${r.code}: delete definido`);
      }
      const de = (code: string) => SYSTEM_ROLES.find(r => r.code === code)!.permissions;
      assert.equal(hasPermission(de('TENANT_ADMIN'), 'fiscalGuardian', 'create'), true);
      assert.equal(hasPermission(de('TENANT_ADMIN'), 'fiscalGuardian', 'delete'), true);
      assert.equal(hasPermission(de('GERENTE'), 'fiscalGuardian', 'delete'), true);
      assert.equal(hasPermission(de('VIEWER'), 'fiscalGuardian', 'create'), false);
      assert.equal(hasPermission(de('CLIENTE_CONSULTA'), 'fiscalGuardian', 'create'), false);
      assert.equal(hasPermission(de('CAPTURISTA'), 'fiscalGuardian', 'delete'), false);
    });
  } finally {
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.creditUsage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.taxCredit.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.obligacionCalendario.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.certificationProfile.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.cliente.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
