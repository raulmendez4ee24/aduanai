/**
 * Tests del Clasificador en lote (Ola 1, Operación 2026-08).
 *
 * Ejecutar:  npm run test:lote   (npx tsx src/tests/clasificacion-lote.test.ts)
 *
 * NO llama al LLM: el runner de jobs se inyecta (`DependenciasLote.correrJob`)
 * con una versión falsa que deja el ClassificationJob en done/error con un
 * payload controlado. Usa la DB local con un tenant de prueba propio que se
 * crea al inicio y se borra al final.
 */
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import {
  parsearArchivoLote,
  detectarColumnas,
  semaforoDeFila,
  importarLote,
  procesarLote,
  exportarLoteXlsx,
  construirLibroExport,
  generarPlantillaXlsx,
  COLUMNAS_EXPORT,
  UMBRAL_CONFIANZA_ALTA,
  UMBRAL_CONFIANZA_MEDIA,
  MAX_FALLAS_CONSECUTIVAS,
  LOTE_HEARTBEAT_VENCIDO_MS,
  // ── CIRCUITO catálogo↔lote (4ª revisión) ──
  resumenOrigenLote, origenDeFila, ETIQUETA_ORIGEN,
  type DependenciasLote,
  type Semaforo,
} from '../services/clasificacion-lote';
import { subpartidasHermanas } from '../services/subpartidas-hermanas';
import { sinGuardaDeTenant } from '../lib/tenant-guard';
import { enAlcance, filtroCliente } from '../lib/cliente-contexto';
import type { Request } from 'express';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

function xlsxBase64(aoa: unknown[][]): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Hoja1');
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
}

function leerPrimeraHoja(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
}

/** Runner falso: marca el job done con el payload indicado o error. */
function runnerFalso(porDescripcion: (desc: string) => { payload?: Record<string, unknown>; error?: { code: string; message: string } }): DependenciasLote & { llamadas: number } {
  const deps = {
    llamadas: 0,
    pausaEntreFilasMs: 0,
    correrJob: async (jobId: string) => {
      deps.llamadas++;
      // El runner real también lee el job por id (cruce legítimo del worker).
      const job = await sinGuardaDeTenant(() => prisma.classificationJob.findFirst({ where: { id: jobId }, select: { inputs: true, tenantId: true, userId: true } }));
      assert.ok(job, 'el job debe existir cuando corre el runner');
      const desc = (job!.inputs as { description: string }).description;
      const r = porDescripcion(desc);
      if (r.error) {
        await prisma.classificationJob.update({ where: { id: jobId }, data: { status: 'error', finishedAt: new Date(), error: { ...r.error, retriable: true } } });
        return;
      }
      const payload = r.payload!;
      const record = await prisma.classification.create({
        data: {
          tenantId: job!.tenantId,
          userId: job!.userId,
          inputDescription: desc,
          fractionCode: String((payload.fraction as { code: string }).code),
          fractionDescription: 'desc de prueba',
          confidence: Number(payload.confidence),
          griApplied: [],
          alternatives: JSON.stringify(payload.alternatives ?? []),
          fullResponse: JSON.stringify(payload),
          status: 'approved',
        },
      });
      await prisma.classificationJob.update({
        where: { id: jobId },
        data: { status: 'done', finishedAt: new Date(), classificationId: record.id, result: payload as object },
      });
    },
  };
  return deps;
}

async function main() {
  const nonce = Date.now().toString(36);
  const tenant = await prisma.tenant.create({ data: { name: `__lote_test__ ${nonce}` } });
  const otroTenant = await prisma.tenant.create({ data: { name: `__lote_test_otro__ ${nonce}` } });
  const user = await prisma.user.create({
    data: { email: `lote-${nonce}@example.test`, password: 'not-a-real-password', name: 'Lote Test', tenantId: tenant.id },
  });

  try {
    console.log('== parseo de Excel/CSV ==');

    await test('columnas en desorden y con acentos se mapean a los campos canónicos', () => {
      const mapa = detectarColumnas(['País de Origen', 'DESCRIPCIÓN', 'Código', 'Valor USD', 'Uso/Destino', 'Observaciones', 'ColumnaRara']);
      assert.equal(mapa['País de Origen'], 'paisOrigen');
      assert.equal(mapa['DESCRIPCIÓN'], 'descripcion');
      assert.equal(mapa['Código'], 'productCode');
      assert.equal(mapa['Valor USD'], 'valorUSD');
      assert.equal(mapa['Uso/Destino'], 'usoDestino');
      assert.equal(mapa['Observaciones'], 'contexto');
      assert.equal(mapa['ColumnaRara'], undefined);
    });

    await test('alias por prioridad: "Item" no secuestra la descripción y "Valor" no gana a "Valor unitario USD"', () => {
      const m1 = detectarColumnas(['Item', 'Descripción', 'Cantidad']);
      assert.equal(m1['Descripción'], 'descripcion');
      assert.equal(m1['Item'], undefined, 'Item queda libre: la descripción real ya tomó el campo');
      const m2 = detectarColumnas(['Valor', 'Valor unitario USD', 'Descripción']);
      assert.equal(m2['Valor unitario USD'], 'valorUSD');
      assert.equal(m2['Valor'], undefined);
      // Sin descripción real, "Item" sí sirve de descripción.
      assert.equal(detectarColumnas(['Item', 'Cantidad'])['Item'], 'descripcion');
      const b64 = xlsxBase64([['Item', 'Descripción', 'Cantidad'], [1, 'Tornillo de acero inoxidable M8', 10]]);
      assert.equal(parsearArchivoLote(b64, 'x.xlsx').filas[0].descripcion, 'Tornillo de acero inoxidable M8');
    });

    await test('fila vacía real intermedia no desfasa numeroFila (blankrows)', () => {
      const b64 = xlsxBase64([['descripcion'], ['Tornillo de acero inoxidable M8'], [], ['Válvula de bronce para agua']]);
      const r = parsearArchivoLote(b64, 'x.xlsx');
      assert.deepEqual(r.filas.map(f => f.numeroFila), [2, 4], 'la fila vacía (3) se salta pero cuenta');
      assert.deepEqual(r.omitidas, []);
    });

    await test('xlsx con columnas en desorden → filas correctas, filas vacías ignoradas', () => {
      const b64 = xlsxBase64([
        ['Valor USD', 'Descripción', 'SKU', 'País'],
        [1.5, 'Tornillo de acero inoxidable M8 cabeza hexagonal', 'SKU-1', 'cn'],
        ['', '', '', ''],
        ['2', 'Válvula de bronce para agua potable 1/2 pulgada', 'SKU-2', 'US'],
        ['9', '', 'SKU-3', 'DE'],
      ]);
      const r = parsearArchivoLote(b64, 'partidas.xlsx');
      assert.equal(r.filas.length, 2);
      assert.equal(r.filas[0].numeroFila, 2);
      assert.equal(r.filas[0].productCode, 'SKU-1');
      assert.equal(r.filas[0].paisOrigen, 'CN');
      assert.equal(r.filas[0].valorUSD, 1.5);
      assert.equal(r.filas[1].valorUSD, 2);
      assert.equal(r.filas[1].numeroFila, 4);
      assert.deepEqual(r.omitidas, [{ numeroFila: 5, motivo: 'Sin descripción' }]);
    });

    await test('CSV con acentos en encabezados y usoDestino normalizado', () => {
      const csv = 'descripción,uso destino\n"Motor eléctrico trifásico 5 HP",immex\n"Silla de oficina giratoria",venta directa\n"Torno CNC industrial",activo fijo\n';
      const r = parsearArchivoLote(Buffer.from(csv, 'utf8').toString('base64'), 'partidas.csv');
      assert.equal(r.filas.length, 3);
      assert.equal(r.filas[0].usoDestino, 'INSUMO_IMMEX');
      assert.equal(r.filas[1].usoDestino, 'VENTA_DIRECTA');
      assert.equal(r.filas[2].usoDestino, 'ACTIVO_FIJO');
    });

    await test('sin columna descripción → error 400 con encabezados encontrados', () => {
      const b64 = xlsxBase64([['SKU', 'Precio'], ['A', 1]]);
      assert.throws(() => parsearArchivoLote(b64, 'x.xlsx'), (e: unknown) =>
        (e as { statusCode: number }).statusCode === 400 && /descripcion/.test((e as Error).message) && /SKU/.test((e as Error).message));
    });

    await test('plantilla descargable trae los encabezados canónicos', () => {
      const filas = leerPrimeraHoja(generarPlantillaXlsx());
      assert.deepEqual(filas[0], ['productCode', 'descripcion', 'contexto', 'paisOrigen', 'valorUSD', 'usoDestino']);
    });

    console.log('\n== semáforo (tabla de casos) ==');
    const casos: Array<[string, Parameters<typeof semaforoDeFila>[0], Semaforo]> = [
      ['error del pipeline → rojo', { confidence: 95, fractionCode: '73181599', error: 'falló' }, 'rojo'],
      ['sin fracción (sin candidato) → rojo', { confidence: 90, fractionCode: null }, 'rojo'],
      ['confianza < media → rojo', { confidence: UMBRAL_CONFIANZA_MEDIA - 1, fractionCode: '73181599' }, 'rojo'],
      ['confianza nula con fracción → rojo', { confidence: null, fractionCode: '73181599' }, 'rojo'],
      ['confianza media, sin catálogo, sin alertas → ámbar', { confidence: UMBRAL_CONFIANZA_MEDIA, fractionCode: '73181599', coincideCatalogo: null }, 'ambar'],
      ['confianza alta pero discrepa con catálogo → ámbar', { confidence: 99, fractionCode: '73181599', coincideCatalogo: false }, 'ambar'],
      ['confianza alta, sin catálogo, con alerta warning → ámbar', { confidence: 90, fractionCode: '73181599', coincideCatalogo: null, alertas: ['warning'] }, 'ambar'],
      ['confianza alta, sin catálogo, con alerta critical → ámbar', { confidence: 90, fractionCode: '73181599', coincideCatalogo: null, alertas: ['critical'] }, 'ambar'],
      ['confianza alta, sin catálogo, solo alertas info → verde', { confidence: UMBRAL_CONFIANZA_ALTA, fractionCode: '73181599', coincideCatalogo: null, alertas: ['info'] }, 'verde'],
      ['confianza alta, sin catálogo, sin alertas → verde', { confidence: 85, fractionCode: '73181599' }, 'verde'],
      ['confianza alta y coincide con catálogo (aun con warning) → verde', { confidence: 85, fractionCode: '73181599', coincideCatalogo: true, alertas: ['warning'] }, 'verde'],
      ['confianza media y coincide con catálogo → ámbar', { confidence: 70, fractionCode: '73181599', coincideCatalogo: true }, 'ambar'],
    ];
    for (const [nombre, entrada, esperado] of casos) {
      await test(nombre, () => assert.equal(semaforoDeFila(entrada), esperado));
    }

    console.log('\n== import + procesamiento con runner falso (sin IA) ==');

    // Parte en catálogo del tenant: SKU-CAT → 73181599
    await prisma.product.create({
      data: { tenantId: tenant.id, productCode: `SKU-CAT-${nonce}`, description: 'tornillo catálogo', unit: 'Pza', fractionCode: '73181599' },
    });

    const b64 = xlsxBase64([
      ['Código', 'Descripción', 'País', 'Valor USD'],
      [`SKU-CAT-${nonce}`, 'Tornillo de acero inoxidable M8 cabeza hexagonal', 'CN', 0.1],   // coincide → verde
      ['SKU-X', 'Tornillo de acero al carbono M8 galvanizado', 'CN', 0.1],                  // sin catálogo, 70 → ámbar
      ['', 'xx', '', ''],                                                                    // 422 → rojo sin llamar IA
      ['SKU-Y', 'Válvula de bronce para agua potable de media pulgada', 'US', 3],           // error del runner → rojo
      [`SKU-CAT-${nonce}`, 'Tornillo inoxidable M8 hexagonal otro lote', 'CN', 0.1],       // discrepa catálogo → ámbar
    ]);

    const deps = runnerFalso(desc => {
      if (/carbono/.test(desc)) return { payload: { fraction: { code: '7318.15.99' }, confidence: 70, alerts: [], alternatives: [{ code: '73181502', reason: 'específica', confidence: 40 }] } };
      if (/Válvula/.test(desc)) return { error: { code: 'ERROR_INTERNO', message: 'proveedor sin crédito' } };
      if (/otro lote/.test(desc)) return { payload: { fraction: { code: '7318.15.02' }, confidence: 95, alerts: [] } };
      return { payload: { fraction: { code: '7318.15.99' }, nico: '01', confidence: 92, alerts: [{ severity: 'info' }], alternatives: [] } };
    });

    let loteId = '';
    await test('importarLote crea lote + filas sin arrancar (arrancar=false)', async () => {
      const r = await importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'embarque.xlsx', base64: b64, arrancar: false });
      loteId = r.id;
      assert.equal(r.totalFilas, 5);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: loteId, tenantId: tenant.id }, include: { filas: true } });
      assert.equal(lote?.status, 'queued');
      assert.equal(lote?.filas.length, 5);
      assert.equal(deps.llamadas, 0);
    });

    await test('procesarLote encola un ClassificationJob por fila válida y calcula semáforos', async () => {
      await procesarLote(loteId, deps);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: loteId, tenantId: tenant.id }, include: { filas: { orderBy: { numeroFila: 'asc' } } } });
      assert.ok(lote);
      assert.equal(lote!.status, 'done');
      assert.equal(lote!.procesadas, 5);
      assert.equal(deps.llamadas, 4, 'la fila 422 no gasta llamada');
      const sem = lote!.filas.map(f => f.semaforo);
      assert.deepEqual(sem, ['verde', 'ambar', 'rojo', 'rojo', 'ambar']);
      assert.equal(lote!.verdes, 1);
      assert.equal(lote!.ambar, 2);
      assert.equal(lote!.rojas, 2);
      assert.equal(lote!.filas[0].coincideCatalogo, true);
      assert.equal(lote!.filas[0].fraccionCatalogo, '73181599');
      assert.equal(lote!.filas[0].fractionCode, '73181599');
      assert.ok(lote!.filas[0].classificationId);
      assert.ok(lote!.filas[0].jobId);
      assert.equal(lote!.filas[1].coincideCatalogo, null);
      assert.match(lote!.filas[2].error ?? '', /insuficiente/);
      assert.equal(lote!.filas[2].jobId, null);
      assert.match(lote!.filas[3].error ?? '', /sin crédito/);
      assert.equal(lote!.filas[4].coincideCatalogo, false);
      const jobs = await prisma.classificationJob.count({ where: { tenantId: tenant.id, userId: user.id } });
      assert.equal(jobs, 4);
      const activos = await prisma.classificationJob.count({ where: { tenantId: tenant.id, status: { in: ['queued', 'running'] } } });
      assert.equal(activos, 0, 'ningún job queda en vuelo');
    });

    await test('procesarLote es idempotente: no reprocesa filas con semáforo', async () => {
      const antes = deps.llamadas;
      await procesarLote(loteId, deps);
      assert.equal(deps.llamadas, antes);
    });

    await test(`${MAX_FALLAS_CONSECUTIVAS} fallas consecutivas del proveedor detienen el lote: restantes quedan PENDIENTES (semáforo null), status failed con mensaje honesto`, async () => {
      const filas: unknown[][] = [['descripcion']];
      for (let i = 0; i < 6; i++) filas.push([`Producto de prueba número ${i} con material acero`]);
      const depsFalla = runnerFalso(() => ({ error: { code: 'ERROR_INTERNO', message: 'cuota 429' } }));
      const r = await importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'falla.xlsx', base64: xlsxBase64(filas), arrancar: false });
      await procesarLote(r.id, depsFalla);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id }, include: { filas: true } });
      assert.equal(lote?.status, 'failed');
      assert.match(lote?.errorMsg ?? '', /detenido/);
      assert.match(lote?.errorMsg ?? '', /3 fila\(s\) quedaron pendientes/);
      assert.equal(depsFalla.llamadas, MAX_FALLAS_CONSECUTIVAS);
      assert.equal(lote?.rojas, MAX_FALLAS_CONSECUTIVAS, 'solo las filas que sí fallaron cuentan como rojas');
      assert.equal(lote?.procesadas, MAX_FALLAS_CONSECUTIVAS);
      assert.equal(lote?.filas.filter(f => f.semaforo === null).length, 6 - MAX_FALLAS_CONSECUTIVAS, 'las restantes no se marcan');
      assert.equal(lote?.filas.filter(f => /detenido/.test(f.error ?? '')).length, 0);

      // Reanudación: el lote failed con pendientes se reclama y termina con un runner sano.
      const depsOk = runnerFalso(() => ({ payload: { fraction: { code: '7318.15.99' }, confidence: 95, alerts: [] } }));
      await procesarLote(r.id, depsOk);
      const lote2 = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id }, include: { filas: true } });
      assert.equal(lote2?.status, 'done');
      assert.equal(lote2?.errorMsg, null);
      assert.equal(depsOk.llamadas, 6 - MAX_FALLAS_CONSECUTIVAS, 'solo las pendientes');
      assert.equal(lote2?.procesadas, 6);
      assert.equal(lote2?.verdes, 3);
      assert.equal(lote2?.rojas, 3);
    });

    await test('TIMEOUT (otra clasificación manual en curso) NO cuenta como falla del proveedor: filas rojas pero el lote no se detiene', async () => {
      // Job activo del usuario → el índice parcial bloquea el create de cada fila → TIMEOUT.
      const bloqueo = await prisma.classificationJob.create({ data: { tenantId: tenant.id, userId: user.id, status: 'running', inputs: { description: 'manual en curso' } } });
      try {
        const filas: unknown[][] = [['descripcion']];
        for (let i = 0; i < 4; i++) filas.push([`Bomba centrífuga de prueba número ${i} de acero`]);
        const d = runnerFalso(() => { throw new Error('no debía correr: la fila no se pudo encolar'); });
        const r = await importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'timeout.xlsx', base64: xlsxBase64(filas), arrancar: false });
        await procesarLote(r.id, d);
        const lote = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id }, include: { filas: true } });
        assert.equal(d.llamadas, 0);
        assert.equal(lote?.status, 'done', 'no se declara falla del proveedor');
        assert.equal(lote?.errorMsg, null);
        assert.equal(lote?.rojas, 4);
        assert.ok(lote?.filas.every(f => /otra clasificación en curso/.test(f.error ?? '')));
      } finally {
        await prisma.classificationJob.delete({ where: { id: bloqueo.id } });
      }
    });

    await test('dos procesarLote concurrentes sobre el mismo lote: claim exclusivo → una sola pasada, contadores exactos', async () => {
      const filas: unknown[][] = [['descripcion']];
      for (let i = 0; i < 3; i++) filas.push([`Motor eléctrico de prueba número ${i} trifásico`]);
      const d = runnerFalso(() => ({ payload: { fraction: { code: '8501.52.01' }, confidence: 90, alerts: [] } }));
      const r = await importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'concurrente.xlsx', base64: xlsxBase64(filas), arrancar: false });
      await Promise.all([procesarLote(r.id, d), procesarLote(r.id, d)]);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id }, include: { filas: true } });
      assert.equal(lote?.status, 'done');
      assert.equal(d.llamadas, 3, 'cada fila se clasifica UNA vez');
      assert.equal(lote?.procesadas, 3);
      assert.equal(lote?.verdes, 3);
      assert.equal(await prisma.classificationJob.count({ where: { tenantId: tenant.id, userId: user.id, inputs: { path: ['description'], string_contains: 'Motor eléctrico de prueba' } } }), 3);
    });

    await test('lote running con heartbeat fresco NO se reclama; con heartbeat vencido sí', async () => {
      const d = runnerFalso(() => ({ payload: { fraction: { code: '7318.15.99' }, confidence: 95, alerts: [] } }));
      const r = await importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'vivo.xlsx', base64: xlsxBase64([['descripcion'], ['Tornillo de acero inoxidable M8 cabeza hexagonal']]), arrancar: false });
      await prisma.classificationBatch.update({ where: { id: r.id }, data: { status: 'running', startedAt: new Date() } });
      await procesarLote(r.id, d);
      assert.equal(d.llamadas, 0, 'otro proceso lo tiene vivo (rolling deploy)');
      await prisma.classificationBatch.update({ where: { id: r.id }, data: { startedAt: new Date(Date.now() - LOTE_HEARTBEAT_VENCIDO_MS - 60_000) } });
      await procesarLote(r.id, d);
      assert.equal(d.llamadas, 1);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id } });
      assert.equal(lote?.status, 'done');
    });

    await test('revisión humana previa no se sobrescribe: fila revisada (sin semáforo) se salta y no suma contadores', async () => {
      const d = runnerFalso(() => ({ payload: { fraction: { code: '7318.15.99' }, confidence: 95, alerts: [] } }));
      const r = await importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'revisada.xlsx', base64: xlsxBase64([['descripcion'], ['Tornillo de acero inoxidable M8 cabeza hexagonal'], ['Válvula de bronce para agua potable']]), arrancar: false });
      const fila = await prisma.classificationBatchRow.findFirst({ where: { batchId: r.id, numeroFila: 2 } });
      await prisma.classificationBatchRow.update({ where: { id: fila!.id }, data: { revisado: true, fractionCode: '73181502', semaforo: 'verde', confidence: 100 } });
      await prisma.classificationBatch.update({ where: { id: r.id }, data: { verdes: 1, procesadas: 1 } });
      await procesarLote(r.id, d);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id }, include: { filas: { orderBy: { numeroFila: 'asc' } } } });
      assert.equal(d.llamadas, 1, 'la fila revisada no se reclasifica');
      assert.equal(lote?.filas[0].fractionCode, '73181502');
      assert.equal(lote?.filas[0].confidence, 100);
      assert.equal(lote?.procesadas, 2);
      assert.equal(lote?.verdes, 2);
    });

    await test('procesarLote termina el lote con TENANT_GUARD_STRICT=1 (worker por id: bypass explícito, resto acotado)', async () => {
      const previo = process.env.TENANT_GUARD_STRICT;
      process.env.TENANT_GUARD_STRICT = '1';
      try {
        const d = runnerFalso(() => ({ payload: { fraction: { code: '7318.15.99' }, confidence: 95, alerts: [] } }));
        const r = await importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'estricto.xlsx', base64: xlsxBase64([['descripcion'], ['Tornillo de acero inoxidable M8 cabeza hexagonal']]), arrancar: false });
        await procesarLote(r.id, d);
        const lote = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id }, include: { filas: true } });
        assert.equal(lote?.status, 'done', `bajo guard estricto el lote debe terminar (status=${lote?.status}, error=${lote?.errorMsg})`);
        assert.equal(lote?.procesadas, 1);
        assert.equal(lote?.filas[0]?.semaforo, 'verde');
      } finally {
        if (previo === undefined) delete process.env.TENANT_GUARD_STRICT; else process.env.TENANT_GUARD_STRICT = previo;
      }
    });

    await test('alcance por cliente: un usuario restringido al cliente A no ve el lote del cliente B (enAlcance) y el listado filtra por IN', async () => {
      const cA = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `LOA${nonce.toUpperCase().slice(0, 9)}`, razonSocial: 'Cliente A' } });
      const cB = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `LOB${nonce.toUpperCase().slice(0, 9)}`, razonSocial: 'Cliente B' } });
      const b64 = xlsxBase64([['descripcion'], ['Válvula de bronce para agua potable']]);
      const lA = await importarLote({ tenantId: tenant.id, userId: user.id, clienteId: cA.id, nombreArchivo: 'a.xlsx', base64: b64, arrancar: false });
      const lB = await importarLote({ tenantId: tenant.id, userId: user.id, clienteId: cB.id, nombreArchivo: 'b.xlsx', base64: b64, arrancar: false });
      const req = { headers: {}, query: {}, clienteIdsPermitidos: [cA.id] } as unknown as Request;
      const filaA = await prisma.classificationBatch.findFirst({ where: { id: lA.id, tenantId: tenant.id }, select: { clienteId: true } });
      const filaB = await prisma.classificationBatch.findFirst({ where: { id: lB.id, tenantId: tenant.id }, select: { clienteId: true } });
      assert.equal(filaB?.clienteId, cB.id);
      assert.equal(enAlcance(req, filaA?.clienteId), true);
      assert.equal(enAlcance(req, filaB?.clienteId), false, 'el lote del cliente B queda fuera del alcance (la ruta responde 404)');
      const visibles = await prisma.classificationBatch.findMany({ where: { tenantId: tenant.id, ...filtroCliente(req) }, select: { id: true } });
      assert.ok(visibles.some(l => l.id === lA.id) && !visibles.some(l => l.id === lB.id), 'el listado con filtroCliente solo trae lotes del cliente A');
      await prisma.cliente.deleteMany({ where: { id: { in: [cA.id, cB.id] } } });
    });

    await test('más de 500 filas → 400', async () => {
      const filas: unknown[][] = [['descripcion']];
      for (let i = 0; i < 501; i++) filas.push([`Producto ${i} de acero`]);
      await assert.rejects(
        importarLote({ tenantId: tenant.id, userId: user.id, nombreArchivo: 'grande.xlsx', base64: xlsxBase64(filas), arrancar: false }),
        (e: unknown) => (e as { statusCode: number }).statusCode === 400 && /500/.test((e as Error).message),
      );
    });


    console.log('\n== circuito catálogo↔lote (4ª revisión) ==');

    await test('fila con productCode que YA tiene dictamen vigente se resuelve desde el catálogo: verde, sin llamar al modelo, origen "catálogo"', async () => {
      const parteVig = await prisma.product.create({
        data: { tenantId: tenant.id, productCode: `SKU-VIG-${nonce}`, description: 'Arnés eléctrico con dictamen aprobado', unit: 'Pza', fractionCode: '85443099', nico: '02', versionVigente: 1 },
      });
      await prisma.productClassificationVersion.create({
        data: { productId: parteVig.id, version: 1, fractionCode: '85443099', nico: '02', fuente: 'clasificador', estado: 'vigente', propuestoPor: user.id, aprobadoPor: user.id, aprobadoAt: new Date() },
      });
      const d = runnerFalso(() => ({ payload: { fraction: { code: '8544.30.99' }, confidence: 95, alerts: [] } }));
      const r = await importarLote({
        tenantId: tenant.id, userId: user.id, nombreArchivo: 'reutiliza.xlsx', arrancar: false,
        base64: xlsxBase64([
          ['codigo', 'descripcion'],
          [`SKU-VIG-${nonce}`, 'Arnés eléctrico de 12 circuitos para tablero automotriz'],
          ['', 'Válvula de bronce para agua potable de media pulgada'],
        ]),
      });
      await procesarLote(r.id, d);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: r.id, tenantId: tenant.id }, include: { filas: { orderBy: { numeroFila: 'asc' } } } });
      assert.equal(d.llamadas, 1, 'solo la fila SIN dictamen gasta una llamada al modelo');
      assert.equal(lote?.status, 'done');
      assert.deepEqual(lote?.filas.map(f => f.semaforo), ['verde', 'verde']);
      const desdeCat = lote!.filas[0];
      assert.equal(desdeCat.fractionCode, '85443099');
      assert.equal(desdeCat.coincideCatalogo, true);
      assert.equal(desdeCat.productId, parteVig.id);
      assert.equal(desdeCat.jobId, null, 'no se encoló ningún job para esa fila');
      assert.equal(desdeCat.classificationId, null, 'no hay Classification: no corrió el modelo');
      assert.equal(desdeCat.confidence, null, 'sin confianza inventada: la fracción viene de una versión aprobada');
      assert.equal(origenDeFila(desdeCat), 'catalogo');
      assert.equal(origenDeFila(lote!.filas[1]), 'clasificador');

      const resumen = await resumenOrigenLote(tenant.id, r.id);
      assert.deepEqual(resumen, { desdeCatalogo: 1, desdeClasificador: 1, pendientes: 0 }, 'el resumen mide el ahorro');

      const x = await exportarLoteXlsx(tenant.id, r.id);
      const hoja = leerPrimeraHoja(x!.buffer);
      const idx = (n: string) => COLUMNAS_EXPORT.indexOf(n as typeof COLUMNAS_EXPORT[number]);
      assert.equal(hoja[1][idx('Origen')], ETIQUETA_ORIGEN.catalogo, 'el Excel dice de dónde salió la fracción');
      assert.equal(hoja[1][idx('NICO')], '02', 'el NICO de la fila del catálogo sale del dictamen vigente');
      assert.equal(hoja[2][idx('Origen')], ETIQUETA_ORIGEN.clasificador);
    });

    await test('parte con fractionCode pero SIN versión aprobada NO se resuelve desde el catálogo (solo compara)', async () => {
      const d = runnerFalso(() => ({ payload: { fraction: { code: '7318.15.99' }, confidence: 95, alerts: [] } }));
      const r = await importarLote({
        tenantId: tenant.id, userId: user.id, nombreArchivo: 'sin-aprobar.xlsx', arrancar: false,
        base64: xlsxBase64([['codigo', 'descripcion'], [`SKU-CAT-${nonce}`, 'Tornillo de acero inoxidable M8 cabeza hexagonal para prueba']]),
      });
      await procesarLote(r.id, d);
      assert.equal(d.llamadas, 1, 'un fractionCode sin dictamen aprobado no ahorra la llamada');
      const fila = await prisma.classificationBatchRow.findFirst({ where: { batchId: r.id } });
      assert.ok(fila?.jobId, 'la fila sí pasó por el clasificador');
      assert.equal(fila?.coincideCatalogo, true, 'pero sí se compara contra la fracción del catálogo');
      assert.equal(origenDeFila(fila!), 'clasificador');
    });

    console.log('\n== export xlsx ==');

    await test('exportarLoteXlsx trae todas las columnas y los datos de entrada + resultado', async () => {
      const r = await exportarLoteXlsx(tenant.id, loteId);
      assert.ok(r);
      assert.match(r!.nombre, /embarque-clasificado\.xlsx$/);
      const hoja = leerPrimeraHoja(r!.buffer);
      assert.deepEqual(hoja[0], [...COLUMNAS_EXPORT]);
      const idx = (n: string) => COLUMNAS_EXPORT.indexOf(n as typeof COLUMNAS_EXPORT[number]);
      const f1 = hoja[1];
      assert.equal(f1[idx('Código')], `SKU-CAT-${nonce}`);
      assert.equal(f1[idx('Fracción')], '7318.15.99');
      assert.equal(f1[idx('NICO')], '01');
      assert.equal(f1[idx('Semáforo')], 'verde');
      assert.equal(f1[idx('Coincide catálogo')], 'sí');
      assert.equal(f1[idx('Confianza')], 92);
      const f2 = hoja[2];
      assert.equal(f2[idx('Coincide catálogo')], 'sin parte en catálogo');
      assert.match(String(f2[idx('Alternativas descartadas')]), /7318\.15\.02 \(40\): específica/);
      const f3 = hoja[3];
      assert.equal(f3[idx('Semáforo')], 'rojo');
      assert.match(String(f3[idx('Error')]), /insuficiente/);
      assert.equal(f3[idx('Descripción')], 'xx');
    });

    await test('construirLibroExport con cero filas deja solo el encabezado', () => {
      const hoja = leerPrimeraHoja(construirLibroExport([]));
      assert.equal(hoja.length, 1);
    });

    console.log('\n== multi-tenant ==');

    await test('lote de otro tenant → null (la ruta responde 404)', async () => {
      assert.equal(await exportarLoteXlsx(otroTenant.id, loteId), null);
      const lote = await prisma.classificationBatch.findFirst({ where: { id: loteId, tenantId: otroTenant.id } });
      assert.equal(lote, null);
    });

    await test('procesarLote de un lote ajeno no ve filas del catálogo del otro tenant', async () => {
      const otroUser = await prisma.user.create({ data: { email: `lote-otro-${nonce}@example.test`, password: 'x', name: 'Otro', tenantId: otroTenant.id } });
      const r = await importarLote({
        tenantId: otroTenant.id, userId: otroUser.id, nombreArchivo: 'ajeno.xlsx', arrancar: false,
        base64: xlsxBase64([['codigo', 'descripcion'], [`SKU-CAT-${nonce}`, 'Tornillo de acero inoxidable M8 cabeza hexagonal']]),
      });
      const d = runnerFalso(() => ({ payload: { fraction: { code: '7318.15.99' }, confidence: 95, alerts: [] } }));
      await procesarLote(r.id, d);
      const fila = await prisma.classificationBatchRow.findFirst({ where: { batchId: r.id } });
      assert.equal(fila?.coincideCatalogo, null, 'el catálogo del tenant A no se cruza con el lote del tenant B');
    });

    console.log('\n== subpartidas hermanas ==');

    await test('hermanas de 73181599: misma partida 7318, la elegida marcada, con descripción', async () => {
      const h = await subpartidasHermanas('73181599');
      if (h.length === 0) { console.log('     (catálogo TIGIE no cargado en esta DB — se omite el detalle)'); return; }
      assert.ok(h.every(s => s.code.startsWith('7318')));
      const elegida = h.filter(s => s.elegida);
      assert.equal(elegida.length, 1);
      assert.equal(elegida[0].code, '731815');
      assert.ok(h.every(s => typeof s.description === 'string' && s.description.length > 0));
      assert.ok(elegida[0].fracciones.some(f => f.code === '73181599' && f.elegida));
    });

    await test('hermanas de un código inválido → lista vacía', async () => {
      assert.deepEqual(await subpartidasHermanas('xx'), []);
    });
  } finally {
    // Limpieza: todo lo que cuelga de los tenants de prueba.
    for (const t of [tenant.id, otroTenant.id]) {
      await prisma.classificationBatch.deleteMany({ where: { tenantId: t } });
      await prisma.productClassificationVersion.deleteMany({ where: { product: { tenantId: t } } });
      await prisma.classificationJob.deleteMany({ where: { tenantId: t } });
      await prisma.classification.deleteMany({ where: { tenantId: t } });
      await prisma.product.deleteMany({ where: { tenantId: t } });
      await prisma.user.deleteMany({ where: { tenantId: t } });
      await prisma.tenant.delete({ where: { id: t } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
