/**
 * Simulador "¿qué pasa si no descargo esto a tiempo?" (Anexo 24 · Ola 1).
 *
 * Cuelga del pedimento real: toma el saldo no descargado de una importación
 * temporal, lo valora al TC del sistema y calcula las contribuciones que se
 * habrían omitido si la mercancía no retorna en plazo (IGI NMF + DTA + IEPS +
 * IVA, misma fórmula del Cotizador). La multa se expresa SOLO con lo que el
 * repo respalda (Art. 176-I / 178-I LA: 130%-150% de lo omitido, cotejado en
 * docs/RISK_SCORER_LEGAL.md y LegalDocument "Art. 184 LA"). La multa específica
 * por exceder el plazo de retorno (Art. 182-II / 183-II LA) NO está en el
 * corpus: se devuelve como pendiente, no como número.
 */
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { computeQuoteAmounts } from './quoter';
import { tipoCambioMXN } from './frontera-canonica';
import { esVigenciaPrograma } from '../lib/plazos-immex';
import { whereAlcance, type AlcanceFiltro } from '../lib/cliente-contexto';

export interface ExposicionResultado {
  temporaryImportId: string;
  pedimento: string;
  pedimentoPartidaId: string | null;
  fractionCode: string;
  parteCodigo: string | null;
  tipo: string;
  unit: string;
  saldo: number;
  vencimiento: string | null;
  diasParaVencer: number | null;
  vencida: boolean;
  valorSaldoUSD: number;
  tipoCambio: { valor: number | null; fuente: string | null; fecha: string | null; estado: string };
  tasas: { igiPct: number | null; igiFuente: string; dtaPct: number; ivaPct: number; iepsPct: number };
  impuestos: { valorMXN: number; igi: number; dta: number; ieps: number; iva: number; total: number } | null;
  multa: {
    rangoOmision: { minPct: number; maxPct: number; min: number; max: number; fundamento: string; cotejo: string } | null;
    plazoRetorno: { fundamento: string; cotejo: 'pendiente'; nota: string };
  };
  recargos: { nota: string };
  avisos: string[];
}

export async function calcularExposicion(tenantId: string, temporaryImportId: string, alcance?: AlcanceFiltro | null): Promise<ExposicionResultado> {
  const imp = await prisma.temporaryImport.findFirst({
    where: { id: temporaryImportId, tenantId, ...whereAlcance(alcance) },
    include: { product: { select: { productCode: true } } },
  });
  if (!imp) throw new AppError('Importación temporal no encontrada', 404);

  const avisos: string[] = [];
  const saldo = Math.max(0, imp.quantity - imp.quantityDischarged);
  const valorSaldoUSD = imp.quantity > 0 ? imp.customsValue * (saldo / imp.quantity) : 0;
  const vigencia = esVigenciaPrograma(imp);
  const hoy = new Date();
  const dias = vigencia ? null : Math.ceil((imp.expirationDate.getTime() - hoy.getTime()) / 86_400_000);

  const tc = await tipoCambioMXN();
  if (tc.valor == null) avisos.push(`Sin tipo de cambio del sistema: ${tc.nota ?? 'no disponible'}. No se calculan impuestos.`);
  else if (tc.estado !== 'verificado') avisos.push(`Tipo de cambio sin verificar (${tc.fuente?.nombre ?? 'desconocido'}).`);

  const fx = await prisma.fraction.findUnique({ where: { code: imp.fractionCode }, select: { tariffNMF: true, iepsRate: true, active: true } });
  const igiPct = fx?.tariffNMF ?? null;
  if (!fx) avisos.push(`La fracción ${imp.fractionCode} no está en el catálogo TIGIE del sistema: IGI no calculable.`);
  else if (igiPct == null) avisos.push(`La fracción ${imp.fractionCode} no tiene arancel NMF cargado: IGI se toma como no calculable.`);
  const iepsPct = fx?.iepsRate ?? 0;
  const dtaPct = 0.8;
  const ivaPct = 16;

  let impuestos: ExposicionResultado['impuestos'] = null;
  if (tc.valor != null && igiPct != null) {
    const a = computeQuoteAmounts({ valueUSD: valorSaldoUSD, exchangeRate: tc.valor, rates: { igiPct, dtaPct, ivaPct, iepsPct } });
    impuestos = { valorMXN: a.valueMXN, igi: a.igi, dta: a.dta, ieps: a.ieps, iva: a.iva, total: a.totalTaxes };
  }
  if (vigencia) avisos.push('Activo fijo: permanece por la vigencia del programa; la exposición aplica si el programa se cancela o el bien sale sin retorno/cambio de régimen.');

  const rangoOmision = impuestos
    ? {
        minPct: 130, maxPct: 150,
        min: Math.round(impuestos.total * 1.30 * 100) / 100,
        max: Math.round(impuestos.total * 1.50 * 100) / 100,
        fundamento: 'Art. 176 fr. I + Art. 178 fr. I LA (multa del 130% al 150% de los impuestos al comercio exterior omitidos)',
        cotejo: 'docs/RISK_SCORER_LEGAL.md (cotejo Fase 3, montos DOF 27-12-2025) · LegalDocument "Art. 184 LA"',
      }
    : null;

  return {
    temporaryImportId: imp.id,
    pedimento: imp.pedimento,
    pedimentoPartidaId: imp.pedimentoPartidaId,
    fractionCode: imp.fractionCode,
    parteCodigo: imp.product?.productCode ?? null,
    tipo: imp.tipo,
    unit: imp.unit,
    saldo,
    vencimiento: vigencia ? null : imp.expirationDate.toISOString().slice(0, 10),
    diasParaVencer: dias,
    vencida: dias != null && dias < 0 && saldo > 0,
    valorSaldoUSD: Math.round(valorSaldoUSD * 100) / 100,
    tipoCambio: { valor: tc.valor, fuente: tc.fuente?.nombre ?? null, fecha: tc.fuente?.fechaPublicacion ?? null, estado: tc.estado },
    tasas: { igiPct, igiFuente: fx ? 'Catálogo TIGIE del sistema (tariffNMF)' : 'no disponible', dtaPct, ivaPct, iepsPct },
    impuestos,
    multa: {
      rangoOmision,
      plazoRetorno: {
        fundamento: 'Art. 182 fr. II / Art. 183 fr. II LA (no retornar en plazo mercancía importada temporalmente)',
        cotejo: 'pendiente',
        nota: 'La multa específica por exceder el plazo de retorno no está en el corpus del sistema; no se expresa en pesos hasta cotejarla contra la LA vigente.',
      },
    },
    recargos: { nota: 'Recargos y actualización (CFF) no incluidos: dependen de la fecha real de pago.' },
    avisos,
  };
}
