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
import { generateEmbedding, assertCorpusEmbedding } from '../../src/lib/embeddings';
import { LIGIE_VERSION } from '../../src/lib/tariff-version';

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
    // COTEJADO VERBATIM 2026-07-04 contra LA consolidada (Última Reforma DOF
    // 19-11-2025, diputados LeyesBiblio). El texto anterior de este doc tenía
    // fracciones I-IV FABRICADAS (el 78 no tiene fracciones) y atribuía al 78
    // la presunción por precio estimado, que vive en 86-A-I y 151-VII.
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Determinación flexible y rechazo del valor declarado',
    reference: 'Art. 78 LA',
    content: 'El Art. 78 LA regula la determinación FLEXIBLE del valor y el RECHAZO del valor declarado con documentación falsa — NO establece presunción de subvaluación por precio estimado (esa mecánica vive en los Arts. 86-A-I y 151-VII). Texto vigente: "Cuando el valor de las mercancías importadas no pueda determinarse con arreglo a los métodos a que se refieren los Artículos 64 y 71, fracciones I, II, III y IV, de esta Ley, dicho valor se determinará aplicando los métodos señalados en dichos artículos, en orden sucesivo y por exclusión, con mayor flexibilidad, o conforme a criterios razonables y compatibles con los principios y disposiciones legales, sobre la base de los datos disponibles en territorio nacional o la documentación comprobatoria de las operaciones realizadas en territorio extranjero. Cuando la documentación comprobatoria del valor sea falsa o esté alterada o tratándose de mercancías usadas, la autoridad aduanera podrá rechazar el valor declarado y determinar el valor comercial de la mercancía con base en la cotización y avalúo que practique la autoridad aduanera." (Tercer párrafo: base gravable especial para vehículos usados: valor de vehículo nuevo equivalente menos 30% el primer año y 10% por año subsecuente, tope 80%.) DÓNDE SÍ vive la mecánica del precio estimado: Art. 86-A fracción I LA — obligación de GARANTIZAR mediante depósito en cuenta aduanera de garantía "quienes efectúen la importación definitiva de mercancías y declaren en el pedimento un valor inferior al precio estimado que dé a conocer la Secretaría, por las contribuciones y cuotas compensatorias que correspondan a la diferencia entre el valor declarado y el precio estimado"; y Art. 151-VII LA — EMBARGO precautorio cuando el valor declarado sea inferior en un 50% o más al valor de transacción de mercancías idénticas o similares (Arts. 72-73), salvo que se haya otorgado la garantía del 86-A.',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf', effectiveDate: '2026-01-01',
    topics: ['valoracion', 'subvaluacion'], keywords: ['rechazo', 'valor', 'subvaluación', 'precio estimado', 'métodos flexibles', 'garantía', 'cuenta aduanera', 'embargo'],
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
    // CORREGIDO 2026-07-02: la versión previa afirmaba "70% al 100% de las
    // contribuciones omitidas" — cifra INEXISTENTE en los Arts. 178/184/185.
    // Cotejado contra LAdua.pdf consolidada (últ. reforma DOF 19-11-2025,
    // multas actualizadas DOF 27-12-2025). La UI del Clasificador (130-150%,
    // Art. 178) ya era correcta.
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Multas por fracción arancelaria inexacta (con y sin omisión de contribuciones)',
    reference: 'Art. 184 LA',
    content: 'Multa por clasificación arancelaria incorrecta — dos rutas según haya o no omisión de contribuciones (LA vigente, últ. reforma DOF 19-11-2025; cuotas de multa actualizadas DOF 27-12-2025): (1) CON OMISIÓN de contribuciones: la infracción es del Art. 176 fr. I (omitir el pago total o parcial de los impuestos al comercio exterior) y la sanción del Art. 178 fr. I — texto vigente: "Multa del 130% al 150% de los impuestos al comercio exterior omitidos, cuando no se haya cubierto lo que correspondía pagar." (2) SIN OMISIÓN (dato inexacto en pedimento/documento con la misma carga tributaria): la infracción es del Art. 184 fr. III — "Transmitan o presenten los informes o documentos con datos inexactos o falsos u omitiendo algún dato" — y la sanción del Art. 185 fr. II: multa de $2,640.00 a $3,750.00 por cada documento (cuota vigente 2026). NO existe en la Ley Aduanera una multa del "70% al 100%" por clasificación inexacta.',
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf', effectiveDate: '2026-01-01',
    version: 'LA vigente — últ. reforma DOF 19-11-2025; multas actualizadas DOF 27-12-2025',
    topics: ['sanciones', 'clasificacion'], keywords: ['multa', 'incorrecta clasificación', 'fracción inexacta', 'Art. 178', 'Art. 184', 'Art. 185', '130% al 150%', 'infracción', 'PAMA'],
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
  // LIGIE (Fase 4.4: el título decía "LIGIE 2026" — la LEY es la LIGIE
  // publicada DOF 01-07-2020; lo que es 2026 es la TARIFA reformada (TIGIE).
  // El Copilot citaba este título y contradecía a Cumplimiento, que lee la
  // fuente única lib/tariff-version.ts. Ahora la versión del doc también
  // se toma de esa fuente única.)
  // ════════════════════════════════════════════════════════════════════
  {
    type: 'ley', source: 'LIGIE', title: 'LIGIE — Reglas Generales para la Interpretación (RGI 1-6)',
    reference: 'GRI 1-6 LIGIE',
    content: `Reglas Generales de Interpretación de la LIGIE (Ley de los Impuestos Generales de Importación y de Exportación, DOF 01-07-2020; tarifa vigente: ${LIGIE_VERSION}). Se aplican en orden estricto: Regla General 1 (RGI 1): La clasificación está determinada legalmente por los textos de las partidas y de las notas de sección o capítulo. RGI 2a: Productos incompletos/sin montar se clasifican como completos. RGI 2b: Mezclas, considerar el material de carácter esencial. RGI 3a: Partida más específica prevalece. RGI 3b: Carácter esencial. RGI 3c: Última partida en orden numérico. RGI 4: Más análoga. RGI 5: Estuches. RGI 6: A nivel de subpartida y fracción.`,
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIGIE.pdf', effectiveDate: '2026-01-01', publishedDate: '2025-12-29',
    version: LIGIE_VERSION,
    topics: ['clasificacion'], keywords: ['GRI', 'RGI', 'reglas interpretación', 'clasificación', 'notas legales', 'carácter esencial'],
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
    type: 'rgce', source: 'RGCE_2026', title: 'RGCE 2026 — Esquema de Certificación de Empresas, modalidad IVA e IEPS (rubros A/AA/AAA)',
    reference: 'Reglas 7.1.1, 7.1.2 y 7.1.3 RGCE 2026',
    content: 'El Esquema de Certificación de Empresas en la modalidad de IVA e IEPS (Título 7 del RGCE) tiene tres rubros: A, AA y AAA. Los requisitos generales para obtener el Registro están en la regla 7.1.1 (que invoca los artículos 28-A primer párrafo LIVA, 15-A primer párrafo LIEPS y 100-A de la Ley Aduanera); los requisitos específicos del rubro A en la regla 7.1.2 y los de los rubros AA y AAA en la regla 7.1.3. Los rubros superiores exigen mayor antigüedad operativa y nivel de cumplimiento: el rubro AA requiere haber realizado operaciones durante al menos cuatro años, y el rubro AAA durante al menos siete años. El beneficio de la certificación es un crédito fiscal equivalente al 100% del IVA (y, en su caso, IEPS) que se cause por la importación temporal, conforme al Art. 28-A LIVA y 15-A LIEPS. Aplicable al Régimen IMMEX. No exime ni difiere el impuesto: es un crédito fiscal acreditable. VIGENCIA (regla 7.1.6 RGCE 2026, cotejada vs DOF 27-12-2025): el Registro se otorga con vigencia de UN AÑO y es renovable, para TODOS los rubros de la modalidad IVA e IEPS (A, AA y AAA) — la vigencia de dos años aplica únicamente a las modalidades Comercializadora e Importadora, Operador Económico Autorizado y Socio Comercial Certificado. OJO: la regla 7.1.5 regula la modalidad Socio Comercial Certificado (transportistas, agentes aduanales, recintos), NO la certificación IVA/IEPS; y el esquema de vigencias "1/2/3 años por rubro A/AA/AAA" NO está vigente en RGCE 2026.',
    officialUrl: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf', effectiveDate: '2026-01-01',
    topics: ['certificacion', 'iva_ieps'], keywords: ['IVA-IEPS', 'rubro A', 'rubro AA', 'rubro AAA', 'modalidades', 'IMMEX', 'certificación', 'esquema de certificación de empresas', 'crédito fiscal'],
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
    content: 'Las personas que introduzcan bienes a los regímenes aduaneros de importación temporal para elaboración, transformación o reparación en programas de maquila o de exportación; de depósito fiscal para someterse al proceso de ensamble y fabricación de vehículos; de elaboración, transformación o reparación en recinto fiscalizado, y de recinto fiscalizado estratégico, PODRÁN aplicar un CRÉDITO FISCAL consistente en una cantidad equivalente al 100% del impuesto al valor agregado que deba pagarse por la importación, siempre que cuenten con CERTIFICACIÓN expedida por el SAT en el Esquema de Certificación de Empresas, modalidad IVA e IEPS (rubros A, AA o AAA), cuyos requisitos se regulan en el Título 7 del RGCE (reglas 7.1.1 a 7.1.3). El crédito se aplica contra el IVA que se cause por la introducción. Por tanto: SIN certificación se paga (o garantiza) IVA; CON certificación se aplica crédito 100% (efecto neto no desembolso pero NO es exención ni diferimiento — es crédito acreditable).',
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
  // Fase 4.4 (higiene): aquí había una SEGUNDA entrada con la misma clave
  // (Anexo_10_RGCE | Anexo 10 RGCE 2026) que la de la sección padrones —
  // ambas se ping-poneaban la misma fila en CADA corrida del seed (re-embed
  // perpetuo). Se conserva solo la entrada rica (Apartado A, trámite 5/LA).
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
    type: 'tratado', source: 'TMEC', title: 'TMEC Capítulo 4 — Reglas de Origen Generales (criterios A/B/C/D)',
    reference: 'TMEC Capítulo 4',
    content: 'Conforme al Art. 4.2 del T-MEC (Mercancías Originarias), una mercancía es originaria del territorio de las Partes (México, EEUU, Canadá) si cumple alguno de cuatro criterios, identificados en la certificación de origen como Criterio A, B, C o D: Criterio A — totalmente obtenida o producida enteramente en territorio de una o más Partes (wholly obtained, Art. 4.3). Criterio B — producida con materiales no originarios que cumplen la regla de origen específica del Anexo 4-B (cambio de clasificación arancelaria y/o valor de contenido regional). Criterio C — producida exclusivamente con materiales originarios. Criterio D — casos especiales (salvo Caps. 61-63 del SA): materiales no originarios clasificados como partes que no logran el cambio de clasificación por estar en la misma subpartida o partida, pero la mercancía alcanza un valor de contenido regional de al menos 60% por el método de valor de transacción (Art. 4.5). El valor de contenido regional (RVC) se calcula: RVC = (TV − VNM) / TV × 100 (método de valor de transacción) o (NC − VNM) / NC × 100 (método de costo neto), donde VNM = valor de materiales no originarios.',
    officialUrl: `${DOF}/nota_detalle.php?codigo=TMEC`, publishedDate: '2020-06-30', effectiveDate: '2020-07-01',
    topics: ['origen'], keywords: ['TMEC', 'origen', 'criterios de origen', 'criterio A', 'criterio B', 'criterio C', 'criterio D', 'Art. 4.2', 'RVC', 'transaction value', 'net cost', 'cambio de clasificación', 'wholly obtained'],
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
    type: 'tratado', source: 'TMEC', title: 'T-MEC — Certificación de origen: elementos mínimos (formato libre)',
    reference: 'T-MEC Anexo 5-A, Cap. 5 (Art. 5.2)',
    content: 'NO existe una «Forma T-MEC 05-A», una «Forma 05-A», una «Forma T-MEC» ni ningún formato oficial gubernamental numerado para certificar el origen bajo el T-MEC: la certificación de origen del T-MEC es de FORMATO LIBRE. Cualquier afirmación sobre un número de forma para certificar origen T-MEC es incorrecta. Puede constar en cualquier documento (incluso la factura comercial) o en medio electrónico, siempre que contenga los elementos mínimos del Anexo 5-A del Capítulo 5. La puede emitir el exportador, el productor o el importador (Art. 5.2) y es la base para solicitar trato arancelario preferencial; no requiere ser expedida ni validada por una autoridad, cámara o agente. Los 9 elementos mínimos (Anexo 5-A) son: (1) Quién certifica: si el certificador es el exportador, productor o importador (Art. 5.2). (2) Certificador: nombre, cargo, dirección (incluido el país), teléfono y correo. (3) Exportador: nombre, dirección (incluido el país), correo y teléfono, si es distinto del certificador. (4) Productor: nombre, dirección (incluido el país), correo y teléfono, si es distinto; si hay varios, indicar «Varios» o una lista; puede señalarse «Disponible a solicitud de las autoridades». (5) Importador: nombre, dirección, correo y teléfono, de conocerse. (6) Descripción y clasificación arancelaria de la mercancía en el Sistema Armonizado a 6 dígitos; si ampara un solo embarque, el número de factura de conocerse. (7) Criterio de origen conforme al cual la mercancía califica (Art. 4.2). (8) Período global: si ampara múltiples embarques de mercancías idénticas, hasta 12 meses. (9) Firma autorizada y fecha, con la declaración: «Certifico que las mercancías descritas en este documento califican como originarias y que la información contenida en este documento es verdadera y exacta». Los criterios de origen del Art. 4.2 (citados en el elemento 7) son cuatro: Criterio A — mercancía totalmente obtenida o producida enteramente en territorio de una o más Partes (Art. 4.3). Criterio B — producida con materiales no originarios que cumplen la regla de origen específica del Anexo 4-B (cambio de clasificación arancelaria y/o valor de contenido regional). Criterio C — producida exclusivamente con materiales originarios. Criterio D — casos especiales (salvo Caps. 61-63 del SA): mercancía cuyos materiales no originarios clasificados como partes no cumplen el cambio de clasificación por estar en la misma subpartida o partida, o que se importa sin montar o desmontada, siempre que su valor de contenido regional sea de al menos 60% por el método de valor de transacción (Art. 4.5). La certificación puede amparar un solo embarque o varios (período global hasta 12 meses) y el importador debe conservarla y presentarla si la autoridad la requiere.',
    officialUrl: 'https://www.gob.mx/t-mec', publishedDate: '2020-06-30', effectiveDate: '2020-07-01',
    topics: ['origen'], keywords: ['certificación de origen', 'certificado de origen', 'T-MEC', 'USMCA', 'formato libre', 'elementos mínimos', 'Anexo 5-A', 'criterio de origen', 'criterio A', 'criterio B', 'criterio C', 'criterio D', 'trato arancelario preferencial', 'forma T-MEC', 'forma T-MEC 05-A', 'forma 05-A', '05-A', 'formulario T-MEC'],
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
  // ELIMINADO 2026-07-04: "Criterio Normativo AGA 7/2024 — Carga probatoria del
  // valor en aduana". Referencia NO cotejable contra fuente oficial y contenido
  // con atribución legal incorrecta (imputaba al Art. 78 LA una "presunción de
  // subvaluación por precio estimado" que vive en 86-A-I y 151-VII). La fila
  // huérfana se desactiva en BD (patrón DEFERRED #14). OJO: "AGA 4/2024" (abajo)
  // también tiene referencia pendiente de cotejo — reportado, no tocado.
  // ELIMINADO 2026-07-04: "Criterio Normativo AGA 4/2024 — Anexo 2.4.1 fracción II
  // IMMEX". Referencia NO cotejable contra fuente oficial (mismo tratamiento que
  // AGA 7/2024). Fila huérfana desactivada en BD (DEFERRED #16).
  // ELIMINADO 2026-07-05: "Criterio Normativo AGCE 5/2024 — Smartphones 8517.13".
  // Razón ÚNICA: referencia NO cotejable contra fuente oficial (mismo tratamiento
  // que AGA 7/2024 y 4/2024). NOTA de corrección: la observación previa de que su
  // contenido "contradecía el catálogo" era FALSA — 8517.13.01 "Teléfonos
  // inteligentes." SÍ existe activa en el catálogo (subpartida HS 2022). El
  // hallazgo real es del CATÁLOGO: 85171301 y 85171401 conviven activas ambas
  // describiendo smartphones (pendiente de cotejo vs Base Única SNICE).
  {
    // Fase 3.1 — TEXTO VERBATIM de la LFD consolidada (Cámara de Diputados,
    // última reforma DOF 07-11-2025; cantidades 2026 actualizadas por RMF
    // DOF 28-12-2025, Anexo 4). Extraído del PDF oficial LeyesBiblio el
    // 2026-07-02. Se omiten solo las notas editoriales de reforma por fracción.
    type: 'ley', source: 'LFD', title: 'LFD — Derecho de Trámite Aduanero (DTA): tasas y cuotas vigentes 2026',
    reference: 'Art. 49 LFD',
    content: `DTA (derecho de trámite aduanero) — Art. 49 Ley Federal de Derechos, TEXTO VIGENTE 2026 (últ. reforma DOF 07-11-2025; cuotas actualizadas por RMF 2026, DOF 28-12-2025). Tasas clave: general 8 al millar (fracc. I); activo fijo IMMEX 1.76 al millar (fracc. II); IMMEX temporal cuota fija $461.61 (fracc. III); exentas/retornos/tratados internacionales $461.61 por operación (fracc. IV); exportación $462.86 (fracc. V).

TEXTO VERBATIM:

Artículo 49.- Se pagará el derecho de trámite aduanero, por las operaciones aduaneras que se efectúen utilizando un pedimento o el documento aduanero correspondiente en los términos de la Ley Aduanera, conforme a las siguientes tasas o cuotas:

I. Del 8 al millar, sobre el valor que tengan los bienes para los efectos del impuesto general de importación, en los casos distintos a los señalados en las siguientes fracciones o cuando se trate de mercancías exentas conforme a la Ley de los Impuestos Generales de Importación y de Exportación o a los Tratados Internacionales.

II. Del 1.76 al millar sobre el valor que tengan los bienes, tratándose de la importación temporal de bienes de activo fijo que efectúen las maquiladoras o las empresas que tengan programas de exportación autorizados por la Secretaría de Economía o, en su caso, la maquinaria y equipo que se introduzca al territorio nacional para destinarlos al régimen de elaboración, transformación o reparación en recintos fiscalizados.

III. Tratándose de importaciones temporales de bienes distintos de los señalados en la fracción anterior siempre que sea para elaboración, transformación o reparación en las empresas con programas autorizados por la Secretaría de Economía (Industria Manufacturera, Maquiladora y de Servicios de Exportación IMMEX): $461.61

Asimismo, se pagará la cuota señalada en el párrafo anterior, por la introducción al territorio nacional de bienes distintos a los señalados en la fracción II de este artículo, bajo el régimen de elaboración, transformación o reparación en recintos fiscalizados, así como en los retornos respectivos.

IV. En el caso de operaciones de importación y exportación de mercancías exentas de los impuestos al comercio exterior conforme a la Ley Aduanera; de retorno de mercancías importadas o exportadas definitivamente; de importaciones o exportaciones temporales para retornar en el mismo estado; de las operaciones aduaneras que amparen mercancías que de conformidad con las disposiciones aplicables no tengan valor en aduana, así como de importación y exportación de mercancías en las que, de conformidad con los tratados internacionales, no deban aplicarse cargos o derechos sobre el valor que éstas tengan, por cada operación: $461.61

V.- En las operaciones de exportación: $462.86

Cuando la exportación de mercancías se efectúe mediante pedimento consolidado a que se refiere la Ley Aduanera, el derecho de trámite aduanero se pagará por cada operación al presentarse el pedimento respectivo, debiendo considerarse a cada vehículo de transporte como una operación distinta ante la aduana correspondiente.

También se pagará este derecho por cada operación en que se utilice el pedimento complementario del pedimento de exportación o retorno de mercancías.

VI.- Tratándose de las efectuadas por los Estados extranjeros: $452.66

VII.- Por aquellas operaciones en que se rectifique un pedimento y no se esté en los supuestos de las fracciones anteriores, así como cuando se utilice algunos de los siguientes pedimentos:
a) De tránsito interno: $461.61
b) De tránsito internacional: $438.36
c) De extracción del régimen de depósito fiscal para retorno: $461.61
d) La parte II de los pedimentos de importación; exportación o tránsito: $461.61
e) Por cada rectificación de pedimento: $444.42

VIII.- Del 8 al millar, sobre el valor que tenga el oro para los efectos del impuesto general de importación, sin exceder de la cuota de: $4,891.35

Cuando la cantidad que resulte de aplicar lo dispuesto en las fracciones I y II de este artículo sea inferior a la señalada en la fracción III, se aplicará esta última.

Cuando la importación de las mercancías a que se refieren las fracciones II y III, primer párrafo, de este artículo, se efectúe mediante pedimento o pedimento consolidado, el derecho de trámite aduanero se pagará por cada operación al presentarse el pedimento respectivo, debiendo considerarse a cada vehículo de transporte como una operación distinta ante la aduana correspondiente y no se pagará por el retorno de dichas mercancías.

En las operaciones de depósito fiscal y en el tránsito de mercancías, el derecho se pagará al presentarse el pedimento definitivo y en su caso, al momento de pagarse el impuesto general de importación.

Cuando por la operación aduanera de que se trate, no se tenga que pagar el impuesto general de importación, el derecho se determinará sobre el valor en aduana de las mercancías.

El pago del derecho, se efectuará conjuntamente con el impuesto general de importación o exportación, según se trate. Cuando no se esté obligado al pago de los impuestos citados, el derecho a que se refiere este artículo deberá pagarse antes de retirar las mercancías del recinto fiscal.

La recaudación de los derechos de trámite aduanero, incluyendo el adicional a que se refiere el artículo 50 de esta Ley, se destinará a la Secretaría de Hacienda y Crédito Público.

Tratándose de los derechos de trámite aduanero que se recauden en Colombia, Nuevo León, los mismos se destinarán al pago de la inversión que el Gobierno del Estado de Nuevo León hubiere hecho en la construcción de la garita y hasta por el monto de la misma.`,
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFD.pdf',
    publishedDate: '2025-11-07', effectiveDate: '2026-01-01',
    version: 'Vigente 2026 — últ. reforma DOF 07-11-2025; cuotas Anexo 4 RMF 2026 (DOF 28-12-2025)',
    topics: ['dta', 'pedimento', 'fiscal'],
    keywords: ['dta', 'derecho de trámite aduanero', 'art. 49 lfd', 'ley federal de derechos', '8 al millar', '1.76 al millar', 'cuota fija', 'immex', 'tratados internacionales', 'tránsito', 'rectificación'],
  },
  {
    // Fase 3.3-A — VERBATIM de la LIVA consolidada (diputados.gob.mx, última
    // reforma DOF 12-11-2021), extraído del PDF oficial el 2026-07-02.
    type: 'ley', source: 'LIVA', title: 'LIVA — Base gravable del IVA en la importación (valor + IGI + demás contribuciones)',
    reference: 'Art. 27 LIVA',
    content: `Base gravable del IVA en la importación — Art. 27 LIVA (TEXTO VIGENTE): la base NO es solo el valor en aduana; es el valor para efectos del IGI ADICIONADO con el IGI pagado y con las demás contribuciones y aprovechamientos que se paguen por la importación (p. ej. DTA, cuotas compensatorias, IEPS cuando aplique).

TEXTO VERBATIM:

Artículo 27. Para calcular el impuesto al valor agregado tratándose de importación de bienes tangibles, se considerará el valor que se utilice para los fines del impuesto general de importación, adicionado con el monto de este último gravamen y del monto de las demás contribuciones y aprovechamientos que se tengan que pagar con motivo de la importación.

Tratándose de bienes que se destinen a los regímenes aduaneros de importación temporal para elaboración, transformación o reparación en programas de maquila o de exportación; de depósito fiscal para someterse al proceso de ensamble y fabricación de vehículos; de elaboración, transformación o reparación en recinto fiscalizado, y de recinto fiscalizado estratégico, para calcular el impuesto al valor agregado se considerará el valor en aduana a que se refiere la Ley Aduanera, adicionado del monto de las contribuciones y aprovechamientos que se tuvieran que pagar en caso de que se tratara de una importación definitiva.

El valor que se tomará en cuenta tratándose de importación de bienes o servicios a que se refieren las fracciones II, III, IV y V del artículo 24, será el que les correspondería en esta Ley por enajenación de bienes, uso o goce de bienes o prestación de servicios, en territorio nacional, según sea el caso.

Tratándose de bienes exportados temporalmente y retornados al país con incremento de valor, éste será el que se utilice para los fines del impuesto general de importación, con las adiciones a que se refiere el primer párrafo de este artículo.`,
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf',
    version: 'LIVA vigente — últ. reforma DOF 12-11-2021',
    topics: ['iva', 'valoracion'],
    keywords: ['base gravable', 'iva importación', 'art. 27 liva', 'valor en aduana', 'igi', 'contribuciones', 'aprovechamientos', 'dta', 'importación temporal'],
  },
  {
    // Fase 3.3-B — VERBATIM de la Ley Aduanera consolidada (diputados.gob.mx,
    // última reforma DOF 19-11-2025), extraído del PDF oficial el 2026-07-02.
    type: 'ley', source: 'Ley_Aduanera', title: 'Ley Aduanera — Responsabilidad del agente aduanal y agencia aduanal (clasificación, NICO, contribuciones)',
    reference: 'Art. 54 LA',
    content: `Responsabilidad del agente aduanal — Art. 54 LA (TEXTO VIGENTE, reformado DOF 19-11-2025): el agente aduanal y la agencia aduanal responden por la veracidad de datos, la correcta determinación del pago de contribuciones, el régimen aduanero, la CORRECTA CLASIFICACIÓN ARANCELARIA y el NICO exacto.

TEXTO VERBATIM:

ARTICULO 54. El agente aduanal y la agencia aduanal serán responsables de la veracidad y exactitud de los datos e información suministrados, de la correcta determinación del pago de las contribuciones, de la determinación del régimen aduanero de las mercancías, de su correcta clasificación arancelaria y de la exacta determinación del número de identificación comercial, así como de asegurarse que el importador o exportador cuenta con los documentos que acrediten fehacientemente el cumplimiento de sus obligaciones en materia de comercio exterior y en materia de regulaciones y restricciones no arancelarias que rijan para dichas mercancías, de conformidad con lo previsto por esta Ley y por las demás leyes y disposiciones jurídicas aplicables.

(Artículo reformado DOF 31-12-1998, 01-01-2002, 25-06-2018, 01-07-2020, 19-11-2025.)`,
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
    version: 'LA vigente — últ. reforma DOF 19-11-2025',
    topics: ['clasificacion', 'pedimento'],
    keywords: ['agente aduanal', 'agencia aduanal', 'responsabilidad', 'art. 54', 'clasificación arancelaria', 'nico', 'régimen aduanero', 'veracidad'],
  },
  {
    // Fase 3.3-C — VERBATIM del texto oficial en español del T-MEC, Capítulo 4
    // (gob.mx/cms 04ESPReglasdeOrigen.pdf), extraído el 2026-07-02.
    type: 'tratado', source: 'TMEC', title: 'T-MEC Art. 4.5 — Valor de Contenido Regional: métodos de valor de transacción y costo neto',
    reference: 'Art. 4.5 T-MEC',
    content: `RVC/VCR bajo T-MEC — Art. 4.5 (Cap. 4, texto oficial en español): DOS métodos a elección del importador, exportador o productor — valor de transacción: VCR = (VT − VMNO) / VT × 100; costo neto: VCR = (CN − VMNO) / CN × 100. Los PORCENTAJES requeridos por producto están en el Anexo 4-B (Reglas de Origen Específicas por Producto); el costo neto es obligatorio cuando el Anexo 4-B no prevé regla por valor de transacción (p. ej. sector automotriz).

TEXTO VERBATIM (párrafos 1 a 6):

1. Salvo lo dispuesto en el párrafo 6, cada Parte dispondrá que el valor de contenido regional de una mercancía sea calculado, a elección del importador, exportador o productor de la mercancía, bajo el método del valor de transacción establecido en el párrafo 2 o del método de costo neto establecido en el párrafo 3.

2. Cada Parte dispondrá que un importador, exportador o productor pueda calcular el valor de contenido regional de la mercancía bajo el método de valor de transacción siguiente: VCR = (VT − VMNO) / VT × 100, donde: VCR es el valor de contenido regional, expresado como un porcentaje; VT es el valor de transacción de la mercancía, ajustado para excluir cualquier costo incurrido en el envío internacional de la mercancía; y VMNO es el valor de los materiales no originarios, incluyendo materiales de origen indeterminado, utilizados por el productor en la producción de la mercancía.

3. Cada Parte dispondrá que un importador, exportador o productor pueda calcular el valor de contenido regional de la mercancía bajo el método de costo neto siguiente: VCR = (CN − VMNO) / CN × 100, donde: VCR es el valor de contenido regional, expresado en porcentaje; CN es el costo neto de la mercancía; y VMNO es el valor de los materiales no originarios, incluyendo materiales de origen indeterminado, utilizados por el productor en la producción de la mercancía.

4. Cada Parte dispondrá que el valor de los materiales no originarios utilizados por el productor en la producción de una mercancía no deberá incluir, para los efectos del cálculo de valor de contenido regional de la mercancía conforme al párrafo 2 o 3, el valor de los materiales no originarios utilizados para producir materiales originarios que se utilizarán posteriormente en la producción de la mercancía.

5. Cada Parte dispondrá que, si un material no originario es utilizado en la producción de la mercancía, lo siguiente podrá ser contabilizado como contenido originario con el propósito de determinar si la mercancía cumple con el requisito de valor de contenido regional: (a) el valor del procesamiento de los materiales no originarios realizado en el territorio de una o más de las Partes; y (b) el valor de cualquier material originario utilizado en la producción del material no originario realizado en el territorio de una o más de las Partes.

6. Cada Parte dispondrá que un importador, exportador o productor calcule el valor de contenido regional de una mercancía únicamente bajo el método de costo neto establecido en el párrafo 3 si la regla conforme al Anexo 4-B (Reglas de Origen Específicas por Producto) no provee una regla basada en el método de valor de transacción.`,
    officialUrl: 'https://www.gob.mx/cms/uploads/attachment/file/465788/04ESPReglasdeOrigen.pdf',
    version: 'Texto oficial T-MEC en español (Cap. 4)',
    topics: ['origen'],
    keywords: ['rvc', 'vcr', 'valor de contenido regional', 'art. 4.5', 'valor de transacción', 'costo neto', 'vmno', 'materiales no originarios', 'tmec', 'anexo 4-b'],
  },
  {
    // Fase 3.3-F — VERBATIM de la LIEPS consolidada (diputados.gob.mx, última
    // reforma DOF 07-11-2025), extraído del PDF oficial el 2026-07-02.
    type: 'ley', source: 'LIEPS', title: 'LIEPS — Crédito fiscal 100% IEPS en importación temporal con certificación (Art. 15-A)',
    reference: 'Art. 15-A LIEPS',
    content: `Crédito fiscal IEPS en importaciones temporales — Art. 15-A LIEPS (TEXTO VIGENTE): crédito del 100% del IEPS por importación temporal IMMEX/depósito fiscal automotriz/recinto fiscalizado (estratégico) con certificación del SAT; la certificación de este artículo tiene vigencia de UN AÑO renovable. Alternativa sin certificación: garantía del interés fiscal mediante fianza.

TEXTO VERBATIM:

Artículo 15-A. Las personas que introduzcan bienes a los regímenes aduaneros de importación temporal para elaboración, transformación o reparación en programas de maquila o de exportación; de depósito fiscal para someterse al proceso de ensamble y fabricación de vehículos; de elaboración, transformación o reparación en recinto fiscalizado, y de recinto fiscalizado estratégico, podrán aplicar un crédito fiscal consistente en una cantidad equivalente al 100% del impuesto especial sobre producción y servicios que deba pagarse por la importación, el cual será acreditable contra el impuesto especial sobre producción y servicios que deba pagarse por las citadas actividades, siempre que obtengan una certificación por parte del Servicio de Administración Tributaria. Para obtener dicha certificación, las empresas deberán acreditar que cumplen con los requisitos que permitan un adecuado control de las operaciones realizadas al amparo de los regímenes mencionados, de conformidad con las reglas de carácter general que al efecto emita dicho órgano.

La certificación a que se refiere el párrafo anterior tendrá una vigencia de un año y podrá ser renovada por las empresas dentro de los treinta días anteriores a que venza el plazo de vigencia, siempre que acrediten que continúan cumpliendo con los requisitos para su certificación.

El impuesto cubierto con el crédito fiscal previsto en este artículo, no será acreditable en forma alguna.

El crédito fiscal a que se refiere este artículo no se considerará como ingreso acumulable para los efectos del impuesto sobre la renta.

Las personas a que se refiere este artículo que no ejerzan la opción de certificarse, podrán no pagar el impuesto especial sobre producción y servicios por la introducción de los bienes a los regímenes aduaneros antes mencionados, siempre que garanticen el interés fiscal mediante fianza otorgada por institución autorizada, de conformidad con las reglas de carácter general que al efecto emita el Servicio de Administración Tributaria.

(Artículo adicionado DOF 11-12-2013.)`,
    officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIEPS.pdf',
    version: 'LIEPS vigente — últ. reforma DOF 07-11-2025',
    topics: ['iva_ieps', 'ieps'],
    keywords: ['ieps', 'crédito fiscal', 'art. 15-a lieps', 'certificación', 'importación temporal', 'immex', 'fianza', 'vigencia un año'],
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

    // Generar embedding. RECHAZA dims ≠ esperado (no persiste un fallback que
    // corrompería el corpus silenciosamente — ver assertCorpusEmbedding).
    const embedding = await generateEmbedding(`${doc.title}\n${doc.reference}\n${doc.content}`, 'document');
    assertCorpusEmbedding(embedding, doc.reference);

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
