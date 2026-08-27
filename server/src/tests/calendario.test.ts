/**
 * Calendario de obligaciones (Operación 2026-08): fechas, siembra base
 * idempotente, recurrente que se regenera al cumplirse, vencida → alerta
 * con acción ver_obligacion, aislamiento por tenant.
 *   npm run test:calendario
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import {
  CATALOGO_BASE, ultimoDiaHabilDelMes, siguienteMensual, siguienteFechaRecurrente, semaforo, validarEntrada,
  sembrarBase, crearObligacion, marcarCumplida, procesarVencimientos, listarObligaciones, actualizarObligacion, eliminarObligacion,
} from '../services/calendario-obligaciones';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}
const SUFIJO = `cal-${Date.now()}`;
const AHORA = new Date('2026-08-27T12:00:00Z');

(async () => {
  console.log('— fechas y catálogo (puro) —');
  await prueba('último día hábil de mayo 2026 = viernes 29', () => {
    assert.equal(ultimoDiaHabilDelMes(2026, 4).toISOString().slice(0, 10), '2026-05-29');
    assert.equal(ultimoDiaHabilDelMes(2027, 4).toISOString().slice(0, 10), '2027-05-31'); // lunes
  });
  await prueba('siguiente mensual salta al mes próximo si el día ya pasó', () => {
    assert.equal(siguienteMensual(AHORA, 5).toISOString().slice(0, 10), '2026-09-05');
    assert.equal(siguienteMensual(AHORA, 30).toISOString().slice(0, 10), '2026-08-30');
  });
  await prueba('recurrencia: ANUAL +1 año, MENSUAL +1 mes, UNICA null', () => {
    const f = new Date('2026-05-29T12:00:00Z');
    assert.equal(siguienteFechaRecurrente(f, 'ANUAL')!.toISOString().slice(0, 10), '2027-05-29');
    assert.equal(siguienteFechaRecurrente(f, 'MENSUAL')!.toISOString().slice(0, 10), '2026-06-29');
    assert.equal(siguienteFechaRecurrente(f, 'UNICA'), null);
  });
  await prueba('semáforo: ≤7 rojo, ≤30 ámbar, >30 verde, cumplida gris, vencida rojo', () => {
    const d = (n: number) => new Date(AHORA.getTime() + n * 86400000);
    assert.equal(semaforo(d(3), 'pendiente', AHORA), 'rojo');
    assert.equal(semaforo(d(20), 'pendiente', AHORA), 'ambar');
    assert.equal(semaforo(d(60), 'pendiente', AHORA), 'verde');
    assert.equal(semaforo(d(60), 'cumplida', AHORA), 'gris');
    assert.equal(semaforo(d(-2), 'vencida', AHORA), 'rojo');
  });
  await prueba('catálogo base: Reporte Anual SE marcado cotejo pendiente y cae en último hábil de mayo', () => {
    const r = CATALOGO_BASE.find(b => b.tipo === 'REPORTE_ANUAL_SE')!;
    assert.equal(r.cotejo, 'pendiente');
    assert.equal(r.proximaFecha(AHORA).toISOString().slice(0, 10), '2027-05-31');
    assert.ok(CATALOGO_BASE.every(b => b.fundamento.length > 10 && b.consecuencia.length > 10));
    assert.ok(CATALOGO_BASE.some(b => b.tipo === 'ANEXO_24') && CATALOGO_BASE.some(b => b.tipo === 'ANEXO_30') && CATALOGO_BASE.some(b => b.tipo === 'OPINION_32D'));
  });
  await prueba('validación de entrada', () => {
    assert.equal(validarEntrada({ tipo: 'OTRA', titulo: 'Algo', fechaLimite: '2026-09-01' }), null);
    assert.ok(validarEntrada({ tipo: 'NOPE', titulo: 'Algo', fechaLimite: '2026-09-01' }));
    assert.ok(validarEntrada({ tipo: 'OTRA', titulo: 'Algo', fechaLimite: 'x' }));
    assert.ok(validarEntrada({ tipo: 'OTRA', titulo: 'Algo', fechaLimite: '2026-09-01', recurrencia: 'SEMANAL' }));
  });

  console.log('— con tenant de prueba —');
  const tenant = await prisma.tenant.create({ data: { name: `Test ${SUFIJO}`, status: 'ACTIVE' } });
  const otro = await prisma.tenant.create({ data: { name: `Otro ${SUFIJO}`, status: 'ACTIVE' } });
  const cliente = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `RFC${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente IMMEX', programaIMMEX: 'IMMEX-123', certificacionIVAIEPS: null } });
  const limpiar = async () => {
    await prisma.alert.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.obligacionCalendario.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.document.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otro.id] } } });
  };
  try {
    await prueba('siembra base por cliente: omite lo que no aplica (sin certificación) y es idempotente', async () => {
      const r1 = await sembrarBase(tenant.id, { clienteId: cliente.id, ahora: AHORA });
      assert.deepEqual(r1.omitidas.sort(), ['ANEXO_30', 'CERT_IVA_IEPS']);
      assert.equal(r1.creadas, CATALOGO_BASE.length - 2);
      const r2 = await sembrarBase(tenant.id, { clienteId: cliente.id, ahora: AHORA });
      assert.equal(r2.creadas, 0);
      assert.equal(r2.existentes, CATALOGO_BASE.length - 2);
      assert.equal(await prisma.obligacionCalendario.count({ where: { tenantId: tenant.id, clienteId: cliente.id } }), CATALOGO_BASE.length - 2);
      const reporte = await prisma.obligacionCalendario.findFirst({ where: { tenantId: tenant.id, tipo: 'REPORTE_ANUAL_SE' } });
      assert.ok(reporte!.fundamento!.includes('cotejo: pendiente'));
    });
    await prueba('idempotencia con filas del módulo Fiscal (mismo tenant+cliente+tipo+día)', async () => {
      const cert = CATALOGO_BASE.find(b => b.tipo === 'CERT_IVA_IEPS')!;
      await prisma.obligacionCalendario.create({ data: { tenantId: tenant.id, clienteId: cliente.id, tipo: 'CERT_IVA_IEPS', titulo: 'Creada por Fiscal', fechaLimite: cert.proximaFecha(AHORA) } });
      const r = await sembrarBase(tenant.id, { clienteId: cliente.id, ahora: AHORA, tieneCertIVAIEPS: true });
      assert.equal(r.creadas, 1, 'solo ANEXO_30 nuevo; CERT ya existía por Fiscal');
      assert.equal(await prisma.obligacionCalendario.count({ where: { tenantId: tenant.id, tipo: 'CERT_IVA_IEPS' } }), 1);
    });
    await prueba('siembra a nivel tenant (sin cliente) no choca con la del cliente', async () => {
      const r = await sembrarBase(tenant.id, { ahora: AHORA });
      assert.equal(r.creadas, CATALOGO_BASE.length);
    });
    await prueba('recurrente se regenera al cumplirse (con evidencia Document del tenant) y no se duplica', async () => {
      const mensual = await crearObligacion(tenant.id, { tipo: 'ANEXO_24', titulo: 'Cierre mensual', fechaLimite: '2026-09-05T12:00:00Z', recurrencia: 'MENSUAL', clienteId: cliente.id });
      const doc = await prisma.document.create({ data: { tenantId: tenant.id, name: 'Acuse', type: 'evidencia', status: 'VERIFIED' } });
      const r = await marcarCumplida(tenant.id, mensual.id, doc.id, AHORA);
      assert.equal(r!.cumplida.estado, 'cumplida');
      assert.equal(r!.cumplida.evidenciaDocumentId, doc.id);
      assert.equal(r!.siguiente!.fechaLimite.toISOString().slice(0, 10), '2026-10-05');
      assert.equal(r!.siguiente!.estado, 'pendiente');
      // Cumplir de nuevo la misma no crea otra octubre
      const r2 = await marcarCumplida(tenant.id, mensual.id, null, AHORA);
      assert.equal(r2!.siguiente, null);
      assert.equal(await prisma.obligacionCalendario.count({ where: { tenantId: tenant.id, tipo: 'ANEXO_24', clienteId: cliente.id, fechaLimite: new Date('2026-10-05T12:00:00Z') } }), 1);
    });
    await prueba('evidencia de otro tenant se rechaza', async () => {
      const ajena = await prisma.document.create({ data: { tenantId: otro.id, name: 'Ajeno', type: 'evidencia', status: 'VERIFIED' } });
      const o = await crearObligacion(tenant.id, { tipo: 'OTRA', titulo: 'Con evidencia ajena', fechaLimite: '2026-12-01' });
      await assert.rejects(() => marcarCumplida(tenant.id, o.id, ajena.id), /Document de tu empresa/);
    });
    await prueba('vencida genera alerta obligacion_vencida con acción ver_obligacion; próxima genera aviso; sin duplicar', async () => {
      const vencida = await crearObligacion(tenant.id, { tipo: 'OPINION_32D', titulo: 'Opinión vencida', fechaLimite: new Date(AHORA.getTime() - 2 * 86400000) });
      const proxima = await crearObligacion(tenant.id, { tipo: 'PADRON', titulo: 'Padrón próximo', fechaLimite: new Date(AHORA.getTime() + 3 * 86400000) });
      const r = await procesarVencimientos(tenant.id, AHORA);
      assert.equal(r.vencidas, 1);
      assert.equal(r.alertas, 2);
      const v = await prisma.obligacionCalendario.findUnique({ where: { id: vencida.id } });
      assert.equal(v!.estado, 'vencida');
      const a = await prisma.alert.findFirst({ where: { tenantId: tenant.id, type: 'obligacion_vencida' } });
      assert.ok(a);
      assert.equal(a!.severity, 'critical');
      assert.deepEqual(a!.suggestedAction, { type: 'ver_obligacion', label: 'Ver obligación', payload: { obligacionId: vencida.id, route: `/calendario/${vencida.id}` } });
      const p = await prisma.alert.findFirst({ where: { tenantId: tenant.id, type: 'obligacion_proxima' } });
      assert.equal(p!.severity, 'critical', '3 días = inminente para tipo sin monto');
      assert.equal((p!.suggestedAction as { payload: { obligacionId: string } }).payload.obligacionId, proxima.id);
      const r2 = await procesarVencimientos(tenant.id, AHORA);
      assert.equal(r2.alertas, 0, 'fingerprint evita duplicar');
      assert.equal(r2.vencidas, 0);
    });
    await prueba('listar filtra por cliente y estado; actualizar/eliminar acotados por tenant', async () => {
      const porCliente = await listarObligaciones(tenant.id, { clienteId: cliente.id });
      assert.ok(porCliente.every(o => o.clienteId === cliente.id));
      const vencidas = await listarObligaciones(tenant.id, { estado: 'vencida' });
      assert.equal(vencidas.length, 1);
      const ajeno = await actualizarObligacion(otro.id, vencidas[0]!.id, { titulo: 'Hackeada' });
      assert.equal(ajeno, null);
      assert.equal(await eliminarObligacion(otro.id, vencidas[0]!.id), false);
      assert.equal(await eliminarObligacion(tenant.id, vencidas[0]!.id), true);
      assert.equal(await prisma.obligacionCalendario.count({ where: { tenantId: otro.id } }), 0);
    });
  } finally {
    await limpiar();
  }
  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
})();
