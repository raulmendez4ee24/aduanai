/**
 * RISK SCORER — Escudo de evidencia (dimensión B, docs/RISK_SCORER_DESIGN.md §3).
 * Checklist derivado de las obligaciones POSITIVAS vigentes (el Art. 54
 * reformado ya no tiene excluyentes — la defensa es 100% evidencia).
 * Las defensas NO restan exposición: son dimensión propia.
 */
import type { ShieldItem, Signals } from './types';

const LA = {
  fuente: 'Ley Aduanera consolidada (Última Reforma DOF 19-11-2025)',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
  fechaCotejo: '2026-07-04',
};
const RLA = {
  fuente: 'Reglamento de la Ley Aduanera reformado (DOF 23-02-2026)',
  url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5780677&fecha=23/02/2026',
  fechaCotejo: '2026-07-04',
};
const RGCE = {
  fuente: 'RGCE 2026 (DOF)',
  url: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf',
  fechaCotejo: '2026-07-04',
};
const LCE = {
  fuente: 'Ley de Comercio Exterior consolidada (Última Reforma DOF 01-05-2026)',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LCE.pdf',
  fechaCotejo: '2026-07-04',
};

const siempre = () => true;
const soloAgencia = (s: Signals) => s.tipoSujeto === 'agencia';

const EXP59V: { key: keyof NonNullable<Signals['declarado']['expediente59V']>; desc: string; accion: string }[] = [
  { key: 'a', desc: 'Garantía 36-A-I-e (cuenta aduanera, si el valor es inferior al precio estimado)', accion: 'Constituye y documenta la garantía en cuenta aduanera (si aplica precio estimado)' },
  { key: 'b', desc: 'Comprobantes fiscales digitales por Internet (CFDI)', accion: 'Integra los CFDI de la operación al expediente' },
  { key: 'c', desc: 'Facturas comerciales o documentos equivalentes', accion: 'Integra la factura comercial' },
  { key: 'd', desc: 'Transferencias electrónicas del pago o cartas de crédito', accion: 'Integra el comprobante de pago bancario' },
  { key: 'e', desc: 'Gastos de transporte, seguros y servicios conexos', accion: 'Integra facturas de flete/seguro/conexos' },
  { key: 'f', desc: 'Contratos y órdenes de compra de la transacción (RLA 81-VII)', accion: 'Integra contrato y, en su caso, órdenes de compra' },
  { key: 'g', desc: 'Soporte de incrementables/decrementables (Arts. 65-66 LA)', accion: 'Documenta cada concepto sumado o excluido del valor' },
  { key: 'h', desc: 'Otros que demuestren la operación — incluye notas de crédito/descuentos (RLA 81-X)', accion: 'Integra notas de crédito y documentos de descuentos especiales' },
];

export const SHIELD_ITEMS: ShieldItem[] = [
  ...EXP59V.map((it): ShieldItem => ({
    id: `ESC-59V-${it.key}`,
    grupo: 'Expediente 59-V',
    descripcion: it.desc,
    aplica: siempre,
    completo: s => s.declarado.expediente59V?.[it.key] ?? null,
    origenSenal: 'declarado',
    accionSugerida: it.accion,
    fundamento: { articulo: `LA 59-V inciso ${it.key}) (adicionado DOF 19-11-2025)`, citaCorta: 'Expediente electrónico con "la información y documentación que acredite los recursos empleados para efectuar la operación de comercio exterior".', ...LA },
  })),
  {
    id: 'ESC-KYC', grupo: 'KYC del cliente',
    descripcion: 'Expediente 162-VI: identidad, infraestructura, no-vinculación 69-B, cumplimiento fiscal del cliente',
    aplica: siempre,
    completo: s => s.declarado.expedienteKyc ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Integra el expediente de conocimiento del cliente y verifícalo contra el listado 69-B vigente',
    fundamento: { articulo: 'LA 162-VI, párrafos 2-3 (adicionados DOF 19-11-2025)', citaCorta: '"…deberán integrar y conservar un expediente con la información y documentación que acredite el cumplimiento de la obligación anterior y ponerlo a disposición de las autoridades…"', ...LA },
  },
  {
    id: 'ESC-162VII', grupo: 'Expediente del despacho',
    descripcion: 'Expediente 162-VII: pedimento + anexos + acuses, MVE original y encargo conferido archivados',
    aplica: siempre,
    completo: s => s.declarado.expediente162VII ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Completa el expediente electrónico del pedimento (incluye MVE original y acuse del encargo)',
    fundamento: { articulo: 'LA 162-VII', citaCorta: '"…deberá conservar el original de la manifestación de valor… así como copia del documento… que compruebe el encargo que se le hubiere conferido…"', ...LA },
  },
  {
    id: 'ESC-MVE', grupo: 'MVE',
    descripcion: 'Manifestación de Valor (formato E2) transmitida por Ventanilla Digital / entregada al agente',
    aplica: siempre,
    completo: s => s.declarado.mveTransmitida ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Solicita al importador transmitir el E2 y declararte autorizado para consultarlo (o su entrega digital)',
    fundamento: { articulo: 'RGCE 1.5.1', citaCorta: '"Transmitir a través de la Ventanilla Digital, el formato E2… En caso de no haber señalado al agente aduanal… este y sus modificaciones deberán entregarse en documento digital al agente aduanal…"', ...RGCE },
  },
  {
    id: 'ESC-81A', grupo: 'Control interno',
    descripcion: 'Procedimientos de control interno DOCUMENTADOS que cubren los expedientes 59-V, 162-VI y 162-VII',
    aplica: siempre,
    completo: s => s.declarado.controlInterno81A ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Documenta por escrito el procedimiento de integración/conservación de expedientes (RLA 81-A)',
    fundamento: { articulo: 'RLA 81-A (DOF 23-02-2026)', citaCorta: '"…deberán implementar procedimientos de control interno debidamente documentados, razonables y necesarios para obtener, proporcionar y conservar la información y documentación referida."', ...RLA },
  },
  {
    id: 'ESC-ORIGEN', grupo: 'Origen vs cuotas',
    descripcion: 'Prueba de origen distinto disponible (defensa LCE 66 cuando la fracción tiene cuota compensatoria)',
    aplica: s => !!s.verificado.cuotaActiva,
    completo: s => s.declarado.pruebaOrigenDistinto ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Obtén del importador la prueba de que el país de origen/procedencia es distinto al gravado (LCE 66)',
    fundamento: { articulo: 'LCE 66', citaCorta: '"…no estarán obligados a pagarla si prueban que el país de origen o procedencia es distinto al de las mercancías sujetas a cuota compensatoria."', ...LCE },
  },
  {
    id: 'ESC-ENCARGO', grupo: 'Encargo conferido',
    descripcion: 'Acuse del encargo conferido vigente para el RFC del importador',
    aplica: siempre,
    completo: s => s.declarado.encargoConferido ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Verifica el encargo conferido en el sistema del SAT antes del despacho',
    fundamento: { articulo: 'LA 59-III, párrafo 2', citaCorta: '"…el documento que compruebe el encargo conferido… Dicho documento deberá ser enviado en copia a la agencia aduanal o al agente aduanal para su correspondiente archivo…"', ...LA },
  },
  {
    id: 'ESC-235F', grupo: 'Agencia — MVE espejo', soloAgencia: true,
    descripcion: 'La agencia conserva los documentos del RLA 81 como parte de la MVE de sus operaciones',
    aplica: soloAgencia,
    completo: s => s.declarado.mveEspejoAgencia ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Establece el archivo de documentos 81 por operación a nivel agencia',
    fundamento: { articulo: 'RLA 235-F (DOF 23-02-2026)', citaCorta: '"…como parte de la manifestación de valor de las Mercancías, la agencia aduanal deberá conservar los documentos a que se refiere el artículo 81 de este Reglamento…"', ...RLA },
  },
  {
    id: 'ESC-235J', grupo: 'Agencia — 32-D', soloAgencia: true,
    descripcion: 'Constancia de cumplimiento fiscal (32-D CFF) de socios, administración y apoderado de la agencia',
    aplica: soloAgencia,
    completo: s => s.declarado.constancia32D ?? null,
    origenSenal: 'declarado',
    accionSugerida: 'Obtén la constancia 32-D positiva de socios/administración/apoderado',
    fundamento: { articulo: 'RLA 235-J (DOF 23-02-2026)', citaCorta: '"…acreditarán que están al corriente de sus obligaciones fiscales, mediante la constancia de cumplimiento… referida en el último párrafo del artículo 32-D del Código Fiscal de la Federación."', ...RLA },
  },
];
