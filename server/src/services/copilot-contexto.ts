/**
 * Copilot — contexto OPERATIVO del tenant/cliente activo (Ola 2, 27-ago-2026).
 *
 * "Los tres son el mismo producto": la respuesta legal sale del corpus; este
 * bloque añade los DATOS REALES de la operación del usuario (saldos de
 * temporales por clave, certificación IVA/IEPS, programa IMMEX, padrones,
 * últimas fracciones) para que el Copilot pueda decir "tienes 3 pedimentos IN
 * con saldo que podrías descargar así…".
 *
 * Reglas duras:
 *  - El bloque va ETIQUETADO como "datos de tu operación" y el system prompt
 *    prohíbe usarlo como fuente legal o mezclarlo con las citas.
 *  - Sin datos → sin bloque (jamás se inventa un saldo ni un programa).
 *  - Nunca contiene texto que parezca una cita legal ("Art.", "Regla") para
 *    que el matcher de citas (`cruzarCitas`) no lo confunda.
 *  - Todo `where` lleva tenantId; el clienteId es una dimensión dentro del tenant.
 */
import { prisma } from '../lib/prisma';

export interface TemporalPorVencer {
  pedimento: string;
  fraccion: string;
  saldo: number;
  unidad: string;
  vence: string; // YYYY-MM-DD
  diasRestantes: number;
}

export interface SaldoPorClave {
  clave: string;          // IN | AF | BA | (sin clave)
  pedimentos: number;     // pedimentos con saldo
  saldoTotal: number;     // Σ (quantity - quantityDischarged)
  porVencer: TemporalPorVencer[]; // ≤ 60 días, ordenados por fecha
}

export interface ContextoOperativo {
  cliente: {
    rfc: string;
    razonSocial: string;
    programaIMMEX: string | null;
    certificacionIVAIEPS: string | null;
    padronImportadores: boolean;
    padronesSectoriales: string[];
  } | null;
  temporales: SaldoPorClave[];
  padronesTenant: { codigo: string; nombre: string; status: string }[];
  ultimasFracciones: string[];
  generadoAt: string;
}

export const MARCA_INICIO_CONTEXTO = '[DATOS DE TU OPERACIÓN — no son fuente legal]';
export const MARCA_FIN_CONTEXTO = '[FIN DATOS DE TU OPERACIÓN]';

const DIAS_VENTANA = 60;

function tieneDatos(ctx: ContextoOperativo): boolean {
  return ctx.cliente !== null
    || ctx.temporales.length > 0
    || ctx.padronesTenant.length > 0
    || ctx.ultimasFracciones.length > 0;
}

/**
 * Lee del tenant (y del cliente activo, si lo hay) los datos operativos.
 * Devuelve null cuando NO hay nada que decir — el llamador omite el bloque.
 */
export async function construirContextoOperativo(
  tenantId: string,
  clienteId: string | null,
  ahora: Date = new Date(),
): Promise<ContextoOperativo | null> {
  const filtroCliente = clienteId ? { clienteId } : {};

  const [cliente, temporales, padrones, clasificaciones] = await Promise.all([
    clienteId
      ? prisma.cliente.findFirst({
          where: { id: clienteId, tenantId, activo: true },
          select: { rfc: true, razonSocial: true, programaIMMEX: true, certificacionIVAIEPS: true, padronImportadores: true, padronesSectoriales: true },
        })
      : Promise.resolve(null),
    prisma.temporaryImport.findMany({
      where: {
        tenantId, isDemoData: false, ...filtroCliente,
        status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED', 'EXPIRED'] },
      },
      select: { pedimento: true, fractionCode: true, quantity: true, quantityDischarged: true, unit: true, expirationDate: true, claveDocumento: true },
      orderBy: { expirationDate: 'asc' },
      take: 500,
    }),
    prisma.tenantPadronStatus.findMany({
      where: { tenantId, status: { in: ['active', 'suspended', 'expired', 'in_process'] } },
      select: { status: true, padron: { select: { type: true, sectorialCode: true, sectorialName: true, description: true } } },
      take: 30,
    }),
    prisma.classification.findMany({
      where: { tenantId, ...filtroCliente },
      select: { fractionCode: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ]);

  // Saldos por clave (IN/AF/BA…): solo pedimentos con saldo > 0.
  const porClave = new Map<string, SaldoPorClave>();
  for (const t of temporales) {
    const saldo = Math.max(0, (t.quantity ?? 0) - (t.quantityDischarged ?? 0));
    if (saldo <= 0) continue;
    const clave = (t.claveDocumento ?? '').trim().toUpperCase() || 'sin clave';
    const acc = porClave.get(clave) ?? { clave, pedimentos: 0, saldoTotal: 0, porVencer: [] };
    acc.pedimentos += 1;
    acc.saldoTotal += saldo;
    const dias = Math.ceil((t.expirationDate.getTime() - ahora.getTime()) / 86_400_000);
    if (dias <= DIAS_VENTANA && acc.porVencer.length < 5) {
      acc.porVencer.push({
        pedimento: t.pedimento, fraccion: t.fractionCode, saldo, unidad: t.unit,
        vence: t.expirationDate.toISOString().slice(0, 10), diasRestantes: dias,
      });
    }
    porClave.set(clave, acc);
  }

  const vistas = new Set<string>();
  const ultimasFracciones: string[] = [];
  for (const c of clasificaciones) {
    if (!c.fractionCode || vistas.has(c.fractionCode)) continue;
    vistas.add(c.fractionCode);
    ultimasFracciones.push(c.fractionCode);
    if (ultimasFracciones.length >= 8) break;
  }

  const ctx: ContextoOperativo = {
    cliente: cliente ? { ...cliente } : null,
    temporales: [...porClave.values()].sort((a, b) => b.saldoTotal - a.saldoTotal),
    padronesTenant: padrones.map(p => ({
      codigo: p.padron.sectorialCode ?? p.padron.type,
      nombre: p.padron.sectorialName ?? p.padron.description.slice(0, 60),
      status: p.status,
    })),
    ultimasFracciones,
    generadoAt: ahora.toISOString(),
  };
  return tieneDatos(ctx) ? ctx : null;
}

function fmtFraccion(code: string): string {
  const d = code.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : code;
}

/**
 * Bloque de texto que se inyecta al prompt del usuario. Vacío ('') si no hay
 * contexto. Deliberadamente sin la palabra "Art." ni "Regla": el matcher de
 * citas lee la RESPUESTA, pero por higiene tampoco sembramos patrones aquí.
 */
export function renderizarBloqueContexto(ctx: ContextoOperativo | null): string {
  if (!ctx || !tieneDatos(ctx)) return '';
  const lineas: string[] = [];
  if (ctx.cliente) {
    const c = ctx.cliente;
    lineas.push(`Cliente activo: ${c.razonSocial} (RFC ${c.rfc}).`);
    lineas.push(`Programa IMMEX: ${c.programaIMMEX ?? 'no registrado en el sistema'}.`);
    lineas.push(`Certificación IVA/IEPS: ${c.certificacionIVAIEPS ? `modalidad ${c.certificacionIVAIEPS}` : 'no registrada en el sistema (asume SIN certificación salvo que el usuario diga otra cosa)'}.`);
    lineas.push(`Padrón de importadores: ${c.padronImportadores ? 'registrado' : 'no registrado en el sistema'}.`);
    if (c.padronesSectoriales.length > 0) lineas.push(`Padrones sectoriales del cliente: ${c.padronesSectoriales.join(', ')}.`);
  }
  if (ctx.padronesTenant.length > 0) {
    lineas.push(`Padrones sectoriales de la empresa: ${ctx.padronesTenant.map(p => `${p.codigo} ${p.nombre} (${p.status})`).join('; ')}.`);
  }
  if (ctx.temporales.length > 0) {
    lineas.push('Importaciones temporales con saldo (inventario del sistema):');
    for (const t of ctx.temporales) {
      lineas.push(`- Clave ${t.clave}: ${t.pedimentos} pedimento(s) con saldo, total ${redondear(t.saldoTotal)} unidades.`);
      for (const v of t.porVencer) {
        const cuando = v.diasRestantes < 0 ? `VENCIDO hace ${-v.diasRestantes} días` : `vence en ${v.diasRestantes} días (${v.vence})`;
        lineas.push(`  · Pedimento ${v.pedimento}, fracción ${fmtFraccion(v.fraccion)}, saldo ${redondear(v.saldo)} ${v.unidad}, ${cuando}.`);
      }
    }
  } else {
    lineas.push('Importaciones temporales con saldo: ninguna registrada en el sistema.');
  }
  if (ctx.ultimasFracciones.length > 0) {
    lineas.push(`Últimas fracciones clasificadas: ${ctx.ultimasFracciones.map(fmtFraccion).join(', ')}.`);
  }
  return `\n${MARCA_INICIO_CONTEXTO}\n${lineas.join('\n')}\n${MARCA_FIN_CONTEXTO}\n`;
}

function redondear(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Instrucción que acompaña al bloque en el system prompt (solo cuando hay bloque). */
export const INSTRUCCION_CONTEXTO_OPERATIVO = `
DATOS DE TU OPERACIÓN (bloque "${MARCA_INICIO_CONTEXTO}"):
- Son registros del sistema del usuario (inventario, cliente, padrones), NO son fuente legal. JAMÁS los cites como fundamento ni los mezcles con las citas del contexto legal.
- Si son útiles para la pregunta, añade al final (antes del disclaimer) una sección con el encabezado exacto "Datos de tu operación" y ahí aplica la respuesta legal a esos datos (p. ej. qué pedimentos con saldo podrías descargar y en qué orden por vencimiento). Menciona SOLO números que aparezcan en el bloque; no inventes pedimentos, saldos ni fechas.
- Si los datos no son relevantes para la pregunta, omite la sección.
- Si el bloque dice "no registrada en el sistema", dilo así: no asumas que el cliente sí la tiene.`;
