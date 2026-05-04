/**
 * Cross-audit: dado un Operation, agrega todos los Documents vinculados
 * y detecta inconsistencias entre los datos extraídos por IA.
 *
 * Reglas determinísticas (no LLM) para que el resultado sea reproducible.
 */

import { prisma } from '../lib/prisma';

export type Severity = 'error' | 'warning' | 'info';

export interface CrossAuditIssue {
  severity: Severity;
  rule: string;
  message: string;
  affectedDocs: string[]; // IDs de documentos involucrados
}

export interface CrossAuditResult {
  operationId: string;
  documentCount: number;
  byType: Record<string, number>;
  issues: CrossAuditIssue[];
  timeline: TimelineStep[];
}

export type TimelineStage =
  | 'pedido'
  | 'factura'
  | 'embarque'
  | 'llegada'
  | 'pedimento'
  | 'despacho'
  | 'liberacion'
  | 'entrega';

export interface TimelineStep {
  stage: TimelineStage;
  label: string;
  date: string | null;
  documentId: string | null;
  documentType: string | null;
  status: 'present' | 'missing' | 'partial';
}

const STAGE_ORDER: { stage: TimelineStage; label: string; matchTypes: string[] }[] = [
  { stage: 'pedido', label: 'Orden de compra / Pedido', matchTypes: ['orden_compra', 'po'] },
  { stage: 'factura', label: 'Factura comercial', matchTypes: ['factura'] },
  { stage: 'embarque', label: 'Embarque (BL/AWB)', matchTypes: ['bl', 'awb'] },
  { stage: 'llegada', label: 'Llegada / Packing list', matchTypes: ['packing_list'] },
  { stage: 'pedimento', label: 'Pedimento', matchTypes: ['pedimento'] },
  { stage: 'despacho', label: 'Despacho aduanero (COVE/MVE)', matchTypes: ['cove', 'mve'] },
  { stage: 'liberacion', label: 'Certificado de origen / NOMs', matchTypes: ['certificado_origen', 'nom'] },
  { stage: 'entrega', label: 'Carta porte CFDI', matchTypes: ['carta_porte'] },
];

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n; }
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function getField(doc: { extractedData: unknown }, ...keys: string[]): unknown {
  let cur: unknown = doc.extractedData;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export async function runCrossAudit(tenantId: string, operationId: string): Promise<CrossAuditResult> {
  const docs = await prisma.document.findMany({
    where: { tenantId, operationId },
    orderBy: { createdAt: 'asc' },
  });

  const byType: Record<string, number> = {};
  for (const d of docs) {
    const k = d.docType ?? d.type ?? 'otro';
    byType[k] = (byType[k] ?? 0) + 1;
  }

  const issues: CrossAuditIssue[] = [];

  // Helper: find first doc of type
  const find = (t: string) => docs.find(d => (d.docType ?? d.type) === t);
  const factura = find('factura');
  const pedimento = find('pedimento');
  const bl = find('bl') ?? find('awb');

  // Regla 1: valor factura vs valor declarado en pedimento
  if (factura && pedimento) {
    const fTotal = asNumber(getField(factura, 'totalFactura'));
    const pTotal = asNumber(getField(pedimento, 'totalGeneral'));
    if (fTotal != null && pTotal != null && pTotal > 0) {
      const delta = Math.abs(fTotal - pTotal);
      const ratio = delta / Math.max(fTotal, pTotal);
      if (ratio > 0.05) {
        issues.push({
          severity: 'error',
          rule: 'VALUE_MISMATCH',
          message: `Valor en factura ($${fTotal.toFixed(2)}) no coincide con valor declarado en pedimento ($${pTotal.toFixed(2)}). Diferencia $${delta.toFixed(2)} podría ser subvaluación.`,
          affectedDocs: [factura.id, pedimento.id],
        });
      }
    }
  }

  // Regla 2: peso bruto BL vs pedimento
  if (bl && pedimento) {
    const blPeso = asNumber(getField(bl, 'pesoBruto'));
    const pPeso = asNumber(getField(pedimento, 'pesoBruto'));
    if (blPeso != null && pPeso != null && pPeso > 0) {
      const delta = Math.abs(blPeso - pPeso);
      const ratio = delta / Math.max(blPeso, pPeso);
      if (ratio > 0.10) {
        issues.push({
          severity: 'warning',
          rule: 'WEIGHT_MISMATCH',
          message: `Peso bruto en BL (${blPeso} kg) no coincide con peso en pedimento (${pPeso} kg) — diferencia ${delta} kg.`,
          affectedDocs: [bl.id, pedimento.id],
        });
      }
    }
  }

  // Regla 3: fechas coherentes (pedimento debe ser posterior al BL)
  if (bl && pedimento) {
    const blDate = asString(getField(bl, 'fechaEmbarque'));
    const pDate = asString(getField(pedimento, 'fechaPedimento'));
    if (blDate && pDate) {
      const blD = new Date(blDate);
      const pD = new Date(pDate);
      if (!isNaN(blD.getTime()) && !isNaN(pD.getTime()) && pD < blD) {
        issues.push({
          severity: 'error',
          rule: 'DATE_INCONSISTENCY',
          message: `Fecha del pedimento (${pDate}) es anterior a la fecha del BL (${blDate}) — secuencia inválida.`,
          affectedDocs: [bl.id, pedimento.id],
        });
      }
    }
  }

  // Regla 4: fracciones declaradas vs descripción de factura
  if (factura && pedimento) {
    const fracciones = getField(pedimento, 'fracciones');
    const items = getField(factura, 'items');
    if (Array.isArray(fracciones) && Array.isArray(items) && fracciones.length > 0 && items.length > 0) {
      // Si la cantidad de fracciones difiere mucho del número de items en factura
      const fCount = fracciones.length;
      const iCount = items.length;
      if (Math.abs(fCount - iCount) > 2 && Math.max(fCount, iCount) > 3) {
        issues.push({
          severity: 'warning',
          rule: 'PARTIDA_COUNT_MISMATCH',
          message: `El pedimento declara ${fCount} fracción(es) pero la factura tiene ${iCount} ítem(s) — verifica consolidación.`,
          affectedDocs: [factura.id, pedimento.id],
        });
      }
    }
  }

  // Regla 5: documentos esperados ausentes
  const expectedTypes = ['factura', 'pedimento', 'bl'];
  for (const t of expectedTypes) {
    if (!find(t)) {
      issues.push({
        severity: 'info',
        rule: 'DOC_MISSING',
        message: `Falta documento esperado: ${t}`,
        affectedDocs: [],
      });
    }
  }

  // Timeline
  const timeline: TimelineStep[] = STAGE_ORDER.map(s => {
    const doc = docs.find(d => s.matchTypes.includes(d.docType ?? d.type ?? ''));
    if (!doc) {
      return { stage: s.stage, label: s.label, date: null, documentId: null, documentType: null, status: 'missing' };
    }
    let date: string | null = null;
    const ed = (doc.extractedData ?? {}) as Record<string, unknown>;
    for (const k of ['fechaPedimento', 'fechaFactura', 'fechaEmbarque', 'fecha', 'date']) {
      if (typeof ed[k] === 'string') { date = ed[k] as string; break; }
    }
    if (!date) date = doc.createdAt.toISOString();
    return {
      stage: s.stage, label: s.label, date,
      documentId: doc.id, documentType: doc.docType ?? doc.type,
      status: 'present',
    };
  });

  return {
    operationId,
    documentCount: docs.length,
    byType,
    issues,
    timeline,
  };
}
