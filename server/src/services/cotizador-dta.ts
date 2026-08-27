/**
 * DTA respaldado por el corpus (Ola 2, Cotizador).
 * Lee UNA vez (caché 10 min) el LegalDocument "Art. 49 LFD" y marca el
 * catálogo de `lib/dta.ts` con cotejo 'corpus' | 'verificado' | 'pendiente'.
 */
import { prisma } from '../lib/prisma';
import { CATALOGO_DTA, resolverDTA, verificarDTAContraTexto, type DTAResuelto, type EntradaDTA, type TipoOperacionDTA } from '../lib/dta';

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; catalogo: EntradaDTA[]; fuente: FuenteDTA | null } | null = null;

export interface FuenteDTA {
  reference: string;
  title: string;
  officialUrl: string | null;
  version: string | null;
  claseTexto: string;
  fechaCotejo: string | null;
}

export async function catalogoDTARespaldado(): Promise<{ catalogo: EntradaDTA[]; fuente: FuenteDTA | null }> {
  if (cache && Date.now() - cache.at < TTL_MS) return { catalogo: cache.catalogo, fuente: cache.fuente };
  let catalogo = CATALOGO_DTA;
  let fuente: FuenteDTA | null = null;
  try {
    const doc = await prisma.legalDocument.findFirst({
      where: { reference: 'Art. 49 LFD', isActive: true },
      orderBy: { fechaCotejo: 'desc' },
      select: { reference: true, title: true, content: true, officialUrl: true, version: true, claseTexto: true, fechaCotejo: true },
    });
    if (doc) {
      fuente = { reference: doc.reference, title: doc.title, officialUrl: doc.officialUrl, version: doc.version, claseTexto: doc.claseTexto, fechaCotejo: doc.fechaCotejo?.toISOString() ?? null };
      catalogo = verificarDTAContraTexto(doc.content, { verbatimCotejado: doc.claseTexto === 'texto_integro' && !!doc.fechaCotejo });
    } else {
      catalogo = verificarDTAContraTexto(null);
    }
  } catch {
    // Sin DB: todo queda 'pendiente' (fail-closed hacia el aviso, nunca hacia "verificado").
    catalogo = verificarDTAContraTexto(null);
  }
  cache = { at: Date.now(), catalogo, fuente };
  return { catalogo, fuente };
}

export async function resolverDTAConCorpus(tipo: TipoOperacionDTA | null | undefined): Promise<DTAResuelto & { fuente: FuenteDTA | null }> {
  const { catalogo, fuente } = await catalogoDTARespaldado();
  return { ...resolverDTA(tipo, catalogo), fuente };
}

export function invalidarCacheDTA(): void { cache = null; }
