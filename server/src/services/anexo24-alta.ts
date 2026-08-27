/**
 * Alta de inventario desde un pedimento persistido (Anexo 24 · Ola 1).
 *
 * Consume `Pedimento` + `PedimentoPartida` ya guardados (los persiste el
 * importador M3/Data Stage de la rama de Pre-validador; este módulo NO parsea
 * archivos). Por cada partida crea UN `TemporaryImport` ligado a la
 * pedimento-partida (idempotente por `pedimentoPartidaId`), resuelve la parte
 * (`Product`) y decide tipo/plazo según clave del pedimento y certificación.
 */
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { recordAudit } from './audit-service';
import { assertPeriodoAbierto } from './anexo24-cierre';
import { whereAlcance, type AlcanceFiltro } from '../lib/cliente-contexto';
import { plazoMeses, fechaVencimiento, type Certificacion, type TipoTemporal } from '../lib/plazos-immex';

/** Claves de pedimento (Apéndice 2, Anexo 22) que dan de alta inventario IMMEX. */
export const CLAVES_TEMPORAL_IMMEX: Record<string, TipoTemporal> = {
  IN: 'INSUMO',       // importación temporal de insumos IMMEX
  AF: 'ACTIVO_FIJO',  // importación temporal de activo fijo IMMEX
};

export interface AltaDesdePedimentoInput {
  tenantId: string;
  userId: string;
  pedimentoId: string;
  /** Fecha de entrada (pago/modulación). El modelo `Pedimento` no la tiene:
   *  si no viene, se rechaza — nunca se inventa con createdAt. */
  fechaEntrada?: Date | null;
  clienteId?: string | null;
  /** Vida útil (meses) para activo fijo — opcional, informativa. */
  vidaUtilMeses?: number | null;
  ubicacionId?: string | null;
  /** Declaración del capturista: mercancías sensibles (Anexo I BIS / I TER). */
  esAnexoIBis?: boolean;
  esAnexoITer?: boolean;
}

export interface AltaDesdePedimentoResultado {
  pedimentoId: string;
  numero: string | null;
  clave: string;
  tipo: TipoTemporal;
  certificacion: Certificacion;
  creadas: number;
  existentes: number;
  temporaryImportIds: string[];
  plazo: { meses: number | null; vigenciaPrograma: boolean; fundamento: string; cotejo: string; aviso: string | null };
  avisos: string[];
}

/** Certificación IVA/IEPS aplicable: la del cliente (RFC) si existe; si no, la del tenant. */
export async function certificacionAplicable(tenantId: string, clienteId: string | null | undefined): Promise<Certificacion> {
  if (clienteId) {
    const c = await prisma.cliente.findFirst({ where: { id: clienteId, tenantId }, select: { certificacionIVAIEPS: true } });
    const m = (c?.certificacionIVAIEPS ?? '').toUpperCase();
    if (m === 'A' || m === 'AA' || m === 'AAA') return m;
  }
  const perfil = await prisma.certificationProfile.findUnique({ where: { tenantId }, select: { modality: true, status: true } });
  if (!perfil || perfil.status === 'CANCELLED' || perfil.status === 'SUSPENDED') return null;
  const m = perfil.modality.trim().toUpperCase();
  if (m === 'A' || m === 'AA' || m === 'AAA') return m;
  return null;
}

async function resolverParte(tenantId: string, partida: { productId: string | null; descripcion: string }): Promise<string | null> {
  if (partida.productId) {
    const p = await prisma.product.findFirst({ where: { id: partida.productId, tenantId }, select: { id: true } });
    if (p) return p.id;
  }
  const desc = partida.descripcion.trim();
  if (!desc) return null;
  const p = await prisma.product.findFirst({
    where: {
      tenantId,
      active: true,
      OR: [
        { productCode: { equals: desc, mode: 'insensitive' } },
        { description: { equals: desc, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return p?.id ?? null;
}

export async function altaDesdePedimento(input: AltaDesdePedimentoInput): Promise<AltaDesdePedimentoResultado> {
  const ped = await prisma.pedimento.findFirst({
    where: { id: input.pedimentoId, tenantId: input.tenantId },
    include: { partidas: { orderBy: { numeroPartida: 'asc' } } },
  });
  if (!ped) throw new AppError('Pedimento no encontrado en este tenant', 404);

  const clave = ped.clave.trim().toUpperCase();
  const tipo = CLAVES_TEMPORAL_IMMEX[clave];
  if (!tipo) {
    throw new AppError(`La clave de pedimento "${ped.clave}" no es de importación temporal IMMEX (se aceptan IN y AF)`, 400);
  }
  if (ped.partidas.length === 0) throw new AppError('El pedimento no tiene partidas persistidas', 400);
  if (!input.fechaEntrada || Number.isNaN(input.fechaEntrada.getTime())) {
    throw new AppError('El pedimento persistido no trae fecha de entrada; indique fechaEntrada (fecha de pago/modulación)', 400);
  }
  const fechaEntrada = input.fechaEntrada;
  await assertPeriodoAbierto(prisma, input.tenantId, fechaEntrada, 'dar de alta importaciones');

  if (input.ubicacionId) {
    const u = await prisma.ubicacion.findFirst({ where: { id: input.ubicacionId, tenantId: input.tenantId }, select: { id: true } });
    if (!u) throw new AppError('Ubicación no encontrada', 404);
  }

  const clienteId = input.clienteId ?? ped.clienteId ?? null;
  const certificacion = await certificacionAplicable(input.tenantId, clienteId);
  const plazo = plazoMeses({ tipo, certificacion, esAnexoIBis: input.esAnexoIBis, esAnexoITer: input.esAnexoITer });
  const vencimiento = fechaVencimiento(fechaEntrada, plazo);
  const avisos: string[] = [];
  if (plazo.aviso) avisos.push(plazo.aviso);
  const tc = ped.tipoCambio > 0 ? ped.tipoCambio : null;
  if (!tc) avisos.push('El pedimento no trae tipo de cambio: el valor en USD se dejó igual al valor en aduana (MXN). Corrija el TC.');

  const existentesPrev = await prisma.temporaryImport.findMany({
    where: { tenantId: input.tenantId, pedimentoPartidaId: { in: ped.partidas.map(p => p.id) } },
    select: { id: true, pedimentoPartidaId: true },
  });
  const yaAltas = new Map(existentesPrev.map(e => [e.pedimentoPartidaId!, e.id]));

  const ids: string[] = [];
  let creadas = 0;
  let sinParte = 0;
  for (const partida of ped.partidas) {
    const previo = yaAltas.get(partida.id);
    if (previo) { ids.push(previo); continue; }
    const productId = await resolverParte(input.tenantId, partida);
    if (!productId) sinParte++;
    const valueMXN = partida.valorAduana;
    const customsValue = tc ? valueMXN / tc : valueMXN;
    const imp = await prisma.temporaryImport.create({
      data: {
        pedimento: ped.numero ?? `${ped.aduana}-${ped.patenteAduanal}-s/n`,
        fractionCode: partida.fraccion,
        description: partida.descripcion,
        quantity: partida.cantidad,
        unit: partida.unidadMedida,
        customsValue: aDosDecimales(customsValue),
        valueMXN,
        originCountry: partida.pais,
        entryDate: fechaEntrada,
        expirationDate: vencimiento,
        expirationMonths: plazo.meses ?? 0,
        status: 'ACTIVE',
        notes: plazo.aviso ? `[plazo] ${plazo.aviso}` : null,
        tenantId: input.tenantId,
        userId: input.userId,
        clienteId,
        pedimentoPartidaId: partida.id,
        productId,
        tipo,
        claveDocumento: clave,
        vidaUtilMeses: tipo === 'ACTIVO_FIJO' ? (input.vidaUtilMeses ?? null) : null,
        ubicacionId: input.ubicacionId ?? null,
        isDemoData: ped.isDemoData,
      },
      select: { id: true },
    });
    ids.push(imp.id);
    creadas++;
  }
  if (sinParte > 0) avisos.push(`${sinParte} partida(s) sin número de parte en el catálogo: el control queda por fracción hasta que se ligue la parte.`);

  if (creadas > 0) {
    await recordAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      action: 'inventory.alta_desde_pedimento',
      entity: 'Pedimento',
      entityId: ped.id,
      after: { creadas, existentes: ids.length - creadas, tipo, clave, plazoMeses: plazo.meses, vigenciaPrograma: plazo.vigenciaPrograma },
      metadata: { pedimentoId: ped.id, numero: ped.numero, creadas, tipo },
    });
  }

  return {
    pedimentoId: ped.id,
    numero: ped.numero,
    clave,
    tipo,
    certificacion,
    creadas,
    existentes: ids.length - creadas,
    temporaryImportIds: ids,
    plazo: { meses: plazo.meses, vigenciaPrograma: plazo.vigenciaPrograma, fundamento: plazo.fundamento, cotejo: plazo.cotejo, aviso: plazo.aviso },
    avisos,
  };
}

/** Pedimentos IN/AF persistidos del tenant con su avance de alta (para el selector de la UI). */
export async function pedimentosParaAlta(tenantId: string, alcance?: AlcanceFiltro | null) {
  const peds = await prisma.pedimento.findMany({
    where: { tenantId, clave: { in: Object.keys(CLAVES_TEMPORAL_IMMEX) }, ...whereAlcance(alcance) },
    select: { id: true, numero: true, clave: true, aduana: true, rfcImportador: true, origenArchivo: true, createdAt: true, partidas: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  if (peds.length === 0) return [];
  const partidaIds = peds.flatMap(p => p.partidas.map(x => x.id));
  const altas = await prisma.temporaryImport.findMany({
    where: { tenantId, pedimentoPartidaId: { in: partidaIds } },
    select: { pedimentoPartidaId: true },
  });
  const dadas = new Set(altas.map(a => a.pedimentoPartidaId));
  return peds.map(p => ({
    id: p.id,
    numero: p.numero,
    clave: p.clave,
    aduana: p.aduana,
    rfcImportador: p.rfcImportador,
    origenArchivo: p.origenArchivo,
    createdAt: p.createdAt.toISOString(),
    partidas: p.partidas.length,
    partidasEnInventario: p.partidas.filter(x => dadas.has(x.id)).length,
  }));
}

/** Redondeo a centavos (no es tipo de cambio: ver guard de frontera canónica). */
function aDosDecimales(v: number): number {
  return Number(v.toFixed(2));
}
