# Radar de Pedimentos — UI v1 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla `/radar` que sube un archivo M (SAAI .txt), lo evalúa con `POST /api/pedimentos/radar` y muestra el semáforo del lote, más un panel "Criterios actualizados" alimentado por un endpoint nuevo de solo-lectura.

**Architecture:** Todo el trabajo de cliente vive en una página nueva (`RadarPedimentos.tsx`) + tipos/métodos en `api.ts`. En server SOLO se agrega `GET /api/risk/criterios`, que serializa `vigencias.ts` (fuente única — el panel no puede divergir del motor). El parser, el mapper y el motor de riesgo NO se tocan.

**Tech Stack:** React 19 + React Router 7 + Tailwind 4 (sistema **Sello**: `client/src/components/ui/`), Express 5, tests server con `node:assert` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-12-pedimento-radar-ui-design.md` (leerlo antes de empezar).

## Global Constraints

- Cliente se compila con **Node 22** (Node 18 rompe Vite 8). Verifica con `node --version`.
- **Cero fetch crudo en componentes** — todo pasa por `client/src/lib/api.ts`.
- Sistema visual **Sello**: componentes de `client/src/components/ui/`, papel+tinta, **sin sombras/glass** (spec en `docs/DESIGN_SYSTEM.md`). No copiar el estilo `GLASS` de `RiskScorer.tsx` (es legado).
- Copy en español, sentence case. El aviso beta del server se muestra **verbatim** (`avisoValidacion`), nunca parafraseado.
- El server en dev tiene el reader habilitado por defecto (`NODE_ENV !== 'production'`); en prod exige `PEDIMENTO_READER_ENABLED=true`. No cambiar esa lógica.
- Si `tsx` falla con EPERM en sandbox, usa el fallback conocido: `node --loader tsx <archivo>`.
- Commits chicos por task, mensajes en español estilo `feat(radar): …`. NO push / NO deploy en este plan.

---

### Task 1: Server — módulo `criterios` + `GET /api/risk/criterios`

**Files:**
- Create: `server/src/services/risk-scorer/criterios.ts`
- Create: `server/src/tests/criterios.test.ts`
- Modify: `server/src/routes/risk.ts` (junto a `GET /weights`, línea ~130)
- Modify: `server/package.json` (script `test:criterios`)

**Interfaces:**
- Consumes: `PRORROGA_E2` de `./vigencias`, `RULES_VERSION` de `./rules` (ya existen).
- Produces: `listaCriterios(): { rulesVersion: string; criterios: CriterioNormativo[] }` y endpoint `GET /api/risk/criterios` → `{ status: 'ok', data: <eso mismo> }`. Task 2 consume este shape.

- [ ] **Step 1: Test que falla** — `server/src/tests/criterios.test.ts`:

```ts
/**
 * Criterios normativos visibles en producto — el panel "regulación en vivo"
 * DEBE leer los mismos objetos que consume el motor (vigencias.ts).
 * Ejecutar: npm run test:criterios
 */
import { strict as assert } from 'node:assert';
import { listaCriterios } from '../services/risk-scorer/criterios';
import { PRORROGA_E2 } from '../services/risk-scorer/vigencias';
import { RULES_VERSION } from '../services/risk-scorer/rules';

const r = listaCriterios();
assert.equal(r.rulesVersion, RULES_VERSION);

const mve = r.criterios.find(c => c.id === 'PRORROGA_MVE_E2');
assert.ok(mve, 'Falta el criterio PRORROGA_MVE_E2');
assert.equal(mve.vigenciaHasta, PRORROGA_E2.prorrogaHasta);
assert.equal(mve.estado, PRORROGA_E2.estado);
assert.equal(mve.dofFecha, PRORROGA_E2.dofFecha);
assert.equal(mve.urlOficial, PRORROGA_E2.urlOficial);
assert.equal(mve.fechaCotejo, PRORROGA_E2.fechaCotejo);
assert.ok(mve.detalle.includes(PRORROGA_E2.prorrogaHasta), 'El detalle debe citar la fecha de la vigencia');
console.log('  ✓ criterios espeja vigencias.ts (fuente única) — OK');
```

- [ ] **Step 2: Correr y ver que falla** — `cd server && npx tsx src/tests/criterios.test.ts` → debe fallar con "Cannot find module '../services/risk-scorer/criterios'".

- [ ] **Step 3: Implementación** — `server/src/services/risk-scorer/criterios.ts`:

```ts
/**
 * Criterios normativos visibles en producto ("regulación en vivo").
 * FUENTE ÚNICA: los mismos objetos de vigencias.ts que consume el motor —
 * el panel del cliente no puede divergir del scoring porque lee este dato.
 * Para agregar un criterio nuevo: agregar el InstrumentoVigencia en
 * vigencias.ts y espejarlo aquí (lista pensada para crecer).
 */
import { PRORROGA_E2 } from './vigencias';
import { RULES_VERSION } from './rules';

export interface CriterioNormativo {
  id: string;
  titulo: string;
  detalle: string;
  vigenciaHasta: string;
  instrumento: string;
  version: string;
  estado: 'VERSION_ANTICIPADA' | 'PUBLICADA_DOF';
  dofFecha: string | null;
  fechaPublicacionPortal: string;
  fechaCotejo: string;
  urlOficial: string;
}

export function listaCriterios(): { rulesVersion: string; criterios: CriterioNormativo[] } {
  return {
    rulesVersion: RULES_VERSION,
    criterios: [
      {
        id: 'PRORROGA_MVE_E2',
        titulo: 'Prórroga MVE (E2) vigente',
        detalle: `La manifestación de valor electrónica (art. 59-III LA, regla 1.5.1) no es exigible hasta el ${PRORROGA_E2.prorrogaHasta} inclusive; hasta esa fecha aplica el esquema de las RGCE 2025.`,
        vigenciaHasta: PRORROGA_E2.prorrogaHasta,
        instrumento: PRORROGA_E2.instrumento,
        version: PRORROGA_E2.version,
        estado: PRORROGA_E2.estado,
        dofFecha: PRORROGA_E2.dofFecha,
        fechaPublicacionPortal: PRORROGA_E2.fechaPublicacionPortal,
        fechaCotejo: PRORROGA_E2.fechaCotejo,
        urlOficial: PRORROGA_E2.urlOficial,
      },
    ],
  };
}
```

- [ ] **Step 4: Ruta** — en `server/src/routes/risk.ts`, agregar el import arriba y la ruta inmediatamente después de `GET /weights` (misma protección de auth que ya aplica el router):

```ts
import { listaCriterios } from '../services/risk-scorer/criterios';

// Criterios normativos visibles en producto (panel "regulación en vivo").
router.get('/criterios', async (_req: AuthRequest, res: Response) => {
  res.json({ status: 'ok', data: listaCriterios() });
});
```

- [ ] **Step 5: Script npm** — en `server/package.json`, junto a `"test:e2"`:

```json
"test:criterios": "tsx src/tests/criterios.test.ts",
```

- [ ] **Step 6: Verificar** — `cd server && npm run test:criterios` → OK; `npx tsc --noEmit` → 0 errores; `npm run test:e2` sigue 8/8.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/risk-scorer/criterios.ts server/src/tests/criterios.test.ts server/src/routes/risk.ts server/package.json
git commit -m "feat(risk): GET /api/risk/criterios — criterios normativos visibles (fuente única vigencias.ts)"
```

---

### Task 2: Cliente — tipos y métodos en `api.ts`

**Files:**
- Modify: `client/src/lib/api.ts` (tipos al final de la zona de tipos; métodos dentro del objeto `api`)

**Interfaces:**
- Consumes: shape de respuesta de `POST /api/pedimentos/radar` (ver `server/src/routes/pedimento-reader.ts:164-206`) y de `GET /api/risk/criterios` (Task 1).
- Produces: `api.pedimentosRadar(nombreArchivo, contenido, tipoSujeto) → Promise<RadarResultado>` (unión discriminada por `ok`) y `api.riskCriterios()`. Tipos exportados: `RadarHallazgo`, `RadarFila`, `RadarResumen`, `RadarOk`, `RadarError`, `RadarResultado`, `CriterioNormativo`.

**Nota clave:** el helper `request()` existente tira `Error` solo con `message` — perdería los `detalles` del 422 fail-closed. Por eso `pedimentosRadar` usa su propio fetch DENTRO de api.ts (la convención prohíbe fetch en componentes, no en api.ts) y regresa unión discriminada en vez de excepción.

- [ ] **Step 1: Cotejar shapes contra el server** — antes de escribir tipos, abre `server/src/routes/pedimento-reader.ts` (filas: líneas 164-180; resumen: 194-203) y `server/src/services/pedimento-reader/mapper.ts` (tipos de `origenDatos`, `proveniencia`, `excluidos`). Ajusta los tipos de abajo si difieren — los tipos del cliente se copian del server, no se inventan.

- [ ] **Step 2: Tipos** — agregar en `client/src/lib/api.ts`:

```ts
// ——— Radar de pedimentos (BETA — Fase 1.5) ———
export interface RadarHallazgo { codigo: string; mensaje: string; destacado: boolean }

export interface RadarFila {
  pedimento: string;
  numeroPedimento15: string | null;
  partida: number;
  fraccion: string;
  nico: string;
  descripcion: string;
  valorUsd: number | null;
  banda: 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO' | 'ROJO_CRITICO';
  exposicion: number;
  escudoPct: number;
  banderas: string[];
  hallazgos: RadarHallazgo[];
  origenDatos: Record<string, string>;
  proveniencia: Record<string, unknown>;
  assessmentId: string;
}

export interface RadarResumen {
  pedimentosProcesados: number;
  operaciones: number;
  porBanda: Record<string, number>;
  banderas: string[];
  hallazgosDestacados: ({ pedimento: string; partida: number } & RadarHallazgo)[];
  excluidos: unknown[];
  registrosIgnorados: Record<string, number>;
  advertenciasIntegridad: string[];
}

export interface RadarOk {
  ok: true;
  avisoValidacion: string;
  layoutVersion: string;
  resumen: RadarResumen;
  radar: RadarFila[];
}

export interface RadarError {
  ok: false;
  status: number;
  message: string;
  detalles?: string[];
  layoutVersion?: string;
}

export type RadarResultado = RadarOk | RadarError;

export interface CriterioNormativo {
  id: string;
  titulo: string;
  detalle: string;
  vigenciaHasta: string;
  instrumento: string;
  version: string;
  estado: 'VERSION_ANTICIPADA' | 'PUBLICADA_DOF';
  dofFecha: string | null;
  fechaPublicacionPortal: string;
  fechaCotejo: string;
  urlOficial: string;
}
```

- [ ] **Step 3: Métodos** — dentro del objeto `api` (sección nueva al final, antes del cierre):

```ts
// ——— Radar de pedimentos (BETA) ———
pedimentosRadar: async (
  nombreArchivo: string,
  contenido: string,
  tipoSujeto: 'agente' | 'agencia',
): Promise<RadarResultado> => {
  const token = localStorage.getItem('aduanai_token');
  const res = await fetch(`${API_BASE}/pedimentos/radar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ nombreArchivo, contenido, tipoSujeto, declarado: {} }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, never>);
  if (!res.ok) {
    // Misma política de sesión expirada que request() (Fase 4.5).
    if (res.status === 401 && token) {
      if (!redirectingToLogin) {
        redirectingToLogin = true;
        localStorage.removeItem('aduanai_token');
        window.location.href = '/login?expired=1';
      }
      return { ok: false, status: 401, message: 'Tu sesión expiró. Inicia sesión de nuevo.' };
    }
    return {
      ok: false,
      status: res.status,
      message: body.message ?? `Error ${res.status}`,
      detalles: body.detalles,
      layoutVersion: body.layoutVersion,
    };
  }
  return {
    ok: true,
    avisoValidacion: body.avisoValidacion,
    layoutVersion: body.layoutVersion,
    resumen: body.data.resumen,
    radar: body.data.radar,
  };
},

riskCriterios: () =>
  request<{ status: string; data: { rulesVersion: string; criterios: CriterioNormativo[] } }>('/risk/criterios'),
```

- [ ] **Step 4: Verificar** — `cd client && npx tsc --noEmit` → 0 errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "feat(radar): capa API — pedimentosRadar (unión ok/error con detalles 422) y riskCriterios"
```

---

### Task 3: Página `/radar` — ruta, menú, carga y errores

**Files:**
- Create: `client/src/pages/RadarPedimentos.tsx`
- Modify: `client/src/App.tsx` (import + `<Route path="/radar" …>` junto a `/risk-scorer`, línea ~235)
- Modify: `client/src/components/shell/nav.ts` (entrada en `NAV_HERRAMIENTAS` después de 'Pre-validador'; el icono `Radar` de lucide ya lo usa 'Regulatorio' — usar `ScanSearch`)

**Interfaces:**
- Consumes: `api.pedimentosRadar`, tipos `RadarResultado`/`RadarOk`/`RadarError` (Task 2); componentes Sello `Card`, `Button`, `Badge`, `Select` de `../components/ui`.
- Produces: `export function RadarPedimentosPage()`; estado interno `vista: 'idle' | 'cargando' | RadarResultado` que Task 4 extiende con el render de resultados. Deja el render de `vista.ok === true` como `<ResultadoRadar …/>` stub que Task 4 completa.

- [ ] **Step 1: Nav** — en `client/src/components/shell/nav.ts`: agregar `ScanSearch` al import de lucide-react y, tras la línea de Pre-validador en `NAV_HERRAMIENTAS`:

```ts
{ label: 'Radar de pedimentos', path: '/radar', icono: ScanSearch },
```

- [ ] **Step 2: Ruta** — en `client/src/App.tsx`:

```tsx
import { RadarPedimentosPage } from './pages/RadarPedimentos'
// … junto a la ruta de /risk-scorer:
<Route path="/radar" element={<RadarPedimentosPage />} />
```

- [ ] **Step 3: Página (estados idle/cargando/error)** — `client/src/pages/RadarPedimentos.tsx`:

```tsx
/**
 * RADAR DE PEDIMENTOS (BETA) — Fase 1.5.
 * Sube un archivo M (SAAI .txt) → POST /api/pedimentos/radar → semáforo del lote.
 * Spec: docs/superpowers/specs/2026-08-12-pedimento-radar-ui-design.md
 * Sistema Sello (docs/DESIGN_SYSTEM.md) — nada de glass/sombras.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanSearch, FileWarning, Upload } from 'lucide-react'
import { api, type RadarResultado, type RadarOk, type CriterioNormativo } from '../lib/api'
import { Badge, Button, Card, Select } from '../components/ui'

const MAX_BYTES = 2_000_000

type Vista = { fase: 'idle' } | { fase: 'cargando' } | { fase: 'resultado'; r: RadarResultado }

export function RadarPedimentosPage() {
  const [vista, setVista] = useState<Vista>({ fase: 'idle' })
  const [tipoSujeto, setTipoSujeto] = useState<'agente' | 'agencia'>('agente')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const evaluar = useCallback(async (file: File) => {
    setErrorLocal(null)
    if (file.size === 0) { setErrorLocal('El archivo está vacío.'); return }
    if (file.size > MAX_BYTES) { setErrorLocal('El archivo excede 2 MB.'); return }
    // El server valida nombre físico == 801.2 (sin extensión .txt).
    const nombre = file.name.replace(/\.txt$/i, '')
    if (nombre.length === 0 || nombre.length > 64) { setErrorLocal('Nombre de archivo inválido.'); return }
    setVista({ fase: 'cargando' })
    const contenido = await file.text()
    const r = await api.pedimentosRadar(nombre, contenido, tipoSujeto)
    setVista({ fase: 'resultado', r })
  }, [tipoSujeto])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setArrastrando(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void evaluar(f)
  }, [evaluar])

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ScanSearch className="w-5 h-5 text-petroleo" />
        <h1 className="text-xl font-semibold text-tinta">Radar de pedimentos</h1>
        <Badge tono="ambar">Beta</Badge>
      </div>

      {vista.fase === 'idle' && (
        <Card>
          <div
            onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-sello-sm p-10 text-center transition-colors ${arrastrando ? 'border-petroleo bg-petroleo-suave' : 'border-linea'}`}
          >
            <Upload className="w-8 h-8 mx-auto text-tinta-suave" />
            <p className="mt-3 text-tinta">Arrastra aquí el archivo M de tu pedimento (.txt SAAI)</p>
            <p className="text-13 text-tinta-suave mt-1">
              Es el archivo validado que transmite el agente aduanal. Tu agente está obligado a
              entregártelo sin cargo (art. 162-VII de la Ley Aduanera).
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button variante="primario" onClick={() => inputRef.current?.click()}>Elegir archivo</Button>
              <Select
                aria-label="Tipo de sujeto"
                value={tipoSujeto}
                onChange={e => setTipoSujeto(e.target.value as 'agente' | 'agencia')}
              >
                <option value="agente">Agente aduanal</option>
                <option value="agencia">Agencia</option>
              </Select>
            </div>
            <input
              ref={inputRef} type="file" accept=".txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void evaluar(f); e.target.value = '' }}
            />
            {errorLocal && <p className="mt-3 text-13 text-carmin">{errorLocal}</p>}
          </div>
        </Card>
      )}

      {vista.fase === 'cargando' && (
        <Card><p className="text-tinta-suave py-8 text-center">Evaluando el lote contra el motor de riesgo…</p></Card>
      )}

      {vista.fase === 'resultado' && !vista.r.ok && (
        <ErrorRadar error={vista.r} onReset={() => setVista({ fase: 'idle' })} />
      )}

      {vista.fase === 'resultado' && vista.r.ok && (
        <ResultadoRadar r={vista.r} onReset={() => setVista({ fase: 'idle' })} />
      )}
    </div>
  )
}

function ErrorRadar({ error, onReset }: { error: Extract<RadarResultado, { ok: false }>; onReset: () => void }) {
  const esLayout = error.status === 422
  return (
    <Card header={
      <span className="flex items-center gap-2 text-carmin">
        <FileWarning className="w-4 h-4" />
        {esLayout ? 'El archivo no coincide con el layout VOCE-SAAI M3 v9.0' : 'No se pudo evaluar el archivo'}
      </span>
    }>
      <p className="text-tinta">{error.message}</p>
      {esLayout && (
        <>
          {error.detalles && error.detalles.length > 0 && (
            <ul className="mt-2 space-y-1 font-mono text-13 text-tinta-suave list-disc list-inside">
              {error.detalles.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
          <p className="mt-3 text-13 text-tinta-suave">
            Por seguridad no se extrae información parcial de un archivo que no valida contra el
            layout oficial ({error.layoutVersion ?? 'VOCE-SAAI-M3-v9.0-ago2021'}) — puede tratarse
            de una versión distinta del layout o de un archivo corrupto. Referencia: Lineamientos
            Técnicos de Registros VOCE-SAAI M3 (VUCEM).
          </p>
        </>
      )}
      <div className="mt-4"><Button variante="secundario" onClick={onReset}>Intentar con otro archivo</Button></div>
    </Card>
  )
}

// Task 4 reemplaza este stub por el render completo del resultado.
function ResultadoRadar({ r, onReset }: { r: RadarOk; onReset: () => void }) {
  return (
    <Card>
      <p className="text-tinta">{r.resumen.operaciones} operaciones evaluadas.</p>
      <div className="mt-4"><Button variante="secundario" onClick={onReset}>Evaluar otro archivo</Button></div>
    </Card>
  )
}
```

(El import de `useEffect` y `CriterioNormativo` queda listo para Task 4; si el linter se queja de imports sin usar en este punto, déjalos fuera y agrégalos en Task 4.)

- [ ] **Step 4: Verificar** — `cd client && npx tsc --noEmit` → 0; `npm run build` → OK (Node 22). Manual rápido: con `npm run dev` (cliente y server locales), entrar a `/radar`, ver dropzone; subir cualquier `.txt` inválido → estado de error 422 con detalles.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/RadarPedimentos.tsx client/src/App.tsx client/src/components/shell/nav.ts
git commit -m "feat(radar): página /radar — carga de archivo M, estados de error fail-closed (BETA)"
```

---

### Task 4: Página `/radar` — resultado: criterios, resumen y tabla expandible

**Files:**
- Modify: `client/src/pages/RadarPedimentos.tsx` (reemplazar el stub `ResultadoRadar`; agregar `CriteriosCard` y `TablaRadar`)

**Interfaces:**
- Consumes: `RadarOk`, `RadarFila`, `RadarResumen`, `api.riskCriterios`, `CriterioNormativo` (Task 2); `Badge`, `Card`, `Button` Sello.
- Produces: página completa. Sin exports nuevos.

- [ ] **Step 1: Mapa de tonos de banda** (arriba del archivo, tras `MAX_BYTES`):

```tsx
const BANDA_TONO: Record<string, 'petroleo' | 'ambar' | 'carmin' | 'neutral'> = {
  VERDE: 'petroleo', AMARILLO: 'ambar', NARANJA: 'ambar', ROJO: 'carmin', ROJO_CRITICO: 'carmin',
}
const BANDA_LABEL: Record<string, string> = {
  VERDE: 'Verde', AMARILLO: 'Amarillo', NARANJA: 'Naranja', ROJO: 'Rojo', ROJO_CRITICO: 'Rojo crítico',
}
```

- [ ] **Step 2: `CriteriosCard`** — el argumento de venta: el agente VE que el radar sigue la regulación en vivo. Carga `api.riskCriterios()` al montar; si falla, no rompe la página (el panel simplemente no se muestra):

```tsx
function CriteriosCard() {
  const [criterios, setCriterios] = useState<CriterioNormativo[] | null>(null)
  useEffect(() => {
    api.riskCriterios().then(r => setCriterios(r.data.criterios)).catch(() => setCriterios(null))
  }, [])
  if (!criterios || criterios.length === 0) return null
  return (
    <Card denso header={<span className="text-tinta font-medium">Criterios actualizados</span>}>
      <ul className="space-y-2">
        {criterios.map(c => (
          <li key={c.id} className="text-13">
            <span className="text-tinta font-medium">{c.titulo}: </span>
            <span className="text-tinta">{c.detalle} </span>
            <span className="text-tinta-suave">
              {c.instrumento} — {c.version}
              {c.estado === 'VERSION_ANTICIPADA'
                ? ` (Portal SAT ${c.fechaPublicacionPortal}; pendiente de DOF)`
                : ` (DOF ${c.dofFecha})`}
              {' · cotejado '}{c.fechaCotejo}{' · '}
              <a href={c.urlOficial} target="_blank" rel="noreferrer" className="underline text-petroleo">fuente oficial</a>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
```

- [ ] **Step 3: `ResultadoRadar` completo** — reemplaza el stub de Task 3:

```tsx
function ResultadoRadar({ r, onReset }: { r: RadarOk; onReset: () => void }) {
  const { resumen } = r
  const destacados = resumen.hallazgosDestacados
  return (
    <div className="space-y-4">
      {/* Aviso beta — verbatim del server, nunca parafraseado */}
      <div className="border border-ambar/25 bg-ambar-suave rounded-sello-sm px-4 py-2 text-13 text-tinta">
        {r.avisoValidacion} <span className="text-tinta-suave">({r.layoutVersion})</span>
      </div>

      <CriteriosCard />

      {/* Semáforo del lote */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(['VERDE', 'AMARILLO', 'NARANJA', 'ROJO', 'ROJO_CRITICO'] as const).map(b => (
          <Card denso key={b} className="text-center">
            <p className="text-2xl font-semibold text-tinta">{resumen.porBanda[b] ?? 0}</p>
            <Badge tono={BANDA_TONO[b]}>{BANDA_LABEL[b]}</Badge>
          </Card>
        ))}
      </div>

      {destacados.length > 0 && (
        <Card denso header={<span className="text-carmin font-medium">Hallazgos que requieren atención inmediata</span>}>
          <ul className="space-y-2">
            {destacados.map((h, i) => (
              <li key={i} className="text-13 text-tinta">
                <Badge tono="carmin" className="mr-2">{h.codigo}</Badge>
                <span className="text-tinta-suave font-mono">ped. {h.pedimento} · partida {h.partida}</span> — {h.mensaje}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TablaRadar filas={r.radar} />

      {/* Transparencia del parseo — nada se descarta en silencio */}
      <details className="border border-linea rounded-sello-sm px-4 py-2">
        <summary className="text-13 text-tinta-suave cursor-pointer">
          Transparencia del parseo — {resumen.pedimentosProcesados} pedimento(s) procesado(s),{' '}
          {resumen.excluidos.length} excluido(s), {Object.keys(resumen.registrosIgnorados).length} tipo(s) de registro ignorado(s)
        </summary>
        <div className="py-2 space-y-2 text-13 text-tinta">
          {resumen.excluidos.length > 0 && (
            <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(resumen.excluidos, null, 2)}</pre>
          )}
          {Object.keys(resumen.registrosIgnorados).length > 0 && (
            <p className="font-mono">
              Registros ignorados: {Object.entries(resumen.registrosIgnorados).map(([t, n]) => `${n}× tipo ${t}`).join(' · ')}
            </p>
          )}
          {resumen.advertenciasIntegridad.length > 0 && (
            <ul className="list-disc list-inside text-ambar">
              {resumen.advertenciasIntegridad.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
          {resumen.excluidos.length === 0 && Object.keys(resumen.registrosIgnorados).length === 0 &&
            resumen.advertenciasIntegridad.length === 0 && <p className="text-tinta-suave">Sin exclusiones ni advertencias.</p>}
        </div>
      </details>

      <Button variante="secundario" onClick={onReset}>Evaluar otro archivo</Button>
    </div>
  )
}
```

- [ ] **Step 4: `TablaRadar` con fila expandible** — tabla propia en clases Sello (el `DataTable` del sistema no soporta expansión; no lo modificamos):

```tsx
function TablaRadar({ filas }: { filas: RadarFila[] }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <Card denso className="overflow-x-auto">
      <table className="w-full text-13">
        <thead>
          <tr className="text-left text-tinta-suave border-b border-linea">
            <th className="py-2 pr-3">Pedimento</th>
            <th className="py-2 pr-3">Part.</th>
            <th className="py-2 pr-3">Fracción</th>
            <th className="py-2 pr-3">Descripción</th>
            <th className="py-2 pr-3 text-right">Valor USD</th>
            <th className="py-2 pr-3 text-right">Exposición</th>
            <th className="py-2 pr-3 text-right">Escudo</th>
            <th className="py-2">Banda</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const abiertaEsta = abierta === f.assessmentId
            return (
              <FilaRadar key={f.assessmentId} fila={f} abierta={abiertaEsta}
                onToggle={() => setAbierta(abiertaEsta ? null : f.assessmentId)} />
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function FilaRadar({ fila: f, abierta, onToggle }: { fila: RadarFila; abierta: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="border-b border-linea cursor-pointer hover:bg-papel-2">
        <td className="py-2 pr-3 font-mono">{f.numeroPedimento15 ?? f.pedimento}</td>
        <td className="py-2 pr-3">{f.partida}</td>
        <td className="py-2 pr-3 font-mono">{f.fraccion}{f.nico ? ` / ${f.nico}` : ''}</td>
        <td className="py-2 pr-3 text-tinta">{f.descripcion}</td>
        <td className="py-2 pr-3 text-right font-mono">{f.valorUsd != null ? f.valorUsd.toLocaleString('es-MX') : '—'}</td>
        <td className="py-2 pr-3 text-right font-mono">{f.exposicion}</td>
        <td className="py-2 pr-3 text-right font-mono">{f.escudoPct}%</td>
        <td className="py-2"><Badge tono={BANDA_TONO[f.banda] ?? 'neutral'}>{BANDA_LABEL[f.banda] ?? f.banda}</Badge></td>
      </tr>
      {abierta && (
        <tr className="border-b border-linea bg-papel-2">
          <td colSpan={8} className="py-3 px-3">
            {f.hallazgos.length > 0 ? (
              <ul className="space-y-1">
                {f.hallazgos.map((h, i) => (
                  <li key={i} className={h.destacado ? 'text-carmin' : 'text-tinta'}>
                    <span className="font-mono text-tinta-suave">[{h.codigo}]</span> {h.mensaje}
                  </li>
                ))}
              </ul>
            ) : <p className="text-tinta-suave">Sin hallazgos en esta partida.</p>}
            {f.banderas.length > 0 && (
              <p className="mt-2">{f.banderas.map(b => <Badge key={b} tono="carmin" className="mr-1">{b}</Badge>)}</p>
            )}
            {/* Proveniencia: qué campo del archivo alimentó cada dato — la prueba de verificabilidad */}
            <details className="mt-2">
              <summary className="text-13 text-tinta-suave cursor-pointer">Proveniencia por campo (archivo M)</summary>
              <pre className="mt-1 font-mono text-[11px] text-tinta-suave whitespace-pre-wrap">
                {JSON.stringify({ origenDatos: f.origenDatos, proveniencia: f.proveniencia }, null, 2)}
              </pre>
            </details>
          </td>
        </tr>
      )}
    </>
  )
}
```

- [ ] **Step 5: Verificar** — `cd client && npx tsc --noEmit` → 0; `npm run build` → OK.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/RadarPedimentos.tsx
git commit -m "feat(radar): resultado completo — criterios actualizados, semáforo del lote y tabla expandible"
```

---

### Task 5: Verificación integral con fixtures

**Files:**
- Ninguno nuevo (correcciones que salgan van al archivo que corresponda).

**Interfaces:** N/A — verificación end-to-end manual.

- [ ] **Step 1: Levantar entorno** — server: `cd server && npm run dev` (en dev el reader está habilitado por defecto). Cliente: `cd client && npm run dev` (Node 22). Login con usuario local.

- [ ] **Step 2: Fixtures reales del repo** — están en `server/src/tests/fixtures/archivo-m/`: `m3842001.074.txt` (A limpio), `m3842002.074.txt` (B medio), `m3842003.074.txt` (C crítico: RFC 69-B real + cuota CN + fracción muerta 99999999). Subir cada uno en `/radar` y verificar:
  - Los conteos del semáforo == `resumen.porBanda` de la respuesta (ver Network tab).
  - El fixture C muestra los tres hallazgos destacados: `FRACCION_INEXISTENTE`, `LISTADO_69B`, `CUOTA_ACTIVA`, y filas ROJO_CRITICO arriba.
  - La fila expandible muestra hallazgos + proveniencia (`registro.campo@línea`).
  - El panel "Criterios actualizados" muestra la prórroga MVE al 2026-09-30 con "(Portal SAT 2026-07-31; pendiente de DOF) · cotejado 2026-08-12" y el link a la fuente.
  - El aviso beta aparece verbatim en todo resultado.
  - Nota: las bandas de A/B con `declarado: {}` NO tienen que coincidir con las de la paridad 1.4 (esa corrió con `declarado` poblado); lo que se verifica aquí es el render fiel de la respuesta.

- [ ] **Step 3: Fail-closed** — copiar `m3842001.074.txt`, borrarle un pipe a un registro 551, subirlo → estado 422 con detalle "esperados 26 campos, encontrados 25" (o similar) y sin datos parciales.

- [ ] **Step 4: Suite completa** — `cd server && npm run test:criterios && npm run test:e2 && npx tsc --noEmit`; `cd client && npx tsc --noEmit && npm run build`. Todo verde.

- [ ] **Step 5: Commit final (si hubo correcciones) y cierre**

```bash
git add -A && git commit -m "fix(radar): ajustes de verificación integral con fixtures"
```

Actualizar `docs/superpowers/specs/2026-08-12-pedimento-radar-ui-design.md` de "APROBADO" a "IMPLEMENTADO <fecha>" en el mismo commit.

---

## Self-review del plan

- **Cobertura del spec**: carga/dropzone+tipoSujeto (T3), evaluando (T3), resumen+destacados+transparencia (T4), tabla expandible+proveniencia (T4), errores 422/403/413 (T3 — 403/413 caen en el branch genérico de `ErrorRadar` con `message` del server, que ya es descriptivo), criterios endpoint+card (T1/T4), capa API sin fetch en componentes (T2), Sello (T3/T4), verificación con fixtures (T5). `declarado` fuera de v1: la capa API manda `{}` fijo. ✓
- **Tipos consistentes**: `RadarResultado` unión discriminada usada en T3/T4; `CriterioNormativo` idéntico server/cliente; `RadarOk` en props de `ResultadoRadar`. ✓
- **Riesgo señalado**: los shapes de `origenDatos`/`proveniencia`/`excluidos` se cotejan contra el server en T2-Step 1 (no se inventan). ✓
