# Cómo funciona ADUANAI — estado real del sistema

**Corte técnico:** 25 de agosto de 2026 (reposicionamiento: del cronómetro al escudo)

**Código revisado:** rama de honestidad sobre `b40d8d2` — commit `addce42` (About.tsx §11, disclaimers de runtime, motor 69‑B, guard de afirmaciones)

**Producción observada:** Railway `kanaduana`, deploy `SUCCESS` (25‑ago). Verificado contra lo SERVIDO: bundle público sin las frases retiradas (17/17 en cero), disclaimer nuevo en dist, y evaluación Risk real con lista 69‑B vencida (237 días) → `no_evaluado`, 0 puntos, sin bandera. Tabla 69‑B re‑ingerida con dedup por fecha real (14,054 RFC, 100% con fecha parseable).

**Alcance:** `client/`, `server/`, Prisma, migraciones, seeds, pruebas, Docker/Railway y consultas de solo lectura a producción.

Este documento describe lo que está ejecutándose, no sólo lo que fue diseñado. Si un comentario, diseño o texto comercial contradice el runtime, manda el código ejecutable. Las fotografías anteriores del 12 de julio y el Addendum del 19 de agosto permanecen en el historial de Git; ya no se mezclan con la especificación vigente.

## Cómo leer los estados

- **Implementado:** existe en código y forma parte del build.
- **Activo:** además está habilitado/configurado en producción.
- **Verificado:** tiene prueba o evidencia de producción suficiente para la afirmación concreta.
- **Parcial:** funciona, pero su cobertura, fuente o interfaz no completa el contrato ideal.
- **Pendiente:** no está conectado, está apagado o sólo existe como propuesta.

Que algo esté implementado no significa que esté activo; que esté activo no significa que esté jurídicamente verificado; y una salida determinista no es necesariamente una salida correcta.

---

## 1. Resumen ejecutivo

ADUANAI es una aplicación integrada y desplegada: la SPA React y la API Express se sirven desde el mismo contenedor Node; PostgreSQL es un servicio externo accedido con Prisma y `DATABASE_URL`. Tiene autenticación, permisos, persistencia, auditoría, clasificación, cotización, expediente, prevalidación, inventario IMMEX, fiscal, MVE/COVE, origen, logística, alertas y administración.

La lectura correcta de sus cuatro experiencias principales es:

1. **Clasificador:** reduce el universo TIGIE con búsqueda léxica, usa Sonnet 4.6 para proponer y Haiku 4.5 para verificar, comprueba que la fracción exista y después sustituye datos legales puntuales por el catálogo canónico. No ejecuta las RGI como algoritmo jurídico.
2. **Copilot:** hace RAG con embeddings y un corpus legal mixto. Tiene un modo estricto capaz de regenerar o abstenerse ante citas no respaldadas, pero producción sigue en modo sombra; hoy una respuesta advertida todavía puede mostrarse.
3. **Pre‑Glosa:** aplica reglas y heurísticas sin LLM. Registra dependencias que fallan como `no_revisado`, pero no puede distinguir siempre entre “consulta completa sin hallazgos” y “catálogo incompleto sin datos”. Sus porcentajes no están calibrados con outcomes reales.
4. **Risk Scorer:** ejecuta 26 reglas deterministas y separa exposición de escudo documental. Es la mejor implementación de fundamento jurídico estructurado; desde el 25‑ago una señal no disponible (p. ej. lista 69‑B vencida) no suma puntos ni bandera — queda `no_evaluado` con motivo visible (§7.3). Algunas señales siguen incompletas.

La posición defendible del producto es: **plataforma de prevención, organización y preparación documental asistida, con supervisión profesional**. No es una autoridad legal autónoma ni sustituye el criterio del agente aduanal.

---

## 2. Fotografía verificable de producción

Estas cifras cambian con el uso y deben leerse con el corte indicado arriba.

| Dato | Producción al corte |
|---|---:|
| Modelos Prisma en el esquema | 85 |
| Archivos de rutas Express | 45 |
| Pantallas React en `client/src/pages` | 62 |
| Fracciones en `Fraction` | 8,256 totales; 8,255 activas |
| Fracciones con `nicos[]` | 8,140; 1,574 tienen más de un NICO |
| Documentos legales | 1,174 totales; 1,171 activos |
| Corpus activo | 1,127 `texto_integro` + 44 `resumen` |
| Metadata del corpus activo | 1,171 con URL; 1,132 con publicación; 1,167 con vigencia; 1,125 con cotejo; 0 con expiración |
| Dimensión de embeddings del corpus | 1,024 en los 1,171 activos |
| Clasificaciones persistidas | 224 |
| Consultas Copilot | 78: 58 legacy/sin modo y 20 en sombra |
| Copilot con citas no respaldadas | 8; 0 regeneradas y 0 degradadas |
| Reglas Pre‑Glosa activas | 15; 0 con fuente+URL+fecha completas |
| Simulaciones Pre‑Glosa | 5; 0 con outcome real |
| Evaluaciones Risk | 6; 0 filas de pesos configurables |
| Lista SAT 69‑B | 14,054 RFC; corte declarado por el CSV: 31‑12‑2025 |
| `8544.42.01` activa | 0; fue retirada por no existir en la tarifa vigente |

Configuración operativa relevante:

- `COPILOT_CITA_ESTRICTA` está sin definir; el default efectivo es `sombra`.
- `TENANT_GUARD_STRICT` está sin definir en prod; la guarda opera en modo advertencia (incidentes al logger/SystemLog desde Bloque 3). Pendiente de operación: fijar `TENANT_GUARD_STRICT=1` en Railway — el censo de cruces legítimos ya está declarado con `sinGuardaDeTenant()` (Bloque 3, 26-ago-2026).
- `TIGIE_APPLY_ENABLED` está sin definir; la aplicación automática de batches TIGIE está deshabilitada.
- `TARIFA_VIGILANTE_HORAS` está sin definir; el vigilante usa su intervalo default de 24 horas.
- El catálogo tarifario declara Base Única SNICE 30‑03‑2026 más el cotejo/aplicación de Tarifa 15, DOF 23‑04‑2026; `cotejoDate=2026-08-19`.
- La lista 69‑B excede el máximo interno de 30 días y debe tratarse como vencida.

---

## 3. Arquitectura y despliegue

### 3.1 Componentes

| Ruta | Función real |
|---|---|
| `client/` | SPA React 19 + Vite. El estado de pantalla vive principalmente en `useState`/`useEffect`. |
| `server/` | API Express 5, servicios de negocio, integraciones IA y Prisma 7 sobre PostgreSQL. |
| `server/src/index.ts` | Composition root: seguridad HTTP, rutas, SPA, timers y tareas de arranque. |
| `server/prisma/schema.prisma` | 85 modelos de negocio y catálogos. |
| `Dockerfile` | Compila servidor y cliente, ejecuta gates, aplica migraciones y arranca la API. |
| `docs/` | Diseño, runbooks y esta descripción operativa; no reemplaza al runtime. |
| `files (2)/` | Directorio no rastreado con propuestas de agentes/router. No entra al build ni a producción. |

El Dockerfile actual:

1. instala dependencias y genera Prisma;
2. compila el servidor;
3. ejecuta el guard de la clase de campos numéricos;
4. hace typecheck y build del cliente;
5. copia `client/dist` a `server/public`;
6. al arrancar ejecuta `prisma migrate deploy`;
7. ejecuta el verificador anti‑“aduana shopping”;
8. inicia `node dist/index.js` sólo si los pasos anteriores pasan.

Express sirve la API y la SPA desde el mismo proceso. Limpiezas, alertas, backups, timestamps, refresh de tipo de cambio y vigilancia tarifaria son timers **in-process**, no trabajos de una plataforma de colas independiente.

### 3.2 Seguridad HTTP y sesión

El servidor aplica Helmet/CSP, CORS, límites de body, request ID, logging, rate limits, bloqueo de IP, auditoría y normalización de errores. La autenticación valida el JWT, vuelve a leer usuario/tenant y expone `userId`, `tenantId` y rol a la ruta.

El cliente guarda el access token en `localStorage`. El servidor puede emitir refresh token, pero el frontend no tiene un ciclo automático completo de renovación; ante `401` elimina la sesión y redirige a login.

### 3.3 Aislamiento multi‑tenant

La barrera principal sigue siendo el scope explícito `tenantId` en cada consulta. Hay una extensión Prisma de defensa en profundidad en `server/src/lib/tenant-guard.ts`:

- intercepta `findUnique`, `findUniqueOrThrow`, `findFirst` y `findFirstOrThrow` para una lista de modelos multi‑tenant;
- con `TENANT_GUARD_STRICT=1` lanza si falta `tenantId`;
- sin el flag registra el incidente (reporte inyectado desde `index.ts` → `logger.error` → `SystemLog`, con contador `contadorDeIncidentes()`) y deja pasar;
- los cruces legítimos usan `sinGuardaDeTenant()` — hoy 9 declarados: verificación pública por hash (classify, audit, traceability, verifyConsult), por número de certificado (origin), por token de invitación (auth), DemoAccount en admin SUPERADMIN, runner de jobs de clasificación y extractor de documentos;
- censo (test `tenant-guard`): todo modelo del schema con `tenantId` obligatorio está en la lista; los de `tenantId` opcional (ClassificationKnowledge: filas globales de staff) se scopean en el servicio.

No hay Row Level Security de PostgreSQL. La guarda no cubre todos los modelos —por diseño excluye `User`, y hoy tampoco lista `ClassificationJob`—, ni `findMany`, escrituras o SQL crudo. Por ello es defensa parcial, no aislamiento universal de base de datos.

Las rutas principales revisadas sí acotan por tenant. El feedback del Clasificador primero verifica `{id, tenantId}`; el IDOR descrito por la radiografía histórica está cerrado. Sin embargo, un feedback negativo propio puede crear `ClassificationKnowledge` global y no verificado, consumido después con una penalización limitada.

Copilot conserva un riesgo distinto: `CopilotConsult.consultHash` es único global, pero el hash no incluye tenant/usuario. Dos consultas deterministas idénticas de empresas distintas pueden colisionar; el upsert conserva al propietario original y el feedback actualiza sólo por hash. Esa atribución cross‑tenant sigue abierta.

### 3.4 Persistencia y vectores

Prisma usa `@prisma/adapter-pg`. No hay pgvector, extensión `vector`, IVFFlat/HNSW ni operador `<=>`. `LegalDocument.embedding` es `Float[]`; Copilot carga candidatos y calcula similitud coseno en Node.

El catálogo tarifario y el corpus legal son datos globales compartidos. Clasificaciones, operaciones, documentos, simulaciones, evaluaciones, inventarios y auditoría se asocian a tenant.

### 3.5 Modelos de IA activos

| Flujo | Modelo predeterminado | Papel |
|---|---|---|
| Clasificador, primera pasada | Claude Sonnet 4.6 | Elegir entre candidatos TIGIE |
| Clasificador, verificador | Claude Haiku 4.5 | Revisar entre opciones de la subpartida sugerida y subpartidas alternativas |
| Clasificador, retry `<70` | Claude Sonnet 4.6 | Segundo intento con el mismo tier fuerte |
| Copilot | Claude Haiku 4.5 | Redactar con contexto RAG |
| Reranker RAG | Claude Haiku 4.5 | Reordenar candidatos legales |
| MVE y extracción documental | Claude Sonnet 4.6 | Extraer/auditar estructura |
| Pre‑Glosa y Risk | Ninguno | Reglas y heurísticas |

`server/src/lib/llm.ts` también permite Gemini para servicios que usan ese wrapper. Varios servicios llaman al SDK de Anthropic directamente y no obedecen el switch global.

El supuesto router “Sonnet 5 → Opus 4.8 si confianza <0.75” **no existe en runtime**. Sólo aparece en `files (2)/`, que no está rastreado ni cableado.

---

## 4. Clasificador arancelario

### 4.1 Qué hace

Recibe una descripción de mercancía, recupera candidatos del catálogo, pide a IA compararlos, verifica el código, reconcilia datos legales puntuales y guarda un expediente para revisión/aprobación.

La entrada autenticada exige:

- al menos una letra;
- ocho caracteres alfanuméricos útiles;
- dos palabras de tres letras o más.

Una entrada insuficiente falla con `422` antes de crear el job. La demo además limita la descripción a 200 caracteres; la ruta autenticada no tiene un máximo específico equivalente.

### 4.2 Flujo autenticado vigente

1. `POST /api/classify` exige autenticación y permiso `classifier:create`.
2. Crea un `ClassificationJob` y responde `202 {jobId}`. Un usuario sólo puede tener un job `queued|running` por tenant.
3. La UI guarda borrador/job con namespace por usuario y consulta `GET /api/classify/jobs/:id`.
4. El runner ejecuta retrieval → Sonnet → verificador Haiku → retry opcional → candado → reconciliación → alertas → trazabilidad → persistencia.
5. El payload final queda en `ClassificationJob.result`; la UI puede recuperarlo al volver al módulo.

Los jobs se persisten, pero corren dentro del proceso web. Tienen watchdog de 15 minutos y un objetivo de retención de siete días; la purga ocurre al crear otro job o al arrancar el servidor, por lo que no es un TTL exacto. Un deploy/reinicio marca los jobs heredados como `INTERRUMPIDO`; no existe un worker externo que continúe el cómputo.

La ruta `/api/classify/demo` sigue siendo síncrona y aplica la misma reconciliación antes de responder.

### 4.3 Retrieval y razonamiento

- Recuperación léxica en `Fraction`: keywords, frontera de palabra y ponderación tipo IDF.
- Hasta ocho términos; top 30 inicial; ampliación por partidas y capítulos más votados.
- Sin embeddings ni pgvector.
- Precheck determinista sólo para exclusiones numéricas.
- Sonnet 4.6 a temperatura 0.
- Haiku 4.5 verifica contra opciones cercanas.
- Si `confidence <70`, el retry vuelve a Sonnet 4.6.
- La respuesta se extrae/repara como JSON; no hay structured output ni un esquema Zod integral para toda la forma.

Las seis RGI están en el prompt. No hay una máquina de estados que lea y aplique notas, partidas y reglas secuencialmente de forma determinista. Explicación, fundamento, RGI, análisis por uso y confianza siguen siendo texto/modelado del LLM.

### 4.4 Frontera canónica

Después del LLM, `reconciliarClasificacion()` y `datosCanonicosFraccion()` aplican estas reglas:

- la fracción principal debe existir y estar activa;
- su descripción se sustituye por la del catálogo;
- NICO, NMF, preferencias, IEPS, NOM, RRNA y padrón se entregan en `datosCanonicos` con valor, origen y estado; fuente, fecha y nota cuando correspondan;
- el resultado legacy sustituye NICO, NMF, preferencias, NOM, RRNA y padrón por los valores canónicos disponibles;
- alternativas inexistentes/inactivas se eliminan y las supervivientes reciben descripción canónica;
- diferencias LLM↔catálogo se registran en telemetría, no se presentan como dato legal.

Estados importantes:

- `verificado`: la fuente/cotejo requerido existe para ese campo;
- `sin_verificar`: existe un dato cargado, pero su cotejo por fila no permite elevarlo;
- `no_disponible`: el catálogo no aporta valor; **no prueba que legalmente no aplique nada**;
- `no_revisado`: una consulta protegida falló.

NOM/RRNA continúan deliberadamente `sin_verificar` o `no_disponible` mientras falte el cotejo fino del Anexo 2.4.1 y tablas relacionadas. La frontera evita relleno del LLM; no convierte un dataset incompleto en uno exhaustivo.

### 4.5 Garantías y límites

Sí está garantizado en una clasificación terminada:

- código principal activo de ocho dígitos;
- descripción canónica;
- sustitución de los campos legales cubiertos por la frontera;
- alternativas existentes;
- versiones, hashes, modelo, trazabilidad y resultado persistido;
- scope por tenant del job, historial y aprobación.

No está garantizado:

- que la fracción sea jurídicamente correcta;
- que pertenezca al conjunto candidato entregado al modelo —esa restricción sigue sólo en el prompt—;
- que el catálogo legacy completo esté cotejado fila por fila;
- que RGI, notas, explicación o fundamento estén respaldados por un pasaje recuperado;
- que la confianza corresponda a una probabilidad real;
- que `no_disponible` signifique “no aplica”.

El retry puede reemplazar un objeto normalizado por JSON crudo. La reconciliación posterior impide que los campos canónicos del LLM sobrevivan, pero una forma incompleta todavía puede hacer fallar el job.

El retry también ocurre después de vaciar precedentes no verificados; puede reintroducir `useBasedAnalysis.precedents` o forma LLM no normalizada antes de que sólo se reaplique el candado de fracción. La frontera protege sus campos canónicos, no ese texto cualitativo.

La lectura base de `Fraction` y de versiones activas no está protegida por el wrapper campo‑por‑campo: si falla, el job completo termina en error, no en un resultado parcial `no_revisado`.

La migración actual retiró `8544.42.01`. Corregido (misión cierre 25‑ago): `src/lib/retiradas-tigie.ts` es la fuente única de retiradas cotejadas y todo camino de seed que crea fracciones (`seed/index.ts`, `seed-full.ts`) fija `active` vía `activeParaSeed` en create Y update — una DB limpia ya no la resucita, y el precio estimado del seed se reapuntó a `8544.42.99` como hizo la migración en prod. Regresión: `seed-retiradas.test.ts`. La migración documenta otras 12 fracciones legacy aún pendientes de cotejo (siguen activas hasta cotejarse; al retirarse por migración se agregan a la lista en el mismo commit).

### 4.6 Medición vigente

El artefacto `server/src/tests/medicion-tanda-8544-2026-08-24.json` contiene 99 casos:

| Métrica | Resultado |
|---|---:|
| Top‑1 exacto | 61/99 = 61.6% |
| Capítulo correcto | 81/99 = 81.8% |
| Casos ejecutados en vivo | 43 |
| Casos reconstruidos del log de la misma corrida/código | 56 |
| Top‑3 | Incompleto; sólo 78 casos tienen dato |

El harness llama `classifyProduct()` directamente. No mide la ruta asíncrona, reconciliación, NICO, fuentes, tarifas, regulaciones, persistencia o aprobación. El set fue usado durante el tuning y no es un holdout externo. La confianza sigue sin calibrar.

---

## 5. Consultor Legal (Copilot RAG)

### 5.1 Flujo vigente

1. La UI envía pregunta y `conversationId` a `POST /api/copilot`.
2. `smartRetrieval()` genera embedding con Voyage por defecto, OpenAI si se configura o hash local como degradación.
3. `rag-search.ts` calcula coseno en Node, mezcla similitud vectorial, keywords y tema.
4. Haiku reordena; el gate exige soporte mínimo o instruye la abstención canónica.
5. Haiku redacta con los documentos seleccionados.
6. `citas-legales.ts` extrae referencias y las cruza con el conjunto recuperado.
7. Se separan `citations` de `documentosConsultados`, se calcula una confianza determinista y se persiste `CopilotConsult`.

No usa pgvector. El `conversationId` agrupa mensajes guardados, pero el historial no se incorpora a la recuperación ni al prompt; cada turno es atómico. La llamada es síncrona y el estado visible no se restaura automáticamente después de navegar fuera del módulo.

### 5.2 Corpus real

Producción tiene 1,171 documentos activos:

- 1,127 `texto_integro`, cargados para Ley Aduanera, RGCE 2026, LIVA y LIEPS, además de una versión anticipada identificada como tal;
- 44 `resumen`, conservados como síntesis operativa;
- todos con URL y embedding de 1,024 dimensiones;
- 1,125 con `fechaCotejo`;
- 39 sin `publishedDate`, 4 sin `effectiveDate` y ninguno con `expiryDate`.

El retrieval da boost al texto íntegro y elimina el resumen de la misma referencia cuando compiten. Esto mejora la calidad, pero no significa corpus jurídico universal: CFF, LCE, RLA, LFD, LIGIE/notas y otros instrumentos aún no tienen cobertura íntegra completa.

El DTO de citas que llega a la UI no incluye `claseTexto`, fechas ni `fechaCotejo`. La pantalla llama “Fuentes que respaldan” a las tarjetas y entrecomilla el extracto; si se usó uno de los 44 resúmenes, el usuario no ve esa diferencia de calidad.

### 5.3 Citas: implementado frente a activo

La política `COPILOT_CITA_ESTRICTA` admite:

- `off`: detecta y advierte, sin regenerar ni bloquear;
- `sombra`: agrega la medición operativa con el mismo comportamiento visible: advierte y muestra;
- `estricta`: regenera una vez; si persisten referencias no respaldadas, muestra abstención y guarda la respuesta descartada.

Producción está en el default `sombra`. De 78 consultas, 20 fueron medidas en sombra, 8 contienen referencias no respaldadas y 0 fueron regeneradas/degradadas. Por tanto, el fail‑closed existe en código, pero **no está activo**.

El matcher mejoró respecto del token matching anterior, pero no garantiza respaldo semántico:

- una cita sin cuerpo exige mismo tipo+número y un único documento candidato; si el cruce es ambiguo, queda no respaldada;
- corregido (misión cierre 25‑ago): `Capítulo 5 TMEC` / `Capítulo 5 del T‑MEC` se extraen en ambos órdenes; `Arts. 54 y 162 LA` expande la lista (una clave por artículo, cuerpo compartido); un cuerpo genérico (`de la Ley`, `del Reglamento`) ya no se toma como cuerpo literal `LEY` — cruza como cita sin cuerpo (caso real: `Art. 49 de la Ley` vs doc `Art. 49 LFD`). Regresión en `copilot-cita-estricta.test.ts`;
- comprueba identidad sintáctica mediante una clave normalizada, no que la frase concreta esté sostenida por el pasaje;
- forma conocida restante: `Art. 59-II` (fracción en romano pegada al número) se trata como artículo distinto de `Art. 59` — fail-closed (produce no-respaldada de más, nunca respaldo falso).

El fallback automático top‑3 fue eliminado: una respuesta puede tener `citations=[]`, y los documentos recuperados no citados viajan aparte. El prompt, sin embargo, todavía contiene reglas legales hardcodeadas y `injectIMMEXCertificationNote()` puede añadir contenido fuera del corpus recuperado.

### 5.4 Límites y riesgo multi‑tenant

- No hay búsqueda jurídica “a fecha de la operación” ni filtrado completo por expiración/supersesión.
- No hay enlace verificable afirmación → cita → pasaje exacto.
- Si la consulta cae al embedding hash local de 256 dimensiones frente al corpus de 1,024, la similitud vectorial queda en cero y el flujo continúa por señales léxicas sin advertirlo al usuario.
- Si el reranker falla o devuelve JSON inválido, el retrieval vuelve al ordenamiento local y continúa sin advertencia al usuario; el gate no falla cerrado ante esa degradación.
- La confianza es determinista, pero no calibrada.
- El hash no incluye snapshot/versionado completo del corpus.
- `consultHash` es único global y omite tenant/usuario; el upsert y el endpoint de feedback pueden atribuir una consulta idéntica al tenant original.
- Activar modo estricto reduciría respuestas con referencias inexistentes, pero no resolvería por sí solo afirmaciones no respaldadas sin cita detectable.

---

## 6. Pre‑Glosa

### 6.1 Qué hace realmente

Pre‑Glosa recibe datos básicos de una operación/fracción y ejecuta reglas heurísticas sobre valor, origen, cuota, padrón, NOM, clasificación, régimen y documentación. No recibe ni valida un pedimento completo y no usa LLM.

Hay 15 reglas activas en `GlosaRiskRule` y 14 comprobaciones ejecutables. `REG_002` está sembrada, pero no tiene rama de evaluación. El resultado incluye score, nivel, tres porcentajes derivados del score, hallazgos, recomendaciones, revisión por dominio, versión normativa e ID persistido.

Los porcentajes son fórmulas fijas, no modelos estadísticos:

- reconocimiento = `min(95, round(score × 0.85))`;
- glosa = `min(90, round(score × 0.70))`;
- cotejo = `min(98, round(40 + score × 0.40))`.

Producción sólo tiene 5 simulaciones y 0 outcomes. No existe evidencia para llamarlas probabilidades calibradas ni para afirmar que las heurísticas están calibradas con prácticas de industria.

### 6.2 Fail‑closed y tipo de cambio

Seis dependencias —precio estimado, histórico, cuotas, padrones, NOM y reclasificación— pasan por un wrapper que registra `revisado|no_revisado`. Una excepción deja la presentación en `indeterminado`, con banner y detalle de lo no revisado.

La garantía debe acotarse: una promesa resuelta con `null` o `[]` se marca `revisado`. Si el catálogo está incompleto pero no lanza error, puede existir revisión completa y riesgo bajo. El control cierra fallos técnicos, no cobertura insuficiente.

Cuando el usuario no declara `totalValueMXN`, Glosa usa el servicio central de tipo de cambio y persiste procedencia. Ese servicio prefiere Banxico, pero también puede devolver `fallback`, `manual` o `synthetic`; cuando no es oficial se marca `sin_verificar`. Si el usuario declara MXN, se usa ese valor sin consultar TC y `tipoCambio` queda `null`. La afirmación correcta es “sin constante silenciosa y con fuente/advertencia cuando se deriva”, no “todo TC viene de Banxico/DOF”.

### 6.3 Problemas vigentes

- Las 15 reglas activas tienen 0 fuentes estructuradas completas; sus fundamentos se muestran `sin_verificar`. El panel admin actual no permite llenar esos campos.
- Corregidos (misión cierre 25‑ago, cinco bugs de regla; regresión en `glosa-reglas-capturadas.test.ts`): una regla sin dato capturado o suficiente queda `no_evaluado` con motivo en `revision.reglasNoEvaluadas` (visible en UI), jamás dispara por defecto. `CLA_001` cuenta reclasificaciones REALES (feedback `incorrect` del tenant, ventana 12 meses, mínimo 5; texto de la regla migrado — ya no promete datos del SAT). `CLA_002` exige `productDescription`, que la UI ahora captura. `ORI_002` exige captura real de `documents.originCertificate` (checkbox nuevo). `REG_001` migrado a IN/AF con "el IVA se paga o garantiza" (murió "A4/diferir IVA" — migración `20260826031500`). `appliesTMEC` valida membresía importando `TMEC_PAISES` de `lib/treaties` (la lista que usa el Cotizador multi-partida); preferencia declarada con origen no miembro deja las reglas T‑MEC `no_evaluado` con motivo. La UI de Pre‑Glosa además prellena la certificación IVA/IEPS desde el perfil Fiscal del tenant (D10).
- El formulario inicia `regimenCode='IMD'`, mientras su selector usa claves de pedimento.
- Divergencia conocida: `quoter.ts` (`getPreferentialRates`) conserva una lista T‑MEC propia sin MX; `quoter-multi.ts` y Pre‑Glosa ya comparten `TMEC_PAISES`.
- Las cinco aduanas de “alto riesgo” y los prefijos de fracciones “típicamente chinas” son listas hardcodeadas sin dataset estadístico citable.
- Aun con revisión incompleta, el backend devuelve y persiste el `riskLevel` y los porcentajes crudos; sólo `riskLevelPresentacion` pasa a `indeterminado`. Todo consumidor debe atender `revision` y el nivel de presentación.
- El disclaimer del backend fue corregido (25‑ago, commit de la misión honestidad): ahora declara checklist heurístico preventivo con índices heurísticos no calibrados; la UI etiqueta las tres cifras como “Índice … (heurístico)”. El guard de afirmaciones vigila la reincidencia.
- Historial y outcome existen en la API, pero no tienen interfaz de usuario.
- El reporte imprimible usa `window.print()`, no PDF generado por servidor.
- `CampoNumerico` conserva `type="number"` controlado; una prueba React/jsdom reprodujo que teclear `0.02` puede acabar como `2`. El gate del Dockerfile detecta la clase `value={x || ''}+parseFloat`, no este comportamiento del navegador.

Por estas razones, Pre‑Glosa es un checklist heurístico preventivo; no es una probabilidad del SAT ni una revisión exhaustiva de seis dominios.

---

## 7. Risk Scorer de Responsabilidad Solidaria

### 7.1 Flujo y contrato

Risk no usa LLM. El endpoint exige al menos uno de estos identificadores: fracción, RFC del importador o número de pedimento. Después:

1. Zod normaliza la entrada.
2. `signals.ts` consulta catálogo, NICO si fue enviado, padrones, cuotas, formato de pedimento, temporales del tenant y SAT 69‑B.
3. `rules.ts` ejecuta 26 reglas puras agrupadas en ocho factores.
4. `engine.ts` limita cada factor por su peso y calcula exposición 0–100.
5. `shield.ts` mantiene 16 evidencias en catálogo: 13 base, una condicional por cuota y dos adicionales para agencia; calcula el escudo con las que resultan aplicables.
6. La banda combina exposición, escudo y banderas críticas.
7. Se persisten input, resultados, checklist, pesos y `RULES_VERSION`.

La versión actual es `v1.2.0-2026-07-19`, no v1.0. Cada regla incluye artículo, cita corta, fuente, URL y fecha de cotejo. Esto hace reproducible el fundamento, no necesariamente la señal que disparó la regla.

La UI no captura NICO, aunque el backend lo acepta.

### 7.2 Señales reales y huecos

Se consultan determinísticamente contra tablas del sistema: existencia/actividad de fracción, NICO cuando hay catálogo y entrada, sectores, cuota por fracción+país, formato de pedimento, coincidencia 69‑B y temporales atribuibles al tenant. Sólo deben elevarse a “verificadas” cuando la fuente subyacente esté vigente y tenga la cobertura requerida.

Siguen incompletas:

- coincidencia con el Clasificador queda `null`;
- temporales fuera de domicilio queda en cero por falta de dato estructurado;
- afectación del decreto de tasas queda `null`;
- subvaluación no tiene precio de referencia;
- cuota no modela productor específico ni toda su vigencia/alcance;
- NOM usa `Fraction.noms`, aún pendiente de cotejo fino;
- un solo identificador satisface el mínimo, por lo que la evaluación todavía puede ser muy escasa.

Los ocho incisos del expediente 59‑V se consideran aplicables siempre, incluida la garantía que jurídicamente dice “si aplica”; el checklist no ofrece un estado “No aplica”.

La vigencia E2 contempla la versión anticipada que extiende el plazo al 30‑09‑2026 y la distingue de la última publicación DOF.

### 7.3 Lista 69‑B: bug corregido (25‑ago‑2026)

**Motor corregido:** `engine.ts` consulta la disponibilidad ANTES de puntuar. Una señal con `senalDisponible=false` (lista vencida >30 días o sin ingesta) produce 0 puntos, no activa bandera y la regla queda `no_evaluado` con `motivo` explícito que viaja a persistencia y UI (tooltip). El fix es general para toda regla con `senalDisponible`, no solo 69‑B. Regresión: `risk-69b-disponibilidad.test.ts` (7 casos: lista vencida → 0 pts/no_evaluado/sin bandera; lista vigente → intacto; RFC limpio con lista vigente → verificado) y gate en el Dockerfile.

**Ingesta corregida:** el dedup por RFC prevalece la situación MÁS RECIENTE del proceso (presunto < definitivo < desvirtuado < sentencia favorable), no la más severa — un desvirtuado o sentencia favorable posterior ya no queda eclipsado (`src/lib/sat69b-dedup.ts`). Con el CSV real del SAT (corte 31‑12‑2025) y dedup por FECHA de publicación (100% de filas con fecha parseable, persistida en `fechaOficio`): 11,176 definitivos, 961 presuntos, 340 desvirtuados y 1,577 con sentencia favorable — la cronología real corrige en ambos sentidos frente al ranking por severidad Y frente a un ranking ingenuo por etapa.

**Lista REVIVIDA (25‑ago‑2026):** el minisitio de Datos Abiertos del SAT sirve el corte **31‑jul‑2026** (la URL vieja de omawww quedó congelada en dic‑2025; la ingesta apunta a la nueva). Prod reingerido: **14,438 RFC únicos, 100% con fecha de publicación parseable** — 11,823 definitivos, 814 presuntos, 340 desvirtuados y 1,461 con sentencia favorable (252 descartes auditables: 237 filas redactadas por el propio SAT por declaratoria de nulidad + fragmentos multilínea; artefacto `src/tests/ingesta-69b-2026-08-25.json`). Con corte ≤30 días la señal está DISPONIBLE y las reglas 69‑B se evalúan.

### 7.4 Pesos

Si no hay filas en `RiskFactorWeight`, se usan todos los defaults. Si existe sólo una parte de las filas —por ejemplo tras un fallo a mitad del PUT—, `getWeights()` devuelve únicamente esas filas y cada factor faltante cae a peso cero en el motor. El PUT valida las ocho claves y suma 100, pero hace upserts secuenciales sin transacción.

Producción tiene 6 evaluaciones; no hay base para afirmar calibración estadística del score.

---

## 8. Fuentes legales y autoridad de datos

### 8.1 Principales fuentes maestras revisadas

| Fuente | URL oficial | Versión vigente usada |
|---|---|---|
| Ley Aduanera | [Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf) | Última reforma DOF 19‑11‑2025 |
| Código Fiscal de la Federación | [Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/ref/cff.htm) | Última reforma DOF 09‑04‑2026 |
| Ley de Comercio Exterior | [Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/ref/lce.htm) | Última reforma DOF 01‑05‑2026 |
| LIVA | [Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf) | Última reforma DOF 12‑11‑2021 |
| LIEPS | [Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LIEPS.pdf) | Última reforma DOF 07‑11‑2025 |
| Ley Federal de Derechos | [Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFD.pdf) | Última reforma DOF 07‑11‑2025 |
| RGCE 2026 | [SAT](https://wwwnp.sat.gob.mx/minisitio/NormatividadRMFyRGCE/normatividad_rmf_rgce2026.html) | Publicación 27‑12‑2025; 1ª modificación 14‑05‑2026; versiones anticipadas se identifican aparte |

Las fechas CFF 09‑04‑2026 y LCE 01‑05‑2026 del código son correctas. Esta revisión confirma las fuentes maestras; no equivale a recotejar palabra por palabra cada una de las 26 citas del Risk Scorer.

Risk y los módulos operativos también usan RLA, Anexos 10 y 22, T‑MEC, el CSV SAT 69‑B y la versión tarifaria Base Única SNICE/Tarifa 15. Sus referencias viven en `rules.ts`, `anexo22.ts`, seeds y `tariff-version.ts`; la tabla anterior es una selección de fuentes legales generales, no el inventario completo de datasets.

### 8.2 Estado por dato

| Dato | Autoridad efectiva | Estado real |
|---|---|---|
| Fracción y descripción | `Fraction` + versión tarifaria | Existencia validada; el catálogo aún conserva fracciones legacy por cotejar |
| NICO | `Fraction.nicos[]` cargado del XLSB | Amplia cobertura; selección entre varios NICO sigue requiriendo criterio |
| NMF/preferenciales/IEPS | Catálogo `Fraction` | Sustituidos por la frontera; cobertura/versionado por fila no es universal |
| NOM/RRNA | `FractionRegulation` con fallback `Fraction.noms` | Se entregan como `sin_verificar` o `no_disponible`; dataset consolidado pendiente |
| Padrón sectorial | Tabla derivada de Anexo 10 | Fuente identificada; cobertura fina pendiente |
| Cuotas compensatorias | `AntidumpingDuty` | Dataset mixto; reconstrucción UPCI completa pendiente |
| Precios estimados | Filas `DOF`, `SAT` o `internal` | No todos son oficiales; debe conservarse su procedencia |
| Copilot | 1,127 textos íntegros + 44 resúmenes | Cobertura fuerte de cuatro instrumentos, no corpus universal |
| Fundamentos Risk | Reglas en código | Fuente/URL/cotejo estructurados; señales pueden ser declaradas, incompletas o vencidas |
| Fundamentos Glosa | Strings + campos de fuente vacíos | `sin_verificar` en las 15 reglas activas |
| Precedentes | Corpus sintético | Correctamente apagado con `PRECEDENT_CORPUS_VERIFIED=false` |

Los pendientes legales principales son: cotejo por fila de NOM/Anexo 2.4.1, padrones finos, cuotas UPCI, precios estimados oficiales, precedentes reales, notas legales recuperables por el Clasificador y limpieza de las fracciones legacy restantes.

---

## 9. Resto de la plataforma

| Área | Qué está construido | Límite vigente |
|---|---|---|
| Auth/permisos | Registro, login, JWT, roles, invitaciones y permisos granulares | Refresh automático incompleto; tenant guard parcial |
| Cotizador | IGI, DTA, IVA, IEPS, ISAN, cuotas y escenarios | Exactitud depende de tarifa, TC, tratados y datasets cargados |
| Expediente/documentos | Operaciones, documentos, extracción IA y completitud | No transmite directamente a VUCEM; edición sigue incompleta |
| Prevalidador | Reglas formales Anexo 22 + revisión cualitativa | No es validador SAT; la UI conserva TC default 17.49 y no cruza transporte con aduana |
| Inventario IMMEX | Temporales, descargos, BOM y reportes Anexo 24/30 | Depende de captura; algunas alertas/resúmenes usan IA |
| Fiscal | Créditos, aplicaciones, garantías y certificación | Recomendaciones IA no sustituyen cálculo normativo |
| MVE/COVE | Borrador, extracción de factura, validación y artefactos | No transmite a VUCEM; algunos folios visibles son IDs internos |
| Logística | Cubicaje y planes de carga | Heurístico; no es solver certificado |
| Origen | Reglas, RVC y certificados; re‑siembra al arrancar si la tabla está vacía o falta el marcador activo `854430/TMEC` | Métodos actuales usan 60% VT / 50% CN cuando corresponde; cobertura no es universal |
| Actualizador TIGIE | Analiza texto de decreto y prepara batches; el código puede aplicar bajo guards | Producción tiene `TIGIE_APPLY_ENABLED` apagado; requiere habilitación y operación controlada |
| Vigilante tarifario | Revisa reformas de LIGIE y alerta a SUPERADMIN | Sólo avisa; jamás modifica el catálogo |
| Auditoría/OTS | Cadena hash, reportes y anclaje temporal | Prueba integridad/tiempo, no corrección jurídica inicial |
| Backups/monitoring | Dumps cifrados y restauración/monitoreo configurables | Depende de variables y almacenamiento; timers viven en el proceso web |
| Pedimento Reader/Radar | Backend beta montado en `/api/pedimentos` | Feature flag apagado por defecto y sin ruta UI |

Superficies que siguen siendo demo, stub o incompletas:

- “Regulatorio hoy” del Dashboard usa `MOCK_WATCHDOG=true` y alertas hardcodeadas. No debe confundirse con el vigilante tarifario específico.
- `dof-alerts.ts` conserva ejemplos de demo.
- El registro profesional contiene patentes placeholder; no verifica oficialmente CAAAREM.
- La notificación WhatsApp de nuevos leads es un `console.log` placeholder.
- Blog y edición documental tienen superficies “próximamente”.
- Los datos demo se marcan con `isDemoData` y la UI sí muestra su condición.
- La integración directa VUCEM permanece pendiente; hoy se generan archivos/artefactos listos para el flujo externo.

---

## 10. Alcance real de los candados

| Control | Qué sí garantiza | Qué no garantiza |
|---|---|---|
| `validateFraction` / candado final | Código activo de ocho dígitos | Corrección jurídica o pertenencia a candidatos |
| Frontera canónica | Sustituye campos cubiertos por catálogo y registra procedencia | Exhaustividad de NOM/RRNA/padrones ni respaldo de RGI/explicación |
| `PRECEDENT_CORPUS_VERIFIED=false` | Lookup normal de precedentes vacío | El retry puede reintroducir texto/precedentes LLM no normalizados; tampoco verifica todo conocimiento global |
| Gate RAG | Inyecta una directiva explícita de abstención cuando el retrieval no supera mínimos | El modelo todavía genera la respuesta; no garantiza abstención ni respaldo frase por frase |
| Copilot estricto | En `estricta`, regenera/degrada citas detectadas | Hoy no está activo; no detecta todas las formas de cita |
| Fail‑closed Glosa | Excepción técnica queda `no_revisado` e indeterminado | Catálogo incompleto que responde `null`/`[]` |
| Fuentes Risk | Fundamento reproducible por regla | Actualidad/corrección de cada señal |
| Tenant guard | Detecta ciertas lecturas sin scope | RLS, todas las operaciones/modelos o SQL crudo |
| Sellos UI | Comunican metadata recibida | Veracidad del dato si backend/catalogo está mal |
| Audit hash/OTS | La cadena hash permite detectar cambios al verificarse; un proof OTS confirmado aporta evidencia temporal externa | Todo registro tenga OTS confirmado; el anclaje es asíncrono/best‑effort y no prueba corrección inicial |
| Gates Docker | Migración, patrón numérico y anti‑aduana-shopping en cada deploy | Ausencia de cualquier otro bug funcional |

---

## 11. Lenguaje comercial acorde

### Clasificador

> “ADUANAI reduce el universo TIGIE, compara candidatos con IA, verifica que el código exista y sustituye datos arancelarios cubiertos por fuentes del catálogo. El resultado es una hipótesis documentada para revisión profesional.”

No debe prometerse que aplica las seis RGI como algoritmo, que siempre elige “la correcta/exacta”, que tarda siempre 15 segundos o que tiene 95%+ universal.

### Copilot

> “Busca primero en una biblioteca legal, prioriza texto oficial íntegro y muestra las referencias detectadas. Cuando no hay soporte suficiente está diseñado para abstenerse.”

Mientras producción siga en sombra, no debe afirmarse que toda respuesta con cita no respaldada se bloquea. Tampoco que cada tarjeta prueba cada frase.

### Pre‑Glosa

> “Es un checklist heurístico preventivo que revisa señales disponibles y declara los dominios que fallaron técnicamente.”

No debe llamarse probabilidad real de reconocimiento/glosa del SAT, revisión completa de pedimento ni motor calibrado con industria.

### Risk

> “Ejecuta 26 reglas reproducibles y separa exposición de escudo documental. Distingue señales verificadas, declaradas y no evaluadas.”

No debe afirmarse que todas las señales están actuales si la lista 69‑B vuelve a vencer; con lista vencida la señal queda `no_evaluado` y NO afecta el score (motor corregido 25‑ago). Posicionamiento vigente de la página pública (25‑ago): cumplimiento bajo la reforma 2026 — Art. 54 sin excluyentes PARA EL AGENTE/AGENCIA (sujeto siempre delimitado), expediente 59‑V, listado 69‑B con corte declarado; el clasificador se presenta como herramienta de apoyo con lenguaje de hipótesis. Prohibido por el guard: equivalencia con la revisión de la autoridad, inevitabilidad ("si te van a revisar"), y efectos hiperbólicos del 69‑B ("contamina la operación").

### Conflictos en la web pública: RESUELTOS (25‑ago‑2026)

`About.tsx` fue reescrito al posicionamiento de esta sección: murieron las seis afirmaciones (RGI como algoritmo, 95%+/12,000, “fracción exacta”, decretos “mismo día”, “15 segundos”, garantías de seguridad sin evidencia), se eliminaron los testimonios con personas sin evidencia, y toda métrica de desempeño visible sale de la constante única `client/src/lib/metricas-medidas.ts` anotada con su artefacto (`medicion-tanda-8544-2026-08-24.json`: 61.6% top‑1, 81.8% capítulo, 99 casos).

La reincidencia la vigila el guard `server/src/lib/afirmaciones-guard.ts` + `afirmaciones-comerciales.test.ts` (14 patrones prohibidos, lista blanca solo con artefacto), que corre como gate fail‑closed en el Dockerfile: una afirmación prohibida en una superficie de usuario rompe el build.

---

## 12. Conclusión operativa

ADUANAI ya sirve para concentrar información, reducir búsquedas, preparar expedientes, ejecutar controles y conservar trazabilidad. Sus mejores garantías son la existencia de fracción, la sustitución canónica de campos cubiertos, el corpus íntegro priorizado, las reglas reproducibles de Risk y el registro explícito de procedencia.

Sus límites principales son la ausencia de un motor RGI determinista, la exactitud no calibrada del Clasificador, Copilot estricto apagado, reglas Glosa sin fuentes/calibración, datasets regulatorios incompletos, lista 69‑B vencida y aislamiento tenant sin RLS.

Por tanto, la decisión operativa y jurídica final debe permanecer en manos del agente, agencia o área legal. Los estados de dato `verificado`, `sin_verificar`, `no_disponible`, `no_revisado` y `vencido` deben conservar su significado estricto; la UI sólo tiene sellos propios para un subconjunto. Nunca deben convertirse en un sello general de “la respuesta completa es correcta”.

### Regla de mantenimiento de este documento

Al cambiar un flujo central o desplegar una nueva fase:

1. actualizar el commit y fecha de corte en la cabecera;
2. confirmar el commit desplegado en Railway;
3. volver a consultar las cifras de producción que se publiquen;
4. distinguir siempre `implementado`, `activo`, `verificado` y `calibrado`;
5. actualizar la sección vigente en lugar de añadir otro Addendum;
6. no elevar una métrica o fuente sin artefacto reproducible.

---

## Pendientes — libro de estado (Misión CIERRE TOTAL PRE-VALIDACIÓN)

**Censo:** 25-ago-2026 contra `main` (`23c2c95`) y prod servido (deploy SUCCESS 25-ago 11:15, bundle `index-C9wR085f.js`, DB viva vía ssh). Esta tabla es el punto de reanudación de la misión: se actualiza al cierre de cada bloque. Estados: ABIERTO / EN CURSO / CERRADO+commit / BLOQUEADO+causa.

| Ítem | Bloque | Estado | Evidencia |
|---|---|---|---|
| Cuatro números de la sombra Copilot | 1 | CERRADO (censo) | Prod 25-ago: 78 consultas (58 sin modo, 20 sombra); 8 con citas no respaldadas (0 regeneradas, 0 degradadas); top fantasma: Art. 59-II ×3, Art. 59 ×2, y 5 únicas (Art. 49 de la Ley, Anexo 1 RGCE 2026, Art. 303, Anexo 1, Art. 303 TMEC, Art. 24); falsos positivos del matcher: ver ítem siguiente |
| Clasificación de las 8 marcadas (fantasma real vs FP) | 1 | ABIERTO | pendiente cotejo contra corpus |
| Matcher: formas conocidas (Capítulo N TMEC, Arts. plural, cuerpo nulo) | 1 | ABIERTO | los 3 FP confirmados vivos en `citas-legales.ts` (extractor no captura "Capítulo 5 TMEC" ni "Arts."; cita sin cuerpo cruza con cualquier cuerpo) |
| COPILOT_CITA_ESTRICTA=estricta en prod + evidencia | 1 | ABIERTO | env var ausente en Railway (default sombra) |
| CLA_001 solo con reclasificaciones reales | 1 | ABIERTO | `glosa-simulator.ts:242-246`: `{not: undefined}` inerte, sin tenant, sin ventana |
| CLA_002 exige productDescription desde UI | 1 | ABIERTO | UI no captura el campo; sin descripción ⇒ dispara siempre |
| REG_001 coherente IN/AF (muere "A4/diferir IVA") | 1 | ABIERTO | código corregido; seed `glosa-risk-rules.ts:119-127` conserva A4/diferir |
| ORI_002 con captura real de originCertificate | 1 | ABIERTO | UI nunca envía `documents`; dispara con los 2 checkboxes |
| appliesTMEC valida membresía importando lista del Cotizador | 1 | ABIERTO | no valida; lista T-MEC duplicada en quoter.ts/quoter-multi.ts |
| Test transversal: 15 reglas vs campos capturados | 1 | ABIERTO | no existe |
| Seed DB limpia no resucita retiradas + test | 1 | ABIERTO | `tigie-data.ts:169` recrea 85444201 activa; sin test |
| Censo legacy restantes documentadas | 1 | CERRADO (censo) | 12 legacy activas por cotejar (migración 20260824234500) + 13 subpartidas pre-HS2022 (migración 20260813193051) |
| D10: una empresa demo, una historia | 1 | ABIERTO | 3 identidades demo divergentes; Pre-Glosa no lee CertificationProfile ni tiene datos demo; TC fijo 17.85; narrativa aduanas incoherente; Analytics ya deriva del historial (OK) |
| Hero (eyebrow/H1/sub/CTA/WhatsApp) | 2 | CERRADO `23c2c95` | H1 en 3ª persona ("el agente aduanal responde sin excluyentes") por precisión legal de la revisión adversarial — Art. 54 LA aplica al agente; no se revierte a la redacción en 2ª persona pedida por la misión (sería afirmación imprecisa sin artefacto). Resto del hero conforme |
| Orden narrativo + "en minutos" fuera de sección | 2 | CERRADO (Bloque 2) | `/CÓMO TE REVISA` ahora precede a `/CÓMO FUNCIONA` (relabelada `HERRAMIENTA DE APOYO`); "en minutos" solo sobrevive dentro de las 2 secciones del clasificador (paso 2 y header demo), donde es afirmación verdadera (1-3 min); fuera de sección: 0 |
| Muere "19 módulos" | 2 | CERRADO (Bloque 2) | 0 ocurrencias en client/; botón usa `MAIN_MODULES.length + EXTRA_MODULES.length`; ancla `#comparativa` → `#por-que` |
| Contadores de constante única con unidad | 2 | CERRADO `dba111b` | FALLBACK_STATS + /api/stats/public desde DB viva; nota: fuentes reales = 17 (la misión decía 44 = conteo de docs `resumen`, no de fuentes; se publica el real) |
| Refresh 69-B con CSV vigente + pipeline v1.3.0 | 2 | CERRADO `dba111b` | reingesta 25-ago 17:07Z ANTES del deploy: corte CSV 31-jul-2026, 14,522 filas válidas → 14,438 RFC únicos (dedup por fecha); prod: DEFINITIVO 11,823 · SENTENCIA_FAVORABLE 1,461 · PRESUNTO 814 · DESVIRTUADO 340; artefacto `ingesta-69b-2026-08-25.json`; falta evidencia Risk real → factor EVALUADO (EN CURSO) |
| Comparativa fuera + VUCEM + logos | 2 | CERRADO `223badd`/`c3f9d56` | residuo menor: ancla `#comparativa` y "en minutos"/TIGIE en strings (ver ítems abiertos) |
| Guard extendido (terceros + compatible-gubernamental) | 2 | CERRADO `23c2c95` | 18 patrones, `soloEn` público, gate en Dockerfile |
| Copilot: sugerencia sin respaldo en corpus | — | CERRADO `198df6d` | "¿Qué NOM aplica para alimentos?" → reranker descartaba 12/12 (corpus sin NOM de alimentos); sustituida por excepciones a NOMs (Anexo 2.4.1); `test:copilot-sugeridas` 3/3 con reranker real |
| Demo público: ejemplos que el validador rechaza | — | CERRADO `267e1f1` | copy "laptop, tequila, camiseta" → 422 (<8 chars útiles / <2 palabras); copy alineado a la regla |
| Login por aduanaia.lat/www (P0 26-ago) | — | CERRADO `e193691`+`9b26a08` | CORS rechazaba Origin del dominio propio (500); same-origin siempre permitido + CLIENT_URL/APP_URL en Railway; verificado 401/200 por www y apex |
| Email de lead dice "asesores" | 2 | CERRADO (Bloque 2) | `email.ts:354` → "El fundador"; `server/src/lib` añadido a SCAN_ROOTS del guard (3/3 verde); AuthLayout + TRUST_PILLS incluyen TIGIE en fuentes |
| Biblioteca Legal: login intencional + qué ve demo | 2 | ABIERTO (reporte) | ruta protegida en App.tsx:240 |
| consultHash por tenant (hash+unicidad+upsert+feedback+test) | 3 | CERRADO (rama `feat/bloque-3-tenant`) | `calcularConsultHash` incluye tenantId; `@@unique([tenantId, consultHash])` + migración `20260827050000` idempotente; upsert por `tenantId_consultHash`; feedback `updateMany {tenantId, consultHash}` → 404 si ajeno; `test:consult-hash` 7/7 |
| Tenant guard a estricto (censo modelos + incidentes + flag) | 3 | CERRADO en prod (27-ago, `TENANT_GUARD_STRICT=1` activo) | Dos falsos/positivos reales destapados por los incidentes al deployar y corregidos con test: (a) `whereTieneTenant` no reconocía selectores únicos compuestos (`tenantId_code`) → TenantRole ×63 al arrancar (`8167f17`); (b) `sinGuardaDeTenant` no cubría PrismaPromise perezosas → el runner de ClassificationJob moría en estricto (`1832069`). Verificación: job de clasificación `done`, Copilot, Pre-Glosa y 15 rutas 200 con 0 incidentes; `test:tenant-guard` 15/15 |
| ClassificationKnowledge sin contaminación entre tenants | 3 | CERRADO (rama `feat/bloque-3-tenant`) | `tenantId String?` + migración `20260827051000`; feedback crea la fila con su tenant; `construirFiltroConocimiento`: OR[verified, AND[tenantId, chapterCode in]]; demo pública solo verificado; filas legadas sin verificar dejan de entrar al prompt; runner pasa tenantId; `test:knowledge-tenant` 9/9 |
| Solo-reporte: RLS, refresh token, fuentes Glosa+panel | 3 | ABIERTO (reporte) | censo listo; va en reporte final |
| D4 input decimal Pre-Glosa como clase | 4 | CERRADO `d00191c`+`4bcd451` | CampoNumerico canónico en Pre-Glosa/Origen; 0 restantes del patrón roto; gate en Dockerfile |
| CampoNumerico: veredicto en navegador real (0.02/.02) | 4 | CERRADO (26-ago) | Chrome real contra prod (/simulador-glosa, tenant demo): Valor unitario "0.02"→0.02; Peso ".02"→0.02; segunda ".02" concatena a 0.0202 (composición decimal sobrevive). Sin Playwright: evidencia manual registrada aquí |
| Radar Fase A: 3 compromisos + /radar/:loteId en rama | 4 | CERRADO (censo `752935d`) | 422 línea×línea+layoutVersion; 413 constante+límite+partidas+salida; sin "cumple" (OrigenBadge compartido); GET persistido con tenant |
| Radar: rebase+Codex+merge+deploy+verificación prod | 4 | CERRADO (merge ff `11c3790`) | rebase sobre main: 2 conflictos resueltos como previsto (`motivo` portado a components/OrigenBadge.tsx; package.json unión de scripts); tsc client+server limpio; suites radar 14 / criterios 15 / glosa 15+16 verdes; deploy+verificación prod: ver cierre de misión |
| Radar: gating (flag prod + visibilidad) | 4 | CERRADO (`11c3790`) | GET /api/pedimentos/radar/estado → {habilitado}; hook useRadarHabilitado (fail-closed) filtra sidebar y CommandPalette; 403 se muestra verbatim en ErrorRadar. Flag `PEDIMENTO_READER_ENABLED` sigue ausente en prod = beta apagado y oculto |
