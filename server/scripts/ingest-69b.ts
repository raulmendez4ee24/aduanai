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
import { dedupPorRfc } from '../src/lib/sat69b-dedup';

// URL vigente (25-ago-2026): el minisitio de Datos Abiertos del SAT
// (https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html)
// publica el listado en este blob; la URL vieja de omawww quedó CONGELADA en
// el corte 31-dic-2025 mientras esta sirve el corte vigente (31-jul-2026 hoy).
const URL_SAT = 'https://wu1agsprosta001.blob.core.windows.net/agsc-publicaciones/Datos_abiertos/Documents_AGAFF/Listado_completo_69-B.csv';

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

  // Columnas de fecha de publicación por situación (bloques de 4 desde la 4):
  // presunción 4-7, desvirtuados 8-11, definitivos 12-15, sentencia 16-19.
  // Se toma la publicación en página SAT del bloque de la situación de la
  // fila (fallback: publicación DOF del mismo bloque).
  const COL_FECHA: Record<string, [number, number]> = {
    PRESUNTO: [5, 7], DESVIRTUADO: [9, 11], DEFINITIVO: [13, 15], SENTENCIA_FAVORABLE: [17, 19],
  };
  const parseFecha = (v: string | undefined): Date | null => {
    const m = (v ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return isNaN(d.getTime()) ? null : d;
  };

  const rows: { rfc: string; razonSocial: string; situacion: string; fecha: Date | null }[] = [];
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
    const [cSat, cDof] = COL_FECHA[situacion]!;
    const fecha = parseFecha(cols[cSat]) ?? parseFecha(cols[cDof]);
    rows.push({ rfc, razonSocial: (cols[2] ?? '').trim().slice(0, 250), situacion, fecha });
  }
  const conFecha = rows.filter(r => r.fecha).length;
  console.log(`Con fecha de publicación parseable: ${conFecha}/${rows.length}`);
  // Descartes auditables (revisión 25-ago): el SAT redacta filas por
  // declaratoria de nulidad (RFC 'XXXX…') y las razones sociales con salto de
  // línea generan fragmentos — se reporta el desglose, no solo el total.
  const suprimidas = malas.filter(l => l.includes('XXXXXXXXXXXX')).length;
  console.log(`Filas válidas: ${rows.length} | descartadas: ${malas.length} (suprimidas por SAT: ${suprimidas}, fragmentos/otros: ${malas.length - suprimidas})`);
  if (malas.length - suprimidas > 100) {
    console.warn('AVISO: descartes no-suprimidos inusualmente altos — muestras:', malas.slice(0, 5));
  }
  if (rows.length < 5000) throw new Error(`Demasiado pocas filas (${rows.length}) — no reemplazo la tabla (falla cerrada)`);

  const finales = dedupPorRfc(rows);
  console.log(`RFC únicos: ${finales.length}`);
  const porSituacion = finales.reduce((a: Record<string, number>, r) => { a[r.situacion] = (a[r.situacion] ?? 0) + 1; return a; }, {});
  console.log('Por situación:', JSON.stringify(porSituacion));

  await prisma.$transaction(async tx => {
    await tx.sat69B.deleteMany();
    for (let i = 0; i < finales.length; i += 2000) {
      await tx.sat69B.createMany({
        data: finales.slice(i, i + 2000).map(r => ({ rfc: r.rfc, razonSocial: r.razonSocial, situacion: r.situacion, fechaOficio: r.fecha ?? null, importedAt: corte })),
      });
    }
  }, { timeout: 120_000 });

  console.log(`✓ Tabla Sat69B reemplazada: ${await prisma.sat69B.count()} filas, corte ${corte.toISOString().slice(0, 10)} (ingesta ${new Date().toISOString()})`);
  await prisma.$disconnect();
}

// Solo ejecuta cuando se corre como script — importar dedupPorRfc desde un
// test no debe disparar la descarga/reemplazo de la tabla.
if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e?.message); process.exit(1); });
}
