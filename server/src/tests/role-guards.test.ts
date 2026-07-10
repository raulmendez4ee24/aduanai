/** Regresión de casing y ejecución de requireRole. Sin DB. */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { requireRole } from '../middlewares/auth';

const VALID_ROLES = new Set(['ADMIN', 'USER', 'VIEWER', 'SUPERADMIN']);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(full) : entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nRole guards');

test('todos los requireRole del repo usan valores exactos del enum Prisma', () => {
  const invalid: string[] = [];
  for (const file of routeFiles(path.resolve(process.cwd(), 'src/routes'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of source.matchAll(/requireRole\(([^)]*)\)/g)) {
      for (const arg of call[1]!.matchAll(/['"]([^'"]+)['"]/g)) {
        if (!VALID_ROLES.has(arg[1]!)) invalid.push(`${path.relative(process.cwd(), file)}:${arg[1]}`);
      }
    }
  }
  assert.deepEqual(invalid, []);
});

test('Risk Scorer protege pesos globales con SUPERADMIN', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/risk.ts'), 'utf8');
  assert.match(source, /router\.put\('\/weights', requireRole\('SUPERADMIN'\)/);
  assert.doesNotMatch(source, /requireRole\('admin'\)/);
});

test('middleware rechaza ADMIN cuando la frontera exige SUPERADMIN', () => {
  const guard = requireRole('SUPERADMIN');
  let error: unknown;
  guard({ userRole: 'ADMIN' } as never, {} as never, (err?: unknown) => { error = err; });
  assert.equal((error as { statusCode?: number })?.statusCode, 403);
});

test('middleware permite SUPERADMIN', () => {
  const guard = requireRole('SUPERADMIN');
  let passedGuard = false;
  guard({ userRole: 'SUPERADMIN' } as never, {} as never, (err?: unknown) => {
    assert.equal(err, undefined);
    passedGuard = true;
  });
  assert.equal(passedGuard, true);
});

console.log(`\n${passed} passed, 0 failed\n`);
