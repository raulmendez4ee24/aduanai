/**
 * ALERTA DE ELUSIÓN COMO REGLA (Ola 2, Operación 2026-08).
 *
 * Por cada Cliente (y para el tenant sin cliente) cruza sus Product
 * (paisOrigen + fractionCode), sus importaciones temporales y clasificaciones
 * de los últimos 12 meses contra resoluciones con `esAntielusion=true` o
 * `investigationType='elusion'` vigentes. Si hay match exacto fracción+país
 * crea una `Alert` tipo `elusion` con severidad por monto
 * (`severidadPorImpacto`) y fingerprint para no duplicar.
 *
 * Monto: si hay importaciones temporales con valor en aduana se estima la
 * cuota sobre ese valor (solo tasas %; específicas requieren peso/unidades y
 * quedan sin cifra); sin cifra la severidad se decide por urgencia con techo.
 */

import { prisma } from '../lib/prisma';
import { conCandadoJob } from '../lib/candado-job';
import { logger } from '../lib/logger';
import { normalizeCountry } from './compliance-lookup';
import { severidadPorImpacto } from './alert-severity';
import { accionRevisarFraccion } from './alert-acciones';
import { formatCuota } from '../lib/cuota-format';

export const TIPO_ALERTA_ELUSION = 'elusion';
const DIA = 86400000;

export interface ExposicionElusion {
  fractionCode: string;
  pais: string;
  clienteId: string | null;
  fuentes: string[];
  valorUSD: number;
  productIds: string[];
}

/** Reúne lo que el tenant/cliente opera: productos del catálogo, temporales y clasificaciones del último año. */
export async function exposicionDelTenant(tenantId: string, ahora = new Date()): Promise<ExposicionElusion[]> {
  const desde = new Date(ahora.getTime() - 365 * DIA);
  const [productos, temporales, clasificaciones] = await Promise.all([
    prisma.product.findMany({ where: { tenantId, active: true, fractionCode: { not: null }, paisOrigen: { not: null } }, select: { id: true, fractionCode: true, paisOrigen: true, clienteId: true } }),
    prisma.temporaryImport.findMany({ where: { tenantId, entryDate: { gte: desde }, originCountry: { not: null } }, select: { fractionCode: true, originCountry: true, customsValue: true, clienteId: true }, take: 2000 }),
    prisma.classification.findMany({ where: { tenantId, createdAt: { gte: desde }, inputCountryOfOrigin: { not: null } }, select: { fractionCode: true, inputCountryOfOrigin: true, inputDeclaredValueUSD: true, clienteId: true }, take: 2000 }),
  ]);
  const map = new Map<string, ExposicionElusion>();
  const add = (frac: string | null, pais: string | null, clienteId: string | null, fuente: string, valor: number, productId?: string) => {
    const f = (frac ?? '').replace(/[^0-9]/g, '');
    if (f.length !== 8 || !pais) return;
    const p = normalizeCountry(pais);
    const key = `${f}|${p}|${clienteId ?? ''}`;
    const e = map.get(key) ?? { fractionCode: f, pais: p, clienteId, fuentes: [], valorUSD: 0, productIds: [] };
    if (!e.fuentes.includes(fuente)) e.fuentes.push(fuente);
    e.valorUSD += Number.isFinite(valor) ? valor : 0;
    if (productId) e.productIds.push(productId);
    map.set(key, e);
  };
  for (const p of productos) add(p.fractionCode, p.paisOrigen, p.clienteId, 'catálogo', 0, p.id);
  for (const t of temporales) add(t.fractionCode, t.originCountry, t.clienteId, 'importaciones temporales', t.customsValue);
  for (const c of clasificaciones) add(c.fractionCode, c.inputCountryOfOrigin, c.clienteId, 'clasificaciones', c.inputDeclaredValueUSD ?? 0);
  return Array.from(map.values());
}

export function fingerprintElusion(dutyId: string, fractionCode: string, pais: string, clienteId: string | null): string {
  return `elusion|${dutyId}|${fractionCode}|${pais}|${clienteId ?? ''}`;
}

export async function detectarElusion(tenantId: string, opts: { ahora?: Date; tipoCambioMXN?: number } = {}): Promise<{ cruces: number; alertas: number; existentes: number }> {
  const ahora = opts.ahora ?? new Date();
  const tc = opts.tipoCambioMXN ?? 18;
  const resoluciones = await prisma.antidumpingDuty.findMany({
    where: {
      active: true, status: 'vigente',
      OR: [{ esAntielusion: true }, { investigationType: 'elusion' }],
      AND: [{ OR: [{ effectiveDate: null }, { effectiveDate: { lte: ahora } }] }, { OR: [{ expiryDate: null }, { expiryDate: { gte: ahora } }] }],
    },
  });
  if (resoluciones.length === 0) return { cruces: 0, alertas: 0, existentes: 0 };
  const exposicion = await exposicionDelTenant(tenantId, ahora);
  let cruces = 0, alertas = 0, existentes = 0;
  for (const e of exposicion) {
    for (const r of resoluciones) {
      if (r.fractionCode !== e.fractionCode || r.countryOfOrigin !== e.pais) continue;
      cruces++;
      const fingerprint = fingerprintElusion(r.id, e.fractionCode, e.pais, e.clienteId);
      const ya = await prisma.alert.findFirst({ where: { tenantId, fingerprint }, select: { id: true } });
      if (ya) { existentes++; continue; }
      const impactoMXN = r.rateType === 'percentage' && e.valorUSD > 0 ? Math.round(e.valorUSD * (r.rate / 100) * tc) : null;
      const dias = r.expiryDate ? Math.ceil((r.expiryDate.getTime() - ahora.getTime()) / DIA) : null;
      const ref = r.resolutionNumber ?? r.expedienteUPCI ?? 's/n';
      const cotejo = r.cotejadoAt ? 'cotejada contra fuente' : 'PENDIENTE DE COTEJO contra la lista UPCI/DOF';
      await prisma.alert.create({
        data: {
          tenantId, clienteId: e.clienteId, channel: 'IN_APP', type: TIPO_ALERTA_ELUSION,
          severity: severidadPorImpacto({ tipo: TIPO_ALERTA_ELUSION, impactoMXN, diasParaVencer: dias }),
          title: `Resolución antielusión ${ref}: ${e.fractionCode} origen ${e.pais}`,
          content: `Operas la fracción ${e.fractionCode} con origen ${e.pais} (${e.fuentes.join(', ')}) y existe una resolución por elusión que extiende la cuota compensatoria a ese origen: ${formatCuota(r.rateType, r.rate, r.rateUnit)}${r.productDesc ? ` — ${r.productDesc}` : ''}. ${r.notes ?? ''} Resolución ${cotejo}.${impactoMXN != null ? ` Exposición estimada: $${impactoMXN.toLocaleString('es-MX')} MXN (valor operado × tasa, TC ${tc}).` : ' Sin cifra de exposición (tasa específica o sin valor operado).'} Verifica el origen real y la transformación sustancial antes del próximo pedimento.`.replace(/\s+/g, ' ').trim(),
          actionRequired: 'Verificar origen y aplicar la cuota si procede',
          suggestedAction: accionRevisarFraccion(e.fractionCode) as unknown as object,
          affectedFraction: e.fractionCode, affectedOperations: e.productIds,
          estimatedImpactMXN: impactoMXN != null ? -impactoMXN : null, impactType: 'cost',
          dueDate: r.expiryDate, daysToDue: dias, fingerprint,
        },
      });
      alertas++;
    }
  }
  if (alertas > 0) logger.info(`Elusión: tenant ${tenantId} → ${alertas} alerta(s) nueva(s)`, { action: 'elusion_alertas', tenantId, metadata: { cruces, alertas, existentes } });
  return { cruces, alertas, existentes };
}

export async function detectarElusionTodos(ahora = new Date()): Promise<{ tenants: number; alertas: number }> {
  // Candado distribuido: con >1 réplica solo una corre el tick; las demás devuelven ceros.
  const r = await conCandadoJob('antidumping_elusion', () => detectarElusionTodosSinCandado(ahora));
  return r ?? { tenants: 0, alertas: 0 };
}

async function detectarElusionTodosSinCandado(ahora: Date): Promise<{ tenants: number; alertas: number }> {
  const tenants = await prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'PILOT', 'TRIAL'] } }, select: { id: true } });
  let alertas = 0;
  for (const t of tenants) {
    const r = await detectarElusion(t.id, { ahora }).catch(err => {
      logger.error('Elusión: detección falló', { action: 'elusion_fail', tenantId: t.id, errorMessage: err instanceof Error ? err.message : String(err) });
      return { alertas: 0 };
    });
    alertas += r.alertas;
  }
  return { tenants: tenants.length, alertas };
}
