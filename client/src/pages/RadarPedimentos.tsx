/**
 * RADAR DE PEDIMENTOS (BETA) — Fase 1.5.
 * Sube un archivo M (SAAI .txt) → POST /api/pedimentos/radar → semáforo del lote.
 * Spec: docs/superpowers/specs/2026-08-12-pedimento-radar-ui-design.md
 * Sistema Sello (docs/DESIGN_SYSTEM.md) — nada de glass/sombras.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanSearch, FileWarning, Upload } from 'lucide-react'
import { api, type RadarResultado, type RadarOk, type RadarFila, type CriterioNormativo } from '../lib/api'
import { Badge, Button, Card, Select } from '../components/ui'

const MAX_BYTES = 2_000_000

const BANDA_TONO: Record<string, 'petroleo' | 'ambar' | 'carmin' | 'neutral'> = {
  VERDE: 'petroleo', AMARILLO: 'ambar', NARANJA: 'ambar', ROJO: 'carmin', ROJO_CRITICO: 'carmin',
}
const BANDA_LABEL: Record<string, string> = {
  VERDE: 'Verde', AMARILLO: 'Amarillo', NARANJA: 'Naranja', ROJO: 'Rojo', ROJO_CRITICO: 'Rojo crítico',
}

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
