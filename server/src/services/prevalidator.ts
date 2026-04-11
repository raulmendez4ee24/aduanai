import { prisma } from '../lib/prisma';

interface PedimentoData {
  fractionCode: string;
  origin: string;
  customsValue: number;
  currency: string;
  incoterm: string;
  operationType: 'IMPORT' | 'EXPORT';
  regime: string; // "definitivo", "temporal", "deposito_fiscal"
  customsBroker?: string;
  importerRFC?: string;
  exchangeRate?: number;
  grossWeight?: number;
  netWeight?: number;
  packages?: number;
  invoiceNumber?: string;
}

interface ValidationResult {
  valid: boolean;
  score: number; // 0-100
  errors: ValidationItem[];
  warnings: ValidationItem[];
  info: ValidationItem[];
}

interface ValidationItem {
  code: string;
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  rule: string; // Referencia legal
}

export async function prevalidatePedimento(data: PedimentoData): Promise<ValidationResult> {
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const info: ValidationItem[] = [];

  // 1. Validar fracción arancelaria
  const cleanCode = data.fractionCode.replace(/\./g, '');
  const fraction = await prisma.fraction.findFirst({
    where: { code: cleanCode },
  });

  if (!fraction) {
    errors.push({
      code: 'FRAC_NOT_FOUND',
      field: 'fractionCode',
      message: `Fracción ${data.fractionCode} no encontrada en la TIGIE vigente`,
      severity: 'error',
      rule: 'Art. 36 Ley Aduanera — Fracción válida de la TIGIE',
    });
  } else {
    info.push({
      code: 'FRAC_VALID',
      field: 'fractionCode',
      message: `Fracción ${data.fractionCode}: ${fraction.description}`,
      severity: 'info',
      rule: 'TIGIE 2026',
    });

    // Verificar RRNA
    if (fraction.requiresPermit) {
      warnings.push({
        code: 'PERMIT_REQUIRED',
        field: 'fractionCode',
        message: `Requiere permiso previo de ${fraction.permitType}. Verificar que esté vigente.`,
        severity: 'warning',
        rule: 'Art. 36-A Ley Aduanera — Documentos que acrediten cumplimiento de RRNA',
      });
    }

    // Verificar padrón sectorial
    if (fraction.sectoralRegistry) {
      warnings.push({
        code: 'SECTORAL_REGISTRY',
        field: 'fractionCode',
        message: `Fracción requiere inscripción en padrón sectorial${fraction.sectoralType ? ` (${fraction.sectoralType})` : ''}`,
        severity: 'warning',
        rule: 'Art. 59-IV Ley Aduanera — Padrón de importadores sectorial',
      });
    }

    // Verificar NOMs
    if (fraction.noms.length > 0) {
      info.push({
        code: 'NOMS_REQUIRED',
        field: 'fractionCode',
        message: `NOMs aplicables: ${fraction.noms.join(', ')}. Verificar certificado de cumplimiento.`,
        severity: 'info',
        rule: 'Art. 36-A-I-d Ley Aduanera — Cumplimiento de NOMs',
      });
    }
  }

  // 2. Validar valor en aduana
  if (data.customsValue <= 0) {
    errors.push({
      code: 'VALUE_ZERO',
      field: 'customsValue',
      message: 'El valor en aduana debe ser mayor a 0',
      severity: 'error',
      rule: 'Art. 64 Ley Aduanera — Valor en aduana',
    });
  }

  if (data.customsValue > 500000 && data.currency === 'USD') {
    info.push({
      code: 'HIGH_VALUE',
      field: 'customsValue',
      message: 'Operación de alto valor. Puede requerir revisión adicional.',
      severity: 'info',
      rule: 'RGCE 2026 — Operaciones de alto valor',
    });
  }

  // 3. Validar RFC del importador
  if (data.importerRFC) {
    const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
    if (!rfcRegex.test(data.importerRFC.toUpperCase())) {
      errors.push({
        code: 'RFC_INVALID',
        field: 'importerRFC',
        message: 'RFC con formato inválido. Debe ser 12-13 caracteres alfanuméricos.',
        severity: 'error',
        rule: 'Art. 36-A-I-a Ley Aduanera — RFC del importador',
      });
    }
  }

  // 4. Validar incoterm
  const validIncoterms = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
  if (!validIncoterms.includes(data.incoterm.toUpperCase())) {
    errors.push({
      code: 'INCOTERM_INVALID',
      field: 'incoterm',
      message: `Incoterm "${data.incoterm}" no reconocido. Válidos: ${validIncoterms.join(', ')}`,
      severity: 'error',
      rule: 'Incoterms 2020 ICC',
    });
  }

  // 5. Validar origen
  if (!data.origin || data.origin.trim().length < 2) {
    errors.push({
      code: 'ORIGIN_MISSING',
      field: 'origin',
      message: 'País de origen es obligatorio',
      severity: 'error',
      rule: 'Art. 36-A-I-b Ley Aduanera — País de procedencia',
    });
  }

  // 6. Validar peso
  if (data.grossWeight !== undefined && data.netWeight !== undefined) {
    if (data.netWeight > data.grossWeight) {
      errors.push({
        code: 'WEIGHT_INCONSISTENT',
        field: 'netWeight',
        message: 'El peso neto no puede ser mayor al peso bruto',
        severity: 'error',
        rule: 'Anexo 22 Ley Aduanera — Datos del pedimento',
      });
    }
  }

  // 7. Validar régimen
  const validRegimes = ['definitivo', 'temporal', 'deposito_fiscal', 'transito', 'elaboracion'];
  if (data.regime && !validRegimes.includes(data.regime.toLowerCase())) {
    warnings.push({
      code: 'REGIME_UNKNOWN',
      field: 'regime',
      message: `Régimen "${data.regime}" no estándar. Verificar clave de régimen.`,
      severity: 'warning',
      rule: 'Art. 90 Ley Aduanera — Regímenes aduaneros',
    });
  }

  // 8. Temporal imports need IMMEX
  if (data.regime === 'temporal' && data.operationType === 'IMPORT') {
    info.push({
      code: 'TEMPORAL_IMMEX',
      field: 'regime',
      message: 'Importación temporal requiere programa IMMEX vigente o resolución favorable.',
      severity: 'info',
      rule: 'Art. 108 Ley Aduanera — Importación temporal para elaboración',
    });
  }

  // Calcular score
  const totalChecks = errors.length + warnings.length + info.length + 5; // 5 checks passed silently
  const passedChecks = totalChecks - errors.length - (warnings.length * 0.5);
  const score = Math.max(0, Math.round((passedChecks / totalChecks) * 100));

  return {
    valid: errors.length === 0,
    score,
    errors,
    warnings,
    info,
  };
}
