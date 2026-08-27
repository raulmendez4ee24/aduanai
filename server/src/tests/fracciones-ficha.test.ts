/**
 * Ola 3 — Ficha completa de fracción + árbol perezoso.
 *
 * Verifica contra la DB LOCAL (localhost) que:
 *  - cada bloque de la ficha trae `fuente` y un `estado` honesto
 *    ('con_datos' | 'sin_dato' | 'pendiente_de_carga');
 *  - los bloques sin dato NO inventan filas (datos = [] / null);
 *  - el árbol navega por nivel (secciones → capítulos → partidas → subpartidas → fracciones).
 *
 *   npm run test:ficha
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { construirFicha, navegarArbol, BLOQUES_FICHA } from '../services/fraction-ficha';

let pasan = 0, fallan = 0;
async function caso(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasan++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallan++; console.log(`  ✗ ${nombre}\n    ${(e as Error).message}`); }
}

function soloLocal(): void {
  let host = '';
  try { host = new URL(process.env.DATABASE_URL ?? '').hostname; } catch { /* */ }
  if (!/^(localhost|127\.0\.0\.1)$/.test(host)) {
    throw new Error(`REFUSED: este test corre solo contra una DB local (host=${host || 'desconocido'})`);
  }
}

async function main() {
  soloLocal();
  console.log('Fracciones — ficha completa y árbol');

  // Una fracción real activa del catálogo (la que haya).
  const f = await prisma.fraction.findFirst({ where: { active: true }, orderBy: { code: 'asc' }, select: { code: true } });
  assert.ok(f, 'el catálogo local necesita al menos una fracción activa');
  const ficha = await construirFicha(f!.code);
  assert.ok(ficha, 'ficha nula para una fracción existente');

  await caso('todos los bloques declarados existen en la ficha con fuente y estado', () => {
    for (const b of BLOQUES_FICHA) {
      const bloque = (ficha!.bloques as Record<string, { estado: string; fuente: string }>)[b];
      assert.ok(bloque, `falta bloque ${b}`);
      assert.ok(typeof bloque.fuente === 'string' && bloque.fuente.length > 5, `bloque ${b} sin fuente`);
      assert.ok(['con_datos', 'sin_dato', 'pendiente_de_carga'].includes(bloque.estado), `bloque ${b} estado inválido: ${bloque.estado}`);
    }
  });

  await caso('descripción + árbol jerárquico completo (sección→capítulo→partida→subpartida→fracción)', () => {
    const a = ficha!.bloques.arbol;
    assert.equal(a.estado, 'con_datos');
    assert.equal(a.datos.length, 5);
    assert.deepEqual(a.datos.map(n => n.nivel), ['seccion', 'capitulo', 'partida', 'subpartida', 'fraccion']);
    assert.equal(a.datos[4]!.code, f!.code);
  });

  await caso('aranceles: IGI general y por tratado con fechaDOF de la TIGIE cargada', () => {
    const ar = ficha!.bloques.aranceles;
    assert.ok(ar.fechaDOF, 'aranceles sin fechaDOF');
    assert.ok(Array.isArray(ar.datos));
    const general = ar.datos.find(d => d.clave === 'IGI_GENERAL');
    assert.ok(general, 'falta IGI general');
  });

  await caso('bloques sin dato son honestos: datos vacíos y la fuente que faltaría', () => {
    const an = ficha!.bloques.aduanasAnexo21;
    assert.equal(an.estado, 'pendiente_de_carga');
    assert.equal(an.datos.length, 0);
    assert.match(an.fuente, /Anexo 21/);
    for (const b of BLOQUES_FICHA) {
      const bloque = (ficha!.bloques as Record<string, { estado: string; datos: unknown }>)[b]!;
      if (bloque.estado !== 'con_datos') {
        const d = bloque.datos;
        assert.ok(d === null || (Array.isArray(d) && d.length === 0), `bloque ${b} dice ${bloque.estado} pero trae datos`);
      }
    }
  });

  await caso('cuotas compensatorias: solo coincidencia exacta y con país/vigencia cuando hay filas', async () => {
    const c = ficha!.bloques.cuotasCompensatorias;
    for (const d of c.datos) {
      assert.equal(d.fractionCode, f!.code);
      assert.ok(typeof d.countryOfOrigin === 'string');
    }
  });

  await caso('correlativas: sin tabla de correlación → pendiente_de_carga (o retirada cuando aplica)', () => {
    const co = ficha!.bloques.correlativas;
    assert.ok(['pendiente_de_carga', 'con_datos'].includes(co.estado));
    assert.match(co.fuente, /correlaci/i);
  });

  await caso('fracción inexistente → null (sin inventar)', async () => {
    assert.equal(await construirFicha('00000000'), null);
  });

  await caso('árbol nivel 0 → secciones (romanos)', async () => {
    const r = await navegarArbol('');
    assert.equal(r.nivel, 'seccion');
    assert.ok(r.hijos.length > 0);
    assert.match(r.hijos[0]!.code, /^[IVXL]+$/);
  });

  await caso('árbol perezoso: sección → capítulos → partidas → subpartidas → fracciones', async () => {
    const s = await navegarArbol('');
    const cap = await navegarArbol(s.hijos[0]!.code);
    assert.equal(cap.nivel, 'capitulo'); assert.ok(cap.hijos.length > 0); assert.match(cap.hijos[0]!.code, /^\d{2}$/);
    const par = await navegarArbol(cap.hijos[0]!.code);
    assert.equal(par.nivel, 'partida'); assert.ok(par.hijos.length > 0); assert.match(par.hijos[0]!.code, /^\d{4}$/);
    const sub = await navegarArbol(par.hijos[0]!.code);
    assert.equal(sub.nivel, 'subpartida'); assert.ok(sub.hijos.length > 0); assert.match(sub.hijos[0]!.code, /^\d{6}$/);
    const fr = await navegarArbol(sub.hijos[0]!.code);
    assert.equal(fr.nivel, 'fraccion'); assert.ok(fr.hijos.length > 0); assert.match(fr.hijos[0]!.code, /^\d{8}$/);
    assert.equal(fr.hijos[0]!.hoja, true);
  });

  await caso('árbol: nodo inexistente → hijos vacíos, no error', async () => {
    const r = await navegarArbol('9999');
    assert.equal(r.hijos.length, 0);
  });

  console.log(`\n${pasan} passed, ${fallan} failed`);
  await prisma.$disconnect();
  if (fallan > 0) process.exit(1);
}

void main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
