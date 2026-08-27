/**
 * Auto MVE — "el resto del formato E2" (Ola 2).
 *
 * Ejecutar: npm run test:mve
 *
 * Sin IA real: el extractor recibe un LLM falso que devuelve el JSON que un
 * modelo daría para la factura sintética. La parte de DB corre contra la
 * réplica LOCAL (rechaza cualquier host que no sea localhost) con un tenant
 * propio que se borra al final.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import {
  traducirTerminosPago, cuadrarValorAduana, semaforoVigencia, estadoTransmisionValido, ESTADOS_TRANSMISION,
  METODOS_VALORACION, layoutAXml,
} from '../lib/mve-e2';
import { extractInvoiceData, mapearExtraccionE2, generateFormatoE2, generateLayoutE2 } from '../services/auto-mve';
import {
  construirDatosMVE, crearMVE, buscarPlantilla, aplicarPlantillaAExtraccion, vigenciasPorProveedor,
  marcarTransmitidaPorUsuario, procesarLote,
} from '../services/mve-operacion';

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.stack ?? e.message : e}`); }
}

function soloLocal(): void {
  const raw = process.env.DATABASE_URL ?? '';
  let host = '';
  try { host = new URL(raw).hostname; } catch { /* abajo */ }
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`REFUSED: este test escribe en DB y solo corre contra localhost (host=${host || '?'})`);
}

// ── Fixture: factura sintética con "T/T 30 days" ─────────────────────────────
const FACTURA = `COMMERCIAL INVOICE No. INV-2026-0815   Date: 2026-08-15
Seller: Shenzhen Fastener Co., Ltd. — 88 Industrial Rd, Shenzhen, China
Consignee: Maquiladora del Norte SA de CV, RFC MNO990101AB1, Tijuana, BC, Mexico
Incoterm: FOB Shenzhen        Currency: USD
Payment terms: T/T 30 days after B/L date
1. Hex bolt M8x25 carbon steel   10,000 pcs   0.046   460.00
2. Flat washer M8                 5,000 pcs   0.010    50.00
Subtotal                                               510.00
Ocean freight to Manzanillo                            120.00
Marine insurance                                        12.50
Export packing (wooden crates)                          30.00
TOTAL                                                  672.50
Gross weight: 1,250 kg   Net weight: 1,180 kg
Remarks: Seller is a subsidiary of the buyer's parent company.`;

// Lo que un modelo devolvería para FACTURA (ya con conceptos desglosados).
const RESPUESTA_LLM = JSON.stringify({
  providerName: 'Shenzhen Fastener Co., Ltd.', providerCountry: 'CN', providerTaxId: null,
  invoiceNumber: 'INV-2026-0815', invoiceDate: '2026-08-15', incoterm: 'FOB', currency: 'USD',
  items: [
    { description: 'Hex bolt M8x25 carbon steel', quantity: 10000, unitPrice: 0.046, totalPrice: 460, fractionCode: '73181599' },
    { description: 'Flat washer M8', quantity: 5000, unitPrice: 0.01, totalPrice: 50 },
  ],
  subtotal: 510, freight: 120, insurance: 12.5, otherCharges: 30, totalValue: 672.5,
  paymentTerms: 'T/T 30 days after B/L date',
  incrementables: [
    { concepto: 'fletes', monto: 120, descripcion: 'Ocean freight to Manzanillo' },
    { concepto: 'seguros', monto: 12.5, descripcion: 'Marine insurance' },
    { concepto: 'gastos_embalaje', monto: 30, descripcion: 'Export packing (wooden crates)' },
  ],
  decrementables: [],
  hasVinculacion: true, vinculacionDesc: "Seller is a subsidiary of the buyer's parent company",
  pesoBrutoKg: 1250, pesoNetoKg: 1180, rfcImportador: 'MNO990101AB1', notes: null,
});

async function main(): Promise<void> {
  console.log('\n== MVE E2: catálogo puro ==');

  await test('traduce "T/T 30 days" → transferencia, 30 días', () => {
    const t = traducirTerminosPago('T/T 30 days after B/L date');
    assert.equal(t.formaPago, 'transferencia');
    assert.equal(t.plazoDias, 30);
    assert.equal(traducirTerminosPago('L/C at sight').formaPago, 'carta_credito');
    assert.equal(traducirTerminosPago('L/C at sight').plazoDias, 0);
    assert.equal(traducirTerminosPago('Net 45').plazoDias, 45);
    assert.equal(traducirTerminosPago('100% advance by wire').formaPago, 'transferencia');
    assert.deepEqual(traducirTerminosPago(null), { formaPago: null, plazoDias: null, original: null });
  });

  await test('cuadre: precio + Σ incrementables − Σ decrementables, y detecta planos que no cuadran', () => {
    const ok = cuadrarValorAduana({ invoiceValue: 510, incrementables: [{ concepto: 'fletes', monto: 120 }, { concepto: 'seguros', monto: 12.5 }, { concepto: 'gastos_embalaje', monto: 30 }], decrementables: [{ concepto: 'fletes_posteriores', monto: 10 }], freightValue: 120, insuranceValue: 12.5, otherIncrements: 30 });
    assert.equal(ok.customsValue, 662.5);
    assert.equal(ok.cuadra, true);
    const mal = cuadrarValorAduana({ invoiceValue: 510, incrementables: [{ concepto: 'fletes', monto: 120 }], decrementables: [], freightValue: 100 });
    assert.equal(mal.cuadra, false);
    assert.ok(mal.diferencias[0].includes('Flete'));
  });

  await test('semáforo de vigencia: verde/ámbar/rojo/gris', () => {
    const hoy = new Date('2026-08-27T12:00:00Z');
    assert.equal(semaforoVigencia('2026-12-01', hoy).semaforo, 'verde');
    assert.equal(semaforoVigencia('2026-09-10', hoy).semaforo, 'ambar');
    assert.equal(semaforoVigencia('2026-08-01', hoy).semaforo, 'rojo');
    assert.equal(semaforoVigencia(null, hoy).semaforo, 'gris');
  });

  await test('estadoTransmision solo admite los dos estados honestos', () => {
    assert.deepEqual([...ESTADOS_TRANSMISION], ['lista_para_transmitir', 'transmitida_por_usuario']);
    assert.equal(estadoTransmisionValido('transmitida'), false);
    assert.equal(estadoTransmisionValido('TRANSMITTED'), false);
    assert.equal(METODOS_VALORACION.length, 6);
    assert.equal(METODOS_VALORACION[0].clave, 'valor_transaccion');
  });

  console.log('\n== MVE E2: extracción con LLM inyectado ==');
  const llmFalso = async (_system: string, user: string) => {
    assert.ok(user.includes('T/T 30 days'), 'el texto de la factura llega al LLM');
    return '```json\n' + RESPUESTA_LLM + '\n```';
  };
  const extraido = await extractInvoiceData(FACTURA, llmFalso);

  await test('extrae forma de pago (T/T → transferencia, 30 días) y método (valor de transacción)', () => {
    assert.equal(extraido.paymentTerms, 'T/T 30 days after B/L date');
    assert.equal(extraido.formaPago, 'transferencia');
    assert.equal(extraido.plazoPagoDias, 30);
    assert.equal(extraido.metodoValoracion, 'valor_transaccion');
  });

  await test('incrementables por concepto cuadran con los planos y con el total', () => {
    assert.equal(extraido.incrementables!.length, 3);
    assert.equal(extraido.freight, 120);
    assert.equal(extraido.insurance, 12.5);
    assert.equal(extraido.otherCharges, 30);
    assert.equal(extraido.subtotal + 120 + 12.5 + 30, extraido.totalValue);
  });

  await test('vinculación, pesos y RFC del importador; sin fracción (Opción A)', () => {
    assert.equal(extraido.hasVinculacion, true);
    assert.ok(extraido.vinculacionDesc);
    assert.equal(extraido.vinculacionAfectaPrecio, null, 'si hay vinculación y no se sabe, queda por contestar');
    assert.equal(extraido.pesoBrutoKg, 1250);
    assert.equal(extraido.pesoNetoKg, 1180);
    assert.equal(extraido.rfcImportador, 'MNO990101AB1');
    for (const it of extraido.items) assert.equal('fractionCode' in it, false);
  });

  await test('sin conceptos del modelo, se derivan de flete/seguro/otros', () => {
    const m = mapearExtraccionE2({ providerName: 'X', providerCountry: 'US', invoiceNumber: '1', invoiceDate: '2026-01-01', subtotal: 100, freight: 10, insurance: 0, otherCharges: 5, totalValue: 115, paymentTerms: 'cash' });
    assert.deepEqual(m.incrementables!.map((a) => [a.concepto, a.monto]), [['fletes', 10], ['otros', 5]]);
    assert.equal(m.formaPago, 'efectivo');
    assert.equal(m.rfcImportador, null);
  });

  console.log('\n== MVE E2: construcción y layout ==');
  const datos = construirDatosMVE({
    providerName: extraido.providerName, providerCountry: extraido.providerCountry, invoiceNumber: extraido.invoiceNumber, invoiceDate: extraido.invoiceDate,
    incoterm: extraido.incoterm, currency: extraido.currency, invoiceValue: extraido.subtotal,
    incrementables: extraido.incrementables, decrementables: [{ concepto: 'fletes_posteriores', monto: 20, descripcion: 'flete Manzanillo→planta' }],
    hasVinculacion: true, vinculacionDesc: extraido.vinculacionDesc, vinculacionAfectaPrecio: false,
    formaPago: extraido.formaPago, plazoPagoDias: extraido.plazoPagoDias, paymentTerms: extraido.paymentTerms,
    pesoBrutoKg: extraido.pesoBrutoKg, pesoNetoKg: extraido.pesoNetoKg, rfcImportador: null,
  }, 'MNO990101AB1');

  await test('construirDatosMVE: planos derivados de conceptos, RFC del contexto, valor en aduana cuadrado', () => {
    assert.equal(datos.freightValue, 120);
    assert.equal(datos.insuranceValue, 12.5);
    assert.equal(datos.otherIncrements, 30);
    assert.equal(datos.customsValue, 510 + 162.5 - 20);
    assert.equal(datos.cuadre.cuadra, true);
    assert.equal(datos.rfcImportador, 'MNO990101AB1');
    assert.equal(datos.formaPago, 'transferencia');
    assert.throws(() => construirDatosMVE({ providerName: 'A', providerCountry: 'US', invoiceNumber: '1', invoiceDate: '2026-01-01', invoiceValue: 10, metodoValoracion: 'inventado' }, null), /metodoValoracion/);
  });

  await test('formato E2 y layout traen método con fundamento, conceptos, estado honesto y aviso "no es XSD oficial"', () => {
    const { extras, cuadre: _c, ...cols } = datos; void _c;
    const e2 = generateFormatoE2(cols, 'Tenant Test', extras);
    assert.equal(e2.metodoValoracion.fundamento, 'Art. 64 LA');
    assert.equal(e2.valoracion.totalIncrementables, 162.5);
    assert.equal(e2.valoracion.totalDecrementables, 20);
    assert.equal(e2.transmision.estado, 'lista_para_transmitir');
    assert.equal(e2.factura.plazoPagoDias, 30);
    const layout = generateLayoutE2({ ...cols, id: 'mve-test' }, 'Tenant Test', extras);
    assert.ok(layout.aviso.includes('NO es el XSD oficial'));
    assert.ok(layout.xml.startsWith('<?xml'));
    assert.ok(layout.xml.includes('oficial="false"'));
    assert.ok(layout.xml.includes('<fletes>120</fletes>'));
    const secciones = layout.json.secciones as Record<string, Record<string, unknown>>;
    assert.equal(secciones.Valoracion.ValorEnAduana, 652.5);
    assert.equal(secciones.Transmision.Estado, 'lista_para_transmitir');
    assert.ok(layoutAXml([{ seccion: 'A', campo: 'B', valor: '<x>' }], { mveId: '1', generadoEn: 'x' }).includes('&lt;x&gt;'));
  });

  console.log('\n== MVE E2: DB local (plantillas, lote, vigencias, transmisión honesta) ==');
  soloLocal();
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenant = await prisma.tenant.create({ data: { name: `__mve_e2_test__ ${nonce}`, rfc: 'TEN010101AAA' } });
  try {
    const cliente = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: 'MNO990101AB1', razonSocial: 'Maquiladora del Norte', isDemoData: true } });

    await test('primer guardado crea la plantilla del proveedor con los campos estables', async () => {
      const mve = await crearMVE(tenant.id, cliente.id, datos, tenant.name);
      assert.equal(mve.estadoTransmision, 'lista_para_transmitir');
      assert.equal(mve.clienteId, cliente.id);
      const pl = await buscarPlantilla(tenant.id, 'Shenzhen Fastener Co., Ltd.');
      assert.ok(pl);
      assert.equal(pl.usos, 1);
      assert.equal(mve.plantillaId, pl.id);
      const c = pl.campos as Record<string, unknown>;
      assert.equal(c.formaPago, 'transferencia');
      assert.equal(c.hasVinculacion, true);
      assert.deepEqual(c.incrementablesTipicos, ['fletes', 'seguros', 'gastos_embalaje']);
    });

    await test('segunda factura del mismo proveedor: la plantilla pre-llena lo que la extracción no trajo', async () => {
      const segunda = mapearExtraccionE2({ providerName: 'shenzhen fastener co., ltd.', providerCountry: 'CN', invoiceNumber: 'INV-2', invoiceDate: '2026-09-01', incoterm: 'FOB', currency: 'USD', subtotal: 300, totalValue: 300, paymentTerms: null, notes: 'Incoterm no explícito; se usó FOB' });
      assert.equal(segunda.formaPago, null);
      const pl = await buscarPlantilla(tenant.id, segunda.providerName);
      const { extracted, plantillaAplicada } = aplicarPlantillaAExtraccion(segunda, pl);
      assert.ok(plantillaAplicada);
      assert.equal(extracted.formaPago, 'transferencia');
      assert.equal(extracted.plazoPagoDias, 30);
      assert.equal(extracted.hasVinculacion, true);
      assert.ok(plantillaAplicada.camposAplicados.includes('formaPago'));
      assert.ok(plantillaAplicada.camposAplicados.includes('vinculacion'));
      // La factura manda sobre la plantilla: si trae forma de pago, no se pisa.
      const conPago = aplicarPlantillaAExtraccion({ ...segunda, formaPago: 'carta_credito' }, pl);
      assert.equal(conPago.extracted.formaPago, 'carta_credito');
    });

    await test('lote: una MVE por factura, secuencial, con plantilla aplicada y errores por fila', async () => {
      let llamadas = 0;
      const llm = async () => { llamadas++; return JSON.stringify({ ...JSON.parse(RESPUESTA_LLM), invoiceNumber: `LOTE-${llamadas}`, paymentTerms: null, hasVinculacion: false, vinculacionDesc: null }); };
      const r = await procesarLote({
        tenantId: tenant.id, clienteId: cliente.id, llm,
        facturas: [
          { nombre: 'f1.txt', contenidoBase64: Buffer.from(FACTURA).toString('base64') },
          { nombre: 'f2.txt', texto: FACTURA },
          { nombre: 'vacia.txt', texto: '' },
          { nombre: 'x.pdf', contenidoBase64: Buffer.from('%PDF-1.4 ...').toString('base64') },
        ],
      });
      assert.equal(r.total, 4);
      assert.equal(r.creadas, 2);
      assert.equal(r.fallidas, 2);
      assert.equal(llamadas, 2, 'el extractor solo corre para facturas legibles');
      assert.equal(r.resultados[0].plantillaAplicada?.proveedorNombre, 'Shenzhen Fastener Co., Ltd.');
      assert.ok(r.resultados[2].error?.includes('vacía'));
      assert.ok(r.resultados[3].error?.includes('PDF'));
      const creada = await prisma.manifestacionValor.findFirst({ where: { id: r.resultados[0].mveId!, tenantId: tenant.id } });
      assert.equal(creada?.rfcImportador, 'MNO990101AB1', 'RFC viene del cliente activo');
      assert.equal(creada?.estadoTransmision, 'lista_para_transmitir');
      assert.equal(creada?.formaPago, 'transferencia', 'la plantilla llenó la forma de pago que la factura no traía');
      const pl = await buscarPlantilla(tenant.id, 'Shenzhen Fastener Co., Ltd.');
      assert.equal(pl?.usos, 3);
      await assert.rejects(procesarLote({ tenantId: tenant.id, clienteId: null, facturas: Array.from({ length: 21 }, () => ({ texto: FACTURA })), llm }), /Máximo 20/);
    });

    await test('vigencias por proveedor con semáforo (gris sin fecha, ámbar/verde/rojo con fecha)', async () => {
      const hoy = new Date('2026-08-27T12:00:00Z');
      let v = await vigenciasPorProveedor(tenant.id, cliente.id, hoy);
      assert.equal(v.proveedores.length, 1);
      assert.equal(v.proveedores[0].semaforo, 'gris');
      assert.ok(v.nota.includes('pendiente de cotejo'));
      const otra = construirDatosMVE({ providerName: 'Proveedor Vencido SA', providerCountry: 'US', invoiceNumber: 'V-1', invoiceDate: '2026-01-10', invoiceValue: 100, vigenciaHasta: '2026-07-01' }, null);
      await crearMVE(tenant.id, cliente.id, otra, tenant.name);
      const otra2 = construirDatosMVE({ providerName: 'Proveedor Pronto SA', providerCountry: 'DE', invoiceNumber: 'P-1', invoiceDate: '2026-08-01', invoiceValue: 100, vigenciaHasta: '2026-09-15' }, null);
      await crearMVE(tenant.id, cliente.id, otra2, tenant.name);
      v = await vigenciasPorProveedor(tenant.id, cliente.id, hoy);
      assert.deepEqual(v.proveedores.map((p) => p.semaforo), ['rojo', 'ambar', 'gris']);
      assert.equal(v.resumen.rojo, 1);
    });

    await test('estadoTransmision nunca es "transmitida" automática: solo con folio VUCEM + fecha', async () => {
      const m = await prisma.manifestacionValor.findFirst({ where: { tenantId: tenant.id, invoiceNumber: 'INV-2026-0815' } });
      assert.ok(m);
      const todas = await prisma.manifestacionValor.findMany({ where: { tenantId: tenant.id }, select: { estadoTransmision: true } });
      assert.ok(todas.every((x) => x.estadoTransmision === 'lista_para_transmitir'));
      await assert.rejects(marcarTransmitidaPorUsuario(tenant.id, m.id, '', '2026-08-27'), /Folio/);
      await assert.rejects(marcarTransmitidaPorUsuario(tenant.id, m.id, 'VUCEM-123456', '2099-01-01'), /futura/);
      const ok = await marcarTransmitidaPorUsuario(tenant.id, m.id, 'VUCEM-123456', '2026-08-26');
      assert.equal(ok.estadoTransmision, 'transmitida_por_usuario');
      assert.equal(ok.status, 'TRANSMITTED');
      const f = ok.formatoE2 as Record<string, Record<string, unknown>>;
      assert.equal(f.transmision.folioVucem, 'VUCEM-123456');
      // Otro tenant no puede marcarla.
      await assert.rejects(marcarTransmitidaPorUsuario('tenant-ajeno', m.id, 'VUCEM-1', '2026-08-26'), /no encontrada/);
    });

    await test('alcance por cliente (revisión A): restringido a otro cliente no ve vigencias ni marca transmitida; {in} de varios sí', async () => {
      const clienteB = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: 'CLB990101AB1', razonSocial: 'Cliente B', isDemoData: true } });
      const hoy = new Date('2026-08-27T12:00:00Z');
      assert.equal((await vigenciasPorProveedor(tenant.id, clienteB.id, hoy)).proveedores.length, 0, 'B no ve proveedores de A');
      assert.equal((await vigenciasPorProveedor(tenant.id, { in: [cliente.id, clienteB.id] }, hoy)).proveedores.length, 3, 'alcance IN ve los de A');
      const pendiente = await prisma.manifestacionValor.findFirst({ where: { tenantId: tenant.id, clienteId: cliente.id, estadoTransmision: 'lista_para_transmitir' } });
      assert.ok(pendiente);
      await assert.rejects(marcarTransmitidaPorUsuario(tenant.id, pendiente.id, 'VUCEM-999999', '2026-08-26', clienteB.id), /no encontrada/);
      const ok = await marcarTransmitidaPorUsuario(tenant.id, pendiente.id, 'VUCEM-999999', '2026-08-26', { in: [clienteB.id, cliente.id] });
      assert.equal(ok.estadoTransmision, 'transmitida_por_usuario');
    });
  } finally {
    await prisma.manifestacionValor.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.mVEPlantillaProveedor.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.cliente.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
