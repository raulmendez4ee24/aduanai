import { Component, ErrorInfo, ReactNode } from 'react'

// DEV de forma segura (no truena si import.meta.env no existe, p.ej. en tests SSR).
const IS_DEV = (() => { try { return !!import.meta.env?.DEV } catch { return false } })()

interface Props {
  children: ReactNode
  /** Si cambia, el boundary se reinicia (p.ej. la ruta actual). */
  resetKey?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary global. Si CUALQUIER componente hijo lanza un error durante el
 * render, en vez de dejar la pantalla en blanco muestra un mensaje amigable y
 * opciones de recuperación. Un error en un módulo NO tira toda la app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidUpdate(prev: Props) {
    // Reinicia el estado de error al cambiar de ruta para no quedar atascado.
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log para diagnóstico (visible en consola y en logs del navegador).
    console.error('[ErrorBoundary] Componente crasheó:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{ fontFamily: "'Outfit', sans-serif" }}
        className="min-h-screen flex items-center justify-center bg-[#f8f8f6] px-6"
      >
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#1a1a1a] mb-2">Algo salió mal</h1>
          <p className="text-[14px] text-[#666] leading-relaxed mb-6">
            Ocurrió un error inesperado en esta sección. Tus datos están a salvo.
            Recarga la página para continuar; si el problema persiste, contacta a soporte.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#1a1a1a] text-white text-[14px] font-semibold hover:bg-black transition-colors"
            >
              Recargar página
            </button>
            <a
              href="/app"
              className="px-5 py-2.5 rounded-xl border border-[#e5e5e0] text-[#333] text-[14px] font-semibold hover:bg-white transition-colors"
            >
              Ir al inicio
            </a>
          </div>
          {IS_DEV && this.state.error && (
            <pre className="mt-6 text-left text-[11px] text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
