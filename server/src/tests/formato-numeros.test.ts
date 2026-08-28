/**
 * Formato de números en pantalla (cuarta revisión, 27-ago-2026).
 *
 * Dos clases de bug que la revisión vio en producción:
 *   P1 "confianza 9800%"  → el porcentaje se multiplicaba dos veces.
 *   P1 "451.1199999999999 Kg" → saldo flotante crudo, sin redondear en origen.
 *
 * Este test cubre los helpers canónicos (`server/src/lib/numeros.ts`), el
 * formateador del cliente (`client/src/lib/format.ts`) y un guard de código
 * que falla si `confidence` vuelve a multiplicarse por 100 en cualquier lado.
 *
 * Ejecutar:  npm run test:formato   (no necesita base de datos)
 */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { aDecimales, sumaRedondeada, porcentajeConfianza, formatearConfianza, montoConMoneda } from '../lib/numeros';

let pasadas = 0, falladas = 0;
function prueba(nombre: string, fn: () => void) {
  try { fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

// El formateador del cliente se carga por ruta en runtime (tsx lo transpila);
// no se importa con `import` porque vive fuera del rootDir de server/.
const RUTA_FORMAT = path.resolve(__dirname, '../../../client/src/lib/format.ts');
const clienteFormat = require(RUTA_FORMAT) as {
  formatConfidence: (v: number | null | undefined, decimals?: number) => string;
  formatPercentage: (v: number | null | undefined, o?: { scaled?: boolean; decimals?: number }) => string;
};

const CLIENT_SRC = path.resolve(__dirname, '../../../client/src');
const SERVER_SRC = path.resolve(__dirname, '..');

function archivos(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') out.push(...archivos(p, exts)); }
    else if (exts.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

console.log('— confianza: UNA sola conversión (bug "9800%") —');

prueba('0.88 (escala legacy 0-1) → 88%', () => {
  assert.equal(porcentajeConfianza(0.88), 88);
  assert.equal(formatearConfianza(0.88), '88%');
});

prueba('88 (escala canónica 0-100) → 88%, no 8800%', () => {
  assert.equal(porcentajeConfianza(88), 88);
  assert.equal(formatearConfianza(88), '88%');
});

prueba('98 → 98% (el caso exacto de la bandeja: pintaba 9800%)', () => {
  assert.equal(porcentajeConfianza(98), 98);
  assert.equal(formatearConfianza(98), '98%');
});

prueba('null / undefined / NaN → sin dato ("—"), nunca 0%', () => {
  assert.equal(porcentajeConfianza(null), null);
  assert.equal(porcentajeConfianza(undefined), null);
  assert.equal(porcentajeConfianza(NaN), null);
  assert.equal(formatearConfianza(null), '—');
  assert.equal(formatearConfianza(undefined), '—');
});

prueba('0 es dato válido (0%) y >100 se acota a 100%', () => {
  assert.equal(porcentajeConfianza(0), 0);
  assert.equal(formatearConfianza(0), '0%');
  assert.equal(porcentajeConfianza(9800), 100);
});

prueba('formatConfidence del cliente no multiplica (88 → "88", 98 → "98", null → "—")', () => {
  assert.equal(clienteFormat.formatConfidence(88), '88');
  assert.equal(clienteFormat.formatConfidence(98), '98');
  assert.equal(clienteFormat.formatConfidence(87.66666), '88');
  assert.equal(clienteFormat.formatConfidence(null), '—');
  assert.equal(clienteFormat.formatConfidence(undefined), '—');
});

prueba('guard: nadie vuelve a multiplicar confidence por 100 (server ni client)', () => {
  const patron = /confidence[^;\n]{0,40}\*\s*100|100\s*\*\s*[^;\n]{0,20}confidence/i;
  const sospechosos: string[] = [];
  for (const f of [...archivos(SERVER_SRC, ['.ts']), ...archivos(CLIENT_SRC, ['.ts', '.tsx'])]) {
    if (f.endsWith('formato-numeros.test.ts')) continue;
    const txt = fs.readFileSync(f, 'utf8');
    for (const linea of txt.split('\n')) {
      if (patron.test(linea)) sospechosos.push(`${path.relative(path.resolve(__dirname, '../../..'), f)}: ${linea.trim().slice(0, 120)}`);
    }
  }
  assert.deepEqual(sospechosos, [], `confidence × 100 reincidió:\n${sospechosos.join('\n')}`);
});

console.log('— saldos: redondeo en el origen (bug "451.1199999999999 Kg") —');

prueba('0.1 + 0.2 → 0.3 (no 0.30000000000000004)', () => {
  assert.equal(aDecimales(0.1 + 0.2), 0.3);
  assert.equal(sumaRedondeada([0.1, 0.2]), 0.3);
});

prueba('caso real de la revisión: saldo 451.12 Kg y 55.18 Kg salían con cola', () => {
  // 10 lotes de 45.112 Kg (así se arma el saldo de una parte en el PEPS).
  const lotes = Array.from({ length: 10 }, () => 45.112);
  const crudo = lotes.reduce((a, b) => a + b, 0);
  assert.notEqual(crudo, 451.12, 'la suma cruda sí traía cola: el bug era real');
  assert.equal(sumaRedondeada(lotes), 451.12);
  // Saldo = importado − descargado acumulado (1055.18 − 1000 = 55.180000000000064).
  const saldoCrudo = 1055.18 - 1000;
  assert.notEqual(saldoCrudo, 55.18);
  assert.equal(aDecimales(saldoCrudo), 55.18);
});

prueba('suma de 40 lotes con decimales: sin cola de flotante y ≤ 6 decimales', () => {
  const lotes = Array.from({ length: 40 }, (_, i) => aDecimales(0.1 + i / 1000));
  const suma = sumaRedondeada(lotes);
  const exacto = Math.round(lotes.reduce((a, b) => a + b * 1e6, 0)) / 1e6;
  assert.equal(suma, exacto);
  assert.ok(String(suma).split('.')[1]?.length ?? 0, 'la suma tiene parte decimal (el escenario es representativo)');
  assert.ok((String(suma).split('.')[1]?.length ?? 0) <= 6, `${suma} trae más de 6 decimales`);
});

prueba('ningún resultado de aDecimales pasa de 6 decimales (1000 restas al azar)', () => {
  let semilla = 42;
  const rnd = () => { semilla = (semilla * 1664525 + 1013904223) % 2 ** 32; return semilla / 2 ** 32; };
  for (let i = 0; i < 1000; i++) {
    const a = aDecimales(rnd() * 10000, 3);
    const b = aDecimales(rnd() * a, 3);
    const saldo = aDecimales(a - b);
    const dec = String(saldo).split('.')[1]?.length ?? 0;
    assert.ok(dec <= 6, `${a} − ${b} = ${saldo} (${dec} decimales)`);
  }
});

prueba('aDecimales tolera basura (NaN/Infinity → 0) y conserva enteros', () => {
  assert.equal(aDecimales(NaN), 0);
  assert.equal(aDecimales(Infinity), 0);
  assert.equal(aDecimales(750), 750);
  assert.equal(aDecimales(-0.30000000000000004), -0.3);
});

console.log('— montos —');

prueba('montoConMoneda: 2 decimales y divisa; sin divisa registrada no se inventa', () => {
  assert.equal(montoConMoneda(20000.5, 'USD'), '20,000.50 USD');
  assert.equal(montoConMoneda(1234567.891, 'MXN'), '1,234,567.89 MXN');
  assert.equal(montoConMoneda(1000, ''), '1,000.00');
  assert.equal(montoConMoneda(1000, null), '1,000.00');
});

console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
process.exit(falladas > 0 ? 1 : 0);
