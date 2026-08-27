/**
 * Defensa de capa contra fugas cross-tenant (lib/tenant-guard.ts).
 * Puro, sin base de datos ni red.
 *   npm run test:tenant-guard   (o: tsx src/tests/tenant-guard.test.ts)
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  whereTieneTenant, verificarAcceso, sinGuardaDeTenant, MODELOS_MULTITENANT,
  establecerReporteDeIncidentes, contadorDeIncidentes, type IncidenteTenantGuard,
} from '../lib/tenant-guard';

let pasadas = 0, falladas = 0;
function prueba(nombre: string, fn: () => void) {
  try { fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

function conEstricto<T>(fn: () => T): T {
  const antes = process.env.TENANT_GUARD_STRICT;
  process.env.TENANT_GUARD_STRICT = '1';
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.TENANT_GUARD_STRICT; else process.env.TENANT_GUARD_STRICT = antes;
  }
}

console.log('— tenant-guard: detección de tenantId en el where —');
prueba('where con tenantId directo → protegido', () => {
  assert.ok(whereTieneTenant({ id: 'x', tenantId: 't1' }));
});
prueba('where sin tenantId → desprotegido', () => {
  assert.ok(!whereTieneTenant({ id: 'x' }));
  assert.ok(!whereTieneTenant({}));
  assert.ok(!whereTieneTenant(undefined));
});
prueba('tenantId null/undefined NO cuenta como scope', () => {
  assert.ok(!whereTieneTenant({ id: 'x', tenantId: null }));
  assert.ok(!whereTieneTenant({ id: 'x', tenantId: undefined }));
});
prueba('tenantId dentro de AND/OR sí cuenta', () => {
  assert.ok(whereTieneTenant({ AND: [{ id: 'x' }, { tenantId: 't1' }] }));
  assert.ok(whereTieneTenant({ OR: [{ tenantId: 't1' }] }));
});

console.log('— tenant-guard: modo estricto lanza sobre modelo multi-tenant sin scope —');
prueba('findUnique en Pedimento sin tenantId → LANZA en estricto', () => {
  conEstricto(() => {
    assert.throws(() => verificarAcceso('findUnique', 'Pedimento', { id: 'x' }), /tenant-guard.*Pedimento/);
  });
});
prueba('findFirst en RiskAssessment CON tenantId → pasa', () => {
  conEstricto(() => {
    assert.doesNotThrow(() => verificarAcceso('findFirst', 'RiskAssessment', { id: 'x', tenantId: 't1' }));
  });
});
prueba('modelo GLOBAL (LegalDocument, Lead, Fraction) → nunca lanza', () => {
  conEstricto(() => {
    assert.doesNotThrow(() => verificarAcceso('findUnique', 'LegalDocument', { id: 'x' }));
    assert.doesNotThrow(() => verificarAcceso('findUnique', 'Lead', { id: 'x' }));
    assert.doesNotThrow(() => verificarAcceso('findUnique', 'Fraction', { code: 'x' }));
  });
});
prueba('User EXCLUIDO del guard (auth es cross-tenant por diseño)', () => {
  conEstricto(() => {
    assert.doesNotThrow(() => verificarAcceso('findUnique', 'User', { id: 'x' }));
  });
  assert.ok(!MODELOS_MULTITENANT.has('User'));
});

console.log('— tenant-guard: escape hatch explícito —');
prueba('sinGuardaDeTenant() permite el cruce deliberado aún en estricto', () => {
  conEstricto(() => {
    assert.doesNotThrow(() => sinGuardaDeTenant(() => verificarAcceso('findUnique', 'Pedimento', { id: 'x' })));
  });
});

console.log('— tenant-guard: modo por defecto (no estricto) NO lanza (warn) —');
prueba('sin TENANT_GUARD_STRICT → avisa pero deja pasar (no rompe prod)', () => {
  const antes = process.env.TENANT_GUARD_STRICT; delete process.env.TENANT_GUARD_STRICT;
  const origErr = console.error; let avisó = false; console.error = () => { avisó = true; };
  try {
    assert.doesNotThrow(() => verificarAcceso('findUnique', 'Pedimento', { id: 'x' }));
    assert.ok(avisó, 'debe dejar rastro en console.error');
  } finally {
    console.error = origErr;
    if (antes !== undefined) process.env.TENANT_GUARD_STRICT = antes;
  }
});

console.log('— tenant-guard: censo contra el schema (Bloque 3) —');
prueba('TODO modelo del schema con columna tenantId está en MODELOS_MULTITENANT (salvo User)', () => {
  const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const faltan: string[] = [];
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, nombre, cuerpo] = m;
    if (nombre === 'User') continue;
    if (/^\s+tenantId\s+String/m.test(cuerpo) && !MODELOS_MULTITENANT.has(nombre)) faltan.push(nombre);
  }
  assert.deepEqual(faltan, [], `modelos multi-tenant fuera de la guarda: ${faltan.join(', ')}`);
});
prueba('ClassificationJob (faltaba) → LANZA en estricto sin tenantId', () => {
  conEstricto(() => {
    assert.throws(() => verificarAcceso('findUnique', 'ClassificationJob', { id: 'j1' }), /ClassificationJob/);
    assert.doesNotThrow(() => verificarAcceso('findFirst', 'ClassificationJob', { id: 'j1', tenantId: 't1' }));
  });
});

console.log('— tenant-guard: incidentes registrados (no solo console.error) —');
prueba('en modo aviso el incidente va al reporte configurado, con modelo y operación', () => {
  const antes = process.env.TENANT_GUARD_STRICT; delete process.env.TENANT_GUARD_STRICT;
  const recibidos: IncidenteTenantGuard[] = [];
  const origErr = console.error; let porConsole = false; console.error = () => { porConsole = true; };
  establecerReporteDeIncidentes(inc => { recibidos.push(inc); });
  try {
    verificarAcceso('findFirst', 'Pedimento', { id: 'p1' });
    assert.equal(recibidos.length, 1);
    assert.equal(recibidos[0].model, 'Pedimento');
    assert.equal(recibidos[0].op, 'findFirst');
    assert.match(recibidos[0].mensaje, /tenant-guard/);
    assert.ok(!porConsole, 'con reporte configurado no debe caer a console.error');
    assert.ok(contadorDeIncidentes() >= 1);
  } finally {
    establecerReporteDeIncidentes(null);
    console.error = origErr;
    if (antes !== undefined) process.env.TENANT_GUARD_STRICT = antes;
  }
});
prueba('el reporte que lanza no tumba la consulta (fail-open del reporte, no de la guarda)', () => {
  const antes = process.env.TENANT_GUARD_STRICT; delete process.env.TENANT_GUARD_STRICT;
  const origErr = console.error; console.error = () => {};
  establecerReporteDeIncidentes(() => { throw new Error('logger caído'); });
  try {
    assert.doesNotThrow(() => verificarAcceso('findFirst', 'Pedimento', { id: 'p1' }));
  } finally {
    establecerReporteDeIncidentes(null);
    console.error = origErr;
    if (antes !== undefined) process.env.TENANT_GUARD_STRICT = antes;
  }
});

console.log(`\nResultado: ${pasadas} pruebas pasaron, ${falladas} fallaron.`);
if (falladas > 0) process.exit(1);
