# LECTOR DE PEDIMENTOS — FASE 0: mapa real de formatos

**Fecha de investigación: 2026-07-16/17.** Documento de decisión previo a cualquier diseño o código de producto.
Principio rector aplicado: **los layouts de campos NO se inventan ni se infieren** — cada afirmación está anclada a documentación oficial citable (URL + fecha de consulta) o marcada explícitamente como "layout no documentado públicamente".

> Nota de protocolo: el prompt de esta fase invoca `FABLE-PROTOCOL.md`; ese archivo **no existe en el repo** (verificado 2026-07-16 — solo hay `AGENTS.md`). Se aplicó el principio enunciado arriba en su lugar. Si el protocolo vive fuera del repo, conviene vendorearlo.

Convención de fuentes: **[OFICIAL]** = DOF / sat.gob.mx / anam.gob.mx / ventanillaunica.gob.mx / diputados.gob.mx; **[SECUNDARIO]** = despachos, blogs, asociaciones, plataformas de terceros.

---

## 0.5 — Tarea express: prórroga MVE al 31-jul-2026 (CERRADA, commit `9a963db`)

**Confirmada contra texto verbatim, pero SIGUE EN VERSIÓN ANTICIPADA — no está en DOF al 2026-07-16.**

- La **2a Resolución de Modificaciones a las RGCE 2026, 1a Versión Anticipada** (Portal SAT, 02-jun-2026) reforma el **Transitorio Décimo Primero** de las RGCE 2026: *"Para los efectos del artículo 59, fracción III de la Ley y de la regla 1.5.1., hasta el 31 de julio de 2026, quienes introduzcan mercancías a territorio nacional podrán cumplir con las referidas disposiciones, en términos de lo establecido en el Transitorio Quinto, segundo párrafo de las RGCE para 2025, publicadas en el DOF el 30 de diciembre de 2024."* Surte efectos desde el 01-jun-2026 en términos de la regla 1.1.2. PDF leído íntegro: <https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/anticipadas/2aRMRGCE2026_1aVersionAnticipada.pdf> **[OFICIAL]** (2026-07-16).
- El minisitio del SAT la lista **solo** bajo "Versiones Anticipadas" (1aVA 02-jun, 2aVA 04-jun); la 1a RM sí está publicada (DOF 14-may-2026): <https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/normatividad_rmf_rgce2026.html> **[OFICIAL]** (2026-07-16).
- Acción tomada: copy de la regla **F1-VAL-02** del Risk Scorer y `docs/RISK_SCORER_LEGAL.md` actualizados para reflejar el plazo vigente citando la versión anticipada como tal (sin cambiar la lógica); `RULES_VERSION` → v1.0.1-2026-07-16. **Seguimiento**: cuando la 2a RM aparezca en DOF, actualizar la cita a la nota DOF.

---

## 0.1 — CENSO DE FORMATOS

### a) Pedimento impreso/PDF (Anexo 22 + Anexo 1 RGCE 2026)

**Qué es.** El documento del despacho. Dos normas lo definen, y es clave no confundirlas:
- **Anexo 22 RGCE 2026** = "Instructivo para el llenado del pedimento" (regla 3.1.41): documenta **campo por campo** el contenido — encabezado (núm. pedimento, valores, incrementables, cuadro de liquidación), proveedor/comprador, transporte, candados, guías, identificadores, cuentas aduaneras, descargos, compensaciones, RRNA, observaciones, **partidas** (SEC, FRACCIÓN, valores, contribuciones por partida), rectificaciones, complementario — más **22 apéndices** de claves (aduanas, claves de pedimento, países, monedas, unidades, identificadores, contribuciones, formas de pago, regímenes, tasas…). Publicado en **DOF 15-ene-2026** (nota 5778300): <https://www.dof.gob.mx/nota_detalle.php?codigo=5778300&fecha=15/01/2026>; PDF SAT (133 pp., verificado por extracción): <https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/anexos/Anexo22delasRGCEpara2026.pdf> **[OFICIAL]** (2026-07-16).
  - Versión vigente = compilado post-1a RM (anexos reformados DOF 20-may-2026, nota 5787982; único cambio al 22: clave "AL" en Apéndice 9): <https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/compiladas/CompiladoAnexo22_1raRMRGCE2026.pdf> **[OFICIAL]** (2026-07-16).
- **Anexo 1 RGCE 2026, apartado III "Modelos auxiliares"** = el **machote visual**: modelos **M1.1 "Pedimento"** (completo) y **M1.5 "Forma Simplificada"** (+ Parte II, tránsito, aviso consolidado, DODA). PDF SAT (528 pp., DOF 8-ene-2026; M1.1 ~p.496, M1.5 ~p.506): <https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/anexos/Anexo1delasRGCEpara2026.pdf> **[OFICIAL]** (2026-07-16).

**Quién lo tiene y cómo.** Todos. El Anexo 22 ("Distribución de copias", p.26) ordena: *"El pedimento se presentará en un ejemplar, destinado al importador o exportador"*. Con despacho electrónico (regla 3.1.33) la autoridad no exige impresión — el PDF lo **genera el software del agente/agencia** y lo entrega al cliente; además el importador puede pedir copias certificadas (regla 1.1.10, formato F1 del Anexo 1, $28/hoja — ver formato f). Lo que circula normalmente es la **forma simplificada M1.5** (regla 3.1.18) o la copia simple del formato completo por bloques. Ojo: la numeración cambió — la 3.1.21 de 2026 ya NO es la de impresión simplificada (hoy regula pedimento por vehículo/Parte II).

**¿Layout documentado?** SÍ el contenido y la estructura de bloques; NO posiciones fijas. Verbatim del Anexo 1: *"El formato de pedimento, es un formato dinámico conformado por bloques, en el cual únicamente se deberán imprimir los bloques correspondientes a la información que deba ser declarada"* — tipografía normada (Arial 9/8, carta), renglones variables. **El render exacto de cada software comercial de agencias (CASA, SICEX, etc.): layout no documentado públicamente.**

**Campos relevantes.** Todos los del proyecto: fracción+NICO, valores (aduana/comercial/dólares), incrementables y decrementables, régimen y clave de pedimento, aduana-patente-número, contribuciones con tasa/forma de pago por partida y cuadro de liquidación, identificadores G/P, permisos RRNA, acuse de valor (COVE) y e-documents (en la simplificada, regla 3.1.18). **Matiz**: la forma simplificada M1.5 pura trae encabezado + liquidación + código de barras, **sin partidas** — la riqueza depende de qué variante imprima la agencia.

### b) Archivo M / archivos de validación (SAAI M3)

**Qué es.** El **.txt ASCII pipe-delimited** con el que agentes/apoderados aduanales y representantes legales (art. 40 LA) transmiten pedimentos a los prevalidadores (art. 16-A LA) y de ahí al SAAI/VOCE. Nombre de archivo `mppppnnn.ddd` (patente + consecutivo + día juliano) — de ahí "archivo m". La respuesta llega en un archivo `.err` con la **firma electrónica de validación** (`F…`), línea de captura (`L…`), errores (`E…` + clave de 12 dígitos) y alertas.

**¿Layout documentado públicamente? SÍ — oficial y completo.** **"Lineamientos Técnicos de Registros VOCE–SAAI M3", v9.0 (agosto 2021)**, AGA, 139 pp., campo por campo (orden, tipo, longitud, obligatoriedad, criterios): <https://www.ventanillaunica.gob.mx/vucem/Manualesa/SistemasCE/LineamientosTR.pdf> **[OFICIAL]** (verificado por extracción, 2026-07-16). Respaldo: v8.9 (feb-2021) en <https://anam.gob.mx/wp-content/uploads/2021/09/Lineamientos_tecnicos_registros_V8.9_15022021.pdf> **[OFICIAL]**. Vigencia normativa: RGCE 2026 **regla 1.8.2-III** obliga a los prevalidadores a cumplirlos (DOF 27-dic-2025). **Riesgo señalado**: no se localizó versión pública posterior a v9.0 — puede existir una más nueva distribuida solo vía ANAM/prevalidadores; validar contra archivos reales.

**Registros documentados** (índice v9.0): nivel pedimento 500 (inicio), 501 (datos generales, 35 campos), 502-516, 520, 601, 701/702 (rectificación/diferencias), 301/302 (complementario); nivel partida **551 (partidas, 26 campos)**, 552-558, 560, 351-358 (T-MEC 2.5); control 800 (e.firma) y 801 (fin de archivo + clave de prevalidador).

**Quién lo tiene.** Lo genera **todo agente/agencia aduanal por defecto** — es el formato de transmisión mismo. Para el importador: **LA art. 162-VII** obliga al agente a formar expediente electrónico de cada pedimento *"en el formato en que fue transmitido"*, con anexos y acuses, y a **entregarlo a sus clientes sin cargo adicional** (<https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf> **[OFICIAL]**). Matiz: el archivo m consolidado puede contener pedimentos de varios clientes; lo exigible es el expediente del pedimento propio. No se requiere "membresía" para poseer los archivos; el prevalidador (CAAAREM, CLAA, ANMEC, etc., autorización por ficha 26/LA; tarifa 2026: $350/pedimento = $330 aprovechamiento + $20 prevalidador, regla 1.8.3) es parte del ciclo de transmisión, no del acceso al archivo.

**Campos relevantes.** Todo el contenido fiscal del pedimento nace aquí: 501 (clave pedimento, aduana-sección, RFC, tipo de cambio, **incrementables campos 12-15 y decrementables 31-35**), 505 (**número de CFDI o acuse de valor/COVE**, INCOTERM, moneda, valores, proveedor), 509/510 y 556/557 (**tasas y contribuciones por clave/forma de pago, nivel pedimento y partida**), **551 (fracción 8 dígitos + NICO "subdivisión" + valores + vinculación + método de valoración + países)**, 553 (permisos/NOMs), 507/554 (identificadores), 512 (descargos IMMEX), 701/702 (rectificaciones).

### c) Datastage del SAT/ANAM

**Qué es.** La extracción oficial de operaciones que la autoridad entrega al contribuyente. Trámite: **"Solicitud de información de operaciones de comercio exterior"** (ANAM): *"La información se entregará bajo el esquema mensual con el formato DataStage"* — <https://www.anam.gob.mx/solicitud-de-informacion-de-operaciones-de-comercio-exterior/> **[OFICIAL]** (2026-07-16). Fundamento: **LA 144-XXVI + Reglamento Interior ANAM + CFF 18/19/33/34** (no es regla RGCE; no confundir con la 1.1.10 de copias certificadas).

**Quién y cómo.** Persona física, moral o agente aduanal **titular**, con **oficio de matriz de seguridad** vigente (trámite previo: respuesta 10 días hábiles, vigencia 3 años — <https://www.anam.gob.mx/solicitud-de-oficio-de-matriz-de-seguridad/> **[OFICIAL]**). Con matriz activa: **envío automático mensual por correo** (primeros 15 días naturales, mes inmediato anterior); históricos por solicitud (30-60 días hábiles). Costo oficial: no especificado (secundarias lo reportan gratuito).

**¿Layout documentado? SÍ — oficial.** "Consulta Data Stage — Descripción de campos", ANAM **abril 2022**, 25 pp.: <https://anam.gob.mx/wp-content/uploads/2022/04/Formato-Consulta-Data-Stage-190422.docx.pdf> **[OFICIAL]** (verificado por extracción; versión jul-2021 también disponible). ZIP de archivos **.asc pipe-delimited**; **25 tablas** con la MISMA numeración semántica que el archivo M (501 generales, 502-512, 520, 551 partidas, 552-558, 701/702) + **Selección automatizada (semáforo 0 Rojo/1 Verde, fechas 1a/2a selección)** e **Incidencias del reconocimiento aduanero (grado S/G/C)** — dos tablas que NO existen en el archivo M y son oro para riesgo. Llaves de relación documentadas: patente + pedimento + sección (+ secuencia de fracción a nivel partida).

**Campos relevantes.** Fracción (8, TIGIE) + "Subdivisión de la fracción" (la palabra NICO **no** aparece en el doc oficial — equivalencia no afirmable con fuente pública), valores completos, incrementables/deducibles totales, clave de documento (Apéndice 2 → régimen se **deriva**, no viene como campo), contribuciones por partida con forma de pago, identificadores G/P, permisos, fechas de pago real, transporte/guías/contenedores. **COVE/e-document: NO nombrados en el layout oficial** (tabla 505 solo "Número de la Factura").

### d) COVE / e-documents XML vía VUCEM

**Qué es.** El **Comprobante de Valor Electrónico** (acuse de valor): XML transmitido a la Ventanilla Digital previo al despacho con los datos de valor del CFDI/documento equivalente (RGCE 2026 reglas **1.9.16-1.9.18** individual/consolidado/retransmisión + **3.1.8** datos; e-documents de RRNA: regla **3.1.31**). Texto oficial RGCE: <https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf> **[OFICIAL]**.

**¿Documentado? SÍ, con WSDLs vivos.** Página oficial de descargas <https://www.ventanillaunica.gob.mx/vucem/descargas.html> **[OFICIAL]**: WSDL+XSD COVE, ejemplos, **"Diccionario de Datos WS COVE" (nov-2020)**, XSD de digitalización, WSDLs de pedimentos. WSDLs verificados HTTP 200 el 2026-07-16: `RecibirCoveService`, `ConsultarRespuestaCoveService`, `ConsultarEdocumentService`, `DigitalizarDocumentoService`, `ConsultaAcusesServiceWS` (descarga de acuses PDF por el RFC generador — Hoja Informativa 23, 11-jul-2019).

**Hallazgo decisivo: el COVE NO contiene fracción arancelaria ni INCOTERM.** El diccionario oficial (nov-2020) y la regla 3.1.8 solo exigen: emisor/destinatario/comprador (nombre, RFC/tax ID, domicilio), y por mercancía: descripción genérica, cantidad, unidad, moneda, valor unitario/total/dólares, marca/modelo/serie. La fracción vive en el pedimento. → El COVE **no alcanza solo** para Risk Scorer; sirve como complemento de valor/proveedor.

**Quién.** Transmiten importador/exportador/agente/agencia/apoderado con e.firma (regla 1.9.16). Consulta WS: credencial de web service VUCEM (alta adicional con FIEL), **solo del RFC que generó el trámite**. No hay vía documentada para COVEs de terceros.

### e) Estado del pedimento vía consultas públicas (SOIA y WS VUCEM)

- **SOIA sigue vivo en 2026** (infraestructura SAT `aplicacionesc.mat.sat.gob.mx/SOIANET`, puerta ANAM): <https://www.anam.gob.mx/soia-saai-web/> **[OFICIAL]** (2026-07-16). Portal completo con usuario/contraseña (vigencia 5 años). **Consulta rápida sin usuario, con CAPTCHA**: aduana + año + patente + documento (o VIN/contenedor) — <https://aplicacionesc.mat.sat.gob.mx/SOIANET/oia_consultarap_cep.aspx> (viva 2026-07-16). Devuelve situación y "Movimientos del Pedimento". **Catálogo completo de estados: no documentado públicamente** (solo ejemplos: estado 3 "PRIMERA SELECCIÓN AUTOMATIZADA"/320 "VERDE", estado 7 "DESADUANADO/CUMPLIDO"/710).
- **¿Consulta programática legítima? SÍ, para el titular**: 5 servicios SOAP documentados en el manual oficial VUCEM017396 (<https://www.ventanillaunica.gob.mx/vucem/otros/vucem017396~1.pdf> **[OFICIAL]**, sin fecha, ejemplos 2012) bajo `/ventanilla-ws-pedimentos/`: `ListarPedimentosService`, **`ConsultarPedimentoCompletoService`**, `ConsultarPartidaService`, `ConsultarEstadoPedimentosService`, `ConsultarRemesasService`. Auth: WS-Security UsernameToken (RFC + clave WS) + FIEL. Búsquedas: aduana+patente+fechas, aduana+pedimento, **aduana+COVE/e-document**, aduana+RFC+fechas, contenedor, guía. Diccionario de datos oficial VUCEM024003 ("Pedimento Completo", con partidas **incluyendo fracción TIGIE**): <https://www.ventanillaunica.gob.mx/cs/idcplg?IdcService=GET_FILE&dID=7182&dDocName=VUCEM024003&allowInterrupt=1> **[OFICIAL]**.
- **Sin API para terceros**: el contenido del pedimento es dato reservado (**CFF art. 69**); todos los canales de pedimento completo exigen titularidad. La "Consulta Remota de Pedimentos" (CRP) de ANAM es un **cliente de escritorio** (v1.54.10) sin documentación pública de requisitos ni layout: <https://www.anam.gob.mx/consulta-remota-de-pedimentos/> **[OFICIAL]**. Scraping de la consulta rápida con captcha: NO es vía legítima de producto.

### f) Expediente electrónico del contribuyente

Tres cosas distintas conviven bajo ese nombre:
1. **Obligación del contribuyente/agente** (LA arts. 6, 36-37-A; **162-VII** para el agente): conservar pedimento "en el formato en que fue transmitido" + anexos + acuses, y entregarlo al cliente sin cargo. Es la palanca jurídica para que el usuario de ADUANAI obtenga sus archivos M/expedientes de su agente. **[OFICIAL]** <https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf>
2. **Expediente electrónico VUCEM**: la Ventanilla integra un expediente consultable **solo por el titular con e.firma** (Condiciones de uso 2017: <https://www.ventanillaunica.gob.mx/vucem/otros/CondicionesdeusoVUCEM2017.pdf> **[OFICIAL]**; Decreto VUCEM DOF 14-ene-2011). El titular puede **autorizar a otros RFC** la consulta de sus documentos digitalizados (manual oficial "Agregar RFC de consulta": <https://www.ventanillaunica.gob.mx/vucem/otros/Manual_de_usuario_Agregar_RFC_de_consulta_y_o_documentos_digitalizados.pdf> **[OFICIAL]**) — mecanismo legítimo de delegación relevante para ADUANAI.
3. **Copias certificadas** (regla 1.1.10, formato F1 Anexo 1, $28/hoja, vía Ventanilla Digital): <https://www.anam.gob.mx/copias-certificadas-de-pedimento/> **[OFICIAL]**.

> **Pendiente humano**: la referencia "el que recupera el ANA de AJR" no es verificable desde fuentes públicas ni desde el repo. Hipótesis más probable: es el expediente 162-VII que la agencia entrega, o una consulta VUCEM delegada. **Confirmar con el usuario qué recibe exactamente AJR y en qué formato.**

---

## 0.2 — MATRIZ DE DECISIÓN

| Formato | Cobertura (¿quién lo tiene a la mano?) | Riqueza para Risk Scorer | Parseo | Riesgo de fabricación |
|---|---|---|---|---|
| **b) Archivo M (.txt SAAI)** | Agentes/agencias: ~100% (es su formato de transmisión). Importadores: exigible al agente vía LA 162-VII | **Completa**: fracción+NICO, valores, incrementables, régimen (clave), contribuciones por partida, identificadores, permisos, COVE, rectificaciones | **Determinista**: pipe-delimited, registros numerados, layout oficial campo por campo (v9.0) | **Casi nulo**. Único riesgo: drift de versión (v9.0 es de ago-2021) → se detecta, no se adivina |
| **c) Datastage (.asc ZIP)** | Importadores y agentes titulares con matriz de seguridad (trámite de ~10 días hábiles + envío mensual); NO es inmediato el día 1 | Completa + **exclusiva**: semáforo de selección automatizada e incidencias de reconocimiento (historial de riesgo real) | **Determinista**: pipe-delimited, layout oficial ANAM abr-2022, tablas ~idénticas al archivo M | Casi nulo. Ambigüedad puntual: "Subdivisión"≟NICO (marcar, no asumir) |
| **a) Pedimento PDF (Anexo 22/Anexo 1)** | **Universal**: todo importador recibe su ejemplar | Alta en el formato completo; la forma simplificada M1.5 pura NO trae partidas | **El más difícil**: formato "dinámico por bloques", sin posiciones fijas; render varía por software de agencia (no documentado) → OCR/LLM | **Alto sin mitigación**: extracción LLM puede alucinar dígitos de fracción/importes. Mitigable con validaciones cruzadas (aritmética del cuadro de liquidación, formato 2-2-4-7 del número, fracción ∈ catálogo) y confianza explícita |
| **d) COVE XML (VUCEM WS)** | Titulares con credencial WS VUCEM (alta adicional); solo RFC propio | **Parcial**: valor, mercancías, proveedor/comprador. **Sin fracción, sin INCOTERM** → no alcanza solo | Fácil: XML con XSD/diccionario oficial | Nulo en parseo; el riesgo es de *alcance* (creer que sustituye al pedimento) |
| **e) Estado (SOIA / WS pedimentos)** | Consulta rápida: pública con captcha (no automatizable legítimamente). WS: titular con credencial VUCEM | Solo estado/movimientos (más `ConsultarPedimentoCompleto` para titulares = pedimento entero) | WS: SOAP documentado. SOIA web: no automatizable | Catálogo de estados no público → solo mostrar lo que devuelve, sin interpretar códigos no documentados |
| **f) Expediente electrónico** | Vía agente (162-VII, gratis) o VUCEM titular/delegado | Es un *contenedor* de a/b/d, no un formato propio | Hereda el del contenido | Hereda |

### Recomendación

**Fase 1 = Archivo M (.txt de validación SAAI M3).** Razones: (1) layout oficial, público y completo — cero adivinanza, proveniencia perfecta por registro/campo; (2) parseo determinista sin OCR ni LLM → las señales pueden nacer como `verificado`, no `declarado`; (3) el ICP del producto (agente aduanal / importador con agente) lo tiene o puede exigirlo sin trámite ante autoridad (LA 162-VII); (4) el parser se reutiliza casi entero para Datastage (misma numeración 501/551/556/557…).

**Orden siguiente:**
1. **Fase 2 — Datastage**: mismo modelo normalizado; añade semáforo/incidencias (señal de riesgo que ningún otro formato trae); desbloquea importadores sin acceso a sus archivos M. Su costo es el trámite (matriz de seguridad), no el parseo.
2. **Fase 3 — Pedimento PDF**: cobertura universal como red de captura para quien solo tiene el PDF; extracción LLM (evolución del `document-extractor.ts` existente) **degradada por diseño a confianza media**, con validaciones cruzadas obligatorias y campos críticos confirmables por el usuario.
3. **Fase 4 — COVE XML + WS VUCEM** (opcional/premium): enriquecimiento de valor y estado para clientes que deleguen credenciales VUCEM; también `ConsultarPedimentoCompletoService` como fuente estructurada alternativa para titulares.

**Descalificado como fuente primaria**: scraping de SOIA (captcha + dato reservado CFF 69), CRP (cliente de escritorio sin documentación pública), COVE solo (sin fracción).

---

## 0.3 — MAPA DE CONSUMO (campos extraídos → módulos existentes)

Shapes verificados en el código el 2026-07-16: `Signals` (`server/src/services/risk-scorer/types.ts`), `PedimentoInput`/`PartidaInput` (`prevalidator-v2.ts`), `GlosaSimulationInput` (`glosa-simulator.ts`), `QuoteInput` (`quoter.ts`).

| Campo extraído (registro archivo M ≈ tabla Datastage) | Risk Scorer | Pre-validador | Pre-glosa | Cotizador (re-liquidar) | Expediente 59-V |
|---|---|---|---|---|---|
| Fracción + NICO (551) | `operacion.fraccion/nico` → F3/F4/F5 (validateFraction, padrones, cuotas, NOMs) | `partida.fraccion` | `fractionCode` | `fractionCode` | — |
| Valores aduana/comercial/USD, precio unitario (551) | `valorUnitario` → F1-VAL-01 | `valorAduana/valorComercial/valorUnitario` | `unitValueUSD/totalValueUSD` | `customsValue` | — |
| Incrementables/decrementables (501 c.12-15/31-35) | señal F1-VAL-03 (existencia declarada; el *soporte documental* sigue siendo humano) | encabezado | — | — | inciso g (RLA 81-VIII) |
| Clave de pedimento (501, Apéndice 2) → régimen derivado | `regimen/clavePedimento` → F5 | `clave/regimen` | `regimenCode` | — | — |
| Aduana-sección + patente + número (500/501) | `numeroPedimento` → validatePedimentoNumero | `aduana/patenteAduanal/numero` | `customsCode` | — | — |
| RFC importador (501) | `importadorRfc` → F2 (69-B, padrón) | `rfcImportador` | — | — | — |
| Tipo de cambio y fechas de pago (501/506) | — | `tipoCambio` | — | `exchangeRate` override (TC histórico para re-liquidar) | — |
| Contribuciones por partida: clave/tasa/forma de pago/importe (556/557; 509/510) | señal nueva potencial (pago con clave atípica) | `partida.igi/dta/iva/ieps` | — | **comparación quote vs pagado** = re-liquidación | — |
| Identificadores G/P (507/554, Apéndice 8) | `preferenciaArancelaria` y señales F5 | `identificadores[]` | `appliesTMEC` (identificador TL) | — | — |
| Permisos/NOMs (553) | `documentoRrnaAmparaMercancia` (existencia; vigencia sigue humana) | `permisos[]` | `declaresNOMs/permits` | — | inciso RRNA |
| COVE/factura, INCOTERM, moneda, proveedor (505) | `proveedorLocalizable` (solo datos, no localización) | `factura/cove/incoterm` | `documents.invoice`, `countryProvider` | `incoterm/currency` | incisos a-c (CFDI/doc equivalente) |
| País origen/vendedor (551/505) | `paisOrigen/paisProcedencia` → F5 triangulación | `pais/paisVendedor` | `countryOrigin/countryProvider` | `origin` (cuotas compensatorias) | — |
| Vinculación + método de valoración (551) | señal nueva potencial (F1) | `vinculacion` | `declaresLink` | — | — |
| Descargos (512) | F6 temporales | — | — | — | — |
| Rectificaciones (701/702) | señal nueva (historial de rectificación) | — | — | comparación diferencias | — |
| Semáforo + incidencias (solo Datastage) | **señal nueva de alto valor**: historial rojo/incidencias del RFC | — | — | — | — |
| Pesos/bultos, transporte, guías, candados (501/502/503/516) | — | `pesoBruto/pesoNeto/bultos/transporte/bl` | `weightKg` | `weightKg` (cuotas específicas) | — |

**Lo que NUNCA vendrá en estos archivos** (huecos de expediente permanentes → siempre input humano/documental): transferencias bancarias del pago (59-V-d), contratos, soporte de incrementables, evidencia NOM física, localización real del proveedor, KYC del agente. El lector reduce la captura, no elimina el checklist `declarado`.

### Restricción de diseño: proveniencia obligatoria

Cada campo extraído nace con `{archivo (nombre + SHA-256), formato (M|DATASTAGE|PDF|COVE|WS), ubicación (registro/tabla + posición de campo, o página/bloque en PDF), método (parse-determinista | llm-vision | ws-response), confianza}`. Regla dura alineada con la arquitectura actual del Risk Scorer (`origenSenal`):
- **Solo parse determinista de layout oficial** (archivo M, Datastage, COVE XML, respuesta WS) puede alimentar señales como `verificado`.
- **Extracción LLM/OCR (PDF)** entra como `declarado`-con-evidencia o requiere confirmación del usuario campo por campo; jamás se promueve a `verificado` sin validación cruzada determinista (aritmética de liquidación, catálogo de fracciones, formato de pedimento).
- Ningún campo sin proveniencia entra al sistema. Esta es la semilla de la frontera canónica de datos legales (misma filosofía que `fundamento` en las reglas del Risk Scorer).

Activo existente a reutilizar/absorber: `server/src/services/document-extractor.ts` (extracción LLM de pedimento/COVE/MVE con confidence y cache SHA-256, consumido por `routes/documents.ts`) — hoy sin proveniencia posicional, sin contribuciones/incrementables/identificadores; sería la base de la Fase 3, no de la Fase 1.

---

## 0.4 — MUESTRAS PÚBLICAS

### Para el PDF (formato impreso)
- **Machotes oficiales vigentes (EN BLANCO)**: Anexo 1 RGCE 2026, modelos M1.1/M1.5 y demás (URL arriba) — la mejor referencia estructural. **[OFICIAL]**
- Machotes SAT sueltos (M1.5 ~2020 y versión 2016): blobs del portal SAT (URLs largas en el reporte fuente; verificados 2026-07-16). **[OFICIAL, versiones previas]**
- Escaneo en dominio oficial SE: <https://ventanillaunica.economia.gob.mx/media/Pedimento%20VUI.jpg.pdf> — 2 imágenes de pedimento, contenido/año sin verificar por OCR. **[OFICIAL, sin verificar]**
- **Pedimentos LLENADOS**: solo terceros, mayormente formato viejo y tras registro: Scribd "PEDIMENTO-lleno" (<https://es.scribd.com/document/650629169/PEDIMENTO-lleno>), Scribd doc 56589460 (~2011), Studocu "Ejemplo pedimento autos" IPN (<https://www.studocu.com/es-mx/document/instituto-politecnico-nacional/comercio-internacional/ejemplo-pedimento-autos/118067040>). **[SECUNDARIO]** (2026-07-16)

### Para el archivo M y Datastage
- Los **Lineamientos v9.0** traen ejemplos de cadenas de respuesta (`F9500303XBJZF1E6`, `E9500303500000130409`) y criterios de llenado por campo, pero **NO se localizó ningún archivo m completo de muestra público**. Ídem Datastage: el layout oficial trae descripciones de campo, **sin ZIP de ejemplo**.
- Es viable construir **fixtures sintéticos etiquetados como sintéticos** a partir del layout oficial para el desarrollo del parser (permitido: spike exploratorio, sin commitear a `src/`), pero eso NO valida contra la realidad.

### Dependencia humana (no resolver en Fase 1 sin esto)
> **Para validación final se necesitarán 5-10 pedimentos reales anonimizados por formato** (mínimo: 5 archivos M de distintas agencias/softwares y claves de pedimento variadas, 1-2 entregas Datastage completas, 5 PDFs de distintos softwares de agencia). Sin esto no se puede afirmar que el parser funciona — especialmente por el riesgo de drift del layout v9.0 (2021) y abr-2022 (Datastage). Conseguirlos es tarea del humano (clientes/red de AJR).

---

## NO ENCONTRADO / NO PÚBLICO (consolidado)

1. Render exacto del pedimento PDF por software comercial de agencias — layout no documentado públicamente.
2. Versión de los Lineamientos VOCE-SAAI posterior a v9.0 (ago-2021) y de Datastage posterior a abr-2022 — no localizadas públicamente.
3. Lista oficial consolidada vigente de prevalidadores autorizados — no pública (oficios individuales, ficha 26/LA).
4. Catálogo público de claves de error SAAI (E+12 dígitos) y catálogo completo de estados/subestados del pedimento — no documentados.
5. Equivalencia "Subdivisión de la fracción" (Datastage) = NICO — no afirmable con fuente pública.
6. COVE/e-document nombrados en el layout Datastage — no aparecen.
7. API/WS de estado o contenido de pedimentos para TERCEROS no titulares — no existe documentado (reserva CFF 69).
8. Requisitos/alcance/layout de la Consulta Remota de Pedimentos (CRP) — no documentados públicamente.
9. Norma que obligue a entregar el archivo m crudo multi-cliente (vs. expediente 162-VII por pedimento, que sí es exigible).
10. Muestras oficiales de pedimentos llenados formato 2026 y archivos M/Datastage de ejemplo — no existen públicamente.
11. Costo oficial del Datastage — no especificado en fuente oficial.
12. Publicación en DOF de la 2a RM RGCE 2026 (prórroga MVE) — pendiente al 2026-07-16.

---

*Investigación ejecutada 2026-07-16/17 con verificación por descarga y extracción de texto de los PDFs oficiales (no solo snippets). Textos fuente completos preservados en el scratchpad de la sesión (layouts Datastage 2021/2022, Lineamientos VOCE-SAAI, diccionarios COVE y Consulta de Pedimentos, RGCE 2026, Anexo 1 2026).*
