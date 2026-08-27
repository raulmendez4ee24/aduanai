/**
 * Regulatorio (Operación 2026-08): watchdog DOF (fetch inyectado, sin red),
 * fingerprint anti-duplicados, severidad ponderada por monto (tabla de
 * casos), acciones normalizadas y digest semanal (transportes inyectados).
 *   npm run test:regulatorio
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { severidadPorImpacto, REGLAS_SEVERIDAD, bandaMonto, urgenciaPorDias } from '../services/alert-severity';
import { normalizarAccion, rutaDeAccion, accionCambioRegimen, accionVerObligacion } from '../services/alert-acciones';
import {
  parsearIndiceDOF, extraerFracciones, extraerTasas, esTituloRelevante, urlIndiceDOF,
  recolectarDecretos, alertarTenant, correrWatchdogDOF, catalogoPorCliente, fraccionesAfectadas,
} from '../services/dof-watchdog';
import { URL_REFORMAS_LIGIE } from '../services/tarifa-vigilante';
import { armarDigest, enviarDigest, renderDigestTexto } from '../services/digest-semanal';

let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

const SUFIJO = `reg-${Date.now()}`;
const AHORA = new Date('2026-08-27T12:00:00Z');

// ── Fixtures HTML (sin red) ───────────────────────────────────────────────
const HTML_DIPUTADOS = `<html><body>
<a href="ligie_2022/LIGIE_2022_tarifa15_23abr26.pdf">DOF 23-04-2026</a>
<a href="ligie_2022/LIGIE_2022_tarifa16_25ago26.pdf">DOF 25-08-2026</a>
</body></html>`;
const HTML_INDICE_25AGO = `<html><body>
<a href="nota_detalle.php?codigo=5800001&fecha=25/08/2026">DECRETO por el que se modifica la Tarifa de la Ley de los Impuestos Generales de Importación y de Exportación.</a>
<a href="nota_detalle.php?codigo=5800002&fecha=25/08/2026">ACUERDO por el que se dan a conocer los días inhábiles</a>
</body></html>`;
const HTML_NOTA = `<html><body><p>ARTÍCULO ÚNICO.- Se modifican los aranceles de las fracciones siguientes:</p>
<table>
<tr><td>7208.25.01</td><td>Laminados planos de hierro.</td><td>25%</td></tr>
<tr><td>8471.30.01</td><td>Máquinas automáticas portátiles.</td><td>Ex.</td></tr>
<tr><td>64039901</td><td>Calzado con suela de caucho.</td><td>35</td></tr>
</table><p>Fecha de publicación 25/08/2026. Código 5800001.</p></body></html>`;
const HTML_INDICE_VACIO = `<html><body><a href="nota_detalle.php?codigo=5800009&fecha=27/08/2026">AVISO de nada relevante</a></body></html>`;

function fetchFixture(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const ok = (body: string) => new Response(body, { status: 200 });
    if (url === URL_REFORMAS_LIGIE) return ok(HTML_DIPUTADOS);
    if (url === urlIndiceDOF('2026-08-25')) return ok(HTML_INDICE_25AGO);
    if (url.includes('codigo=5800001')) return ok(HTML_NOTA);
    if (url.includes('index.php')) return ok(HTML_INDICE_VACIO);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

(async () => {
  console.log('— severidad ponderada por monto: tabla de casos —');
  const casos: { d: Parameters<typeof severidadPorImpacto>[0]; esperado: string; por: string }[] = [
    { d: { tipo: 'import_expiring', impactoMXN: -387, diasParaVencer: 3 }, esperado: 'low', por: '$387 inminente NO es crítico' },
    { d: { tipo: 'import_expiring', impactoMXN: -196000, diasParaVencer: 3 }, esperado: 'critical', por: '$196k inminente sí' },
    { d: { tipo: 'import_expiring', impactoMXN: -196000, diasParaVencer: 20 }, esperado: 'high', por: '$196k próxima' },
    { d: { tipo: 'import_expiring', impactoMXN: -196000, diasParaVencer: 200 }, esperado: 'high', por: '$196k lejana' },
    { d: { tipo: 'import_expiring', impactoMXN: 25000, diasParaVencer: 2 }, esperado: 'high', por: 'medio inminente' },
    { d: { tipo: 'import_expiring', impactoMXN: 25000, diasParaVencer: 60 }, esperado: 'medium', por: 'medio lejano' },
    { d: { tipo: 'import_expiring', impactoMXN: 2500, diasParaVencer: 0 }, esperado: 'medium', por: 'bajo vencida' },
    { d: { tipo: 'import_expiring', impactoMXN: 2500, diasParaVencer: 15 }, esperado: 'low', por: 'bajo próximo' },
    { d: { tipo: 'tariff_change', impactoMXN: null, diasParaVencer: 1 }, esperado: 'high', por: 'sin cifra: techo high' },
    { d: { tipo: 'tariff_change', impactoMXN: null, diasParaVencer: 20 }, esperado: 'medium', por: 'sin cifra próxima' },
    { d: { tipo: 'tariff_change', impactoMXN: null, diasParaVencer: null }, esperado: 'low', por: 'sin cifra sin fecha' },
    { d: { tipo: 'padron_expiring', impactoMXN: null, diasParaVencer: 5 }, esperado: 'critical', por: 'tipo sin monto inminente' },
    { d: { tipo: 'obligacion_vencida', impactoMXN: null, diasParaVencer: -3 }, esperado: 'critical', por: 'obligación vencida' },
    { d: { tipo: 'obligacion_proxima', impactoMXN: null, diasParaVencer: 20 }, esperado: 'high', por: 'obligación próxima' },
    { d: { tipo: 'import_expiring', impactoMXN: 100000, diasParaVencer: 7 }, esperado: 'critical', por: 'borde ≥100k y ≤7d' },
    { d: { tipo: 'import_expiring', impactoMXN: 99999.99, diasParaVencer: 7 }, esperado: 'high', por: 'borde <100k' },
  ];
  for (const c of casos) {
    await prueba(`${c.por} → ${c.esperado}`, () => assert.equal(severidadPorImpacto(c.d), c.esperado));
  }
  await prueba('bandas y urgencias auxiliares', () => {
    assert.equal(bandaMonto(-150000), 'alto'); assert.equal(bandaMonto(999), 'trivial'); assert.equal(bandaMonto(undefined), 'desconocido');
    assert.equal(urgenciaPorDias(0), 'vencida'); assert.equal(urgenciaPorDias(31), 'lejana'); assert.equal(urgenciaPorDias(null), 'sin_urgencia');
  });
  await prueba('reglas expuestas documentan umbrales', () => {
    assert.equal(REGLAS_SEVERIDAD.umbralesMonto.alto, 100000);
    assert.ok(REGLAS_SEVERIDAD.matriz.length >= 5);
  });

  console.log('— acciones en un clic: normalización —');
  await prueba('legacy review_operation de import_expiring → cambio_regimen con ids', () => {
    const a = normalizarAccion({ type: 'import_expiring', suggestedAction: { type: 'review_operation', label: 'Ver', payload: { importId: 'ti1', route: '/inventario' } }, affectedOperations: ['ti1'] });
    assert.equal(a?.type, 'cambio_regimen');
    assert.equal(rutaDeAccion(a!), '/cambio-regimen?ids=ti1&tipo=F4');
  });
  await prueba('legacy view_fraction → revisar_fraccion', () => {
    const a = normalizarAccion({ type: 'tariff_change', suggestedAction: { type: 'view_fraction', label: 'x', payload: { fractionCode: '7208.25.01' } } });
    assert.equal(a?.type, 'revisar_fraccion');
    assert.equal(rutaDeAccion(a!), '/fracciones?code=72082501');
  });
  await prueba('sin acción y sin datos → null; tipos nuevos pasan tal cual', () => {
    assert.equal(normalizarAccion({ type: 'weekly_summary', suggestedAction: null }), null);
    const v = accionVerObligacion('ob1');
    assert.deepEqual(normalizarAccion({ type: 'obligacion_vencida', suggestedAction: v })?.type, 'ver_obligacion');
    assert.equal(rutaDeAccion(v), '/calendario/ob1');
    assert.equal(rutaDeAccion(accionCambioRegimen(['a', 'b'], 'F5')), '/cambio-regimen?ids=a%2Cb&tipo=F5');
  });

  console.log('— watchdog DOF: parsers puros —');
  await prueba('índice DOF → notas con código, fecha y título', () => {
    const notas = parsearIndiceDOF(HTML_INDICE_25AGO);
    assert.equal(notas.length, 2);
    assert.equal(notas[0]!.codigo, '5800001');
    assert.equal(notas[0]!.fechaDOF, '2026-08-25');
    assert.ok(esTituloRelevante(notas[0]!.titulo));
    assert.ok(!esTituloRelevante(notas[1]!.titulo));
  });
  await prueba('fracciones con y sin puntos; descarta fechas yyyymmdd', () => {
    const f = extraerFracciones('7208.25.01 y 64039901 y 20260825 y 0101.21.01');
    assert.deepEqual(f, ['72082501', '64039901', '01012101']);
  });
  await prueba('tasas parseables: 25%, Ex., 35', () => {
    const texto = HTML_NOTA.replace(/<\/t[dh]>/gi, ' | ').replace(/<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ');
    const t = extraerTasas(texto);
    assert.equal(t['72082501'], 25); assert.equal(t['84713001'], 0); assert.equal(t['64039901'], 35);
  });
  await prueba('recolectarDecretos cruza Diputados → índice DOF → nota (sin red)', async () => {
    const r = await recolectarDecretos({ fetchFn: fetchFixture(), ahora: AHORA, ventanaDias: 2 });
    const d = r.decretos.find(x => x.clave === 'dof:5800001');
    assert.ok(d, 'decreto DOF localizado vía fecha de Diputados');
    assert.deepEqual([...d!.fracciones].sort(), ['64039901', '72082501', '84713001']);
    assert.equal(d!.tasas['72082501'], 25);
    assert.equal(r.fuentesCiegas.length, 0);
  });
  await prueba('fuente ciega se reporta (fetch que falla)', async () => {
    const r = await recolectarDecretos({ fetchFn: (async () => new Response('x', { status: 500 })) as typeof fetch, ahora: AHORA, ventanaDias: 1 });
    assert.ok(r.fuentesCiegas.includes('diputados') && r.fuentesCiegas.includes('dof'));
    assert.equal(r.decretos.length, 0);
  });

  console.log('— watchdog DOF + digest: con tenant de prueba —');
  const tenant = await prisma.tenant.create({ data: { name: `Test ${SUFIJO}`, status: 'ACTIVE' } });
  const otro = await prisma.tenant.create({ data: { name: `Otro ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: `${SUFIJO}@test.local`, password: 'x', name: 'T', tenantId: tenant.id, role: 'ADMIN', emailVerified: true } });
  const cliente = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `RFC${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente Uno' } });
  const limpiar = async () => {
    await prisma.alert.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.temporaryImport.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.obligacionCalendario.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otro.id] } } });
  };
  try {
    // Catálogo del cliente: 7208.25.01 (producto del cliente) + 6403.99.01 (temporal activa sin cliente).
    await prisma.product.create({ data: { tenantId: tenant.id, clienteId: cliente.id, productCode: `P-${SUFIJO}`, description: 'Lámina', fractionCode: '72082501', unit: 'Kg' } });
    const ti = await prisma.temporaryImport.create({ data: {
      tenantId: tenant.id, userId: user.id, pedimento: '26 47 3461 4000123', fractionCode: '64039901', description: 'Calzado', quantity: 100, unit: 'Pza',
      customsValue: 10000, valueMXN: 180000, entryDate: new Date('2026-01-10'), expirationDate: new Date('2026-09-10'), status: 'ACTIVE',
    } });
    // Otro tenant con 8471.30.01: NO debe recibir alerta del nuestro ni viceversa.
    await prisma.product.create({ data: { tenantId: otro.id, productCode: `P-${SUFIJO}`, description: 'Laptop', fractionCode: '84713001', unit: 'Pza' } });

    await prueba('catálogo agrupa por cliente y por "sin cliente"', async () => {
      const cat = await catalogoPorCliente(tenant.id);
      const c1 = cat.find(c => c.clienteId === cliente.id)!;
      const sin = cat.find(c => c.clienteId === null)!;
      assert.ok(c1.fracciones.has('72082501') && !c1.fracciones.has('64039901'));
      assert.ok(sin.fracciones.has('64039901'));
      assert.deepEqual(fraccionesAfectadas({ fracciones: ['72082501', '99999999'] }, c1.fracciones), ['72082501']);
    });

    let creadasPrimera = 0;
    await prueba('corrida completa: alerta por cliente, solo fracciones propias, impacto calculado', async () => {
      const r = await correrWatchdogDOF({ fetchFn: fetchFixture(), ahora: AHORA, ventanaDias: 2, tenantIds: [tenant.id], tc: 18 });
      creadasPrimera = r.alertasCreadas;
      assert.equal(r.alertasCreadas, 2, 'una por cliente (7208) y una sin cliente (6403)');
      const alertas = await prisma.alert.findMany({ where: { tenantId: tenant.id, type: 'tariff_change' } });
      const deCliente = alertas.find(a => a.clienteId === cliente.id)!;
      assert.deepEqual(deCliente.fractionCodes, ['72082501'], 'ignora 8471 y 6403 que no son del cliente');
      assert.ok(deCliente.content.includes('nota_detalle.php?codigo=5800001'), 'fundamento = URL del decreto');
      assert.equal(deCliente.estimatedImpactMXN, null, 'sin inventario del cliente → impacto null y lo dice');
      assert.ok(deCliente.content.includes('impacto en pesos no calculable') || deCliente.content.includes('Sin saldo'));
      const sinCliente = alertas.find(a => a.clienteId === null)!;
      // 6403.99.01 tasa nueva 35 vs NMF del catálogo → impacto = 180000 × (35 − NMF)/100 si hay NMF
      const fx = await prisma.fraction.findUnique({ where: { code: '64039901' }, select: { tariffNMF: true } });
      if (fx?.tariffNMF != null) {
        assert.equal(sinCliente.estimatedImpactMXN, -Math.round(180000 * (35 - fx.tariffNMF) / 100) || 0);
        assert.deepEqual(sinCliente.affectedOperations, [ti.id]);
      } else {
        assert.equal(sinCliente.estimatedImpactMXN, null);
      }
      assert.equal((sinCliente.suggestedAction as { type: string }).type, 'revisar_fraccion');
      const ajenas = await prisma.alert.count({ where: { tenantId: otro.id } });
      assert.equal(ajenas, 0, 'el otro tenant no fue tocado (tenantIds acotado)');
    });
    await prueba('fingerprint evita duplicados en la segunda corrida', async () => {
      const r = await correrWatchdogDOF({ fetchFn: fetchFixture(), ahora: AHORA, ventanaDias: 2, tenantIds: [tenant.id], tc: 18 });
      assert.equal(r.alertasCreadas, 0);
      assert.equal(r.alertasExistentes, creadasPrimera);
      assert.equal(await prisma.alert.count({ where: { tenantId: tenant.id, type: 'tariff_change' } }), 2);
    });
    await prueba('alertarTenant del otro tenant solo ve su catálogo (8471)', async () => {
      const { decretos } = await recolectarDecretos({ fetchFn: fetchFixture(), ahora: AHORA, ventanaDias: 2 });
      const r = await alertarTenant(otro.id, decretos.filter(d => d.fracciones.length > 0), 18);
      assert.equal(r.creadas, 1);
      const a = await prisma.alert.findFirst({ where: { tenantId: otro.id } });
      assert.deepEqual(a!.fractionCodes, ['84713001']);
    });

    await prueba('digest preview agrupa por cliente y no envía si el canal no está configurado', async () => {
      await prisma.obligacionCalendario.create({ data: { tenantId: tenant.id, clienteId: cliente.id, tipo: 'OTRA', titulo: 'Obligación prueba', fechaLimite: new Date(AHORA.getTime() + 5 * 86400000) } });
      const d = await armarDigest(tenant.id, AHORA);
      assert.equal(d.clientes.length, 2);
      const c1 = d.clientes.find(c => c.clienteId === cliente.id)!;
      assert.equal(c1.nombre, 'Cliente Uno');
      assert.equal(c1.alertas.length, 1);
      assert.equal(c1.obligaciones.length, 1);
      const sin = d.clientes.find(c => c.clienteId === null)!;
      assert.equal(sin.vencimientos.length, 1, 'temporal vence en ≤30 días');
      assert.ok(renderDigestTexto(d).includes('Cliente Uno'));

      let enviados = 0;
      const r = await enviarDigest(tenant.id, { ahora: AHORA, transportes: { email: async () => { enviados++; }, whatsapp: async () => { enviados++; } } });
      assert.equal(r.enviado, false);
      assert.equal(r.motivo, 'canal no configurado');
      assert.equal(enviados, 0);
      const guardado = await prisma.alert.findFirst({ where: { tenantId: tenant.id, type: 'weekly_summary' } });
      assert.ok(guardado && guardado.title.includes('canal no configurado'));
    });
    await prueba('digest con canal email y transporte inyectado: envía a admins verificados y marca digestUltimoEnvioAt', async () => {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { digestSemanalCanal: 'email' } });
      const tos: string[] = [];
      const r = await enviarDigest(tenant.id, { ahora: AHORA, transportes: { email: async (to) => { tos.push(to); }, configurado: { email: true } } });
      assert.equal(r.enviado, true);
      assert.deepEqual(tos, [user.email]);
      const t = await prisma.tenant.findUnique({ where: { id: tenant.id } });
      assert.equal(t!.digestUltimoEnvioAt?.toISOString(), AHORA.toISOString());
    });
    await prueba('digest canal whatsapp sin teléfonos → no envía y lo dice', async () => {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { digestSemanalCanal: 'whatsapp' } });
      const r = await enviarDigest(tenant.id, { ahora: AHORA, forzar: true, transportes: { whatsapp: async () => { throw new Error('no debía llamarse'); }, configurado: { whatsapp: true } } });
      assert.equal(r.enviado, false);
      assert.ok(r.motivo!.includes('sin destinatarios'));
    });
  } finally {
    await limpiar();
  }

  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
})();
