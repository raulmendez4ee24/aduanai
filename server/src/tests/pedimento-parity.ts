/**
 * LECTOR DE PEDIMENTOS — PARIDAD de cierre Fase 1.4 (bandas DECLARADAS ANTES).
 *
 * Ejecutar:  npx tsx src/tests/pedimento-parity.ts
 *
 * 3 archivos SINTÉTICOS construidos desde el layout oficial v9.0
 * (src/tests/fixtures/archivo-m/). Requisitos: catálogo local completo +
 * tabla Sat69B ingestada (el archivo C usa un RFC DEFINITIVO REAL de la
 * tabla) + AntidumpingDuty activa 73181501/CN. Tenant sintético sin
 * inventario para no contaminar F5. Pipeline idéntico al de la ruta
 * POST /api/pedimentos/radar: parse → map → buildVerifiedSignals → evaluate.
 *
 * Nota de honestidad: las claves de país de los fixtures asumen la forma
 * alfa-2 ('US','CN'); el cotejo contra el Apéndice 4 vigente del Anexo 22
 * está PENDIENTE — si el catálogo real usa 3 letras, F3 requerirá el mapeo
 * vendoreado de ese apéndice. Cuotas de AntidumpingDuty: tabla con tasas
 * sintéticas (cotejo UPCI pendiente) — válida para paridad de mecanismo.
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { evaluate } from '../services/risk-scorer/engine';
import { buildVerifiedSignals, normalizarOperacion } from '../services/risk-scorer/signals';
import { DEFAULT_WEIGHTS } from '../services/risk-scorer/rules';
import type { DeclaradoInput, Signals } from '../services/risk-scorer/types';
import { parseArchivoM } from '../services/pedimento-reader/parser';
import { mapearOperaciones } from '../services/pedimento-reader/mapper';

const TENANT = 'parity-pedimentos-tenant';
const RFC_69B = 'AAA120730823'; // DEFINITIVO real en la tabla ingestada del CSV del SAT

let ok = 0, fail = 0;
const assert = (c: boolean, m: string) => { if (c) ok++; else { fail++; console.error(`  ❌ ${m}`); } };

const FIX = path.join(__dirname, 'fixtures', 'archivo-m');
const leer = (n: string) => fs.readFileSync(path.join(FIX, n), 'utf8');

/** Checklist completo en verde (idéntico a "todoBien" de risk-scorer.test.ts). */
const todoBien: DeclaradoInput = {
  mveTransmitida: true, expedienteKyc: true, expediente162VII: true,
  controlInterno81A: true, encargoConferido: true, padronImportadoresVigente: true,
  evidenciaNoms: true, incrementablesConSoporte: true, pagoConSoporteBancario: true,
  proveedorLocalizable: true, certOrigen9Elementos: true,
  expediente59V: { a: true, b: true, c: true, d: true, e: true, f: true, g: true, h: true },
};

interface Esperado { partida: number; fraccion: string; exposicion: number; escudoPct: number; banda: string; banderas: string[] }
interface Caso { archivo: string; declarado: DeclaradoInput; esperados: Esperado[]; nota: string }

/**
 * ══ BANDAS DECLARADAS ANTES DE CORRER — cálculo manual regla por regla ══
 *
 * A (limpio) + declarado todoBien:
 *   F1: VAL-01 valorUnitario presente→0; VAL-02/03/05 confirmados→0. F2-F8: 0.
 *   → exposición 0, escudo 100, VERDE.
 *
 * B (medio) + declarado vacío (tri-estado):
 *   op1 84715001/US: F1 = VAL-02(8)+VAL-03(4)+VAL-05(4)=16; F2 = PER-03(8);
 *     F8 = DOC-03(2) → 26. Escudo 0. 26<30 y escudo<50 → AMARILLO.
 *   op2 73181501/CN: + F3 = CUO-01(8)+CUO-03(4)=12 + F4 = PAD-01(8)
 *     [73181501 exige sector 15 siderúrgico del Anexo 10 y padronesActivos
 *     está sin declarar] → 46. 30≤46<60, escudo<50 → ROJO. Sin banderas.
 *
 * C (crítico) + declarado vacío, RFC 69-B DEFINITIVO real:
 *   op1 73181501/CN: F1 16; F2 = PER-01(22)+PER-03(8)=30 → cap peso 22;
 *     F3 12; F4 8 (sector 15); F8 2 → 60. Bandera LISTADO_69B → fila alta;
 *     escudo 0 <50 → ROJO_CRITICO.
 *   op2 99999999 (fracción INEXISTENTE — señal, no crash): F1 16; F2 22;
 *     F6 = CLA-01(5); F8 2 → 45. Bandera → ROJO_CRITICO.
 *     (F4/F3/F7 no evalúan: la fracción no existe en catálogo — el motor no
 *     resuelve sectores/cuotas/NOMs de una fracción inválida.)
 *
 * Corrección post-primer-run (documentada, no silenciosa): la 1a declaración
 * omitía F4-PAD-01 para 73181501 (sector 15 Anexo 10) y el formato con
 * espacios del número de pedimento del Anexo 22 (F8-DOC-01 disparaba por
 * formato). Ambos eran comportamiento CORRECTO del motor; se corrigieron la
 * predicción y el mapper (espacios), no las reglas.
 */
const CASOS: Caso[] = [
  {
    archivo: 'm3842001.074.txt', declarado: todoBien, nota: 'A limpio + checklist en verde',
    esperados: [{ partida: 1, fraccion: '84715001', exposicion: 0, escudoPct: 100, banda: 'VERDE', banderas: [] }],
  },
  {
    archivo: 'm3842002.074.txt', declarado: {}, nota: 'B medio + tri-estado sin responder',
    esperados: [
      { partida: 1, fraccion: '84715001', exposicion: 26, escudoPct: 0, banda: 'AMARILLO', banderas: [] },
      { partida: 2, fraccion: '73181501', exposicion: 46, escudoPct: 0, banda: 'ROJO', banderas: [] },
    ],
  },
  {
    archivo: 'm3842003.074.txt', declarado: {}, nota: 'C crítico: RFC 69-B real + cuota CN + fracción muerta',
    esperados: [
      { partida: 1, fraccion: '73181501', exposicion: 60, escudoPct: 0, banda: 'ROJO_CRITICO', banderas: ['LISTADO_69B'] },
      { partida: 2, fraccion: '99999999', exposicion: 45, escudoPct: 0, banda: 'ROJO_CRITICO', banderas: ['LISTADO_69B'] },
    ],
  },
];

async function main() {
  // Precondiciones (datos reales, no simulados)
  const row69b = await prisma.sat69B.findUnique({ where: { rfc: RFC_69B } });
  assert(row69b?.situacion === 'DEFINITIVO', `precondición: ${RFC_69B} es DEFINITIVO real en la tabla`);
  const cuota = await prisma.antidumpingDuty.findFirst({ where: { active: true, fractionCode: '73181501', countryOfOrigin: 'CN' } });
  assert(!!cuota, 'precondición: cuota activa 73181501/CN en AntidumpingDuty');
  assert(!(await prisma.fraction.findUnique({ where: { code: '99999999' } })), 'precondición: 99999999 NO existe en el catálogo');
  assert((await prisma.temporaryImport.count({ where: { tenantId: TENANT } })) === 0, 'precondición: tenant de paridad sin temporales');

  console.log('══ BANDAS DECLARADAS ANTES DE CORRER ══');
  for (const c of CASOS) for (const e of c.esperados) {
    console.log(`  ${c.archivo} p${e.partida} (${e.fraccion}) → ${e.banda} (exposición ${e.exposicion}, escudo ${e.escudoPct}%)`);
  }

  console.log('\n══ EJECUCIÓN (pipeline idéntico a POST /api/pedimentos/radar) ══');
  for (const caso of CASOS) {
    const contenido = leer(caso.archivo);
    const parseado = parseArchivoM(caso.archivo.replace(/\.txt$/, ''), contenido);
    assert(parseado.pedimentos.length === 1, `${caso.archivo}: 1 pedimento procesable`);
    assert(parseado.advertenciasIntegridad.filter(a => a.includes('ARITMETICA')).length === 0, `${caso.archivo}: aritmética limpia`);
    const ops = parseado.pedimentos.flatMap(p => mapearOperaciones(parseado.archivo, p));
    assert(ops.length === caso.esperados.length, `${caso.archivo}: ${caso.esperados.length} operaciones`);

    console.log(`\n${caso.archivo} — ${caso.nota}`);
    for (const esperado of caso.esperados) {
      const opx = ops.find(o => o.partida.numeroPartida === esperado.partida)!;
      assert(opx.operacion.fraccion === esperado.fraccion, `p${esperado.partida}: fracción ${esperado.fraccion}`);
      const op = normalizarOperacion(opx.operacion);
      const verificado = await buildVerifiedSignals(TENANT, op);
      const signals: Signals = { tipoSujeto: 'agente', operacion: op, declarado: caso.declarado, verificado };
      const r = evaluate(signals, DEFAULT_WEIGHTS);
      console.log(`  p${esperado.partida} ${esperado.fraccion} → exposición ${r.exposicion} | escudo ${r.escudoPct}% | ${r.banda} | [${r.banderas}]`);
      assert(r.exposicion === esperado.exposicion, `p${esperado.partida}: exposición esperada ${esperado.exposicion}, dio ${r.exposicion}`);
      assert(r.escudoPct === esperado.escudoPct, `p${esperado.partida}: escudo esperado ${esperado.escudoPct}, dio ${r.escudoPct}`);
      assert(r.banda === esperado.banda, `p${esperado.partida}: banda esperada ${esperado.banda}, dio ${r.banda}`);
      assert(JSON.stringify([...r.banderas].sort()) === JSON.stringify([...esperado.banderas].sort()), `p${esperado.partida}: banderas [${esperado.banderas}]`);

      if (esperado.fraccion === '99999999') {
        assert(verificado.fraccionValida === false, 'fracción muerta: señal verificada F6 (no crash, no silencio)');
        const f6 = r.factores.find(f => f.factor === 'CLASIFICACION')!;
        assert(f6.reglas.find(x => x.id === 'F6-CLA-01')!.puntos === 5, 'F6-CLA-01 puntúa 5 por fracción inexistente');
      }
      if (esperado.fraccion === '73181501' && caso.archivo.includes('3003')) {
        assert(!!verificado.cuotaActiva, 'cuota compensatoria detectada como verificada');
      }
      if (caso.archivo === 'm3842003.074.txt') {
        assert(verificado.en69B?.situacion === 'DEFINITIVO', 'match 69-B contra tabla real (verificado, no simulado)');
      }
    }
  }

  console.log(`\nPARIDAD LECTOR DE PEDIMENTOS: ${ok} ok, ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
