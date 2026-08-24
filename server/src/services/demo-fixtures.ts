/**
 * Demo fixtures: dataset realista de "Maquiladora Ejemplo SA de CV".
 *
 * Salida: blobs JSON serializables que se guardan en la tabla DemoData
 * y luego son materializados a registros reales por demo-loader.ts
 *
 * Convenciones:
 *  - Las fechas se serializan como ISO string (Prisma las parsea OK).
 */
import { formatPedimentoNumero } from '../lib/anexo22';
/**
 *  - Las relaciones cross-categoría usan índices (importIndex, mveIndex)
 *    que el loader resuelve a IDs después de crear cada batch.
 */

export const DEMO_COMPANY = {
  name: 'Maquiladora Ejemplo SA de CV',
  rfc: 'MEJ010203AB1',
  industry: 'maquiladora_automotriz',
  certificationModality: 'AA',
};

// ──────────────────────────────────────────────────────────────────────────
// Catálogo: 12 fracciones arancelarias activas con saldos vivos
// ──────────────────────────────────────────────────────────────────────────

interface FractionMeta {
  code: string;
  description: string;
  unit: string;
  avgUnitValueUSD: number; // valor unitario aproximado USD
  noms?: string[];
  identificadores?: string[]; // identificadores Anexo 22
}

export const DEMO_FRACTIONS: FractionMeta[] = [
  { code: '85443099', description: 'Arneses de cables eléctricos para vehículos automotores', unit: 'Kg', avgUnitValueUSD: 12.5, identificadores: ['IM'] },
  { code: '85365001', description: 'Interruptores de uso automotriz para tensión <= 1000V', unit: 'Pza', avgUnitValueUSD: 3.8 },
  { code: '85366901', description: 'Conectores eléctricos para arnés automotriz', unit: 'Pza', avgUnitValueUSD: 0.45 },
  { code: '87082101', description: 'Cinturones de seguridad para vehículos', unit: 'Pza', avgUnitValueUSD: 14.2 },
  { code: '87082999', description: 'Partes y accesorios de carrocería para vehículos', unit: 'Pza', avgUnitValueUSD: 22.7 },
  { code: '87089999', description: 'Las demás partes y accesorios para vehículos automóviles', unit: 'Pza', avgUnitValueUSD: 18.5 },
  { code: '73181599', description: 'Tornillos de acero al carbono, M5–M12', unit: 'Kg', avgUnitValueUSD: 4.6 },
  { code: '73181606', description: 'Tuercas hexagonales de acero', unit: 'Kg', avgUnitValueUSD: 5.1 },
  { code: '85011099', description: 'Motores eléctricos de potencia inferior a 37.5 W', unit: 'Pza', avgUnitValueUSD: 6.4 },
  { code: '90328905', description: 'Sensores de control automático para uso automotriz', unit: 'Pza', avgUnitValueUSD: 9.8 },
  { code: '39269099', description: 'Las demás manufacturas de plástico', unit: 'Kg', avgUnitValueUSD: 7.2 },
  { code: '85044012', description: 'Convertidores estáticos de potencia <= 1 kVA', unit: 'Pza', avgUnitValueUSD: 11.3 },
];

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const MS_DAY = 86400000;

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function daysAgo(d: number): string {
  return new Date(todayUTC().getTime() - d * MS_DAY).toISOString();
}

function daysFromNow(d: number): string {
  return new Date(todayUTC().getTime() + d * MS_DAY).toISOString();
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pedimento(seed: number): string {
  // Fase 4.6 — formato OFICIAL del Anexo 22 (instructivo, 15 dígitos):
  // AÑO(2) ADUANA(2) PATENTE(4) CONSECUTIVO(7). El generador previo invertía
  // patente y aduana (AÑO PATENTE ADUANA CONSEC).
  const year = String(new Date().getFullYear() - 1).slice(-2);
  const aduana = '47'; // AICM (Apéndice 1)
  const patente = '3461';
  const consec = String(4000000 + seed).padStart(7, '0');
  return formatPedimentoNumero(year, aduana, patente, consec);
}

// Patrón determinista para estabilidad (mismo demo cada vez que regeneramos)
function seedRng(seedValue: number) {
  let s = seedValue;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 1) IMPORTACIONES TEMPORALES (500, distribuidas en últimos 12 meses)
//    + 5 con vencimiento en 15/30/45/60/90 días
// ──────────────────────────────────────────────────────────────────────────

const SUPPLIERS = [
  { name: 'Yazaki North America Inc.', country: 'US' },
  { name: 'Sumitomo Electric Wiring', country: 'JP' },
  { name: 'TE Connectivity Ltd.', country: 'CN' },
  { name: 'Aptiv PLC', country: 'IE' },
  { name: 'Lear Corporation', country: 'US' },
  { name: 'Bosch Mexico', country: 'DE' },
  { name: 'Denso Components', country: 'JP' },
  { name: 'Visteon Corporation', country: 'US' },
  { name: 'Faurecia Interior', country: 'FR' },
  { name: 'Magna International', country: 'CA' },
];

interface ImportFixture {
  index: number;
  pedimento: string;
  fractionCode: string;
  description: string;
  quantity: number;
  unit: string;
  customsValue: number;
  valueMXN: number;
  supplier: string;
  originCountry: string;
  entryDate: string;
  expirationDate: string;
  expirationMonths: number;
  quantityDischarged: number;
  status: 'ACTIVE' | 'PARTIALLY_DISCHARGED' | 'FULLY_DISCHARGED' | 'EXPIRED';
  notes?: string;
}

function buildImports(): ImportFixture[] {
  const rng = seedRng(42);
  const out: ImportFixture[] = [];
  const fxRate = 17.85;
  const certMonths = 36; // modalidad AA

  // Distribuir 495 importaciones a lo largo de 12 meses
  for (let i = 0; i < 495; i++) {
    const frac = DEMO_FRACTIONS[Math.floor(rng() * DEMO_FRACTIONS.length)];
    const qty = Math.round(rng() * 5000 + 100);
    const unitVal = frac.avgUnitValueUSD * (0.8 + rng() * 0.4); // ±20%
    const customsValue = Math.round(qty * unitVal);
    const daysBack = Math.floor(rng() * 360); // entre hoy y hace 12 meses
    const supplier = SUPPLIERS[Math.floor(rng() * SUPPLIERS.length)];
    const dischargedRatio = rng() < 0.55 ? rng() * 0.95 : 0;
    const dischargedQty = Math.round(qty * dischargedRatio);
    const status: ImportFixture['status'] = dischargedQty === 0 ? 'ACTIVE' : dischargedQty >= qty ? 'FULLY_DISCHARGED' : 'PARTIALLY_DISCHARGED';

    out.push({
      index: i,
      pedimento: pedimento(i + 1),
      fractionCode: frac.code,
      description: frac.description,
      quantity: qty,
      unit: frac.unit,
      customsValue,
      valueMXN: Math.round(customsValue * fxRate),
      supplier: supplier.name,
      originCountry: supplier.country,
      entryDate: daysAgo(daysBack),
      expirationDate: daysFromNow(certMonths * 30 - daysBack),
      expirationMonths: certMonths,
      quantityDischarged: dischargedQty,
      status,
    });
  }

  // 5 con alertas de vencimiento puntuales (15/30/45/60/90 días)
  const alertDays = [15, 30, 45, 60, 90];
  for (let i = 0; i < alertDays.length; i++) {
    const dLeft = alertDays[i];
    const frac = DEMO_FRACTIONS[i % DEMO_FRACTIONS.length];
    const qty = randInt(800, 4000);
    const unitVal = frac.avgUnitValueUSD;
    const customsValue = Math.round(qty * unitVal);
    const monthsBack = certMonths;
    const entryDate = daysAgo(monthsBack * 30 - dLeft);
    out.push({
      index: 495 + i,
      pedimento: pedimento(496 + i),
      fractionCode: frac.code,
      description: frac.description,
      quantity: qty,
      unit: frac.unit,
      customsValue,
      valueMXN: Math.round(customsValue * fxRate),
      supplier: SUPPLIERS[i].name,
      originCountry: SUPPLIERS[i].country,
      entryDate,
      expirationDate: daysFromNow(dLeft),
      expirationMonths: certMonths,
      quantityDischarged: Math.round(qty * 0.4),
      status: 'PARTIALLY_DISCHARGED',
      notes: `Vence en ${dLeft} días — atención requerida`,
    });
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 2) DESCARGOS (380): 60% retorno extranjero, 25% venta nacional,
//    10% desperdicio/merma, 5% transferencia
// ──────────────────────────────────────────────────────────────────────────

interface DischargeFixture {
  importIndex: number;
  type: 'RETURN_EXPORT' | 'DOMESTIC_SALE' | 'WASTE' | 'SCRAP' | 'TRANSFER' | 'DESTRUCTION';
  pedimento?: string;
  quantity: number;
  unit: string;
  customsValue?: number;
  dischargeDate: string;
  destinationCountry?: string;
  buyerName?: string;
  taxesPaid?: number;
  notes?: string;
}

function buildDischarges(imports: ImportFixture[]): DischargeFixture[] {
  const rng = seedRng(99);
  const out: DischargeFixture[] = [];
  // Tomar imports que ya tienen quantityDischarged > 0 y derivar uno o dos descargos
  const candidates = imports.filter(i => i.quantityDischarged > 0);

  for (let n = 0; n < 380 && n < candidates.length * 1.5; n++) {
    const imp = candidates[n % candidates.length];
    const r = rng();
    let type: DischargeFixture['type'];
    if (r < 0.6) type = 'RETURN_EXPORT';
    else if (r < 0.85) type = 'DOMESTIC_SALE';
    else if (r < 0.93) type = 'WASTE';
    else if (r < 0.97) type = 'SCRAP';
    else type = 'TRANSFER';

    const qty = Math.max(1, Math.round(imp.quantityDischarged / (1 + Math.floor(n / candidates.length))));
    const dischargeDate = daysAgo(randInt(1, 300));

    const fixture: DischargeFixture = {
      importIndex: imp.index,
      type,
      quantity: qty,
      unit: imp.unit,
      dischargeDate,
    };

    if (type === 'RETURN_EXPORT') {
      fixture.pedimento = `${pedimento(800000 + n)} RT`;
      fixture.destinationCountry = pick(['US', 'CA', 'BR']);
      fixture.customsValue = Math.round(qty * (imp.customsValue / imp.quantity));
    } else if (type === 'DOMESTIC_SALE') {
      fixture.pedimento = `${pedimento(900000 + n)} A1`;
      fixture.buyerName = pick(['Autopartes del Norte SA', 'Distribuidora Cuauhtémoc', 'Comercializadora ABC']);
      fixture.taxesPaid = Math.round(qty * (imp.customsValue / imp.quantity) * 0.16);
      fixture.customsValue = Math.round(qty * (imp.customsValue / imp.quantity));
    } else {
      fixture.notes = type === 'WASTE' ? 'Desperdicio reportado al SAT' : type === 'SCRAP' ? 'Merma operativa' : 'Transferencia virtual IMMEX';
    }

    out.push(fixture);
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 3) CRÉDITOS FISCALES IVA (25)
// ──────────────────────────────────────────────────────────────────────────

interface TaxCreditFixture {
  pedimento: string;
  fractionCode: string;
  ivaAmount: number;
  iepsAmount: number;
  creditDate: string;
  status: 'ACTIVE' | 'PARTIALLY_USED' | 'FULLY_USED';
  dischargeDeadline: string;
  discharged: number;
  remaining: number;
  notes?: string;
}

function buildTaxCredits(): TaxCreditFixture[] {
  const rng = seedRng(31);
  const out: TaxCreditFixture[] = [];
  for (let i = 0; i < 25; i++) {
    const frac = DEMO_FRACTIONS[Math.floor(rng() * DEMO_FRACTIONS.length)];
    const customsValueMXN = Math.round(rng() * 950000 + 50000);
    const ivaAmount = Math.round(customsValueMXN * 0.16);
    const usedRatio = rng() < 0.4 ? 0 : rng() * 0.9;
    const discharged = Math.round(ivaAmount * usedRatio);
    const remaining = ivaAmount - discharged;
    const status: TaxCreditFixture['status'] = discharged === 0 ? 'ACTIVE' : remaining === 0 ? 'FULLY_USED' : 'PARTIALLY_USED';
    out.push({
      pedimento: pedimento(700000 + i),
      fractionCode: frac.code,
      ivaAmount,
      iepsAmount: 0,
      creditDate: daysAgo(randInt(30, 540)),
      status,
      dischargeDeadline: daysFromNow(randInt(30, 540)),
      discharged,
      remaining,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 4) GARANTÍAS (3): fianza, carta de crédito, depósito
// ──────────────────────────────────────────────────────────────────────────

interface GuaranteeFixture {
  type: 'FIANZA' | 'CARTA_CREDITO' | 'DEPOSITO';
  amount: number;
  institution: string;
  referenceNumber: string;
  issueDate: string;
  expiryDate: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'RENEWED';
  notes?: string;
}

function buildGuarantees(): GuaranteeFixture[] {
  return [
    {
      type: 'FIANZA',
      amount: 2500000,
      institution: 'Afianzadora Aserta SA',
      referenceNumber: 'FZA-2026-04572',
      issueDate: daysAgo(180),
      expiryDate: daysFromNow(185),
      status: 'ACTIVE',
      notes: 'Garantía contribuciones al comercio exterior',
    },
    {
      type: 'CARTA_CREDITO',
      amount: 1850000,
      institution: 'BBVA México',
      referenceNumber: 'LC-MX-9921-2026',
      issueDate: daysAgo(95),
      expiryDate: daysFromNow(270),
      status: 'ACTIVE',
      notes: 'LC standby para operaciones IMMEX',
    },
    {
      type: 'DEPOSITO',
      amount: 480000,
      institution: 'Banco Azteca',
      referenceNumber: 'DEP-AZT-3344',
      issueDate: daysAgo(40),
      expiryDate: daysFromNow(325),
      status: 'ACTIVE',
      notes: 'Depósito en cuenta para garantía aduanal',
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// 5) CERTIFICACIÓN (1) — modalidad AA
// ──────────────────────────────────────────────────────────────────────────

function buildCertification() {
  return {
    modality: 'AA',
    certNumber: 'CERT-IVA-IEPS-AA-2026-0473',
    issueDate: daysAgo(540),
    expiryDate: daysFromNow(190),
    renewalDeadline: daysFromNow(160),
    status: 'ACTIVE' as const,
    notes: 'Renovación recomendada 30 días antes del vencimiento',
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 6) CLASIFICACIONES (80)
// ──────────────────────────────────────────────────────────────────────────

// BUG-11 (auditoría 24-ago-2026): cada descripción va SIEMPRE en par con su
// fracción correcta. Antes descripción y fracción se elegían con RNG
// independiente, así que el historial demo mostraba pares barajados
// ("Conector hembra de 12 pines" → 7318.16.06 tuercas de acero) e incluso con
// feedback "correcta" — la vitrina reprobando su propio examen. El feedback
// 'correct' solo es admisible porque ahora TODOS los pares son correctos.
const PRODUCT_FIXTURES: { description: string; fractionCode: string }[] = [
  { description: 'Arnés eléctrico de 45 circuitos para tablero automotriz, conectores Molex', fractionCode: '85443099' },
  { description: 'Sensor de temperatura NTC con encapsulado plástico, salida 12V', fractionCode: '90328905' },
  { description: 'Tornillo hexagonal M8x25 acero al carbono galvanizado', fractionCode: '73181599' },
  { description: 'Conector hembra de 12 pines para arnés automotriz', fractionCode: '85366901' },
  { description: 'Motor DC 12V 30W para movimiento de espejo retrovisor', fractionCode: '85011099' },
  { description: 'Cinturón de seguridad de 3 puntos con pretensor pirotécnico', fractionCode: '87082101' },
  { description: 'Tablero plástico inyectado para vehículo SUV color negro mate', fractionCode: '87082999' },
  { description: 'Tuerca M6 acero zincado, paso 1.0', fractionCode: '73181606' },
  { description: 'Convertidor DC-DC 12V a 5V, 1A, encapsulado epoxy', fractionCode: '85044012' },
  { description: 'Sensor de presión del aceite con conector estandar', fractionCode: '90328905' },
  { description: 'Pieza plástica decorativa para interior automotriz, ABS pintado', fractionCode: '39269099' },
  { description: 'Interruptor de palanca para luces interiores, contacto plata', fractionCode: '85365001' },
];

interface ClassificationFixture {
  inputDescription: string;
  inputContext?: string;
  fractionCode: string;
  fractionDescription: string;
  confidence: number;
  griApplied: string[];
  feedback?: string;
  createdAt: string;
}

function buildClassifications(): ClassificationFixture[] {
  const rng = seedRng(7);
  const porCodigo = new Map(DEMO_FRACTIONS.map(f => [f.code, f]));
  const out: ClassificationFixture[] = [];
  for (let i = 0; i < 80; i++) {
    // Se elige el PAR curado completo (descripción + su fracción correcta) —
    // nunca descripción y fracción por separado (BUG-11).
    const fixture = PRODUCT_FIXTURES[Math.floor(rng() * PRODUCT_FIXTURES.length)];
    const frac = porCodigo.get(fixture.fractionCode);
    if (!frac) throw new Error(`PRODUCT_FIXTURES apunta a fracción fuera de DEMO_FRACTIONS: ${fixture.fractionCode}`);
    const conf = 70 + rng() * 28;
    out.push({
      inputDescription: fixture.description,
      inputContext: 'Industria automotriz — mercancía importada bajo IMMEX',
      fractionCode: frac.code,
      fractionDescription: frac.description,
      confidence: Math.round(conf * 10) / 10,
      griApplied: ['1', rng() > 0.5 ? '6' : '3a'],
      feedback: rng() > 0.7 ? 'correct' : undefined,
      createdAt: daysAgo(randInt(1, 270)),
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 7) COTIZACIONES (50)
// ──────────────────────────────────────────────────────────────────────────

interface QuoteFixture {
  fractionCode: string;
  customsValue: number;
  origin: string;
  incoterm: string;
  currency: string;
  result: string; // JSON
  createdAt: string;
}

function buildQuotes(): QuoteFixture[] {
  const rng = seedRng(13);
  const out: QuoteFixture[] = [];
  for (let i = 0; i < 50; i++) {
    const frac = DEMO_FRACTIONS[Math.floor(rng() * DEMO_FRACTIONS.length)];
    const customsValue = Math.round(rng() * 80000 + 5000);
    const igi = Math.round(customsValue * 0.05);
    const dta = Math.round(customsValue * 0.008);
    const ivaBase = customsValue + igi + dta;
    const iva = Math.round(ivaBase * 0.16);
    const total = customsValue + igi + dta + iva;
    out.push({
      fractionCode: frac.code,
      customsValue,
      origin: pick(['US', 'CN', 'JP', 'DE', 'KR']),
      incoterm: pick(['CIF', 'FOB', 'DAP']),
      currency: 'USD',
      result: JSON.stringify({
        igi, dta, iva, total,
        breakdown: { customsValue, igi, dta, iva, total },
      }),
      createdAt: daysAgo(randInt(1, 180)),
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 8) OPERACIONES / EXPEDIENTES (15) con documentos
// ──────────────────────────────────────────────────────────────────────────

interface OperationDoc {
  name: string;
  type: string;
  status: 'PENDING' | 'UPLOADED' | 'VERIFIED' | 'EXPIRED';
  required: boolean;
  fileName?: string;
}

interface OperationFixture {
  reference: string;
  type: 'IMPORT' | 'EXPORT';
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETE';
  fractionCode: string;
  description: string;
  origin: string;
  destination: string;
  customsValue: number;
  currency: string;
  customsBroker: string;
  completeness: number;
  notes?: string;
  operationDate: string;
  documents: OperationDoc[];
}

function buildOperations(): OperationFixture[] {
  const rng = seedRng(21);
  const out: OperationFixture[] = [];
  const brokers = ['Agencia Aduanal Rodríguez', 'Agencia GMG', 'Trans Aduanal del Norte', 'AAA Internacional'];
  const docTypes: { name: string; type: string }[] = [
    { name: 'Pedimento', type: 'pedimento' },
    { name: 'Factura comercial', type: 'factura' },
    { name: 'Bill of Lading', type: 'bl' },
    { name: 'Packing list', type: 'packing_list' },
    { name: 'Certificado de origen', type: 'certificado_origen' },
    { name: 'COVE', type: 'cove' },
    { name: 'Manifestación de valor', type: 'manifestacion_valor' },
  ];

  for (let i = 0; i < 15; i++) {
    const frac = DEMO_FRACTIONS[Math.floor(rng() * DEMO_FRACTIONS.length)];
    const cv = Math.round(rng() * 60000 + 10000);
    const docs: OperationDoc[] = docTypes.map((d, idx) => ({
      name: d.name,
      type: d.type,
      status: idx < 5 ? 'VERIFIED' : rng() > 0.5 ? 'UPLOADED' : 'PENDING',
      required: idx < 5,
      fileName: idx < 5 ? `${d.type}-${i + 1}.pdf` : undefined,
    }));
    const completeness = Math.round(docs.filter(d => d.status === 'VERIFIED' || d.status === 'UPLOADED').length / docs.length * 100);
    out.push({
      reference: pedimento(600000 + i),
      type: 'IMPORT',
      status: completeness === 100 ? 'COMPLETE' : 'IN_PROGRESS',
      fractionCode: frac.code,
      description: frac.description,
      origin: pick(['Estados Unidos', 'China', 'Japón', 'Alemania']),
      destination: 'Aduana de Nuevo Laredo',
      customsValue: cv,
      currency: 'USD',
      customsBroker: pick(brokers),
      completeness,
      operationDate: daysAgo(randInt(1, 240)),
      documents: docs,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 9) MANIFESTACIONES DE VALOR (8) con COVE
// ──────────────────────────────────────────────────────────────────────────

interface MVEFixture {
  index: number;
  pedimento?: string;
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: string;
  incoterm: string;
  currency: string;
  exchangeRate: number;
  invoiceValue: number;
  freightValue: number;
  insuranceValue: number;
  otherIncrements: number;
  customsValue: number;
  hasVinculacion: boolean;
  vinculacionDesc?: string;
  status: 'DRAFT' | 'VALIDATED' | 'TRANSMITTED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  signedAt?: string;
  transmittedAt?: string;
  createdAt: string;
}

interface CoveFixture {
  mveIndex: number;
  eDocument: string;
  invoiceNumber: string;
  providerTaxId: string;
  value: number;
  currency: string;
  validated: boolean;
  validationDate?: string;
}

function buildMVE(): { mves: MVEFixture[]; coves: CoveFixture[] } {
  const rng = seedRng(56);
  const mves: MVEFixture[] = [];
  const coves: CoveFixture[] = [];

  for (let i = 0; i < 8; i++) {
    const supplier = SUPPLIERS[i % SUPPLIERS.length];
    const invoiceValue = Math.round(rng() * 80000 + 15000);
    const freight = Math.round(invoiceValue * 0.08);
    const insurance = Math.round(invoiceValue * 0.012);
    const customsValue = invoiceValue + freight + insurance;
    const status: MVEFixture['status'] = i < 5 ? 'TRANSMITTED' : i < 7 ? 'VALIDATED' : 'DRAFT';
    const invoiceDate = daysAgo(randInt(15, 180));

    mves.push({
      index: i,
      pedimento: status === 'TRANSMITTED' ? pedimento(500000 + i) : undefined,
      providerName: supplier.name,
      providerCountry: supplier.country,
      invoiceNumber: `INV-${supplier.country}-${10000 + i * 73}`,
      invoiceDate,
      incoterm: pick(['CIF', 'FOB', 'EXW', 'DAP']),
      currency: 'USD',
      exchangeRate: 17.85,
      invoiceValue,
      freightValue: freight,
      insuranceValue: insurance,
      otherIncrements: 0,
      customsValue,
      hasVinculacion: i % 3 === 0,
      vinculacionDesc: i % 3 === 0 ? 'Empresa relacionada del mismo grupo corporativo' : undefined,
      status,
      riskLevel: i % 3 === 0 ? 'MEDIUM' : 'LOW',
      signedAt: status === 'TRANSMITTED' ? daysAgo(randInt(5, 60)) : undefined,
      transmittedAt: status === 'TRANSMITTED' ? daysAgo(randInt(1, 50)) : undefined,
      createdAt: invoiceDate,
    });

    coves.push({
      mveIndex: i,
      eDocument: `COVE-${20260000 + i * 17}`,
      invoiceNumber: `INV-${supplier.country}-${10000 + i * 73}`,
      providerTaxId: `${supplier.country}TAX${100000 + i}`,
      value: invoiceValue,
      currency: 'USD',
      validated: status === 'TRANSMITTED' || status === 'VALIDATED',
      validationDate: status === 'TRANSMITTED' ? daysAgo(randInt(1, 50)) : undefined,
    });
  }

  return { mves, coves };
}

// ──────────────────────────────────────────────────────────────────────────
// 10) PLANES DE CARGA (12)
// ──────────────────────────────────────────────────────────────────────────

interface LoadItemFixture {
  description: string;
  quantity: number;
  length: number;
  width: number;
  height: number;
  weight: number;
  stackable: boolean;
  fragile: boolean;
}

interface LoadPlanFixture {
  name: string;
  containerType: 'CONTAINER_20FT' | 'CONTAINER_40FT' | 'CONTAINER_40FT_HC' | 'TRUCK_53FT';
  containerLength: number;
  containerWidth: number;
  containerHeight: number;
  maxWeight: number;
  totalItems: number;
  totalVolume: number;
  totalWeight: number;
  volumeUsed: number;
  weightUsed: number;
  status: 'draft' | 'optimized' | 'shipped';
  createdAt: string;
  items: LoadItemFixture[];
}

function buildLoadPlans(): LoadPlanFixture[] {
  const rng = seedRng(101);
  const containers = [
    { type: 'CONTAINER_20FT' as const, l: 590, w: 235, h: 239, mw: 28000 },
    { type: 'CONTAINER_40FT' as const, l: 1203, w: 235, h: 239, mw: 26500 },
    { type: 'CONTAINER_40FT_HC' as const, l: 1203, w: 235, h: 269, mw: 26500 },
    { type: 'TRUCK_53FT' as const, l: 1610, w: 244, h: 274, mw: 19500 },
  ];
  const out: LoadPlanFixture[] = [];
  for (let i = 0; i < 12; i++) {
    const c = containers[i % containers.length];
    const numItems = randInt(3, 7);
    const containerVolumeM3 = (c.l * c.w * c.h) / 1_000_000;

    // Objetivo de llenado realista: 75-95% del volumen (piso alto para
    // compensar pérdida por redondeo de dimensiones a múltiplos de 5cm)
    // y 60-90% del peso
    const targetFillVolume = 0.75 + rng() * 0.20;
    const targetFillWeight = 0.6 + rng() * 0.30;
    const budgetVolumeM3 = containerVolumeM3 * targetFillVolume;
    const budgetWeightKg = c.mw * targetFillWeight;

    const items: LoadItemFixture[] = [];
    let totalWeight = 0;
    let totalVolume = 0;
    let totalQty = 0;

    for (let j = 0; j < numItems; j++) {
      // Volumen objetivo por item, repartido equitativamente con jitter ±25%
      const itemBudgetM3 = (budgetVolumeM3 / numItems) * (0.75 + rng() * 0.5);
      // Cantidad razonable de cajas por item
      const qty = randInt(20, 150);
      const perPieceM3 = itemBudgetM3 / qty;
      // Convertir m³ a dimensiones cm: cubo aproximado, redondeado a múltiplos prácticos
      const sideCm = Math.cbrt(perPieceM3) * 100;
      const length = Math.max(20, Math.round(sideCm * (0.9 + rng() * 0.3) / 5) * 5);
      const width = Math.max(20, Math.round(sideCm * (0.85 + rng() * 0.3) / 5) * 5);
      const height = Math.max(15, Math.round(sideCm * (0.7 + rng() * 0.3) / 5) * 5);
      // Peso por pieza derivado del presupuesto de peso
      const perPieceKg = Math.max(1, Math.round((budgetWeightKg / numItems) / qty));
      const weight = perPieceKg;
      const desc = pick(['Cajas de arnés automotriz', 'Tarima con conectores', 'Contenedor de tornillería', 'Caja de sensores', 'Pallet de motores DC']);
      items.push({ description: desc, quantity: qty, length, width, height, weight, stackable: true, fragile: rng() > 0.7 });
      totalWeight += qty * weight;
      totalVolume += qty * (length * width * height) / 1_000_000;
      totalQty += qty;
    }

    // Cap defensivo: si por redondeo nos pasamos de 95%, escalamos cantidades hacia abajo
    const rawVolPct = (totalVolume / containerVolumeM3) * 100;
    const rawWtPct = (totalWeight / c.mw) * 100;
    const volScale = rawVolPct > 95 ? 95 / rawVolPct : 1;
    const wtScale = rawWtPct > 90 ? 90 / rawWtPct : 1;
    const scale = Math.min(volScale, wtScale);
    if (scale < 1) {
      for (const it of items) {
        it.quantity = Math.max(1, Math.floor(it.quantity * scale));
      }
      totalQty = items.reduce((s, it) => s + it.quantity, 0);
      totalVolume = items.reduce((s, it) => s + it.quantity * (it.length * it.width * it.height) / 1_000_000, 0);
      totalWeight = items.reduce((s, it) => s + it.quantity * it.weight, 0);
    }

    out.push({
      name: `Embarque ${pick(['NL', 'TJ', 'JU', 'PV'])}-${100 + i}`,
      containerType: c.type,
      containerLength: c.l,
      containerWidth: c.w,
      containerHeight: c.h,
      maxWeight: c.mw,
      totalItems: totalQty,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalWeight: Math.round(totalWeight),
      volumeUsed: Math.min(95, Math.round((totalVolume / containerVolumeM3) * 100)),
      weightUsed: Math.min(95, Math.round((totalWeight / c.mw) * 100)),
      status: i < 8 ? 'shipped' : i < 11 ? 'optimized' : 'draft',
      createdAt: daysAgo(randInt(2, 200)),
      items,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 11) ALERTAS TIGIE (30)
// ──────────────────────────────────────────────────────────────────────────

interface AlertFixture {
  type: 'tariff_change' | 'new_regulation' | 'weekly_summary';
  channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP';
  title: string;
  content: string;
  read: boolean;
  fractionCodes: string[];
  createdAt: string;
}

function buildAlerts(): AlertFixture[] {
  const rng = seedRng(74);
  const out: AlertFixture[] = [];
  const titles = {
    tariff_change: [
      'Cambio de arancel NMF en partida 8544',
      'Reducción de TLCUEM para fracción 8536.69.01',
      'Actualización de cuota compensatoria — China',
      'Nuevo arancel preferencial CPTPP',
    ],
    new_regulation: [
      'Nueva NOM-029-SE-2021 publicada en DOF',
      'Reforma a Reglas Generales de Comercio Exterior',
      'Actualización del Anexo 22 — RGCE',
      'Nuevo identificador para fracciones automotrices',
    ],
    weekly_summary: [
      'Resumen semanal de cambios TIGIE',
      'Boletín DOF de la semana — comercio exterior',
      'Resumen de actualizaciones SAT/SE',
    ],
  };
  for (let i = 0; i < 30; i++) {
    const r = rng();
    const type: AlertFixture['type'] = r < 0.45 ? 'tariff_change' : r < 0.8 ? 'new_regulation' : 'weekly_summary';
    const title = pick(titles[type]);
    const fcs = type === 'weekly_summary' ? [] : [DEMO_FRACTIONS[Math.floor(rng() * DEMO_FRACTIONS.length)].code];
    out.push({
      type,
      channel: 'IN_APP',
      title,
      content: `${title}. Revisa el detalle en el módulo de Actualizaciones para ver el impacto sobre tus operaciones.`,
      read: rng() > 0.6,
      fractionCodes: fcs,
      createdAt: daysAgo(randInt(1, 90)),
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 12) PRODUCTOS Y BOM (Bill of Materials) — Maquiladora automotriz
// ──────────────────────────────────────────────────────────────────────────

interface ProductFixture {
  productCode: string;
  description: string;
  fractionCode: string | null;
  unit: string;
  isFinished: boolean;
}

interface BomLineFixture {
  productCode: string;        // Producto terminado (SKU)
  componentCode: string;      // Componente (SKU)
  quantity: number;
  unit: string;
  scrapPercent: number;
}

interface AssemblyFixture {
  productCode: string;
  quantity: number;
  assemblyDate: string;       // ISO
  reference: string;
  notes?: string;
}

function buildProductsAndBOM(): {
  products: ProductFixture[];
  bom: BomLineFixture[];
  assemblies: AssemblyFixture[];
} {
  const rng = seedRng(82);

  // Materia prima — referenciadas por fractionCode existente en imports demo
  const materias: ProductFixture[] = [
    { productCode: 'MP-ARNES-12C',  description: 'Arnés 12 circuitos automotriz',                  fractionCode: '85443099', unit: 'Pza', isFinished: false },
    { productCode: 'MP-CONECT-MOLEX', description: 'Conector Molex hembra 12 pines',               fractionCode: '85366901', unit: 'Pza', isFinished: false },
    { productCode: 'MP-TORN-M5',    description: 'Tornillo hexagonal M5 acero al carbono',         fractionCode: '73181599', unit: 'Pza', isFinished: false },
    { productCode: 'MP-PLAST-ABS',  description: 'Pieza plástica ABS pintada',                     fractionCode: '39269099', unit: 'Pza', isFinished: false },
    { productCode: 'MP-MOTOR-30W',  description: 'Motor DC 12V 30W',                               fractionCode: '85011099', unit: 'Pza', isFinished: false },
    { productCode: 'MP-SENSOR-NTC', description: 'Sensor NTC temperatura',                         fractionCode: '90328905', unit: 'Pza', isFinished: false },
  ];

  // Productos terminados
  const finished: ProductFixture[] = [
    { productCode: 'PT-TABLERO-ABC123', description: 'Tablero automotriz ensamblado modelo ABC123', fractionCode: '87082999', unit: 'Pza', isFinished: true },
    { productCode: 'PT-SENSOR-T200',    description: 'Módulo de sensor de temperatura T200',        fractionCode: '90328905', unit: 'Pza', isFinished: true },
    { productCode: 'PT-MOTOR-M50',      description: 'Sub-ensamble motor con conector M50',          fractionCode: '85011099', unit: 'Pza', isFinished: true },
  ];

  const products: ProductFixture[] = [...materias, ...finished];

  // BOM
  const bom: BomLineFixture[] = [
    // Tablero ABC123 — 1 arnés + 12 conectores + 24 tornillos + 1 plástico
    { productCode: 'PT-TABLERO-ABC123', componentCode: 'MP-ARNES-12C',     quantity: 1,  unit: 'Pza', scrapPercent: 2 },
    { productCode: 'PT-TABLERO-ABC123', componentCode: 'MP-CONECT-MOLEX',  quantity: 12, unit: 'Pza', scrapPercent: 5 },
    { productCode: 'PT-TABLERO-ABC123', componentCode: 'MP-TORN-M5',       quantity: 24, unit: 'Pza', scrapPercent: 8 },
    { productCode: 'PT-TABLERO-ABC123', componentCode: 'MP-PLAST-ABS',     quantity: 1,  unit: 'Pza', scrapPercent: 3 },

    // Sensor T200 — 1 sensor + 1 conector + 2 tornillos
    { productCode: 'PT-SENSOR-T200', componentCode: 'MP-SENSOR-NTC',  quantity: 1, unit: 'Pza', scrapPercent: 1 },
    { productCode: 'PT-SENSOR-T200', componentCode: 'MP-CONECT-MOLEX', quantity: 1, unit: 'Pza', scrapPercent: 5 },
    { productCode: 'PT-SENSOR-T200', componentCode: 'MP-TORN-M5',     quantity: 2, unit: 'Pza', scrapPercent: 8 },

    // Motor M50 — 1 motor + 4 tornillos + 1 conector
    { productCode: 'PT-MOTOR-M50', componentCode: 'MP-MOTOR-30W',    quantity: 1, unit: 'Pza', scrapPercent: 1 },
    { productCode: 'PT-MOTOR-M50', componentCode: 'MP-TORN-M5',      quantity: 4, unit: 'Pza', scrapPercent: 8 },
    { productCode: 'PT-MOTOR-M50', componentCode: 'MP-CONECT-MOLEX', quantity: 1, unit: 'Pza', scrapPercent: 5 },
  ];

  // Ensambles históricos (8) distribuidos en últimos 90 días
  const finishedSkus = finished.map(f => f.productCode);
  const assemblies: AssemblyFixture[] = [];
  for (let i = 0; i < 8; i++) {
    const sku = finishedSkus[i % finishedSkus.length];
    const qty = sku === 'PT-TABLERO-ABC123' ? randInt(50, 250) : randInt(100, 500);
    assemblies.push({
      productCode: sku,
      quantity: qty,
      assemblyDate: daysAgo(randInt(1, 90)),
      reference: `OP-2026-${String(1000 + i)}`,
      notes: i === 0 ? 'Primera corrida del lote' : undefined,
    });
    void rng;
  }

  return { products, bom, assemblies };
}

// ──────────────────────────────────────────────────────────────────────────
// EXPORT: dataset completo
// ──────────────────────────────────────────────────────────────────────────

export function buildDemoDataset() {
  const imports = buildImports();
  const discharges = buildDischarges(imports);
  const { mves, coves } = buildMVE();
  const bomBundle = buildProductsAndBOM();

  return {
    company: DEMO_COMPANY,
    inventory: imports,        // 500
    discharges,                // 380 (sobre los 273 imports con descargo)
    fiscal: buildTaxCredits(), // 25
    guarantees: buildGuarantees(), // 3
    certification: buildCertification(), // 1
    classifications: buildClassifications(), // 80
    quotes: buildQuotes(),     // 50
    operations: buildOperations(), // 15
    mve: mves,                 // 8
    coves,                     // 8
    logistics: buildLoadPlans(), // 12
    alerts: buildAlerts(),     // 30
    products: bomBundle.products,     // 9 productos (6 MP + 3 PT)
    bom: bomBundle.bom,               // 10 líneas BOM
    assemblies: bomBundle.assemblies, // 8 ensambles históricos
  };
}

export type DemoDataset = ReturnType<typeof buildDemoDataset>;
