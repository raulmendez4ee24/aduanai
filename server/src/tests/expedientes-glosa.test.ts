/**
 * Ola 2 — Expedientes fusionados: checklist 59-V/162-VII, glosa documental,
 * retención 5 años y paquete de auditoría ZIP (Operación 2026-08).
 *
 *   npm run test:expedientes
 *
 * PURO: glosa detecta valor/cantidad/peso/RFC/consignatario con tolerancias y
 * pasa en el caso consistente; checklist mapea incisos a documentos y marca
 * cotejo pendiente donde el corpus no respalda; ZIP stored se lista desde la
 * tabla central y el contenido cuadra con el CRC.
 * DB (tenant propio): glosarOperacion prefiere el Pedimento importado;
 * paquete de auditoría contiene documentos + glosa + checklist + certificado.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { filtroCliente, whereConAlcance } from '../lib/cliente-contexto';
import type { Request } from 'express';

const reqRestringida = (clienteIds: string[] | null): Request =>
  ({ headers: {}, query: {}, clienteIdsPermitidos: clienteIds } as unknown as Request);
import { glosarDocumentos, glosarOperacion, normalizarRfc, normalizarNombre, TOLERANCIAS_DEFAULT, type EntradaGlosaDocumental } from '../services/glosa-documental';
import { construirChecklist, calcularRetencionHasta, FUNDAMENTO_RETENCION, INCISOS_59V, construirPaqueteAuditoria, PaqueteDemasiadoGrandeError, ZIP_MAX_TOTAL_BYTES, ZIP_MAX_ARCHIVO_BYTES } from '../services/expediente-electronico';
import { crearZip, listarEntradasZip, leerEntradaZip, crc32 } from '../lib/zip';

const SUFIJO = `ola2exp${Date.now().toString(36)}`;
let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

const CONSISTENTE: EntradaGlosaDocumental = {
  factura: { numero: 'INV-1', total: 10000, moneda: 'USD', compradorNombre: 'Maquila Norte, S.A. de C.V.', compradorRfc: 'MNO010101AB1', items: [{ descripcion: 'tornillos', cantidad: 500 }, { descripcion: 'tuercas', cantidad: 500 }] },
  pedimento: { numero: '26 47 3461 6000001', rfcImportador: 'MNO-010101-AB1', valorComercial: 10050, pesoBruto: 1200, pesoNeto: 1100, bultos: 10, partidas: [{ fraccion: '73181501', cantidad: 500 }, { fraccion: '73181601', cantidad: 500 }], origen: 'extraido' },
  bl: { numero: 'BL-9', consignee: 'MAQUILA NORTE SA DE CV', pesoBruto: 1230, bultos: 10 },
  packing: { pesoBruto: 1210, pesoNeto: 1100, bultos: 10, cantidadTotal: 1000 },
};

async function parteGlosa() {
  console.log('— glosa documental (puro) —');
  await prueba('caso consistente: 0 errores, 0 advertencias, cruces completos (valor 0.5 % y peso 2.5 % dentro de tolerancia)', () => {
    const r = glosarDocumentos(CONSISTENTE);
    assert.equal(r.errores, 0, JSON.stringify(r.diferencias));
    assert.equal(r.advertencias, 0);
    assert.equal(r.consistente, true);
    assert.deepEqual(r.cruces, ['factura↔pedimento', 'bl↔pedimento', 'bl↔factura', 'packing↔pedimento', 'packing↔bl']);
    assert.deepEqual(r.tolerancias, TOLERANCIAS_DEFAULT);
  });
  await prueba('valor fuera de tolerancia → error VALOR con delta y tolerancia explícita', () => {
    const r = glosarDocumentos({ ...CONSISTENTE, pedimento: { ...CONSISTENTE.pedimento!, valorComercial: 9000 } });
    const d = r.diferencias.find(x => x.codigo === 'VALOR')!;
    assert.ok(d); assert.equal(d.severidad, 'error'); assert.equal(d.delta, 1000); assert.match(d.tolerancia, /1 %/);
    assert.equal(r.consistente, false);
  });
  await prueba('cantidad distinta → error CANTIDAD (tolerancia exacta) tanto factura↔pedimento como packing↔pedimento', () => {
    const r = glosarDocumentos({ ...CONSISTENTE, pedimento: { ...CONSISTENTE.pedimento!, partidas: [{ fraccion: '73181501', cantidad: 500 }, { fraccion: '73181601', cantidad: 480 }] } });
    const cant = r.diferencias.filter(x => x.codigo === 'CANTIDAD');
    assert.equal(cant.length, 2);
    assert.ok(cant.every(x => x.severidad === 'error' && x.delta === 20));
  });
  await prueba('peso bruto BL 10 % arriba → advertencia PESO_BRUTO; RFC distinto → error RFC; consignatario ajeno → advertencia', () => {
    const r = glosarDocumentos({
      ...CONSISTENTE,
      bl: { ...CONSISTENTE.bl!, pesoBruto: 1320, consignee: 'Otra Empresa Distinta SA' },
      pedimento: { ...CONSISTENTE.pedimento!, rfcImportador: 'XYZ010101AB1' },
    });
    assert.equal(r.diferencias.find(x => x.codigo === 'PESO_BRUTO' && x.fuenteA === 'BL')!.severidad, 'advertencia');
    const rfc = r.diferencias.find(x => x.codigo === 'RFC')!;
    assert.equal(rfc.severidad, 'error'); assert.equal(rfc.valorA, 'MNO010101AB1'); assert.equal(rfc.valorB, 'XYZ010101AB1');
    assert.equal(r.diferencias.find(x => x.codigo === 'CONSIGNATARIO')!.severidad, 'advertencia');
  });
  await prueba('tolerancias configurables: con pesoPct 0.15 el BL a +10 % ya no marca', () => {
    const r = glosarDocumentos({ ...CONSISTENTE, bl: { ...CONSISTENTE.bl!, pesoBruto: 1320 } }, { pesoPct: 0.15 });
    assert.equal(r.diferencias.filter(x => x.codigo === 'PESO_BRUTO').length, 0);
  });
  await prueba('documentos faltantes: cruces parciales, info FALTANTE, y sin ningún cruce no es "consistente"', () => {
    const r = glosarDocumentos({ factura: CONSISTENTE.factura, pedimento: null, bl: null, packing: null });
    assert.equal(r.cruces.length, 0); assert.equal(r.consistente, false);
    assert.deepEqual(r.faltantes, ['pedimento', 'bl', 'packing_list']);
  });
  await prueba('normalizadores: RFC quita guiones y espacios; razón social quita sufijos y acentos', () => {
    assert.equal(normalizarRfc('mno-010101 ab1'), 'MNO010101AB1');
    assert.equal(normalizarRfc('corto'), null);
    assert.equal(normalizarNombre('Maquila Norte, S.A. de C.V.'), 'MAQUILA NORTE');
    assert.equal(normalizarNombre('Compañía Ünica S de RL de CV'), 'COMPANIA UNICA');
  });
}

async function parteChecklist() {
  console.log('— checklist 59-V / 162-VII y retención (puro) —');
  await prueba('incisos a)–h) presentes; factura + BL + pedimento llenan c), e) y 162-VII pedimento; el resto pendiente', () => {
    const c = construirChecklist('IMPORT', [
      { id: '1', name: 'Factura', type: 'factura_comercial', status: 'UPLOADED' },
      { id: '2', name: 'BL', type: 'conocimiento_embarque', docType: 'bl', status: 'VERIFIED' },
      { id: '3', name: 'Pedimento', type: 'pedimento', status: 'UPLOADED' },
      { id: '4', name: 'Packing', type: 'packing_list', status: 'PENDING' },
    ]);
    assert.deepEqual(c.incisos59V.map(i => i.inciso), ['a)', 'b)', 'c)', 'd)', 'e)', 'f)', 'g)', 'h)']);
    const por = Object.fromEntries(c.incisos59V.map(i => [i.id, i.estado]));
    assert.equal(por['59V-c'], 'completo'); assert.equal(por['59V-e'], 'completo'); assert.equal(por['59V-d'], 'pendiente');
    assert.equal(c.piezas162VII.find(p => p.id === '162VII-pedimento')!.estado, 'completo');
    assert.equal(c.semaforo, 'rojo');
    assert.ok(c.incisos59V.every(i => i.cotejo === 'corpus' && i.fundamento.fechaCotejo === '2026-07-04'), '59-V cotejado (shield 2026-07-04)');
    assert.equal(c.piezas162VII.find(p => p.id === '162VII-padron')!.cotejo, 'pendiente', 'lo no respaldado va pendiente');
  });
  await prueba('"no aplica" saca el inciso condicional del denominador; todo completo → verde', () => {
    const docs = INCISOS_59V.filter(i => !i.condicional).map((i, n) => ({ id: String(n), name: i.id, type: i.documentosEsperados[0]!, status: 'UPLOADED' }));
    const todos162 = [{ id: 'p', name: 'p', type: 'pedimento', status: 'UPLOADED' }, { id: 'm', name: 'm', type: 'manifestacion_valor', status: 'UPLOADED' }, { id: 'e', name: 'e', type: 'encargo_conferido', status: 'UPLOADED' }, { id: 'pa', name: 'pa', type: 'padron_importadores', status: 'UPLOADED' }];
    const slots = ['conocimiento_embarque', 'packing_list', 'documento_transporte', 'factura_comercial'].map((t, n) => ({ id: `s${n}`, name: t, type: t, status: 'UPLOADED' }));
    const c = construirChecklist('IMPORT', [...docs, ...todos162, ...slots], ['59V-a', '59V-h', '162VII-rrna']);
    assert.equal(c.completitud59V, 100); assert.equal(c.completitud162VII, 100); assert.equal(c.completitudDocumentos, 100);
    assert.equal(c.semaforo, 'verde');
    assert.equal(c.incisos59V.find(i => i.id === '59V-a')!.estado, 'no_aplica');
  });
  await prueba('retención: fecha operación + 5 años; fundamento etiquetado pendiente de cotejo', () => {
    assert.equal(calcularRetencionHasta(new Date('2026-02-28T12:00:00Z')).toISOString().slice(0, 10), '2031-02-28');
    assert.equal(FUNDAMENTO_RETENCION.cotejo, 'pendiente');
    assert.match(FUNDAMENTO_RETENCION.articulo, /30 CFF/);
  });
}

async function parteZip() {
  console.log('— ZIP stored (puro) —');
  await prueba('crearZip → listarEntradasZip devuelve nombres, tamaños y CRC; el contenido se recupera intacto', () => {
    const a = Buffer.from('hola mundo', 'utf8');
    const zip = crearZip([{ nombre: 'docs/factura.pdf', contenido: a }, { nombre: 'certificado-integridad.json', contenido: '{"ok":true}' }], new Date('2026-08-27T10:00:00Z'));
    const entradas = listarEntradasZip(zip);
    assert.deepEqual(entradas.map(e => e.nombre), ['docs/factura.pdf', 'certificado-integridad.json']);
    assert.equal(entradas[0]!.tamano, a.length); assert.equal(entradas[0]!.crc, crc32(a));
    assert.equal(leerEntradaZip(zip, entradas[0]!).toString('utf8'), 'hola mundo');
    assert.equal(leerEntradaZip(zip, entradas[1]!).toString('utf8'), '{"ok":true}');
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
  });
  await prueba('crc32 conocido y nombres duplicados rechazados', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
    assert.throws(() => crearZip([{ nombre: 'a', contenido: 'x' }, { nombre: 'a', contenido: 'y' }]), /duplicada/);
  });
}

async function parteDB() {
  console.log('— glosa con pedimento importado y paquete ZIP (DB, tenant propio) —');
  const tenant = await prisma.tenant.create({ data: { name: `Exp ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: `${SUFIJO}@test.local`, password: 'x', name: 'T', role: 'ADMIN', tenantId: tenant.id } });
  const limpiar = async () => {
    await prisma.document.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.riskAssessment.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.operation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.pedimentoPartida.deleteMany({ where: { pedimento: { tenantId: tenant.id } } });
    await prisma.pedimento.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  };
  try {
    const ped = await prisma.pedimento.create({
      data: {
        tenantId: tenant.id, userId: user.id, numero: '26 47 3461 6000001', clave: 'A1', aduana: '470', patenteAduanal: '3461', rfcImportador: 'MNO010101AB1',
        tipoOperacion: 'IMP', regimen: 'Definitivo', pesoBruto: 1200, pesoNeto: 1100, bultos: 10, valorAduana: 190000, valorComercial: 10000, valorDolares: 10000, tipoCambio: 19,
        incoterm: 'FOB', transporte: 'Marítimo', origenArchivo: 'M3',
        partidas: { create: [{ numeroPartida: 1, fraccion: '73181501', descripcion: 'tornillos', cantidad: 500, unidadMedida: 'PZA', valorUnitario: 10, valorAduana: 95000, pais: 'CN' }, { numeroPartida: 2, fraccion: '73181601', descripcion: 'tuercas', cantidad: 500, unidadMedida: 'PZA', valorUnitario: 10, valorAduana: 95000, pais: 'CN' }] },
      },
    });
    const op = await prisma.operation.create({
      data: {
        tenantId: tenant.id, userId: user.id, reference: `OP-${SUFIJO}`, type: 'IMPORT', pedimentoId: ped.id, operationDate: new Date('2026-03-01'),
        documents: { create: [
          { tenantId: tenant.id, name: 'Factura', type: 'factura_comercial', docType: 'factura', status: 'UPLOADED', processedAt: new Date(), fileName: 'inv.pdf', mimeType: 'application/pdf', fileUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4 factura').toString('base64')}`, extractedData: { numeroFactura: 'INV-1', totalFactura: 10000, comprador: { nombre: 'Maquila Norte SA de CV', rfc: 'MNO010101AB1' }, items: [{ descripcion: 'tornillos', cantidad: 500 }, { descripcion: 'tuercas', cantidad: 500 }] } },
          { tenantId: tenant.id, name: 'Pedimento extraído (con error a propósito)', type: 'pedimento', docType: 'pedimento', status: 'UPLOADED', processedAt: new Date(), extractedData: { numeroPedimento: 'x', totalGeneral: 5000, pesoBruto: 300 } },
          { tenantId: tenant.id, name: 'BL', type: 'conocimiento_embarque', docType: 'bl', status: 'UPLOADED', processedAt: new Date(), extractedData: { numeroEmbarque: 'BL-9', consignee: 'MAQUILA NORTE', pesoBruto: 1230, bultos: 10 } },
          { tenantId: tenant.id, name: 'Packing', type: 'packing_list', status: 'PENDING' },
        ] },
      },
    });
    await prueba('glosarOperacion usa el Pedimento importado (dato duro) antes que el extraído → consistente', async () => {
      const r = await glosarOperacion(tenant.id, op.id);
      assert.equal(r.fuentePedimento, 'importado');
      assert.equal(r.errores, 0, JSON.stringify(r.diferencias));
      assert.ok(r.faltantes.includes('packing_list'));
      await prisma.operation.update({ where: { id: op.id }, data: { glosaDocumental: JSON.parse(JSON.stringify(r)) } });
    });
    await prueba('sin pedimento importado cae al extraído y detecta el valor 5000 vs 10000', async () => {
      await prisma.operation.update({ where: { id: op.id }, data: { pedimentoId: null } });
      const r = await glosarOperacion(tenant.id, op.id);
      assert.equal(r.fuentePedimento, 'extraido');
      assert.ok(r.diferencias.some(d => d.codigo === 'VALOR' && d.severidad === 'error'));
      await prisma.operation.update({ where: { id: op.id }, data: { pedimentoId: ped.id } });
    });
    await prueba('paquete de auditoría: ZIP con documentos + checklist + glosa + operación + certificado; hashes cuadran', async () => {
      const { zip, certificado } = await construirPaqueteAuditoria(tenant.id, op.id, new Date('2026-08-27T10:00:00Z'));
      const entradas = listarEntradasZip(zip);
      const nombres = entradas.map(e => e.nombre);
      assert.ok(nombres.some(n => n.startsWith('documentos/factura-') && n.endsWith('.pdf')), nombres.join(','));
      assert.ok(nombres.some(n => n.startsWith('documentos/bl-') && n.endsWith('.extraccion.json')), 'BL sin archivo → extracción');
      for (const f of ['checklist-59V-162VII.json', 'glosa-documental.json', 'operacion.json', 'certificado-integridad.json']) assert.ok(nombres.includes(f), f);
      assert.equal(certificado.entradas.length, entradas.length);
      const cert = JSON.parse(leerEntradaZip(zip, entradas.find(e => e.nombre === 'certificado-integridad.json')!).toString('utf8'));
      assert.equal(cert.hashPaquete, certificado.hashPaquete);
      const glosa = JSON.parse(leerEntradaZip(zip, entradas.find(e => e.nombre === 'glosa-documental.json')!).toString('utf8'));
      assert.equal(glosa.fuentePedimento, 'importado');
      const factura = entradas.find(e => e.nombre.startsWith('documentos/factura-'))!;
      assert.equal(leerEntradaZip(zip, factura).toString('utf8'), '%PDF-1.4 factura');
      assert.equal(typeof cert.cadenaAuditoria.valida, 'boolean');
    });
    await prueba('Parte B: presupuesto del ZIP — por archivo, total y número de entradas → PaqueteDemasiadoGrandeError (413) ANTES de decodificar', async () => {
      const esPaquete = (e: unknown) => e instanceof PaqueteDemasiadoGrandeError && e.status === 413;
      await assert.rejects(construirPaqueteAuditoria(tenant.id, op.id, new Date(), { maxArchivoBytes: 4 }), esPaquete);
      await assert.rejects(construirPaqueteAuditoria(tenant.id, op.id, new Date(), { maxTotalBytes: 100 }), esPaquete);
      await assert.rejects(construirPaqueteAuditoria(tenant.id, op.id, new Date(), { maxEntradas: 1 }), esPaquete);
      assert.ok(ZIP_MAX_TOTAL_BYTES === 100 * 1024 * 1024 && ZIP_MAX_ARCHIVO_BYTES <= ZIP_MAX_TOTAL_BYTES);
      const ok = await construirPaqueteAuditoria(tenant.id, op.id, new Date(), { maxTotalBytes: 10 * 1024 * 1024 });
      assert.ok(ok.zip.length > 0);
    });
    await prueba('otro tenant no puede generar el paquete', async () => {
      await assert.rejects(construirPaqueteAuditoria('tenant-ajeno', op.id), /no encontrada/);
    });
    await prueba('alcance: usuario restringido a A no resuelve la operación de B (whereConAlcance); la de A y la compartida sí', async () => {
      const cA = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `EA${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'A' } });
      const cB = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `EB${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'B' } });
      const opA = await prisma.operation.create({ data: { tenantId: tenant.id, userId: user.id, clienteId: cA.id, reference: `OPA-${SUFIJO}`, type: 'IMPORT' } });
      const opB = await prisma.operation.create({ data: { tenantId: tenant.id, userId: user.id, clienteId: cB.id, reference: `OPB-${SUFIJO}`, type: 'IMPORT' } });
      try {
        const req = reqRestringida([cA.id]);
        const busca = (id: string, r: Request) => prisma.operation.findFirst({ where: whereConAlcance(r, { id, tenantId: tenant.id }), select: { id: true } });
        assert.equal(await busca(opB.id, req), null, 'operación de B invisible');
        assert.ok(await busca(opA.id, req), 'operación de A visible');
        assert.ok(await busca(op.id, req), 'operación sin cliente (compartida) visible');
        assert.ok(await busca(opB.id, reqRestringida(null)), 'sin restricción ve B');
        assert.equal(await busca(opB.id, reqRestringida([])), null, 'restringido a nada no ve B');
      } finally {
        await prisma.operation.deleteMany({ where: { id: { in: [opA.id, opB.id] } } });
        await prisma.cliente.deleteMany({ where: { id: { in: [cA.id, cB.id] } } });
      }
    });
    await prueba('alcance: /alerts/expiring con filtroCliente solo trae documentos de operaciones de A', async () => {
      const cA = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `FA${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'A' } });
      const cB = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `FB${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'B' } });
      const pronto = new Date(Date.now() + 5 * 86400000);
      const mk = (clienteId: string, ref: string) => prisma.operation.create({ data: {
        tenantId: tenant.id, userId: user.id, clienteId, reference: ref, type: 'IMPORT',
        documents: { create: [{ tenantId: tenant.id, name: 'Permiso', type: 'permiso', status: 'UPLOADED', expiresAt: pronto }] },
      } });
      const opA = await mk(cA.id, `EXA-${SUFIJO}`);
      const opB = await mk(cB.id, `EXB-${SUFIJO}`);
      try {
        const where = (r: Request): Prisma.DocumentWhereInput => ({ operation: { tenantId: tenant.id, ...filtroCliente(r) }, expiresAt: { lte: new Date(Date.now() + 30 * 86400000) }, status: { in: ['UPLOADED' as const, 'VERIFIED' as const] } });
        const deA = await prisma.document.findMany({ where: where(reqRestringida([cA.id])), select: { operationId: true } });
        assert.deepEqual(deA.map(d => d.operationId), [opA.id]);
        const todos = await prisma.document.findMany({ where: where(reqRestringida(null)), select: { operationId: true } });
        assert.equal(todos.length, 2);
      } finally {
        await prisma.document.deleteMany({ where: { operationId: { in: [opA.id, opB.id] } } });
        await prisma.operation.deleteMany({ where: { id: { in: [opA.id, opB.id] } } });
        await prisma.cliente.deleteMany({ where: { id: { in: [cA.id, cB.id] } } });
      }
    });
  } finally { await limpiar(); }
}

async function main() {
  console.log('\n== Ola 2 — Expedientes: glosa documental · checklist · ZIP ==');
  await parteGlosa();
  await parteChecklist();
  await parteZip();
  await parteDB();
  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
