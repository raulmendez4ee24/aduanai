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
import { clienteActivo } from '../lib/api-core'

const PREFIJO = 'aduanai_estado:'
const TOPE_BYTES = 200 * 1024

// Clave por módulo Y por cliente activo: cambiar de cliente no debe arrastrar
// el formulario del anterior (revisión 27-ago: MVE mandaba el RFC de A con
// X-Cliente-Id de B). Ver `clave` dentro del hook.

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

/**
 * Qué hacer cuando la clave cambia (cambió el cliente activo). Función pura y
 * exportada para poder probarla sin renderizar React.
 *
 * El bug (P3, cuarta revisión — "mi primer texto se perdió durante la carga de
 * la página"): el selector de cliente del topbar resuelve DOS llamadas antes de
 * fijar el cliente activo; cuando responde dispara `aduanai:cliente` y la clave
 * cambia varios cientos de ms DESPUÉS del primer render. Lo tecleado en ese
 * hueco se perdía porque la rehidratación pisaba el estado con lo guardado (o
 * con el inicial vacío).
 *
 * Reglas:
 *  1. Si la clave nueva TIENE estado guardado, gana el guardado (es el
 *     formulario de ese cliente; nunca se arrastra el del anterior — es la
 *     razón por la que la clave lleva el cliente).
 *  2. Si NO hay guardado y el cambio es el "asentamiento" inicial (de sin
 *     cliente a un cliente concreto) y el usuario ya escribió, se CONSERVA lo
 *     tecleado: el usuario no cambió de cliente, la app terminó de cargar.
 *  3. En cualquier otro cambio (cliente A → cliente B) se vuelve al inicial.
 */
export function resolverCambioDeClave<T>(args: {
  base: T
  actual: T
  guardado: T | undefined
  clienteAnterior: string | null
  clienteNuevo: string | null
  sucio: boolean
}): T {
  const { base, actual, guardado, clienteAnterior, clienteNuevo, sucio } = args
  if (guardado !== undefined) {
    return guardado && typeof guardado === 'object' && base && typeof base === 'object' && !Array.isArray(base)
      ? ({ ...(base as object), ...(guardado as object) } as T)
      : guardado
  }
  const asentamiento = clienteAnterior === null && clienteNuevo !== null
  if (asentamiento && sucio) return actual
  return base
}

export function useEstadoPersistente<T>(
  modulo: string,
  inicial: T | (() => T),
  opts: { /** Campos que deben GANAR a lo guardado (p. ej. los que vienen del querystring). */ sobrescribir?: Partial<T> } = {},
): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const [cliente, setCliente] = useState<string | null>(() => clienteActivo())
  useEffect(() => {
    const onCliente = (e: Event) => setCliente((e as CustomEvent<string | null>).detail ?? null)
    window.addEventListener('aduanai:cliente', onCliente)
    return () => window.removeEventListener('aduanai:cliente', onCliente)
  }, [])
  const clave = `${PREFIJO}${modulo}:${cliente ?? '*'}`
  const inicialRef = useRef<T | null>(null)
  const [valor, setValorInterno] = useState<T>(() => {
    const base = typeof inicial === 'function' ? (inicial as () => T)() : inicial
    inicialRef.current = base
    const guardado = leer<T>(clave)
    // Rehidratación superficial: campos nuevos del inicial que el guardado no
    // tenga (deploy con formulario ampliado) se completan con el inicial.
    const sobre = opts.sobrescribir && Object.fromEntries(Object.entries(opts.sobrescribir).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    if (guardado && typeof guardado === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
      return { ...(base as object), ...(guardado as object), ...(sobre ?? {}) } as T
    }
    return guardado ?? base
  })

  // Cambio de cliente activo → releer la clave nueva (o conservar lo tecleado
  // si solo fue el asentamiento inicial del selector). Ver resolverCambioDeClave.
  const claveRef = useRef(clave)
  const clienteRef = useRef(cliente)
  const valorRef = useRef(valor)
  const sucioRef = useRef(false)
  const rehidratando = useRef(false)
  useEffect(() => {
    if (claveRef.current === clave) return
    // Nada de lo escrito se destruye: queda guardado bajo la clave anterior.
    escribir(claveRef.current, valorRef.current)
    const nuevo = resolverCambioDeClave<T>({
      base: inicialRef.current as T,
      actual: valorRef.current,
      guardado: leer<T>(clave),
      clienteAnterior: clienteRef.current,
      clienteNuevo: cliente,
      sucio: sucioRef.current,
    })
    claveRef.current = clave
    clienteRef.current = cliente
    sucioRef.current = Object.is(nuevo, valorRef.current) && sucioRef.current
    // Si el valor cambia, el efecto de escritura de ESTE commit todavía trae el
    // valor viejo: se salta uno para no escribirlo bajo la clave nueva.
    rehidratando.current = !Object.is(nuevo, valorRef.current)
    setValorInterno(nuevo)
  }, [clave, cliente])

  useEffect(() => {
    valorRef.current = valor
    if (claveRef.current !== clave) return
    if (rehidratando.current) { rehidratando.current = false; return }
    escribir(clave, valor)
  }, [clave, valor])

  const setValor = useCallback((v: T | ((prev: T) => T)) => {
    sucioRef.current = true
    setValorInterno(prev => (typeof v === 'function' ? (v as (p: T) => T)(prev) : v))
  }, [])

  const reset = useCallback(() => {
    try { sessionStorage.removeItem(clave) } catch { /* noop */ }
    sucioRef.current = false
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
