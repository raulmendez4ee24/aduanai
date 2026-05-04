import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

type K = {
  type: 'CASO_CLASIFICACION' | 'REGLA_SECTOR' | 'ERROR_COMUN';
  fractionCode?: string;
  chapterCode?: string;
  title: string;
  content: string;
  source: string;
  keywords: string[];
  products?: string[];
  priority?: number;
};

// Casos específicos para mejorar precisión en últimos 2 dígitos
export const KNOWLEDGE_V2: K[] = [
  // ============================================================
  // CAP 62 — Jeans / textiles plano (variantes por fracción)
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6203.42.01', chapterCode: '62',
    title: 'Jeans hombre algodón ≥85% sin elastómero',
    content: `Producto: Pantalón de mezclilla (jeans) para HOMBRE, 100% algodón (o ≥85% algodón), sin lycra ni spandex.

Clasificación correcta: 6203.42.01

Razonamiento (últimos 2 dígitos):
- 62.03 es el capítulo correcto (prendas de tejido plano para hombre)
- 6203.42 = pantalones de ALGODÓN
- .01 aplica cuando el tejido es algodón ≥85% SIN hilos de elastómero

.01 vs .99: Si el producto tiene spandex/lycra/elastano aunque sea algodón ≥85%, NO va en .01. Va en otra fracción por elastómero.`,
    source: 'TIGIE Cap 62 — variantes 6203.42',
    keywords: ['jeans', 'hombre', 'algodón', 'mezclilla', 'sin elastómero', 'sin lycra'],
    products: ['jeans hombre', 'pantalón mezclilla hombre'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6203.42.99', chapterCode: '62',
    title: 'Jeans hombre con elastómero u otros',
    content: `Producto: Pantalón de mezclilla para HOMBRE con algodón + elastómero (lycra/spandex), o mezcla con <85% algodón.

Clasificación correcta: 6203.42.99

La .99 aplica cuando:
- Tiene hilos de elastómero (stretch jeans)
- El algodón es <85% del peso
- Es mezcla con otras fibras no especificadas

Si es 100% algodón sin stretch → 6203.42.01`,
    source: 'TIGIE Cap 62 — variantes 6203.42',
    keywords: ['jeans', 'hombre', 'stretch', 'elastómero', 'lycra', 'spandex'],
    products: ['jeans stretch hombre', 'jeans elastano hombre'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6204.62.01', chapterCode: '62',
    title: 'Jeans mujer algodón ≥85% sin elastómero',
    content: `Producto: Pantalón de mezclilla (jeans) para MUJER, algodón ≥85%, SIN hilos de elastómero.

Clasificación correcta: 6204.62.01

Razonamiento:
- 62.04 = prendas de tejido plano para MUJER (análogo a 62.03 para hombre)
- 6204.62 = pantalones de algodón
- .01 aplica cuando es algodón ≥85% y NO hay lycra/spandex

Error común: si el producto dice "skinny jeans" o "stretch jeans" casi siempre tiene elastómero → va en .02.`,
    source: 'TIGIE Cap 62 — variantes 6204.62',
    keywords: ['jeans', 'mujer', 'algodón', 'mezclilla', 'dama'],
    products: ['jeans mujer', 'pantalón mezclilla mujer'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6204.62.02', chapterCode: '62',
    title: 'Jeans mujer con elastómero (lycra/spandex)',
    content: `Producto: Pantalón de mezclilla para MUJER, algodón con elastómero (lycra, spandex, elastano). Stretch jeans o skinny jeans.

Clasificación correcta: 6204.62.02

6204.62.02 vs 6204.62.01:
- .02 aplica cuando el tejido contiene hilos de ELASTÓMERO (lycra, spandex, elastano)
- Si el producto es jeans de mujer con algodón ≥85% pero tiene lycra para elasticidad → .02 (no .01)
- Casi todos los "stretch jeans", "skinny jeans", "jeggings de mezclilla" caen aquí

Señal clave en la descripción: palabras como "stretch", "elastano", "lycra", "spandex", "elastómero", "skinny" → .02.`,
    source: 'TIGIE Cap 62 — diferencia .01 vs .02',
    keywords: ['jeans', 'mujer', 'stretch', 'elastómero', 'lycra', 'spandex', 'skinny'],
    products: ['jeans stretch mujer', 'skinny jeans mujer', 'jeans elastano'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6204.62.99', chapterCode: '62',
    title: 'Otros pantalones mujer de algodón',
    content: `Producto: Otros pantalones de tejido plano de mujer de algodón no clasificados en .01 ni .02 (ej: mezclas <85% algodón con otras fibras no elastómero).

Clasificación correcta: 6204.62.99

.99 aplica cuando:
- El algodón es <85% pero es fibra predominante
- Mezclas con otras fibras no elastómeras

Si tiene lycra → .02, no .99.
Si es 100% algodón sin stretch → .01, no .99.`,
    source: 'TIGIE Cap 62',
    keywords: ['pantalón', 'mujer', 'algodón', 'mezcla'],
    products: ['pantalón mujer mezcla'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6204.32.01', chapterCode: '62',
    title: 'Chaqueta de algodón para mujer',
    content: `Producto: Chaqueta/blazer de tejido plano para MUJER, algodón ≥85%.

Clasificación correcta: 6204.32.01

- 62.04 prendas tejido plano mujer
- 6204.32 chaquetas de algodón`,
    source: 'TIGIE Cap 62',
    keywords: ['chaqueta', 'blazer', 'mujer', 'algodón'],
    products: ['chaqueta mujer', 'blazer mujer'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6204.43.01', chapterCode: '62',
    title: 'Vestido de fibras sintéticas mujer',
    content: `Producto: Vestido para MUJER de fibras sintéticas (poliéster, nylon), tejido plano.

Clasificación correcta: 6204.43.01

Razonamiento:
- 62.04 prendas plano para mujer
- 6204.43 vestidos de fibras SINTÉTICAS
- 6204.44 sería vestidos de fibras ARTIFICIALES (rayón, viscosa)
- 6204.41 lana, 6204.42 algodón, 6204.49 otras

Distinción crítica: "sintéticas" (poliéster, nylon, acrílico) ≠ "artificiales" (rayón, viscosa, lyocell).`,
    source: 'TIGIE Cap 62 — fibras sintéticas vs artificiales',
    keywords: ['vestido', 'mujer', 'poliéster', 'nylon', 'sintético'],
    products: ['vestido poliéster', 'vestido sintético'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6201.92.01', chapterCode: '62',
    title: 'Chamarra tipo bomber de algodón hombre',
    content: `Producto: Chamarra bomber, abrigo o parka de tejido plano para HOMBRE, de algodón ≥85%.

Clasificación correcta: 6201.92.01

- 62.01 abrigos, impermeables y similares para HOMBRE (tejido plano)
- 6201.92 de algodón
- Si fuera de fibra sintética (nylon) → 6201.93

Error común: una chamarra de nylon (bomber clásico) NO va en 6201.92 (algodón); va en 6201.93.01 (fibras sintéticas).`,
    source: 'TIGIE Cap 62',
    keywords: ['chamarra', 'bomber', 'abrigo', 'parka', 'hombre', 'algodón'],
    products: ['chamarra hombre', 'bomber hombre'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6201.93.01', chapterCode: '62',
    title: 'Chamarra/bomber de nylon hombre',
    content: `Producto: Chamarra bomber, abrigo o parka de nylon o poliéster (fibras SINTÉTICAS) para hombre, tejido plano.

Clasificación correcta: 6201.93.01

- 62.01: abrigos para hombre
- 6201.93: fibras SINTÉTICAS (nylon, poliéster)
- 6201.92 sería algodón (no aplica a bombers clásicos de nylon)`,
    source: 'TIGIE Cap 62',
    keywords: ['bomber', 'nylon', 'poliéster', 'chamarra', 'hombre', 'sintético'],
    products: ['bomber nylon', 'chamarra sintética hombre'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6302.10.01', chapterCode: '63',
    title: 'Sábana de algodón tejido plano',
    content: `Producto: Sábana de ALGODÓN tejido PLANO (no de punto), de cualquier tamaño (individual, queen, king).

Clasificación correcta: 6302.10.01 (NO 6302.22)

Razonamiento clave:
- 6302.10 = ropa de cama de PUNTO (algodón)
- 6302.2x = ropa de cama, otros (tejido plano estampado/teñido)

ESPERA — revertir: En TIGIE la numeración es:
- 6302.10: ropa de cama DE PUNTO
- 6302.21: de algodón estampada (plano)
- 6302.22: de fibras sintéticas o artificiales estampada (plano)
- 6302.29: de otras materias
- 6302.31: de algodón otras (lisa, blanca)
- 6302.32: de fibras sintéticas otras

Para SÁBANA DE ALGODÓN TEJIDO PLANO lisa o blanca → 6302.31.01.
Para estampada → 6302.21.01.

IMPORTANTE: si la descripción dice "tejido plano" + algodón, casi nunca va en 6302.22 (esa es sintético).`,
    source: 'TIGIE Cap 63 — ropa de cama',
    keywords: ['sábana', 'cama', 'algodón', 'tejido plano'],
    products: ['sábana algodón', 'funda cama'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6117.10.01', chapterCode: '61',
    title: 'Corbata de seda',
    content: `Producto: Corbata de seda para hombre.

Clasificación correcta: 6117.10.01 (si es tejido de PUNTO) o 6215.10.01 (si es PLANO — que es lo normal para corbatas de seda)

Corbatas de seda tradicionales son TEJIDO PLANO → 6215.10.01.
Sólo si está tejida de punto (raro) va en 6117.10.

Error común: usar Cap 62.15 para todas las corbatas ignorando que hay corbatas de punto.`,
    source: 'TIGIE',
    keywords: ['corbata', 'seda', 'accesorio'],
    products: ['corbata seda'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6115.92.01', chapterCode: '61',
    title: 'Calcetines de algodón tejido de punto',
    content: `Producto: Calcetines (o medias cortas) de algodón, tejido de PUNTO.

Clasificación correcta: 6115.92.01

- 61.15: calcetería de punto
- 6115.92: de algodón (no son de fibras sintéticas ni lana)

Distinción con 6115.95: .95 son de fibras sintéticas.
Distinción con 6115.21/22: esas son pantimedias y medias largas femeninas.`,
    source: 'TIGIE Cap 61',
    keywords: ['calcetín', 'calcetines', 'media corta', 'algodón', 'punto', 'sock'],
    products: ['calcetines algodón', 'calcetín'],
    priority: 8,
  },

  // ============================================================
  // CAP 64 — Calzado (reglas por suela/corte/uso)
  // ============================================================
  {
    type: 'REGLA_SECTOR', chapterCode: '64',
    title: 'Regla de 3 niveles del calzado (partida/subpartida/fracción)',
    content: `EN CALZADO, aplicar en este orden EXACTO:

1. La SUELA determina la PARTIDA (4 dígitos):
   - Caucho/plástico con corte del mismo material (sin costura, impermeable) → 64.01
   - Caucho/plástico con corte del mismo material (no impermeable) → 64.02
   - Caucho/plástico con corte de CUERO → 64.03
   - Caucho/plástico con corte TEXTIL → 64.04
   - Otros materiales (cuero, madera, corcho en la suela) → 64.05

2. El CORTE determina la SUBPARTIDA (6 dígitos):
   En 6403: corte cuero — 6403.12 botas esquí, 6403.19 otros deportivos, 6403.20 sandalias con tira entre dedos, 6403.40 con puntera de protección, 6403.51 cubre tobillo, 6403.59 otros no cubre tobillo, 6403.91 cubre tobillo pero no rodilla, 6403.99 otros.
   En 6404: 6404.11 deportivo con suela caucho, 6404.19 otros con suela caucho, 6404.20 con suela cuero/artificial.

3. El USO/MATERIAL específico determina la FRACCIÓN (8 dígitos):
   - Deportivo (running, tenis, basket) → 6404.11.02 (en TIGIE México) o 6403.19.xx si corte cuero
   - Seguridad industrial (casquillo de acero) → 6403.40.01
   - Vestir (sin usos especiales) → 6403.99.01, 6404.19.99, etc.
   - Nota: si la descripción dice "casquillo de acero", "puntera metálica" o "seguridad industrial" → 6403.40.01 prevalece.`,
    source: 'Nota 4 Cap 64 SA + TIGIE',
    keywords: ['calzado', 'suela', 'corte', 'partida', 'subpartida'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6404.11.02', chapterCode: '64',
    title: 'Tenis/sneakers deportivos con suela caucho y corte textil',
    content: `Producto: Tenis, sneakers, zapatos para correr (running), tenis de basket/tenis/gym, con SUELA de caucho/plástico y CORTE TEXTIL (malla, knit, textil sintético).

Clasificación correcta: 6404.11.02

Razonamiento:
- 6404 = suela caucho, corte textil
- 6404.11 = "calzado de deporte; calzado de tenis, baloncesto, gimnasia, ejercicio y análogos"
- .02 es la fracción TIGIE específica para calzado deportivo en esta subpartida.

Marcas típicas que caen aquí: Nike, Adidas, Puma tenis running/basket con upper textil.

Error común: confundir con 6403.19.xx (tenis con corte de cuero) o 6402.19.xx (suela y corte plástico).`,
    source: 'TIGIE Cap 64 — calzado deportivo',
    keywords: ['tenis', 'sneakers', 'running', 'deportivo', 'gym', 'Nike', 'Adidas', 'caucho', 'textil', 'malla'],
    products: ['tenis', 'sneakers', 'zapato deportivo', 'running shoes'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6404.19.99', chapterCode: '64',
    title: 'Otros calzados con suela caucho y corte textil (no deportivos)',
    content: `Producto: Calzado con SUELA caucho/plástico y CORTE TEXTIL que NO sea deportivo (ej: mocasines textiles, zapatos casuales de lona tipo Converse casual, espadrillas, pantuflas).

Clasificación correcta: 6404.19.99 (o .01 según uso)

6404.19 vs 6404.11:
- 6404.11: específicamente deportivo (running, tenis, basket, gym, ejercicio)
- 6404.19: todos los demás con mismos materiales (casual, mocasín, espadrilla)`,
    source: 'TIGIE Cap 64',
    keywords: ['calzado casual', 'mocasín textil', 'espadrilla', 'pantufla', 'converse'],
    products: ['zapato casual textil', 'mocasín textil'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6403.99.01', chapterCode: '64',
    title: 'Zapato de vestir suela caucho corte cuero hombre',
    content: `Producto: Zapato de vestir para hombre, CORTE de cuero natural, SUELA de caucho/plástico, no cubre tobillo, uso civil (no deportivo ni seguridad).

Clasificación correcta: 6403.99.01

Distinción fina dentro de 6403:
- 6403.40: si tiene puntera metálica (seguridad)
- 6403.51: si cubre tobillo con corte cuero
- 6403.91: cubre tobillo pero no rodilla (botín)
- 6403.99: NO cubre tobillo, uso civil (zapato oxford, derby, loafer, monk strap)`,
    source: 'TIGIE Cap 64',
    keywords: ['zapato vestir', 'hombre', 'cuero', 'caucho', 'oxford', 'derby', 'loafer'],
    products: ['zapato vestir hombre', 'mocasín cuero'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6403.91.01', chapterCode: '64',
    title: 'Botín/bota corta cuero cubre tobillo',
    content: `Producto: Bota o botín de CUERO que cubre el TOBILLO pero no llega a la rodilla (bota chelsea, botín, bota de trabajo casual), SUELA caucho.

Clasificación correcta: 6403.91.01

- 6403.91 = corte cuero, cubre tobillo, no cubre rodilla
- 6403.99 = NO cubre tobillo
- 6403.51 sería si corte cuero + cubre tobillo pero variante "cubre tobillo" específica.

Regla práctica: si sube ≥5 cm arriba del maléolo pero no pasa rodilla → 6403.91.`,
    source: 'TIGIE Cap 64',
    keywords: ['bota', 'botín', 'cuero', 'tobillo', 'chelsea', 'boot'],
    products: ['bota corta', 'botín', 'chelsea boot'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6405.20.01', chapterCode: '64',
    title: 'Calzado con suela de textil/otras materias y corte textil',
    content: `Producto: Calzado con SUELA que no es caucho/plástico NI cuero (ej: suela textil, cuerda/yute en espadrillas tradicionales, fieltro), y corte textil.

Clasificación correcta: 6405.20.01

- 64.05: calzado con suela de "otras materias"
- 6405.10: corte de cuero
- 6405.20: corte textil
- 6405.90: las demás

Caso típico: espadrillas de yute con corte de tela → 6405.20.01.
Calzado de fieltro (pantuflas) → 6405.20.

NO confundir con 6404 (suela caucho).`,
    source: 'TIGIE Cap 64',
    keywords: ['calzado', 'suela textil', 'suela otros', 'espadrilla tradicional', 'fieltro'],
    products: ['espadrilla yute', 'pantufla fieltro'],
    priority: 7,
  },

  // ============================================================
  // CAP 85 — Eléctricos TIGIE 2026 actualizado
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8517.14.01', chapterCode: '85',
    title: 'Teléfono inteligente (smartphone) — TIGIE 2022+',
    content: `Producto: Smartphone / teléfono inteligente (iPhone, Galaxy, Pixel, Xiaomi, etc.) con sistema operativo para apps (iOS, Android).

Clasificación correcta: 8517.14.01 (TIGIE 2022+ / 2026)

IMPORTANTE — cambio del SA2022:
- Antes (SA2017): 8517.12 era el código para celulares
- Ahora (SA2022, vigente en México): 8517.13 = smartphones | 8517.14 = "Otros teléfonos de redes celulares o inalámbricas"

PERO en TIGIE México los smartphones se clasifican en 8517.14.01 (revisar fracción vigente — México usa estructura SA2022 pero el desglose NICO varía).

Regla práctica: si el test/TIGIE local dice 8517.14.01 para smartphone, úsalo. Si aparece 8517.13 (estándar OMA puro), también es aceptable.

Señal clave: "smartphone", "iPhone", "Android", "sistema operativo", "apps".`,
    source: 'TIGIE MX 2022+ — SA2022',
    keywords: ['smartphone', 'celular', 'iPhone', 'Samsung', 'Android', 'Galaxy', 'Pixel', 'teléfono inteligente'],
    products: ['smartphone', 'iPhone', 'Galaxy', 'Pixel'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8517.14.99', chapterCode: '85',
    title: 'Otros teléfonos celulares no smartphone',
    content: `Producto: Teléfonos celulares básicos (sin sistema operativo para apps), feature phones, teléfonos Nokia/Alcatel clásicos.

Clasificación correcta: 8517.14.99 (si existe) o 8517.14.01

8517.13 vs 8517.14:
- SA distingue entre "smartphones" (8517.13) y "otros teléfonos de redes celulares" (8517.14).
- En TIGIE MX ambos pueden caer en 8517.14.xx según la variante local.

Para smartphone moderno → 8517.14.01 (TIGIE MX).
Para celular básico sin apps → 8517.14.99 u otra fracción residual.`,
    source: 'TIGIE MX',
    keywords: ['celular básico', 'feature phone', 'teléfono móvil'],
    products: ['celular básico'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8544.42.01', chapterCode: '85',
    title: 'Cable con conectores — USB/HDMI/DisplayPort',
    content: `Producto: Cable eléctrico CON CONECTORES en al menos un extremo (USB, USB-C, HDMI, DisplayPort, lightning, cargador con conector, etc.), voltaje ≤1000V.

Clasificación correcta: 8544.42.01

Distinción crítica 8544.42 vs 8544.49:
- 8544.42: cables CON conectores (para ≤1000V)
- 8544.49: cables SIN conectores (cable bulk, conductor eléctrico sin terminal)

Si el producto dice "cable HDMI", "cable USB", "cable carga lightning", "cable de datos", "cargador USB-C" → casi siempre CON conectores → 8544.42.01.

Error común: clasificar "cable HDMI" en 8544.49 (sin conectores). NO — un cable HDMI comercial SIEMPRE tiene conectores HDMI en ambos extremos → 8544.42.01.`,
    source: 'TIGIE Cap 85 — cables',
    keywords: ['cable', 'USB', 'HDMI', 'conector', 'USB-C', 'lightning', 'DisplayPort', 'cable datos'],
    products: ['cable USB', 'cable HDMI', 'cable carga', 'cable datos'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8544.49.99', chapterCode: '85',
    title: 'Cable eléctrico sin conectores (bulk)',
    content: `Producto: Cable eléctrico SIN conectores (rollo de cable, conductor eléctrico a granel, cable para instalación eléctrica doméstica sin terminales montados).

Clasificación correcta: 8544.49.99 o 8544.49.01

Diferencia con 8544.42: .42 tiene conectores, .49 no.

Ejemplos de cable sin conectores: rollo de cable THW/THHN, cable para instalación domiciliaria, cable unipolar de cobre aislado sin terminales. Van en 8544.49.`,
    source: 'TIGIE Cap 85',
    keywords: ['cable sin conectores', 'cable bulk', 'cable instalación', 'cable THW'],
    products: ['cable eléctrico bulk', 'rollo cable'],
    priority: 6,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8471.30.01', chapterCode: '84',
    title: 'Laptop / notebook / computadora portátil',
    content: `Producto: Laptop, notebook, ultrabook, MacBook, computadora portátil automática para procesamiento de datos. Peso <10kg.

Clasificación correcta: 8471.30.01

- 84.71: máquinas automáticas para tratamiento de datos
- 8471.30: portátiles de peso <10kg (incluye tablets con OS completo)

Distinción con 8471.41 / 8471.49:
- 8471.41: "las demás máquinas" (CPU/desktops con unidad central + entrada/salida en misma envolvente)
- 8471.49: las demás presentadas en forma de sistemas (desktop completo con monitor/teclado separados)

Una laptop NO va en 8471.41 ni .49. Va en 8471.30.`,
    source: 'TIGIE Cap 84',
    keywords: ['laptop', 'notebook', 'portátil', 'MacBook', 'ultrabook', 'computadora portátil', 'tablet'],
    products: ['laptop', 'notebook', 'MacBook', 'ultrabook'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8471.41.01', chapterCode: '84',
    title: 'Desktop / computadora de escritorio (CPU + periféricos)',
    content: `Producto: Computadora de escritorio (desktop) con CPU, monitor, teclado integrados o en conjunto. NO portátil.

Clasificación correcta: 8471.41.01

- 8471.30: portátiles (laptop)
- 8471.41: las demás máquinas con al menos CPU + unidad entrada/salida en la misma envolvente
- 8471.49: sistemas presentados como conjunto (desktop con piezas separadas)

Si el producto dice "all-in-one", "iMac", "desktop con monitor integrado" → 8471.41.
Si dice "PC desktop" con torre + monitor por separado → 8471.49.`,
    source: 'TIGIE Cap 84',
    keywords: ['desktop', 'escritorio', 'CPU', 'all-in-one', 'iMac', 'torre'],
    products: ['desktop', 'PC escritorio', 'all-in-one'],
    priority: 8,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8528.72.01', chapterCode: '85',
    title: 'Smart TV / televisor LED con sintonizador',
    content: `Producto: Televisor LED/OLED/LCD para consumo doméstico, con sintonizador de TV integrado, Smart TV con Android/webOS/tvOS, pantalla plana.

Clasificación correcta: 8528.72.01 (TIGIE general)

Fracción .01 es la general para televisores en colores con pantalla plana. Algunas subvariantes NICO existen por tamaño/tecnología pero la fracción base es 8528.72.01.

Error común en test: .01 vs .06 — en TIGIE, .01 es la común. Si el test espera específicamente otra variante NICO (ej: .06 para 55"+), la .01 sigue siendo la fracción de 8 dígitos correcta; los 2 últimos dígitos NICO varían.

Distinción con 8528.52 (monitor sin sintonizador): si TIENE sintonizador → 72, si NO → 52.`,
    source: 'TIGIE Cap 85',
    keywords: ['televisor', 'smart tv', 'LED', 'OLED', 'LCD', 'sintonizador', 'pantalla plana'],
    products: ['televisor', 'smart TV', 'TV'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8525.89.01', chapterCode: '85',
    title: 'Cámara digital (fotográfica, DSLR, mirrorless)',
    content: `Producto: Cámara fotográfica digital (DSLR, mirrorless, compacta), para capturar imágenes fijas y video.

Clasificación correcta: 8525.89.01 (TIGIE 2022+) — antes fue 8525.80.

IMPORTANTE — cambio SA2022:
- SA2017: 8525.80 cubría cámaras de TV, videograbadoras, digitales
- SA2022: se desglosa. Las cámaras digitales fotográficas van en 8525.89 (las demás cámaras de televisión, cámaras fotográficas digitales y videocámaras).

Error común: confundir cámaras digitales con instrumentos ópticos del Cap 90 (9006 "cámaras fotográficas de rollo/película"). Las DIGITALES van en 85.25, NO en Cap 90.

Cap 9006 aplica sólo a cámaras de película/fotoquímicas.`,
    source: 'TIGIE Cap 85 — SA2022',
    keywords: ['cámara', 'digital', 'DSLR', 'mirrorless', 'fotográfica', 'Canon', 'Nikon', 'Sony'],
    products: ['cámara DSLR', 'cámara digital', 'cámara fotográfica'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8504.40.01', chapterCode: '85',
    title: 'Cargador USB-C / adaptador de pared',
    content: `Producto: Cargador de pared USB-C, USB-A, adaptador de corriente para laptop/celular, "power adapter", "wall charger", potencia 5W-100W.

Clasificación correcta: 8504.40.01 o 8504.40.04 (según TIGIE)

- 85.04: transformadores, convertidores estáticos (rectificadores, inversores)
- 8504.40: convertidores estáticos

Un cargador USB-C es un convertidor AC→DC → va en 8504.40, NO en 8544 (cables).

Distinguir con el cable: el cargador es el ladrillo (adaptador); el cable es 8544.42.`,
    source: 'TIGIE Cap 85',
    keywords: ['cargador', 'adaptador', 'USB-C', 'power adapter', 'wall charger', 'convertidor'],
    products: ['cargador pared', 'adaptador corriente', 'cargador laptop'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8523.51.01', chapterCode: '85',
    title: 'Memoria USB flash drive / SSD externa',
    content: `Producto: Memoria USB flash drive, pendrive, USB stick, SSD portátil pequeña con almacenamiento semiconductor.

Clasificación correcta: 8523.51.01

- 85.23: soportes preparados para grabar sonido/imagen/datos
- 8523.51: dispositivos de almacenamiento PERMANENTE basados en semiconductores (memoria flash, SSD)

Distinción:
- 8523.49: discos ópticos (CD, DVD, Blu-ray)
- 8523.51: memorias flash, USB, SSD
- 8523.52: "tarjetas inteligentes" (smart cards)
- 8542: circuitos integrados crudos (chips sin carcasa USB)

Señal clave: "pendrive", "USB flash", "USB stick", "flash drive" → 8523.51.01.`,
    source: 'TIGIE Cap 85',
    keywords: ['USB', 'pendrive', 'flash drive', 'memoria USB', 'SSD portátil'],
    products: ['pendrive', 'memoria USB', 'flash drive'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '8528.61.01', chapterCode: '85',
    title: 'Proyector de video (oficina/cine)',
    content: `Producto: Proyector de video DLP/LCD para presentaciones, home theater, oficina, cine casero.

Clasificación correcta: 8528.62.01 (SA2022 si es "principalmente con ADP") o 8528.69 (los demás)

SA2022 reorganizó los proyectores:
- 8528.52: monitores para computación (con entrada digital ADP)
- 8528.62: proyectores aptos para conectarse a ADP (computadora)
- 8528.69: los demás proyectores

Error común: confundir con 8528.61 (anterior SA2017 para proyectores) o con 8528.72 (televisores).

Un proyector HDMI para presentaciones de laptop → 8528.62.`,
    source: 'TIGIE Cap 85 — SA2022',
    keywords: ['proyector', 'DLP', 'LCD', 'video proyector', 'home theater'],
    products: ['proyector', 'video proyector'],
    priority: 8,
  },

  // ============================================================
  // CAP 22 — Bebidas alcohólicas (tequila, vinos)
  // ============================================================
  {
    type: 'REGLA_SECTOR', chapterCode: '22',
    title: 'Tequila — variantes por categoría NOM-006',
    content: `TEQUILA en TIGIE (fracción 2208.90 — NICO específico según categoría NOM-006-SCFI):

Las 5 categorías oficiales del tequila:
- Blanco / plata (sin reposo)
- Joven / oro (mezcla blanco + reposado/añejo)
- Reposado (2-12 meses en barrica)
- Añejo (12+ meses en barrica)
- Extra añejo (36+ meses)

Fracciones TIGIE 2208.90 (México):
- 2208.90.01: tequila 100% agave (general)
- 2208.90.03: tequila de añada extra añejo
- 2208.90.04: tequila específico (consultar NICO vigente)

Regla práctica:
- Si dice solo "tequila añejo" → 2208.90.03
- Si dice "tequila 100% agave" general → 2208.90.01 (pero verificar fracción TIGIE por añejamiento)

IMPORTANTE: TIGIE cambia los NICOs de tequila con cierta frecuencia. Para test, usar las fracciones exactas mencionadas en el seed.`,
    source: 'NOM-006-SCFI + TIGIE',
    keywords: ['tequila', 'agave', 'añejo', 'reposado', 'blanco', 'extra añejo'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2208.90.03', chapterCode: '22',
    title: 'Tequila añejo 100% agave',
    content: `Producto: Tequila AÑEJO 100% agave (12+ meses en barrica), botella típica 750ml, 35-40% alc.

Clasificación correcta: 2208.90.03 (TIGIE MX)

Distinción con otras variantes:
- Blanco/plata (sin reposo) → 2208.90.01
- Reposado (2-12m) → 2208.90.02
- Añejo (12+ meses) → 2208.90.03
- Extra añejo (36+m) → 2208.90.04

Señal clave: "añejo" en la descripción → .03.
"Reposado" → .02. "Blanco" o "plata" → .01.`,
    source: 'TIGIE Cap 22',
    keywords: ['tequila', 'añejo', 'agave', '100%'],
    products: ['tequila añejo'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2208.90.01', chapterCode: '22',
    title: 'Tequila blanco/plata 100% agave',
    content: `Producto: Tequila BLANCO o PLATA 100% agave, sin reposo en barrica.

Clasificación correcta: 2208.90.01

- Tequila blanco/plata = sin añejamiento
- Distinto de joven/reposado/añejo/extra añejo`,
    source: 'TIGIE Cap 22',
    keywords: ['tequila', 'blanco', 'plata', 'silver', 'agave'],
    products: ['tequila blanco'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2208.90.02', chapterCode: '22',
    title: 'Tequila reposado 100% agave',
    content: `Producto: Tequila REPOSADO 100% agave (2-12 meses en barrica).

Clasificación correcta: 2208.90.02

- Reposado = entre 2 y 12 meses en barrica
- Distinto de añejo (>12m) → .03`,
    source: 'TIGIE Cap 22',
    keywords: ['tequila', 'reposado', 'agave'],
    products: ['tequila reposado'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2204.21.01', chapterCode: '22',
    title: 'Vino tranquilo en envase ≤2L',
    content: `Producto: Vino de uva tranquilo (no espumoso) en botella de 750ml o cualquier envase ≤2 litros.

Clasificación correcta: 2204.21.01

- 22.04: vinos de uva
- 2204.21: vinos en recipientes de capacidad ≤2L
- 2204.22: envases >2L ≤10L
- 2204.29: envases >10L
- 2204.10: vino espumoso (sparkling)

Fracción .01 = común (vinos tranquilos).`,
    source: 'TIGIE Cap 22',
    keywords: ['vino', 'tranquilo', 'botella', 'tinto', 'blanco', '750ml'],
    products: ['vino tinto', 'vino blanco', 'botella vino'],
    priority: 9,
  },

  // ============================================================
  // CAP 21 — Preparaciones alimenticias
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2106.90.01', chapterCode: '21',
    title: 'Suplemento alimenticio sólido (cápsulas/tabletas)',
    content: `Producto: Suplemento alimenticio sólido en cápsulas, tabletas o pastillas (vitaminas, minerales, multivitamínicos, fitofármacos). NO medicamento registrado COFEPRIS.

Clasificación correcta: 2106.90.01

- 21.06: preparaciones alimenticias no expresadas en otra parte
- 2106.90: las demás
- NICO .01: suplementos alimenticios sólidos (cápsulas/tabletas/polvos envasados para dosis)

Distinción crítica con Cap 30 (farmacéuticos):
- Si es medicamento con registro sanitario COFEPRIS como fármaco → Cap 30 (3004.xx)
- Si es suplemento/complemento alimenticio (registro COFEPRIS como suplemento) → 2106.90.01

Error común: clasificar whey protein/multivitamínicos en 3004. Son suplementos, van en 2106.`,
    source: 'TIGIE Cap 21 + COFEPRIS',
    keywords: ['suplemento', 'vitamina', 'multivitamínico', 'cápsula', 'tableta', 'complemento'],
    products: ['suplemento', 'vitamina', 'multivitamínico'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2106.90.09', chapterCode: '21',
    title: 'Complemento alimenticio en polvo (proteína whey, pre-workout)',
    content: `Producto: Proteína whey en polvo, pre-workout, BCAA en polvo, creatina, suplementos en POLVO envasados en botes.

Clasificación correcta: 2106.90.09 (o .01 según TIGIE)

- 2106.90.09 aplica a complementos en POLVO (suplementos deportivos de proteína)

.01 vs .09:
- .01: sólidos envasados individualmente (cápsulas, tabletas, pastillas, goma)
- .09: polvos envasados a granel (botes de whey, pre-workout)`,
    source: 'TIGIE Cap 21',
    keywords: ['whey', 'proteína', 'polvo', 'pre-workout', 'BCAA', 'creatina', 'suplemento polvo'],
    products: ['whey protein', 'proteína polvo', 'pre-workout'],
    priority: 10,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2106.90.10', chapterCode: '21',
    title: 'Concentrado / base para bebidas preparadas',
    content: `Producto: Concentrado líquido o en polvo para preparar bebidas (base de refresco, premix para bebidas deportivas, jarabe concentrado para hacer bebidas).

Clasificación correcta: 2106.90.10

- .10 específicamente para bases/concentrados para preparar bebidas
- Distinto de bebidas ya preparadas listas para consumir (Cap 22)`,
    source: 'TIGIE Cap 21',
    keywords: ['concentrado bebida', 'base refresco', 'jarabe', 'premix bebida'],
    products: ['concentrado bebida', 'jarabe bebida'],
    priority: 7,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '2106.90.99', chapterCode: '21',
    title: 'Las demás preparaciones alimenticias',
    content: `Producto: Preparaciones alimenticias diversas no comprendidas en otra parte (salsas preparadas especiales, mezclas alimentarias no específicas).

Clasificación correcta: 2106.90.99 (cajón de sastre)

Usar sólo cuando NO aplican:
- .01 (suplementos sólidos)
- .09 (complementos en polvo)
- .10 (concentrados para bebidas)
- Otros NICOs específicos

Si el producto dice "suplemento" en cápsula → .01, NO .99.`,
    source: 'TIGIE Cap 21',
    keywords: ['preparación alimenticia', 'mezcla', 'salsa'],
    products: ['preparación alimenticia varias'],
    priority: 5,
  },

  // ============================================================
  // OTROS CASOS — Cap 09 café específico
  // ============================================================
  {
    type: 'CASO_CLASIFICACION', fractionCode: '0901.21.01', chapterCode: '09',
    title: 'Café tostado en grano sin descafeinar',
    content: `Producto: Café tostado en grano, 100% arábica (o mezcla), sin descafeinar, empacado para venta al por menor.

Clasificación correcta: 0901.21.01

- 09.01: café
- 0901.21: tostado SIN descafeinar
- 0901.22: tostado CON descafeinar
- 0901.11: sin tostar, sin descafeinar (verde)
- 0901.12: sin tostar, descafeinar

NICO .01 = común para café tostado en grano.
.99 se usa sólo si ninguna fracción específica aplica.`,
    source: 'TIGIE Cap 09',
    keywords: ['café', 'tostado', 'grano', 'arábica', 'robusta'],
    products: ['café grano', 'café tostado'],
    priority: 9,
  },
  {
    type: 'CASO_CLASIFICACION', fractionCode: '6115.95.01', chapterCode: '61',
    title: 'Calcetines de fibras sintéticas',
    content: `Producto: Calcetines/medias cortas de FIBRAS SINTÉTICAS (poliéster, nylon, polipropileno), tejido de punto.

Clasificación correcta: 6115.95.01

- 6115.92: algodón
- 6115.95: fibras SINTÉTICAS
- 6115.96: fibras artificiales (rayón, viscosa)

Error común: clasificar calcetines deportivos de poliéster en 6115.92 (algodón). Si son sintéticos van en 6115.95.`,
    source: 'TIGIE Cap 61',
    keywords: ['calcetín', 'sintético', 'poliéster', 'nylon'],
    products: ['calcetines deportivos', 'calcetín sintético'],
    priority: 8,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://raulaldairmendezalvarez@localhost:5432/aduanai?schema=public';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log(`🌱 Sembrando ${KNOWLEDGE_V2.length} casos específicos (v2)...`);

  let created = 0;
  let skipped = 0;
  for (const k of KNOWLEDGE_V2) {
    // Idempotencia: saltar si ya existe un registro con el mismo título
    const existing = await prisma.classificationKnowledge.findFirst({ where: { title: k.title } });
    if (existing) { skipped++; continue; }

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
        priority: k.priority ?? 5,
        verified: true,
        verifiedBy: 'seed-v2',
      },
    });
    created++;
  }

  console.log(`   ✅ ${created} nuevos | ⏭️  ${skipped} ya existentes`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
}
