/**
 * Guías "¿cómo se usa?" por módulo (Operación 2026-08).
 *
 * Cada ruta tiene título, pasos y una captura real de la pantalla en
 * `/ayuda/<slug>.png` (tomadas del producto, no maquetas). El botón "?" del
 * shell abre la guía; la primera visita a cada módulo la abre sola una vez
 * (marca en localStorage `aduanai_ayuda_vista:<slug>`).
 *
 * Regla: los pasos describen lo que la pantalla HACE hoy — nada prometido.
 */
export interface GuiaModulo {
  slug: string
  titulo: string
  resumen: string
  pasos: string[]
  /** Párrafo opcional "por qué importa": el contexto que el usuario nuevo no
   *  tiene y sin el cual los pasos no se entienden. */
  porQue?: string
  /** Ruta de la captura en /public/ayuda; opcional si aún no existe. */
  captura?: string
}

const G = (slug: string, titulo: string, resumen: string, pasos: string[]): GuiaModulo => ({
  slug, titulo, resumen, pasos, captura: `/ayuda/${slug}.png`,
})

/** Clave = prefijo de ruta (se elige el más largo que coincida). */
export const GUIAS: Record<string, GuiaModulo> = {
  '/app': G('inicio', 'Inicio', 'Tu tablero: qué vence, qué está pendiente de aprobar y qué cambió en el DOF.',
    ['Revisa las tarjetas de vencimientos y alertas con impacto en pesos.', 'Entra a cada módulo desde la barra lateral o con ⌘K.', 'El selector de cliente (arriba) filtra todo el producto por RFC.']),
  '/clasificador': G('clasificador', 'Clasificador', 'Hipótesis arancelaria con fuentes, para revisión profesional.',
    ['Describe el producto con material, uso y características (mínimo 2 palabras de 3+ letras).', 'Elige uso/destino (insumo IMMEX, venta directa, activo fijo): cambia NOMs y permisos.', 'Si el número de parte ya está en el catálogo, la respuesta es el dictamen vigente, no una corrida nueva.', 'Revisa alternativas descartadas y las subpartidas hermanas antes de aprobar.', 'Adjunta ficha técnica o foto; solicita dictamen humano si hay duda.']),
  '/clasificador/lote': G('clasificador-lote', 'Clasificador en lote', 'Sube un Excel con tus partidas y recibe las hipótesis con semáforo.',
    ['Descarga la plantilla y llena descripción (obligatoria), código, país, valor y uso.', 'Sube el archivo: cada fila entra a la cola y verás el progreso en vivo.', 'Verde = alta confianza y coincide con catálogo; ámbar = revisar; rojo = sin candidato.', 'Corrige las ámbar/rojas desde la tabla y exporta el Excel de salida.']),
  '/catalogo': G('catalogo', 'Catálogo de partes', 'Cliente → número de parte → fracción → NICO → NOMs → dictamen, versionado.',
    ['Importa tu catálogo desde Excel o promuévelo desde el Historial.', 'Cada parte tiene versiones: una reclasificación exige justificación y aprobación.', 'El Clasificador, el Cotizador, la Pre-Glosa y el Inventario usan esta misma parte.']),
  '/historial': G('historial', 'Historial', 'Todas tus clasificaciones, agrupadas por producto.',
    ['Marca ✓/✗ en cada clasificación: alimenta el acierto del modelo por capítulo.', 'Promueve al catálogo las que ya validaste.', 'Filtra por cliente, fracción, fecha o confianza y exporta a Excel.']),
  '/cotizador': G('cotizador', 'Cotizador', 'Desglose de impuestos y costo de despacho por partida, con escenarios.',
    ['Captura partidas (fracción, origen, valor, flete, seguro).', 'El sistema aplica IGI/IVA/IEPS, DTA por tipo de operación, cuotas compensatorias detectadas y honorarios del tabulador.', 'Guarda, duplica y versiona por cliente; compara escenarios (definitivo vs T-MEC vs PROSEC).', 'Exporta PDF con folio, vigencia y fecha DOF del tipo de cambio.']),
  '/simulador-glosa': G('preglosa', 'Pre-Glosa', 'Qué te observaría un glosador del SAT antes de transmitir.',
    ['Importa el archivo M3 o captura la operación (multipartida).', 'Cada regla declara fundamento y si pudo evaluarse; las no evaluadas se listan aparte.', 'Archiva el reporte al expediente de la operación con un clic.']),
  '/prevalidador': G('prevalidador', 'Pre-validador', 'El pedimento contra los catálogos del Anexo 22.',
    ['Sube el .txt M3 tal como sale de tu sistema o captura manualmente.', 'Los errores usan códigos conocidos (CLAVE_REGIMEN_MISMATCH, TC_OFF_DOF…) con su fundamento.', 'Consulta el catálogo completo de reglas en la pestaña "Reglas".']),
  '/inventario': G('inventario', 'Inventario IMMEX (Anexo 24)', 'Control por pedimento-partida y número de parte con descargo PEPS.',
    ['Da de alta importaciones desde el pedimento importado (M3/Data Stage).', 'Descarga con PEPS (más antiguo primero) o desde retorno con BOM y mermas.', 'Cierra el mes con candado; genera el reporte Anexo 24 en Excel/PDF.', 'Simula la exposición en pesos de lo que no descargues a tiempo.']),
  '/mve': G('mve', 'Auto MVE', 'Extracción de la factura y llenado del formato E2.',
    ['Sube la factura; revisa método de valoración, incrementables, vinculación y forma de pago.', 'Los proveedores recurrentes se recuerdan como plantilla.', 'El estatus es "lista para transmitir": la transmisión en VUCEM la haces tú con tu e.firma.']),
  '/fiscal': G('fiscal', 'Fiscal Guardian', 'Calendario vivo de la certificación IVA/IEPS y del crédito fiscal.',
    ['Revisa requisitos por rubro (A/AA/AAA) con semáforo por obligación.', 'Registra avisos (domicilio, socios, proveedores) antes de su fecha límite.', 'Concilia el crédito fiscal contra el Anexo 30 y simula el impacto de perder la certificación.']),
  '/origen-tmec': G('origen', 'Origen T-MEC', 'Determinación de origen: RVC, salto arancelario, de minimis, LVC.',
    ['Captura o toma del BOM los materiales con su fracción y origen.', 'El sistema aplica la regla específica de producto cuando existe en el catálogo; si no, lo dice.', 'Genera el certificado con los 9 elementos y solicita certificados a proveedores desde el portal.']),
  '/cuotas-activas': G('cuotas', 'Cuotas compensatorias', 'Resoluciones vigentes con tasas por exportador y vigencias.',
    ['Busca por fracción y país; revisa la tasa por empresa cuando la resolución la fija.', 'Las resoluciones antielusión se advierten en el Cotizador y generan alerta por cliente.']),
  '/alertas': G('alertas', 'Regulatorio / Alertas', 'Cambios del DOF y vencimientos con impacto en pesos.',
    ['Cada alerta trae acción en un clic (armar RT, cambio de régimen, revisar fracción).', 'Activa el digest semanal por correo o WhatsApp en Configuración.']),
  '/calendario': G('calendario', 'Calendario de obligaciones', 'SE, SAT, padrones, certificación: fechas, responsables y consecuencia.',
    ['Cada obligación tiene fecha límite, responsable y qué pasa si no se cumple.', 'Márcala cumplida con evidencia; las recurrentes se regeneran solas.']),
  '/copilot': G('copilot', 'Copilot legal', 'Respuestas fundamentadas en tu biblioteca legal, en el contexto de tu cliente.',
    ['Pregunta en lenguaje natural; cada cita se cruza contra el corpus (modo estricto).', 'Si el corpus no respalda una cita, el Copilot se abstiene: nunca verás una cita inventada.']),
  '/risk-scorer': {
    slug: 'risk',
    titulo: 'Risk Scorer',
    resumen: 'Mide por separado cuánto te expone una operación y cuánta evidencia la respalda. No es una opinión: son 26 reglas deterministas, cada una con su artículo, su cita textual y su fecha de cotejo.',
    porQue: 'Desde la reforma aduanera (DOF 19-11-2025) el Art. 54 de la Ley Aduanera ya no tiene excluyentes de responsabilidad: desapareció el listado de casos en que el agente aduanal "no responde", y el mismo artículo le exige asegurarse de que el importador cuenta con los documentos que acreditan el cumplimiento. En la práctica eso significa que tu única defensa es la evidencia documental. Este módulo es el mapa de esa evidencia: te dice dónde estás expuesto y qué parte de esa exposición ya está respaldada por documentos, antes de firmar.',
    pasos: [
      'Elige el sujeto: agente aduanal (quien responde por el Art. 54) o agencia. Captura la operación: fracción, país de origen, RFC del importador, pedimento, valor y padrones sectoriales activos.',
      'Responde las señales de cada bloque (valor y pago, cliente y padrones, expediente, tiempos, NOMs, documentos). Toda respuesta nace marcada "declarado por ti": vale para calcular, no para defenderte.',
      'Sube el documento que respalda una señal y ésa pasa a "verificado por el sistema". Eso es lo que sube tu escudo — lo que cuenta es la evidencia, no la respuesta.',
      'Lee el resultado en dos números que nunca se mezclan: exposición (0-100, qué tan expuesta está la operación) y escudo (0-100, qué porcentaje de esa exposición está respaldado), con su banda de verde a rojo crítico.',
      'Revisa la sección "No evaluadas": las señales que el motor no pudo calcular se listan aparte con el motivo (dato faltante, dataset vencido). Nunca se cuentan como cumplidas por omisión.',
      'Cada regla trae su fundamento citable — artículo, cita textual y fecha de cotejo — y las que aún no tienen fuente cotejada lo dicen en la propia fila.',
      'Exporta el dictamen en PDF con folio (RS-2026-0001) y hash verificable, y archívalo al expediente 59-V de la operación.',
      'Modo cartera (para el gerente): tus clientes ordenados por exposición, con su último score y su historial, para decidir a quién le firmas y a quién le pides papeles antes.',
    ],
    captura: '/ayuda/risk.png',
  },
  '/expediente': G('expedientes', 'Expedientes', 'Expediente electrónico por operación (59-V / 162-VII).',
    ['Checklist a)–h) con semáforo de completitud.', 'Sube documentos: la extracción IA puebla los datos y la glosa documental cruza factura, pedimento, BL y packing.', 'Exporta el paquete de auditoría (ZIP ordenado) cuando llegue una revisión.']),
  '/cambio-regimen': G('cambio-regimen', 'Cambio de régimen', 'F4/F5, A3 o RT: el expediente armado con sus impuestos.',
    ['Llega desde la alerta de vencimiento o elige las importaciones temporales con saldo.', 'El sistema calcula IGI/IVA/DTA sobre el saldo con el TC del sistema; actualización y recargos son editables.', 'Descarga el expediente con la lista de documentos requeridos.']),
  '/activo-fijo': G('activo-fijo', 'Activo fijo IMMEX', 'Alta, control y salida del activo fijo importado temporalmente.',
    ['Da de alta el activo (clave AF) con su vida útil; no tiene vencimiento fijo.', 'Al cierre: retorno o cambio de régimen F5 con el cálculo del asistente.']),
  '/defensa': G('defensa', 'Defensa (Cumplimiento + Auditoría)', 'Qué versión normativa, qué reglas y quién aprobó — con hash.',
    ['Por operación: versión TIGIE/RGCE, reglas corridas, aprobaciones y hash de la bitácora.', 'Genera el certificado de integridad en PDF por expediente.']),
  '/cumplimiento': G('defensa', 'Defensa (Cumplimiento + Auditoría)', 'Qué versión normativa, qué reglas y quién aprobó — con hash.',
    ['Por operación: versión TIGIE/RGCE, reglas corridas, aprobaciones y hash de la bitácora.', 'Genera el certificado de integridad en PDF por expediente.']),
  '/audit': G('auditoria', 'Auditoría', 'Bitácora con cadena de hashes de todo lo que pasa en tu cuenta.',
    ['Filtra por usuario, acción y fecha.', 'Verifica la integridad de la cadena y exporta.']),
  '/analytics': G('analytics', 'Analytics', 'Cuánto ahorraste, dónde está tu riesgo, cómo va tu equipo.',
    ['Ahorro no aprovechado (T-MEC/PROSEC no aplicados), riesgo por fracción/aduana, productividad por usuario.', 'Por cliente y exportable; los números cuadran con el Historial.']),
  '/fracciones': G('fracciones', 'Fracciones', 'Ficha completa de la fracción con fecha DOF de cada dato.',
    ['Navega por sección → capítulo → partida o busca por texto.', 'NICOs, IGI general y por tratado, PROSEC, cuotas, NOMs con excepciones, permisos, precios estimados.']),
  '/clientes': G('clientes', 'Clientes', 'Los RFC que operas: programa, certificación, padrones.',
    ['Da de alta o importa tus clientes; el selector global filtra todo por cliente.', 'Restringe usuarios a ciertos clientes desde Usuarios y roles.']),
  '/aprobaciones': G('aprobaciones', 'Aprobaciones', 'El junior propone, quien tiene patente aprueba.',
    ['Clasificaciones y cotizaciones pendientes por cliente.', 'Aprueba o rechaza con motivo: queda en la bitácora.']),
  '/radar': G('radar', 'Radar de pedimentos', 'Carga el archivo M y obtén el semáforo del lote.',
    ['Sube el archivo M; cada partida se evalúa con los criterios normativos vigentes.', 'Los errores de layout se listan línea por línea.']),
  '/biblioteca-legal': G('biblioteca', 'Biblioteca legal', 'El corpus que respalda al Copilot, con fecha de cotejo.',
    ['Cada documento indica fuente y versión; el detalle muestra si es texto íntegro o resumen.']),
  '/precedentes': G('precedentes', 'Precedentes', 'Criterios y tesis por fracción — solo con fuente verificada.',
    ['Se muestran solo precedentes con fuente; el resto está apagado por diseño.']),
  '/verificacion': G('verificacion', 'Verificación profesional', 'Patente/CSF para habilitar firmas y dictámenes.',
    ['Sube tu patente o CSF; revisa el aviso de privacidad y dónde viven tus datos.']),
  '/settings': G('configuracion', 'Configuración', 'Empresa, usuarios y roles, padrones, digest de alertas.',
    ['Asigna roles operativos (capturista, clasificador, glosador, gerente, cliente-consulta).', 'Activa el digest semanal y el canal (correo/WhatsApp).']),
}

export function guiaDeRuta(pathname: string): GuiaModulo | null {
  const claves = Object.keys(GUIAS).sort((a, b) => b.length - a.length)
  const k = claves.find(c => pathname === c || pathname.startsWith(c + '/'))
  return k ? GUIAS[k]! : null
}

const PREFIJO_VISTA = 'aduanai_ayuda_vista:'
export function ayudaYaVista(slug: string): boolean {
  try { return localStorage.getItem(PREFIJO_VISTA + slug) === '1' } catch { return true }
}
export function marcarAyudaVista(slug: string): void {
  try { localStorage.setItem(PREFIJO_VISTA + slug, '1') } catch { /* noop */ }
}
