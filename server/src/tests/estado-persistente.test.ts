/**
 * Estado persistente y primer envío (cuarta revisión, 27-ago-2026).
 *
 * Bug reportado (P3): "mi primer texto se perdió al enviarse durante la carga
 * de la página". Dos causas reales, una por pantalla:
 *
 *  a) `useEstadoPersistente` rehidrata cuando cambia la clave (módulo+cliente),
 *     y el selector de cliente del topbar fija el cliente activo VARIOS CIENTOS
 *     de ms después del primer render (resuelve dos llamadas antes de disparar
 *     `aduanai:cliente`). Lo tecleado en ese hueco se perdía.
 *  b) El Clasificador retomaba al montar el job guardado (la llave sobrevive a
 *     los jobs terminados, por diseño) y encendía "cargando" ANTES del primer
 *     sondeo: el primer Enter del usuario se lo tragaba `if (!q || cargando)`.
 *
 * Ejecutar:  npm run test:estado-persistente   (no necesita base de datos)
 */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

let pasadas = 0, falladas = 0;
function prueba(nombre: string, fn: () => void) {
  try { fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { falladas++; console.error(`  ✗ ${nombre}:`, e instanceof Error ? e.message : e); }
}

// El hook vive fuera del rootDir de server/: se carga por ruta en runtime.
const RUTA_HOOK = path.resolve(__dirname, '../../../client/src/hooks/useEstadoPersistente.ts');
const hook = require(RUTA_HOOK) as {
  resolverCambioDeClave: <T>(a: {
    base: T; actual: T; guardado: T | undefined;
    clienteAnterior: string | null; clienteNuevo: string | null; sucio: boolean;
  }) => T;
};
const { resolverCambioDeClave } = hook;

const CLASSIFIER = path.resolve(__dirname, '../../../client/src/pages/Classifier.tsx');
const FRACCIONES = path.resolve(__dirname, '../../../client/src/pages/Fractions.tsx');

console.log('— rehidratación tardía: lo tecleado no se pierde —');

prueba('escribir ANTES de que el selector fije el cliente: el texto sobrevive', () => {
  const r = resolverCambioDeClave({
    base: { descripcion: '', pais: '' },
    actual: { descripcion: 'tornillo de acero inoxidable M8', pais: '' },
    guardado: undefined,
    clienteAnterior: null,      // al montar no había cliente activo…
    clienteNuevo: 'cli_1',      // …y el topbar lo fijó al terminar de cargar
    sucio: true,
  });
  assert.deepEqual(r, { descripcion: 'tornillo de acero inoxidable M8', pais: '' });
});

prueba('mismo asentamiento pero sin teclear: se toma el inicial (nada que conservar)', () => {
  const r = resolverCambioDeClave({
    base: { descripcion: '', pais: '' },
    actual: { descripcion: '', pais: '' },
    guardado: undefined,
    clienteAnterior: null, clienteNuevo: 'cli_1', sucio: false,
  });
  assert.deepEqual(r, { descripcion: '', pais: '' });
});

prueba('el formulario guardado del cliente nuevo GANA a lo tecleado (no se mezcla)', () => {
  const r = resolverCambioDeClave({
    base: { descripcion: '', pais: '', notas: '' },
    actual: { descripcion: 'lo que iba escribiendo', pais: '', notas: '' },
    guardado: { descripcion: 'formulario del cliente 1', pais: 'CN' },
    clienteAnterior: null, clienteNuevo: 'cli_1', sucio: true,
  });
  // Merge superficial con el inicial: campos nuevos del deploy no quedan undefined.
  assert.deepEqual(r, { descripcion: 'formulario del cliente 1', pais: 'CN', notas: '' });
});

prueba('cambio DELIBERADO de cliente A → B: no se arrastra el formulario de A', () => {
  const r = resolverCambioDeClave({
    base: { descripcion: '', pais: '' },
    actual: { descripcion: 'mercancía del cliente A', pais: 'US' },
    guardado: undefined,
    clienteAnterior: 'cli_A', clienteNuevo: 'cli_B', sucio: true,
  });
  assert.deepEqual(r, { descripcion: '', pais: '' }, 'el RFC de A no puede viajar con X-Cliente-Id de B');
});

prueba('volver a "todos los clientes" tampoco arrastra el formulario del cliente', () => {
  const r = resolverCambioDeClave({
    base: '', actual: 'texto del cliente B', guardado: undefined,
    clienteAnterior: 'cli_B', clienteNuevo: null, sucio: true,
  });
  assert.equal(r, '');
});

prueba('valores no-objeto (string) también se conservan en el asentamiento', () => {
  assert.equal(resolverCambioDeClave({ base: '', actual: '8471', guardado: undefined, clienteAnterior: null, clienteNuevo: 'cli_1', sucio: true }), '8471');
  assert.equal(resolverCambioDeClave({ base: '', actual: '8471', guardado: '7318', clienteAnterior: null, clienteNuevo: 'cli_1', sucio: true }), '7318');
});

console.log('— Clasificador: el primer envío no se traga en silencio —');

prueba('no reaparece el guard mudo `if (!q || cargando) return`', () => {
  const txt = fs.readFileSync(CLASSIFIER, 'utf8');
  assert.equal(/if \(!q \|\| cargando\) return/.test(txt), false, 'el envío durante la carga volvió a perderse en silencio');
  assert.ok(/AVISO_EN_CURSO/.test(txt), 'debe avisar al usuario cuando no puede clasificar todavía');
});

prueba('retomar un job al montar no enciende "cargando" a ciegas', () => {
  const txt = fs.readFileSync(CLASSIFIER, 'utf8');
  assert.ok(/if \(!opts\?\.reanudando\) setCargando\(true\)/.test(txt), 'la reanudación debe confirmar que el job sigue vivo antes de ocupar la pantalla');
});

prueba('retomar un job no reemplaza la conversación que el usuario ya escribió', () => {
  const txt = fs.readFileSync(CLASSIFIER, 'utf8');
  assert.equal(/setMensajes\(\[\{ rol: 'usuario', texto: j\.description \}\]\)/.test(txt), false, 'setMensajes con array literal pisaba lo del usuario');
  assert.ok(/m\.length > 0 \? m :/.test(txt), 'la reanudación solo rellena la conversación si está vacía');
});

console.log('— Fracciones: Enter dispara la búsqueda —');

prueba('el buscador vive en un <form> con submit y botón type="submit"', () => {
  const txt = fs.readFileSync(FRACCIONES, 'utf8');
  assert.ok(/<form[^>]*onSubmit=/.test(txt), 'sin <form onSubmit> el Enter depende del foco exacto');
  assert.ok(/type="submit"/.test(txt), 'el botón Buscar debe enviar el formulario');
});

prueba('el foco vuelve al buscador cuando se cierra el tutorial', () => {
  const txt = fs.readFileSync(FRACCIONES, 'utf8');
  assert.ok(/MutationObserver/.test(txt) && /role="dialog"/.test(txt), 'falta devolver el foco al cerrarse el modal de ayuda');
  assert.ok(/inputBusqueda\.current\?\.focus\(\)/.test(txt));
});

console.log(`\n${pasadas} pasadas, ${falladas} falladas`);
process.exit(falladas > 0 ? 1 : 0);
