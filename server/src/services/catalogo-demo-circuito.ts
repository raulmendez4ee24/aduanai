/**
 * DEMO — circuito catálogo↔clasificador visible (4ª revisión, 27-ago-2026).
 *
 * El dataset demo sembraba 9 partes (`Product`) con `fractionCode` pero
 * `versionVigente = 0`: en la pantalla de Catálogo salían las 9 como "sin
 * dictamen" y el circuito clasificación→dictamen→parte no se veía por ningún
 * lado. Este seed cierra el círculo SOBRE DATOS QUE YA EXISTEN:
 *
 *   - cada parte demo recibe su `ProductClassificationVersion` VIGENTE con la
 *     fracción que ya traía el inventario/BOM demo (p. ej. el arnés en
 *     85443099) — aquí no se inventa ninguna fracción;
 *   - la versión queda LIGADA a una `Classification` demo real del mismo
 *     tenant con esa misma fracción cuando existe (fuente 'clasificador'); si
 *     no hay ninguna, se marca fuente 'manual' y se dice de dónde salió;
 *   - el NICO sale del catálogo TIGIE sembrado (`Fraction.nico`, que solo
 *     tiene valor cuando la fracción tiene UN NICO). Si la fracción se
 *     subdivide, la versión queda sin NICO en vez de elegir uno al azar;
 *   - una parte (el tornillo M5) queda con DOS versiones — la v1 'reemplazada'
 *     con su justificación — para que el versionado se vea en la ficha.
 *
 * Idempotente: solo toca partes demo (`isDemoData: true`) del tenant que se le
 * pasa y que aún no tienen ninguna versión. Correrlo dos veces no duplica nada.
 */
import type { PrismaClient } from '@prisma/client';

/** SKU demo que se reclasifica para que el versionado sea visible. */
const SKU_CON_HISTORIA = 'MP-TORN-M5';
/** Fracción con la que "había quedado" la v1 del tornillo (tuerca M6, del propio corpus demo). */
const FRACCION_PREVIA_M5 = '73181606';
const JUSTIFICACION_M5 =
  'Reclasificada: la ficha técnica del proveedor confirma tornillo hexagonal con rosca completa (partida 7318.15) — la versión anterior lo había declarado como tuerca (7318.16). Se corrige el expediente antes del siguiente pedimento.';

export interface ResultadoCircuitoDemo {
  /** Partes a las que ESTA corrida les creó el dictamen (0 en la segunda corrida). */
  partes: number;
  versionesVigentes: number;
  versionesReemplazadas: number;
  ligadasAClasificacion: number;
  sinClasificacion: number;
  /** Estado final: partes demo del tenant con dictamen vigente (lo que se ve en /catalogo). */
  totalConDictamen: number;
  totalPartes: number;
}

function limpiar(code: string | null | undefined): string | null {
  const d = String(code ?? '').replace(/[.\-\s]/g, '');
  return /^\d{8}$/.test(d) ? d : null;
}

/**
 * Deja las partes demo del tenant con dictamen vigente.
 * @param tenantId tenant demo (el llamador es quien decide; nunca se corre sobre todos)
 * @param userId   usuario demo que "propuso y aprobó" las versiones
 */
export async function seedCircuitoCatalogoDemo(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
): Promise<ResultadoCircuitoDemo> {
  const res: ResultadoCircuitoDemo = { partes: 0, versionesVigentes: 0, versionesReemplazadas: 0, ligadasAClasificacion: 0, sinClasificacion: 0, totalConDictamen: 0, totalPartes: 0 };

  const partes = await prisma.product.findMany({
    where: { tenantId, isDemoData: true, active: true },
    orderBy: { productCode: 'asc' },
  });
  res.totalPartes = partes.length;
  if (partes.length === 0) return res;

  // Clasificaciones demo del tenant, indexadas por fracción (se prefiere la que
  // el usuario marcó ✓ y, entre ellas, la más reciente).
  const clasificaciones = await prisma.classification.findMany({
    where: { tenantId, isDemoData: true },
    select: { id: true, fractionCode: true, feedback: true, createdAt: true, tigieVersion: true },
    orderBy: { createdAt: 'desc' },
  });
  const porFraccion = new Map<string, { id: string; tigieVersion: string | null; createdAt: Date; correcta: boolean }>();
  for (const c of clasificaciones) {
    const f = limpiar(c.fractionCode);
    if (!f) continue;
    const correcta = c.feedback === 'correct';
    const previa = porFraccion.get(f);
    // El orden ya es por fecha desc: se guarda la primera, y solo la desplaza
    // una con ✓ del usuario cuando la guardada no lo tenía.
    if (!previa || (correcta && !previa.correcta)) {
      porFraccion.set(f, { id: c.id, tigieVersion: c.tigieVersion, createdAt: c.createdAt, correcta });
    }
  }

  // NICO canónico: solo cuando la fracción tiene UNO (Fraction.nico); si se
  // subdivide, la versión queda sin NICO — no se elige por nosotros.
  const codigos = Array.from(new Set(partes.map(p => limpiar(p.fractionCode)).filter((x): x is string => !!x).concat(FRACCION_PREVIA_M5)));
  const fracciones = codigos.length
    ? await prisma.fraction.findMany({ where: { code: { in: codigos } }, select: { code: true, nico: true } })
    : [];
  const nicoDe = new Map(fracciones.map(f => [f.code, f.nico ?? null]));

  for (const parte of partes) {
    const fraccion = limpiar(parte.fractionCode);
    if (!fraccion) continue;
    // Idempotencia: la parte que ya tiene expediente no se toca.
    const yaTieneVersiones = await prisma.productClassificationVersion.count({ where: { productId: parte.id } });
    if (yaTieneVersiones > 0 || parte.versionVigente > 0) continue;

    const conHistoria = parte.productCode === SKU_CON_HISTORIA;
    let version = 0;

    if (conHistoria) {
      // v1 — la clasificación "vieja" que después se corrigió.
      const previa = porFraccion.get(FRACCION_PREVIA_M5) ?? null;
      version += 1;
      await prisma.productClassificationVersion.create({
        data: {
          productId: parte.id,
          version,
          fractionCode: FRACCION_PREVIA_M5,
          nico: nicoDe.get(FRACCION_PREVIA_M5) ?? null,
          justificacion: null,
          fuente: previa ? 'clasificador' : 'manual',
          classificationId: previa?.id ?? null,
          estado: 'reemplazada',
          propuestoPor: userId,
          aprobadoPor: userId,
          aprobadoAt: previa?.createdAt ?? new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          tigieVersion: previa?.tigieVersion ?? null,
        },
      });
      res.versionesReemplazadas++;
    }

    const hit = porFraccion.get(fraccion) ?? null;
    version += 1;
    await prisma.productClassificationVersion.create({
      data: {
        productId: parte.id,
        version,
        fractionCode: fraccion,
        nico: nicoDe.get(fraccion) ?? null,
        justificacion: conHistoria
          ? JUSTIFICACION_M5
          : hit
            ? null
            : 'Fracción tomada del inventario IMMEX demo de esta parte; sin clasificación en el historial que la respalde.',
        fuente: hit ? 'clasificador' : 'manual',
        classificationId: hit?.id ?? null,
        estado: 'vigente',
        propuestoPor: userId,
        aprobadoPor: userId,
        aprobadoAt: hit?.createdAt ?? new Date(),
        tigieVersion: hit?.tigieVersion ?? null,
      },
    });
    await prisma.product.update({
      where: { id: parte.id },
      data: { fractionCode: fraccion, nico: nicoDe.get(fraccion) ?? null, versionVigente: version },
    });

    res.partes++;
    res.versionesVigentes++;
    if (hit) res.ligadasAClasificacion++; else res.sinClasificacion++;
  }

  res.totalConDictamen = await prisma.product.count({ where: { tenantId, isDemoData: true, active: true, versionVigente: { gt: 0 } } });
  return res;
}
