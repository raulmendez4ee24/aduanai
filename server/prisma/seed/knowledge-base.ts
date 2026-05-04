import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

type K = {
  type: 'CASO_CLASIFICACION' | 'CRITERIO_SAT' | 'RESOLUCION_SCJN' | 'NOTA_EXPLICATIVA_OMA' |
        'NOTA_LEGAL' | 'REGLA_SECTOR' | 'ERROR_COMUN' | 'PRECEDENTE' | 'CONSULTA_SAT';
  fractionCode?: string;
  chapterCode?: string;
  sectionCode?: string;
  title: string;
  content: string;
  source: string;
  keywords: string[];
  products?: string[];
  priority?: number;
};

export const KNOWLEDGE_BASE: K[] = [
  // ============================================================
  // TEXTILES (Cap 50-63) — 10 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6109.10.01', chapterCode: '61',
    title: 'Camiseta de algodón tejido de punto',
    content: `Producto: Camiseta 100% algodón para hombre, tejido de punto, cuello redondo, manga corta.

Clasificación correcta: 6109.10.01

Razonamiento:
- GRI 1: Se describe en partida 61.09 "T-shirts y camisetas interiores, de punto"
- Cap 61 vs Cap 62: Nota 1 del Cap 61 dice "comprende solamente artículos confeccionados de punto". El tejido de punto va SIEMPRE en Cap 61.
- Subpartida 6109.10: "De algodón"
- Fracción .01: uso general

Errores comunes:
- Confundir con 6205 (camisas de tejido plano)
- Confundir con 6109.90 (otras materias textiles)
- El material define la subpartida: algodón=.10, sintético=.90`,
    source: 'Criterio clasificación textiles TIGIE',
    keywords: ['camiseta', 'algodón', 'punto', 't-shirt', 'playera', 'manga corta'],
    products: ['camiseta', 'playera', 't-shirt', 'polo'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6205.20.01', chapterCode: '62',
    title: 'Camisa de vestir de algodón tejido plano',
    content: `Producto: Camisa formal de vestir para hombre, 100% algodón, tejido plano, manga larga, con botones.

Clasificación correcta: 6205.20.01

Razonamiento:
- GRI 1: Partida 62.05 "Camisas para hombres o niños"
- Cap 62 aplica porque es tejido PLANO (no de punto)
- Subpartida 6205.20: "De algodón"

Distinción clave con 6105 (camisa de punto): verificar que NO sea de tejido de punto.`,
    source: 'TIGIE Cap 62',
    keywords: ['camisa', 'vestir', 'algodón', 'tejido plano', 'botones', 'manga larga'],
    products: ['camisa', 'camisa formal', 'camisa vestir'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6203.42.01', chapterCode: '62',
    title: 'Pantalón de mezclilla (jeans) para hombre',
    content: `Producto: Pantalón de mezclilla denim índigo, 100% algodón, corte recto, para hombre.

Clasificación correcta: 6203.42.01

Razonamiento:
- Cap 62 (tejido plano, la mezclilla es tejido plano de sarga)
- 62.03 "Trajes, conjuntos, chaquetas, pantalones... para hombres"
- 6203.42: "Pantalones de algodón"
- Mezclilla = algodón teñido con índigo

Errores comunes: confundir con 6103 (pantalones de punto) o 6204 (prendas de mujer).`,
    source: 'TIGIE Cap 62',
    keywords: ['pantalón', 'mezclilla', 'jeans', 'denim', 'algodón', 'hombre'],
    products: ['jeans', 'pantalón mezclilla', 'denim'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6204.62.01', chapterCode: '62',
    title: 'Pantalón de mezclilla para mujer',
    content: `Producto: Pantalón de mezclilla para mujer, algodón, tejido plano.

Clasificación correcta: 6204.62.01

- 62.04 es el análogo a 62.03 pero para MUJERES/NIÑAS
- 6204.62: "Pantalones... de algodón"
- GÉNERO determina entre 6203/6204 en tejido plano, 6103/6104 en punto.`,
    source: 'TIGIE Cap 62',
    keywords: ['pantalón', 'mezclilla', 'mujer', 'jeans', 'dama'],
    products: ['jeans mujer', 'pantalón mujer'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6110.20.01', chapterCode: '61',
    title: 'Suéter de algodón tejido de punto',
    content: `Producto: Suéter/jersey/pullover de algodón, tejido de punto, cuello V.

Clasificación correcta: 6110.20.01

- 61.10 "Suéteres, pullovers, cardigans, chalecos y artículos similares, de punto"
- 6110.20: "De algodón"
- Es de punto → Cap 61

Distinción: una sudadera con capucha también puede ir en 61.10.`,
    source: 'TIGIE Cap 61',
    keywords: ['suéter', 'pullover', 'jersey', 'algodón', 'punto', 'cardigan'],
    products: ['suéter', 'pullover', 'jersey', 'sudadera'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6302.21.01', chapterCode: '63',
    title: 'Sábana de algodón estampada',
    content: `Producto: Sábana individual de algodón 100%, estampada con diseño floral.

Clasificación correcta: 6302.21.01

Razonamiento:
- Cap 63: "Los demás artículos textiles confeccionados" (ropa de CASA, no vestir)
- 63.02: "Ropa de cama, mesa, tocador o cocina"
- 6302.21: "De algodón, estampadas"
- Diferente de sábanas teñidas lisas (6302.22) o blancas sin blanquear (6302.10)

Regla: ropa de cama/casa = cap 63, NUNCA cap 61 o 62.`,
    source: 'TIGIE Cap 63',
    keywords: ['sábana', 'cama', 'algodón', 'estampado', 'ropa de cama'],
    products: ['sábana', 'funda', 'ropa de cama'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6302.60.01', chapterCode: '63',
    title: 'Toalla de algodón rizada',
    content: `Producto: Toalla de baño de algodón, tejido rizado (terry).

Clasificación correcta: 6302.60.01

- 63.02 ropa de cama/mesa/tocador/cocina
- 6302.60: "Ropa de tocador o cocina, de tejido rizado, de algodón"
- El tejido rizado es específico de toallas.`,
    source: 'TIGIE Cap 63',
    keywords: ['toalla', 'baño', 'rizado', 'terry', 'algodón'],
    products: ['toalla', 'toalla baño'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6104.63.01', chapterCode: '61',
    title: 'Leggings deportivos de fibra sintética',
    content: `Producto: Leggings para mujer, 88% poliéster 12% elastano, tejido de punto.

Clasificación correcta: 6104.63.01

- Cap 61: es de PUNTO y elástico
- 61.04: prendas para mujer/niña (pantalones)
- 6104.63: "Pantalones... de fibras sintéticas"
- Poliéster = fibra sintética, elastano también.`,
    source: 'TIGIE Cap 61',
    keywords: ['leggings', 'poliéster', 'elastano', 'deportivo', 'punto', 'mujer'],
    products: ['leggings', 'mallones', 'pants mujer'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6117.10.01', chapterCode: '61',
    title: 'Bufanda de punto',
    content: `Producto: Bufanda tejida de punto, poliéster/lana, sin forro.

Clasificación correcta: 6117.10.01

- 61.17 "Los demás complementos (accesorios) de vestir, confeccionados, de punto"
- 6117.10: "Chales, pañuelos de cuello, bufandas, mantillas, velos y artículos similares"`,
    source: 'TIGIE Cap 61',
    keywords: ['bufanda', 'chal', 'punto', 'accesorio', 'cuello'],
    products: ['bufanda', 'chalina', 'pashmina'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6003.30.01', chapterCode: '60',
    title: 'Tela de punto de fibras sintéticas',
    content: `Producto: Tela de punto por metro, 100% poliéster, para confección.

Clasificación correcta: 6003.30.01 (o 6004/6005/6006 según técnica de tejido)

- Cap 60: TELAS/TEJIDOS de punto (NO prenda confeccionada)
- 60.03: "Tejidos de punto de anchura inferior o igual a 30 cm"
- Distinguir entre tejido (Cap 60) y prenda confeccionada (Cap 61).

Regla: si es por metro/rollo → Cap 60. Si es prenda → Cap 61.`,
    source: 'TIGIE Cap 60',
    keywords: ['tela', 'tejido', 'punto', 'poliéster', 'rollo', 'por metro'],
    products: ['tela de punto', 'tejido sintético'],
    priority: 7,
  },

  // ============================================================
  // CALZADO (Cap 64) — 5 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6403.99.01', chapterCode: '64',
    title: 'Zapato de cuero para hombre',
    content: `Producto: Zapato de vestir para hombre, corte de cuero natural, suela de caucho.

Clasificación correcta: 6403.99.01

Razonamiento:
- GRI 1: Cap 64 "Calzado"
- Nota 1 Cap 64: La SUELA determina la partida.
  Suela de caucho/plástico = 64.03
  Suela de cuero = 64.05
- El CORTE determina la subpartida:
  Corte de cuero = 6403.5 o 6403.99
- 6403.99: los demás (no deportivo, no cubre tobillo)

Errores comunes:
- Clasificar por el corte en vez de por la suela
- Confundir 6403 (suela caucho) con 6405 (suela cuero)
- Nota clave: "la suela manda la partida, el corte manda la subpartida"`,
    source: 'Regla clasificación calzado Cap 64',
    keywords: ['zapato', 'calzado', 'cuero', 'suela', 'caucho', 'vestir'],
    products: ['zapato', 'zapato vestir', 'mocasín'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6404.11.02', chapterCode: '64',
    title: 'Tenis deportivos con suela de caucho y corte textil',
    content: `Producto: Tenis para correr, suela de caucho/EVA, corte textil (malla de poliéster), uso deportivo.

Clasificación correcta: 6404.11.02

- 64.04: Calzado con SUELA de caucho/plástico y CORTE de textil
- 6404.11: "Calzado de deporte; calzado de tenis, baloncesto, gimnasia, etc."
- Fracción .02 es específica para calzado deportivo en TIGIE.

Distinción con 6403: 6403 tiene corte de cuero, 6404 tiene corte textil.`,
    source: 'TIGIE Cap 64',
    keywords: ['tenis', 'deportivo', 'correr', 'running', 'caucho', 'textil', 'sneaker'],
    products: ['tenis', 'zapato deportivo', 'sneakers'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6402.99.99', chapterCode: '64',
    title: 'Sandalia completamente de plástico',
    content: `Producto: Sandalia tipo chancla, toda de plástico/PVC/EVA.

Clasificación correcta: 6402.99.99 (o fracción específica si existe)

- 64.02 "Calzado con suela y parte superior de caucho o plástico"
- 6402.99: los demás, no impermeables, no de tiras
- Si es de tiras: 6402.20`,
    source: 'TIGIE Cap 64',
    keywords: ['sandalia', 'chancla', 'plástico', 'PVC', 'EVA', 'playa'],
    products: ['sandalia', 'chancla', 'hawaianas'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6403.40.01', chapterCode: '64',
    title: 'Bota de seguridad industrial con casquillo',
    content: `Producto: Bota de seguridad industrial con casquillo de acero, suela de caucho, corte de cuero.

Clasificación correcta: 6403.40.01

- 64.03: suela caucho/plástico, corte de cuero
- 6403.40: "Los demás calzados con puntera metálica de protección"
- La puntera (casquillo) define esta subpartida prioritariamente.`,
    source: 'TIGIE Cap 64',
    keywords: ['bota', 'seguridad', 'casquillo', 'industrial', 'cuero', 'puntera'],
    products: ['bota seguridad', 'bota industrial'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6401.92.01', chapterCode: '64',
    title: 'Botas de hule impermeables',
    content: `Producto: Botas de hule/caucho impermeables para lluvia.

Clasificación correcta: 6401.92.01

- 64.01: Calzado IMPERMEABLE con suela y corte de caucho/plástico, obtenido en una sola pieza (sin costura)
- 6401.92: "Los demás calzados, que cubran el tobillo sin cubrir la rodilla"

Distinción con 6402: 6402 es calzado NO impermeable o con costuras.`,
    source: 'TIGIE Cap 64',
    keywords: ['bota', 'hule', 'caucho', 'impermeable', 'lluvia'],
    products: ['bota hule', 'bota lluvia', 'galoshes'],
    priority: 7,
  },

  // ============================================================
  // VEHÍCULOS (Cap 87) — 5 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8703.23.01', chapterCode: '87',
    title: 'Automóvil sedan gasolina 2000cc',
    content: `Producto: Automóvil sedan de pasajeros, motor de gasolina, cilindrada 1,999 cc, nuevo.

Clasificación correcta: 8703.23.01

Razonamiento:
- GRI 1: Cap 87 "Vehículos automóviles"
- 87.03: Vehículos para transporte de personas (excepto 87.02 para transporte colectivo)
- Subpartida por CILINDRADA y COMBUSTIBLE:
  8703.21: gasolina hasta 1000cc
  8703.22: gasolina 1001-1500cc
  8703.23: gasolina 1501-3000cc
  8703.24: gasolina más de 3000cc
  8703.31-34: diesel (mismos rangos)
  8703.40: híbridos gasolina
  8703.60: eléctricos

Errores comunes:
- No verificar cilindrada exacta
- Confundir con 8704 (vehículos de carga)
- Híbridos van en 8703.40, NO en gasolina
- Usados van en la misma fracción que nuevos`,
    source: 'Clasificación vehículos Cap 87',
    keywords: ['automóvil', 'carro', 'sedan', 'gasolina', 'cilindrada', 'vehículo'],
    products: ['automóvil', 'sedan', 'SUV pequeño'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8703.80.01', chapterCode: '87',
    title: 'Vehículo eléctrico Tesla',
    content: `Producto: Automóvil eléctrico de batería (BEV), motor eléctrico únicamente.

Clasificación correcta: 8703.80.01

- 87.03: vehículos para transporte de personas
- 8703.80 (TIGIE): vehículos propulsados únicamente por motor eléctrico
- No se usa 8703.40 (híbrido tiene motor de combustión)
- No se usa 8703.23 (ese es gasolina)`,
    source: 'TIGIE Cap 87',
    keywords: ['eléctrico', 'tesla', 'BEV', 'batería', 'automóvil'],
    products: ['Tesla', 'auto eléctrico', 'BEV'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8704.21.03', chapterCode: '87',
    title: 'Camioneta pickup diesel',
    content: `Producto: Camioneta pickup para carga, motor diesel, peso total <5 toneladas.

Clasificación correcta: 8704.21.03

- 87.04: "Vehículos automóviles para transporte de mercancías"
- Distinto de 87.03 (personas)
- Subpartida 8704.21: diesel, peso total ≤5 toneladas
- Las pickups VAN en 8704 aunque tengan cabina doble.

Error común: clasificar pickups en 8703. Van en 8704 porque su función primaria es CARGA.`,
    source: 'TIGIE Cap 87',
    keywords: ['pickup', 'camioneta', 'diesel', 'carga', 'troca'],
    products: ['pickup', 'camioneta carga', 'troca'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8711.20.01', chapterCode: '87',
    title: 'Motocicleta 250cc gasolina',
    content: `Producto: Motocicleta deportiva, motor de combustión interna, cilindrada 249cc.

Clasificación correcta: 8711.20.01

- 87.11: "Motocicletas (incluidos los ciclomotores)"
- Subpartida por cilindrada:
  8711.10: ≤50cc
  8711.20: 51-250cc
  8711.30: 251-500cc
  8711.40: 501-800cc
  8711.50: >800cc
  8711.60: eléctricas`,
    source: 'TIGIE Cap 87',
    keywords: ['moto', 'motocicleta', 'gasolina', 'cilindrada'],
    products: ['motocicleta', 'moto', 'scooter'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8708.30.01', chapterCode: '87',
    title: 'Sistema de frenos para vehículo',
    content: `Producto: Balatas/pastillas de freno para vehículo automóvil.

Clasificación correcta: 8708.30.01

- 87.08: "Partes y accesorios de vehículos de 8701 a 8705"
- 8708.30: "Frenos y servofrenos; sus partes"
- Las autopartes van en 87.08, NO en el capítulo del material (40-caucho, 73-acero).

Error común: clasificar pastillas de fricción como material (asbesto/caucho). Van como AUTOPARTE por su uso.`,
    source: 'TIGIE Cap 87',
    keywords: ['freno', 'balata', 'pastilla', 'autoparte', 'vehículo'],
    products: ['balata', 'pastilla freno', 'disco freno'],
    priority: 8,
  },

  // ============================================================
  // ELECTRÓNICA (Cap 84-85) — 8 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8471.30.01', chapterCode: '84',
    title: 'Laptop',
    content: `Producto: Computadora portátil (laptop), procesador Intel/AMD, pantalla ≤15", peso <10kg.

Clasificación correcta: 8471.30.01

- 84.71: "Máquinas automáticas para tratamiento o procesamiento de datos"
- 8471.30: "Máquinas automáticas portátiles, de peso inferior a 10 kg"
- Tabletas también van aquí si tienen funcionalidad de cómputo.`,
    source: 'TIGIE Cap 84',
    keywords: ['laptop', 'computadora', 'portátil', 'notebook', 'tablet'],
    products: ['laptop', 'notebook', 'ultrabook', 'MacBook'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8517.13.01', chapterCode: '85',
    title: 'Smartphone',
    content: `Producto: Teléfono inteligente (smartphone) con capacidades de red celular.

Clasificación correcta: 8517.13.01 (estándar TIGIE 2022+)

- 85.17: "Teléfonos, incluidos los celulares"
- 8517.13: "Teléfonos inteligentes"
- Antes se usaba 8517.12 (teléfonos celulares). El 2022+ separa smartphones.

Distinción: si es solo celular básico (no smartphone) sería otra subpartida.`,
    source: 'TIGIE Cap 85 — actualización 2022',
    keywords: ['smartphone', 'celular', 'teléfono', 'iPhone', 'android'],
    products: ['smartphone', 'celular', 'iPhone', 'Galaxy'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8528.52.01', chapterCode: '85',
    title: 'Monitor de computadora LCD',
    content: `Producto: Monitor LCD/LED 24", sin sintonizador de TV, entrada HDMI/DisplayPort.

Clasificación correcta: 8528.52.01

- 85.28: "Monitores y proyectores"
- 8528.52: "Los demás monitores, del tipo exclusivamente o principalmente con máquinas de 84.71"
- Distinción con Smart TV: 8528.72 (tiene sintonizador TV).

Regla: monitor sin sintonizador = 8528.52. Con sintonizador o Smart TV = 8528.72.`,
    source: 'TIGIE Cap 85',
    keywords: ['monitor', 'pantalla', 'LCD', 'LED', 'computadora'],
    products: ['monitor', 'pantalla computadora'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8528.72.07', chapterCode: '85',
    title: 'Smart TV con sintonizador',
    content: `Producto: Televisor LED 55" con sistema operativo Android/webOS y sintonizador integrado.

Clasificación correcta: 8528.72 (fracción TIGIE según tamaño/tecnología)

- 85.28: monitores y televisores
- 8528.72: "Los demás, en colores, con pantalla plana"
- Tiene sintonizador TV → NO es monitor, es televisor.`,
    source: 'TIGIE Cap 85',
    keywords: ['televisor', 'smart tv', 'LED', 'pantalla', 'sintonizador'],
    products: ['televisor', 'smart TV', 'LED TV'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8544.42.01', chapterCode: '85',
    title: 'Cable USB-C con conectores',
    content: `Producto: Cable USB-C a USB-C, 1 metro, con conectores en ambos extremos.

Clasificación correcta: 8544.42.01

- 85.44: "Hilos, cables (incluidos los coaxiales) y demás conductores aislados con aislamiento eléctrico"
- 8544.42: "Los demás, CON conectores, para tensión inferior o igual a 1000V"
- Sin conectores: 8544.49.`,
    source: 'TIGIE Cap 85',
    keywords: ['cable', 'USB', 'conector', 'USB-C', 'lightning'],
    products: ['cable USB', 'cable carga', 'cable HDMI'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8507.60.01', chapterCode: '85',
    title: 'Batería de litio-ion',
    content: `Producto: Batería recargable de litio-ion, 5000mAh, 3.7V, para teléfono móvil.

Clasificación correcta: 8507.60.01

- 85.07: "Acumuladores eléctricos"
- 8507.60: "Acumuladores de iones de litio"
- Diferente de 8506 (pilas no recargables).

Regla crítica: las baterías de litio son RRNA por transporte aéreo (ONU 3480/3481).`,
    source: 'TIGIE Cap 85',
    keywords: ['batería', 'litio', 'ion', 'acumulador', 'recargable'],
    products: ['batería litio', 'powerbank', 'batería celular'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8443.32.01', chapterCode: '84',
    title: 'Impresora multifuncional',
    content: `Producto: Impresora multifuncional inkjet (imprime, escanea, copia), conexión USB/WiFi.

Clasificación correcta: 8443.32.01

- 84.43: "Máquinas y aparatos para imprimir"
- 8443.32: "Los demás, aptos para ser conectados a una máquina automática para tratamiento de datos"`,
    source: 'TIGIE Cap 84',
    keywords: ['impresora', 'multifuncional', 'inkjet', 'láser', 'escáner'],
    products: ['impresora', 'multifuncional', 'MFP'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8518.30.01', chapterCode: '85',
    title: 'Audífonos con micrófono',
    content: `Producto: Audífonos (headphones) con micrófono integrado, con cable o Bluetooth.

Clasificación correcta: 8518.30.01

- 85.18: "Micrófonos, altavoces, auriculares"
- 8518.30: "Auriculares, incluidos los de casco, combinados con micrófono"
- AirPods y similares van aquí.`,
    source: 'TIGIE Cap 85',
    keywords: ['audífonos', 'headphones', 'auriculares', 'micrófono', 'AirPods'],
    products: ['audífonos', 'AirPods', 'headset'],
    priority: 7,
  },

  // ============================================================
  // ALIMENTOS (Cap 01-22) — 8 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '0804.40.01', chapterCode: '08',
    title: 'Aguacate Hass fresco',
    content: `Producto: Aguacate Hass fresco, sin procesar, para exportación.

Clasificación correcta: 0804.40.01

- Cap 08: frutas frescas o secas
- 0804.40: "Aguacates (paltas)"
- Fresco → Cap 08. Si fuera congelado → Cap 08 también (mismo heading, distinta subpartida). Si fuera pulpa procesada → Cap 20.`,
    source: 'TIGIE Cap 08',
    keywords: ['aguacate', 'palta', 'fruta', 'fresco', 'Hass'],
    products: ['aguacate', 'palta', 'aguacate Hass'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2208.90.04', chapterCode: '22',
    title: 'Tequila 100% agave',
    content: `Producto: Tequila reposado 100% agave, 40% alc. vol., botella 750ml.

Clasificación correcta: 2208.90.04 (TIGIE fracción específica tequila)

- 22.08: "Alcohol etílico sin desnaturalizar... aguardientes, licores"
- 2208.90: los demás aguardientes (distintos de whisky, ron, gin, vodka)
- TIGIE tiene fracción específica para tequila con denominación de origen.

Requiere: permiso COFEPRIS, padrón sectorial para bebidas alcohólicas.`,
    source: 'TIGIE Cap 22',
    keywords: ['tequila', 'agave', 'aguardiente', 'licor', 'destilado'],
    products: ['tequila', 'mezcal (similar)', 'licor'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2203.00.01', chapterCode: '22',
    title: 'Cerveza de malta',
    content: `Producto: Cerveza artesanal IPA, lata aluminio 355ml, 6.5% alc.

Clasificación correcta: 2203.00.01

- 22.03: "Cerveza de malta"
- Única partida para cervezas.
- Aplica IEPS 26.5% para cerveza, padrón sectorial bebidas alcohólicas.`,
    source: 'TIGIE Cap 22',
    keywords: ['cerveza', 'malta', 'IPA', 'ale', 'lager'],
    products: ['cerveza', 'beer'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '0201.30.01', chapterCode: '02',
    title: 'Carne de res fresca deshuesada',
    content: `Producto: Carne de res fresca deshuesada, cortes premium, refrigerada.

Clasificación correcta: 0201.30.01

- Cap 02: "Carne y despojos comestibles"
- 02.01: "Carne de animales de la especie bovina, fresca o refrigerada"
- 0201.30: "Deshuesada"

Diferente si fuera congelada (02.02) o en conserva (16.02).`,
    source: 'TIGIE Cap 02',
    keywords: ['carne', 'res', 'bovina', 'fresca', 'deshuesada'],
    products: ['carne res', 'beef', 'bistec'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '0406.90.99', chapterCode: '04',
    title: 'Queso manchego madurado',
    content: `Producto: Queso manchego madurado, pieza 3kg, de leche de vaca.

Clasificación correcta: 0406.90.99

- Cap 04: "Leche y productos lácteos"
- 04.06: "Quesos y requesón"
- 0406.90: "Los demás quesos"
- Quesos frescos (0406.10), fundidos (0406.30), azules (0406.40), rallados (0406.20).`,
    source: 'TIGIE Cap 04',
    keywords: ['queso', 'manchego', 'lácteo', 'maduro'],
    products: ['queso', 'manchego', 'gouda', 'cheddar'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '1509.10.01', chapterCode: '15',
    title: 'Aceite de oliva extra virgen',
    content: `Producto: Aceite de oliva extra virgen 100%, botella de vidrio 1L, origen España.

Clasificación correcta: 1509.10.01 (TIGIE)

- Cap 15: "Grasas y aceites animales, vegetales..."
- 15.09: "Aceite de oliva y sus fracciones"
- 1509.10 (actual SA): "Aceite de oliva virgen"
- Actualizado en 2022: antes era 1509.10, ahora 1509.20 extra virgen y 1509.30 virgen según SA2022.`,
    source: 'TIGIE Cap 15',
    keywords: ['aceite', 'oliva', 'virgen', 'extra virgen', 'olive oil'],
    products: ['aceite oliva', 'olive oil'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '1006.30.01', chapterCode: '10',
    title: 'Arroz blanco pulido',
    content: `Producto: Arroz blanco pulido grano largo, sacos 50kg.

Clasificación correcta: 1006.30.01

- Cap 10: "Cereales"
- 10.06: "Arroz"
- 1006.30: "Arroz semiblanqueado o blanqueado, incluso pulido o glaseado"

Distinción: arroz cáscara (1006.10), descascarillado (1006.20), pulido (1006.30), partido (1006.40).`,
    source: 'TIGIE Cap 10',
    keywords: ['arroz', 'cereal', 'blanco', 'pulido', 'grano'],
    products: ['arroz', 'arroz blanco'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2106.90.99', chapterCode: '21',
    title: 'Suplemento alimenticio en cápsulas',
    content: `Producto: Suplemento alimenticio con vitaminas y minerales, cápsulas, bote de 90 unidades.

Clasificación correcta: 2106.90.99 (cajón de sastre si no es medicamento)

- 21.06: "Preparaciones alimenticias no expresadas ni comprendidas en otra parte"
- Si tiene fines terapéuticos específicos podría ir en Cap 30 (farmacéuticos)
- La COFEPRIS determina el estatus de "medicamento" vs "suplemento".

Error común: clasificar suplementos como medicamentos (Cap 30). Requieren registro sanitario distinto.`,
    source: 'TIGIE Cap 21',
    keywords: ['suplemento', 'vitamina', 'cápsula', 'alimenticio'],
    products: ['suplemento', 'multivitamínico', 'proteína'],
    priority: 7,
  },

  // ============================================================
  // QUÍMICOS/FARMACÉUTICOS (Cap 28-38) — 5 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3004.90.99', chapterCode: '30',
    title: 'Medicamento genérico',
    content: `Producto: Medicamento genérico en tabletas, dosis establecida, para uso humano.

Clasificación correcta: 3004.90.99 (general, según principio activo)

- 30.04: "Medicamentos... para usos terapéuticos o profilácticos, dosificados"
- 3004.90: los demás (cuando no es antibiótico, hormona, alcaloide específico)
- Requiere registro sanitario COFEPRIS, NOMs específicas, a veces SAT/SE.`,
    source: 'TIGIE Cap 30',
    keywords: ['medicamento', 'genérico', 'tableta', 'fármaco'],
    products: ['medicamento', 'pastilla', 'fármaco'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3808.91.99', chapterCode: '38',
    title: 'Insecticida comercial',
    content: `Producto: Insecticida líquido comercial para agricultura, contiene piretroides.

Clasificación correcta: 3808.91.99

- 38.08: "Insecticidas, raticidas, fungicidas, herbicidas..."
- 3808.91: "Insecticidas"
- Requiere autorización CICOPLAFEST, SENASICA, SEMARNAT.`,
    source: 'TIGIE Cap 38',
    keywords: ['insecticida', 'plaguicida', 'piretroide', 'agricultura'],
    products: ['insecticida', 'herbicida', 'fungicida'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2807.00.01', chapterCode: '28',
    title: 'Ácido sulfúrico concentrado',
    content: `Producto: Ácido sulfúrico 98% concentración, tambores industriales.

Clasificación correcta: 2807.00.01

- Cap 28: "Productos químicos inorgánicos"
- 28.07: "Ácido sulfúrico; oleum"
- Precursor químico → registro SAT-SEDENA, COFEPRIS, SEMARNAT.`,
    source: 'TIGIE Cap 28',
    keywords: ['ácido', 'sulfúrico', 'químico', 'corrosivo'],
    products: ['ácido sulfúrico', 'H2SO4'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3304.99.99', chapterCode: '33',
    title: 'Crema facial cosmética',
    content: `Producto: Crema hidratante facial, producto cosmético de uso diario.

Clasificación correcta: 3304.99.99

- 33.04: "Preparaciones de belleza, de maquillaje y para el cuidado de la piel"
- 3304.99: "Las demás"
- Requiere registro COFEPRIS sanitario.`,
    source: 'TIGIE Cap 33',
    keywords: ['crema', 'cosmético', 'hidratante', 'facial', 'belleza'],
    products: ['crema', 'cosmético', 'maquillaje'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3401.11.01', chapterCode: '34',
    title: 'Jabón de tocador en barra',
    content: `Producto: Jabón de tocador en barra, uso personal.

Clasificación correcta: 3401.11.01

- 34.01: "Jabón; productos y preparaciones orgánicos tensoactivos..."
- 3401.11: "Jabón y productos y preparaciones orgánicos tensoactivos... de tocador"`,
    source: 'TIGIE Cap 34',
    keywords: ['jabón', 'tocador', 'baño', 'barra'],
    products: ['jabón', 'jabón barra'],
    priority: 5,
  },

  // ============================================================
  // MAQUINARIA (Cap 84) — 5 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8418.10.01', chapterCode: '84',
    title: 'Refrigerador doméstico',
    content: `Producto: Refrigerador doméstico con congelador integrado, capacidad 500L, puerta francesa.

Clasificación correcta: 8418.10.01

- 84.18: "Refrigeradores, congeladores y demás material, máquinas y aparatos para producción de frío"
- 8418.10: "Combinaciones de refrigerador y congelador con puertas exteriores separadas"
- Aplica NOM-015/022 eficiencia energética.`,
    source: 'TIGIE Cap 84',
    keywords: ['refrigerador', 'nevera', 'congelador', 'french door'],
    products: ['refrigerador', 'nevera', 'frigobar'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8450.11.01', chapterCode: '84',
    title: 'Lavadora doméstica automática',
    content: `Producto: Lavadora automática, carga frontal, 10kg de capacidad.

Clasificación correcta: 8450.11.01

- 84.50: "Máquinas para lavar ropa, incluso con dispositivo de secado"
- 8450.11: "Automáticas, de capacidad unitaria, expresada en peso de ropa seca, inferior o igual a 10 kg"`,
    source: 'TIGIE Cap 84',
    keywords: ['lavadora', 'ropa', 'automática', 'carga frontal'],
    products: ['lavadora', 'washer'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8458.11.01', chapterCode: '84',
    title: 'Torno CNC horizontal',
    content: `Producto: Torno CNC horizontal industrial, marca Haas, peso 3,500 kg.

Clasificación correcta: 8458.11.01

- 84.58: "Tornos (incluidos los centros de torneado) que trabajan por arranque de metal"
- 8458.11: "Horizontales, de control numérico (CNC)"`,
    source: 'TIGIE Cap 84',
    keywords: ['torno', 'CNC', 'horizontal', 'metal', 'Haas', 'maquinaria'],
    products: ['torno', 'torno CNC', 'máquina herramienta'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8481.80.99', chapterCode: '84',
    title: 'Válvula de bola industrial',
    content: `Producto: Válvula de bola de acero inoxidable 2", para control de flujo industrial.

Clasificación correcta: 8481.80.99

- 84.81: "Artículos de grifería y órganos similares para tuberías... válvulas"
- 8481.80: "Los demás artículos de grifería y órganos similares"`,
    source: 'TIGIE Cap 84',
    keywords: ['válvula', 'bola', 'grifería', 'flujo', 'tubería'],
    products: ['válvula', 'válvula bola'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8414.51.01', chapterCode: '84',
    title: 'Ventilador de techo',
    content: `Producto: Ventilador de techo residencial, 4 aspas, con control remoto.

Clasificación correcta: 8414.51.01

- 84.14: "Bombas de aire, ventiladores..."
- 8414.51: "Ventiladores de mesa, pie, pared, ventana, techo o tejado, con motor eléctrico incorporado de potencia no superior a 125 W"`,
    source: 'TIGIE Cap 84',
    keywords: ['ventilador', 'techo', 'aspas', 'motor'],
    products: ['ventilador', 'fan'],
    priority: 5,
  },

  // ============================================================
  // PLÁSTICOS (Cap 39) — 5 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3901.10.01', chapterCode: '39',
    title: 'Polietileno en pellets',
    content: `Producto: Polietileno de baja densidad (LDPE) en pellets/gránulos, forma primaria.

Clasificación correcta: 3901.10.01

- 39.01: "Polímeros de etileno en formas primarias"
- 3901.10: "Polietileno de densidad inferior a 0,94"
- Forma primaria = pellets, resinas, polvo, líquido.

Regla: Cap 39 se ordena por forma (primaria 3901-3914, semiacabado 3916-3921, terminado 3922-3926).`,
    source: 'TIGIE Cap 39',
    keywords: ['polietileno', 'LDPE', 'HDPE', 'pellet', 'resina', 'plástico'],
    products: ['polietileno', 'LDPE', 'HDPE', 'pellets PE'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3923.30.99', chapterCode: '39',
    title: 'Botella PET vacía',
    content: `Producto: Botella de PET vacía para llenado de bebidas, 500ml.

Clasificación correcta: 3923.30.99

- 39.23: "Artículos para el transporte o envasado, de plástico"
- 3923.30: "Bombonas (damajuanas), botellas, frascos y artículos similares"

Error común: clasificar por material (PET=3907) en vez de por uso (envase=3923). Las BOTELLAS van en 3923.`,
    source: 'TIGIE Cap 39',
    keywords: ['botella', 'PET', 'envase', 'plástico'],
    products: ['botella plástico', 'botella PET', 'envase'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3920.20.01', chapterCode: '39',
    title: 'Película de polipropileno',
    content: `Producto: Película/film de polipropileno BOPP, 20 micras, rollo para empaque.

Clasificación correcta: 3920.20.01

- 39.20: "Las demás placas, láminas, hojas y tiras, de plástico NO celular, sin refuerzo"
- 3920.20: "De polímeros de propileno"

Distinción: si tiene refuerzo con otras capas → 3921.`,
    source: 'TIGIE Cap 39',
    keywords: ['película', 'film', 'polipropileno', 'BOPP', 'empaque'],
    products: ['película PP', 'film polipropileno', 'BOPP'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3926.90.99', chapterCode: '39',
    title: 'Artículo plástico diverso',
    content: `Producto: Artículos de plástico diversos no especificados (ej: ganchos, soportes).

Clasificación correcta: 3926.90.99 (cajón de sastre en plásticos terminados)

- 39.26: "Las demás manufacturas de plástico"
- 3926.90: "Las demás"
- Usar SOLO si no hay fracción más específica.`,
    source: 'TIGIE Cap 39',
    keywords: ['plástico', 'manufactura', 'diverso', 'artículo'],
    products: ['artículos plástico varios'],
    priority: 3,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '3917.23.01', chapterCode: '39',
    title: 'Tubo de PVC rígido',
    content: `Producto: Tubo de PVC rígido para instalación hidráulica, cédula 40.

Clasificación correcta: 3917.23.01

- 39.17: "Tubos y accesorios de tubería, de plástico"
- 3917.23: "Tubos rígidos de polímeros de cloruro de vinilo"`,
    source: 'TIGIE Cap 39',
    keywords: ['tubo', 'PVC', 'rígido', 'tubería', 'hidráulico'],
    products: ['tubo PVC', 'tubería plástico'],
    priority: 6,
  },

  // ============================================================
  // ACERO/METALES (Cap 72-76) — 5 casos
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '7318.15.99', chapterCode: '73',
    title: 'Tornillos hexagonales de acero',
    content: `Producto: Tornillos hexagonales de acero al carbón, M8x25mm, galvanizados.

Clasificación correcta: 7318.15.99

- 73.18: "Tornillos, pernos, tuercas, tirafondos... de fundición, hierro o acero"
- 7318.15: "Los demás tornillos y pernos, incluso con sus tuercas y arandelas"

Distinción crítica: acero carbón vs inoxidable afecta subpartida en algunas secciones.`,
    source: 'TIGIE Cap 73',
    keywords: ['tornillo', 'perno', 'hexagonal', 'acero', 'M8'],
    products: ['tornillo', 'perno', 'tuerca'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '7210.49.99', chapterCode: '72',
    title: 'Lámina de acero galvanizada',
    content: `Producto: Rollo de acero laminado en caliente, galvanizado por inmersión, 1.2mm espesor.

Clasificación correcta: 7210.49.99

- 72.10: "Productos laminados planos de hierro o acero sin alear... revestidos"
- 7210.49: "Los demás, cincados de otro modo"
- Cincado/galvanizado = revestido con zinc.`,
    source: 'TIGIE Cap 72',
    keywords: ['acero', 'galvanizado', 'lámina', 'rollo', 'cincado'],
    products: ['lámina acero', 'acero galvanizado'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '7604.21.01', chapterCode: '76',
    title: 'Perfil de aluminio extruido',
    content: `Producto: Perfil de aluminio extruido aleado (aleación 6063), para ventanería.

Clasificación correcta: 7604.21.01

- 76.04: "Barras y perfiles de aluminio"
- 7604.21: "Perfiles huecos de aleaciones de aluminio"
- Distinción entre sin alear (7604.10) y aleado (7604.2x).`,
    source: 'TIGIE Cap 76',
    keywords: ['aluminio', 'perfil', 'extruido', 'aleación', 'ventana'],
    products: ['perfil aluminio', 'aluminio extruido'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '7308.90.99', chapterCode: '73',
    title: 'Estructura metálica fabricada',
    content: `Producto: Estructura metálica prefabricada de acero, para nave industrial.

Clasificación correcta: 7308.90.99

- 73.08: "Construcciones y sus partes... de fundición, hierro o acero"
- 7308.90: "Las demás construcciones y sus partes"`,
    source: 'TIGIE Cap 73',
    keywords: ['estructura', 'metálica', 'acero', 'construcción', 'nave'],
    products: ['estructura acero', 'estructura metálica'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '7408.11.01', chapterCode: '74',
    title: 'Alambre de cobre puro',
    content: `Producto: Alambre de cobre refinado, sin alear, diámetro 6mm, para aplicación eléctrica.

Clasificación correcta: 7408.11.01

- 74.08: "Alambre de cobre"
- 7408.11: "De cobre refinado, con la mayor dimensión de la sección transversal superior a 6 mm"`,
    source: 'TIGIE Cap 74',
    keywords: ['cobre', 'alambre', 'eléctrico', 'conductor'],
    products: ['alambre cobre', 'conductor cobre'],
    priority: 6,
  },

  // ============================================================
  // ERRORES COMUNES (20+)
  // ============================================================
  {
    type: 'ERROR_COMUN', chapterCode: '61',
    title: 'Punto vs Plano en textiles',
    content: `ERROR FRECUENTE: Clasificar prendas de punto en el capítulo 62 (tejido plano).

REGLA: Si es tejido de PUNTO → Capítulo 61 SIEMPRE.
Si es tejido PLANO → Capítulo 62 SIEMPRE.

Cómo distinguir:
- Punto: se estira, tiene elasticidad natural, se ve la estructura de malla (como una camiseta)
- Plano: no se estira (o muy poco), se ven hilos cruzados (como una camisa de vestir)

Nota 1 Cap 61: "comprende solamente artículos confeccionados de punto"
Nota 1 Cap 62: "comprende solamente artículos confeccionados que NO sean de punto"`,
    source: 'Notas legales Cap 61 y 62',
    keywords: ['punto', 'plano', 'textil', 'tejido', 'malla'],
    priority: 10,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '64',
    title: 'Clasificar calzado por el corte en vez de la suela',
    content: `ERROR: Elegir la partida del calzado mirando el material del CORTE (parte superior).

REGLA: La SUELA determina la partida en Cap 64.
- Suela caucho/plástico → 6401 (impermeable 1 pieza) o 6402 (corte mismo material) o 6403 (corte cuero) o 6404 (corte textil)
- Suela cuero → 6405

El CORTE determina la subpartida, no la partida.

Caso trampa: zapato con suela de cuero y corte sintético → va en 6405 (por la suela), NO en 6402.`,
    source: 'Notas legales Cap 64',
    keywords: ['calzado', 'suela', 'corte', 'zapato', 'partida'],
    priority: 10,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '87',
    title: 'Pickup vs automóvil',
    content: `ERROR: Clasificar camionetas pickup en 87.03 (automóviles para pasajeros).

REGLA: Las pickups van en 87.04 (vehículos para transporte de MERCANCÍAS), aunque tengan cabina doble con asientos. La función primaria es CARGA.

Distinción: un SUV cerrado va en 87.03. Una pickup con caja abierta va en 87.04.`,
    source: 'Notas explicativas Cap 87',
    keywords: ['pickup', 'automóvil', '8703', '8704', 'camioneta'],
    priority: 9,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '87',
    title: 'Híbridos no van en gasolina',
    content: `ERROR: Clasificar vehículos híbridos en 8703.23/24 (gasolina).

REGLA: Los híbridos tienen subpartida propia:
- 8703.40: híbrido gasolina (se recarga con el motor)
- 8703.50: híbrido diesel
- 8703.60: enchufable híbrido gasolina (PHEV)
- 8703.70: enchufable híbrido diesel
- 8703.80: solo eléctrico (BEV)`,
    source: 'Notas explicativas Cap 87',
    keywords: ['híbrido', 'hybrid', 'PHEV', 'BEV', 'eléctrico'],
    priority: 9,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '87',
    title: 'No verificar cilindrada exacta en vehículos',
    content: `ERROR: Clasificar un automóvil sin verificar la cilindrada exacta en cc.

REGLA: En 87.03 gasolina las subpartidas dividen por rangos exactos:
- 8703.21: ≤1000cc
- 8703.22: 1001-1500cc
- 8703.23: 1501-3000cc
- 8703.24: >3000cc

Un motor de 1998cc va en 8703.23, NO en 8703.22. Los últimos cc importan.`,
    source: 'TIGIE Cap 87',
    keywords: ['cilindrada', 'cc', 'motor', 'vehículo'],
    priority: 8,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '39',
    title: 'Envases plásticos por material, no por uso',
    content: `ERROR: Clasificar botellas, bolsas o frascos de plástico por el tipo de polímero (PE, PP, PET) en 3901-3907.

REGLA: Los envases/empaques terminados van en 3923 (envases para transporte).
Los artículos de uso doméstico van en 3924.
Los artículos de higiene/sanitarios en 3925.
Las demás manufacturas en 3926.

Las partidas 3901-3914 son para FORMAS PRIMARIAS (pellets, resinas, polvo).`,
    source: 'TIGIE Cap 39 notas',
    keywords: ['envase', 'botella', 'plástico', 'forma primaria', 'pellets'],
    priority: 9,
  },
  {
    type: 'ERROR_COMUN',
    title: 'Usar fracción .99 sin revisar específicas',
    content: `ERROR CRÍTICO: Clasificar en fracción terminada en .99 (cajón de sastre) sin revisar si hay una fracción específica.

REGLA: Siempre revisar TODAS las fracciones del subheading antes de usar .99. La fracción .99 es SOLO cuando ninguna específica aplica.

En TIGIE, la fracción .01 suele ser la más común y específica. Ejemplos:
- Camiseta algodón punto: 6109.10.01 (no .99)
- Zapato cuero: 6403.99.01 (no .99 final).`,
    source: 'Regla interpretativa TIGIE',
    keywords: ['fracción .99', 'cajón de sastre', 'específica', 'subheading'],
    priority: 10,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '63',
    title: 'Ropa de cama en Cap 61/62 en lugar de 63',
    content: `ERROR: Clasificar sábanas, cobijas, fundas en Cap 61 (punto) o Cap 62 (plano).

REGLA: Ropa de cama, mesa, tocador y cocina va SIEMPRE en Cap 63, independientemente si es de punto o plano.
- Cap 61/62: ropa de VESTIR (personas)
- Cap 63: artículos textiles confeccionados de la CASA`,
    source: 'Nota 1 Cap 63',
    keywords: ['sábana', 'cobija', 'funda', 'mantel', 'Cap 63', 'ropa cama'],
    priority: 9,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '85',
    title: 'Smart TV vs Monitor',
    content: `ERROR: Clasificar Smart TVs como monitores (8528.52).

REGLA:
- Si tiene SINTONIZADOR de TV → 8528.72 (televisor)
- Si NO tiene sintonizador, solo entradas de video → 8528.52 (monitor)

Casi todos los Smart TV tienen sintonizador, por lo tanto van en 8528.72.`,
    source: 'Nota técnica Cap 85',
    keywords: ['smart tv', 'monitor', 'sintonizador', 'televisor'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN',
    title: 'Autopartes por material en vez de uso',
    content: `ERROR: Clasificar autopartes por el material (balata de fricción en Cap 68, manguera de caucho en Cap 40).

REGLA: Las partes y accesorios de vehículos automóviles van en:
- 87.08: partes de vehículos 87.01 a 87.05
- 87.14: partes de motocicletas
- 87.16: partes de remolques
Excepto cuando hay una partida específica (ej: neumáticos van en 40.11).`,
    source: 'Nota 2 Sección XVII',
    keywords: ['autoparte', 'partes vehículo', '8708', 'refacción'],
    priority: 8,
  },
  {
    type: 'ERROR_COMUN',
    title: 'Material en aleaciones metálicas',
    content: `ERROR: Clasificar acero inoxidable como acero común en Cap 72.

REGLA: El acero inoxidable tiene partidas propias dentro de Cap 72:
- 72.18: lingotes/semiproductos de acero inoxidable
- 72.19: productos laminados planos de acero inoxidable
- 72.20: laminados estrechos
- 72.21-72.23: alambrón, barras, alambre de acero inox
Diferente de acero al carbón (7208-7217).`,
    source: 'TIGIE Cap 72',
    keywords: ['acero', 'inoxidable', 'aleación', 'carbón'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '20',
    title: 'Frutas frescas vs procesadas',
    content: `ERROR: Clasificar frutas procesadas o en conserva en Cap 08 (frutas frescas).

REGLA:
- Cap 08: frutas frescas, secas, congeladas sin procesar
- Cap 20: frutas en conserva, en almíbar, jugos procesados, mermeladas

Ejemplo: pulpa de aguacate procesada va en Cap 20, no 08.`,
    source: 'Notas Cap 08 y 20',
    keywords: ['fruta', 'fresca', 'procesada', 'conserva', 'almíbar'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN',
    title: 'Confundir cuero natural con sintético',
    content: `ERROR: Clasificar "cuero sintético" (poliuretano imitación cuero) en Cap 41 (cueros naturales).

REGLA:
- Cap 41-42: SOLO cueros naturales (de animales)
- Tela revestida de plástico imitación cuero → Cap 59 (textiles impregnados) o Cap 39 (plástico en rollos)`,
    source: 'Notas Sección VIII',
    keywords: ['cuero', 'sintético', 'imitación', 'piel', 'poliuretano'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '85',
    title: 'Parts de equipos electrónicos',
    content: `ERROR: Clasificar partes de equipos electrónicos por el material (PCB=plástico, chip=cerámica).

REGLA: Las partes de máquinas van con la máquina SI son específicas:
- 8443.99: partes de impresoras
- 8473: partes de 84.69-84.72 (computación)
- 8517.71: partes de equipos de 85.17
- 8529: partes de receptores de 85.25-85.28`,
    source: 'Nota Sección XVI',
    keywords: ['parte', 'PCB', 'chip', 'electrónico', 'máquina'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '30',
    title: 'Suplementos vs medicamentos',
    content: `ERROR: Clasificar suplementos alimenticios (vitaminas, proteína whey) en Cap 30 (farmacéuticos).

REGLA:
- Cap 30: medicamentos con acción terapéutica definida, dosificados
- Cap 21 (2106.90): suplementos alimenticios, fitofármacos, preparaciones

Los suplementos requieren registro sanitario distinto al de medicamentos.`,
    source: 'Consulta COFEPRIS',
    keywords: ['suplemento', 'medicamento', 'vitamina', 'proteína', 'whey'],
    priority: 8,
  },
  {
    type: 'ERROR_COMUN', chapterCode: '94',
    title: 'Muebles de metal vs muebles de madera',
    content: `ERROR: Clasificar muebles de metal por el metal (Cap 73).

REGLA: Los muebles van SIEMPRE en Cap 94, sin importar el material:
- 9401: asientos
- 9403: otros muebles (el material va a la subpartida)
- 9403.10: muebles de metal
- 9403.30: muebles de madera para oficina
- 9403.50: muebles de madera para dormitorio`,
    source: 'Nota 2 Cap 94',
    keywords: ['mueble', 'escritorio', 'silla', 'metal', 'madera'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN',
    title: 'Juguetes vs artículos decorativos',
    content: `ERROR: Clasificar peluches o figuras decorativas como juguetes (Cap 95) cuando son artículos ornamentales.

REGLA:
- Cap 95: juguetes diseñados para uso lúdico (muñecas, carros a escala, juegos)
- Artículos decorativos sin fin lúdico → otros capítulos según material (3926 plástico, 4420 madera)`,
    source: 'Notas Cap 95',
    keywords: ['juguete', 'peluche', 'decorativo', 'ornamental'],
    priority: 6,
  },
  {
    type: 'ERROR_COMUN',
    title: 'Ignorar regla de GRI 2a en productos incompletos',
    content: `ERROR: Clasificar un producto desmontado o incompleto en partidas de "partes".

REGLA (GRI 2a): Si el producto está desmontado o incompleto pero tiene las características esenciales del producto terminado, se clasifica como si estuviera completo.

Ejemplo: bicicleta sin pedales ni asiento pero con cuadro, ruedas y manubrio → se clasifica como bicicleta completa (8712), no como partes.`,
    source: 'GRI 2a OMA',
    keywords: ['desmontado', 'incompleto', 'GRI 2a', 'partes', 'ensamblar'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN',
    title: 'Confundir juegos y surtidos (GRI 3b)',
    content: `ERROR: Clasificar cada artículo de un set por separado cuando constituyen un "surtido" acondicionado para la venta al menor.

REGLA (GRI 3b): Los surtidos acondicionados para la venta al por menor se clasifican por el componente que les confiere carácter esencial.

Ejemplo: kit de herramientas con maletín → se clasifica por la herramienta principal, no el maletín.`,
    source: 'GRI 3b OMA',
    keywords: ['surtido', 'set', 'kit', 'GRI 3b', 'carácter esencial'],
    priority: 7,
  },
  {
    type: 'ERROR_COMUN',
    title: 'No leer las notas legales del capítulo',
    content: `ERROR MÁS GRAVE: Clasificar ignorando las Notas Legales de sección y capítulo.

REGLA: Las notas legales tienen FUERZA LEGAL mayor que los títulos. Siempre leer:
1. Notas de Sección
2. Notas de Capítulo
3. Notas de Subpartida (si aplican)

Ejemplo: Nota 1 Cap 64 define qué se considera "calzado" y excluye otros artículos. Ignorarla lleva a clasificaciones incorrectas.`,
    source: 'GRI 1 — principio fundamental',
    keywords: ['notas legales', 'sección', 'capítulo', 'GRI 1'],
    priority: 10,
  },

  // ============================================================
  // REGLAS POR SECTOR (15+)
  // ============================================================
  {
    type: 'REGLA_SECTOR', chapterCode: '64',
    title: 'Regla maestra calzado Cap 64',
    content: `EN CALZADO:
1. La SUELA determina la partida:
   - Caucho o plástico → 64.02 (sin corte) o 64.03 (con corte)
   - Cuero natural → 64.05
   - Madera, corcho → 64.05

2. El CORTE (parte superior) determina la subpartida:
   - Cuero → 6403.51/59 o 6403.91/99
   - Textil → 6404.11/19
   - Caucho/plástico → 6402.91/99

3. El USO determina la fracción:
   - Deportivo → 6404.11.02
   - Seguridad industrial → 6403.40.01
   - Los demás → .99

TRAMPA COMÚN: zapato con suela de cuero y corte de plástico. ¿Va en 6405 (suela cuero) o 6402 (corte plástico)? → VA EN 6405 porque la SUELA MANDA.`,
    source: 'Notas explicativas Cap 64 OMA',
    keywords: ['calzado', 'suela', 'corte', 'zapato', 'partida'],
    priority: 10,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '61',
    title: 'Regla maestra textiles Cap 50-63',
    content: `CLASIFICACIÓN DE TEXTILES — orden obligatorio:

1. ¿Es tejido de PUNTO o PLANO?
   - Punto → Cap 61 (prendas) o Cap 60 (telas)
   - Plano → Cap 62 (prendas) o Cap 50-59 (telas)
   - Confeccionados de casa → Cap 63

2. ¿Material PRINCIPAL por peso?
   - Seda → 50
   - Lana → 51
   - Algodón → 52
   - Otras fibras vegetales → 53
   - Filamentos sintéticos → 54
   - Fibras sintéticas discontinuas → 55

3. Para prendas confeccionadas (61/62):
   a. Género (hombre/niño vs mujer/niña)
   b. Tipo (exterior, interior, accesorio)
   c. Material principal
   d. Uso (deportivo, trabajo, casual)

4. Para ropa de casa (63):
   - 6301: mantas
   - 6302: ropa de cama/mesa/tocador/cocina
   - 6303: cortinas, visillos
   - 6304: demás artículos de moblaje`,
    source: 'Sección XI SA + TIGIE',
    keywords: ['textiles', 'punto', 'plano', 'fibra', 'confeccionado'],
    priority: 10,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '87',
    title: 'Regla maestra vehículos Cap 87',
    content: `VEHÍCULOS — aplica en este orden:

1. TIPO DE VEHÍCULO (la partida):
   - 8701: tractores
   - 8702: transporte colectivo (≥10 pasajeros)
   - 8703: automóviles para pasajeros
   - 8704: transporte de mercancías (pickups, camiones)
   - 8705: usos especiales (grúas, bomberos)
   - 8711: motocicletas
   - 8712: bicicletas
   - 8713: sillas de ruedas

2. COMBUSTIBLE Y CILINDRADA (la subpartida):
   Gasolina:
   - 8703.21: ≤1000cc
   - 8703.22: 1001-1500cc
   - 8703.23: 1501-3000cc
   - 8703.24: >3000cc
   Diesel:
   - 8703.31: ≤1500cc
   - 8703.32: 1501-2500cc
   - 8703.33: >2500cc
   Alternativos:
   - 8703.40: híbrido gasolina
   - 8703.50: híbrido diesel
   - 8703.60: enchufable gasolina (PHEV)
   - 8703.70: enchufable diesel
   - 8703.80: 100% eléctrico (BEV)

3. USADO vs NUEVO → no afecta la clasificación.
4. Autopartes → 87.08.`,
    source: 'Cap 87 SA + TIGIE',
    keywords: ['vehículo', 'cilindrada', 'combustible', 'híbrido', 'eléctrico'],
    priority: 10,
  },
  {
    type: 'REGLA_SECTOR',
    title: 'Regla maestra electrónica Cap 84-85',
    content: `ELECTRÓNICA:

Cap 84 = máquinas mecánicas / computación:
- 8471: computadoras y ADP
- 8443: impresoras
- 8418: refrigeradores
- 8450: lavadoras

Cap 85 = máquinas eléctricas / comunicaciones:
- 8507: baterías
- 8517: teléfonos (incluidos smartphones)
- 8518: audio (micrófonos, bocinas, audífonos)
- 8525: cámaras
- 8528: monitores y televisores
- 8544: cables con aislante

REGLA CRÍTICA: las tablets y laptops van en 8471 (Cap 84), aunque sean electrónicas. Los teléfonos van en 8517 (Cap 85).

Partes: normalmente van con el equipo (8473 partes de 84.71, 8529 partes de 85.25-28).`,
    source: 'Sección XVI SA',
    keywords: ['electrónica', 'computación', 'smartphone', 'partes'],
    priority: 10,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '39',
    title: 'Regla maestra plásticos Cap 39',
    content: `PLÁSTICOS — 3 grupos principales:

1. FORMAS PRIMARIAS (3901-3914):
   - 3901: polietileno (PE)
   - 3902: polipropileno (PP)
   - 3903: poliestireno (PS)
   - 3904: PVC
   - 3907: PET, poliésteres
   Aquí van pellets, resinas, polvo, líquido.

2. SEMIACABADOS (3916-3921):
   - 3916: monofilamentos, varillas, perfiles
   - 3917: tubos y accesorios
   - 3919: películas autoadhesivas
   - 3920: películas sin refuerzo
   - 3921: placas/películas con refuerzo

3. TERMINADOS (3922-3926):
   - 3922: artículos sanitarios (bañeras, lavabos)
   - 3923: envases para transporte (botellas, bolsas)
   - 3924: artículos de uso doméstico
   - 3925: artículos para construcción
   - 3926: los demás (cajón de sastre)

REGLA: elige por FORMA primero, luego por polímero.`,
    source: 'Cap 39 notas OMA',
    keywords: ['plástico', 'primaria', 'semiacabado', 'terminado', 'polímero'],
    priority: 10,
  },
  {
    type: 'REGLA_SECTOR',
    title: 'Regla general "carácter esencial" GRI 3b',
    content: `Para MEZCLAS y SURTIDOS:

Aplicar GRI 3b: clasificar por el componente o material que da el CARÁCTER ESENCIAL al conjunto.

Criterios para determinar carácter esencial:
1. Peso (en mezclas)
2. Valor económico
3. Función del producto
4. Rol del componente en el uso

Ejemplo: Camisa con 60% algodón 40% poliéster → algodón da carácter esencial (mayor peso).
Ejemplo: Set de cocina con 5 herramientas + maletín plástico → la herramienta principal da carácter esencial.`,
    source: 'GRI 3b OMA',
    keywords: ['carácter esencial', 'mezcla', 'surtido', 'GRI 3b'],
    priority: 9,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '22',
    title: 'Bebidas alcohólicas — partidas clave',
    content: `BEBIDAS ALCOHÓLICAS (Cap 22):

- 2203: Cerveza de malta (única partida)
- 2204: Vinos de uva
- 2205: Vermut (vino aromatizado)
- 2206: Las demás bebidas fermentadas (sidra, perada, mead)
- 2207: Alcohol etílico sin desnaturalizar ≥80%
- 2208: Aguardientes, licores
  - 2208.20: brandy, coñac
  - 2208.30: whisky
  - 2208.40: ron
  - 2208.50: gin
  - 2208.60: vodka
  - 2208.70: licores
  - 2208.90: los demás (tequila, mezcal)

TODAS requieren padrón sectorial alcoholes y aplican IEPS.`,
    source: 'TIGIE Cap 22',
    keywords: ['alcohol', 'bebida', 'vino', 'cerveza', 'destilado', 'IEPS'],
    priority: 9,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '90',
    title: 'Instrumentos médicos Cap 90',
    content: `Los instrumentos médicos van en Cap 90:

- 9018: instrumentos de medicina y odontología
- 9019: aparatos de mecanoterapia, ozonoterapia
- 9021: prótesis, ortopédicos
- 9022: rayos X, radiaciones

TODOS requieren registro COFEPRIS sanitario y pueden requerir NOMs específicas.

Error común: clasificar mascarillas quirúrgicas como textiles (cap 62). Van en 6307.90 si son textiles, pero si se declaran "médicas" → revisar 9018 y COFEPRIS.`,
    source: 'Cap 90 + COFEPRIS',
    keywords: ['médico', 'instrumento', 'COFEPRIS', 'quirúrgico'],
    priority: 8,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '85',
    title: 'Cables vs conductores eléctricos',
    content: `EN CABLES (85.44):

Subpartida depende de:
1. Con/sin CONECTORES:
   - Con conectores: 8544.42 (hasta 1000V)
   - Sin conectores: 8544.49
2. VOLTAJE:
   - ≤1000V: 8544.41-42-49
   - 1000-66kV: 8544.60
3. TIPO:
   - Coaxial: 8544.20
   - Para bobina de encendido: 8544.30
   - Fibra óptica: 8544.70`,
    source: 'TIGIE Cap 85',
    keywords: ['cable', 'conductor', 'conector', 'voltaje', 'fibra óptica'],
    priority: 7,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '42',
    title: 'Artículos de cuero Cap 42',
    content: `ARTÍCULOS DE CUERO (Cap 42):

- 42.01: artículos de talabartería (sillas de montar, arneses)
- 42.02: baúles, maletas, bolsos de mano, carteras
- 42.03: prendas de vestir de cuero
- 42.04: artículos de cuero para uso técnico
- 42.05: demás manufacturas de cuero

REGLA: 42.02 incluye bolsas aunque sean de imitación cuero, plástico o textil (tiene subpartidas por material).

Bolsa 100% textil → 4202.22 o 4202.92 (según cierre/formato).
Bolsa de cuero → 4202.21 o 4202.91.`,
    source: 'Cap 42 notas',
    keywords: ['cuero', 'bolsa', 'maleta', 'cartera', 'talabartería'],
    priority: 7,
  },
  {
    type: 'REGLA_SECTOR',
    title: 'NICO — últimos 2 dígitos TIGIE',
    content: `Los últimos 2 dígitos (NICO) en TIGIE distinguen variantes específicas.

REGLA: el NICO va después de la fracción de 8 dígitos mexicana.
Ejemplo: 6109.10.01 (fracción 8 dígitos) + "00" (NICO) = 6109.10.01.00

NICO .00 = general, sin distinción especial.
NICO específico = variante particular (tallaje, calidad, certificación).

No confundir NICO con la fracción. La fracción es 8 dígitos; el NICO son 2 dígitos adicionales.`,
    source: 'Anexo 22 TIGIE',
    keywords: ['NICO', 'dígitos', 'fracción', 'variante'],
    priority: 6,
  },
  {
    type: 'REGLA_SECTOR', chapterCode: '73',
    title: 'Tornillería acero — 7318',
    content: `EN TORNILLERÍA (73.18):

Subpartidas por tipo:
- 7318.11: tirafondos (madera)
- 7318.12: otros tornillos para madera
- 7318.13: escarpias y armellas
- 7318.14: tornillos taladradores
- 7318.15: los demás tornillos y pernos (hexagonales estándar)
- 7318.16: tuercas
- 7318.19: los demás
- 7318.21: arandelas de muelle
- 7318.22: las demás arandelas
- 7318.23: remaches
- 7318.24: pasadores y chavetas
- 7318.29: los demás sin rosca

Distinguir acero común (73.18) de acero inoxidable (puede tener fracción específica en TIGIE).`,
    source: 'TIGIE Cap 73',
    keywords: ['tornillo', 'perno', 'tuerca', 'arandela', 'remache'],
    priority: 7,
  },
  {
    type: 'REGLA_SECTOR',
    title: 'GRI 5 — estuches y envases',
    content: `GRI 5:

a) Estuches para cámaras, instrumentos musicales, armas, dibujo, collares: van con el producto contenido SIEMPRE que sean aptos para uso prolongado y presentados con el producto.

b) Envases: los envases se clasifican con el producto si son del tipo normalmente utilizado para ese producto. Excepción: envases susceptibles de uso repetido (ej: tanques de gas reutilizables) se clasifican por separado.

Ejemplo: estuche de violín con violín → todo va en la partida del violín (9202), no por separado.
Ejemplo: botella PET con bebida → el envase NO se clasifica (va con la bebida).
Ejemplo: tanque de gas LP reutilizable → SÍ se clasifica aparte (73.11 si es de acero).`,
    source: 'GRI 5 OMA',
    keywords: ['estuche', 'envase', 'GRI 5', 'reutilizable'],
    priority: 8,
  },
  {
    type: 'REGLA_SECTOR',
    title: 'Aranceles preferenciales TMEC',
    content: `ARANCEL PREFERENCIAL TMEC:

Requisitos para arancel 0% TMEC:
1. Origen USA o Canadá (o regla de origen cumplida)
2. Certificado de origen válido
3. Declaración en el pedimento
4. Mercancía debe cumplir regla de origen específica del Cap de TMEC

Fracciones con arancel 0% TMEC son la mayoría en productos industriales, textiles, agrícolas de alcance regional. Verificar en TIGIE columna "TMEC".

Error común: asumir 0% sin verificar origen. Si no hay certificado válido → aplica NMF.`,
    source: 'TMEC + Reglas de Origen',
    keywords: ['TMEC', 'preferencial', 'origen', 'NMF', 'certificado'],
    priority: 8,
  },
  {
    type: 'REGLA_SECTOR',
    title: 'Padrón sectorial — cuándo aplica',
    content: `PADRÓN SECTORIAL — sectores que lo requieren:

1. Bebidas alcohólicas (Cap 22)
2. Tabacos y cigarros (Cap 24)
3. Hidrocarburos (Cap 27)
4. Productos químicos (algunos Cap 28-38)
5. Textiles y confección (algunos Cap 50-63)
6. Calzado (algunos Cap 64)
7. Vehículos automotores (algunos Cap 87)

Sin padrón sectorial vigente → la mercancía NO puede importarse (o sale al régimen común sin permiso).
Verificar en el campo "sectoralRegistry" de la fracción en BD.`,
    source: 'Reglas Generales de Comercio Exterior',
    keywords: ['padrón', 'sectorial', 'RFC', 'importador'],
    priority: 8,
  },

  // ============================================================
  // NOTAS LEGALES (reproducidas)
  // ============================================================
  {
    type: 'NOTA_LEGAL', chapterCode: '61',
    title: 'Nota 1 Cap 61 — Solo punto',
    content: `NOTA 1 DEL CAPÍTULO 61:

"Este Capítulo solo comprende los artículos confeccionados de tejido de punto."

Consecuencia: si la prenda no es tejido de punto, NO puede estar en Cap 61. Tiene que ser Cap 62 (tejido plano) u otro.`,
    source: 'SA Cap 61',
    keywords: ['nota legal', 'Cap 61', 'punto'],
    priority: 10,
  },
  {
    type: 'NOTA_LEGAL', chapterCode: '62',
    title: 'Nota 1 Cap 62 — Solo no-punto',
    content: `NOTA 1 DEL CAPÍTULO 62:

"Este Capítulo solo comprende los artículos confeccionados con los tejidos de los Capítulos 50 a 56, 58 y 59, que no sean prendas de los Capítulos 61, 63 o 65."

Consecuencia: Cap 62 = tejido plano (50-55) para prendas de vestir. Excluye punto (61), ropa de casa (63) y sombrerería (65).`,
    source: 'SA Cap 62',
    keywords: ['nota legal', 'Cap 62', 'plano', 'tejido'],
    priority: 10,
  },
  {
    type: 'NOTA_LEGAL', chapterCode: '64',
    title: 'Nota 4 Cap 64 — Definición de calzado',
    content: `NOTA 4 DEL CAPÍTULO 64:

a) "Se entiende por PARTE SUPERIOR el material que cubra la parte superior del pie."
b) "Se entiende por SUELA EXTERIOR la parte del calzado (exclusive el tacón) en contacto con el suelo durante la marcha."

La SUELA EXTERIOR determina la partida:
- Caucho/plástico con parte superior igual → 6402
- Caucho/plástico con parte superior diferente → 6403/6404
- Cuero → 6403 o 6405
- Textil → 6404 o 6405
- Otros materiales → 6405`,
    source: 'SA Cap 64 Nota 4',
    keywords: ['nota legal', 'Cap 64', 'suela', 'parte superior'],
    priority: 10,
  },
  {
    type: 'NOTA_LEGAL',
    title: 'Nota 2 Sección XVI — Partes',
    content: `NOTA 2 SECCIÓN XVI (Cap 84-85):

"Con sujeción a lo dispuesto en la Nota 1... las partes de máquinas... se clasifican de acuerdo con las reglas siguientes:
a) las partes que consistan en artículos comprendidos en cualquiera de las partidas de los Capítulos 84 o 85 se clasifican en dicha partida...
b) las demás partes, si son adecuadas para utilizarse exclusiva o principalmente con un tipo particular de máquina... se clasifican en la partida de esta máquina o, según los casos, en las partidas 84.09, 84.31, 84.48, 84.66, 84.73, 85.03, 85.22, 85.29 o 85.38..."

Consecuencia: las partes específicas van con la máquina (ej: partes de computadora → 8473).`,
    source: 'SA Sección XVI Nota 2',
    keywords: ['nota legal', 'Sección XVI', 'partes', '84', '85'],
    priority: 9,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log(`🌱 Sembrando ${KNOWLEDGE_BASE.length} registros de conocimiento...`);

  let created = 0;
  for (const k of KNOWLEDGE_BASE) {
    await prisma.classificationKnowledge.create({
      data: {
        type: k.type,
        fractionCode: k.fractionCode,
        chapterCode: k.chapterCode,
        sectionCode: k.sectionCode,
        title: k.title,
        content: k.content,
        source: k.source,
        keywords: k.keywords,
        products: k.products,
        priority: k.priority ?? 5,
        verified: true,
        verifiedBy: 'seed',
      },
    });
    created++;
  }

  console.log(`   ✅ ${created} registros creados`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Error en seed de knowledge-base:', e);
    process.exit(1);
  });
}
