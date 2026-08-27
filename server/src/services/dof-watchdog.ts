/**
 * WATCHDOG DOF REAL (Operación 2026-08, Ola 2 regulatorio).
 *
 * Sustituye a las alertas DEMO de `dof-alerts.ts`. Dos fuentes, ambas
 * públicas y sin credenciales, ambas con parser determinista testeable con
 * fixture (el fetch se INYECTA; los tests no tocan la red):
 *
 *   1. Diputados — lista consolidada de decretos que reforman la Tarifa LIGIE
 *      (`tarifa-vigilante.ts`, ya en producción). Da FECHA DOF + URL del PDF.
 *      El PDF no se parsea (no hay dependencia de PDF en el server): sirve
 *      para saber QUÉ día buscar en el DOF.
 *   2. DOF — índice diario `index.php?year&month&day` → notas
 *      `nota_detalle.php?codigo=…&fecha=…`. Se filtran por título (tarifa,
 *      arancel, cuota compensatoria, LIGIE) y se lee el HTML de la nota para
 *      extraer FRACCIONES (8 dígitos con o sin puntos) y, cuando el decreto
 *      trae tabla fracción|descripción|tasa, la TASA nueva.
 *      El HTML del DOF no tiene contrato: si el índice responde pero el parser
 *      no encuentra notas, se registra `dof_watchdog_fuente_ciega` (un
 *      vigilante ciego que calla es un bug — regla de la casa).
 *
 * Luego FILTRA por el catálogo de cada cliente del tenant: `Product.fractionCode`,
 * `TemporaryImport` activas y últimas `Classification`. Solo las fracciones
 * del cliente generan `Alert` tipo `tariff_change` (una por decreto × cliente,
 * dedupe por `Alert.fingerprint`). `estimatedImpactMXN` = saldo en inventario
 * (MXN) × Δ arancel cuando la tasa nueva se pudo parsear y el catálogo tiene
 * NMF; si no, null y el texto lo dice.
 *
 * REGLA DURA heredada: este módulo SOLO AVISA — jamás escribe en Fraction.
 */

import { prisma } from '../lib/prisma';
import { enLotes } from '../lib/lotes';
import { logger } from '../lib/logger';
import { parsearReformasLigie, URL_REFORMAS_LIGIE, type DecretoDetectado } from './tarifa-vigilante';
import { tipoCambioMXN } from './frontera-canonica';
import { severidadPorImpacto } from './alert-severity';
import { accionRevisarFraccion } from './alert-acciones';
import { sinGuardaDeTenant } from '../lib/tenant-guard';

export const FUENTES_WATCHDOG = [
  { clave: 'diputados', nombre: 'Diputados — reformas LIGIE', url: URL_REFORMAS_LIGIE },
  { clave: 'dof', nombre: 'DOF — índice diario', url: 'https://www.dof.gob.mx/index.php' },
] as const;

export const urlIndiceDOF = (fechaISO: string): string => {
  const [y, m, d] = fechaISO.split('-');
  return `https://www.dof.gob.mx/index.php?year=${y}&month=${m}&day=${d}`;
};

export interface NotaDOF {
  codigo: string;
  fechaDOF: string; // ISO
  titulo: string;
  url: string;
}

export interface DecretoExtraido {
  clave: string;           // 'dof:<codigo>' | 'dip:<fecha>'
  fechaDOF: string;
  titulo: string;
  url: string;
  fuente: 'dof' | 'diputados';
  fracciones: string[];    // 8 dígitos sin puntos, únicas
  tasas: Record<string, number>; // fracción → tasa % nueva (Ex. = 0) cuando fue parseable
}

// ── Parsers puros ─────────────────────────────────────────────────────────

const RE_TITULO_RELEVANTE = /tarifa de la ley de los impuestos generales de importaci|arancel|cuota compensatoria|impuestos generales de importaci|ligie|fracci(o|ó)n(es)? arancelaria/i;

export function esTituloRelevante(titulo: string): boolean {
  return RE_TITULO_RELEVANTE.test(titulo);
}

function limpiarHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ');
}

/** Índice diario del DOF → notas con enlace `nota_detalle.php?codigo=&fecha=`. */
export function parsearIndiceDOF(html: string): NotaDOF[] {
  const out = new Map<string, NotaDOF>();
  const re = /<a[^>]*href="([^"]*nota_detalle\.php\?codigo=(\d+)&(?:amp;)?fecha=(\d{2})\/(\d{2})\/(\d{4})[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, href, codigo, dd, mm, yyyy, inner] = m;
    const titulo = limpiarHtml(inner!).replace(/\s+/g, ' ').trim();
    if (!titulo) continue;
    const url = href!.startsWith('http') ? href! : `https://www.dof.gob.mx/${href!.replace(/^\/?/, '')}`;
    const prev = out.get(codigo!);
    // El índice suele listar la misma nota dos veces (título + "Ver más"): se
    // conserva el título más largo.
    if (!prev || titulo.length > prev.titulo.length) {
      out.set(codigo!, { codigo: codigo!, fechaDOF: `${yyyy}-${mm}-${dd}`, titulo, url: url.replace(/&amp;/g, '&') });
    }
  }
  return [...out.values()];
}

/** Fracciones de 8 dígitos, con o sin puntos (0101.21.01 / 01012101). */
export function extraerFracciones(texto: string): string[] {
  const out = new Set<string>();
  const re = /(?<![\d.])(\d{4})\.?(\d{2})\.?(\d{2})(?![\d.])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const code = `${m[1]}${m[2]}${m[3]}`;
    // Capítulo 01-99 y no una fecha (20260827 / 2026.08.27). Con puntos solo se
    // conserva si la partida existe en la Tarifa: 19.01-19.05 y 20.01-20.09
    // (1901.10.01, 2001.10.01 son fracciones reales; 2026.08.27 no puede serlo).
    const cap = Number(code.slice(0, 2));
    if (cap < 1 || cap > 99) continue;
    const pareceFecha = /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code);
    if (pareceFecha) {
      const partida = Number(code.slice(0, 4));
      const partidaExiste = (partida >= 1901 && partida <= 1905) || (partida >= 2001 && partida <= 2009);
      if (!m[0].includes('.') || !partidaExiste) continue;
    }
    out.add(code);
  }
  return [...out];
}

/**
 * Tasas por fracción cuando la nota trae tabla. Reconoce "Ex." (exento = 0) y
 * "N" / "N%". Con celdas separadas por `|`:
 *   - 3-4 celdas (`fracción | descripción | [unidad] | tasa`) → la última;
 *   - ≥5 celdas (tabla LIGIE real `Fracción | Descripción | Unidad | IMP | EXP`)
 *     → la PENÚLTIMA (IMP); la última es Exportación (casi siempre "Ex.") y
 *     tomarla daba tasa 0 → falso "ahorro".
 * Sin `|` se toma el último número/Ex. de la línea. Best-effort: lo que no
 * encaje no aparece (→ impacto null).
 */
export function extraerTasas(texto: string): Record<string, number> {
  const out: Record<string, number> = {};
  const lineas = texto.split('\n');
  const reCodigo = /(?<![\d.])(\d{4})\.?(\d{2})\.?(\d{2})(?![\d.])/;
  const reTasa = /^(Ex\.?|\d{1,3}(?:\.\d+)?\s*%?)$/i;
  const reFilaSinPipes = /(?<![\d.])(\d{4})\.?(\d{2})\.?(\d{2})(?![\d.])\s+(?:.*\s)?(Ex\.?|\d{1,3}(?:\.\d+)?\s*%?)\s*$/i;
  const aTasa = (txt: string): number | null => {
    const t = txt.trim();
    if (!reTasa.test(t)) return null;
    const n = /^ex/i.test(t) ? 0 : Number(t.replace('%', '').trim());
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  for (const l of lineas) {
    const linea = l.trim();
    if (!linea) continue;
    let code: string | null = null;
    let tasa: number | null = null;
    if (linea.includes('|')) {
      const celdas = linea.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (celdas.length < 2) continue;
      const mc = reCodigo.exec(celdas[0]!);
      if (!mc) continue;
      code = `${mc[1]}${mc[2]}${mc[3]}`;
      const idx = celdas.length >= 5 ? celdas.length - 2 : celdas.length - 1;
      tasa = aTasa(celdas[idx]!);
    } else {
      const m = reFilaSinPipes.exec(linea);
      if (!m) continue;
      code = `${m[1]}${m[2]}${m[3]}`;
      tasa = aTasa(m[4]!);
    }
    if (code && tasa !== null) out[code] = tasa;
  }
  return out;
}

export function extraerDecretoDeNota(nota: NotaDOF, html: string): DecretoExtraido {
  const texto = limpiarHtml(html);
  return {
    clave: `dof:${nota.codigo}`,
    fechaDOF: nota.fechaDOF,
    titulo: nota.titulo,
    url: nota.url,
    fuente: 'dof',
    fracciones: extraerFracciones(texto),
    tasas: extraerTasas(texto),
  };
}

// ── Catálogo del cliente ──────────────────────────────────────────────────

export interface CatalogoCliente {
  clienteId: string | null; // null = fracciones sin cliente asignado (tenant)
  fracciones: Set<string>;
}

/**
 * Fracciones "del cliente": Product.fractionCode + TemporaryImport activas +
 * últimas 200 clasificaciones + fracciones en monitoreo (Alert type 'watch').
 * Agrupadas por clienteId (null = sin cliente). Las de tenant (null) se
 * evalúan como un grupo propio; NO se mezclan con las de cada cliente para
 * que la alerta llegue al RFC correcto.
 */
export async function catalogoPorCliente(tenantId: string): Promise<CatalogoCliente[]> {
  const [productos, temporales, clasificaciones, watch] = await Promise.all([
    prisma.product.findMany({ where: { tenantId, active: true, fractionCode: { not: null } }, select: { clienteId: true, fractionCode: true } }),
    prisma.temporaryImport.findMany({ where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } }, select: { clienteId: true, fractionCode: true } }),
    prisma.classification.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200, select: { clienteId: true, fractionCode: true } }),
    prisma.alert.findMany({ where: { tenantId, type: 'watch' }, select: { clienteId: true, fractionCodes: true } }),
  ]);
  const mapa = new Map<string | null, Set<string>>();
  const add = (clienteId: string | null, code: string | null | undefined) => {
    const c = (code ?? '').replace(/\./g, '');
    if (!/^\d{8}$/.test(c)) return;
    const k = clienteId ?? null;
    if (!mapa.has(k)) mapa.set(k, new Set());
    mapa.get(k)!.add(c);
  };
  for (const p of productos) add(p.clienteId, p.fractionCode);
  for (const t of temporales) add(t.clienteId, t.fractionCode);
  for (const c of clasificaciones) add(c.clienteId, c.fractionCode);
  for (const w of watch) for (const f of w.fractionCodes) add(w.clienteId, f);
  return [...mapa.entries()].map(([clienteId, fracciones]) => ({ clienteId, fracciones }));
}

/** Intersección decreto ∩ catálogo — pura, testeable. */
export function fraccionesAfectadas(decreto: Pick<DecretoExtraido, 'fracciones'>, catalogo: Set<string>): string[] {
  return decreto.fracciones.filter(f => catalogo.has(f));
}

// ── Impacto ──────────────────────────────────────────────────────────────

export interface ImpactoDecreto {
  impactoMXN: number | null;
  detalle: string;
  temporaryImportIds: string[];
}

/**
 * Impacto = Σ saldo (MXN) × (tasaNueva − NMF)/100 sobre TemporaryImport
 * activas de las fracciones afectadas. Requiere tasa parseada y NMF de
 * catálogo; si falta cualquiera → null con explicación.
 */
export async function impactoEstimado(
  tenantId: string,
  clienteId: string | null,
  decreto: DecretoExtraido,
  afectadas: string[],
  tc: number | null,
): Promise<ImpactoDecreto> {
  const conTasa = afectadas.filter(f => decreto.tasas[f] != null);
  if (conTasa.length === 0) {
    return { impactoMXN: null, detalle: 'El decreto no trae tasas parseables para estas fracciones: impacto en pesos no calculable — revisa el texto oficial.', temporaryImportIds: [] };
  }
  const [temporales, fracciones] = await Promise.all([
    prisma.temporaryImport.findMany({
      where: { tenantId, ...(clienteId ? { clienteId } : {}), status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] }, fractionCode: { in: conTasa } },
      select: { id: true, fractionCode: true, quantity: true, quantityDischarged: true, customsValue: true, valueMXN: true },
    }),
    prisma.fraction.findMany({ where: { code: { in: conTasa } }, select: { code: true, tariffNMF: true } }),
  ]);
  const nmf = new Map(fracciones.map(f => [f.code, f.tariffNMF]));
  let total = 0;
  let calculables = 0;
  const ids: string[] = [];
  for (const t of temporales) {
    const actual = nmf.get(t.fractionCode);
    const nueva = decreto.tasas[t.fractionCode];
    if (actual == null || nueva == null) continue;
    const valorMXN = t.valueMXN ?? (tc != null ? t.customsValue * tc : null);
    if (valorMXN == null || t.quantity <= 0) continue;
    const saldo = valorMXN * ((t.quantity - t.quantityDischarged) / t.quantity);
    total += saldo * ((nueva - actual) / 100);
    calculables++;
    ids.push(t.id);
  }
  if (calculables === 0) {
    return { impactoMXN: null, detalle: 'Sin saldo en inventario (o sin NMF/TC) para estimar el impacto en pesos.', temporaryImportIds: [] };
  }
  return {
    impactoMXN: Math.round(total),
    detalle: `Estimado sobre ${calculables} partida(s) con saldo: Δ arancel × saldo en inventario (positivo = costo adicional).`,
    temporaryImportIds: ids,
  };
}

// ── Estado del vigilante (para la UI "última revisión") ───────────────────

export interface EstadoWatchdog {
  ultimaRevision: string | null;
  fuentes: { clave: string; nombre: string; url: string; estado: 'ok' | 'ciega' | 'sin_revisar' }[];
  decretosRevisados: number;
  alertasCreadas: number;
  ventanaDias: number;
}

let estado: EstadoWatchdog = {
  ultimaRevision: null,
  fuentes: FUENTES_WATCHDOG.map(f => ({ ...f, estado: 'sin_revisar' as const })),
  decretosRevisados: 0,
  alertasCreadas: 0,
  ventanaDias: 0,
};

export async function estadoWatchdog(): Promise<EstadoWatchdog> {
  if (estado.ultimaRevision) return estado;
  // Tras un reinicio: recupera la última corrida del SystemLog (cross-tenant deliberado: es un job global).
  try {
    const ultimo = await sinGuardaDeTenant(() => prisma.systemLog.findFirst({
      where: { action: 'dof_watchdog_run' }, orderBy: { timestamp: 'desc' }, select: { timestamp: true, metadata: true },
    }));
    if (ultimo) {
      const meta = (ultimo.metadata ?? {}) as Partial<EstadoWatchdog>;
      return { ...estado, ...meta, ultimaRevision: ultimo.timestamp.toISOString() };
    }
  } catch { /* sin log = sin revisión */ }
  return estado;
}

// ── Corrida ───────────────────────────────────────────────────────────────

export interface OpcionesWatchdog {
  fetchFn?: typeof fetch;
  ahora?: Date;
  /** Días hacia atrás que se revisan en el índice DOF (default env DOF_WATCHDOG_DIAS ?? 7). */
  ventanaDias?: number;
  /** Solo estos tenants (tests). Default: todos los ACTIVE/PILOT/TRIAL. */
  tenantIds?: string[];
  /** TC inyectable (tests). Default: tipoCambioMXN(). */
  tc?: number | null;
}

export interface ResultadoWatchdog {
  decretos: DecretoExtraido[];
  alertasCreadas: number;
  alertasExistentes: number;
  fuentesCiegas: string[];
}

async function leer(fetchFn: typeof fetch, url: string): Promise<string | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    logger.warn(`Watchdog DOF: no pude leer ${url} — ${err instanceof Error ? err.message : err}`, {
      action: 'dof_watchdog_fuente_ciega', metadata: { url },
    });
    return null;
  }
}

const fechaISO = (d: Date): string => d.toISOString().slice(0, 10);

/** Reúne decretos de ambas fuentes en la ventana. Sin DB. */
export async function recolectarDecretos(opts: Required<Pick<OpcionesWatchdog, 'fetchFn' | 'ahora' | 'ventanaDias'>>): Promise<{ decretos: DecretoExtraido[]; fuentesCiegas: string[]; diputados: DecretoDetectado[] }> {
  const { fetchFn, ahora, ventanaDias } = opts;
  const fuentesCiegas: string[] = [];
  const desde = fechaISO(new Date(ahora.getTime() - ventanaDias * 86400000));

  // 1. Diputados → fechas DOF con decreto de tarifa (últimos 180 días para no perder decretos que el índice DOF ya no lista en la ventana corta).
  const htmlDip = await leer(fetchFn, URL_REFORMAS_LIGIE);
  let diputados: DecretoDetectado[] = [];
  if (htmlDip == null) fuentesCiegas.push('diputados');
  else {
    diputados = parsearReformasLigie(htmlDip);
    if (diputados.length === 0) {
      fuentesCiegas.push('diputados');
      logger.warn('Watchdog DOF: Diputados respondió pero el parse no encontró decretos (¿cambió el formato?)', { action: 'dof_watchdog_fuente_ciega', metadata: { url: URL_REFORMAS_LIGIE } });
    }
  }
  const desdeDip = fechaISO(new Date(ahora.getTime() - 180 * 86400000));
  const fechasDip = new Set(diputados.filter(d => d.fechaDOF >= desdeDip && d.fechaDOF <= fechaISO(ahora)).map(d => d.fechaDOF));

  // 2. Fechas a revisar en el DOF: ventana corta + fechas de Diputados.
  const fechas = new Set<string>(fechasDip);
  for (let i = 0; i <= ventanaDias; i++) fechas.add(fechaISO(new Date(ahora.getTime() - i * 86400000)));

  const decretos: DecretoExtraido[] = [];
  let dofRespondio = false;
  let dofConNotas = false;
  for (const f of [...fechas].sort()) {
    if (f < desde && !fechasDip.has(f)) continue;
    const html = await leer(fetchFn, urlIndiceDOF(f));
    if (html == null) continue;
    dofRespondio = true;
    const notas = parsearIndiceDOF(html);
    if (notas.length > 0) dofConNotas = true;
    for (const n of notas.filter(n => esTituloRelevante(n.titulo))) {
      const cuerpo = await leer(fetchFn, n.url);
      if (cuerpo == null) continue;
      decretos.push(extraerDecretoDeNota(n, cuerpo));
    }
  }
  if (!dofRespondio || !dofConNotas) {
    fuentesCiegas.push('dof');
    if (dofRespondio) logger.warn('Watchdog DOF: el índice respondió pero el parser no encontró notas (¿cambió el HTML?)', { action: 'dof_watchdog_fuente_ciega', metadata: { fechas: [...fechas] } });
  }

  // 3. Decretos de Diputados sin nota DOF localizada: se reportan sin fracciones (no filtrables; los vigila tarifa-vigilante con alerta SUPERADMIN).
  for (const d of diputados) {
    if (!fechasDip.has(d.fechaDOF)) continue;
    if (decretos.some(x => x.fechaDOF === d.fechaDOF)) continue;
    decretos.push({ clave: `dip:${d.fechaDOF}`, fechaDOF: d.fechaDOF, titulo: `Decreto que modifica la Tarifa LIGIE (DOF ${d.fechaDOF})`, url: d.url, fuente: 'diputados', fracciones: [], tasas: {} });
  }
  return { decretos, fuentesCiegas, diputados };
}

/** Corre el watchdog: recolecta decretos y genera alertas filtradas por catálogo. */
export async function correrWatchdogDOF(opts: OpcionesWatchdog = {}): Promise<ResultadoWatchdog> {
  const fetchFn = opts.fetchFn ?? fetch;
  const ahora = opts.ahora ?? new Date();
  const ventanaDias = opts.ventanaDias ?? Math.max(1, parseInt(process.env.DOF_WATCHDOG_DIAS ?? '7', 10) || 7);

  const { decretos, fuentesCiegas } = await recolectarDecretos({ fetchFn, ahora, ventanaDias });
  const conFracciones = decretos.filter(d => d.fracciones.length > 0);

  let alertasCreadas = 0;
  let alertasExistentes = 0;
  if (conFracciones.length > 0) {
    const tenants = opts.tenantIds
      ? opts.tenantIds.map(id => ({ id }))
      : await prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'PILOT', 'TRIAL'] } }, select: { id: true } });
    const tc = opts.tc !== undefined ? opts.tc : (await tipoCambioMXN()).valor;
    // Revisión C: tenants en lotes de 50; un tenant que falla no tumba el tick.
    for (const lote of enLotes(tenants)) {
      for (const t of lote) {
        try {
          const r = await alertarTenant(t.id, conFracciones, tc);
          alertasCreadas += r.creadas;
          alertasExistentes += r.existentes;
        } catch (err) {
          logger.error('Watchdog DOF: alertar tenant falló', { action: 'dof_watchdog_tenant_fail', tenantId: t.id, errorMessage: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  }

  estado = {
    ultimaRevision: ahora.toISOString(),
    fuentes: FUENTES_WATCHDOG.map(f => ({ ...f, estado: fuentesCiegas.includes(f.clave) ? 'ciega' as const : 'ok' as const })),
    decretosRevisados: decretos.length,
    alertasCreadas,
    ventanaDias,
  };
  logger.info(`Watchdog DOF: ${decretos.length} decreto(s) revisados, ${alertasCreadas} alerta(s) nueva(s), fuentes ciegas: ${fuentesCiegas.join(',') || 'ninguna'}`, {
    action: 'dof_watchdog_run', metadata: { ...estado, ultimaRevision: undefined },
  });
  return { decretos, alertasCreadas, alertasExistentes, fuentesCiegas };
}

/** Genera alertas para un tenant a partir de decretos con fracciones. Exportado para test con fixture. */
export async function alertarTenant(tenantId: string, decretos: DecretoExtraido[], tc: number | null): Promise<{ creadas: number; existentes: number }> {
  const catalogo = await catalogoPorCliente(tenantId);
  let creadas = 0;
  let existentes = 0;
  for (const d of decretos) {
    for (const grupo of catalogo) {
      const afectadas = fraccionesAfectadas(d, grupo.fracciones);
      if (afectadas.length === 0) continue;
      const fingerprint = `dof_watchdog|${d.clave}|${grupo.clienteId ?? 'tenant'}`;
      const ya = await prisma.alert.findFirst({ where: { tenantId, fingerprint }, select: { id: true } });
      if (ya) { existentes++; continue; }
      const impacto = await impactoEstimado(tenantId, grupo.clienteId, d, afectadas, tc);
      const severity = severidadPorImpacto({ tipo: 'tariff_change', impactoMXN: impacto.impactoMXN, diasParaVencer: null });
      const lista = afectadas.slice(0, 8).map(f => `${f.slice(0, 4)}.${f.slice(4, 6)}.${f.slice(6)}`).join(', ') + (afectadas.length > 8 ? ` y ${afectadas.length - 8} más` : '');
      try {
        await prisma.alert.create({
        data: {
          tenantId,
          clienteId: grupo.clienteId,
          channel: 'IN_APP',
          type: 'tariff_change',
          severity,
          title: `DOF ${d.fechaDOF}: decreto que toca ${afectadas.length} fracción${afectadas.length === 1 ? '' : 'es'} de tu catálogo`,
          content: `${d.titulo}. Fracciones de tu catálogo mencionadas: ${lista}. ` +
            (impacto.impactoMXN != null
              ? `Impacto estimado: $${Math.abs(impacto.impactoMXN).toLocaleString('es-MX')} MXN (${impacto.impactoMXN >= 0 ? 'costo adicional' : 'ahorro'}). ${impacto.detalle} `
              : `${impacto.detalle} `) +
            `Fundamento: ${d.url}. No se aplicó ningún cambio al catálogo: revisa el decreto y ordena el cotejo.`,
          fractionCodes: afectadas,
          affectedFraction: afectadas[0] ?? null,
          affectedOperations: impacto.temporaryImportIds,
          estimatedImpactMXN: impacto.impactoMXN != null ? (-impacto.impactoMXN || 0) : null,
          impactType: impacto.impactoMXN != null ? (impacto.impactoMXN >= 0 ? 'cost' : 'savings') : 'risk',
          actionRequired: 'Revisar el decreto y confirmar la tasa vigente de cada fracción',
          suggestedAction: accionRevisarFraccion(afectadas[0]!) as unknown as object,
          fingerprint,
        },
        });
        creadas++;
      } catch (err) {
        // Carrera con otra réplica sobre @@unique([tenantId, fingerprint]): ya existe, seguir.
        if ((err as { code?: string }).code === 'P2002') { existentes++; continue; }
        throw err;
      }
    }
  }
  return { creadas, existentes };
}
