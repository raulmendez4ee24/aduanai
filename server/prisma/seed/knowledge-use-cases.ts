/**
 * Seed: Casos de reclasificación por USO destinado vs material.
 *
 * Estos casos alimentan al clasificador IA cuando el sector declarado activa
 * la dualidad (cap 73 acero vs cap 87 autopartes, cap 39 plástico vs cap 87,
 * cap 85 electrónico vs cap 88 aeronáutico, cap 85/29 vs cap 90 médico, etc.).
 *
 * Idempotente: usa el campo `title` como llave de upsert para no duplicar
 * cuando se ejecuta varias veces.
 */

import { PrismaClient, KnowledgeType } from '@prisma/client';

interface UseCaseSeed {
  type: KnowledgeType;
  fractionCode?: string;
  chapterCode?: string;
  title: string;
  content: string;
  source: string;
  keywords: string[];
  products?: string[];
  priority?: number;
}

export const USE_CASE_KNOWLEDGE: UseCaseSeed[] = [
  // ── Tornillería automotriz: 7318 vs 8708 ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '87089999',
    chapterCode: '87',
    title: 'Tornillería automotriz importada por armadora — 73.18 vs 87.08',
    content: `Cuando una armadora terminal o autopartista importa tornillos, tuercas, pernos o arandelas que están específicamente diseñados para una pieza vehicular identificable (no son tornillos de uso general comercial), existen dos clasificaciones posibles:

POR MATERIAL (criterio mayoritario):
- Fracción 7318.15.XX o 7318.16.XX según tipo
- Aplica Nota 2 de la Sección XV: las "partes y accesorios de uso general" del cap 73 NO se reclasifican

POR USO DESTINADO (criterio aplicable en casos específicos):
- Fracción 8708.99.XX (partes y accesorios para vehículos)
- Aplica si el tornillo es identificable como parte específica del vehículo:
  • Forma específica (ej. tornillo de biela, tornillo de cabeza de motor)
  • Número de parte OEM asignado por la armadora
  • Material/tratamiento especial requerido por especificación automotriz
  • No es comercializable como tornillo genérico

REGLA PRÁCTICA:
- Tornillería estándar (DIN, ISO, ASME, SAE) → cap 73
- Tornillería con número OEM, plano técnico vinculante a una pieza vehicular → potencial cap 87

DOCUMENTACIÓN SOPORTE:
- Plano técnico de la pieza
- Número de parte OEM
- Contrato de suministro a armadora
- Certificación PPAP (Production Part Approval Process)

RIESGO: Reclasificar a 8708 sin sustento sólido genera PAMA por incorrecta clasificación. La autoridad típicamente prefiere cap 73 salvo evidencia clara de uso exclusivo automotriz.`,
    source: 'Anexo TIGIE — Notas Sección XV/XVII; criterio aplicado por TFJA en tesis sobre partes de uso general',
    keywords: ['tornillo', 'tornilleria', 'tuerca', 'arandela', 'perno', 'automotriz', 'armadora', 'oem', 'autoparte', 'ensamble vehicular'],
    products: ['tornillo automotriz', 'tornillo armadora', 'tornillo OEM', 'tornilleria autoparte'],
    priority: 9,
  },

  // ── Cables/arneses automotrices: 8544 vs 8708 ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '87089999',
    chapterCode: '87',
    title: 'Arneses y cables eléctricos automotrices — 85.44 vs 87.08',
    content: `Los cables eléctricos con conectores destinados a la industria automotriz pueden clasificarse en dos fracciones:

POR PRODUCTO (cap 85):
- 8544.30.XX — juegos de cables para bujías y demás juegos para vehículos
- 8544.42.XX — los demás cables con conectores
- 8544.49.XX — otros conductores eléctricos

POR USO DESTINADO (cap 87):
- 8708.99.XX cuando el arnés es identificable como parte específica de un vehículo
- Aplica si el arnés tiene la geometría completa, conectores OEM, fija exclusivamente en una pieza vehicular

CRITERIO DE DESEMPATE:
- Juegos de cables para bujías → siempre 8544.30 (es la subpartida específica)
- Arnés genérico vendible a múltiples ensambladores → 8544.42/49
- Arnés con número OEM exclusivo de una armadora → potencial 8708.99

NOTA SECCIÓN XVII: Las partes de cap 85 que sean partes "identificables como destinadas exclusivamente o principalmente" a vehículos pueden reclasificarse al cap 87.

DOCUMENTACIÓN: plano de arnés, número OEM, ficha técnica de la armadora, contrato de suministro.`,
    source: 'TIGIE Sección XVII; Notas legales 8544 y 8708',
    keywords: ['arnes', 'arnés', 'cable', 'cableado', 'automotriz', 'vehicular', 'oem', 'armadora', 'ensamble'],
    products: ['arnes automotriz', 'cableado automotriz', 'arnes electrico vehiculo'],
    priority: 9,
  },

  // ── Plásticos para autopartes: cap 39 vs cap 87 ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '87082999',
    chapterCode: '87',
    title: 'Piezas plásticas para autopartes — cap 39 vs 87.08',
    content: `Cuando se importa una pieza plástica con forma terminada para uso vehicular:

POR MATERIAL (cap 39):
- 3926.90.XX — manufacturas de plástico no expresadas en otra parte
- Aplica cuando la pieza es genérica o sin forma específica vehicular

POR USO DESTINADO (cap 87):
- 8708.29.XX — partes y accesorios de carrocería (tableros, defensas, parrillas, manijas, cubreruedas, paneles internos)
- 8708.10.XX — paragolpes y sus partes
- Aplica cuando la pieza tiene forma terminada de autoparte y se importa para ensamble vehicular

REGLA: Si la pieza tiene la forma final de una autoparte (defensa moldeada, tablero termoformado, parrilla con clips de fijación específicos) Y se importa por armadora/autopartista, va a cap 87.

NOTA 2 SECCIÓN XV (NO aplica cap 39): No es relevante porque cap 39 ≠ cap 73-83. Pero la analogía con la regla automotriz aplica vía Nota Sección XVII.

EJEMPLOS COMUNES:
- Tablero (dashboard) → 8708.29.99
- Defensa plástica → 8708.10.99
- Parrilla frontal → 8708.29.99
- Paneles internos → 8708.29.99
- Cubreruedas → 8708.29.99
- Tapas de espejo → 8708.29.99`,
    source: 'TIGIE Sección XVII Nota 2; criterio común agentes aduanales sector automotriz',
    keywords: ['plastico', 'plástico', 'tablero', 'defensa', 'parrilla', 'panel', 'cubrerueda', 'autoparte plastica', 'carrocería'],
    products: ['tablero auto', 'defensa plastica', 'parrilla auto', 'panel plastico vehiculo'],
    priority: 9,
  },

  // ── Hule para autopartes: cap 40 vs cap 87 ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '87089999',
    chapterCode: '87',
    title: 'Mangueras y sellos de hule para autopartes — cap 40 vs 87.08',
    content: `Productos de caucho/hule para sistemas vehiculares:

POR MATERIAL (cap 40):
- 4009.XX — tubos y mangueras de caucho vulcanizado
- 4016.93.XX — juntas, empaques y arandelas de caucho

POR USO DESTINADO (cap 87):
- 8708.99.XX — si la pieza es identificable como parte específica del motor o sistema vehicular
- 8708.91.XX — radiadores y sus partes (incluye mangueras de radiador)
- 8708.92.XX — silenciadores y tubos de escape

CRITERIO:
- Manguera de hule genérica vendida por longitud → cap 40
- Manguera con conectores y forma específica de motor (ej. manguera del turbo, manguera de admisión preformada) → potencial cap 87
- Sello/empaque genérico → cap 40
- Sello específico de motor con número OEM → potencial cap 87

DOCUMENTACIÓN: plano técnico de la pieza, número OEM, ficha de aplicación específica.`,
    source: 'TIGIE Sección XVII; criterio agentes aduanales',
    keywords: ['hule', 'caucho', 'manguera', 'sello', 'empaque', 'junta', 'automotriz', 'motor', 'radiador'],
    products: ['manguera radiador', 'sello motor', 'empaque automotriz', 'manguera turbo'],
    priority: 8,
  },

  // ── Componentes electrónicos aeronáuticos: cap 85 vs cap 88 ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '88033000',
    chapterCode: '88',
    title: 'Componentes electrónicos para aeronaves — cap 85 vs 88.03',
    content: `Cuando se importa un componente electrónico destinado a aeronave:

POR PRODUCTO (cap 85):
- Componentes electrónicos genéricos: cap 84/85 según función

POR USO DESTINADO (cap 88):
- 8803.30.XX — las demás partes de aviones o helicópteros
- Aplica si el componente está identificado, certificado y diseñado exclusivamente para aeronave

REGLA: Para aplicar cap 88, el componente DEBE tener:
- Certificación FAA/EASA/DGAC del componente
- Número de parte aeronáutico (P/N) específico
- Trazabilidad documental completa (Form 8130-3 o equivalente)
- No ser comercialmente intercambiable con producto no aeronáutico

DOCUMENTACIÓN OBLIGATORIA:
- Certificate of Conformity / Form 8130-3
- Type Certificate Data Sheet del fabricante
- Maintenance Manual reference
- Certificado del operador aéreo (si aplica)

RIESGO: Cap 88 tiene IGI 0% (preferencia general por uso aeronáutico). Reclasificar incorrectamente a cap 88 sin documentación es un riesgo alto de PAMA + recargos.`,
    source: 'TIGIE Sección XVII Nota 3; certificación aeronáutica DGAC',
    keywords: ['aeronave', 'aeronáutico', 'avion', 'helicoptero', 'aeroespacial', 'componente avion', 'parte aeronautica'],
    products: ['componente aeronautico', 'parte avion', 'electronico aeroespacial'],
    priority: 9,
  },

  // ── Componentes médicos: cap 85/29 vs cap 90 ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '90189090',
    chapterCode: '90',
    title: 'Componentes electrónicos para equipo médico — cap 85 vs 90.18',
    content: `Cuando un componente electrónico se importa para incorporarse a un instrumento médico:

POR PRODUCTO (cap 85):
- Componentes electrónicos genéricos en sus capítulos respectivos

POR USO DESTINADO (cap 90):
- 9018.90.XX — instrumentos y aparatos de medicina y veterinaria
- 9022.XX — aparatos de rayos X
- Aplica si el componente es parte identificable de un equipo médico certificado

REGLA: Para cap 90, el componente debe ser parte específica e identificable de un instrumento médico:
- No es genérico ni intercambiable con uso no médico
- Tiene certificación COFEPRIS o registro sanitario asociado al equipo final
- Especificación técnica del fabricante del equipo médico

EJEMPLOS:
- Sensor de oximetría con número de parte específico de monitor médico → 9018.19
- Pantalla genérica para monitor → 8528.52
- Pantalla específica con interfaz médica certificada → 9018.19/9018.90

NOTA 2 CAP 90: Las partes y accesorios identificables como destinados exclusivamente o principalmente a un instrumento de cap 90 se clasifican en cap 90.`,
    source: 'TIGIE Sección XVIII Nota 2; COFEPRIS dispositivos médicos',
    keywords: ['medico', 'médico', 'cofepris', 'dispositivo medico', 'instrumento medico', 'sensor medico', 'monitor medico'],
    products: ['sensor medico', 'componente equipo medico', 'pantalla medica'],
    priority: 9,
  },

  // ── Sustancias químicas: cap 28-29 vs cap 30 (medicamentos) ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '30049099',
    chapterCode: '30',
    title: 'Principio activo vs medicamento dosificado — cap 29 vs 30',
    content: `Una sustancia química idéntica puede ir a cap 29 o cap 30 según presentación:

POR FORMA (cap 29):
- 2933.XX, 2934.XX — principio activo a granel, sin dosificar
- IGI típicamente 0-7%

POR USO MEDICINAL DOSIFICADO (cap 30):
- 3003.XX — medicamentos sin dosificar para uso terapéutico
- 3004.XX — medicamentos dosificados (tabletas, cápsulas, ampolletas, jarabes)
- 3005.XX — apósitos, gasas, vendajes preparados
- 3006.XX — preparaciones farmacéuticas

REGLA: La presentación dosificada (forma terapéutica final, etiquetado de medicamento, registro sanitario) lleva al cap 30. La sustancia a granel sin acondicionar va a cap 28-29.

DOCUMENTACIÓN: registro sanitario COFEPRIS, certificado de buenas prácticas de fabricación, ficha técnica del producto terminado.`,
    source: 'TIGIE Notas legales cap 29 y 30; Reglamento Insumos para la Salud',
    keywords: ['medicamento', 'farmaceutico', 'principio activo', 'cofepris', 'dosificado', 'tableta', 'capsula'],
    products: ['medicamento', 'principio activo', 'producto farmaceutico'],
    priority: 8,
  },

  // ── Acero estructural: cap 72-73 vs uso vehicular ──
  {
    type: 'CASO_CLASIFICACION',
    fractionCode: '87082999',
    chapterCode: '87',
    title: 'Estampados de acero para autopartes — 72.08/73.26 vs 87.08',
    content: `Estampados, troquelados o piezas de acero formadas para uso automotriz:

POR MATERIAL/FORMA (cap 72-73):
- 7208/7209 — láminas planas
- 7326.90 — manufacturas de hierro/acero NEP

POR USO DESTINADO (cap 87):
- 8708.29.XX — partes de carrocería (estampados con forma de panel, refuerzo, larguero)
- 8708.99.XX — otras partes específicas

REGLA: Si la pieza está estampada con la forma final de un componente vehicular identificable (panel de carrocería, refuerzo de chasis, larguero, soporte de motor), va a cap 87.

EJEMPLOS:
- Lámina de acero plana cortada a medida → 7208.XX
- Pieza estampada con forma de capot → 8708.29
- Pieza estampada con forma de larguero de chasis → 8708.99
- Soporte de motor estampado y conformado → 8708.99`,
    source: 'TIGIE Sección XVII; Nota 2 sección XV (partes uso general)',
    keywords: ['acero', 'estampado', 'troquelado', 'lamina', 'panel auto', 'larguero', 'refuerzo', 'chasis'],
    products: ['estampado automotriz', 'panel auto', 'larguero chasis'],
    priority: 8,
  },

  // ── Error común — clasificar todo por uso sin sustento ──
  {
    type: 'ERROR_COMUN',
    chapterCode: '87',
    title: 'ERROR: Reclasificar todo a cap 87 sin sustento documental',
    content: `ERROR FRECUENTE: Algunos importadores con programa IMMEX automotriz reclasifican TODOS sus insumos a cap 87 (autopartes) buscando aprovechar la regla preferencial TMEC/cap 87. Esto es INCORRECTO.

CRITERIO CORRECTO:
1. La pieza debe ser identificable como parte específica del vehículo (forma, material especial, número OEM)
2. Debe haber documento que vincule la pieza a una aplicación vehicular concreta
3. La Nota 2 Sección XV excluye partes de "uso general" (tornillos, resortes, eslabones de cadena, alambres comunes)

CASOS DONDE EL CAP 87 NO APLICA aunque el importador sea automotriz:
- Insumos de uso general (tornillería estándar, alambre de cobre genérico, lámina sin estampar)
- Materias primas a granel (resinas plásticas, polvo metálico, aceros sin formar)
- Equipo de oficina, herramientas industriales, consumibles de planta

CONSECUENCIA DE ERROR: PAMA por incorrecta clasificación, multa 70-100% de contribuciones omitidas + recargos. Aún cuando la fracción cap 87 tenga arancel similar, la autoridad puede determinar reclasificación oficial con multa.

REGLA DE ORO: documenta siempre la VINCULACIÓN ESPECÍFICA pieza-vehículo. Sin documento, prevalece la clasificación por material.`,
    source: 'TIGIE Sección XV Nota 2; criterio TFJA y SAT en revisiones de operaciones IMMEX',
    keywords: ['error', 'reclasificacion', 'immex automotriz', 'pama', 'cap 87 incorrecto'],
    priority: 10,
  },
];

export async function seedUseCaseKnowledge(prisma: PrismaClient): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const k of USE_CASE_KNOWLEDGE) {
    const existing = await prisma.classificationKnowledge.findFirst({
      where: { title: k.title },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.classificationKnowledge.create({
      data: {
        type: k.type,
        fractionCode: k.fractionCode,
        chapterCode: k.chapterCode,
        title: k.title,
        content: k.content,
        source: k.source,
        keywords: k.keywords,
        products: k.products,
        priority: k.priority ?? 8,
        verified: true,
        verifiedBy: 'seed-use-cases',
      },
    });
    inserted++;
  }

  return { inserted, skipped };
}
