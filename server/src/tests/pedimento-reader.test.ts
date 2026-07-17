/**
 * LECTOR DE PEDIMENTOS — tests deterministas del parser y mapper (sin BD, sin LLM).
 * Ejecutar:  npx tsx src/tests/pedimento-reader.test.ts
 *
 * Fixtures: src/tests/fixtures/archivo-m/*.txt — SINTÉTICOS, construidos campo
 * a campo desde el layout oficial VOCE-SAAI M3 v9.0. Las claves de contribución
 * (Apéndice 12) y de país (Apéndice 4) de los fixtures son placeholders de
 * prueba; su cotejo semántico contra los apéndices vigentes está PENDIENTE.
 * Validación con archivos reales de agencias: PENDIENTE (dependencia humana).
 */
import fs from 'fs';
import path from 'path';
import { parseArchivoM, ArchivoMError } from '../services/pedimento-reader/parser';
import { mapearOperaciones } from '../services/pedimento-reader/mapper';

let ok = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { ok++; } else { fail++; console.error(`  ❌ ${msg}`); }
}
function esperaError(fn: () => unknown, contiene: string, msg: string) {
  try { fn(); fail++; console.error(`  ❌ ${msg} (no lanzó error)`); }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(e instanceof ArchivoMError && m.includes(contiene), `${msg} — mensaje: "${m.slice(0, 160)}"`);
  }
}

const FIX = path.join(__dirname, 'fixtures', 'archivo-m');
const leer = (n: string) => fs.readFileSync(path.join(FIX, n + '.txt'), 'utf8');
const A = leer('m3842001.074');
const B = leer('m3842002.074');
const C = leer('m3842003.074');

// ── 1. Parseo válido del fixture A ──
{
  const r = parseArchivoM('m3842001.074', A);
  assert(r.pedimentos.length === 1 && r.excluidos.length === 0, 'A: 1 pedimento procesable, 0 excluidos');
  assert(r.advertenciasIntegridad.filter(a => a.includes('ARITMETICA')).length === 0, `A: sin advertencias aritméticas (${r.advertenciasIntegridad})`);
  assert(r.archivo.sha256.length === 64, 'A: sha256 presente');
  const p = r.pedimentos[0]!;
  assert(p.partidas.length === 1 && p.partidas[0]!.contribuciones.length === 2, 'A: 1 partida con 2 contribuciones 557');
  assert(p.facturas.length === 1 && p.fechas.length === 1, 'A: 505 y 506 presentes');
}

// ── 2. Mapper: frontera de datos legales ──
{
  const r = parseArchivoM('m3842001.074', A);
  const ops = mapearOperaciones(r.archivo, r.pedimentos[0]!);
  assert(ops.length === 1, 'A: 1 operación por partida');
  const op = ops[0]!;
  assert(op.operacion.fraccion === '84715001', 'A: fracción de 551.3');
  assert(op.operacion.nico === '01', 'A: NICO de 551.5');
  assert(op.operacion.paisOrigen === 'US', 'A: paisOrigen de 551.21 (importación → verbatim v9.0)');
  assert(op.operacion.paisProcedencia === undefined, 'A: paisProcedencia NO se rellena (frontera aprobada)');
  assert((op.operacion as Record<string, unknown>).preferenciaArancelaria === undefined, 'A: preferenciaArancelaria NO se deriva en v1');
  assert(op.operacion.regimen === 'IMD', 'A: régimen derivado A1+importación → IMD (Apéndice 2/16)');
  assert(op.operacion.numeroPedimento === '26 07 3842 6123456', `A: número 15 reconstruido en formato Anexo 22 (dio ${op.operacion.numeroPedimento})`);
  assert(op.operacion.importadorRfc === 'XAXX010101000', 'A: RFC de 501.9');
  assert(op.origenDatos === 'verificado por sistema: archivo M', 'A: origen de datos marcado');
  assert(op.proveniencia.metodo === 'determinista' && op.proveniencia.campos.fraccion === '551.3@L7', `A: proveniencia posicional (fraccion=${op.proveniencia.campos.fraccion})`);
  assert(op.proveniencia.layoutVersion.includes('v9.0'), 'A: layoutVersion en proveniencia');
  assert(op.pedimento.incrementables.fletes === 1500 && op.pedimento.incrementables.seguros === 200, 'A: incrementables 501.12-13');
  assert(op.partida.contribuciones.every(c => typeof c.clave === 'string'), 'A: contribuciones crudas por clave (sin semántica inventada)');
}

// ── 3. Fail-closed: aridad ──
{
  const mut = A.replace('556|6123456|84715001|1|1|0.0000000000|1', '556|6123456|84715001|1|1|0.0000000000|1|EXTRA');
  esperaError(() => parseArchivoM('m3842001.074', mut), 'esperados 7 campos, encontrados 8', 'aridad 556 alterada falla cerrado');
}
// ── 4. Fail-closed: tipo de registro desconocido ──
esperaError(() => parseArchivoM('m3842001.074', A.replace('506|', '999|')), 'desconocido', 'registro 999 falla cerrado');
// ── 5. Fail-closed: conteo 801.4 ──
esperaError(() => parseArchivoM('m3842001.074', A.replace('|1|11|', '|1|12|')), '801.4', 'conteo de registros alterado falla cerrado');
// ── 6. Fail-closed: nombre de archivo ≠ 801.2 ──
esperaError(() => parseArchivoM('renombrado.txt', A), 'no coincide con 801.2', 'archivo renombrado falla cerrado');
// ── 7. Fail-closed: tipo de dato ──
esperaError(() => parseArchivoM('m3842001.074', A.replace('|428086|428086|', '|42X086|428086|')), 'numérico entero', 'valor no numérico en 551.8 falla cerrado');
// ── 8. Fail-closed: número de pedimento cruzado ──
esperaError(() => parseArchivoM('m3842001.074', A.replace('506|6123456|', '506|6123499|')), 'número de pedimento', 'registro con pedimento ajeno falla cerrado');

// ── 9. Movimiento no soportado: excluye pedimento SIN tumbar el archivo ──
{
  const dosPed = A.replace('801|m3842001.074|1|11|',
    '500|3|3842|6999999|070|ACUSE123\n801|m3842001.074|2|12|');
  // desistimiento (mov 3): estructura corta 500(+800) — para el grupo sin 800 el parser exige cierre
  const conCierre = A.replace('801|m3842001.074|1|11|',
    '500|3|3842|6999999|070|ACUSE123\n800|6999999|1|FIRMA|SERIE\n801|m3842001.074|2|13|');
  const r = parseArchivoM('m3842001.074', conCierre);
  assert(r.pedimentos.length === 1, 'movimiento 3: el pedimento normal sigue procesándose');
  assert(r.excluidos.length === 1 && r.excluidos[0]!.motivo.includes('Desistimiento'), `movimiento 3 excluido con motivo (${r.excluidos[0]?.motivo})`);
  void dosPed;
}

// ── 10. CRLF → advertencia, no fallo ──
{
  const r = parseArchivoM('m3842001.074', A.replace(/\n/g, '\r\n'));
  assert(r.pedimentos.length === 1 && r.advertenciasIntegridad.some(a => a.includes('CRLF')), 'CRLF tolerado con advertencia explícita');
}

// ── 11. Aritmética: tolerancia definida, no elástica ──
{
  // +1 MXN en una partida (n=1 → tolerancia ±1): NO debe advertir
  const dentro = A.replace('557|6123456|84715001|1|3|0|68494', '557|6123456|84715001|1|3|0|68495')
    .replace('510|6123456|3|0|68494', '510|6123456|3|0|68494');
  const r1 = parseArchivoM('m3842001.074', dentro);
  assert(!r1.advertenciasIntegridad.some(a => a.includes('ARITMETICA_CONTRIBUCIONES')), 'diferencia de 1 MXN (1 partida) dentro de tolerancia');
  // +2 MXN: SÍ debe advertir
  const fuera = A.replace('557|6123456|84715001|1|3|0|68494', '557|6123456|84715001|1|3|0|68496');
  const r2 = parseArchivoM('m3842001.074', fuera);
  assert(r2.advertenciasIntegridad.some(a => a.includes('ARITMETICA_CONTRIBUCIONES')), 'diferencia de 2 MXN (1 partida) genera advertencia');
  assert(r2.pedimentos.length === 1, 'la advertencia aritmética NO tumba el archivo');
}

// ── 12. Fracción inexistente NO es asunto del parser (pasa al motor) ──
{
  const r = parseArchivoM('m3842003.074', C);
  assert(r.pedimentos.length === 1, 'C: parsea completo');
  const ops = mapearOperaciones(r.archivo, r.pedimentos[0]!);
  assert(ops.length === 2 && ops[1]!.operacion.fraccion === '99999999', 'C: la fracción inexistente se extrae tal cual (el motor la puntúa en F6)');
}

// ── 13. B parsea con 2 partidas y aritmética limpia ──
{
  const r = parseArchivoM('m3842002.074', B);
  const ops = mapearOperaciones(r.archivo, r.pedimentos[0]!);
  assert(ops.length === 2, 'B: 2 operaciones');
  assert(ops[1]!.operacion.paisOrigen === 'CN', 'B: partida 2 origen CN (551.21)');
  assert(!r.advertenciasIntegridad.some(a => a.includes('ARITMETICA')), 'B: aritmética dentro de tolerancia');
}

console.log(`\nPEDIMENTO READER TESTS: ${ok} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
