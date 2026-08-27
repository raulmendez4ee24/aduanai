/** Rangos del cotizador simple — regresión prod 27-ago (customsValue=1e23 en Analytics).
 *  Ejecutar: npm run test:quote-rangos */
import { strict as assert } from 'node:assert';
import { validarRangosQuoteSimple } from '../routes/quote';
let ok = 0, bad = 0;
const t = (n: string, f: () => void) => { try { f(); ok++; console.log(`  ✓ ${n}`); } catch (e) { bad++; console.log(`  ✗ ${n}: ${(e as Error).message}`); } };
t('valor normal pasa', () => assert.equal(validarRangosQuoteSimple({ customsValue: 12500 }), null));
t('1e23 se rechaza (el caso de prod)', () => assert.ok(validarRangosQuoteSimple({ customsValue: 1e23 })));
t('string "1e23" se rechaza', () => assert.ok(validarRangosQuoteSimple({ customsValue: '1e23' })));
t('tope exacto 1e9 pasa; 1e9+1 no', () => { assert.equal(validarRangosQuoteSimple({ customsValue: 1e9 }), null); assert.ok(validarRangosQuoteSimple({ customsValue: 1e9 + 1 })); });
t('negativo, 0, NaN, Infinity se rechazan', () => { for (const v of [-1, 0, NaN, Infinity, 'abc']) assert.ok(validarRangosQuoteSimple({ customsValue: v }), String(v)); });
t('tipo de cambio manual 0 o >100 se rechaza; 17.2 pasa', () => { assert.ok(validarRangosQuoteSimple({ customsValue: 1, exchangeRate: 0 })); assert.ok(validarRangosQuoteSimple({ customsValue: 1, exchangeRate: 101 })); assert.equal(validarRangosQuoteSimple({ customsValue: 1, exchangeRate: 17.2 }), null); });
t('igi override 0-100', () => { assert.equal(validarRangosQuoteSimple({ customsValue: 1, igiRateOverride: 15 }), null); assert.ok(validarRangosQuoteSimple({ customsValue: 1, igiRateOverride: 150 })); });
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
