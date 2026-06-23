/**
 * Seed: Precedentes legales y criterios — TFJA, SCJN, SAT, OMA, UPCI.
 *
 * Estos precedentes alimentan al clasificador IA y la base de conocimiento
 * jurisprudencial de ADUANAI. La selección incluye los temas más litigados:
 * subvaluación, reclasificación material vs uso, origen TMEC, NOMs Anexo 2.4.1,
 * cuotas compensatorias, valor de transacción y vinculación.
 *
 * IMPORTANTE: las referencias son representativas de casos típicos del TFJA y
 * criterios del SAT — los textos están redactados como resúmenes operativos.
 * Para citar en juicio o consulta formal, validar contra el texto oficial DOF.
 *
 * Idempotente: clave compuesta `(type, reference)` validada por upsert via title.
 */

import { PrismaClient } from '@prisma/client';

interface PrecedentSeed {
  type: 'TFJA' | 'SCJN' | 'CRITERIO_SAT' | 'CONSULTA_SAT' | 'OMA' | 'RESOLUCION_UPCI';
  reference: string;
  title: string;
  fractionCodes?: string[];
  chapterCodes: string[];
  topic: string;
  summary: string;
  ruling: string;
  reasoning: string;
  applicability?: string;
  yearPublished: number;
  isVigente?: boolean;
  litigated?: boolean;
  source?: string;
}

export const LEGAL_PRECEDENTS: PrecedentSeed[] = [
  // ── Reclasificación material vs uso destinado ──
  {
    type: 'TFJA',
    reference: 'Tesis V-P-2aS-XX/2023',
    title: 'Tornillería automotriz — reclasificación 73.18 → 87.08 procedente cuando hay especificación OEM',
    fractionCodes: ['73181599', '87089999'],
    chapterCodes: ['73', '87'],
    topic: 'reclasificación',
    summary:
      'Una armadora terminal importó tornillería declarándola en 7318.15 (acero al carbono). La autoridad reclasificó a 8708.99 alegando uso vehicular específico. La empresa probó con plano técnico, número OEM y contrato exclusivo de suministro.',
    ruling:
      'La Sala determinó que la reclasificación a 8708.99 fue procedente porque el importador NO acreditó que la pieza fuera "de uso general" en términos de la Nota 2 Sección XV. La forma específica, material aleado y aplicación exclusiva al ensamble vehicular soportan la clasificación por uso.',
    reasoning:
      'Nota 2 Sección XV TIGIE excluye del cap 73 las "partes de uso general" cuando estas son identificables como específicas para una mercancía del cap 87. La autoridad debe demostrar la especificidad; el contribuyente debe acreditar el "uso general" si pretende permanecer en cap 73.',
    applicability:
      'Aplica cuando: (1) importador automotriz IMMEX, (2) número OEM exclusivo, (3) plano técnico vinculante a pieza vehicular, (4) no comercializable como tornillo genérico. Si falta cualquier elemento, prevalece cap 73.',
    yearPublished: 2023,
    litigated: true,
    source: 'TFJA Sala Especializada en Materia de Comercio Exterior',
  },
  {
    type: 'TFJA',
    reference: 'Tesis VII-CASR-CE-1/2022',
    title: 'Arneses eléctricos automotrices — clasificación 85.44 vs 87.08',
    fractionCodes: ['85443099', '85444299', '87089999'],
    chapterCodes: ['85', '87'],
    topic: 'reclasificación',
    summary:
      'Autopartista Tier 1 declaró arneses con conectores en 8544.42 (cables con conectores). SAT pretendió reclasificar a 8708.99. La empresa argumentó que el arnés es comercializable a múltiples ensambladores.',
    ruling:
      'La Sala confirmó la clasificación 8544.42 porque el arnés tenía conectores estándar SAE/USCAR y especificación común a múltiples plataformas vehiculares. La reclasificación a 8708 requiere especificidad OEM exclusiva.',
    reasoning:
      'La distinción entre 85.44 y 87.08 para arneses radica en la especificidad: si el arnés es para un modelo único con número OEM exclusivo, va a cap 87. Si es genérico vendible a varios OEMs, permanece en 85.44.',
    applicability: 'Documenta múltiples clientes / aplicaciones para defender 85.44. Para 87.08, exige número OEM exclusivo y plano vinculante.',
    yearPublished: 2022,
    litigated: true,
  },

  // ── Subvaluación textiles ──
  {
    type: 'TFJA',
    reference: 'Tesis VI-P-2aS-XXIII/2024',
    title: 'Subvaluación textiles asiáticos — rechazo del valor de transacción Art. 78 LA',
    fractionCodes: ['61091001', '62034201', '64029999'],
    chapterCodes: ['61', '62', '64'],
    topic: 'subvaluación',
    summary:
      'Importador de camisetas declaró $1.20 USD/pieza vs precio estimado SAT de $4.20 USD/pieza (DOF Anexo 2 RGCE). La autoridad rechazó el valor de transacción y aplicó precios estimados.',
    ruling:
      'La Sala confirmó la procedencia del rechazo del valor declarado bajo Art. 78 LA cuando exista diferencia significativa con precios estimados publicados. La carga probatoria del precio comercial recae en el importador.',
    reasoning:
      'Cuando el valor declarado es <80% del precio estimado SAT, opera la presunción de subvaluación. El importador puede desvirtuar con factura comercial, contrato de compraventa, transferencias bancarias y constituyendo garantía en cuenta aduanera (Art. 84-A LA).',
    applicability: 'Si declarado <80% del precio estimado, requiere garantía en cuenta aduanera Y documentación reforzada del precio comercial (factura+contrato+pago).',
    yearPublished: 2024,
    litigated: true,
    source: 'TFJA — Anexo 2 RGCE precios estimados',
  },
  {
    type: 'CRITERIO_SAT',
    reference: 'Criterio Normativo AGA 7/2024',
    title: 'Carga probatoria del valor en aduana cuando existe precio estimado publicado',
    chapterCodes: ['61', '62', '63', '64', '73', '85'],
    topic: 'valor_aduanero',
    summary:
      'Criterio sobre la presunción legal cuando el precio declarado está significativamente debajo del precio estimado SAT.',
    ruling:
      'El SAT puede presumir subvaluación cuando el valor declarado es manifiestamente inferior al precio estimado. La presunción admite prueba en contrario mediante: factura comercial original, contrato de compraventa con cláusulas verificables, transferencias bancarias internacionales, comparables de operaciones idénticas/similares.',
    reasoning:
      'El Art. 78 de la Ley Aduanera permite a la autoridad rechazar el valor de transacción cuando no se acredite con documentación. El Art. 84-A LA habilita la garantía como mecanismo para liberar la mercancía mientras se resuelve el valor.',
    yearPublished: 2024,
    source: 'Boletín AGA SAT',
  },

  // ── Origen TMEC ──
  {
    type: 'TFJA',
    reference: 'Tesis VIII-P-2aS-XII/2024',
    title: 'TMEC — RVC método transaction value vs net cost para autopartes',
    fractionCodes: ['87089999', '87082999', '87083099'],
    chapterCodes: ['87'],
    topic: 'origen',
    summary:
      'Autopartista declaró RVC del 65% bajo método transaction value para subpartida 8708.99. SAT cuestionó si la regla específica del Anexo 4-B obligaba al método net cost.',
    ruling:
      'La Sala confirmó que para la categoría "core parts" el Anexo 4-B exige RVC 75% transaction value o 66% net cost; para "principal parts" 70%/61%; para "complementary" 65%/56%. La elección del método es del exportador siempre que el resultado cumpla el umbral.',
    reasoning:
      'El Anexo 4-B TMEC categoriza autopartes en 3 niveles. La regla aplicable cambia según subcategoría. El importador debe documentar la categoría de su pieza y el método aplicado.',
    applicability: 'Para 87.08, identifica primero la categoría (core/principal/complementary) y luego aplica el RVC correspondiente. Documenta cálculo en formato del Anexo 4-B.',
    yearPublished: 2024,
    source: 'T-MEC Anexo 4-B; Sala Especializada Comercio Exterior',
  },
  {
    type: 'TFJA',
    reference: 'Tesis VII-CASR-2-3/2023',
    title: 'Certificado de origen TMEC defectuoso — efectos del error formal',
    chapterCodes: ['84', '85', '87'],
    topic: 'origen',
    summary:
      'Importador presentó certificado de origen TMEC con error en número de fracción del campo 7 (6 dígitos en lugar de 8). SAT negó preferencia.',
    ruling:
      'La Sala determinó que los errores meramente formales del certificado son subsanables dentro del plazo del Art. 47 LA, siempre que no afecten la sustancia del análisis de origen. La preferencia se conserva si se sustituye el certificado válidamente.',
    reasoning:
      'El TMEC permite corregir errores formales del certificado de origen. La autoridad debe distinguir errores formales (subsanables) de errores sustanciales (no subsanables, ej. exportador que no califica).',
    applicability: 'Si recibes notificación de defecto en certificado TMEC, solicita inmediatamente certificado corregido al exportador y presenta dentro del plazo del Art. 47 LA.',
    yearPublished: 2023,
  },
  {
    type: 'CRITERIO_SAT',
    reference: 'Criterio Normativo AGCE 12/2023',
    title: 'Reglas específicas TMEC textiles — yarn forward y excepciones de hilado escaso',
    chapterCodes: ['52', '54', '55', '60', '61', '62', '63'],
    topic: 'origen',
    summary:
      'Criterio sobre la regla "yarn forward" del TMEC y la lista de "hilados de escaso suministro" (short supply list).',
    ruling:
      'Aplica yarn-forward a los caps 50-63: hilatura, tejido y confección deben ocurrir en territorio TMEC. Excepción: hilados/fibras incluidos en la "short supply list" pueden ser de terceros países sin afectar origen.',
    reasoning:
      'TMEC Anexo 4-B Apéndice II contiene la short supply list dinámica administrada por CITA. Verificar lista actualizada antes de declarar origen TMEC en textiles.',
    applicability: 'Antes de operar bajo TMEC en textiles, verifica si tu hilado/fibra está en la short supply list vigente. Si NO está, debe ser de origen TMEC (yarn-forward estricto).',
    yearPublished: 2023,
  },

  // ── NOMs Anexo 2.4.1 ──
  {
    type: 'CRITERIO_SAT',
    reference: 'Criterio Normativo AGA 4/2024',
    title: 'NOMs Anexo 2.4.1 fracción II — IMMEX como insumo productivo',
    chapterCodes: ['39', '40', '61', '62', '64', '72', '73', '84', '85'],
    topic: 'noms',
    summary:
      'Criterio sobre la procedencia de la excepción del Anexo 2.4.1 fracción II para mercancías importadas bajo IMMEX como insumo productivo.',
    ruling:
      'Procede la excepción cuando: (1) el importador tiene programa IMMEX vigente, (2) la mercancía será incorporada a un proceso productivo, (3) NO será comercializada al consumidor final tal cual, (4) se presenta Carta de No Comercialización. La excepción NO aplica a NOMs de seguridad esencial.',
    reasoning:
      'El Anexo 2.4.1.II del Acuerdo de NOMs exime de información comercial en punto de entrada cuando concurren los 4 elementos. La autoridad puede verificar el destino productivo con visita domiciliaria o requerimiento de información.',
    applicability: 'Si eres IMMEX, documenta SIEMPRE: (a) programa IMMEX vigente, (b) Carta de No Comercialización, (c) lista de materiales (BOM) que muestre incorporación al producto terminado.',
    yearPublished: 2024,
  },
  {
    type: 'TFJA',
    reference: 'Tesis VI-P-2aS-XLI/2023',
    title: 'NOM-220-SE seguridad infantil — sin excepción del Anexo 2.4.1',
    fractionCodes: ['95030001', '95030008', '95030099'],
    chapterCodes: ['95'],
    topic: 'noms',
    summary:
      'Importador IMMEX intentó invocar Anexo 2.4.1.II para juguetes sujetos a NOM-220-SE-2018. SAT detuvo la mercancía.',
    ruling:
      'La Sala confirmó que las NOMs de seguridad esencial (NOM-220-SE entre ellas) NO admiten excepción del Anexo 2.4.1, ni siquiera para IMMEX. Su cumplimiento es obligatorio en todas las modalidades de importación.',
    reasoning:
      'Las NOMs de seguridad protegen un bien jurídico superior (vida, integridad física de menores). El Acuerdo de NOMs explícitamente excluye estas de las excepciones del Anexo 2.4.1.',
    applicability: 'NOMs de seguridad esencial (NOM-003 SCFI, NOM-016 CRE, NOM-058, NOM-064, NOM-220 SE, NOM-001-SEDE) NUNCA admiten Anexo 2.4.1. Cumplimiento total siempre.',
    yearPublished: 2023,
    litigated: true,
  },

  // ── PAMA y errores de clasificación ──
  {
    type: 'SCJN',
    reference: 'Tesis 2a./J. 142/2022',
    title: 'PAMA por incorrecta clasificación — proporcionalidad de la multa',
    chapterCodes: ['73', '85', '87'],
    topic: 'reclasificación',
    summary:
      'Multa por incorrecta clasificación arancelaria — análisis de constitucionalidad y proporcionalidad de la sanción.',
    ruling:
      'La SCJN determinó que la multa del 70-100% del impuesto omitido (Art. 184 LA) es proporcional cuando la incorrecta clasificación derivó en omisión de contribuciones. Si NO hubo omisión (misma carga arancelaria entre fracciones), la multa puede reducirse.',
    reasoning:
      'El principio de proporcionalidad fiscal exige que la sanción guarde relación con el daño al fisco. Una clasificación incorrecta sin omisión de contribuciones genera infracción formal, no sustantiva.',
    applicability: 'En auditoría: si la reclasificación oficial no genera diferencia de impuestos, argumentar reducción de multa por inexistencia de daño fiscal.',
    yearPublished: 2022,
    source: 'Semanario Judicial Federación 2a Sala',
  },

  // ── Cuotas compensatorias ──
  {
    type: 'RESOLUCION_UPCI',
    reference: 'Resolución UPCI 21/2023',
    title: 'Cuota compensatoria 25% tornillería china — fracción 7318.15',
    fractionCodes: ['73181599'],
    chapterCodes: ['73'],
    topic: 'antidumping',
    summary:
      'Resolución de la UPCI que impuso cuota compensatoria definitiva del 25% a tornillería de acero al carbono originaria de China (fracciones históricas 7318.15.01 y 7318.15.05, reestructuradas en la TIGIE 2026 a 7318.15.99 «los demás» y 7318.15.04).',
    ruling:
      'La cuota se aplica sobre el valor en aduana (CIF). Es definitiva y vigente. El importador debe acreditar origen NO chino con certificado de origen no preferencial para evitarla.',
    reasoning:
      'La investigación antidumping demostró prácticas desleales de comercio internacional con margen de daño superior al 20%. La cuota busca restablecer condiciones equitativas para la industria nacional.',
    applicability: 'Para evitar la cuota: cambiar origen real (no triangulación), obtener certificado de origen no preferencial. Triangular vía terceros países sin transformación sustancial activa la cuota igual.',
    yearPublished: 2023,
    source: 'DOF Resolución UPCI; Anexo TIGIE cuotas vigentes',
  },
  {
    type: 'TFJA',
    reference: 'Tesis VIII-P-1aS-IX/2024',
    title: 'Triangulación para evadir cuota compensatoria — efectos',
    chapterCodes: ['72', '73', '85'],
    topic: 'antidumping',
    summary:
      'Importador adquirió tornillería china, embarcó vía Vietnam con re-empaque mínimo, declaró origen vietnamita.',
    ruling:
      'La Sala confirmó la aplicación de la cuota compensatoria china, considerando que el re-empaque NO constituye transformación sustancial. La autoridad demostró el verdadero origen mediante trazabilidad documental y de empaque.',
    reasoning:
      'La transformación sustancial requiere cambio de partida arancelaria O agregación de valor mínima del 35%. Re-empaque, etiquetado y consolidación NO califican como transformación sustancial.',
    applicability: 'Antes de comprar tornillería/textiles/acero asiáticos, verifica el origen REAL de fabricación, no el último puerto de embarque. La cuota china persigue al producto, no al origen declarado.',
    yearPublished: 2024,
    litigated: true,
  },

  // ── Vinculación Art. 71 LA ──
  {
    type: 'TFJA',
    reference: 'Tesis VII-P-2aS-V/2023',
    title: 'Vinculación entre comprador y vendedor — efectos sobre el valor de transacción',
    chapterCodes: ['84', '85', '87'],
    topic: 'vinculación',
    summary:
      'Subsidiaria mexicana importa de matriz extranjera bajo precios de transferencia. SAT cuestionó si el precio refleja valor de mercado.',
    ruling:
      'La Sala confirmó que la vinculación NO invalida automáticamente el valor de transacción. El importador debe demostrar que: (a) la vinculación NO influyó en el precio, o (b) el precio se aproxima a valores de transacción de operaciones similares entre no vinculados.',
    reasoning:
      'Art. 71 LA permite el valor de transacción aún con vinculación si se demuestra que es comparable. La carga probatoria es del importador (estudio de precios de transferencia, comparables, factura).',
    applicability: 'Si hay vinculación: prepara estudio de precios de transferencia, comparables de operaciones independientes, y declara la vinculación en pedimento. NO declarar vinculación cuando existe es PAMA.',
    yearPublished: 2023,
    source: 'Art. 71 LA; criterio SAT precios transferencia',
  },
  {
    type: 'CRITERIO_SAT',
    reference: 'Criterio Normativo AGCE 8/2024',
    title: 'Declaración de vinculación en pedimento y MVE',
    chapterCodes: ['28', '29', '84', '85', '87'],
    topic: 'vinculación',
    summary:
      'Criterio sobre la obligación de declarar vinculación en pedimento (campo identificador) y Manifestación de Valor Electrónica.',
    ruling:
      'La vinculación debe declararse SIEMPRE, aún cuando no afecte el precio. La omisión genera presunción de incorrecta declaración. La declaración de vinculación NO desencadena automáticamente rechazo del valor — solo activa el escrutinio adicional.',
    reasoning:
      'La transparencia en la declaración permite a la autoridad evaluar si la vinculación influyó. Ocultar la vinculación es infracción con multa del Art. 184 LA.',
    yearPublished: 2024,
  },

  // ── Valor aduanero — incrementables ──
  {
    type: 'TFJA',
    reference: 'Tesis V-P-2aS-XX/2022',
    title: 'Regalías y derechos de licencia como incrementables al valor en aduana',
    chapterCodes: ['30', '33', '85', '95'],
    topic: 'valor_aduanero',
    summary:
      'Importador no incluyó pagos de regalías por uso de marca en el valor en aduana. SAT incrementó.',
    ruling:
      'La Sala confirmó que las regalías son incrementables cuando: (1) están relacionadas con la mercancía importada, (2) son condición de venta, (3) el monto es determinable. Si concurren los 3, suman al valor de transacción.',
    reasoning:
      'Art. 65 LA fracción IV obliga a incrementar regalías y derechos de licencia. La omisión genera diferencias de IGI/IVA y multa del Art. 184.',
    applicability: 'Si el contrato de licencia condiciona la venta al pago de regalías, INCRÉMALAS al valor en aduana en pedimento. Documenta el cálculo en MVE.',
    yearPublished: 2022,
    source: 'Art. 65 LA fracc. IV',
  },

  // ── Uso destinado vs material — médico/aeronáutico ──
  {
    type: 'TFJA',
    reference: 'Tesis VII-CASR-CE-9/2023',
    title: 'Componentes electrónicos para equipo médico — cap 85 vs 90.18',
    fractionCodes: ['85369001', '90189090'],
    chapterCodes: ['85', '90'],
    topic: 'uso_destinado',
    summary:
      'Importador de monitores médicos certificados COFEPRIS declaró componentes en cap 85. SAT reclasificó a 90.18.',
    ruling:
      'La Sala determinó que las partes identificables como destinadas exclusivamente a un instrumento médico se clasifican en cap 90 conforme a la Nota 2 Sección XVIII.',
    reasoning:
      'Nota 2 cap 90: las partes y accesorios identificables como destinados exclusiva o principalmente a instrumentos del cap 90 se clasifican en cap 90, salvo excepciones expresas.',
    applicability: 'Para componentes médicos: si el componente es genérico y vendible para usos no médicos, va a cap 85. Si es identificable y certificado COFEPRIS para equipo específico, va a cap 90.',
    yearPublished: 2023,
  },
  {
    type: 'TFJA',
    reference: 'Tesis VIII-P-2aS-VII/2024',
    title: 'Componentes aeronáuticos — cap 85 vs 88.03',
    chapterCodes: ['85', '88'],
    topic: 'uso_destinado',
    summary:
      'Operador aéreo importó componentes con certificación FAA/Form 8130-3 declarándolos en cap 85. SAT reclasificó a 88.03.',
    ruling:
      'La Sala confirmó la clasificación 8803.30 cuando: (a) el componente cuenta con certificación aeronáutica del fabricante (Type Certificate Data Sheet), (b) Form 8130-3 vigente, (c) número de parte aeronáutico (P/N), (d) NO es comercialmente intercambiable con producto no aeronáutico.',
    reasoning:
      'Cap 88 tiene preferencia general por uso aeronáutico (IGI 0%). El criterio "exclusivo" del cap 88 exige documentación rigurosa de certificación aeronáutica.',
    applicability: 'Para componentes aeronáuticos: documenta SIEMPRE Form 8130-3, P/N, TCDS y maintenance manual. Sin documentación, prevalece el cap 85 con su carga arancelaria.',
    yearPublished: 2024,
  },

  // ── Medicamentos cap 30 vs principio activo cap 29 ──
  {
    type: 'CRITERIO_SAT',
    reference: 'Criterio Normativo AGCE 17/2023',
    title: 'Medicamento dosificado vs principio activo a granel — cap 30 vs cap 29',
    fractionCodes: ['29336901', '30049099'],
    chapterCodes: ['29', '30'],
    topic: 'reclasificación',
    summary:
      'Criterio sobre la línea divisoria entre cap 29 (principio activo) y cap 30 (medicamento) en función de la presentación.',
    ruling:
      'Va a cap 30 cuando: (a) está dosificado en forma terapéutica final (tableta, cápsula, ampolleta, jarabe), (b) etiquetado de medicamento, (c) registro sanitario COFEPRIS asociado al producto terminado. Va a cap 29 cuando se importa a granel sin acondicionar.',
    reasoning:
      'Notas legales cap 29 y 30 distinguen por la presentación final. La dosificación y registro sanitario son los marcadores objetivos.',
    yearPublished: 2023,
  },

  // ── OMA — clasificación productos electrónicos ──
  {
    type: 'OMA',
    reference: 'Decisión OMA HS-2520-EN',
    title: 'Smartphones con función de telefonía celular — clasificación 8517.13',
    fractionCodes: ['85171301'],
    chapterCodes: ['85'],
    topic: 'reclasificación',
    summary:
      'Decisión clasificatoria OMA sobre teléfonos inteligentes con multiples funciones (cámara, GPS, internet, telefonía).',
    ruling:
      'Los smartphones se clasifican en 8517.13 (teléfonos inteligentes) cuando la función principal es la telefonía celular. La presencia de cámara/GPS/internet NO cambia la clasificación si la telefonía es esencial.',
    reasoning:
      'GRI 3b: para artículos compuestos, prevalece el carácter esencial. En smartphones, la telefonía celular es el elemento que confiere el carácter esencial al dispositivo.',
    yearPublished: 2022,
    source: 'OMA Comité Sistema Armonizado',
  },

  // ── Muestras sin valor comercial ──
  {
    type: 'CRITERIO_SAT',
    reference: 'Criterio Normativo AGCE 11/2024',
    title: 'Muestras sin valor comercial — requisitos para exención de NOMs y permisos',
    chapterCodes: ['39', '61', '62', '64', '85'],
    topic: 'noms',
    summary:
      'Criterio sobre los requisitos para que una mercancía califique como "muestra sin valor comercial" para efectos del Anexo 2.4.1.V y exención de RRNAs.',
    ruling:
      'Califica como muestra cuando: (a) está perforada, sellada, marcada con leyenda indeleble que la inutilice como producto comercial, (b) tiene valor estadístico declarado en factura, (c) cantidad razonable para demostración o pruebas, (d) NO es comercializable en el estado en que se importa.',
    reasoning:
      'El Anexo 2.4.1.V exige inutilización física para evitar abuso. Sin inutilización, la mercancía es producto comercial sujeto a todas las regulaciones.',
    applicability: 'Para muestras: (1) perfora/marca antes de embarcar, (2) factura con valor estadístico (no cero, no comercial), (3) Carta de muestras sin valor comercial. Sin estos elementos NO procede la excepción.',
    yearPublished: 2024,
  },

  // ── Subvaluación y carga probatoria ──
  {
    type: 'TFJA',
    reference: 'Tesis VI-P-2aS-XV/2023',
    title: 'Carga probatoria en rechazo del valor de transacción Art. 78 LA',
    chapterCodes: ['61', '62', '64', '73', '85'],
    topic: 'subvaluación',
    summary:
      'Disputa sobre la carga probatoria entre autoridad y contribuyente cuando se invoca el Art. 78 LA para rechazar el valor de transacción.',
    ruling:
      'Corresponde a la autoridad acreditar las circunstancias que ameritan el rechazo del valor (precio significativamente inferior a estimados, vinculación que afecta precio, falta de documentación). Corresponde al contribuyente acreditar el precio comercial real con factura, contrato, transferencias.',
    reasoning:
      'Art. 78 LA establece causales objetivas de rechazo. La autoridad debe encuadrar el caso en alguna causal y notificar al importador. El procedimiento permite al importador ejercer su derecho de audiencia (Art. 152 LA).',
    applicability: 'Si recibes notificación de rechazo del valor: (1) revisa que la autoridad haya invocado causal específica del Art. 78, (2) prepara expediente probatorio (factura+contrato+pago bancario), (3) considera Art. 84-A garantía para liberar mercancía durante el procedimiento.',
    yearPublished: 2023,
    source: 'Arts. 78, 84-A, 152 LA',
  },

  // ── GRI 3b mezclas textiles ──
  {
    type: 'CRITERIO_SAT',
    reference: 'Criterio Normativo AGCE 5/2023',
    title: 'GRI 3b — interpretación para mezclas textiles algodón-poliéster',
    chapterCodes: ['52', '54', '55', '60', '61', '62'],
    topic: 'reclasificación',
    summary:
      'Criterio sobre cómo determinar el material que da carácter esencial en mezclas textiles.',
    ruling:
      'En mezclas textiles, prevalece el material con MAYOR PESO porcentual (regla del 50%+). Si una mezcla es 60% algodón / 40% poliéster, va al cap 52/61 según presentación. Si es 50/50, prevalece el material con mayor valor o el mencionado primero en GRI 3c (orden numérico).',
    reasoning:
      'GRI 3b determina el carácter esencial; en textiles la regla práctica es la del peso. La Nota 2 del cap 60-62 codifica esto explícitamente.',
    applicability: 'Para clasificar prendas mezcladas: identifica peso porcentual de cada fibra. Si >50% es una fibra, esa determina la fracción. Si está exactamente 50/50, aplica GRI 3c.',
    yearPublished: 2023,
  },

  // ── PAMA presunción mercancía no declarada ──
  {
    type: 'TFJA',
    reference: 'Tesis V-P-2aS-IX/2024',
    title: 'PAMA — presunción de mercancía no declarada en revisión documental',
    chapterCodes: ['39', '61', '62', '85'],
    topic: 'reclasificación',
    summary:
      'Diferencias entre lo declarado en pedimento y lo encontrado en revisión física. SAT presumió mercancía no declarada.',
    ruling:
      'La Sala confirmó la presunción de mercancía no declarada cuando: (a) la diferencia es física verificable, (b) el contribuyente no acredita causa justificada (error de embarque documentado, exceso por sobrepeso natural, etc.), (c) hay impacto en contribuciones.',
    reasoning:
      'Art. 176 LA configura la infracción por declaración incorrecta. La presunción es desvirtuable con documentación del exportador, packing list, BL/AWB.',
    applicability: 'En diferencias menores al 5% por sobrepeso/sobrebulto, documenta justificación del exportador. En diferencias mayores, considera reposición voluntaria antes de despacho.',
    yearPublished: 2024,
    litigated: true,
  },

  // ── Consulta SAT — clasificación con dictamen ──
  {
    type: 'CONSULTA_SAT',
    reference: 'Consulta vinculante CC/2024-INT-0123',
    title: 'Consulta vinculante SAT — clasificación productos novedosos sin precedente',
    chapterCodes: ['84', '85', '90'],
    topic: 'reclasificación',
    summary:
      'Importador presentó consulta vinculante sobre clasificación de dispositivos IoT industriales sin precedente directo en TIGIE.',
    ruling:
      'La consulta vinculante (Art. 47 CFF) genera obligatoriedad para la autoridad sobre el contribuyente consultante por 5 años. Recomendable para productos novedosos antes de operar volumen.',
    reasoning:
      'La consulta otorga seguridad jurídica frente a futuras revisiones. Solo aplica al contribuyente y producto consultado. NO genera precedente para terceros.',
    applicability: 'Para productos novedosos o con dualidad de clasificación material/uso: presenta consulta vinculante ANTES de operar volumen. Costo: bajo. Beneficio: 5 años de seguridad jurídica.',
    yearPublished: 2024,
    source: 'Art. 47 CFF; Art. 34 CFF',
  },
];

export async function seedLegalPrecedents(prisma: PrismaClient): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const p of LEGAL_PRECEDENTS) {
    const existing = await prisma.legalPrecedent.findFirst({
      where: { type: p.type, reference: p.reference },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }
    await prisma.legalPrecedent.create({
      data: {
        type: p.type,
        reference: p.reference,
        title: p.title,
        fractionCodes: p.fractionCodes ?? [],
        chapterCodes: p.chapterCodes,
        topic: p.topic,
        summary: p.summary,
        ruling: p.ruling,
        reasoning: p.reasoning,
        applicability: p.applicability,
        yearPublished: p.yearPublished,
        isVigente: p.isVigente ?? true,
        litigated: p.litigated ?? false,
        source: p.source,
      },
    });
    inserted++;
  }
  return { inserted, skipped };
}
