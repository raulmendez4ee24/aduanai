/**
 * Estado que SOBREVIVE al cambio de módulo (Operación 2026-08).
 *
 * Problema: React Router desmonta la página al navegar; el formulario que el
 * usuario estaba llenando en Pre-Glosa se perdía al asomarse al Cotizador.
 * Solución: el estado principal de cada módulo vive en `sessionStorage` bajo
 * una clave por módulo (y, si aplica, por cliente activo), y se rehidrata al
 * volver. Es por pestaña del navegador (sessionStorage), se limpia al cerrar
 * sesión (`limpiarEstadosPersistentes`) y nunca guarda archivos/base64 grandes
 * (tope de 200 KB por clave; si se excede, se omite el guardado sin romper).
 *
 * Uso: `const [form, setForm] = useEstadoPersistente('preglosa', FORM_INICIAL)`
 * — misma firma que useState. `reset()` devuelve al inicial y borra la clave.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIJO = 'aduanai_estado:'
const TOPE_BYTES = 200 * 1024

function claveDe(modulo: string): string {
  return `${PREFIJO}${modulo}`
}

function leer<T>(clave: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(clave)
    if (!raw) return undefined
    const envuelto = JSON.parse(raw) as { v: 1; t: number; d: T }
    return envuelto && envuelto.v === 1 ? envuelto.d : undefined
  } catch {
    return undefined
  }
}

function escribir<T>(clave: string, dato: T): void {
  try {
    const raw = JSON.stringify({ v: 1, t: Date.now(), d: dato })
    if (raw.length > TOPE_BYTES) return // adjuntos/base64: no se persisten
    sessionStorage.setItem(clave, raw)
  } catch {
    /* storage lleno o bloqueado: el módulo sigue funcionando en memoria */
  }
}

export function useEstadoPersistente<T>(
  modulo: string,
  inicial: T | (() => T),
): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const clave = claveDe(modulo)
  const inicialRef = useRef<T | null>(null)
  const [valor, setValorInterno] = useState<T>(() => {
    const base = typeof inicial === 'function' ? (inicial as () => T)() : inicial
    inicialRef.current = base
    const guardado = leer<T>(clave)
    // Rehidratación superficial: campos nuevos del inicial que el guardado no
    // tenga (deploy con formulario ampliado) se completan con el inicial.
    if (guardado && typeof guardado === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
      return { ...(base as object), ...(guardado as object) } as T
    }
    return guardado ?? base
  })

  useEffect(() => { escribir(clave, valor) }, [clave, valor])

  const setValor = useCallback((v: T | ((prev: T) => T)) => {
    setValorInterno(prev => (typeof v === 'function' ? (v as (p: T) => T)(prev) : v))
  }, [])

  const reset = useCallback(() => {
    try { sessionStorage.removeItem(clave) } catch { /* noop */ }
    setValorInterno(inicialRef.current as T)
  }, [clave])

  return [valor, setValor, reset]
}

/** Al cerrar sesión: nada del usuario anterior debe rehidratarse. */
export function limpiarEstadosPersistentes(): void {
  try {
    const claves: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(PREFIJO)) claves.push(k)
    }
    claves.forEach(k => sessionStorage.removeItem(k))
  } catch { /* noop */ }
}
