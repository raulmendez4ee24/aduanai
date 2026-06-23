/**
 * Seed de reglas de riesgo del Simulador de Glosa.
 *
 * Cada regla representa un patrón conocido por el SAT y su personal de
 * reconocimiento aduanero. Los pesos están calibrados para acumular un
 * score 0-100 (donde >80 = critical, >60 = high, >30 = medium, else low).
 */

import type { PrismaClient } from '@prisma/client';

interface RuleSeed {
  ruleCode: string;
  category: 'valuation' | 'origin' | 'classification' | 'regime' | 'documentation';
  name: string;
  description: string;
  detectionLogic: Record<string, unknown>;
  weight: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  legalBasis?: string;
}

const RULES: RuleSeed[] = [
  // ── Valoración ──
  {
    ruleCode: 'VAL_001',
    category: 'valuation',
    name: 'Valor declarado por debajo del precio estimado SAT',
    description: 'El valor unitario declarado es 30% o más bajo respecto al precio estimado SAT publicado para esa fracción/país.',
    detectionLogic: { type: 'price_estimate', deltaPctThreshold: 30 },
    weight: 35, severity: 'critical',
    recommendation: 'Revisar el valor declarado. Si es real, preparar evidencia robusta de transacción (factura, contrato, transferencia bancaria) y considerar otorgar garantía en cuenta aduanera (Anexo 13 RGCE).',
    legalBasis: 'Art. 78-A LA · Art. 86-A LA',
  },
  {
    ruleCode: 'VAL_002',
    category: 'valuation',
    name: 'Valor unitario inconsistente con histórico',
    description: 'Variación >25% respecto al valor unitario promedio histórico del importador para la misma fracción.',
    detectionLogic: { type: 'historic_deviation', deviationPctThreshold: 25 },
    weight: 25, severity: 'high',
    recommendation: 'Justificar la variación con evidencia: cambio de proveedor, fluctuación de commodity, descuento por volumen.',
    legalBasis: 'Art. 64-71 LA',
  },
  {
    ruleCode: 'VAL_003',
    category: 'valuation',
    name: 'Vinculación comprador-vendedor no declarada',
    description: 'Patrón sugiere posible vinculación pero no se declaró en MVE.',
    detectionLogic: { type: 'mve_flag', field: 'declaresLink' },
    weight: 30, severity: 'high',
    recommendation: 'Si hay vinculación, declararla y demostrar que no afectó el precio (Art. 65, 67-71 LA).',
    legalBasis: 'Art. 68-71 LA',
  },

  // ── Origen ──
  {
    ruleCode: 'ORI_001',
    category: 'origin',
    name: 'Triangulación sospechosa Asia → Tercer país → México',
    description: 'País de embarque distinto al país de origen, especialmente Vietnam/Malasia/Tailandia con producto típicamente chino. Patrón clásico de elusión de cuotas compensatorias.',
    detectionLogic: { type: 'triangulation', suspectProviders: ['VN', 'MY', 'TH', 'KH', 'ID'], typicallyFrom: ['CN'] },
    weight: 40, severity: 'critical',
    recommendation: 'Preparar certificado de origen del fabricante real, factura del fabricante, BL completo desde origen real. Riesgo de elusión.',
    legalBasis: 'Art. 78 LA · Art. 89 LCE',
  },
  {
    ruleCode: 'ORI_002',
    category: 'origin',
    name: 'Certificado TMEC sin verificación de regla específica',
    description: 'Importación bajo TMEC sin análisis documentado de la regla de origen específica (RVC o cambio arancelario).',
    detectionLogic: { type: 'tmec_no_analysis' },
    weight: 30, severity: 'high',
    recommendation: 'Realizar análisis de regla de origen y conservar evidencia. Verificación de origen probable (Art. 5.9 TMEC).',
  },
  {
    ruleCode: 'ORI_003',
    category: 'origin',
    name: 'Cuota compensatoria activa no declarada',
    description: 'La fracción + país de origen tienen cuota compensatoria UPCI vigente pero no fue declarada.',
    detectionLogic: { type: 'antidumping_active', mustDeclare: true },
    weight: 50, severity: 'critical',
    recommendation: 'DECLARAR la cuota compensatoria. La omisión configura multa 130-150% del impuesto omitido.',
    legalBasis: 'Art. 62 LCE · Art. 178 LA',
  },

  // ── Clasificación ──
  {
    ruleCode: 'CLA_001',
    category: 'classification',
    name: 'Fracción con histórico alto de reclasificación',
    description: 'Fracción ha sido reclasificada por el SAT en >15% de los pedimentos del sector en el último año.',
    detectionLogic: { type: 'reclassification_history', thresholdPct: 15 },
    weight: 25, severity: 'medium',
    recommendation: 'Asegurar dictamen técnico de clasificación firmado. Considerar consulta de clasificación arancelaria.',
    legalBasis: 'Art. 47 LA',
  },
  {
    ruleCode: 'CLA_002',
    category: 'classification',
    name: 'Descripción genérica o ambigua',
    description: 'Descripción del producto en factura es genérica (<10 palabras o palabras vagas como "artículos", "equipo", "accesorios").',
    detectionLogic: { type: 'description_quality', minWords: 10 },
    weight: 20, severity: 'medium',
    recommendation: 'Solicitar al proveedor descripción detallada con: material, función, dimensiones, uso, modelo, marca.',
  },
  {
    ruleCode: 'CLA_003',
    category: 'classification',
    name: 'Fracción "los demás" (terminada en .99.99)',
    description: 'Fracciones residuales son revisadas con frecuencia para verificar que no exista una fracción específica.',
    detectionLogic: { type: 'fraction_pattern', pattern: '\\.99\\.99$' },
    weight: 15, severity: 'low',
    recommendation: 'Verificar que efectivamente no exista una fracción específica para el producto.',
  },

  // ── Régimen ──
  {
    ruleCode: 'REG_001',
    category: 'regime',
    name: 'IMMEX sin certificación IVA-IEPS importando temporal',
    description: 'Importación temporal A4 sin certificación IVA-IEPS implica pago efectivo de IVA en lugar de diferimiento.',
    detectionLogic: { type: 'immex_no_certification', regime: 'A4' },
    weight: 20, severity: 'medium',
    recommendation: 'Considerar obtener certificación IVA-IEPS (Anexo 31 RGCE) para diferir el IVA.',
    legalBasis: 'Anexo 31 RGCE',
  },
  {
    ruleCode: 'REG_002',
    category: 'regime',
    name: 'Cambio frecuente de régimen aduanero',
    description: 'El importador cambia entre A1/A4/F4 sin patrón claro, lo cual puede levantar revisión.',
    detectionLogic: { type: 'regime_pattern', windowDays: 90, distinctRegimesThreshold: 3 },
    weight: 15, severity: 'low',
    recommendation: 'Documentar la justificación de cada régimen aduanero utilizado.',
  },

  // ── Documentación ──
  {
    ruleCode: 'DOC_001',
    category: 'documentation',
    name: 'Falta certificado de origen pero aplica preferencia',
    description: 'Se declara preferencia arancelaria pero no se vinculó certificado de origen al pedimento.',
    detectionLogic: { type: 'tmec_no_certificate' },
    weight: 35, severity: 'high',
    recommendation: 'Obtener y vincular certificado de origen ANTES del despacho. Sin él, se pierde la preferencia y se pagan diferencias + recargos.',
    legalBasis: 'Capítulo 5 TMEC',
  },
  {
    ruleCode: 'DOC_002',
    category: 'documentation',
    name: 'Permiso previo o NOM aplicable no declarado',
    description: 'Fracción requiere permiso (Anexo 2.4.1) o NOM mexicana pero no se declaró en el pedimento.',
    detectionLogic: { type: 'permit_or_nom_required', source: 'Anexo_2.4.1' },
    weight: 40, severity: 'high',
    recommendation: 'Verificar permisos requeridos y obtenerlos antes del despacho. Sin ellos, embargo precautorio.',
    legalBasis: 'Acuerdo NOMs Anexo 2.4.1',
  },

  // ── Padrones ──
  {
    ruleCode: 'PAD_001',
    category: 'regime',
    name: 'Padrón sectorial requerido y no inscrito',
    description: 'La fracción requiere padrón sectorial (Anexo 10 RGCE) pero el importador no está inscrito.',
    detectionLogic: { type: 'padron_blocking' },
    weight: 60, severity: 'critical',
    recommendation: 'BLOQUEO ABSOLUTO: NO operar. Embargo seguro y multa 130-150% del valor de la mercancía.',
    legalBasis: 'Art. 59 LA · Anexo 10 RGCE · Art. 151, 178 LA',
  },

  // ── Aduana ──
  {
    ruleCode: 'ADU_001',
    category: 'regime',
    name: 'Aduana con alta tasa histórica de RA',
    description: 'Aduanas como Manzanillo, Veracruz, Tijuana tienen mayor probabilidad de Reconocimiento Aduanero.',
    detectionLogic: { type: 'high_risk_customs', codes: ['MAN', 'VER', 'TIJ', 'ZLO', 'NLD'] },
    weight: 10, severity: 'low',
    recommendation: 'Si es operativamente viable, considerar aduana alterna (Lázaro Cárdenas, Altamira, Progreso).',
  },
];

export async function seedGlosaRiskRules(prisma: PrismaClient): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const r of RULES) {
    const existing = await prisma.glosaRiskRule.findUnique({ where: { ruleCode: r.ruleCode } });
    const data = {
      category: r.category,
      name: r.name,
      description: r.description,
      detectionLogic: r.detectionLogic,
      weight: r.weight,
      severity: r.severity,
      recommendation: r.recommendation,
      legalBasis: r.legalBasis ?? null,
      active: true,
    };
    if (existing) {
      await prisma.glosaRiskRule.update({ where: { ruleCode: r.ruleCode }, data });
      updated++;
    } else {
      await prisma.glosaRiskRule.create({ data: { ...data, ruleCode: r.ruleCode } });
      created++;
    }
  }
  return { created, updated };
}
