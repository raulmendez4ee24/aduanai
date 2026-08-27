/**
 * Regresión P0 26-ago-2026: login por https://www.aduanaia.lat devolvía 500
 * "Origin ... no permitido por CORS" porque CLIENT_URL solo listaba el dominio
 * de Railway. El servidor sirve el cliente él mismo: un Origin cuyo host
 * coincide con el Host de la petición es same-origin y SIEMPRE se permite.
 *
 * Ejecutar:  npm run test:cors
 */
import { strict as assert } from 'node:assert';
import { esOrigenPermitido, parsearOrigenesPermitidos } from '../lib/cors-origin';

const lista = parsearOrigenesPermitidos('https://kanaduana-production.up.railway.app, https://aduanaia.lat');

let pasan = 0, fallan = 0;
function caso(nombre: string, fn: () => void) {
  try { fn(); pasan++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallan++; console.log(`  ✗ ${nombre}\n    ${(e as Error).message}`); }
}

console.log('CORS: origen permitido');
caso('sin Origin (curl, server-to-server) se permite', () => {
  assert.equal(esOrigenPermitido(undefined, 'aduanaia.lat', lista), true);
});
caso('same-origin por dominio propio con www (el bug) se permite', () => {
  assert.equal(esOrigenPermitido('https://www.aduanaia.lat', 'www.aduanaia.lat', lista), true);
});
caso('same-origin por dominio de Railway se permite', () => {
  assert.equal(esOrigenPermitido('https://kanaduana-production.up.railway.app', 'kanaduana-production.up.railway.app', lista), true);
});
caso('same-origin detrás de proxy con puerto en Host se permite', () => {
  assert.equal(esOrigenPermitido('https://aduanaia.lat', 'aduanaia.lat:443', lista), true);
});
caso('origen de la lista aunque el Host sea otro se permite', () => {
  assert.equal(esOrigenPermitido('https://aduanaia.lat', 'kanaduana-production.up.railway.app', lista), true);
});
caso('localhost dev se permite', () => {
  assert.equal(esOrigenPermitido('http://localhost:5173', 'localhost:3001', lista), true);
});
caso('origen ajeno se rechaza', () => {
  assert.equal(esOrigenPermitido('https://evil.example', 'aduanaia.lat', lista), false);
});
caso('same-host por http cuando la petición vino por https se rechaza (no downgrade)', () => {
  assert.equal(esOrigenPermitido('http://aduanaia.lat', 'aduanaia.lat', lista, 'https'), false);
});
caso('Host falsificado con sufijo no se permite (evil.aduanaia.lat ≠ aduanaia.lat)', () => {
  assert.equal(esOrigenPermitido('https://evil.aduanaia.lat', 'aduanaia.lat', lista), false);
});
caso('Origin malformado se rechaza sin lanzar', () => {
  assert.equal(esOrigenPermitido('not a url', 'aduanaia.lat', lista), false);
});
caso('parsear lista tolera espacios y vacíos', () => {
  assert.deepEqual(parsearOrigenesPermitidos(' a.com ,, b.com '), ['a.com', 'b.com']);
  assert.deepEqual(parsearOrigenesPermitidos(undefined), []);
});

console.log(`\n${pasan} passed, ${fallan} failed`);
if (fallan > 0) process.exit(1);
