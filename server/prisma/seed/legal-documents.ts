/**
 * Seed: Documentos legales para RAG del Copilot.
 *
 * Cobertura: artículos clave de Ley Aduanera, LCE, LIGIE, RGCE, Anexos
 * (22, 24, 30, 31, 5, 10, 2.4.1), TMEC y TLCUEM.
 *
 * IMPORTANTE: los textos son resúmenes operativos verificables — el contenido
 * legal vinculante vive en DOF. Este seed alimenta al Copilot para que cite
 * referencias correctas en lugar de inventar; cada documento incluye `officialUrl`
 * a la fuente DOF para verificación. Para producción, reemplazar `content` con
 * el texto íntegro del DOF.
 *
 * Idempotente: clave compuesta `(source, reference)` upsert vía contentHash.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { generateEmbedding } from '../../src/lib/embeddings';

interface LegalDocSeed {
  type: string;
  source: string;
  title: string;
  reference: string;
  content: string;
  officialUrl?: string;
  publishedDate?: string;
  effectiveDate?: string;
  version?: string;
  topics: string[];
  keywords: string[];
  fractionRefs?: string[];
}

const DOF = 'https://www.dof.gob.mx';

// URLs oficiales por fuente — institucionales y verificables. Las URLs
// específicas de DOF (nota_detalle.php?codigo=...) que originalmente usaba
// el seed eran INVENTADAS y devolvían 404. Estas URLs apuntan al PDF/portal
// oficial donde el usuario PUEDE encontrar el texto vigente.
const OFFICIAL_URLS: Record<string, string> = {
  Ley_Aduanera: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
  LCE: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LCE.pdf',
  LIVA: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf',
  LIEPS: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIEPS.pdf',
  LFD: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFD.pdf',
  LIGIE: 'https://www.sat.gob.mx/normatividad/26043/tarifa-de-la-ley-de-los-impuestos-generales-de-importacion-y-de-exportacion-tigie-',
  RGCE_2026: 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior',
  Anexo_22_RGCE: 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior',
  Anexo_24_RGCE: 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior',
  Anexo_30_RGCE: 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior',
  Anexo_31_RGCE: 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior',
  Anexo_5_RGCE: 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior',
  Anexo_10_RGCE: 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior',
  Acuerdo_NOMs: 'https://www.gob.mx/se/acciones-y-programas/normas-oficiales-mexicanas',
  TMEC: 'https://www.gob.mx/t-mec',
  TLCUEM: 'https://www.gob.mx/se/acciones-y-programas/comercio-exterior-paises-con-tratados-y-acuerdos-firmados-con-mexico',
  CPTPP: 'https://www.gob.mx/se/acciones-y-programas/comercio-exterior-paises-con-tratados-y-acuerdos-firmados-con-mexico',
  AGA: 'https://www.sat.gob.mx/normatividad/criterios-normativos',
  AGCE: 'https://www.sat.gob.mx/normatividad/criterios-normativos',
};
function resolveOfficialUrl(source: string): string | null {
  return OFFICIAL_URLS[source] ?? null;
}

export const LEGAL_DOCUMENTS: LegalDocSeed[] = [
  // ════════════════════════════════════════════════════════════════════
  // LEY ADUANERA
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Sujetos del impuesto al comercio exterior',
    reference: 'Art. 51 LA',
    content: 'Están obligados al pago de los impuestos al comercio exterior y al cumplimiento de las regulaciones y restricciones no arancelarias y otras medidas de regulación al comercio exterior, las personas que introduzcan mercancías al territorio nacional o las extraigan del mismo. La Federación, Estados, Distrito Federal y Municipios también se encuentran obligados.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['regimen', 'sujetos'], keywords: ['obligados', 'pago', 'impuestos', 'comercio exterior'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Causación del impuesto general',
    reference: 'Art. 52 LA',
    content: 'El impuesto general de importación se causa por la entrada al territorio nacional y se determina por la Tarifa de la Ley de los Impuestos Generales de Importación y de Exportación (TIGIE) vigente. Se aplica al valor en aduana de las mercancías.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['regimen', 'causacion', 'igi'], keywords: ['IGI', 'causación', 'TIGIE', 'valor aduana'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Valor de transacción como base',
    reference: 'Art. 64 LA',
    content: 'La base gravable del impuesto general de importación es el valor en aduana de las mercancías. El valor en aduana es el valor de transacción, entendido como el precio efectivamente pagado o por pagar, ajustado con los incrementables del Art. 65.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['valoracion', 'base_gravable'], keywords: ['valor aduana', 'transacción', 'precio', 'base gravable'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Incrementables al valor de transacción',
    reference: 'Art. 65 LA',
    content: 'Al valor de transacción se incrementarán: I. Comisiones (excepto de compra); II. Gastos de envases y embalajes; III. Costos de transporte hasta el lugar de introducción al país, seguros y manejo; IV. Regalías y derechos de licencia relacionados con la mercancía cuando sean condición de venta; V. Productos que reviertan al vendedor por reventas posteriores.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['valoracion', 'incrementables'], keywords: ['regalías', 'flete', 'seguro', 'comisiones', 'envases', 'embalaje', 'incrementable'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Vinculación entre comprador y vendedor',
    reference: 'Art. 71 LA',
    content: 'La vinculación entre comprador y vendedor no afecta el valor de transacción si el importador acredita: a) que la vinculación no influyó en el precio, o b) que el precio se aproxima a valores de transacción de mercancías idénticas o similares en operaciones entre no vinculados. Existe vinculación cuando hay funcionarios comunes, control directo/indirecto, parentesco, o cualquier relación que pueda influir en el precio.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['valoracion', 'vinculacion'], keywords: ['vinculación', 'comprador', 'vendedor', 'precios transferencia', 'matriz', 'subsidiaria'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Rechazo del valor de transacción',
    reference: 'Art. 78 LA',
    content: 'La autoridad aduanera podrá rechazar el valor de transacción cuando: I. No exista venta para la exportación; II. No se demuestre el precio efectivamente pagado; III. Se trate de operaciones entre vinculados y no se acredite la independencia del precio; IV. El precio declarado sea significativamente inferior al precio estimado publicado conforme al Art. 84-A. En tal caso, se determinará el valor por los métodos sucesivos de los Arts. 72-77 (mercancías idénticas, similares, deductivo, reconstruido, último recurso).',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['valoracion', 'subvaluacion'], keywords: ['rechazo', 'valor', 'subvaluación', 'precio estimado', 'métodos secundarios'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Precios estimados y garantía',
    reference: 'Art. 84-A LA',
    content: 'Cuando el SAT establezca precios estimados de mercancías sujetas a alta incidencia de subvaluación (publicados en el Anexo 2 de las RGCE), los importadores que declaren un valor inferior deberán otorgar garantía en cuenta aduanera por la diferencia entre las contribuciones declaradas y las que correspondería pagar al precio estimado. La garantía permite el despacho mientras se resuelve la verificación.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['valoracion', 'subvaluacion', 'garantias'], keywords: ['precio estimado', 'garantía', 'cuenta aduanera', 'subvaluación', 'Anexo 2 RGCE'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Pedimento y datos obligatorios',
    reference: 'Art. 36 LA',
    content: 'Quienes importen o exporten mercancías están obligados a presentar pedimento. El pedimento debe contener los datos relativos a la operación de comercio exterior: clave del pedimento, RFC, razón social, datos de la mercancía (cantidades, valores, fracción), tributos a pagar, identificadores aplicables, etc. El instructivo de llenado es el Anexo 22 RGCE.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['regimen', 'pedimento'], keywords: ['pedimento', 'datos', 'Anexo 22', 'RFC', 'fracción'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Multa por incorrecta clasificación arancelaria',
    reference: 'Art. 184 LA',
    content: 'Cometen infracciones relacionadas con la obligación de presentar documentación, declarar correctamente o cumplir requisitos, entre otros: III. Declarar inexactamente la fracción arancelaria. La sanción es del 70% al 100% de las contribuciones omitidas (Art. 185). Si no hay omisión de contribuciones (misma carga arancelaria), la multa puede reducirse por proporcionalidad.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['sanciones', 'clasificacion'], keywords: ['multa', 'incorrecta clasificación', 'PAMA', 'Art. 184', 'infracción'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Audiencia y procedimiento administrativo',
    reference: 'Art. 152 LA',
    content: 'Cuando con motivo del reconocimiento aduanero se determinen contribuciones omitidas, multas o irregularidades, se levantará Acta circunstanciada y se notificará al interesado en el momento, otorgándole un plazo de 10 días hábiles para ofrecer pruebas y formular alegatos. Es el inicio del procedimiento administrativo en materia aduanera (PAMA).',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA`, effectiveDate: '2026-01-01',
    topics: ['sanciones', 'pama'], keywords: ['PAMA', 'audiencia', 'pruebas', 'alegatos', 'reconocimiento aduanero'],
  },

  // ════════════════════════════════════════════════════════════════════
  // LEY DE COMERCIO EXTERIOR — Cuotas compensatorias
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'ley', source: 'LCE', title: 'LCE — Definición de cuota compensatoria',
    reference: 'Art. 62 LCE',
    content: 'Las cuotas compensatorias son aquéllas que se aplican a las mercancías importadas en condiciones de discriminación de precios (dumping) o de subvenciones, como medida correctiva ante prácticas desleales de comercio internacional que causan daño o amenaza de daño a la rama de producción nacional.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LCE`, effectiveDate: '2026-01-01',
    topics: ['antidumping'], keywords: ['cuota compensatoria', 'dumping', 'discriminación precios', 'subvenciones'],
  },
  {
    type: 'ley', source: 'LCE', title: 'LCE — Procedimiento de investigación antidumping',
    reference: 'Art. 73-89 LCE',
    content: 'La UPCI (Unidad de Prácticas Comerciales Internacionales) inicia investigaciones antidumping a solicitud de la rama de producción nacional o de oficio. La cuota compensatoria provisional puede aplicarse antes de la resolución final. La cuota definitiva tiene vigencia de cinco años, prorrogable mediante revisión por extinción.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LCE`, effectiveDate: '2026-01-01',
    topics: ['antidumping'], keywords: ['UPCI', 'investigación', 'cuota provisional', 'cuota definitiva', 'revisión por extinción'],
  },

  // ════════════════════════════════════════════════════════════════════
  // LIGIE 2026
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'ley', source: 'LIGIE', title: 'LIGIE 2026 — Reglas Generales para la Interpretación (GRI 1-6)',
    reference: 'GRI 1-6 LIGIE',
    content: 'Las Reglas Generales de Interpretación se aplican en orden estricto: GRI 1: La clasificación está determinada legalmente por los textos de las partidas y de las notas de sección o capítulo. GRI 2a: Productos incompletos/sin montar se clasifican como completos. GRI 2b: Mezclas, considerar el material de carácter esencial. GRI 3a: Partida más específica prevalece. GRI 3b: Carácter esencial. GRI 3c: Última partida en orden numérico. GRI 4: Más análoga. GRI 5: Estuches. GRI 6: A nivel de subpartida y fracción.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LIGIE_2026`, effectiveDate: '2026-01-01', publishedDate: '2025-12-29',
    topics: ['clasificacion'], keywords: ['GRI', 'reglas interpretación', 'clasificación', 'notas legales', 'carácter esencial'],
  },
  {
    type: 'ley', source: 'LIGIE', title: 'LIGIE — Notas Sección XV (partes uso general)',
    reference: 'Nota 2 Sección XV LIGIE',
    content: 'Para efectos de la Sección XV (Metales comunes y manufacturas), se consideran "partes y accesorios de uso general": tornillos, pernos, tuercas, arandelas, resortes, eslabones de cadena, alambres comunes, ganchos, etc. Estas partes NO se reclasifican a otros capítulos aunque sean utilizables en mercancías de cap 84-92, salvo cuando sean identificables como destinadas exclusivamente a una mercancía específica.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LIGIE_2026`, effectiveDate: '2026-01-01',
    topics: ['clasificacion', 'reclasificacion'], keywords: ['partes uso general', 'tornillos', 'Sección XV', 'reclasificación'],
    fractionRefs: ['73181599', '73181606'],
  },
  {
    type: 'ley', source: 'LIGIE', title: 'LIGIE — Nota 2 Sección XVII (partes vehículos)',
    reference: 'Nota 2 Sección XVII LIGIE',
    content: 'Las partes y accesorios identificables como destinados exclusiva o principalmente a las mercancías del cap 86-89 (vehículos, aeronaves, embarcaciones), se clasifican en sus respectivos capítulos, salvo: a) productos del cap 73 considerados "uso general"; b) partes que sean producto cubierto por una partida específica de cap 84-90 (ej. bombas, ventiladores, etc.).',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LIGIE_2026`, effectiveDate: '2026-01-01',
    topics: ['clasificacion', 'reclasificacion', 'uso_destinado'], keywords: ['Sección XVII', 'partes vehículos', 'cap 87', 'autopartes', 'reclasificación'],
    fractionRefs: ['87089999'],
  },

  // ════════════════════════════════════════════════════════════════════
  // RGCE 2026 — Reglas Generales de Comercio Exterior
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'rgce', source: 'RGCE_2026', title: 'RGCE 2026 — Manifestación de valor electrónica',
    reference: 'Regla 1.5.1 RGCE 2026',
    content: 'Los importadores deben transmitir la Manifestación de Valor (formato E2 - Anexo 5 RGCE) por el sistema electrónico del SAT antes del despacho aduanero, con los datos del valor en aduana, incrementables, vinculación, factura comercial y documentos soporte. La omisión configura infracción del Art. 184 LA.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=RGCE_2026`, effectiveDate: '2026-01-01',
    topics: ['valoracion', 'pedimento'], keywords: ['manifestación valor', 'MVE', 'E2', 'Anexo 5', 'electrónica'],
  },
  {
    type: 'rgce', source: 'RGCE_2026', title: 'RGCE 2026 — Padrón de Importadores',
    reference: 'Regla 1.3.2 RGCE 2026',
    content: 'Quienes importen mercancías deben estar inscritos en el Padrón de Importadores. La inscripción la otorga el SAT previa solicitud, requiere RFC activo, opinión de cumplimiento positiva, dirección fiscal localizada, y representante legal. Se requiere padrón sectorial adicional para fracciones del Anexo 10 (sectores sensibles: textil, hierro y acero, cigarros, alcoholes, hidrocarburos, vehículos usados, etc.).',
    officialUrl: `${DOF}/nota_detalle.php?codigo=RGCE_2026`, effectiveDate: '2026-01-01',
    topics: ['regimen', 'padrones'], keywords: ['padrón importadores', 'padrón sectorial', 'Anexo 10', 'RFC'],
  },
  {
    type: 'rgce', source: 'Anexo_10_RGCE', title: 'Anexo 10 RGCE — Padrones Sectoriales',
    reference: 'Anexo 10 RGCE 2026',
    content: 'El Anexo 10 de las RGCE (Apartado A) establece el Padrón de Importadores de Sectores Específicos: la importación de ciertas fracciones exige, además del Padrón General de Importadores, la inscripción en el padrón SECTORIAL correspondiente. El padrón general se tramita ante AGACE (trámite 5/LA) y los sectoriales según el sector aplicable; vigencia típica 12 meses con renovación. IMPORTANTE: el número de sector que corresponde a cada fracción NO debe citarse de memoria (la numeración se ha reestructurado en versiones recientes); consulta el Anexo 10 vigente en el DOF, o el módulo de Padrones de la plataforma, para el sector exacto de una fracción.',
    officialUrl: OFFICIAL_URLS.Anexo_10_RGCE ?? `${DOF}`, effectiveDate: '2026-01-01',
    topics: ['regimen', 'padrones'], keywords: ['Anexo 10', 'padrón sectorial', 'sectores específicos', 'AGACE', 'inscripción', 'trámite 5/LA'],
  },
  {
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera Art. 151 — Causales de embargo precautorio',
    reference: 'Art. 151 Ley Aduanera',
    content: 'RESUMEN (no es el texto literal — consulta la redacción y las fracciones exactas en el DOF): el Art. 151 de la Ley Aduanera establece los supuestos en que la autoridad aduanera practica el embargo precautorio de la mercancía, entre ellos la omisión del pago de cuotas compensatorias y la falta de inscripción en el Padrón de Importadores o en el Padrón Sectorial cuando éste es exigible (operar una fracción del Anexo 10 sin inscripción sectorial activa). El procedimiento se sustancia mediante PAMA. La multa por omisión de contribuciones o cuotas compensatorias es de 130-150% de lo omitido conforme al Art. 178 LA.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=LA_151`, effectiveDate: '1995-12-15',
    topics: ['regimen', 'padrones', 'sanciones'], keywords: ['embargo', 'Art. 151', 'Art. 178', 'PAMA', 'padrón', 'sanción', 'Anexo 10'],
  },
  {
    type: 'rgce', source: 'RGCE_2026', title: 'RGCE — Procedimiento de inscripción al Padrón Sectorial',
    reference: 'Reglas 1.3.2 a 1.3.7 RGCE 2026 · Anexo 1-A trámites N/LA',
    content: 'Para inscripción al Padrón Sectorial el contribuyente debe: 1) Estar inscrito al Padrón General de Importadores (Trámite 5/LA); 2) Contar con e.firma vigente y opinión de cumplimiento positiva (Art. 32-D CFF); 3) Tener domicilio fiscal localizado y en hipótesis de "localizable"; 4) Presentar el trámite electrónico ante AGACE con la documentación específica del sector solicitado. La autoridad resuelve en plazo máximo 30-90 días según sector. La negativa puede impugnarse mediante recurso de revocación. La vigencia es de 12 meses, renovable. La suspensión por incumplimiento bloquea operaciones de despacho de las fracciones del sector.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=RGCE_padron_sectorial`, effectiveDate: '2026-01-01',
    topics: ['regimen', 'padrones'], keywords: ['inscripción padrón sectorial', 'AGACE', 'e.firma', 'opinión cumplimiento', 'domicilio localizado', 'renovación'],
  },
  {
    type: 'rgce', source: 'RGCE_2026', title: 'RGCE 2026 — Certificación IVA/IEPS modalidades',
    reference: 'Regla 7.1.5 RGCE 2026',
    content: 'La certificación IVA/IEPS tiene tres modalidades: A (estándar), AA (intermedio) y AAA (alto). Modalidad A: vigencia 1 año, garantías por crédito del IVA. Modalidad AA: vigencia 2 años, garantías reducidas. Modalidad AAA: vigencia 3 años, sin garantías para créditos de IVA, requiere antigüedad y nivel de cumplimiento más alto. Aplicable al Régimen IMMEX.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=RGCE_2026`, effectiveDate: '2026-01-01',
    topics: ['certificacion', 'iva_ieps'], keywords: ['IVA-IEPS', 'AA', 'AAA', 'modalidades', 'IMMEX', 'certificación'],
  },
  {
    type: 'rgce', source: 'RGCE_2026', title: 'RGCE 2026 — Plazos de permanencia IMMEX',
    reference: 'Regla 4.3.1 RGCE 2026',
    content: 'Las mercancías importadas temporalmente bajo IMMEX tienen plazo de permanencia: 18 meses general; 36 meses para empresas certificadas IVA-IEPS modalidad AAA. Vencido el plazo sin retorno, el importador debe regularizar (cambio de régimen) pagando contribuciones + recargos, o sufrirá determinación oficiosa con sanciones.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=RGCE_2026`, effectiveDate: '2026-01-01',
    topics: ['regimen', 'inmex'], keywords: ['IMMEX', 'temporal', '18 meses', '36 meses', 'plazo', 'regularización'],
  },

  // ════════════════════════════════════════════════════════════════════
  // LEY DEL IVA — Importación temporal IMMEX (CRÍTICO post-Reforma 2014)
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'ley', source: 'LIVA', title: 'LIVA — Importaciones gravadas (incluye temporal IMMEX)',
    reference: 'Art. 24 fr. I LIVA',
    content: 'Se considera importación de bienes y servicios la introducción al país de bienes. Incluye la introducción al territorio nacional bajo régimen de importación temporal, depósito fiscal, recinto fiscalizado o recinto fiscalizado estratégico. Por tanto, la importación temporal IMMEX SÍ se considera importación gravada para efectos del IVA y causa el impuesto al despacho aduanero. Esta hipótesis fue precisada con la Reforma 2014 (publicada DOF 11-dic-2013, vigente 2014) que eliminó la exención automática de las importaciones temporales para efectos del IVA. La causación ocurre cuando el importador presente el pedimento para su trámite.',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf', effectiveDate: '2014-01-01',
    topics: ['iva', 'inmex', 'fiscal'], keywords: ['IVA', 'importación temporal', 'IMMEX', 'causación', 'Art. 24', 'Reforma 2014', 'recinto fiscalizado'],
  },
  {
    type: 'ley', source: 'LIVA', title: 'LIVA — Momento de causación del IVA en importación',
    reference: 'Art. 26 LIVA',
    content: 'Se considera que se efectúa la importación de bienes en el momento en que el importador presente el pedimento para su trámite ante las autoridades aduaneras. Para importaciones temporales bajo IMMEX, este momento es el despacho aduanero — es entonces cuando se causa el IVA, sin que la naturaleza "temporal" del régimen suspenda o difiera la causación.',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf', effectiveDate: '2014-01-01',
    topics: ['iva', 'inmex', 'fiscal'], keywords: ['IVA', 'momento causación', 'Art. 26', 'pedimento', 'despacho'],
  },
  {
    type: 'ley', source: 'LIVA', title: 'LIVA — Crédito fiscal para IMMEX certificada (Art. 28-A)',
    reference: 'Art. 28-A LIVA',
    content: 'Las personas que introduzcan bienes a los regímenes aduaneros de importación temporal para elaboración, transformación o reparación en programas de maquila o de exportación; de depósito fiscal para someterse al proceso de ensamble y fabricación de vehículos; de elaboración, transformación o reparación en recinto fiscalizado, y de recinto fiscalizado estratégico, PODRÁN aplicar un CRÉDITO FISCAL consistente en una cantidad equivalente al 100% del impuesto al valor agregado que deba pagarse por la importación, siempre que cuenten con CERTIFICACIÓN expedida por el SAT (modalidades A, AA o AAA conforme Regla 7.1.5 RGCE). El crédito se aplica contra el IVA que se cause por la introducción. Por tanto: SIN certificación se paga (o garantiza) IVA; CON certificación se aplica crédito 100% (efecto neto no desembolso pero NO es exención ni diferimiento — es crédito acreditable).',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf', effectiveDate: '2014-01-01',
    topics: ['iva', 'inmex', 'certificacion', 'fiscal'], keywords: ['IVA', 'crédito fiscal', 'Art. 28-A', 'certificación', 'IMMEX', 'A AA AAA', 'modalidad', 'Reforma 2014'],
  },
  {
    type: 'ley', source: 'LIVA', title: 'LIVA — Garantía cuando no se cuenta con certificación IMMEX',
    reference: 'Art. 28-A párr. final LIVA · Art. 86-A fr. I LA',
    content: 'Los contribuyentes que no opten por la certificación o que esta haya sido cancelada, podrán NO PAGAR el IVA cuando garanticen el interés fiscal mediante FIANZA otorgada por institución autorizada, conforme reglas generales. La garantía se constituye por el monto del IVA que se debiera pagar al despacho. Si no se garantiza ni se certifica, debe pagarse el IVA al despacho. La cuenta aduanera del Art. 86-A fracción I LA es uno de los instrumentos admisibles. Esta vía mantiene la causación (Art. 24 fr. I) pero pospone el pago efectivo contra fianza/cuenta aduanera.',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf', effectiveDate: '2014-01-01',
    topics: ['iva', 'inmex', 'garantias', 'fiscal'], keywords: ['IVA', 'garantía', 'fianza', 'cuenta aduanera', 'sin certificación', 'IMMEX', 'Art. 28-A'],
  },
  {
    type: 'ley', source: 'LIVA', title: 'LIVA — Acreditamiento del IVA pagado en importación',
    reference: 'Art. 5 LIVA',
    content: 'Para que sea acreditable el IVA, deberá pagarse efectivamente en el mes de que se trate, contar con CFDI/pedimento que ampare la operación, estar relacionado con actos gravados del contribuyente. El IVA pagado al despacho por una importación temporal IMMEX SIN certificación es acreditable conforme estas reglas — el contribuyente recupera el IVA en su declaración mensual, pero el desembolso al despacho sí ocurre. Esto es distinto del crédito fiscal del Art. 28-A que no requiere desembolso previo.',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf', effectiveDate: '2014-01-01',
    topics: ['iva', 'acreditamiento', 'fiscal'], keywords: ['IVA', 'acreditamiento', 'Art. 5 LIVA', 'pedimento', 'CFDI'],
  },

  // ════════════════════════════════════════════════════════════════════
  // ANEXOS RGCE
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'rgce', source: 'Anexo_22_RGCE', title: 'Anexo 22 — Instructivo de llenado del pedimento',
    reference: 'Anexo 22 RGCE 2026',
    content: 'El Anexo 22 contiene el instructivo detallado para llenado del pedimento: estructura de los campos (datos generales, partidas, contribuciones, identificadores), claves de pedimento (A1 importación definitiva, IN importación temporal IMMEX, RT retorno, R1 regularización, etc.), tablas de validación, identificadores específicos por fracción, y reglas de cálculo de contribuciones.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=Anexo_22`, effectiveDate: '2026-01-01',
    topics: ['pedimento'], keywords: ['Anexo 22', 'instructivo pedimento', 'A1', 'IN', 'RT', 'identificadores'],
  },
  {
    type: 'rgce', source: 'Anexo_24_RGCE', title: 'Anexo 24 — Sistema de Control de Inventarios IMMEX',
    reference: 'Anexo 24 RGCE 2026',
    content: 'El Anexo 24 establece el Sistema de Control de Inventarios para empresas IMMEX: registro electrónico de entradas (importaciones temporales), salidas (retornos, ventas nacionales, donaciones, destrucciones), saldos, y conciliación. Información obligatoria a transmitir periódicamente. Inconsistencias generan diferencias auditables.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=Anexo_24`, effectiveDate: '2026-01-01',
    topics: ['inventarios', 'inmex'], keywords: ['Anexo 24', 'inventarios', 'IMMEX', 'control', 'descargos'],
  },
  {
    type: 'rgce', source: 'Anexo_30_RGCE', title: 'Anexo 30 — Sistema Electrónico Aduanero (controles fiscales)',
    reference: 'Anexo 30 RGCE 2026',
    content: 'El Anexo 30 regula el Sistema Electrónico Aduanero para certificados IVA/IEPS: contabilidad de créditos fiscales por IVA, IEPS y derechos diferidos en operaciones temporales IMMEX y régimen RECINTO. Se reportan créditos generados, descargos por retorno o cambio de régimen, y saldos pendientes con plazos de descarga.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=Anexo_30`, effectiveDate: '2026-01-01',
    topics: ['fiscal', 'iva_ieps', 'inmex'], keywords: ['Anexo 30', 'créditos fiscales', 'IVA diferido', 'IEPS diferido', 'descargo'],
  },
  {
    type: 'rgce', source: 'Anexo_31_RGCE', title: 'Anexo 31 — Garantías de cuenta aduanera',
    reference: 'Anexo 31 RGCE 2026',
    content: 'El Anexo 31 establece formatos y procedimientos para garantías constituidas en cuenta aduanera por: precios estimados (Art. 84-A LA), tránsitos, regularización IMMEX, embarques en tránsito. Garantías admisibles: fianza, carta de crédito, depósito en dinero. Vigencia mínima requerida según tipo de operación.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=Anexo_31`, effectiveDate: '2026-01-01',
    topics: ['garantias', 'cuenta_aduanera'], keywords: ['Anexo 31', 'garantías', 'cuenta aduanera', 'fianza', 'carta de crédito'],
  },
  {
    type: 'rgce', source: 'Anexo_5_RGCE', title: 'Anexo 5 — Formato de Manifestación de Valor (E2)',
    reference: 'Anexo 5 RGCE 2026',
    content: 'El Anexo 5 contiene el formato E2 de Manifestación de Valor: datos del importador, vendedor, factura comercial, valor de transacción, incrementables (flete, seguro, regalías), vinculación, condiciones de venta. Documento obligatorio para la determinación del valor en aduana de las mercancías importadas.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=Anexo_5`, effectiveDate: '2026-01-01',
    topics: ['valoracion'], keywords: ['Anexo 5', 'E2', 'manifestación valor', 'incrementables'],
  },
  {
    type: 'rgce', source: 'Anexo_10_RGCE', title: 'Anexo 10 — Padrones sectoriales',
    reference: 'Anexo 10 RGCE 2026',
    content: 'El Anexo 10 de las RGCE lista las fracciones arancelarias sujetas a inscripción en padrones sectoriales de importación (Padrón de Importadores de Sectores Específicos). La omisión de la inscripción, cuando es exigible para la fracción, configura infracción. Para identificar el sector específico que aplica a una fracción dada, consulta el Anexo 10 vigente en el DOF o el módulo de Padrones de la plataforma; la numeración oficial de sectores no debe citarse de memoria.',
    officialUrl: OFFICIAL_URLS.Anexo_10_RGCE ?? `${DOF}`, effectiveDate: '2026-01-01',
    topics: ['padrones'], keywords: ['Anexo 10', 'padrón sectorial', 'sectores específicos', 'hierro acero', 'textil', 'inscripción'],
  },
  {
    type: 'rgce', source: 'Acuerdo_NOMs', title: 'Anexo 2.4.1 — Excepciones a NOMs en punto de entrada',
    reference: 'Anexo 2.4.1 Acuerdo de NOMs',
    content: 'El Anexo 2.4.1 establece las excepciones al cumplimiento de NOMs de información comercial en punto de entrada: I) automotriz terminal/manufacturera; II) IMMEX para insumo productivo; III) B2B no consumidor final; IV) uso personal; V) muestras sin valor; VI) maquinaria/equipo industrial activo fijo; VII) reparación y retorno; VIII) gobierno; IX) etiquetado en MX antes de comercializar; X) ferias y exposiciones. NO aplica a NOMs de seguridad esencial (220-SE juguetes, 003 SCFI eléctrica, 016 CRE hidrocarburos, etc.).',
    officialUrl: `${DOF}/nota_detalle.php?codigo=Acuerdo_NOMs`, publishedDate: '2024-12-19', effectiveDate: '2024-12-19',
    topics: ['noms', 'rrnas'], keywords: ['Anexo 2.4.1', 'NOMs', 'excepciones', 'IMMEX', 'consumidor final', 'muestras'],
  },

  // ════════════════════════════════════════════════════════════════════
  // TRATADOS — TMEC
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'tratado', source: 'TMEC', title: 'TMEC Capítulo 4 — Reglas de Origen Generales',
    reference: 'TMEC Capítulo 4',
    content: 'Una mercancía es originaria del territorio de las Partes (México, EEUU, Canadá) cuando: a) es totalmente obtenida (wholly obtained), b) ha sido producida exclusivamente con materiales originarios, o c) cumple con la regla específica del Anexo 4-B (Reglas Específicas de Origen): cambio de partida y/o RVC. RVC = (TV - VNM) / TV × 100 (transaction value) o (NC - VNM) / NC × 100 (net cost).',
    officialUrl: `${DOF}/nota_detalle.php?codigo=TMEC`, publishedDate: '2020-06-30', effectiveDate: '2020-07-01',
    topics: ['origen'], keywords: ['TMEC', 'origen', 'RVC', 'transaction value', 'net cost', 'cambio partida', 'wholly obtained'],
  },
  {
    type: 'tratado', source: 'TMEC', title: 'TMEC Anexo 4-B — Reglas Específicas Automotriz',
    reference: 'TMEC Anexo 4-B (automotriz)',
    content: 'Para vehículos ligeros (8703): RVC 75% (transaction value) o 66% (net cost) desde 2023-07-01. Tres categorías de autopartes: (1) "core parts" 75%/66%; (2) "principal parts" 70%/61%; (3) "complementary parts" 65%/56%. Adicionalmente: Labor Value Content (LVC) 40-45% pagado a $16/hr USD, y 70% de acero/aluminio originario TMEC.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=TMEC_AnexoB`, effectiveDate: '2023-07-01',
    topics: ['origen', 'automotriz'], keywords: ['TMEC', 'Anexo 4-B', 'automotriz', 'RVC 75', 'LVC', 'core parts', 'acero originario'],
    fractionRefs: ['87032301', '87089999', '87082999'],
  },
  {
    type: 'tratado', source: 'TMEC', title: 'TMEC — Reglas yarn-forward textiles',
    reference: 'TMEC Capítulo 4 — Textiles',
    content: 'Para textiles caps 50-63 aplica regla "yarn-forward": hilatura, tejido y confección deben realizarse en territorio TMEC para calificar como originaria. Excepción: hilados/fibras incluidos en la "short supply list" (Apéndice II) pueden provenir de terceros países sin afectar origen. La lista se actualiza periódicamente por el CITA.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=TMEC_Textiles`, effectiveDate: '2020-07-01',
    topics: ['origen', 'textiles'], keywords: ['TMEC', 'yarn forward', 'textiles', 'short supply list', 'cap 61', 'cap 62'],
    fractionRefs: ['61091001', '62034201'],
  },
  {
    type: 'tratado', source: 'TLCUEM', title: 'TLCUEM — Tratado UE-México modernizado',
    reference: 'TLCUEM (modernizado 2018)',
    content: 'Tratado de Libre Comercio entre México y la Unión Europea modernizado en 2018. Reglas de origen menos estrictas que TMEC: porcentajes VNM máximos por capítulo. Ej: vehículos cap 87 admiten VNM ≤ 45% del precio franco fábrica (equivalente a RVC ≥ 55%). Textiles cap 61-62: confección desde hilados (no requiere yarn-forward completo).',
    officialUrl: `${DOF}/nota_detalle.php?codigo=TLCUEM`, effectiveDate: '2020-07-01',
    topics: ['origen'], keywords: ['TLCUEM', 'UE', 'Europa', 'VNM', 'reglas origen'],
  },
  {
    type: 'tratado', source: 'CPTPP', title: 'CPTPP — Tratado Integral y Progresista de Asociación Transpacífico',
    reference: 'CPTPP (vigente desde 2018)',
    content: 'Tratado entre 11 países del Pacífico: México, Australia, Brunei, Canadá, Chile, Japón, Malasia, Nueva Zelanda, Perú, Singapur, Vietnam. Reglas de origen build-down (RVC ≥ 45%) o build-up (RVC ≥ 55%). Más laxo que TMEC para autopartes. Textiles yarn-forward similar.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=CPTPP`, effectiveDate: '2018-12-30',
    topics: ['origen'], keywords: ['CPTPP', 'Transpacífico', 'Vietnam', 'Japón', 'build-down', 'build-up'],
  },

  // ════════════════════════════════════════════════════════════════════
  // CRITERIOS SAT
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'criterio_sat', source: 'AGA', title: 'Criterio AGA — Carga probatoria del valor en aduana',
    reference: 'Criterio Normativo AGA 7/2024',
    content: 'Cuando exista diferencia significativa entre el valor declarado y el precio estimado del Anexo 2 RGCE, opera presunción de subvaluación (Art. 78 LA). El importador puede desvirtuar con: factura comercial original, contrato de compraventa con cláusulas verificables, transferencias bancarias internacionales, comparables de operaciones idénticas/similares.',
    officialUrl: 'https://www.sat.gob.mx/criterios', publishedDate: '2024-04-15',
    topics: ['valoracion', 'subvaluacion'], keywords: ['carga probatoria', 'precio estimado', 'subvaluación', 'Anexo 2'],
  },
  {
    type: 'criterio_sat', source: 'AGA', title: 'Criterio AGA — Anexo 2.4.1 fracción II IMMEX',
    reference: 'Criterio Normativo AGA 4/2024',
    content: 'Procede la excepción del Anexo 2.4.1 fracción II cuando concurren: (1) programa IMMEX vigente, (2) mercancía será incorporada a proceso productivo, (3) NO comercializada al consumidor final tal cual, (4) Carta de No Comercialización presentada. NO aplica a NOMs de seguridad esencial.',
    officialUrl: 'https://www.sat.gob.mx/criterios',
    topics: ['noms', 'inmex'], keywords: ['Anexo 2.4.1', 'IMMEX', 'fracción II', 'No Comercialización'],
  },
  {
    type: 'criterio_sat', source: 'AGCE', title: 'Criterio AGCE — Smartphones clasificación 8517.13',
    reference: 'Criterio Normativo AGCE 5/2024',
    content: 'Los teléfonos inteligentes (smartphones) que combinan función de telefonía celular con cámara, GPS, internet y aplicaciones, se clasifican en 8517.13 cuando la función principal es la telefonía celular. La presencia de funciones adicionales no cambia la clasificación esencial. Concuerda con Decisión OMA HS-2520-EN.',
    officialUrl: 'https://www.sat.gob.mx/criterios',
    topics: ['clasificacion'], keywords: ['smartphones', '8517.13', 'OMA', 'GRI 3b'],
    fractionRefs: ['85171301'],
  },
];

function hashContent(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
}

export async function seedLegalDocuments(prisma: PrismaClient): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const doc of LEGAL_DOCUMENTS) {
    const contentHash = hashContent(doc.content);
    const existing = await prisma.legalDocument.findFirst({
      where: { source: doc.source, reference: doc.reference },
      select: { id: true, contentHash: true, officialUrl: true },
    });

    // Reemplazar URL inventada (DOF/nota_detalle.php?codigo=...) por URL
    // institucional real basada en la fuente.
    const officialUrl = resolveOfficialUrl(doc.source) ?? null;

    // Si el content no cambió pero la URL sí, sólo actualizamos URL (sin
    // regenerar embedding ni todo el record). Idempotente.
    if (existing && existing.contentHash === contentHash) {
      if (existing.officialUrl !== officialUrl) {
        await prisma.legalDocument.update({ where: { id: existing.id }, data: { officialUrl } });
      }
      skipped++;
      continue;
    }

    // Generar embedding (con fallback automático si no hay OPENAI_API_KEY)
    const embedding = await generateEmbedding(`${doc.title}\n${doc.reference}\n${doc.content}`, 'document');

    const data = {
      type: doc.type,
      source: doc.source,
      title: doc.title,
      reference: doc.reference,
      content: doc.content,
      officialUrl,
      publishedDate: doc.publishedDate ? new Date(doc.publishedDate) : null,
      effectiveDate: doc.effectiveDate ? new Date(doc.effectiveDate) : null,
      version: doc.version,
      keywords: doc.keywords,
      topics: doc.topics,
      fractionRefs: doc.fractionRefs ?? [],
      embedding,
      contentHash,
    };

    if (existing) {
      await prisma.legalDocument.update({ where: { id: existing.id }, data });
      inserted++;
    } else {
      await prisma.legalDocument.create({ data });
      inserted++;
    }
  }

  return { inserted, skipped };
}
