/**
 * Generador de Certificado de Origen TMEC con QR de verificación.
 *
 * Cumple formato del Anexo 5-A del TMEC con todos los datos exigidos por
 * la autoridad aduanera para acreditar origen preferencial.
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';

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
  /** Anexo 5-A elemento 1-2: quién certifica y sus datos de contacto. */
  certificador?: Certificador;
  /** Elemento 6: número de factura si ampara un solo embarque. */
  numeroFactura?: string;
}

export type TipoCertificador = 'exportador' | 'productor' | 'importador';
export interface Certificador {
  tipo: TipoCertificador;
  nombre?: string;
  cargo?: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
}

/**
 * OriginCertificate NO tiene columnas para el certificador (SCHEMA REQUERIDO:
 * `certificadorTipo String?`, `certificadorDatos Json?`, `numeroFactura String?`).
 * Mientras tanto se persiste como sufijo parseable en `signedByRole`
 * (`Cargo [[cert:{...}]]`) y se limpia al renderizar — sin perder los 9 elementos.
 */
const CERT_TAG = /\s*\[\[cert:(\{.*\})\]\]\s*$/;
export function codificarCertificador(role: string, c?: Certificador, numeroFactura?: string): string {
  if (!c && !numeroFactura) return role;
  return `${role} [[cert:${JSON.stringify({ ...(c ?? { tipo: 'exportador' }), ...(numeroFactura ? { numeroFactura } : {}) })}]]`;
}
export function decodificarCertificador(role: string): { role: string; certificador: Certificador | null; numeroFactura: string | null } {
  const m = role.match(CERT_TAG);
  if (!m) return { role, certificador: null, numeroFactura: null };
  try {
    const j = JSON.parse(m[1]!) as Certificador & { numeroFactura?: string };
    const { numeroFactura, ...c } = j;
    return { role: role.replace(CERT_TAG, ''), certificador: c.tipo ? c : null, numeroFactura: numeroFactura ?? null };
  } catch { return { role: role.replace(CERT_TAG, ''), certificador: null, numeroFactura: null }; }
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
  if (input.originAnalysisId) {
    // El análisis referenciado debe ser del tenant (no se enlaza un análisis ajeno).
    const oa = await prisma.originAnalysis.findFirst({ where: { id: input.originAnalysisId, tenantId: input.tenantId }, select: { id: true } });
    if (!oa) throw new AppError('originAnalysisId no pertenece a tu empresa', 400);
  }
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
      signedByRole: codificarCertificador(input.signedByRole, input.certificador, input.numeroFactura),
      originAnalysisId: input.originAnalysisId,
      tenantId: input.tenantId,
      status: 'issued',
      contentHash,
    },
  });

  return { id: created.id, certificateNumber, contentHash };
}

const escape = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// ─────────────────────── 9 elementos mínimos (Anexo 5-A) ───────────────────────

export interface ElementoCertificado {
  n: number;
  nombre: string;
  valor: string;
  /** de dónde salió el prellenado; 'manual' = lo debe capturar el usuario */
  fuente: 'analisis' | 'producto' | 'cliente' | 'tenant' | 'usuario' | 'default' | 'manual';
  completo: boolean;
}

export const NOMBRES_ELEMENTOS: readonly string[] = [
  'Quién certifica (exportador / productor / importador)',
  'Certificador: nombre, cargo, dirección, teléfono y correo',
  'Exportador: nombre, dirección, correo y teléfono',
  'Productor: nombre, dirección, correo y teléfono (o "Disponible a solicitud")',
  'Importador: nombre, dirección, correo y teléfono',
  'Descripción y clasificación SA a 6 dígitos (y factura si es un embarque)',
  'Criterio de origen (Art. 4.2)',
  'Periodo global (hasta 12 meses) o embarque único',
  'Firma autorizada y fecha con la declaración',
];

export interface CertificadoPrellenado {
  elementos: ElementoCertificado[];
  faltantes: string[];
  sugerido: Partial<CertificateInput> & { fractionCode: string; productDescription: string };
  fundamento: string;
}

/**
 * Criterio del Art. 4.2 a partir del método con el que calificó el análisis:
 * (a) totalmente obtenida → A; (b) exclusivamente materiales originarios → B;
 * (c) materiales no originarios que cumplen Anexo 4-B → C.
 */
export function criterioDeMetodo(qualifyingMethod: string | null | undefined, vnm: number | null | undefined): PreferenceCriterion {
  if (qualifyingMethod === 'wholly_obtained') return 'A';
  if (vnm != null && vnm <= 0) return 'B';
  return 'C';
}

/**
 * Prellena los 9 elementos desde OriginAnalysis + Product + Cliente + Tenant +
 * User. Lo que no existe se marca `manual` y aparece en `faltantes` — no se
 * inventa ningún dato de contacto.
 */
export async function prellenarCertificado(args: { tenantId: string; userId?: string | null; analysisId?: string | null; productId?: string | null; clienteId?: string | null; certificadorTipo?: TipoCertificador }): Promise<CertificadoPrellenado> {
  const [analisis, producto, tenant, user] = await Promise.all([
    args.analysisId ? prisma.originAnalysis.findFirst({ where: { id: args.analysisId, tenantId: args.tenantId } }) : null,
    args.productId ? prisma.product.findFirst({ where: { id: args.productId, tenantId: args.tenantId } }) : null,
    prisma.tenant.findUnique({ where: { id: args.tenantId }, select: { name: true, rfc: true } }),
    args.userId ? prisma.user.findFirst({ where: { id: args.userId, tenantId: args.tenantId }, select: { name: true, email: true, phone: true } }) : null,
  ]);
  const clienteId = args.clienteId ?? analisis?.clienteId ?? producto?.clienteId ?? null;
  const cliente = clienteId ? await prisma.cliente.findFirst({ where: { id: clienteId, tenantId: args.tenantId } }) : null;

  const tipo: TipoCertificador = args.certificadorTipo ?? 'exportador';
  const fraccion = (analisis?.fractionCode ?? producto?.fractionCode ?? '').replace(/[^0-9]/g, '');
  const hs6 = fraccion.slice(0, 6);
  const descripcion = analisis?.productDescription ?? producto?.description ?? '';
  const criterio = analisis ? criterioDeMetodo(analisis.qualifyingMethod, analisis.nonOriginatingValue) : 'C';
  const hoy = new Date();
  const fin = new Date(hoy); fin.setMonth(fin.getMonth() + 12); fin.setDate(fin.getDate() - 1);
  const contactoCert = [user?.name, user?.email, user?.phone].filter(Boolean).join(' · ');

  const elementos: ElementoCertificado[] = [
    { n: 1, nombre: NOMBRES_ELEMENTOS[0]!, valor: tipo, fuente: args.certificadorTipo ? 'usuario' : 'default', completo: true },
    { n: 2, nombre: NOMBRES_ELEMENTOS[1]!, valor: contactoCert ? `${contactoCert} (${tenant?.name ?? ''})` : '', fuente: contactoCert ? 'usuario' : 'manual', completo: !!user?.name && !!user?.email },
    { n: 3, nombre: NOMBRES_ELEMENTOS[2]!, valor: tenant?.name ? `${tenant.name}${tenant.rfc ? ` · RFC ${tenant.rfc}` : ''}` : '', fuente: tenant?.name ? 'tenant' : 'manual', completo: !!tenant?.name },
    { n: 4, nombre: NOMBRES_ELEMENTOS[3]!, valor: 'Disponible a solicitud de las autoridades importadoras', fuente: 'default', completo: true },
    { n: 5, nombre: NOMBRES_ELEMENTOS[4]!, valor: cliente ? `${cliente.razonSocial} · RFC ${cliente.rfc}${cliente.contactoEmail ? ` · ${cliente.contactoEmail}` : ''}` : '', fuente: cliente ? 'cliente' : 'manual', completo: !!cliente },
    { n: 6, nombre: NOMBRES_ELEMENTOS[5]!, valor: hs6 ? `${hs6.slice(0, 4)}.${hs6.slice(4)} — ${descripcion}` : descripcion, fuente: analisis ? 'analisis' : producto ? 'producto' : 'manual', completo: hs6.length === 6 && !!descripcion },
    { n: 7, nombre: NOMBRES_ELEMENTOS[6]!, valor: `${criterio} — ${PREFERENCE_LABELS[criterio]}`, fuente: analisis ? 'analisis' : 'default', completo: true },
    { n: 8, nombre: NOMBRES_ELEMENTOS[7]!, valor: `${hoy.toISOString().slice(0, 10)} a ${fin.toISOString().slice(0, 10)} (12 meses)`, fuente: 'default', completo: true },
    { n: 9, nombre: NOMBRES_ELEMENTOS[8]!, valor: user?.name ? `${user.name} — ${hoy.toISOString().slice(0, 10)}` : '', fuente: user?.name ? 'usuario' : 'manual', completo: !!user?.name },
  ];
  const faltantes = elementos.filter(e => !e.completo).map(e => `(${e.n}) ${e.nombre}`);
  const sugerido: CertificadoPrellenado['sugerido'] = {
    fractionCode: fraccion || '',
    productDescription: descripcion,
    exporterName: tenant?.name ?? '',
    exporterTaxId: tenant?.rfc ?? undefined,
    importerName: cliente?.razonSocial ?? undefined,
    importerTaxId: cliente?.rfc ?? undefined,
    producerName: 'Disponible a solicitud de las autoridades importadoras',
    originCountry: 'MX',
    preferenceCriterion: criterio,
    blanketPeriodFrom: hoy,
    blanketPeriodTo: fin,
    signedBy: user?.name ?? '',
    signedByRole: 'Representante legal',
    originAnalysisId: analisis?.id,
    certificador: { tipo, nombre: user?.name, correo: user?.email ?? undefined, telefono: user?.phone ?? undefined },
  };
  return { elementos, faltantes, sugerido, fundamento: 'T-MEC Anexo 5-A y Art. 5.2 (certificación de formato libre con 9 elementos mínimos; corpus LegalDocument "T-MEC Anexo 5-A, Cap. 5 (Art. 5.2)")' };
}

// ─────────────────────── Vista imprimible ───────────────────────

const PREFERENCE_LABELS_42: Record<string, string> = {
  A: 'A — Totalmente obtenida o producida enteramente en territorio de una o más Partes (Art. 4.3)',
  B: 'B — Producida enteramente en territorio de las Partes exclusivamente con materiales originarios',
  C: 'C — Producida con materiales no originarios que cumplen la regla específica del Anexo 4-B (cambio arancelario y/o VCR)',
  D: 'D — Materiales no originarios como partes sin cambio arancelario (misma subpartida/partida), con VCR ≥ 60% VT (Art. 4.5)',
  E: 'E — Excepción específica',
};

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
  const { role, certificador, numeroFactura } = decodificarCertificador(cert.signedByRole);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(verifyUrl)}`;
  const hs = cert.fractionCode.replace(/[^0-9]/g, '');
  const hs6 = hs.length >= 6 ? `${hs.slice(0, 4)}.${hs.slice(4, 6)}` : cert.fractionCode;
  const periodo = cert.blanketPeriodFrom && cert.blanketPeriodTo
    ? `${cert.blanketPeriodFrom.toISOString().slice(0, 10)} a ${cert.blanketPeriodTo.toISOString().slice(0, 10)}`
    : `Embarque único${numeroFactura ? ` — factura ${numeroFactura}` : ''}`;
  const tipoCert = certificador?.tipo ?? 'exportador';
  const certDatos = certificador
    ? [certificador.nombre, certificador.cargo, certificador.direccion, certificador.telefono, certificador.correo].filter(Boolean).map(x => e(x)).join(' · ')
    : `${e(cert.signedBy)} · ${e(role)}`;
  const party = (h: string, name: string | null, addr: string | null, tax: string | null) => `<div class="party"><h3>${h}</h3><p class="name">${e(name ?? '—')}</p>${addr ? `<p>${e(addr)}</p>` : ''}${tax ? `<p>RFC/Tax ID: ${e(tax)}</p>` : ''}</div>`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Certificación de Origen T-MEC — ${e(cert.certificateNumber)}</title>
<style>
@page { size: letter; margin: 1.5cm; }
body { font-family: Georgia, "Times New Roman", serif; color: #1f2937; line-height: 1.45; max-width: 760px; margin: 0 auto; padding: 24px; background: #fff; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #059669; padding-bottom: 16px; margin-bottom: 18px; }
.brand { font-size: 24px; font-weight: 700; color: #064e3b; letter-spacing: -1px; }
.brand-sub { font-size: 11px; color: #4b5563; margin-top: 2px; }
.cert-id { text-align: right; font-size: 11px; color: #4b5563; }
.cert-id strong { color: #064e3b; font-size: 13px; display: block; font-family: monospace; }
h1 { font-size: 17px; text-align: center; text-transform: uppercase; letter-spacing: 1.5px; margin: 14px 0 16px; }
.elem { display: grid; grid-template-columns: 34px 1fr; gap: 10px; border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 12px; margin-bottom: 8px; page-break-inside: avoid; }
.elem .n { font-weight: 700; color: #047857; font-size: 16px; }
.elem h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin: 0 0 4px; }
.elem p { font-size: 12px; margin: 1px 0; }
.elem .name { font-weight: 700; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.party { border: 1px solid #e5e7eb; padding: 8px 10px; border-radius: 4px; }
.party h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin: 0 0 4px; }
.party p { font-size: 12px; margin: 1px 0; }
.party .name { font-weight: 700; }
.criterion { background: #ecfdf5; border-left: 4px solid #059669; }
.criterion .code { font-size: 24px; font-weight: 700; color: #064e3b; line-height: 1; }
.declaration { font-size: 11.5px; text-align: justify; margin: 8px 0; line-height: 1.55; }
.signature-area { display: flex; gap: 24px; align-items: flex-end; margin-top: 14px; }
.signature { flex: 1; }
.signature .line { border-top: 1px solid #111827; margin-top: 48px; padding-top: 4px; }
.signature .name { font-size: 12px; font-weight: 600; }
.signature .role { font-size: 10px; color: #4b5563; }
.qr-block { text-align: center; }
.qr-block img { width: 100px; height: 100px; }
.qr-block p { font-size: 9px; color: #6b7280; margin: 4px 0 0; max-width: 110px; }
.footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9.5px; color: #6b7280; }
.footer .hash { font-family: monospace; word-break: break-all; }
.disclaimer { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 12px; margin-top: 12px; font-size: 10.5px; color: #92400e; }
.print-btn { position: fixed; top: 12px; right: 12px; font: 600 12px system-ui, sans-serif; background: #064e3b; color: #fff; border: 0; border-radius: 999px; padding: 8px 14px; cursor: pointer; }
@media print { body { padding: 0; } .print-btn { display: none; } a { color: inherit; text-decoration: none; } }
</style></head>
<body>
<button class="print-btn" onclick="window.print()">Imprimir / Guardar PDF</button>
<div class="header">
  <div>
    <div class="brand">CERTIFICACIÓN DE ORIGEN</div>
    <div class="brand-sub">TRATADO ENTRE MÉXICO, ESTADOS UNIDOS Y CANADÁ — T-MEC / USMCA / CUSMA · Anexo 5-A (formato libre, 9 elementos mínimos)</div>
  </div>
  <div class="cert-id">
    Folio<strong>${e(cert.certificateNumber)}</strong>
    Emitido: ${cert.signedDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
  </div>
</div>

<h1>Certificación de Origen</h1>

<div class="elem"><div class="n">1</div><div><h3>Quién certifica</h3><p class="name">${e(tipoCert.charAt(0).toUpperCase() + tipoCert.slice(1))}</p><p>Conforme al Art. 5.2 del T-MEC, la certificación la emite el exportador, el productor o el importador.</p></div></div>
<div class="elem"><div class="n">2</div><div><h3>Certificador</h3><p class="name">${certDatos || '—'}</p></div></div>
<div class="elem"><div class="n">3</div><div><h3>Exportador</h3><div class="grid2">${party('Datos', cert.exporterName, cert.exporterAddress, cert.exporterTaxId)}</div></div></div>
<div class="elem"><div class="n">4</div><div><h3>Productor</h3><div class="grid2">${party('Datos', cert.producerName ?? 'Disponible a solicitud de las autoridades importadoras', cert.producerAddress, cert.producerTaxId)}</div></div></div>
<div class="elem"><div class="n">5</div><div><h3>Importador</h3><div class="grid2">${party('Datos', cert.importerName, cert.importerAddress, cert.importerTaxId)}</div></div></div>
<div class="elem"><div class="n">6</div><div><h3>Descripción y clasificación arancelaria (SA 6 dígitos)</h3><p class="name" style="font-family:monospace">${e(hs6)}${hs.length > 6 ? ` <span style="font-weight:400;color:#6b7280">(fracción nacional ${e(hs)})</span>` : ''}</p><p>${e(cert.productDescription)}</p>${numeroFactura ? `<p>Factura: ${e(numeroFactura)}</p>` : ''}<p>País de origen declarado: <strong>${e(cert.originCountry)}</strong></p></div></div>
<div class="elem criterion"><div class="n">7</div><div><h3>Criterio de origen (Art. 4.2)</h3><p class="code">${e(cert.preferenceCriterion)}</p><p>${e(PREFERENCE_LABELS_42[cert.preferenceCriterion] ?? cert.preferenceCriterion)}</p></div></div>
<div class="elem"><div class="n">8</div><div><h3>Periodo global</h3><p class="name">${e(periodo)}</p><p>Múltiples embarques de mercancías idénticas: hasta 12 meses.</p></div></div>
<div class="elem"><div class="n">9</div><div><h3>Firma autorizada y fecha</h3>
<p class="declaration">Certifico que las mercancías descritas en este documento califican como originarias y que la información contenida en este documento es verdadera y exacta. Me hago responsable de comprobar lo declarado y de conservar y presentar, a solicitud, la documentación que respalde esta certificación, así como de notificar por escrito a todas las personas a quienes se haya entregado cualquier cambio que afecte su exactitud o validez.</p>
<div class="signature-area">
  <div class="signature"><div class="line"></div><p class="name">${e(cert.signedBy)}</p><p class="role">${e(role)}</p><p class="role">Fecha: ${cert.signedDate.toLocaleDateString('es-MX')}</p></div>
  <div class="qr-block"><img src="${e(qrUrl)}" alt="QR verificación"><p>Verificar autenticidad</p></div>
</div></div></div>

<div class="disclaimer">
  Certificación de formato libre (Anexo 5-A T-MEC): no requiere validación de autoridad, cámara o agente. La autoridad puede verificar el origen conforme al Art. 5.9. Conservar la documentación soporte por mínimo 5 años.
</div>

<div class="footer">
  <p>ADUANAI · Folio ${e(cert.certificateNumber)} · emitido digitalmente ${cert.signedDate.toISOString()}</p>
  <p class="hash">Hash de integridad (SHA-256): ${e(cert.contentHash ?? '—')}</p>
  <p>Verificable en: <a href="${e(verifyUrl)}">${e(verifyUrl)}</a></p>
</div>
</body></html>`;
}
