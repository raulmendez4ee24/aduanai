/**
 * Alertas defensivas para el clasificador.
 * Se ejecutan después de la clasificación IA y antes de devolver al cliente.
 *
 * Tipos:
 *   - antidumping  : cuota compensatoria activa para fracción + país
 *   - undervalue   : valor declarado significativamente menor a precio típico
 *   - nom_required : NOMs aplicables con contexto Anexo 2.4.1
 *   - automotive   : descripción contiene keywords del sector vehicular
 */

import crypto from 'crypto';
import { lookupCompliance } from './compliance-lookup';

// Versiones publicadas — se actualiza con el monitor DOF/SAT.
export const TIGIE_VERSION = '2026-01-01';
export const LIGIE_VERSION = 'post-reforma-29dic2025';

export type ClassifierAlertSeverity = 'critical' | 'warning' | 'info';

export interface ClassifierAlert {
  type: 'antidumping' | 'undervalue' | 'nom_required' | 'sectoral_padron' | 'automotive' | 'permit_required';
  severity: ClassifierAlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const AUTOMOTIVE_KEYWORDS = [
  'automotriz', 'autopartes', 'armadora', 'oem', 'ensamble vehic', 'vehículo', 'vehiculo',
  'automóvil', 'automovil', 'immex automotriz', 'autoparte', 'arnés automotriz',
  'arnes automotriz', 'tablero automotriz', 'asiento automotriz', 'parabrisas',
  'sistema de escape', 'transmisión automotriz', 'transmision automotriz',
  'catalizador', 'sensor automotriz',
];

function detectsAutomotive(description: string, context?: string): boolean {
  const text = `${description} ${context ?? ''}`.toLowerCase();
  return AUTOMOTIVE_KEYWORDS.some(kw => text.includes(kw));
}

function isCapitulo87(fractionCode: string): boolean {
  return fractionCode.startsWith('87');
}

interface BuildAlertsInput {
  fractionCode: string;
  fractionDescription?: string;
  description: string;
  context?: string;
  countryOfOrigin?: string;
  declaredValueUSD?: number;        // valor unitario USD declarado
  declaredQuantity?: number;
  estimatedUnitPriceUSD?: number;   // precio típico estimado por LLM si lo provee
}

export async function buildClassifierAlerts(input: BuildAlertsInput): Promise<ClassifierAlert[]> {
  const alerts: ClassifierAlert[] = [];
  const cleanFraction = input.fractionCode.replace(/[^0-9]/g, '');

  // 1) Alertas de compliance (cuotas comp + NOMs + padrón sectorial)
  if (input.countryOfOrigin && cleanFraction.length === 8) {
    const compliance = await lookupCompliance(cleanFraction, input.countryOfOrigin);

    if (compliance.antidumping) {
      const dateStr = compliance.antidumping.publishDate?.slice(0, 10) ?? 's/d';
      alerts.push({
        type: 'antidumping',
        severity: 'critical',
        title: `⚠️ Cuota compensatoria ${compliance.antidumping.rate}% — ${compliance.antidumping.countryNormalized}`,
        message: `Decreto ${compliance.antidumping.decree ?? 's/n'} (${dateStr}). ${compliance.antidumping.notes ?? ''}`,
        metadata: { rate: compliance.antidumping.rate, decree: compliance.antidumping.decree, type: compliance.antidumping.type },
      });
    }

    const noms = compliance.regulations.filter(r => r.type === 'NOM');
    if (noms.length > 0) {
      const codes = noms.map(n => n.code).join(', ');
      alerts.push({
        type: 'nom_required',
        severity: 'warning',
        title: `Aplican ${noms.length} NOM(s)`,
        message: `${codes}. Aplica salvo excepción Anexo 2.4.1 (IMMEX, insumo industrial). Verifica cumplimiento de etiquetado/prueba antes del despacho.`,
        metadata: { noms: noms.map(n => ({ code: n.code, authority: n.authority, description: n.description })) },
      });
    }

    const padron = compliance.regulations.find(r => r.type === 'padron_sectorial');
    if (padron) {
      alerts.push({
        type: 'sectoral_padron',
        severity: 'warning',
        title: `Padrón sectorial requerido`,
        message: `${padron.code}. Verifica inscripción del importador en el ${padron.code}.`,
        metadata: { code: padron.code },
      });
    }

    const rrna = compliance.regulations.find(r => r.type === 'RRNA' || r.type === 'permiso_previo');
    if (rrna) {
      alerts.push({
        type: 'permit_required',
        severity: 'warning',
        title: `Regulación no arancelaria aplicable`,
        message: `${rrna.code} (${rrna.authority}) — ${rrna.description}`,
      });
    }
  }

  // 2) Alerta de subvaloración
  if (
    input.declaredValueUSD != null && input.declaredValueUSD > 0 &&
    input.estimatedUnitPriceUSD != null && input.estimatedUnitPriceUSD > 0
  ) {
    const ratio = input.declaredValueUSD / input.estimatedUnitPriceUSD;
    if (ratio < 0.5) {
      alerts.push({
        type: 'undervalue',
        severity: 'warning',
        title: 'Posible subvaloración',
        message: `Valor unitario declarado ($${input.declaredValueUSD.toFixed(2)} USD) es ${Math.round((1 - ratio) * 100)}% menor al precio típico de mercado ($${input.estimatedUnitPriceUSD.toFixed(2)} USD). Documentación adicional puede ser requerida (Art. 78 LA).`,
        metadata: { declared: input.declaredValueUSD, expected: input.estimatedUnitPriceUSD, ratio },
      });
    }
  }

  // 3) Alerta TMEC automotriz
  const automotive = detectsAutomotive(input.description, input.context);
  if (automotive && !isCapitulo87(cleanFraction)) {
    alerts.push({
      type: 'automotive',
      severity: 'warning',
      title: '⚠️ Posible partida automotriz',
      message: 'Si el uso final es ensamble vehicular, considerar capítulo 87. Verificar Anexo 4-B TMEC, RVC ≥75%, certificado de origen vigente. Alternativa: 8708.99.XX (las demás partes y accesorios).',
      metadata: { keywords: AUTOMOTIVE_KEYWORDS.filter(kw => `${input.description} ${input.context ?? ''}`.toLowerCase().includes(kw)) },
    });
  }

  return alerts;
}

// ──────────────────────────────────────────────────────────────────────────
// Hash de consulta — para verificación pública
// ──────────────────────────────────────────────────────────────────────────

export function computeConsultHash(input: { description: string; context?: string; fractionCode: string; confidence: number; tigieVersion: string }): string {
  const payload = JSON.stringify({
    description: input.description,
    context: input.context ?? '',
    fractionCode: input.fractionCode,
    confidence: input.confidence,
    tigieVersion: input.tigieVersion,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
