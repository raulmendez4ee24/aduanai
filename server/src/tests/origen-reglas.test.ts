/**
 * Origen T-MEC (Ola 2): salto arancelario CC/CTH/CTSH por material, de minimis
 * parametrizado, acumulación, cobertura de reglas, importación con validación,
 * certificado con 9 elementos, portal de proveedores por token.
 *   npm run test:origen
 */
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import {
  cumpleSalto, evaluarSaltoArancelario, evaluarDeMinimis, evaluarAutomotriz, codigoSaltoDeRegla,
  coberturaDeFraccion, coberturaPorCapitulo, validarFilaRegla, importarReglasOrigen, determinarOrigenDesdeBOM, reporteCobertura,
  type MaterialBOM, type ReglaMinima,
} from '../services/origin-reglas';
import { prellenarCertificado, createCertificate, renderCertificateHTML, decodificarCertificador, criterioDeMetodo, NOMBRES_ELEMENTOS } from '../services/origin-certificate';
import { crear, solicitar, portalVer, portalSubir, procesarVencimientosCertificados, ProveedorError, validarEntrada } from '../services/origin-proveedores';
import { rutaDeAccion, normalizarAccion, accionVerCertificadoProveedor } from '../services/alert-acciones';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}
const SUFIJO = `origen-${Date.now()}`;
const mat = (fractionCode: string | null, paisOrigen: string | null, valorUSD?: number, descripcion = 'mat'): MaterialBOM => ({ fractionCode, paisOrigen, valorUSD, descripcion, productCode: descripcion });

(async () => {
  console.log('— salto arancelario (puro) —');
  await prueba('cumpleSalto: CC compara capítulo, CTH partida, CTSH subpartida', () => {
    assert.equal(cumpleSalto('85443001', '74081100', 'CC'), true);   // 85 vs 74
    assert.equal(cumpleSalto('85443001', '85441900', 'CC'), false);  // mismo cap
    assert.equal(cumpleSalto('85443001', '85441900', 'CTH'), false); // misma partida 8544
    assert.equal(cumpleSalto('85443001', '85369099', 'CTH'), true);  // 8544 vs 8536
    assert.equal(cumpleSalto('85443001', '85441900', 'CTSH'), true); // 854430 vs 854419
    assert.equal(cumpleSalto('85443001', '85443099', 'CTSH'), false);
  });
  await prueba('evaluación por material: cumple / no cumple / no determinable sin fracción / originario por acumulación', () => {
    const r = evaluarSaltoArancelario({ fraccionFinal: '8544.30.01', codigo: 'CTSH', materiales: [
      mat('85441900', 'CN', 10, 'cable'), mat('85443099', 'CN', 5, 'arnes-parcial'), mat(null, 'CN', 3, 'sin-fraccion'), mat('85443099', 'US', 20, 'arnes-us'),
    ] });
    assert.equal(r.porMaterial[0]!.salto, 'cumple');
    assert.equal(r.porMaterial[1]!.salto, 'no_cumple');
    assert.equal(r.porMaterial[2]!.salto, 'no_determinable');
    assert.match(r.porMaterial[2]!.motivo, /falta la fracción del material/i);
    assert.equal(r.porMaterial[2]!.enlaceCatalogo, '/catalogo');
    assert.equal(r.porMaterial[3]!.salto, 'no_aplica');
    assert.equal(r.porMaterial[3]!.originario, true);
    assert.equal(r.resultado, 'no_cumple');
    assert.deepEqual(r.resumen, { total: 4, originarios: 1, noOriginarios: 3, cumplen: 1, noCumplen: 1, noDeterminables: 1 });
  });
  await prueba('global: todos cumplen → cumple; solo falta fracción → no_determinable; todos originarios → cumple', () => {
    assert.equal(evaluarSaltoArancelario({ fraccionFinal: '87082999', codigo: 'CTH', materiales: [mat('72101200', 'CN'), mat('39269099', 'DE')] }).resultado, 'cumple');
    assert.equal(evaluarSaltoArancelario({ fraccionFinal: '87082999', codigo: 'CTH', materiales: [mat('72101200', 'CN'), mat(null, 'DE')] }).resultado, 'no_determinable');
    assert.equal(evaluarSaltoArancelario({ fraccionFinal: '87082999', codigo: 'CTH', materiales: [mat('87082999', 'MX'), mat('87082999', 'CANADA')] }).resultado, 'cumple');
  });
  await prueba('codigoSaltoDeRegla: usa tariffShiftCode y, si falta, infiere del texto', () => {
    assert.equal(codigoSaltoDeRegla({ tariffShiftCode: 'CTSH', tariffShift: null }), 'CTSH');
    assert.equal(codigoSaltoDeRegla({ tariffShiftCode: null, tariffShift: 'Cambio a la partida 8703 desde cualquier otra partida' }), 'CTH');
    assert.equal(codigoSaltoDeRegla({ tariffShiftCode: null, tariffShift: 'Cambio a la subpartida 8544.70 desde cualquier otra subpartida' }), 'CTSH');
    assert.equal(codigoSaltoDeRegla({ tariffShiftCode: null, tariffShift: 'Cambio desde cualquier otro capítulo' }), 'CC');
    assert.equal(codigoSaltoDeRegla({ tariffShiftCode: null, tariffShift: null }), null);
  });

  console.log('— de minimis (parámetro, cotejo pendiente) —');
  await prueba('10% default: 8% aplica, 12% no; umbral editable; cotejo pendiente y aviso', () => {
    const ok = evaluarDeMinimis({ valorTransaccionUSD: 100, materialesQueNoCumplen: [mat('85443099', 'CN', 8)] });
    assert.equal(ok.aplica, true); assert.equal(ok.porcentajeCalculado, 8); assert.equal(ok.porcentajeUmbral, 10); assert.equal(ok.cotejo, 'pendiente');
    assert.match(ok.aviso, /pendiente de cotejo/);
    const no = evaluarDeMinimis({ valorTransaccionUSD: 100, materialesQueNoCumplen: [mat('85443099', 'CN', 12)] });
    assert.equal(no.aplica, false);
    const editado = evaluarDeMinimis({ valorTransaccionUSD: 100, materialesQueNoCumplen: [mat('85443099', 'CN', 12)], porcentajeUmbral: 15 });
    assert.equal(editado.aplica, true); assert.match(editado.aviso, /editado por el usuario/);
    assert.equal(evaluarDeMinimis({ valorTransaccionUSD: 100, materialesQueNoCumplen: [mat('85443099', 'CN', 12)], porcentajeUmbral: 500 }).porcentajeUmbral, 10);
  });
  await prueba('sin valor de transacción o sin valor del material → no determinable; textiles → excepción señalada', () => {
    assert.equal(evaluarDeMinimis({ valorTransaccionUSD: null, materialesQueNoCumplen: [mat('85443099', 'CN', 8)] }).aplica, null);
    assert.equal(evaluarDeMinimis({ valorTransaccionUSD: 100, materialesQueNoCumplen: [mat('85443099', 'CN')] }).aplica, null);
    const tx = evaluarDeMinimis({ valorTransaccionUSD: 100, materialesQueNoCumplen: [mat('52081100', 'CN', 5)], fraccionFinal: '62034201' });
    assert.ok(tx.excepcionesNoEvaluadas.some(x => /Textiles/.test(x)));
  });

  console.log('— automotriz LVC / acero-aluminio —');
  await prueba('regla sin umbral LVC → faltante explícito; con umbral → cumple/no cumple', () => {
    const base = { id: 'x', fractionCode: '8703', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined', description: '', rvcRequired: 75, rvcRequiredNetCost: null, rvcMethod: null, tariffShift: null, tariffShiftCode: null, specificProcess: null, annex: '4-B', isAutomotive: true, autoCategory: 'vehicle', laborValueContent: null, steelAluminumPercent: 70, textileRule: null, notes: null };
    const r = evaluarAutomotriz(base, { productValue: 100, highWageLaborCost: 45, totalSteelAluminumValue: 50, northAmericanSteelAluminumValue: 40 });
    assert.equal(r.aplica, true);
    assert.equal(r.lvc.calculado, 45); assert.equal(r.lvc.cumple, null); assert.match(r.lvc.faltante!, /no trae umbral LVC/);
    assert.equal(r.aceroAluminio.calculado, 80); assert.equal(r.aceroAluminio.cumple, true); assert.equal(r.aceroAluminio.faltante, null);
    const r2 = evaluarAutomotriz({ ...base, laborValueContent: 40 }, { productValue: 100, highWageLaborCost: 30 });
    assert.equal(r2.lvc.cumple, false); assert.match(r2.aceroAluminio.faltante!, /Faltan las compras/);
    assert.equal(evaluarAutomotriz({ ...base, isAutomotive: false }, {}).aplica, false);
  });

  console.log('— cobertura de reglas (puro) —');
  const reglasSin8544: ReglaMinima[] = [
    { fractionCode: '8703', matchType: 'prefix', agreement: 'TMEC', ruleType: 'combined', tariffShiftCode: 'CTH' },
    { fractionCode: '73181599', matchType: 'exact', agreement: 'TMEC', ruleType: 'rvc', tariffShiftCode: null },
    { fractionCode: '85', matchType: 'prefix', agreement: 'TLCUEM', ruleType: 'tariff_shift', tariffShiftCode: 'CTH' },
  ];
  await prueba('8544.30 sin regla cargada → "sin_regla" (la regla de otro tratado no cuenta)', () => {
    const c = coberturaDeFraccion(reglasSin8544, '8544.30', 'TMEC');
    assert.equal(c.nivel, 'sin_regla'); assert.equal(c.regla, null); assert.match(c.mensaje, /Sin regla cargada para 854430/);
    assert.equal(coberturaDeFraccion(reglasSin8544, '87032301').nivel, 'partida');
    assert.equal(coberturaDeFraccion(reglasSin8544, '73181599').nivel, 'fraccion');
    assert.equal(coberturaDeFraccion(reglasSin8544, '73181501').nivel, 'sin_regla');
  });
  await prueba('cobertura por capítulo: cuenta niveles y lista capítulos sin regla', () => {
    const r = coberturaPorCapitulo(reglasSin8544, 'TMEC');
    assert.equal(r.totalReglas, 2); assert.equal(r.capitulosConRegla, 2);
    assert.ok(r.capitulosSinRegla.includes('85')); assert.ok(!r.capitulosSinRegla.includes('87'));
    assert.deepEqual(r.capitulos.find(c => c.capitulo === '87')!.niveles, { capitulo: 0, partida: 1, subpartida: 0, fraccion: 0 });
  });
  await prueba('cobertura REAL en DB: reporta honestamente el estado de 8544.30 (seed 24-ago la trae a nivel subpartida)', async () => {
    const r = await reporteCobertura('TMEC', ['85443001', '01011001']);
    const c8544 = r.consultas[0]!;
    // Si el seed del 24-ago está cargado, 8544.30 tiene regla de subpartida; si no, debe decir "sin regla". Ambos son verdad, lo que no se admite es inventar.
    assert.ok(c8544.nivel === 'subpartida' || c8544.nivel === 'sin_regla' || c8544.nivel === 'capitulo', `nivel inesperado ${c8544.nivel}`);
    console.log(`      (DB local: 8544.30 → ${c8544.nivel}; ${r.resumen.totalReglas} reglas TMEC, ${r.cotejo.reglasSinFuente} sin fuente en notes)`);
    assert.ok(typeof r.resumen.capitulosSinRegla.length === 'number');
  });

  console.log('— importación de reglas: validación por fila —');
  await prueba('validarFilaRegla: rechaza fracción/tipos inválidos; cotejo ok solo con fuente http(s)', () => {
    assert.equal(validarFilaRegla({ fractionCode: '8544.30', ruleType: 'combined', description: 'x', tariffShiftCode: 'CTSH', rvcRequired: 60 }, 2).ok, true);
    assert.equal(validarFilaRegla({ fractionCode: '8544.30', ruleType: 'combined', description: 'x', tariffShiftCode: 'CTSH', rvcRequired: 60 }, 2).cotejo, 'pendiente');
    assert.equal(validarFilaRegla({ fractionCode: '8544.30', ruleType: 'combined', description: 'x', tariffShiftCode: 'CTSH', rvcRequired: 60, fuente: 'https://hts.usitc.gov' }, 2).cotejo, 'ok');
    const mal = validarFilaRegla({ fractionCode: '123', ruleType: 'magic', description: '', tariffShiftCode: 'XX', rvcRequired: 150, fuente: 'dof' }, 3);
    assert.equal(mal.ok, false);
    assert.ok(mal.errores.length >= 5, mal.errores.join('; '));
    assert.ok(validarFilaRegla({ fractionCode: '8544', ruleType: 'combined', description: 'x' }, 4).errores.some(e => /tariffShiftCode/.test(e)));
    assert.ok(validarFilaRegla({ fractionCode: '8544', matchType: 'exact', ruleType: 'rvc', description: 'x', rvcRequired: 50 }, 5).errores.some(e => /exact exige 8/.test(e)));
  });
  await prueba('importarReglasOrigen dryRun: cuenta válidas/inválidas, detecta duplicadas y NO escribe', async () => {
    const filas = [
      { fraccion: '99.99', tipo: 'prefix', tratado: 'TMEC', ruleType: 'tariff_shift', descripcion: 'prueba', salto: 'CTH', fuente: 'https://example.org/dof' },
      { fraccion: '99.99', tipo: 'prefix', tratado: 'TMEC', ruleType: 'tariff_shift', descripcion: 'dup', salto: 'CTH' },
      { fraccion: 'abc', ruleType: 'rvc', descripcion: 'mala' },
    ];
    const ws = XLSX.utils.json_to_sheet(filas); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'r');
    const b64 = (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
    const antes = await prisma.originRule.count({ where: { fractionCode: '9999' } });
    const rep = await importarReglasOrigen({ archivoBase64: b64, nombreArchivo: 'r.xlsx', dryRun: true });
    assert.equal(rep.total, 3); assert.equal(rep.validas, 1); assert.equal(rep.invalidas, 2); assert.equal(rep.cotejadas, 1);
    assert.ok(rep.filas[1]!.errores.some(e => /duplicada/.test(e)));
    assert.equal(await prisma.originRule.count({ where: { fractionCode: '9999' } }), antes);
  });

  console.log('— con tenant de prueba —');
  const tenant = await prisma.tenant.create({ data: { name: `Test ${SUFIJO}`, status: 'ACTIVE', rfc: 'TEN010101AAA' } });
  const otro = await prisma.tenant.create({ data: { name: `Otro ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `u-${SUFIJO}@test.local`, name: 'Ana Pruebas', password: 'x', role: 'ADMIN', emailVerified: true } });
  const cliente = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `CLI${SUFIJO}`.replace(/[^A-Z0-9]/gi, '').slice(0, 13).toUpperCase(), razonSocial: 'Importadora Cliente SA', contactoEmail: 'compras@cliente.mx' } });
  const limpiar = async () => {
    await prisma.alert.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.document.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.certificadoOrigenProveedor.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.originCertificate.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.originAnalysis.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.productComponent.deleteMany({ where: { product: { tenantId: { in: [tenant.id, otro.id] } } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otro.id] } } });
  };
  try {
    // BOM: arnés 8544.30.01 con cable CN (cumple CTSH), conector CN misma subpartida (falla), tornillo sin fracción, alambre US (acumulación)
    const arnes = await prisma.product.create({ data: { tenantId: tenant.id, clienteId: cliente.id, productCode: `ARN-${SUFIJO}`, description: 'Arnés eléctrico automotriz', unit: 'Pza', isFinished: true, fractionCode: '85443001', paisOrigen: 'MX' } });
    const cable = await prisma.product.create({ data: { tenantId: tenant.id, productCode: `CAB-${SUFIJO}`, description: 'Cable aislado', unit: 'm', fractionCode: '85441900', paisOrigen: 'CN' } });
    const conector = await prisma.product.create({ data: { tenantId: tenant.id, productCode: `CON-${SUFIJO}`, description: 'Subarnés parcial', unit: 'Pza', fractionCode: '85443099', paisOrigen: 'CN' } });
    const tornillo = await prisma.product.create({ data: { tenantId: tenant.id, productCode: `TOR-${SUFIJO}`, description: 'Tornillo sin fracción', unit: 'Pza', fractionCode: null, paisOrigen: 'CN' } });
    const alambre = await prisma.product.create({ data: { tenantId: tenant.id, productCode: `ALA-${SUFIJO}`, description: 'Alambre de cobre', unit: 'kg', fractionCode: '74081100', paisOrigen: 'US' } });
    for (const [c, q] of [[cable, 3], [conector, 1], [tornillo, 4], [alambre, 0.5]] as const) {
      await prisma.productComponent.create({ data: { productId: arnes.id, componentId: c.id, quantity: q, unit: c.unit } });
    }
    const hayRegla8544 = await prisma.originRule.count({ where: { fractionCode: '854430', agreement: 'TMEC', active: true } });

    await prueba('determinarOrigenDesdeBOM: por material + global + faltante de fracción con enlace al catálogo', async () => {
      const r = await determinarOrigenDesdeBOM({ tenantId: tenant.id, productId: arnes.id, valorTransaccionUSD: 100, valores: { [conector.id]: 5 } });
      assert.ok(r);
      if (hayRegla8544 === 0) { assert.equal(r.veredicto, 'sin_regla'); console.log('      (DB local sin regla 8544.30: veredicto sin_regla — correcto)'); return; }
      assert.equal(r.codigoSalto, 'CTSH');
      const porCodigo = Object.fromEntries(r.salto!.porMaterial.map(m => [m.material.productCode, m.salto]));
      assert.equal(porCodigo[cable.productCode], 'cumple');
      assert.equal(porCodigo[conector.productCode], 'no_cumple');
      assert.equal(porCodigo[tornillo.productCode], 'no_determinable');
      assert.equal(porCodigo[alambre.productCode], 'no_aplica');
      assert.equal(r.acumulacion.originarios.length, 1);
      assert.equal(r.veredicto, 'no_determinable'); // el tornillo sin fracción bloquea
      assert.ok(r.faltantes.some(f => f.includes(tornillo.productCode)));
      assert.ok(r.salto!.porMaterial.find(m => m.material.productCode === tornillo.productCode)!.enlaceCatalogo!.includes(tornillo.id));
    });
    await prueba('BOM con fracciones completas: el que falla el salto vale 5% ≤ 10% → cumple por de minimis; con 12% → no cumple', async () => {
      if (hayRegla8544 === 0) return;
      await prisma.product.update({ where: { id: tornillo.id }, data: { fractionCode: '73181599' } });
      const ok = await determinarOrigenDesdeBOM({ tenantId: tenant.id, productId: arnes.id, valorTransaccionUSD: 100, valores: { [conector.id]: 5 } });
      assert.equal(ok!.veredicto, 'cumple_de_minimis');
      assert.equal(ok!.deMinimis!.cotejo, 'pendiente');
      const no = await determinarOrigenDesdeBOM({ tenantId: tenant.id, productId: arnes.id, valorTransaccionUSD: 100, valores: { [conector.id]: 12 } });
      assert.equal(no!.veredicto, 'no_cumple');
      assert.match(no!.motivo, /VCR ≥ 60%/);
    });
    await prueba('BOM de otro tenant: no se ve', async () => {
      assert.equal(await determinarOrigenDesdeBOM({ tenantId: otro.id, productId: arnes.id }), null);
    });

    console.log('— certificado: 9 elementos —');
    const analisis = await prisma.originAnalysis.create({ data: { tenantId: tenant.id, userId: user.id, clienteId: cliente.id, fractionCode: '85443001', agreement: 'TMEC', productDescription: 'Arnés eléctrico automotriz', productValue: 100, originatingValue: 80, nonOriginatingValue: 20, qualifies: true, qualifyingMethod: 'transaction_value', reason: 'ok' } });
    await prueba('prellenarCertificado trae los 9 elementos desde análisis + cliente + tenant + usuario y no inventa faltantes', async () => {
      const p = await prellenarCertificado({ tenantId: tenant.id, userId: user.id, analysisId: analisis.id });
      assert.equal(p.elementos.length, 9);
      assert.deepEqual(p.elementos.map(e => e.nombre), [...NOMBRES_ELEMENTOS]);
      assert.equal(p.elementos[0]!.valor, 'exportador');
      assert.match(p.elementos[1]!.valor, /Ana Pruebas/);
      assert.match(p.elementos[2]!.valor, /TEN010101AAA/);
      assert.match(p.elementos[4]!.valor, /Importadora Cliente SA/);
      assert.match(p.elementos[5]!.valor, /^8544\.30 — Arnés/);
      assert.match(p.elementos[6]!.valor, /^C — /); // materiales no originarios que cumplen Anexo 4-B
      assert.equal(p.faltantes.length, 0);
      assert.equal(p.sugerido.importerTaxId, cliente.rfc);
      assert.equal(criterioDeMetodo('wholly_obtained', 0), 'A');
      assert.equal(criterioDeMetodo('transaction_value', 0), 'B');
      const sin = await prellenarCertificado({ tenantId: tenant.id, userId: null, productId: null });
      assert.ok(sin.faltantes.length >= 3, sin.faltantes.join(','));
    });
    await prueba('createCertificate persiste certificador y factura; el HTML imprimible trae los 9 elementos, folio y print CSS', async () => {
      const p = await prellenarCertificado({ tenantId: tenant.id, userId: user.id, analysisId: analisis.id });
      const c = await createCertificate({ ...p.sugerido, tenantId: tenant.id, fractionCode: p.sugerido.fractionCode, productDescription: p.sugerido.productDescription, exporterName: p.sugerido.exporterName!, originCountry: 'MX', preferenceCriterion: p.sugerido.preferenceCriterion!, signedBy: 'Ana Pruebas', signedByRole: 'Apoderado legal', numeroFactura: 'F-123', certificador: { tipo: 'productor', nombre: 'Ana Pruebas', correo: 'ana@test.local', telefono: '555' } });
      const fila = await prisma.originCertificate.findFirst({ where: { id: c.id, tenantId: tenant.id } });
      const dec = decodificarCertificador(fila!.signedByRole);
      assert.equal(dec.role, 'Apoderado legal'); assert.equal(dec.certificador!.tipo, 'productor'); assert.equal(dec.numeroFactura, 'F-123');
      const html = renderCertificateHTML(fila!, 'https://x/verify/cert/' + c.certificateNumber);
      for (let n = 1; n <= 9; n++) assert.ok(html.includes(`<div class="n">${n}</div>`), `elemento ${n}`);
      assert.ok(html.includes('Productor</p>') && html.includes('ana@test.local') && html.includes('8544.30') && html.includes('F-123') && html.includes('Importadora Cliente SA'));
      assert.ok(html.includes(`Folio<strong>${c.certificateNumber}`) && html.includes('@media print') && html.includes('@page'));
      assert.ok(!html.includes('[[cert:'));
      assert.ok(html.includes('Certifico que las mercancías descritas'));
    });

    console.log('— portal de proveedores —');
    await prueba('validarEntrada y crear: campos obligatorios y vigencia coherente', async () => {
      assert.ok(validarEntrada({ proveedorNombre: '', proveedorPais: 'US' }));
      assert.ok(validarEntrada({ proveedorNombre: 'X', proveedorPais: 'US', vigenciaDesde: '2026-12-01', vigenciaHasta: '2026-01-01' }));
      assert.equal(validarEntrada({ proveedorNombre: 'X', proveedorPais: 'US', proveedorEmail: 'a@b.co' }), null);
      await assert.rejects(crear(tenant.id, { proveedorNombre: 'X', proveedorPais: 'US', productId: 'no-existe' }), (e: unknown) => e instanceof ProveedorError && e.code === 'DATOS_INVALIDOS');
    });
    const cert = await crear(tenant.id, { proveedorNombre: 'Cables del Norte Inc', proveedorPais: 'us', proveedorEmail: 'ventas@cablesnorte.com', productId: cable.id, fractionCode: '8544.19.00', clienteId: cliente.id });
    await prueba('solicitar: genera token, deja portalPath y dice "correo no enviado: canal no configurado" sin API key', async () => {
      const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
      try {
        const r = await solicitar(tenant.id, cert.id, { baseUrl: 'https://app.test' });
        assert.match(r.token, /^[a-f0-9]{48}$/);
        assert.equal(r.portalUrl, `https://app.test/proveedor/${r.token}`);
        assert.equal(r.correoEnviado, false); assert.match(r.motivo!, /canal no configurado/);
        const r2 = await solicitar(tenant.id, cert.id, { baseUrl: 'https://app.test' });
        assert.equal(r2.token, r.token); // reintento no rota el token
      } finally { if (key) process.env.RESEND_API_KEY = key; }
    });
    await prueba('portal por token: ve SOLO su registro (sin tenantId ni email), rechaza token inválido/ajeno', async () => {
      const fila = await prisma.certificadoOrigenProveedor.findFirst({ where: { id: cert.id, tenantId: tenant.id } });
      const v = await portalVer(fila!.tokenSolicitud!);
      assert.equal(v.id, cert.id); assert.equal(v.proveedorNombre, 'Cables del Norte Inc'); assert.equal(v.producto!.productCode, cable.productCode);
      assert.equal((v as unknown as Record<string, unknown>).tenantId, undefined);
      assert.equal((v as unknown as Record<string, unknown>).proveedorEmail, undefined);
      await assert.rejects(portalVer('x'), (e: unknown) => e instanceof ProveedorError && e.code === 'TOKEN_INVALIDO');
      await assert.rejects(portalVer('0'.repeat(48)), (e: unknown) => e instanceof ProveedorError && e.code === 'TOKEN_INVALIDO');
      await assert.rejects(portalSubir('0'.repeat(48), { archivoBase64: 'QUJD', vigenciaHasta: '2027-01-01' }), (e: unknown) => e instanceof ProveedorError && e.code === 'TOKEN_INVALIDO');
    });
    await prueba('portal subir: PDF base64 → Document del tenant del registro; estado recibido + vigencia', async () => {
      const fila = await prisma.certificadoOrigenProveedor.findFirst({ where: { id: cert.id, tenantId: tenant.id } });
      const tok = fila!.tokenSolicitud!;
      await assert.rejects(portalSubir(tok, { archivoBase64: 'QUJD', mimeType: 'text/plain', vigenciaHasta: '2027-01-01' }), (e: unknown) => e instanceof ProveedorError && e.code === 'ARCHIVO_INVALIDO');
      await assert.rejects(portalSubir(tok, { archivoBase64: 'QUJD' }), (e: unknown) => e instanceof ProveedorError && e.code === 'DATOS_INVALIDOS');
      const v = await portalSubir(tok, { archivoBase64: Buffer.from('%PDF-1.4 test').toString('base64'), mimeType: 'application/pdf', nombreArchivo: 'co.pdf', vigenciaDesde: '2026-08-01', vigenciaHasta: '2027-07-31', numeroCertificado: 'CO-77' });
      assert.equal(v.estado, 'recibido'); assert.equal(v.vigenciaHasta, '2027-07-31');
      const f2 = await prisma.certificadoOrigenProveedor.findFirst({ where: { id: cert.id, tenantId: tenant.id } });
      const doc = await prisma.document.findFirst({ where: { id: f2!.documentId!, tenantId: tenant.id } });
      assert.ok(doc); assert.equal(doc!.type, 'certificado_origen_proveedor'); assert.equal(doc!.productId, cable.id); assert.equal(doc!.clienteId, cliente.id);
      assert.ok(doc!.fileUrl!.startsWith('data:application/pdf;base64,'));
      assert.match(f2!.notas!, /CO-77/);
    });
    await prueba('vencimientos: alerta a 60/30/7 con fingerprint (sin duplicar), vencido cambia estado; acción navega al módulo', async () => {
      const r60 = await procesarVencimientosCertificados(tenant.id, new Date('2027-06-05T12:00:00Z')); // 56 días
      assert.equal(r60.alertas, 1);
      assert.equal((await procesarVencimientosCertificados(tenant.id, new Date('2027-06-06T12:00:00Z'))).alertas, 0);
      const r30 = await procesarVencimientosCertificados(tenant.id, new Date('2027-07-10T12:00:00Z')); // 21 días
      assert.equal(r30.alertas, 1);
      const r7 = await procesarVencimientosCertificados(tenant.id, new Date('2027-07-28T12:00:00Z')); // 3 días
      assert.equal(r7.alertas, 1);
      const rv = await procesarVencimientosCertificados(tenant.id, new Date('2027-08-02T12:00:00Z'));
      assert.equal(rv.vencidos, 1); assert.equal(rv.alertas, 1);
      const alertas = await prisma.alert.findMany({ where: { tenantId: tenant.id, type: 'certificado_proveedor_vence' }, orderBy: { createdAt: 'asc' } });
      assert.equal(alertas.length, 4);
      assert.deepEqual(alertas.map(a => a.fingerprint), [`cert_prov|${cert.id}|60`, `cert_prov|${cert.id}|30`, `cert_prov|${cert.id}|7`, `cert_prov|${cert.id}|vencido`]);
      assert.equal(alertas[2]!.severity, 'high'); // inminente sin cifra → high (techo)
      assert.equal(alertas[0]!.clienteId, cliente.id);
      const acc = normalizarAccion({ type: alertas[0]!.type, suggestedAction: alertas[0]!.suggestedAction });
      assert.equal(acc!.type, 'ver_certificado_proveedor');
      assert.equal(rutaDeAccion(accionVerCertificadoProveedor(cert.id)), `/origen-tmec?tab=proveedores&certificadoId=${cert.id}`);
      assert.equal((await prisma.certificadoOrigenProveedor.findFirst({ where: { id: cert.id, tenantId: tenant.id } }))!.estado, 'vencido');
      assert.equal((await prisma.alert.count({ where: { tenantId: otro.id } })), 0);
    });
  } finally {
    await limpiar();
  }

  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
