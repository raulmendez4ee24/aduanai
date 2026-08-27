/**
 * Ola 1 — multi-cliente y roles (Operación 2026-08).
 *
 *   npm run test:clientes
 *
 * Parte PURA (sin DB): roles nuevos coherentes (CAPTURISTA no aprueba,
 * CLIENTE_CONSULTA no crea, TENANT_ADMIN todo, VIEWER solo view en módulos
 * nuevos), schema estricto acepta todos los roles, lectura de
 * scopeRestrictions, filtroCliente/clienteIdDe con y sin alcance.
 *
 * Parte DB (base local; crea y borra sus propios tenants): CRUD aislado por
 * tenant, backfill acotado, clienteScope niega fuera de restricción,
 * roles sembrados, flujo propone→aprueba con rastro en AuditLog.
 */
import { strict as assert } from 'node:assert';
import type { NextFunction, Request } from 'express';
import {
  SYSTEM_ROLES, hasPermission, validateRolePermissions, seedTenantRoles, getUserPermissions,
  type RolePermissions,
} from '../services/permissions';
import { clienteIdsDeRestriccion, clienteScope, resolverClientesPermitidos } from '../middlewares/clienteScope';
import { clienteIdDe, filtroCliente } from '../lib/cliente-contexto';
import type { AuthRequest } from '../middlewares/auth';
import { AppError } from '../middlewares/error';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

function rol(code: string): RolePermissions {
  const r = SYSTEM_ROLES.find(x => x.code === code);
  if (!r) throw new Error(`rol ${code} no existe`);
  return r.permissions;
}

const MODULOS_NUEVOS = ['preglosa', 'risk', 'origin', 'catalogo', 'calendario', 'clientes'] as const;

async function parteFuncional(): Promise<void> {
  console.log('— roles nuevos (puro) —');
  await prueba('existen CAPTURISTA, GLOSADOR, GERENTE y CLIENTE_CONSULTA y pasan el schema estricto', () => {
    for (const c of ['CAPTURISTA', 'GLOSADOR', 'GERENTE', 'CLIENTE_CONSULTA']) {
      assert.deepEqual(validateRolePermissions(rol(c)), rol(c), c);
    }
    assert.equal(SYSTEM_ROLES[0]!.code, 'TENANT_ADMIN', 'fallback [0] intacto');
    assert.equal(SYSTEM_ROLES[1]!.code, 'CLASSIFIER', 'fallback [1] intacto');
  });
  await prueba('CAPTURISTA crea (clasificador/cotizador/expedientes) pero NO aprueba ni firma ni configura', () => {
    const p = rol('CAPTURISTA');
    assert.equal(hasPermission(p, 'classifier', 'create'), true);
    assert.equal(hasPermission(p, 'quoter', 'create'), true);
    assert.equal(hasPermission(p, 'expedientes', 'create'), true);
    assert.equal(hasPermission(p, 'classifier', 'approve'), false);
    assert.equal(hasPermission(p, 'quoter', 'approve'), false);
    assert.equal(hasPermission(p, 'preglosa', 'approve'), false);
    assert.equal(hasPermission(p, 'autoMVE', 'sign'), false);
    assert.equal(hasPermission(p, 'classifier', 'settings'), false);
  });
  await prueba('GLOSADOR aprueba glosa/clasificación/cotización y ve expedientes; no configura', () => {
    const p = rol('GLOSADOR');
    assert.equal(hasPermission(p, 'preglosa', 'approve'), true);
    assert.equal(hasPermission(p, 'preglosa', 'create'), true);
    assert.equal(hasPermission(p, 'classifier', 'approve'), true);
    assert.equal(hasPermission(p, 'quoter', 'approve'), true);
    assert.equal(hasPermission(p, 'expedientes', 'view'), true);
    assert.equal(hasPermission(p, 'classifier', 'settings'), false);
  });
  await prueba('GERENTE: view + approve + reportes en todo; sin settings ni autorizar pagos', () => {
    const p = rol('GERENTE');
    for (const m of ['classifier', 'quoter', 'preglosa', 'origin', 'catalogo'] as const) {
      assert.equal(hasPermission(p, m, 'view'), true, `${m}.view`);
      assert.equal(hasPermission(p, m, 'approve'), true, `${m}.approve`);
    }
    assert.equal(hasPermission(p, 'risk', 'generateReport'), true);
    assert.equal(hasPermission(p, 'fiscalGuardian', 'generateReport'), true);
    assert.equal(hasPermission(p, 'classifier', 'settings'), false);
    assert.equal(hasPermission(p, 'payment', 'authorize'), false);
  });
  await prueba('CLIENTE_CONSULTA solo ve; no crea nada en ningún módulo', () => {
    const p = rol('CLIENTE_CONSULTA');
    for (const m of ['classifier', 'quoter', 'autoMVE', 'expedientes', 'preglosa', 'risk', 'origin', 'catalogo'] as const) {
      assert.equal(hasPermission(p, m, 'view'), true, `${m}.view`);
      assert.equal(hasPermission(p, m, 'create'), false, `${m}.create`);
      assert.equal(hasPermission(p, m, 'approve'), false, `${m}.approve`);
    }
    assert.equal(hasPermission(p, 'clientes', 'view'), false, 'no ve la cartera de la agencia');
    assert.equal(hasPermission(p, 'classifier', 'exportData'), false);
  });
  await prueba('módulos nuevos presentes en TODOS los roles: TENANT_ADMIN todo, VIEWER solo view', () => {
    for (const r of SYSTEM_ROLES) {
      for (const m of MODULOS_NUEVOS) {
        assert.ok(r.permissions.modules[m], `${r.code} sin módulo ${m}`);
      }
    }
    const admin = rol('TENANT_ADMIN');
    for (const m of MODULOS_NUEVOS) {
      assert.equal(hasPermission(admin, m, 'view'), true);
      assert.equal(hasPermission(admin, m, 'create'), true);
    }
    const viewer = rol('VIEWER');
    for (const m of MODULOS_NUEVOS) {
      assert.equal(hasPermission(viewer, m, 'view'), true, `VIEWER.${m}.view`);
      assert.equal(hasPermission(viewer, m, 'create'), false, `VIEWER.${m}.create`);
      assert.equal(hasPermission(viewer, m, 'approve'), false, `VIEWER.${m}.approve`);
    }
  });

  console.log('\n— alcance por cliente (puro) —');
  await prueba('clienteIdsDeRestriccion lee { clienteIds } e ignora basura', () => {
    assert.deepEqual(clienteIdsDeRestriccion({ clienteIds: ['a', 'b', '', 3] }), ['a', 'b']);
    assert.equal(clienteIdsDeRestriccion(null), null);
    assert.equal(clienteIdsDeRestriccion({ otra: 1 }), null);
    assert.equal(clienteIdsDeRestriccion(['a']), null);
  });
  await prueba('filtroCliente: sin alcance ni header → {}; header → clienteId; alcance múltiple → in[]; alcance único → ese id', () => {
    const base = (h?: string, permitidos?: string[] | null) => ({
      headers: h ? { 'x-cliente-id': h } : {}, query: {}, clienteIdsPermitidos: permitidos,
    }) as unknown as Request;
    assert.deepEqual(filtroCliente(base()), {});
    assert.deepEqual(filtroCliente(base('c1')), { clienteId: 'c1' });
    assert.deepEqual(filtroCliente(base(undefined, ['c1', 'c2'])), { clienteId: { in: ['c1', 'c2'] } });
    assert.equal(clienteIdDe(base(undefined, ['c1', 'c2'])), null, 'creación sin header con varios → null');
    assert.deepEqual(filtroCliente(base(undefined, ['c1'])), { clienteId: 'c1' });
    assert.equal(clienteIdDe(base(undefined, ['c1'])), 'c1');
    assert.deepEqual(filtroCliente(base(undefined, [])), { clienteId: { in: [] } }, 'alcance vacío no ve nada');
  });
}

async function parteDB(): Promise<void> {
  const { prisma } = await import('../lib/prisma');
  const clientes = await import('../services/clientes');
  const apro = await import('../services/aprobaciones');
  const marca = `t-${Date.now()}`;
  const tA = `clirol-A-${marca}`, tB = `clirol-B-${marca}`;
  const creados: { users: string[] } = { users: [] };
  try {
    console.log('\n— DB: tenants de prueba propios —');
    await prisma.tenant.create({ data: { id: tA, name: 'Agencia A Prueba', rfc: 'AAP010203AB1' } });
    await prisma.tenant.create({ data: { id: tB, name: 'Agencia B Prueba', rfc: null } });
    const mkUser = async (tenantId: string, role: 'ADMIN' | 'USER', tag: string) => {
      const u = await prisma.user.create({ data: { email: `${tag}-${marca}@test.local`, password: 'x', name: tag, role, tenantId, active: true } });
      creados.users.push(u.id);
      return u.id;
    };
    const adminA = await mkUser(tA, 'ADMIN', 'adminA');
    const capA = await mkUser(tA, 'USER', 'capA');
    const glosA = await mkUser(tA, 'USER', 'glosA');
    const consA = await mkUser(tA, 'USER', 'consA');

    await prueba('seedTenantRoles siembra los 10 roles (idempotente: 2ª corrida = 0 creados)', async () => {
      const r1 = await seedTenantRoles(tA);
      assert.equal(r1.created, 10);
      const r2 = await seedTenantRoles(tA);
      assert.equal(r2.created, 0);
      assert.equal(r2.updated, 10);
      await seedTenantRoles(tB);
    });

    // Asignar roles operativos
    const asignar = async (userId: string, code: string, scope?: string[]) => {
      const role = await prisma.tenantRole.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tA, code } } });
      await prisma.userTenantRole.create({ data: { userId, tenantId: tA, roleId: role.id, assignedBy: adminA, active: true, scopeRestrictions: scope ? { clienteIds: scope } : undefined } });
    };
    await asignar(capA, 'CAPTURISTA');
    await asignar(glosA, 'GLOSADOR');

    let c1 = '', c2 = '', cB = '';
    await prueba('CRUD cliente: crear normaliza RFC, rechaza inválido, duplicado 409, aislado por tenant', async () => {
      const c = await clientes.crearCliente(tA, { rfc: ' mej010203ab1 ', razonSocial: 'Maquiladora Ejemplo' });
      c1 = c.id;
      assert.equal(c.rfc, 'MEJ010203AB1');
      const c2r = await clientes.crearCliente(tA, { rfc: 'ABC850101XY2', razonSocial: 'Segundo Cliente', certificacionIVAIEPS: 'AA' });
      c2 = c2r.id;
      const cBr = await clientes.crearCliente(tB, { rfc: 'MEJ010203AB1', razonSocial: 'Mismo RFC, otro tenant' });
      cB = cBr.id;
      await assert.rejects(() => clientes.crearCliente(tA, { rfc: 'NOPE', razonSocial: 'Inválido' }), (e: unknown) => e instanceof AppError && e.statusCode === 422);
      await assert.rejects(() => clientes.crearCliente(tA, { rfc: 'MEJ010203AB1', razonSocial: 'Duplicado' }), (e: unknown) => e instanceof AppError && e.statusCode === 409);
      const listaA = await clientes.listarClientes(tA);
      assert.deepEqual(listaA.map(x => x.id).sort(), [c1, c2].sort());
      assert.equal((await clientes.listarClientes(tB)).length, 1);
      assert.equal(await clientes.obtenerCliente(tA, cB), null, 'A no ve el cliente de B');
      await assert.rejects(() => clientes.actualizarCliente(tA, cB, { razonSocial: 'hack' }), (e: unknown) => e instanceof AppError && e.statusCode === 404);
      const upd = await clientes.actualizarCliente(tA, c2, { programaIMMEX: 'IMMEX-123', padronesSectoriales: ['acero'] });
      assert.equal(upd?.programaIMMEX, 'IMMEX-123');
      await clientes.desactivarCliente(tA, c2);
      assert.equal((await clientes.listarClientes(tA)).length, 1);
      assert.equal((await clientes.listarClientes(tA, { incluirInactivos: true })).length, 2);
      await clientes.actualizarCliente(tA, c2, { activo: true });
    });

    await prueba('import Excel: upsert por RFC y errores por fila', async () => {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['RFC', 'Razón social', 'IMMEX', 'Certificación', 'Padrón de importadores', 'Padrones sectoriales', 'Email'],
        ['MEJ010203AB1', 'Maquiladora Ejemplo (actualizada)', 'IMMEX-9', 'AAA', 'sí', 'acero;textil', 'contacto@ejemplo.mx'],
        ['XYZ900101QW3', 'Nuevo Importador', '', '', 'no', '', ''],
        ['MALO', 'Fila mala', '', '', '', '', ''],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      const b64 = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })).toString('base64');
      const r = await clientes.importarClientesExcel(tA, b64);
      assert.equal(r.creados, 1);
      assert.equal(r.actualizados, 1);
      assert.equal(r.errores.length, 1);
      assert.equal(r.errores[0]!.fila, 4);
      const c = await clientes.obtenerCliente(tA, c1);
      assert.equal(c?.certificacionIVAIEPS, 'AAA');
      assert.deepEqual(c?.padronesSectoriales, ['acero', 'textil']);
      assert.equal(c?.padronImportadores, true);
      assert.equal((await clientes.listarClientes(tB)).length, 1, 'el import no tocó B');
    });

    await prueba('backfill solo toca el tenant: filas null de A → cliente propio de A; B intacto', async () => {
      const mkCls = (tenantId: string, userId: string) => prisma.classification.create({ data: { tenantId, userId, inputDescription: 'tornillo', fractionCode: '73181599', confidence: 0.9, griApplied: [], status: 'approved' } });
      const mkQuote = (tenantId: string, userId: string) => prisma.quote.create({ data: { tenantId, userId, fractionCode: '73181599', customsValue: 100, origin: 'US', result: '{}', status: 'approved' } });
      const adminB = await mkUser(tB, 'ADMIN', 'adminB');
      await mkCls(tA, capA); await mkCls(tA, capA); await mkQuote(tA, capA);
      await mkCls(tB, adminB); await mkQuote(tB, adminB);
      const propio = await clientes.asegurarClienteDemo(tA);
      assert.equal(propio.rfc, 'AAP010203AB1');
      assert.equal(propio.creado, true);
      const otraVez = await clientes.asegurarClienteDemo(tA);
      assert.equal(otraVez.creado, false, 'idempotente');
      assert.equal(otraVez.id, propio.id);
      const r = await clientes.backfillClienteDelTenant(tA);
      assert.equal(r.clienteId, propio.id);
      assert.equal(r.tocadas.classification, 2);
      assert.equal(r.tocadas.quote, 1);
      assert.equal(await prisma.classification.count({ where: { tenantId: tA, clienteId: null } }), 0);
      assert.equal(await prisma.classification.count({ where: { tenantId: tB, clienteId: null } }), 1, 'B sigue con null');
      assert.equal(await prisma.quote.count({ where: { tenantId: tB, clienteId: null } }), 1);
      assert.equal(await prisma.classification.count({ where: { tenantId: tB, clienteId: propio.id } }), 0, 'ningún registro de B apunta al cliente de A');
      // B sin RFC → cliente genérico marcado demo
      const propioB = await clientes.asegurarClienteDemo(tB);
      const filaB = await prisma.cliente.findFirst({ where: { id: propioB.id, tenantId: tB } });
      assert.equal(filaB?.isDemoData, true);
      const r2 = await clientes.backfillClienteDelTenant(tA);
      assert.equal(r2.tocadas.classification, 0, 'segunda corrida no toca nada');
      await assert.rejects(() => clientes.backfillClienteDelTenant(tA, cB), (e: unknown) => e instanceof AppError && e.statusCode === 404, 'destino ajeno rechazado');
    });

    await prueba('resumen por cliente cuenta solo filas del tenant', async () => {
      const res = await clientes.resumenClientes(tA);
      const propio = res.find(r => r.rfc === 'AAP010203AB1');
      assert.ok(propio);
      assert.equal(propio!.clasificaciones, 2);
      assert.equal(propio!.cotizaciones, 1);
      assert.equal(propio!.operaciones, 0);
    });

    await prueba('alcance: asignarClientesAUsuario valida tenant; resolverClientesPermitidos une asignaciones', async () => {
      await asignar(consA, 'CLIENTE_CONSULTA', [c1]);
      assert.deepEqual(await resolverClientesPermitidos(consA, tA), [c1]);
      assert.equal(await resolverClientesPermitidos(capA, tA), null, 'CAPTURISTA sin restricción');
      assert.equal(await resolverClientesPermitidos(adminA, tA, 'SUPERADMIN'), null);
      await assert.rejects(() => clientes.asignarClientesAUsuario(tA, consA, [cB], adminA), (e: unknown) => e instanceof AppError && e.statusCode === 422, 'cliente de otro tenant rechazado');
      await clientes.asignarClientesAUsuario(tA, consA, [c1, c2], adminA);
      assert.deepEqual((await resolverClientesPermitidos(consA, tA))!.sort(), [c1, c2].sort());
      await clientes.asignarClientesAUsuario(tA, consA, [c1], adminA);
    });

    await prueba('clienteScope: niega X-Cliente-Id fuera de restricción (403) y fuerza filtro sin header', async () => {
      const correr = async (h?: string) => {
        const req = { userId: consA, tenantId: tA, userRole: 'USER', headers: h ? { 'x-cliente-id': h } : {}, query: {} } as unknown as AuthRequest;
        let err: unknown = null;
        const next: NextFunction = (e?: unknown) => { err = e ?? null; };
        await clienteScope(req, {} as never, next);
        return { req, err };
      };
      const fuera = await correr(c2);
      assert.ok(fuera.err instanceof AppError && fuera.err.statusCode === 403, 'cliente fuera del alcance → 403');
      const dentro = await correr(c1);
      assert.equal(dentro.err, null);
      assert.deepEqual(filtroCliente(dentro.req), { clienteId: c1 });
      const sin = await correr();
      assert.equal(sin.err, null);
      assert.deepEqual(sin.req.clienteIdsPermitidos, [c1]);
      assert.deepEqual(filtroCliente(sin.req), { clienteId: c1 }, 'un solo cliente permitido → filtro directo');
      // Usuario sin restricción: nada cambia
      const reqLibre = { userId: capA, tenantId: tA, userRole: 'USER', headers: { 'x-cliente-id': cB }, query: {} } as unknown as AuthRequest;
      let errLibre: unknown = null;
      await clienteScope(reqLibre, {} as never, (e?: unknown) => { errLibre = e ?? null; });
      assert.equal(errLibre, null);
      assert.equal(reqLibre.clienteIdsPermitidos, null);
    });

    await prueba('getUserPermissions con roles nuevos: CAPTURISTA no aprueba, GLOSADOR sí, CLIENTE_CONSULTA no crea', async () => {
      const pc = await getUserPermissions(capA, tA, 'USER');
      assert.equal(hasPermission(pc, 'classifier', 'create'), true);
      assert.equal(hasPermission(pc, 'classifier', 'approve'), false);
      const pg = await getUserPermissions(glosA, tA, 'USER');
      assert.equal(hasPermission(pg, 'classifier', 'approve'), true);
      const pq = await getUserPermissions(consA, tA, 'USER');
      assert.equal(hasPermission(pq, 'classifier', 'create'), false);
    });

    await prueba('flujo propone→aprueba/rechaza: CAPTURISTA no puede aprobar; GLOSADOR sí; rastro en AuditLog con motivo', async () => {
      const cls = await prisma.classification.create({ data: { tenantId: tA, userId: capA, clienteId: c1, inputDescription: 'válvula', fractionCode: '84818099', confidence: 0.8, griApplied: [], status: 'pending_approval' } });
      const q = await prisma.quote.create({ data: { tenantId: tA, userId: capA, clienteId: c1, fractionCode: '84818099', customsValue: 500, origin: 'CN', result: '{}', status: 'pending_approval' } });
      const band = await apro.pendientes(tA);
      assert.deepEqual(band.map(b => b.id).sort(), [cls.id, q.id].sort());
      assert.equal(band[0]!.cliente?.rfc, 'MEJ010203AB1');
      const conteo = await apro.conteoPendientes(tA, { clienteId: c1 });
      assert.equal(conteo.total, 2);
      assert.equal((await apro.conteoPendientes(tA, { clienteId: c2 })).total, 0, 'filtro por cliente');
      assert.equal((await apro.pendientes(tB)).length, 0, 'B no ve pendientes de A');

      await assert.rejects(() => apro.aprobar('clasificacion', cls.id, tA, capA, { legacyRole: 'USER' }), (e: unknown) => e instanceof AppError && e.statusCode === 403, 'CAPTURISTA no aprueba');
      await assert.rejects(() => apro.aprobar('clasificacion', cls.id, tB, glosA, { legacyRole: 'USER' }), (e: unknown) => e instanceof AppError && e.statusCode === 403, 'GLOSADOR de A no tiene rol en B → 403 (no filtra existencia por 404 antes del permiso)');

      const ok = await apro.aprobar('clasificacion', cls.id, tA, glosA, { legacyRole: 'USER', motivo: 'Coincide con criterio SAT' });
      assert.equal(ok.status, 'approved');
      assert.equal(ok.approvedById, glosA);
      const fila = await prisma.classification.findFirst({ where: { id: cls.id, tenantId: tA } });
      assert.equal(fila?.status, 'approved');
      await assert.rejects(() => apro.aprobar('clasificacion', cls.id, tA, glosA, { legacyRole: 'USER' }), (e: unknown) => e instanceof AppError && e.statusCode === 400, 'doble aprobación');

      await assert.rejects(() => apro.rechazar('cotizacion', q.id, tA, glosA, '', { legacyRole: 'USER' }), (e: unknown) => e instanceof AppError && e.statusCode === 400, 'motivo obligatorio');
      const rj = await apro.rechazar('cotizacion', q.id, tA, glosA, 'Falta incoterm correcto', { legacyRole: 'USER' });
      assert.equal(rj.status, 'rejected');
      assert.equal((await apro.conteoPendientes(tA)).total, 0);

      // Re-proponer y volver a la bandeja
      const rp = await apro.proponer('cotizacion', q.id, tA, capA, { motivo: 'Corregido el incoterm' });
      assert.equal(rp.status, 'pending_approval');
      assert.equal((await apro.conteoPendientes(tA)).total, 1);

      const logs = await prisma.auditLog.findMany({ where: { tenantId: tA, action: { in: ['APPROVAL_GRANTED', 'APPROVAL_REJECTED', 'APPROVAL_PROPOSED'] } }, orderBy: { createdAt: 'asc' } });
      assert.equal(logs.length, 3, 'tres transiciones = tres registros');
      const granted = logs.find(l => l.action === 'APPROVAL_GRANTED')!;
      assert.equal(granted.entity, 'Classification');
      assert.equal(granted.entityId, cls.id);
      assert.equal(granted.userId, glosA);
      assert.equal((granted.metadata as { motivo?: string }).motivo, 'Coincide con criterio SAT');
      assert.equal((granted.metadata as { propuestoPor?: string }).propuestoPor, capA);
      const rejected = logs.find(l => l.action === 'APPROVAL_REJECTED')!;
      assert.equal((rejected.metadata as { motivo?: string }).motivo, 'Falta incoterm correcto');
      assert.ok(granted.hash && granted.hash.length === 64, 'encadenado (hash SHA-256)');
      assert.equal(await prisma.auditLog.count({ where: { tenantId: tB, action: { startsWith: 'APPROVAL_' } } }), 0, 'nada en B');

      // Revisión B (P1): proponer exige ownership o permiso approve; un aprobado no se degrada sin `approve`.
      const qRech = await prisma.quote.create({ data: { tenantId: tA, userId: capA, clienteId: c1, fractionCode: '84818099', customsValue: 700, origin: 'CN', result: '{}', status: 'rejected' } });
      await assert.rejects(() => apro.proponer('cotizacion', qRech.id, tA, consA, { legacyRole: 'USER' }), (e: unknown) => e instanceof AppError && e.statusCode === 403, 'un tercero sin approve no re-propone lo ajeno');
      assert.equal((await apro.proponer('cotizacion', qRech.id, tA, capA, { legacyRole: 'USER' })).status, 'pending_approval', 'el autor sí re-propone su rechazado');
      await assert.rejects(() => apro.proponer('clasificacion', cls.id, tA, capA, { legacyRole: 'USER' }), (e: unknown) => e instanceof AppError && e.statusCode === 403, 'el autor sin approve no degrada su clasificación ya APROBADA');
      const intacta = await prisma.classification.findFirst({ where: { id: cls.id, tenantId: tA } });
      assert.equal(intacta?.status, 'approved');
      assert.equal(intacta?.approvedById, glosA, 'approvedById se conserva');
      const degradada = await apro.proponer('clasificacion', cls.id, tA, glosA, { legacyRole: 'USER', motivo: 'Reabrir por criterio nuevo' });
      assert.equal(degradada.status, 'pending_approval', 'quien puede aprobar sí regresa un aprobado a pendiente');
      assert.equal((await prisma.classification.findFirst({ where: { id: cls.id, tenantId: tA } }))?.approvedById, null);
    });
  } finally {
    // Limpieza: todo lo creado cuelga de los tenants de prueba.
    for (const t of [tA, tB]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.permissionAuditLog.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.classification.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.quote.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.userTenantRole.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.tenantRole.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.cliente.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: t } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  await parteFuncional();
  if (process.env.SKIP_DB === '1') {
    console.log('\n(parte de DB omitida: SKIP_DB=1)');
  } else {
    await parteDB();
  }
  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  if (falladas > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
