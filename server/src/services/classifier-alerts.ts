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
import { lookupEstimatedPrice } from './price-validator';

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

  // 1) Alertas de compliance.
  //    - Padrón sectorial, NOMs, RRNA: aplican por fracción (independiente del país)
  //    - Cuota compensatoria antidumping: requiere país, solo si está provisto
  if (cleanFraction.length === 8) {
    const compliance = await lookupCompliance(cleanFraction, input.countryOfOrigin ?? '');

    if (compliance.antidumping) {
      const ad = compliance.antidumping;
      const effectiveStr = ad.effectiveDate?.slice(0, 10) ?? ad.publishDate?.slice(0, 10) ?? 's/d';
      const resLabel = ad.resolutionNumber ?? ad.decree ?? 's/n';

      // Etiqueta de cuota formateada por rateType — antes salía "2.07%"
      // para una cuota de $2.07 USD/kg (bug crítico).
      let rateLabel: string;
      if (ad.rateType === 'specific_USD_kg') rateLabel = `$${ad.rate} USD/kg`;
      else if (ad.rateType === 'specific_USD_unit') rateLabel = `$${ad.rate} ${ad.rateUnit}`;
      else rateLabel = `${ad.rate}%`;

      // Cálculo concreto si tenemos cantidad
      let exampleCalc: string | null = null;
      let calculatedUSD: number | null = null;
      if (input.declaredQuantity != null && input.declaredQuantity > 0) {
        if (ad.rateType === 'specific_USD_kg' || ad.rateType === 'specific_USD_unit') {
          calculatedUSD = input.declaredQuantity * ad.rate;
          const unitWord = ad.rateType === 'specific_USD_kg' ? 'kg' : 'unidades';
          exampleCalc = `Para ${input.declaredQuantity.toLocaleString('en-US')} ${unitWord} = $${calculatedUSD.toFixed(2)} USD adicionales`;
        } else if (ad.rateType === 'percentage' && input.declaredValueUSD != null) {
          const totalUSD = input.declaredQuantity * input.declaredValueUSD;
          calculatedUSD = totalUSD * (ad.rate / 100);
          exampleCalc = `Para ${input.declaredQuantity} unidades × $${input.declaredValueUSD.toFixed(2)} USD = $${calculatedUSD.toFixed(2)} USD adicionales`;
        }
      }

      const matchWarn = ad.matchType && ad.matchType !== 'exact'
        ? ` ⚠️ Match por ${ad.matchType === 'subheading' ? 'subpartida' : 'partida'} (${ad.matchedFraction}) — valida que ${cleanFraction} esté cubierta.`
        : '';

      const productLine = ad.productDesc ? `${resLabel} — ${ad.productDesc}` : resLabel;
      const messageParts = [
        productLine,
        `Origen: ${ad.countryNormalized}`,
        `Cuota: ${rateLabel}`,
      ];
      if (exampleCalc) messageParts.push(exampleCalc);
      messageParts.push(`Vigente desde ${effectiveStr}`);
      messageParts.push(
        '⚠️ Omitir en pedimento: multa 130-150% del impuesto omitido (Art. 178 LA) + embargo precautorio (Art. 151 LA).',
      );
      if (matchWarn) messageParts.push(matchWarn.trim());

      alerts.push({
        type: 'antidumping',
        severity: 'critical',
        title: `🚨 Cuota compensatoria activa — ${rateLabel} origen ${ad.countryNormalized}`,
        message: messageParts.join('\n'),
        metadata: {
          resolutionNumber: ad.resolutionNumber,
          expedienteUPCI: ad.expedienteUPCI,
          rate: ad.rate,
          rateType: ad.rateType,
          rateUnit: ad.rateUnit,
          rateLabel,
          decree: ad.decree,
          productDesc: ad.productDesc,
          countryNormalized: ad.countryNormalized,
          effectiveDate: ad.effectiveDate,
          expiryDate: ad.expiryDate,
          dofUrl: ad.dofUrl,
          publishDate: ad.publishDate,
          calculatedAmountUSD: calculatedUSD,
          potentialPenaltyUSDMin: calculatedUSD != null ? calculatedUSD * 1.30 : null,
          potentialPenaltyUSDMax: calculatedUSD != null ? calculatedUSD * 1.50 : null,
          matchType: ad.matchType,
          matchedFraction: ad.matchedFraction,
        },
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

  // 2) Alerta de subvaloración contra precio estimado SAT (Art. 84-A LA)
  if (input.declaredValueUSD != null && input.declaredValueUSD > 0 && cleanFraction.length === 8) {
    const estimated = await lookupEstimatedPrice(cleanFraction, input.countryOfOrigin);
    if (estimated) {
      const ratio = input.declaredValueUSD / estimated.estimatedValue;
      const deltaPct = Math.round((1 - ratio) * 100);
      if (ratio < 0.80) {
        alerts.push({
          type: 'undervalue',
          severity: 'critical',
          title: '🚨 Posible subvaluación — Garantía requerida',
          message: `Valor declarado ($${input.declaredValueUSD.toFixed(2)} ${estimated.unit}) está ${deltaPct}% debajo del precio estimado SAT ($${estimated.estimatedValue.toFixed(2)} ${estimated.unit}, ${estimated.decree ?? 'referencia interna'}). Requiere constituir garantía en cuenta aduanera (Art. 84-A Ley Aduanera). Riesgo de glosa por subvaluación.`,
          metadata: { declared: input.declaredValueUSD, estimated: estimated.estimatedValue, ratio, source: estimated.source, decree: estimated.decree },
        });
      } else if (ratio < 0.95) {
        alerts.push({
          type: 'undervalue',
          severity: 'warning',
          title: 'Valor cercano al umbral de garantía',
          message: `Valor declarado ($${input.declaredValueUSD.toFixed(2)} ${estimated.unit}) está ${deltaPct}% debajo del precio estimado SAT ($${estimated.estimatedValue.toFixed(2)} ${estimated.unit}). Documenta precio comercial con factura/contrato.`,
          metadata: { declared: input.declaredValueUSD, estimated: estimated.estimatedValue, ratio, source: estimated.source },
        });
      }
    } else if (
      input.estimatedUnitPriceUSD != null && input.estimatedUnitPriceUSD > 0 &&
      input.declaredValueUSD / input.estimatedUnitPriceUSD < 0.5
    ) {
      // Fallback al precio sugerido por el LLM si no hay registro SAT
      const ratio = input.declaredValueUSD / input.estimatedUnitPriceUSD;
      alerts.push({
        type: 'undervalue',
        severity: 'warning',
        title: 'Posible subvaluación (sin precio SAT registrado)',
        message: `Valor declarado ($${input.declaredValueUSD.toFixed(2)} USD) es ${Math.round((1 - ratio) * 100)}% menor al precio típico de mercado ($${input.estimatedUnitPriceUSD.toFixed(2)} USD). Documentación adicional puede ser requerida (Art. 78 LA).`,
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
