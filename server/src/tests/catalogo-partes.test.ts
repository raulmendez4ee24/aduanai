/**
 * CATÁLOGO MAESTRO DE PARTES — Ola 1 (Operación 2026-08). Reglas de negocio:
 *  1. Una parte con versión vigente exige `justificacion` para proponer otra.
 *  2. Aprobar una versión la vuelve vigente, marca la anterior 'reemplazada' y
 *     sincroniza Product.fractionCode/nico/versionVigente.
 *  3. El Clasificador reutiliza el catálogo: productCode con versión vigente →
 *     respuesta sin correr el modelo (salvo forzar); descripción idéntica
 *     normalizada → sugerencia.
 *  4. Import Excel reporta por fila (creadas/actualizadas/errores) sin abortar.
 *  5. Multi-tenant: una parte de otro tenant no aparece ni se puede versionar.
 * Usa un tenant propio (creado y borrado aquí) para no chocar con otras suites.
 * Ejecutar: npx tsx src/tests/catalogo-partes.test.ts
 */
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import {
  normalizarDescripcion, normalizarFraccion,
  crearParte, listarPartes, obtenerParte, proponerVersion, aprobarVersion,
  promoverDesdeClasificacion, consultarCatalogoParaClasificar, buscarPorDescripcion,
  importarPartes, exportarPartesXlsx, CatalogoError,
} from '../services/catalogo-partes';
import { agruparHistorial, aciertoPorCapitulo } from '../services/historial-clasificaciones';
import { clienteIdDe, filtroCliente, enAlcance, validarClienteEnAlcance } from '../lib/cliente-contexto';
import type { Request } from 'express';

let ok = 0;
function check(cond: boolean, msg: string) { assert.ok(cond, msg); ok++; console.log(`  ✓ ${msg}`); }
async function rechaza(fn: () => Promise<unknown>, codigo: string, msg: string) {
  try { await fn(); assert.fail(`${msg} — no lanzó`); }
  catch (e) {
    assert.ok(e instanceof CatalogoError, `${msg} — lanzó ${e instanceof Error ? e.message : e}`);
    assert.equal((e as CatalogoError).codigo, codigo, `${msg} — código ${(e as CatalogoError).codigo}`);
    ok++; console.log(`  ✓ ${msg}`);
  }
}

async function main() {
  const nonce = Date.now().toString(36);
  const tA = await prisma.tenant.create({ data: { name: `__catalogo_test_A__ ${nonce}` } });
  const tB = await prisma.tenant.create({ data: { name: `__catalogo_test_B__ ${nonce}` } });
  const uA = await prisma.user.create({ data: { email: `catalogo-a-${nonce}@test.local`, password: 'x', name: 'Tester A', tenantId: tA.id } });
  const uB = await prisma.user.create({ data: { email: `catalogo-b-${nonce}@test.local`, password: 'x', name: 'Tester B', tenantId: tB.id } });
  const cliente = await prisma.cliente.create({ data: { tenantId: tA.id, rfc: `CAT${nonce.toUpperCase().slice(0, 9)}`, razonSocial: 'Cliente de prueba' } });

  try {
    // 0. Normalización
    check(normalizarDescripcion('  Tornillo  ACERO inoxidable M8 ') === 'tornillo acero inoxidable m8', 'normalizarDescripcion: minúsculas, sin acentos, espacios colapsados');
    check(normalizarDescripcion('Válvula de retención') === normalizarDescripcion('valvula de retencion'), 'normalizarDescripcion ignora acentos');
    check(normalizarFraccion('7318.15.99') === '73181599', 'normalizarFraccion quita puntos');
    check(normalizarFraccion('7318.15') === null, 'normalizarFraccion rechaza menos de 8 dígitos');

    // 1. Crear parte con fracción inicial → versión 1 propuesta (sin permiso de aprobar)
    const p1 = await crearParte(tA.id, uA.id, {
      productCode: 'M8-INOX', description: 'Tornillo de acero inoxidable M8', unit: 'Pza',
      fractionCode: '7318.15.99', nico: '01', clienteId: cliente.id, usoDestino: 'INSUMO_IMMEX',
    }, { puedeAprobar: false });
    check(p1.versionVigente === 0 && p1.fractionCode === null, 'crear sin permiso de aprobar → sin vigente todavía');
    const d1 = await obtenerParte(tA.id, p1.id);
    check(d1.versiones.length === 1 && d1.versiones[0]!.estado === 'propuesta' && d1.versiones[0]!.fuente === 'manual', 'versión 1 queda en estado propuesta, fuente manual');

    // 2. Aprobar → vigente y Product sincronizado
    const v1 = await aprobarVersion(tA.id, uA.id, p1.id, 1);
    check(v1.estado === 'vigente' && v1.aprobadoPor === uA.id && !!v1.aprobadoAt, 'aprobar v1 → vigente con aprobadoPor/aprobadoAt');
    const p1b = await obtenerParte(tA.id, p1.id);
    check(p1b.fractionCode === '73181599' && p1b.nico === '01' && p1b.versionVigente === 1, 'Product.fractionCode/nico/versionVigente sincronizados');

    // 3. Nueva versión sin justificación → rechazada; con justificación → propuesta
    await rechaza(() => proponerVersion(tA.id, uA.id, p1.id, { fractionCode: '73181600', fuente: 'manual' }), 'JUSTIFICACION_REQUERIDA', 'reclasificar con vigente exige justificación');
    const v2 = await proponerVersion(tA.id, uA.id, p1.id, { fractionCode: '7318.16.00', nico: '00', fuente: 'manual', justificacion: 'Es tuerca, no tornillo (ficha técnica)' });
    check(v2.version === 2 && v2.estado === 'propuesta', 'con justificación → versión 2 propuesta');
    const p1c = await obtenerParte(tA.id, p1.id);
    check(p1c.fractionCode === '73181599' && p1c.versionVigente === 1, 'una propuesta NO cambia la fracción vigente');

    // 4. Aprobar v2 reemplaza v1
    await aprobarVersion(tA.id, uA.id, p1.id, 2);
    const p1d = await obtenerParte(tA.id, p1.id);
    const estados = Object.fromEntries(p1d.versiones.map(v => [v.version, v.estado]));
    check(estados[1] === 'reemplazada' && estados[2] === 'vigente', 'aprobar v2 → v1 reemplazada, v2 vigente');
    check(p1d.fractionCode === '73181600' && p1d.versionVigente === 2, 'Product apunta a la v2');
    await rechaza(() => aprobarVersion(tA.id, uA.id, p1.id, 2), 'ESTADO_INVALIDO', 'no se aprueba dos veces la misma versión');
    await rechaza(() => proponerVersion(tA.id, uA.id, p1.id, { fractionCode: '7318.16.00', fuente: 'manual', justificacion: 'misma' }), 'SIN_CAMBIO', 'proponer la misma fracción+NICO vigente se rechaza');

    // 5. Clasificador consulta el catálogo
    const r1 = await consultarCatalogoParaClasificar(tA.id, { productCode: 'M8-INOX', description: 'otra cosa' });
    check(r1.reutilizar?.fractionCode === '73181600' && r1.reutilizar.version === 2 && r1.reutilizar.productId === p1.id, 'productCode con vigente → reutilizar sin correr modelo');
    const r2 = await consultarCatalogoParaClasificar(tA.id, { description: '  TORNILLO de acero inoxidable m8 ' });
    check(!r2.reutilizar && r2.sugerido?.productId === p1.id, 'descripción idéntica normalizada → catalogoSugerido');
    const r3 = await consultarCatalogoParaClasificar(tA.id, { productCode: 'NO-EXISTE', description: 'x' });
    check(!r3.reutilizar && !r3.sugerido, 'productCode inexistente → sin reutilizar');
    const r4 = await consultarCatalogoParaClasificar(tA.id, { productCode: 'M8-INOX', description: 'x', clienteId: 'otro-cliente' });
    check(!r4.reutilizar, 'productCode de otro cliente → no se reutiliza (el cliente acota)');
    const b1 = await buscarPorDescripcion(tA.id, 'tornillo inoxidable');
    check(b1.similares.some(s => s.id === p1.id), 'buscar-por-descripcion encuentra por palabras');

    // 6. Promover desde Historial exige feedback correcto
    const cls = await prisma.classification.create({ data: {
      tenantId: tA.id, userId: uA.id, inputDescription: 'Válvula de retención de bronce 1/2"',
      fractionCode: '84813099', confidence: 88, griApplied: ['1', '6'], status: 'approved',
    } });
    await rechaza(() => promoverDesdeClasificacion(tA.id, uA.id, cls.id, { productCode: 'VAL-12' }, { puedeAprobar: true }), 'FEEDBACK_REQUERIDO', 'promover sin feedback ✓ se rechaza');
    await prisma.classification.update({ where: { id: cls.id }, data: { feedback: 'correct' } });
    const prom = await promoverDesdeClasificacion(tA.id, uA.id, cls.id, { productCode: 'VAL-12' }, { puedeAprobar: true });
    check(prom.creada && prom.version.fuente === 'historial' && prom.version.classificationId === cls.id && prom.version.estado === 'vigente', 'promover con feedback ✓ y permiso → parte nueva con versión historial vigente');
    const prom2 = await promoverDesdeClasificacion(tA.id, uA.id, cls.id, { productCode: 'VAL-12' }, { puedeAprobar: true });
    check(!prom2.creada && prom2.version.version === 1 && prom2.sinCambio === true, 'promover de nuevo la misma fracción → no duplica versión');

    // 7. Import Excel con errores por fila
    const filas = [
      { productCode: 'IMP-1', description: 'Bomba centrífuga 2 HP', fractionCode: '8413.70.99', nico: '01', unit: 'Pza', usoDestino: 'ACTIVO_FIJO', paisOrigen: 'US' },
      { productCode: '', description: 'Sin código', fractionCode: '8413.70.99', unit: 'Pza' },
      { productCode: 'IMP-3', description: 'Fracción mala', fractionCode: '8413.7', unit: 'Pza' },
      { productCode: 'M8-INOX', description: 'Tornillo de acero inoxidable M8 (actualizado)', unit: 'Pza' },
      { productCode: 'IMP-5', description: 'Uso inválido', usoDestino: 'OTRA_COSA', unit: 'Pza' },
    ];
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Partes');
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
    const rep = await importarPartes(tA.id, uA.id, { archivoBase64: b64, nombreArchivo: 'partes.xlsx' }, { puedeAprobar: true });
    check(rep.creadas === 1 && rep.actualizadas === 1 && rep.errores.length === 3, `import: 1 creada, 1 actualizada, 3 errores (got ${rep.creadas}/${rep.actualizadas}/${rep.errores.length})`);
    check(rep.errores.every(e => e.fila >= 2 && e.mensaje.length > 0), 'errores traen número de fila (Excel, 1-based con encabezado) y mensaje');
    const imp1 = await prisma.product.findFirst({ where: { tenantId: tA.id, productCode: 'IMP-1' } });
    check(imp1?.fractionCode === '84137099' && imp1.versionVigente === 1 && imp1.usoDestino === 'ACTIVO_FIJO', 'fila válida con permiso → vigente v1');
    const m8 = await prisma.product.findFirst({ where: { tenantId: tA.id, productCode: 'M8-INOX' } });
    check(!!m8?.description.includes('actualizado') && m8.versionVigente === 2, 'fila existente actualiza descripción sin tocar la versión vigente');

    // CSV también
    const csv = 'productCode,description,fractionCode,unit\nCSV-1,Empaque de caucho,4016.93.99,Pza\n';
    const repCsv = await importarPartes(tA.id, uA.id, { archivoBase64: Buffer.from(csv).toString('base64'), nombreArchivo: 'partes.csv' }, { puedeAprobar: false });
    check(repCsv.creadas === 1 && repCsv.errores.length === 0, 'import CSV crea la parte');
    const csv1 = await obtenerParte(tA.id, repCsv.ids[0]!);
    check(csv1.versionVigente === 0 && csv1.versiones[0]?.estado === 'propuesta' && csv1.versiones[0]?.fuente === 'lote', 'sin permiso de aprobar la fracción importada queda propuesta (fuente lote)');

    // 8. Export
    const buf = await exportarPartesXlsx(tA.id, {});
    const wbOut = XLSX.read(buf, { type: 'buffer' });
    const rowsOut = XLSX.utils.sheet_to_json<Record<string, unknown>>(wbOut.Sheets[wbOut.SheetNames[0]!]!);
    check(rowsOut.length === 4 && rowsOut.some(r => r.productCode === 'M8-INOX' && r.fractionCode === '7318.16.00'), 'export.xlsx trae las 4 partes del tenant con fracción vigente formateada');

    // 9. Listado con filtros
    const l1 = await listarPartes(tA.id, { q: 'inox' });
    check(l1.pagination.total === 1 && l1.data[0]!.productCode === 'M8-INOX', 'búsqueda por texto');
    const l2 = await listarPartes(tA.id, { capitulo: '84' });
    check(l2.pagination.total === 2, 'filtro por capítulo 84 (bomba + válvula)');
    const l3 = await listarPartes(tA.id, { dictamen: 'sin' });
    check(l3.pagination.total === 1 && l3.data[0]!.productCode === 'CSV-1', 'filtro sin dictamen vigente');
    const l4 = await listarPartes(tA.id, { clienteId: cliente.id });
    check(l4.pagination.total === 1, 'filtro por cliente');

    // 9b. Historial agrupado + acierto por capítulo (del feedback real)
    await prisma.classification.createMany({ data: [
      { tenantId: tA.id, userId: uA.id, inputDescription: 'valvula de retencion de bronce 1/2"', fractionCode: '84813099', confidence: 70, griApplied: ['1'], feedback: 'incorrect' },
      { tenantId: tA.id, userId: uA.id, inputDescription: 'Cable de cobre 12 AWG', fractionCode: '85444999', confidence: 91, griApplied: ['1'], feedback: 'correct' },
      { tenantId: tA.id, userId: uA.id, inputDescription: 'Cable de cobre 12 AWG', fractionCode: '85444901', confidence: 60, griApplied: ['1'] },
    ] });
    const agr = await agruparHistorial(tA.id, {}, 1, 50);
    const gValv = agr.data.find(g => g.clave === normalizarDescripcion('Válvula de retención de bronce 1/2"'));
    check(!!gValv && gValv.conteo === 2 && gValv.feedback.correct === 1 && gValv.feedback.incorrect === 1, 'agrupado: acentos/mayúsculas distintos caen en el mismo producto (2 clasificaciones)');
    check(gValv?.promovibleId === cls.id && gValv.enCatalogo?.productCode === 'VAL-12', 'agrupado: promovibleId = la clasificación con ✓ y enCatalogo cruza con la parte');
    const gCable = agr.data.find(g => g.descripcion === 'Cable de cobre 12 AWG');
    check(!!gCable && gCable.consistente === false && gCable.fracciones.length === 2 && gCable.fraccionDominante.length === 8, 'agrupado: dos fracciones distintas para el mismo producto → consistente=false');
    const ac = await aciertoPorCapitulo(tA.id);
    const c84 = ac.capitulos.find(c => c.capitulo === '84');
    const c85 = ac.capitulos.find(c => c.capitulo === '85');
    check(c84?.conFeedback === 2 && c84.acierto === 50 && c84.total === 2, 'acierto cap. 84 = 50% (1 ✓ de 2 con feedback)');
    check(c85?.conFeedback === 1 && c85.acierto === 100 && c85.total === 2, 'acierto cap. 85 = 100% con 1 feedback (la sin feedback no cuenta)');
    check(ac.totales.acierto === Math.round((2 / 3) * 1000) / 10, 'acierto total = 2/3 con feedback');
    const agrB = await agruparHistorial(tB.id, {}, 1, 50);
    check(agrB.data.length === 0, 'historial agrupado de B vacío (no ve A)');
    const filtrado = await agruparHistorial(tA.id, { feedback: 'sin' }, 1, 50);
    check(filtrado.data.length === 1 && filtrado.data[0]!.descripcion === 'Cable de cobre 12 AWG', 'filtro feedback=sin');

    // 10. Multi-tenant
    const lB = await listarPartes(tB.id, {});
    check(lB.pagination.total === 0, 'tenant B no ve partes de A');
    await rechaza(() => obtenerParte(tB.id, p1.id), 'NO_ENCONTRADA', 'tenant B no puede leer la parte de A');
    await rechaza(() => proponerVersion(tB.id, uB.id, p1.id, { fractionCode: '73181599', fuente: 'manual', justificacion: 'ataque' }), 'NO_ENCONTRADA', 'tenant B no puede versionar la parte de A');
    const rB = await consultarCatalogoParaClasificar(tB.id, { productCode: 'M8-INOX', description: 'Tornillo de acero inoxidable M8' });
    check(!rB.reutilizar && !rB.sugerido, 'el clasificador de B no reutiliza el catálogo de A');
    await rechaza(() => promoverDesdeClasificacion(tB.id, uB.id, cls.id, { productCode: 'X' }, { puedeAprobar: true }), 'NO_ENCONTRADA', 'tenant B no promueve clasificaciones de A');

    // 11. Alcance por cliente (revisión B): usuario restringido a VARIOS clientes → clienteIdDe es null,
    //     pero filtroCliente da { in: [...] } y el listado/búsqueda/export/detalle deben honrarlo.
    const clienteB = await prisma.cliente.create({ data: { tenantId: tA.id, rfc: `CTB${nonce.toUpperCase().slice(0, 9)}`, razonSocial: 'Cliente B' } });
    const clienteC = await prisma.cliente.create({ data: { tenantId: tA.id, rfc: `CTC${nonce.toUpperCase().slice(0, 9)}`, razonSocial: 'Cliente C' } });
    const pB = await crearParte(tA.id, uA.id, { productCode: 'SOLO-B', description: 'Bomba centrifuga exclusiva del cliente B', clienteId: clienteB.id }, { puedeAprobar: false });
    const pC = await crearParte(tA.id, uA.id, { productCode: 'SOLO-C', description: 'Bomba centrifuga exclusiva del cliente C', clienteId: clienteC.id }, { puedeAprobar: false });
    const reqAB = { headers: {}, query: {}, clienteIdsPermitidos: [cliente.id, clienteB.id] } as unknown as Request;
    check(clienteIdDe(reqAB) === null, 'con 2 clientes permitidos clienteIdDe es null (el bug: listados sin filtro)');
    const lAB = await listarPartes(tA.id, { ...filtroCliente(reqAB) });
    const idsAB = new Set(lAB.data.map(x => x.id));
    check(idsAB.has(pB.id) && !idsAB.has(pC.id), 'listarPartes con { in: [A,B] } incluye B y excluye C');
    const bAB = await buscarPorDescripcion(tA.id, 'bomba centrifuga exclusiva', filtroCliente(reqAB).clienteId);
    check(bAB.similares.some(x => x.id === pB.id) && !bAB.similares.some(x => x.id === pC.id), 'buscarPorDescripcion con { in } excluye la parte del cliente C');
    const xAB = XLSX.read(await exportarPartesXlsx(tA.id, { ...filtroCliente(reqAB) }), { type: 'buffer' });
    const codigosX = XLSX.utils.sheet_to_json<{ productCode: string }>(xAB.Sheets[xAB.SheetNames[0]]!).map(r => r.productCode);
    check(codigosX.includes('SOLO-B') && !codigosX.includes('SOLO-C'), 'export.xlsx con { in } excluye la parte del cliente C');
    check(enAlcance(reqAB, pB.clienteId) && !enAlcance(reqAB, pC.clienteId), 'enAlcance: detalle de la parte C queda fuera (la ruta responde 404)');
    await assert.rejects(() => validarClienteEnAlcance(reqAB, tA.id, clienteC.id), (e: unknown) => (e as { statusCode?: number }).statusCode === 403, 'validarClienteEnAlcance rechaza clienteId del body fuera del alcance (403)');
    ok++; console.log('  ✓ validarClienteEnAlcance rechaza clienteId del body fuera del alcance (403)');
    check((await validarClienteEnAlcance(reqAB, tA.id, clienteB.id)) === clienteB.id, 'validarClienteEnAlcance acepta un cliente del alcance');
  } finally {
    await prisma.productClassificationVersion.deleteMany({ where: { product: { tenantId: { in: [tA.id, tB.id] } } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { tenantId: { in: [tA.id, tB.id] } } }).catch(() => {});
    await prisma.classification.deleteMany({ where: { tenantId: { in: [tA.id, tB.id] } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tA.id, tB.id] } } }).catch(() => {});
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tA.id, tB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: { in: [tA.id, tB.id] } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: [tA.id, tB.id] } } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(`\n${ok} comprobaciones OK`);
}

main().catch(e => { console.error(e); process.exit(1); });
