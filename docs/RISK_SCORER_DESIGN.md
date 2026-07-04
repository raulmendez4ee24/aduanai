# RISK SCORER — DISEÑO TÉCNICO (Fase 1, pre-construcción)

**Estado:** en revisión — construcción de UI y motor DETENIDA hasta aprobación.
**Base legal:** `docs/RISK_SCORER_LEGAL.md` (Fase 0 + addendum RLA DOF 23-02-2026). Cada regla del motor lleva sello de cotejo (fuente, URL, fecha) tomado de ese documento.

## 1. Principios (fijados por el usuario)

1. **Salida bidimensional**: (A) Exposición 0-100; (B) Escudo de evidencia (% completitud + faltantes accionables). Las defensas NO restan exposición.
2. **Motor 100% determinista** — reglas puras sobre señales tipadas. CERO LLM en el cálculo.
3. **Honestidad en la superficie**: cada señal declara `origen: 'verificado' | 'declarado'`; el reporte los distingue visualmente.
4. **Pesos configurables** (tabla en BD, editable por admin; suma validada = 100). Calibración futura con agentes humanos.

## 2. Dimensión A — Exposición (8 factores, pesos v1)

| # | Factor | Peso v1 | Anclas (ver LEGAL.md) |
|---|---|---|---|
| F1 | VALOR | 24 | LA 64-71/78, 151-VI/VII, 59-III + RGCE 1.5.1/1.5.2, RLA 81/81-A/220 |
| F2 | PERFIL IMPORTADOR | 22 | CFF 69-B, LA 162-VI, 59-IV + RGCE 1.3.2/1.3.3, LA 160-XIII |
| F3 | CUOTAS COMPENSATORIAS | 12 | LCE 62-66, 89 B, 93-III; LA 176-I/178-I, 151-II |
| F4 | PADRONES SECTORIALES | 10 | LA 59-IV, Anexo 10 DOF 14-01-2026, RGCE 1.3.2, LA 176-XIII |
| F5 | TEMPORALES | 10 | LA 151-VIII, 176-XII, 177-III (señales de Inventario IMMEX) |
| F6 | CLASIFICACIÓN | 8 | LA 54, 178-I/185-II; agravante decreto DOF 29-12-2025 |
| F7 | NOMs | 8 | LA 176-II, **151-II reformada (bandera: EMBARGO)**, RLA 235-H |
| F8 | DOCUMENTACIÓN de pedimento | 6 | LA 36/36-A, 59-V, Anexo 5-A T-MEC, 184-III/185-II |

Puntuación por factor: cada regla emite `puntos ∈ [0, maxPuntosRegla]`; el factor se satura en su peso (`min(Σ puntos, peso)`). Exposición total = Σ factores (0-100). Reglas con `bandera` especial (p. ej. F7 embargo, F2 importador en 69-B definitivos) elevan la banda final independientemente del número.

### Reglas v1 por factor (señal → puntos → fundamento)

Formato de regla (TypeScript, dato puro versionado en código):

```ts
interface RiskRule {
  id: string;                    // 'F1-VAL-01'
  factor: FactorId;              // 'VALOR' | 'PERFIL' | ...
  descripcion: string;           // qué evalúa, en lenguaje de agente aduanal
  señal: SignalId;               // clave del input tipado
  evaluar: (s: Signals) => number; // determinista, puntos parciales
  maxPuntos: number;
  bandera?: 'EMBARGO' | 'BLOQUEANTE' | 'LISTADO_69B';
  fundamento: {
    articulo: string;            // 'LA 151-VII'
    citaCorta: string;           // extracto verbatim ≤ 200 chars
    fuente: string;              // 'LA consolidada DOF 19-11-2025'
    url: string;
    fechaCotejo: string;         // '2026-07-04'
  };
  origenSeñal: 'verificado' | 'declarado';
}
```

Set inicial (26 reglas; extracto representativo — la lista completa vive en `risk-rules.ts` con las 26):

| Regla | Señal | Puntos | Origen |
|---|---|---|---|
| F1-VAL-01 subvaluación: valor unitario declarado <50% de referencia del propio historial de cotizaciones del tenant | `valorUnitario`, `referenciaHistorica` | 0-12 | verificado (si hay historial) / declarado |
| F1-VAL-02 sin MVE E2 transmitida (y no aplica excepción 1.5.1-VII) | `mveTransmitida`, `regimen` | 0-8 | declarado |
| F1-VAL-03 incrementables declarados incompletos (transporte/seguro/regalías sin soporte) | checklist 65 LA | 0-4 | declarado |
| F2-PER-01 importador en listado 69-B definitivos | `rfc` vs tabla `Sat69B` | 22 (BLOQUEANTE) | **verificado** (ingesta CSV) |
| F2-PER-02 sin expediente KYC 162-VI | checklist | 0-8 | declarado |
| F2-PER-03 padrón con causal de suspensión visible (1.3.3: domicilio, inactividad >12m…) | checklist | 0-6 | declarado |
| F3-CUO-01 fracción con cuota compensatoria activa y origen declarado del país gravado | `fraccion`, `paisOrigen` vs `AntidumpingDuty` | 0-8 | **verificado** |
| F3-CUO-02 ruta origen≠procedencia compatible con elusión 89 B (tercer país ensamblador) | `paisOrigen`, `paisProcedencia` | 0-4 | declarado |
| F4-PAD-01 fracción exige sector Anexo 10 y el importador no lo tiene activo | `fraccion` vs resolver SATPadron + `padronesActivos` | 0-10 | **verificado** (fracción→sector) + declarado (tenencia) |
| F5-TMP-01 temporal IMMEX con domicilio de destino ≠ registrado (151-VIII) | Inventario `TemporaryImport` | 0-6 | **verificado** (si opera Inventario) |
| F5-TMP-02 temporales próximas a vencer plazo / sin descargo | `TemporaryImport.dueDate`, descargos | 0-4 | **verificado** |
| F6-CLA-01 fracción usada ≠ sugerida por Clasificador validado (o no validada contra catálogo) | `fraccionUsada` vs `validateFraction` + Clasificador | 0-5 | **verificado** |
| F6-CLA-02 fracción en decreto de tasas DOF 29-12-2025 (agravante: omisión potencial mayor) | `fraccion` vs dataset decreto | 0-3 | **verificado** (Fase 1b si dataset no listo) |
| F7-NOM-01 fracción con NOMs de información comercial sin evidencia de cumplimiento | catálogo `noms` + checklist | 0-8, bandera EMBARGO | mixto |
| F8-DOC-01 pedimento con formato inválido (aduana/patente/año) | `numeroPedimento` vs `validatePedimentoNumero` | 0-3 | **verificado** |
| F8-DOC-02 certificación de origen sin los 9 elementos Anexo 5-A (cuando aplica preferencia) | checklist | 0-3 | declarado |

## 3. Dimensión B — Escudo de evidencia (checklist anclado)

Ítems v1 (cada uno con el mismo `fundamento` sellado; ítems de agencia solo si `tipoSujeto = 'agencia'`):

| Grupo | Ítem | Ancla |
|---|---|---|
| Expediente 59-V | 8 ítems: a) garantía 36-A-I-e (si aplica) · b) CFDIs · c) facturas · d) transferencias/cartas de crédito · e) transporte/seguros · f) contratos **y órdenes de compra** · g) soporte de incrementables 65-66 · h) otros (**incluye notas de crédito/descuentos, RLA 81-X**) | LA 59-V + RLA 81 |
| KYC del cliente | expediente 162-VI (identidad, infraestructura, no-vinculación 69-B, cumplimiento fiscal) | LA 162-VI |
| Expediente del despacho | 162-VII (pedimento+anexos+acuses, MVE original, encargo conferido) | LA 162-VII |
| MVE | E2 transmitida por Ventanilla / entregada al agente | RGCE 1.5.1 |
| Control interno | **procedimientos documentados que cubren los expedientes** | **RLA 81-A** |
| Origen vs cuotas | prueba de origen distinto disponible (si F3 activo) | LCE 66 |
| Encargo conferido | acuse vigente para el RFC | LA 59-III |
| [Agencia] MVE espejo | conservación docs 81 por la agencia | RLA 235-F |
| [Agencia] 32-D | constancia de cumplimiento de socios/administración | RLA 235-J |

`escudo = ítems completos aplicables / ítems aplicables` (los no-aplicables se excluyen del denominador y se muestran en gris). Ítems declarados marcan visualmente "declarado por usuario".

## 4. Banda final (matriz exposición × escudo)

| | Escudo ≥80% | 50-79% | <50% |
|---|---|---|---|
| Exposición <30 | 🟢 verde | 🟢 verde | 🟡 amarillo |
| 30-59 | 🟡 amarillo | 🟠 naranja | 🔴 rojo |
| ≥60 **o bandera** (69-B definitivo / EMBARGO activo) | 🟠 naranja | 🔴 rojo | 🔴 **rojo crítico** |

## 5. Esquema de datos (Prisma)

```prisma
model RiskFactorWeight {      // pesos configurables (suma=100 validada en servicio)
  id        String  @id @default(cuid())
  factor    String  @unique  // 'VALOR' | 'PERFIL' | ...
  peso      Int
  updatedAt DateTime @updatedAt
  updatedBy String?
}

model RiskAssessment {        // persistencia por evaluación (auditable, inmutable)
  id           String   @id @default(cuid())
  tenantId     String
  userId       String
  input        Json     // señales de entrada (verificadas+declaradas) — snapshot
  exposicion   Int      // 0-100
  escudoPct    Int      // 0-100
  banda        String   // 'VERDE'|'AMARILLO'|'NARANJA'|'ROJO'|'ROJO_CRITICO'
  detalle      Json     // por regla: puntos, fundamento sellado, origenSeñal
  checklist    Json     // estado del escudo por ítem
  rulesVersion String   // versión del set de reglas (git-trazable)
  pesosSnapshot Json    // pesos vigentes al evaluar
  createdAt    DateTime @default(now())
}

model Sat69B {                // Fase 1 si la ingesta es viable (ver §7)
  rfc         String  @id
  razonSocial String
  situacion   String  // 'DEFINITIVO' | 'PRESUNTO' | 'DESVIRTUADO' | 'SENTENCIA_FAVORABLE'
  fechaOficio DateTime?
  importedAt  DateTime
}
```

Las REGLAS no viven en BD: son código-dato versionado (`risk-rules.ts`) — cada release de reglas queda trazable por commit y `rulesVersion`.

## 6. Contrato API

```
POST /api/risk/assess            (auth)
  body: {
    tipoSujeto: 'agente' | 'agencia',
    operacion: {
      fraccion?: string, nico?: string,          → verificado vía validateFraction/Clasificador
      valorUnitario?: number, cantidad?: number, moneda?: string,
      paisOrigen?: string, paisProcedencia?: string,
      regimen?: string, clavePedimento?: string, numeroPedimento?: string,
      importadorRfc?: string,
      preferenciaArancelaria?: boolean,
    },
    declarado: {                                  → checklist del usuario (cada uno boolean|null)
      mveTransmitida, expedienteKyc, expediente162VII, controlInterno81A,
      encargoConferido, padronesActivos: string[], evidenciaNoms, certOrigen9Elementos,
      expediente59V: { a,b,c,d,e,f,g,h }, pruebaOrigenDistinto,
      constancia32D (solo agencia), mveEspejoAgencia (solo agencia)
    }
  }
  → 200: {
    exposicion, escudoPct, banda,
    factores: [{ factor, puntos, peso, reglas: [{ id, descripcion, puntos, bandera?,
      origenSeñal, fundamento: { articulo, citaCorta, fuente, url, fechaCotejo } }] }],
    checklist: [{ item, grupo, completo, aplicable, origen, fundamento, accionSugerida }],
    faltantes: [ 'top-N acciones que más suben el escudo / bajan la banda' ],
    disclaimer, assessmentId
  }

GET  /api/risk/assessments?page=      (historial del tenant)
GET  /api/risk/assessments/:id
GET  /api/risk/weights                (lectura para UI)
PUT  /api/risk/weights                (solo admin; valida Σ=100; audita el cambio)
```

Señales `verificado` se calculan SERVER-SIDE consumiendo lo existente: `validateFraction` + Clasificador (F6), resolver SATPadron (F4), `AntidumpingDuty` exact-match (F3), `validatePedimentoNumero`/anexo22 (F8), `TemporaryImport` del tenant (F5), tabla `Sat69B` (F2). Nada de esto re-implementa lógica: el scorer ORQUESTA fuentes ya cotejadas.

## 7. Lista 69-B — viabilidad de ingesta (decisión propuesta: INCLUIR en Fase 1)

El SAT publica el listado 69-B como **CSV público en datos abiertos** (`http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv`, referenciado desde sat.gob.mx / datos.gob.mx). Ingesta barata: job manual/cron (`npx tsx scripts/ingest-69b.ts`) → parse CSV → upsert `Sat69B` (~15-20k filas) → match exacto por RFC. Sin scraping, sin auth. **Condición de honestidad**: la UI muestra `importedAt` ("lista al DD-MM-AAAA") y si la ingesta tiene >30 días el match se degrada a "verificado con lista desactualizada". Si el CSV cambiara de URL/formato al construir: se degrada a Fase 1b (input declarativo mientras tanto), sin bloquear el resto.

## 8. Qué NO hace v1 (explícito)

- No consume listado ANAM 235-I (recién ordenado por el RLA; cuando exista publicación estable → Fase 1b junto con dataset del decreto de tasas).
- No calcula referencia de mercado externa para subvaluación (usa historial propio del tenant o señal declarada); precios estimados SHCP = Fase 2.
- No integra Anexo 2.4.1 como dataset (PENDIENTE DE FUENTE #2); F7 usa el campo `noms` del catálogo con la advertencia de que no está cotejado contra 2.4.1.
- Cero LLM, cero UI en esta entrega (UI tras aprobación de este diseño).

## 9. Plan de construcción propuesto (tras aprobación)

1. `risk-rules.ts` (26 reglas selladas) + motor + pesos en BD + tests deterministas (fixtures por factor, incluida la matriz de bandas completa).
2. Ingesta 69-B + tests de match.
3. Rutas API + persistencia RiskAssessment.
4. Paridad de cierre: 3 operaciones sintéticas (limpia / media / crítica con 69-B) con salida esperada exacta.
5. STOP → demo del contrato por API contra ti, antes de UI.
