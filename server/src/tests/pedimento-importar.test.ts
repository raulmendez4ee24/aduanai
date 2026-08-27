/**
 * IMPORTAR M3 / DATA STAGE → Pedimento + partidas (Operación 2026-08, Ola 1).
 * Ejecutar: npm run test:importar
 *
 * Garantías:
 *  1. Detección de layout determinista (500| → M3; encabezados → Data Stage).
 *  2. Un M3 de fixture se persiste con origenArchivo/layoutVersion/archivoHash
 *     y partidas con NICO; lo que el archivo no trae queda en datosNoDisponibles.
 *  3. Idempotente: mismo hash → mismo pedimento (no duplica).
 *  4. Data Stage por encabezados: reconoce columnas por alias, falla cerrado
 *     sin las mínimas, y persiste marcado DATASTAGE.
 *  5. El pedimento persistido se convierte en PedimentoInput multipartida.
 * Usa la DB local; crea tenant/usuario sintéticos y los limpia al final.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import {
  detectarLayout, parsearArchivo, importarPedimentos, cargarPedimento, pedimentoAInputPrevalidador, ImportacionError,
} from '../services/pedimento-importer';
import { parseDataStage, DataStageError } from '../services/pedimento-reader/datastage';

let passed = 0, failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}
const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', 'archivo-m', n), 'utf8');

const DS_CSV = [
  'Pedimento,Patente,Aduana,Clave,Tipo operacion,RFC,Tipo de cambio,Peso bruto,Medio de transporte,Factura,COVE,Partida,Fraccion,NICO,Descripcion,Cantidad UMC,UMC,Cantidad UMT,UMT,Precio unitario,Valor dolares,Pais origen,Pais vendedor,Proveedor,Identificadores',
  '26 24 3842 6123470,3842,240,A1,1,XAXX010101000,17.12,1200.5,7,INV-0451,COVE267890123,1,84715001,00,UNIDAD DE PROCESO DIGITAL,1,6,1,6,25000,25000,US,US,ACME SUPPLY LLC,',
  '26 24 3842 6123470,3842,240,A1,1,XAXX010101000,17.12,1200.5,7,INV-0451,COVE267890123,2,73181501,00,TORNILLOS,1000,6,10,1,0.1,100,CN,CN,ACME SUPPLY LLC,CC:1',
].join('\n');

async function main() {
  const nonce = Date.now().toString(36);
  const tenant = await prisma.tenant.create({ data: { name: `__importar_test__ ${nonce}` } });
  const user = await prisma.user.create({ data: { email: `importar-${nonce}@example.test`, password: 'x', name: 'Importar Test', tenantId: tenant.id } });
  const ctx = { tenantId: tenant.id, userId: user.id, clienteId: null };

  try {
    await test('detectarLayout: 500| → M3, encabezados → DATASTAGE, otro → DESCONOCIDO', () => {
      assert.equal(detectarLayout(fixture('m3842004.074.txt')), 'M3');
      assert.equal(detectarLayout(DS_CSV), 'DATASTAGE');
      assert.equal(detectarLayout('1|2|3\n4|5|6'), 'DESCONOCIDO');
    });

    await test('parsearArchivo M3: normaliza cabecera y partidas con proveniencia honesta', () => {
      const r = parsearArchivo('m3842004.074.txt', fixture('m3842004.074.txt'));
      assert.equal(r.layout, 'M3');
      const p = r.pedimentos[0]!;
      assert.equal(p.numero, '26 24 3842 6123460');
      assert.equal(p.clave, 'A1'); assert.equal(p.regimen, 'IMD'); assert.equal(p.aduana, '24');
      assert.equal(p.medioTransporteClave, '7'); assert.equal(p.transporte, 'Carretero');
      assert.equal(p.factura, 'COVE267890123'); assert.equal(p.cove, 'COVE267890123');
      assert.equal(p.partidas.length, 1);
      assert.equal(p.partidas[0]!.nico, '00'); assert.equal(p.partidas[0]!.unidadMedida, '6');
      assert.equal(p.partidas[0]!.valorAduanaUsd, 25000);
      assert.deepEqual(p.datosNoDisponibles, ['bultos', 'pesoNeto', 'bl']);
      assert.equal(p.proveedores[0]!.nombre, 'ACME SUPPLY LLC');
    });

    await test('parsearArchivo: M3 con drift de forma falla cerrado (ImportacionError 422)', () => {
      assert.throws(() => parsearArchivo('m3842004.074.txt', fixture('m3842004.074.txt').replace('501|3842', '501|3842|EXTRA')), ImportacionError);
    });

    let idPrimero = '';
    await test('importarPedimentos M3: persiste Pedimento + partidas con origenArchivo/layoutVersion/archivoHash', async () => {
      const r = await importarPedimentos({ ...ctx, nombreArchivo: 'm3842004.074.txt', contenido: fixture('m3842004.074.txt') });
      assert.equal(r.layout, 'M3');
      assert.equal(r.pedimentos.length, 1);
      assert.equal(r.pedimentos[0]!.reutilizado, false);
      idPrimero = r.pedimentos[0]!.id;
      const ped = await cargarPedimento(tenant.id, idPrimero);
      assert.ok(ped);
      assert.equal(ped!.origenArchivo, 'M3');
      assert.match(ped!.layoutVersion ?? '', /VOCE-SAAI-M3-v9/);
      assert.equal(ped!.archivoHash, r.archivoHash);
      assert.equal(ped!.partidas.length, 1);
      assert.equal(ped!.partidas[0]!.nico, '00');
      assert.equal(ped!.pesoNeto, 0); // NO disponible — declarado, no fabricado
    });

    await test('idempotente: mismo hash → mismo pedimento, sin duplicar', async () => {
      const r = await importarPedimentos({ ...ctx, nombreArchivo: 'm3842004.074.txt', contenido: fixture('m3842004.074.txt') });
      assert.equal(r.pedimentos[0]!.id, idPrimero);
      assert.equal(r.pedimentos[0]!.reutilizado, true);
      const n = await prisma.pedimento.count({ where: { tenantId: tenant.id, archivoHash: r.archivoHash } });
      assert.equal(n, 1);
    });

    await test('pedimentoAInputPrevalidador: multipartida + datosNoDisponibles + valor en USD coherente', async () => {
      const ped = (await cargarPedimento(tenant.id, idPrimero))!;
      const input = pedimentoAInputPrevalidador(ped);
      assert.equal(input.origenArchivo, 'M3');
      assert.deepEqual(input.datosNoDisponibles, ['bultos', 'pesoNeto', 'bl']);
      assert.equal(input.partidas.length, 1);
      assert.equal(input.partidas[0]!.nico, '00');
      assert.equal(input.valorAduana, 25000);
      assert.equal(input.medioTransporteClave, '7');
    });

    await test('Data Stage: parser por encabezados reconoce alias y falla cerrado sin columnas mínimas', () => {
      const ds = parseDataStage('datastage.csv', DS_CSV);
      assert.equal(ds.delimitador, ',');
      assert.equal(ds.columnasReconocidas.pedimento, 'Pedimento');
      assert.equal(ds.columnasReconocidas.tipoOperacion, 'Tipo operacion');
      assert.equal(ds.filas.length, 2);
      assert.throws(() => parseDataStage('x.csv', 'Foo,Bar,Baz\n1,2,3'), DataStageError);
      // alias configurable
      const ds2 = parseDataStage('x.csv', 'NumPed,FraccArancel,Otra\n26243842612347,84715001,x', { pedimento: ['NumPed'], fraccion: ['FraccArancel'] });
      assert.equal(ds2.filas[0]!.valores.fraccion, '84715001');
    });

    await test('importarPedimentos Data Stage: agrupa partidas por pedimento y marca DATASTAGE (pendiente de cotejo)', async () => {
      const r = await importarPedimentos({ ...ctx, nombreArchivo: 'datastage.csv', contenido: DS_CSV });
      assert.equal(r.layout, 'DATASTAGE');
      assert.match(r.avisoLayout ?? '', /pendiente de cotejo/);
      assert.equal(r.pedimentos.length, 1);
      assert.equal(r.pedimentos[0]!.partidas, 2);
      const ped = (await cargarPedimento(tenant.id, r.pedimentos[0]!.id))!;
      assert.equal(ped.origenArchivo, 'DATASTAGE');
      assert.equal(ped.numero, '26 24 3842 6123470');
      assert.equal(ped.regimen, 'IMD');
      assert.equal(ped.factura, 'INV-0451'); assert.equal(ped.cove, 'COVE267890123');
      const p2 = ped.partidas.find(p => p.numeroPartida === 2)!;
      assert.equal(p2.fraccion, '73181501');
      const ids = p2.identificadores as { codigo: string; complemento1?: string }[];
      assert.equal(ids.length, 1); assert.equal(ids[0]!.codigo, 'CC'); assert.equal(ids[0]!.complemento1, '1');
      assert.equal(p2.unidadMedida, '1'); // UMT kilo
    });
  } finally {
    await prisma.pedimento.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
