/**
 * SELLO · /design-system — espejo de QA visual (docs/DESIGN_SYSTEM.md §8).
 * Solo build de desarrollo (gate en App.tsx con import.meta.env.DEV).
 * Muestra tokens, escala tipográfica y todos los componentes base con sus
 * variantes/estados. Toda revisión de rediseño empieza aquí.
 */
import { useState } from 'react'
import { FileSearch, Inbox } from 'lucide-react'
import {
  Button, Card, Badge, SelloVerificacion, Input, Select, Textarea, DataTable, EmptyState,
  type Columna,
} from '../components/ui'

const COLORES: { token: string; clase: string; uso: string }[] = [
  { token: 'papel', clase: 'bg-papel', uso: 'Fondo de la app' },
  { token: 'papel-2', clase: 'bg-papel-2', uso: 'Fondos alternos, zebra, sidebar' },
  { token: 'superficie', clase: 'bg-superficie', uso: 'Cards, paneles, modales' },
  { token: 'tinta', clase: 'bg-tinta', uso: 'Texto principal' },
  { token: 'tinta-suave', clase: 'bg-tinta-suave', uso: 'Texto secundario, labels' },
  { token: 'linea', clase: 'bg-linea', uso: 'Todos los bordes (1px)' },
  { token: 'petroleo', clase: 'bg-petroleo', uso: 'Primario: acciones, links, focus' },
  { token: 'petroleo-suave', clase: 'bg-petroleo-suave', uso: 'Fondos activos/seleccionados' },
  { token: 'sello', clase: 'bg-sello', uso: 'SOLO verificación' },
  { token: 'ambar', clase: 'bg-ambar', uso: 'Advertencias, sin verificar' },
  { token: 'ambar-suave', clase: 'bg-ambar-suave', uso: 'Fondo de advertencias' },
  { token: 'carmin', clase: 'bg-carmin', uso: 'Errores/hallazgos críticos (escaso)' },
  { token: 'carmin-suave', clase: 'bg-carmin-suave', uso: 'Fondo de errores' },
]

const ESCALA: { clase: string; px: string; uso: string }[] = [
  { clase: 'text-13', px: '13', uso: 'Caption, encabezados de tabla' },
  { clase: 'text-sm', px: '14', uso: 'Secundario' },
  { clase: 'text-base', px: '16', uso: 'Base (cuerpo)' },
  { clase: 'text-lg', px: '18', uso: 'Énfasis' },
  { clase: 'text-22', px: '22', uso: 'Título de sección' },
  { clase: 'text-28', px: '28', uso: 'Título de página' },
  { clase: 'text-4xl', px: '36', uso: 'Display' },
  { clase: 'text-5xl', px: '48', uso: 'Cifra protagonista' },
]

interface FilaDemo { fraccion: string; descripcion: string; cuota: string; fecha: string }
const FILAS_DEMO: FilaDemo[] = [
  { fraccion: '7318.15.01', descripcion: 'Tornillos de acero inoxidable', cuota: '1.74 USD/kg', fecha: '15-ago-2024' },
  { fraccion: '6404.19.01', descripcion: 'Calzado con suela de caucho', cuota: '4.72 USD/par', fecha: '12-jun-2026' },
  { fraccion: '8517.13.01', descripcion: 'Teléfonos inteligentes', cuota: '—', fecha: '01-ene-2026' },
]

const COLS_DEMO: Columna<FilaDemo>[] = [
  { key: 'fraccion', header: 'Fracción', mono: true, render: f => f.fraccion },
  { key: 'desc', header: 'Descripción', render: f => f.descripcion },
  { key: 'cuota', header: 'Cuota', align: 'right', mono: true, render: f => f.cuota },
  { key: 'fecha', header: 'Publicación DOF', align: 'right', mono: true, render: f => f.fecha },
]

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-sello-display text-22 text-tinta border-b border-linea pb-2">{titulo}</h2>
      {children}
    </section>
  )
}

export function DesignSystemPage() {
  const [conError, setConError] = useState(true)

  return (
    <div className="min-h-screen bg-papel font-sello-ui text-tinta">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        <header>
          <p className="text-13 uppercase tracking-wide text-tinta-suave">Sistema de diseño · v1.0</p>
          <h1 className="font-sello-display text-4xl text-tinta mt-1">Sello</h1>
          <p className="text-base text-tinta-suave mt-2 leading-relaxed max-w-2xl">
            Instrumento oficial mexicano: sobrio, preciso, confiable. Este espejo muestra los tokens y
            componentes base — toda revisión visual del rediseño empieza aquí. Especificación completa
            en <span className="font-sello-mono text-sm">docs/DESIGN_SYSTEM.md</span>.
          </p>
        </header>

        <Seccion titulo="Tokens de color">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {COLORES.map(c => (
              <div key={c.token} className="flex items-center gap-3 bg-superficie border border-linea rounded-sello p-3">
                <span className={`w-10 h-10 rounded-sello-sm border border-linea shrink-0 ${c.clase}`} />
                <div className="min-w-0">
                  <p className="font-sello-mono text-sm text-tinta">{c.token}</p>
                  <p className="text-13 text-tinta-suave truncate">{c.uso}</p>
                </div>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Tipografía">
          <div className="grid md:grid-cols-3 gap-4">
            <Card denso header={<p className="text-13 uppercase tracking-wide text-tinta-suave">Display — Spectral 600</p>}>
              <p className="font-sello-display text-28">Dictamen de clasificación arancelaria</p>
            </Card>
            <Card denso header={<p className="text-13 uppercase tracking-wide text-tinta-suave">UI — Public Sans</p>}>
              <p className="text-base leading-relaxed">El agente aduanal responde por la veracidad y exactitud de los datos suministrados en el despacho.</p>
            </Card>
            <Card denso header={<p className="text-13 uppercase tracking-wide text-tinta-suave">Datos — IBM Plex Mono (tabular)</p>}>
              <p className="font-sello-mono text-base">7318.15.01 · $12,480.00<br />DOF 19-nov-2025 · F-2026-0041</p>
            </Card>
          </div>
          <div className="bg-superficie border border-linea rounded-sello divide-y divide-linea">
            {ESCALA.map(e => (
              <div key={e.clase} className="flex items-baseline gap-6 px-5 py-3">
                <span className="font-sello-mono text-13 text-tinta-suave w-20 shrink-0">{e.px}px</span>
                <span className={`${e.clase} text-tinta`}>Cumplimiento verificable</span>
                <span className="text-13 text-tinta-suave ml-auto shrink-0">{e.uso}</span>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Button">
          <div className="flex flex-wrap items-center gap-3">
            <Button variante="primario">Generar reporte</Button>
            <Button variante="secundario">Ver expediente</Button>
            <Button variante="destructivo">Eliminar borrador</Button>
            <Button variante="ghost">Cancelar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button tamano="sm">Descargar acuse</Button>
            <Button tamano="md">Validar pedimento</Button>
            <Button tamano="lg">Clasificar producto</Button>
            <Button loading>Consultando DOF…</Button>
            <Button disabled>Sin permisos</Button>
          </div>
        </Seccion>

        <Seccion titulo="Badge">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Neutral</Badge>
            <Badge tono="petroleo">Activo</Badge>
            <Badge tono="ambar">Declarado por usuario</Badge>
            <Badge tono="carmin">Hallazgo crítico</Badge>
          </div>
        </Seccion>

        <Seccion titulo="SelloVerificacion — el componente firma">
          <p className="text-sm text-tinta-suave">Pasa el cursor o navega con teclado (Enter abre, Escape cierra) para ver la procedencia.</p>
          <div className="flex flex-wrap items-center gap-6 bg-superficie border border-linea rounded-sello p-6">
            <div className="space-y-2">
              <p className="text-13 text-tinta-suave">verificado</p>
              <SelloVerificacion
                estado="verificado"
                fuenteNombre="DOF"
                fuenteUrl="https://www.dof.gob.mx/nota_detalle.php?codigo=5773357&fecha=19/11/2025"
                fechaPublicacion="2026-06-12"
                fechaVerificacion="2026-07-04"
                metodo="manual"
              />
            </div>
            <div className="space-y-2">
              <p className="text-13 text-tinta-suave">sin_verificar</p>
              <SelloVerificacion estado="sin_verificar" fuenteNombre="Proveedor" metodo="manual" />
            </div>
            <div className="space-y-2">
              <p className="text-13 text-tinta-suave">vencido</p>
              <SelloVerificacion
                estado="vencido"
                fuenteNombre="SNICE"
                fuenteUrl="https://www.snice.gob.mx"
                fechaPublicacion="2024-01-19"
                fechaVerificacion="2025-01-10"
                metodo="scraper"
              />
            </div>
          </div>
          <Card denso header={<p className="text-13 uppercase tracking-wide text-tinta-suave">En contexto (junto al dato legal)</p>}>
            <p className="text-base leading-relaxed">
              Cuota compensatoria <span className="font-sello-mono">1.74 USD/kg</span> para <span className="font-sello-mono">7318.15.01</span> origen CN{' '}
              <SelloVerificacion
                estado="verificado"
                fuenteNombre="DOF"
                fuenteUrl="https://www.dof.gob.mx"
                fechaPublicacion="2024-08-15"
                fechaVerificacion="2026-07-04"
                metodo="manual"
                className="align-middle"
              />
            </p>
          </Card>
        </Seccion>

        <Seccion titulo="Formularios">
          <div className="grid md:grid-cols-2 gap-6 bg-superficie border border-linea rounded-sello p-6">
            <Input label="Fracción arancelaria" placeholder="7318.15.01" mono requerido hint="8 dígitos, con o sin puntos" />
            <Input
              label="RFC del importador"
              placeholder="ABC010101XYZ"
              mono
              error={conError ? 'El RFC no existe en el padrón de importadores' : undefined}
              defaultValue="XXXX000000XX0"
            />
            <Select label="Régimen aduanero" defaultValue="IMD">
              <option value="IMD">IMD — Importación definitiva</option>
              <option value="ITE">ITE — Importación temporal (IMMEX)</option>
              <option value="DFI">DFI — Depósito fiscal</option>
            </Select>
            <Textarea label="Descripción de la mercancía" placeholder="Tornillo de acero inoxidable, cabeza hexagonal, M10x50mm" hint="A mayor detalle, mejor clasificación" />
            <div className="md:col-span-2">
              <Button variante="secundario" tamano="sm" onClick={() => setConError(v => !v)}>
                {conError ? 'Quitar estado de error' : 'Mostrar estado de error'}
              </Button>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="DataTable">
          <DataTable columnas={COLS_DEMO} filas={FILAS_DEMO} filaKey={f => f.fraccion} onFilaClick={() => {}} />
          <DataTable
            columnas={COLS_DEMO}
            filas={[]}
            filaKey={f => f.fraccion}
            vacio={
              <EmptyState
                icono={FileSearch}
                titulo="Sin cuotas registradas"
                descripcion="Cuando una fracción tenga cuota compensatoria activa, aparecerá aquí con su fecha de publicación."
                accion={{ label: 'Consultar cuotas activas', onClick: () => {} }}
              />
            }
          />
        </Seccion>

        <Seccion titulo="EmptyState">
          <div className="bg-superficie border border-linea rounded-sello">
            <EmptyState
              icono={Inbox}
              titulo="Aún no hay expedientes"
              descripcion="Crea el primero para empezar a integrar la evidencia de tus operaciones."
              accion={{ label: 'Crear expediente', onClick: () => {} }}
            />
          </div>
        </Seccion>

        <footer className="pt-4 border-t border-linea">
          <p className="text-13 text-tinta-suave">
            Sello v1.0 · Sin sombras en cards, sin gradientes, sin animaciones de entrada. Focus visible siempre.
          </p>
        </footer>
      </div>
    </div>
  )
}
