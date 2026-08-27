/**
 * SELLO · Importar archivo M3 / Data Stage (Operación 2026-08).
 *
 * Drag & drop (o click) → base64 → POST /api/pedimentos/importar → devuelve
 * los pedimentos persistidos. El padre decide qué hacer con el id (llenar el
 * formulario, correr la Pre-Glosa multipartida…). Muestra el aviso honesto
 * cuando el layout es Data Stage (pendiente de cotejo oficial) y lista lo
 * que el archivo NO trae (datosNoDisponibles), sin fabricar nada.
 */
import { useRef, useState, type DragEvent } from 'react'
import { FileUp, FileCheck2, ShieldAlert, History } from 'lucide-react'
import { Button, Badge } from '../ui'
import { apiPedimentos, archivoABase64, type ImportarResultado, type PedimentoImportado } from '../../lib/api/pedimentos'

const NO_DISPONIBLE: Record<string, string> = {
  bultos: 'bultos', pesoNeto: 'peso neto', bl: 'BL / guía', cove: 'COVE', tipoCambioFecha: 'fecha del TC',
}

export interface ImportarArchivoProps {
  /** Se llama con cada pedimento importado (id) y el resultado completo. */
  onImportado: (pedimentoId: string, resultado: ImportarResultado) => void
  /** Etiqueta del botón principal. */
  etiqueta?: string
  /** Permite elegir uno ya importado (lista del tenant). */
  permitirRecientes?: boolean
}

export function ImportarArchivo({ onImportado, etiqueta = 'Importar archivo M3 / Data Stage', permitirRecientes = true }: ImportarArchivoProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<{ mensaje: string; detalles?: string[] } | null>(null)
  const [resultado, setResultado] = useState<ImportarResultado | null>(null)
  const [recientes, setRecientes] = useState<PedimentoImportado[] | null>(null)

  async function procesar(file: File) {
    setCargando(true); setError(null); setResultado(null)
    try {
      const b64 = await archivoABase64(file)
      const r = await apiPedimentos.importar(file.name, b64)
      setResultado(r.data)
      if (r.data.pedimentos[0]) onImportado(r.data.pedimentos[0].id, r.data)
    } catch (e) {
      const err = e as Error & { detalles?: string[] }
      setError({ mensaje: err.message || 'No se pudo importar el archivo.', detalles: err.detalles })
    } finally { setCargando(false) }
  }

  function onDrop(ev: DragEvent<HTMLDivElement>) {
    ev.preventDefault(); setArrastrando(false)
    const f = ev.dataTransfer.files?.[0]
    if (f) void procesar(f)
  }

  async function verRecientes() {
    try { const r = await apiPedimentos.importados(); setRecientes(r.data) }
    catch (e) { setError({ mensaje: e instanceof Error ? e.message : 'No se pudieron cargar los pedimentos importados.' }) }
  }

  return (
    <div className="space-y-3 font-sello-ui">
      <div
        role="button" tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        className={`rounded-sello border border-dashed px-5 py-6 text-center cursor-pointer transition-colors ${arrastrando ? 'border-petroleo bg-petroleo-suave' : 'border-linea bg-papel-2/50 hover:bg-papel-2'}`}
      >
        <input ref={inputRef} type="file" accept=".txt,.csv,.074,.dat,text/plain,text/csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void procesar(f); e.target.value = '' }} />
        <FileUp className="w-6 h-6 mx-auto text-tinta-suave" strokeWidth={1.5} aria-hidden />
        <p className="text-base text-tinta mt-2">{cargando ? 'Leyendo archivo…' : etiqueta}</p>
        <p className="text-sm text-tinta-suave mt-1">
          Arrastra aquí el .txt del SAAI M3 (mppppnnn.ddd, layout v9.0) o el CSV/TXT de Data Stage con encabezados. Nada se recaptura: el archivo es la entrada.
        </p>
      </div>

      {permitirRecientes && (
        <div className="flex items-center gap-2">
          <Button variante="ghost" tamano="sm" onClick={verRecientes} type="button">
            <History className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Usar un pedimento ya importado
          </Button>
        </div>
      )}

      {recientes && (
        <div className="rounded-sello border border-linea bg-superficie divide-y divide-linea max-h-64 overflow-y-auto">
          {recientes.length === 0 && <p className="text-sm text-tinta-suave px-4 py-3">Aún no hay pedimentos importados en esta cuenta.</p>}
          {recientes.map(p => (
            <button key={p.id} type="button" onClick={() => { setRecientes(null); onImportado(p.id, { layout: (p.origenArchivo as 'M3' | 'DATASTAGE') ?? 'M3', layoutVersion: p.layoutVersion ?? '', archivoHash: '', pedimentos: [{ id: p.id, numero: p.numero, clave: p.clave, partidas: p._count.partidas, reutilizado: true, datosNoDisponibles: [] }], excluidos: [], advertencias: [], avisoLayout: null }) }}
              className="w-full text-left px-4 py-2.5 hover:bg-papel-2 flex items-center gap-3">
              <span className="font-sello-mono text-sm text-tinta">{p.numero ?? p.id.slice(-8)}</span>
              <span className="text-sm text-tinta-suave">{p.clave} · aduana {p.aduana} · {p._count.partidas} partida(s)</span>
              <Badge tono={p.origenArchivo === 'DATASTAGE' ? 'ambar' : 'petroleo'} className="ml-auto">{p.origenArchivo ?? 'manual'}</Badge>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-sello border border-carmin/30 bg-carmin-suave p-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-5 h-5 text-carmin shrink-0" strokeWidth={1.5} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-carmin">Archivo rechazado (fail-closed)</p>
              <p className="text-sm text-tinta mt-0.5 break-words">{error.mensaje}</p>
              {error.detalles && error.detalles.length > 0 && (
                <ul className="mt-2 space-y-0.5 font-sello-mono text-13 text-tinta-suave">{error.detalles.map((d, i) => <li key={i}>{d}</li>)}</ul>
              )}
            </div>
          </div>
        </div>
      )}

      {resultado && (
        <div className="rounded-sello border border-linea bg-superficie p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <FileCheck2 className="w-5 h-5 text-sello" strokeWidth={1.5} aria-hidden />
            <p className="text-sm text-tinta">
              {resultado.pedimentos.length} pedimento(s) {resultado.pedimentos.every(p => p.reutilizado) ? 'ya estaban importados (mismo archivo)' : 'importados'} · layout <span className="font-sello-mono">{resultado.layout}</span>
            </p>
            <Badge tono={resultado.layout === 'DATASTAGE' ? 'ambar' : 'petroleo'}>{resultado.layoutVersion}</Badge>
          </div>
          {resultado.avisoLayout && <p className="text-sm text-ambar">{resultado.avisoLayout}</p>}
          {resultado.pedimentos.map(p => (
            <p key={p.id} className="text-sm text-tinta-suave">
              <span className="font-sello-mono text-tinta">{p.numero ?? p.id.slice(-8)}</span> · {p.clave} · {p.partidas} partida(s)
              {p.datosNoDisponibles.length > 0 && <> · el archivo no trae: {p.datosNoDisponibles.map(d => NO_DISPONIBLE[d] ?? d).join(', ')} (quedan «no evaluados», no se inventan)</>}
            </p>
          ))}
          {resultado.excluidos.map(e => <p key={e.numeroPedimento7} className="text-sm text-ambar">Excluido {e.numeroPedimento7}: {e.motivo}</p>)}
          {resultado.advertencias.map((a, i) => <p key={i} className="text-13 text-tinta-suave">{a}</p>)}
        </div>
      )}
    </div>
  )
}
