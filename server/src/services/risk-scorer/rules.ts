/**
 * RISK SCORER — las 26 reglas selladas v1 (docs/RISK_SCORER_DESIGN.md §2).
 *
 * Cada regla es DATO + función pura determinista. El fundamento de cada una
 * proviene de docs/RISK_SCORER_LEGAL.md (cotejo verbatim contra fuente
 * oficial, fechas indicadas). Las reglas NO viven en BD: se versionan aquí
 * (RULES_VERSION) y cada RiskAssessment persiste la versión usada.
 */
import type { RiskRule, Signals } from './types';
import { e2Exigible, PRORROGA_E2 } from './vigencias';

export const RULES_VERSION = 'v1.3.0-2026-08-25';

const LA = {
  fuente: 'Ley Aduanera consolidada (Última Reforma DOF 19-11-2025)',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
  fechaCotejo: '2026-07-04',
};
const RGCE = {
  fuente: 'RGCE 2026 (DOF, texto íntegro)',
  url: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf',
  fechaCotejo: '2026-07-04',
};
const CFF = {
  fuente: 'Código Fiscal de la Federación consolidado (Última Reforma DOF 09-04-2026)',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf',
  fechaCotejo: '2026-07-04',
};
const LCE = {
  fuente: 'Ley de Comercio Exterior consolidada (Última Reforma DOF 01-05-2026)',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LCE.pdf',
  fechaCotejo: '2026-07-04',
};
const RLA = {
  fuente: 'Reglamento de la Ley Aduanera reformado (DOF 23-02-2026)',
  url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5780677&fecha=23/02/2026',
  fechaCotejo: '2026-07-04',
};
const ANEXO10 = {
  fuente: 'Anexo 10 RGCE 2026 (DOF 14-01-2026)',
  url: 'https://www.sat.gob.mx/minisitio/PadronImportadoresExportadores/documentos/DOF_20260114_RGCE-2026_Anexo-10_Fraccion-I.pdf',
  fechaCotejo: '2026-07-03',
};
const DECRETO_TASAS = {
  fuente: 'Decreto de reforma de tasas LIGIE (DOF 29-12-2025)',
  url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5777376&fecha=29/12/2025',
  fechaCotejo: '2026-07-04',
};

// helper: checklist declarativo — true = cumplido; false O sin responder = riesgo
const noConfirmado = (v: boolean | null | undefined) => v !== true;

export const RISK_RULES: RiskRule[] = [
  // ══ F1 · VALOR (peso v1: 24) ══════════════════════════════════════════
  {
    id: 'F1-VAL-01', factor: 'VALOR', maxPuntos: 12, origenSenal: 'declarado',
    descripcion: 'Valor declarado bajo respecto de mercancías idénticas/similares (umbral de embargo: inferior en 50% o más)',
    evaluar: (s: Signals) => {
      const v = s.operacion.valorUnitario;
      if (v === undefined || v === null) return 4; // sin valor declarado: riesgo medio por opacidad
      return 0; // sin referencia externa v1: la señal fuerte llega con precios estimados (Fase 2)
    },
    fundamento: { articulo: 'LA 151-VII', citaCorta: '"Cuando el valor declarado en el pedimento sea inferior en un 50% o más al valor de transacción de mercancías idénticas o similares… salvo que se haya otorgado la garantía… 86-A."', ...LA },
  },
  {
    id: 'F1-VAL-02', factor: 'VALOR', maxPuntos: 8, origenSenal: 'declarado',
    descripcion: `Manifestación de valor (formato E2) no transmitida por Ventanilla Digital (exigible a partir del día siguiente al ${PRORROGA_E2.prorrogaHasta} — ${PRORROGA_E2.etiqueta}; durante la prórroga del Transitorio Décimo Primero reformado no puntúa. Último plazo en DOF: ${PRORROGA_E2.plazoDOF.prorrogaHasta})`,
    evaluar: s => {
      const exigible = s.fechaEvaluacion ? e2Exigible(s.fechaEvaluacion) : true;
      return exigible && noConfirmado(s.declarado.mveTransmitida) ? 8 : 0;
    },
    fundamento: {
      articulo: 'LA 59-III + RGCE 1.5.1 + Transitorio Décimo Primero RGCE 2026 (reformado)',
      citaCorta: `"Transmitir a través de la Ventanilla Digital, el formato E2 'Manifestación de Valor'… por cada operación de comercio exterior." Transitorio reformado: "${PRORROGA_E2.textoTransitorio}"`,
      fuente: `${RGCE.fuente}; ${PRORROGA_E2.instrumento} (${PRORROGA_E2.etiqueta}); fundamento de efectos: ${PRORROGA_E2.fundamentoEfectos.regla}. Último plazo en DOF: ${PRORROGA_E2.plazoDOF.prorrogaHasta} (${PRORROGA_E2.plazoDOF.instrumento}, DOF ${PRORROGA_E2.plazoDOF.dofFecha})`,
      url: PRORROGA_E2.urlOficial,
      fechaCotejo: PRORROGA_E2.fechaCotejo,
    },
  },
  {
    id: 'F1-VAL-03', factor: 'VALOR', maxPuntos: 4, origenSenal: 'declarado',
    descripcion: 'Incrementables (transporte, seguros, regalías, envases) sin soporte documental',
    evaluar: s => (noConfirmado(s.declarado.incrementablesConSoporte) ? 4 : 0),
    fundamento: { articulo: 'LA 65 + RLA 81-VIII', citaCorta: 'LA 65: incrementables "sobre la base de datos objetivos y cuantificables"; RLA 81-VIII: documentos "que soporten los conceptos incrementables".', ...RLA },
  },
  {
    id: 'F1-VAL-04', factor: 'VALOR', maxPuntos: 6, origenSenal: 'declarado',
    descripcion: 'Proveedor en el extranjero no localizable o con datos dudosos',
    evaluar: s => (s.declarado.proveedorLocalizable === false ? 6 : 0),
    fundamento: { articulo: 'LA 151-VI', citaCorta: '"…el nombre… o domicilio del proveedor en el extranjero… sean falsos o inexistentes o cuando en el domicilio señalado, no se pueda localizar al proveedor…" (embargo precautorio).', ...LA },
  },
  {
    id: 'F1-VAL-05', factor: 'VALOR', maxPuntos: 4, origenSenal: 'declarado',
    descripcion: 'Pago del precio sin soporte bancario (transferencias/cartas de crédito)',
    evaluar: s => (noConfirmado(s.declarado.pagoConSoporteBancario) ? 4 : 0),
    fundamento: { articulo: 'LA 59-V-d + RLA 81-IV', citaCorta: 'Expediente 59-V: "d) Las transferencias electrónicas del pago o cartas de crédito" (adicionado DOF 19-11-2025).', ...LA },
  },

  // ══ F2 · PERFIL IMPORTADOR (peso v1: 22) ══════════════════════════════
  {
    id: 'F2-PER-01', factor: 'PERFIL', maxPuntos: 22, bandera: 'LISTADO_69B', origenSenal: 'verificado',
    descripcion: 'Importador en el listado DEFINITIVO del Art. 69-B CFF (operaciones inexistentes)',
    senalDisponible: s => s.verificado.en69B !== undefined && s.verificado.lista69BDisponible === true,
    motivoNoDisponible: 'Lista 69-B sin ingesta o con corte vencido (>30 días): la señal no se evalúa y no afecta el score.',
    evaluar: s => (s.verificado.en69B?.situacion === 'DEFINITIVO' ? 22 : 0),
    fundamento: { articulo: 'CFF 69-B, párrafo 4', citaCorta: '"…se publicará un listado… de los contribuyentes que no hayan desvirtuado los hechos… y, por tanto, se encuentran definitivamente en la situación a que se refiere el primer párrafo…"', ...CFF },
  },
  {
    id: 'F2-PER-02', factor: 'PERFIL', maxPuntos: 10, origenSenal: 'verificado',
    descripcion: 'Importador en el listado de PRESUNTOS del Art. 69-B CFF',
    senalDisponible: s => s.verificado.en69B !== undefined && s.verificado.lista69BDisponible === true,
    motivoNoDisponible: 'Lista 69-B sin ingesta o con corte vencido (>30 días): la señal no se evalúa y no afecta el score.',
    evaluar: s => (s.verificado.en69B?.situacion === 'PRESUNTO' ? 10 : 0),
    fundamento: { articulo: 'CFF 69-B, párrafos 1-2', citaCorta: '"…se presumirá la inexistencia de las operaciones amparadas en tales comprobantes… procederá a notificar… mediante publicación en el Diario Oficial de la Federación…"', ...CFF },
  },
  {
    id: 'F2-PER-03', factor: 'PERFIL', maxPuntos: 8, origenSenal: 'declarado',
    descripcion: 'Sin expediente de conocimiento del cliente (KYC) del Art. 162-VI',
    evaluar: s => (noConfirmado(s.declarado.expedienteKyc) ? 8 : 0),
    fundamento: { articulo: 'LA 162-VI, párrafos 2-3 (adicionados DOF 19-11-2025)', citaCorta: '"…cerciorarse de que los usuarios… se encuentren plenamente identificados, que cuenten con infraestructura, que no tengan vinculación… con contribuyentes… en el listado… 69-B… deberán integrar y conservar un expediente…"', ...LA },
  },
  {
    id: 'F2-PER-04', factor: 'PERFIL', maxPuntos: 6, origenSenal: 'declarado',
    descripcion: 'Causal visible de suspensión del Padrón de Importadores (RGCE 1.3.3: no localizado, inactividad >12 meses, documentación faltante…)',
    evaluar: s => (s.declarado.causalSuspensionPadron === true ? 6 : 0),
    fundamento: { articulo: 'RGCE 1.3.3', citaCorta: 'Causales de suspensión: "IX. No sean localizados en su domicilio fiscal…; X. El nombre… del proveedor en el extranjero… sean falsos…; XI. Presenten documentación falsa…"', ...RGCE },
  },
  {
    id: 'F2-PER-05', factor: 'PERFIL', maxPuntos: 4, origenSenal: 'declarado',
    descripcion: 'Vinculación del agente/agencia con el cliente (socio, accionista, relación laboral)',
    evaluar: s => (s.declarado.vinculacionConCliente === true ? 4 : 0),
    fundamento: { articulo: 'LA 160-XIII (adicionada DOF 19-11-2025)', citaCorta: '"No ser socio, accionista, representante legal, tener una relación laboral o vinculación… con alguna persona para la cual tramite operaciones de comercio exterior." (inhabilita para operar)', ...LA },
  },

  // ══ F3 · CUOTAS COMPENSATORIAS (peso v1: 12) ══════════════════════════
  {
    id: 'F3-CUO-01', factor: 'CUOTAS', maxPuntos: 8, origenSenal: 'verificado',
    descripcion: 'Fracción con cuota compensatoria activa para el país de origen declarado',
    senalDisponible: s => s.verificado.cuotaActiva !== undefined,
    evaluar: s => (s.verificado.cuotaActiva ? 8 : 0),
    fundamento: { articulo: 'LCE 62 + LA 176-I/178-I', citaCorta: 'LA 178-I: "Multa del 130% al 150% de los impuestos al comercio exterior omitidos"; LA 151-II: embargo cuando "se omita el pago de cuotas compensatorias".', ...LCE },
  },
  {
    id: 'F3-CUO-02', factor: 'CUOTAS', maxPuntos: 4, origenSenal: 'declarado',
    descripcion: 'Ruta compatible con elusión (ensamble/ajuste menor en tercer país sobre mercancía sujeta a cuota)',
    evaluar: s => (s.declarado.rutaTercerPaisEnsamblador === true ? 4 : 0),
    fundamento: { articulo: 'LCE 89 B, fracciones II-III', citaCorta: '"II. La introducción… de mercancías sujetas a cuota… con insumos, piezas o componentes integrados o ensamblados en un tercer país; III. …con diferencias relativamente menores…"', ...LCE },
  },
  {
    id: 'F3-CUO-03', factor: 'CUOTAS', maxPuntos: 4, origenSenal: 'declarado',
    descripcion: 'Sin prueba de origen distinto teniendo la fracción cuota activa (defensa LCE 66 no disponible)',
    evaluar: s => (s.verificado.cuotaActiva && noConfirmado(s.declarado.pruebaOrigenDistinto) ? 4 : 0),
    fundamento: { articulo: 'LCE 66 + LA 59-II', citaCorta: 'LCE 66: los importadores "no estarán obligados a pagarla si prueban que el país de origen o procedencia es distinto al de las mercancías sujetas a cuota compensatoria".', ...LCE },
  },

  // ══ F4 · PADRONES SECTORIALES (peso v1: 10) ═══════════════════════════
  {
    id: 'F4-PAD-01', factor: 'PADRONES', maxPuntos: 8, origenSenal: 'mixto',
    descripcion: 'La fracción exige sector del Anexo 10 que el importador no tiene activo',
    senalDisponible: s => s.verificado.sectoresRequeridos !== undefined,
    evaluar: s => {
      const req = s.verificado.sectoresRequeridos ?? [];
      if (req.length === 0) return 0;
      const activos = new Set(s.declarado.padronesActivos ?? []);
      return req.some(sec => !activos.has(sec)) ? 8 : 0;
    },
    fundamento: { articulo: 'LA 59-IV + RGCE 1.3.2 + LA 176-XIII', citaCorta: 'RGCE 1.3.2: quienes "requieran introducir alguna de las mercancías señaladas en la fracción I del Anexo 10… deberán presentar su solicitud" del sector; LA 176-XIII (adicionada 19-11-2025): omitir obligaciones del 59 = infracción.', ...ANEXO10 },
  },
  {
    id: 'F4-PAD-02', factor: 'PADRONES', maxPuntos: 4, origenSenal: 'declarado',
    descripcion: 'Padrón de Importadores general no vigente o en riesgo de suspensión',
    evaluar: s => (s.declarado.padronImportadoresVigente === false ? 4 : 0),
    fundamento: { articulo: 'LA 59-IV', citaCorta: '"Estar inscritos en el Padrón de Importadores… para lo cual deberán encontrarse al corriente en el cumplimiento de sus obligaciones fiscales…"', ...LA },
  },

  // ══ F5 · TEMPORALES (peso v1: 10) ═════════════════════════════════════
  {
    id: 'F5-TMP-01', factor: 'TEMPORALES', maxPuntos: 6, origenSenal: 'verificado',
    descripcion: 'Importaciones temporales fuera del domicilio registrado/declarado',
    // La señal del supuesto 151-VIII no es derivable en v1.
    senalDisponible: () => false,
    evaluar: s => ((s.verificado.temporalesFueraDomicilio ?? 0) > 0 ? 6 : 0),
    fundamento: { articulo: 'LA 151-VIII (adicionada DOF 19-11-2025)', citaCorta: '"Cuando se trate de mercancías importadas temporalmente y éstas no se dirijan a los domicilios registrados, o a los declarados en los pedimentos, o bien, no se localicen en dichos domicilios." (embargo precautorio)', ...LA },
  },
  {
    id: 'F5-TMP-02', factor: 'TEMPORALES', maxPuntos: 4, origenSenal: 'verificado',
    descripcion: 'Temporales próximas a vencer (≤30 días) o vencidas sin descargo',
    senalDisponible: s => s.verificado.temporalesPorVencer !== undefined,
    evaluar: s => ((s.verificado.temporalesPorVencer ?? 0) > 0 ? 4 : 0),
    fundamento: { articulo: 'LA 177-III', citaCorta: 'Presunción de infracción cuando la IMMEX "no acredite que las mercancías fueron retornadas al extranjero, se destinaron a otro régimen… o que se encuentran en el domicilio…"', ...LA },
  },
  {
    id: 'F5-TMP-03', factor: 'TEMPORALES', maxPuntos: 2, origenSenal: 'declarado',
    descripcion: 'Operación con transferencias de mercancía importada temporalmente',
    evaluar: s => (s.declarado.transferenciaDeTemporales === true ? 2 : 0),
    fundamento: { articulo: 'LA 53-X (reformada DOF 19-11-2025)', citaCorta: 'Responsables solidarios: "Los que transfieran mercancías importadas temporalmente…, sin importar que éstas se transfieran una o más veces."', ...LA },
  },

  // ══ F6 · CLASIFICACIÓN (peso v1: 8) ═══════════════════════════════════
  {
    id: 'F6-CLA-01', factor: 'CLASIFICACION', maxPuntos: 5, origenSenal: 'verificado',
    descripcion: 'Fracción inexistente/inactiva en el catálogo, o discrepante del Clasificador validado',
    // Evalúa DOS señales; la disponibilidad refleja ambas (25-ago): antes una
    // señal parcial (coincidencia sin validez) puntuaba mal-etiquetada.
    senalDisponible: s => s.verificado.fraccionValida !== undefined || s.verificado.fraccionClasificadorCoincide != null,
    evaluar: s => {
      if (s.verificado.fraccionValida === false) return 5;
      if (s.verificado.fraccionClasificadorCoincide === false) return 3;
      return 0;
    },
    fundamento: { articulo: 'LA 54 (reformado DOF 19-11-2025)', citaCorta: '"El agente aduanal y la agencia aduanal serán responsables… de su correcta clasificación arancelaria y de la exacta determinación del número de identificación comercial…"', ...LA },
  },
  {
    id: 'F6-CLA-02', factor: 'CLASIFICACION', maxPuntos: 3, origenSenal: 'verificado',
    descripcion: 'Fracción reformada por el decreto de tasas DOF 29-12-2025 (agravante: omisión potencial mayor)',
    senalDisponible: s => s.verificado.fraccionEnDecretoTasas !== null && s.verificado.fraccionEnDecretoTasas !== undefined,
    evaluar: s => (s.verificado.fraccionEnDecretoTasas === true ? 3 : 0),
    fundamento: { articulo: 'Decreto DOF 29-12-2025 + LA 178-I', citaCorta: 'Decreto que "modifica los aranceles de diversas fracciones… en sectores estratégicos" (vigor 01-01-2026); la multa del 178-I (130%-150%) se calcula sobre lo omitido.', ...DECRETO_TASAS },
  },
  {
    id: 'F6-CLA-03', factor: 'CLASIFICACION', maxPuntos: 2, origenSenal: 'verificado',
    descripcion: 'NICO ausente o inexistente para la fracción',
    senalDisponible: s => typeof s.verificado.nicoExiste === 'boolean',
    evaluar: s => (s.verificado.nicoExiste === false ? 2 : 0),
    fundamento: { articulo: 'LA 54', citaCorta: '"…y de la exacta determinación del número de identificación comercial…"', ...LA },
  },

  // ══ F7 · NOMs (peso v1: 8) ════════════════════════════════════════════
  {
    id: 'F7-NOM-01', factor: 'NOMS', maxPuntos: 8, bandera: 'EMBARGO', origenSenal: 'mixto',
    descripcion: 'Fracción con NOMs aplicables sin evidencia de cumplimiento (las de información comercial EMBARGAN desde la reforma)',
    senalDisponible: s => s.verificado.nomsRequeridas !== undefined,
    evaluar: s => {
      const noms = s.verificado.nomsRequeridas ?? [];
      if (noms.length === 0) return 0;
      return noConfirmado(s.declarado.evidenciaNoms) ? 8 : 0;
    },
    fundamento: { articulo: 'LA 151-II (reformada DOF 19-11-2025) + 176-II', citaCorta: '"Tratándose de las normas oficiales mexicanas de información comercial, también procederá el embargo cuando se detecten incumplimientos."', ...LA },
  },
  {
    id: 'F7-NOM-02', factor: 'NOMS', maxPuntos: 3, origenSenal: 'declarado',
    descripcion: 'El documento RRNA/NOM podría no amparar exactamente la mercancía presentada',
    evaluar: s => (s.declarado.documentoRrnaAmparaMercancia === false ? 3 : 0),
    fundamento: { articulo: 'RLA 235-H (DOF 23-02-2026)', citaCorta: '"…también se considerará que… fue omisa en transmitir o presentar el permiso… cuando éste no ampare la Mercancía presentada a Reconocimiento Aduanero."', ...RLA },
  },

  // ══ F8 · DOCUMENTACIÓN (peso v1: 6) ═══════════════════════════════════
  {
    id: 'F8-DOC-01', factor: 'DOCUMENTACION', maxPuntos: 3, origenSenal: 'verificado',
    descripcion: 'Número de pedimento con formato inválido (año/aduana/patente/consecutivo)',
    senalDisponible: s => typeof s.verificado.pedimentoFormatoValido === 'boolean',
    evaluar: s => (s.verificado.pedimentoFormatoValido === false ? 3 : 0),
    fundamento: { articulo: 'Anexo 22 RGCE 2026 (instructivo)', citaCorta: 'Número de pedimento: AÑO (2) + ADUANA (2, Apéndice 1) + PATENTE (4) + CONSECUTIVO (7).', fuente: 'Anexos 21-30 RGCE 2026 (DOF 15-01-2026)', url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5778300&fecha=15/01/2026', fechaCotejo: '2026-07-02' },
  },
  {
    id: 'F8-DOC-02', factor: 'DOCUMENTACION', maxPuntos: 3, origenSenal: 'declarado',
    descripcion: 'Preferencia arancelaria sin certificación de origen con los 9 elementos del Anexo 5-A T-MEC',
    evaluar: s => (s.operacion.preferenciaArancelaria === true && noConfirmado(s.declarado.certOrigen9Elementos) ? 3 : 0),
    fundamento: { articulo: 'T-MEC Anexo 5-A + LA 36-A-I-d (reformado DOF 19-11-2025)', citaCorta: 'Anexo 5-A: 9 elementos mínimos de la certificación de origen; LA 36-A-I-d: información "que determine la procedencia y el origen… para efectos de la aplicación de preferencias arancelarias".', fuente: 'T-MEC texto oficial (corpus ADUANAI, cotejo Fase 3)', url: 'https://www.gob.mx/t-mec', fechaCotejo: '2026-07-02' },
  },
  {
    id: 'F8-DOC-03', factor: 'DOCUMENTACION', maxPuntos: 2, origenSenal: 'declarado',
    descripcion: 'Sin encargo conferido vigente para el RFC del importador',
    evaluar: s => (noConfirmado(s.declarado.encargoConferido) ? 2 : 0),
    fundamento: { articulo: 'LA 59-III, párrafo 2', citaCorta: '"…se deberá hacer entrega al Servicio de Administración Tributaria… el documento que compruebe el encargo conferido a la agencia aduanal o al agente aduanal para realizar sus operaciones."', ...LA },
  },
];

/** Pesos v1 (semilla de RiskFactorWeight — configurables en BD, Σ=100). */
export const DEFAULT_WEIGHTS: Record<string, number> = {
  VALOR: 24,
  PERFIL: 22,
  CUOTAS: 12,
  PADRONES: 10,
  TEMPORALES: 10,
  CLASIFICACION: 8,
  NOMS: 8,
  DOCUMENTACION: 6,
};
