/**
 * Ingesta del listado 69-B CFF (CSV público del SAT) → tabla Sat69B.
 *
 * Ejecutar:  npx tsx scripts/ingest-69b.ts [ruta_csv_local]
 * Sin argumento descarga de la URL pública del SAT.
 *
 * HONESTIDAD: `importedAt` guarda la fecha de CORTE que el propio CSV declara
 * en su encabezado ("Información actualizada al …"), no la fecha de descarga —
 * es la fecha que la UI debe mostrar como "lista al". El builder de señales
 * degrada la verificación cuando el corte tiene más de 30 días.
 */
import * as fs from 'fs';
import { prisma } from '../src/lib/prisma';

const URL_SAT = 'http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv';

const MESES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

function parseCorte(header: string): Date | null {
  const m = header.match(/actualizada al (\d{1,2}) de (\w+) de (\d{4})/i);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (mes === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), mes, Number(m[1])));
}

/** Parser CSV mínimo (RFC 4180: comillas, comas embebidas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function mapSituacion(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('definitivo')) return 'DEFINITIVO';
  if (s.startsWith('presunto')) return 'PRESUNTO';
  if (s.startsWith('desvirtuado')) return 'DESVIRTUADO';
  if (s.startsWith('sentencia')) return 'SENTENCIA_FAVORABLE';
  return null;
}

async function main() {
  let raw: Buffer;
  const localPath = process.argv[2];
  if (localPath) {
    raw = fs.readFileSync(localPath);
    console.log(`CSV local: ${localPath} (${raw.length} bytes)`);
  } else {
    console.log(`Descargando ${URL_SAT} …`);
    const res = await fetch(URL_SAT);
    if (!res.ok) throw new Error(`SAT respondió HTTP ${res.status}`);
    raw = Buffer.from(await res.arrayBuffer());
    console.log(`Descargado: ${raw.length} bytes`);
  }
  const text = new TextDecoder('latin1').decode(raw);
  const lines = text.split(/\r?\n/);

  const corte = parseCorte(lines[0] ?? '');
  if (!corte) throw new Error(`No pude leer la fecha de corte del encabezado: "${(lines[0] ?? '').slice(0, 120)}"`);
  console.log(`Fecha de corte declarada por el SAT: ${corte.toISOString().slice(0, 10)}`);

  // localizar la fila de encabezados (No,RFC,Nombre…)
  const headerIdx = lines.findIndex(l => l.startsWith('No,RFC,'));
  if (headerIdx === -1) throw new Error('Encabezados "No,RFC,…" no encontrados — ¿cambió el formato del CSV?');

  const rows: { rfc: string; razonSocial: string; situacion: string }[] = [];
  const malas: string[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const rfc = (cols[1] ?? '').trim().toUpperCase();
    const situacion = mapSituacion(cols[3] ?? '');
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc) || !situacion) {
      if (line.trim()) malas.push(line.slice(0, 60));
      continue;
    }
    rows.push({ rfc, razonSocial: (cols[2] ?? '').trim().slice(0, 250), situacion });
  }
  console.log(`Filas válidas: ${rows.length} | descartadas: ${malas.length}`);
  if (rows.length < 5000) throw new Error(`Demasiado pocas filas (${rows.length}) — no reemplazo la tabla (falla cerrada)`);

  // dedup por RFC (el listado puede repetir RFC en etapas distintas: gana la más severa)
  const rango: Record<string, number> = { DEFINITIVO: 4, PRESUNTO: 3, DESVIRTUADO: 2, SENTENCIA_FAVORABLE: 1 };
  const porRfc = new Map<string, { rfc: string; razonSocial: string; situacion: string }>();
  for (const r of rows) {
    const prev = porRfc.get(r.rfc);
    if (!prev || rango[r.situacion] > rango[prev.situacion]) porRfc.set(r.rfc, r);
  }
  const finales = [...porRfc.values()];
  console.log(`RFC únicos: ${finales.length}`);
  const porSituacion = finales.reduce((a: Record<string, number>, r) => { a[r.situacion] = (a[r.situacion] ?? 0) + 1; return a; }, {});
  console.log('Por situación:', JSON.stringify(porSituacion));

  await prisma.$transaction(async tx => {
    await tx.sat69B.deleteMany();
    for (let i = 0; i < finales.length; i += 2000) {
      await tx.sat69B.createMany({
        data: finales.slice(i, i + 2000).map(r => ({ ...r, importedAt: corte })),
      });
    }
  }, { timeout: 120_000 });

  console.log(`✓ Tabla Sat69B reemplazada: ${await prisma.sat69B.count()} filas, corte ${corte.toISOString().slice(0, 10)} (ingesta ${new Date().toISOString()})`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('FATAL:', e?.message); process.exit(1); });
