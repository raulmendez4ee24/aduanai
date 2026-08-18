# FRONTERA CANÓNICA DE DATOS LEGALES — Diseño (Fase 0)

**Estado:** APROBADO por Raúl (18-ago-2026) con tres precisiones — ver *Adenda de aprobación* al final. Orden de ejecución: **Fase 2 → Fase 1 → Fase 3 → Fase 4**.
**Fecha:** 2026-08-18
**Contexto obligatorio:** `docs/COMO_FUNCIONA_ADUANAI.md` (radiografía del código real, corte 12-jul-2026).
**Alcance:** cierra los tres hallazgos (a) reconciliación canónica del Clasificador, (b) fail-closed de citas del Copilot + ley hardcodeada, (c) fail-closed de Pre-Glosa.

## Principio único

> **Ningún dato legal sale de la API sin declarar de dónde viene, cuándo se cotejó y en qué estado de verificación está. Si el sistema no lo sabe, lo dice — jamás lo rellena.**

Hoy ese principio solo lo cumple el Risk Scorer (fundamento por regla). Este diseño lo convierte en un **tipo del sistema** que todos los módulos están obligados a usar, en vez de una disciplina que cada módulo reimplementa o ignora.

---

## 1. EL OBJETO: `DatoLegal<T>`

### 1.1 Definición

Módulo nuevo: `server/src/lib/dato-legal.ts` (tipo + constructores puros, sin I/O).

```ts
export type OrigenDato =
  | 'catalogo'            // jerarquía TIGIE (Fraction/Subheading/…)
  | 'tabla'               // tablas canónicas: FractionRegulation, SATPadron,
                          //   AntidumpingDuty, EstimatedPrice, ExchangeRate, corpus legal
  | 'declarado_usuario'   // vino del formulario/entrada del usuario
  | 'llm_no_verificado';  // lo produjo un modelo y NADIE lo cotejó

export type EstadoDato =
  | 'verificado'      // cotejado contra la fuente declarada en fechaCotejo
  | 'sin_verificar'   // existe un valor pero sin cotejo contra fuente oficial
  | 'no_revisado'     // la consulta que debía traerlo FALLÓ — no sabemos
  | 'vencido'         // hubo cotejo pero la fuente pudo cambiar (TTL vencido / expiryDate pasado)
  | 'no_disponible';  // la fuente canónica no tiene el dato — el sistema lo admite

export interface FuenteLegal {
  nombre: string;                 // "SNICE Base Única", "DOF", "Anexo 10 RGCE 2026", "Banxico"
  url: string | null;             // URL oficial (portada institucional si no hay específica)
  version: string | null;         // ej. tigieVersion de getActiveVersions()
  fechaPublicacion: string | null; // ISO
}

export interface DatoLegal<T> {
  valor: T | null;                // null ⇔ estado 'no_disponible' o 'no_revisado'
  origen: OrigenDato;
  fuente: FuenteLegal | null;     // null ⇔ origen 'declarado_usuario' o 'llm_no_verificado'
  fechaCotejo: string | null;     // ISO — cuándo se cotejó valor↔fuente
  estado: EstadoDato;
  metodo?: 'manual' | 'ingesta' | 'scraper'; // cómo se cotejó (mapea a SelloVerificacion.metodo)
  nota?: string;                  // texto corto de contexto ("cobertura pendiente Anexo 2.4.1")
}
```

### 1.2 Invariantes (se hacen cumplir en los constructores, no por convención)

| Regla | Consecuencia |
|---|---|
| `estado === 'verificado'` exige `fuente !== null` **y** `fechaCotejo !== null` | imposible fabricar un "verificado" sin procedencia |
| `origen === 'llm_no_verificado'` ⇒ `estado` solo puede ser `'sin_verificar'` | un LLM jamás produce un dato verificado |
| `origen === 'declarado_usuario'` ⇒ `estado ∈ {'sin_verificar'}` | la declaración del usuario nunca se pinta verde |
| `estado ∈ {'no_disponible','no_revisado'}` ⇒ `valor === null` | no hay "valor fantasma" con estado rojo |
| `origen ∈ {'catalogo','tabla'}` **no implica** `verificado` | un dataset reconocido como pendiente (ej. `Fraction.noms`) sale `sin_verificar` aunque venga de DB |

Constructores públicos (los únicos caminos para crear el objeto):

```ts
datoVerificado<T>(valor: T, fuente: FuenteLegal, fechaCotejo: string, origen: 'catalogo'|'tabla', metodo?): DatoLegal<T>
datoSinVerificar<T>(valor: T, origen: OrigenDato, nota?): DatoLegal<T>
datoDeclarado<T>(valor: T): DatoLegal<T>
datoNoDisponible<T>(origen: 'catalogo'|'tabla', fuente?): DatoLegal<T>   // la fuente existe, el dato no
datoNoRevisado<T>(nota: string): DatoLegal<T>                            // la consulta falló; nota = qué falló
```

La distinción crítica de todo el diseño es **`no_disponible` vs `no_revisado`**: el primero es una verdad ("el Anexo no lista NOM para esta fracción"), el segundo es una confesión ("no pude consultar el Anexo"). Hoy Pre-Glosa colapsa ambos en silencio; esa colisión es exactamente el hallazgo (c).

### 1.3 Serialización a la API

- `DatoLegal<T>` viaja como el objeto JSON literal de arriba, sin transformación. Es autodescriptivo: el cliente nunca necesita saber de qué módulo vino para pintarlo.
- Los endpoints exponen los datos legales envueltos dentro de un bloque `datosCanonicos` (ver §3.4 y §6 para compatibilidad); los campos escalares legacy se conservan durante la migración y se retiran por fase.
- En persistencia (`Classification.fullResponse`, `GlosaSimulation`, `CopilotConsult`) se guarda el objeto completo: el expediente histórico conserva la procedencia que tenía el dato **en ese momento**, no la actual.

### 1.4 Consumo por `SelloVerificacion` (cliente)

`client/src/components/ui/SelloVerificacion.tsx` hoy acepta `EstadoSello = 'verificado' | 'sin_verificar' | 'vencido'` con `fuenteNombre/fuenteUrl/fechaPublicacion/fechaVerificacion/metodo`. Cambios:

1. **Extender `EstadoSello`** con `'no_revisado'` (badge rojo, icono `AlertTriangle`, texto "No revisado", popover: "El sistema no pudo consultar la fuente para este dato — el resultado NO lo cubre."). `'no_disponible'` **no** es un sello: el campo se pinta como ausencia explícita ("Sin dato en catálogo"), porque un sello sugiere que hay un valor que calificar.
2. **Adaptador único** `client/src/lib/sello.ts`:

```ts
function selloProps(d: DatoLegal<unknown>): SelloVerificacionProps {
  return {
    estado: d.estado === 'no_disponible' ? /* no renderizar sello */ ... : d.estado,
    fuenteNombre: d.fuente?.nombre,
    fuenteUrl: d.fuente?.url ?? undefined,
    fechaPublicacion: d.fuente?.fechaPublicacion ?? undefined,
    fechaVerificacion: d.fechaCotejo ?? undefined,
    metodo: d.metodo === 'ingesta' ? 'scraper' : d.metodo, // o extender METODO_LABEL con 'ingesta'
  };
}
```

Ninguna pantalla vuelve a armar props del sello a mano: si el backend entrega `DatoLegal`, el sello es correcto por construcción. Eso elimina la clase de bug actual donde `corpus-version.ts` (espejo hardcodeado en cliente) alimenta un sello que el backend nunca emitió.

---

## 2. EL PRODUCTOR: servicio canónico por fracción

### 2.1 Contrato

Módulo nuevo: `server/src/services/frontera-canonica.ts`.

```ts
export interface DatosCanonicosFraccion {
  fraccion: DatoLegal<{ code: string; codeFormatted: string; description: string; unit: string | null }>;
  nico: DatoLegal<string[]>;                       // Fraction.nicos (o [Fraction.nico])
  tarifas: {
    nmf: DatoLegal<number>;
    preferenciales: DatoLegal<{ TMEC: number | null; TLCUEM: number | null; CPTPP: number | null }>;
    ieps: DatoLegal<number>;
  };
  regulaciones: {
    noms: DatoLegal<{ code: string; authority: string; description: string }[]>;
    rrna: DatoLegal<{ code: string; authority: string; description: string; type: string }[]>;
    padronSectorial: DatoLegal<{ requerido: boolean; sectores: { codigo: string; nombre: string }[] }>;
  };
  versiones: { tigie: string; ligie: string; rgce: string };  // getActiveVersions(), fuente única
  integridad: { completo: boolean; camposNoRevisados: string[] }; // agregado para fail-closed
}

export async function datosCanonicosFraccion(code: string): Promise<DatosCanonicosFraccion>;

// Consultas parametrizadas por contexto (mismas tablas que ya usan alertas/Pre-Glosa):
export async function cuotasCompensatorias(code: string, origenISO2: string): Promise<DatoLegal<CuotaResumen[]>>;
export async function precioEstimado(code: string, origenISO2: string): Promise<DatoLegal<PrecioEstimadoResumen | null>>;
export async function tipoCambioMXN(fecha: Date): Promise<DatoLegal<number>>; // envuelve services/exchange-rate.ts
```

### 2.2 Registro de autoridad por campo (la parte honesta)

El productor **no decide caso por caso** qué estado dar: lo lee de un registro estático de autoridad, versionado en código, que declara qué puede prometer cada fuente hoy. Esto codifica lo que la radiografía documentó — no todo lo que está en DB está cotejado:

| Campo | Fuente | Estado máximo que puede otorgar hoy | Por qué |
|---|---|---|---|
| fracción (código/descr./unidad) | `Fraction` (Base Única SNICE) | `verificado` contra versión de catálogo (fuente "SNICE Base Única", `version=tigieVersion`, `fechaCotejo=fecha del snapshot`) | catálogo versionado; el sello dice contra QUÉ versión, no promete DOF por fila |
| NICO | `Fraction.nico/nicos` | `verificado` (misma fuente SNICE) | viene de la Base Única |
| NMF / preferenciales / IEPS | `Fraction.tariffNMF/tariffTMEC/tariffTLCUE/tariffCPTPP/iepsRate` | `verificado` contra versión de catálogo, **con `nota`** mientras siga la mezcla con seeds legacy que hacen upsert (radiografía §1.5) | fuente identificada, estado por fila no sellado; la nota lo dice |
| NOMs | `FractionRegulation type='NOM'`; fallback `Fraction.noms` | `FractionRegulation` → `verificado`; `Fraction.noms` → **`sin_verificar`** con nota "cobertura pendiente de cotejo contra Anexo 2.4.1" | dataset reconocido como pendiente |
| RRNA / permisos | `FractionRegulation` | `verificado` por fila (tiene authority/legalBasis) | tabla curada |
| padrón sectorial | `SATPadron` vía `resolveSectorsForFraction` | `verificado` (fuente "Anexo 10 RGCE 2026", DOF 14-01-2026) con nota de aproximaciones por fracción | cobertura fina pendiente documentada |
| cuotas compensatorias | `AntidumpingDuty` | `verificado` por fila (tiene DOF/fechas) filtrando `status='vigente'` y vigencia por fecha; **con `nota`** "reconstrucción UPCI pendiente — puede haber cuotas no listadas" | tabla real pero incompleta; el consumidor debe saberlo |
| precio estimado | `EstimatedPrice` | `source ∈ {DOF, SAT}` → `verificado`; `source='internal'` → **`sin_verificar`** | hoy Glosa no distingue; el price-validator sí — se unifica aquí |
| tipo de cambio | `services/exchange-rate.ts` (DOF/Banxico) | `verificado` con fecha del TC | sustituye el `17` (§5.4) |

Cuando un dataset pendiente se complete (p. ej. Anexo 2.4.1 consolidado), **solo se actualiza el registro de autoridad** y todos los módulos suben de estado a la vez.

### 2.3 Reglas duras del productor

1. **Jamás llama a un LLM.** No importa el caso. Si el catálogo/tabla no tiene el dato → `datoNoDisponible()`. Esta regla es estructural: el módulo no importa nada de `lib/llm.ts` ni `lib/anthropic.ts`, y un test lo verifica (grep de imports).
2. **Fail-closed interno.** Cada sub-consulta va envuelta: si Prisma falla, ese campo sale `datoNoRevisado('fallo consulta X')` y se agrega a `integridad.camposNoRevisados`. El productor **nunca lanza por un campo** (solo lanza si la fracción misma no existe/inactiva, que es el contrato de entrada).
3. **Fuente única de versión.** `versiones` sale de `getActiveVersions()` — la misma fuente que ya alimenta el hash de trazabilidad. El cliente deja de leer `corpus-version.ts` para los reportes (§5.5).
4. **Cache corto y con versión.** Cache in-memory por `code + tigieVersion` (TTL minutos). Se invalida cuando el updater TIGIE aplica un batch. `fechaCotejo` NO es la fecha del cache-hit: es la fecha de cotejo de la fuente.

---

## 3. RECONCILIACIÓN DEL CLASIFICADOR

Punto único de aplicación: en `routes/classify.ts`, inmediatamente después de `classifyProduct()` (que internamente ya terminó retry + `enforceCatalogFraction`). Colocarla en la ruta y no dentro del servicio garantiza que **el bypass del retry documentado en la radiografía no puede saltársela**: no importa qué camino interno produjo `result`, todo pasa por `reconciliarClasificacion(result, canon)` antes de persistir y responder. (`/demo` llama la misma función.)

### 3.1 Campos que se SUSTITUYEN (el valor del LLM se descarta siempre)

No es "comparar y avisar": el valor del LLM en estos campos **nunca llega a la respuesta ni al expediente como dato**. Se sustituye por el canónico y, si difieren, se registra la discrepancia.

| Campo de `ClassificationResult` | Sustituido por | Estado resultante |
|---|---|---|
| `fraction.description` | descripción del catálogo (hoy solo pasa en el fallback del candado — se vuelve incondicional) | según registro §2.2 |
| `nico` | ver política NICO abajo | — |
| `tariffs.nmf` | `canon.tarifas.nmf` | verificado / no_disponible |
| `tariffs.preferential` | `canon.tarifas.preferenciales` (la ruta sigue vaciándolo si `domesticOrigin`) | verificado / no_disponible |
| `regulations.noms` | `canon.regulaciones.noms` | según fuente (§2.2) |
| `regulations.rrna` | `canon.regulaciones.rrna` | verificado / no_disponible |
| `regulations.sectoralRegistry` | ya se deriva canónico hoy (`resolveSectorsForFraction`) — se mueve al mismo bloque | verificado |

**Política NICO.** `canon.nico` trae la lista canónica de la fracción:
- Lista vacía en catálogo → `nico = datoNoDisponible()`. La sugerencia del LLM **no aparece** como dato (puede mencionarse solo dentro de `explanation`, que ya está etiquetada como texto del modelo).
- El NICO del LLM ∈ lista canónica → `valor = ese NICO`, origen `catalogo` (elección del modelo, existencia canónica), estado `verificado` con nota "NICO elegido por el modelo entre los canónicos de la fracción" — el sello dice contra qué versión existe, no que sea el correcto.
- El NICO del LLM ∉ lista canónica → se descarta, `valor = lista canónica completa`, estado `verificado`, discrepancia registrada.

**Alternativas.** Cada `alternatives[i].code` pasa por `validateFraction`: si no existe/inactiva se **elimina** de la lista (y se registra); si existe, su `description` se sustituye por la del catálogo y su `confidence/reason` quedan etiquetadas como LLM. Una alternativa inexistente es exactamente la clase de dato que hoy sale sin candado.

### 3.2 Campos que quedan como texto del LLM, etiquetados

Estos son razonamiento, no datos legales puntuales; se conservan pero salen envueltos con `origen: 'llm_no_verificado'` / `estado: 'sin_verificar'` para que la UI los pinte en ámbar sin excepción:

- `explanation.simple/technical`
- `griApplied` y `legalBasis.griApplied` (la secuencia RGI es instrucción de prompt, no motor — el diseño no finge lo contrario)
- `legalBasis.legalNotes` (con nota "texto no recuperado de fuente oficial"; a mediano plazo deben venir de `Chapter.legalNotes`/corpus — fuera de alcance de esta frontera)
- `useBasedAnalysis` completo
- `confidence` (autodeclarada, no calibrada — se etiqueta "confianza del modelo, no calibrada"). **Regla de UI (precisión de aprobación):** deja de mostrarse como número prominente junto a la fracción; se relega al detalle técnico. La medición de la radiografía lo exige: en la corrida de 61.6% los errores promediaron 87.5 de confianza y 16 errores tenían ≥90 — un "92%" junto a la fracción es una promesa que el dato no sostiene.
- `alternatives[].reason/confidence`

### 3.3 Cuando el LLM contradice al catálogo

**Propuesta (la que pediste): el valor del LLM se descarta y la discrepancia se registra.** Concretamente:

```ts
interface DiscrepanciaLLM {
  campo: string;           // 'tariffs.nmf', 'nico', 'regulations.noms', 'alternatives[2].code'…
  valorLLM: unknown;
  valorCanonico: unknown;
  fraccion: string;
}
```

- Se persiste el arreglo `discrepanciasLLM` dentro del registro de trazabilidad (`recordConsult.outputs`) y en `Classification.fullResponse` — sin tabla nueva en Fase 1; si el volumen lo amerita, tabla dedicada después.
- Se loggea con `action: 'classifier_canon_discrepancy'` (mismo patrón que `classifier_fraction_fallback`) para tener la **tasa de contradicción por campo** como métrica: es el dato que hoy no existe y que justifica (o no) recortar el prompt en Fase 1b.
- La respuesta al usuario **no muestra ambos valores**: muestra el canónico con su sello. La discrepancia es telemetría/auditoría, no UI. (Las alertas, que ya eran canónicas, dejan de poder contradecir a `regulations` porque ahora beben de la misma fuente — cierre directo del hallazgo (a).)
- Caso especial: si el canon dice `no_disponible` (p. ej. `tariffNMF` null), el campo sale `no_disponible`. **No** se usa el valor del LLM como relleno — es la regla dura del §2.3 vista desde el consumidor.

### 3.4 Forma de la respuesta

La respuesta de `/api/classify` agrega un bloque nuevo y conserva los escalares legacy durante la migración (§6):

```jsonc
{
  "data": {
    /* …campos legacy intactos (Fase 1)… */
    "datosCanonicos": {
      "fraccion": { "valor": {…}, "origen": "catalogo", "estado": "verificado", "fuente": {…}, "fechaCotejo": "…" },
      "nico": { … }, "tarifas": { … }, "regulaciones": { … },
      "integridad": { "completo": true, "camposNoRevisados": [] }
    },
    "analisisLLM": { "explanation": {…}, "griApplied": {…}, "useBasedAnalysis": {…} }, // todo sin_verificar
    "discrepanciasLLM": [ … ],   // también en meta de trazabilidad
    "meta": { /* versiones y hashes — sin cambio */ }
  }
}
```

### 3.5 El prompt (Fase 1b, separada a propósito)

Pedirle al modelo NICO/tarifas/NOMs para luego descartarlos gasta tokens e invita confusión, pero **recortar el JSON de salida del prompt cambia el comportamiento del modelo** y obliga a re-medir con el harness (skill `medicion-resiliente`, set de 99). Por eso:

- **Fase 1a:** reconciliar sin tocar el prompt. Riesgo de exactitud top-1: cero (el código elegido no cambia). Se recolecta la tasa de discrepancia real.
- **Fase 1b:** eliminar del JSON solicitado `tariffs`, `regulations` y (evaluar) `nico`; re-correr el harness contra la línea base. Gate: sin regresión de top-1 fuera del ruido. Si regresa, se revierte el prompt y se queda solo la reconciliación (que ya cierra el hallazgo).

---

## 4. COPILOT: atado afirmación↔pasaje y fin de la ley sin recuperación

### 4.1 Fail-closed de citas (mínimo viable, Fase 3a)

Hoy: cita alucinada ⇒ `logger.warn` + warning en UI, y la respuesta se muestra igual. Diseño:

1. **Matcher por clave normalizada, no por tokens.** Cada referencia (citada o del corpus) se parsea a una clave estructurada: `{tipo: 'articulo'|'regla'|'anexo'|'capitulo', numero: '54', cuerpo: 'LA'|'RGCE'|'TMEC'|…}`. Una cita está respaldada ⟺ su clave coincide exactamente con la clave de un doc recuperado. El matcher actual de "≥50% de tokens" produce falsos respaldos (asocia por palabras sueltas) y falsas alarmas; ambas direcciones son inaceptables si el detector va a bloquear.
2. **Política al detectar cita no respaldada:**
   - **Intento único de regeneración** con instrucción correctiva: "Estas referencias NO están en el contexto: [X, Y]. Reescribe la respuesta eliminándolas o sustituyéndolas por 'no tengo este dato verificado; consúltalo en el DOF'."
   - Si la regeneración **aún** contiene citas no respaldadas → la respuesta se **degrada** a la frase canónica de abstención ("No tengo información verificada al respecto…"), `citations: []`, `confidence` banda mínima. La respuesta original se persiste en `CopilotConsult` (campo `respuestaDescartada`) para análisis, pero el usuario nunca la ve.
   - El warning deja de ser un adorno: si llega a UI es porque algo se degradó, no porque se mostró de todos modos.
3. **Flag de despliegue** `COPILOT_CITA_ESTRICTA` (default ON al cerrar Fase 3): permite medir en sombra (log-only) una semana antes de bloquear, para conocer la tasa real de regeneración/abstención antes de cambiar la UX.

### 4.2 Eliminar el fallback top-3

`copilot.ts:351-363` (si no hay coincidencias, adjunta los 3 primeros docs como "referencias usadas") **se elimina sin sustituto en `citations`**. Reglas:

- `citations` contiene únicamente docs cuya clave coincide con una cita del texto. Puede ser `[]`.
- Se agrega campo aparte `documentosConsultados: {reference, source, officialUrl}[]` (los top-K recuperados) que la UI puede mostrar bajo el rótulo "Documentos consultados (no citados en la respuesta)" — nunca como fuentes de la afirmación. Es la diferencia entre "esto respalda lo que dije" y "esto es lo que leí".
- `calculateConfidence` deja de contar tarjetas de fallback (ya no existen) y **elimina `Math.random()`**: posición en banda determinista (los mismos insumos → el mismo número). Sin esto, el hash de consulta cubre una respuesta cuya "confianza" no es reproducible.

### 4.3 La ley hardcodeada sale del prompt y del postprocesador

Hoy hay dos vías por las que sale contenido jurídico **sin recuperación** (y por tanto sin fuente, fecha, ni posibilidad de sello):

1. Las secciones A–F de `RAG_SYSTEM_PROMPT` (tratados por país, componentes DTA/IVA/IEPS/ISAN con artículos y tasas, régimen IMMEX-IVA 2014, vigencias de la regla 7.1.6…).
2. `injectIMMEXCertificationNote()` — texto legal con artículos inyectado post-LLM aunque esos documentos no se hayan recuperado.

Diseño:

- **Migración al corpus.** El contenido sustantivo de A–D se convierte en entradas de `LegalDocument` (una por tema: "Tratados preferenciales por país de origen", "Componentes del cálculo de impuestos a la importación", "IEPS vs ISAN", "IMMEX e IVA en importación temporal — certificación", "Vigencias del Registro IVA/IEPS RGCE 2026"), cada una con `reference`, `source`, URL oficial, `effectiveDate` y cotejo real contra fuente antes de sembrarse. Recuperables por el pipeline normal (keywords/topics ya existentes cubren immex/iva/tratados). El prompt conserva **solo reglas de comportamiento**: cita-o-calla, formato de citas, prohibición de comillas no rastreables, ortografía técnica (E), instrucción de duda (F), estilo y disclaimer. La regla de decisión es: *si la frase contiene un artículo, una tasa o una vigencia, es corpus; si describe cómo responder, es prompt.*
- **La nota IMMEX se vuelve recuperación forzada, no inyección de texto.** El disparador determinista (menciona IMMEX+IVA sin distinguir certificación) **se conserva** — es una propiedad de seguridad valiosa — pero su acción cambia: en vez de concatenar un string hardcodeado, carga el documento del corpus `NOTA-IMMEX-IVA-CERT` por referencia, adjunta su contenido como bloque citado y lo agrega a `citations` con su fuente/fecha. Resultado idéntico para el usuario, pero el texto tiene procedencia, aparece en las tarjetas con sello, y cuando la ley cambie se corrige en un solo lugar (el corpus) en vez de en un string de `copilot.ts`.

### 4.4 Atado afirmación↔pasaje (estado objetivo, Fase 4)

El mínimo de 4.1 ata **cita↔documento**. El objetivo final ata **afirmación↔pasaje**:

- El corpus se trocea en pasajes con id estable (`docId#p3`); el modelo responde con salida estructurada `claims: [{texto, pasajes: ["docId#p3"]}]` (tool use / structured output — hoy el Copilot ni siquiera usa Zod).
- Una afirmación sin pasaje válido se trata igual que una cita no respaldada (regenerar → degradar).
- Prerrequisito honesto: el corpus actual es mayormente **resúmenes operativos** (radiografía §4); atar a pasaje de un resumen da sensación de rigor sin serlo. Esta fase depende de sustituir los resúmenes por texto oficial cotejado, y por eso va al final y no bloquea las fases 3a-3b.

---

## 5. PRE-GLOSA FAIL-CLOSED

### 5.1 Dominios de revisión con estado explícito

Cada consulta externa del simulador se convierte en un **dominio declarado**. Se elimina todo `catch { /* silent */ }`:

```ts
type DominioGlosa = 'precio_estimado' | 'historico_importador' | 'cuotas_compensatorias'
                  | 'padrones' | 'noms' | 'reclasificacion_historica';

interface RevisionGlosa {
  dominios: Record<DominioGlosa, 'revisado' | 'no_revisado' | 'no_aplica'>;
  completa: boolean;              // todos revisado|no_aplica
  noRevisados: { dominio: DominioGlosa; motivo: string }[];
}
```

- Consulta OK (con o sin hallazgo) → `revisado`. "Consulté y no hay cuota" es un resultado; "no pude consultar cuotas" es otro. Hoy son indistinguibles.
- Consulta lanza → `no_revisado` + motivo; el flujo continúa con los demás dominios (se degrada por dominio, no en bloque).
- `declaresNOMs=true` ya **no** salta el lookup: la consulta corre igual (el dominio queda `revisado`) y la declaración del usuario solo suprime la bandera `DOC_002`, quedando registrada como `declarado_usuario`. Saltarse la consulta por una declaración era un fail-open disfrazado de optimización.

### 5.2 El score no puede presentarse como bajo con dominios sin revisar

`GlosaSimulationResult` agrega `revision: RevisionGlosa` y la regla de presentación se hace cumplir **en el backend**, no por cortesía de la UI:

- Si `revision.completa === false`: el resultado lleva `riskLevelPresentacion: 'indeterminado'` además del `riskScore/riskLevel` numéricos (que se conservan, etiquetados "parcial — calculado solo sobre dominios revisados").
- La UI y el reporte imprimible: banner rojo "Revisión incompleta — N dominio(s) sin revisar: […]" arriba del score; el nivel `low` **no se pinta verde** cuando es parcial; el bloque "todo bien"/recomendaciones vacías no se muestra.
- Persistencia: `GlosaSimulation` guarda `revision` (columna JSON) — los reportes históricos previos a la migración simplemente no la tienen y la UI los muestra con leyenda "simulación anterior a la revisión por dominios".
- Las probabilidades derivadas (`raProbability` etc.) heredan la marca parcial. (Su falta de calibración es un problema conocido y separado; esta frontera solo garantiza que no salgan de una revisión incompleta sin decirlo.)

### 5.3 Validación de entrada canónica

Al inicio de `simulateGlosa`: `validateFraction(input.fractionCode)`. Fracción inexistente/inactiva → error explícito (mismo contrato que el Clasificador), porque un score bajo sobre una fracción inexistente es el reporte tranquilizador en su forma más pura.

### 5.4 Sustituir el TC de respaldo `* 17`

`valueMXN: input.totalValueMXN ?? input.totalValueUSD * 17` se reemplaza:

1. `totalValueMXN` declarado → se usa, registrado como `declarado_usuario`.
2. Si falta → `tipoCambioMXN(fechaSimulacion)` del productor (§2.1), que envuelve el servicio de tipo de cambio existente (timer DOF ya corre en `index.ts`): `DatoLegal<number>` con fuente y fecha; `valueMXN` se calcula y persiste junto con el TC usado.
3. Si el servicio falla → `valueMXN = null` en DB y el dominio de valoración que dependiera de él marca `no_revisado`. **Nunca una constante.**

### 5.5 Fundamentos y versión del reporte

- `GlosaRiskRule` se extiende con `fuenteNombre`, `fuenteUrl`, `fechaCotejo` (mismo patrón que las 26 reglas del Risk Scorer, que ya lo hacen bien). `RiskFlag.legalBasis: string` pasa a `fundamento: DatoLegal<string>`; hasta que una regla tenga cotejo real, sale `sin_verificar` — que es exactamente lo que la UI ya pinta en ámbar, pero ahora con la posibilidad de subir a verde regla por regla.
- El pie "cada cita es verificable" del reporte se elimina hasta que sea verdad.
- La versión normativa del reporte deja de venir de `client/src/lib/corpus-version.ts`: el backend eco-devuelve `versiones` (de `getActiveVersions()`) en la respuesta de la simulación y el reporte imprime esas.

---

## 6. PLAN DE MIGRACIÓN POR FASES

**Orden de ejecución aprobado: Fase 2 → Fase 1 → Fase 3 → Fase 4.** Pre-Glosa va primero porque es el único hallazgo con daño activo (un reporte que dice "bajo riesgo" porque no pudo revisar puede sostener un despacho), es riesgo técnico bajo, y con 3 simulaciones y 0 outcomes en producción el costo de romper la costumbre es cero HOY y crece con cada usuario. La numeración de fases se conserva como identidad (Fase 1 = Clasificador), no como orden. Cada fase tiene flag de reversa y criterio de salida medible.

**Prerrequisito compartido adelantado:** `lib/dato-legal.ts` (§1) y el envoltorio `tipoCambioMXN` del productor (§2.1) se construyen con la Fase 2, porque sus fundamentos y TC los necesitan; el resto del productor llega con la Fase 1.

> **Nota de régimen:** Revenue Validation Mode sigue vigente (cero features hasta el review del día 7). Esta Fase 0 es diseño y no lo viola; el arranque de la Fase 1 requiere la aprobación explícita de Raúl, que es también la autoridad del modo.

### Fase 1 — Fundación + Clasificador

**Entrega:** `lib/dato-legal.ts` + `services/frontera-canonica.ts` (productor + registro de autoridad) + reconciliación en `routes/classify.ts` (§3), en dos sub-fases:
- **1a:** reconciliación + `datosCanonicos` aditivo + telemetría de discrepancias. Prompt intacto.
- **1b:** recorte del JSON del prompt + re-medición con harness (gate: sin regresión top-1 vs línea base 61.6%; skill `medicion-resiliente`).

**Riesgo: MEDIO.**
- Técnico 1a: bajo — aditivo; el código top-1 no cambia; los campos sustituidos pueden diferir de lo que los usuarios veían (eso es la corrección funcionando, pero hay que avisarlo en release notes del piloto).
- Técnico 1b: medio — cambio de prompt sin medición sería negligencia; por eso el gate.
- Un `no_disponible` donde antes había un número inventado se percibe como "el producto sabe menos". Es la venta honesta; decidido de antemano para no revertir por presión.

**Qué se rompe en el cliente:** nada en 1a (aditivo). `Classifier.tsx` se actualiza para leer `datosCanonicos` + sellos vía el adaptador §1.4; los escalares legacy se retiran en una fase 1c posterior cuando ya nadie los lea (histórico incluido — el historial renderiza desde `fullResponse`, que conserva su forma por registro).

**Criterio de salida:** discrepancias por campo medidas y publicadas; alertas y regulaciones sin contradicción posible (misma fuente); suite verde; harness sin regresión (1b).

### Fase 2 — Pre-Glosa fail-closed

**ESTADO: IMPLEMENTADA (18-ago-2026).** Suite `npm run test:glosa` 15/15; builds server+cliente verdes; migración `20260818000000_frontera_fase2_glosa_fail_closed` (aditiva). Hallazgo fuera de alcance anotado: `services/alert-generator.ts:97` usa TC constante `* 18` (inventario) — candidato a usar `tipoCambioMXN` del productor en Fase 1.

**Entrega:** §5 completo (dominios, `revision`, gate de presentación, `validateFraction`, TC real, fundamentos `DatoLegal`, versión eco-devuelta).

**Riesgo: BAJO-MEDIO.**
- Técnico: bajo — el motor de reglas no cambia; cambia qué se admite no haber revisado.
- Producto: los reportes van a salir "peores" (banners de revisión incompleta donde antes había verde silencioso). Es el objetivo; con 3 simulaciones y 0 outcomes en producción, el costo real de romper la costumbre es mínimo — razón para hacerlo YA, antes de que haya usuarios que dependan del verde falso.

**Qué se rompe en el cliente:** `GlosaSimulator.tsx` y el reporte imprimible: banner, nivel `indeterminado`, fundamentos con sello, versión desde backend. Simulaciones históricas sin `revision` → leyenda de compatibilidad.

**Criterio de salida:** prueba que tira cada dependencia (mock que lanza) y verifica `no_revisado` + `riskLevelPresentacion='indeterminado'`; cero `catch` silenciosos en `glosa-simulator.ts`; `17` inexistente en el código.

### Fase 3 — Copilot fail-closed

**Entrega en dos sub-fases:**
- **3a:** matcher por clave normalizada + política regenerar→degradar (flag en modo sombra 1 semana → ON) + eliminación del fallback top-3 + `documentosConsultados` + confianza determinista.
- **3b:** ley del prompt → corpus (entradas cotejadas con fuente/fecha) + `injectIMMEXCertificationNote` → recuperación forzada del doc `NOTA-IMMEX-IVA-CERT`.

**Riesgo: MEDIO-ALTO.**
- 3a: la tasa de abstención sube (respuestas que antes salían con warning ahora se degradan). El modo sombra da el número antes de decidir el corte; si la tasa de degradación es >X% se ajusta el matcher, no la política.
- 3b: es el cambio de comportamiento más delicado — el modelo pierde "conocimiento" inyectado y debe recuperarlo. **Gate obligatorio (condición de aprobación):** el set de evaluación debe estar ESCRITO y CORRIDO en "antes" — con resultados registrados — antes de que 3b empiece. Cobertura mínima: tratados por país de origen, componentes del cálculo (IGI/DTA/IVA/IEPS), IEPS vs ISAN, IMMEX-IVA certificación, vigencias regla 7.1.6. Las respuestas post-migración deben citar los docs nuevos. Sin ese set escrito y con corrida "antes" registrada, 3b no arranca.

**Qué se rompe en el cliente:** `Copilot.tsx`: tarjetas solo con citas reales (puede ser cero), sección nueva "documentos consultados", estado degradado visible. El warning de alucinación como banda-sin-bloqueo desaparece.

**Criterio de salida:** imposible (por test) que una respuesta con cita no respaldada llegue al usuario; `RAG_SYSTEM_PROMPT` sin artículos/tasas/vigencias; `Math.random()` fuera de la confianza.

### Fase 4 — Pasaje-nivel y cierre

**Entrega:** atado afirmación↔pasaje (§4.4) con salida estructurada; `SelloVerificacion` con `no_revisado` desplegado en todas las pantallas que muestren `DatoLegal`; sustitución progresiva de resúmenes del corpus por texto oficial cotejado (prerrequisito del pasaje-nivel).

**Riesgo: ALTO** (structured output cambia el pipeline de generación; el trabajo de corpus es manual y lento). Por eso es fase final y separable: las fases 1–3 cierran los tres hallazgos sin ella.

### Resumen de riesgo

| Fase | Riesgo técnico | Riesgo de percepción | Reversa |
|---|---|---|---|
| 1a Clasificador reconciliación | bajo | medio (datos "cambian") | quitar la llamada de reconciliación |
| 1b Prompt slim | medio (harness) | bajo | revertir prompt, queda 1a |
| 2 Pre-Glosa | bajo | medio (reportes "peores") | flag de presentación |
| 3a Copilot citas | medio | alto (más abstención) | flag `COPILOT_CITA_ESTRICTA` |
| 3b Ley → corpus | alto (eval obligatoria) | medio | restaurar secciones del prompt |
| 4 Pasaje-nivel | alto | bajo | no desplegar structured output |

---

## Fuera de alcance (explícito)

- Calibración de confianzas/probabilidades (Clasificador, Copilot, Pre-Glosa): esta frontera las **etiqueta** honestamente; calibrarlas es otro proyecto.
- Motor RGI determinista, textos oficiales de partida/subpartida, pgvector, completar datasets pendientes (Anexo 2.4.1, UPCI, padrones finos): el registro de autoridad (§2.2) está diseñado para absorberlos cuando existan, sin tocar consumidores.
- Risk Scorer: ya cumple el patrón; migrar su `fundamento` al tipo `DatoLegal` es un renombre mecánico que puede colgarse de la Fase 2, no un rediseño.

---

## Adenda de aprobación (Raúl, 18-ago-2026)

Diseño APROBADO tal como está, con tres precisiones incorporadas arriba:

1. **Orden invertido:** Fase 2 (Pre-Glosa) primero — es el único hallazgo con daño activo, riesgo técnico bajo, y el costo de romper la costumbre es cero hoy. Luego Fase 1 (Clasificador), luego 3, luego 4. (§6, orden de ejecución.)
2. **Confianza del Clasificador:** etiquetarla "no calibrada" es insuficiente; deja de mostrarse como número prominente en la UI — solo en detalle técnico. (§3.2.)
3. **Fase 3b:** el set de evaluación es gate obligatorio y debe estar escrito y corrido en "antes" ANTES de que 3b arranque. (§6, Fase 3.)

Autorizado el arranque de Fase 2 (Pre-Glosa fail-closed).
