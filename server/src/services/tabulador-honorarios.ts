/**
 * Tabulador de honorarios de la agencia (Ola 2, Cotizador).
 *
 * `TabuladorHonorarios.reglas` = [{ tipoOperacion, base, valor, minimo?, maximo? }]
 *   - base 'fijo'       → honorarios = valor (MXN)
 *   - base 'porcentaje' → honorarios = valorMXN × valor / 100
 *   - base 'millar'     → honorarios = valorMXN × valor / 1000
 *   - minimo/maximo acotan el resultado.
 * `tipoOperacion` usa los tipos del catálogo DTA ('general', 'temporal_immex'…)
 * o '*' como comodín. Se elige la regla del tipo exacto; si no hay, '*'.
 */
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { esTipoOperacionDTA } from '../lib/dta';

export type BaseHonorarios = 'fijo' | 'porcentaje' | 'millar';

export interface ReglaHonorarios {
  tipoOperacion: string; // TipoOperacionDTA | '*'
  base: BaseHonorarios;
  valor: number;
  minimo?: number;
  maximo?: number;
}

export interface HonorariosCalculados {
  monto: number;
  regla: ReglaHonorarios | null;
  detalle: string;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const MAX_MXN = 1_000_000_000;

export function validarReglas(x: unknown): ReglaHonorarios[] {
  if (!Array.isArray(x) || x.length === 0) throw new AppError('reglas[] requerido (al menos una regla)', 422);
  if (x.length > 50) throw new AppError('Demasiadas reglas (máximo 50)', 422);
  return x.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const tipo = typeof o.tipoOperacion === 'string' ? o.tipoOperacion.trim() : '';
    if (tipo !== '*' && !esTipoOperacionDTA(tipo)) throw new AppError(`Regla ${i + 1}: tipoOperacion inválido ("${tipo}")`, 422);
    const base = o.base;
    if (base !== 'fijo' && base !== 'porcentaje' && base !== 'millar') throw new AppError(`Regla ${i + 1}: base debe ser fijo | porcentaje | millar`, 422);
    const valor = Number(o.valor);
    const tope = base === 'porcentaje' ? 100 : base === 'millar' ? 1000 : MAX_MXN;
    if (!(Number.isFinite(valor) && valor >= 0 && valor <= tope)) throw new AppError(`Regla ${i + 1}: valor fuera de rango (0 a ${tope})`, 422);
    const lim = (k: 'minimo' | 'maximo'): number | undefined => {
      if (o[k] == null || o[k] === '') return undefined;
      const n = Number(o[k]);
      if (!(Number.isFinite(n) && n >= 0 && n <= MAX_MXN)) throw new AppError(`Regla ${i + 1}: ${k} fuera de rango`, 422);
      return n;
    };
    const minimo = lim('minimo'); const maximo = lim('maximo');
    if (minimo != null && maximo != null && minimo > maximo) throw new AppError(`Regla ${i + 1}: mínimo mayor que máximo`, 422);
    return { tipoOperacion: tipo, base, valor, ...(minimo != null ? { minimo } : {}), ...(maximo != null ? { maximo } : {}) };
  });
}

/** Puro. `valorMXN` = valor en aduana total de la operación. */
export function calcularHonorarios(reglas: ReglaHonorarios[], ctx: { tipoOperacion: string; valorMXN: number }): HonorariosCalculados {
  const regla = reglas.find(r => r.tipoOperacion === ctx.tipoOperacion) ?? reglas.find(r => r.tipoOperacion === '*') ?? null;
  if (!regla) return { monto: 0, regla: null, detalle: `Sin regla para "${ctx.tipoOperacion}" en el tabulador — captura honorarios manualmente.` };
  let bruto = regla.base === 'fijo' ? regla.valor
    : regla.base === 'porcentaje' ? ctx.valorMXN * regla.valor / 100
    : ctx.valorMXN * regla.valor / 1000;
  let detalle = regla.base === 'fijo' ? `Cuota fija $${regla.valor.toFixed(2)}`
    : regla.base === 'porcentaje' ? `${regla.valor}% × $${round2(ctx.valorMXN).toLocaleString('en-US')} = $${round2(bruto).toLocaleString('en-US')}`
    : `${regla.valor} al millar × $${round2(ctx.valorMXN).toLocaleString('en-US')} = $${round2(bruto).toLocaleString('en-US')}`;
  if (regla.minimo != null && bruto < regla.minimo) { bruto = regla.minimo; detalle += ` → mínimo $${regla.minimo.toFixed(2)}`; }
  if (regla.maximo != null && bruto > regla.maximo) { bruto = regla.maximo; detalle += ` → máximo $${regla.maximo.toFixed(2)}`; }
  return { monto: round2(bruto), regla, detalle: `${detalle} (regla ${regla.tipoOperacion})` };
}

// ── CRUD (por tenant) ──

export async function listarTabuladores(tenantId: string) {
  return prisma.tabuladorHonorarios.findMany({ where: { tenantId }, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] });
}

export async function obtenerTabulador(tenantId: string, id: string) {
  const t = await prisma.tabuladorHonorarios.findFirst({ where: { id, tenantId } });
  if (!t) throw new AppError('Tabulador no encontrado', 404);
  return t;
}

export async function crearTabulador(tenantId: string, body: { nombre?: unknown; reglas?: unknown }) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
  if (!nombre) throw new AppError('nombre requerido', 422);
  const reglas = validarReglas(body.reglas);
  return prisma.tabuladorHonorarios.create({ data: { tenantId, nombre, reglas: reglas as object[] } });
}

export async function actualizarTabulador(tenantId: string, id: string, body: { nombre?: unknown; reglas?: unknown; activo?: unknown }) {
  await obtenerTabulador(tenantId, id);
  const data: { nombre?: string; reglas?: object[]; activo?: boolean } = {};
  if (body.nombre !== undefined) {
    const n = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
    if (!n) throw new AppError('nombre inválido', 422);
    data.nombre = n;
  }
  if (body.reglas !== undefined) data.reglas = validarReglas(body.reglas) as object[];
  if (body.activo !== undefined) data.activo = !!body.activo;
  await prisma.tabuladorHonorarios.updateMany({ where: { id, tenantId }, data });
  return obtenerTabulador(tenantId, id);
}

export async function eliminarTabulador(tenantId: string, id: string) {
  const r = await prisma.tabuladorHonorarios.deleteMany({ where: { id, tenantId } });
  if (r.count === 0) throw new AppError('Tabulador no encontrado', 404);
}

/** Honorarios desde un tabulador del tenant (null si no existe/inactivo). */
export async function honorariosDesdeTabulador(tenantId: string, tabuladorId: string, ctx: { tipoOperacion: string; valorMXN: number }): Promise<(HonorariosCalculados & { tabuladorId: string; tabuladorNombre: string }) | null> {
  const t = await prisma.tabuladorHonorarios.findFirst({ where: { id: tabuladorId, tenantId, activo: true } });
  if (!t) return null;
  const reglas = Array.isArray(t.reglas) ? (t.reglas as unknown as ReglaHonorarios[]) : [];
  return { ...calcularHonorarios(reglas, ctx), tabuladorId: t.id, tabuladorNombre: t.nombre };
}
