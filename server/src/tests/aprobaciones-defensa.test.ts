/**
 * Cuarta revisión, prioridad 4 — Aprobaciones → Defensa.
 *
 * Hallazgo del revisor: "el paquete de defensa dice 'sin aprobación registrada'
 * incluso en registros approved". Causa real: `Classification.status` /
 * `Quote.status` nacen en `@default("approved")`, así que los históricos están
 * "aprobados" SIN `approvedById`. Aquí se fija el comportamiento correcto:
 *
 *  1. aprobar() deja approvedById + approvedAt + motivo + AuditLog encadenado,
 *     y el paquete de Defensa lo muestra con nombre, correo, rol y hash.
 *  2. rechazar() deja rastro y NO marca aprobación.
 *  3. un registro histórico sin aprobador muestra el texto honesto
 *     "aprobación anterior al registro de aprobadores (sin dato)".
 *  4. la cadena de hashes verifica OK después de aprobar (verifyChain).
 *  5. la ratificación de un legado es posible y queda marcada como tal.
 *  6. la regularización de la bandeja es idempotente y no toca otros tenants.
 *  7. la puerta legacy /classify/:id/approve escribe el mismo rastro.
 *
 *   npm run test:aprobaciones-defensa   (solo DB local)
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { verifyChain } from '../services/audit-service';
import {
  aprobar, rechazar, pendientes, conteoPendientes,
  diagnosticarBandeja, regularizarAprobacionesSembradas,
  ACCION_APROBADA, ACCION_RECHAZADA, ACCION_SEED_RESTAURADA,
} from '../services/aprobaciones';
import { armarPaqueteDefensa, LEYENDA_APROBACION_LEGADO, LEYENDA_APROBACION_SEMBRADA, LEYENDA_SIN_FLUJO } from '../services/defensa';
import { seedTenantRoles } from '../services/permissions';

let pasan = 0, fallan = 0;
async function caso(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasan++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallan++; console.log(`  ✗ ${nombre}\n    ${(e as Error).stack ?? (e as Error).message}`); }
}
function soloLocal(): void {
  let host = '';
  try { host = new URL(process.env.DATABASE_URL ?? '').hostname; } catch { /* */ }
  if (!/^(localhost|127\.0\.0\.1)$/.test(host)) throw new Error(`REFUSED: solo DB local (host=${host || '?'})`);
}

const BASE = 'https://app.test';

async function main() {
  soloLocal();
  console.log('Aprobaciones → Defensa (cuarta revisión, prioridad 4)');
  const nonce = `${Date.now()}`;
  let tA: string | undefined, tB: string | undefined;
  try {
    const a = await prisma.tenant.create({ data: { name: `__apro_def_A__ ${nonce}`, rfc: 'XAXX010101000' } });
    const b = await prisma.tenant.create({ data: { name: `__apro_def_B__ ${nonce}` } });
    tA = a.id; tB = b.id;
    await seedTenantRoles(tA); await seedTenantRoles(tB);

    const junior = await prisma.user.create({ data: { email: `apro-j-${nonce}@test.local`, password: 'x', name: 'Junior Capturista', tenantId: tA } });
    const patente = await prisma.user.create({ data: { email: `apro-p-${nonce}@test.local`, password: 'x', name: 'Agente con Patente', tenantId: tA } });
    const rolValidador = await prisma.tenantRole.findUnique({ where: { tenantId_code: { tenantId: tA, code: 'VALIDATOR' } } });
    assert.ok(rolValidador, 'seedTenantRoles debe dejar VALIDATOR');
    await prisma.userTenantRole.create({ data: { userId: patente.id, tenantId: tA, roleId: rolValidador.id, assignedBy: patente.id, reason: 'prueba', active: true } });

    const nuevaCls = (status: string, extra: Record<string, unknown> = {}) => prisma.classification.create({
      data: { tenantId: tA!, userId: junior.id, inputDescription: 'válvula de bola de acero', fractionCode: '84818099', confidence: 0.8, griApplied: ['1'], status, ...extra },
    });

    // ── 1. aprobar deja aprobador + fecha + motivo + AuditLog, y Defensa lo muestra
    const cls = await nuevaCls('pending_approval');
    await caso('aprobar escribe approvedById/approvedAt y un AuditLog encadenado APPROVAL_GRANTED', async () => {
      const r = await aprobar('clasificacion', cls.id, tA!, patente.id, { motivo: 'Coincide con criterio SAT 2026' });
      assert.equal(r.status, 'approved');
      assert.equal(r.approvedById, patente.id);
      const fila = await prisma.classification.findFirst({ where: { id: cls.id, tenantId: tA! } });
      assert.equal(fila?.approvedById, patente.id, 'persistió en la fila');
      assert.ok(fila?.approvedAt instanceof Date, 'persistió la fecha');
      const ev = await prisma.auditLog.findFirst({ where: { tenantId: tA!, entityId: cls.id, action: ACCION_APROBADA } });
      assert.ok(ev, 'hay evento de aprobación');
      assert.equal(ev!.entity, 'Classification');
      assert.equal(ev!.userId, patente.id);
      assert.equal((ev!.metadata as { motivo?: string }).motivo, 'Coincide con criterio SAT 2026');
      assert.equal(ev!.hash.length, 64, 'hash SHA-256');
    });

    await caso('el paquete de Defensa muestra quién aprobó, con rol vigente, motivo y el evento con su hash', async () => {
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'classification', id: cls.id, baseUrl: BASE });
      const ap = p!.aprobaciones;
      assert.equal(ap.aplica, true);
      assert.equal(ap.estado, 'aprobada');
      assert.equal(ap.aprobadoPor?.id, patente.id);
      assert.equal(ap.aprobadoPor?.email, patente.email);
      assert.equal(ap.aprobadoPor?.rol, 'VALIDATOR', 'rol vigente al momento de aprobar');
      assert.ok(ap.approvedAt, 'fecha de aprobación');
      assert.equal(ap.motivo, 'Coincide con criterio SAT 2026');
      assert.equal(ap.decision?.action, ACCION_APROBADA);
      assert.equal(ap.decision?.por?.id, patente.id);
      assert.equal(ap.decision?.hash.length, 64);
      assert.equal(ap.decision?.ratificacionLegado, false);
      assert.match(ap.leyenda, /Agente con Patente/);
      assert.match(ap.leyenda, /VALIDATOR/);
      assert.match(ap.leyenda, /Coincide con criterio SAT 2026/);
      assert.doesNotMatch(ap.leyenda, /sin aprobación registrada/);
      assert.deepEqual(ap.bandeja, { ruta: '/aprobaciones', tipo: 'clasificacion' }, 'ida y vuelta a la bandeja');
    });

    await caso('la cadena de hashes del tenant sigue íntegra después de aprobar', async () => {
      const cadena = await verifyChain(tA!);
      assert.equal(cadena.valid, true, `cadena rota en ${cadena.brokenAt ?? '?'}`);
      assert.ok(cadena.checkedCount >= 1);
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'classification', id: cls.id, baseUrl: BASE });
      assert.equal(p!.bitacora.cadena.valid, true, 'el paquete reporta la cadena verificada');
      assert.deepEqual(p!.bitacora.cadena, cadena);
    });

    // ── 2. rechazar: rastro sí, aprobación no
    const clsRech = await nuevaCls('pending_approval');
    await caso('rechazar deja rastro con motivo y NO marca aprobación', async () => {
      const r = await rechazar('clasificacion', clsRech.id, tA!, patente.id, 'Falta ficha técnica del proveedor');
      assert.equal(r.status, 'rejected');
      assert.equal(r.approvedById, null);
      const fila = await prisma.classification.findFirst({ where: { id: clsRech.id, tenantId: tA! } });
      assert.equal(fila?.approvedById, null, 'un rechazo no escribe aprobador');
      assert.equal(fila?.approvedAt, null);
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'classification', id: clsRech.id, baseUrl: BASE });
      const ap = p!.aprobaciones;
      assert.equal(ap.estado, 'rechazada');
      assert.equal(ap.aprobadoPor, null, 'el paquete no inventa aprobador en un rechazo');
      assert.equal(ap.approvedAt, null);
      assert.equal(ap.decision?.action, ACCION_RECHAZADA);
      assert.equal(ap.motivo, 'Falta ficha técnica del proveedor');
      assert.match(ap.leyenda, /Rechazada por Agente con Patente/);
      assert.equal((await verifyChain(tA!)).valid, true, 'cadena íntegra tras rechazar');
    });

    // ── 3. registro histórico sin aprobador: texto honesto
    const clsLegado = await nuevaCls('approved'); // el default del schema, sin approvedById
    await caso('registro histórico approved SIN aprobador: texto honesto, no "sin aprobación registrada"', async () => {
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'classification', id: clsLegado.id, baseUrl: BASE });
      const ap = p!.aprobaciones;
      assert.equal(ap.status, 'approved');
      assert.equal(ap.estado, 'aprobada_sin_aprobador');
      assert.equal(ap.aprobadoPor, null);
      assert.equal(ap.leyenda, LEYENDA_APROBACION_LEGADO);
      assert.equal(ap.leyenda, 'aprobación anterior al registro de aprobadores (sin dato)');
      assert.doesNotMatch(ap.leyenda, /^sin aprobación registrada$/);
    });

    await caso('un registro sembrado (isDemoData) approved se distingue del legado real', async () => {
      const sembrada = await nuevaCls('approved', { isDemoData: true });
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'classification', id: sembrada.id, baseUrl: BASE });
      assert.equal(p!.aprobaciones.estado, 'aprobada_sembrada');
      assert.equal(p!.aprobaciones.leyenda, LEYENDA_APROBACION_SEMBRADA);
    });

    // ── 5. ratificación del legado
    await caso('un legado sin aprobador SÍ se puede ratificar; queda marcado como ratificación', async () => {
      const r = await aprobar('clasificacion', clsLegado.id, tA!, patente.id, { motivo: 'Ratifico tras revisar el expediente' });
      assert.equal(r.approvedById, patente.id);
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'classification', id: clsLegado.id, baseUrl: BASE });
      assert.equal(p!.aprobaciones.estado, 'aprobada');
      assert.equal(p!.aprobaciones.decision?.ratificacionLegado, true);
      assert.match(p!.aprobaciones.leyenda, /ratificación de un registro legado/);
      // Ya con aprobador, una segunda aprobación se rechaza (400).
      await assert.rejects(() => aprobar('clasificacion', clsLegado.id, tA!, patente.id), /Ya está aprobado/);
      assert.equal((await verifyChain(tA!)).valid, true);
    });

    await caso('tipos sin flujo de aprobación (risk) lo dicen en vez de fingir un hueco', async () => {
      const risk = await prisma.riskAssessment.create({ data: { tenantId: tA!, userId: junior.id, input: {}, exposicion: 10, escudoPct: 50, banda: 'VERDE', detalle: {}, checklist: {}, rulesVersion: 'v-prueba', pesosSnapshot: {} } });
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'risk', id: risk.id, baseUrl: BASE });
      assert.equal(p!.aprobaciones.aplica, false);
      assert.equal(p!.aprobaciones.estado, 'sin_flujo');
      assert.equal(p!.aprobaciones.leyenda, LEYENDA_SIN_FLUJO);
      assert.equal(p!.aprobaciones.bandeja, null);
    });

    // ── 6. regularización de la bandeja
    await caso('diagnóstico: separa sembrados en bandeja, propuestos de verdad y legado sin aprobador', async () => {
      await nuevaCls('pending_approval', { isDemoData: true });
      await nuevaCls('pending_approval', { isDemoData: true });
      const realPend = await nuevaCls('pending_approval');
      const d = await diagnosticarBandeja(tA!);
      assert.equal(d.sembradosPendientes.clasificaciones, 2);
      assert.equal(d.propuestosDeVerdad.clasificaciones, 1);
      assert.ok(d.aprobadosSinAprobador.clasificaciones >= 1, 'cuenta el legado approved sin aprobador');
      assert.equal((await conteoPendientes(tA!)).total, 3);
      assert.ok((await pendientes(tA!)).some(x => x.id === realPend.id));
    });

    await caso('regularizar es idempotente, deja sólo los pendientes reales y escribe evento encadenado', async () => {
      const dry = await regularizarAprobacionesSembradas(tA!, { dryRun: true });
      assert.equal(dry.clasificaciones.candidatas, 2);
      assert.equal(dry.clasificaciones.regularizadas, 0, 'dry-run no escribe');
      assert.equal((await conteoPendientes(tA!)).total, 3, 'dry-run no movió nada');

      const r1 = await regularizarAprobacionesSembradas(tA!, {});
      assert.equal(r1.clasificaciones.regularizadas, 2);
      assert.equal(r1.pendientesRestantes, 1, 'sólo queda el que de verdad espera revisión');
      const eventos = await prisma.auditLog.findMany({ where: { tenantId: tA!, action: ACCION_SEED_RESTAURADA } });
      assert.equal(eventos.length, 2);
      assert.ok(eventos.every(e => e.hash.length === 64), 'encadenados');
      assert.equal((await verifyChain(tA!)).valid, true, 'cadena íntegra tras regularizar');

      const r2 = await regularizarAprobacionesSembradas(tA!, {});
      assert.equal(r2.clasificaciones.candidatas, 0, 'idempotente: segunda corrida sin candidatos');
      assert.equal(r2.cotizaciones.candidatas, 0);
      assert.equal(r2.pendientesRestantes, 1);
      assert.equal(await prisma.auditLog.count({ where: { tenantId: tA!, action: ACCION_SEED_RESTAURADA } }), 2, 'no duplica eventos');
    });

    await caso('la regularización está acotada al tenant: la bandeja de B queda intacta', async () => {
      const juniorB = await prisma.user.create({ data: { email: `apro-b-${nonce}@test.local`, password: 'x', name: 'Junior B', tenantId: tB! } });
      const clsB = await prisma.classification.create({ data: { tenantId: tB!, userId: juniorB.id, inputDescription: 'tornillo', fractionCode: '73181599', confidence: 0.7, griApplied: [], status: 'pending_approval', isDemoData: true } });
      const antes = await conteoPendientes(tB!);
      await regularizarAprobacionesSembradas(tA!, {});
      assert.deepEqual(await conteoPendientes(tB!), antes, 'B no se movió');
      assert.equal((await prisma.classification.findFirst({ where: { id: clsB.id, tenantId: tB! } }))?.status, 'pending_approval');
      assert.equal(await prisma.auditLog.count({ where: { tenantId: tB! } }), 0, 'ningún evento en B');
      await assert.rejects(() => regularizarAprobacionesSembradas('', {}), /tenantId requerido/);
    });

    // ── 7. la puerta legacy /classify/:id/approve pasa por el mismo servicio
    await caso('la cotización aprobada también deja rastro y el paquete de Defensa lo muestra', async () => {
      const q = await prisma.quote.create({ data: { tenantId: tA!, userId: junior.id, fractionCode: '84818099', customsValue: 1200, origin: 'US', result: '{}', status: 'pending_approval' } });
      await aprobar('cotizacion', q.id, tA!, patente.id, { motivo: 'Tasas cotejadas contra TIGIE' });
      const p = await armarPaqueteDefensa({ tenantId: tA!, tipo: 'quote', id: q.id, baseUrl: BASE });
      assert.equal(p!.aprobaciones.estado, 'aprobada');
      assert.equal(p!.aprobaciones.aprobadoPor?.id, patente.id);
      assert.equal(p!.aprobaciones.motivo, 'Tasas cotejadas contra TIGIE');
      assert.equal(p!.aprobaciones.decision?.action, ACCION_APROBADA);
      assert.deepEqual(p!.aprobaciones.bandeja, { ruta: '/aprobaciones', tipo: 'cotizacion' });
      assert.equal((await verifyChain(tA!)).valid, true);
    });
  } finally {
    for (const t of [tA, tB]) {
      if (!t) continue;
      await prisma.auditLog.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.permissionAuditLog.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.classification.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.quote.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.riskAssessment.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.userTenantRole.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.tenantRole.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: t } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
  console.log(`\n${pasan} pasan · ${fallan} fallan`);
  if (fallan > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
