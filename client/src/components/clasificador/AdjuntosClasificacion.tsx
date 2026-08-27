/**
 * Adjuntos de una clasificación (Ola 1, Operación 2026-08): ficha técnica,
 * foto, hoja de seguridad. Se guardan como Document con classificationId.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Paperclip, Upload, FileText, Image as ImageIcon, ShieldAlert, File as FileIcon } from 'lucide-react'
import { Button, Badge } from '../ui'
import { apiAdjuntos, archivoABase64, type Adjunto } from '../../lib/api/clasificacion-lote'

const TIPOS = [
  { valor: 'FICHA_TECNICA', label: 'Ficha técnica', icono: FileText },
  { valor: 'FOTO', label: 'Foto', icono: ImageIcon },
  { valor: 'HOJA_SEGURIDAD', label: 'Hoja de seguridad', icono: ShieldAlert },
  { valor: 'OTRO', label: 'Otro', icono: FileIcon },
] as const

const MAX_BYTES = 10 * 1024 * 1024

function tamano(b: number | null): string {
  if (b == null) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export function AdjuntosClasificacion({ classificationId }: { classificationId: string }) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[] | null>(null)
  const [tipo, setTipo] = useState<typeof TIPOS[number]['valor']>('FICHA_TECNICA')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await apiAdjuntos.lista(classificationId)
      setAdjuntos(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cargar los adjuntos.')
      setAdjuntos([])
    }
  }, [classificationId])

  useEffect(() => { void cargar() }, [cargar])

  async function subir(f: File | null) {
    if (!f || subiendo) return
    setError('')
    if (f.size > MAX_BYTES) { setError('El adjunto supera 10 MB.'); return }
    setSubiendo(true)
    try {
      const base64 = await archivoABase64(f)
      const r = await apiAdjuntos.subir(classificationId, { nombre: f.name, mimeType: f.type || 'application/octet-stream', base64, tipo })
      if (r.duplicado) setError('Ese archivo ya estaba adjunto (mismo contenido).')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude subir el adjunto.')
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ''
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    void subir(e.dataTransfer.files?.[0] ?? null)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        className={`border border-dashed rounded-sello px-4 py-4 transition-colors duration-150 ${arrastrando ? 'border-petroleo bg-petroleo-suave' : 'border-linea bg-papel'}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Tipo de adjunto">
            {TIPOS.map(t => (
              <button
                key={t.valor}
                type="button"
                aria-pressed={tipo === t.valor}
                onClick={() => setTipo(t.valor)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-13 rounded-sello-sm border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${tipo === t.valor ? 'bg-petroleo-suave border-petroleo/20 text-petroleo' : 'bg-superficie border-linea text-tinta-suave hover:text-tinta'}`}
              >
                <t.icono className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
          <input ref={input} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.doc,.docx,.xls,.xlsx" onChange={e => void subir(e.target.files?.[0] ?? null)} />
          <Button variante="secundario" tamano="sm" loading={subiendo} onClick={() => input.current?.click()} className="ml-auto">
            <Upload className="w-4 h-4" strokeWidth={1.5} aria-hidden />
            Adjuntar archivo
          </Button>
        </div>
        <p className="text-13 text-tinta-suave mt-2">Arrastra aquí o selecciona. PDF, imagen, Word, Excel o texto; hasta 10 MB. Queda en el expediente de esta clasificación con su hash SHA-256.</p>
      </div>
      {error && <p className="text-sm text-carmin">{error}</p>}
      {adjuntos === null ? (
        <p className="text-sm text-tinta-suave">Cargando adjuntos…</p>
      ) : adjuntos.length === 0 ? (
        <p className="text-sm text-tinta-suave inline-flex items-center gap-1.5"><Paperclip className="w-4 h-4" strokeWidth={1.5} aria-hidden /> Sin adjuntos todavía.</p>
      ) : (
        <ul className="divide-y divide-linea border border-linea rounded-sello">
          {adjuntos.map(a => {
            const t = TIPOS.find(x => x.valor === a.type)
            return (
              <li key={a.id} className="px-3 py-2 flex items-center gap-3 flex-wrap">
                <Badge tono="neutral">{t?.label ?? a.type}</Badge>
                <button
                  type="button"
                  onClick={() => void apiAdjuntos.abrir(classificationId, a.id, a.fileName ?? a.name).catch(e => setError(e instanceof Error ? e.message : 'No pude abrir el adjunto.'))}
                  className="text-sm text-petroleo hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm truncate max-w-xs"
                  title={a.fileName ?? a.name}
                >
                  {a.fileName ?? a.name}
                </button>
                <span className="font-sello-mono text-13 text-tinta-suave">{tamano(a.fileSize)}</span>
                {a.fileHash && <span className="font-sello-mono text-13 text-tinta-suave ml-auto" title={a.fileHash}>sha256 {a.fileHash.slice(0, 12)}…</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
