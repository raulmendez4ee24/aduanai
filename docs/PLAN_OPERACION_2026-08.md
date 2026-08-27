# PLAN OPERACIÓN — de demo bonita a herramienta de trabajo (27-ago-2026)

Origen: "Recomendaciones módulo por módulo, con ojos de operación" (27-ago-2026).
Este archivo es el **punto de reanudación** del programa. Se actualiza al cierre
de cada ola. Estados: PENDIENTE / EN CURSO / INTEGRADO (rama mergeada a main) /
VERIFICADO (tests + tsc + prod).

## Principio no negociable

No se fabrican datos legales. Donde la recomendación exige material que solo
existe en fuente oficial (Notas Explicativas —licencia—, jurisprudencia TFJA,
~100 cuotas UPCI con tasas por exportador, reglas específicas de origen
completas, Apéndices íntegros), se construye la **estructura + el pipeline de
carga + la marca "pendiente de fuente oficial"**, nunca el dato inventado.
Regla de la casa: [compliance-data-integrity], [commit-verification-claims].

## Fase 0 — Cimientos (INTEGRADO)

Migración `20260827160000_fase0_cimientos_operacion` (12 tablas, 28 ALTER, 0 DROP):
- `Cliente` (RFC operado por el tenant) + `clienteId` en Classification, Quote,
  Operation, TemporaryImport, Pedimento, GlosaSimulation, RiskAssessment,
  Product, ManifestacionValor, OriginAnalysis, Alert, ClassificationJob,
  TaxCredit, Document.
- Parte = `Product` extendido (nico, noms, usoDestino, paisOrigen,
  versionVigente) + `ProductClassificationVersion` (expediente versionado).
- `ClassificationBatch` + `ClassificationBatchRow` (lote Excel con semáforo).
- Anexo 24: TemporaryImport ← pedimentoPartidaId, productId, tipo
  INSUMO/ACTIVO_FIJO, claveDocumento, vidaUtilMeses, ubicacionId; `Ubicacion`
  (planta/submaquila); Discharge ← constanciaTransferencia, pedimentoPartidaId,
  assemblyId; `CierrePeriodo` (candado mensual); Pedimento ← origenArchivo
  M3/DATASTAGE/MANUAL, layoutVersion, archivoHash; PedimentoPartida ← nico,
  productId.
- Quote ← version, parentQuoteId, vigenciaHasta, escenarios, tcFechaDOF,
  tabuladorId; `TabuladorHonorarios`.
- ManifestacionValor ← metodoValoracion, incrementables, decrementables,
  formaPago, rfcImportador, pesoBrutoKg, plantillaId, estadoTransmision,
  vigenciaHasta; `MVEPlantillaProveedor`.
- RiskAssessment ← folio, evidencia, operationId. Operation ← pedimentoId,
  glosaDocumental, retencionHasta, checklist. Document ← productId,
  classificationId.
- AntidumpingDuty ← exportadorTasas, examenSunsetFecha, fuenteUrl, cotejadoAt,
  esAntielusion.
- `ObligacionCalendario`, `CertificadoOrigenProveedor`,
  `CambioRegimenExpediente`, `SolicitudDictamen`. Tenant ← digestSemanalCanal.

## Ola 1 — Piezas transversales (5 agentes en paralelo, worktrees)

| Rama | Alcance | Estado |
|---|---|---|
| `ola1/catalogo-partes` | Catálogo maestro (pantalla `/catalogo`), versiones, "promover a catálogo" desde Historial, Clasificador consulta el catálogo antes de correr ("ya lo tienes clasificado desde…"), reclasificación con justificación versionada, Historial agrupado por producto + filtros + Excel, feedback como paso, acierto por capítulo | INTEGRADO (main, 27-ago) |
| `ola1/clasificador-lote` | Lote Excel/CSV → cola (ClassificationJob) → semáforo verde/ámbar/rojo → Excel de salida; adjuntos (ficha técnica/foto/HDS) en clasificación; campo uso/destino; comparación contra subpartidas hermanas; botón "solicitar dictamen humano" | INTEGRADO (main, 27-ago) |
| `ola1/multi-cliente-roles` | CRUD Cliente, selector global de cliente en el shell, `clienteId` en listados/creación de todos los módulos, roles capturista/clasificador/glosador/gerente/cliente-consulta, flujo de aprobación (junior propone, patente aprueba) con audit trail | INTEGRADO (main, 27-ago) |
| `ola1/m3-prevalidador-preglosa` | Importar .txt M3 / Data Stage en Pre-validador y Pre-Glosa (parser existente del Radar); Pre-Glosa multipartida; cruce origen-tratado (motor del Cotizador); cuotas por exportador; UMC/UMT; precios estimados; identificadores Apéndice 8; combo de país con catálogo; archivar al expediente; catálogos Anexo 22 completos (claves V5/E1/E2/G1/K1/C1…, Ap. 8, Ap. 9, medios de transporte); congruencias aduana-transporte, docs vacíos, NICO por partida; catálogo de reglas documentado | INTEGRADO (main, 27-ago) |
| `ola1/anexo24-real` | Inventario por pedimento-partida y número de parte con PEPS; importación desde Data Stage/M3; BOM con mermas; descargos desde RT/V1 con constancias; activo fijo separado; plazos por tipo/certificación; submaquila; reportes Anexo 24 formato autoridad exportables (Excel/PDF); cierre mensual con candado; simulador "¿qué pasa si no descargo?" en pesos colgado del pedimento real | INTEGRADO (main, 27-ago) |

## Ola 2 — Módulos (5 agentes)

| Rama | Alcance | Estado |
|---|---|---|
| `ola2/cotizador` | Guardar/duplicar/versionar por cliente; PDF con logo y vigencia (print CSS + folio); IEPS por categoría; cuota compensatoria automática por fracción+país; DTA por tipo de operación; tabulador de honorarios; escenarios guardables; fecha DOF del TC en PDF; export Excel | INTEGRADO (main, 27-ago) |
| `ola2/mve-fiscal` | MVE: método de valoración, incrementables/decrementables, vinculación, forma de pago, RFC, pesos; plantillas por proveedor; lote mensual; vigencia con semáforo; layout de salida Ventanilla; etiqueta honesta "lista para transmitir". Fiscal Guardian: calendario vivo A/AA/AAA, avisos, conciliación crédito vs Anexo 30, simulador "si pierdes la certificación", descargos del crédito como flujo | INTEGRADO (main, 27-ago) |
| `ola2/origen-cuotas` | Origen: salto arancelario automático vía BOM, de minimis, acumulación, LVC/acero-aluminio; certificado 9 elementos prellenado; portal de solicitud a proveedores con vigencias/alertas. Cuotas: tasas por exportador, vigencias/sunset, pipeline de carga UPCI (estructura, sin inventar), enganche Cotizador+Pre-Glosa, alerta de elusión como regla | INTEGRADO (main, 27-ago) |
| `ola2/regulatorio-calendario-regimen` | Watchdog DOF real filtrado por catálogo del cliente; digest semanal email/WhatsApp; acciones en un clic desde la alerta; severidad ponderada por monto. Calendario de obligaciones (módulo nuevo). Asistente F4/F5/A3/RT con impuestos vía Cotizador. Activo fijo IMMEX | INTEGRADO (main, 27-ago) |
| `ola2/copilot-risk-expedientes` | Copilot en contexto del cliente; Clasificador enlaza precedentes por fracción; pipeline admin de carga de corpus/precedentes (sin inventar). Risk Scorer: persistencia por cliente, respaldo documental → verificado, PDF con folio, modo cartera. Expedientes fusionados: checklist a)–h), semáforo, extracción IA, glosa documental automática (factura vs pedimento vs BL vs packing), retención 5 años, paquete de auditoría ZIP | INTEGRADO (main, 27-ago) |

## Ola 3 — Transversal UX y resto

| Rama | Alcance | Estado |
|---|---|---|
| `ola3/defensa-analytics-fracciones` | Vista "Defensa" (Cumplimiento+Auditoría) con certificado de integridad PDF; Analytics real (ahorro, riesgo, equipo, por cliente, export, cuadra con Historial); Fracciones ficha completa + árbol; Logística fuera del menú; Verificación: aviso de privacidad, dónde viven los datos, cifrado, camino SOC 2 | INTEGRADO (main, 27-ago) |
| `ola3/persistencia-y-ayuda` | Estado persistente al cambiar de módulo (hook `useEstadoPersistente` aplicado a cada formulario); botón "?" por módulo con guía + captura de pantalla, auto-abierto en la primera visita | INTEGRADO (hook aplicado en 13 páginas, botón '?' en el shell, 23 capturas reales; faltan capturas de cotizador/copilot/risk/origen/expedientes/cuotas/radar/configuración) |

## Cierre
Integración por ola (merge → tsc → suites → build), revisión adversarial
(Codex), deploy, verificación en prod, actualización de este plan y del libro
de estado en `COMO_FUNCIONA_ADUANAI.md`.
