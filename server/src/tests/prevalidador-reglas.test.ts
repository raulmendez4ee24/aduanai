/**
 * REGLAS NUEVAS DEL PRE-VALIDADOR (Operación 2026-08, Ola 1).
 * Ejecutar: npm run test:prevalidador-reglas
 *
 * Garantías:
 *  1. Catálogo: toda regla que emite el validador está documentada
 *     (REGLAS_PREVALIDADOR ↔ códigos emitidos) con fundamento y severidad.
 *  2. Pedimento sintético incongruente dispara ADUANA_TRANSPORTE_INCONGRUENTE,
 *     DOCUMENTO_VACIO, NICO_FALTANTE, IDENTIFICADOR_OBLIGATORIO_FALTANTE.
 *  3. Pedimento correcto (fixture M3 m3842004) NO dispara ninguna de las 4.
 *  4. Lo que el archivo no trae queda `no_evaluado` con motivo (bultos, peso
 *     neto, BL), nunca como error fabricado.
 *  5. Catálogos Anexo 22: aduanas con tipo; claves agregadas sin cotejo NO
 *     restringen régimen; Apéndice 7 mapea símbolos ↔ claves y conversiones.
 * Usa la DB local (catálogo de fracciones, TC).
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import { validatePedimento, type PedimentoInput } from '../services/prevalidator-v2';
import { REGLAS_PREVALIDADOR, REGLAS_POR_CODIGO } from '../services/prevalidador-reglas';
import { parsearArchivo, pedimentoAInputPrevalidador } from '../services/pedimento-importer';
import { ADUANAS, CLAVES_PEDIMENTO, REGIMENES_POR_CLAVE, claveUnidadMedida, factorConversion, viaDeTransporte } from '../lib/anexo22';

let passed = 0, failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}
const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', 'archivo-m', n), 'utf8');

/** Pedimento sintético: todo lo que puede estar mal, está mal. */
function pedimentoIncongruente(): PedimentoInput {
  return {
    origenArchivo: 'MANUAL',
    clave: 'IN', aduana: '24', patenteAduanal: '3842', rfcImportador: 'XAXX010101000',
    tipoOperacion: 'IMP', regimen: 'ITE',
    pesoBruto: 800, pesoNeto: 700, bultos: 10,
    valorAduana: 10000, valorComercial: 10000, valorDolares: 10000, tipoCambio: 17.02,
    incoterm: 'CFR', transporte: 'Marítimo',       // marítimo por Nuevo Laredo
    factura: '', cove: '', bl: '',                 // documentos vacíos
    identificadoresPedimento: [],                  // sin IM para clave IN
    partidas: [{
      numeroPartida: 1, fraccion: '61021001', descripcion: 'ABRIGOS DE PUNTO', nico: '',   // NICO faltante; fracción con NOM sin NM
      cantidad: 500, unidadMedida: 'Pza', valorUnitario: 20, valorAduana: 10000, pais: 'CN', identificadores: [],
    }],
  };
}

/** El fixture correcto convertido como lo haría /desde-pedimento (sin persistir). */
function pedimentoCorrecto(): PedimentoInput {
  const norm = parsearArchivo('m3842004.074.txt', fixture('m3842004.074.txt')).pedimentos[0]!;
  const fake = {
    id: 'x', numero: norm.numero, clave: norm.clave, aduana: norm.aduana, patenteAduanal: norm.patente, rfcImportador: norm.rfcImportador,
    curp: norm.curp, tipoOperacion: norm.tipoOperacion, regimen: norm.regimen, destino: null, origen: null,
    pesoBruto: norm.pesoBruto, pesoNeto: 0, bultos: 0, valorAduana: norm.valorAduanaMxn, valorComercial: norm.valorComercialMxn,
    valorDolares: norm.valorDolares, tipoCambio: norm.tipoCambio, incoterm: norm.incoterm, transporte: norm.transporte,
    medioTransporte: norm.medioTransporteClave, factura: norm.factura, cove: norm.cove, bl: norm.bl,
    origenArchivo: 'M3', layoutVersion: norm.layoutVersion, archivoHash: norm.archivoHash,
    aiNotes: { datosArchivo: { identificadoresPedimento: norm.identificadoresPedimento, proveedores: norm.proveedores, datosNoDisponibles: norm.datosNoDisponibles } },
    partidas: norm.partidas.map(p => ({
      id: 'p', pedimentoId: 'x', numeroPartida: p.numeroPartida, fraccion: p.fraccion, nico: p.nico, descripcion: p.descripcion,
      cantidad: p.cantidad, unidadMedida: p.unidadMedida, unidadMedidaCom: p.unidadMedidaCom, valorUnitario: p.valorUnitario,
      valorAduana: p.valorAduanaUsd, pais: p.pais, paisVendedor: p.paisVendedor, igi: p.igi, dta: null, iva: p.iva, ieps: null,
      permisos: p.permisos, identificadores: p.identificadores, vinculacion: false, vinculacionDesc: null, productId: null, createdAt: new Date(),
    })),
  };
  return pedimentoAInputPrevalidador(fake as unknown as Parameters<typeof pedimentoAInputPrevalidador>[0]);
}

async function main() {
  try {
    await test('catálogo: cada regla tiene código único, fundamento, severidad y estado de cotejo', () => {
      const codigos = REGLAS_PREVALIDADOR.map(r => r.codigo);
      assert.equal(new Set(codigos).size, codigos.length);
      for (const r of REGLAS_PREVALIDADOR) {
        assert.ok(r.fundamento.length > 10, r.codigo);
        assert.ok(['error', 'warning', 'info'].includes(r.severidad), r.codigo);
        assert.ok(['verificado', 'pendiente'].includes(r.cotejoFundamento), r.codigo);
      }
      for (const c of ['ADUANA_TRANSPORTE_INCONGRUENTE', 'DOCUMENTO_VACIO', 'NICO_FALTANTE', 'NICO_INVALIDO', 'IDENTIFICADOR_OBLIGATORIO_FALTANTE', 'CLAVE_REGIMEN_MISMATCH', 'TC_OFF_DOF']) {
        assert.ok(REGLAS_POR_CODIGO[c], `falta ${c} en el catálogo`);
      }
    });

    await test('catálogo Anexo 22: aduanas con tipo (cotejo pendiente); Nuevo Laredo fronteriza, Manzanillo marítima', () => {
      assert.ok(ADUANAS.every(a => a.tipo && a.tipo.length > 0 && a.cotejoTipo === 'pendiente'));
      assert.deepEqual(ADUANAS.find(a => a.clave === '24')!.tipo, ['fronteriza']);
      assert.deepEqual(ADUANAS.find(a => a.clave === '16')!.tipo, ['maritima']);
      assert.equal(viaDeTransporte('Marítimo'), 'maritima'); assert.equal(viaDeTransporte('7'), 'terrestre'); assert.equal(viaDeTransporte('4'), 'aerea');
    });

    await test('catálogo Anexo 22: claves agregadas (V5, E1, G1, K1, C1…) existen, marcadas pendiente y NO restringen régimen', () => {
      for (const c of ['V5', 'E1', 'E2', 'G1', 'K1', 'C1']) {
        const k = CLAVES_PEDIMENTO.find(x => x.clave === c);
        assert.ok(k, c); assert.equal(k!.cotejo, 'pendiente'); assert.deepEqual(REGIMENES_POR_CLAVE[c], []);
      }
      assert.equal(CLAVES_PEDIMENTO.find(x => x.clave === 'A1')!.cotejo, undefined);
    });

    await test('Apéndice 7: símbolos del catálogo ↔ claves; conversiones conocidas; desconocidas → null', () => {
      assert.equal(claveUnidadMedida('Kg'), '1'); assert.equal(claveUnidadMedida('Pza'), '6'); assert.equal(claveUnidadMedida('M²'), '4'); assert.equal(claveUnidadMedida('6'), '6');
      assert.equal(claveUnidadMedida('Prohibida'), null);
      assert.equal(factorConversion('2', '1'), 0.001); assert.equal(factorConversion('19', '6'), 12); assert.equal(factorConversion('6', '1'), null);
    });

    await test('incongruente: dispara ADUANA_TRANSPORTE_INCONGRUENTE, DOCUMENTO_VACIO, NICO_FALTANTE, IDENTIFICADOR_OBLIGATORIO_FALTANTE', async () => {
      const r = await validatePedimento(pedimentoIncongruente());
      const reglas = new Set(r.issues.map(i => i.rule));
      for (const c of ['ADUANA_TRANSPORTE_INCONGRUENTE', 'DOCUMENTO_VACIO', 'NICO_FALTANTE', 'IDENTIFICADOR_OBLIGATORIO_FALTANTE']) assert.ok(reglas.has(c), `falta ${c}: ${[...reglas].join(', ')}`);
      assert.equal(r.valid, false);
      const idf = r.issues.find(i => i.rule === 'IDENTIFICADOR_OBLIGATORIO_FALTANTE')!;
      assert.match(idf.message, /IM/); assert.match(idf.message, /NM/);
      const at = r.issues.find(i => i.rule === 'ADUANA_TRANSPORTE_INCONGRUENTE')!;
      assert.match(at.message, /Nuevo Laredo/);
      assert.equal(r.issues.filter(i => i.rule === 'DOCUMENTO_VACIO').length, 3);
      assert.ok(r.issues.every(i => REGLAS_POR_CODIGO[i.rule]), `regla emitida sin catálogo: ${r.issues.filter(i => !REGLAS_POR_CODIGO[i.rule]).map(i => i.rule).join(', ')}`);
    });

    await test('NICO_INVALIDO: 2 dígitos que no existen para la fracción', async () => {
      const p = pedimentoIncongruente();
      p.partidas[0]!.nico = '77';
      const r = await validatePedimento(p);
      assert.ok(r.issues.some(i => i.rule === 'NICO_INVALIDO'));
      assert.ok(!r.issues.some(i => i.rule === 'NICO_FALTANTE'));
    });

    await test('correcto (fixture m3842004 vía importador): NO dispara ninguna de las 4 reglas nuevas', async () => {
      const r = await validatePedimento(pedimentoCorrecto());
      const reglas = new Set(r.issues.map(i => i.rule));
      for (const c of ['ADUANA_TRANSPORTE_INCONGRUENTE', 'DOCUMENTO_VACIO', 'NICO_FALTANTE', 'NICO_INVALIDO', 'IDENTIFICADOR_OBLIGATORIO_FALTANTE', 'UMT_NO_COINCIDE']) assert.ok(!reglas.has(c), `${c} disparó: ${r.issues.filter(i => i.rule === c).map(i => i.message).join(' | ')}`);
      assert.ok(!reglas.has('BULTOS_ZERO') && !reglas.has('WEIGHT_INCONSISTENT') && !reglas.has('WEIGHT_RATIO_LOW'), 'lo no disponible no puede ser error');
      const ne = r.reglasNoEvaluadas.map(x => x.rule);
      assert.ok(ne.includes('BULTOS_ZERO') && ne.includes('WEIGHT_INCONSISTENT') && ne.includes('DOCUMENTO_VACIO'), `no_evaluadas: ${ne.join(', ')}`);
    });

    await test('identificadores no capturados (formulario) → IDENTIFICADOR_OBLIGATORIO_FALTANTE queda no_evaluado, no dispara', async () => {
      const p = pedimentoIncongruente();
      delete p.identificadoresPedimento; delete p.partidas[0]!.identificadores;
      const r = await validatePedimento(p);
      assert.ok(!r.issues.some(i => i.rule === 'IDENTIFICADOR_OBLIGATORIO_FALTANTE'));
      assert.ok(r.reglasNoEvaluadas.some(x => x.rule === 'IDENTIFICADOR_OBLIGATORIO_FALTANTE' && x.partida === 1));
    });
  } finally {
    await prisma.$disconnect();
  }
  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
