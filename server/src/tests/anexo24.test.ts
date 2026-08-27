/**
 * Anexo 24 real (Ola 1, 27-ago-2026) — reglas de negocio del inventario IMMEX.
 *
 * Parte PURA (siempre corre): plazoMeses (tabla de casos), planificador PEPS,
 * explosión de BOM con merma, periodos/candado, hoja xlsx.
 *
 * Parte DB (tenant de prueba propio, se limpia en finally): PEPS distribuye
 * en orden y falla sin saldo; cierre mensual bloquea dentro y permite fuera;
 * alta desde pedimento idempotente; retorno desde BOM registra Assembly +
 * Discharge.assemblyId; multi-tenant. Corre SOLO contra una base local o de
 * pruebas — nunca prod:
 *   ALLOW_ANEXO24_DB_TEST=1 npm run test:anexo24
 */
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { plazoMeses, sumarMeses, fechaVencimiento, esVigenciaPrograma, VIGENCIA_PROGRAMA_CENTINELA, CATALOGO_PLAZOS_IMMEX, PLAZO_GENERAL_MESES } from '../lib/plazos-immex';
import { planificarPeps } from '../services/anexo24-peps';
import { calcularConsumoBom } from '../services/anexo24-bom';
import { periodoDeFecha, rangoDePeriodo, hashResumen, type ResumenCierre } from '../services/anexo24-cierre';
import { reporteAnexo24Xlsx, HOJAS_ANEXO24, type ReporteAnexo24 } from '../services/anexo24-reporte';
import { AppError } from '../middlewares/error';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}\n     ${e instanceof Error ? e.message : e}`); }
}
async function esperaAppError(fn: () => Promise<unknown>, status: number, contiene?: RegExp) {
  try { await fn(); } catch (e) {
    assert.ok(e instanceof AppError, `esperaba AppError, llegó ${e instanceof Error ? e.constructor.name + ': ' + e.message : e}`);
    assert.equal(e.statusCode, status, `status ${e.statusCode} ≠ ${status}: ${e.message}`);
    if (contiene) assert.match(e.message, contiene);
    return;
  }
  assert.fail(`esperaba AppError ${status} y no lanzó`);
}

function baseLocalSegura(): boolean {
  if (process.env.ALLOW_ANEXO24_DB_TEST !== '1') return false;
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    const host = u.hostname;
    const db = u.pathname.slice(1);
    return host === 'localhost' || host === '127.0.0.1' || /test/i.test(db);
  } catch { return false; }
}

// ── PURA ──────────────────────────────────────────────────────────────────
async function pura() {
  console.log('\n— plazoMeses: tabla de casos —');
  await prueba('insumo sin certificación → 18 meses (corpus Regla 4.3.1)', () => {
    const r = plazoMeses({ tipo: 'INSUMO' });
    assert.equal(r.meses, 18); assert.equal(r.cotejo, 'corpus'); assert.equal(r.aviso, null); assert.equal(r.vigenciaPrograma, false);
  });
  await prueba('insumo AAA → 36 meses (corpus)', () => {
    const r = plazoMeses({ tipo: 'INSUMO', certificacion: 'AAA' });
    assert.equal(r.meses, 36); assert.equal(r.cotejo, 'corpus'); assert.equal(r.regla, 'INSUMO_CERT_AAA');
  });
  await prueba('insumo A / AA → general 18 con cotejo pendiente y aviso (no se inventa ampliación)', () => {
    for (const c of ['A', 'AA'] as const) {
      const r = plazoMeses({ tipo: 'INSUMO', certificacion: c });
      assert.equal(r.meses, PLAZO_GENERAL_MESES); assert.equal(r.cotejo, 'pendiente'); assert.ok(r.aviso && /pendiente|no respaldada/i.test(r.aviso));
    }
  });
  await prueba('activo fijo → vigencia del programa, sin meses (incluso con AAA)', () => {
    const r = plazoMeses({ tipo: 'ACTIVO_FIJO', certificacion: 'AAA' });
    assert.equal(r.meses, null); assert.equal(r.vigenciaPrograma, true); assert.match(r.fundamento, /108 fr\. III/);
  });
  await prueba('Anexo I BIS / I TER → sin fuente: general 18, cotejo pendiente, aviso visible', () => {
    for (const k of ['esAnexoIBis', 'esAnexoITer'] as const) {
      const r = plazoMeses({ tipo: 'INSUMO', certificacion: 'AAA', [k]: true });
      assert.equal(r.meses, 18); assert.equal(r.cotejo, 'pendiente'); assert.ok(r.aviso);
      assert.equal(r.regla, k === 'esAnexoIBis' ? 'ANEXO_I_BIS' : 'ANEXO_I_TER');
    }
  });
  await prueba('catálogo: ninguna entrada con meses numéricos carece de fuenteRepo (cero plazos inventados)', () => {
    for (const e of CATALOGO_PLAZOS_IMMEX) {
      if (e.meses != null) assert.ok(e.fuenteRepo && e.cotejo === 'corpus', `${e.clave} tiene meses=${e.meses} sin fuente en repo`);
      else assert.ok(e.cotejo === 'pendiente' || e.vigenciaPrograma, `${e.clave} sin meses debe ser pendiente o vigencia`);
    }
  });
  await prueba('sumarMeses respeta fin de mes y fechaVencimiento usa centinela para AF', () => {
    assert.equal(sumarMeses(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10), '2026-02-28');
    assert.equal(sumarMeses(new Date('2026-03-15T00:00:00Z'), 18).toISOString().slice(0, 10), '2027-09-15');
    const af = fechaVencimiento(new Date('2026-03-15T00:00:00Z'), plazoMeses({ tipo: 'ACTIVO_FIJO' }));
    assert.equal(af.getTime(), VIGENCIA_PROGRAMA_CENTINELA.getTime());
    assert.ok(esVigenciaPrograma({ tipo: 'ACTIVO_FIJO', expirationDate: af }));
    assert.ok(!esVigenciaPrograma({ tipo: 'INSUMO', expirationDate: new Date('2027-09-15') }));
  });

  console.log('\n— PEPS: planificador puro —');
  const lotes = [
    { id: 'c', entryDate: new Date('2026-03-01'), disponible: 50, pedimento: 'P3', unit: 'kg' },
    { id: 'a', entryDate: new Date('2026-01-01'), disponible: 30, pedimento: 'P1', unit: 'kg' },
    { id: 'b', entryDate: new Date('2026-02-01'), disponible: 0, pedimento: 'P2', unit: 'kg' },
    { id: 'd', entryDate: new Date('2026-02-15'), disponible: 20, pedimento: 'P2b', unit: 'kg' },
  ];
  await prueba('distribuye de más antigua a más nueva y salta lotes sin saldo', () => {
    const p = planificarPeps(lotes, 60);
    assert.deepEqual(p.asignaciones.map(a => [a.id, a.cantidad]), [['a', 30], ['d', 20], ['c', 10]]);
    assert.equal(p.faltante, 0); assert.equal(p.disponibleTotal, 100);
  });
  await prueba('reporta faltante cuando no alcanza el saldo', () => {
    const p = planificarPeps(lotes, 130);
    assert.equal(p.faltante, 30); assert.equal(p.asignaciones.length, 3);
  });
  await prueba('rechaza cantidad ≤ 0', async () => {
    await esperaAppError(async () => planificarPeps(lotes, 0), 400);
  });

  console.log('\n— BOM con merma —');
  await prueba('consumo = requerido × (1 + merma%) por componente', () => {
    const c = calcularConsumoBom([
      { componentId: 'x', componentCode: 'TORNILLO', fractionCode: '73181599', quantity: 4, scrapPercent: 5, unit: 'pza' },
      { componentId: 'y', componentCode: 'LAMINA', fractionCode: null, quantity: 0.5, scrapPercent: 0, unit: 'kg' },
    ], 100);
    assert.equal(c[0].quantityRequired, 400); assert.equal(c[0].quantityWithScrap, 420); assert.equal(c[0].merma, 20);
    assert.equal(c[1].quantityRequired, 50); assert.equal(c[1].quantityWithScrap, 50); assert.equal(c[1].merma, 0);
  });
  await prueba('merma inválida (≥100%) se rechaza', async () => {
    await esperaAppError(async () => calcularConsumoBom([{ componentId: 'x', componentCode: 'X', fractionCode: null, quantity: 1, scrapPercent: 100, unit: 'pza' }], 1), 400);
  });

  console.log('\n— periodos y hash —');
  await prueba('periodoDeFecha / rangoDePeriodo en UTC', () => {
    assert.equal(periodoDeFecha(new Date('2026-07-31T23:59:59Z')), '2026-07');
    const r = rangoDePeriodo('2026-02');
    assert.equal(r.inicio.toISOString(), '2026-02-01T00:00:00.000Z');
    assert.equal(r.fin.toISOString(), '2026-02-28T23:59:59.999Z');
  });
  await prueba('hash del resumen es estable ante el orden de claves', () => {
    const base: ResumenCierre = { periodo: '2026-07', corte: 'x', clienteId: null, totales: { lotes: 1, partes: 1, importado: 1, descargado: 0, saldo: 1, activoFijoLotes: 0 }, porParte: [], porPedimento: [] };
    const reordenado = JSON.parse(JSON.stringify({ porPedimento: [], porParte: [], totales: { saldo: 1, lotes: 1, partes: 1, importado: 1, descargado: 0, activoFijoLotes: 0 }, clienteId: null, corte: 'x', periodo: '2026-07' })) as ResumenCierre;
    assert.equal(hashResumen(base), hashResumen(reordenado));
    assert.equal(hashResumen(base).length, 64);
  });

  console.log('\n— xlsx —');
  await prueba('el libro trae las hojas del Anexo 24 y la etiqueta de cotejo pendiente en portada', () => {
    const r: ReporteAnexo24 = {
      folio: 'A24-2026-07-TEST', periodo: '2026-07', rango: { inicio: '2026-07-01', fin: '2026-07-31' }, generadoEn: 'x', clienteId: null,
      cotejo: { estado: 'pendiente', etiqueta: 'Estructura pendiente de cotejo contra Anexo 24 RGCE vigente', fuenteRepo: 'corpus' },
      cierre: null, entradas: [], salidas: [], saldos: [], saldosPorPedimento: [], activoFijo: [], mermas: [], desperdicios: [], submaquila: [],
      totales: { entradas: 0, salidas: 0, partesConSaldo: 0, saldoTotal: 0, activoFijo: 0, mermaTotal: 0, submaquilaLotes: 0 }, hash: 'h',
    };
    const wb = XLSX.read(reporteAnexo24Xlsx(r), { type: 'buffer' });
    assert.deepEqual(wb.SheetNames, [...HOJAS_ANEXO24]);
    const portada = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Portada'], { header: 1 }).flat().join(' ');
    assert.match(portada, /pendiente de cotejo/i);
  });
}

// ── DB ────────────────────────────────────────────────────────────────────
async function db() {
  const { prisma } = await import('../lib/prisma');
  const { descargarPeps } = await import('../services/anexo24-peps');
  const { retornoDesdeBom } = await import('../services/anexo24-bom');
  const { cerrarPeriodo, listarCierres } = await import('../services/anexo24-cierre');
  const { altaDesdePedimento } = await import('../services/anexo24-alta');
  const { generarReporteAnexo24 } = await import('../services/anexo24-reporte');
  const { createDischargeAtomic, deleteDischargeAtomic } = await import('../services/inventory-ledger');

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const creados: { tenantA?: string; tenantB?: string } = {};
  try {
    const tA = await prisma.tenant.create({ data: { name: `__anexo24_test_A__ ${nonce}` } });
    const tB = await prisma.tenant.create({ data: { name: `__anexo24_test_B__ ${nonce}` } });
    creados.tenantA = tA.id; creados.tenantB = tB.id;
    const uA = await prisma.user.create({ data: { email: `a24a-${nonce}@example.test`, password: 'x', name: 'A', tenantId: tA.id } });
    const uB = await prisma.user.create({ data: { email: `a24b-${nonce}@example.test`, password: 'x', name: 'B', tenantId: tB.id } });

    const parte = await prisma.product.create({ data: { tenantId: tA.id, productCode: `TORN-${nonce}`, description: 'Tornillo M8', fractionCode: '73181599', unit: 'pza' } });
    const mkImp = (tenantId: string, userId: string, pedimento: string, entry: string, qty: number, extra: Record<string, unknown> = {}) =>
      prisma.temporaryImport.create({ data: {
        pedimento, fractionCode: '73181599', description: 'Tornillo M8', quantity: qty, unit: 'pza', customsValue: qty * 0.1,
        entryDate: new Date(entry), expirationDate: sumarMeses(new Date(entry), 18), expirationMonths: 18,
        tenantId, userId, productId: parte.id, tipo: 'INSUMO', isDemoData: true, ...extra,
      } });
    const l1 = await mkImp(tA.id, uA.id, 'PED-1', '2026-01-10T00:00:00Z', 100);
    const l2 = await mkImp(tA.id, uA.id, 'PED-2', '2026-03-10T00:00:00Z', 50);
    const l3 = await mkImp(tA.id, uA.id, 'PED-3', '2026-05-10T00:00:00Z', 80);
    // Activo fijo: nunca entra al PEPS de consumo.
    await mkImp(tA.id, uA.id, 'PED-AF', '2026-01-01T00:00:00Z', 1, { tipo: 'ACTIVO_FIJO', expirationDate: VIGENCIA_PROGRAMA_CENTINELA, expirationMonths: 0, claveDocumento: 'AF' });
    // Tenant B con la misma parte-código (distinto Product) y saldo: no debe verse desde A.
    const parteB = await prisma.product.create({ data: { tenantId: tB.id, productCode: `TORN-${nonce}`, description: 'Tornillo M8', fractionCode: '73181599', unit: 'pza' } });
    await prisma.temporaryImport.create({ data: {
      pedimento: 'PED-B', fractionCode: '73181599', description: 'Tornillo M8', quantity: 999, unit: 'pza', customsValue: 1,
      entryDate: new Date('2025-01-01'), expirationDate: new Date('2026-07-01'), tenantId: tB.id, userId: uB.id, productId: parteB.id, isDemoData: true,
    } });

    console.log('\n— PEPS en DB —');
    await prueba('descarga 120 → 100 del lote más antiguo + 20 del siguiente, en una transacción', async () => {
      const r = await descargarPeps({ tenantId: tA.id, userId: uA.id, productId: parte.id, cantidad: 120, tipo: 'RT', pedimentoDescargo: 'RT-1', fecha: new Date('2026-06-15T00:00:00Z') });
      assert.deepEqual(r.descargos.map(d => [d.temporaryImportId, d.cantidad]), [[l1.id, 100], [l2.id, 20]]);
      const a = await prisma.temporaryImport.findFirstOrThrow({ where: { id: l1.id, tenantId: tA.id } });
      const b = await prisma.temporaryImport.findFirstOrThrow({ where: { id: l2.id, tenantId: tA.id } });
      assert.equal(a.status, 'FULLY_DISCHARGED'); assert.equal(b.quantityDischarged, 20); assert.equal(b.status, 'PARTIALLY_DISCHARGED');
    });
    await prueba('falla sin saldo suficiente (409) y no descarga nada (todo o nada)', async () => {
      const antes = await prisma.discharge.count({ where: { tenantId: tA.id } });
      await esperaAppError(() => descargarPeps({ tenantId: tA.id, userId: uA.id, productId: parte.id, cantidad: 500, tipo: 'RT', fecha: new Date('2026-06-16T00:00:00Z') }), 409, /Saldo insuficiente/);
      assert.equal(await prisma.discharge.count({ where: { tenantId: tA.id } }), antes);
    });
    await prueba('activo fijo no entra al PEPS: disponible de la parte = 110 (30 + 80), no 111', async () => {
      await esperaAppError(() => descargarPeps({ tenantId: tA.id, userId: uA.id, productId: parte.id, cantidad: 111, tipo: 'RT', fecha: new Date('2026-06-16T00:00:00Z') }), 409, /disponible 110/);
    });
    await prueba('V1 sin constancia ni pedimento se rechaza (400)', async () => {
      await esperaAppError(() => descargarPeps({ tenantId: tA.id, userId: uA.id, productId: parte.id, cantidad: 1, tipo: 'V1', fecha: new Date('2026-06-16T00:00:00Z') }), 400, /constancia/);
    });
    await prueba('multi-tenant: el tenant B no ve la parte de A (sin saldo) y A no toca el lote de B', async () => {
      await esperaAppError(() => descargarPeps({ tenantId: tB.id, userId: uB.id, productId: parte.id, cantidad: 1, tipo: 'RT', fecha: new Date('2026-06-16T00:00:00Z') }), 409, /Sin saldo/);
      const lb = await prisma.temporaryImport.findFirst({ where: { tenantId: tB.id, pedimento: 'PED-B' } });
      assert.equal(lb?.quantityDischarged, 0);
    });

    console.log('\n— Retorno desde BOM —');
    const terminado = await prisma.product.create({ data: { tenantId: tA.id, productCode: `ENS-${nonce}`, description: 'Ensamble', unit: 'pza', isFinished: true } });
    await prisma.productComponent.create({ data: { productId: terminado.id, componentId: parte.id, quantity: 2, unit: 'pza', scrapPercent: 10 } });
    await prueba('10 ensambles × 2 pza × 1.10 = 22 pza descargadas PEPS (30 restantes de PED-2 → 22), con Assembly y assemblyId', async () => {
      const r = await retornoDesdeBom({ tenantId: tA.id, userId: uA.id, productId: terminado.id, cantidad: 10, tipo: 'RT', pedimento: 'RT-2', fecha: new Date('2026-06-20T00:00:00Z') });
      assert.equal(r.consumos[0].quantityRequired, 20); assert.equal(r.consumos[0].quantityWithScrap, 22); assert.equal(r.consumos[0].merma, 2);
      assert.deepEqual(r.consumos[0].descargo.descargos.map(d => [d.temporaryImportId, d.cantidad]), [[l2.id, 22]]);
      const ds = await prisma.discharge.findMany({ where: { assemblyId: r.assemblyId } });
      assert.equal(ds.length, 1); assert.equal(ds[0].pedimento, 'RT-2');
      const ac = await prisma.assemblyConsumption.findMany({ where: { assemblyId: r.assemblyId } });
      assert.equal(ac[0].quantityWithScrap, 22); assert.deepEqual(ac[0].importIds, [l2.id]);
    });

    console.log('\n— Cierre mensual con candado —');
    await prueba('cerrar 2026-06 guarda hash SHA-256 y saldos por parte/pedimento al corte', async () => {
      const r = await cerrarPeriodo({ tenantId: tA.id, userId: uA.id, periodo: '2026-06' });
      assert.equal(r.cierre.hash?.length, 64);
      const p = r.resumen.porParte.find(x => x.parteId === parte.id && x.tipo === 'INSUMO')!;
      assert.ok(r.resumen.porParte.some(x => x.parteId === parte.id && x.tipo === 'ACTIVO_FIJO'), 'el activo fijo va en renglón separado');
      assert.equal(p.importado, 230); assert.equal(p.descargado, 142); assert.equal(p.saldo, 88);
      assert.equal(r.resumen.totales.activoFijoLotes, 1);
      assert.equal((await listarCierres(tA.id)).length, 1);
    });
    await prueba('cerrar de nuevo el mismo periodo o uno anterior → 409', async () => {
      await esperaAppError(() => cerrarPeriodo({ tenantId: tA.id, userId: uA.id, periodo: '2026-06' }), 409);
      await esperaAppError(() => cerrarPeriodo({ tenantId: tA.id, userId: uA.id, periodo: '2026-05' }), 409);
    });
    await prueba('descargo con fecha dentro del periodo cerrado → 409 (PEPS y ledger directo)', async () => {
      await esperaAppError(() => descargarPeps({ tenantId: tA.id, userId: uA.id, productId: parte.id, cantidad: 1, tipo: 'RT', fecha: new Date('2026-06-30T12:00:00Z') }), 409, /cerrado/);
      await esperaAppError(() => createDischargeAtomic({ temporaryImportId: l3.id, tenantId: tA.id, userId: uA.id, type: 'RETURN_EXPORT', quantity: 1, unit: 'pza', dischargeDate: new Date('2026-04-01T00:00:00Z') }), 409, /cerrado/);
    });
    await prueba('eliminar un descargo sellado → 409; el saldo no cambia', async () => {
      const d = await prisma.discharge.findFirst({ where: { tenantId: tA.id, temporaryImportId: l1.id } });
      await esperaAppError(() => deleteDischargeAtomic(d!.id, tA.id), 409, /cerrado/);
      const a = await prisma.temporaryImport.findFirstOrThrow({ where: { id: l1.id, tenantId: tA.id } });
      assert.equal(a.quantityDischarged, 100);
    });
    await prueba('movimiento con fecha fuera del periodo (julio) sí pasa', async () => {
      const r = await descargarPeps({ tenantId: tA.id, userId: uA.id, productId: parte.id, cantidad: 8, tipo: 'RT', pedimentoDescargo: 'RT-3', fecha: new Date('2026-07-02T00:00:00Z') });
      assert.deepEqual(r.descargos.map(d => [d.temporaryImportId, d.cantidad]), [[l2.id, 8]]);
    });
    await prueba('el candado es por tenant: B sigue abierto', async () => {
      const lb = await prisma.temporaryImport.findFirstOrThrow({ where: { tenantId: tB.id, pedimento: 'PED-B' } });
      const d = await createDischargeAtomic({ temporaryImportId: lb.id, tenantId: tB.id, userId: uB.id, type: 'RETURN_EXPORT', quantity: 1, unit: 'pza', dischargeDate: new Date('2026-06-15T00:00:00Z') });
      assert.ok(d.id);
    });

    console.log('\n— Alta desde pedimento persistido —');
    const ped = await prisma.pedimento.create({ data: {
      numero: `26 47 3461 ${nonce.slice(-7)}`, clave: 'IN', aduana: '470', patenteAduanal: '3461', rfcImportador: 'XAXX010101000',
      tipoOperacion: 'IMP', regimen: 'ITE', pesoBruto: 1, pesoNeto: 1, bultos: 1, valorAduana: 17500, valorComercial: 17500, valorDolares: 1000, tipoCambio: 17.5,
      incoterm: 'FOB', transporte: 'Terrestre', tenantId: tA.id, userId: uA.id, origenArchivo: 'M3', isDemoData: true,
      partidas: { create: [
        { numeroPartida: 1, fraccion: '73181599', descripcion: `TORN-${nonce}`, cantidad: 200, unidadMedida: 'pza', valorUnitario: 50, valorAduana: 10000, pais: 'USA' },
        { numeroPartida: 2, fraccion: '72104999', descripcion: 'Lámina galvanizada', cantidad: 300, unidadMedida: 'kg', valorUnitario: 25, valorAduana: 7500, pais: 'USA' },
      ] },
    } });
    await prueba('sin fechaEntrada → 400 (no se inventa con createdAt)', async () => {
      await esperaAppError(() => altaDesdePedimento({ tenantId: tA.id, userId: uA.id, pedimentoId: ped.id }), 400, /fechaEntrada/);
    });
    await prueba('crea un TemporaryImport por partida: liga la parte por código, convierte MXN→USD con el TC del pedimento, plazo 18', async () => {
      const r = await altaDesdePedimento({ tenantId: tA.id, userId: uA.id, pedimentoId: ped.id, fechaEntrada: new Date('2026-08-05T00:00:00Z') });
      assert.equal(r.creadas, 2); assert.equal(r.tipo, 'INSUMO'); assert.equal(r.plazo.meses, 18);
      const imps = await prisma.temporaryImport.findMany({ where: { tenantId: tA.id, pedimentoPartidaId: { not: null } }, orderBy: { fractionCode: 'desc' } });
      assert.equal(imps.length, 2);
      const torn = imps.find(i => i.fractionCode === '73181599')!;
      assert.equal(torn.productId, parte.id); assert.equal(torn.claveDocumento, 'IN');
      assert.equal(torn.customsValue, Math.round(10000 / 17.5 * 100) / 100); assert.equal(torn.valueMXN, 10000);
      assert.equal(torn.expirationDate.toISOString().slice(0, 10), '2028-02-05');
      assert.ok(r.avisos.some(a => /sin número de parte/.test(a)), 'la lámina no tiene parte → aviso');
    });
    await prueba('idempotente por pedimentoPartidaId: segunda alta no duplica', async () => {
      const r = await altaDesdePedimento({ tenantId: tA.id, userId: uA.id, pedimentoId: ped.id, fechaEntrada: new Date('2026-08-05T00:00:00Z') });
      assert.equal(r.creadas, 0); assert.equal(r.existentes, 2);
      assert.equal(await prisma.temporaryImport.count({ where: { tenantId: tA.id, pedimentoPartidaId: { not: null } } }), 2);
    });
    await prueba('alta con fecha en periodo cerrado → 409; pedimento de otro tenant → 404', async () => {
      await esperaAppError(() => altaDesdePedimento({ tenantId: tA.id, userId: uA.id, pedimentoId: ped.id, fechaEntrada: new Date('2026-06-01T00:00:00Z') }), 409, /cerrado/);
      await esperaAppError(() => altaDesdePedimento({ tenantId: tB.id, userId: uB.id, pedimentoId: ped.id, fechaEntrada: new Date('2026-08-05T00:00:00Z') }), 404);
    });
    await prueba('pedimento con clave no IMMEX (A1) → 400', async () => {
      const a1 = await prisma.pedimento.create({ data: {
        clave: 'A1', aduana: '470', patenteAduanal: '3461', rfcImportador: 'XAXX010101000', tipoOperacion: 'IMP', regimen: 'IMD', pesoBruto: 1, pesoNeto: 1, bultos: 1,
        valorAduana: 1, valorComercial: 1, valorDolares: 1, tipoCambio: 17.5, incoterm: 'FOB', transporte: 'Terrestre', tenantId: tA.id, userId: uA.id, isDemoData: true,
        partidas: { create: [{ numeroPartida: 1, fraccion: '73181599', descripcion: 'x', cantidad: 1, unidadMedida: 'pza', valorUnitario: 1, valorAduana: 1, pais: 'USA' }] },
      } });
      await esperaAppError(() => altaDesdePedimento({ tenantId: tA.id, userId: uA.id, pedimentoId: a1.id, fechaEntrada: new Date('2026-08-05T00:00:00Z') }), 400, /IN y AF/);
    });

    console.log('\n— Reporte Anexo 24 —');
    await prueba('reporte 2026-06 trae entradas/salidas/saldos/AF/mermas coherentes con el cierre y su etiqueta de cotejo', async () => {
      const r = await generarReporteAnexo24(tA.id, '2026-06', null);
      assert.equal(r.cotejo.estado, 'pendiente');
      assert.equal(r.cierre?.hash?.length, 64);
      assert.equal(r.salidas.length, 3, 'RT-1 (2 lotes) + RT-2 (1 lote)');
      assert.equal(r.mermas.length, 1); assert.equal(r.mermas[0].merma, 2);
      assert.equal(r.activoFijo.length, 1);
      assert.equal(r.saldos.find(p => p.parteId === parte.id && p.tipo === 'INSUMO')?.saldo, 88);
      const wb = XLSX.read(reporteAnexo24Xlsx(r), { type: 'buffer' });
      assert.deepEqual(wb.SheetNames, [...HOJAS_ANEXO24]);
      assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Salidas']).length, 3);
    });
    await prueba('el reporte del tenant B no ve nada de A', async () => {
      const r = await generarReporteAnexo24(tB.id, '2026-06', null);
      assert.equal(r.salidas.length, 1); assert.equal(r.activoFijo.length, 0); assert.equal(r.mermas.length, 0);
    });

    // ── Alcance por cliente (Revisión D) — routers REALES vía HTTP ──────────
    console.log('\n— Alcance por cliente: tenant ajeno → 400, restringido a A no ve B pero sí compartidas —');
    const { levantar, tokenDe } = await import('./http-harness');
    const { inventoryRouter } = await import('../routes/inventory');
    const { anexo24Router } = await import('../routes/anexo24');
    const { activoFijoRouter } = await import('../routes/activo-fijo');
    const { ubicacionesRouter } = await import('../routes/ubicaciones');
    const { SYSTEM_ROLES } = await import('../services/permissions');
    const { saldosPorParte } = await import('../services/anexo24-peps');
    const { calcularExposicion } = await import('../services/anexo24-exposicion');

    const cA = await prisma.cliente.create({ data: { tenantId: tA.id, rfc: `AAA010101AA${nonce.slice(-1)}`, razonSocial: 'Cliente A', isDemoData: true } });
    const cB = await prisma.cliente.create({ data: { tenantId: tA.id, rfc: `BBB010101BB${nonce.slice(-1)}`, razonSocial: 'Cliente B', isDemoData: true } });
    const adminA = await prisma.user.create({ data: { email: `a24admin-${nonce}@example.test`, password: 'x', name: 'Admin A', tenantId: tA.id, role: 'ADMIN' } });
    const restrA = await prisma.user.create({ data: { email: `a24restr-${nonce}@example.test`, password: 'x', name: 'Restringido A', tenantId: tA.id, role: 'USER' } });
    const rolAmplio = await prisma.tenantRole.create({ data: { tenantId: tA.id, code: `TEST_ALCANCE_${nonce.slice(-4)}`, name: 'Prueba alcance', isCustom: true, permissions: SYSTEM_ROLES[0]!.permissions as unknown as object } });
    await prisma.userTenantRole.create({ data: { userId: restrA.id, tenantId: tA.id, roleId: rolAmplio.id, assignedBy: adminA.id, active: true, scopeRestrictions: { clienteIds: [cA.id] } } });
    const tokAdmin = tokenDe(adminA.id, tA.id);
    const tokRestr = tokenDe(restrA.id, tA.id);

    const lotA = await mkImp(tA.id, adminA.id, 'PED-CA', '2026-08-02T00:00:00Z', 5, { clienteId: cA.id, tipo: 'ACTIVO_FIJO', claveDocumento: 'AF' });
    const lotB = await mkImp(tA.id, adminA.id, 'PED-CB', '2026-08-02T00:00:00Z', 7, { clienteId: cB.id, tipo: 'ACTIVO_FIJO', claveDocumento: 'AF' });
    const lotBIns = await mkImp(tA.id, adminA.id, 'PED-CB-IN', '2026-08-02T00:00:00Z', 40, { clienteId: cB.id });
    const ubNull = await prisma.ubicacion.create({ data: { tenantId: tA.id, nombre: `Planta compartida ${nonce}`, tipo: 'PLANTA' } });
    const ubB = await prisma.ubicacion.create({ data: { tenantId: tA.id, clienteId: cB.id, nombre: `Planta B ${nonce}`, tipo: 'PLANTA' } });
    const ubTenantB = await prisma.ubicacion.create({ data: { tenantId: tB.id, nombre: `Planta tenant B ${nonce}`, tipo: 'PLANTA' } });
    const prodB = await prisma.product.create({ data: { tenantId: tA.id, clienteId: cB.id, productCode: `SOLO-B-${nonce}`, description: 'Parte del cliente B', unit: 'pza' } });
    const cierreB = await prisma.cierrePeriodo.create({ data: { tenantId: tA.id, clienteId: cB.id, periodo: '2026-07', cerradoPor: adminA.id, hash: 'h'.repeat(64), resumen: {} } });

    const srv = await levantar(app => {
      app.use('/api/inventory', inventoryRouter);
      app.use('/api/inventory', anexo24Router);
      app.use('/api/inventory/activo-fijo', activoFijoRouter);
      app.use('/api/ubicaciones', ubicacionesRouter);
    });
    const bodyImport = { pedimento: 'PED-X', fractionCode: '73181599', quantity: 1, unit: 'pza', customsValue: 1, entryDate: '2026-08-10' };
    try {
      await prueba('POST /imports con productId de OTRO tenant → 400 (no se escribe la referencia ajena)', async () => {
        const r = await srv.llamar('POST', '/api/inventory/imports', { token: tokAdmin, body: { ...bodyImport, productId: parteB.id } });
        assert.equal(r.status, 400, JSON.stringify(r.body)); assert.match(r.body.message, /Producto/);
        assert.equal(await prisma.temporaryImport.count({ where: { tenantId: tA.id, productId: parteB.id } }), 0);
      });
      await prueba('POST /imports con ubicacionId de OTRO tenant → 400; con la propia → 201', async () => {
        const r = await srv.llamar('POST', '/api/inventory/imports', { token: tokAdmin, body: { ...bodyImport, ubicacionId: ubTenantB.id } });
        assert.equal(r.status, 400, JSON.stringify(r.body)); assert.match(r.body.message, /Ubicación/);
        const ok = await srv.llamar('POST', '/api/inventory/imports', { token: tokAdmin, body: { ...bodyImport, ubicacionId: ubNull.id, productId: parte.id } });
        assert.equal(ok.status, 201, JSON.stringify(ok.body)); assert.equal(ok.body.data.ubicacionId, ubNull.id); assert.equal(ok.body.data.productId, parte.id);
      });
      await prueba('restringido a A: pedimento-partidas trae lotes de A y compartidos (clienteId null), nunca los de B', async () => {
        const r = await srv.llamar('GET', '/api/inventory/pedimento-partidas?abiertas=false', { token: tokRestr });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const ids = new Set((r.body.data as Array<{ id: string }>).map(x => x.id));
        assert.ok(ids.has(lotA.id), 'lote de A visible'); assert.ok(ids.has(l1.id), 'lote compartido visible');
        assert.ok(!ids.has(lotB.id) && !ids.has(lotBIns.id), 'lotes de B ocultos');
        const sinAlcance = await srv.llamar('GET', '/api/inventory/pedimento-partidas?abiertas=false', { token: tokAdmin });
        assert.ok((sinAlcance.body.data as Array<{ id: string }>).some(x => x.id === lotB.id), 'admin sin restricción sí ve B');
      });
      await prueba('restringido a A: activo fijo lista A + compartido, no B', async () => {
        const r = await srv.llamar('GET', '/api/inventory/activo-fijo', { token: tokRestr });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const peds = (r.body.data as Array<{ pedimento: string }>).map(x => x.pedimento);
        assert.ok(peds.includes('PED-CA') && peds.includes('PED-AF'), `esperaba PED-CA y PED-AF en ${peds}`);
        assert.ok(!peds.includes('PED-CB'), 'PED-CB (cliente B) oculto');
      });
      await prueba('restringido a A: cierres muestra el cierre compartido (2026-06) y oculta el de B (2026-07)', async () => {
        const r = await srv.llamar('GET', '/api/inventory/cierres', { token: tokRestr });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const periodos = (r.body.data as Array<{ id: string; periodo: string }>);
        assert.ok(periodos.some(c => c.periodo === '2026-06'), 'cierre compartido visible');
        assert.ok(!periodos.some(c => c.id === cierreB.id), 'cierre de B oculto');
        const admin = await srv.llamar('GET', '/api/inventory/cierres', { token: tokAdmin });
        assert.ok((admin.body.data as Array<{ id: string }>).some(c => c.id === cierreB.id), 'admin sí ve el cierre de B');
      });
      await prueba('restringido a A: POST activo-fijo con body.clienteId = B → 403; con A → 201 ligado a A', async () => {
        const base = { pedimento: 'PED-AF-X', fractionCode: '73181599', quantity: 1, unit: 'pza', customsValue: 1, entryDate: '2026-08-10' };
        const r = await srv.llamar('POST', '/api/inventory/activo-fijo', { token: tokRestr, body: { ...base, clienteId: cB.id } });
        assert.equal(r.status, 403, JSON.stringify(r.body));
        const ok = await srv.llamar('POST', '/api/inventory/activo-fijo', { token: tokRestr, body: { ...base, clienteId: cA.id } });
        assert.equal(ok.status, 201, JSON.stringify(ok.body)); assert.equal(ok.body.data.clienteId, cA.id);
        const ubi = await srv.llamar('POST', '/api/inventory/activo-fijo', { token: tokRestr, body: { ...base, ubicacionId: ubB.id } });
        assert.equal(ubi.status, 400, 'ubicación del cliente B fuera de alcance → 400');
      });
      await prueba('restringido a A: ubicaciones y productos ven lo compartido, no lo de B', async () => {
        const u = await srv.llamar('GET', '/api/ubicaciones', { token: tokRestr });
        const uIds = (u.body.data as Array<{ id: string }>).map(x => x.id);
        assert.ok(uIds.includes(ubNull.id) && !uIds.includes(ubB.id), `ubicaciones: ${uIds}`);
        const p = await srv.llamar('GET', '/api/inventory/products', { token: tokRestr });
        const pIds = (p.body.data as Array<{ id: string }>).map(x => x.id);
        assert.ok(pIds.includes(parte.id) && !pIds.includes(prodB.id), 'productos: compartido sí, de B no');
      });
      await prueba('restringido a A: exposición y saldos por parte no alcanzan lotes de B', async () => {
        const r = await srv.llamar('GET', `/api/inventory/exposicion/${lotBIns.id}`, { token: tokRestr });
        assert.equal(r.status, 404, JSON.stringify(r.body));
        await esperaAppError(() => calcularExposicion(tA.id, lotBIns.id, { clienteId: cA.id }), 404);
        const saldos = await saldosPorParte(tA.id, { alcance: { clienteId: cA.id } });
        assert.ok(!saldos.some(s => s.lotes.some(l => l.temporaryImportId === lotBIns.id)), 'PED-CB-IN fuera del alcance');
        const todos = await saldosPorParte(tA.id, { alcance: {} });
        assert.ok(todos.some(s => s.lotes.some(l => l.temporaryImportId === lotBIns.id)), 'sin restricción sí aparece');
      });
    } finally {
      await srv.cerrar();
    }
  } finally {
    for (const tenantId of [creados.tenantA, creados.tenantB]) {
      if (!tenantId) continue;
      await prisma.discharge.deleteMany({ where: { tenantId } });
      await prisma.assemblyConsumption.deleteMany({ where: { assembly: { tenantId } } });
      await prisma.assembly.deleteMany({ where: { tenantId } });
      await prisma.temporaryImport.deleteMany({ where: { tenantId } });
      await prisma.productComponent.deleteMany({ where: { product: { tenantId } } });
      await prisma.product.deleteMany({ where: { tenantId } });
      await prisma.pedimento.deleteMany({ where: { tenantId } });
      await prisma.cierrePeriodo.deleteMany({ where: { tenantId } });
      await prisma.ubicacion.deleteMany({ where: { tenantId } });
      await prisma.userTenantRole.deleteMany({ where: { tenantId } });
      await prisma.tenantRole.deleteMany({ where: { tenantId } });
      await prisma.cliente.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  }
}

async function main() {
  await pura();
  if (baseLocalSegura()) await db();
  else console.log('\n  (parte DB omitida: exporta ALLOW_ANEXO24_DB_TEST=1 con DATABASE_URL local o de pruebas)');
  console.log(`\n  ${pasadas} pasadas, ${falladas} falladas\n`);
  if (falladas > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
