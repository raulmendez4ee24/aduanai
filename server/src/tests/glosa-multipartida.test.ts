/**
 * PRE-GLOSA MULTIPARTIDA + CRUCES (Operación 2026-08, Ola 1).
 * Ejecutar: npm run test:glosa-multipartida
 *
 * Garantías:
 *  1. Cuota por exportador: elige la tasa de la empresa (nombre normalizado);
 *     sin empresa en la lista → general y lo dice; sin lista → general_sin_lista.
 *  2. Cruces deterministas: origen vs tratado (motor del Cotizador), UMC/UMT
 *     (Apéndice 7), precio estimado, identificadores Ap. 8 — con estado
 *     evaluado|no_evaluado y fundamento.
 *  3. simulateGlosa (una partida) conserva su contrato y ahora devuelve `cruces`.
 *  4. Multipartida: una revisión por partida + resumen con riesgo máximo,
 *     hallazgos agregados por partida y reglas no evaluadas agregadas; si una
 *     partida queda indeterminada, el pedimento también (fail-closed).
 * Usa la DB local (catálogo, reglas); limpia simulaciones del tenant sintético.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { resolverTasaPorExportador, normalizarEmpresa } from '../services/antidumping';
import { evaluarCruces, cruceOrigenTratado, cruceUmcUmt, cruceIdentificadoresAp8, crucePrecioEstimado } from '../services/glosa-cruces';
import { simulateGlosa, type GlosaFuentes } from '../services/glosa-simulator';
import { simulateGlosaPedimento, resumirPedimento, pedimentoAInputsGlosa, type PartidaGlosa } from '../services/glosa-multipartida';
import type { PedimentoConPartidas } from '../services/pedimento-importer';

const TEST_TENANT = 'test-glosa-multipartida';
const TEST_USER = 'test-glosa-multipartida-user';
let passed = 0, failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

const FRACCION_CAT = { unit: 'Kg', tariffNMF: 35, tariffTMEC: 0, tariffTLCUE: null, tariffCPTPP: null, noms: [] as string[] };

function fuentesOK(): GlosaFuentes {
  return {
    precioEstimado: async () => null,
    cuotas: async () => [],
    padrones: async () => ({ canOperate: true, blocking: [], warnings: [], required: [] }) as never,
    historicoValores: async () => [],
    historicoRA: async () => ({ raRate: 0, total: 0 }),
    nomsRequeridas: async () => [],
    reclasificaciones: async () => ({ total: 0, reclasificadas: 0 }),
    tipoCambio: async () => ({ rate: 18.5, source: 'banxico' as const, asOf: new Date('2026-08-17T00:00:00Z'), isOfficial: true, warning: null }),
    fraccionCatalogo: async () => FRACCION_CAT,
  };
}

const DUTY = {
  id: 'd1', resolutionType: 'definitiva', resolutionNumber: 'RES-2024-01', expedienteUPCI: null, fractionCode: '73181501', countryOfOrigin: 'CN',
  productDesc: null, rateType: 'specific_USD_kg', rate: 1.74, rateUnit: 'USD/kg', status: 'vigente', investigationType: null,
  publishDateDOF: null, effectiveDate: null, expiryDate: null, dofUrl: null, notes: null,
  exportadorTasas: [{ empresa: 'Zhejiang Fastener Co., Ltd.', tasa: 0.52, rateUnit: 'USD/kg' }, { empresa: 'Ningbo Bolts', tasa: 0.9 }],
  specificProducer: null,
};
const cuotaResult = () => ({ duty: DUTY, calculatedAmountUSD: null, calculation: '', severity: 'high' as const, expiringSoon: false, daysToExpiry: null, appliesToOperation: false, matchType: 'exact' as const, matchedFraction: '73181501' });

/** Pedimento en memoria con la forma de cargarPedimento (2 partidas: US y CN). */
function pedimentoFake(): PedimentoConPartidas {
  const base = { id: 'ped-1', tenantId: TEST_TENANT, userId: TEST_USER, numero: '26 24 3842 6123457', clave: 'A1', aduana: '24', patenteAduanal: '3842', rfcImportador: 'XAXX010101000', curp: null, tipoOperacion: 'IMP', regimen: 'IMD', destino: null, origen: null, pesoBruto: 1200.5, pesoNeto: 0, bultos: 0, valorAduana: 599321, valorComercial: 599321, valorDolares: 35000, tipoCambio: 17.12, incoterm: 'CFR', transporte: 'Carretero', medioTransporte: '7', factura: 'COVE267890123', cove: 'COVE267890123', bl: null, errors: null, warnings: null, status: 'DRAFT', isDemoData: false, createdAt: new Date(), updatedAt: new Date(), clienteId: null, origenArchivo: 'M3', layoutVersion: 'VOCE-SAAI-M3-v9.0-ago2021', archivoHash: 'abc',
    aiNotes: { datosArchivo: { identificadoresPedimento: [], proveedores: [{ nombre: 'ZHEJIANG FASTENER CO LTD', idFiscal: 'CN1', pais: 'CHN' }], datosNoDisponibles: ['bultos', 'pesoNeto', 'bl'], cantidadUmtPorPartida: { '1': 1, '2': 1000 } } } };
  const partida = (n: number, o: Partial<PedimentoConPartidas['partidas'][number]>) => ({ id: `p${n}`, pedimentoId: 'ped-1', numeroPartida: n, fraccion: '73181599', descripcion: 'Tornillo de acero inoxidable rosca métrica M8 x 40mm cabeza hexagonal para uso industrial automotriz', cantidad: 1, unidadMedida: '1', unidadMedidaCom: '1', valorUnitario: 10, valorAduana: 1000, pais: 'US', paisVendedor: 'US', igi: null, dta: null, iva: null, ieps: null, permisos: [], identificadores: [], vinculacion: false, vinculacionDesc: null, createdAt: new Date(), nico: '01', productId: null, ...o });
  return { ...base, partidas: [partida(1, {}), partida(2, { fraccion: '73181501', pais: 'CN', paisVendedor: 'CN', cantidad: 1000, unidadMedidaCom: '6', unidadMedida: '1', valorUnitario: 0.1, valorAduana: 100, identificadores: [{ codigo: 'CC', complemento1: '1' }] })] } as unknown as PedimentoConPartidas;
}

async function main() {
  try {
    await test('cuota por exportador: nombre normalizado elige la tasa de la empresa', () => {
      assert.equal(normalizarEmpresa('Zhejiang Fastener Co., Ltd.'), 'ZHEJIANG FASTENER');
      const r = resolverTasaPorExportador(DUTY, 'ZHEJIANG FASTENER CO LTD');
      assert.equal(r.origen, 'exportador'); assert.equal(r.tasa, 0.52); assert.equal(r.empresa, 'Zhejiang Fastener Co., Ltd.');
      const r2 = resolverTasaPorExportador(DUTY, 'Ningbo Bolts Manufacturing');
      assert.equal(r2.origen, 'exportador'); assert.equal(r2.tasa, 0.9); assert.equal(r2.rateUnit, 'USD/kg');
    });

    await test('cuota por exportador: empresa fuera de la lista → general (y lo dice); sin lista → general_sin_lista; sin nombre → general', () => {
      assert.equal(resolverTasaPorExportador(DUTY, 'Otra Empresa SA de CV').origen, 'general');
      assert.equal(resolverTasaPorExportador(DUTY, 'Otra Empresa SA de CV').tasa, 1.74);
      assert.equal(resolverTasaPorExportador({ ...DUTY, exportadorTasas: null }, 'Zhejiang').origen, 'general_sin_lista');
      assert.equal(resolverTasaPorExportador(DUTY, undefined).origen, 'general');
    });

    await test('cruce ORIGEN_TRATADO usa el motor del Cotizador: TMEC con origen CN = hallazgo; US sin declarar = observación; US con TMEC = ok', () => {
      const ctx = { fraccion: FRACCION_CAT, cuotas: [], precioEstimado: null };
      const h = cruceOrigenTratado({ fractionCode: '73181599', countryOrigin: 'CN', regimenCode: 'A1', unitValueUSD: 10, appliesTMEC: true }, ctx);
      assert.equal(h.estado, 'evaluado'); assert.equal(h.resultado, 'hallazgo');
      const o = cruceOrigenTratado({ fractionCode: '73181599', countryOrigin: 'US', regimenCode: 'A1', unitValueUSD: 10 }, ctx);
      assert.equal(o.resultado, 'observacion');
      const ok = cruceOrigenTratado({ fractionCode: '73181599', countryOrigin: 'US', regimenCode: 'A1', unitValueUSD: 10, tratadoDeclarado: 'TMEC' }, ctx);
      assert.equal(ok.resultado, 'ok');
      const ne = cruceOrigenTratado({ fractionCode: '73181599', countryOrigin: 'US', regimenCode: 'A1', unitValueUSD: 10 }, { ...ctx, fraccion: null });
      assert.equal(ne.estado, 'no_evaluado');
    });

    await test('cruce UMC_UMT: UMT ≠ unidad de la fracción = hallazgo; conversión conocida verifica cantidades; desconocida = no verificable', () => {
      const ctx = { fraccion: FRACCION_CAT, cuotas: [], precioEstimado: null };
      const h = cruceUmcUmt({ fractionCode: '73181599', countryOrigin: 'CN', regimenCode: 'A1', unitValueUSD: 1, unidadTarifa: '6', unidadComercial: '6' }, ctx);
      assert.equal(h.resultado, 'hallazgo');
      const ok = cruceUmcUmt({ fractionCode: '73181599', countryOrigin: 'CN', regimenCode: 'A1', unitValueUSD: 1, unidadTarifa: 'Kg', unidadComercial: '14', cantidadUmc: 2, cantidadUmt: 2000 }, ctx);
      assert.equal(ok.resultado, 'ok');
      const bad = cruceUmcUmt({ fractionCode: '73181599', countryOrigin: 'CN', regimenCode: 'A1', unitValueUSD: 1, unidadTarifa: '1', unidadComercial: '14', cantidadUmc: 2, cantidadUmt: 1500 }, ctx);
      assert.equal(bad.resultado, 'hallazgo');
      const nv = cruceUmcUmt({ fractionCode: '73181599', countryOrigin: 'CN', regimenCode: 'A1', unitValueUSD: 1, unidadTarifa: '1', unidadComercial: '6', cantidadUmc: 1000, cantidadUmt: 10 }, ctx);
      assert.equal(nv.estado, 'no_evaluado'); assert.match(nv.motivo ?? '', /no conoce un factor/);
      const sin = cruceUmcUmt({ fractionCode: '73181599', countryOrigin: 'CN', regimenCode: 'A1', unitValueUSD: 1 }, ctx);
      assert.equal(sin.estado, 'no_evaluado');
    });

    await test('cruce IDENTIFICADOR_AP8: IN sin IM y cuota sin CC = hallazgo; sin identificadores = no_evaluado; TL requerido si hay tratado', () => {
      const ctx = { fraccion: FRACCION_CAT, cuotas: [cuotaResult()], precioEstimado: null };
      const h = cruceIdentificadoresAp8({ fractionCode: '73181501', countryOrigin: 'CN', regimenCode: 'IN', unitValueUSD: 1, identificadores: [] }, ctx);
      assert.equal(h.resultado, 'hallazgo'); assert.match(h.mensaje, /IM/); assert.match(h.mensaje, /CC/);
      const ne = cruceIdentificadoresAp8({ fractionCode: '73181501', countryOrigin: 'CN', regimenCode: 'IN', unitValueUSD: 1 }, ctx);
      assert.equal(ne.estado, 'no_evaluado');
      const tl = cruceIdentificadoresAp8({ fractionCode: '73181599', countryOrigin: 'US', regimenCode: 'A1', unitValueUSD: 1, tratadoDeclarado: 'TMEC', identificadores: [] }, { ...ctx, cuotas: [] });
      assert.match(tl.mensaje, /TL/);
      const ok = cruceIdentificadoresAp8({ fractionCode: '73181599', countryOrigin: 'US', regimenCode: 'A1', unitValueUSD: 1, tratadoDeclarado: 'TMEC', identificadores: [{ codigo: 'TL', complemento1: 'USMCA' }] }, { ...ctx, cuotas: [] });
      assert.equal(ok.resultado, 'ok');
    });

    await test('cruce PRECIO_ESTIMADO: <80% crítico, <95% observación, sin precio = ok, dominio no revisado = no_evaluado', () => {
      const est = { fractionCode: '73181599', countryOfOrigin: 'CN', estimatedValue: 10, unit: 'USD/kg', decree: 'DOF 2025', publishDate: '', effectiveDate: '', source: 'dof', notes: null };
      const base = { fractionCode: '73181599', countryOrigin: 'CN', regimenCode: 'A1' };
      assert.equal(crucePrecioEstimado({ ...base, unitValueUSD: 5 }, { fraccion: FRACCION_CAT, cuotas: [], precioEstimado: est }).severidad, 'critical');
      assert.equal(crucePrecioEstimado({ ...base, unitValueUSD: 9 }, { fraccion: FRACCION_CAT, cuotas: [], precioEstimado: est }).resultado, 'observacion');
      assert.equal(crucePrecioEstimado({ ...base, unitValueUSD: 10 }, { fraccion: FRACCION_CAT, cuotas: [], precioEstimado: null }).resultado, 'ok');
      assert.equal(crucePrecioEstimado({ ...base, unitValueUSD: 10 }, { fraccion: FRACCION_CAT, cuotas: [], precioEstimado: undefined }).estado, 'no_evaluado');
      assert.equal(evaluarCruces({ ...base, unitValueUSD: 10 }, { fraccion: FRACCION_CAT, cuotas: [], precioEstimado: null }).length, 5);
    });

    await test('simulateGlosa (una partida) conserva contrato y devuelve cruces: cuota por exportador elige la tasa de la empresa', async () => {
      const r = await simulateGlosa(TEST_TENANT, TEST_USER, {
        fractionCode: '73181599', productDescription: 'Tornillo de acero inoxidable rosca métrica M8 x 40mm cabeza hexagonal para uso industrial automotriz',
        countryOrigin: 'CN', countryProvider: 'CN', customsCode: '07', regimenCode: 'A1', unitValueUSD: 10, weightKg: 100, totalValueUSD: 1000,
        exportadorNombre: 'Zhejiang Fastener Co Ltd', identificadores: [{ codigo: 'CC' }], declaresAntidumping: true, unidadTarifa: '1', unidadComercial: '1', cantidadUmc: 100, cantidadUmt: 100,
      }, { ...fuentesOK(), cuotas: async () => [cuotaResult()] });
      assert.ok(typeof r.riskScore === 'number' && r.revision && Array.isArray(r.flags));
      assert.equal(r.cruces.length, 5);
      const ce = r.cruces.find(c => c.codigo === 'CUOTA_EXPORTADOR')!;
      assert.equal(ce.estado, 'evaluado'); assert.equal(ce.datos?.tasa, 0.52); assert.equal(ce.datos?.empresa, 'Zhejiang Fastener Co., Ltd.');
      assert.match(ce.mensaje, /tasa específica 0.52/);
      assert.ok(r.cruces.every(c => c.fundamento.length > 10 && ['evaluado', 'no_evaluado'].includes(c.estado)));
    });

    await test('simulateGlosa sin datos de partida: cruces que los necesitan quedan no_evaluado, nunca disparan', async () => {
      const r = await simulateGlosa(TEST_TENANT, TEST_USER, {
        fractionCode: '73181599', productDescription: 'Tornillo de acero inoxidable rosca métrica M8 x 40mm cabeza hexagonal para uso industrial automotriz',
        countryOrigin: 'US', countryProvider: 'US', customsCode: '07', regimenCode: 'A1', unitValueUSD: 10, weightKg: 100, totalValueUSD: 1000,
      }, fuentesOK());
      assert.equal(r.cruces.find(c => c.codigo === 'UMC_UMT')!.estado, 'no_evaluado');
      assert.equal(r.cruces.find(c => c.codigo === 'IDENTIFICADOR_AP8')!.estado, 'no_evaluado');
      assert.equal(r.cruces.find(c => c.codigo === 'CUOTA_EXPORTADOR')!.resultado, 'ok');
    });

    await test('multipartida: una revisión por partida + resumen (riesgo máximo, hallazgos agregados, no evaluadas agregadas)', async () => {
      const ped = pedimentoFake();
      const inputs = pedimentoAInputsGlosa(ped);
      assert.equal(inputs.length, 2);
      assert.equal(inputs[1]!.exportadorNombre, 'ZHEJIANG FASTENER CO LTD');
      assert.equal(inputs[1]!.declaresAntidumping, true);
      assert.equal(inputs[1]!.cantidadUmt, 1000);
      const fuentes: Partial<GlosaFuentes> = { ...fuentesOK(), cuotas: async (i) => i.countryOfOrigin === 'CN' ? [cuotaResult()] : [] };
      const r = await simulateGlosaPedimento(TEST_TENANT, TEST_USER, ped, {}, fuentes);
      assert.equal(r.partidas.length, 2);
      assert.ok(r.partidas.every(p => p.resultado && !p.error), r.partidas.map(p => p.error).join(' | '));
      assert.equal(r.resumen.partidasEvaluadas, 2);
      assert.equal(r.resumen.riskScoreMax, Math.max(...r.partidas.map(p => p.resultado!.riskScore)));
      assert.ok(r.resumen.partidaRiesgoMaximo === 1 || r.resumen.partidaRiesgoMaximo === 2);
      // ADU_001 (Nuevo Laredo = aduana de alto riesgo) dispara en AMBAS partidas → agregado a [1, 2]
      const adu = r.resumen.hallazgos.find(h => h.ruleCode === 'ADU_001');
      assert.ok(adu, 'ADU_001 esperado'); assert.deepEqual(adu!.partidas, [1, 2]);
      // CLA_001 no evaluada (historial insuficiente) agregada en ambas
      const ne = r.resumen.reglasNoEvaluadas.find(x => x.ruleCode === 'CLA_001');
      assert.ok(ne && ne.partidas.length === 2, 'CLA_001 no evaluada en ambas');
      // Cruce de cuota por exportador solo en la partida 2 (CN) — tasa de la empresa
      const ce = r.resumen.cruces.find(c => c.codigo === 'CUOTA_EXPORTADOR');
      assert.ok(ce && ce.partidas.length === 1 && ce.partidas[0] === 2, 'cuota por exportador en partida 2');
      assert.notEqual(r.resumen.riskLevelPresentacion, 'indeterminado');
    });

    await test('multipartida fail-closed: una partida indeterminada (dominio caído) → pedimento indeterminado', async () => {
      const ped = pedimentoFake();
      const fuentes: Partial<GlosaFuentes> = { ...fuentesOK(), padrones: async () => { throw new Error('DB caída'); } };
      const r = await simulateGlosaPedimento(TEST_TENANT, TEST_USER, ped, {}, fuentes);
      assert.equal(r.resumen.riskLevelPresentacion, 'indeterminado');
      assert.ok(r.resumen.dominiosNoRevisados.some(d => d.dominio === 'padrones' && d.partidas.length === 2));
    });

    await test('multipartida: partida con fracción inexistente se reporta con error y no tumba el pedimento', async () => {
      const ped = pedimentoFake();
      ped.partidas[0]!.fraccion = '99999999';
      const r = await simulateGlosaPedimento(TEST_TENANT, TEST_USER, ped, {}, fuentesOK());
      assert.equal(r.resumen.partidasConError, 1);
      assert.match(r.partidas[0]!.error ?? '', /no existe/);
      assert.equal(r.resumen.riskLevelPresentacion, 'indeterminado');
    });

    await test('multipartida persiste clienteId del pedimento en cada GlosaSimulation (Revisión D)', async () => {
      const ped = { ...pedimentoFake(), clienteId: 'cli-glosa-test' } as PedimentoConPartidas;
      const antes = await prisma.glosaSimulation.count({ where: { tenantId: TEST_TENANT, clienteId: 'cli-glosa-test' } });
      const r = await simulateGlosaPedimento(TEST_TENANT, TEST_USER, ped, {}, fuentesOK());
      assert.equal(r.resumen.partidasEvaluadas, 2);
      const despues = await prisma.glosaSimulation.count({ where: { tenantId: TEST_TENANT, clienteId: 'cli-glosa-test' } });
      assert.equal(despues - antes, 2, 'una simulación por partida, ambas ligadas al cliente del pedimento');
    });

    await test('resumirPedimento puro: riesgo máximo = partida con mayor score', () => {
      const mk = (n: number, score: number, level: 'low' | 'high'): PartidaGlosa => ({ numeroPartida: n, fraccion: 'x', descripcion: '', input: {} as never, error: null, resultado: { riskScore: score, riskLevel: level, riskLevelPresentacion: level, flags: [], cruces: [], revision: { completa: true, noRevisados: [], reglasNoEvaluadas: [], dominios: {} as never } } as never });
      const r = resumirPedimento([mk(1, 10, 'low'), mk(2, 70, 'high')]);
      assert.equal(r.partidaRiesgoMaximo, 2); assert.equal(r.riskLevelMax, 'high'); assert.equal(r.riskLevelPresentacion, 'high');
    });
  } finally {
    const del = await prisma.glosaSimulation.deleteMany({ where: { tenantId: TEST_TENANT } });
    console.log(`  (limpieza: ${del.count} simulaciones de prueba eliminadas)`);
    await prisma.$disconnect();
  }
  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
