# PRE-VALIDADOR DE PEDIMENTO — CATÁLOGO DE REGLAS (Operación 2026-08, Ola 1)

**Estado:** implementado en `server/src/services/prevalidator-v2.ts`; catálogo en
`server/src/services/prevalidador-reglas.ts`, servido por `GET /api/prevalidate/reglas`
y mostrado en la pantalla `/prevalidador` ("Reglas del prevalidador").
**Objetivo:** "que el usuario diga: esto me marca lo mismo que el prevalidador de
CAAAREM, pero me lo explica". Cada hallazgo cita su código y su fundamento.

## Principios

1. **Nada se fabrica.** Lo que el archivo M3 / Data Stage no trae (bultos, peso
   neto, BL) NO se rellena: la regla que lo necesita queda `no_evaluado` con
   motivo visible (`ValidationResult.reglasNoEvaluadas`). Misma política que la
   Pre-Glosa (`revision.reglasNoEvaluadas`).
2. **Fundamento con estado de cotejo.** `verificado` = cotejado verbatim en el repo
   (docs/RISK_SCORER_LEGAL.md, lib/anexo22.ts, Anexo 10, LIGIE); `pendiente` =
   referencia usual sin cotejo artículo por artículo. No se inventan números de
   campo del Anexo 22.
3. **Catálogos con cotejo pendiente no restringen.** Las claves de pedimento
   agregadas sin cotejo (`cotejo: 'pendiente'`) llevan `regimenes: []` para que
   `CLAVE_REGIMEN_MISMATCH` no dispare sobre un dato no verificado.

## Entrada de datos: M3 / Data Stage → pedimento persistido

`POST /api/pedimentos/importar` (`{ nombreArchivo, contenidoBase64, layout?: auto|M3|DATASTAGE, columnas? }`)
- **M3 (SAAI, layout v9.0 ago-2021):** parser determinista existente del Radar
  (`pedimento-reader/parser.ts` + `mapper.ts`). Fail-closed ante drift de forma.
  Se tolera el sufijo `.txt` en el nombre; la validación cruzada contra 801.2 se mantiene.
- **Data Stage:** `pedimento-reader/datastage.ts` — lectura **por encabezado**
  con alias configurables (`columnas`). **Layout Data Stage: pendiente de cotejo
  oficial** (no hay fuente vendoreada en el repo). Columnas mínimas: pedimento y fracción.
- Persistencia: `Pedimento` (`origenArchivo`, `layoutVersion`, `archivoHash`,
  `clienteId` vía `X-Cliente-Id`) + `PedimentoPartida` (`nico`, UMC/UMT en clave
  Apéndice 7, identificadores 554, permisos 553). **Idempotente**: mismo
  tenant + hash + número → mismo registro.
- Datos que el M3 v1 NO trae → `datosNoDisponibles`: `bultos`, `pesoNeto`, `bl`
  (y `cove` cuando 505.4 no luce como COVE).
- Sin columna propia en el schema, los datos de archivo (proveedores, identificadores
  de pedimento, cantidad UMT, aduana-sección) viajan en `Pedimento.aiNotes.datosArchivo`.
  **SCHEMA REQUERIDO:** `Pedimento.datosArchivo Json?` (ver reporte de la rama).

Desde el pedimento persistido:
- `POST /api/prevalidate/desde-pedimento/:id` — prevalidador multipartida.
- `POST /api/glosa/simulate/desde-pedimento/:id` — Pre-Glosa multipartida (una
  revisión por partida + resumen del pedimento).
- `POST /api/pedimentos/:id/archivar` — Operation (con `pedimentoId`) + Document con el reporte.

## Reglas

Severidad: **E** error (bloqueante) · **W** advertencia · **I** informativo.
Cotejo del fundamento: ✅ verificado en repo · ⏳ pendiente.

### Nivel pedimento

| Código | Qué revisa | Fundamento | Sev | Cotejo |
|---|---|---|---|---|
| `CLAVE_REGIMEN_MISMATCH` | La clave (Ap. 2) no admite el régimen (Ap. 16). Claves con cotejo pendiente no restringen. | Anexo 22 RGCE 2026, Apéndices 2 y 16 (DOF 15-ene-2026) | E | ✅ |
| `NUMERO_PEDIMENTO_FORMAT` | 15 dígitos: año(2) aduana(2) patente(4) consecutivo(7); aduana existente en Ap. 1 | Anexo 22, instructivo campo 1 y Ap. 1 | W | ✅ |
| `TIPO_REGIMEN_MISMATCH` | Régimen no aplicable al tipo IMP/EXP. Con archivo y régimen no derivable → `no_evaluado`. | Anexo 22 Ap. 16; Art. 90 LA | E | ⏳ |
| `RFC_FORMAT` | RFC 12/13 caracteres con fecha válida | Art. 36-A-I LA; Art. 27 CFF | E | ⏳ |
| `WEIGHT_INCONSISTENT` | Peso neto > bruto. Sin peso neto (M3) → `no_evaluado`. | Anexo 22 instructivo (peso bruto) | E | ⏳ |
| `WEIGHT_RATIO_LOW` | Neto < 30 % del bruto. Sin peso neto → `no_evaluado`. | Heurística operativa | W | ⏳ |
| `TC_OFF_DOF` | TC declarado difiere > 1 % del publicado (Banxico/DOF) | Art. 20 CFF; Art. 56 LA | W | ⏳ |
| `BULTOS_ZERO` | Bultos ≤ 0. Sin bultos (M3) → `no_evaluado`. | Anexo 22 instructivo (bultos) | E | ⏳ |
| `VALUE_SUM_MISMATCH` | Valor del encabezado ≠ Σ partidas (±0.5 %). Con archivo se compara en USD (551.10). | Art. 64 LA; Anexo 22 | E | ⏳ |
| `NO_PARTIDAS` | Sin partidas | Anexo 22 bloque de partidas | E | ⏳ |
| `ADUANA_TRANSPORTE_INCONGRUENTE` | Marítimo por aduana fronteriza/interior (p. ej. 24 Nuevo Laredo), aéreo por aduana sin aeropuerto. Tipo de aduana derivado del Ap. 1 (`cotejoTipo: 'pendiente'`); medio del Ap. 3. | Anexo 22 Ap. 1 y Ap. 3 | E | ⏳ |
| `DOCUMENTO_VACIO` | Factura/CFDI y COVE sin referencia (E); BL/guía sin referencia (W). Con M3: BL → `no_evaluado` (el layout v1 no lo extrae); COVE → `no_evaluado` si 505.4 no luce como COVE. | Art. 36-A LA; RGCE 1.9.19 | E/W | ⏳ |

### Nivel partida

| Código | Qué revisa | Fundamento | Sev | Cotejo |
|---|---|---|---|---|
| `FRACTION_FORMAT` | 8 dígitos | LIGIE 2026; Art. 54 LA | E | ✅ |
| `FRACTION_NOT_IN_TIGIE` | No existe en el catálogo local (8,256 fracciones) | LIGIE 2026 (DOF 29-12-2025) | W | ✅ |
| `NICO_FALTANTE` | Partida sin NICO | Art. 54 LA ("exacta determinación del NICO"); Anexo 22 campo NICO | E | ✅ |
| `NICO_INVALIDO` | NICO ≠ 2 dígitos o inexistente para la fracción (`Fraction.nicos`) | Art. 54 LA; catálogo NICO LIGIE 2026 | E | ✅ |
| `PARTIDA_VALUE_MISMATCH` | cantidad × valor unitario ≠ valor (±0.5 %) | Art. 64 LA | E | ⏳ |
| `PERMIT_REQUIRED` | Fracción con permiso previo sin permiso declarado | Art. 36-A LA; Anexo 2.2.1 SE | E | ⏳ |
| `SECTORAL_REGISTRY` | Fracción con padrón sectorial | Art. 59-IV LA; Anexo 10 RGCE 2026 (DOF 14-01-2026) | I | ✅ |
| `NOMS_MISSING` | NOM aplicable sin declarar en permisos | Art. 36-A LA; Anexo 2.4.1 SE | W | ⏳ |
| `ANTIDUMPING_NOT_DECLARED` | Cuota vigente (match exacto fracción+país) sin identificador CC/EE | Arts. 62-63 LCE; Arts. 178 y 151 LA; Anexo 22 Ap. 8 | E | ⏳ (el corpus solo tiene Art. 62 LCE; Art. 151 LA es resumen) |
| `ANTIDUMPING_DECLARED` | Informativo: cuota declarada, verificar monto | Anexo 22 Ap. 8 | I | ⏳ |
| `VINCULACION_DESC_MISSING` | Vinculación sin descripción | Arts. 68 y 71 LA | E | ⏳ |
| `QTY_ZERO` | Cantidad ≤ 0 | Anexo 22 (UMC/UMT) | E | ⏳ |
| `IDENTIFICADOR_OBLIGATORIO_FALTANTE` | IM en claves IN/AF/RT; NM en fracciones con NOM. Sin identificadores capturados → `no_evaluado`. | Anexo 22 Ap. 8 (⏳ catálogo) | E | ⏳ |
| `UMT_NO_COINCIDE` | Unidad de tarifa declarada ≠ unidad de la fracción (`Fraction.unit` ↔ Ap. 7) | Anexo 22 Ap. 7; LIGIE 2026 | E | ⏳ |

## Cruces de la Pre-Glosa por partida (`glosa-cruces.ts`)

No suman al índice heurístico (las reglas ponderadas viven en `GlosaRiskRule`); se
agregan en el resumen del pedimento. Estado `evaluado | no_evaluado` con motivo.

| Código | Cruce | Fuente en la plataforma | Fundamento |
|---|---|---|---|
| `ORIGEN_TRATADO` | Origen declarado vs tratado (preferencia declarada con origen fuera del tratado; preferencia disponible no aprovechada) | `quoter.getPreferentialRates` + `lib/treaties.ts` (no se copian listas) | Art. 36-A-I-c y 54 LA; reglas de origen del tratado |
| `CUOTA_EXPORTADOR` | Tasa por exportador/productor (`AntidumpingDuty.exportadorTasas`, `specificProducer`) por nombre normalizado; sin tasa de empresa → general y lo dice; sin lista → `general_sin_lista` | `antidumping.resolverTasaPorExportador` | Arts. 62-65 LCE; Art. 178 LA; resoluciones UPCI |
| `UMC_UMT` | UMT vs unidad de la fracción; conversión UMC→UMT cuando el catálogo la conoce (g/kg, t/kg, docenas/pieza…); si no, "no verificable" | `lib/anexo22` Ap. 7 + `CONVERSION_UNIDADES` | Anexo 22 Ap. 7; LIGIE |
| `PRECIO_ESTIMADO` | Valor unitario vs precio estimado (<80 % crítico, <95 % observación) | `price-validator.lookupEstimatedPrice` (231 registros locales) | Arts. 84-A y 86-A LA |
| `IDENTIFICADOR_AP8` | IM (IMMEX), NM (NOM), TL (tratado declarado), CC (cuota vigente) | `lib/anexo22` Ap. 8 | Anexo 22 Ap. 8; Art. 36-A LA |

## Catálogos Anexo 22 — estado de cotejo (`server/src/lib/anexo22.ts`)

| Catálogo | Estado |
|---|---|
| Ap. 1 aduanas (claves y denominaciones) | ✅ cotejado 2026-07-02 |
| Ap. 1 atributo `tipo` (marítima/fronteriza/aérea/interior) | ⏳ derivado de la denominación y geografía (`cotejoTipo: 'pendiente'`) |
| Ap. 2 claves A1, A3, A4, IN, AF, RT, BA, H1, F4, F5, V1, T3, T7, R1 | ✅ cotejado 2026-07-02 |
| Ap. 2 claves A5, C1, E1, E2, F2, F3, G1, G2, K1, K2, V5 | ⏳ `cotejo: 'pendiente'` — descripción indicativa, `regimenes: []` |
| Ap. 3 medios de transporte | ⏳ pendiente |
| Ap. 7 unidades de medida y conversiones | ⏳ pendiente |
| Ap. 8 identificadores (CC, NM, TL, IM, PS, EC, PC) | ⏳ pendiente |
| Ap. 9 regulaciones (C1, C2, C3, C6) | ⏳ estructura + pipeline, pendiente |
| Ap. 16 regímenes | ✅ cotejado 2026-07-02 |
| Layout Data Stage | ⏳ pendiente de cotejo oficial (lectura por encabezados) |

## Tests

- `npm run test:importar` — detección de layout, persistencia idempotente por hash,
  Data Stage por encabezados, conversión a entrada multipartida.
- `npm run test:prevalidador-reglas` — catálogo completo; pedimento incongruente
  dispara las 4 reglas nuevas; fixture correcto (`m3842004.074`) no las dispara;
  lo no disponible queda `no_evaluado`.
- `npm run test:glosa-multipartida` — cuota por exportador, cruces, resumen del
  pedimento, fail-closed heredado. `test:glosa` y `test:glosa-capturadas` siguen verdes.
