/**
 * CARGA VERBATIM DE LA TABLA NICO — Base Única SNICE (Frontera Canónica).
 *
 * Ejecutar (local):  npx tsx src/scripts/cargar-nicos.ts [--dry]
 * Ejecutar (prod):   node dist/scripts/cargar-nicos.js   (dentro del contenedor)
 *
 * Lee la hoja "Base Única" del .xlsb del repo (la MISMA fuente del catálogo,
 * extracto 30-mar-2026) y puebla `Fraction.nicos` con TODOS los NICOs de cada
 * fracción, verbatim en el orden de la hoja. No inventa, no deduce: si la hoja
 * no trae NICO para una fracción, nicos[] queda vacío y el productor la sigue
 * mostrando 'sin_verificar'/'no_disponible'.
 *
 * Idempotente: solo actualiza filas cuyo nicos[] difiere. Reporta cuántas
 * fracciones ganan NICOs reales (lista ≠ ["00"]).
 */

import * as path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';

const XLSB = path.join(__dirname, '../../prisma/seed/data/BASEUNICA-LIGIE_20260330-20260330.xlsb');

async function main() {
  const dry = process.argv.includes('--dry');

  console.log(`Leyendo ${path.basename(XLSB)}…`);
  const wb = XLSX.readFile(XLSB);
  const ws = wb.Sheets['Base Única'];
  if (!ws) throw new Error('Hoja "Base Única" no encontrada en el .xlsb');
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });

  // Estructura real de la hoja (cotejada 18-ago):
  //   fila de fracción:  col1="8471.30.01", col2=NICO inline ("00") o null;
  //   filas NICO:        col1=null, col2=NICO ("01" string o 99 NÚMERO), col3=descripción;
  //   filas de partida/subpartida (col1 más corta) CORTAN la atribución.
  const porFraccion = new Map<string, string[]>();
  let filasNico = 0;
  let fraccionActual: string | null = null;
  const agregar = (code: string, rawNico: unknown) => {
    if (rawNico == null) return;
    const nico = String(rawNico).trim().padStart(2, '0');
    if (!/^\d{2}$/.test(nico)) return;
    filasNico++;
    const lista = porFraccion.get(code) ?? [];
    if (!lista.includes(nico)) lista.push(nico); // verbatim, orden de la hoja
    porFraccion.set(code, lista);
  };
  for (const row of rows) {
    const rawFrac = row?.[1];
    if (typeof rawFrac === 'string' && /^\d{4}\.\d{2}\.\d{2}$/.test(rawFrac.trim())) {
      fraccionActual = rawFrac.trim().replace(/\./g, '');
      agregar(fraccionActual, row?.[2]); // NICO inline en la misma fila (caso "00")
    } else if (rawFrac != null && String(rawFrac).trim() !== '') {
      fraccionActual = null; // partida/subpartida u otra cosa: corta atribución
    } else if (fraccionActual) {
      agregar(fraccionActual, row?.[2]); // fila NICO debajo de su fracción
    }
  }

  const conVarios = [...porFraccion.values()].filter(l => l.length > 1).length;
  const reales = [...porFraccion.values()].filter(l => !(l.length === 1 && l[0] === '00')).length;
  console.log(`Hoja: ${filasNico} filas con NICO · ${porFraccion.size} fracciones con ≥1 NICO · ${conVarios} con >1 · ${reales} con NICOs "reales" (≠ ["00"])`);

  // Diff contra DB
  const enDB = await prisma.fraction.findMany({ select: { code: true, nicos: true } });
  const dbMap = new Map(enDB.map(f => [f.code, f.nicos]));
  let actualizar: { code: string; nicos: string[] }[] = [];
  let sinFilaEnDB = 0;
  for (const [code, nicos] of porFraccion) {
    const actual = dbMap.get(code);
    if (actual === undefined) { sinFilaEnDB++; continue; }
    if (JSON.stringify(actual) !== JSON.stringify(nicos)) actualizar.push({ code, nicos });
  }
  const fraccionesSinNicoEnHoja = enDB.length - (porFraccion.size - sinFilaEnDB);
  console.log(`DB: ${enDB.length} fracciones · a actualizar: ${actualizar.length} · en hoja pero no en DB: ${sinFilaEnDB} · en DB sin NICO en hoja: ${fraccionesSinNicoEnHoja}`);

  if (dry) {
    console.log('(--dry: sin escribir)');
  } else {
    let hechas = 0;
    for (const u of actualizar) {
      await prisma.fraction.update({ where: { code: u.code }, data: { nicos: u.nicos } });
      hechas++;
      if (hechas % 1000 === 0) console.log(`  …${hechas}/${actualizar.length}`);
    }
    console.log(`Actualizadas: ${hechas}`);
  }

  // Reporte final: cuántas fracciones de DB quedan con NICOs poblados
  if (!dry) {
    const pobladas = await prisma.fraction.count({ where: { NOT: { nicos: { isEmpty: true } } } });
    console.log(`DB tras la carga: ${pobladas} fracciones con nicos[] poblado.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
