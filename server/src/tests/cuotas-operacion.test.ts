/**
 * Cuotas compensatorias (Ola 2): tasa por exportador vs general con
 * fundamento, cobertura cotejadas/pendientes, importación UPCI con validación,
 * dedupe y cotejo solo con fuente, alerta de elusión con fingerprint.
 *   npm run test:cuotas
 */
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { elegirCuotaAplicable, buscarCuotaAplicable, coberturaCuotas, checkAntidumpingDuty, resolverTasaPorExportador, type AntidumpingCheckResult } from '../services/antidumping';
import { validarFilaUPCI, parsearExportadorTasas, importarUPCI, plantillaUPCIXlsx, leerFilasUPCI } from '../services/antidumping-importar';
import { detectarElusion, exposicionDelTenant, fingerprintElusion } from '../services/antidumping-elusion';
import { cruceCuotaExportador } from '../services/glosa-cruces';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}
const SUFIJO = `cuotas-${Date.now()}`;
const RES = `TEST-${SUFIJO}`;
const FRAC = '99999901'; // fracción que no existe en el corpus real
const duty = (over: Partial<AntidumpingCheckResult['duty']> = {}): AntidumpingCheckResult => ({
  duty: {
    id: 'd1', resolutionType: 'definitiva', resolutionNumber: 'RES-1/2026', expedienteUPCI: 'UPCI-1', fractionCode: FRAC, countryOfOrigin: 'CN', productDesc: 'x',
    rateType: 'percentage', rate: 30, rateUnit: '%', status: 'vigente', investigationType: 'nueva', publishDateDOF: '2026-01-10T00:00:00.000Z', effectiveDate: '2026-01-11T00:00:00.000Z', expiryDate: '2031-01-10T00:00:00.000Z',
    dofUrl: null, notes: null, specificProducer: null,
    exportadorTasas: [{ empresa: 'Zhejiang Fastener Co., Ltd.', tasa: 12.5 }, { empresa: 'Ningbo Bolts Manufacturing', tasa: 7 }],
    ...over,
  },
  calculatedAmountUSD: null, calculation: '', severity: 'medium', expiringSoon: false, daysToExpiry: 1000, appliesToOperation: false, matchType: 'exact', matchedFraction: FRAC,
});

(async () => {
  console.log('— tasa por exportador vs general (puro) —');
  await prueba('elegirCuotaAplicable: empresa coincide (normalizada) → su tasa; no coincide → general y lo dice; sin lista → general_sin_lista', () => {
    const a = elegirCuotaAplicable([duty()], 'ZHEJIANG FASTENER CO LTD', { valueUSD: 1000 })!;
    assert.equal(a.tasa.origen, 'exportador'); assert.equal(a.tasa.tasa, 12.5); assert.equal(a.montoUSD, 125); assert.match(a.calculo, /tasa de Zhejiang/);
    const b = elegirCuotaAplicable([duty()], 'Otra Empresa SA de CV', { valueUSD: 1000 })!;
    assert.equal(b.tasa.origen, 'general'); assert.equal(b.tasa.tasa, 30); assert.equal(b.montoUSD, 300); assert.match(b.calculo, /no tiene tasa específica/);
    const c = elegirCuotaAplicable([duty({ exportadorTasas: null })], 'Zhejiang')!;
    assert.equal(c.tasa.origen, 'general_sin_lista');
    assert.equal(elegirCuotaAplicable([], 'x'), null);
  });
  await prueba('#21 exportador: fragmento de UNA palabra o que engancha varias filas NO elige tasa ajena → general con aviso; ≥2 palabras y hit único sí', () => {
    const lista = [{ empresa: 'Tianjin Pipe Co., Ltd.', tasa: 5 }, { empresa: 'Tianjin Steel Group', tasa: 9 }, { empresa: 'ABC', tasa: 1 }];
    // "TIANJIN" (1 palabra) contenido en dos filas: antes tomaba Tianjin Pipe (5 %).
    const t = resolverTasaPorExportador({ rate: 30, rateUnit: '%', exportadorTasas: lista, specificProducer: null }, 'TIANJIN');
    assert.equal(t.origen, 'general'); assert.equal(t.tasa, 30); assert.match(t.aviso ?? '', /fragmento|coincide/);
    // Fila corta "ABC" contenida en cualquier exportador: NO engancha.
    const abc = resolverTasaPorExportador({ rate: 30, rateUnit: '%', exportadorTasas: lista, specificProducer: null }, 'ABCDEF TRADING LIMITED');
    assert.equal(abc.origen, 'general'); assert.equal(abc.tasa, 30);
    // "TIANJIN STEEL" (2 palabras, hit único) → 9 %.
    const ok = resolverTasaPorExportador({ rate: 30, rateUnit: '%', exportadorTasas: lista, specificProducer: null }, 'Tianjin Steel');
    assert.equal(ok.origen, 'exportador'); assert.equal(ok.tasa, 9);
    // Igualdad normalizada exacta siempre gana.
    const eq = resolverTasaPorExportador({ rate: 30, rateUnit: '%', exportadorTasas: lista, specificProducer: null }, 'abc');
    assert.equal(eq.origen, 'exportador'); assert.equal(eq.tasa, 1);
    // El aviso llega al cálculo visible.
    const e = elegirCuotaAplicable([duty({ exportadorTasas: lista })], 'TIANJIN', { valueUSD: 100 })!;
    assert.equal(e.tasa.tasa, 30); assert.match(e.calculo, /fragmento|coincide/);
  });
  await prueba('fundamento: resolución, DOF, cotejo pendiente sin cotejadoAt / cotejada con él; esAntielusion por bandera o investigationType', () => {
    const p = elegirCuotaAplicable([duty()], null)!;
    assert.equal(p.fundamento.resolucion, 'RES-1/2026'); assert.equal(p.fundamento.fechaDOF, '2026-01-10'); assert.equal(p.fundamento.cotejo, 'pendiente'); assert.equal(p.esAntielusion, false);
    const c = elegirCuotaAplicable([duty()], null, { cotejadoAt: '2026-08-27T00:00:00Z', fuenteUrl: 'https://dof.gob.mx/x', esAntielusion: true })!;
    assert.equal(c.fundamento.cotejo, 'cotejada'); assert.equal(c.fundamento.fuenteUrl, 'https://dof.gob.mx/x'); assert.equal(c.esAntielusion, true);
    assert.equal(elegirCuotaAplicable([duty({ investigationType: 'elusion' })], null)!.esAntielusion, true);
    assert.equal(elegirCuotaAplicable([duty(), duty({ id: 'd2' })], null)!.otras, 1);
  });
  await prueba('Pre-Glosa (cruceCuotaExportador) usa la misma elección que el Cotizador', () => {
    const cruce = cruceCuotaExportador({ fractionCode: FRAC, countryOrigin: 'CN', regimenCode: 'IMD', exportadorNombre: 'Ningbo Bolts', declaresAntidumping: false } as never, { fraccion: null, cuotas: [duty()], precioEstimado: undefined } as never);
    assert.equal(cruce.estado, 'evaluado');
    assert.equal((cruce.datos as { tasa: number }).tasa, 7);
    assert.equal(elegirCuotaAplicable([duty()], 'Ningbo Bolts')!.tasa.tasa, 7);
  });

  console.log('— importación UPCI: validación (puro) —');
  await prueba('parsearExportadorTasas: "Empresa=tasa; Empresa=tasa unidad"', () => {
    const r = parsearExportadorTasas('Empresa A Co Ltd=1.25; Empresa B: 0,90 USD/kg', '%');
    assert.equal(r.error, null); assert.equal(r.lista.length, 2); assert.equal(r.lista[0]!.tasa, 1.25); assert.equal(r.lista[0]!.rateUnit, '%'); assert.equal(r.lista[1]!.rateUnit, 'USD/kg');
    assert.ok(parsearExportadorTasas('sin igual', '%').error);
    assert.equal(parsearExportadorTasas('', '%').lista.length, 0);
  });
  await prueba('validarFilaUPCI: obligatorios, tipos, fechas; cotejada SOLO con fuenteUrl http(s)', () => {
    const ok = validarFilaUPCI({ resolutionNumber: 'R-1', fractionCode: '7318.15.99', countryOfOrigin: 'China', rateType: 'specific_USD_kg', rate: '2.07', rateUnit: 'USD/kg', publishDateDOF: '2024-03-15', expiryDate: '2029-03-15' }, 2);
    assert.equal(ok.ok, true, ok.errores.join(';')); assert.equal(ok.cotejo, 'pendiente'); assert.equal(ok.data!.countryOfOrigin, 'CN'); assert.equal(ok.clave, '73181599|CN|R-1');
    const cot = validarFilaUPCI({ resolutionNumber: 'R-1', fractionCode: '73181599', countryOfOrigin: 'CN', rate: 10, fuenteUrl: 'https://www.dof.gob.mx/x' }, 3);
    assert.equal(cot.cotejo, 'cotejada');
    const mal = validarFilaUPCI({ fractionCode: '123', countryOfOrigin: '', rateType: 'x', rate: 'abc', status: 'muerta', investigationType: 'z', publishDateDOF: '15/03', fuenteUrl: 'dof', exportadorTasas: 'nada' }, 4);
    assert.equal(mal.ok, false); assert.ok(mal.errores.length >= 8, mal.errores.join(' | '));
    assert.ok(validarFilaUPCI({ resolutionNumber: 'R', fractionCode: '73181599', countryOfOrigin: 'CN', rate: 1, effectiveDate: '2025-01-01', expiryDate: '2024-01-01' }, 5).errores.some(e => /anterior/.test(e)));
    assert.equal(validarFilaUPCI({ resolutionNumber: 'R', fractionCode: '73181599', countryOfOrigin: 'VN', rate: 1, investigationType: 'elusion' }, 6).data!.esAntielusion, true);
  });
  await prueba('plantilla descargable: hoja cuotas con las columnas documentadas + hoja instrucciones', () => {
    const wb = XLSX.read(plantillaUPCIXlsx(), { type: 'buffer' });
    assert.deepEqual(wb.SheetNames, ['cuotas', 'instrucciones']);
    const filas = leerFilasUPCI(plantillaUPCIXlsx().toString('base64'), 'p.xlsx');
    assert.equal(filas.length, 1); assert.equal(filas[0]!.resolutionNumber, 'EJEMPLO-BORRAR');
    assert.ok('exportadorTasas' in filas[0]! && 'fuenteUrl' in filas[0]! && 'examenSunsetFecha' in filas[0]!);
  });

  console.log('— con DB —');
  const tenant = await prisma.tenant.create({ data: { name: `Test ${SUFIJO}`, status: 'ACTIVE' } });
  const otro = await prisma.tenant.create({ data: { name: `Otro ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `u-${SUFIJO}@test.local`, name: 'U', password: 'x', role: 'ADMIN', emailVerified: true } });
  const cliente = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `CU${SUFIJO}`.replace(/[^A-Z0-9]/gi, '').slice(0, 13).toUpperCase(), razonSocial: 'Cliente Cuotas' } });
  const limpiar = async () => {
    await prisma.alert.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.temporaryImport.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otro.id] } } });
    await prisma.antidumpingDuty.deleteMany({ where: { resolutionNumber: { startsWith: RES } } });
  };
  const xlsxB64 = (filas: Record<string, unknown>[]) => {
    const ws = XLSX.utils.json_to_sheet(filas); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'c');
    return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
  };
  try {
    await prueba('importarUPCI: crea con cotejadoAt solo si hay fuente; dedupe por (fracción, país, resolución) actualiza sin borrar cotejo previo; dryRun no escribe', async () => {
      const base = { fractionCode: FRAC, countryOfOrigin: 'CN', rateType: 'percentage', rate: 30, rateUnit: '%', publishDateDOF: '2026-01-10', effectiveDate: '2026-01-11', expiryDate: '2031-01-10', exportadorTasas: 'Zhejiang Fastener Co Ltd=12.5; Ningbo Bolts Manufacturing=7', examenSunsetFecha: '2030-07-10' };
      const dry = await importarUPCI({ archivoBase64: xlsxB64([{ ...base, resolutionNumber: `${RES}-A` }]), nombreArchivo: 'c.xlsx', dryRun: true });
      assert.equal(dry.validas, 1); assert.equal(dry.creadas, 0);
      assert.equal(await prisma.antidumpingDuty.count({ where: { resolutionNumber: `${RES}-A` } }), 0);
      const r1 = await importarUPCI({ archivoBase64: xlsxB64([
        { ...base, resolutionNumber: `${RES}-A`, fuenteUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=1' },
        { ...base, resolutionNumber: `${RES}-B`, countryOfOrigin: 'VN', investigationType: 'elusion', rate: 30, exportadorTasas: '' },
        { ...base, resolutionNumber: `${RES}-A` }, // duplicada en archivo
        { ...base, resolutionNumber: '', rate: 'x' }, // inválida
      ]), nombreArchivo: 'c.xlsx' });
      assert.equal(r1.creadas, 2); assert.equal(r1.invalidas, 2); assert.equal(r1.duplicadasEnArchivo, 1); assert.equal(r1.cotejadas, 1); assert.equal(r1.pendientesCotejo, 1);
      const a = await prisma.antidumpingDuty.findFirst({ where: { resolutionNumber: `${RES}-A` } });
      const b = await prisma.antidumpingDuty.findFirst({ where: { resolutionNumber: `${RES}-B` } });
      assert.ok(a!.cotejadoAt); assert.equal(b!.cotejadoAt, null); assert.equal(b!.esAntielusion, true);
      assert.equal((a!.exportadorTasas as unknown[]).length, 2); assert.equal(a!.examenSunsetFecha!.toISOString().slice(0, 10), '2030-07-10');
      // Re-importar A sin fuente: actualiza (rate 35) y conserva el cotejo previo; no crea otra fila
      const r2 = await importarUPCI({ archivoBase64: xlsxB64([{ ...base, resolutionNumber: `${RES}-a`, rate: 35 }]), nombreArchivo: 'c.xlsx' });
      assert.equal(r2.actualizadas, 1); assert.equal(r2.creadas, 0);
      const a2 = await prisma.antidumpingDuty.findFirst({ where: { resolutionNumber: { equals: `${RES}-A`, mode: 'insensitive' } } });
      assert.equal(a2!.rate, 35); assert.ok(a2!.cotejadoAt);
      assert.equal(await prisma.antidumpingDuty.count({ where: { resolutionNumber: { startsWith: RES } } }), 2);
    });
    await prueba('buscarCuotaAplicable (DB): tasa por exportador con fundamento cotejado; fracción sin cuota → null', async () => {
      const r = await buscarCuotaAplicable({ fractionCode: '9999.99.01', countryOfOrigin: 'China', exportador: 'NINGBO BOLTS MANUFACTURING CO., LTD.', valueUSD: 2000 });
      assert.ok(r); assert.equal(r!.tasa.origen, 'exportador'); assert.equal(r!.tasa.tasa, 7); assert.equal(r!.montoUSD, 140);
      assert.equal(r!.fundamento.cotejo, 'cotejada'); assert.equal(r!.fundamento.resolucion!.toUpperCase(), `${RES}-A`.toUpperCase()); assert.equal(r!.vigencia.examenSunsetFecha, '2030-07-10');
      const g = await buscarCuotaAplicable({ fractionCode: FRAC, countryOfOrigin: 'CN' });
      assert.equal(g!.tasa.origen, 'general'); assert.equal(g!.tasa.tasa, 35);
      const vn = await buscarCuotaAplicable({ fractionCode: FRAC, countryOfOrigin: 'VN' });
      assert.equal(vn!.esAntielusion, true); assert.equal(vn!.fundamento.cotejo, 'pendiente'); assert.equal(vn!.tasa.origen, 'general_sin_lista');
      assert.equal(await buscarCuotaAplicable({ fractionCode: '99999902', countryOfOrigin: 'CN' }), null);
      assert.equal((await checkAntidumpingDuty({ fractionCode: FRAC, countryOfOrigin: 'CN' })).length, 1); // firma previa intacta
    });
    await prueba('coberturaCuotas: cuenta cotejadas vs pendientes y antielusión (honestidad visible)', async () => {
      const c = await coberturaCuotas();
      assert.ok(c.cotejadas >= 1); assert.ok(c.pendientesCotejo >= 1); assert.ok(c.antielusion >= 1); assert.equal(c.total, c.cotejadas + c.pendientesCotejo);
      assert.match(c.nota, /pendiente de cotejo/);
      assert.ok(c.porPais.find(p => p.pais === 'CN'));
    });

    console.log('— alerta de elusión —');
    await prisma.product.create({ data: { tenantId: tenant.id, clienteId: cliente.id, productCode: `P-${SUFIJO}`, description: 'Tornillo VN', unit: 'Pza', fractionCode: FRAC, paisOrigen: 'VN' } });
    await prisma.temporaryImport.create({ data: { tenantId: tenant.id, clienteId: cliente.id, pedimento: `PED-${SUFIJO}`.slice(0, 20), userId: user.id, fractionCode: FRAC, description: 'Tornillos', quantity: 100, unit: 'kg', customsValue: 10000, originCountry: 'Vietnam', entryDate: new Date(), expirationDate: new Date(Date.now() + 180 * 86400000) } as never });
    await prisma.product.create({ data: { tenantId: otro.id, productCode: `P-${SUFIJO}`, description: 'Tornillo CN', unit: 'Pza', fractionCode: FRAC, paisOrigen: 'CN' } });
    await prueba('exposicionDelTenant reúne catálogo + temporales por cliente con valor', async () => {
      const e = await exposicionDelTenant(tenant.id);
      const vn = e.find(x => x.fractionCode === FRAC && x.pais === 'VN')!;
      assert.ok(vn); assert.equal(vn.clienteId, cliente.id); assert.equal(vn.valorUSD, 10000); assert.deepEqual(vn.fuentes.sort(), ['catálogo', 'importaciones temporales']);
    });
    await prueba('detectarElusion: crea alerta tipo elusion con severidad por monto y fingerprint; segunda corrida no duplica; otro tenant (CN, no elusión) sin alerta', async () => {
      const r1 = await detectarElusion(tenant.id, { tipoCambioMXN: 18 });
      assert.equal(r1.cruces, 1); assert.equal(r1.alertas, 1);
      const r2 = await detectarElusion(tenant.id, { tipoCambioMXN: 18 });
      assert.equal(r2.alertas, 0); assert.equal(r2.existentes, 1);
      const b = await prisma.antidumpingDuty.findFirst({ where: { resolutionNumber: `${RES}-B` } });
      const al = await prisma.alert.findMany({ where: { tenantId: tenant.id, type: 'elusion' } });
      assert.equal(al.length, 1);
      assert.equal(al[0]!.fingerprint, fingerprintElusion(b!.id, FRAC, 'VN', cliente.id));
      assert.equal(al[0]!.estimatedImpactMXN, -54000); // 10000 × 30% × 18
      assert.equal(al[0]!.severity, 'medium'); // banda medio, sin urgencia
      assert.equal(al[0]!.clienteId, cliente.id); assert.equal(al[0]!.affectedFraction, FRAC);
      assert.match(al[0]!.content, /PENDIENTE DE COTEJO/);
      assert.equal((al[0]!.suggestedAction as { type: string }).type, 'revisar_fraccion');
      const ro = await detectarElusion(otro.id);
      assert.equal(ro.cruces, 0);
    });
  } finally {
    await limpiar();
  }

  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
