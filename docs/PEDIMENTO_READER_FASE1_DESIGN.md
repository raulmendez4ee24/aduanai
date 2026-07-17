# LECTOR DE PEDIMENTOS — FASE 1: DISEÑO DEL PARSER DEL ARCHIVO M

**Estado: PROPUESTA — pendiente de aprobación humana antes de implementar (paso 1.1).**
Fecha: 2026-07-17. Alcance aprobado de la fase: parser determinista + mapeo a Risk Scorer en lote + API; UI al final, tras paridad por API.

**Fuente canónica del layout**: "Lineamientos Técnicos de Registros VOCE-SAAI M3", **v9.0, agosto 2021**, AGA/ACMA, 139 pp. — <https://www.ventanillaunica.gob.mx/vucem/Manualesa/SistemasCE/LineamientosTR.pdf> (verificado por extracción de texto completo, 2026-07-16; respaldo v8.9 en anam.gob.mx). Todas las posiciones de campo citadas abajo son **verbatim** de ese documento. Formato del archivo (v9.0 p.7-8): texto ASCII, registros separados por line feed, campos separados por pipe `|`, longitudes **máximas** (variables); nombre `mppppnnn.ddd`.

Restricciones vigentes (del encargo): **cero LLM en el parser**; los campos que el archivo no trae **NO se rellenan**; ante desajuste estructural el parser **falla cerrado**; commit + deploy por paso; módulo tras flag/etiqueta beta hasta validación con archivos reales.

---

## (a) Conjunto mínimo viable de registros

El criterio de inclusión es único: **el registro alimenta al menos una señal del Risk Scorer v1, un dato de módulo existente (Pre-validador/Pre-glosa/Cotizador/expediente), o es necesario para la integridad estructural del archivo.** Todo lo demás se cuenta y reporta ("N registros de tipo X ignorados"), nunca se descarta en silencio.

### Incluidos (15 tipos)

| Registro (campos totales v9.0) | Justificación |
|---|---|
| **500** Inicio de Pedimento (6) | Obligatorio: abre cada pedimento; trae tipo de movimiento (define si el pedimento es procesable), patente/número/aduana-sección (llave) y acuse de validación (evidencia de que el pedimento fue validado). |
| **501** Datos Generales (35) | Núcleo del encabezado: tipo de operación, clave de pedimento, RFC, tipo de cambio, incrementables (c.12-15) y decrementables (c.31-35), peso bruto, aduana de entrada. Alimenta F1, F2, F8 y Pre-validador. |
| **505** CFDI o documento equivalente (17) | Referencia COVE/factura, INCOTERM, moneda, valores totales, identidad y domicilio del proveedor. Alimenta F1 (proveedor), expediente 59-V (referencia documental) y Pre-glosa. |
| **506** Fechas (4) | Tipo de fecha por catálogo Anexo 22 (1=ENTRADA, etc.). Necesaria para re-liquidación con TC histórico y contexto temporal del lote. |
| **507** Identificadores nivel pedimento (6) | Claves Apéndice 8 a nivel global (certificaciones, programas). Insumo de señales F5/F8. |
| **509/510** Tasas y Contribuciones nivel pedimento (5/5) | El cuadro de liquidación: clave de contribución, tasa, forma de pago, importe. Doble uso: **validación aritmética interna** (anti-drift) y comparación quote-vs-pagado del Cotizador. |
| **512** Descargos (6) | Trazabilidad de operaciones que descargan pedimentos previos (temporales/IMMEX) — contexto de F5 y del Inventario. |
| **551** Partidas (26) | El registro central: fracción (c.3), NICO (c.5), valores (c.7-10), cantidades/UMC/UMT (c.11-14), vinculación (c.16), método de valoración (c.17), países (c.21-22). Alimenta F1, F3, F4, F6, F7 y todos los módulos. |
| **553** Permisos (9) | Clave de permiso, firma de descargo/certificado NOM, número. Insumo de F7 (evidencia NOM referenciada en el pedimento). |
| **554** Identificadores nivel partida (8) | Claves Apéndice 8 por partida (preferencias arancelarias, excepciones NOM, etc.). Insumo de F7/F8. |
| **556/557** Tasas y Contribuciones nivel partida (7/7) | Contribuciones por partida con tasa/forma de pago/importe — la base de la re-liquidación partida por partida y de la detección de formas de pago atípicas. |
| **800** Firma Electrónica (5) | Integridad: e.firma y serie del certificado del agente — evidencia de quién transmitió (proveniencia del pedimento mismo). |
| **801** Fin de Archivo (5) | Integridad estructural: totales de pedimentos y registros (validación cruzada obligatoria), nombre de archivo, clave de prevalidador (solo verificación de presencia — es confidencial, **no se almacena** más allá del hash del archivo). |

### Excluidos de v1 (con razón; se cuentan y reportan)

| Registro | Razón de exclusión |
|---|---|
| 502 Transporte, 503 Guías, 504 Contenedores, 516 Candados, 520 Destinatarios | Logística: ninguna regla v1 ni módulo del alcance los consume. (503/504 serían útiles para cruces con BL en fases futuras.) |
| 508/555 Cuentas aduaneras y de garantía | Ninguna regla v1 las evalúa. Nota futura: la garantía 86-A es defensa contra el embargo de F1-VAL-01 — candidata a señal v2. |
| 511/558 Observaciones | Texto libre: sin señal determinista posible. |
| 513 Compensaciones, 514 Pagos virtuales, 515/560 Informe IA, 301/302 y 351-358 (complementario/T-MEC 2.5), 601 Previo de consolidado | Tipos de movimiento/bloques especializados fuera del alcance v1 (ver política de movimientos abajo). |
| 552 Mercancías (VIN) | Solo vehículos; ninguna señal v1. |
| 701/702 Rectificación | La rectificación ES una señal interesante (historial), pero puntuar rectificaciones requiere diseño propio (¿qué se re-evalúa: el original o el rectificado?). v1: se **detecta y reporta** ("pedimento de rectificación — no procesado en v1"), no se puntúa. |

**Política de tipos de movimiento** (500, campo 2): v1 procesa únicamente **Pedimento Normal**. Otros movimientos (desistimiento, rectificación, complementario, consolidados, IA) se identifican y se reportan como no-procesados con motivo explícito, **sin abortar el archivo** — un archivo M puede contener varios pedimentos y uno no soportado no debe tirar el lote. El fail-closed estructural (abajo) es a nivel de forma del registro, no de alcance funcional.

---

## (b) TABLA DE MAPEO — registro/campo → señal Risk Scorer / dato de módulo

Esta tabla es la **frontera de datos legales** de la fase: define qué nace `verificado por sistema: archivo M`, qué queda en tri-estado declarativo, y qué NO se rellena jamás. Posiciones de campo verbatim v9.0.

### B.1 → `Signals.operacion` (OperacionInput) y señales `verificado`

| Dato | Origen en archivo M | Consumidor | Notas de frontera |
|---|---|---|---|
| `fraccion` | **551.3** Fracción Arancelaria (alfanumérico 8) | F6-CLA-01 vía `validateFraction` (fuente canónica de fracciones), F3 (cuota), F4 (sectores), F6-CLA-02 (decreto tasas), F7 (NOMs), Pre-validador, Cotizador, Pre-glosa | Directo. |
| `nico` | **551.5** "Subdivision de la Fracción" (alfanumérico 2) | F6-CLA-03 vía catálogo NICO | La sección de criterios v9.0 liga este campo al Acuerdo de NICOs (incorporado en v8.7 nov-2020). En el mapeo se registra el nombre oficial del campo, no se asume sinónimo. |
| `valorUnitario` | **551.7** Precio Unitario (decimal 15,5) | F1-VAL-01, Pre-glosa `unitValueUSD` | Directo. |
| `cantidad` | **551.11** Cantidad en UMC (decimal 15,3) | Cotizador `quantity`, Pre-glosa `units` | UMT disponible en 551.13-14 para cuotas específicas por unidad LIGIE. |
| `moneda` | **505.6** Moneda del CFDI (alfanumérico 3) | Cotizador `currency` | Una por documento 505; si hay varios 505 con monedas distintas, se conserva por-documento (no se colapsa). |
| `paisOrigen` | **551.21** País de Origen o Destino (alfanumérico 3) | F3 (cuota exact-match), Pre-glosa `countryOrigin`, Cotizador `origin` | En importación = origen (semántica del campo por tipo de operación 501.5). |
| `paisProcedencia` | **NO SE RELLENA** | — | El archivo M **no trae un campo "país de procedencia"**. 551.22 es país *vendedor/comprador* y 505.9 es país *del CFDI* — ninguno es procedencia. Se exponen como lo que son (abajo) y `paisProcedencia` queda vacío. Rellenarlo sería fabricación. |
| `regimen` | **derivado** de 501.6 Clave de pedimento vía Apéndice 2 (`server/src/lib/anexo22.ts`, fuente única existente DOF 15-ene-2026) | F5 (contexto temporales), Pre-glosa `regimenCode` | Derivación determinista catalogada; proveniencia registra `derivado-de: 501.6 + Apéndice 2`. |
| `clavePedimento` | **501.6** Clave de pedimento (alfanumérico 2) | Reglas F1/F5, Pre-validador `clave` | Directo. |
| `numeroPedimento` (15 dígitos) | **reconstruido**: aduana-sección **501.4** + patente **501.2** + número **501.3** (+ dígito de año contenido en el propio consecutivo, conforme al campo 1 del instructivo Anexo 22) | F8-DOC-01 vía `validatePedimentoNumero`, Pre-validador | La reconstrucción exacta del formato 2-2-4-7 se ancla al instructivo del campo 1 del Anexo 22 en implementación; si algún componente falta → no se reconstruye (queda el crudo por componente). |
| `importadorRfc` | **501.9** RFC del Importador (alfanumérico 13) | F2-PER-01/02 vía tabla Sat69B, Pre-validador | Directo. Nombre/domicilio del importador (501.22-29) → expediente/contexto, no señal. |
| `preferenciaArancelaria` | **candidato a derivación** desde identificadores 554 (clave Apéndice 8) | F8-DOC-02 | **Pendiente de cotejo**: la(s) clave(s) exacta(s) de preferencia (T-MEC et al.) deben cotejarse contra el Apéndice 8 vigente durante la implementación. Hasta ese cotejo, NO se deriva — tri-estado. |

Señales `verificado.*` (server-side, motor existente sin cambios): `fraccionValida`, `nicoExiste`, `sectoresRequeridos`, `cuotaActiva`, `pedimentoFormatoValido`, `en69B`, `fraccionEnDecretoTasas`, `nomsRequeridas` se calculan igual que hoy, alimentadas por los campos de arriba. `temporalesFueraDomicilio`/`temporalesPorVencer` siguen viniendo del módulo Inventario (el archivo M no las trae).

### B.2 → datos de módulos (fuera de Signals)

| Origen archivo M | → Módulo destino |
|---|---|
| 501.11 Tipo de cambio | Cotizador `exchangeRate` (override histórico para re-liquidar) |
| 501.12-15 Incrementables (fletes/seguros/embalajes/otros) + 501.31-35 decrementables | Pre-validador encabezado; **contexto** de F1-VAL-03 (la señal `incrementablesConSoporte` sigue siendo declarativa: el archivo prueba que se declararon, no que tienen soporte) |
| 501.17 Peso bruto | Pre-validador `pesoBruto`, Cotizador `weightKg` (cuotas específicas USD/kg) |
| 505.4 Número de CFDI **o acuse de valor** | Pre-validador `factura`/`cove`; expediente 59-V incisos a-c (referencia, no documento); Pre-glosa `documents.invoice` (solo presencia de referencia) |
| 505.5 Término de Facturación | Pre-validador/Cotizador `incoterm` |
| 505.7-8 Valores totales (USD / moneda) | Pre-glosa `totalValueUSD`, control de suma vs Σ partidas |
| 505.9-17 País/identificación/nombre/domicilio del proveedor | Contexto F1-VAL-04 (datos del proveedor visibles; `proveedorLocalizable` sigue declarativo — el archivo no prueba localización) |
| 506 (tipo de fecha + fecha; catálogo Anexo 22, 1=ENTRADA) | Cotizador (fecha para TC histórico), metadatos de la operación |
| 507/554 identificadores (clave + complementos) | Pre-validador `identificadores[]`; se listan crudos con su clave — la interpretación de claves específicas requiere cotejo Apéndice 8 (no se inventa semántica) |
| 509/510 y 556/557 (clave contribución, tasa, tipo tasa, forma de pago, importe) | Pre-validador `partida.igi/dta/iva/ieps` (mapeo clave de contribución → tipo vía Apéndice 12); Cotizador: **comparación cotización vs pagado** = re-liquidación |
| 512 Descargos (patente/pedimento/aduana/clave original) | Inventario/expediente (trazabilidad IMMEX) |
| 551.16 Vinculación | Pre-validador `vinculacion`, Pre-glosa `declaresLink` |
| 551.17 Método de valoración | Expediente/contexto F1 (candidato a señal v2 — hoy ninguna regla lo consume; NO se puntúa) |
| 551.6, 551.18-20 Descripción/código/marca/modelo | Pre-validador `descripcion`; insumo futuro del Clasificador (no en alcance) |
| 800.4-5 e.firma + serie del certificado | Proveniencia del pedimento (quién transmitió); no señal |

### B.3 Lo que el archivo M NO puede llenar (queda tri-estado declarativo, sin excepción)

`mveTransmitida`*, `expedienteKyc`, `expediente162VII`, `controlInterno81A`, `encargoConferido`, `padronImportadoresVigente`, `padronesActivos`†, `evidenciaNoms` (el 553 refiere un certificado; su vigencia/alcance no), `documentoRrnaAmparaMercancia`, `certOrigen9Elementos`, `incrementablesConSoporte`, `pagoConSoporteBancario`, `proveedorLocalizable`, `causalSuspensionPadron`, `vinculacionConCliente`, `rutaTercerPaisEnsamblador`, `pruebaOrigenDistinto`, `expediente59V.a-h`, `constancia32D`, `mveEspejoAgencia`.

\* La MVE viaja como e-document/acuse referenciado; si el cotejo del Apéndice 8 en implementación identifica una clave inequívoca de MVE E2, se propondrá su derivación como **cambio separado** con fuente — no en v1.
† `transferenciaDeTemporales` es candidato a derivarse de la clave de pedimento (claves de transferencia virtual del Apéndice 2) — mismo tratamiento: cotejo primero, derivación después, nunca en v1 sin fuente.

**Regla de marcado (1.3)**: toda señal auto-llenada lleva `origen: 'verificado por sistema: archivo M'` + proveniencia completa; las tri-estado conservan el flujo declarativo actual intacto.

---

## (c) Estrategia anti-drift: validación estructural FAIL-CLOSED

Los layouts públicos son de 2021 (v9.0) — el riesgo es que los archivos reales actuales difieran. Política: **el parser valida la estructura contra la spec v9.0 antes de extraer un solo dato; ante desajuste, falla cerrado. Jamás parsea "lo que alcance".**

1. **Tabla de aridad y tipos por registro (constante del código, citando v9.0 por página)**: 500→6 campos, 501→35, 502→9, 503→4, 504→4, 505→17, 506→4, 507→6, 508→12, 509→5, 510→5, 511→4, 512→6, 551→26, 552→6, 553→9, 554→8, 555→13, 556→7, 557→7, 800→5, 801→5. Cada línea debe: (i) tener campo 1 == tipo de registro conocido; (ii) conteo de pipes **exacto** para su tipo; (iii) tipos válidos (numérico/decimal/fecha AAAAMMDD según spec) y longitud ≤ máxima. El campo 501.16 ("Uso futuro") se acepta vacío conforme a la spec.
2. **Validaciones cruzadas de integridad** (todas obligatorias): campo 2 de cada registro == número de pedimento del 500.4 vigente; secuencia de registros conforme a la estructura "Pedimento Normal" (500 abre, 800 cierra pedimento, 801 cierra archivo); **801.3 == pedimentos contados y 801.4 == registros contados**; nombre físico del archivo == 801.2 y patente del nombre (`pppp`) == 500.3.
3. **Validación aritmética** (detector de drift semántico, no solo sintáctico): Σ importes 557 por contribución ≈ 510 correspondientes; Σ valores de partidas vs totales del 505 — discrepancias se reportan como advertencia de integridad (posible layout distinto aunque la aridad coincida).
4. **Mensaje de fallo**: `"archivo no coincide con layout VOCE-SAAI M3 v9.0 (línea N, registro 551: esperados 26 campos, encontrados 28) — versión distinta del layout o archivo corrupto"` + primeras discrepancias. Sin extracción parcial. El error incluye la referencia al documento oficial para que el usuario/soporte pueda cotejar.
5. **Granularidad**: desajuste de forma (aridad/tipo/integridad) → **falla el archivo completo** (no hay confianza en el layout). Tipo de movimiento no soportado → se excluye **ese pedimento** con motivo, el resto del lote continúa (la forma sí validó).
6. **Versionado**: la constante `LAYOUT_VERSION = 'VOCE-SAAI-M3-v9.0-ago2021'` viaja en la proveniencia de cada campo; si ANAM publica una versión nueva, se agrega como segunda tabla de aridad versionada — nunca se "flexibiliza" la existente.

---

## Pasos siguientes ya aprobados (recordatorio de contrato, no ejecutar aún)

- **1.2 Implementación** (tras OK a este documento): proveniencia por campo `{archivo, tipoRegistro, posiciónCampo, layoutVersion, método:'determinista', fechaExtracción}`; fixtures **sintéticos construidos desde la spec v9.0** (líneas válidas según aridad/tipos/criterios), con marca explícita en código y docs: *"validado contra layout oficial; validación con archivos reales PENDIENTE (dependencia humana)"*; módulo tras flag beta.
- **1.3 Lote**: endpoint archivo → operaciones parseadas → un `RiskAssessment` por operación reusando el motor tal cual (señales auto = `verificado por sistema: archivo M`; resto tri-estado) → radar: operaciones por banda + resumen de banderas.
- **1.4 Paridad por API**: 3 archivos sintéticos (limpio / medio / crítico con RFC 69-B real de la tabla), **bandas esperadas declaradas antes de correr**. STOP con la demo por API.

## Decisiones que este documento somete a revisión

1. El conjunto de 15 registros incluidos / exclusiones justificadas (a).
2. La frontera exacta de B.1-B.3 — en particular: `paisProcedencia` NO se rellena; `preferenciaArancelaria`, `mveTransmitida` y `transferenciaDeTemporales` NO se derivan en v1 (requieren cotejo de claves de Apéndices 2/8 como cambio separado con fuente).
3. Rectificaciones (701/702): detectar y reportar sin puntuar en v1.
4. Granularidad del fail-closed: archivo completo para drift de forma; por-pedimento para movimientos no soportados.
5. La clave de prevalidador (801.5) se verifica como presente pero no se persiste.
