/**
 * RISK SCORER operativo (Ola 2, 27-ago-2026): folio por tenant, respaldo
 * documental (declarado → verificado), historial/score vivo por cliente,
 * modo cartera para el gerente y dictamen imprimible con hash.
 *
 * El motor (`engine.ts`) sigue puro y sin tocar: aquí solo se RE-ETIQUETA el
 * origen de la señal cuando existe un documento de respaldo, sin alterar
 * pesos ni puntos. "verificado" tras evidencia significa "respaldado con un
 * documento adjunto por un usuario del tenant" — el dictamen lo dice así.
 */
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { AssessmentResultado, ChecklistResultado, FactorResultado, ReglaResultado } from './types';

// ── Folio RS-<año>-<seq> por tenant ─────────────────────────────────────

export function formatearFolio(anio: number, seq: number): string {
  return `RS-${anio}-${String(seq).padStart(4, '0')}`;
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Siguiente folio secuencial del tenant para el año dado (lee el máximo
 *  persistido). #20: orden por LONGITUD y luego valor — el `orderBy folio desc`
 *  era lexicográfico y tras RS-2026-9999 el RS-2026-10000 ordenaba antes (se
 *  repetía). Para que sea atómico entre peticiones concurrentes, úsalo dentro
 *  de `conFolioAtomico` (candado de aviso por tenant en la misma transacción). */
export async function siguienteFolio(tenantId: string, fecha: Date = new Date(), db: Db = prisma): Promise<string> {
  const anio = fecha.getUTCFullYear();
  const prefijo = `RS-${anio}-`;
  const filas = await db.$queryRaw<{ folio: string }[]>`
    SELECT folio FROM risk_assessments
    WHERE "tenantId" = ${tenantId} AND folio LIKE ${`${prefijo}%`}
    ORDER BY length(folio) DESC, folio DESC
    LIMIT 1`;
  const ultimo = filas[0]?.folio ?? null;
  const seq = ultimo ? Number(ultimo.slice(prefijo.length)) || 0 : 0;
  return formatearFolio(anio, seq + 1);
}

/**
 * #20: ejecuta `fn` con el siguiente folio del tenant bajo
 * `pg_advisory_xact_lock(hashtext('risk-folio:'+tenantId))` en UNA
 * transacción: dos POST concurrentes serializan y jamás comparten folio (sin
 * campo nuevo en el schema). El candado se libera al cerrar la transacción.
 */
export async function conFolioAtomico<T>(
  tenantId: string,
  fn: (folio: string, tx: Prisma.TransactionClient) => Promise<T>,
  fecha: Date = new Date(),
): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`risk-folio:${tenantId}`}))`;
    const folio = await siguienteFolio(tenantId, fecha, tx);
    return fn(folio, tx);
  }, { timeout: 15_000 });
}

// ── Evidencia: declarado → verificado (sin tocar pesos) ─────────────────

export interface EvidenciaFactor {
  documentId: string;
  verificadoAt: string;
  verificadoPor: string;
  nombre?: string;
}
export type EvidenciaMap = Record<string, EvidenciaFactor>;

/** ¿La evidencia bajo `clave` aplica a esta regla/ítem? Acepta id exacto o id de factor. */
function evidenciaPara(evidencia: EvidenciaMap, ids: string[]): EvidenciaFactor | null {
  for (const id of ids) if (evidencia[id]) return evidencia[id]!;
  return null;
}

export type ReglaConEvidencia = ReglaResultado & { evidenciaDocumentId?: string; verificadoPorEvidencia?: boolean };
export type ChecklistConEvidencia = ChecklistResultado & { evidenciaDocumentId?: string; verificadoPorEvidencia?: boolean };

export interface ResultadoConEvidencia extends Omit<AssessmentResultado, 'factores' | 'checklist'> {
  factores: (Omit<FactorResultado, 'reglas'> & { reglas: ReglaConEvidencia[] })[];
  checklist: ChecklistConEvidencia[];
}

/**
 * Aplica el mapa de evidencia a un resultado del motor. Función PURA:
 * - regla `declarado` con evidencia (por id de regla o de factor) → `verificado`.
 * - ítem del escudo `declarado` con evidencia (por id de ítem) → origenSenal `verificado`.
 * - puntos, pesos, completo, banda, exposición y escudo NO cambian.
 * - cobertura se recalcula con las etiquetas nuevas.
 */
export function aplicarEvidencia(base: AssessmentResultado, evidencia: EvidenciaMap): ResultadoConEvidencia {
  const factores = base.factores.map(f => ({
    ...f,
    reglas: f.reglas.map((r): ReglaConEvidencia => {
      const ev = evidenciaPara(evidencia, [r.id, r.factor]);
      if (!ev || r.origenEfectivo !== 'declarado') return { ...r };
      return { ...r, origenEfectivo: 'verificado', evidenciaDocumentId: ev.documentId, verificadoPorEvidencia: true };
    }),
  }));
  const checklist = base.checklist.map((c): ChecklistConEvidencia => {
    const ev = evidenciaPara(evidencia, [c.id]);
    if (!ev || c.origenSenal !== 'declarado') return { ...c };
    return { ...c, origenSenal: 'verificado', evidenciaDocumentId: ev.documentId, verificadoPorEvidencia: true };
  });
  const reglas = factores.flatMap(f => f.reglas);
  return {
    ...base, factores, checklist,
    cobertura: {
      ...base.cobertura,
      verificadas: reglas.filter(r => r.origenEfectivo === 'verificado' || r.origenEfectivo === 'mixto').length,
      declaradas: reglas.filter(r => r.origenEfectivo === 'declarado').length,
      noEvaluadas: reglas.filter(r => r.origenEfectivo === 'no_evaluado').length,
    },
  };
}

/** Reconstruye el resultado persistido (detalle + checklist + escalares) para reaplicar evidencia. */
export function resultadoDesdeFila(row: {
  exposicion: number; escudoPct: number; banda: string; detalle: unknown; checklist: unknown; rulesVersion: string;
}): AssessmentResultado {
  const factores = (row.detalle ?? []) as FactorResultado[];
  const checklist = (row.checklist ?? []) as ChecklistResultado[];
  const reglas = factores.flatMap(f => f.reglas ?? []);
  const banderas = [...new Set(reglas.filter(r => r.puntos > 0 && r.bandera).map(r => r.bandera as string))];
  return {
    exposicion: row.exposicion, escudoPct: row.escudoPct, banda: row.banda as AssessmentResultado['banda'],
    banderas, factores, checklist, faltantes: [],
    cobertura: {
      verificadas: reglas.filter(r => r.origenEfectivo === 'verificado' || r.origenEfectivo === 'mixto').length,
      declaradas: reglas.filter(r => r.origenEfectivo === 'declarado').length,
      noEvaluadas: reglas.filter(r => r.origenEfectivo === 'no_evaluado').length,
      identificadoresFaltantes: [],
    },
    rulesVersion: row.rulesVersion, disclaimer: '',
  };
}

/** Ids válidos para adjuntar evidencia: reglas, ítems del escudo y factores. */
export function idsEvidenciables(base: AssessmentResultado): Set<string> {
  const ids = new Set<string>();
  for (const f of base.factores) { ids.add(f.factor); for (const r of f.reglas) ids.add(r.id); }
  for (const c of base.checklist) ids.add(c.id);
  return ids;
}

// ── Cartera y tendencia ─────────────────────────────────────────────────

export type Tendencia = 'sube' | 'baja' | 'estable' | 'sin_historial';

export function tendenciaDe(actual: number, anterior: number | null): Tendencia {
  if (anterior === null) return 'sin_historial';
  const d = actual - anterior;
  if (d >= 5) return 'sube';
  if (d <= -5) return 'baja';
  return 'estable';
}

export interface FilaCartera {
  clienteId: string;
  rfc: string;
  razonSocial: string;
  assessmentId: string | null;
  folio: string | null;
  exposicion: number | null;
  escudoPct: number | null;
  banda: string | null;
  tendencia: Tendencia;
  fecha: string | null;
  evaluaciones: number;
}

/** Ordena por exposición desc; los clientes sin evaluación van al final (por razón social). */
export function ordenarCartera(filas: FilaCartera[]): FilaCartera[] {
  return [...filas].sort((a, b) => {
    if (a.exposicion === null && b.exposicion === null) return a.razonSocial.localeCompare(b.razonSocial, 'es');
    if (a.exposicion === null) return 1;
    if (b.exposicion === null) return -1;
    if (b.exposicion !== a.exposicion) return b.exposicion - a.exposicion;
    return (a.escudoPct ?? 0) - (b.escudoPct ?? 0);
  });
}

export async function construirCartera(tenantId: string, clienteIds?: string[] | null): Promise<FilaCartera[]> {
  const clientes = await prisma.cliente.findMany({
    where: { tenantId, activo: true, ...(clienteIds ? { id: { in: clienteIds } } : {}) },
    select: { id: true, rfc: true, razonSocial: true },
    take: 500,
  });
  if (clientes.length === 0) return [];
  const rows = await prisma.riskAssessment.findMany({
    where: { tenantId, clienteId: { in: clientes.map(c => c.id) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, clienteId: true, folio: true, exposicion: true, escudoPct: true, banda: true, createdAt: true },
    take: 5000,
  });
  const porCliente = new Map<string, typeof rows>();
  for (const r of rows) {
    const l = porCliente.get(r.clienteId!) ?? [];
    l.push(r);
    porCliente.set(r.clienteId!, l);
  }
  const filas: FilaCartera[] = clientes.map(c => {
    const hist = porCliente.get(c.id) ?? [];
    const ultimo = hist[0];
    const anterior = hist[1];
    return {
      clienteId: c.id, rfc: c.rfc, razonSocial: c.razonSocial,
      assessmentId: ultimo?.id ?? null, folio: ultimo?.folio ?? null,
      exposicion: ultimo?.exposicion ?? null, escudoPct: ultimo?.escudoPct ?? null, banda: ultimo?.banda ?? null,
      tendencia: ultimo ? tendenciaDe(ultimo.exposicion, anterior?.exposicion ?? null) : 'sin_historial',
      fecha: ultimo?.createdAt.toISOString() ?? null,
      evaluaciones: hist.length,
    };
  });
  return ordenarCartera(filas);
}

// ── Dictamen imprimible con hash ────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const o = value as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}

/** Hash SHA-256 del assessment (insumos + resultado + folio): lo que se imprime en el dictamen. */
export function hashAssessment(row: {
  id: string; tenantId: string; folio: string | null; input: unknown; exposicion: number; escudoPct: number; banda: string;
  detalle: unknown; checklist: unknown; rulesVersion: string; evidencia?: unknown;
}): string {
  return crypto.createHash('sha256').update(stableStringify({
    id: row.id, tenantId: row.tenantId, folio: row.folio, input: row.input, exposicion: row.exposicion, escudoPct: row.escudoPct,
    banda: row.banda, detalle: row.detalle, checklist: row.checklist, rulesVersion: row.rulesVersion, evidencia: row.evidencia ?? null,
  })).digest('hex');
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const BANDA_LABEL: Record<string, string> = {
  VERDE: 'Verde — exposición controlada', AMARILLO: 'Amarillo — refuerza tu evidencia', NARANJA: 'Naranja — exposición relevante',
  ROJO: 'Rojo — exposición alta', ROJO_CRITICO: 'Rojo crítico — no despachar sin corregir',
};
const ORIGEN_LABEL: Record<string, string> = { verificado: 'verificado', declarado: 'declarado', mixto: 'mixto', no_evaluado: 'no evaluado' };

export function renderDictamenHTML(p: {
  folio: string | null; hash: string; creado: Date; tenantNombre: string; cliente: { rfc: string; razonSocial: string } | null;
  operacionRef: string | null; resultado: ResultadoConEvidencia; input: unknown; evidencia: EvidenciaMap; disclaimer: string;
}): string {
  const r = p.resultado;
  const op = ((p.input as { operacion?: Record<string, unknown> })?.operacion ?? {}) as Record<string, unknown>;
  const reglasActivas = r.factores.flatMap(f => f.reglas.filter(x => x.puntos > 0)).sort((a, b) => b.puntos - a.puntos);
  const conEvidencia = r.factores.flatMap(f => f.reglas.filter(x => x.verificadoPorEvidencia)).length
    + r.checklist.filter(c => c.verificadoPorEvidencia).length;
  const filaFactor = (f: ResultadoConEvidencia['factores'][number]) =>
    `<tr><td>${esc(f.factor)}</td><td class="num">${f.puntos}</td><td class="num">${f.peso}</td></tr>`;
  const filaRegla = (x: ReglaConEvidencia) =>
    `<tr><td>${esc(x.id)}</td><td>${esc(x.descripcion)}</td><td class="num">+${x.puntos}</td><td>${esc(ORIGEN_LABEL[x.origenEfectivo] ?? x.origenEfectivo)}${x.verificadoPorEvidencia ? ' (doc. adjunto)' : ''}</td><td class="mono">${esc(x.fundamento.articulo)} · cotejo ${esc(x.fundamento.fechaCotejo)}</td></tr>`;
  const filaChecklist = (c: ChecklistConEvidencia) =>
    `<tr><td>${c.completo ? '✔' : '—'}</td><td>${esc(c.descripcion)}</td><td>${esc(ORIGEN_LABEL[c.origenSenal] ?? c.origenSenal)}${c.verificadoPorEvidencia ? ' (doc. adjunto)' : ''}</td><td class="mono">${esc(c.fundamento.articulo)}</td></tr>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Dictamen de exposición ${esc(p.folio ?? 'sin folio')}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:0;padding:32px;max-width:900px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.06em}
  .meta{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#333;border:1px solid #999;padding:8px 10px;margin:12px 0}
  .kpis{display:flex;gap:24px;margin:12px 0} .kpi{border:1px solid #999;padding:10px 14px;min-width:150px}
  .kpi b{display:block;font-size:26px} .kpi span{font-size:11px;color:#444}
  table{width:100%;border-collapse:collapse;font-size:12px} th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left;vertical-align:top}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#444} .num{text-align:right;font-variant-numeric:tabular-nums} .mono{font-family:ui-monospace,Menlo,monospace;font-size:11px}
  .hash{word-break:break-all} .nota{font-size:11px;color:#444;margin-top:18px;border-top:1px solid #999;padding-top:8px}
  .toolbar{margin-bottom:16px} .toolbar button{font:inherit;padding:6px 12px}
  @media print{.toolbar{display:none} body{padding:0} @page{margin:18mm}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Imprimir / guardar PDF</button></div>
<h1>Dictamen de exposición — Risk Scorer</h1>
<div>${esc(p.tenantNombre)}${p.cliente ? ` · Cliente: ${esc(p.cliente.razonSocial)} (RFC ${esc(p.cliente.rfc)})` : ''}${p.operacionRef ? ` · Operación ${esc(p.operacionRef)}` : ''}</div>
<div class="meta">Folio: <b>${esc(p.folio ?? 'sin folio')}</b> · Emitido: ${p.creado.toISOString().slice(0, 19).replace('T', ' ')} UTC · Reglas ${esc(r.rulesVersion)}<br>
Hash SHA-256 del dictamen: <span class="hash">${esc(p.hash)}</span></div>
<div class="kpis">
  <div class="kpi"><span>Exposición</span><b>${r.exposicion}<small>/100</small></b></div>
  <div class="kpi"><span>Escudo de evidencia</span><b>${r.escudoPct}<small>%</small></b></div>
  <div class="kpi"><span>Banda</span><b style="font-size:16px">${esc(BANDA_LABEL[r.banda] ?? r.banda)}</b></div>
</div>
<div>Cobertura: ${r.cobertura.verificadas} verificadas · ${r.cobertura.declaradas} declaradas · ${r.cobertura.noEvaluadas} no evaluadas · ${conEvidencia} respaldadas con documento adjunto${r.banderas.length ? ` · Banderas: ${esc(r.banderas.join(', '))}` : ''}</div>
<h2>Operación evaluada</h2>
<table><tbody>${Object.entries(op).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${esc(v)}</td></tr>`).join('') || '<tr><td colspan="2">Sin identificadores</td></tr>'}</tbody></table>
<h2>Exposición por factor</h2>
<table><thead><tr><th>Factor</th><th class="num">Puntos</th><th class="num">Peso</th></tr></thead><tbody>${r.factores.map(filaFactor).join('')}</tbody></table>
<h2>Reglas que sumaron exposición (${reglasActivas.length})</h2>
<table><thead><tr><th>Regla</th><th>Descripción</th><th class="num">Pts</th><th>Origen de la señal</th><th>Fundamento</th></tr></thead><tbody>${reglasActivas.map(filaRegla).join('') || '<tr><td colspan="5">Ninguna regla sumó puntos.</td></tr>'}</tbody></table>
<h2>Escudo de evidencia (${r.checklist.filter(c => c.aplicable && c.completo).length}/${r.checklist.filter(c => c.aplicable).length} aplicables completos)</h2>
<table><thead><tr><th></th><th>Evidencia</th><th>Origen</th><th>Fundamento</th></tr></thead><tbody>${r.checklist.filter(c => c.aplicable).map(filaChecklist).join('')}</tbody></table>
${Object.keys(p.evidencia).length > 0 ? `<h2>Documentos de respaldo adjuntos</h2><table><thead><tr><th>Factor / regla / ítem</th><th>Documento</th><th>Adjuntado</th></tr></thead><tbody>${Object.entries(p.evidencia).map(([k, e]) => `<tr><td class="mono">${esc(k)}</td><td>${esc(e.nombre ?? e.documentId)}</td><td class="mono">${esc(e.verificadoAt.slice(0, 10))}</td></tr>`).join('')}</tbody></table>` : ''}
<p class="nota">${esc(p.disclaimer)} "Verificado (doc. adjunto)" significa que un usuario de la empresa adjuntó un documento de respaldo a esa señal; el sistema no valida el contenido del documento. Integridad: recalcula el SHA-256 del assessment ${esc(p.folio ?? '')} desde ADUANAI y compáralo con el hash impreso.</p>
</body></html>`;
}
