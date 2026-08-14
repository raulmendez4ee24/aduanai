// Verificación post-deploy del backfill de descripciones Heading/Subheading
// (migración 20260813193051_backfill_heading_subheading_descriptions).
//
// Uso local:  node prisma/seed/verify-parent-descriptions.mjs   (desde server/)
// Uso prod:   railway ssh → node /app/server/prisma/seed/verify-parent-descriptions.mjs
//
// Falla cerrada: exit 1 si cualquier verificación no cuadra.
// Sanity de 3 códigos: cotejo EXACTO verbatim contra la Base Única LIGIE
// (DOF 2026-03-30) — misma política de exact-match que el resto del compliance.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env') });

// Subpartidas legacy pre-HS2022 (residuo del seed tigie-data.ts) que NO existen
// en la Base Única 2026 — es correcto y esperado que sigan como placeholder.
const LEGACY_SIN_FUENTE = [
  '080300', '340220', '380810', '380820', '380830', '441871', '610430',
  '620112', '620212', '841310', '852580', '852851', '853950',
];

// Cotejo exacto verbatim (Base Única, columna "Descripción"):
const SANITY = [
  ['headings', '0101', 'Caballos, asnos, mulos y burdéganos, vivos.'],
  ['subheadings', '731815', 'Los demás tornillos y pernos, incluso con sus tuercas y arandelas.'],
  ['subheadings', '851713', 'Teléfonos inteligentes.'],
];

let fallos = 0;
const check = (nombre, ok, detalle) => {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
};

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const hTotal = (await c.query('SELECT COUNT(*) n FROM headings')).rows[0].n;
const hPlaceholder = (await c.query("SELECT COUNT(*) n FROM headings WHERE description LIKE 'Partida %'")).rows[0].n;
check(`headings sin placeholder (${hTotal} total)`, Number(hPlaceholder) === 0, `${hPlaceholder} placeholders restantes`);

const sTotal = (await c.query('SELECT COUNT(*) n FROM subheadings')).rows[0].n;
const sPlaceholderRows = (await c.query("SELECT code FROM subheadings WHERE description LIKE 'Subpartida %' ORDER BY code")).rows.map(r => r.code);
const soloLegacy = sPlaceholderRows.length === LEGACY_SIN_FUENTE.length
  && sPlaceholderRows.every((code, i) => code === LEGACY_SIN_FUENTE[i]);
check(
  `subheadings: solo las 13 legacy pre-HS2022 quedan como placeholder (${sTotal} total)`,
  soloLegacy,
  `placeholders actuales: [${sPlaceholderRows.join(', ')}]`
);

for (const [tabla, code, esperado] of SANITY) {
  const r = await c.query(`SELECT description FROM ${tabla} WHERE code = $1`, [code]);
  const actual = r.rows[0]?.description ?? '(fila ausente)';
  check(`sanity ${tabla} ${code}`, actual === esperado, `actual: "${actual.slice(0, 90)}"`);
}

await c.end();
console.log(fallos === 0 ? '\nBACKFILL VERIFICADO' : `\nFALLÓ: ${fallos} verificaciones`);
process.exit(fallos === 0 ? 0 : 1);
