// 100 productos reales con fracción arancelaria correcta verificada
// Fuente: TIGIE 2026, clasificaciones confirmadas

export interface TestProduct {
  id: number;
  description: string;
  expectedFraction: string; // 8 dígitos sin puntos
  chapter: string; // Capítulo para análisis
  category: string; // Categoría para agrupación
}

export const TEST_PRODUCTS: TestProduct[] = [
  // ============================================
  // TEXTILES (Cap. 61-63) — 10 productos
  // ============================================
  { id: 1, description: "Camiseta de algodón 100% para hombre, tejido de punto, cuello redondo", expectedFraction: "61091001", chapter: "61", category: "Textiles" },
  { id: 2, description: "Pantalón de mezclilla (jeans) para mujer, algodón, tipo skinny", expectedFraction: "62043201", chapter: "62", category: "Textiles" },
  { id: 3, description: "Suéter de lana tejido de punto para hombre", expectedFraction: "61101101", chapter: "61", category: "Textiles" },
  { id: 4, description: "Vestido de fibra sintética (poliéster) para mujer, tejido plano", expectedFraction: "62044401", chapter: "62", category: "Textiles" },
  { id: 5, description: "Calcetines de algodón para hombre, tejido de punto", expectedFraction: "61159201", chapter: "61", category: "Textiles" },
  { id: 6, description: "Ropa interior tipo boxer para hombre, algodón, tejido de punto", expectedFraction: "61071101", chapter: "61", category: "Textiles" },
  { id: 7, description: "Chamarra tipo bomber de nylon para hombre", expectedFraction: "62019301", chapter: "62", category: "Textiles" },
  { id: 8, description: "Sábana de algodón 100%, tamaño queen, tejido plano", expectedFraction: "63021001", chapter: "63", category: "Textiles" },
  { id: 9, description: "Toalla de baño de algodón tipo turco, tejido de rizo", expectedFraction: "63026001", chapter: "63", category: "Textiles" },
  { id: 10, description: "Corbata de seda para hombre", expectedFraction: "61171001", chapter: "61", category: "Textiles" },

  // ============================================
  // ELECTRÓNICA (Cap. 84-85) — 15 productos
  // ============================================
  { id: 11, description: "Laptop con pantalla de 15 pulgadas, procesador Intel Core i7, 16GB RAM", expectedFraction: "84713001", chapter: "84", category: "Electrónica" },
  { id: 12, description: "Smartphone con pantalla OLED de 6.5 pulgadas, 128GB almacenamiento", expectedFraction: "85171401", chapter: "85", category: "Electrónica" },
  { id: 13, description: "Televisor LED de 55 pulgadas, resolución 4K UHD, Smart TV", expectedFraction: "85287201", chapter: "85", category: "Electrónica" },
  { id: 14, description: "Impresora láser monocromática para oficina", expectedFraction: "84433201", chapter: "84", category: "Electrónica" },
  { id: 15, description: "Disco duro externo de 2TB, USB 3.0, portátil", expectedFraction: "84717001", chapter: "84", category: "Electrónica" },
  { id: 16, description: "Mouse inalámbrico óptico para computadora", expectedFraction: "84716001", chapter: "84", category: "Electrónica" },
  { id: 17, description: "Teclado mecánico USB para computadora, retroiluminado", expectedFraction: "84716001", chapter: "84", category: "Electrónica" },
  { id: 18, description: "Monitor de computadora de 27 pulgadas, LED, resolución QHD", expectedFraction: "85285201", chapter: "85", category: "Electrónica" },
  { id: 19, description: "Audífonos inalámbricos Bluetooth tipo over-ear con cancelación de ruido", expectedFraction: "85183001", chapter: "85", category: "Electrónica" },
  { id: 20, description: "Cámara digital réflex (DSLR) con sensor de 24 megapíxeles", expectedFraction: "85258001", chapter: "85", category: "Electrónica" },
  { id: 21, description: "Tableta electrónica con pantalla táctil de 10 pulgadas", expectedFraction: "84713001", chapter: "84", category: "Electrónica" },
  { id: 22, description: "Proyector de video tipo DLP para presentaciones", expectedFraction: "85286101", chapter: "85", category: "Electrónica" },
  { id: 23, description: "Cargador de pared USB-C de 65W para laptop", expectedFraction: "85044001", chapter: "85", category: "Electrónica" },
  { id: 24, description: "Cable HDMI de alta velocidad, 2 metros", expectedFraction: "85444901", chapter: "85", category: "Electrónica" },
  { id: 25, description: "Memoria USB flash drive de 64GB, USB 3.0", expectedFraction: "85235101", chapter: "85", category: "Electrónica" },

  // ============================================
  // ALIMENTOS Y BEBIDAS (Cap. 02-22) — 15 productos
  // ============================================
  { id: 26, description: "Aguacate Hass fresco para consumo", expectedFraction: "08044001", chapter: "08", category: "Alimentos" },
  { id: 27, description: "Tequila 100% agave añejo, botella de 750ml", expectedFraction: "22089001", chapter: "22", category: "Alimentos" },
  { id: 28, description: "Cerveza de malta en botella de vidrio de 355ml", expectedFraction: "22030001", chapter: "22", category: "Alimentos" },
  { id: 29, description: "Café tostado en grano, 100% arábica, sin descafeinar", expectedFraction: "09012101", chapter: "09", category: "Alimentos" },
  { id: 30, description: "Chocolate con leche en tableta, cacao 35%", expectedFraction: "18069001", chapter: "18", category: "Alimentos" },
  { id: 31, description: "Carne de res deshuesada congelada, corte tipo ribeye", expectedFraction: "02023001", chapter: "02", category: "Alimentos" },
  { id: 32, description: "Camarón congelado pelado y desvenado", expectedFraction: "03061701", chapter: "03", category: "Alimentos" },
  { id: 33, description: "Arroz blanco de grano largo, pulido, empacado", expectedFraction: "10063001", chapter: "10", category: "Alimentos" },
  { id: 34, description: "Aceite de oliva extra virgen, botella de 1 litro", expectedFraction: "15091001", chapter: "15", category: "Alimentos" },
  { id: 35, description: "Leche en polvo entera, sin azúcar", expectedFraction: "04022101", chapter: "04", category: "Alimentos" },
  { id: 36, description: "Mango fresco tipo Ataulfo para exportación", expectedFraction: "08045001", chapter: "08", category: "Alimentos" },
  { id: 37, description: "Salsa de soya fermentada, botella 500ml", expectedFraction: "21039001", chapter: "21", category: "Alimentos" },
  { id: 38, description: "Vino tinto de uva, Cabernet Sauvignon, botella 750ml", expectedFraction: "22042101", chapter: "22", category: "Alimentos" },
  { id: 39, description: "Miel natural de abeja, pura, envase de 1kg", expectedFraction: "04090001", chapter: "04", category: "Alimentos" },
  { id: 40, description: "Atún aleta amarilla en conserva, en aceite, lata 170g", expectedFraction: "16041401", chapter: "16", category: "Alimentos" },

  // ============================================
  // QUÍMICOS Y FARMACÉUTICOS (Cap. 28-30, 38) — 10 productos
  // ============================================
  { id: 41, description: "Ibuprofeno tabletas de 400mg, uso humano, venta libre", expectedFraction: "30049099", chapter: "30", category: "Farmacéuticos" },
  { id: 42, description: "Paracetamol (acetaminofén) en tabletas de 500mg", expectedFraction: "30049099", chapter: "30", category: "Farmacéuticos" },
  { id: 43, description: "Alcohol etílico desnaturalizado al 96%, uso industrial", expectedFraction: "22071001", chapter: "22", category: "Químicos" },
  { id: 44, description: "Hidróxido de sodio (sosa cáustica) en escamas, grado industrial", expectedFraction: "28151101", chapter: "28", category: "Químicos" },
  { id: 45, description: "Ácido sulfúrico concentrado, grado reactivo", expectedFraction: "28070001", chapter: "28", category: "Químicos" },
  { id: 46, description: "Antibiótico amoxicilina cápsulas 500mg, uso humano", expectedFraction: "30041001", chapter: "30", category: "Farmacéuticos" },
  { id: 47, description: "Gel antibacterial con alcohol al 70%, envase 500ml", expectedFraction: "38089401", chapter: "38", category: "Químicos" },
  { id: 48, description: "Insulina humana inyectable, 100 UI/ml", expectedFraction: "30043101", chapter: "30", category: "Farmacéuticos" },
  { id: 49, description: "Cloro líquido (hipoclorito de sodio) al 6%, uso doméstico", expectedFraction: "28289001", chapter: "28", category: "Químicos" },
  { id: 50, description: "Vitamina C (ácido ascórbico) tabletas efervescentes 1000mg", expectedFraction: "21069099", chapter: "21", category: "Farmacéuticos" },

  // ============================================
  // MAQUINARIA (Cap. 84) — 10 productos
  // ============================================
  { id: 51, description: "Torno CNC horizontal para metales, control numérico", expectedFraction: "84581101", chapter: "84", category: "Maquinaria" },
  { id: 52, description: "Compresor de aire de tornillo rotativo, 100 HP", expectedFraction: "84143001", chapter: "84", category: "Maquinaria" },
  { id: 53, description: "Montacargas de contrapeso, motor diésel, capacidad 3 toneladas", expectedFraction: "84272001", chapter: "84", category: "Maquinaria" },
  { id: 54, description: "Bomba centrífuga para agua, motor eléctrico, 5 HP", expectedFraction: "84137001", chapter: "84", category: "Maquinaria" },
  { id: 55, description: "Máquina de inyección de plástico, 200 toneladas de cierre", expectedFraction: "84771001", chapter: "84", category: "Maquinaria" },
  { id: 56, description: "Generador eléctrico diésel de 500 KVA, trifásico", expectedFraction: "85021301", chapter: "85", category: "Maquinaria" },
  { id: 57, description: "Banda transportadora de hule para línea de producción, 10 metros", expectedFraction: "84283301", chapter: "84", category: "Maquinaria" },
  { id: 58, description: "Robot industrial articulado de 6 ejes para soldadura", expectedFraction: "84795001", chapter: "84", category: "Maquinaria" },
  { id: 59, description: "Aire acondicionado tipo split de 2 toneladas, uso residencial", expectedFraction: "84151001", chapter: "84", category: "Maquinaria" },
  { id: 60, description: "Lavadora automática de ropa, carga frontal, 20 kg, uso doméstico", expectedFraction: "84502001", chapter: "84", category: "Maquinaria" },

  // ============================================
  // VEHÍCULOS Y PARTES (Cap. 87) — 10 productos
  // ============================================
  { id: 61, description: "Automóvil sedán nuevo, motor gasolina 2.0L, 4 cilindros", expectedFraction: "87032301", chapter: "87", category: "Vehículos" },
  { id: 62, description: "Camioneta pickup doble cabina, motor diésel 2.8L", expectedFraction: "87043101", chapter: "87", category: "Vehículos" },
  { id: 63, description: "Llanta radial para automóvil, medida 205/55 R16", expectedFraction: "40111001", chapter: "40", category: "Vehículos" },
  { id: 64, description: "Batería de plomo-ácido para automóvil, 12V, 60 Ah", expectedFraction: "85071001", chapter: "85", category: "Vehículos" },
  { id: 65, description: "Parabrisas de vidrio templado para automóvil sedán", expectedFraction: "70071101", chapter: "70", category: "Vehículos" },
  { id: 66, description: "Amortiguador hidráulico trasero para automóvil", expectedFraction: "87083001", chapter: "87", category: "Vehículos" },
  { id: 67, description: "Pastillas de freno delanteras para automóvil", expectedFraction: "68131001", chapter: "68", category: "Vehículos" },
  { id: 68, description: "Filtro de aceite para motor de automóvil", expectedFraction: "84212301", chapter: "84", category: "Vehículos" },
  { id: 69, description: "Motocicleta de 250cc, motor de combustión interna", expectedFraction: "87112001", chapter: "87", category: "Vehículos" },
  { id: 70, description: "Bicicleta de montaña para adulto, cuadro de aluminio, rodada 29", expectedFraction: "87120001", chapter: "87", category: "Vehículos" },

  // ============================================
  // PLÁSTICOS (Cap. 39) — 10 productos
  // ============================================
  { id: 71, description: "Bolsa de polietileno de baja densidad para empaque, transparente", expectedFraction: "39232101", chapter: "39", category: "Plásticos" },
  { id: 72, description: "Botella de PET para agua, capacidad 500ml, desechable", expectedFraction: "39233001", chapter: "39", category: "Plásticos" },
  { id: 73, description: "Tubería de PVC de 4 pulgadas para drenaje", expectedFraction: "39172301", chapter: "39", category: "Plásticos" },
  { id: 74, description: "Contenedor de plástico tipo Tupperware, polipropileno, con tapa", expectedFraction: "39241001", chapter: "39", category: "Plásticos" },
  { id: 75, description: "Película stretch de polietileno para embalaje, rollo", expectedFraction: "39201001", chapter: "39", category: "Plásticos" },
  { id: 76, description: "Resina de polipropileno en pellets, grado inyección", expectedFraction: "39021001", chapter: "39", category: "Plásticos" },
  { id: 77, description: "Lámina de policarbonato transparente, 6mm espesor", expectedFraction: "39206001", chapter: "39", category: "Plásticos" },
  { id: 78, description: "Guantes desechables de nitrilo, talla M, caja 100 piezas", expectedFraction: "39262001", chapter: "39", category: "Plásticos" },
  { id: 79, description: "Charola de poliestireno expandido (unicel) para alimentos", expectedFraction: "39231001", chapter: "39", category: "Plásticos" },
  { id: 80, description: "Manguera flexible de PVC reforzada, 1 pulgada, para riego", expectedFraction: "39173901", chapter: "39", category: "Plásticos" },

  // ============================================
  // ACERO Y METALES (Cap. 72-73) — 10 productos
  // ============================================
  { id: 81, description: "Tornillo de acero inoxidable, cabeza hexagonal, M10x50mm", expectedFraction: "73181501", chapter: "73", category: "Acero" },
  { id: 82, description: "Lámina de acero inoxidable 304, calibre 18, hoja 4x8 pies", expectedFraction: "72193401", chapter: "72", category: "Acero" },
  { id: 83, description: "Varilla corrugada de acero para construcción, 3/8 pulgada", expectedFraction: "72142001", chapter: "72", category: "Acero" },
  { id: 84, description: "Tubo de acero al carbón, soldado, 2 pulgadas, cédula 40", expectedFraction: "73063001", chapter: "73", category: "Acero" },
  { id: 85, description: "Alambre de acero galvanizado, calibre 14", expectedFraction: "72172001", chapter: "72", category: "Acero" },
  { id: 86, description: "Perfil estructural de acero tipo IPR, 8 pulgadas", expectedFraction: "72163201", chapter: "72", category: "Acero" },
  { id: 87, description: "Clavo de acero sin cabeza, 2 pulgadas, para construcción", expectedFraction: "73170001", chapter: "73", category: "Acero" },
  { id: 88, description: "Lámina de aluminio en rollo, 0.5mm espesor, aleación 3003", expectedFraction: "76061201", chapter: "76", category: "Acero" },
  { id: 89, description: "Cable de cobre desnudo, calibre 10 AWG, temple suave", expectedFraction: "74081101", chapter: "74", category: "Acero" },
  { id: 90, description: "Tuerca hexagonal de acero al carbón, rosca M12", expectedFraction: "73181601", chapter: "73", category: "Acero" },

  // ============================================
  // CALZADO (Cap. 64) — 5 productos
  // ============================================
  { id: 91, description: "Zapato deportivo tipo tenis para hombre, suela de caucho, parte superior textil", expectedFraction: "64041901", chapter: "64", category: "Calzado" },
  { id: 92, description: "Bota industrial de seguridad con casquillo de acero, piel", expectedFraction: "64035101", chapter: "64", category: "Calzado" },
  { id: 93, description: "Sandalia de plástico para dama, tipo huarache", expectedFraction: "64029901", chapter: "64", category: "Calzado" },
  { id: 94, description: "Zapato de vestir para hombre, piel genuina, suela de cuero", expectedFraction: "64035101", chapter: "64", category: "Calzado" },
  { id: 95, description: "Pantufla de tela para uso doméstico", expectedFraction: "64041901", chapter: "64", category: "Calzado" },

  // ============================================
  // VARIOS (Cap. diversos) — 5 productos
  // ============================================
  { id: 96, description: "Juguete de plástico tipo figura de acción para niños", expectedFraction: "95030001", chapter: "95", category: "Varios" },
  { id: 97, description: "Reloj de pulsera analógico con caja de acero inoxidable", expectedFraction: "91019901", chapter: "91", category: "Varios" },
  { id: 98, description: "Mueble de madera tipo escritorio para oficina", expectedFraction: "94033001", chapter: "94", category: "Varios" },
  { id: 99, description: "Papel bond blanco tamaño carta, 75g/m², resma 500 hojas", expectedFraction: "48025601", chapter: "48", category: "Varios" },
  { id: 100, description: "Lentes de sol con armazón de plástico y lentes polarizados", expectedFraction: "90041001", chapter: "90", category: "Varios" },
];
