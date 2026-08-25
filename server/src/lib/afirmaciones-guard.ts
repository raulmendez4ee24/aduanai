/**
 * Guard anti-reincidencia de afirmaciones comerciales (misión honestidad,
 * 24-ago-2026). Mismo patrón que aduana-shopping-guard y campo-numerico:
 * librería = fuente única; test = barrido; Dockerfile = gate fail-closed.
 *
 * Fuente de verdad del lenguaje permitido: docs/COMO_FUNCIONA_ADUANAI.md §11
 * (corte 24-ago). Cada patrón de abajo corresponde a una afirmación que la
 * radiografía marcó CONTRADICHA o SIN EVIDENCIA. La lista blanca exige que
 * cada excepción cite su artefacto reproducible — sin artefacto no hay
 * excepción.
 *
 * Superficies barridas: lo que llega al usuario — páginas y componentes del
 * cliente, y services/routes del servidor (strings de respuesta, disclaimers,
 * plantillas). Los comentarios se descartan con el stripComments consciente
 * de cadenas (documentar un patrón prohibido no lo reintroduce).
 */
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './aduana-shopping-guard';

export interface PatronProhibido {
  id: string;
  regex: RegExp;
  porQue: string;
}

export const PATRONES_PROHIBIDOS: PatronProhibido[] = [
  { id: 'precision-95', regex: /\b9[05]\s*%\s*\+|\b9[05]\+\s*%|\b95\s*%(?!\w)|\b9[05] por ciento/i, porQue: 'La evidencia es 61.6% top-1 / 81.8% capítulo (medicion-tanda-8544-2026-08-24.json) — nada de 90/95%.' },
  { id: 'benchmark-12000', regex: /12[,.]?000\s*(\+\s*)?productos|12 ?mil productos/i, porQue: 'No existe benchmark de 12,000 productos; el set interno es de 99 casos.' },
  { id: 'quince-segundos', regex: /15 segundos|quince segundos/i, porQue: 'Duración real observada: ~45 s a 2.5 min (runner de accuracy).' },
  { id: 'mismo-dia-dof', regex: /aplicad[oa]s? el mismo día|decretos .{0,30}mismo día/i, porQue: 'El vigilante tarifario detecta y ALERTA; no aplica decretos.' },
  // "determinar la fracción correcta" (nota interna a revisor humano) es uso
  // legítimo — el patrón exige el verbo de PROMESA antes.
  { id: 'fraccion-exacta', regex: /fracci[oó]n (arancelaria )?exacta|(elige|devuelve|obtiene|entrega|te da|encuentra) la fracci[oó]n correcta/i, porQue: 'El clasificador produce una hipótesis documentada, no "la exacta/correcta".' },
  { id: 'rgi-algoritmo', regex: /(aplica|ejecuta|corre) las (6|seis) (RGI|Reglas)/i, porQue: 'No hay motor RGI determinista; prometerlo contradice la radiografía §4/§11.' },
  { id: 'calibrado-industria', regex: /calibrad[oa]s? con (prácticas|la industria)|heur[ií]sticas calibradas/i, porQue: 'Las reglas de Pre-Glosa no tienen calibración con datos de la industria.' },
  { id: 'probabilidad-glosa', regex: /Prob\.? de (revisión|cotejo|glosa)|(?<![nN]o )probabilidad(es)?( reales?)? de (reconocimiento|revisión|cotejo|glosa)|estima probabilidades/, porQue: 'Las tres cifras de Pre-Glosa son índices heurísticos, no probabilidades.' },
  { id: 'garantia-comercial', regex: /(?<![Nn]o )garantizamos/, porQue: 'Sin evidencia de infraestructura/contrato no se garantiza nada; solo se permite el disclaimer negado ("No garantizamos…").' },
  { id: 'seguridad-sin-evidencia', regex: /AES-256|TLS 1\.3|(registro|bit[aá]cora|trazabilidad|auditor[ií]a|cadena)[^.\n]{0,30}inmutable/i, porQue: 'Cifrado en reposo/versión TLS/"inmutable" requieren evidencia de infraestructura que no existe hoy.' },
  { id: 'cien-por-ciento', regex: /100\s*%\s*(de\s*)?(precisi[oó]n|acierto|exact|correctas?)/i, porQue: 'Nada es 100% en este producto; la métrica real vive en metricas-medidas.ts.' },
  { id: 'lider', regex: /plataforma líder|l[ií]der del mercado|(el|la) m[aá]s (precis|avanzad|complet)\w* (de M[eé]xico|del mercado|del país)/i, porQue: 'Afirmación de liderazgo sin evidencia.' },
  { id: 'ia-que-aprende', regex: /(el motor|la IA|el sistema|el clasificador) aprende|IA predictiva/i, porQue: 'No hay loop de aprendizaje automático; el feedback se archiva para revisión.' },
  { id: 'instantaneo', regex: /clasifica(ci[oó]n)? instant[aá]ne|resultados instant[aá]neos/i, porQue: 'La clasificación tarda 1-3 minutos.' },
];

export interface ExcepcionPermitida {
  /** Ruta relativa a la raíz del repo. */
  file: string;
  patronId: string;
  /** Artefacto reproducible que justifica la excepción — OBLIGATORIO. */
  artefacto: string;
}

// Lista blanca: cada entrada cita su artefacto. Sin artefacto no se agrega.
export const LISTA_BLANCA: ExcepcionPermitida[] = [
  {
    file: 'client/src/pages/Public/Terms.tsx',
    patronId: 'cien-por-ciento',
    artefacto: 'Disclaimer NEGADO ("No garantizamos… que los resultados sean 100% precisos") — es la renuncia de garantía, no una promesa. Texto verificable en la propia página.',
  },
  {
    file: 'server/src/services/backup.ts',
    patronId: 'seguridad-sin-evidencia',
    artefacto: 'No es una promesa: es el ALGORITMO real del pipeline de backups (openssl aes-256-gcm en este mismo archivo; runbook docs/BACKUPS.md).',
  },
  {
    file: 'client/src/pages/Admin/AdminBackups.tsx',
    patronId: 'seguridad-sin-evidencia',
    artefacto: 'Panel ADMIN interno que describe el pipeline real (pg_dump → AES-256-GCM → SHA-256), implementado en server/src/services/backup.ts — evidencia en código, no marketing.',
  },
];

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Superficies de cara al usuario.
const SCAN_ROOTS = [
  'client/src/pages',
  'client/src/components',
  'client/src/lib',
  'server/src/services',
  'server/src/routes',
];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

// El propio guard y sus tests citan los patrones prohibidos a propósito.
const AUTOREFERENCIALES = new Set([
  'server/src/lib/afirmaciones-guard.ts',
]);

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(rel, out); continue; }
    if (SCAN_EXTENSIONS.has(path.extname(entry.name)) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
}

export function listarArchivos(): string[] {
  const out: string[] = [];
  for (const root of SCAN_ROOTS) walk(root, out);
  return out.filter(f => !AUTOREFERENCIALES.has(f)).sort();
}

export interface Hallazgo {
  file: string;
  patronId: string;
  linea: number;
  fragmento: string;
}

export function barrerAfirmaciones(): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const permitidas = new Set(LISTA_BLANCA.map(e => `${e.file}::${e.patronId}`));
  for (const file of listarArchivos()) {
    const contenido = stripComments(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
    for (const patron of PATRONES_PROHIBIDOS) {
      const global = new RegExp(patron.regex.source, patron.regex.flags.includes('g') ? patron.regex.flags : patron.regex.flags + 'g');
      let m: RegExpExecArray | null;
      while ((m = global.exec(contenido))) {
        if (permitidas.has(`${file}::${patron.id}`)) continue;
        const linea = contenido.slice(0, m.index).split('\n').length;
        hallazgos.push({ file, patronId: patron.id, linea, fragmento: m[0].slice(0, 60) });
        if (m.index === global.lastIndex) global.lastIndex++;
      }
    }
  }
  return hallazgos;
}
