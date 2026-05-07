/**
 * Evaluador de excepciones del Anexo 2.4.1 del Acuerdo de NOMs.
 *
 * Recibe:
 *   - lista de NOMs aplicables a la fracción
 *   - contexto declarado por el usuario (IMMEX, automotriz, muestra, etc.)
 *
 * Devuelve por NOM:
 *   - si aplica una excepción del Anexo 2.4.1
 *   - documento requerido para aprovecharla
 *   - mensaje listo para mostrar al usuario
 *   - acciones requeridas si NO aplica excepción
 */

import { prisma } from '../lib/prisma';

export interface NOMOperationContext {
  /** Importación al amparo de programa IMMEX */
  immex?: boolean;
  /** Insumo productivo (no consumidor final tal cual) */
  productive?: boolean;
  /** Destinada al consumidor final */
  consumerFinal?: boolean;
  /** Industria automotriz terminal o manufacturera de vehículos */
  automotive?: boolean;
  /** Maquinaria o equipo industrial para activo fijo */
  industrialEquipment?: boolean;
  /** Uso propio del importador (no reventa) */
  ownUse?: boolean;
  /** Cantidad mínima para uso personal */
  personalUse?: boolean;
  /** Muestra sin valor comercial */
  samples?: boolean;
  /** Importada para reparación y retornar */
  repair?: boolean;
  /** Retorno al extranjero después del proceso */
  reExport?: boolean;
  /** Importación gubernamental */
  governmentImport?: boolean;
  /** Etiquetado en territorio nacional antes de comercializar */
  willLabelInMexico?: boolean;
  /** Exhibición en feria / exposición */
  fair?: boolean;
}

export interface NOMExceptionMatch {
  exceptionId: string;
  exceptionCode: string;
  fraction: string;
  description: string;
  requiredDoc: string | null;
  legalBasis: string | null;
}

export interface NOMEvaluation {
  nomCode: string;
  authority: string;
  description: string;
  required: boolean;
  /** Si aplica una excepción del 2.4.1 */
  exception: NOMExceptionMatch | null;
  /** Acciones requeridas (etiquetado, dictamen, holograma) si NO aplica excepción */
  fullComplianceRequirements: string[] | null;
  /** Mensaje pre-formateado para UI */
  message: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
}

const FULL_COMPLIANCE_DEFAULT = [
  'Etiquetado en español en punto de entrada (información comercial completa)',
  'Dictamen de Unidad de Verificación acreditada ante EMA',
  'Holograma o sello de cumplimiento NOM',
];

const SEG_FULL_COMPLIANCE = [
  'Certificado de cumplimiento NOM emitido por organismo acreditado',
  'Pruebas de laboratorio acreditado (EMA)',
  'Etiquetado y manuales en español',
  'Holograma de cumplimiento NOM en cada unidad',
];

interface NOMInput {
  code: string;            // ej "NOM-008-SCFI-2002"
  authority?: string;      // "SE", "SCFI", "SSA1"
  description?: string;
}

/** Determina si una NOM tiene scope de SEGURIDAD por su nomenclatura */
function detectScope(nomCode: string): 'INFO' | 'SEG' {
  // Heurística: NOMs de seguridad usan ramas SCT, ENER, NOM-EM, sufijo -SE para escolares,
  // o están en el rango clásico de seguridad eléctrica (003, 016, 058, 064, 086, 220).
  const segPatterns = [
    /NOM-220-SE/i,        // juguetes
    /NOM-016-CRE/i,       // hidrocarburos
    /NOM-003-SCFI/i,      // seguridad eléctrica residencial
    /NOM-058-SCFI/i,      // seguridad eléctrica industrial
    /NOM-064-SCFI/i,      // herramientas eléctricas
    /NOM-086-SCFI/i,      // seguridad de juguetes
    /NOM-001-SEDE/i,      // instalaciones eléctricas
    /-SCT/i,
  ];
  return segPatterns.some(p => p.test(nomCode)) ? 'SEG' : 'INFO';
}

/**
 * Verifica si las condiciones de una excepción se cumplen contra el contexto.
 * Reglas:
 *   - `_denyAll: true`  → la excepción nunca aplica (NOM de seguridad)
 *   - cualquier flag con valor `false` requerido → debe coincidir con context flag = false
 *   - cualquier flag con valor `true` requerido → debe coincidir con context flag = true
 *   - flag no presente en conditions → no se evalúa
 */
function conditionsMatch(conditions: Record<string, unknown>, ctx: NOMOperationContext): boolean {
  if (conditions._denyAll === true) return false;
  for (const [k, v] of Object.entries(conditions)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'boolean') {
      const actual = (ctx as unknown as Record<string, boolean | undefined>)[k];
      if (actual !== v) return false;
    }
  }
  return true;
}

export async function evaluateNOMs(
  noms: NOMInput[],
  context: NOMOperationContext,
): Promise<NOMEvaluation[]> {
  if (noms.length === 0) return [];

  const allExceptions = await prisma.nOMException.findMany({
    where: { active: true },
  });

  const evals: NOMEvaluation[] = [];

  for (const nom of noms) {
    const scope = detectScope(nom.code);

    // 1) Excepciones específicas a este NOM
    const specific = allExceptions.filter(e => e.nomCode === nom.code);
    // 2) Genéricas que aplican al scope (INFO/SEG/ALL)
    const generic = allExceptions.filter(e =>
      !e.nomCode && (e.nomScope === 'ALL' || e.nomScope === scope || (!e.nomScope && scope === 'INFO')),
    );

    // Buscar primera excepción cuyas condiciones se cumplan, priorizando específicas
    const candidates = [...specific, ...generic];
    const matched = candidates.find(e => conditionsMatch(e.conditions as Record<string, unknown>, context));

    let evaluation: NOMEvaluation;

    if (matched && (matched.conditions as Record<string, unknown>)._denyAll !== true) {
      evaluation = {
        nomCode: nom.code,
        authority: nom.authority ?? 'SE',
        description: nom.description ?? '',
        required: true,
        exception: {
          exceptionId: matched.id,
          exceptionCode: matched.exceptionCode,
          fraction: matched.fraction,
          description: matched.description,
          requiredDoc: matched.requiredDoc,
          legalBasis: matched.legalBasis,
        },
        fullComplianceRequirements: null,
        severity: 'info',
        message: `✅ ${nom.code} aplica al producto, PERO se exceptúa por ${matched.exceptionCode}` +
          (matched.requiredDoc ? `. Documento requerido: ${matched.requiredDoc}.` : '.'),
      };
    } else {
      // Sin excepción aplicable — debe cumplirse en su totalidad
      const requirements = scope === 'SEG' ? SEG_FULL_COMPLIANCE : FULL_COMPLIANCE_DEFAULT;
      evaluation = {
        nomCode: nom.code,
        authority: nom.authority ?? 'SE',
        description: nom.description ?? '',
        required: true,
        exception: null,
        fullComplianceRequirements: requirements,
        severity: scope === 'SEG' ? 'critical' : 'warning',
        message: scope === 'SEG'
          ? `🚨 ${nom.code} (NOM de seguridad) aplica completamente — sin excepción posible. Cumplimiento obligatorio.`
          : `⚠️ ${nom.code} aplica completamente al producto con el contexto declarado. Revisa requisitos antes del despacho.`,
      };
    }

    evals.push(evaluation);
  }

  return evals;
}

// ──────────────────────────────────────────────────────────────────────────
// Generador de Carta de No Comercialización (HTML imprimible)
// ──────────────────────────────────────────────────────────────────────────

export interface CartaNoComercializacionInput {
  // Datos importador
  empresa: string;
  rfc: string;
  immexNumber?: string;
  domicilioFiscal?: string;
  representanteLegal: string;
  representanteCargo?: string;

  // Producto
  fractionCode: string;
  productDescription: string;
  noms: string[];

  // Contexto
  destination: string; // ej "insumo productivo para ensamble"

  // Excepción aplicada
  exceptionCode: string;
}

const escapeHTML = (s: string) =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function generateCartaNoComercializacionHTML(input: CartaNoComercializacionInput): string {
  const today = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const e = escapeHTML;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Carta de No Comercialización — ${e(input.empresa)}</title>
<style>
  @page { size: letter; margin: 2cm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1f2937; line-height: 1.6; max-width: 720px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 18px; text-align: center; margin: 24px 0 16px; letter-spacing: 1px; text-transform: uppercase; }
  .header { text-align: right; font-size: 13px; color: #4b5563; margin-bottom: 32px; }
  .header strong { color: #111827; }
  table.data { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  table.data th { text-align: left; background: #f3f4f6; padding: 8px 10px; border: 1px solid #d1d5db; font-weight: 600; width: 35%; }
  table.data td { padding: 8px 10px; border: 1px solid #d1d5db; }
  p { margin: 12px 0; text-align: justify; font-size: 13px; }
  .declaration { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0; font-size: 13px; }
  .signature { margin-top: 64px; text-align: center; }
  .signature .line { border-top: 1px solid #111827; width: 320px; margin: 56px auto 8px; }
  .signature .name { font-weight: 600; }
  .signature .role { font-size: 12px; color: #4b5563; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; text-align: center; }
  .legal { font-size: 11px; color: #6b7280; margin-top: 16px; }
  @media print { body { padding: 0; } button { display: none; } }
</style>
</head>
<body>
<div class="header">
  <strong>${e(input.empresa)}</strong><br>
  RFC: ${e(input.rfc)}${input.immexNumber ? `<br>Programa IMMEX: ${e(input.immexNumber)}` : ''}<br>
  ${input.domicilioFiscal ? e(input.domicilioFiscal) + '<br>' : ''}
  ${today}
</div>

<h1>Carta de No Comercialización al Consumidor Final</h1>

<p>Por medio del presente, el suscrito <strong>${e(input.representanteLegal)}</strong>${input.representanteCargo ? `, en mi carácter de ${e(input.representanteCargo)}` : ''} de <strong>${e(input.empresa)}</strong>, con Registro Federal de Contribuyentes <strong>${e(input.rfc)}</strong>${input.immexNumber ? ` y programa IMMEX número <strong>${e(input.immexNumber)}</strong>` : ''}, manifiesto bajo protesta de decir verdad lo siguiente:</p>

<table class="data">
  <tr><th>Fracción arancelaria</th><td>${e(input.fractionCode)}</td></tr>
  <tr><th>Descripción del producto</th><td>${e(input.productDescription)}</td></tr>
  <tr><th>NOMs aplicables</th><td>${e(input.noms.join(', '))}</td></tr>
  <tr><th>Excepción invocada</th><td>${e(input.exceptionCode)}</td></tr>
  <tr><th>Destino declarado</th><td>${e(input.destination)}</td></tr>
</table>

<div class="declaration">
  <strong>DECLARACIÓN:</strong> La mercancía referida <strong>NO será comercializada al consumidor final</strong> en su estado actual. Será destinada exclusivamente a su uso como insumo productivo o para incorporarla a un proceso de transformación, elaboración o reparación, conforme al destino declarado.
</div>

<p>En consecuencia, y de conformidad con el <strong>${e(input.exceptionCode)}</strong> del Acuerdo que identifica las fracciones arancelarias de la Tarifa de la Ley de los Impuestos Generales de Importación y de Exportación en las cuales se clasifican las mercancías sujetas al cumplimiento de las Normas Oficiales Mexicanas, se solicita la dispensa del cumplimiento de información comercial en punto de entrada para las NOMs señaladas.</p>

<p>El importador se obliga a conservar la documentación que acredite el destino declarado por un plazo mínimo de cinco años, conforme al artículo 67 del Código Fiscal de la Federación, y a presentarla a las autoridades competentes cuando le sea requerida.</p>

<p class="legal">La presente declaración se emite con conocimiento de las sanciones aplicables en caso de declaración falsa, conforme a los artículos 184, 185 y 186 de la Ley Aduanera.</p>

<div class="signature">
  <div class="line"></div>
  <p class="name">${e(input.representanteLegal)}</p>
  <p class="role">${e(input.representanteCargo ?? 'Representante legal')}</p>
</div>

<div class="footer">
  Documento generado por ADUANAI — ${today}<br>
  Verificable mediante hash SHA-256 al imprimirse en pedimento.
</div>
</body>
</html>`;
}
