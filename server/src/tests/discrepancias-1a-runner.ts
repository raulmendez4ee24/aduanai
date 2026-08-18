/**
 * CENSO DE DISCREPANCIAS LLM↔CANON — Fase 1a de la Frontera Canónica.
 *
 * Ejecutar:  npx tsx src/tests/discrepancias-1a-runner.ts [concurrencia=2] [limit]
 *
 * NO es una medición de accuracy (la reconciliación no toca fraction.code por
 * construcción; el prompt está INTACTO — 1a). Mide con qué frecuencia y en qué
 * campos la respuesta del LLM contradice al catálogo/tablas canónicas: la tasa
 * que decide si la Fase 1b (recortar el JSON del prompt) vale la pena.
 *
 * Reglas de medición resiliente adoptadas:
 *  - mismo patrón del direct-runner: classifyProduct en proceso, temp 0 (la del
 *    servicio), concurrencia 2, dataset completo accuracy-test-data (99);
 *  - corrida válida = 99/99 con respuesta del modelo. Candado/SIN_CANDIDATO son
 *    resultados válidos (falla cerrada honesta, sin reconciliación); errores de
 *    red/crédito se reintentan (3x backoff) y si persisten INVALIDAN la corrida;
 *  - checkpoint POR CASO (mismo dataset/params): reanudar no repite lo hecho.
 *
 * Artefactos: discrepancias-1a-<fecha>.checkpoint.json (por caso) y
 *             discrepancias-1a-<fecha>.json (agregado por campo).
 */

import * as fs from 'fs';
import * as path from 'path';
import { TEST_PRODUCTS } from './accuracy-test-data';
import { classifyProduct } from '../services/classifier';
import { reconciliarClasificacion, type DiscrepanciaLLM } from '../services/clasificador-reconciliacion';
import { prisma } from '../lib/prisma';

const FECHA = '2026-08-18';
const CHECKPOINT = path.join(__dirname, `discrepancias-1a-${FECHA}.checkpoint.json`);
const SALIDA = path.join(__dirname, `discrepancias-1a-${FECHA}.json`);

interface CasoRow {
  id: number;
  category: string;
  fraccionPredicha: string | null;
  resultado: 'clasificado' | 'falla_cerrada';   // candado/SIN_CANDIDATO = falla cerrada válida
  discrepancias: DiscrepanciaLLM[];
  ms: number;
}

/** 'alternatives[2].code' → 'alternatives[].code' (familia de campo). */
function familia(campo: string): string {
  return campo.replace(/\[\d+\]/, '[]');
}

function cargarCheckpoint(): Record<number, CasoRow> {
  if (!fs.existsSync(CHECKPOINT)) return {};
  return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
}

async function runCase(t: (typeof TEST_PRODUCTS)[number]): Promise<CasoRow> {
  const t0 = Date.now();
  const MAX_REINTENTOS = 5; // caídas de red reales observadas (18-ago): backoff 15s×intento
  for (let intento = 1; ; intento++) {
    try {
      const bruto = await classifyProduct(t.description);
      const { discrepancias } = await reconciliarClasificacion(bruto);
      return {
        id: t.id,
        category: t.category,
        fraccionPredicha: bruto.fraction.code.replace(/\D/g, ''),
        resultado: 'clasificado',
        discrepancias,
        ms: Date.now() - t0,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const fallaCerrada =
        /no produjo una fracción válida del catálogo/.test(msg) ||   // candado final
        /no encontró en el catálogo un candidato aplicable/.test(msg) || // SIN_CANDIDATO
        /La descripción es insuficiente/.test(msg);                  // validación de entrada
      if (fallaCerrada) {
        return { id: t.id, category: t.category, fraccionPredicha: null, resultado: 'falla_cerrada', discrepancias: [], ms: Date.now() - t0 };
      }
      // Error de red/crédito/timeout: reintento con backoff; si persiste,
      // lanzar — la corrida queda INVÁLIDA (regla 2), no se maquilla.
      if (intento >= MAX_REINTENTOS) {
        throw new Error(`Caso ${t.id}: error no-clasificatorio tras ${MAX_REINTENTOS} intentos — corrida inválida. Motivo: ${msg}`);
      }
      await new Promise(r => setTimeout(r, 15000 * intento));
    }
  }
}

async function main() {
  const concurrencia = parseInt(process.argv[2] ?? '2', 10);
  const limit = process.argv[3] ? parseInt(process.argv[3], 10) : TEST_PRODUCTS.length;
  const casos = TEST_PRODUCTS.slice(0, limit);

  const hechos = cargarCheckpoint();
  const pendientes = casos.filter(c => !hechos[c.id]);
  console.log(`Censo 1a: ${casos.length} casos (${Object.keys(hechos).length} en checkpoint, ${pendientes.length} pendientes, concurrencia ${concurrencia})`);

  let i = 0;
  async function worker() {
    while (i < pendientes.length) {
      const caso = pendientes[i++]!;
      const row = await runCase(caso);
      hechos[caso.id] = row;
      fs.writeFileSync(CHECKPOINT, JSON.stringify(hechos, null, 1));
      const nDisc = row.discrepancias.length;
      console.log(`  [${Object.keys(hechos).length}/${casos.length}] #${caso.id} ${row.resultado} ${row.fraccionPredicha ?? '—'} · ${nDisc} discrepancia(s) · ${(row.ms / 1000).toFixed(1)}s`);
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, worker));

  // ── Agregado por familia de campo ──
  const filas = casos.map(c => hechos[c.id]!).filter(Boolean);
  const clasificados = filas.filter(f => f.resultado === 'clasificado');
  const porCampo = new Map<string, { casos: Set<number>; ejemplos: DiscrepanciaLLM[] }>();
  for (const f of clasificados) {
    for (const d of f.discrepancias) {
      const fam = familia(d.campo);
      const cur = porCampo.get(fam) ?? { casos: new Set<number>(), ejemplos: [] };
      cur.casos.add(f.id);
      if (cur.ejemplos.length < 3) cur.ejemplos.push(d);
      porCampo.set(fam, cur);
    }
  }

  const resumen = {
    fecha: FECHA,
    proposito: 'Censo de discrepancias LLM↔canon (Fase 1a) — decide si 1b vale la pena. NO es medición de accuracy.',
    params: { runner: 'in-process classifyProduct + reconciliarClasificacion', temp: 0, concurrencia, dataset: 'accuracy-test-data.ts (99)', prompt: 'INTACTO (1a)' },
    totalCasos: filas.length,
    clasificados: clasificados.length,
    fallasCerradas: filas.length - clasificados.length,
    casosConAlgunaDiscrepancia: clasificados.filter(f => f.discrepancias.length > 0).length,
    porCampo: Object.fromEntries(
      [...porCampo.entries()]
        .sort((a, b) => b[1].casos.size - a[1].casos.size)
        .map(([campo, v]) => [campo, {
          casosAfectados: v.casos.size,
          pctDeClasificados: Math.round((v.casos.size / clasificados.length) * 1000) / 10,
          ejemplos: v.ejemplos,
        }]),
    ),
    porCaso: filas.map(f => ({ id: f.id, resultado: f.resultado, nDiscrepancias: f.discrepancias.length, campos: f.discrepancias.map(d => familia(d.campo)) })),
  };

  fs.writeFileSync(SALIDA, JSON.stringify(resumen, null, 2));
  console.log(`\nArtefacto: ${SALIDA}`);
  console.log(`Clasificados: ${resumen.clasificados}/${resumen.totalCasos} · con discrepancia: ${resumen.casosConAlgunaDiscrepancia}`);
  for (const [campo, v] of Object.entries(resumen.porCampo)) {
    console.log(`  ${campo}: ${(v as { casosAfectados: number }).casosAfectados} casos (${(v as { pctDeClasificados: number }).pctDeClasificados}%)`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
