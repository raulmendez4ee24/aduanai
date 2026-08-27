/**
 * PRE-GLOSA MULTIPARTIDA (Operación 2026-08, Ola 1).
 *
 * Una revisión por partida (simulateGlosa, contrato intacto) + resumen del
 * pedimento: riesgo máximo, hallazgos agregados (regla → partidas), cruces
 * agregados, reglas no evaluadas y dominios no revisados. Fail-closed hereda
 * de cada partida: si UNA partida queda indeterminada, el pedimento también.
 */
import { simulateGlosa, GLOSA_DISCLAIMER, type GlosaFuentes, type GlosaSimulationInput, type GlosaSimulationResult, type RiskFlag } from './glosa-simulator';
import type { CruceGlosa } from './glosa-cruces';
import { datosArchivoDe, type PedimentoConPartidas, type IdentificadorImportado, type PermisoImportado } from './pedimento-importer';

export interface PartidaGlosa {
  numeroPartida: number;
  fraccion: string;
  descripcion: string;
  input: GlosaSimulationInput;
  resultado: GlosaSimulationResult | null;
  error: string | null;
}

export interface HallazgoAgregado {
  ruleCode: string; name: string; severity: RiskFlag['severity']; category: string;
  partidas: number[]; reason: string; legalBasis: string | null;
}
export interface CruceAgregado {
  codigo: CruceGlosa['codigo']; nombre: string; resultado: NonNullable<CruceGlosa['resultado']>;
  severidad: CruceGlosa['severidad']; partidas: number[]; mensaje: string; fundamento: string;
}

export interface ResumenPedimentoGlosa {
  partidasTotal: number;
  partidasEvaluadas: number;
  partidasConError: number;
  riskScoreMax: number;
  riskLevelMax: GlosaSimulationResult['riskLevel'] | null;
  /** 'indeterminado' si alguna partida quedó incompleta o con error. */
  riskLevelPresentacion: GlosaSimulationResult['riskLevelPresentacion'];
  partidaRiesgoMaximo: number | null;
  hallazgos: HallazgoAgregado[];
  cruces: CruceAgregado[];
  reglasNoEvaluadas: { ruleCode: string; motivo: string; partidas: number[] }[];
  crucesNoEvaluados: { codigo: string; motivo: string; partidas: number[] }[];
  dominiosNoRevisados: { dominio: string; motivo: string; partidas: number[] }[];
}

export interface GlosaPedimentoResultado {
  pedimentoId: string;
  numero: string | null;
  clave: string;
  aduana: string;
  origenArchivo: string | null;
  partidas: PartidaGlosa[];
  resumen: ResumenPedimentoGlosa;
  disclaimer: string;
}

export interface DeclaradoPedimento {
  hasIVAIEPSCertification?: boolean;
  hasTMECCertificate?: boolean;
  declaresNOMs?: boolean;
  documents?: GlosaSimulationInput['documents'];
}

const NIVEL_ORDEN: Record<GlosaSimulationResult['riskLevel'], number> = { low: 0, medium: 1, high: 2, critical: 3 };

function tratadoDeComplemento(c: string | undefined): string | null {
  if (!c) return null;
  const u = c.toUpperCase();
  if (/USMCA|TMEC|T-MEC|TLCAN|NAFTA|TLC\b/.test(u)) return 'TMEC';
  if (/TLCUE|UE\b|EU\b|EUROPE/.test(u)) return 'TLCUEM';
  if (/CPTPP|TPP|TIPAT/.test(u)) return 'CPTPP';
  return u;
}

/** Pedimento persistido → una entrada de Pre-Glosa por partida. */
export function pedimentoAInputsGlosa(ped: PedimentoConPartidas, declarado: DeclaradoPedimento = {}): GlosaSimulationInput[] {
  const extra = datosArchivoDe(ped);
  const proveedor = extra.proveedores?.[0];
  const idsPed = (extra.identificadoresPedimento ?? []).map(i => ({ codigo: i.codigo, complemento1: i.complemento1, complemento2: i.complemento2 }));
  return ped.partidas.map(p => {
    const idsPartida = ((p.identificadores as IdentificadorImportado[] | null) ?? []).map(i => ({ codigo: i.codigo, complemento1: i.complemento1, complemento2: i.complemento2 }));
    const ids = [...idsPartida, ...idsPed];
    const codigos = new Set(ids.map(i => i.codigo.toUpperCase()));
    const tl = ids.find(i => i.codigo.toUpperCase() === 'TL');
    const tratado = tl ? tratadoDeComplemento(tl.complemento1) ?? 'TL' : undefined;
    const permisos = (p.permisos as PermisoImportado[] | null) ?? [];
    const cantidadUmt = extra.cantidadUmtPorPartida?.[String(p.numeroPartida)] ?? undefined;
    return {
      fractionCode: p.fraccion,
      productDescription: p.descripcion,
      countryOrigin: (p.pais || '').toUpperCase(),
      countryProvider: (p.paisVendedor || proveedor?.pais || p.pais || '').toUpperCase(),
      customsCode: ped.aduana,
      regimenCode: ped.clave,
      unitValueUSD: p.valorUnitario,
      unitMeasure: p.unidadMedida,
      units: Number.isInteger(p.cantidad) ? p.cantidad : Math.round(p.cantidad),
      // El archivo no trae peso por partida — no se reparte el peso bruto.
      weightKg: 0,
      totalValueUSD: p.valorAduana,
      declaresAntidumping: codigos.has('CC') || codigos.has('EE'),
      declaresLink: p.vinculacion,
      declaresNOMs: declarado.declaresNOMs ?? (codigos.has('NM') || permisos.some(x => /NOM/i.test(x.tipo) || /NOM/i.test(x.codigo))),
      // T-MEC: el archivo no dice si hay certificado vinculado; se deja al
      // declarado del usuario (sin él, ORI_002/DOC_001 no disparan por defecto
      // porque appliesTMEC queda indefinido; el cruce ORIGEN_TRATADO sí evalúa).
      appliesTMEC: declarado.hasTMECCertificate !== undefined && tratado === 'TMEC' ? true : undefined,
      hasTMECCertificate: declarado.hasTMECCertificate,
      hasIVAIEPSCertification: declarado.hasIVAIEPSCertification,
      documents: declarado.documents,
      tratadoDeclarado: tratado,
      exportadorNombre: proveedor?.nombre,
      identificadores: ids,
      unidadComercial: p.unidadMedidaCom ?? undefined,
      unidadTarifa: p.unidadMedida,
      cantidadUmc: p.cantidad,
      cantidadUmt: cantidadUmt ?? undefined,
      numeroPartida: p.numeroPartida,
      pedimentoId: ped.id,
    };
  });
}

export function resumirPedimento(partidas: PartidaGlosa[]): ResumenPedimentoGlosa {
  const hallazgos = new Map<string, HallazgoAgregado>();
  const cruces = new Map<string, CruceAgregado>();
  const noEval = new Map<string, { ruleCode: string; motivo: string; partidas: number[] }>();
  const crucesNoEval = new Map<string, { codigo: string; motivo: string; partidas: number[] }>();
  const noRev = new Map<string, { dominio: string; motivo: string; partidas: number[] }>();
  let riskScoreMax = -1;
  let riskLevelMax: GlosaSimulationResult['riskLevel'] | null = null;
  let partidaMax: number | null = null;
  let indeterminado = false;
  let evaluadas = 0, conError = 0;

  for (const p of partidas) {
    if (!p.resultado) { conError++; indeterminado = true; continue; }
    evaluadas++;
    const r = p.resultado;
    if (r.riskLevelPresentacion === 'indeterminado') indeterminado = true;
    if (r.riskScore > riskScoreMax || (r.riskScore === riskScoreMax && riskLevelMax && NIVEL_ORDEN[r.riskLevel] > NIVEL_ORDEN[riskLevelMax])) {
      riskScoreMax = r.riskScore; riskLevelMax = r.riskLevel; partidaMax = p.numeroPartida;
    }
    for (const f of r.flags) {
      const cur = hallazgos.get(f.ruleCode);
      if (cur) cur.partidas.push(p.numeroPartida);
      else hallazgos.set(f.ruleCode, { ruleCode: f.ruleCode, name: f.name, severity: f.severity, category: f.category, partidas: [p.numeroPartida], reason: f.reason, legalBasis: f.legalBasis });
    }
    for (const c of r.cruces ?? []) {
      if (c.estado === 'no_evaluado') {
        const k = `${c.codigo}|${c.motivo ?? ''}`;
        const cur = crucesNoEval.get(k);
        if (cur) cur.partidas.push(p.numeroPartida);
        else crucesNoEval.set(k, { codigo: c.codigo, motivo: c.motivo ?? c.mensaje, partidas: [p.numeroPartida] });
      } else if (c.resultado && c.resultado !== 'ok') {
        const k = `${c.codigo}|${c.resultado}`;
        const cur = cruces.get(k);
        if (cur) cur.partidas.push(p.numeroPartida);
        else cruces.set(k, { codigo: c.codigo, nombre: c.nombre, resultado: c.resultado, severidad: c.severidad, partidas: [p.numeroPartida], mensaje: c.mensaje, fundamento: c.fundamento });
      }
    }
    for (const ne of r.revision.reglasNoEvaluadas) {
      const k = `${ne.ruleCode}|${ne.motivo}`;
      const cur = noEval.get(k);
      if (cur) cur.partidas.push(p.numeroPartida);
      else noEval.set(k, { ruleCode: ne.ruleCode, motivo: ne.motivo, partidas: [p.numeroPartida] });
    }
    for (const nr of r.revision.noRevisados) {
      const k = `${nr.dominio}|${nr.motivo}`;
      const cur = noRev.get(k);
      if (cur) cur.partidas.push(p.numeroPartida);
      else noRev.set(k, { dominio: nr.dominio, motivo: nr.motivo, partidas: [p.numeroPartida] });
    }
  }

  const sevOrden = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return {
    partidasTotal: partidas.length,
    partidasEvaluadas: evaluadas,
    partidasConError: conError,
    riskScoreMax: riskScoreMax < 0 ? 0 : riskScoreMax,
    riskLevelMax,
    riskLevelPresentacion: indeterminado || riskLevelMax === null ? 'indeterminado' : riskLevelMax,
    partidaRiesgoMaximo: partidaMax,
    hallazgos: [...hallazgos.values()].sort((a, b) => sevOrden[a.severity] - sevOrden[b.severity]),
    cruces: [...cruces.values()].sort((a, b) => (a.severidad ? sevOrden[a.severidad] : 9) - (b.severidad ? sevOrden[b.severidad] : 9)),
    reglasNoEvaluadas: [...noEval.values()],
    crucesNoEvaluados: [...crucesNoEval.values()],
    dominiosNoRevisados: [...noRev.values()],
  };
}

export async function simulateGlosaPedimento(
  tenantId: string,
  userId: string,
  ped: PedimentoConPartidas,
  declarado: DeclaradoPedimento = {},
  fuentesOverride: Partial<GlosaFuentes> = {},
): Promise<GlosaPedimentoResultado> {
  const inputs = pedimentoAInputsGlosa(ped, declarado);
  const partidas: PartidaGlosa[] = [];
  for (const input of inputs) {
    const p = ped.partidas.find(x => x.numeroPartida === input.numeroPartida)!;
    try {
      const resultado = await simulateGlosa(tenantId, userId, input, fuentesOverride);
      partidas.push({ numeroPartida: p.numeroPartida, fraccion: p.fraccion, descripcion: p.descripcion, input, resultado, error: null });
    } catch (err) {
      partidas.push({ numeroPartida: p.numeroPartida, fraccion: p.fraccion, descripcion: p.descripcion, input, resultado: null, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const resumen = resumirPedimento(partidas);
  return {
    pedimentoId: ped.id, numero: ped.numero, clave: ped.clave, aduana: ped.aduana, origenArchivo: ped.origenArchivo,
    partidas, resumen, disclaimer: GLOSA_DISCLAIMER,
  };
}
