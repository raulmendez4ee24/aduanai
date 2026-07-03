/**
 * Medición DIRECTA de precisión del Clasificador (2ª Ola, Etapa 1.3).
 *
 * Ejecutar:  npx tsx src/tests/accuracy-direct-runner.ts [concurrencia=2]
 *
 * Llama a classifyProduct (servicio) directamente — sin servidor, sin
 * persistir Classification (medición pura; prompt y candados INTACTOS).
 * Set: accuracy-test-data.ts auditado/corregido 2026-07-03 contra el catálogo.
 *
 * Taxonomía de error (acordada):
 *  - candado:               classifyProduct lanzó falla-cerrada (código inválido atrapado)
 *  - capitulo_equivocado:   los 2 primeros dígitos no coinciden
 *  - residual_incorrecta:   predijo residual (.99/.00) cuando la esperada es específica
 *  - especifica_incorrecta: predijo una específica que no es la esperada
 */
import * as fs from 'fs';
import { TEST_PRODUCTS } from './accuracy-test-data';
import { classifyProduct } from '../services/classifier';
import { prisma } from '../lib/prisma';

const clean = (c: string) => c.replace(/\D/g, '');
const isResidual = (c: string) => /(99|00)$/.test(clean(c));

interface Row {
  id: number; category: string; description: string;
  expected: string; accepted: string[];
  predicted: string | null; confidence: number | null;
  hit: boolean; hitTop3: boolean; chapterOk: boolean;
  errorType: string | null; verifierFallback: boolean; ms: number;
}

async function runCase(t: (typeof TEST_PRODUCTS)[number]): Promise<Row> {
  const accepted = [t.expectedFraction, ...(t.acceptedFractions ?? [])].map(clean);
  const t0 = Date.now();
  try {
    const r = await classifyProduct(t.description);
    const predicted = clean(r.fraction.code);
    const alts = (r.alternatives ?? []).map(a => clean(a.code));
    const hit = accepted.includes(predicted);
    const hitTop3 = hit || alts.slice(0, 2).some(a => accepted.includes(a));
    const chapterOk = predicted.slice(0, 2) === clean(t.expectedFraction).slice(0, 2);
    let errorType: string | null = null;
    if (!hit) {
      if (!chapterOk) errorType = 'capitulo_equivocado';
      else if (isResidual(predicted) && !isResidual(t.expectedFraction)) errorType = 'residual_incorrecta';
      else errorType = 'especifica_incorrecta';
    }
    return {
      id: t.id, category: t.category, description: t.description,
      expected: clean(t.expectedFraction), accepted,
      predicted, confidence: r.confidence,
      hit, hitTop3, chapterOk, errorType,
      verifierFallback: !!r.verifierFallback, ms: Date.now() - t0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const candado = /no produjo una fracción válida del catálogo/.test(msg);
    return {
      id: t.id, category: t.category, description: t.description,
      expected: clean(t.expectedFraction), accepted,
      predicted: null, confidence: null,
      hit: false, hitTop3: false, chapterOk: false,
      errorType: candado ? 'candado' : `excepcion: ${msg.slice(0, 80)}`,
      verifierFallback: false, ms: Date.now() - t0,
    };
  }
}

async function main() {
  const conc = Number(process.argv[2] ?? 2);
  const cases = TEST_PRODUCTS.filter(t => !t.skip);
  const skipped = TEST_PRODUCTS.filter(t => t.skip);
  console.log(`Casos a medir: ${cases.length} (excluidos: ${skipped.map(s => `#${s.id}`).join(', ') || 'ninguno'}) | concurrencia ${conc}`);

  const rows: Row[] = [];
  for (let i = 0; i < cases.length; i += conc) {
    const batch = cases.slice(i, i + conc);
    const rs = await Promise.all(batch.map(runCase));
    rows.push(...rs);
    for (const r of rs) console.log(`#${r.id} ${r.hit ? '✅' : `❌ ${r.errorType}`} pred=${r.predicted ?? '—'} exp=${r.expected} conf=${r.confidence ?? '—'}${r.verifierFallback ? ' [fallback]' : ''}`);
  }

  const hits = rows.filter(r => r.hit);
  const misses = rows.filter(r => !r.hit);
  const byType: Record<string, number> = {};
  for (const m of misses) byType[m.errorType ?? '?'] = (byType[m.errorType ?? '?'] ?? 0) + 1;
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
  const byCat: Record<string, { n: number; ok: number }> = {};
  for (const r of rows) { byCat[r.category] = byCat[r.category] ?? { n: 0, ok: 0 }; byCat[r.category].n++; if (r.hit) byCat[r.category].ok++; }

  const summary = {
    fecha: new Date().toISOString(),
    casos: rows.length,
    top1: `${hits.length}/${rows.length} = ${(hits.length / rows.length * 100).toFixed(1)}%`,
    top3: `${rows.filter(r => r.hitTop3).length}/${rows.length} = ${(rows.filter(r => r.hitTop3).length / rows.length * 100).toFixed(1)}%`,
    capituloOk: `${rows.filter(r => r.chapterOk).length}/${rows.length} = ${(rows.filter(r => r.chapterOk).length / rows.length * 100).toFixed(1)}%`,
    erroresPorTipo: byType,
    confianzaPromedioAciertos: avg(hits.map(h => h.confidence!).filter(Number.isFinite)),
    confianzaPromedioErrores: avg(misses.map(m => m.confidence!).filter(x => Number.isFinite(x))),
    fallbacksDelCandado: rows.filter(r => r.verifierFallback).length,
    porCategoria: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, `${v.ok}/${v.n}`])),
    tiempoPromedioMs: avg(rows.map(r => r.ms)),
  };
  console.log('\n══════ LÍNEA BASE CLASIFICADOR v2 ══════');
  console.log(JSON.stringify(summary, null, 2));
  const out = `/tmp/accuracy-v2-${Date.now()}.json`;
  fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
  console.log('detalle:', out);
  await prisma.$disconnect();
}
main();
