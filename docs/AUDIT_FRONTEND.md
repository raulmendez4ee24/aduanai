# AUDITORÍA FRONTEND — pre-rediseño v2

**Fecha:** 2026-07-05 · **Alcance:** `client/` completo (solo lectura) · **Método:** censo automatizado (grep/conteos deterministas) + revisión de código página por página + 8 pantallas verificadas en navegador durante sesiones previas (Classifier, History, Login, About, RiskScorer, GlosaSimulator, PreValidator, Analytics). Las calificaciones visuales de pantallas NO renderizadas se basan en señales de código (estados loading/error/empty, consistencia de estilo, monolitos, hex inline) — se indica el criterio, no se endulza.

---

## 1. Stack exacto

| Capa | Qué hay | Versión | Notas |
|---|---|---|---|
| Framework | React + Vite | react 19.2.5 · vite 8.0.8 | SPA clásica, `BrowserRouter` en main.tsx |
| Lenguaje | TypeScript | 6.0.2 | ⚠️ `vite build` NO typechequea → los errores tsc llegan a prod sin ruido |
| Estilos | **Tailwind v4 CSS-first** | tailwindcss 4.2.2 + @tailwindcss/vite | SIN `tailwind.config.*`; tokens en `@theme` de `index.css` (ver §4: están muertos) |
| UI kit | **Ninguno** | — | Todo hecho a mano con clases Tailwind |
| Iconos | lucide-react | 1.8.0 | Uso masivo y consistente |
| Animación | framer-motion | 12.38.0 | Solo 9 archivos; el resto usa keyframes CSS globales |
| Gráficas | recharts | 3.8.1 | Solo 2 archivos (Dashboard, Analytics) |
| Router | react-router-dom | 7.14.1 | 60 rutas declaradas inline en `App.tsx` (498 líneas) |
| Estado global | **Ninguno** | — | 0 `createContext`; todo `useState`/`useEffect` por página; auth = prop-drilling desde App.tsx |
| Cliente de datos | **fetch propio** | `src/lib/api.ts` | **3,826 líneas, 276 llamadas `request<>`**, tipos duplicados a mano del servidor; sin cache, sin dedupe, sin retry; interceptor 401→/login global (bueno) |
| Tests | **Cero** | — | `npm test` = `exit 1`. Sin red de regresión |
| Higiene deps | ⚠️ | — | `devDependencies` VACÍO — typescript, @types y vite viven en `dependencies` |

## 2. Mapa de rutas/pantallas (60 rutas)

Escala 1-5 (5 = consistente, estados completos, sin deuda visible). Criterios de descuento: errores tsc que hoy SHIPPEAN (-1), monolito >500 líneas sin descomponer (-0.5/-1), formularios/subcomponentes inline masivos (-1), secciones hardcodeadas (-1).

### Públicas (9)
| Ruta | Página | Nota | Por qué |
|---|---|---|---|
| `/` y `/about` | About (ES la landing) | 4 | Vista en navegador: pulida, serif display, hero auto-alojado; estilo DISTINTO al de la app (ver Sorpresa #2) |
| `/terminos` `/privacidad` `/cookies` | Terms/Privacy/Cookies | 3 | Texto plano largo, correcto y sin amor |
| `/status` | Status | 3 | Funcional, sin revisión visual profunda |
| `/gracias` | ThankYou | 3 | Trivial |

### Auth (6)
| Ruta | Página | Nota | Por qué |
|---|---|---|---|
| login (embebida) | Login (152 L) | 4 | Vista en navegador: limpia, 2 columnas AuthLayout, animación de entrada |
| registro | Register (430 L) | **2** | Multi-paso entero inline sin componente de steps; el archivo auth más endeudado |
| reset | ResetPassword (228 L) | 3 | Multi-paso inline, usa OTPInput |
| forgot / verificación / invite | Forgot (123) / VerifyEmail (189) / InviteAccept (70) | 4 | Compactas y correctas |

### App autenticada (27)
| Ruta | Página (líneas) | Nota | Por qué / endpoints principales |
|---|---|---|---|
| `/clasificador` | Classifier (741) | 4 | La más rica del producto; monolito máximo pero cada bloque justificado (GRI, antidumping, uso destinado, padrones); progreso por etapas y auto-scroll. `classify, classifyFeedback, quoteScenarios, originRule` |
| `/cotizador` | Quoter (695) | 4 | Multipartida + escenarios + desglose fiscal; monolito sin descomponer. `quoteMulti, quoteScenarios` |
| `/app` | Dashboard (331) | **3** | ⚠️ **3 errores tsc hoy en prod**; por lo demás Promise.allSettled + skeletons correctos. `stats, statsVolume, alerts, inventoryStats…` |
| `/expediente-ia` | ExpedientesAI (322) | **3** | ⚠️ **4 errores tsc hoy en prod**; drag&drop y tabs bien. `documentsList, documentsUploadBatch, crossAudit…` |
| `/inventario` | Inventory (618) | **2** | El peor archivo de la app: 5 formularios grandes inline al final, lógica BOM/FIFO mezclada en el componente. `inventoryStats, bomProducts, assemblies…` |
| `/fiscal` | Fiscal (249) | 3 | 1 error tsc; 5 tabs correctos. `fiscalDashboard, fiscalCredits…` |
| `/logistics` | Logistics (234) | 3 | 1 error tsc; funcional. `logisticsPlans, logisticsOptimize…` |
| `/fracciones` | Fractions (77) | 4 | 1 error tsc; por lo demás la página más limpia. `searchFractions, watchFraction` |
| `/historial` | History (171) | 4 | Vista en navegador: paginación, feedback, aprobación. `classifyHistory, classifyApprove` |
| `/analytics` | Analytics (159) | 4 | Agregados de fuente única (Fase 4.3); sin estados de error explícitos. `stats, statsVolume` |
| `/copilot` | Copilot (216) | 4 | Chat con citas y feedback. `chat, copilotFeedback` |
| `/alertas` | Alerts (321) | 4 | Completa (snooze/ack/watch). 12 endpoints |
| `/mve` | MVE (196) | 4 | Steps limpios, permisos con Lock. `mveExtractInvoice, mveCreate` |
| `/origen-tmec` | OrigenTMEC (533) | 3 | RVC 4 métodos + certificado; monolito justificado a medias. `originAnalyze, originCertificateCreate` |
| `/prevalidador` | PreValidator (373) | 4 | Catálogos oficiales Anexo 22; cuota no declarada = bloqueante. `pedimentoValidate, catalogsAnexo22` |
| `/simulador-glosa` | GlosaSimulator (505) | 4 | Vista en navegador; helpers inline al final. `glosaSimulate, glosaHistory` |
| `/risk-scorer` | RiskScorer (367) | 4 | Recién revisada por el cliente; helpers inline (TriSelect). `riskAssess` |
| `/audit` | AuditTrail (165) | 4 | Verificación de cadena + OTS. `myAuditVerifyChain` |
| `/biblioteca-legal` | BibliotecaLegal (122) | 4 | Única pantalla que muestra `officialUrl`. `legalLibraryList` |
| `/cuotas-activas` | CuotasActivas (96) | 5 | La mejor: compacta, búsqueda dual, expandible. `antidumpingActive` |
| `/cumplimiento` | Cumplimiento (129) | 4 | Trazabilidad por consulta con verifyConsultURL. `complianceReport` |
| `/expediente` | Operations (291) | 4 | Completeness % + checklist. `operationsList, operationDetail` |
| `/precedentes` | Precedents (212) | 4 | ⚠️ corpus detrás está APAGADO por síntesis (switch backend); la UI está lista. `precedentsList` |
| `/settings/*` | Settings/Users (487), Padrones (319), Empresa (146), Index (49) | 3 | Users es pesado (roles+invitaciones inline) |

### Admin (20 rutas, solo SUPERADMIN)
| Grupo | Nota media | Detalle |
|---|---|---|
| Monstruos | **2-3** | AdminLeads (624 L, JSX inline masivo), AdminMonitoring (405, secciones hardcodeadas), AdminKnowledge (363) |
| Operativas | 3 | AdminPadrones, AdminAudit, AdminSecurity — tablas crudas pero completas |
| Simples | 4 | AdminBackups, AdminAntidumping, AdminTimestamps, AdminGlosa, AdminVerifications, AdminCompliance, AdminLegalDocs, AdminDemo, AdminDemoProfiles, AdminPilotos, AdminRenovaciones, AdminDashboard, AdminMetricas, AdminEmpresas — CRUD utilitario, sin pretensión visual (aceptable para admin interno) |

## 3. Inventario de componentes

**15 componentes reales** (más `lib/animations.tsx`):

| Reutilizables tal cual (8) | Refactorizables (3) | Específicos/cuestionables (4) |
|---|---|---|
| AuthLayout (4 usos), Toast (global), ErrorBoundary, OTPInput, PasswordStrength, RFCInput, DemoBanner (9 usos), ROIBanner (5 usos) | ComplianceGauge, NOMExceptionPanel (284 L), OnboardingWizard (254 L — ver Sorpresa #8) | Disclaimer (16 L, trivial), PilotBanner (1 uso), DemoClassifier (351 L, demo), **AppLayout (618 L — ver §7)** |

**La deuda real no está en los componentes que existen sino en los que NO existen** — patrones re-implementados inline:

| Patrón | Variaciones | Instancias | Debería ser |
|---|---|---|---|
| Badge/pill de estado | **12 variaciones** | ~113 | `<Badge />` |
| Spinner | 6 (tamaños/colores) | 29 archivos | `<Spinner />` |
| Empty state | 8 | 24 páginas | `<EmptyState />` |
| Skeleton | 3 | 10 páginas | `<Skeleton />` |
| Modal/dropdown | 5 | 8 archivos | `<Modal />` / `<Dropdown />` |
| **Constante GLASS** | 1 (por suerte) | **copy-paste en 43 archivos** | clase CSS o token |
| Formularios inline dentro de páginas | — | Inventory (5), Register, Users, AdminLeads | archivos propios |

## 4. Sistema de estilos actual

**Hay DOS lenguajes de diseño compitiendo:**

1. **El aspiracional** (`index.css`): `@theme` con 16 tokens de color (forest/sage/sand/cream/charcoal…), 3 fuentes (DM Serif Display/Outfit/JetBrains Mono), keyframes y utilidades `.animate-fade-up` + `.delay-1..10`. Lo usan las páginas Public/auth.
2. **El real** (toda la app autenticada): glassmorphism `GLASS` + paleta **slate/emerald de fábrica de Tailwind**.

Números del censo:

- **Tokens `@theme` de color: 0 usos** en todo `src/**/*.tsx`. La paleta está muerta…
- …pero su valor `#1a1a1a` (--color-charcoal) aparece **213 veces hardcodeado** como hex inline. Alguien usa los VALORES de los tokens sin los tokens.
- **27 hex distintos** regados en tsx. Peores ofensores: `#1a1a1a` ×213, `#f8f8f6` ×14, `#94a3b8` ×7, `#25D366` (verde WhatsApp) ×7, `#10b981` ×7, `#8B8B6A` ×5.
- **19 tamaños de fuente arbitrarios** `text-[Npx]` con ~2,020 usos totales (`text-[12px]` ×567, `text-[11px]` ×487, `text-[10px]` ×377, hasta `text-[9px]` ×64). La escala tipográfica de Tailwind no se usa: TODO es arbitrario.
- slate ×1,870 + emerald ×803 usos — la paleta de facto.
- **62 `style={{}}`** inline (la mayoría widths dinámicos de barras — aceptables — pero también colores).
- Animaciones **globales por nombre de clase** (`.animate-fade-up`, `.delay-3`) usadas en Public: renombrarlas rompe silenciosamente.

## 5. Cómo llegan los datos a la UI

- **Un solo archivo:** `api.ts` (3,826 líneas, 276 métodos, tipos duplicados a mano del backend — sin codegen; el drift servidor↔cliente es silencioso).
- **Patrón universal:** `useState` + `useEffect` + `api.método()` por página. Sin cache, sin invalidación, sin dedupe entre pantallas (Dashboard y Alerts piden `alerts` cada uno por su cuenta; AppLayout además hace polling de unread cada 60s).
- **Interceptor 401 global** con redirect a `/login?expired=1` y guard anti-múltiple (bueno; añadido Fase 4.5).
- **Trazabilidad legal por dato — el hallazgo clave para el rediseño:**
  - Clasificación (`ClassificationResult.legalBasis.legalNotes`): **`{source, text}` — SIN URL ni fecha de cotejo.** La procedencia verificable vive solo en backend (consultHash/Cumplimiento).
  - **RiskScorer SÍ tiene el contrato completo**: `Fundamento {articulo, citaCorta, fuente, url, fechaCotejo}` clickeable por regla — es el patrón que el rediseño debería universalizar.
  - `officialUrl` aparece solo 4 veces en tipos (BibliotecaLegal); `fechaCotejo` solo 1 (RiskScorer).
- Endpoints por pantalla: ver tabla §2 (recolectados página por página).

## 6. Assets

| Asset | Estado |
|---|---|
| **Favicon** | ⚠️ `index.html` apunta a `/vite.svg`… **que NO existe en `public/`** → 404 y tab sin ícono. Nunca se reemplazó el default de Vite |
| **Logo** | No existe como archivo. Es JSX: cuadrito "AI" + texto "ADUANAI" re-dibujado en AppLayout/AuthLayout/About |
| **Imágenes** | `public/assets/hero-puerto.jpg` (auto-alojada Fase 4.9). **Es el ÚNICO archivo en public/**. 0 imágenes remotas restantes |
| **Fuentes** | Google Fonts remotas (DM Serif Display, Outfit 300-700, JetBrains Mono) — dependencia externa + FOUT; sin self-host |
| **Meta/SEO** | `<title>ADUANAI</title>` pelón: sin description, OG, twitter card ni manifest |

## 7. Riesgos para el rediseño

1. **El build no typechequea** (`vite build` sin `tsc`): hoy viajan a prod **10 errores tsc en 5 páginas** (Dashboard 3, ExpedientesAI 4, Fiscal 1, Fractions 1, Logistics 1). Cualquier refactor puede introducir roturas de tipo que NADIE verá hasta runtime. Mitigación previa: añadir `tsc --noEmit` al build y pagar la deuda de 10 errores ANTES de mover nada.
2. **Cero tests frontend**: no hay red. Todo cambio visual/estructural se verifica a mano. (El backend sí tiene tests; el cliente no tiene ni el script.)
3. **AppLayout (618 L) es el cuello de botella**: menú de 37 items hardcodeado en dos arrays, búsqueda Cmd+K + polling + 3 dropdowns + localStorage (`sidebar:collapsedSections:v1`) mezclados con el layout. Y `App.tsx` repite el wrapper `<AppLayout onLogout=… userRole=…>` **49 veces** — cambiar la firma del layout toca 49 sitios.
4. **`api.ts` monolito compartido**: tocar un tipo repercute en 40+ páginas a la vez; sin tests ni typecheck en build, el radio de daño es máximo.
5. **Estilos frágiles**: clases de animación globales usadas por nombre; `GLASS` ×43 (cambiar el look = 43 archivos); tokens muertos que un rediseño podría "revivir" a medias creando un TERCER lenguaje.
6. **Contratos implícitos en localStorage**: `aduanai_token` (leído por api.ts, App.tsx y el interceptor), claves de sidebar.
7. **Stack bleeding-edge** (React 19, Vite 8, TS 6, Tailwind 4, Router 7): ecosistema de librerías de UI aún desigual para estas majors; cuidado al introducir dependencias nuevas.
8. **OnboardingWizard** se monta como overlay global y reaparece por encima de cualquier página (comprobado en navegador durante la sesión del Risk Scorer): cualquier flujo nuevo debe considerar su z-index/estado.
9. Decisiones de producto RECIENTES que el rediseño no debe revertir: confianza = "auto-estimación del modelo" (constante única `lib/confidence.ts`), banners demo/piloto, disclaimers legales por pantalla, fail-closed en clasificación.

## 8. Plan de reuso

| Destino | Qué | Razón |
|---|---|---|
| **CONSERVAR tal cual** | Tipos y métodos de `api.ts` (el contrato), interceptor 401, `lib/confidence.ts`, `lib/format.ts`, `lib/cuota-format.ts`, hooks (`usePermissions`, `useTotalFractions`, `useTenantStatus`), ErrorBoundary, Toast, OTPInput, PasswordStrength, RFCInput, AuthLayout, ComplianceGauge, hero-puerto.jpg | Lógica correcta y probada en prod; el contrato de datos NO es el problema |
| **REFACTORIZAR** | AppLayout (menú → config data-driven, búsqueda → hook, dropdowns → componentes; matar las 49 repeticiones con un layout route), Classifier/Quoter/Inventory/OrigenTMEC/Register/Users/AdminLeads (descomponer secciones inline a archivos), DemoBanner/ROIBanner (unificar patrón banner), api.ts (partir por dominio manteniendo tipos; opcional codegen) | Funcionan pero bloquean la velocidad del rediseño |
| **REESCRIBIR** | Sistema de estilos completo: decidir UNA paleta (matar los tokens muertos o adoptarlos de verdad), escala tipográfica (19 tamaños arbitrarios → 5-6 tokens), design system mínimo (`Badge`, `Spinner`, `EmptyState`, `Skeleton`, `Modal`, `Card/GLASS`), favicon+logo como assets reales, `index.html` (meta/SEO/self-host de fuentes), extensión del patrón `Fundamento` (url+fechaCotejo) a legalNotes de clasificación (requiere cambio de API coordinado) | Es el corazón del rediseño; parcharlo sale más caro que rehacerlo |
| **Pre-requisitos de seguridad** | `tsc --noEmit` en build + arreglar los 10 errores; smoke tests mínimos de las 6 pantallas core; congelar contratos localStorage | Sin esto, el rediseño avanza a ciegas |

---

## Sorpresas (lo que un plan externo no habría anticipado)

1. **El build shippea errores de tipo.** `vite build` no corre tsc; hay 10 errores en 5 páginas EN PRODUCCIÓN hoy, tolerados como "línea base" durante meses de trabajo. Deuda institucionalizada.
2. **La paleta de diseño está muerta pero sus fantasmas viven.** Los 16 tokens `@theme` tienen 0 usos, pero `#1a1a1a` (el valor de `--color-charcoal`) está hardcodeado 213 veces. Existen DOS productos visuales: la landing serif "editorial" (forest/sage) y la app glassmorphism (slate/emerald). El rediseño debe elegir o unificar — si no, nacerá el tercero.
3. **El favicon no existe.** `index.html` → `/vite.svg`, y `public/` solo contiene una foto de puerto. La pestaña del navegador de un SaaS de cumplimiento lleva un 404 de ícono desde el día uno.
4. **`devDependencies` está vacío** — typescript, vite y todos los @types en `dependencies`. Cosmético hasta que alguien haga `npm install --production` en CI.
5. **Los tipos del cliente son una copia manual del servidor** (3,826 líneas): no hay codegen ni fuente compartida; el drift es silencioso y ya pasó antes (History/Analytics).
6. **La trazabilidad legal por dato — el diferenciador del producto — casi no llega a la UI.** Solo RiskScorer muestra fuente+URL+fecha por afirmación legal; el Clasificador (la pantalla estrella) muestra `{source, text}` sin link ni fecha. El rediseño tiene la oportunidad (y el contrato ya inventado) para universalizarlo.
7. **Precedentes es una UI completa sobre un corpus apagado** (los 24 precedentes sintéticos están desactivados por switch de backend desde julio): pantalla lista esperando datos que no existen.
8. **OnboardingWizard emboscador**: overlay global que reaparece encima de páginas ya cargadas (reproducido en navegador); cualquier demo o screenshot del rediseño se lo va a topar.
9. **La landing ES `/about`**: la ruta raíz renderiza AboutPage; no existe una landing separada. Y el "logo" es texto JSX repetido en 3 sitios — no hay identidad gráfica versionada como asset.
10. **43 copias de la misma constante GLASS** — por milagro, con UN solo valor. El look entero de la app cuelga de que nadie haya hecho un typo en 43 pegados.

---

*Generado como fase 0 del rediseño v2. Ningún archivo fuera de este documento fue modificado.*
