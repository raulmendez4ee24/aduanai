/**
 * Ola 2 — Risk Scorer operativo (Operación 2026-08).
 *
 *   npm run test:risk-operativo
 *
 * PURO: aplicarEvidencia pasa declarado→verificado sin tocar pesos/puntos/
 * banda; ids no evidenciables no cambian nada; cartera ordena por exposición;
 * tendencia; hash determinista y sensible; folio formateado.
 * DB (tenant propio, se limpia): folio secuencial por tenant (dos tenants no
 * se cruzan), cartera aísla tenant, historial = último + serie.
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { evaluate } from '../services/risk-scorer/engine';
import { DEFAULT_WEIGHTS } from '../services/risk-scorer/rules';
import type { Signals } from '../services/risk-scorer/types';
import {
  aplicarEvidencia, resultadoDesdeFila, idsEvidenciables, ordenarCartera, tendenciaDe,
  hashAssessment, siguienteFolio, conFolioAtomico, formatearFolio, construirCartera, renderDictamenHTML, type FilaCartera,
} from '../services/risk-scorer/operativo';
import { enAlcance, whereConAlcance } from '../lib/cliente-contexto';
import type { Request } from 'express';

/** Simula la petición de un usuario restringido a ciertos clientes (lo que deja clienteScope). */
const reqRestringida = (clienteIds: string[] | null): Request =>
  ({ headers: {}, query: {}, clienteIdsPermitidos: clienteIds } as unknown as Request);

const SUFIJO = `ola2rs${Date.now().toString(36)}`;
let pasadas = 0, falladas = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

const SIGNALS: Signals = {
  tipoSujeto: 'agente', fechaEvaluacion: '2026-08-27',
  operacion: { fraccion: '73181501', importadorRfc: 'ABC010101XYZ', paisOrigen: 'CN' },
  declarado: { mveTransmitida: false, expedienteKyc: null, incrementablesConSoporte: false, pagoConSoporteBancario: false },
  verificado: { fraccionValida: true, lista69BDisponible: false },
};

async function partePura() {
  console.log('— evidencia (puro) —');
  const base = evaluate(SIGNALS, DEFAULT_WEIGHTS);
  const reglaDeclarada = base.factores.flatMap(f => f.reglas).find(r => r.origenEfectivo === 'declarado' && r.puntos > 0);
  assert.ok(reglaDeclarada, 'el escenario debe tener una regla declarada con puntos');
  await prueba('evidencia por id de regla: declarado → verificado; puntos, pesos, exposición, escudo y banda intactos', () => {
    const r = aplicarEvidencia(base, { [reglaDeclarada!.id]: { documentId: 'doc1', verificadoAt: '2026-08-27T00:00:00Z', verificadoPor: 'u1' } });
    const regla = r.factores.flatMap(f => f.reglas).find(x => x.id === reglaDeclarada!.id)!;
    assert.equal(regla.origenEfectivo, 'verificado');
    assert.equal(regla.evidenciaDocumentId, 'doc1');
    assert.equal(regla.puntos, reglaDeclarada!.puntos);
    assert.equal(r.exposicion, base.exposicion); assert.equal(r.escudoPct, base.escudoPct); assert.equal(r.banda, base.banda);
    assert.deepEqual(r.factores.map(f => [f.puntos, f.peso]), base.factores.map(f => [f.puntos, f.peso]));
    assert.equal(r.cobertura.verificadas, base.cobertura.verificadas + 1);
    assert.equal(r.cobertura.declaradas, base.cobertura.declaradas - 1);
  });
  await prueba('evidencia por id de FACTOR cubre todas sus reglas declaradas; ítem del escudo por su id', () => {
    const r = aplicarEvidencia(base, { [reglaDeclarada!.factor]: { documentId: 'd', verificadoAt: 'x', verificadoPor: 'u' }, 'ESC-MVE': { documentId: 'd2', verificadoAt: 'x', verificadoPor: 'u' } });
    const factor = r.factores.find(f => f.factor === reglaDeclarada!.factor)!;
    assert.ok(factor.reglas.filter(x => x.origenSenal === 'declarado').every(x => x.origenEfectivo === 'verificado'));
    const mve = r.checklist.find(c => c.id === 'ESC-MVE')!;
    assert.equal(mve.origenSenal, 'verificado');
    assert.equal(mve.completo, base.checklist.find(c => c.id === 'ESC-MVE')!.completo, 'completo no cambia por evidencia');
  });
  await prueba('reglas verificadas/no_evaluadas y un id desconocido no cambian; idsEvidenciables lista reglas+ítems+factores', () => {
    const r = aplicarEvidencia(base, { 'NO-EXISTE': { documentId: 'd', verificadoAt: 'x', verificadoPor: 'u' } });
    assert.deepEqual(r.factores, base.factores.map(f => ({ ...f, reglas: f.reglas.map(x => ({ ...x })) })));
    const ids = idsEvidenciables(base);
    assert.ok(ids.has('VALOR') && ids.has('ESC-MVE') && ids.has(reglaDeclarada!.id) && !ids.has('NO-EXISTE'));
  });
  await prueba('resultadoDesdeFila reconstruye lo persistido y se puede reaplicar evidencia', () => {
    const fila = { exposicion: base.exposicion, escudoPct: base.escudoPct, banda: base.banda, detalle: JSON.parse(JSON.stringify(base.factores)), checklist: JSON.parse(JSON.stringify(base.checklist)), rulesVersion: base.rulesVersion };
    const r = resultadoDesdeFila(fila);
    assert.equal(r.cobertura.declaradas, base.cobertura.declaradas);
    assert.deepEqual(r.banderas, base.banderas);
  });
  console.log('— cartera y folio (puro) —');
  await prueba('ordenarCartera: exposición desc, empate por menor escudo, sin evaluación al final', () => {
    const f = (razonSocial: string, exposicion: number | null, escudoPct: number | null): FilaCartera => ({ clienteId: razonSocial, rfc: 'x', razonSocial, assessmentId: null, folio: null, exposicion, escudoPct, banda: null, tendencia: 'estable', fecha: null, evaluaciones: 0 });
    const o = ordenarCartera([f('B', 30, 50), f('Z', null, null), f('A', 80, 90), f('C', 80, 20), f('M', null, null)]);
    assert.deepEqual(o.map(x => x.razonSocial), ['C', 'A', 'B', 'M', 'Z']);
  });
  await prueba('tendencia: ±5 puntos = estable; sin anterior = sin_historial', () => {
    assert.equal(tendenciaDe(50, 40), 'sube'); assert.equal(tendenciaDe(40, 50), 'baja');
    assert.equal(tendenciaDe(52, 50), 'estable'); assert.equal(tendenciaDe(50, null), 'sin_historial');
  });
  await prueba('folio formateado y hash determinista/sensible', () => {
    assert.equal(formatearFolio(2026, 7), 'RS-2026-0007');
    const row = { id: 'a', tenantId: 't', folio: 'RS-2026-0001', input: { b: 1, a: 2 }, exposicion: 10, escudoPct: 50, banda: 'VERDE', detalle: [], checklist: [], rulesVersion: 'v' };
    const h1 = hashAssessment(row);
    assert.equal(h1, hashAssessment({ ...row, input: { a: 2, b: 1 } }), 'orden de claves no cambia el hash');
    assert.notEqual(h1, hashAssessment({ ...row, exposicion: 11 }));
    assert.match(h1, /^[0-9a-f]{64}$/);
  });
  await prueba('dictamen HTML lleva folio, hash, banda y print CSS', () => {
    const html = renderDictamenHTML({ folio: 'RS-2026-0003', hash: 'abc', creado: new Date('2026-08-27T00:00:00Z'), tenantNombre: 'Agencia <X>', cliente: null, operacionRef: null, resultado: aplicarEvidencia(base, {}), input: SIGNALS, evidencia: {}, disclaimer: 'd' });
    assert.ok(html.includes('RS-2026-0003') && html.includes('abc') && html.includes('@media print') && html.includes('Agencia &lt;X&gt;'));
  });
}

async function parteDB() {
  console.log('— folio, cartera e historial (DB, tenant propio) —');
  const tenant = await prisma.tenant.create({ data: { name: `RS ${SUFIJO}`, status: 'ACTIVE' } });
  const otro = await prisma.tenant.create({ data: { name: `RS otro ${SUFIJO}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: `${SUFIJO}@test.local`, password: 'x', name: 'T', role: 'ADMIN', tenantId: tenant.id } });
  const cA = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `A${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente A' } });
  const cB = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `B${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente B' } });
  const cC = await prisma.cliente.create({ data: { tenantId: tenant.id, rfc: `C${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Cliente C sin evaluar' } });
  const cOtro = await prisma.cliente.create({ data: { tenantId: otro.id, rfc: `O${SUFIJO}`.slice(0, 13).toUpperCase(), razonSocial: 'Ajeno' } });
  const limpiar = async () => {
    await prisma.riskAssessment.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.cliente.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenant.id, otro.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otro.id] } } });
  };
  const base = evaluate(SIGNALS, DEFAULT_WEIGHTS);
  const crear = async (tenantId: string, clienteId: string, exposicion: number) => prisma.riskAssessment.create({
    data: {
      tenantId, userId: user.id, clienteId, folio: await siguienteFolio(tenantId, new Date('2026-08-27T12:00:00Z')),
      input: JSON.parse(JSON.stringify(SIGNALS)), exposicion, escudoPct: 40, banda: 'AMARILLO',
      detalle: JSON.parse(JSON.stringify(base.factores)), checklist: JSON.parse(JSON.stringify(base.checklist)),
      rulesVersion: base.rulesVersion, pesosSnapshot: DEFAULT_WEIGHTS,
    },
  });
  try {
    await prueba('folio secuencial por tenant: RS-2026-0001..0003 en uno, RS-2026-0001 en el otro', async () => {
      const a1 = await crear(tenant.id, cA.id, 20);
      const b1 = await crear(tenant.id, cB.id, 70);
      const a2 = await crear(tenant.id, cA.id, 35);
      const o1 = await crear(otro.id, cOtro.id, 90);
      assert.deepEqual([a1.folio, b1.folio, a2.folio], ['RS-2026-0001', 'RS-2026-0002', 'RS-2026-0003']);
      assert.equal(o1.folio, 'RS-2026-0001');
      assert.equal(await siguienteFolio(tenant.id, new Date('2027-01-05T00:00:00Z')), 'RS-2027-0001', 'año nuevo reinicia');
    });
    await prueba('#20 folio atómico: 12 creaciones CONCURRENTES no repiten folio; tras RS-2026-9999 sigue RS-2026-10000 (orden por longitud, no textual)', async () => {
      const fecha = new Date('2026-08-27T12:00:00Z');
      const datos = (clienteId: string) => ({
        tenantId: tenant.id, userId: user.id, clienteId,
        input: JSON.parse(JSON.stringify(SIGNALS)), exposicion: 10, escudoPct: 40, banda: 'AMARILLO',
        detalle: JSON.parse(JSON.stringify(base.factores)), checklist: JSON.parse(JSON.stringify(base.checklist)),
        rulesVersion: base.rulesVersion, pesosSnapshot: DEFAULT_WEIGHTS,
      });
      const creadas = await Promise.all(Array.from({ length: 12 }, () =>
        conFolioAtomico(tenant.id, (folio, tx) => tx.riskAssessment.create({ data: { ...datos(cA.id), folio }, select: { folio: true } }), fecha),
      ));
      const folios = creadas.map(c => c.folio!);
      assert.equal(new Set(folios).size, 12, `folios repetidos: ${folios.join(',')}`);
      assert.deepEqual([...folios].sort(), Array.from({ length: 12 }, (_, i) => formatearFolio(2026, 4 + i)).sort());
      // Orden textual: tras 9999 el viejo `orderBy folio desc` devolvía 9999 de nuevo.
      await prisma.riskAssessment.create({ data: { ...datos(cA.id), folio: 'RS-2026-9999' } });
      assert.equal(await siguienteFolio(tenant.id, fecha), 'RS-2026-10000');
      const diez = await conFolioAtomico(tenant.id, (folio, tx) => tx.riskAssessment.create({ data: { ...datos(cA.id), folio }, select: { folio: true } }), fecha);
      assert.equal(diez.folio, 'RS-2026-10000');
      assert.equal(await siguienteFolio(tenant.id, fecha), 'RS-2026-10001');
      await prisma.riskAssessment.deleteMany({ where: { tenantId: tenant.id, folio: { in: [...folios, 'RS-2026-9999', 'RS-2026-10000'] } } });
    });
    await prueba('cartera: ordenada por exposición, tendencia del cliente A = sube, C sin historial al final, ajeno ausente', async () => {
      const filas = await construirCartera(tenant.id, null);
      assert.deepEqual(filas.map(f => f.razonSocial), ['Cliente B', 'Cliente A', 'Cliente C sin evaluar']);
      assert.equal(filas[1]!.tendencia, 'sube'); assert.equal(filas[1]!.exposicion, 35); assert.equal(filas[1]!.evaluaciones, 2);
      assert.equal(filas[2]!.exposicion, null); assert.equal(filas[2]!.tendencia, 'sin_historial');
      assert.ok(!filas.some(f => f.clienteId === cOtro.id));
      const restringida = await construirCartera(tenant.id, [cB.id]);
      assert.deepEqual(restringida.map(f => f.razonSocial), ['Cliente B']);
    });
    await prueba('cartera del otro tenant solo ve lo suyo', async () => {
      const filas = await construirCartera(otro.id, null);
      assert.equal(filas.length, 1); assert.equal(filas[0]!.exposicion, 90);
    });
    console.log('— alcance por cliente (usuario restringido a A) —');
    await prueba('historial: enAlcance deja pasar a A y rechaza B (→ 403 en la ruta); sin restricción ve todo', async () => {
      const req = reqRestringida([cA.id]);
      assert.equal(enAlcance(req, cA.id), true);
      assert.equal(enAlcance(req, cB.id), false);
      assert.equal(enAlcance(reqRestringida(null), cB.id), true);
    });
    await prueba('assessment por id con whereConAlcance: el de B no aparece para el restringido a A; el de A sí', async () => {
      const req = reqRestringida([cA.id]);
      const deB = await prisma.riskAssessment.findFirst({ where: { tenantId: tenant.id, clienteId: cB.id }, select: { id: true } });
      const deA = await prisma.riskAssessment.findFirst({ where: { tenantId: tenant.id, clienteId: cA.id }, select: { id: true } });
      assert.ok(deB && deA);
      assert.equal(await prisma.riskAssessment.findFirst({ where: whereConAlcance(req, { id: deB!.id, tenantId: tenant.id }) }), null, 'la evaluación de B no es visible');
      assert.ok(await prisma.riskAssessment.findFirst({ where: whereConAlcance(req, { id: deA!.id, tenantId: tenant.id }) }), 'la de A sí');
      assert.ok(await prisma.riskAssessment.findFirst({ where: whereConAlcance(reqRestringida(null), { id: deB!.id, tenantId: tenant.id }) }), 'sin restricción ve la de B');
    });
    await prueba('operación destino (archivar/assess): la de B no se resuelve para el restringido a A; la compartida (sin cliente) sí', async () => {
      const req = reqRestringida([cA.id]);
      const opB = await prisma.operation.create({ data: { tenantId: tenant.id, userId: user.id, clienteId: cB.id, reference: `OPB-${SUFIJO}`, type: 'IMPORT' } });
      const opShared = await prisma.operation.create({ data: { tenantId: tenant.id, userId: user.id, clienteId: null, reference: `OPS-${SUFIJO}`, type: 'IMPORT' } });
      try {
        assert.equal(await prisma.operation.findFirst({ where: whereConAlcance(req, { id: opB.id, tenantId: tenant.id }), select: { id: true } }), null);
        assert.ok(await prisma.operation.findFirst({ where: whereConAlcance(req, { id: opShared.id, tenantId: tenant.id }), select: { id: true } }));
      } finally {
        await prisma.operation.deleteMany({ where: { id: { in: [opB.id, opShared.id] } } });
      }
    });
  } finally { await limpiar(); }
}

async function main() {
  console.log('\n== Ola 2 — Risk Scorer operativo ==');
  await partePura();
  await parteDB();
  console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
  await prisma.$disconnect();
  process.exit(falladas > 0 ? 1 : 0);
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
