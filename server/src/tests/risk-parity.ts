/**
 * RISK SCORER — PARIDAD de cierre (5 operaciones, bandas DECLARADAS ANTES de correr).
 *
 * Ejecutar:  npx tsx src/tests/risk-parity.ts
 *
 * Requisitos: catálogo local completo + tabla Sat69B ingestada del CSV real
 * del SAT (caso 3 usa un RFC DEFINITIVO REAL de la tabla — no simulado).
 * Los casos usan un tenant sintético sin inventario para no contaminar F5.
 */
import { prisma } from '../lib/prisma';
import { evaluate } from '../services/risk-scorer/engine';
import { buildVerifiedSignals, normalizarOperacion } from '../services/risk-scorer/signals';
import { DEFAULT_WEIGHTS } from '../services/risk-scorer/rules';
import type { DeclaradoInput, OperacionInput, Signals, TipoSujeto } from '../services/risk-scorer/types';

const TENANT = 'parity-risk-tenant';
const RFC_LIMPIO = 'XAXX010101000';
const RFC_69B_DEFINITIVO = 'AAA120730823'; // real, presente en el CSV del SAT (corte 31-dic-2025)

interface Caso {
  nombre: string;
  tipoSujeto: TipoSujeto;
  fechaEvaluacion: string;
  operacion: OperacionInput;
  declarado: DeclaradoInput;
  esperado: { exposicion: number | ((n: number) => boolean); escudoPct: number; banda: string; banderas: string[] };
}

const todo59V = { a: true, b: true, c: true, d: true, e: true, f: true, g: true, h: true };

/** DECLARACIÓN PREVIA — calculada a mano regla por regla (ver comentarios). */
const CASOS: Caso[] = [
  {
    nombre: 'CASO 1 — LIMPIA (agente)',
    tipoSujeto: 'agente',
    fechaEvaluacion: '2026-07-15',
    operacion: { fraccion: '73181501', paisOrigen: 'US', valorUnitario: 100, numeroPedimento: '25 47 3461 4000284', importadorRfc: RFC_LIMPIO },
    declarado: {
      mveTransmitida: true, expedienteKyc: true, expediente162VII: true, controlInterno81A: true,
      encargoConferido: true, padronImportadoresVigente: true, padronesActivos: ['15'],
      evidenciaNoms: true, incrementablesConSoporte: true, pagoConSoporteBancario: true,
      proveedorLocalizable: true, expediente59V: todo59V,
    },
    // Ninguna regla dispara (cuota CN no aplica a origen US; sector 15 activo). Escudo 13/13.
    esperado: { exposicion: 0, escudoPct: 100, banda: 'VERDE', banderas: [] },
  },
  {
    nombre: 'CASO 2 — MEDIA (agente)',
    tipoSujeto: 'agente',
    fechaEvaluacion: '2026-07-15',
    operacion: { fraccion: '73181501', paisOrigen: 'US', numeroPedimento: '25 47 3461 4000284', importadorRfc: RFC_LIMPIO },
    declarado: {
      mveTransmitida: false, incrementablesConSoporte: false, proveedorLocalizable: false,
      pagoConSoporteBancario: true, expedienteKyc: false, expediente162VII: true,
      controlInterno81A: true, encargoConferido: false, padronImportadoresVigente: true,
      padronesActivos: ['15'],
      expediente59V: { a: true, b: true, c: true, d: true, e: true, f: true, g: false, h: false },
    },
    // F1: 4 (sin valor) + 0 (E2 durante prórroga) + 4 (incrementables) + 6 (proveedor) = 14.
    // El Transitorio Décimo Primero reformado permite el esquema previo hasta el 30-sep-2026 inclusive.
    // F2: 8 (KYC) · F8: 2 (encargo) → exposición 24. Escudo 8/13 = 62%. <30 × ≥50 → VERDE.
    esperado: { exposicion: 24, escudoPct: 62, banda: 'VERDE', banderas: [] },
  },
  {
    nombre: 'CASO 3 — CRÍTICA (agente, RFC 69-B DEFINITIVO REAL de la tabla ingestada)',
    tipoSujeto: 'agente',
    fechaEvaluacion: '2026-07-15',
    operacion: {
      fraccion: '64041901', paisOrigen: 'CN', numeroPedimento: '99 99 0000 123',
      importadorRfc: RFC_69B_DEFINITIVO, preferenciaArancelaria: true,
    },
    declarado: { proveedorLocalizable: false, rutaTercerPaisEnsamblador: true, padronesActivos: [] },
    // F1: 4+0 (E2 durante prórroga)+4+6+4 = 18; el Transitorio Décimo Primero aplica hasta el 30-sep-2026.
    // F2: 22 (69-B DEFINITIVO, bandera) · F3: 8+4+4 = 16 → 12
    // F4: 8 (sector 10 faltante) · F7: 8 (NOM-020 sin evidencia, bandera EMBARGO)
    // F8: 3 (pedimento inválido) + 3 (preferencia sin 9 elementos) + 2 (encargo) = 8 → 6
    // Total 74. Escudo 0/14 (ORIGEN aplica por cuota) = 0%. Fila alta + <50 → ROJO_CRITICO.
    esperado: { exposicion: 74, escudoPct: 0, banda: 'ROJO_CRITICO', banderas: ['LISTADO_69B', 'EMBARGO'] },
  },
  {
    nombre: 'CASO 4 — AGENCIA (checklist 235-F/235-J)',
    tipoSujeto: 'agencia',
    fechaEvaluacion: '2026-07-15',
    operacion: { fraccion: '73181501', paisOrigen: 'US', valorUnitario: 100, numeroPedimento: '25 47 3461 4000284', importadorRfc: RFC_LIMPIO },
    declarado: {
      mveTransmitida: true, expedienteKyc: true, expediente162VII: true, controlInterno81A: true,
      encargoConferido: true, padronImportadoresVigente: true, padronesActivos: ['15'],
      evidenciaNoms: true, incrementablesConSoporte: true, pagoConSoporteBancario: true,
      proveedorLocalizable: true, expediente59V: todo59V,
      constancia32D: true, mveEspejoAgencia: false, // 235-J ✓ · 235-F ✗
    },
    // Exposición 0. Escudo 14/15 = 93% (solo falta 235-F). VERDE.
    esperado: { exposicion: 0, escudoPct: 93, banda: 'VERDE', banderas: [] },
  },
  {
    nombre: 'CASO 5 — E2 POST-PRÓRROGA',
    tipoSujeto: 'agente',
    fechaEvaluacion: '2026-10-01',
    operacion: { fraccion: '73181501', paisOrigen: 'US', valorUnitario: 100, numeroPedimento: '25 47 3461 4000284', importadorRfc: RFC_LIMPIO },
    declarado: {
      mveTransmitida: false, expedienteKyc: true, expediente162VII: true, controlInterno81A: true,
      encargoConferido: true, padronImportadoresVigente: true, padronesActivos: ['15'],
      evidenciaNoms: true, incrementablesConSoporte: true, pagoConSoporteBancario: true,
      proveedorLocalizable: true, expediente59V: todo59V,
    },
    // Vencida la prórroga (30-sep-2026 inclusive), F1-VAL-02 vuelve a sumar 8. Escudo 12/13 = 92%. <30 × ≥50 → VERDE.
    esperado: { exposicion: 8, escudoPct: 92, banda: 'VERDE', banderas: [] },
  },
];

let ok = 0, fail = 0;
const assert = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.error(`  ❌ ${msg}`); } };

async function main() {
  // Precondiciones del entorno de paridad
  const meta = await prisma.sat69B.findFirst({ select: { importedAt: true } });
  if (!meta) throw new Error('Tabla Sat69B vacía — corre scripts/ingest-69b.ts primero');
  const real = await prisma.sat69B.findUnique({ where: { rfc: RFC_69B_DEFINITIVO } });
  assert(real?.situacion === 'DEFINITIVO', `precondición: ${RFC_69B_DEFINITIVO} es DEFINITIVO real en la tabla`);
  assert(!(await prisma.sat69B.findUnique({ where: { rfc: RFC_LIMPIO } })), `precondición: ${RFC_LIMPIO} NO está en la tabla`);

  console.log('══ BANDAS DECLARADAS ANTES DE CORRER ══');
  for (const c of CASOS) console.log(`  ${c.nombre} → ${c.esperado.banda} (exposición ${c.esperado.exposicion}, escudo ${c.esperado.escudoPct}%, banderas [${c.esperado.banderas}])`);

  console.log('\n══ EJECUCIÓN ══');
  for (const c of CASOS) {
    const op = normalizarOperacion(c.operacion);
    const verificado = await buildVerifiedSignals(TENANT, op);
    const signals: Signals = {
      tipoSujeto: c.tipoSujeto,
      fechaEvaluacion: c.fechaEvaluacion,
      operacion: op,
      declarado: c.declarado,
      verificado,
    };
    const r = evaluate(signals, DEFAULT_WEIGHTS);
    console.log(`\n${c.nombre}`);
    console.log(`  → exposición ${r.exposicion} | escudo ${r.escudoPct}% | banda ${r.banda} | banderas [${r.banderas}]`);
    const expOk = typeof c.esperado.exposicion === 'number' ? r.exposicion === c.esperado.exposicion : c.esperado.exposicion(r.exposicion);
    assert(expOk, `${c.nombre}: exposición esperada ${c.esperado.exposicion}, dio ${r.exposicion}`);
    assert(r.escudoPct === c.esperado.escudoPct, `${c.nombre}: escudo esperado ${c.esperado.escudoPct}, dio ${r.escudoPct}`);
    assert(r.banda === c.esperado.banda, `${c.nombre}: banda esperada ${c.esperado.banda}, dio ${r.banda}`);
    assert(JSON.stringify([...r.banderas].sort()) === JSON.stringify([...c.esperado.banderas].sort()), `${c.nombre}: banderas esperadas [${c.esperado.banderas}], dio [${r.banderas}]`);
    if (c.nombre.startsWith('CASO 3')) {
      const f2 = r.factores.find(f => f.factor === 'PERFIL')!;
      assert(f2.puntos === DEFAULT_WEIGHTS.PERFIL, `caso 3: PERFIL saturado (dio ${f2.puntos})`);
      const regla69b = f2.reglas.find(x => x.id === 'F2-PER-01')!;
      assert(regla69b.puntos === 22 && regla69b.origenSenal === 'verificado', 'caso 3: F2-PER-01 disparó como VERIFICADO contra la tabla real');
      console.log(`  match 69-B real: ${RFC_69B_DEFINITIVO} (lista al ${verificado.en69B?.listaAl}) — verificado, no simulado`);
    }
    if (c.nombre.startsWith('CASO 4')) {
      const f235 = r.checklist.find(x => x.id === 'ESC-235F')!;
      const j235 = r.checklist.find(x => x.id === 'ESC-235J')!;
      assert(f235.aplicable && !f235.completo, 'caso 4: ESC-235F aplicable e incompleto');
      assert(j235.aplicable && j235.completo, 'caso 4: ESC-235J aplicable y completo');
      assert(r.faltantes.some(x => x.includes('235-F')), 'caso 4: faltante accionable cita RLA 235-F');
    }
  }

  console.log(`\nPARIDAD RISK SCORER: ${ok} ok, ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL:', e?.message); process.exit(1); });
