/**
 * ANÁLISIS DE DISPARO del pase RGI 6 específica-vs-residual sobre el set de
 * accuracy — determinista, SIN LLM y SIN costo.
 *
 * Ejecutar:  npx tsx src/tests/rgi6-disparo-baseline.ts [baseline.json]
 *
 * Por qué existe. Medir el set completo cuesta ~50 s por caso (99 casos ≈ 45
 * min por corrida y su factura). Pero la compuerta del pase es 100%
 * determinista: si `evaluarResidual` dice "no residual" o `candidataEspecifica`
 * devuelve null, el pase NO corre y la clasificación es BIT A BIT la misma que
 * sin la regla. Este script recorre las predicciones de la línea base y dice
 * exactamente en qué casos la compuerta abre. Solo esos casos pueden mover el
 * top-1, y solo esos hay que volver a medir con el LLM real.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TEST_PRODUCTS } from './accuracy-test-data';
import { prisma } from '../lib/prisma';
import { subpartidasHermanas } from '../services/subpartidas-hermanas';
import { candidataEspecifica, evaluarResidual } from '../services/rgi6-especifica-residual';

interface BaselineRow { id: number; description: string; expected: string; predicted: string | null }

async function main() {
  const archivo = process.argv[2] ?? path.join(__dirname, 'baseline-v2.2-temp0-2026-07-04.json');
  const baseline = JSON.parse(fs.readFileSync(archivo, 'utf8')) as { rows: BaselineRow[] };
  const porId = new Map(TEST_PRODUCTS.map(t => [t.id, t]));

  const disparan: { id: number; descripcion: string; predicha: string; esperada: string; candidata: string; motivo: string }[] = [];
  let sinPrediccion = 0;
  let noResidual = 0;
  let sinCandidata = 0;

  for (const row of baseline.rows) {
    if (!row.predicted) { sinPrediccion++; continue; }
    const hermanas = await subpartidasHermanas(row.predicted);
    const det = evaluarResidual(row.predicted, hermanas);
    if (!det.esResidual) { noResidual++; continue; }
    const cand = candidataEspecifica({
      descripcion: porId.get(row.id)?.description ?? row.description,
      codigoElegido: row.predicted,
      hermanas,
    });
    if (!cand) { sinCandidata++; continue; }
    disparan.push({
      id: row.id,
      descripcion: row.description,
      predicha: row.predicted,
      esperada: row.expected,
      candidata: cand.subpartida.codeFormatted,
      motivo: cand.motivo,
    });
  }

  console.log('\n══════ DISPARO DEL PASE RGI 6 SOBRE EL SET DE ACCURACY ══════');
  console.log(`baseline: ${path.basename(archivo)}`);
  console.log(`casos: ${baseline.rows.length}`);
  console.log(`  sin predicción (candado/sin_candidato en la base): ${sinPrediccion}`);
  console.log(`  fracción NO residual → el pase no corre:           ${noResidual}`);
  console.log(`  residual pero SIN candidata específica:            ${sinCandidata}`);
  console.log(`  DISPARAN el pase:                                  ${disparan.length}`);
  for (const d of disparan) {
    console.log(`\n  #${d.id} ${d.descripcion}`);
    console.log(`     predicha ${d.predicha} (esperada ${d.esperada}) → candidata ${d.candidata}`);
    console.log(`     ${d.motivo}`);
  }
  const out = `/tmp/rgi6-disparo-${Date.now()}.json`;
  fs.writeFileSync(out, JSON.stringify({ archivo, sinPrediccion, noResidual, sinCandidata, disparan }, null, 2));
  console.log(`\ndetalle: ${out}`);
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
