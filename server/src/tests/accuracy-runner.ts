/**
 * ADUANAI — Test de Precisión del Clasificador Arancelario
 *
 * Ejecutar: npx tsx src/tests/accuracy-runner.ts
 *
 * Requiere:
 * - Servidor corriendo en localhost:3001
 * - Un usuario registrado (usa las credenciales configuradas abajo)
 */

import { TEST_PRODUCTS, type TestProduct } from './accuracy-test-data';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// Config
// ============================================

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@aduanai.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test1234';
const CONCURRENCY = 2; // Requests simultáneos (evitar rate limits)
const DELAY_MS = 1000; // Delay entre batches

// ============================================
// Types
// ============================================

interface TestResult {
  id: number;
  description: string;
  category: string;
  chapter: string;
  expectedFraction: string;
  obtainedFraction: string | null;
  alternatives: string[];
  confidence: number | null;
  matchTop1: boolean;
  matchTop3: boolean;
  matchChapter: boolean;
  timeMs: number;
  error: string | null;
}

interface AccuracyReport {
  timestamp: string;
  totalProducts: number;
  tested: number;
  errors: number;
  accuracyTop1: number;
  accuracyTop3: number;
  accuracyChapter: number;
  avgTimeMs: number;
  medianTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  byCategory: Record<string, { total: number; top1: number; top3: number; pctTop1: number; pctTop3: number }>;
  byChapter: Record<string, { total: number; top1: number; top3: number; pctTop1: number }>;
  worstChapters: { chapter: string; total: number; top1: number; pctTop1: number }[];
  failures: {
    id: number;
    description: string;
    expected: string;
    obtained: string | null;
    alternatives: string[];
    confidence: number | null;
    chapter: string;
    category: string;
  }[];
  results: TestResult[];
}

// ============================================
// Helpers
// ============================================

async function apiRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function login(): Promise<string> {
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    }) as { token: string };
    return res.token;
  } catch {
    // Try registering
    console.log('  Login failed, registering test user...');
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: 'Test Accuracy',
        companyName: 'ADUANAI Test',
      }),
    }) as { token: string };
    return res.token;
  }
}

async function classify(token: string, description: string): Promise<{
  fraction: string | null;
  alternatives: string[];
  confidence: number | null;
}> {
  const res = await apiRequest('/classify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ description }),
  }) as { data: { fraction: { code: string }; alternatives: { code: string }[]; confidence: number } };

  const data = res.data;
  return {
    fraction: data?.fraction?.code || null,
    alternatives: (data?.alternatives || []).map((a: { code: string }) => a.code),
    confidence: data?.confidence ?? null,
  };
}

function normalizeFraction(code: string | null): string {
  if (!code) return '';
  return code.replace(/[.\-\s]/g, '').padEnd(8, '0').substring(0, 8);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Runner
// ============================================

async function runTest(token: string, product: TestProduct): Promise<TestResult> {
  const start = Date.now();

  try {
    const result = await classify(token, product.description);
    const timeMs = Date.now() - start;

    const obtained = normalizeFraction(result.fraction);
    const expected = normalizeFraction(product.expectedFraction);
    const alts = result.alternatives.map(normalizeFraction);

    const matchTop1 = obtained === expected;
    const matchTop3 = matchTop1 || alts.includes(expected);
    const matchChapter = obtained.substring(0, 2) === expected.substring(0, 2);

    return {
      id: product.id,
      description: product.description,
      category: product.category,
      chapter: product.chapter,
      expectedFraction: expected,
      obtainedFraction: obtained,
      alternatives: alts,
      confidence: result.confidence,
      matchTop1,
      matchTop3,
      matchChapter,
      timeMs,
      error: null,
    };
  } catch (err) {
    return {
      id: product.id,
      description: product.description,
      category: product.category,
      chapter: product.chapter,
      expectedFraction: normalizeFraction(product.expectedFraction),
      obtainedFraction: null,
      alternatives: [],
      confidence: null,
      matchTop1: false,
      matchTop3: false,
      matchChapter: false,
      timeMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runBatch(token: string, products: TestProduct[]): Promise<TestResult[]> {
  return Promise.all(products.map(p => runTest(token, p)));
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  ADUANAI — Test de Precisión del Clasificador');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Productos: ${TEST_PRODUCTS.length}`);
  console.log(`  API: ${API_BASE}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log('');

  // Login
  console.log('▸ Autenticando...');
  let token: string;
  try {
    token = await login();
    console.log('  ✓ Autenticado');
  } catch (err) {
    console.error('  ✗ Error de autenticación:', err instanceof Error ? err.message : err);
    console.error('  Asegúrate de que el servidor está corriendo y las credenciales son correctas.');
    process.exit(1);
  }

  // Run tests in batches
  console.log('');
  console.log('▸ Ejecutando clasificaciones...');
  const results: TestResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < TEST_PRODUCTS.length; i += CONCURRENCY) {
    const batch = TEST_PRODUCTS.slice(i, i + CONCURRENCY);
    const batchResults = await runBatch(token, batch);
    results.push(...batchResults);

    const done = Math.min(i + CONCURRENCY, TEST_PRODUCTS.length);
    const top1Count = results.filter(r => r.matchTop1).length;
    const errCount = results.filter(r => r.error).length;

    process.stdout.write(
      `\r  [${done}/${TEST_PRODUCTS.length}] Top-1: ${top1Count}/${done - errCount} (${((top1Count / Math.max(1, done - errCount)) * 100).toFixed(1)}%) | Errors: ${errCount}`
    );

    if (i + CONCURRENCY < TEST_PRODUCTS.length) {
      await sleep(DELAY_MS);
    }
  }

  const totalTime = Date.now() - startTime;
  console.log('');
  console.log(`  ✓ Completado en ${(totalTime / 1000).toFixed(1)}s`);

  // Generate report
  console.log('');
  console.log('▸ Generando reporte...');

  const tested = results.filter(r => !r.error);
  const errors = results.filter(r => r.error);
  const times = tested.map(r => r.timeMs).sort((a, b) => a - b);

  // By category
  const byCategory: Record<string, { total: number; top1: number; top3: number; pctTop1: number; pctTop3: number }> = {};
  for (const r of tested) {
    if (!byCategory[r.category]) byCategory[r.category] = { total: 0, top1: 0, top3: 0, pctTop1: 0, pctTop3: 0 };
    byCategory[r.category].total++;
    if (r.matchTop1) byCategory[r.category].top1++;
    if (r.matchTop3) byCategory[r.category].top3++;
  }
  for (const cat of Object.values(byCategory)) {
    cat.pctTop1 = cat.total > 0 ? Math.round((cat.top1 / cat.total) * 100) : 0;
    cat.pctTop3 = cat.total > 0 ? Math.round((cat.top3 / cat.total) * 100) : 0;
  }

  // By chapter
  const byChapter: Record<string, { total: number; top1: number; top3: number; pctTop1: number }> = {};
  for (const r of tested) {
    if (!byChapter[r.chapter]) byChapter[r.chapter] = { total: 0, top1: 0, top3: 0, pctTop1: 0 };
    byChapter[r.chapter].total++;
    if (r.matchTop1) byChapter[r.chapter].top1++;
    if (r.matchTop3) byChapter[r.chapter].top3++;
  }
  for (const ch of Object.values(byChapter)) {
    ch.pctTop1 = ch.total > 0 ? Math.round((ch.top1 / ch.total) * 100) : 0;
  }

  // Worst chapters
  const worstChapters = Object.entries(byChapter)
    .map(([chapter, data]) => ({ chapter, ...data }))
    .filter(c => c.total >= 2)
    .sort((a, b) => a.pctTop1 - b.pctTop1)
    .slice(0, 10);

  // Failures
  const failures = tested
    .filter(r => !r.matchTop1)
    .map(r => ({
      id: r.id,
      description: r.description,
      expected: r.expectedFraction,
      obtained: r.obtainedFraction,
      alternatives: r.alternatives,
      confidence: r.confidence,
      chapter: r.chapter,
      category: r.category,
    }));

  const top1Count = tested.filter(r => r.matchTop1).length;
  const top3Count = tested.filter(r => r.matchTop3).length;
  const chapterCount = tested.filter(r => r.matchChapter).length;

  const report: AccuracyReport = {
    timestamp: new Date().toISOString(),
    totalProducts: TEST_PRODUCTS.length,
    tested: tested.length,
    errors: errors.length,
    accuracyTop1: tested.length > 0 ? Math.round((top1Count / tested.length) * 1000) / 10 : 0,
    accuracyTop3: tested.length > 0 ? Math.round((top3Count / tested.length) * 1000) / 10 : 0,
    accuracyChapter: tested.length > 0 ? Math.round((chapterCount / tested.length) * 1000) / 10 : 0,
    avgTimeMs: times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0,
    medianTimeMs: times.length > 0 ? times[Math.floor(times.length / 2)] : 0,
    minTimeMs: times.length > 0 ? times[0] : 0,
    maxTimeMs: times.length > 0 ? times[times.length - 1] : 0,
    byCategory,
    byChapter,
    worstChapters,
    failures,
    results,
  };

  // Save report
  const reportDir = path.resolve(__dirname, '../../../test-results');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'accuracy-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  RESULTADOS');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Productos testeados: ${tested.length} / ${TEST_PRODUCTS.length}`);
  console.log(`  Errores de API:      ${errors.length}`);
  console.log('');
  console.log(`  ✦ Precisión Top-1:    ${report.accuracyTop1}%  (${top1Count}/${tested.length})`);
  console.log(`  ✦ Precisión Top-3:    ${report.accuracyTop3}%  (${top3Count}/${tested.length})`);
  console.log(`  ✦ Precisión Capítulo: ${report.accuracyChapter}%  (${chapterCount}/${tested.length})`);
  console.log('');
  console.log(`  Tiempo promedio:  ${report.avgTimeMs}ms`);
  console.log(`  Tiempo mediana:   ${report.medianTimeMs}ms`);
  console.log(`  Tiempo min/max:   ${report.minTimeMs}ms / ${report.maxTimeMs}ms`);
  console.log('');

  // Category breakdown
  console.log('  ─── Por Categoría ───');
  for (const [cat, data] of Object.entries(byCategory).sort((a, b) => a[1].pctTop1 - b[1].pctTop1)) {
    const bar = '█'.repeat(Math.round(data.pctTop1 / 5)) + '░'.repeat(20 - Math.round(data.pctTop1 / 5));
    console.log(`  ${cat.padEnd(15)} ${bar} ${data.pctTop1}% (${data.top1}/${data.total})`);
  }
  console.log('');

  // Worst chapters
  if (worstChapters.length > 0) {
    console.log('  ─── Capítulos con peor rendimiento ───');
    for (const ch of worstChapters.slice(0, 5)) {
      console.log(`  Cap. ${ch.chapter.padEnd(4)} → ${ch.pctTop1}% (${ch.top1}/${ch.total})`);
    }
    console.log('');
  }

  // Failures
  if (failures.length > 0) {
    console.log(`  ─── Fallos (${failures.length}) ───`);
    for (const f of failures.slice(0, 15)) {
      console.log(`  #${String(f.id).padEnd(3)} ${f.description.substring(0, 50).padEnd(52)}`);
      console.log(`       Esperado: ${f.expected}  Obtenido: ${f.obtained || 'ERROR'}  Conf: ${f.confidence || '-'}%`);
    }
    if (failures.length > 15) {
      console.log(`  ... y ${failures.length - 15} fallos más (ver reporte completo)`);
    }
  }

  console.log('');
  console.log(`  Reporte guardado en: ${reportPath}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
