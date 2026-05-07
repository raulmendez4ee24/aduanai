/**
 * Generador de Certificado de Origen TMEC con QR de verificación.
 *
 * Cumple formato del Anexo 5-A del TMEC con todos los datos exigidos por
 * la autoridad aduanera para acreditar origen preferencial.
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';

export type PreferenceCriterion = 'A' | 'B' | 'C' | 'D' | 'E';
export type OriginCountry = 'MX' | 'US' | 'CA';

export interface CertificateInput {
  tenantId: string;
  fractionCode: string;
  productDescription: string;
  exporterName: string;
  exporterAddress?: string;
  exporterTaxId?: string;
  importerName?: string;
  importerAddress?: string;
  importerTaxId?: string;
  producerName?: string;
  producerAddress?: string;
  producerTaxId?: string;
  originCountry: OriginCountry;
  preferenceCriterion: PreferenceCriterion;
  blanketPeriodFrom?: Date;
  blanketPeriodTo?: Date;
  signedBy: string;
  signedByRole: string;
  originAnalysisId?: string;
}

const PREFERENCE_LABELS: Record<PreferenceCriterion, string> = {
  A: 'A — Wholly obtained / wholly produced',
  B: 'B — Producida exclusivamente con materiales originarios',
  C: 'C — Cumple regla específica del Anexo 4-B (cambio arancelario y/o RVC)',
  D: 'D — Sin cambio arancelario por desensamble pero cumple RVC',
  E: 'E — Excepción específica',
};

function generateCertNumber(): string {
  const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TMEC-${ts}-${rand}`;
}

export async function createCertificate(input: CertificateInput): Promise<{ id: string; certificateNumber: string; contentHash: string }> {
  const certificateNumber = generateCertNumber();
  const signedDate = new Date();

  const dataForHash = {
    certificateNumber,
    fractionCode: input.fractionCode,
    productDescription: input.productDescription,
    originCountry: input.originCountry,
    preferenceCriterion: input.preferenceCriterion,
    exporterName: input.exporterName,
    signedBy: input.signedBy,
    signedDate: signedDate.toISOString(),
  };
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(dataForHash)).digest('hex');

  const created = await prisma.originCertificate.create({
    data: {
      certificateNumber,
      fractionCode: input.fractionCode,
      productDescription: input.productDescription,
      exporterName: input.exporterName,
      exporterAddress: input.exporterAddress,
      exporterTaxId: input.exporterTaxId,
      importerName: input.importerName,
      importerAddress: input.importerAddress,
      importerTaxId: input.importerTaxId,
      producerName: input.producerName,
      producerAddress: input.producerAddress,
      producerTaxId: input.producerTaxId,
      originCountry: input.originCountry,
      preferenceCriterion: input.preferenceCriterion,
      blanketPeriodFrom: input.blanketPeriodFrom ?? null,
      blanketPeriodTo: input.blanketPeriodTo ?? null,
      signedDate,
      signedBy: input.signedBy,
      signedByRole: input.signedByRole,
      originAnalysisId: input.originAnalysisId,
      tenantId: input.tenantId,
      status: 'issued',
      contentHash,
    },
  });

  return { id: created.id, certificateNumber, contentHash };
}

const escape = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderCertificateHTML(cert: {
  certificateNumber: string;
  fractionCode: string;
  productDescription: string;
  exporterName: string;
  exporterAddress: string | null;
  exporterTaxId: string | null;
  importerName: string | null;
  importerAddress: string | null;
  importerTaxId: string | null;
  producerName: string | null;
  producerAddress: string | null;
  producerTaxId: string | null;
  originCountry: string;
  preferenceCriterion: string;
  blanketPeriodFrom: Date | null;
  blanketPeriodTo: Date | null;
  signedDate: Date;
  signedBy: string;
  signedByRole: string;
  contentHash: string | null;
}, verifyUrl: string): string {
  const e = escape;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(verifyUrl)}`;
  const blanketStr = cert.blanketPeriodFrom && cert.blanketPeriodTo
    ? `Periodo cobertura (blanket): ${cert.blanketPeriodFrom.toISOString().slice(0, 10)} a ${cert.blanketPeriodTo.toISOString().slice(0, 10)}`
    : 'Single shipment';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Certificado de Origen TMEC — ${e(cert.certificateNumber)}</title>
<style>
@page { size: letter; margin: 1.5cm; }
body { font-family: Georgia, "Times New Roman", serif; color: #1f2937; line-height: 1.45; max-width: 760px; margin: 0 auto; padding: 24px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #059669; padding-bottom: 16px; margin-bottom: 18px; }
.brand { font-size: 26px; font-weight: 700; color: #064e3b; letter-spacing: -1px; }
.brand-sub { font-size: 11px; color: #4b5563; margin-top: 2px; }
.cert-id { text-align: right; font-size: 11px; color: #4b5563; }
.cert-id strong { color: #064e3b; font-size: 13px; display: block; }
h1 { font-size: 18px; text-align: center; text-transform: uppercase; letter-spacing: 1.5px; margin: 16px 0 18px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.party { border: 1px solid #d1d5db; padding: 10px 12px; border-radius: 4px; }
.party h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin: 0 0 6px; }
.party p { font-size: 12px; margin: 1px 0; }
.party .name { font-weight: 700; }
table.product { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
table.product th { background: #f3f4f6; text-align: left; padding: 6px 10px; border: 1px solid #d1d5db; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #4b5563; }
table.product td { padding: 8px 10px; border: 1px solid #d1d5db; }
.criterion { background: #ecfdf5; border-left: 4px solid #059669; padding: 12px 16px; margin: 14px 0; }
.criterion .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #047857; }
.criterion .code { font-size: 28px; font-weight: 700; color: #064e3b; line-height: 1; margin-top: 2px; }
.criterion .text { font-size: 12px; color: #064e3b; margin-top: 4px; }
.declaration { font-size: 11.5px; text-align: justify; margin: 16px 0; line-height: 1.55; }
.signature-area { display: flex; gap: 24px; align-items: flex-end; margin-top: 32px; }
.signature { flex: 1; }
.signature .line { border-top: 1px solid #111827; margin-top: 56px; padding-top: 4px; }
.signature .name { font-size: 12px; font-weight: 600; }
.signature .role { font-size: 10px; color: #4b5563; }
.qr-block { text-align: center; }
.qr-block img { width: 110px; height: 110px; }
.qr-block p { font-size: 9px; color: #6b7280; margin: 4px 0 0; max-width: 110px; }
.footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9.5px; color: #6b7280; }
.footer .hash { font-family: monospace; word-break: break-all; }
.disclaimer { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 12px; margin-top: 14px; font-size: 10.5px; color: #92400e; }
@media print { body { padding: 0; } button { display: none; } }
</style></head>
<body>
<div class="header">
  <div>
    <div class="brand">CERTIFICADO DE ORIGEN</div>
    <div class="brand-sub">TRATADO ENTRE MÉXICO, ESTADOS UNIDOS Y CANADÁ — T-MEC / USMCA</div>
  </div>
  <div class="cert-id">
    <strong>${e(cert.certificateNumber)}</strong>
    Fecha: ${cert.signedDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}<br>
    ${e(blanketStr)}
  </div>
</div>

<h1>Certificación de Origen</h1>

<div class="grid">
  <div class="party">
    <h3>Exportador</h3>
    <p class="name">${e(cert.exporterName)}</p>
    ${cert.exporterAddress ? `<p>${e(cert.exporterAddress)}</p>` : ''}
    ${cert.exporterTaxId ? `<p>RFC/Tax ID: ${e(cert.exporterTaxId)}</p>` : ''}
  </div>
  <div class="party">
    <h3>Importador</h3>
    <p class="name">${e(cert.importerName ?? '—')}</p>
    ${cert.importerAddress ? `<p>${e(cert.importerAddress)}</p>` : ''}
    ${cert.importerTaxId ? `<p>RFC/Tax ID: ${e(cert.importerTaxId)}</p>` : ''}
  </div>
  ${cert.producerName ? `<div class="party">
    <h3>Productor</h3>
    <p class="name">${e(cert.producerName)}</p>
    ${cert.producerAddress ? `<p>${e(cert.producerAddress)}</p>` : ''}
    ${cert.producerTaxId ? `<p>RFC/Tax ID: ${e(cert.producerTaxId)}</p>` : ''}
  </div>` : ''}
  <div class="party">
    <h3>País de origen</h3>
    <p class="name" style="font-size:18px;">${e(cert.originCountry)}</p>
    <p>Conforme al Capítulo 4 del T-MEC y sus Reglas Específicas de Origen (Anexo 4-B).</p>
  </div>
</div>

<table class="product">
  <thead><tr><th>Fracción Arancelaria</th><th>Descripción del producto</th></tr></thead>
  <tbody><tr><td style="font-family:monospace;font-weight:bold;">${e(cert.fractionCode)}</td><td>${e(cert.productDescription)}</td></tr></tbody>
</table>

<div class="criterion">
  <div class="label">Criterio de Preferencia</div>
  <div class="code">${e(cert.preferenceCriterion)}</div>
  <div class="text">${e(PREFERENCE_LABELS[cert.preferenceCriterion as PreferenceCriterion] ?? cert.preferenceCriterion)}</div>
</div>

<p class="declaration">
  El que suscribe, en nombre del exportador, declara que: <strong>las mercancías descritas en este certificado son originarias del territorio del/los país(es) de las Partes del T-MEC</strong>, y que la información contenida en este documento es veraz y exacta. Asumo la responsabilidad de probar tales afirmaciones. Me comprometo a conservar y a presentar, cuando me sea solicitado, los documentos necesarios que respalden esta certificación, así como a notificar por escrito a todas las personas a quienes se haya entregado este certificado de cualquier cambio que pudiera afectar la exactitud o validez del mismo.
</p>

<div class="signature-area">
  <div class="signature">
    <div class="line"></div>
    <p class="name">${e(cert.signedBy)}</p>
    <p class="role">${e(cert.signedByRole)}</p>
    <p class="role">Fecha de firma: ${cert.signedDate.toLocaleDateString('es-MX')}</p>
  </div>
  <div class="qr-block">
    <img src="${e(qrUrl)}" alt="QR verificación">
    <p>Escanea para verificar autenticidad</p>
  </div>
</div>

<div class="disclaimer">
  Este certificado se emite con base en el análisis de origen del exportador. La autoridad aduanera puede solicitar verificación de origen conforme al Art. 5.9 del T-MEC. Conservar documentación soporte por mínimo 5 años.
</div>

<div class="footer">
  <p>ADUANAI · Certificado emitido digitalmente · ${cert.signedDate.toISOString()}</p>
  <p class="hash">Hash de integridad (SHA-256): ${e(cert.contentHash ?? '—')}</p>
  <p>Verificable en: <a href="${e(verifyUrl)}">${e(verifyUrl)}</a></p>
</div>
</body></html>`;
}
