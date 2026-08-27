/**
 * Inventario IMMEX (Anexo 24 real) — Ola 1, 27-ago-2026. Diseño Sello.
 *
 * El control legal es por pedimento y por número de parte con descargo PEPS.
 * Vistas: por parte (saldo + lotes en orden PEPS), por pedimento-partida,
 * activo fijo (sin PEPS de consumo), submaquila, BOM, cierres mensuales y
 * reporte Anexo 24. Acciones: alta desde pedimento, descargar PEPS, retorno
 * desde BOM, cierre mensual, exposición por pedimento. Sin datos falsos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Warehouse, Boxes, FileText, Landmark } from 'lucide-react'
import { DemoTag } from '../components/DemoBanner'
import { api } from '../lib/api'
import type { ProductRecord, AssemblyRecord } from '../lib/api'
import { anexo24Api, type ParteConLotes, type PedimentoPartidaInv, type AltaResultado, type DescargoPepsResultado, type RetornoBomResultado } from '../lib/api/anexo24'
import { formatFraction } from '../lib/format'
import { usePermissions } from '../hooks/usePermissions'
import { Badge, Button, Card, DataTable, EmptyState } from '../components/ui'
import { Aviso, Kpi, fmtFecha, fmtNum, fmtUSD, mensajeDe } from '../components/anexo24/comunes'
import { AltaDesdePedimentoForm, AltaResultadoPanel, DescargarPepsForm, DescargoResultadoPanel, RetornoBomForm, RetornoResultadoPanel } from '../components/anexo24/Formularios'
import { ExposicionPanel } from '../components/anexo24/ExposicionPanel'
import { CierresTab } from '../components/anexo24/CierresTab'
import { SubmaquilaTab } from '../components/anexo24/SubmaquilaTab'
import { ReporteAnexo24Tab } from '../components/anexo24/ReporteAnexo24Tab'
import { BomTab } from '../components/anexo24/BomTab'

export const GUIA_MODULO = {
  titulo: 'Inventario IMMEX (Anexo 24)',
  pasos: [
    'Da de alta el inventario desde un pedimento IN/AF ya importado (M3 / Data Stage): una importación temporal por partida, ligada a su número de parte.',
    'Revisa "Por parte": el saldo de cada parte y sus lotes en orden PEPS (el más antiguo se descarga primero).',
    'Descarga PEPS al retornar (RT), transferir (V1, con constancia), cambiar de régimen (F4) o vender; o usa "Retorno desde BOM" para descargar los componentes de un producto terminado con su merma.',
    'El activo fijo vive aparte: permanece por la vigencia del programa y no entra al PEPS de consumo.',
    'Registra ubicaciones y traslados a submaquila (con folio de aviso ante la SE).',
    'Al terminar el mes, cierra el periodo: los saldos quedan sellados con hash y nada puede fecharse dentro.',
    'Genera el reporte Anexo 24 del periodo (Excel o PDF impreso). Su estructura está pendiente de cotejo contra el Anexo 24 vigente.',
    'En cada lote, "Exposición" te dice en pesos qué contribuciones se omitirían si no descargas a tiempo.',
  ],
}

type Tab = 'partes' | 'pedimentos' | 'activo' | 'submaquila' | 'bom' | 'cierres' | 'reporte'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'partes', label: 'Por parte' },
  { key: 'pedimentos', label: 'Por pedimento-partida' },
  { key: 'activo', label: 'Activo fijo' },
  { key: 'submaquila', label: 'Submaquila' },
  { key: 'bom', label: 'Productos y BOM' },
  { key: 'cierres', label: 'Cierre mensual' },
  { key: 'reporte', label: 'Reporte Anexo 24' },
]

export function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'partes')
  const [partes, setPartes] = useState<ParteConLotes[] | null>(null)
  const [lotes, setLotes] = useState<PedimentoPartidaInv[] | null>(null)
  const [productos, setProductos] = useState<ProductRecord[]>([])
  const [ensambles, setEnsambles] = useState<AssemblyRecord[]>([])
  const [ultimoCierre, setUltimoCierre] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { can } = usePermissions()

  const [accion, setAccion] = useState<null | { tipo: 'alta' } | { tipo: 'peps'; parte?: ParteConLotes } | { tipo: 'retorno' }>(null)
  const [resultado, setResultado] = useState<null | { tipo: 'alta'; r: AltaResultado } | { tipo: 'peps'; r: DescargoPepsResultado } | { tipo: 'retorno'; r: RetornoBomResultado }>(null)
  const [exposicion, setExposicion] = useState<string | null>(params.get('exposicion'))
  const [parteAbierta, setParteAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const res = await Promise.allSettled([anexo24Api.partes(), anexo24Api.pedimentoPartidas(true), api.bomProducts(), api.assemblies(), anexo24Api.cierres()])
    if (res[0].status === 'fulfilled') setPartes(res[0].value.data); else { setPartes([]); setError(mensajeDe(res[0].reason)) }
    if (res[1].status === 'fulfilled') setLotes(res[1].value.data); else setLotes([])
    if (res[2].status === 'fulfilled') setProductos(res[2].value.data)
    if (res[3].status === 'fulfilled') setEnsambles(res[3].value.data)
    if (res[4].status === 'fulfilled') setUltimoCierre(res[4].value.ultimoPeriodoCerrado)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const insumos = useMemo(() => (partes ?? []).filter(p => p.tipo === 'INSUMO'), [partes])
  const activos = useMemo(() => (partes ?? []).filter(p => p.tipo === 'ACTIVO_FIJO'), [partes])
  const lotesInsumo = useMemo(() => (lotes ?? []).filter(l => l.tipo !== 'ACTIVO_FIJO'), [lotes])
  const lotesAF = useMemo(() => (lotes ?? []).filter(l => l.tipo === 'ACTIVO_FIJO'), [lotes])
  const hoy = Date.now()
  const porVencer = lotesInsumo.filter(l => l.expirationDate && (new Date(l.expirationDate).getTime() - hoy) / 86_400_000 <= 90 && l.saldo > 0)
  const vencidos = lotesInsumo.filter(l => l.expirationDate && new Date(l.expirationDate).getTime() < hoy && l.saldo > 0)
  const enSubmaquila = (lotes ?? []).filter(l => l.ubicacion?.tipo === 'SUBMAQUILA').length

  function cambiarTab(t: Tab) { setTab(t); setParams(p => { p.set('tab', t); return p }, { replace: true }) }
  function cerrarExposicion() { setExposicion(null); setParams(p => { p.delete('exposicion'); return p }, { replace: true }) }
  const puedeAjustar = can('inventory', 'adjust')
  const puedeDescargar = can('inventory', 'discharge')

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sello-ui">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-petroleo" aria-hidden />
            <h1 className="font-sello-display text-28 tracking-tight text-tinta">Inventario IMMEX</h1>
            <DemoTag />
          </div>
          <p className="text-sm text-tinta-suave mt-1">Control por pedimento y número de parte con descargo PEPS (Anexo 24).{ultimoCierre && <> Sellado hasta <span className="font-sello-mono text-tinta">{ultimoCierre}</span>.</>}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {puedeAjustar && <Button variante="secundario" onClick={() => setAccion({ tipo: 'alta' })}>Alta desde pedimento</Button>}
          {puedeDescargar && <Button variante="secundario" onClick={() => setAccion({ tipo: 'retorno' })} disabled={productos.filter(p => p.isFinished).length === 0}>Retorno desde BOM</Button>}
          {puedeDescargar && <Button onClick={() => setAccion({ tipo: 'peps' })} disabled={insumos.length === 0}>Descargar PEPS</Button>}
        </div>
      </header>

      {error && <Aviso tono="carmin">{error}</Aviso>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="Partes con saldo" value={insumos.length} />
        <Kpi label="Lotes activos (insumo)" value={lotesInsumo.length} />
        <Kpi label="Vencen en 90 días" value={porVencer.length} alerta={porVencer.length > 0} />
        <Kpi label="Vencidos con saldo" value={vencidos.length} alerta={vencidos.length > 0} />
        <Kpi label="Activo fijo · submaquila" value={`${lotesAF.length} · ${enSubmaquila}`} />
      </div>

      <nav className="flex gap-1 border-b border-linea overflow-x-auto" aria-label="Secciones del inventario">
        {TABS.map(t => (
          <button key={t.key} onClick={() => cambiarTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo ${tab === t.key ? 'border-petroleo text-petroleo font-medium' : 'border-transparent text-tinta-suave hover:text-tinta'}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'partes' && (
        partes === null ? <p className="text-sm text-tinta-suave">Cargando saldos…</p> : insumos.length === 0 ? (
          <Card><EmptyState icono={Boxes} titulo="Sin saldos de insumos" descripcion="Da de alta el inventario desde un pedimento IN persistido o captura una importación temporal." accion={puedeAjustar ? { label: 'Alta desde pedimento', onClick: () => setAccion({ tipo: 'alta' }) } : undefined} /></Card>
        ) : (
          <div className="space-y-2">
            {insumos.map(p => {
              const k = p.parteId ?? `F:${p.fractionCode}`
              const abierta = parteAbierta === k
              const dias = p.proximoVencimiento ? Math.ceil((new Date(p.proximoVencimiento).getTime() - hoy) / 86_400_000) : null
              return (
                <Card key={k} denso>
                  <button onClick={() => setParteAbierta(abierta ? null : k)} aria-expanded={abierta} className="w-full flex flex-wrap items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo rounded-sello-sm">
                    <span className="font-sello-mono text-tinta text-base">{p.parteCodigo ?? <span className="text-tinta-suave">(sin parte)</span>}</span>
                    <span className="font-sello-mono text-13 text-tinta-suave">{formatFraction(p.fractionCode)}</span>
                    <span className="text-sm text-tinta-suave truncate flex-1 min-w-[10rem]">{p.descripcion}</span>
                    <span className="font-sello-mono text-tinta">saldo {fmtNum(p.saldo)} {p.unit}</span>
                    <Badge>{p.lotes.length} lote(s)</Badge>
                    {dias != null && <Badge tono={dias < 0 ? 'carmin' : dias <= 90 ? 'ambar' : 'neutral'}>{dias < 0 ? `vencida hace ${-dias} d` : `vence en ${dias} d`}</Badge>}
                  </button>
                  {abierta && (
                    <div className="mt-3">
                      <DataTable
                        columnas={[
                          { key: 'orden', header: 'PEPS', align: 'right', mono: true, render: l => `${l.ordenPeps}°` },
                          { key: 'ped', header: 'Pedimento', mono: true, render: l => l.pedimento },
                          { key: 'entrada', header: 'Entrada', mono: true, render: l => fmtFecha(l.entryDate) },
                          { key: 'vence', header: 'Vence', mono: true, render: l => fmtFecha(l.expirationDate) },
                          { key: 'imp', header: 'Importado', align: 'right', mono: true, render: l => fmtNum(l.quantity) },
                          { key: 'desc', header: 'Descargado', align: 'right', mono: true, render: l => fmtNum(l.quantityDischarged) },
                          { key: 'disp', header: 'Disponible', align: 'right', mono: true, render: l => fmtNum(l.disponible) },
                          { key: 'ubi', header: 'Ubicación', render: l => l.ubicacion ? <span>{l.ubicacion.nombre}{l.ubicacion.tipo === 'SUBMAQUILA' && <Badge tono="petroleo" className="ml-1">submaquila</Badge>}</span> : <span className="text-tinta-suave">planta</span> },
                          { key: 'acc', header: '', render: l => <Button variante="ghost" tamano="sm" onClick={() => setExposicion(l.temporaryImportId)}>Exposición</Button> },
                        ]}
                        filas={p.lotes}
                        filaKey={l => l.temporaryImportId}
                      />
                      {puedeDescargar && <div className="mt-2 flex justify-end"><Button tamano="sm" onClick={() => setAccion({ tipo: 'peps', parte: p })}>Descargar PEPS de esta parte</Button></div>}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )
      )}

      {tab === 'pedimentos' && (
        lotes === null ? <p className="text-sm text-tinta-suave">Cargando…</p> : lotesInsumo.length === 0 ? (
          <Card><EmptyState icono={FileText} titulo="Sin importaciones temporales activas" descripcion="Cada renglón es una partida de pedimento con su saldo y sus descargos." /></Card>
        ) : (
          <DataTable
            columnas={[
              { key: 'ped', header: 'Pedimento · partida', mono: true, render: l => `${l.pedimento}${l.numeroPartida != null ? ` · ${l.numeroPartida}` : ''}` },
              { key: 'clave', header: 'Clave', mono: true, render: l => l.claveDocumento ?? '—' },
              { key: 'parte', header: 'Parte', mono: true, render: l => l.product?.productCode ?? <span className="text-tinta-suave">—</span> },
              { key: 'frac', header: 'Fracción', mono: true, render: l => formatFraction(l.fractionCode) },
              { key: 'desc', header: 'Descripción', render: l => <span className="text-sm">{l.description}</span> },
              { key: 'entrada', header: 'Entrada', mono: true, render: l => fmtFecha(l.entryDate) },
              { key: 'vence', header: 'Vence', mono: true, render: l => fmtFecha(l.expirationDate) },
              { key: 'saldo', header: 'Saldo', align: 'right', mono: true, render: l => `${fmtNum(l.saldo)} / ${fmtNum(l.quantity)} ${l.unit}` },
              { key: 'valor', header: 'Valor', align: 'right', mono: true, render: l => fmtUSD(l.customsValue) },
              { key: 'desc2', header: 'Descargos', align: 'right', mono: true, render: l => String(l.discharges.length) },
              { key: 'acc', header: '', render: l => <Button variante="ghost" tamano="sm" onClick={() => setExposicion(l.id)}>Exposición</Button> },
            ]}
            filas={lotesInsumo}
            filaKey={l => l.id}
          />
        )
      )}

      {tab === 'activo' && (
        lotes === null ? <p className="text-sm text-tinta-suave">Cargando…</p> : lotesAF.length === 0 ? (
          <Card><EmptyState icono={Landmark} titulo="Sin activo fijo" descripcion="La maquinaria y equipo importados con clave AF se listan aquí. Permanecen por la vigencia del programa y no entran al PEPS de consumo; salen por retorno o cambio de régimen." /></Card>
        ) : (
          <div className="space-y-3">
            <Aviso tono="neutral">Activo fijo: permanencia por la vigencia del programa IMMEX (Art. 108 fr. III LA — texto pendiente de cotejo en el corpus). Sin fecha de vencimiento; no se descarga por consumo. {activos.length} parte(s).</Aviso>
            <DataTable
              columnas={[
                { key: 'ped', header: 'Pedimento · partida', mono: true, render: l => `${l.pedimento}${l.numeroPartida != null ? ` · ${l.numeroPartida}` : ''}` },
                { key: 'parte', header: 'Parte', mono: true, render: l => l.product?.productCode ?? '—' },
                { key: 'frac', header: 'Fracción', mono: true, render: l => formatFraction(l.fractionCode) },
                { key: 'desc', header: 'Descripción', render: l => <span className="text-sm">{l.description}</span> },
                { key: 'cant', header: 'Cantidad', align: 'right', mono: true, render: l => `${fmtNum(l.quantity)} ${l.unit}` },
                { key: 'valor', header: 'Valor', align: 'right', mono: true, render: l => fmtUSD(l.customsValue) },
                { key: 'entrada', header: 'Entrada', mono: true, render: l => fmtFecha(l.entryDate) },
                { key: 'vida', header: 'Vida útil', align: 'right', mono: true, render: l => l.vidaUtilMeses != null ? `${l.vidaUtilMeses} m` : '—' },
                { key: 'ubi', header: 'Ubicación', render: l => l.ubicacion?.nombre ?? <span className="text-tinta-suave">planta</span> },
                { key: 'estado', header: 'Estado', render: () => <Badge tono="petroleo">vigencia del programa</Badge> },
              ]}
              filas={lotesAF}
              filaKey={l => l.id}
            />
          </div>
        )
      )}

      {tab === 'submaquila' && lotes !== null && <SubmaquilaTab lotes={lotes} puedeEditar={puedeAjustar} onCambio={cargar} />}
      {tab === 'bom' && <BomTab puedeEditar={puedeAjustar} onRetorno={() => setAccion({ tipo: 'retorno' })} productos={productos} ensambles={ensambles} recargar={cargar} />}
      {tab === 'cierres' && <CierresTab puedeCerrar={puedeAjustar} />}
      {tab === 'reporte' && <ReporteAnexo24Tab />}

      {accion?.tipo === 'alta' && <AltaDesdePedimentoForm onClose={() => setAccion(null)} onDone={async r => { setAccion(null); setResultado({ tipo: 'alta', r }); await cargar() }} />}
      {accion?.tipo === 'peps' && partes && <DescargarPepsForm partes={partes} parteInicial={accion.parte} onClose={() => setAccion(null)} onDone={async r => { setAccion(null); setResultado({ tipo: 'peps', r }); await cargar() }} />}
      {accion?.tipo === 'retorno' && <RetornoBomForm terminados={productos.filter(p => p.isFinished)} onClose={() => setAccion(null)} onDone={async r => { setAccion(null); setResultado({ tipo: 'retorno', r }); await cargar() }} />}
      {resultado?.tipo === 'alta' && <AltaResultadoPanel r={resultado.r} onClose={() => setResultado(null)} />}
      {resultado?.tipo === 'peps' && <DescargoResultadoPanel r={resultado.r} onClose={() => setResultado(null)} />}
      {resultado?.tipo === 'retorno' && <RetornoResultadoPanel r={resultado.r} onClose={() => setResultado(null)} />}
      {exposicion && <ExposicionPanel temporaryImportId={exposicion} onClose={cerrarExposicion} />}
    </div>
  )
}
