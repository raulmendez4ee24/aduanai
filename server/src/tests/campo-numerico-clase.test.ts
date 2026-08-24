/**
 * Guard anti-reincidencia de la clase D4 (auditoría 21-ago, cerrada 24-ago).
 *
 * Ejecutar:  npx tsx src/tests/campo-numerico-clase.test.ts
 *
 * La clase rota era `value={x || ''}` + `parseFloat(e.target.value)` por
 * tecla en el MISMO input: el 0 es falsy → al teclear "0" el input se repinta
 * vacío y "0.02"/".02" terminan en "2". Vivía en GlosaSimulator (3 inputs) y
 * OrigenTMEC (fila de materiales + NumInput). El reemplazo canónico es
 * client/src/components/ui/CampoNumerico.tsx (hook + componente).
 *
 * Este guard barre TODO client/src y falla si el idiom reaparece — un input
 * numérico nuevo debe usar CampoNumerico/useCampoNumerico, no reinventar el
 * patrón roto.
 */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT_SRC = path.resolve(process.cwd(), '../client/src');

// `value={… || ''}` seguido (mismo elemento, ventana corta) de parseFloat
// sobre el valor tecleado. La ventana de 300 chars cubre atributos intermedios
// sin cruzar a otro input.
const CLASE_ROTA = /value=\{[^}]+\|\|\s*''\s*\}[\s\S]{0,300}?parseFloat\(e\.target\.value\)/;

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
}

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nGuard clase D4 (campo numérico)');

const files: string[] = [];
walk(CLIENT_SRC, files);

test(`el barrido encuentra el árbol del cliente (${files.length} archivos)`, () => {
  assert.ok(files.length > 20, `solo ${files.length} archivos — ¿cambió la ruta client/src?`);
});

test('ningún archivo del cliente reintroduce `value={x || \'\'}` + parseFloat por tecla', () => {
  const offenders = files.filter(f => CLASE_ROTA.test(fs.readFileSync(f, 'utf8')));
  assert.equal(
    offenders.length, 0,
    `clase D4 reintroducida en: ${offenders.map(f => path.relative(CLIENT_SRC, f)).join(', ')} — usa CampoNumerico/useCampoNumerico (components/ui)`,
  );
});

test('CampoNumerico existe y sigue exportado desde components/ui', () => {
  const barrel = fs.readFileSync(path.join(CLIENT_SRC, 'components/ui/index.ts'), 'utf8');
  assert.match(barrel, /export \{ CampoNumerico, useCampoNumerico \}/);
});

console.log(`\n${passed} passed, 0 failed\n`);
