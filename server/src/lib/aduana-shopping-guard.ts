/**
 * D7 (auditoría 21-ago-2026): fuente única del guard anti-reincidencia
 * "no aduana-shopping". Ninguna recomendación de la Pre-Glosa, del Risk
 * Scorer, del generador de alertas ni de ningún otro generador de hallazgos
 * puede sugerir cambiar de aduana, puerto o patente para bajar la
 * probabilidad de Reconocimiento Aduanero — es exactamente la conducta que
 * el SAT perfila, incompatible con un producto de cumplimiento.
 *
 * Consumido por:
 *  - src/tests/no-aduana-shopping.test.ts (barre el árbol de código fuente)
 *  - prisma/seed/verify-no-aduana-shopping.mjs, vía el build compilado en
 *    dist/lib/aduana-shopping-guard.js (censo/verificador de la DB en prod;
 *    ese script es .mjs standalone y no puede importar TS directamente, así
 *    que usa el JS ya compilado para no duplicar el patrón).
 */
import fs from 'node:fs';
import path from 'node:path';

export const ADUANA_SHOPPING_PATTERN =
  /\b(aduana|puerto|patente)\s+(alterna|alterno|distint[ao]|diferente)\b|\b(cambiar?|considera|considerar|opta|optar|elegir|elige|usar|usa)\b[^.\n]{0,60}\b(aduana|puerto|patente)\b[^.\n]{0,40}\b(alterna|alterno|distint[ao]|otra|otro|diferente)\b/i;

/**
 * Quita comentarios `//` y `/* *​/` respetando cadenas ('...', "...", `...`)
 * para no comerse URLs (https://) ni literales que contengan "//". No es un
 * parser completo de TS (no maneja `${}` anidado dentro de template
 * literals ni regex literals), pero alcanza para los archivos de datos y
 * reglas que cubre este guard.
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let inString: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// "Árbol de reglas/seed": todo lo que genera recomendaciones/hallazgos
// (src/services/, incluye risk-scorer/) más el seed que los siembra en DB
// (prisma/seed/). Un archivo nuevo en cualquiera de los dos árboles queda
// cubierto automáticamente — no hay lista de nombres que mantener al día.
const SCAN_ROOTS = ['src/services', 'prisma/seed'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs']);

// Archivos que a propósito citan el vocabulario prohibido para documentar o
// probar este mismo guard — no son generadores de hallazgos y se excluyen
// del barrido para que no se detecten a sí mismos.
const SELF_REFERENTIAL = new Set([
  'prisma/seed/verify-no-aduana-shopping.mjs',
]);

function walk(dir: string, cwd: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(cwd, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(rel, cwd, out);
      continue;
    }
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) out.push(rel);
  }
}

export function listScanFiles(cwd: string = process.cwd()): string[] {
  const out: string[] = [];
  for (const root of SCAN_ROOTS) walk(root, cwd, out);
  return out.filter(f => !SELF_REFERENTIAL.has(f)).sort();
}

export interface AduanaShoppingOffender {
  file: string;
  line: number;
  snippet: string;
}

export function scanForAduanaShopping(cwd: string = process.cwd()): AduanaShoppingOffender[] {
  const offenders: AduanaShoppingOffender[] = [];
  const global = new RegExp(ADUANA_SHOPPING_PATTERN.source, 'gi');
  for (const file of listScanFiles(cwd)) {
    const raw = fs.readFileSync(path.join(cwd, file), 'utf8');
    const stripped = stripComments(raw);
    global.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = global.exec(stripped))) {
      const line = stripped.slice(0, m.index).split('\n').length;
      offenders.push({ file, line, snippet: m[0] });
      if (m.index === global.lastIndex) global.lastIndex++;
    }
  }
  return offenders;
}
