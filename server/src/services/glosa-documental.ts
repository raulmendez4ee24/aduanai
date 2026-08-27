/**
 * Glosa DOCUMENTAL automática (Ola 2, 27-ago-2026): cruza factura vs
 * pedimento vs BL/AWB vs packing list de una operación y reporta
 * diferencias de valor, cantidades, pesos, bultos, consignatario y RFC con
 * TOLERANCIAS EXPLÍCITAS. Determinista, sin LLM: la extracción IA ya pobló
 * `Document.extractedData`; el pedimento puede venir del `Pedimento`
 * importado (M3/Data Stage, dato duro) o del documento extraído.
 *
 * No sustituye la glosa arancelaria (services/glosa-simulator.ts): aquí no
 * se valida fracción ni contribuciones, solo la coherencia documental del
 * expediente 59-V / 162-VII.
 */
import { prisma } from '../lib/prisma';

export interface ToleranciasGlosa {
  /** Diferencia relativa admitida en valor factura vs pedimento (0.01 = 1 %). */
  valorPct: number;
  /** Diferencia absoluta admitida en valor (moneda de la factura). */
  valorAbs: number;
  /** Diferencia relativa admitida en peso bruto BL/packing vs pedimento. */
  pesoPct: number;
  /** Diferencia absoluta en cantidades por partida/ítem. */
  cantidadAbs: number;
  /** Diferencia absoluta en bultos. */
  bultosAbs: number;
}

export const TOLERANCIAS_DEFAULT: ToleranciasGlosa = {
  valorPct: 0.01, valorAbs: 1, pesoPct: 0.05, cantidadAbs: 0, bultosAbs: 0,
};

export type SeveridadGlosa = 'error' | 'advertencia' | 'info';

export interface DiferenciaGlosa {
  codigo: 'VALOR' | 'CANTIDAD' | 'PESO_BRUTO' | 'PESO_NETO' | 'BULTOS' | 'RFC' | 'CONSIGNATARIO' | 'ITEMS' | 'FALTANTE';
  severidad: SeveridadGlosa;
  campo: string;
  fuenteA: string;
  fuenteB: string;
  valorA: string | number | null;
  valorB: string | number | null;
  delta: number | null;
  tolerancia: string;
  mensaje: string;
}

export interface FacturaGlosa {
  numero?: string | null;
  total?: number | null;
  moneda?: string | null;
  compradorNombre?: string | null;
  compradorRfc?: string | null;
  items?: { descripcion?: string; cantidad?: number | null; total?: number | null }[];
}
export interface PedimentoGlosa {
  numero?: string | null;
  rfcImportador?: string | null;
  valorComercial?: number | null;   // valor factura declarado (moneda extranjera) o total general
  valorAduana?: number | null;
  pesoBruto?: number | null;
  pesoNeto?: number | null;
  bultos?: number | null;
  partidas?: { fraccion?: string; cantidad?: number | null; valorAduana?: number | null; descripcion?: string }[];
  origen: 'importado' | 'extraido' | 'ninguno';
}
export interface BLGlosa {
  numero?: string | null;
  consignee?: string | null;
  pesoBruto?: number | null;
  bultos?: number | null;
}
export interface PackingGlosa {
  pesoBruto?: number | null;
  pesoNeto?: number | null;
  bultos?: number | null;
  cantidadTotal?: number | null;
}

export interface EntradaGlosaDocumental {
  factura: FacturaGlosa | null;
  pedimento: PedimentoGlosa | null;
  bl: BLGlosa | null;
  packing: PackingGlosa | null;
}

export interface ResultadoGlosaDocumental {
  consistente: boolean;
  errores: number;
  advertencias: number;
  diferencias: DiferenciaGlosa[];
  cruces: string[];          // qué pares se pudieron cruzar
  faltantes: string[];       // documentos sin datos
  tolerancias: ToleranciasGlosa;
  fuentePedimento: PedimentoGlosa['origen'];
  generadoAt: string;
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const n = parseFloat(v.replace(/[,$\s]/g, '')); return Number.isFinite(n) ? n : null; }
  return null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function normalizarRfc(v: string | null | undefined): string | null {
  const s = (v ?? '').toUpperCase().replace(/[^A-Z0-9&Ñ]/g, '');
  return s.length >= 12 ? s : null;
}
export function normalizarNombre(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
    .replace(/\b(S\.?A\.?\s*(DE\s*)?C\.?V\.?|S\.?\s*DE\s*R\.?L\.?(\s*DE\s*C\.?V\.?)?|SAPI|INC|LLC|LTD|CO|S\.?A\.?)\b/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function nombresCoinciden(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const ta = new Set(a.split(' ').filter(t => t.length > 2));
  const tb = new Set(b.split(' ').filter(t => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  return comunes / Math.min(ta.size, tb.size) >= 0.6;
}

function cmpNumerico(p: {
  codigo: DiferenciaGlosa['codigo']; campo: string; fuenteA: string; fuenteB: string; a: number | null; b: number | null;
  pct?: number; abs?: number; severidad: SeveridadGlosa;
}): DiferenciaGlosa | null {
  if (p.a === null || p.b === null) return null;
  const delta = Math.abs(p.a - p.b);
  const base = Math.max(Math.abs(p.a), Math.abs(p.b));
  const dentroAbs = p.abs !== undefined && delta <= p.abs;
  const dentroPct = p.pct !== undefined && base > 0 && delta / base <= p.pct;
  if (delta === 0 || dentroAbs || dentroPct) return null;
  const tol = [p.pct !== undefined ? `${(p.pct * 100).toFixed(p.pct * 100 % 1 ? 1 : 0)} %` : null, p.abs !== undefined ? `±${p.abs}` : null].filter(Boolean).join(' o ');
  return {
    codigo: p.codigo, severidad: p.severidad, campo: p.campo, fuenteA: p.fuenteA, fuenteB: p.fuenteB,
    valorA: p.a, valorB: p.b, delta: Math.round(delta * 1000) / 1000, tolerancia: tol || 'exacta',
    mensaje: `${p.campo}: ${p.fuenteA} ${p.a} vs ${p.fuenteB} ${p.b} — diferencia ${Math.round(delta * 1000) / 1000} (tolerancia ${tol || 'exacta'})`,
  };
}

/** Función PURA: cruza los cuatro documentos con las tolerancias dadas. */
export function glosarDocumentos(e: EntradaGlosaDocumental, tol: Partial<ToleranciasGlosa> = {}, ahora: Date = new Date()): ResultadoGlosaDocumental {
  const t: ToleranciasGlosa = { ...TOLERANCIAS_DEFAULT, ...tol };
  const dif: DiferenciaGlosa[] = [];
  const cruces: string[] = [];
  const faltantes: string[] = [];
  const { factura: f, pedimento: p, bl, packing: pk } = e;
  if (!f) faltantes.push('factura');
  if (!p) faltantes.push('pedimento');
  if (!bl) faltantes.push('bl');
  if (!pk) faltantes.push('packing_list');
  const push = (d: DiferenciaGlosa | null) => { if (d) dif.push(d); };

  // Factura ↔ pedimento
  if (f && p) {
    cruces.push('factura↔pedimento');
    const valorPed = p.valorComercial ?? p.valorAduana ?? null;
    push(cmpNumerico({ codigo: 'VALOR', campo: 'Valor total', fuenteA: 'factura', fuenteB: 'pedimento', a: f.total ?? null, b: valorPed, pct: t.valorPct, abs: t.valorAbs, severidad: 'error' }));
    const rfcF = normalizarRfc(f.compradorRfc);
    const rfcP = normalizarRfc(p.rfcImportador);
    if (rfcF && rfcP && rfcF !== rfcP) {
      dif.push({ codigo: 'RFC', severidad: 'error', campo: 'RFC del importador', fuenteA: 'factura', fuenteB: 'pedimento', valorA: rfcF, valorB: rfcP, delta: null, tolerancia: 'exacta', mensaje: `RFC del comprador en factura (${rfcF}) no coincide con el RFC del importador en pedimento (${rfcP}).` });
    }
    const items = f.items ?? [];
    const partidas = p.partidas ?? [];
    if (items.length > 0 && partidas.length > 0) {
      const cantF = items.reduce((a, i) => a + (num(i.cantidad) ?? 0), 0);
      const cantP = partidas.reduce((a, i) => a + (num(i.cantidad) ?? 0), 0);
      if (cantF > 0 && cantP > 0) {
        push(cmpNumerico({ codigo: 'CANTIDAD', campo: 'Cantidad total (ítems vs partidas)', fuenteA: 'factura', fuenteB: 'pedimento', a: cantF, b: cantP, abs: t.cantidadAbs, severidad: 'error' }));
      }
      if (items.length !== partidas.length) {
        dif.push({ codigo: 'ITEMS', severidad: 'info', campo: 'Número de ítems vs partidas', fuenteA: 'factura', fuenteB: 'pedimento', valorA: items.length, valorB: partidas.length, delta: Math.abs(items.length - partidas.length), tolerancia: 'informativa', mensaje: `La factura tiene ${items.length} ítem(s) y el pedimento ${partidas.length} partida(s): verifica consolidación (no es error por sí mismo).` });
      }
    }
  }

  // BL ↔ pedimento
  if (bl && p) {
    cruces.push('bl↔pedimento');
    push(cmpNumerico({ codigo: 'PESO_BRUTO', campo: 'Peso bruto (kg)', fuenteA: 'BL', fuenteB: 'pedimento', a: bl.pesoBruto ?? null, b: p.pesoBruto ?? null, pct: t.pesoPct, severidad: 'advertencia' }));
    push(cmpNumerico({ codigo: 'BULTOS', campo: 'Bultos', fuenteA: 'BL', fuenteB: 'pedimento', a: bl.bultos ?? null, b: p.bultos ?? null, abs: t.bultosAbs, severidad: 'advertencia' }));
  }
  // BL ↔ factura (consignatario)
  if (bl && f) {
    cruces.push('bl↔factura');
    const c = normalizarNombre(bl.consignee);
    const comp = normalizarNombre(f.compradorNombre);
    if (c && comp && !nombresCoinciden(c, comp)) {
      dif.push({ codigo: 'CONSIGNATARIO', severidad: 'advertencia', campo: 'Consignatario', fuenteA: 'BL', fuenteB: 'factura', valorA: bl.consignee ?? null, valorB: f.compradorNombre ?? null, delta: null, tolerancia: 'coincidencia de razón social (sin sufijos SA de CV)', mensaje: `El consignatario del BL ("${bl.consignee}") no coincide con el comprador de la factura ("${f.compradorNombre}").` });
    }
  }
  // Packing ↔ pedimento / BL
  if (pk && p) {
    cruces.push('packing↔pedimento');
    push(cmpNumerico({ codigo: 'PESO_BRUTO', campo: 'Peso bruto (kg)', fuenteA: 'packing list', fuenteB: 'pedimento', a: pk.pesoBruto ?? null, b: p.pesoBruto ?? null, pct: t.pesoPct, severidad: 'advertencia' }));
    push(cmpNumerico({ codigo: 'PESO_NETO', campo: 'Peso neto (kg)', fuenteA: 'packing list', fuenteB: 'pedimento', a: pk.pesoNeto ?? null, b: p.pesoNeto ?? null, pct: t.pesoPct, severidad: 'advertencia' }));
    push(cmpNumerico({ codigo: 'BULTOS', campo: 'Bultos', fuenteA: 'packing list', fuenteB: 'pedimento', a: pk.bultos ?? null, b: p.bultos ?? null, abs: t.bultosAbs, severidad: 'advertencia' }));
    const cantP = (p.partidas ?? []).reduce((a, i) => a + (num(i.cantidad) ?? 0), 0);
    if (cantP > 0) push(cmpNumerico({ codigo: 'CANTIDAD', campo: 'Cantidad total', fuenteA: 'packing list', fuenteB: 'pedimento', a: pk.cantidadTotal ?? null, b: cantP, abs: t.cantidadAbs, severidad: 'error' }));
  }
  if (pk && bl) {
    cruces.push('packing↔bl');
    push(cmpNumerico({ codigo: 'BULTOS', campo: 'Bultos', fuenteA: 'packing list', fuenteB: 'BL', a: pk.bultos ?? null, b: bl.bultos ?? null, abs: t.bultosAbs, severidad: 'advertencia' }));
  }
  for (const d of faltantes) {
    dif.push({ codigo: 'FALTANTE', severidad: 'info', campo: d, fuenteA: d, fuenteB: '—', valorA: null, valorB: null, delta: null, tolerancia: '—', mensaje: `Sin datos de ${d}: ese cruce no se pudo realizar.` });
  }
  const errores = dif.filter(d => d.severidad === 'error').length;
  const advertencias = dif.filter(d => d.severidad === 'advertencia').length;
  return {
    consistente: errores === 0 && advertencias === 0 && cruces.length > 0,
    errores, advertencias, diferencias: dif, cruces, faltantes, tolerancias: t,
    fuentePedimento: p?.origen ?? 'ninguno', generadoAt: ahora.toISOString(),
  };
}

// ── Adaptadores desde extractedData / Pedimento importado ──────────────

type ED = Record<string, unknown>;
const ed = (d: { extractedData: unknown }): ED => (d.extractedData && typeof d.extractedData === 'object' ? d.extractedData as ED : {});

export function facturaDesdeExtraccion(d: { extractedData: unknown }): FacturaGlosa {
  const x = ed(d);
  const comprador = (x.comprador ?? {}) as ED;
  const items = Array.isArray(x.items) ? (x.items as ED[]).map(i => ({ descripcion: str(i.descripcion) ?? undefined, cantidad: num(i.cantidad), total: num(i.total) })) : [];
  return { numero: str(x.numeroFactura), total: num(x.totalFactura), moneda: str(x.moneda), compradorNombre: str(comprador.nombre), compradorRfc: str(comprador.rfc), items };
}
export function pedimentoDesdeExtraccion(d: { extractedData: unknown }): PedimentoGlosa {
  const x = ed(d);
  const fr = Array.isArray(x.fracciones) ? (x.fracciones as ED[]).map(i => ({ fraccion: str(i.fraccion) ?? undefined, cantidad: num(i.cantidad), valorAduana: num(i.valorAduana), descripcion: str(i.descripcion) ?? undefined })) : [];
  return { numero: str(x.numeroPedimento), rfcImportador: str(x.rfcImportador), valorComercial: num(x.totalGeneral), valorAduana: null, pesoBruto: num(x.pesoBruto), pesoNeto: num(x.pesoNeto), bultos: num(x.bultos), partidas: fr, origen: 'extraido' };
}
export function pedimentoDesdeImportado(p: {
  numero: string | null; rfcImportador: string; valorComercial: number; valorAduana: number; pesoBruto: number; pesoNeto: number; bultos: number;
  partidas: { fraccion: string; cantidad: number; valorAduana: number; descripcion: string }[];
}): PedimentoGlosa {
  return {
    numero: p.numero, rfcImportador: p.rfcImportador, valorComercial: p.valorComercial, valorAduana: p.valorAduana,
    pesoBruto: p.pesoBruto, pesoNeto: p.pesoNeto, bultos: p.bultos,
    partidas: p.partidas.map(x => ({ fraccion: x.fraccion, cantidad: x.cantidad, valorAduana: x.valorAduana, descripcion: x.descripcion })),
    origen: 'importado',
  };
}
export function blDesdeExtraccion(d: { extractedData: unknown }): BLGlosa {
  const x = ed(d);
  return { numero: str(x.numeroEmbarque), consignee: str(x.consignee), pesoBruto: num(x.pesoBruto), bultos: num(x.bultos) };
}
export function packingDesdeExtraccion(d: { extractedData: unknown }): PackingGlosa {
  const x = ed(d);
  const items = Array.isArray(x.items) ? (x.items as ED[]) : [];
  const cantidadTotal = num(x.cantidadTotal) ?? (items.length ? items.reduce((a, i) => a + (num(i.cantidad) ?? 0), 0) : null);
  return { pesoBruto: num(x.pesoBruto), pesoNeto: num(x.pesoNeto), bultos: num(x.bultos), cantidadTotal };
}

/** Carga documentos + pedimento importado de la operación y corre la glosa. */
export async function glosarOperacion(tenantId: string, operationId: string, tol: Partial<ToleranciasGlosa> = {}): Promise<ResultadoGlosaDocumental> {
  const op = await prisma.operation.findFirst({ where: { id: operationId, tenantId }, select: { id: true, pedimentoId: true } });
  if (!op) throw new Error('Operación no encontrada');
  const docs = await prisma.document.findMany({ where: { tenantId, operationId, processedAt: { not: null } }, orderBy: { createdAt: 'desc' }, select: { id: true, docType: true, type: true, extractedData: true } });
  const find = (...tipos: string[]) => docs.find(d => tipos.includes(d.docType ?? d.type ?? ''));
  const fDoc = find('factura', 'factura_comercial');
  const pDoc = find('pedimento');
  const blDoc = find('bl', 'awb', 'conocimiento_embarque');
  const pkDoc = find('packing_list');
  let pedimento: PedimentoGlosa | null = null;
  if (op.pedimentoId) {
    const imp = await prisma.pedimento.findFirst({ where: { id: op.pedimentoId, tenantId }, include: { partidas: { select: { fraccion: true, cantidad: true, valorAduana: true, descripcion: true } } } });
    if (imp) pedimento = pedimentoDesdeImportado(imp);
  }
  if (!pedimento && pDoc) pedimento = pedimentoDesdeExtraccion(pDoc);
  return glosarDocumentos({
    factura: fDoc ? facturaDesdeExtraccion(fDoc) : null,
    pedimento,
    bl: blDoc ? blDesdeExtraccion(blDoc) : null,
    packing: pkDoc ? packingDesdeExtraccion(pkDoc) : null,
  }, tol);
}
