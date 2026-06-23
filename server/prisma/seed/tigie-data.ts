// TIGIE 2026 — Datos de semilla
// Secciones, Capítulos y Fracciones arancelarias reales de México

export const SECTIONS = [
  { number: 'I', title: 'Animales vivos y productos del reino animal' },
  { number: 'II', title: 'Productos del reino vegetal' },
  { number: 'III', title: 'Grasas y aceites animales o vegetales; productos de su desdoblamiento; grasas alimenticias elaboradas; ceras de origen animal o vegetal' },
  { number: 'IV', title: 'Productos de las industrias alimentarias; bebidas, líquidos alcohólicos y vinagre; tabaco y sucedáneos del tabaco, elaborados' },
  { number: 'V', title: 'Productos minerales' },
  { number: 'VI', title: 'Productos de las industrias químicas o de las industrias conexas' },
  { number: 'VII', title: 'Plástico y sus manufacturas; caucho y sus manufacturas' },
  { number: 'VIII', title: 'Pieles, cueros, peletería y manufacturas de estas materias; artículos de talabartería o guarnicionería; artículos de viaje, bolsos de mano (carteras) y continentes similares; manufacturas de tripa' },
  { number: 'IX', title: 'Madera, carbón vegetal y manufacturas de madera; corcho y sus manufacturas; manufacturas de espartería o cestería' },
  { number: 'X', title: 'Pasta de madera o de las demás materias fibrosas celulósicas; papel o cartón para reciclar (desperdicios y desechos); papel o cartón y sus aplicaciones' },
  { number: 'XI', title: 'Materias textiles y sus manufacturas' },
  { number: 'XII', title: 'Calzado, sombreros y demás tocados, paraguas, quitasoles, bastones, látigos, fustas, y sus partes; plumas preparadas y artículos de plumas; flores artificiales; manufacturas de cabello' },
  { number: 'XIII', title: 'Manufacturas de piedra, yeso fraguable, cemento, amianto (asbesto), mica o materias análogas; productos cerámicos; vidrio y sus manufacturas' },
  { number: 'XIV', title: 'Perlas finas (naturales) o cultivadas, piedras preciosas o semipreciosas, metales preciosos, chapados de metal precioso (plaqué) y manufacturas de estas materias; bisutería; monedas' },
  { number: 'XV', title: 'Metales comunes y manufacturas de estos metales' },
  { number: 'XVI', title: 'Máquinas y aparatos, material eléctrico y sus partes; aparatos de grabación o reproducción de sonido, aparatos de grabación o reproducción de imagen y sonido en televisión, y las partes y accesorios de estos aparatos' },
  { number: 'XVII', title: 'Material de transporte' },
  { number: 'XVIII', title: 'Instrumentos y aparatos de óptica, fotografía o cinematografía, de medida, control o precisión; instrumentos y aparatos medicoquirúrgicos; aparatos de relojería; instrumentos musicales; partes y accesorios de estos instrumentos o aparatos' },
  { number: 'XIX', title: 'Armas, municiones, y sus partes y accesorios' },
  { number: 'XX', title: 'Mercancías y productos diversos' },
  { number: 'XXI', title: 'Objetos de arte o colección y antigüedades' },
  { number: 'XXII', title: 'Operaciones especiales' },
];

export const CHAPTERS = [
  // Sección I
  { number: '01', title: 'Animales vivos', sectionNumber: 'I', legalNotes: 'Este Capítulo comprende todos los animales vivos, excepto: a) Los peces y los crustáceos, moluscos y demás invertebrados acuáticos, de las partidas 03.01, 03.06, 03.07 ó 03.08; b) Los cultivos de microorganismos y demás productos de la partida 30.02; c) Los animales de la partida 95.08.' },
  { number: '02', title: 'Carne y despojos comestibles', sectionNumber: 'I' },
  { number: '03', title: 'Pescados y crustáceos, moluscos y demás invertebrados acuáticos', sectionNumber: 'I' },
  { number: '04', title: 'Leche y productos lácteos; huevos de ave; miel natural; productos comestibles de origen animal, no expresados ni comprendidos en otra parte', sectionNumber: 'I' },
  { number: '05', title: 'Los demás productos de origen animal no expresados ni comprendidos en otra parte', sectionNumber: 'I' },
  // Sección II
  { number: '06', title: 'Plantas vivas y productos de la floricultura', sectionNumber: 'II' },
  { number: '07', title: 'Hortalizas, plantas, raíces y tubérculos alimenticios', sectionNumber: 'II' },
  { number: '08', title: 'Frutas y frutos comestibles; cortezas de agrios (cítricos), melones o sandías', sectionNumber: 'II' },
  { number: '09', title: 'Café, té, yerba mate y especias', sectionNumber: 'II' },
  { number: '10', title: 'Cereales', sectionNumber: 'II' },
  { number: '11', title: 'Productos de la molinería; malta; almidón y fécula; inulina; gluten de trigo', sectionNumber: 'II' },
  { number: '12', title: 'Semillas y frutos oleaginosos; semillas y frutos diversos; plantas industriales o medicinales; paja y forraje', sectionNumber: 'II' },
  { number: '13', title: 'Gomas, resinas y demás jugos y extractos vegetales', sectionNumber: 'II' },
  { number: '14', title: 'Materias trenzables y demás productos de origen vegetal, no expresados ni comprendidos en otra parte', sectionNumber: 'II' },
  // Sección IV
  { number: '15', title: 'Grasas y aceites animales o vegetales; productos de su desdoblamiento; grasas alimenticias elaboradas; ceras de origen animal o vegetal', sectionNumber: 'III' },
  { number: '16', title: 'Preparaciones de carne, pescado o de crustáceos, moluscos o demás invertebrados acuáticos', sectionNumber: 'IV' },
  { number: '17', title: 'Azúcares y artículos de confitería', sectionNumber: 'IV' },
  { number: '18', title: 'Cacao y sus preparaciones', sectionNumber: 'IV' },
  { number: '19', title: 'Preparaciones a base de cereales, harina, almidón, fécula o leche; productos de pastelería', sectionNumber: 'IV' },
  { number: '20', title: 'Preparaciones de hortalizas, frutas u otros frutos o demás partes de plantas', sectionNumber: 'IV' },
  { number: '21', title: 'Preparaciones alimenticias diversas', sectionNumber: 'IV' },
  { number: '22', title: 'Bebidas, líquidos alcohólicos y vinagre', sectionNumber: 'IV' },
  { number: '23', title: 'Residuos y desperdicios de las industrias alimentarias; alimentos preparados para animales', sectionNumber: 'IV' },
  { number: '24', title: 'Tabaco y sucedáneos del tabaco elaborados', sectionNumber: 'IV' },
  // Sección V
  { number: '25', title: 'Sal; azufre; tierras y piedras; yesos, cales y cementos', sectionNumber: 'V' },
  { number: '26', title: 'Minerales metalíferos, escorias y cenizas', sectionNumber: 'V' },
  { number: '27', title: 'Combustibles minerales, aceites minerales y productos de su destilación; materias bituminosas; ceras minerales', sectionNumber: 'V' },
  // Sección VI
  { number: '28', title: 'Productos químicos inorgánicos; compuestos inorgánicos u orgánicos de metal precioso, de elementos radiactivos, de metales de las tierras raras o de isótopos', sectionNumber: 'VI' },
  { number: '29', title: 'Productos químicos orgánicos', sectionNumber: 'VI' },
  { number: '30', title: 'Productos farmacéuticos', sectionNumber: 'VI' },
  // Sección VI (cont.)
  { number: '33', title: 'Aceites esenciales y resinoides; preparaciones de perfumería, de tocador o de cosmética', sectionNumber: 'VI' },
  { number: '34', title: 'Jabón, agentes de superficie orgánicos, preparaciones para lavar, preparaciones lubricantes, ceras artificiales, ceras preparadas, productos de limpieza', sectionNumber: 'VI' },
  { number: '38', title: 'Productos diversos de las industrias químicas', sectionNumber: 'VI' },
  // Sección VII
  { number: '39', title: 'Plástico y sus manufacturas', sectionNumber: 'VII' },
  { number: '40', title: 'Caucho y sus manufacturas', sectionNumber: 'VII' },
  // Sección IX
  { number: '44', title: 'Madera, carbón vegetal y manufacturas de madera', sectionNumber: 'IX' },
  // Sección X
  { number: '48', title: 'Papel y cartón; manufacturas de pasta de celulosa, de papel o cartón', sectionNumber: 'X' },
  // Sección XI
  { number: '61', title: 'Prendas y complementos (accesorios), de vestir, de punto', sectionNumber: 'XI' },
  { number: '62', title: 'Prendas y complementos (accesorios), de vestir, excepto los de punto', sectionNumber: 'XI' },
  // Sección XII
  { number: '64', title: 'Calzado, polainas y artículos análogos; partes de estos artículos', sectionNumber: 'XII' },
  // Sección XIII
  { number: '69', title: 'Productos cerámicos', sectionNumber: 'XIII' },
  { number: '70', title: 'Vidrio y sus manufacturas', sectionNumber: 'XIII' },
  // Sección XIV
  { number: '71', title: 'Perlas finas (naturales) o cultivadas, piedras preciosas o semipreciosas, metales preciosos, chapados de metal precioso (plaqué) y manufacturas de estas materias; bisutería; monedas', sectionNumber: 'XIV' },
  // Sección XV
  { number: '72', title: 'Fundición, hierro y acero', sectionNumber: 'XV' },
  { number: '73', title: 'Manufacturas de fundición, hierro o acero', sectionNumber: 'XV' },
  { number: '76', title: 'Aluminio y sus manufacturas', sectionNumber: 'XV' },
  // Sección XVI — La más importante para IMMEX/maquilas
  { number: '84', title: 'Reactores nucleares, calderas, máquinas, aparatos y artefactos mecánicos; partes de estas máquinas o aparatos', sectionNumber: 'XVI' },
  { number: '85', title: 'Máquinas, aparatos y material eléctrico, y sus partes; aparatos de grabación o reproducción de sonido, aparatos de grabación o reproducción de imagen y sonido en televisión, y las partes y accesorios de estos aparatos', sectionNumber: 'XVI' },
  // Sección XVII
  { number: '87', title: 'Vehículos automóviles, tractores, velocípedos y demás vehículos terrestres; sus partes y accesorios', sectionNumber: 'XVII' },
  // Sección XVIII
  { number: '90', title: 'Instrumentos y aparatos de óptica, fotografía o cinematografía, de medida, control o precisión; instrumentos y aparatos medicoquirúrgicos; partes y accesorios de estos instrumentos o aparatos', sectionNumber: 'XVIII' },
  // Sección XX
  { number: '94', title: 'Muebles; mobiliario medicoquirúrgico; artículos de cama y similares; aparatos de alumbrado no expresados ni comprendidos en otra parte; anuncios, letreros y placas indicadoras luminosos y artículos similares; construcciones prefabricadas', sectionNumber: 'XX' },
  { number: '95', title: 'Juguetes, juegos y artículos para recreo o deporte; sus partes y accesorios', sectionNumber: 'XX' },
  { number: '96', title: 'Manufacturas diversas', sectionNumber: 'XX' },
];

// Fracciones arancelarias reales — muestra representativa de capítulos clave
export const FRACTIONS = [
  // ===== Cap 04 - Lácteos =====
  { code: '04011001', formatted: '0401.10.01', description: 'Leche y nata (crema), sin concentrar, sin adición de azúcar ni otro edulcorante, con un contenido de materias grasas inferior o igual al 1% en peso', chapter: '04', heading: '0401', subheading: '040110', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['leche', 'nata', 'crema', 'descremada'], noms: ['NOM-155-SCFI-2012'] },
  { code: '04012001', formatted: '0401.20.01', description: 'Leche y nata (crema), sin concentrar, con un contenido de materias grasas superior al 1% pero inferior o igual al 6% en peso', chapter: '04', heading: '0401', subheading: '040120', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['leche', 'semidescremada'], noms: ['NOM-155-SCFI-2012'] },
  { code: '04069099', formatted: '0406.90.99', description: 'Los demás quesos', chapter: '04', heading: '0406', subheading: '040690', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['queso', 'cheese', 'lácteo'], noms: ['NOM-121-SSA1-1994'], requiresPermit: false },

  // ===== Cap 08 - Frutas =====
  { code: '08030001', formatted: '0803.00.01', description: 'Bananas, incluidos los plátanos "plantains", frescos o secos', chapter: '08', heading: '0803', subheading: '080300', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['banana', 'plátano', 'fruta'], requiresPermit: true, permitType: 'SENASICA' },
  { code: '08051001', formatted: '0805.10.01', description: 'Naranjas frescas o secas', chapter: '08', heading: '0805', subheading: '080510', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['naranja', 'cítrico', 'fruta'] },
  { code: '08081001', formatted: '0808.10.01', description: 'Manzanas frescas', chapter: '08', heading: '0808', subheading: '080810', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['manzana', 'apple', 'fruta'] },

  // ===== Cap 22 - Bebidas =====
  { code: '22011001', formatted: '2201.10.01', description: 'Agua mineral y agua gaseada', chapter: '22', heading: '2201', subheading: '220110', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['agua', 'mineral', 'gaseada', 'bebida'], noms: ['NOM-201-SSA1-2015'] },
  { code: '22030001', formatted: '2203.00.01', description: 'Cerveza de malta', chapter: '22', heading: '2203', subheading: '220300', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['cerveza', 'beer', 'malta', 'bebida alcohólica'], iepsRate: 26.5, noms: ['NOM-142-SSA1-1995'] },
  { code: '22041001', formatted: '2204.10.01', description: 'Vino espumoso', chapter: '22', heading: '2204', subheading: '220410', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['vino', 'espumoso', 'champagne', 'bebida alcohólica'], iepsRate: 26.5 },
  { code: '22082001', formatted: '2208.20.01', description: 'Aguardientes de vino o de orujo de uvas (coñac, brandy, grappa)', chapter: '22', heading: '2208', subheading: '220820', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['brandy', 'coñac', 'aguardiente', 'destilado'], iepsRate: 53 },
  { code: '22083001', formatted: '2208.30.01', description: 'Whisky', chapter: '22', heading: '2208', subheading: '220830', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['whisky', 'whiskey', 'destilado'], iepsRate: 53 },
  { code: '22084001', formatted: '2208.40.01', description: 'Ron y demás aguardientes procedentes de la destilación, previa fermentación, de productos de la caña de azúcar', chapter: '22', heading: '2208', subheading: '220840', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['ron', 'rum', 'caña', 'destilado'], iepsRate: 53 },
  { code: '22089001', formatted: '2208.90.01', description: 'Tequila', chapter: '22', heading: '2208', subheading: '220890', unit: 'L', tariffNMF: 20, tariffTMEC: 0, keywords: ['tequila', 'agave', 'destilado'], iepsRate: 53 },

  // ===== Cap 27 - Combustibles =====
  { code: '27101201', formatted: '2710.12.01', description: 'Gasolinas, excepto las de aviación', chapter: '27', heading: '2710', subheading: '271012', unit: 'L', tariffNMF: 0, keywords: ['gasolina', 'combustible', 'petróleo'], iepsRate: 0, requiresPermit: true, permitType: 'SENER/CRE' },
  { code: '27101901', formatted: '2710.19.01', description: 'Diésel', chapter: '27', heading: '2710', subheading: '271019', unit: 'L', tariffNMF: 0, keywords: ['diésel', 'gasóleo', 'combustible'], requiresPermit: true, permitType: 'SENER/CRE' },

  // ===== Cap 30 - Farmacéuticos =====
  { code: '30049099', formatted: '3004.90.99', description: 'Los demás medicamentos constituidos por productos mezclados o sin mezclar, preparados para usos terapéuticos o profilácticos, dosificados o acondicionados para la venta al por menor', chapter: '30', heading: '3004', subheading: '300490', unit: 'Kg', tariffNMF: 0, keywords: ['medicamento', 'farmacéutico', 'medicina', 'salud'], noms: ['NOM-072-SSA1-2012'], requiresPermit: true, permitType: 'COFEPRIS' },

  // ===== Cap 39 - Plásticos =====
  { code: '39011001', formatted: '3901.10.01', description: 'Polietileno de densidad inferior a 0.94, en formas primarias', chapter: '39', heading: '3901', subheading: '390110', unit: 'Kg', tariffNMF: 3, tariffTMEC: 0, keywords: ['polietileno', 'plástico', 'LDPE', 'resina'] },
  { code: '39012001', formatted: '3901.20.01', description: 'Polietileno de densidad superior o igual a 0.94, en formas primarias', chapter: '39', heading: '3901', subheading: '390120', unit: 'Kg', tariffNMF: 3, tariffTMEC: 0, keywords: ['polietileno', 'plástico', 'HDPE', 'resina'] },
  { code: '39021001', formatted: '3902.10.01', description: 'Polipropileno, en formas primarias', chapter: '39', heading: '3902', subheading: '390210', unit: 'Kg', tariffNMF: 3, tariffTMEC: 0, keywords: ['polipropileno', 'plástico', 'PP', 'resina'] },
  { code: '39232101', formatted: '3923.21.01', description: 'Sacos (bolsas), bolsitas y cucuruchos de polímeros de etileno', chapter: '39', heading: '3923', subheading: '392321', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['bolsa', 'plástico', 'empaque', 'polietileno'] },

  // ===== Cap 72/73 - Acero =====
  { code: '72082501', formatted: '7208.25.01', description: 'Productos laminados planos de hierro o acero sin alear, de anchura superior o igual a 600 mm, laminados en caliente, de espesor superior o igual a 4.75 mm', chapter: '72', heading: '7208', subheading: '720825', unit: 'Kg', tariffNMF: 0, tariffTMEC: 0, keywords: ['acero', 'lámina', 'laminado', 'hierro', 'hot rolled'] },
  { code: '73181599', formatted: '7318.15.99', description: 'Los demás tornillos y pernos, incluso con sus tuercas y arandelas', chapter: '73', heading: '7318', subheading: '731815', unit: 'Kg', tariffNMF: 5, tariffTMEC: 0, keywords: ['tornillo', 'perno', 'ferretería', 'fijación'] },
  { code: '73269099', formatted: '7326.90.99', description: 'Las demás manufacturas de hierro o acero', chapter: '73', heading: '7326', subheading: '732690', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['manufactura', 'acero', 'hierro', 'metal'] },

  // ===== Cap 84 - Maquinaria (crítico para IMMEX) =====
  { code: '84071001', formatted: '8407.10.01', description: 'Motores de aviación', chapter: '84', heading: '8407', subheading: '840710', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['motor', 'aviación', 'aeronáutico'] },
  { code: '84099199', formatted: '8409.91.99', description: 'Partes identificables como destinadas, exclusiva o principalmente, a los motores de émbolo de encendido por chispa', chapter: '84', heading: '8409', subheading: '840991', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['motor', 'partes', 'pistón', 'automotriz'] },
  { code: '84143001', formatted: '8414.30.01', description: 'Compresores de los tipos utilizados en los equipos frigoríficos', chapter: '84', heading: '8414', subheading: '841430', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['compresor', 'refrigeración', 'frigorífico'] },
  { code: '84182101', formatted: '8418.21.01', description: 'Refrigeradores domésticos de compresión', chapter: '84', heading: '8418', subheading: '841821', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['refrigerador', 'nevera', 'electrodoméstico'], noms: ['NOM-015-ENER-2018'] },
  { code: '84189999', formatted: '8418.99.99', description: 'Partes de refrigeradores, congeladores y demás material para producción de frío', chapter: '84', heading: '8418', subheading: '841899', unit: 'Pza', tariffNMF: 10, tariffTMEC: 0, keywords: ['refrigerador', 'partes', 'refrigeración'] },
  { code: '84713001', formatted: '8471.30.01', description: 'Máquinas automáticas para tratamiento o procesamiento de datos, portátiles, de peso inferior o igual a 10 kg (laptops)', chapter: '84', heading: '8471', subheading: '847130', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['laptop', 'computadora', 'portátil', 'notebook', 'pc'] },
  { code: '84714101', formatted: '8471.41.01', description: 'Las demás máquinas automáticas para procesamiento de datos, que incluyan en una misma envolvente al menos una unidad central de proceso y una unidad de entrada y otra de salida (desktop)', chapter: '84', heading: '8471', subheading: '847141', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['computadora', 'desktop', 'PC', 'servidor'] },
  { code: '84715001', formatted: '8471.50.01', description: 'Unidades de proceso digitales, excepto las de las subpartidas 8471.41 u 8471.49, aunque incluyan en la misma envolvente uno o dos de los tipos siguientes de unidades: unidad de memoria, unidad de entrada y unidad de salida', chapter: '84', heading: '8471', subheading: '847150', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['procesador', 'servidor', 'CPU', 'unidad de proceso'] },
  { code: '84798999', formatted: '8479.89.99', description: 'Las demás máquinas y aparatos mecánicos con función propia, no expresados ni comprendidos en otra parte de este Capítulo', chapter: '84', heading: '8479', subheading: '847989', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['máquina', 'aparato', 'mecánico', 'industrial'] },

  // ===== Cap 85 - Material Eléctrico (crítico para maquilas) =====
  { code: '85044099', formatted: '8504.40.99', description: 'Los demás convertidores estáticos', chapter: '85', heading: '8504', subheading: '850440', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['convertidor', 'fuente de poder', 'transformador', 'eléctrico'] },
  { code: '85171401', formatted: '8517.14.01', description: 'Teléfonos inteligentes (smartphones)', chapter: '85', heading: '8517', subheading: '851714', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['teléfono', 'smartphone', 'celular', 'móvil'] },
  { code: '85176201', formatted: '8517.62.01', description: 'Aparatos para la recepción, conversión y transmisión o regeneración de voz, imagen u otros datos (routers, switches)', chapter: '85', heading: '8517', subheading: '851762', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['router', 'switch', 'red', 'telecomunicaciones', 'networking'] },
  { code: '85234901', formatted: '8523.49.01', description: 'Soportes ópticos grabados para reproducir imagen o imagen y sonido', chapter: '85', heading: '8523', subheading: '852349', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['DVD', 'Blu-ray', 'disco óptico', 'medio'] },
  { code: '85258001', formatted: '8525.80.01', description: 'Cámaras de televisión, cámaras fotográficas digitales y videocámaras', chapter: '85', heading: '8525', subheading: '852580', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['cámara', 'digital', 'video', 'fotografía'] },
  { code: '85285101', formatted: '8528.51.01', description: 'Monitores de los tipos utilizados exclusiva o principalmente con máquinas automáticas para procesamiento de datos', chapter: '85', heading: '8528', subheading: '852851', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['monitor', 'pantalla', 'display', 'computadora'] },
  { code: '85287201', formatted: '8528.72.01', description: 'Aparatos receptores de televisión en colores (televisores)', chapter: '85', heading: '8528', subheading: '852872', unit: 'Pza', tariffNMF: 15, tariffTMEC: 0, keywords: ['televisor', 'TV', 'televisión', 'pantalla'], noms: ['NOM-001-SCFI-2018'] },
  { code: '85340001', formatted: '8534.00.01', description: 'Circuitos impresos', chapter: '85', heading: '8534', subheading: '853400', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['PCB', 'circuito impreso', 'electrónica', 'tarjeta'] },
  { code: '85423101', formatted: '8542.31.01', description: 'Procesadores y controladores, incluso combinados con memorias, convertidores, circuitos lógicos, amplificadores, relojes y circuitos de sincronización', chapter: '85', heading: '8542', subheading: '854231', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['procesador', 'chip', 'semiconductor', 'microchip', 'CPU', 'circuito integrado'] },
  { code: '85423201', formatted: '8542.32.01', description: 'Memorias (circuitos integrados electrónicos)', chapter: '85', heading: '8542', subheading: '854232', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['memoria', 'RAM', 'DRAM', 'flash', 'semiconductor', 'chip'] },
  { code: '85444201', formatted: '8544.42.01', description: 'Los demás conductores eléctricos, para una tensión inferior o igual a 1,000 V, provistos de piezas de conexión', chapter: '85', heading: '8544', subheading: '854442', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['cable', 'conductor', 'arnés', 'wiring harness', 'eléctrico'] },

  // ===== Cap 87 - Vehículos (clave para TMEC) =====
  { code: '87032101', formatted: '8703.21.01', description: 'Vehículos de turismo con motor de émbolo de cilindrada inferior o igual a 1,000 cm³', chapter: '87', heading: '8703', subheading: '870321', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['automóvil', 'coche', 'carro', 'vehículo', 'sedan'] },
  { code: '87032301', formatted: '8703.23.01', description: 'Vehículos de turismo con motor de émbolo de cilindrada superior a 1,500 cm³ pero inferior o igual a 3,000 cm³', chapter: '87', heading: '8703', subheading: '870323', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['automóvil', 'coche', 'sedán', 'vehículo'] },
  { code: '87038001', formatted: '8703.80.01', description: 'Los demás vehículos con motor eléctrico para la propulsión', chapter: '87', heading: '8703', subheading: '870380', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['vehículo eléctrico', 'EV', 'auto eléctrico', 'Tesla'] },
  { code: '87041001', formatted: '8704.10.01', description: 'Volquetes automotores concebidos para utilizarlos fuera de la red de carreteras', chapter: '87', heading: '8704', subheading: '870410', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['camión', 'volquete', 'dump truck', 'minería'] },
  { code: '87082999', formatted: '8708.29.99', description: 'Las demás partes y accesorios de carrocería, incluidas las de cabina', chapter: '87', heading: '8708', subheading: '870829', unit: 'Pza', tariffNMF: 10, tariffTMEC: 0, keywords: ['autopartes', 'carrocería', 'automotriz', 'partes'] },
  { code: '87089999', formatted: '8708.99.99', description: 'Las demás partes y accesorios de vehículos automóviles', chapter: '87', heading: '8708', subheading: '870899', unit: 'Pza', tariffNMF: 10, tariffTMEC: 0, keywords: ['autopartes', 'refacciones', 'automotriz', 'accesorios'] },

  // ===== Cap 90 - Instrumentos =====
  { code: '90189099', formatted: '9018.90.99', description: 'Los demás instrumentos y aparatos de medicina, cirugía, odontología o veterinaria', chapter: '90', heading: '9018', subheading: '901890', unit: 'Pza', tariffNMF: 0, tariffTMEC: 0, keywords: ['instrumento médico', 'quirúrgico', 'dispositivo médico', 'salud'], requiresPermit: true, permitType: 'COFEPRIS' },

  // ===== Cap 94 - Muebles =====
  { code: '94017101', formatted: '9401.71.01', description: 'Asientos con armazón de metal, con relleno', chapter: '94', heading: '9401', subheading: '940171', unit: 'Pza', tariffNMF: 15, tariffTMEC: 0, keywords: ['silla', 'asiento', 'mueble', 'metal'] },
  { code: '94036001', formatted: '9403.60.01', description: 'Los demás muebles de madera', chapter: '94', heading: '9403', subheading: '940360', unit: 'Pza', tariffNMF: 15, tariffTMEC: 0, keywords: ['mueble', 'madera', 'mobiliario'], noms: ['NOM-004-SE-2021'] },

  // ===== Cap 95 - Juguetes =====
  { code: '95030001', formatted: '9503.00.01', description: 'Triciclos, patinetes, coches de pedal y juguetes similares con ruedas; coches y sillas de ruedas para muñecas o muñecos; muñecas o muñecos; los demás juguetes; modelos reducidos y modelos similares, para entretenimiento, incluso animados; rompecabezas de cualquier clase', chapter: '95', heading: '9503', subheading: '950300', unit: 'Pza', tariffNMF: 15, tariffTMEC: 0, keywords: ['juguete', 'muñeca', 'juego', 'toy'], noms: ['NOM-252-SSA1-2011'] },

  // ===== Cap 19 - Preparaciones a base de cereales =====
  { code: '19021101', formatted: '1902.11.01', description: 'Pastas alimenticias sin cocer, rellenar ni preparar de otra forma, que contengan huevo', chapter: '19', heading: '1902', subheading: '190211', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['pasta', 'espagueti', 'fideo', 'huevo'], noms: ['NOM-247-SSA1-2008'] },
  { code: '19021901', formatted: '1902.19.01', description: 'Las demás pastas alimenticias sin cocer, rellenar ni preparar de otra forma', chapter: '19', heading: '1902', subheading: '190219', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['pasta', 'espagueti', 'macarrón', 'fideo'], noms: ['NOM-247-SSA1-2008'] },
  { code: '19053101', formatted: '1905.31.01', description: 'Galletas dulces (con adición de edulcorante)', chapter: '19', heading: '1905', subheading: '190531', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['galleta', 'dulce', 'cookie', 'bizcocho'], noms: ['NOM-247-SSA1-2008'] },
  { code: '19054001', formatted: '1905.40.01', description: 'Pan tostado y productos similares tostados', chapter: '19', heading: '1905', subheading: '190540', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['pan', 'tostado', 'biscote', 'panadería'], noms: ['NOM-247-SSA1-2008'] },
  { code: '19059099', formatted: '1905.90.99', description: 'Los demás productos de panadería, pastelería o galletería', chapter: '19', heading: '1905', subheading: '190590', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['pan', 'pastel', 'panadería', 'tortilla de harina'], noms: ['NOM-247-SSA1-2008'] },

  // ===== Cap 21 - Preparaciones alimenticias diversas =====
  { code: '21031001', formatted: '2103.10.01', description: 'Salsa de soja (soya)', chapter: '21', heading: '2103', subheading: '210310', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['salsa', 'soya', 'soja', 'condimento'], noms: ['NOM-051-SCFI/SSA1-2010'], requiresPermit: true, permitType: 'SENASICA' },
  { code: '21032001', formatted: '2103.20.01', description: 'Kétchup y demás salsas de tomate', chapter: '21', heading: '2103', subheading: '210320', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['kétchup', 'salsa', 'tomate', 'cátsup'], noms: ['NOM-051-SCFI/SSA1-2010'] },
  { code: '21033001', formatted: '2103.30.01', description: 'Harina de mostaza y mostaza preparada', chapter: '21', heading: '2103', subheading: '210330', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['mostaza', 'condimento', 'aderezo'], noms: ['NOM-051-SCFI/SSA1-2010'] },
  { code: '21039099', formatted: '2103.90.99', description: 'Las demás salsas y preparaciones para salsas; condimentos y sazonadores, compuestos', chapter: '21', heading: '2103', subheading: '210390', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['salsa', 'condimento', 'sazonador', 'aderezo', 'mayonesa'], noms: ['NOM-051-SCFI/SSA1-2010'] },
  { code: '21069099', formatted: '2106.90.99', description: 'Las demás preparaciones alimenticias no expresadas ni comprendidas en otra parte', chapter: '21', heading: '2106', subheading: '210690', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['preparación alimenticia', 'suplemento', 'proteína', 'concentrado'], noms: ['NOM-051-SCFI/SSA1-2010'] },

  // ===== Cap 33 - Perfumería y cosmética =====
  { code: '33030001', formatted: '3303.00.01', description: 'Perfumes y aguas de tocador', chapter: '33', heading: '3303', subheading: '330300', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['perfume', 'fragancia', 'agua de tocador', 'colonia'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33041001', formatted: '3304.10.01', description: 'Preparaciones para el maquillaje de los labios', chapter: '33', heading: '3304', subheading: '330410', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['labial', 'lipstick', 'maquillaje', 'cosmético'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33042001', formatted: '3304.20.01', description: 'Preparaciones para el maquillaje de los ojos', chapter: '33', heading: '3304', subheading: '330420', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['sombra', 'rímel', 'delineador', 'maquillaje', 'ojos'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33043001', formatted: '3304.30.01', description: 'Preparaciones para manicuras o pedicuros', chapter: '33', heading: '3304', subheading: '330430', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['esmalte', 'uñas', 'manicure', 'cosmético'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33049101', formatted: '3304.91.01', description: 'Polvos para maquillaje, incluidos los compactos', chapter: '33', heading: '3304', subheading: '330491', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['polvo', 'maquillaje', 'base', 'cosmético', 'compacto'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33049999', formatted: '3304.99.99', description: 'Las demás preparaciones de belleza, maquillaje y para el cuidado de la piel, excepto los medicamentos', chapter: '33', heading: '3304', subheading: '330499', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['crema', 'loción', 'protector solar', 'cosmético', 'skincare'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33051001', formatted: '3305.10.01', description: 'Champús (shampoo)', chapter: '33', heading: '3305', subheading: '330510', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['shampoo', 'champú', 'cabello', 'pelo'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33061001', formatted: '3306.10.01', description: 'Dentífricos (pasta de dientes)', chapter: '33', heading: '3306', subheading: '330610', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['dentífrico', 'pasta dental', 'dientes', 'higiene bucal'], noms: ['NOM-141-SSA1/SCFI-2012'], requiresPermit: true, permitType: 'COFEPRIS' },
  { code: '33071001', formatted: '3307.10.01', description: 'Preparaciones para afeitar o para antes o después del afeitado', chapter: '33', heading: '3307', subheading: '330710', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['afeitado', 'rasurado', 'after shave', 'cosmético'], noms: ['NOM-141-SSA1/SCFI-2012'] },

  // ===== Cap 34 - Jabón y productos de limpieza =====
  { code: '34011101', formatted: '3401.11.01', description: 'Jabón y productos orgánicos tensoactivos, en barras, panes o trozos, de tocador', chapter: '34', heading: '3401', subheading: '340111', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['jabón', 'tocador', 'barra', 'higiene personal'], noms: ['NOM-189-SSA1/SCFI-2018'] },
  { code: '34012001', formatted: '3401.20.01', description: 'Jabón en otras formas (líquido, gel)', chapter: '34', heading: '3401', subheading: '340120', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['jabón líquido', 'gel', 'antibacterial', 'limpieza'], noms: ['NOM-189-SSA1/SCFI-2018'] },
  { code: '34022001', formatted: '3402.20.01', description: 'Preparaciones tensoactivas, preparaciones para lavar y preparaciones de limpieza, acondicionadas para la venta al por menor', chapter: '34', heading: '3402', subheading: '340220', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['detergente', 'limpiador', 'cloro', 'limpieza', 'desinfectante'], noms: ['NOM-189-SSA1/SCFI-2018'] },

  // ===== Cap 38 - Productos químicos diversos =====
  { code: '38081001', formatted: '3808.10.01', description: 'Insecticidas', chapter: '38', heading: '3808', subheading: '380810', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['insecticida', 'plaguicida', 'pesticida', 'fumigante'], requiresPermit: true, permitType: 'COFEPRIS/SEMARNAT' },
  { code: '38082001', formatted: '3808.20.01', description: 'Fungicidas', chapter: '38', heading: '3808', subheading: '380820', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['fungicida', 'plaguicida', 'agrícola', 'fitosanitario'], requiresPermit: true, permitType: 'COFEPRIS/SEMARNAT' },
  { code: '38083001', formatted: '3808.30.01', description: 'Herbicidas, inhibidores de germinación y reguladores del crecimiento de las plantas', chapter: '38', heading: '3808', subheading: '380830', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['herbicida', 'glifosato', 'agrícola', 'plaguicida'], requiresPermit: true, permitType: 'COFEPRIS/SEMARNAT' },
  { code: '38089199', formatted: '3808.91.99', description: 'Los demás insecticidas, raticidas, fungicidas y demás antirroedores, para venta al por menor', chapter: '38', heading: '3808', subheading: '380891', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['raticida', 'plaguicida', 'veneno', 'control de plagas'], requiresPermit: true, permitType: 'COFEPRIS/SEMARNAT' },
  { code: '38091001', formatted: '3809.10.01', description: 'Aprestos y productos de acabado a base de materias amiláceas', chapter: '38', heading: '3809', subheading: '380910', unit: 'Kg', tariffNMF: 5, tariffTMEC: 0, keywords: ['apresto', 'acabado textil', 'almidón', 'industrial'] },
  { code: '38249999', formatted: '3824.99.99', description: 'Los demás productos químicos y preparaciones de las industrias químicas o conexas, no expresados ni comprendidos en otra parte', chapter: '38', heading: '3824', subheading: '382499', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['químico', 'preparación química', 'industrial', 'adhesivo'] },

  // ===== Cap 44 - Madera =====
  { code: '44011101', formatted: '4401.11.01', description: 'Leña de coníferas', chapter: '44', heading: '4401', subheading: '440111', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['leña', 'madera', 'conífera', 'combustible'], requiresPermit: true, permitType: 'SEMARNAT' },
  { code: '44079101', formatted: '4407.91.01', description: 'Madera de encino, roble, encina (Quercus spp.), aserrada o desbastada longitudinalmente, de espesor superior a 6 mm', chapter: '44', heading: '4407', subheading: '440791', unit: 'M3', tariffNMF: 10, tariffTMEC: 0, keywords: ['madera', 'encino', 'roble', 'aserrada', 'tabla'], requiresPermit: true, permitType: 'SEMARNAT' },
  { code: '44079901', formatted: '4407.99.01', description: 'Las demás maderas aserradas o desbastadas longitudinalmente, de espesor superior a 6 mm', chapter: '44', heading: '4407', subheading: '440799', unit: 'M3', tariffNMF: 10, tariffTMEC: 0, keywords: ['madera', 'aserrada', 'tabla', 'tablón'], requiresPermit: true, permitType: 'SEMARNAT' },
  { code: '44101101', formatted: '4410.11.01', description: 'Tableros de partículas de madera', chapter: '44', heading: '4410', subheading: '441011', unit: 'M3', tariffNMF: 15, tariffTMEC: 0, keywords: ['tablero', 'aglomerado', 'partículas', 'MDF', 'mueble'] },
  { code: '44111201', formatted: '4411.12.01', description: 'Tableros de fibra de madera de densidad media (MDF), de espesor inferior o igual a 5 mm', chapter: '44', heading: '4411', subheading: '441112', unit: 'M3', tariffNMF: 15, tariffTMEC: 0, keywords: ['MDF', 'fibra', 'tablero', 'madera', 'mueble'] },
  { code: '44111401', formatted: '4411.14.01', description: 'Tableros de fibra de madera de densidad media (MDF), de espesor superior a 9 mm', chapter: '44', heading: '4411', subheading: '441114', unit: 'M3', tariffNMF: 15, tariffTMEC: 0, keywords: ['MDF', 'tablero', 'madera', 'construcción', 'mueble'] },
  { code: '44187101', formatted: '4418.71.01', description: 'Tableros ensamblados para revestimiento de suelos (pisos), de madera', chapter: '44', heading: '4418', subheading: '441871', unit: 'M2', tariffNMF: 15, tariffTMEC: 0, keywords: ['piso', 'duela', 'parquet', 'madera', 'revestimiento'] },

  // ===== Cap 48 - Papel y cartón =====
  { code: '48010001', formatted: '4801.00.01', description: 'Papel prensa en bobinas (rollos) o en hojas', chapter: '48', heading: '4801', subheading: '480100', unit: 'Kg', tariffNMF: 5, tariffTMEC: 0, keywords: ['papel', 'prensa', 'periódico', 'bobina'] },
  { code: '48025501', formatted: '4802.55.01', description: 'Los demás papeles y cartones, sin fibras obtenidas por procedimiento mecánico, de peso superior o igual a 40 g/m² pero inferior o igual a 150 g/m²', chapter: '48', heading: '4802', subheading: '480255', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['papel', 'bond', 'impresión', 'escritura', 'oficina'] },
  { code: '48030001', formatted: '4803.00.01', description: 'Papel del tipo utilizado para papel higiénico, toallitas para desmaquillar, toallas, servilletas o papeles similares de uso doméstico, guata de celulosa', chapter: '48', heading: '4803', subheading: '480300', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['papel higiénico', 'tissue', 'servilleta', 'toalla', 'celulosa'] },
  { code: '48181001', formatted: '4818.10.01', description: 'Papel higiénico', chapter: '48', heading: '4818', subheading: '481810', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['papel higiénico', 'baño', 'tissue', 'higiene'] },
  { code: '48182001', formatted: '4818.20.01', description: 'Pañuelos, toallitas de desmaquillar y toallas de papel', chapter: '48', heading: '4818', subheading: '481820', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['toalla', 'pañuelo', 'papel', 'servilleta', 'kleenex'] },
  { code: '48191001', formatted: '4819.10.01', description: 'Cajas de papel o cartón corrugado', chapter: '48', heading: '4819', subheading: '481910', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['caja', 'cartón', 'corrugado', 'empaque', 'embalaje'] },

  // ===== Cap 61 - Prendas de vestir de punto =====
  { code: '61012001', formatted: '6101.20.01', description: 'Abrigos, chaquetones, capas y artículos similares de punto, de algodón, para hombres o niños', chapter: '61', heading: '6101', subheading: '610120', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['abrigo', 'chaqueta', 'punto', 'algodón', 'hombre'], noms: ['NOM-004-SE-2021'] },
  { code: '61022001', formatted: '6102.20.01', description: 'Abrigos, chaquetones, capas y artículos similares de punto, de algodón, para mujeres o niñas', chapter: '61', heading: '6102', subheading: '610220', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['abrigo', 'chaqueta', 'punto', 'algodón', 'mujer'], noms: ['NOM-004-SE-2021'] },
  { code: '61031001', formatted: '6103.10.01', description: 'Trajes (ambos o ternos) de punto, para hombres o niños', chapter: '61', heading: '6103', subheading: '610310', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['traje', 'punto', 'hombre', 'vestir'], noms: ['NOM-004-SE-2021'] },
  { code: '61043001', formatted: '6104.30.01', description: 'Chaquetas (sacos) de punto, para mujeres o niñas', chapter: '61', heading: '6104', subheading: '610430', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['chaqueta', 'saco', 'punto', 'mujer'], noms: ['NOM-004-SE-2021'] },
  { code: '61051001', formatted: '6105.10.01', description: 'Camisas de punto de algodón, para hombres o niños', chapter: '61', heading: '6105', subheading: '610510', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['camisa', 'polo', 'punto', 'algodón', 'hombre'], noms: ['NOM-004-SE-2021'] },
  { code: '61061001', formatted: '6106.10.01', description: 'Camisas, blusas de punto de algodón, para mujeres o niñas', chapter: '61', heading: '6106', subheading: '610610', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['blusa', 'camisa', 'punto', 'algodón', 'mujer'], noms: ['NOM-004-SE-2021'] },
  { code: '61091001', formatted: '6109.10.01', description: 'T-shirts y camisetas interiores, de punto, de algodón', chapter: '61', heading: '6109', subheading: '610910', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['camiseta', 't-shirt', 'playera', 'algodón', 'punto'], noms: ['NOM-004-SE-2021'] },
  { code: '61101101', formatted: '6110.11.01', description: 'Suéteres (jerseys), pulóveres, cardiganes, chalecos y artículos similares, de punto, de lana', chapter: '61', heading: '6110', subheading: '611011', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['suéter', 'jersey', 'cardigan', 'lana', 'punto'], noms: ['NOM-004-SE-2021'] },
  { code: '61102001', formatted: '6110.20.01', description: 'Suéteres (jerseys), pulóveres, cardiganes, chalecos y artículos similares, de punto, de algodón', chapter: '61', heading: '6110', subheading: '611020', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['suéter', 'jersey', 'hoodie', 'algodón', 'punto'], noms: ['NOM-004-SE-2021'] },
  { code: '61103001', formatted: '6110.30.01', description: 'Suéteres (jerseys), pulóveres, cardiganes, chalecos y artículos similares, de punto, de fibras sintéticas', chapter: '61', heading: '6110', subheading: '611030', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['suéter', 'jersey', 'sintético', 'poliéster', 'punto'], noms: ['NOM-004-SE-2021'] },
  { code: '61112001', formatted: '6111.20.01', description: 'Prendas y complementos de vestir, de punto, de algodón, para bebés', chapter: '61', heading: '6111', subheading: '611120', unit: 'Kg', tariffNMF: 25, tariffTMEC: 0, keywords: ['bebé', 'ropa infantil', 'algodón', 'punto', 'baby'], noms: ['NOM-004-SE-2021'] },
  { code: '61152101', formatted: '6115.21.01', description: 'Calzas, pantimedias, leotardos y medias de fibras sintéticas, de título inferior a 67 decitex por hilo sencillo', chapter: '61', heading: '6115', subheading: '611521', unit: 'Par', tariffNMF: 30, tariffTMEC: 0, keywords: ['media', 'pantimedias', 'calcetín', 'sintético'], noms: ['NOM-004-SE-2021'] },

  // ===== Cap 62 - Prendas de vestir excepto de punto =====
  { code: '62011201', formatted: '6201.12.01', description: 'Abrigos, chaquetones, capas y artículos similares de algodón, para hombres o niños', chapter: '62', heading: '6201', subheading: '620112', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['abrigo', 'chaqueta', 'algodón', 'hombre'], noms: ['NOM-004-SE-2021'] },
  { code: '62021201', formatted: '6202.12.01', description: 'Abrigos, chaquetones, capas y artículos similares de algodón, para mujeres o niñas', chapter: '62', heading: '6202', subheading: '620212', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['abrigo', 'chaqueta', 'algodón', 'mujer'], noms: ['NOM-004-SE-2021'] },
  { code: '62031101', formatted: '6203.11.01', description: 'Trajes (ambos o ternos) de lana o pelo fino, para hombres o niños', chapter: '62', heading: '6203', subheading: '620311', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['traje', 'lana', 'vestir', 'formal', 'hombre'], noms: ['NOM-004-SE-2021'] },
  { code: '62034201', formatted: '6203.42.01', description: 'Pantalones, pantalones con peto, pantalones cortos y shorts, de algodón, para hombres o niños', chapter: '62', heading: '6203', subheading: '620342', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['pantalón', 'jeans', 'mezclilla', 'algodón', 'hombre'], noms: ['NOM-004-SE-2021'] },
  { code: '62034301', formatted: '6203.43.01', description: 'Pantalones, pantalones con peto, pantalones cortos y shorts, de fibras sintéticas, para hombres o niños', chapter: '62', heading: '6203', subheading: '620343', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['pantalón', 'deportivo', 'sintético', 'hombre'], noms: ['NOM-004-SE-2021'] },
  { code: '62046201', formatted: '6204.62.01', description: 'Pantalones, pantalones con peto, pantalones cortos y shorts, de algodón, para mujeres o niñas', chapter: '62', heading: '6204', subheading: '620462', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['pantalón', 'jeans', 'algodón', 'mujer'], noms: ['NOM-004-SE-2021'] },
  { code: '62052001', formatted: '6205.20.01', description: 'Camisas de algodón, para hombres o niños', chapter: '62', heading: '6205', subheading: '620520', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['camisa', 'algodón', 'vestir', 'hombre'], noms: ['NOM-004-SE-2021'] },
  { code: '62064001', formatted: '6206.40.01', description: 'Camisas, blusas de fibras sintéticas o artificiales, para mujeres o niñas', chapter: '62', heading: '6206', subheading: '620640', unit: 'Pza', tariffNMF: 25, tariffTMEC: 0, keywords: ['blusa', 'camisa', 'sintético', 'mujer'], noms: ['NOM-004-SE-2021'] },

  // ===== Cap 64 - Calzado =====
  { code: '64019201', formatted: '6401.92.01', description: 'Calzado impermeable con suela y parte superior de caucho o plástico, que cubra el tobillo sin cubrir la rodilla', chapter: '64', heading: '6401', subheading: '640192', unit: 'Par', tariffNMF: 35, tariffTMEC: 0, keywords: ['bota', 'lluvia', 'caucho', 'impermeable', 'calzado'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64021201', formatted: '6402.12.01', description: 'Calzado de deporte con suela y parte superior de caucho o plástico, calzado para esquí y calzado para snowboard', chapter: '64', heading: '6402', subheading: '640212', unit: 'Par', tariffNMF: 35, tariffTMEC: 0, keywords: ['tenis', 'deportivo', 'sneaker', 'calzado deportivo'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64021901', formatted: '6402.19.01', description: 'Los demás calzados de deporte con suela y parte superior de caucho o plástico', chapter: '64', heading: '6402', subheading: '640219', unit: 'Par', tariffNMF: 35, tariffTMEC: 0, keywords: ['calzado', 'deportivo', 'plástico', 'sandalia deportiva'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64029101', formatted: '6402.91.01', description: 'Los demás calzados con parte superior de caucho o plástico, que cubran el tobillo', chapter: '64', heading: '6402', subheading: '640291', unit: 'Par', tariffNMF: 35, tariffTMEC: 0, keywords: ['bota', 'botín', 'plástico', 'calzado'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64029901', formatted: '6402.99.01', description: 'Los demás calzados con parte superior de caucho o plástico', chapter: '64', heading: '6402', subheading: '640299', unit: 'Par', tariffNMF: 35, tariffTMEC: 0, keywords: ['sandalia', 'huarache', 'chancla', 'plástico', 'calzado'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64032001', formatted: '6403.20.01', description: 'Calzado con suela de cuero natural y parte superior de tiras de cuero natural que pasan por el empeine y rodean el dedo gordo', chapter: '64', heading: '6403', subheading: '640320', unit: 'Par', tariffNMF: 30, tariffTMEC: 0, keywords: ['sandalia', 'cuero', 'huarache', 'piel'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64035101', formatted: '6403.51.01', description: 'Los demás calzados con suela de cuero natural, que cubran el tobillo, con parte superior de cuero natural', chapter: '64', heading: '6403', subheading: '640351', unit: 'Par', tariffNMF: 30, tariffTMEC: 0, keywords: ['bota', 'cuero', 'piel', 'botín', 'calzado formal'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64039101', formatted: '6403.91.01', description: 'Los demás calzados con suela de caucho, plástico o cuero y parte superior de cuero natural, que cubran el tobillo', chapter: '64', heading: '6403', subheading: '640391', unit: 'Par', tariffNMF: 30, tariffTMEC: 0, keywords: ['zapato', 'cuero', 'piel', 'vestir', 'formal'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64041101', formatted: '6404.11.01', description: 'Calzado de deporte, incluido el de tenis, baloncesto, gimnasia, entrenamiento y calzados similares, con suela de caucho o plástico y parte superior de materia textil', chapter: '64', heading: '6404', subheading: '640411', unit: 'Par', tariffNMF: 35, tariffTMEC: 0, keywords: ['tenis', 'deportivo', 'textil', 'sneaker', 'running'], noms: ['NOM-020-SCFI-1997'] },
  { code: '64041901', formatted: '6404.19.01', description: 'Los demás calzados con suela de caucho o plástico y parte superior de materia textil', chapter: '64', heading: '6404', subheading: '640419', unit: 'Par', tariffNMF: 35, tariffTMEC: 0, keywords: ['calzado', 'textil', 'casual', 'alpargata'], noms: ['NOM-020-SCFI-1997'] },

  // ===== Cap 69 - Productos cerámicos =====
  { code: '69072101', formatted: '6907.21.01', description: 'Placas y baldosas de cerámica para pavimentación o revestimiento, con un coeficiente de absorción de agua inferior o igual al 0.5% en peso', chapter: '69', heading: '6907', subheading: '690721', unit: 'M2', tariffNMF: 15, tariffTMEC: 0, keywords: ['piso', 'baldosa', 'cerámica', 'porcelanato', 'azulejo'], noms: ['NOM-116-SCFI-1997'] },
  { code: '69072201', formatted: '6907.22.01', description: 'Placas y baldosas de cerámica para pavimentación o revestimiento, con un coeficiente de absorción de agua superior al 0.5% pero inferior o igual al 10%', chapter: '69', heading: '6907', subheading: '690722', unit: 'M2', tariffNMF: 15, tariffTMEC: 0, keywords: ['azulejo', 'loseta', 'cerámica', 'revestimiento', 'mosaico'], noms: ['NOM-116-SCFI-1997'] },
  { code: '69111001', formatted: '6911.10.01', description: 'Artículos para el servicio de mesa o de cocina, de porcelana', chapter: '69', heading: '6911', subheading: '691110', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['plato', 'taza', 'porcelana', 'vajilla', 'cocina'] },
  { code: '69120001', formatted: '6912.00.01', description: 'Vajilla y demás artículos de uso doméstico, higiene o tocador, de cerámica, excepto de porcelana', chapter: '69', heading: '6912', subheading: '691200', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['vajilla', 'cerámica', 'loza', 'taza', 'maceta'] },
  { code: '69149001', formatted: '6914.90.01', description: 'Las demás manufacturas de cerámica', chapter: '69', heading: '6914', subheading: '691490', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['cerámica', 'decoración', 'artesanía', 'manufactura'] },

  // ===== Cap 70 - Vidrio =====
  { code: '70049001', formatted: '7004.90.01', description: 'Vidrio estirado o soplado, en hojas, coloreado en la masa, opacificado, chapado o con capa absorbente, reflectante o antirreflectante', chapter: '70', heading: '7004', subheading: '700490', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['vidrio', 'cristal', 'hoja', 'lámina', 'ventana'] },
  { code: '70051001', formatted: '7005.10.01', description: 'Vidrio flotado y vidrio desbastado o pulido por una o las dos caras, en hojas, con capa absorbente, reflectante o antirreflectante', chapter: '70', heading: '7005', subheading: '700510', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['vidrio', 'flotado', 'cristal', 'construcción', 'ventana'] },
  { code: '70071101', formatted: '7007.11.01', description: 'Vidrio de seguridad constituido por vidrio templado, de dimensiones y formatos que permitan su empleo en automóviles, aeronaves, barcos u otros vehículos', chapter: '70', heading: '7007', subheading: '700711', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['parabrisas', 'vidrio templado', 'automotriz', 'seguridad'] },
  { code: '70099101', formatted: '7009.91.01', description: 'Espejos de vidrio sin enmarcar', chapter: '70', heading: '7009', subheading: '700991', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['espejo', 'vidrio', 'cristal', 'decoración'] },
  { code: '70131001', formatted: '7013.10.01', description: 'Artículos de vitrocerámica para servicio de mesa, cocina, tocador, oficina, decoración de interiores o usos similares', chapter: '70', heading: '7013', subheading: '701310', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['vitrocerámica', 'vaso', 'copa', 'vajilla', 'cristalería'] },
  { code: '70134101', formatted: '7013.41.01', description: 'Artículos para servicio de mesa o cocina, de vidrio con un coeficiente de dilatación lineal inferior o igual a 5x10⁻⁶ por Kelvin', chapter: '70', heading: '7013', subheading: '701341', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['pyrex', 'vidrio', 'templado', 'refractario', 'cocina'] },
  { code: '70109001', formatted: '7010.90.01', description: 'Bombonas (damajuanas), botellas, frascos, tarros, botes, envases tubulares y demás recipientes de vidrio para transporte o envasado', chapter: '70', heading: '7010', subheading: '701090', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['botella', 'frasco', 'envase', 'vidrio', 'tarro'] },

  // ===== Cap 71 - Joyería y metales preciosos =====
  { code: '71081201', formatted: '7108.12.01', description: 'Oro (incluido el oro platinado) en las demás formas en bruto, para uso no monetario', chapter: '71', heading: '7108', subheading: '710812', unit: 'Kg', tariffNMF: 0, tariffTMEC: 0, keywords: ['oro', 'gold', 'lingote', 'metal precioso', 'bullion'] },
  { code: '71069201', formatted: '7106.92.01', description: 'Plata semilabrada', chapter: '71', heading: '7106', subheading: '710692', unit: 'Kg', tariffNMF: 0, tariffTMEC: 0, keywords: ['plata', 'silver', 'semilabrada', 'metal precioso'] },
  { code: '71131101', formatted: '7113.11.01', description: 'Artículos de joyería y sus partes, de plata, incluso revestida o chapada de otro metal precioso', chapter: '71', heading: '7113', subheading: '711311', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['joya', 'plata', 'anillo', 'collar', 'pulsera', 'joyería'] },
  { code: '71131901', formatted: '7113.19.01', description: 'Artículos de joyería y sus partes, de los demás metales preciosos, incluso revestidos o chapados', chapter: '71', heading: '7113', subheading: '711319', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['joya', 'oro', 'anillo', 'collar', 'pulsera', 'joyería'] },
  { code: '71171101', formatted: '7117.11.01', description: 'Gemelos y pasadores similares de metal común, incluso plateados, dorados o platinados (bisutería)', chapter: '71', heading: '7117', subheading: '711711', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['bisutería', 'gemelos', 'accesorios', 'imitación'] },
  { code: '71171901', formatted: '7117.19.01', description: 'Las demás bisuterías de metal común', chapter: '71', heading: '7117', subheading: '711719', unit: 'Kg', tariffNMF: 20, tariffTMEC: 0, keywords: ['bisutería', 'aretes', 'collar', 'pulsera', 'fantasía'] },

  // ===== Cap 76 - Aluminio =====
  { code: '76012001', formatted: '7601.20.01', description: 'Aleaciones de aluminio, en bruto', chapter: '76', heading: '7601', subheading: '760120', unit: 'Kg', tariffNMF: 5, tariffTMEC: 0, keywords: ['aluminio', 'aleación', 'lingote', 'bruto'] },
  { code: '76042101', formatted: '7604.21.01', description: 'Perfiles huecos de aleaciones de aluminio', chapter: '76', heading: '7604', subheading: '760421', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['perfil', 'aluminio', 'extrusión', 'construcción', 'ventana'] },
  { code: '76042901', formatted: '7604.29.01', description: 'Los demás perfiles de aleaciones de aluminio', chapter: '76', heading: '7604', subheading: '760429', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['perfil', 'aluminio', 'barra', 'extrusión', 'estructura'] },
  { code: '76061201', formatted: '7606.12.01', description: 'Chapas y bandas de aleaciones de aluminio, de espesor superior a 0.2 mm', chapter: '76', heading: '7606', subheading: '760612', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['lámina', 'aluminio', 'chapa', 'placa', 'hoja'] },
  { code: '76071101', formatted: '7607.11.01', description: 'Hojas y tiras delgadas de aluminio, sin soporte, simplemente laminadas, de espesor inferior o igual a 0.2 mm', chapter: '76', heading: '7607', subheading: '760711', unit: 'Kg', tariffNMF: 10, tariffTMEC: 0, keywords: ['papel aluminio', 'foil', 'lámina delgada', 'empaque'] },
  { code: '76151001', formatted: '7615.10.01', description: 'Artículos de uso doméstico, de higiene o tocador, y sus partes, de aluminio', chapter: '76', heading: '7615', subheading: '761510', unit: 'Kg', tariffNMF: 15, tariffTMEC: 0, keywords: ['olla', 'sartén', 'aluminio', 'cocina', 'doméstico'] },

  // ===== Cap 84 - Maquinaria (adicional) =====
  { code: '84131001', formatted: '8413.10.01', description: 'Bombas con dispositivo medidor o concebidas para llevarlo', chapter: '84', heading: '8413', subheading: '841310', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['bomba', 'dispensador', 'combustible', 'gasolina'] },
  { code: '84137001', formatted: '8413.70.01', description: 'Las demás bombas centrífugas', chapter: '84', heading: '8413', subheading: '841370', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['bomba', 'centrífuga', 'agua', 'industrial', 'hidráulica'] },
  { code: '84818001', formatted: '8481.80.01', description: 'Los demás artículos de grifería y órganos similares (válvulas, llaves)', chapter: '84', heading: '8481', subheading: '848180', unit: 'Pza', tariffNMF: 10, tariffTMEC: 0, keywords: ['válvula', 'llave', 'grifo', 'grifería', 'plomería'] },
  { code: '84821001', formatted: '8482.10.01', description: 'Rodamientos de bolas', chapter: '84', heading: '8482', subheading: '848210', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['rodamiento', 'balero', 'bola', 'bearing', 'cojinete'] },
  { code: '84501101', formatted: '8450.11.01', description: 'Máquinas para lavar ropa, incluso con dispositivo de secado, totalmente automáticas, de capacidad unitaria inferior o igual a 10 kg', chapter: '84', heading: '8450', subheading: '845011', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['lavadora', 'ropa', 'electrodoméstico', 'lavado'], noms: ['NOM-005-ENER-2016'] },
  { code: '84501201', formatted: '8450.12.01', description: 'Las demás máquinas para lavar ropa con secadora centrífuga incorporada, de capacidad unitaria superior a 10 kg', chapter: '84', heading: '8450', subheading: '845012', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['lavadora', 'industrial', 'secadora', 'electrodoméstico'], noms: ['NOM-005-ENER-2016'] },
  { code: '84521001', formatted: '8452.10.01', description: 'Máquinas de coser domésticas', chapter: '84', heading: '8452', subheading: '845210', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['máquina de coser', 'costura', 'doméstica', 'textil'] },

  // ===== Cap 85 - Electrónica (adicional) =====
  { code: '85061001', formatted: '8506.10.01', description: 'Pilas y baterías de pilas, eléctricas, de dióxido de manganeso', chapter: '85', heading: '8506', subheading: '850610', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['pila', 'batería', 'alcalina', 'manganeso', 'desechable'] },
  { code: '85065001', formatted: '8506.50.01', description: 'Pilas y baterías de pilas, eléctricas, de litio', chapter: '85', heading: '8506', subheading: '850650', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['pila', 'batería', 'litio', 'lithium'] },
  { code: '85076001', formatted: '8507.60.01', description: 'Acumuladores eléctricos de iones de litio', chapter: '85', heading: '8507', subheading: '850760', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['batería', 'acumulador', 'litio', 'ion', 'recargable', 'EV'] },
  { code: '85183001', formatted: '8518.30.01', description: 'Auriculares, incluidos los de casco, los de combinado micrófono-altavoz (altoparlante) y juegos de micrófono con altavoz', chapter: '85', heading: '8518', subheading: '851830', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['audífono', 'auricular', 'headphone', 'earbuds', 'headset'] },
  { code: '85182101', formatted: '8518.21.01', description: 'Un altavoz (altoparlante) montado en su caja', chapter: '85', heading: '8518', subheading: '851821', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['bocina', 'altavoz', 'speaker', 'bluetooth', 'parlante'] },
  { code: '85182201', formatted: '8518.22.01', description: 'Varios altavoces (altoparlantes) montados en una misma caja', chapter: '85', heading: '8518', subheading: '851822', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['bocina', 'altavoz', 'speaker', 'barra de sonido', 'soundbar'] },
  { code: '85395001', formatted: '8539.50.01', description: 'Diodos emisores de luz (LED)', chapter: '85', heading: '8539', subheading: '853950', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['LED', 'foco', 'iluminación', 'diodo', 'luz'], noms: ['NOM-030-ENER-2016'] },
  { code: '85437001', formatted: '8543.70.01', description: 'Las demás máquinas y aparatos eléctricos con función propia, no expresados ni comprendidos en otra parte (cigarros electrónicos, vaporizadores)', chapter: '85', heading: '8543', subheading: '854370', unit: 'Pza', tariffNMF: 5, tariffTMEC: 0, keywords: ['aparato eléctrico', 'vaporizador', 'cigarro electrónico', 'dispositivo'] },
  { code: '85167101', formatted: '8516.71.01', description: 'Aparatos electrotérmicos para la preparación de café o de té', chapter: '85', heading: '8516', subheading: '851671', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['cafetera', 'café', 'electrotérmico', 'electrodoméstico'], noms: ['NOM-003-SCFI-2014'] },
  { code: '85166001', formatted: '8516.60.01', description: 'Los demás hornos; cocinas, hornillos (incluidas las mesas de cocción), parrillas y asadores eléctricos', chapter: '85', heading: '8516', subheading: '851660', unit: 'Pza', tariffNMF: 20, tariffTMEC: 0, keywords: ['horno', 'microondas', 'cocina', 'eléctrico', 'electrodoméstico'], noms: ['NOM-003-SCFI-2014'] },
];
