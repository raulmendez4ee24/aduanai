/**
 * Ola 2 — Cotizador como herramienta de venta (Operación 2026-08).
 *
 *   npm run test:cotizador
 *
 * Parte PURA (sin DB): DTA por tipo con fundamento o aviso pendiente, IEPS
 * aplica tasa cargada / 0 + nota sin tasa, cuota por exportador (armado),
 * tabulador con mínimo/máximo, validación de rangos nuevos, escenarios y
 * PATCH (validadores), computeQuoteAmounts con DTA fijo e IEPS específico.
 *
 * Parte DB (base local; crea y borra sus propios tenants): duplicar crea
 * versión encadenada, lista filtra por cliente, multi-tenant, IEPS desde
 * IEPSRate, cuota automática por país y por exportador (duty temporal),
 * tcFechaDOF persistido (null con TC manual; fecha con TC oficial).
 */
import { strict as assert } from 'node:assert';
import { computeQuoteAmounts } from '../services/quoter';
import { CATALOGO_DTA, resolverDTA, verificarDTAContraTexto } from '../lib/dta';
import { aplicarTasaIEPS, NOTA_SIN_TASA, resolverIEPS } from '../services/cotizador-ieps';
import { armarCuotaAutomatica, resolverCuotaAutomatica } from '../services/cotizador-cuotas';
import { calcularHonorarios, validarReglas, type ReglaHonorarios } from '../services/tabulador-honorarios';
import { validarVariantes, validarPatch, resumirEscenarios, ESCENARIOS_VENTA } from '../services/cotizaciones';
import { validarRangosQuoteSimple, validarRangosMultiQuote } from '../routes/quote';
import type { AntidumpingCheckResult } from '../services/antidumping';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

const TEXTO_LFD = `Artículo 49.- I. Del 8 al millar, sobre el valor ... II. Del 1.76 al millar sobre el valor ... III. ... (Industria Manufacturera, Maquiladora y de Servicios de Exportación IMMEX): $461.61 ... IV. ... por cada operación: $461.61 V.- En las operaciones de exportación: $462.86 ... a) De tránsito interno: $461.61 b) De tránsito internacional: $438.36 ... e) Por cada rectificación de pedimento: $444.42`;

async function partePura(): Promise<void> {
  console.log('— DTA por tipo de operación (Art. 49 LFD) —');
  await prueba('catálogo: general 8 al millar, AF 1.76 al millar, IN/tratado cuota fija con fracción del Art. 49', () => {
    const g = resolverDTA('general'); assert.equal(g.dtaPct, 0.8); assert.equal(g.base, 'millar'); assert.equal(g.fraccionArt49, 'I');
    const af = resolverDTA('activo_fijo_immex'); assert.equal(af.dtaPct, 0.176); assert.equal(af.fraccionArt49, 'II');
    const inn = resolverDTA('temporal_immex'); assert.equal(inn.base, 'fija'); assert.equal(inn.montoFijoMXN, 461.61); assert.equal(inn.dtaPct, 0);
    const tr = resolverDTA('tratado'); assert.equal(tr.montoFijoMXN, 461.61); assert.equal(tr.fraccionArt49, 'IV');
    assert.match(g.fundamento, /Art\. 49/);
  });
  await prueba('sin corpus: todo queda cotejo=pendiente y el aviso lo dice', () => {
    const cat = verificarDTAContraTexto(null);
    assert.ok(cat.every(e => e.cotejo === 'pendiente'));
    const r = resolverDTA('temporal_immex', cat);
    assert.equal(r.cotejo, 'pendiente'); assert.match(r.aviso ?? '', /pendiente de fuente oficial/);
  });
  await prueba('con corpus (resumen): montos hallados → cotejo=corpus con aviso de cotejo formal pendiente; no hallados → pendiente', () => {
    const cat = verificarDTAContraTexto(TEXTO_LFD);
    assert.equal(cat.find(e => e.tipo === 'general')!.cotejo, 'corpus');
    assert.equal(cat.find(e => e.tipo === 'temporal_immex')!.cotejo, 'corpus');
    assert.equal(cat.find(e => e.tipo === 'transito_internacional')!.cotejo, 'corpus');
    const catParcial = verificarDTAContraTexto('Del 8 al millar y nada más');
    assert.equal(catParcial.find(e => e.tipo === 'general')!.cotejo, 'corpus');
    assert.equal(catParcial.find(e => e.tipo === 'exportacion')!.cotejo, 'pendiente');
    assert.match(resolverDTA('general', cat).aviso ?? '', /cotejo formal contra DOF pendiente/);
  });
  await prueba('con corpus verbatim cotejado → verificado y sin aviso', () => {
    const cat = verificarDTAContraTexto(TEXTO_LFD, { verbatimCotejado: true });
    assert.equal(resolverDTA('general', cat).cotejo, 'verificado');
    assert.equal(resolverDTA('general', cat).aviso, null);
  });
  await prueba('tipo desconocido cae a general; el catálogo no muta', () => {
    assert.equal(resolverDTA(undefined).tipo, 'general');
    assert.ok(CATALOGO_DTA.every(e => e.cotejo === 'pendiente'), 'verificarDTAContraTexto no muta el catálogo base');
  });
  await prueba('computeQuoteAmounts: DTA fijo sustituye al millar y entra a la base del IVA', () => {
    const a = computeQuoteAmounts({ valueUSD: 1000, exchangeRate: 20, rates: { igiPct: 0, dtaAbsoluteMXN: 461.61 } });
    assert.equal(a.dta, 461.61); assert.equal(a.baseIVA, 20461.61); assert.equal(a.iva, 3273.86);
    const b = computeQuoteAmounts({ valueUSD: 1000, exchangeRate: 20, rates: { igiPct: 0, dtaAbsoluteMXN: 0 } });
    assert.equal(b.dta, 0, 'dtaAbsoluteMXN=0 (partida 2+ en cuota fija) → 0');
  });

  console.log('— IEPS por categoría —');
  await prueba('sin tasa cargada → 0 + nota exacta', () => {
    const r = aplicarTasaIEPS(null, { quantity: 10 });
    assert.equal(r.aplica, false); assert.equal(r.pct, 0); assert.equal(r.montoEspecificoMXN, 0);
    assert.equal(r.nota, NOTA_SIN_TASA); assert.equal(r.cotejo, 'sin_tasa');
  });
  await prueba('ad valorem 53% (tequila) → pct 53 y etiqueta sin_verificar (siembra sin cotejo)', () => {
    const r = aplicarTasaIEPS({ fractionCode: '2208', matchType: 'prefix', productCategory: 'alcohol', rate: 53, rateType: 'ad_valorem', unit: '%', description: 'Destiladas', decree: null, notes: null, effectiveDate: new Date('2026-01-01'), expiryDate: null }, {});
    assert.equal(r.pct, 53); assert.equal(r.cotejo, 'sin_verificar'); assert.match(r.nota, /sin cotejo/); assert.match(r.nota, /prefijo 2208/);
    const a = computeQuoteAmounts({ valueUSD: 100, exchangeRate: 10, rates: { igiPct: 20, dtaPct: 0.8, iepsPct: 53 } });
    assert.equal(a.ieps, 640.24); // (1000 + 200 + 8) × 0.53
  });
  await prueba('específica MXN/L → monto por cantidad; sin cantidad → 0 y pide cantidad', () => {
    // Parte A: "verificado" SOLO con cotejadoPor + fechaCotejo explícitos; la
    // palabra "cotejado" en notes (o "no cotejado") ya no decide.
    const t = { fractionCode: '22021000', matchType: 'exact', productCategory: 'soda', rate: 1.6451, rateType: 'specific', unit: 'MXN/L', description: null, decree: null, notes: 'cotejado DOF', effectiveDate: new Date('2026-01-01'), expiryDate: null };
    const r = aplicarTasaIEPS(t, { quantity: 1000, unit: 'litros' });
    assert.equal(r.montoEspecificoMXN, 1645.1); assert.equal(r.pct, 0); assert.equal(r.cotejo, 'sin_verificar', 'notes "cotejado DOF" no basta');
    assert.equal(aplicarTasaIEPS({ ...t, notes: 'no cotejado' }, { quantity: 1 }).cotejo, 'sin_verificar');
    const rv = aplicarTasaIEPS({ ...t, cotejadoPor: 'auditor', fechaCotejo: new Date('2026-08-01') }, { quantity: 1000, unit: 'litros' });
    assert.equal(rv.cotejo, 'verificado'); assert.match(rv.nota, /cotejada contra LIEPS\/DOF por auditor el 2026-08-01/);
    assert.equal(aplicarTasaIEPS({ ...t, cotejadoPor: 'auditor' }, { quantity: 1 }).cotejo, 'sin_verificar', 'sin fechaCotejo no es verificado');
    const a = computeQuoteAmounts({ valueUSD: 100, exchangeRate: 10, rates: { igiPct: 0, dtaPct: 0, iepsAbsoluteMXN: 1645.1 } });
    assert.equal(a.ieps, 1645.1); assert.equal(a.baseIVA, 2645.1);
    const r0 = aplicarTasaIEPS(t, { quantity: 0 });
    assert.equal(r0.montoEspecificoMXN, 0); assert.match(r0.nota, /declara cantidad/);
  });

  console.log('— Cuota compensatoria automática —');
  const dutyBase: AntidumpingCheckResult = {
    duty: { id: 'x', resolutionType: 'definitiva', resolutionNumber: 'RES-TEST/2026', expedienteUPCI: null, fractionCode: '73181599', countryOfOrigin: 'CN', productDesc: 'Tornillos', rateType: 'percentage', rate: 30, rateUnit: '%', status: 'vigente', investigationType: null, publishDateDOF: null, effectiveDate: '2025-01-01T00:00:00.000Z', expiryDate: '2030-01-01T00:00:00.000Z', dofUrl: null, notes: null, exportadorTasas: [{ empresa: 'Ningbo Fasteners Co., Ltd.', tasa: 12 }, { empresa: 'Zhejiang Bolts', tasa: 18.5, rateUnit: '%' }], specificProducer: null },
    calculatedAmountUSD: null, calculation: '', severity: 'medium', expiringSoon: false, daysToExpiry: 900, appliesToOperation: false, matchType: 'exact', matchedFraction: '73181599',
  };
  await prueba('sin exportador → tasa general 30% y advertencia de que hay tasas por empresa', () => {
    const c = armarCuotaAutomatica(dutyBase, {});
    assert.equal(c.match.rate, 30); assert.equal(c.tasa.origen, 'general');
    assert.ok(c.advertencias.some(a => /captura el exportador/.test(a)));
    assert.match(c.vigencia, /vigente desde 2025-01-01 hasta 2030-01-01/);
  });
  await prueba('exportador que coincide (normalizado) → tasa de la empresa 12%', () => {
    const c = armarCuotaAutomatica(dutyBase, { exportador: 'NINGBO FASTENERS' });
    assert.equal(c.match.rate, 12); assert.equal(c.tasa.origen, 'exportador'); assert.equal(c.tasa.empresa, 'Ningbo Fasteners Co., Ltd.');
  });
  await prueba('exportador que NO coincide → general 30% y lo dice', () => {
    const c = armarCuotaAutomatica(dutyBase, { exportador: 'Otra Empresa SA de CV' });
    assert.equal(c.match.rate, 30); assert.ok(c.advertencias.some(a => /no está en la lista/.test(a)));
  });
  await prueba('esAntielusion → advertencia visible; múltiples coincidencias → aviso', () => {
    const c = armarCuotaAutomatica(dutyBase, { esAntielusion: true, coincidencias: 2 });
    assert.equal(c.esAntielusion, true);
    assert.ok(c.advertencias.some(a => /ANTIELUSIÓN/.test(a)));
    assert.ok(c.advertencias.some(a => /2 resoluciones vigentes/.test(a)));
  });

  console.log('— Tabulador de honorarios —');
  const reglas: ReglaHonorarios[] = [
    { tipoOperacion: 'general', base: 'porcentaje', valor: 0.45, minimo: 2500, maximo: 15000 },
    { tipoOperacion: 'temporal_immex', base: 'fijo', valor: 1800 },
    { tipoOperacion: '*', base: 'millar', valor: 3, minimo: 1000 },
  ];
  await prueba('porcentaje con mínimo y máximo', () => {
    assert.equal(calcularHonorarios(reglas, { tipoOperacion: 'general', valorMXN: 1_000_000 }).monto, 4500);
    assert.equal(calcularHonorarios(reglas, { tipoOperacion: 'general', valorMXN: 100_000 }).monto, 2500, 'mínimo');
    assert.equal(calcularHonorarios(reglas, { tipoOperacion: 'general', valorMXN: 10_000_000 }).monto, 15000, 'máximo');
  });
  await prueba('fijo por tipo; comodín * al millar con mínimo; sin regla → 0 y detalle', () => {
    assert.equal(calcularHonorarios(reglas, { tipoOperacion: 'temporal_immex', valorMXN: 5_000_000 }).monto, 1800);
    assert.equal(calcularHonorarios(reglas, { tipoOperacion: 'exportacion', valorMXN: 2_000_000 }).monto, 6000);
    assert.equal(calcularHonorarios(reglas, { tipoOperacion: 'exportacion', valorMXN: 100 }).monto, 1000);
    const sin = calcularHonorarios([reglas[1]!], { tipoOperacion: 'general', valorMXN: 100 });
    assert.equal(sin.monto, 0); assert.equal(sin.regla, null); assert.match(sin.detalle, /Sin regla/);
  });
  await prueba('validarReglas: rechaza tipo inválido, base inválida, porcentaje >100, mínimo > máximo; acepta y normaliza', () => {
    assert.throws(() => validarReglas([{ tipoOperacion: 'x', base: 'fijo', valor: 1 }]));
    assert.throws(() => validarReglas([{ tipoOperacion: 'general', base: 'raro', valor: 1 }]));
    assert.throws(() => validarReglas([{ tipoOperacion: 'general', base: 'porcentaje', valor: 150 }]));
    assert.throws(() => validarReglas([{ tipoOperacion: 'general', base: 'fijo', valor: 1, minimo: 10, maximo: 5 }]));
    assert.throws(() => validarReglas([]));
    const ok = validarReglas([{ tipoOperacion: '*', base: 'millar', valor: '2.5', minimo: '', maximo: 9000 }]);
    assert.deepEqual(ok, [{ tipoOperacion: '*', base: 'millar', valor: 2.5, maximo: 9000 }]);
  });

  console.log('— Validación de rangos (campos nuevos) —');
  await prueba('quote simple: tipoOperacion del catálogo y exportador acotado', () => {
    assert.equal(validarRangosQuoteSimple({ customsValue: 100, tipoOperacion: 'temporal_immex', exportador: 'ACME' }), null);
    assert.ok(validarRangosQuoteSimple({ customsValue: 100, tipoOperacion: 'IN' }));
    assert.ok(validarRangosQuoteSimple({ customsValue: 100, exportador: 'x'.repeat(161) }));
    assert.equal(validarRangosQuoteSimple({ customsValue: 12500 }), null, 'regresión test:quote-rangos');
  });
  await prueba('multi: tipoOperacion, tabuladorId, exportador; honorarios siguen acotados', () => {
    const base = { items: [{ fractionCode: '73181599', countryOfOrigin: 'CN', quantity: 1, unitValueUSD: 100 }] };
    assert.equal(validarRangosMultiQuote({ ...base, tipoOperacion: 'tratado', tabuladorId: 'abc' }), null);
    assert.ok(validarRangosMultiQuote({ ...base, tipoOperacion: 'nope' as never }));
    assert.ok(validarRangosMultiQuote({ ...base, tabuladorId: 'x'.repeat(65) }));
    assert.ok(validarRangosMultiQuote({ items: [{ ...base.items[0]!, exportador: 'x'.repeat(161) }] }));
    assert.ok(validarRangosMultiQuote({ ...base, dispatch: { honorariosAgente: -1 } }));
  });
  await prueba('escenarios: plantilla de venta válida; rechaza >10, sin nombre, tratado inválido, TC fuera de rango', () => {
    assert.equal(validarVariantes(ESCENARIOS_VENTA).error, null);
    assert.equal(validarVariantes(ESCENARIOS_VENTA).variants.length, 3);
    assert.ok(validarVariantes(Array(11).fill({ name: 'x' })).error);
    assert.ok(validarVariantes([{ name: '' }]).error);
    assert.ok(validarVariantes([{ name: 'a', treatyOverride: 'NAFTA' }]).error);
    assert.ok(validarVariantes([{ name: 'a', exchangeRateOverride: 500 }]).error);
    assert.ok(validarVariantes([{ name: 'a', tipoOperacionOverride: 'IN' }]).error);
  });
  await prueba('PATCH: nombre/notas/vigencia/escenarios validados', () => {
    assert.equal(validarPatch({ name: 'Embarque', notas: 'ok', vigenciaHasta: '2026-12-31' }).error, null);
    assert.ok(validarPatch({ vigenciaHasta: 'ayer' }).error);
    assert.ok(validarPatch({ notas: 'x'.repeat(4001) }).error);
    assert.ok(validarPatch({ escenarios: { escenarios: [{ name: 'a' }] } }).error);
    assert.equal(validarPatch({ escenarios: { calculadoEn: 'x', base: {}, escenarios: [{ name: 'a', totalAll: 1 }] } }).error, null);
    assert.equal(validarPatch({ vigenciaHasta: null }).data.vigenciaHasta, null);
  });
  await prueba('resumirEscenarios guarda totales + delta + variante, no el resultado completo', () => {
    const tot = (n: number) => ({ totals: { totalAll: n, totalLandedCost: n, totalDuties: 0, igi: 0, dta: 0, countervailing: 0, ieps: 0, iva: 0, valueMXN: 0, isan: 0, totalDispatch: 0 }, alertas: ['a'] });
    const r = resumirEscenarios({ base: tot(100) as never, scenarios: [{ name: 'X', result: tot(120) as never, deltaMXN: 20, deltaPct: 20 }] }, [{ name: 'X', countryOverride: 'US' }]);
    assert.equal(r.escenarios[0]!.deltaMXN, 20); assert.equal(r.escenarios[0]!.variant.countryOverride, 'US'); assert.equal(r.base.totalAll, 100);
    assert.ok(!('items' in r.escenarios[0]!));
  });
}

async function parteDB(): Promise<void> {
  const { prisma } = await import('../lib/prisma');
  const { duplicarCotizacion, listarCotizaciones, obtenerCotizacion, actualizarCotizacion, exportarCotizacionXlsx } = await import('../services/cotizaciones');
  const { calculateMultiQuote } = await import('../services/quoter-multi');
  const { honorariosDesdeTabulador } = await import('../services/tabulador-honorarios');
  const marca = `ola2-${Date.now().toString(36)}`;
  const tA = `t-${marca}-a`, tB = `t-${marca}-b`;
  let dutyId: string | null = null;
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    console.log('— DB no disponible: se omite la parte con base de datos —');
    return;
  }
  try {
    await prisma.tenant.create({ data: { id: tA, name: 'Agencia Ola2 A', rfc: 'AOA010203AB1' } });
    await prisma.tenant.create({ data: { id: tB, name: 'Agencia Ola2 B', rfc: null } });
    const uA = (await prisma.user.create({ data: { email: `ua-${marca}@test.local`, password: 'x', name: 'uA', role: 'ADMIN', tenantId: tA, active: true } })).id;
    const uB = (await prisma.user.create({ data: { email: `ub-${marca}@test.local`, password: 'x', name: 'uB', role: 'ADMIN', tenantId: tB, active: true } })).id;
    const c1 = await prisma.cliente.create({ data: { tenantId: tA, rfc: 'CLI010101AA1', razonSocial: 'Cliente Uno Ola2' } });
    const c2 = await prisma.cliente.create({ data: { tenantId: tA, rfc: 'CLI020202BB2', razonSocial: 'Cliente Dos Ola2' } });

    const mkQuote = (tenantId: string, userId: string, clienteId: string | null, name: string) => prisma.quote.create({
      data: {
        tenantId, userId, clienteId, name, fractionCode: '73181599', customsValue: 1000, origin: 'CN', incoterm: 'CIF', currency: 'USD', status: 'approved',
        result: JSON.stringify({ totals: { totalAll: 100 }, items: [], input: { items: [{ fractionCode: '73181599', countryOfOrigin: 'CN', quantity: 10, unitValueUSD: 100 }], dispatch: { honorariosAgente: 500 } } }),
        totalAll: 100, honorariosAgente: 500,
        items: { create: [{ numeroPartida: 1, fractionCode: '73181599', countryOfOrigin: 'CN', quantity: 10, unitValueUSD: 100, totalValueUSD: 1000, customsValueUSD: 1000, customsValueMXN: 18000, igiRate: 35, igi: 6300, dta: 144, iva: 3911, totalDuties: 10355, totalCost: 28355 }] },
      },
    });
    const q1 = await mkQuote(tA, uA, c1.id, 'Cotización cliente uno');
    const q2 = await mkQuote(tA, uA, c2.id, 'Cotización cliente dos');
    await mkQuote(tB, uB, null, 'Cotización de otro tenant');

    console.log('— DB: guardar / duplicar / listar —');
    await prueba('duplicar crea versión 2 encadenada (parentQuoteId, mismo contenido, items copiados) y luego versión 3', async () => {
      const v2 = await duplicarCotizacion(tA, q1.id, uA, { puedeAprobar: false });
      assert.equal(v2.version, 2); assert.equal(v2.parentQuoteId, q1.id); assert.equal(v2.status, 'pending_approval');
      assert.equal(v2.items.length, 1); assert.equal(v2.items[0]!.fractionCode, '73181599'); assert.equal(v2.clienteId, c1.id);
      const v3 = await duplicarCotizacion(tA, v2.id, uA, { puedeAprobar: true, nombre: 'v3 ajustada' });
      assert.equal(v3.version, 3); assert.equal(v3.parentQuoteId, v2.id); assert.equal(v3.name, 'v3 ajustada');
      const c = await obtenerCotizacion(tA, q1.id);
      assert.deepEqual(c.versiones.map(v => v.version), [1, 2, 3]);
      assert.match(c.folio, /^Q-\d{4}-\d{4}$/);
      assert.equal(c.input.items[0]!.quantity, 10, 'input reconstruido desde result.input');
      assert.equal(c.agencia.rfc, 'AOA010203AB1');
    });
    await prueba('lista filtra por cliente, por nombre y pagina', async () => {
      const todas = await listarCotizaciones(tA, {});
      assert.equal(todas.total, 4);
      const uno = await listarCotizaciones(tA, { clienteId: c1.id });
      assert.equal(uno.total, 3); assert.ok(uno.filas.every(f => f.clienteId === c1.id));
      assert.equal(uno.filas[0]!.clienteRazonSocial, 'Cliente Uno Ola2');
      const dos = await listarCotizaciones(tA, { cliente: 'Dos' });
      assert.equal(dos.total, 1); assert.equal(dos.filas[0]!.id, q2.id);
      const nom = await listarCotizaciones(tA, { nombre: 'v3' });
      assert.equal(nom.total, 1);
      const pag = await listarCotizaciones(tA, { page: 2, pageSize: 3 });
      assert.equal(pag.filas.length, 1);
    });
    await prueba('alcance por cliente (revisión A): restringido a c1 no ve/edita/duplica/exporta la cotización de c2; {in} sí la ve; mover a cliente fuera del alcance → 403', async () => {
      // El alcance es lo que `alcanceDe(req)` manda desde la ruta (string | {in} | null).
      await assert.rejects(obtenerCotizacion(tA, q2.id, c1.id), /no encontrada/);
      await assert.rejects(actualizarCotizacion(tA, q2.id, { name: 'hack' }, c1.id), /no encontrada/);
      await assert.rejects(duplicarCotizacion(tA, q2.id, uA, { puedeAprobar: true }, c1.id), /no encontrada/);
      await assert.rejects(exportarCotizacionXlsx(tA, q2.id, c1.id), /no encontrada/);
      assert.equal((await obtenerCotizacion(tA, q1.id, c1.id)).id, q1.id);
      assert.equal((await obtenerCotizacion(tA, q2.id, { in: [c1.id, c2.id] })).id, q2.id);
      await assert.rejects(actualizarCotizacion(tA, q1.id, { clienteId: c2.id }, c1.id), (e: unknown) => (e as { statusCode?: number }).statusCode === 403);
      assert.equal((await prisma.quote.findFirst({ where: { id: q1.id, tenantId: tA } }))!.clienteId, c1.id, 'no se movió');
    });
    await prueba('exchange-rate/seed-history y /refresh: requireRole(SUPERADMIN) rechaza a ADMIN con 403 (middleware montado en routes/quote.ts)', async () => {
      const { requireRole } = await import('../middlewares/auth');
      const mw = requireRole('SUPERADMIN');
      const corre = (userRole: string) => new Promise<unknown>((resolve) => { mw({ userRole } as never, {} as never, (err?: unknown) => resolve(err)); });
      const denegado = await corre('ADMIN');
      assert.equal((denegado as { statusCode?: number }).statusCode, 403);
      assert.equal(await corre('SUPERADMIN'), undefined);
      // La cadena de la ruta lleva un middleware más que la de /exchange-rate/current (authenticate + requireRole).
      const { quoteRouter } = await import('../routes/quote');
      const capa = (path: string) => (quoteRouter.stack as Array<{ route?: { path: string; stack: unknown[] } }>).find(l => l.route?.path === path)!.route!.stack.length;
      assert.equal(capa('/exchange-rate/seed-history'), capa('/exchange-rate/current') + 1);
      assert.equal(capa('/exchange-rate/refresh'), capa('/exchange-rate/current') + 1);
    });
    await prueba('#18 duplicar v1 con cadena v1→v2→v3 existente crea v4 (máximo sobre TODA la cadena, no otra "v3")', async () => {
      const antes = (await obtenerCotizacion(tA, q1.id)).versiones.map(v => v.version);
      assert.deepEqual(antes, [1, 2, 3]);
      const v4 = await duplicarCotizacion(tA, q1.id, uA, { puedeAprobar: true, nombre: 'rama desde v1' });
      assert.equal(v4.version, 4); assert.equal(v4.parentQuoteId, q1.id);
      // Duplicar la v4 (hoja profunda de otra rama) desde la v2 → v5.
      const v5 = await duplicarCotizacion(tA, (await obtenerCotizacion(tA, q1.id)).versiones.find(v => v.version === 2)!.id, uA, { puedeAprobar: true });
      assert.equal(v5.version, 5);
      const versiones = (await obtenerCotizacion(tA, q1.id)).versiones.map(v => v.version);
      assert.deepEqual(versiones, [1, 2, 3, 4, 5], 'sin versiones repetidas en la cadena');
    });
    await prueba('#17 vigentes + cliente: AND de ORs — las vigentes de OTRO cliente no entran; la vencida del cliente pedido tampoco', async () => {
      await prisma.quote.update({ where: { id: q2.id }, data: { vigenciaHasta: new Date('2020-01-01') } });
      try {
        const dos = await listarCotizaciones(tA, { cliente: 'Dos', vigentes: true });
        assert.equal(dos.total, 0, 'la de "Dos" está vencida y las vigentes de "Uno" no deben colarse');
        const uno = await listarCotizaciones(tA, { cliente: 'Uno', vigentes: true });
        assert.ok(uno.total >= 1 && uno.filas.every(f => f.clienteId === c1.id), 'solo cotizaciones del cliente Uno');
        const dosSinVigencia = await listarCotizaciones(tA, { cliente: 'Dos' });
        assert.equal(dosSinVigencia.total, 1);
        const vigentes = await listarCotizaciones(tA, { vigentes: true });
        assert.ok(!vigentes.filas.some(f => f.id === q2.id));
      } finally {
        await prisma.quote.update({ where: { id: q2.id }, data: { vigenciaHasta: null } });
      }
    });
    await prueba('#19 cotización simple AF IMMEX: DTA al millar menor a la cuota mínima fracc. III → se aplica $461.61 (como el multi)', async () => {
      const { calculateQuote } = await import('../services/quoter');
      const fx = await prisma.fraction.findFirst({ where: { code: '73181599', active: true, tariffNMF: { not: null } }, select: { code: true } });
      if (!fx) { console.log('    (73181599 no está en el catálogo local: se omite)'); return; }
      const chica = await calculateQuote({ fractionCode: '73181599', customsValue: 100000, origin: 'US', incoterm: 'CIF', currency: 'MXN', tipoOperacion: 'activo_fijo_immex' });
      assert.equal(chica.breakdown.dta.amount, 461.61, `DTA 1.76 al millar de 100,000 = 176 < 461.61 → mínimo; got ${chica.breakdown.dta.amount}`);
      assert.ok(chica.alertas.some(a => /cuota mínima de la fracc\. III/.test(a)));
      const grande = await calculateQuote({ fractionCode: '73181599', customsValue: 1_000_000, origin: 'US', incoterm: 'CIF', currency: 'MXN', tipoOperacion: 'activo_fijo_immex' });
      assert.equal(grande.breakdown.dta.amount, 1760);
      assert.ok(!grande.alertas.some(a => /cuota mínima/.test(a)));
      const general = await calculateQuote({ fractionCode: '73181599', customsValue: 10000, origin: 'US', incoterm: 'CIF', currency: 'MXN', tipoOperacion: 'general' });
      assert.equal(general.breakdown.dta.amount, 461.61, '8 al millar de 10,000 = 80 < 461.61');
    });
    await prueba('multi-tenant: B no ve ni duplica ni edita ni exporta cotizaciones de A', async () => {
      assert.equal((await listarCotizaciones(tB, {})).total, 1);
      await assert.rejects(obtenerCotizacion(tB, q1.id), /no encontrada/);
      await assert.rejects(duplicarCotizacion(tB, q1.id, uB, { puedeAprobar: true }), /no encontrada/);
      await assert.rejects(actualizarCotizacion(tB, q1.id, { name: 'hack' }), /no encontrada/);
      await assert.rejects(exportarCotizacionXlsx(tB, q1.id), /no encontrada/);
    });
    await prueba('PATCH guarda nombre/notas/vigencia/cliente y no toca status; cliente de otro tenant se rechaza', async () => {
      const r = await actualizarCotizacion(tA, q2.id, { name: 'Renombrada', notas: 'nota', vigenciaHasta: '2026-12-31', clienteId: c1.id });
      assert.equal(r.name, 'Renombrada'); assert.equal(r.notas, 'nota'); assert.equal(r.vigenciaHasta?.slice(0, 10), '2026-12-31'); assert.equal(r.clienteId, c1.id); assert.equal(r.status, 'approved');
      const cB = await prisma.cliente.create({ data: { tenantId: tB, rfc: 'CLI030303CC3', razonSocial: 'Cliente de B' } });
      await assert.rejects(actualizarCotizacion(tA, q2.id, { clienteId: cB.id }), /Cliente no encontrado/);
    });
    await prueba('export.xlsx produce un libro con hojas Resumen/Partidas/Despacho/Alertas', async () => {
      const { buffer, folio } = await exportarCotizacionXlsx(tA, q1.id);
      assert.ok(buffer.length > 1000); assert.match(folio, /^Q-/);
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      assert.deepEqual(wb.SheetNames, ['Resumen', 'Partidas', 'Despacho', 'Alertas']);
    });

    console.log('— DB: IEPS, cuota automática, DTA, tabulador, tcFechaDOF —');
    await prueba('IEPS desde IEPSRate: 2208 (destilados) aplica tasa cargada; 7318 → 0 + nota sin tasa', async () => {
      const con = await resolverIEPS({ fractionCode: '2208.20.02', quantity: 1 });
      const sin = await resolverIEPS({ fractionCode: '7318.15.99', quantity: 1 });
      assert.equal(sin.aplica, false); assert.equal(sin.nota, NOTA_SIN_TASA);
      if (con.aplica) { assert.ok(con.pct > 0); assert.equal(con.categoria, 'alcohol'); }
      else console.log('    (IEPSRate local sin fila 2208 — se verifica solo el caso sin tasa)');
    });
    await prueba('cuota automática por país (duty temporal) y por exportador; país sin cuota → null', async () => {
      const d = await prisma.antidumpingDuty.create({ data: { fractionCode: '73181599', countryOfOrigin: 'VN', rateType: 'percentage', rate: 25, rateUnit: '%', status: 'vigente', active: true, resolutionNumber: `RES-${marca}`, effectiveDate: new Date('2025-01-01'), esAntielusion: true, exportadorTasas: [{ empresa: 'Hanoi Bolts JSC', tasa: 9 }] } });
      dutyId = d.id;
      const general = await resolverCuotaAutomatica({ fractionCode: '7318.15.99', countryOfOrigin: 'Vietnam' });
      assert.ok(general); assert.equal(general!.match.rate, 25); assert.equal(general!.esAntielusion, true); assert.ok(general!.advertencias.some(a => /ANTIELUSIÓN/.test(a)));
      const porExp = await resolverCuotaAutomatica({ fractionCode: '7318.15.99', countryOfOrigin: 'VN', exportador: 'HANOI BOLTS' });
      assert.equal(porExp!.match.rate, 9); assert.equal(porExp!.tasa.origen, 'exportador');
      assert.equal(await resolverCuotaAutomatica({ fractionCode: '7318.15.99', countryOfOrigin: 'DE' }), null);
    });
    await prueba('calculateMultiQuote: TC manual → tcFechaDOF null; cuota por exportador; DTA fijo IN en partida 1; honorarios por tabulador', async () => {
      const tab = await prisma.tabuladorHonorarios.create({ data: { tenantId: tA, nombre: 'Tab prueba', reglas: [{ tipoOperacion: '*', base: 'porcentaje', valor: 1, minimo: 100, maximo: 900 }] } });
      const r = await calculateMultiQuote({
        exchangeRate: 20, tipoOperacion: 'temporal_immex',
        tabulador: { id: tab.id, nombre: tab.nombre, reglas: [{ tipoOperacion: '*', base: 'porcentaje', valor: 1, minimo: 100, maximo: 900 }] },
        items: [
          { fractionCode: '73181599', countryOfOrigin: 'VN', quantity: 10, unitValueUSD: 100, exportador: 'Hanoi Bolts JSC' },
          { fractionCode: '73181599', countryOfOrigin: 'VN', quantity: 5, unitValueUSD: 100 },
        ],
      });
      assert.equal(r.tcFechaDOF, null);
      assert.equal(r.tipoOperacion, 'temporal_immex'); assert.equal(r.dta.base, 'fija');
      assert.equal(r.items[0]!.dta, 461.61); assert.equal(r.items[1]!.dta, 0); assert.match(r.items[0]!.dtaNota ?? '', /partida 1/);
      assert.equal(r.items[0]!.antidumping?.origenTasa, 'exportador'); assert.equal(r.items[0]!.countervailingRate, 9); assert.equal(r.items[0]!.countervailing, 1800);
      assert.equal(r.items[1]!.antidumping?.origenTasa, 'general'); assert.equal(r.items[1]!.countervailingRate, 25);
      assert.equal(r.items[0]!.antidumping?.esAntielusion, true);
      assert.equal(r.honorarios.origen, 'tabulador'); assert.equal(r.honorarios.monto, 300); // 1% de 30,000 MXN
      assert.equal(r.dispatch.honorariosAgente, 300);
      assert.equal(r.items[0]!.programs.ieps.applies, false); assert.equal(r.items[0]!.programs.ieps.nota, NOTA_SIN_TASA);
      const h = await honorariosDesdeTabulador(tA, tab.id, { tipoOperacion: 'general', valorMXN: 1_000_000 });
      assert.equal(h?.monto, 900);
      assert.equal(await honorariosDesdeTabulador(tB, tab.id, { tipoOperacion: 'general', valorMXN: 1 }), null, 'tabulador de A no visible para B');
    });
    await prueba('calculateMultiQuote: TC oficial → tcFechaDOF = fecha del dato (si hay TC en DB); DTA general mínimo fracc. III en operación chica', async () => {
      const hayTC = await prisma.exchangeRate.count();
      const r = await calculateMultiQuote({ ...(hayTC ? {} : { exchangeRate: 20 }), items: [{ fractionCode: '73181599', countryOfOrigin: 'DE', quantity: 1, unitValueUSD: 100 }] });
      if (hayTC) { assert.ok(r.tcFechaDOF, 'tcFechaDOF presente con TC oficial'); assert.equal(r.tcFechaDOF, r.exchangeRateDate); }
      else console.log('    (sin ExchangeRate local — se omite la aserción de fecha DOF)');
      assert.equal(r.items[0]!.dta, 461.61, 'mínimo Art. 49 último párrafo');
      assert.ok(r.alertas.some(a => /cuota mínima/.test(a)));
      const grande = await calculateMultiQuote({ exchangeRate: 20, items: [{ fractionCode: '73181599', countryOfOrigin: 'DE', quantity: 1000, unitValueUSD: 100 }] });
      assert.equal(grande.items[0]!.dta, 16000, '8 al millar de 2,000,000');
      assert.equal(grande.items[0]!.dtaRate, 0.8);
    });
  } finally {
    if (dutyId) await prisma.antidumpingDuty.deleteMany({ where: { id: dutyId } }).catch(() => {});
    for (const t of [tA, tB]) {
      await prisma.quote.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.tabuladorHonorarios.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.cliente.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: t } }).catch(() => {});
    }
    await prisma.$disconnect().catch(() => {});
  }
}

async function main(): Promise<void> {
  console.log('\n═══ Ola 2 — Cotizador herramienta de venta ═══');
  await partePura();
  await parteDB();
  console.log(`\n${pasadas} passed, ${falladas} failed`);
  if (falladas > 0) process.exit(1);
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
