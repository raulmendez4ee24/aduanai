/**
 * Subpartidas hermanas (Ola 1, Operación 2026-08).
 *
 * Capa de PRESENTACIÓN/CONTRASTE: dado el código elegido por el clasificador,
 * devuelve las subpartidas (6 dígitos) de la MISMA partida (4 dígitos) que
 * existen en el catálogo TIGIE cargado (`Subheading`/`Fraction`), con su
 * descripción oficial y las fracciones activas de cada una, marcando la
 * elegida. NO toca el prompt del clasificador (iteraciones pausadas — ver
 * memoria del proyecto): es lo que el usuario compara a ojo.
 *
 * Nada se inventa: si la partida no está en catálogo, lista vacía.
 */
import { prisma } from '../lib/prisma';

export interface FraccionHermana {
  code: string;          // 8 dígitos
  codeFormatted: string; // 7318.15.99
  description: string;
  elegida: boolean;
}

export interface SubpartidaHermana {
  code: string;          // 6 dígitos
  codeFormatted: string; // 7318.15
  description: string;
  elegida: boolean;
  fracciones: FraccionHermana[];
}

export function limpiarCodigo(code: string | null | undefined): string {
  return (code ?? '').replace(/[^0-9]/g, '');
}

export async function subpartidasHermanas(fractionCode: string | null | undefined): Promise<SubpartidaHermana[]> {
  const limpio = limpiarCodigo(fractionCode);
  if (limpio.length < 6) return [];
  const partida = limpio.slice(0, 4);
  const subElegida = limpio.slice(0, 6);
  const fracElegida = limpio.length >= 8 ? limpio.slice(0, 8) : null;

  const subs = await prisma.subheading.findMany({
    where: { code: { startsWith: partida } },
    orderBy: { code: 'asc' },
    select: {
      code: true,
      description: true,
      fractions: {
        where: { active: true },
        orderBy: { code: 'asc' },
        select: { code: true, codeFormatted: true, description: true },
      },
    },
  });

  return subs.map(s => ({
    code: s.code,
    codeFormatted: `${s.code.slice(0, 4)}.${s.code.slice(4, 6)}`,
    description: s.description,
    elegida: s.code === subElegida,
    fracciones: s.fractions.map(f => ({
      code: f.code,
      codeFormatted: f.codeFormatted,
      description: f.description,
      elegida: fracElegida !== null && f.code === fracElegida,
    })),
  }));
}
