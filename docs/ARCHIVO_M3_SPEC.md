# Archivo M (SAAI M3) — qué acepta exactamente nuestro parser

Layout: **VOCE-SAAI-M3 v9.0, agosto 2021** (AGA / Administración Central de
Modernización Aduanera, 139 pp.) — la fuente vive en
`server/src/services/pedimento-reader/layout-v9.ts`, transcrita del
[PDF oficial](https://www.ventanillaunica.gob.mx/vucem/Manualesa/SistemasCE/LineamientosTR.pdf).

El parser (`parser.ts`) es **determinista y fail-closed**: valida forma completa
antes de extraer un solo dato. Si algo no cuadra, rechaza el archivo entero con
la línea y el campo exactos; nunca parsea "lo que alcance".

Ejemplo mínimo válido de dos partidas: `server/src/tests/fixtures/m3456001.245`
(se prueba en `npm run test:importar`).

---

## 1. Nombre del archivo

Patrón `mppppnnn.ddd` — regex real: `/^m\d{7}\.\d{3}$/i`

| Parte | Qué es | Ejemplo |
|---|---|---|
| `m` | literal | `m` |
| `pppp` | patente o autorización (4 dígitos) | `3456` |
| `nnn` | consecutivo del día (3 dígitos) | `001` |
| `.ddd` | día juliano (3 dígitos) | `.245` |

Ejemplo: **`m3456001.245`**

Tres validaciones cruzadas sobre el nombre:
1. Debe cumplir el patrón (criterios 801.2).
2. Debe ser **idéntico** al campo 801.2 escrito dentro del archivo.
3. La patente del nombre (`pppp`) debe coincidir con el campo 3 del 500 y con el
   campo 2 del 501 de cada pedimento.

Un sufijo `.txt` (`m3456001.245.txt`) se acepta con advertencia — se retira antes
de comparar contra el 801.2.

## 2. Formato físico

| Regla | Valor |
|---|---|
| Codificación | ASCII/UTF-8. El BOM UTF-8 se ignora con advertencia (lo añaden Excel y editores de Windows) |
| Separador de registros | line feed (`\n`). CRLF se tolera con advertencia |
| Separador de campos | **pipe `\|`** — no coma, no punto y coma, no tabulador |
| Campos | longitud **máxima** (variables, no posicionales); vacío = campo opcional no declarado |
| Decimales | punto (`17.12340`); la coma se rechaza |
| Fechas | `AAAAMMDD` (año 1990-2100, mes 1-12, día 1-31) |
| Línea en blanco | prohibida en cualquier posición |

Tipos por campo: `N` entero, `D` decimal, `F` fecha, `A` alfanumérico. La
validación de tipo y longitud **solo aplica a campos no vacíos**.

## 3. Estructura del archivo

```
500  ← abre pedimento (primer registro del archivo, obligatorio)
  501 505 506 507 509 510 512 …   ← cabecera
  551 [553 554 556 557] …          ← una partida y sus adjuntos
800  ← cierra el pedimento
… (otro 500 … 800 por cada pedimento) …
801  ← cierra el archivo (único, último registro)
```

Reglas duras:
- El **primer** registro es `500`; el **último** es `801`, y el `801` es único.
- Un `500` nuevo sin que el anterior cerrara con `800` → rechazo.
- Cualquier registro después del `800` de su pedimento → rechazo.
- El **número de pedimento** de cada registro debe ser igual al campo 4 del 500
  vigente (posición del campo: 3 en 501/515/601/701/301, **2 en todos los demás**).
- `801.3` = número de pedimentos del archivo.
- `801.4` = **total de registros sin contar el 801**.
- Los adjuntos de partida (553/554/556/557) deben referir un **número de partida
  existente** y llevar **la misma fracción** que su 551.
- Números de partida duplicados dentro de un pedimento → rechazo.

Movimientos (campo 500.2): `1` Pedimento Nuevo, `2` Eliminación, `3`
Desistimiento, `5` Informe Industria Automotriz, `6` Complementario, `7`
Despacho Anticipado, `8` Confirmación de Pago, `9` Global Complementario.
**Solo el `1` se procesa**; los demás no rompen el archivo: ese pedimento se
excluye con motivo y el resto del lote continúa. Un pedimento con registros
701/702 (rectificación) también se excluye.

## 4. Aridad exacta por tipo de registro

Número de campos que debe tener cada línea (un campo de más o de menos = rechazo):

| Reg | Campos | Reg | Campos | Reg | Campos | Reg | Campos |
|---|---|---|---|---|---|---|---|
| 500 | 6 | 509 | 5 | 520 | 10 | 601 | 11 |
| 501 | 35 | 510 | 5 | 551 | 26 | 701 | 11 |
| 502 | 9 | 511 | 4 | 552 | 6 | 702 | 5 |
| 503 | 4 | 512 | 10 | 553 | 9 | 301 | 11 |
| 504 | 4 | 513 | 8 | 554 | 8 | 302 | 6 |
| 505 | 17 | 514 | 9 | 555 | 13 | 351 | 11 |
| 506 | 4 | 515 | 9 | 556 | 7 | 352 | 11 |
| 507 | 6 | 516 | 4 | 557 | 7 | 353 | 6 |
| 508 | 12 | | | 558 | 6 | 355 | 8 |
| | | | | 560 | 12 | 358 | 7 |
| 800 | 5 | 801 | 5 | | | | |

De estos, v1 **extrae datos** de: 500, 501, 505, 506, 507, 509, 510, 512, 551,
553, 554, 556, 557, 800, 801. Los demás tipos conocidos se validan por aridad,
se **cuentan** en `registrosIgnorados` y se reportan — nunca se descartan en
silencio. El **552**, por ejemplo, se valida (6 campos) y se cuenta, pero v1 no
lee sus campos.

## 5. Campos por registro (los que el parser define)

Formato: `nº nombre — tipo(máx)`.

### 500 — Inicio de pedimento
1 Clave del tipo de registro — N(3) · 2 Tipo de movimiento — N(2) ·
3 Patente o autorización — N(4) · 4 Número de pedimento — N(7) ·
5 Aduana-sección de despacho — A(3) · 6 Acuse electrónico de validación — A(8)

### 501 — Datos generales del pedimento
1 Tipo de registro — N(3) · 2 Patente — N(4) · 3 Número de pedimento — N(7) ·
4 Aduana-sección de despacho — A(3) · 5 Tipo de operación — N(1) ·
6 Clave de pedimento — A(2) · 7 Aduana-sección de entrada o salida — A(3) ·
8 CURP del importador/exportador — A(18) · 9 RFC del importador/exportador — A(13) ·
10 CURP del agente/apoderado/mandatario — A(18) · 11 Tipo de cambio — D(9,5) ·
12 Fletes — N(12) · 13 Seguros — N(12) · 14 Embalajes — N(12) ·
15 Otros incrementables — N(12) · 16 Uso futuro — A(0, vacío) ·
17 Peso bruto total — D(14,3) · 18 Medio de transporte de salida — N(2) ·
19 Medio de transporte de arribo — N(2) · 20 Medio de transporte entrada/salida — N(2) ·
21 Origen o destino de la mercancía — N(2) · 22 Nombre del importador/exportador — A(120) ·
23 Calle — A(80) · 24 Número interior — A(10) · 25 Número exterior — A(10) ·
26 Código postal — A(10) · 27 Municipio — A(80) · 28 Entidad federativa — A(3) ·
29 País del domicilio fiscal — A(3) · 30 RFC de quien emite el CFDI de servicios — A(13) ·
31 Decrementables por fletes — N(12) · 32 …por seguros — N(12) · 33 …por carga — N(12) ·
34 …por descarga — N(12) · 35 Otros decrementables — N(12)

### 505 — CFDI / factura
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Fecha del CFDI — F(8) ·
4 Número de CFDI, documento equivalente o acuse de valor — A(40) ·
5 Término de facturación — A(3) · 6 Moneda del CFDI — A(3) ·
7 Valor total en dólares (USD) — D(14,2) · 8 Valor total en la moneda del CFDI — D(14,2) ·
9 País del CFDI — A(3) · 10 Entidad federativa del CFDI — A(3) ·
11 Identificación fiscal del proveedor/comprador — A(30) · 12 Nombre — A(120) ·
13 Calle — A(80) · 14 Número interior — A(10) · 15 Número exterior — A(10) ·
16 Código postal — A(10) · 17 Municipio — A(80)

### 506 — Fechas
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Tipo de fecha — N(2) · 4 Fecha — F(8)

### 507 — Identificadores a nivel pedimento
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Clave del identificador — A(2) ·
4 Complemento 1 — A(20) · 5 Complemento 2 — A(30) · 6 Complemento 3 — A(40)

### 509 — Tasas a nivel pedimento
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Clave de la contribución — N(2) ·
4 Tasa — D(15,10) · 5 Clave del tipo de tasa — N(2)

### 510 — Contribuciones a nivel pedimento
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Clave de la contribución — N(2) ·
4 Clave de la forma de pago — N(3) · 5 Importe — N(12)

### 512 — Descargos (pedimento original)
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Patente original — N(4) ·
4 Número de pedimento original o última rectificación — N(7) ·
5 Aduana-sección de la operación original — A(3) · 6 Clave de documento original — A(2) ·
7 Fecha de pago del original — F(8) · 8 Fracción que se descarga — A(8) ·
9 Clave de unidad de medida LIGIE — N(2) · 10 Cantidad que se descarga — D(24)

### 551 — Partida
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Fracción arancelaria — A(8) ·
4 Número de partida — N(5) · 5 Subdivisión de la fracción (NICO) — A(2) ·
6 Descripción de la mercancía — A(250) · 7 Precio unitario — D(15,5) ·
8 Valor en aduana — N(12) · 9 Importe del precio pagado o valor comercial — N(12) ·
10 Valor en dólares (USD) — D(14,2) · 11 Cantidad en unidades de comercialización — D(15,3) ·
12 Unidad de medida de comercialización — N(2) · 13 Cantidad en unidades LIGIE — D(18,5) ·
14 Unidad de medida LIGIE — N(2) · 15 Valor agregado — N(12) · 16 Vinculación — A(1) ·
17 Método de valoración — N(2) · 18 Código del producto — A(20) · 19 Marca — A(80) ·
20 Modelo o lote — A(80) · 21 País de origen o destino — A(3) · 22 País vendedor o comprador — A(3) ·
23 Entidad federativa de origen — A(3) · 24 …de destino — A(3) · 25 …del comprador — A(3) ·
26 …del vendedor — A(3)

### 553 — Permisos / NOM por partida
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Fracción — A(8) · 4 Número de partida — N(5) ·
5 Clave del permiso — A(3) · 6 Firma de descargo / certificado NOM / autorización — A(32) ·
7 Número de permiso o autorización — A(50) · 8 Valor comercial en dólares — D(14,2) ·
9 Cantidad de mercancía en UMT o UMC — D(24)

### 554 — Identificadores por partida
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Fracción — A(8) · 4 Número de partida — N(5) ·
5 Clave del identificador — A(2) · 6 Complemento 1 — A(20) · 7 Complemento 2 — A(50) ·
8 Complemento 3 — A(40)

### 556 — Tasas por partida
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Fracción — A(8) · 4 Número de partida — N(5) ·
5 Clave de la contribución a pagar — N(2) · 6 Tasa — D(15,10) · 7 Tipo de tasa aplicable — N(2)

### 557 — Contribuciones por partida
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Fracción — A(8) · 4 Número de partida — N(5) ·
5 Clave de la contribución a pagar — N(2) · 6 Forma de pago — N(3) · 7 Importe — N(12)

### 800 — Cierre de pedimento (e.firma)
1 Tipo — N(3) · 2 Número de pedimento — N(7) · 3 Tipo de figura — N(1) ·
4 e.firma del agente, apoderado o mandatario — A(360) · 5 Número de serie del certificado — A(25)

### 801 — Cierre de archivo
1 Tipo — N(3) · 2 Nombre del archivo — A(12) · 3 Cantidad de pedimentos — N(5) ·
4 Cantidad de registros (sin contar el 801) — N(5) · 5 Clave de prevalidador — A(5)

## 6. Comprobaciones aritméticas (advertencia, no rechazo)

Con la forma ya validada, el parser cuadra importes y **avisa** sin tumbar el archivo:

- Contribuciones, por cada clave presente en 557:
  `|Σ557 − 510| ≤ (número de registros 557 de esa clave) × 1 MXN`.
  Una clave con desglose por partida y sin renglón global también se avisa.
- Valores: `|Σ551.10 − Σ505.7| ≤ (nº 551 + nº 505) × 0.01 USD`.

## 7. Ejemplo mínimo válido — un pedimento, dos partidas

Archivo `m3456001.245` (17 líneas; `801.4 = 16`):

```
500|1|3456|0000001|240|
501|3456|0000001|240|1|A1|240||MEJ010203AB1||17.12340|12000|800|0|0||1250.500||1|1||MAQUILADORA EJEMPLO SA DE CV|AV INDUSTRIA||100|66600|APODACA|NLE|MEX||0|0|0|0|0
505|0000001|20260815|COVE26000001A|CIF|USD|1500.00|1500.00|USA||TAXID123456|ACME WIRING SYSTEMS INC|MAIN STREET||500|78045|LAREDO
506|0000001|1|20260820
507|0000001|ED|COVE26000001A||
509|0000001|1|0.0000000000|1
510|0000001|1|0|4560
551|0000001|85443099|1|00|ARNES ELECTRICO PARA VEHICULO AUTOMOTOR|25.00000|17123|17123|1000.00|40.000|6|40.00000|6|0|0|1|MP-ARNES-12C|||USA|USA||||
554|0000001|85443099|1|TL|MX||
556|0000001|85443099|1|1|0.0000000000|1
557|0000001|85443099|1|1|0|3040
551|0000001|73181599|2|99|TORNILLO HEXAGONAL DE ACERO INOXIDABLE M8|0.50000|8562|8562|500.00|1000.000|6|1000.00000|6|0|0|1|MP-TORN-M8|||USA|USA||||
554|0000001|73181599|2|TL|MX||
556|0000001|73181599|2|1|0.0000000000|1
557|0000001|73181599|2|1|0|1520
800|0000001|1|FIRMA_ELECTRONICA_BASE64_DEL_AGENTE|00001000000512345678
801|m3456001.245|1|16|PRV01
```

Cuadra por diseño: `Σ551.10 = 1000.00 + 500.00 = 1500.00 USD = 505.7`, y
`Σ557 clave 1 = 3040 + 1520 = 4560 = 510.5`.

> Los valores de catálogo del ejemplo (claves de contribución, forma de pago,
> unidades, identificadores, término de facturación) son **ilustrativos**: el
> parser no valida su semántica y los apéndices 8, 9, 12 y 13 aún no están
> cotejados en el repo. Para un archivo de prueba realista, tómalos del Anexo 22
> vigente.

## 8. Diagnóstico rápido cuando un archivo se rechaza

| Mensaje | Causa |
|---|---|
| `tipo de registro desconocido "500,1,3456"` | el archivo no usa `\|` como separador (CSV) |
| `tipo de registro desconocido "﻿500"` | BOM UTF-8 (ya se tolera; si aparece, la versión desplegada es anterior) |
| `L1: línea vacía al inicio del archivo` | el archivo empieza con salto de línea o encabezado |
| `esperados N campos, encontrados M` | aridad: falta o sobra un `\|` en esa línea |
| `se esperaba decimal, se encontró "17,12340"` | decimal con coma |
| `se esperaba fecha AAAAMMDD` / `fecha implausible` | formato o fecha inexistente |
| `longitud X > máxima Y` | campo más largo que el máximo de la spec |
| `el nombre del archivo (…) no coincide con 801.2 (…)` | renombraste el archivo, o el 801.2 no es el nombre real |
| `801.4 declara N registros; el archivo contiene M` | recuento del 801 desactualizado tras editar líneas |
| `número de pedimento "X" ≠ "Y" del 500 vigente` | un registro quedó con el número de otro pedimento |
| `registro 557: fracción "X" ≠ "Y" de la partida N` | adjunto con fracción distinta a la de su 551 |
| `refiere la partida N, inexistente` | 553/554/556/557 apunta a una partida que no existe |
| `el primer registro debe ser 500` / `el último debe ser 801` | estructura del archivo |

Y dos casos que **no** son rechazo del archivo: movimiento distinto de `1` y
pedimentos de rectificación (701/702) — esos pedimentos se excluyen con motivo y
el resto se procesa.
