/**
 * RADAR DE PEDIMENTOS (BETA) — Fase 1.5.
 * Sube un archivo M (SAAI .txt) → POST /api/pedimentos/radar → semáforo del lote.
 * Spec: docs/superpowers/specs/2026-08-12-pedimento-radar-ui-design.md
 * Sistema Sello (docs/DESIGN_SYSTEM.md) — nada de glass/sombras.
 */
import { useCallback, useRef, useState } from 'react'
import { ScanSearch, FileWarning, Upload } from 'lucide-react'
import { api, type RadarResultado, type RadarOk } from '../lib/api'
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
