# Cómo funciona ADUANAI, según el código real

**Corte de esta lectura:** 12 de julio de 2026

**Snapshot principal:** rama `main`, commit `afde88f`

**Producción observada:** servicio Railway `kanaduana`, deploy `SUCCESS` del mismo commit `afde88f`

**Alcance:** código rastreado de `client/`, `server/`, Prisma, seeds, scripts, pruebas, documentación operativa, Docker/Railway y comprobaciones de solo lectura en producción.

**Regla de este documento:** cuando el código contradice una descripción o un documento de diseño, manda el código ejecutable. Lo parcial, simulado o no integrado se marca expresamente.

## Resumen ejecutivo de la realidad

ADUANAI es un monorepo de dos aplicaciones: un SPA React servido por el mismo contenedor que una API Express, y una base PostgreSQL accedida con Prisma. Tiene muchos módulos funcionales —clasificación, cotización, expediente, prevalidación, inventario IMMEX, fiscal, MVE, logística, trazabilidad, auditoría, actualizaciones y administración—, pero no todos tienen el mismo nivel de madurez ni de autoridad de datos.

Las cuatro conclusiones que más cambian la forma de entenderlo son:

1. **El Clasificador no usa embeddings ni pgvector.** Recupera fracciones mediante búsqueda léxica en PostgreSQL, entrega candidatos a Sonnet 4.6, usa Haiku como verificador y valida al final que el código exista en `Fraction`. La secuencia RGI es una instrucción de prompt, no un motor determinista.
2. **El Consultor Legal sí usa embeddings, pero no pgvector.** `LegalDocument.embedding` es `Float[]`; el servidor carga documentos activos y calcula similitud coseno en JavaScript. El corpus de producción tenía 44 documentos activos, todos con vectores de 1024 dimensiones, al momento de la consulta.
3. **No existe en runtime el router “Sonnet 5 estándar → Opus 4.8 si confianza <0.75”.** Esa implementación está únicamente en el directorio no rastreado `files (2)/`, cuyo propio README pide copiarla y conectarla. El runtime usa Sonnet 4.6 y Haiku 4.5; con confianza menor a 70/100 el Clasificador reintenta con el mismo tier Sonnet.
4. **Pre‑Glosa y Riesgo no llaman a un LLM.** Pre‑Glosa es un simulador heurístico de una operación/fracción; Riesgo es un motor puro de 26 reglas. La capa cualitativa propuesta para ambos también vive sólo en `files (2)/`.

La promesa de “ningún dato legal sin fuente” está mejor implementada en el Risk Scorer, donde cada regla lleva fuente, URL y fecha de cotejo. En el Consultor Legal es una disciplina de prompt y un gate de recuperación, pero hay escapes reales. En el Clasificador, NICO, fundamento RGI, notas, tarifas y regulaciones todavía pueden provenir del LLM sin validación canónica integral. En Pre‑Glosa, los fundamentos se muestran deliberadamente en ámbar como `sin_verificar`.

---

# Capa técnica — Cómo funciona por dentro

## 1. Mapa de arquitectura real

### 1.1 Raíz y despliegue

| Ruta | Rol real |
|---|---|
| `client/` | SPA React 19 + Vite 8 + Tailwind 4. No usa Redux, Zustand ni TanStack Query; el estado es principalmente `useState`/`useEffect`. |
| `server/` | API Express 5 + TypeScript 6, servicios de negocio, integraciones de IA, Prisma y scripts. |
| `Dockerfile` | Construye servidor con `tsc`, corre `typecheck` del cliente, construye Vite, copia `client/dist` a `server/public` e inicia con `prisma migrate deploy && node dist/index.js`. |
| `railway.toml` | Indica a Railway usar el Dockerfile y reiniciar sólo ante fallo. |
| `docs/` | Diseño, trabajo diferido y runbooks. Los docs explican intención; no son autoridad por encima del runtime. |
| `server/prisma/migrations/0_init/` | Baseline versionado del esquema actual. |
| `files (2)/` | **No rastreado y no integrado.** Es un “Agent Pack” propuesto con prompts y router Sonnet 5/Opus 4.8. No forma parte del build ni del runtime. |
| `client-backup/` | Copia ignorada/legacy; no es la aplicación construida por Docker. |

No existe `FABLE-PROTOCOL.md` en el snapshot revisado. Sí existe `docs/DEFERRED_WORK.md`, y varias de las limitaciones que aparecen aquí ya están reconocidas allí.

### 1.2 Frontend

| Ruta | Rol real |
|---|---|
| `client/src/main.tsx:1-15` | Monta `StrictMode → ErrorBoundary → BrowserRouter → App`. |
| `client/src/App.tsx:113-275` | Recupera el token de `localStorage`, consulta `/api/auth/me`, define rutas públicas, protegidas y de superadministración. |
| `client/src/components/shell/` | Shell, navegación lateral, topbar, command palette y breadcrumbs. |
| `client/src/pages/` | 62 pantallas. Las principales incluyen Clasificador, Cotizador, Copilot, Expediente, Prevalidador, Inventario, Fiscal, MVE, Logística, Origen, Pre‑Glosa, Riesgo y administración. |
| `client/src/lib/api.ts:1-38` | Cliente HTTP monolítico. Usa base relativa `/api`, JSON y token Bearer. Ante `401` elimina sesión y redirige a login. |
| `client/src/hooks/usePermissions.ts` | Carga permisos granulares del usuario. Es control de experiencia; la autoridad real debe estar en el backend. |
| `client/src/components/ui/SelloVerificacion.tsx` | Representa visualmente `verificado`, `sin_verificar` o `vencido`, con fuente y fechas cuando existen. |
| `client/src/lib/corpus-version.ts` | Espejo hardcodeado de la versión tarifaria. No viene sellado por cada corrida del backend. |

El token de acceso se guarda en `localStorage`. El servidor devuelve `refreshToken`, pero el cliente no implementa un ciclo automático de refresh: `Login.tsx` guarda sólo el access token y `api.logout()` normalmente no recibe el refresh token. Es una integración parcial, no una sesión renovable completa.

### 1.3 Backend HTTP y capas transversales

`server/src/index.ts` es el composition root:

- configura Helmet, CSP, CORS, límites de body y estáticos en `server/src/index.ts:69-120`;
- asigna request ID, registra latencia, bloquea IP, aplica rate limits y auditoría en `index.ts:122-132`;
- monta 44 módulos de rutas en `index.ts:145-200`;
- sirve el SPA y aplica fallback a `index.html` en `index.ts:202-206`;
- normaliza errores al final en `middlewares/error.ts`;
- arma timers in-process para limpieza, pilotos, retención de logs, alertas, backups, OpenTimestamps, verificaciones, alertas de tenants y tipo de cambio en `index.ts:218-373`.

Las carpetas principales son:

| Ruta | Rol real |
|---|---|
| `server/src/routes/` | Validación de entrada, auth/permisos, orquestación HTTP, persistencia y respuesta. |
| `server/src/services/` | Lógica de negocio: clasificador, RAG, cotizadores, inventario, fiscal, MVE, glosa, riesgo, origen, auditoría, backups, etc. |
| `server/src/lib/` | Prisma, LLM, embeddings, catálogos Anexo 22, validadores, logger, seguridad y OpenTimestamps. |
| `server/src/middlewares/` | JWT, roles, permisos, auditoría, límites, logging y errores. |
| `server/src/tests/` | Pruebas unitarias/paridad y artefactos de medición. No hay runner unificado de todo el repositorio. |
| `server/scripts/` | Ingestas y reparaciones operativas. Algunos escriben directamente y no pasan por todos los guards de las rutas. |

La autenticación valida el JWT, vuelve a consultar usuario/tenant y añade `userId`, `tenantId` y `role` a la petición (`middlewares/auth.ts:15-57`). Los roles simples se validan con `requireRole`; permisos granulares consultan tablas de permisos (`middlewares/requirePermission.ts`).

El aislamiento multi-tenant es **por disciplina de consultas**: cada ruta debe añadir `tenantId`. No hay Row Level Security de PostgreSQL ni middleware Prisma global que lo haga inevitable. Las rutas críticas revisadas sí filtran por tenant en sus listados, pero una consulta que olvide el filtro puede cruzar tenants.

### 1.4 Persistencia

`server/src/lib/prisma.ts` crea Prisma 7 sobre `@prisma/adapter-pg`. `server/prisma/schema.prisma` tiene 84 modelos. Los grupos funcionales son:

- tenancy, usuarios, propuestas y permisos;
- jerarquía TIGIE (`Section`, `Chapter`, `Heading`, `Subheading`, `Fraction`);
- conocimiento y clasificaciones;
- cotizaciones y partidas;
- pedimentos y prevalidación;
- Copilot y corpus legal;
- alertas y auditoría encadenada;
- operaciones/documentos;
- inventario IMMEX, descargos y Anexos 24/30;
- créditos, garantías y certificación IVA/IEPS;
- MVE/COVE, logística y BOM;
- actualizaciones TIGIE;
- cuotas compensatorias, precios estimados, regulaciones y origen;
- precedentes, snapshots normativos y OpenTimestamps;
- Pre‑Glosa y Risk Scorer.

**No hay pgvector en el esquema ni en la migración.** `LegalDocument.embedding` es `Float[]` (`schema.prisma:1740`), que en PostgreSQL se materializa como arreglo de `DOUBLE PRECISION`. No hay `CREATE EXTENSION vector`, índice IVFFlat/HNSW ni operadores `<=>`. `server/src/lib/embeddings.ts:7-9` lo reconoce como migración futura.

### 1.5 Datos y seeds

| Ruta | Contenido y autoridad real |
|---|---|
| `prisma/seed/data/BASEUNICA-LIGIE_20260330-20260330.xlsb` | Archivo Base Única SNICE incorporado al repo. |
| `prisma/seed/data/ligie-fractions-2026.json` | Extracto minificado usado para el catálogo completo. |
| `prisma/seed/seed-ligie-2026.ts` | Carga aditiva con `skipDuplicates`; inserta faltantes, pero **no corrige** filas existentes. Crea headings/subheadings con textos genéricos `Partida X`/`Subpartida X`. |
| `prisma/seed/index.ts` + `tigie-data.ts`/`chapters/` | Seed curado/legacy que hace upsert y puede sobrescribir descripción, NMF, TMEC, NOMs y keywords de las fracciones que contiene. |
| `prisma/seed/legal-documents.ts` | 44 documentos activos previstos para RAG, en su mayoría resúmenes operativos; algunos artículos fueron sustituidos por texto cotejado. |
| `prisma/seed/knowledge-base*.ts` y `knowledge-use-cases.ts` | Casos y reglas auxiliares para clasificación. No todo el conocimiento es verificado. |
| `prisma/seed/legal-precedents.ts` | Corpus sintético; queda apagado por `PRECEDENT_CORPUS_VERIFIED=false`. |
| `prisma/seed/glosa-risk-rules.ts` | 15 reglas configurables de Pre‑Glosa. |
| `services/risk-scorer/rules.ts` | Las 26 reglas selladas de Riesgo. Viven en código, no en DB. |
| `scripts/ingest-69b.ts` | Descarga CSV público SAT, parsea, deduplica por RFC y reemplaza `Sat69B` en una transacción. |
| `prisma/seed/sat-padrones.ts` | Catálogo de sectores, pero la cobertura por fracción contiene aproximaciones y pendientes documentados. |
| `prisma/seed/antidumping-upci.ts` | Dataset mixto; muchas filas sintéticas fueron desactivadas, pero el propio repo dice que la reconstrucción UPCI completa sigue pendiente. |

### 1.6 Prompts y “agentes” que sí se ejecutan

No hay un framework de agentes autónomos. Hay servicios que llaman modelos con prompts específicos:

| Servicio | Modelo real | Función |
|---|---|---|
| `services/classifier.ts` | Sonnet 4.6 + verificador Haiku 4.5 | Clasifica entre candidatos TIGIE y verifica la fracción elegida. |
| `services/copilot.ts` | Haiku 4.5 | Redacta respuesta legal con contexto RAG. |
| `services/rag-search.ts` | Haiku 4.5 | Reordena candidatos legales. |
| `services/auto-mve.ts` | Sonnet 4.6 | Extrae/audita datos para MVE. |
| `services/document-extractor.ts` | Sonnet 4.6 | Extrae estructura de PDFs/imágenes aduanales. |
| `services/tigie-updater.ts` | Sonnet 4.6 para decreto; Haiku para resumen | Analiza texto pegado de un decreto y prepara cambios/resúmenes. |
| `services/prevalidator-v2.ts` | Haiku 4.5 | Revisión cualitativa de valores de partidas; el resto del prevalidador es determinista. |
| `services/fiscal-guardian.ts`, `inventory.ts`, `logistics-optimizer.ts` | Haiku 4.5 | Resúmenes/recomendaciones sobre resultados ya calculados. |
| Pre‑Glosa y Risk Scorer | **Sin LLM** | Motores de reglas/heurísticas. |

`server/src/lib/llm.ts:44-50` define sólo dos tiers: `strong` y `fast`. Para Anthropic son Sonnet 4.6 y Haiku 4.5; si `LLM_PROVIDER=gemini`, son `gemini-2.0-flash-exp` y `gemini-2.0-flash-lite`. Ese selector no gobierna todos los servicios: varios llaman directamente al SDK de Anthropic y por tanto ignoran el switch global.

## 2. Flujo de datos de punta a punta

No existe una petición única que siempre toque catálogo, embeddings y LLM. El Clasificador no usa embeddings; el Copilot sí. Éstos son los dos flujos reales.

### 2.1 Patrón HTTP común

1. Una página React conserva los datos en estado local y llama un método de `client/src/lib/api.ts`.
2. El wrapper hace `fetch('/api/...')`, envía JSON y adjunta `Authorization: Bearer <token>`.
3. Express aplica headers, CORS, parser de body, logging, guard de IP, rate limit y middleware de auditoría.
4. La ruta autentica y, cuando corresponde, exige rol o permiso granular.
5. Un servicio consulta/escribe PostgreSQL con Prisma y, si aplica, llama embeddings o Claude.
6. La ruta persiste el resultado y devuelve JSON.
7. Al finalizar una mutación exitosa, el middleware de auditoría registra la acción. La UI actualiza su estado y presenta el resultado.

### 2.2 Flujo del Clasificador: UI → catálogo → Sonnet/Haiku → DB

1. `client/src/pages/Classifier.tsx` llama `api.classify(...)` (`api.ts:93-104`).
2. `POST /api/classify` pasa por `classifierLimiter` y luego por `authenticate` + `requirePermission('classifier:create')` (`routes/classify.ts:96-118`).
3. `classifyProduct()` extrae hasta ocho términos, busca coincidencias de `keywords` y de frontera de palabra en `Fraction.description`, aplica una ponderación tipo IDF y conserva top 30 (`services/classifier.ts:461-533`).
4. Completa contexto con todas las fracciones de las tres partidas más votadas y una muestra del capítulo (`classifier.ts:535-590`).
5. Recupera `ClassificationKnowledge`; los precedentes legales devuelven vacío mientras el switch siga apagado.
6. El precheck numérico compara magnitudes declaradas con umbrales parseables y sólo inyecta exclusiones. El vocab bridge y el precheck estructural existen, pero quedaron **desconectados** en `afde88f` (`classifier.ts:462-478,772-778`).
7. Sonnet 4.6 recibe prompt, candidatos y contexto a temperatura 0 (`classifier.ts:805-831`). Devuelve texto que se extrae y parsea como JSON/`jsonrepair`, sin Zod ni structured output (`classifier.ts:834-855`).
8. Haiku revisa el código contra opciones de la misma subpartida (`classifier.ts:597-650,928-952`).
9. Si la confianza **autodeclarada** del modelo es `<70`, se llama otra vez al tier `strong`, es decir, al mismo Sonnet 4.6 (`classifier.ts:954-990`).
10. `enforceCatalogFraction` valida que el código final sea una fracción activa; si no, intenta el código anterior validado y, si tampoco sirve, lanza error (`classifier.ts:993-998`, `fraction-validator.ts`).
11. La ruta deriva padrón sectorial con el resolver canónico, genera alertas, guarda trazabilidad/`Classification` y responde con datos, versiones y hashes (`routes/classify.ts:119-244`).

**Embeddings usados en este flujo:** ninguno.

### 2.3 Flujo del Consultor Legal: UI → embedding → corpus → Haiku → DB

1. `client/src/pages/Copilot.tsx:27-47` llama `api.chat(message, conversationId)`.
2. `POST /api/copilot` autentica, valida sólo que el mensaje tenga al menos dos caracteres y llama `askCopilotWithRAG` (`routes/copilot.ts:9-22`).
3. `smartRetrieval()` genera el embedding de la pregunta: Voyage `voyage-4`/1024 por defecto, OpenAI/1536 si se configura, o hash local/256 como fallback (`lib/embeddings.ts:51-77,159-203`).
4. `rag-search.ts` consulta documentos activos, calcula coseno en Node, mezcla 70% similitud vectorial + 30% keywords, aplica boost/filtro temático y toma 12 (`rag-search.ts:187-272`).
5. Haiku reordena los candidatos y filtra score `<55`; si el reranker falla, vuelve al ranking local (`rag-search.ts:303-385`).
6. El gate permite responder con dos o más documentos, o con uno cuyo score Haiku sea al menos 75. Sin evidencia suficiente inyecta una instrucción de respuesta canónica “No tengo información verificada…” (`rag-search.ts:432-443`; `copilot.ts:305-313`).
7. Haiku genera la respuesta con hasta cinco documentos en contexto (`copilot.ts:315-323`).
8. Un regex intenta detectar artículos/reglas citados y compararlos con las referencias recuperadas. Las coincidencias alimentan tarjetas de citas; si no hay coincidencias, el código adjunta automáticamente los tres primeros documentos (`copilot.ts:325-363`).
9. Se calcula una “confianza” heurística, se genera un hash y se persiste `CopilotConsult`; después la ruta guarda dos `CopilotMessage` y devuelve respuesta/citas/warning (`copilot.ts:365-394`; `routes/copilot.ts:24-47`).

El `conversationId` sólo agrupa mensajes guardados. El historial no se envía al RAG; cada turno es atómico (`copilot.ts:401-421`).

### 2.4 El supuesto router Sonnet 5 → Opus 4.8

**No está en la aplicación.** La evidencia es directa:

- runtime: `lib/llm.ts:44-50,119-126` mapea `strong → claude-sonnet-4-6`, `fast → claude-haiku-4-5-20251001`;
- Clasificador: primera pasada `strong`, verificador `fast`, retry `<70` otra vez `strong`;
- no hay import de un router Opus ni llamada de clasificación a Opus;
- `files (2)/router.ts:20-27,128-165` sí contiene Sonnet 5/Opus 4.8 y umbral 0.75, pero `files (2)/README.md:42-45` indica que todavía debe copiarse y cablearse.

Por tanto, describir hoy una escalación a Opus sería inventar arquitectura que no está desplegada.

---

## 3. Módulo 1 — Clasificador arancelario

### (a) Qué hace en una frase

Propone una fracción TIGIE de ocho dígitos para una descripción de mercancía, verifica que el código exista en el catálogo y guarda el expediente de clasificación.

### (b) Entrada y salida

**Entrada autenticada:** descripción, contexto opcional, país de origen, valor/cantidad declarados y contexto operacional (`useCase`, sector, tipo de importador). La ruta sólo comprueba que exista una descripción de al menos tres caracteres; no usa un esquema Zod completo ni un máximo en backend (`routes/classify.ts:96-117`).

**Salida:** fracción, descripción, NICO, confianza, RGI, tarifas, regulaciones, alternativas, explicación, fundamento, alertas, padrón, hashes/versiones y el ID persistido. Parte de esa forma viene del modelo y parte se deriva canónicamente en la ruta.

### (c) Mecanismo técnico real

- **Retrieval:** léxico sobre `Fraction`, con keywords, regex de frontera de palabra e IDF. No embeddings.
- **Ranking:** top 30 por score; después top 3 partidas y top 2 capítulos para ampliar candidatos.
- **Precheck determinista:** únicamente atributos numéricos, en modo “sólo exclusiones”. `vocab-bridge.ts` y `structural-precheck.ts` quedan en el repo pero fuera del flujo actual.
- **RGI:** prompt detallado en `services/classifier.ts:243-361`. No existe una máquina de estados RGI, ni lectura secuencial verificable de notas/partidas.
- **Modelo:** Sonnet 4.6 a temperatura 0; Haiku 4.5 como segundo pase; retry con Sonnet 4.6 si `confidence <70`.
- **Candado:** `validateFraction` normaliza ocho dígitos y exige `Fraction.active=true`; `enforceCatalogFraction` corre al final.
- **Precedentes:** `PRECEDENT_CORPUS_VERIFIED=false`; el lookup central devuelve vacío.
- **Persistencia:** `Classification`, traza, versiones, conocimiento usado, alertas y comprobación de padrón.

### Candados: alcance real

El candado sí impide que la respuesta final lleve un código truncado, inexistente o inactivo. No demuestra que:

- el código estuviera realmente entre los candidatos dados al modelo;
- sea la fracción correcta;
- el NICO corresponda;
- tarifas, NOMs o RRNA coincidan con el catálogo vigente;
- las RGI y notas legales existan o se hayan consultado;
- alternativas y explicación estén respaldadas.

La restricción “sólo una fracción de la lista” está en el prompt (`classifier.ts:813-823`), no en el guard. Un código activo recordado por el LLM puede pasar. El test del candado incluso confirma que conserva la descripción del LLM cuando el código existe (`tests/classifier-candado.test.ts`).

Además, la ruta recalcula `sectoralRegistry`, pero no sustituye de forma integral NICO, NMF/preferenciales, `regulations.rrna/noms`, RGI o notas. El prompt recibe NMF/NOM para los top 30, pero la salida no se reconcilia campo por campo. Las alertas sí consultan tablas canónicas, por lo que una misma respuesta puede contener regulaciones LLM y alertas canónicas contradictorias.

El switch de precedentes también tiene un bypass: la limpieza ocurre antes del retry. Si el retry de baja confianza gana, reemplaza el resultado por JSON crudo y sólo vuelve a validarse el código (`classifier.ts:954-998`). Puede reintroducir strings de precedentes o perder normalización/traza.

### La cifra 61.6%

Los artefactos del repo muestran:

| Artefacto | Top‑1 |
|---|---:|
| `baseline-v2-2026-07-03.json` | 38/99 = 38.4% |
| `baseline-v2.1-iter2-2026-07-03.json` | 62/99 = 62.6% |
| `baseline-v2.2-temp0-2026-07-04.json` | 61/99 = 61.6% |
| `medicion-etapas0-3-2026-07-11.json` | 61/99 = 61.6% |
| `medicion-a1a2-2026-07-12.json` | 56/99 = 56.6%, con seis timeouts |

El commit actual declara 61.6% como **línea base oficial**, pero el HEAD exacto —E0 + precheck numérico, con vocab bridge y estructural apagados— no tiene una corrida limpia propia después del revert. Por tanto, 61.6% es la mejor línea base documentada, no una medición reproducida del binario actual.

La evaluación llama directamente `classifyProduct`, no la ruta completa. Mide coincidencia de código top‑1/top‑3/capítulo; no mide NICO, RGI, fuentes, tarifas, NOMs/RRNA ni persistencia. Es el mismo set usado durante el tuning, sin holdout externo. En la medición 61.6%, los errores promediaron 87.5 de confianza y 16 errores tenían confianza ≥90: la confianza no está calibrada.

### (d) Construido y faltante

**Construido:** catálogo activo, recuperación léxica rankeada, contexto de partida/capítulo a nivel de fracciones, precheck numérico, Sonnet + verificador Haiku, error `SIN_CANDIDATO`, candado final, persistencia, alertas y padrón derivados.

**Parcial o faltante:** motor RGI determinista; textos oficiales de partida/subpartida; lectura real de `Chapter.legalNotes`; structured outputs/Zod; pertenencia obligatoria al conjunto candidato; canonicalización de NICO/tarifas/RRNA/NOM; fuentes por afirmación; confianza calibrada; benchmark independiente/holdout y medición del HEAD; escalación a un modelo profundo.

**Riesgo adicional:** un feedback negativo puede crear `ClassificationKnowledge` global no verificado. La búsqueda acepta conocimiento no verificado del capítulo con una penalización limitada, y `ClassificationKnowledge` no tiene tenant. Además, el endpoint de feedback actualiza por ID sin filtrar tenant antes de crear conocimiento. Eso permite contaminación del contexto global si se conoce un ID ajeno (`routes/classify.ts:285-323`; `schema.prisma:311-327`).

---

## 4. Módulo 2 — Consultor Legal (Copilot RAG)

### (a) Qué hace en una frase

Busca documentos legales relacionados con una pregunta, pide a Haiku redactar una respuesta y muestra tarjetas con las fuentes recuperadas.

### (b) Entrada y salida

**Entrada:** mensaje libre y un `conversationId` opcional. No hay esquema de temas ni fecha de la operación.

**Salida:** texto, ID de conversación, lista de citas, score de confianza, hash de consulta, cantidad de documentos y un warning cuando el detector cree que hubo referencias no verificadas.

### (c) Mecanismo técnico real

1. Detecta temas mediante aliases/keywords (`rag-search.ts`).
2. Genera embedding de consulta con Voyage, OpenAI o fallback hash.
3. Lee documentos `LegalDocument` activos de PostgreSQL. No filtra por fecha de operación, vigencia/expiración ni supersesión.
4. Calcula coseno en memoria y mezcla vector/keyword/topic.
5. Haiku reordena los candidatos y el gate decide si hay soporte mínimo.
6. Construye un bloque de texto con referencia, fuente, URL, `effectiveDate` y contenido.
7. Haiku responde con el prompt `RAG_SYSTEM_PROMPT`.
8. Regexes extraen referencias y las comparan flexiblemente con los docs; el servidor persiste respuesta y citas.

El corpus previsto por el seed tiene **44 entradas** repartidas entre Ley Aduanera, LCE, LIVA, LIEPS, LFD, LIGIE, RGCE/anexos, Acuerdo NOMs y tratados. La consulta de solo lectura en producción mostró 47 filas totales, 44 activas y embeddings de 1024 dimensiones. Las tres inactivas corresponden a material retirado/supersedido.

El guard `assertCorpusEmbedding` sí bloquea las escrituras normales del seed y de los endpoints administrativos cuando no hay proveedor real o la dimensión no coincide (`lib/embeddings.ts:85-105`; `seed/legal-documents.ts:591-595`; `routes/legal-docs.ts:225-232,302-308`). No es una restricción de DB universal: scripts como `fix-corpus-sectores.ts` escriben sin el guard central; `fix-legal-art144.ts` cambia contenido sin regenerar embedding; `reembed-corpus.ts` usa su propio check fijo.

### La disciplina “cita o calla”: intención vs. garantía

El prompt ordena responder sólo con contexto, citar cada afirmación y usar la frase canónica de abstención (`copilot.ts:19-32`). El gate también puede imponer esa abstención. Es una defensa real, pero **no es inescapable**:

- el propio prompt contiene datos jurídicos sustantivos hardcodeados sobre tratados, DTA, IVA, IEPS, ISAN, IMMEX y vigencias (`copilot.ts:34-64`);
- después del LLM, `injectIMMEXCertificationNote()` puede añadir una nota legal con artículos aunque esos documentos no hayan sido recuperados (`copilot.ts:99-120,323`);
- cuando detecta una cita alucinada, sólo loguea y devuelve un warning; no bloquea, elimina ni regenera la respuesta (`copilot.ts:325-334`; `routes/copilot.ts:34-45`);
- si no detecta citas coincidentes, adjunta los tres primeros documentos como “referencias usadas” (`copilot.ts:351-363`), aunque eso no prueba que sostengan la afirmación;
- el matcher usa tokens muy amplios y puede asociar una referencia por coincidencias débiles;
- la confianza cuenta esas tarjetas de fallback y usa `Math.random()` en algunas bandas (`copilot.ts:202-269`). No es una probabilidad calibrada.

Por eso, hoy el Consultor puede entregar una afirmación incorrecta acompañada de documentos oficiales que no la respaldan. La UI sí muestra el warning de alucinación, pero no falla cerrado.

### Corpus y citas

`legal-documents.ts:7-11` admite explícitamente que gran parte del corpus son **resúmenes operativos**, no el texto íntegro, y deja la sustitución por texto oficial como trabajo de producción. Algunos documentos —por ejemplo Art. 78/184 LA, Art. 49 LFD, Art. 27 LIVA, Art. 54 LA, Art. 4.5 T‑MEC y Art. 15‑A LIEPS— incluyen comentarios de cotejo y fragmentos más robustos.

Al persistir, el seed ignora la `officialUrl` específica de cada entrada y la reemplaza por una URL institucional por `source` (`legal-documents.ts:577-605`). Esto elimina URLs inventadas, lo cual es bueno, pero también convierte enlaces artículo/documento-específicos en portadas generales. Por ejemplo, el PDF específico de T‑MEC Art. 4.5 termina como `gob.mx/t-mec`.

De los 44 documentos activos observados en producción:

- 44 tenían alguna URL;
- sólo 5 tenían `publishedDate`;
- 4 no tenían `effectiveDate`;
- ninguno tenía `expiryDate`;
- las tarjetas que devuelve Copilot incluyen URL, pero no fecha de publicación/vigencia ni fecha de cotejo.

Si el embedding de consulta cae al hash de 256 dimensiones y el corpus está a 1024, `cosineSimilarity` devuelve cero por longitud distinta. El servicio continúa con keywords sin avisar al usuario. Eso es degradación resiliente, no recuperación semántica equivalente.

### (d) Construido y faltante

**Construido:** ruta autenticada, corpus administrable, embeddings dimensionalmente sanos en producción, búsqueda híbrida, filtro temático, reranker, gate de abstención, persistencia, feedback, hash y biblioteca legal.

**Parcial o faltante:** pgvector; búsqueda “a fecha de operación”; vigencia/supersesión; corpus íntegro; metadata completa; validación cita → documento → pasaje; bloqueo/regeneración de alucinaciones; citas nativas de Anthropic; confianza determinista/calibrada; historial conversacional real; snapshot del corpus incluido en el hash.

---

## 5. Módulo 3 — Pre‑Glosa

### (a) Qué hace en una frase

Suma reglas heurísticas sobre datos declarados de una operación y produce un reporte imprimible de señales de riesgo antes del despacho.

### (b) Entrada y salida

**Entrada API:** una fracción, países de origen/proveedor, aduana, clave/régimen, valores, peso, unidades, banderas T‑MEC/cuota/NOM/certificación/vinculación y un objeto opcional de documentos (`glosa-simulator.ts:16-50`; `routes/glosa.ts:29-58`).

**Entrada de la UI:** sólo fracción, países, aduana, “clave de pedimento”, valores/peso y seis checkboxes. No captura descripción de producto, unidades ni el objeto de documentos aunque el API los acepte (`GlosaSimulator.tsx:179-220`).

**Salida:** score 0–100, nivel `low|medium|high|critical`, tres porcentajes, hallazgos, recomendaciones, promedio de industria/historial propio, disclaimer e ID persistido.

### (c) Mecanismo técnico real

Carga 15 reglas activas desde `GlosaRiskRule`. Después ejecuta 14 comprobaciones codificadas:

1. valor bajo contra `EstimatedPrice`;
2. desviación contra histórico del tenant;
3. posible vinculación no declarada;
4. triangulación Asia/tercer país;
5. T‑MEC sin documento de origen vinculado;
6. cuota compensatoria activa no declarada;
7. padrón faltante;
8. preferencia sin certificado;
9. NOM no declarada;
10. histórico de reclasificación;
11. descripción genérica;
12. fracción residual `.99.99`;
13. temporal IMMEX `IN`/`AF` sin certificación IVA/IEPS;
14. una de cinco aduanas consideradas de “alto riesgo”.

Cada regla activa aporta un peso. La suma se limita a 100. Los niveles son: crítico desde 80, alto desde 60, medio desde 30 y bajo por debajo de 30 (`glosa-simulator.ts:299-303`). Las probabilidades no salen de un modelo estadístico:

- reconocimiento = `min(95, score × 0.85)`;
- glosa = `min(90, score × 0.70)`;
- cotejo = `min(98, 40 + score × 0.40)`.

Las simulaciones se guardan en `GlosaSimulation`. El usuario puede registrar un resultado real (`ra_yes`, `ra_no`, `documental`, `free`) y los administradores pueden editar peso/severidad y ver una calibración simple. En producción había tres simulaciones y **cero outcomes**, por lo que no existe base empírica para presentar esos porcentajes como probabilidades calibradas.

### Los “seis dominios” y lo que de verdad existe

La especificación de seis dominios está en `files (2)/pre-glosa.md`, no en el runtime. Contrastada con el código:

| Dominio esperado | Cobertura ejecutable |
|---|---|
| Datos generales | **Faltante como dominio.** No valida RFC, patente, existencia de aduana ni coherencia clave–régimen. Sólo suma una heurística de aduana. |
| Mercancías | **Muy parcial.** Una fracción; no NICO, UMC/UMT, conversiones, múltiples partidas ni comparación con el Clasificador. |
| Valoración | **Parcial.** Precio estimado, histórico y vinculación declarada; no reconstruye factura, Incoterm, incrementables o TC con fecha. |
| Contribuciones/preferencias | **Muy parcial.** Alertas T‑MEC e IVA/IEPS; no recalcula IGI, DTA, IVA ni bases. |
| RRNA | **Parcial.** Cuota, padrón y NOM; no acredita permisos/documentos. |
| Identificadores | **Faltante.** No valida Apéndice 8 ni complementos. |

La estructura formal de DB sólo tiene **cinco categorías**: `valuation` (3), `origin` (3), `classification` (3), `regime` (4) y `documentation` (2). `PAD_001` y `ADU_001` están metidas en `regime`. `REG_002` está sembrada pero nunca tiene código de evaluación. No existe un motor exhaustivo de seis dominios.

### Taxonomía de severidad real

| Severidad | Etiqueta UI | Reglas sembradas |
|---|---|---|
| `critical` | Crítico | 4: `VAL_001`, `ORI_001`, `ORI_003`, `PAD_001` |
| `high` | Observación relevante | 5: `VAL_002`, `VAL_003`, `ORI_002`, `DOC_001`, `DOC_002` |
| `medium` | Observación | 3: `CLA_001`, `CLA_002`, `REG_001` |
| `low` | Aviso | 3: `CLA_003`, `REG_002`, `ADU_001` |

### Fallos abiertos y datos heurísticos

Las consultas de precio, histórico, antidumping, padrón, NOM y reclasificación capturan cualquier error y continúan sin marca de “no revisado” (`glosa-simulator.ts:154-266`). Una caída de DB o catálogo puede reducir el score y producir un reporte tranquilizador sin revelar que faltó revisar un dominio.

Otros límites concretos:

- no llama `validateFraction`; una fracción inexistente puede terminar con pocas banderas;
- si `totalValueMXN` no viene, persiste `totalValueUSD * 17`, un TC sin fuente ni fecha (`glosa-simulator.ts:338-351`);
- las “aduanas de alto riesgo” y “fracciones típicamente chinas” son sets hardcodeados sin dataset estadístico citable;
- `declaresNOMs=true` evita totalmente el lookup, aunque sea sólo declaración del usuario;
- la UI puede marcar certificado T‑MEC, pero no puede enviar `documents.originCertificate`; eso activa `ORI_002`;
- la UI inicia `regimenCode='IMD'`, pero el selector ofrece claves de pedimento como `A1`, `IN`, `AF`; mezcla régimen del Apéndice 16 con clave del Apéndice 2;
- los fundamentos son strings (`Art. ...`) sin URL/fecha estructuradas. La UI los marca correctamente `sin_verificar`, aunque el pie del documento afirma “cada cita es verificable”;
- el reporte muestra una versión normativa hardcodeada en cliente, no la versión eco-devuelta por esa simulación.

### (d) Construido y faltante

**Construido:** formulario, endpoint, reglas configurables, consultas a precios/cuotas/padrones/NOM/historial, score, severidades, reporte imprimible, historial, feedback de outcome y panel admin.

**Parcial o faltante:** revisión de un pedimento completo/multiparte; seis dominios exhaustivos; identificadores; recálculo fiscal; validación canónica de fracción/NICO; estado `no_revisado`; calibración; fuentes por regla; manejo fail‑closed de dependencias; prueba dedicada del motor; PDF server-side (hoy usa `window.print()`).

---

## 6. Módulo 4 — Riesgo de Responsabilidad Solidaria

### (a) Qué hace en una frase

Calcula por reglas determinísticas la exposición jurídica de un agente/agencia y, por separado, qué tan completo está su escudo documental.

### (b) Entrada y salida

**Entrada:** tipo de sujeto; datos opcionales de operación (fracción, NICO, valor, origen, régimen, pedimento, RFC, preferencia); y un checklist trivalente de declaraciones/evidencias (`routes/risk.ts:19-51`).

**Salida:** exposición 0–100, porcentaje de escudo, banda, banderas, resultado por factor/regla, checklist, faltantes accionables, versión de reglas y disclaimer. Se guarda el snapshot de señales, pesos y versión.

### (c) Mecanismo técnico real

No usa LLM. El pipeline es:

1. Zod normaliza la entrada.
2. `signals.ts` construye señales verificadas contra catálogo, padrones, cuotas, formato de pedimento, inventario del tenant y tabla SAT 69‑B.
3. `rules.ts` ejecuta **26 funciones puras** agrupadas en ocho factores.
4. `engine.ts` limita la suma de cada factor por su peso y suma hasta 100.
5. `shield.ts` evalúa **16 ítems** documentales; ocho son incisos del expediente 59‑V. Para agente aplican 14; para agencia se agregan dos de RLA 235‑F/235‑J.
6. `calcularBanda()` combina exposición, escudo y banderas de 69‑B/embargo.
7. La ruta persiste `RiskAssessment` con detalle, checklist, `RULES_VERSION` y pesos.

Pesos default (`rules.ts:243-253`):

| Factor | Peso |
|---|---:|
| Valor | 24 |
| Perfil importador | 22 |
| Cuotas compensatorias | 12 |
| Padrones | 10 |
| Temporales | 10 |
| Clasificación | 8 |
| NOMs | 8 |
| Documentación | 6 |

Las 26 reglas tienen `fundamento { articulo, citaCorta, fuente, url, fechaCotejo }` y una versión sellada `v1.0.0-2026-07-04`. Ésta es la implementación más cercana al contrato de fuente verificable.

### Las 26 reglas, resumidas

- **Valor (5):** falta de referencia/valor, MVE, incrementables, proveedor no localizable y pago sin soporte.
- **Perfil (5):** 69‑B definitivo/presunto, KYC, causal de suspensión y vinculación agente–cliente.
- **Cuotas (3):** cuota activa, ruta de elusión y falta de prueba de origen distinta.
- **Padrones (2):** sector requerido no activo y padrón general declarado no vigente.
- **Temporales (3):** fuera de domicilio, por vencer/vencidos y transferencias.
- **Clasificación (3):** fracción inválida/discrepante, decreto de tasas y NICO inválido.
- **NOMs (2):** NOM sin evidencia y documento que no ampara mercancía.
- **Documentación (3):** formato de pedimento, certificación de origen y encargo conferido.

### Lista 69‑B SAT

La tabla de producción contenía **14,054 RFC** con corte declarado por el CSV del SAT al **31 de diciembre de 2025**:

| Situación | RFC |
|---|---:|
| Definitivo | 11,182 |
| Presunto | 963 |
| Desvirtuado | 340 |
| Sentencia favorable | 1,569 |

La ingesta descarga el CSV oficial, rechaza reemplazar si hay menos de 5,000 filas y hace `deleteMany + createMany` dentro de una transacción (`scripts/ingest-69b.ts:57-118`).

Sin embargo, al corte de este documento la lista llevaba más de seis meses sin actualizarse. `signals.ts` calcula `lista69BDisponible=false` cuando supera 30 días, pero las reglas ignoran ese flag y disparan únicamente por `en69B` (`signals.ts:56-69`; `rules.ts:89-100`). La UI etiqueta la señal como “VERIFICADO POR EL SISTEMA” y no muestra `listaAl`. Así, la antigüedad se calcula pero no degrada el resultado.

La deduplicación conserva la situación “más severa”, no necesariamente la más reciente. Si un RFC pasó de presunto/definitivo a desvirtuado o sentencia favorable en filas duplicadas, puede conservarse el estado peor (`ingest-69b.ts:97-103`).

### Señales construidas vs. stubs

**Verificadas de verdad por código:** existencia/actividad de fracción; NICO si se proporciona y el catálogo tiene NICOs; sectores requeridos; cuota exacta fracción+país; formato de número de pedimento; match 69‑B; temporales por vencer del tenant.

**Stub o incompletas:**

- coincidencia con el Clasificador queda siempre `null`;
- temporales fuera de domicilio queda siempre `0` porque el modelo de datos no lo registra;
- fracción afectada por el decreto 29‑12‑2025 queda `null`;
- la regla de subvaluación no tiene precio de referencia: con cualquier valor presente devuelve 0;
- la cuota ignora productor específico, `status` y fechas de vigencia/expiración;
- NOM usa `Fraction.noms`, dataset reconocido como pendiente de cotejo contra Anexo 2.4.1;
- el formulario no pide NICO;
- fracción, RFC y pedimento son opcionales: puede evaluarse una operación casi vacía y obtener verde si todas las declaraciones se marcan positivas;
- todos los incisos 59‑V se consideran aplicables, incluso la garantía “si aplica”; no existe selección “No aplica”.

Los pesos configurables tienen otro hueco: si existe una sola fila en DB, `getWeights()` deja de usar todos los defaults; factores ausentes caen a cero. El PUT escribe las ocho filas sin transacción. Producción tenía cero filas configuradas, así que hoy usa defaults y el problema todavía no se manifiesta.

### (d) Construido y faltante

**Construido:** 26 reglas, ocho factores, 16 evidencias, motor puro probado, banda bidimensional, fuentes por regla, señales mixtas diferenciadas, persistencia/versionado, historial, pesos SUPERADMIN y lista 69‑B ingestada.

**Parcial o faltante:** datos mínimos obligatorios; actualización vigente 69‑B y degradación efectiva; precios de referencia; vínculo con Clasificador; domicilio de temporales; dataset del decreto; vigencia/productor de cuotas; NOM canónica; “No aplica” en escudo; actualización atómica de pesos; evidencia de calibración/uso. En producción había **0 evaluaciones** al momento de la consulta.

---

## 7. Auditoría de fuentes legales y fechas

### Conclusión directa

**No se puede confirmar que cada dato legal mostrado por ADUANAI tenga hoy fuente oficial + URL + fecha.** El código demuestra lo contrario. Hay cuatro niveles distintos que conviene no confundir:

1. una afirmación tiene una referencia textual, por ejemplo “Art. 54 LA”;
2. existe una URL institucional general para la ley;
3. el registro incluye fecha de publicación/vigencia/cotejo;
4. el pasaje exacto fue cotejado contra la fuente oficial y el dato que disparó la regla también es fiable.

Sólo el Risk Scorer intenta cumplir sistemáticamente los cuatro para el **fundamento jurídico**. Incluso allí, una fuente legal correcta no vuelve verificadas las señales que vienen del usuario, de una lista vencida o de datasets pendientes.

### 7.1 Fuentes maestras comprobadas

Se abrieron o verificaron por HTTP las fuentes oficiales principales usadas en código:

| Fuente | URL oficial usada | Versión/fecha comprobable | Estado en ADUANAI |
|---|---|---|---|
| Ley Aduanera | [PDF Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf) | Última reforma DOF 19‑11‑2025; cantidades actualizadas 27‑12‑2025 | URL válida. Risk la sella; RAG tiene resúmenes y algunos cotejos; Glosa sólo strings. |
| Código Fiscal de la Federación | [PDF Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf) | Última reforma DOF 09‑04‑2026 | URL válida en Risk. No forma parte del seed RAG actual. |
| Ley de Comercio Exterior | [PDF Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LCE.pdf) | Última reforma DOF 01‑05‑2026 | URL válida. Dos resúmenes en corpus. |
| LIVA | [PDF Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf) | Última reforma DOF 12‑11‑2021 | URL válida. Seis documentos RAG; varios usan fecha efectiva 2014, pero no todos tienen metadata completa. |
| LIEPS | [PDF Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LIEPS.pdf) | Última reforma DOF 07‑11‑2025 | URL válida. Art. 15‑A está cotejado, pero su registro no tiene `publishedDate/effectiveDate`. |
| Ley Federal de Derechos | [PDF Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFD.pdf) | Última reforma DOF 07‑11‑2025 | URL válida. Art. 49 incluye publicación/efectividad en seed. |
| RGCE 2026 | [PDF SAT](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf) | Publicación DOF 27‑12‑2025 | PDF válido. El RAG usa también una portada SAT general por fuente. |
| Anexo 10 RGCE 2026 | [PDF SAT](https://www.sat.gob.mx/minisitio/PadronImportadoresExportadores/documentos/DOF_20260114_RGCE-2026_Anexo-10_Fraccion-I.pdf) | DOF 14‑01‑2026 | PDF válido; catálogo sectorial tiene aproximaciones por fracción pendientes. |
| Anexo 22 RGCE 2026 | DOF `codigo=5778300`, 15‑01‑2026 | Fecha declarada y cotejo 02‑07‑2026 en `lib/anexo22.ts` | Aduanas, regímenes, claves y formato viven en código. El endpoint de Glosa no verifica coherencia integral. |
| T‑MEC Cap. 4 | [PDF oficial](https://www.gob.mx/cms/uploads/attachment/file/465788/04ESPReglasdeOrigen.pdf) | Texto oficial del tratado | URL respondió. Art. 4.5 fue cotejado, pero el seed lo sustituye por portal general al persistir. |
| Lista 69‑B | [CSV SAT](http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv) | Producción: corte 31‑12‑2025 | URL válida, pero la ingesta de producción estaba vencida respecto al límite interno de 30 días. |

Para RLA, decreto de tasas y algunas páginas DOF se guardan URLs oficiales específicas en Risk; la herramienta de lectura no pudo extraer directamente algunos HTML de DOF, aunque el repositorio conserva fecha y cotejo documentado en `docs/RISK_SCORER_LEGAL.md`. Este documento no afirma un re‑cotejo independiente artículo por artículo de las 26 citas; afirma que el código contiene el artefacto de cotejo y que las fuentes maestras principales resolvieron.

### 7.2 Estado por módulo

| Módulo/dato | URL oficial | Fecha estructurada | Pasaje/dato validado | Dictamen |
|---|---:|---:|---:|---|
| Fundamento de las 26 reglas Risk | Sí | Sí, `fechaCotejo` | Sí según artefacto legal del repo | **Mejor implementado**. Falta asegurar la actualidad de señales. |
| Corpus RAG activo | 44/44 | `publishedDate` sólo 5/44; 4 sin `effectiveDate` | Mixto: resúmenes + algunos verbatim | **Parcial**. No es un corpus íntegro y versionado. |
| Citas devueltas por Copilot | URL sí | No se devuelve fecha/cotejo | Matcher heurístico | **No garantiza respaldo**. |
| Clasificador: código de fracción | Catálogo versionado | Versión global | Existencia/actividad sí | **Candado estrecho**. No prueba corrección. |
| Clasificador: NICO/RGI/notas/tarifas/RRNA/NOM | No por afirmación | No | No, salvo alertas/padrón separados | **Pendiente**. Puede venir del LLM. |
| Pre‑Glosa: fundamentos | URL inferida en UI para algunas leyes | No | No por regla | **Ámbar `sin_verificar`**. |
| Anexo 22 (`lib/anexo22.ts`) | Sí | Publicación + cotejo en comentario | Catálogo manual cotejado | **Sólido para los campos implementados**. |
| Tarifa `Fraction` | Base Única SNICE incorporada | Snapshot global 30‑03‑2026 | Mezclada con seeds legacy/upserts | **Fuente identificada, estado por fila no sellado**. |
| Precios estimados | Mezcla `DOF`, `SAT`, `internal` | Sí en cada fila | El seed llama “aproximaciones” incluso a DOF | **No todos oficiales**. UI de price-validator distingue internos, Glosa no. |
| Cuotas compensatorias | Fechas/DOF declarados | Sí | Reconstrucción UPCI pendiente | **No tratarlas como corpus canónico completo**. |
| Padrones por fracción | Anexo 10 | Sí a nivel fuente | Cobertura fina pendiente | **Parcial**. |
| NOMs/excepciones | Referencia Acuerdo NOMs | Insuficiente | Consolidado vigente pendiente | **Pendiente**. |
| Precedentes | 0/24 con URL real en corpus sintético original | No | No | **Correctamente apagados**, con bypass de retry por cerrar. |

### 7.3 Datos legales que siguen pendientes de fuente citable

- Textos oficiales de partida y subpartida para que “Los demás” tenga contexto legal.
- Notas legales realmente recuperadas por el Clasificador.
- NICO y tasas preferenciales canonicalizadas por resultado.
- Dataset consolidado vigente del Anexo 2.4.1 para NOMs/excepciones.
- Cobertura completa y fina de los 16 sectores del Anexo 10.
- Reconstrucción de cuotas vigentes desde UPCI, con productor/alcance/fecha.
- Precios estimados: separar explícitamente cifras oficiales de referencias internas y eliminar la apariencia de oficialidad de aproximaciones.
- Corpus real de precedentes TFJA/SCJN/SAT.
- Dataset estructurado de fracciones afectadas por el decreto de tasas 29‑12‑2025.
- Base estadística para “aduana de alto riesgo”, “fracción típicamente china” y porcentajes de Glosa.

---

## 8. El resto del producto

Los cuatro módulos no viven aislados. Éste es el mapa de capacidades adicionales que completan el flujo operativo.

| Área | Archivos principales | Qué está construido | Límite relevante |
|---|---|---|---|
| Auth/tenancy | `routes/auth.ts`, `middlewares/auth.ts`, `services/permissions.ts` | Registro/login, verificación, JWT, roles, invitaciones, permisos granulares | Refresh token no está cableado en cliente; aislamiento depende de cada query. |
| Cotizador | `routes/quote.ts`, `services/quoter.ts`, `quoter-multi.ts`, `exchange-rate.ts` | Cotiza una o varias partidas, IGI/DTA/IVA/IEPS/ISAN/cuotas y escenarios | La precisión depende de catálogo/cuotas/tratados; hay pendientes de versionado retroactivo. |
| Expediente/documentos | `routes/operations.ts`, `documents.ts`, `services/expediente.ts`, `document-extractor.ts` | Operaciones, documentos base64, extracción IA, completitud y prevalidación | “Editar documento” está marcado próximamente; no hay integración directa VUCEM. |
| Prevalidador | `routes/prevalidate.ts`, `prevalidator.ts`, `prevalidator-v2.ts`, `lib/anexo22.ts` | Reglas formales Anexo 22 y análisis de valor complementario | No equivale al validador oficial del SAT ni transmite pedimentos. |
| Inventario IMMEX | `routes/inventory.ts`, `services/inventory*.ts` | Temporales, descargos, reportes Anexo 24/30, BOM y alertas | Parte de alertas/resúmenes usa IA; exactitud depende de captura y datasets. |
| Fiscal | `routes/fiscal.ts`, `services/fiscal-guardian.ts`, `fiscal-ledger.ts` | Créditos, aplicaciones, garantías, certificación y escenarios | Recomendaciones IA no son cálculo normativo canónico por sí mismas. |
| MVE/COVE | `routes/mve.ts`, `services/auto-mve.ts` | Borrador, extracción de factura, validación/auditoría y COVE | Genera artefactos; no transmite directamente a VUCEM. |
| Logística | `routes/logistics.ts`, `services/logistics-optimizer.ts` | Planes de carga, cubicaje y recomendaciones | Es optimización heurística, no un solver certificado. |
| Origen | `routes/origin.ts`, `services/origin-analyzer.ts`, `origin-certificate.ts` | Reglas de origen, RVC y certificados | Cobertura depende de `origin-rules.ts`; no todos los tratados/productos tienen regla estructurada. |
| Actualizaciones | `routes/updater.ts`, `services/tigie-updater.ts` | Analiza texto de decreto, crea batch y puede notificar/aplicar bajo guards | No hay watchdog DOF automático real; la aplicación global está deshabilitada por flag hasta rediseño. |
| Auditoría/trazabilidad | `services/audit-service.ts`, `routes/audit.ts`, `traceability.ts`, `timestamp.ts` | Cadena hash serializada, reportes, firmas/hashes y OpenTimestamps | El anclaje prueba integridad/tiempo, no corrección jurídica del contenido. |
| Backups/monitoring | `services/backup.ts`, `routes/backups.ts`, `monitoring.ts` | Dumps cifrados a S3/R2 configurable, restauración local probada, logs/incidentes | Requiere variables y destino persistente configurados; timers están dentro del proceso web. |
| Administración | `pages/Admin/*`, `routes/admin.ts` y subrouters | Empresas, pilotos, conocimiento, corpus, glosa, seguridad, backups, etc. | El frontend oculta por rol, pero el control material debe estar en cada endpoint. |

### Stubs, demos y superficies incompletas claramente identificadas

- El panel “Regulatorio hoy” del Dashboard usa `MOCK_WATCHDOG=true` y cuatro alertas hardcodeadas; el backend watchdog DOF no existe (`Dashboard.tsx:1-41,235-252`).
- `dof-alerts.ts` contiene ejemplos usados en demos, no una ingesta regulatoria viva.
- Precedentes se cierran a vacío porque el corpus es sintético.
- El analizador de decretos funciona si el usuario pega texto; no monitorea DOF por sí mismo.
- Registro profesional `professional-registry.ts` contiene patentes placeholder documentadas. No debe presentarse como verificación oficial CAAAREM.
- WhatsApp de nuevos leads es un `console.log` placeholder (`routes/leads.ts:147-155`).
- Blog y edición de documento están marcados “próximamente”.
- La web pública dice honestamente que produce archivos listos para VUCEM y que la integración directa todavía está en construcción (`Public/About.tsx:166`).
- Los datos demo llevan `isDemoData` y el frontend muestra banner/etiquetas; eso sí está bien señalizado.

---

## 9. Qué significan realmente los candados de integridad

| Candado | Qué sí hace | Cómo puede rodearse o qué no cubre |
|---|---|---|
| `validateFraction` / `enforceCatalogFraction` | Exige código activo de ocho dígitos antes de devolver Clasificador | No valida candidato, NICO, exactitud, tarifas, RRNA, NOM, RGI o fuente. |
| `PRECEDENT_CORPUS_VERIFIED=false` | Lookup y rutas normales de precedentes devuelven vacío | Retry del Clasificador puede reemplazar el objeto después de limpiarlo; Knowledge global no verificado aún influye. |
| `assertCorpusEmbedding` | Protege seed y endpoints admin contra fallback/dimensión errónea | No es constraint DB; scripts directos pueden no llamarlo y un cambio de contenido puede dejar embedding viejo. |
| Gate del RAG | Obliga abstención con cero docs o un doc débil | Es prompt; respuesta alucinada sólo genera warning. Prompt/postprocesador contienen ley hardcodeada. |
| Fuentes del Risk Scorer | Cada regla lleva URL y fecha de cotejo | La señal puede ser declarada, stub, dataset pendiente o lista vencida; una buena cita no valida el hecho. |
| Sellos UI | Degradan a ámbar cuando faltan metadatos | Son presentación. No impiden que texto LLM aparezca; dependen de que el backend entregue metadata correcta. |
| Audit hash/OTS | Detecta alteración posterior y puede anclar tiempo | No prueba que el dato original fuera correcto ni que su fuente fuera vigente. |

## 10. Lectura honesta de madurez

ADUANAI ya es un producto integrado y desplegable, no un conjunto de mockups: hay auth, tenancy, persistencia, flujos operativos, reportes, auditoría, migrations, backups y cuatro experiencias centrales conectadas. Un agente aduanal puede usarlo hoy para organizar trabajo, obtener candidatos, revisar señales y construir expedientes.

Lo que todavía impide llamarlo una autoridad autónoma de cumplimiento es la distancia entre **existencia técnica** y **defendibilidad jurídica**:

- el Clasificador valida existencia, no la totalidad de la conclusión;
- el Copilot tiene buenas defensas pero puede devolver una respuesta no respaldada;
- Pre‑Glosa presenta heurísticas como porcentajes precisos y falla abierto ante dependencias;
- Risk tiene la mejor arquitectura de autoridad, pero varias señales son stubs o están desactualizadas;
- algunos datasets críticos (NOM, padrones finos, UPCI, precedentes) siguen pendientes.

La posición correcta hoy es: **asistente de prevención y preparación documental con supervisión profesional**, no sustituto del criterio del agente ni fuente legal primaria.

---

# Capa simple — Cómo explicárselo a un cliente

## Clasificador

“Tú describes la mercancía con material, uso, medidas y características. ADUANAI busca en el catálogo TIGIE vigente las fracciones más cercanas, pide a una IA que compare las opciones y hace una segunda revisión. Antes de mostrarte el resultado comprueba que la fracción exista y esté activa. Te entrega alternativas, alertas y un expediente para revisión.”

**Problema que resuelve:** reduce el universo de búsqueda y documenta una primera hipótesis.

**Lo que no debe prometerse:** que el 61.6% sea exactitud universal, que las RGI se ejecuten como algoritmo jurídico o que NICO/tarifas/NOM queden automáticamente validados. La decisión debe revisarla el agente.

## Consultor Legal

“Haces una pregunta y ADUANAI busca primero en su biblioteca legal. Si encuentra material suficientemente relacionado, redacta una respuesta y te muestra las fuentes oficiales consultadas. Si no encuentra soporte, está diseñado para decirlo.”

**Problema que resuelve:** acelera la localización y explicación de normas dispersas.

**Lo que no debe prometerse:** que cada frase esté criptográficamente unida al pasaje que la sostiene. Hoy las tarjetas son documentos recuperados y hay un detector de posibles citas inventadas, pero una respuesta con warning todavía puede mostrarse.

## Pre‑Glosa

“Antes de transmitir, capturas datos básicos de una operación. ADUANAI revisa señales de valor, origen, cuota, padrón, NOM, clasificación y régimen; te devuelve hallazgos priorizados y un reporte imprimible con acciones sugeridas.”

**Problema que resuelve:** checklist preventivo rápido para detectar señales obvias.

**Lo que no debe prometerse:** revisión exhaustiva de los seis dominios del pedimento, probabilidad real del SAT o validación completa de identificadores/contribuciones. Si una fuente interna falla, el reporte hoy puede no avisarlo.

## Riesgo de Responsabilidad Solidaria

“ADUANAI separa dos preguntas que normalmente se mezclan: cuánto riesgo trae la operación y qué evidencia tienes para defender tu actuación. Evalúa 26 reglas, revisa señales del sistema —como fracción, padrón, cuotas, temporales y 69‑B— y combina eso con tu checklist documental. El resultado siempre muestra exposición y escudo por separado.”

**Problema que resuelve:** convierte obligaciones amplias del agente/agencia en un mapa accionable de riesgo y evidencia.

**Lo que no debe prometerse:** que todas las señales estén verificadas o actuales. La lista 69‑B de producción estaba al 31‑12‑2025; varios checks de v1 todavía no tienen dato estructurado.

## El resto de la plataforma, en lenguaje comercial preciso

“Además, ADUANAI concentra expediente, prevalidación, cotización, inventario IMMEX, créditos IVA/IEPS, MVE/COVE, origen y auditoría. Ayuda a preparar archivos y decisiones, conserva trazabilidad y separa datos demo. No transmite hoy directamente a VUCEM y algunos monitores/datasets regulatorios siguen en construcción.”

---

# Resumen de una página

ADUANAI funciona como una aplicación web React conectada a una API Express y PostgreSQL. El frontend llama `/api`; el backend autentica al usuario y tenant, consulta catálogos, ejecuta reglas o IA, guarda el resultado y registra auditoría. Docker obliga a compilar TypeScript de servidor y cliente antes del deploy y aplica migraciones antes de arrancar.

El **Clasificador** es búsqueda léxica + Sonnet 4.6 + verificador Haiku + candado de existencia. No usa embeddings, no usa pgvector y no tiene un motor RGI determinista. El 61.6% es una línea base de 99 casos del set interno; no mide NICO, fuentes, RGI, tarifas o regulaciones y no es una medición limpia del HEAD exacto. La fracción final debe existir, pero otros campos legales siguen pudiendo venir del LLM sin reconciliación canónica.

El **Consultor Legal** sí hace RAG: genera embedding, carga documentos activos, calcula coseno en Node, mezcla keywords, reordena con Haiku y aplica un gate de abstención. Producción tenía 44 documentos activos a 1024 dimensiones. No hay pgvector. Su principio “cita o calla” es una disciplina útil, pero no una garantía: el prompt y un postprocesador contienen datos legales, las citas alucinadas sólo producen warning y, si no detecta una cita, adjunta documentos top como fuentes.

La **Pre‑Glosa** es un simulador heurístico para una fracción/operación, no un revisor exhaustivo de pedimentos. Tiene 15 reglas sembradas y 14 checks ejecutables; cinco categorías formales, no seis dominios completos. Sus porcentajes son fórmulas sobre el score, no probabilidades calibradas. Varias consultas fallan en silencio y el tipo de cambio de persistencia puede caer a 17 sin fuente.

El **Risk Scorer** es el módulo más sólido en separación de autoridad: 26 reglas deterministas, ocho factores, 16 evidencias y fuente/URL/fecha por regla. Entrega exposición y escudo por separado. Pero varias señales son stubs, se puede evaluar casi sin datos y la lista 69‑B de 14,054 RFC tenía corte 31‑12‑2025; el código detecta que está vieja pero aun así la muestra como verificada.

El router **Sonnet 5 → Opus 4.8 con umbral 0.75 no existe en runtime**. Sólo está en `files (2)/`, un paquete no rastreado cuyo README todavía pide copiarlo al backend. El producto activo usa Sonnet 4.6/Haiku 4.5 y el retry del Clasificador vuelve a Sonnet.

En fuentes legales, Risk tiene el patrón correcto. El RAG tiene URLs para los 44 activos, pero sólo cinco fechas de publicación y cuatro sin fecha efectiva; además, el seed declara que muchos textos son resúmenes. Clasificador y Pre‑Glosa todavía no entregan fuente+fecha verificable por cada dato. NOMs, cobertura fina de padrones, UPCI, precedentes y textos padre TIGIE siguen pendientes.

La forma honesta de venderlo hoy es: **plataforma de prevención, organización y preparación documental asistida**, con supervisión de un profesional. No debe venderse todavía como autoridad legal autónoma ni como sustituto del agente aduanal.

---

# ADDENDUM — Qué cambió desde la Frontera Canónica (corte 19-ago-2026)

**Este documento describe el sistema al 12-jul-2026 (`afde88f`). Entre el 18 y
19-ago-2026 se ejecutaron las Fases 2, 1a, 1b y 3a de la Frontera Canónica de
Datos Legales (`docs/FRONTERA_CANONICA_DESIGN.md`, aprobada con adenda), que
CIERRAN los tres hallazgos centrales de esta radiografía. Producción corre
`main` ≥ `54fc96e`. Lo de abajo SUPERSEDE a las secciones citadas; el resto de
la radiografía sigue siendo una descripción razonable del sistema.**

## Hallazgo (a) — Clasificador sin reconciliación canónica: CERRADO

Supersede §3(c) "candados", §7.2 fila "NICO/RGI/notas/tarifas/RRNA/NOM" y §9.

- **Productor canónico** (`services/frontera-canonica.ts`): dada una fracción
  devuelve NICO, tarifas (NMF/preferenciales/IEPS), NOMs, RRNA y padrón como
  `DatoLegal<T>` (`lib/dato-legal.ts`: valor + origen + fuente + fechaCotejo +
  estado) desde catálogo/tablas, con registro de autoridad honesto (origen
  catálogo NO implica verificado). Jamás llama a un LLM; sin dato →
  `no_disponible`; consulta caída → `no_revisado` (test lo garantiza).
- **Reconciliación EN LA RUTA** (`routes/classify.ts`, ambos endpoints): esos
  campos se SUSTITUYEN por los canónicos; lo que el LLM dijera distinto queda
  como discrepancia en telemetría (`classifier_canon_discrepancy`) y
  trazabilidad — nunca en la UI. Alternativas inexistentes se eliminan.
  Alertas y regulaciones ya no pueden contradecirse (misma fuente).
- **Censo previo (medido, 100/100 casos)**: 100% de los expedientes contenía
  al menos un dato LLM sin respaldo; el NMF mostrado era ERRÓNEO en 20.9%.
  Artefacto: `docs/REPORTE-DISCREPANCIAS-1A.md`.
- **Fase 1b**: el prompt ya NO pide nico/tariffs/regulations. Gate medido con
  el harness oficial: top-1 61/99 = 61.6%, idéntico a la línea base (pareado
  +1/−1, ruido). La cifra 61.6% de esta radiografía SIGUE siendo la vigente.
- **Confianza**: sigue sin estar calibrada — por eso ya NO se muestra como
  número prominente; solo como detalle técnico etiquetado (regla de
  aprobación #2). `Classifier.tsx` sella verde desde `datosCanonicos` (el GAP
  documentado en su encabezado quedó cerrado) y muestra la cadena jerárquica
  partida › subpartida › fracción con los textos REALES del catálogo
  (backfill verbatim `20260813193051`, también en prod).

## Hallazgo (b) — Copilot: cita alucinada solo warning + fallback top-3: CERRADO (mínimo 3a)

Supersede §4 "La disciplina cita-o-calla" puntos 3-6 y §9 fila "Gate del RAG".

- **Matcher por clave normalizada** (`services/citas-legales.ts`): una cita
  respalda ⟺ {tipo, número, cuerpo} coincide EXACTO con un doc recuperado
  ("Art. 54 LA" ≠ "Art. 54 LFD" ≠ "Art. 54-A LA"). El matcher por tokens
  (§4: "el matcher usa tokens muy amplios") fue eliminado.
- **Política `COPILOT_CITA_ESTRICTA`** (hoy en 'sombra' midiendo una semana):
  en 'estricta', cita no respaldada → UNA regeneración correctiva → si
  persiste, el usuario ve la abstención canónica y la respuesta se guarda en
  `CopilotConsult.respuestaDescartada` (jamás se muestra).
- **El fallback top-3 quedó ELIMINADO en todos los modos**: `citations` puede
  ser vacío; lo recuperado-no-citado va aparte como `documentosConsultados`.
- **La confianza es determinista** (el `Math.random()` de §4 murió) y la
  persistencia es upsert por hash (respuesta idéntica ya no revienta el
  unique). PENDIENTE (3b, bloqueada por gate): la ley hardcodeada del prompt
  (secciones A-D) y `injectIMMEXCertificationNote` SIGUEN como los describe
  esta radiografía — su salida al corpus exige un set de evaluación escrito y
  corrido en "antes".

## Hallazgo (c) — Pre-Glosa falla abierto: CERRADO

Supersede §5 "Fallos abiertos y datos heurísticos" y §9 filas de Glosa.

- **Fail-closed por dominio**: las 6 consultas (precio estimado, histórico,
  cuotas, padrones, NOMs, reclasificación) registran `revisado`/`no_revisado`
  con motivo; revisión incompleta → `riskLevelPresentacion='indeterminado'`
  (decidido en backend), banner en reporte e impresión — el "reporte
  tranquilizador" es imposible. Cero `catch` silenciosos (test a nivel fuente).
- **El TC de respaldo `* 17` murió** (y los tres `* 18` de alert-generator):
  todo TC sale del servicio Banxico/DOF con procedencia (`tipoCambioMXN()`);
  sin TC → el monto se omite o queda null, nunca una constante (test
  anti-reincidencia sobre todo services/ y routes/).
- `validateFraction` a la entrada; `declaresNOMs` ya no salta el lookup;
  fundamentos como `DatoLegal` (verde por regla al cotejarse); la versión
  normativa se eco-devuelve por corrida (el espejo `corpus-version.ts` del
  cliente dejó de usarse en Glosa).

## Otros cambios relevantes

- `SelloVerificacion` ganó el estado `no_revisado` (rojo).
- NICOs: prod tiene 8,140 fracciones con `nicos[]` (1,574 con >1);
  `scripts/cargar-nicos.ts` carga verbatim del .xlsb (excluido de la imagen
  por `.dockerignore`). Con la tabla poblada el NICO sella verde; si solo hay
  extracto, `sin_verificar` con nota.
- `FractionRegulation` degradada a `sin_verificar` (evidencia de supersesión
  NOM-004-SE-2006 vs 2021) — DEFERRED #22 (cotejo Anexo 2.4.1 por fila) es el
  desbloqueador del verde; DEFERRED #23 (textos padre) quedó CERRADO en su
  parte de datos por el backfill.
- Crédito/cuota Anthropic agotados → 503 con causa clara (antes 500 mudo).
- Migraciones reales post-baseline aplicadas en prod: `20260813193051`,
  `20260818000000`, `20260819010000` — la "deuda P2 de migración única" quedó
  estrenada sin incidente.

**Sigue pendiente (sin cambio vs esta radiografía):** calibración de
confianzas/probabilidades, motor RGI determinista, pgvector, corpus íntegro
del RAG (resúmenes), datasets UPCI/Anexo 2.4.1/padrones finos, precedentes,
hipótesis H del clasificador (rama `feat/clasificador-jerarquico`, holdout
sellado sin veredicto), Fase 3b y Fase 4 de la frontera.
