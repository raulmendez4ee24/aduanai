import { prisma } from '../lib/prisma';
import { getAnthropicClient } from '../lib/anthropic';

// ============================================
// Extracción automática de factura con IA
// ============================================

export interface ExtractedInvoice {
  providerName: string;
  providerCountry: string;
  providerTaxId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  incoterm: string;
  currency: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    fractionCode?: string;
  }[];
  subtotal: number;
  freight?: number;
  insurance?: number;
  otherCharges?: number;
  totalValue: number;
  paymentTerms?: string;
  notes?: string;
}

export async function extractInvoiceData(invoiceText: string): Promise<ExtractedInvoice> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `Eres un experto en comercio exterior mexicano especializado en valoracion aduanera y Manifestaciones de Valor (formato E2).

Analiza la factura comercial proporcionada y extrae TODOS los campos necesarios para generar una Manifestacion de Valor Electronica para importacion a Mexico.

Responde UNICAMENTE con un JSON valido con esta estructura exacta:
{
  "providerName": "nombre del proveedor/vendedor",
  "providerCountry": "pais del proveedor (codigo ISO 2 letras)",
  "providerTaxId": "RFC o Tax ID del proveedor si aparece",
  "invoiceNumber": "numero de factura",
  "invoiceDate": "YYYY-MM-DD",
  "incoterm": "FOB/CIF/EXW/FCA/etc",
  "currency": "USD/EUR/CNY/etc",
  "items": [
    {
      "description": "descripcion del producto",
      "quantity": 100,
      "unitPrice": 25.50,
      "totalPrice": 2550.00,
      "fractionCode": "fraccion arancelaria si se puede inferir"
    }
  ],
  "subtotal": 2550.00,
  "freight": 500.00,
  "insurance": 50.00,
  "otherCharges": 0,
  "totalValue": 3100.00,
  "paymentTerms": "terminos de pago si aparecen",
  "notes": "observaciones relevantes"
}

Si un campo no aparece en la factura, usa null.
Para el pais, infiere del idioma, moneda o direccion si no esta explicito.
Para el incoterm, si no aparece explicitamente, pon "FOB" como default y mencionalo en notes.
Siempre responde con JSON valido, sin markdown ni texto adicional.`,
    messages: [{
      role: 'user',
      content: `Extrae los datos de esta factura comercial:\n\n${invoiceText}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

  // Parse JSON, handling potential markdown wrapping
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const extracted = JSON.parse(jsonStr) as ExtractedInvoice;

  return extracted;
}

// ============================================
// Generación formato E2
// ============================================

export function generateFormatoE2(mve: {
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: Date;
  incoterm: string;
  currency: string;
  exchangeRate?: number | null;
  invoiceValue: number;
  freightValue: number;
  insuranceValue: number;
  otherIncrements: number;
  customsValue: number;
  hasVinculacion: boolean;
  vinculacionDesc?: string | null;
}, tenantName?: string) {
  return {
    // Seccion I - Datos del importador
    importador: {
      nombre: tenantName || 'EMPRESA IMMEX',
      domicilio: 'Ver registro fiscal',
    },
    // Seccion II - Datos del proveedor/vendedor
    proveedor: {
      nombre: mve.providerName,
      pais: mve.providerCountry,
    },
    // Seccion III - Datos de la factura
    factura: {
      numero: mve.invoiceNumber,
      fecha: mve.invoiceDate.toISOString().split('T')[0],
      incoterm: mve.incoterm,
      moneda: mve.currency,
      tipoCambio: mve.exchangeRate || null,
    },
    // Seccion IV - Metodo de valoracion
    metodoValoracion: {
      metodo: 1, // Valor de transaccion (Art. 64 Ley Aduanera)
      descripcion: 'Valor de Transaccion de las mercancias importadas',
    },
    // Seccion V - Determinacion del valor en aduana
    valoracion: {
      valorFactura: mve.invoiceValue,
      flete: mve.freightValue,
      seguro: mve.insuranceValue,
      otrosIncrementables: mve.otherIncrements,
      valorEnAduana: mve.customsValue,
      desglose: {
        A: mve.invoiceValue,
        B: mve.freightValue,
        C: mve.insuranceValue,
        D: mve.otherIncrements,
        E: mve.customsValue, // A + B + C + D
      },
    },
    // Seccion VI - Vinculacion
    vinculacion: {
      existeVinculacion: mve.hasVinculacion,
      descripcion: mve.vinculacionDesc || null,
      afectaPrecio: false,
    },
    // Seccion VII - Declaracion
    declaracion: {
      texto: 'Declaro bajo protesta de decir verdad que los datos asentados en la presente manifestacion de valor son ciertos.',
      fecha: new Date().toISOString().split('T')[0],
    },
  };
}

// ============================================
// Validación inteligente con IA
// ============================================

export async function validateMVE(mveId: string, tenantId: string) {
  const mve = await prisma.manifestacionValor.findFirst({
    where: { id: mveId, tenantId },
  });
  if (!mve) throw new Error('MVE no encontrada');

  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `Eres un auditor aduanero mexicano experto en valoracion aduanera (Art. 64-78 Ley Aduanera) y Manifestaciones de Valor.

Analiza la Manifestacion de Valor proporcionada y detecta:
1. SUBVALUACION: valores sospechosamente bajos para el tipo de mercancia
2. INCREMENTABLES FALTANTES: si el incoterm es FOB/EXW/FCA, DEBE haber flete. Si es FOB/FCA, revisa seguro.
3. VINCULACION NO DECLARADA: busca indicios de relacion entre importador y proveedor
4. INCONSISTENCIAS: moneda, fechas, valores que no cuadran
5. RIESGOS DE AUDITORIA: patrones que la autoridad cuestiona

Responde UNICAMENTE con JSON valido:
{
  "riskLevel": "LOW|MEDIUM|HIGH",
  "warnings": [
    {
      "severity": "critical|high|medium|low",
      "category": "subvaluacion|incrementables|vinculacion|inconsistencia|auditoria",
      "message": "descripcion del problema",
      "recommendation": "accion recomendada"
    }
  ],
  "summary": "resumen ejecutivo en 2-3 oraciones"
}`,
    messages: [{
      role: 'user',
      content: `Valida esta Manifestacion de Valor:
- Proveedor: ${mve.providerName} (${mve.providerCountry})
- Factura: ${mve.invoiceNumber} del ${mve.invoiceDate.toISOString().split('T')[0]}
- Incoterm: ${mve.incoterm}
- Moneda: ${mve.currency}
- Valor factura: $${mve.invoiceValue.toLocaleString()} ${mve.currency}
- Flete: $${mve.freightValue.toLocaleString()}
- Seguro: $${mve.insuranceValue.toLocaleString()}
- Otros incrementables: $${mve.otherIncrements.toLocaleString()}
- Valor en aduana: $${mve.customsValue.toLocaleString()}
- Vinculacion: ${mve.hasVinculacion ? 'SI - ' + (mve.vinculacionDesc || '') : 'NO'}
- Pedimento: ${mve.pedimento || 'No asignado'}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const validation = JSON.parse(jsonStr);

  // Update MVE with validation results
  await prisma.manifestacionValor.update({
    where: { id: mveId },
    data: {
      aiValidation: validation,
      riskLevel: validation.riskLevel || 'MEDIUM',
      status: 'VALIDATED',
    },
  });

  return validation;
}

// ============================================
// Dashboard KPIs
// ============================================

export async function getMVEDashboard(tenantId: string) {
  const [total, draft, validated, signed, transmitted] = await Promise.all([
    prisma.manifestacionValor.count({ where: { tenantId } }),
    prisma.manifestacionValor.count({ where: { tenantId, status: 'DRAFT' } }),
    prisma.manifestacionValor.count({ where: { tenantId, status: 'VALIDATED' } }),
    prisma.manifestacionValor.count({ where: { tenantId, status: 'SIGNED' } }),
    prisma.manifestacionValor.count({ where: { tenantId, status: 'TRANSMITTED' } }),
  ]);

  const mves = await prisma.manifestacionValor.findMany({
    where: { tenantId },
    select: { customsValue: true, riskLevel: true, currency: true },
  });

  const totalValueUSD = mves.reduce((s, m) => s + m.customsValue, 0);
  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const m of mves) {
    if (m.riskLevel && m.riskLevel in riskCounts) {
      riskCounts[m.riskLevel as keyof typeof riskCounts]++;
    }
  }

  const avgRisk = total > 0
    ? Math.round(((riskCounts.HIGH * 100 + riskCounts.MEDIUM * 50 + riskCounts.LOW * 10) / Math.max(1, riskCounts.HIGH + riskCounts.MEDIUM + riskCounts.LOW)))
    : 0;

  return {
    total,
    draft,
    validated,
    signed,
    transmitted,
    pendingAction: draft + validated,
    totalValueUSD,
    riskCounts,
    avgRiskScore: avgRisk,
  };
}

// ============================================
// Generar E2 como texto para PDF
// ============================================

export function generateE2Text(mve: {
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: Date;
  incoterm: string;
  currency: string;
  invoiceValue: number;
  freightValue: number;
  insuranceValue: number;
  otherIncrements: number;
  customsValue: number;
  hasVinculacion: boolean;
  pedimento?: string | null;
  formatoE2?: unknown;
}) {
  const lines = [
    '═══════════════════════════════════════════════════════',
    '       MANIFESTACION DE VALOR — FORMATO E2',
    '       (Art. 59 fraccion III, Ley Aduanera)',
    '═══════════════════════════════════════════════════════',
    '',
    `Pedimento: ${mve.pedimento || 'PENDIENTE'}`,
    `Fecha: ${new Date().toLocaleDateString('es-MX')}`,
    '',
    '─── I. PROVEEDOR/VENDEDOR ───',
    `Nombre: ${mve.providerName}`,
    `Pais: ${mve.providerCountry}`,
    '',
    '─── II. DATOS DE LA FACTURA ───',
    `Numero: ${mve.invoiceNumber}`,
    `Fecha: ${mve.invoiceDate.toLocaleDateString('es-MX')}`,
    `Incoterm: ${mve.incoterm}`,
    `Moneda: ${mve.currency}`,
    '',
    '─── III. METODO DE VALORACION ───',
    'Metodo 1: Valor de Transaccion (Art. 64 LA)',
    '',
    '─── IV. DETERMINACION DEL VALOR EN ADUANA ───',
    `A) Valor de factura:        $${mve.invoiceValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `B) Flete:                   $${mve.freightValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `C) Seguro:                  $${mve.insuranceValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `D) Otros incrementables:    $${mve.otherIncrements.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    '                            ────────────',
    `E) VALOR EN ADUANA:         $${mve.customsValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${mve.currency}`,
    '',
    '─── V. VINCULACION ───',
    `Existe vinculacion: ${mve.hasVinculacion ? 'SI' : 'NO'}`,
    '',
    '─── DECLARACION ───',
    'Declaro bajo protesta de decir verdad que los datos',
    'asentados son ciertos y verificables.',
    '',
    '═══════════════════════════════════════════════════════',
    '  Generado por ADUANAI — Auto MVE con IA',
    '═══════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}
