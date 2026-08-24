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

// Ruta anclada al ARCHIVO, no al cwd — el guard corre igual desde server/,
// desde la raíz del repo, o dentro del contenedor (revisión 24-ago).
const CLIENT_SRC = path.resolve(__dirname, '../../../client/src');

// Las dos mitades de la clase rota, cada una tolerante a variantes
// (comillas simples/dobles, e|ev|event, target|currentTarget,
// parseFloat|Number, cualquier orden de atributos):
const VALUE_FALSY = /value=\{[^}]+\|\|\s*(?:''|"")\s*\}/g;
const PARSE_POR_TECLA = /(?:parseFloat|Number)\(\s*(?:e|ev|event)\.(?:target|currentTarget)\.value\s*\)/g;
const VENTANA = 350;

// Un archivo viola el guard si ambas mitades co-ocurren a menos de VENTANA
// chars (en cualquier orden) SIN que el tramo intermedio cierre el elemento
// JSX (`/>` o `</`) — así un input de TEXTO legítimo con `|| ''` junto a un
// input numérico sano no dispara falso positivo.
function violaClaseRota(contenido: string): boolean {
  const posValue = [...contenido.matchAll(VALUE_FALSY)].map(m => m.index ?? 0);
  const posParse = [...contenido.matchAll(PARSE_POR_TECLA)].map(m => m.index ?? 0);
  for (const a of posValue) {
    for (const b of posParse) {
      const [ini, fin] = a < b ? [a, b] : [b, a];
      if (fin - ini > VENTANA) continue;
      const entre = contenido.slice(ini, fin);
      if (!entre.includes('/>') && !entre.includes('</')) return true;
    }
  }
  return false;
}

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

test('ningún archivo del cliente reintroduce `value={x || \'\'}` + parse por tecla', () => {
  const offenders = files.filter(f => violaClaseRota(fs.readFileSync(f, 'utf8')));
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
