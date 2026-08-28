/**
 * RGI 6 — específica vs residual (4ª revisión, prioridad 1).
 *
 * Ejecutar:  npm run test:rgi6      (server/)
 *
 * Determinista salvo el último bloque: el LLM va INYECTADO en todas las
 * pruebas del pase. El caso de control end-to-end contra el LLM real solo
 * corre con `RGI6_E2E=1` y ANTHROPIC_API_KEY presente (ver el pie del archivo).
 *
 * Cubre:
 *  1. Detector de residual (texto "los demás", sufijo .99 con hermanas, no-residual).
 *  2. Candidata específica: arnés automotriz → 8544.30 aparece; tornillo M8 y
 *     cable HDMI → ninguna candidata (el pase NO se dispara).
 *  3. Pase con LLM inyectado: gana la específica y la justificación persiste.
 *  4. Fail-safe: LLM caído / 429 / código fuera de lista → se conserva la
 *     elección original y queda marcado 'no_ejecutado'.
 *  5. Filtro de alternativas contradictorias (Nota 2 Sección XVII).
 *  6. Curaduría: cada EJE DE DESTINO tiene sustento en el catálogo cargado.
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import {
  candidataEspecifica,
  compararEspecificaVsResidual,
  EJES_DESTINO,
  evaluarResidual,
  filtrarAlternativasContradictorias,
  textoEsResidual,
  type LlmRGI6,
} from '../services/rgi6-especifica-residual';
import { subpartidasHermanas, type SubpartidaHermana } from '../services/subpartidas-hermanas';
import { aplicarRGI6, depurarAlternativasContradictorias, type ClassificationResult } from '../services/classifier';
import { sinAcentos } from '../services/rgi6-terminos';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

// ── Fixtures (estructura idéntica a la que devuelve subpartidasHermanas) ──

function sub(code: string, description: string, fracciones: [string, string][]): SubpartidaHermana {
  return {
    code,
    codeFormatted: `${code.slice(0, 4)}.${code.slice(4, 6)}`,
    description,
    elegida: false,
    fracciones: fracciones.map(([c, d]) => ({
      code: c,
      codeFormatted: `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}`,
      description: d,
      elegida: false,
    })),
  };
}

/** Partida sintética: una específica por destino y una residual con dos fracciones. */
const HERMANAS_FIXTURE: SubpartidaHermana[] = [
  sub('999930', 'Juegos de cables de los tipos utilizados en los medios de transporte.', [
    ['99993001', 'Reconocibles para naves aéreas.'],
    ['99993099', 'Los demás.'],
  ]),
  sub('999942', 'Provistos de piezas de conexión.', [
    ['99994205', 'Reconocibles para naves aéreas.'],
    ['99994299', 'Los demás.'],
  ]),
  sub('999949', 'Los demás.', [
    ['99994999', 'Los demás.'],
  ]),
  sub('999970', 'Cables de fibras ópticas.', [
    ['99997001', 'Cables de fibras ópticas.'],
  ]),
];

/** Subpartida cuya fracción .99 NO dice "los demás" pero es el cajón del nivel. */
const HERMANAS_SUFIJO: SubpartidaHermana[] = [
  sub('888810', 'Artículos de acero.', [
    ['88881001', 'De acero inoxidable.'],
    ['88881099', 'De acero al carbono, sin recubrimiento.'],
  ]),
];

function resultadoFalso(code: string, description: string, chapter: string): ClassificationResult {
  return {
    fraction: { code, description, chapter, section: '' },
    nico: '', confidence: 90, griApplied: [],
    tariffs: { nmf: 0, preferential: {} },
    regulations: { rrna: [], noms: [], sectoralRegistry: false },
    alternatives: [],
    explanation: { simple: '', technical: '' },
    legalBasis: { griApplied: [], legalNotes: [], discardedFractions: [] },
    useBasedAnalysis: null,
    disclaimer: '',
  };
}

const llmQueEligeEspecifica: LlmRGI6 = async () => JSON.stringify({
  ganadora: '85443099',
  justificacion: 'RGI 6: la subpartida 8544.30 describe textualmente juegos de cables de los tipos utilizados en los medios de transporte; el arnés declarado para vehículo cae en ese texto.',
  descarte: 'Se descarta 8544.42 ("Provistos de piezas de conexión") por genérica: describe conductores por su conexión, no por su destino a medios de transporte.',
  notasCitadas: [],
});

async function main() {
  // ────────────── 1. Detector de residual ──────────────
  console.log('\n== 1. detector de residual ==');

  await test('textoEsResidual: "Los demás." y "Otros" sí; "…y demás juegos de cables…" no', () => {
    assert.equal(textoEsResidual('Los demás.'), true);
    assert.equal(textoEsResidual('Las demás.'), true);
    assert.equal(textoEsResidual('Otros artículos'), true);
    assert.equal(textoEsResidual('Los demás conductores eléctricos para una tensión superior a 1,000 V.'), true);
    assert.equal(
      textoEsResidual('Juegos de cables para bujías de encendido y demás juegos de cables de los tipos utilizados en los medios de transporte.'),
      false,
      '"demás" en medio del texto NO hace residual a una subpartida específica',
    );
    assert.equal(textoEsResidual('Provistos de piezas de conexión.'), false);
    assert.equal(textoEsResidual(''), false);
  });

  await test('fracción "Los demás." → residual por texto', () => {
    const d = evaluarResidual('99994299', HERMANAS_FIXTURE);
    assert.equal(d.esResidual, true);
    assert.deepEqual(d.niveles, ['fraccion']);
    assert.match(d.motivo, /Los demás/);
  });

  await test('subpartida "Los demás." + fracción "Los demás." → residual en los dos niveles', () => {
    const d = evaluarResidual('99994999', HERMANAS_FIXTURE);
    assert.equal(d.esResidual, true);
    assert.deepEqual(d.niveles, ['fraccion', 'subpartida']);
  });

  await test('sufijo .99 con hermanas activas → residual aunque el texto no diga "los demás"', () => {
    const d = evaluarResidual('88881099', HERMANAS_SUFIJO);
    assert.equal(d.esResidual, true);
    assert.match(d.motivo, /sufijo \.99/);
  });

  await test('NO residual: fracción específica y subpartida específica', () => {
    assert.equal(evaluarResidual('99993001', HERMANAS_FIXTURE).esResidual, false);
    assert.equal(evaluarResidual('99997001', HERMANAS_FIXTURE).esResidual, false, 'única fracción de su subpartida: el .01 no es cajón de nada');
  });

  await test('código incompleto o ajeno al catálogo → no residual (falla cerrado)', () => {
    assert.equal(evaluarResidual('8544', HERMANAS_FIXTURE).esResidual, false);
    assert.equal(evaluarResidual('12345678', HERMANAS_FIXTURE).esResidual, false);
  });

  // ────────────── 2. Candidata específica ──────────────
  console.log('\n== 2. candidata específica (catálogo TIGIE real) ==');

  const hermanas8544 = await subpartidasHermanas('85444299');
  const hermanas7318 = await subpartidasHermanas('73181599');

  await test('el catálogo cargado tiene la 8544.30 y la 8544.42 (si no, el resto no prueba nada)', () => {
    assert.ok(hermanas8544.some(h => h.code === '854430'), '8544.30 ausente del catálogo');
    assert.ok(hermanas8544.some(h => h.code === '854442'), '8544.42 ausente del catálogo');
  });

  await test('CASO DE CONTROL: arnés automotriz sobre 8544.42.99 → candidata 8544.30', () => {
    const c = candidataEspecifica({
      descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1',
      usoDestino: 'ensamble vehicular',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
    });
    assert.ok(c, 'no se encontró candidata específica');
    assert.equal(c!.subpartida.code, '854430');
    assert.ok(c!.ejes.some(e => e.id === 'medios_de_transporte'));
    assert.match(c!.motivo, /8544\.30/);
  });

  await test('segunda redacción del control: "arnés de cables para automóvil, cobre con conectores plásticos" → 8544.30', () => {
    const c = candidataEspecifica({
      descripcion: 'arnés de cables para automóvil, cobre con conectores plásticos',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
    });
    assert.ok(c, 'no se encontró candidata específica');
    assert.equal(c!.subpartida.code, '854430');
  });

  await test('NO se dispara: tornillo M8 de acero al carbón sobre 7318.15.99 → ninguna candidata', () => {
    const c = candidataEspecifica({
      descripcion: 'Tornillo hexagonal M8 x 30 mm de acero al carbón, rosca métrica',
      codigoElegido: '73181599',
      hermanas: hermanas7318,
    });
    assert.equal(c, null, `candidata inesperada: ${c?.subpartida.codeFormatted}`);
  });

  await test('NO se dispara: cable HDMI sobre 8544.49.99 (caso #24 del set de accuracy)', () => {
    const c = candidataEspecifica({
      descripcion: 'Cable HDMI de alta velocidad, 2 metros',
      codigoElegido: '85444999',
      hermanas: hermanas8544,
    });
    assert.equal(c, null, `candidata inesperada: ${c?.subpartida.codeFormatted}`);
  });

  await test('una sola raíz común sin eje de destino no basta (umbral documentado)', () => {
    const c = candidataEspecifica({
      descripcion: 'cables de instalación industrial',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
    });
    assert.equal(c, null, `candidata inesperada: ${c?.subpartida.codeFormatted}`);
  });

  // ────────────── 3. Pase con LLM inyectado ──────────────
  console.log('\n== 3. pase RGI 6 con LLM inyectado ==');

  await test('gana la específica → estado reclasificada, con justificación y descarte escritos', async () => {
    const r = await compararEspecificaVsResidual({
      descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1',
      usoDestino: 'ensamble vehicular',
      codigoElegido: '8544.42.99',
      hermanas: hermanas8544,
      notas: [],
      llm: llmQueEligeEspecifica,
    });
    assert.equal(r.estado, 'reclasificada');
    assert.equal(r.ejecutado, true);
    assert.equal(r.ganadora, '85443099');
    assert.match(r.justificacion!, /RGI 6/);
    assert.match(r.descarte!, /8544\.42/);
    assert.equal(r.residual!.codeFormatted, '8544.42.99');
    assert.equal(r.candidata!.codeFormatted, '8544.30');
  });

  await test('el LLM ratifica la residual → estado confirmada, sin cambiar el código', async () => {
    const r = await compararEspecificaVsResidual({
      descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
      notas: [],
      llm: async () => JSON.stringify({
        ganadora: '85444299',
        justificacion: 'RGI 6: el producto es un conductor con piezas de conexión, no un juego de cables de vehículo.',
        descarte: 'Se descarta 8544.30 porque su texto exige juegos de cables de los tipos utilizados en los medios de transporte.',
      }),
    });
    assert.equal(r.estado, 'confirmada');
    assert.equal(r.ganadora, '85444299');
  });

  await test('aplicarRGI6 cambia la fracción y persiste el veredicto en legalBasis (dictamen y pantalla)', async () => {
    const base = resultadoFalso('8544.42.99', 'Los demás.', '85');
    const r = await aplicarRGI6(
      base,
      'arnés eléctrico automotriz para iluminación de vehículo M1',
      { useCase: 'ensamble vehicular' },
      llmQueEligeEspecifica,
    );
    assert.equal(r.rgi6!.estado, 'reclasificada', `${r.rgi6!.aviso} ${r.rgi6!.error ?? ''}`);
    assert.equal(r.fraction.code, '8544.30.99');
    assert.equal(r.fraction.chapter, '85');
    assert.match(r.fraction.description, /demás/i, 'la descripción sale del catálogo, no del LLM');
    const gri = r.legalBasis.griApplied.find(g => /RGI 6/.test(g.rule));
    assert.ok(gri, 'falta la RGI 6 en legalBasis.griApplied');
    assert.match(gri!.reasoning, /8544\.30/);
    assert.ok(
      r.legalBasis.discardedFractions.some(d => d.code === '8544.42.99' && /8544\.42/.test(d.reason)),
      'falta el descarte por escrito de la residual',
    );
    assert.ok(r.legalBasis.legalNotes.length > 0, 'faltan las notas del corpus que fundamentan el pase');
  });

  // ────────────── 4. Fail-safe ──────────────
  console.log('\n== 4. fail-safe ==');

  await test('LLM 429 → no_ejecutado, sin ganadora y con aviso honesto', async () => {
    const r = await compararEspecificaVsResidual({
      descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
      notas: [],
      llm: async () => { throw new Error('429 rate_limit_error'); },
    });
    assert.equal(r.estado, 'no_ejecutado');
    assert.equal(r.ejecutado, false);
    assert.equal(r.ganadora, null);
    assert.equal(r.justificacion, null);
    assert.match(r.aviso, /se conserva la fracción 8544\.42\.99/);
    assert.match(r.error!, /429/);
  });

  await test('LLM devuelve un código fuera de las opciones → no_ejecutado (nunca se inventa el veredicto)', async () => {
    const r = await compararEspecificaVsResidual({
      descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
      notas: [],
      llm: async () => JSON.stringify({ ganadora: '87089999', justificacion: 'x', descarte: 'y' }),
    });
    assert.equal(r.estado, 'no_ejecutado');
    assert.match(r.error!, /fuera de las opciones/);
  });

  await test('LLM devuelve JSON sin descarte escrito → no_ejecutado', async () => {
    const r = await compararEspecificaVsResidual({
      descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
      notas: [],
      llm: async () => JSON.stringify({ ganadora: '85443099', justificacion: 'gana la específica' }),
    });
    assert.equal(r.estado, 'no_ejecutado');
    assert.match(r.error!, /justificación y descarte/);
  });

  await test('aplicarRGI6 con el pase caído conserva el código y lo dice en legalBasis', async () => {
    const base = resultadoFalso('8544.42.99', 'Los demás.', '85');
    const r = await aplicarRGI6(
      base,
      'arnés eléctrico automotriz para iluminación de vehículo M1',
      { useCase: 'ensamble vehicular' },
      async () => { throw new Error('timeout de 60000 ms'); },
    );
    assert.equal(r.rgi6!.estado, 'no_ejecutado');
    assert.equal(r.fraction.code, '8544.42.99', 'fail-safe: la fracción original se conserva');
    assert.ok(r.legalBasis.griApplied.some(g => /NO EJECUTADA/.test(g.rule)));
    assert.match(r.rgi6!.aviso, /Revísala a mano/);
  });

  await test('flag apagado → estado apagado y el LLM NO se llama', async () => {
    let llamado = false;
    const r = await compararEspecificaVsResidual({
      descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1',
      codigoElegido: '85444299',
      hermanas: hermanas8544,
      notas: [],
      llm: async () => { llamado = true; return '{}'; },
      env: { RGI6_ESPECIFICA_VS_RESIDUAL: '0' } as NodeJS.ProcessEnv,
    });
    assert.equal(r.estado, 'apagado');
    assert.equal(llamado, false);
  });

  await test('fracción no residual → el pase no se dispara ni gasta una llamada', async () => {
    let llamado = false;
    const r = await compararEspecificaVsResidual({
      descripcion: 'juego de cables para bujías de encendido de automóvil',
      codigoElegido: '85443001',
      hermanas: hermanas8544,
      notas: [],
      llm: async () => { llamado = true; return '{}'; },
    });
    assert.equal(r.estado, 'no_residual');
    assert.equal(llamado, false);
  });

  // ────────────── 5. Alternativas contradictorias ──────────────
  console.log('\n== 5. alternativas contradictorias (Nota 2 Sección XVII) ==');

  const razonamientoConNota = 'La Nota 2 de la Sección XVII excluye del capítulo 87 las mercancías cubiertas por una partida específica de los capítulos 84 a 90, como la partida 85.44.';

  await test('cita la Nota 2 Sección XVII y clasifica en 85 → se descarta la alternativa de 8708', async () => {
    const f = await filtrarAlternativasContradictorias({
      alternativas: [
        { code: '8708.99.99', description: 'Partes y accesorios para vehículos', confidence: 55, reason: 'uso automotriz' },
        { code: '8544.49.99', description: 'Los demás', confidence: 40, reason: 'sin conectores' },
      ],
      codigoFinal: '8544.30.99',
      razonamiento: razonamientoConNota,
      referenciasDisponibles: ['Nota 2 Sección XVII LIGIE'],
    });
    assert.equal(f.alternativas.length, 1);
    assert.equal(f.alternativas[0]!.code, '8544.49.99');
    assert.equal(f.descartadas.length, 1);
    assert.match(f.descartadas[0]!.reason, /Nota 2 Sección XVII/);
    assert.match(f.descartadas[0]!.reason, /cotejo pendiente/);
  });

  await test('la nota NO está en el corpus → no se filtra y se dice', async () => {
    const f = await filtrarAlternativasContradictorias({
      alternativas: [{ code: '8708.99.99', description: 'x', confidence: 55, reason: 'y' }],
      codigoFinal: '8544.30.99',
      razonamiento: razonamientoConNota,
      referenciasDisponibles: [],
    });
    assert.equal(f.alternativas.length, 1, 'sin dato no se filtra');
    assert.equal(f.descartadas.length, 0);
    assert.match(f.avisos[0]!, /no está en el corpus legal cargado/);
  });

  await test('sin cita de la nota → no se toca nada', async () => {
    const f = await filtrarAlternativasContradictorias({
      alternativas: [{ code: '8708.99.99', description: 'x', confidence: 55, reason: 'y' }],
      codigoFinal: '8544.30.99',
      razonamiento: 'El producto es un juego de cables.',
      referenciasDisponibles: ['Nota 2 Sección XVII LIGIE'],
    });
    assert.equal(f.alternativas.length, 1);
    assert.equal(f.descartadas.length, 0);
    assert.equal(f.avisos.length, 0);
  });

  await test('clasificación FINAL en el capítulo excluido (8708) → la nota no filtra sus propias alternativas', async () => {
    const f = await filtrarAlternativasContradictorias({
      alternativas: [{ code: '8708.29.99', description: 'x', confidence: 55, reason: 'y' }],
      codigoFinal: '8708.99.99',
      razonamiento: razonamientoConNota,
      referenciasDisponibles: ['Nota 2 Sección XVII LIGIE'],
    });
    assert.equal(f.descartadas.length, 0);
  });

  await test('la nota existe de verdad en el corpus legal cargado', async () => {
    const doc = await prisma.legalDocument.findFirst({ where: { reference: 'Nota 2 Sección XVII LIGIE' }, select: { content: true, fechaCotejo: true } });
    assert.ok(doc, 'sin la fila del corpus el filtro NO debe activarse en producción');
    assert.match(doc!.content, /8[46]-8?9|84-90|86-89/, 'el texto del corpus debe sustentar los capítulos que el filtro usa');
  });

  await test('depurarAlternativasContradictorias retira también el análisis por uso contradictorio', async () => {
    const r = resultadoFalso('8544.30.99', 'Los demás.', '85');
    r.alternatives = [{ code: '8708.99.99', description: 'Partes de vehículos', confidence: 50, reason: 'uso automotriz' }];
    r.legalBasis.legalNotes = [{ source: 'Nota 2 Sección XVII', text: razonamientoConNota }];
    r.useBasedAnalysis = {
      applies: true,
      byMaterial: { code: '8544.30.99', description: 'Juegos de cables', confidence: 80 },
      byUse: { code: '8708.99.99', description: 'Partes de vehículos', confidence: 55 },
      criterion: 'x', recommendation: 'y', riskNote: 'z', precedents: [],
    };
    const out = await depurarAlternativasContradictorias(r);
    assert.equal(out.alternatives.length, 0);
    assert.equal(out.useBasedAnalysis, null, 'la dualidad hacia el capítulo excluido es la misma contradicción');
    assert.ok(out.legalBasis.discardedFractions.some(d => /Nota 2 Sección XVII/.test(d.reason)));
    assert.ok(out.legalBasis.discardedFractions.some(d => /Análisis por uso retirado/.test(d.reason)));
  });

  await test('CASO REAL DEL REVISOR: sin alternativas en cap 87, el análisis por uso a 8708 igual se retira', async () => {
    // Lo observado en vivo: alternativas 8544.42.99 y 8544.49.99 (ninguna de
    // cap 87) pero useBasedAnalysis.byUse = 8708.99.99 en el mismo dictamen que
    // cita la Nota 2 de la Sección XVII. La contradicción vive en ese campo.
    const r = resultadoFalso('8544.30.99', 'Los demás.', '85');
    r.alternatives = [
      { code: '8544.42.99', description: 'Los demás', confidence: 60, reason: 'genérica' },
      { code: '8544.49.99', description: 'Los demás', confidence: 40, reason: 'sin conectores' },
    ];
    r.legalBasis.discardedFractions = [{ code: '8708.99.99', reason: 'Descartado porque la Nota 2 de la Sección XVII establece que las partes de vehículos cubiertas por una partida específica de los capítulos 84-90 se clasifican en esos capítulos.' }];
    r.useBasedAnalysis = {
      applies: true,
      byMaterial: { code: '8544.30.99', description: 'Juegos de cables', confidence: 85 },
      byUse: { code: '8708.99.99', description: 'Partes de vehículos', confidence: 55 },
      criterion: 'x', recommendation: 'y', riskNote: 'z', precedents: [],
    };
    const out = await depurarAlternativasContradictorias(r);
    assert.equal(out.alternatives.length, 2, 'las alternativas del cap 85 no se tocan');
    assert.equal(out.useBasedAnalysis, null, 'la dualidad hacia 8708 debe retirarse');
    assert.ok(out.legalBasis.discardedFractions.some(d => /Análisis por uso retirado/.test(d.reason)));
  });

  // ────────────── 6. Curaduría de los ejes de destino ──────────────
  console.log('\n== 6. curaduría: cada eje tiene sustento en el catálogo ==');

  const subsCatalogo = await prisma.subheading.findMany({ select: { code: true, description: true } });
  for (const eje of EJES_DESTINO) {
    await test(`eje "${eje.id}" matchea al menos una subpartida real del catálogo`, () => {
      const hits = subsCatalogo.filter(s => eje.catalogo.test(sinAcentos(s.description.toLowerCase())));
      assert.ok(hits.length > 0, `sin evidencia en el catálogo (evidencia declarada: ${eje.evidencia})`);
    });
  }

  // ────────────── 7. E2E opcional contra el LLM real ──────────────
  // Correr con:  RGI6_E2E=1 npm run test:rgi6      (requiere ANTHROPIC_API_KEY
  // en server/.env). Sin la variable se salta y se dice cómo correrlo.
  console.log('\n== 7. end-to-end con LLM real ==');
  if (process.env.RGI6_E2E === '1' && process.env.ANTHROPIC_API_KEY) {
    await test('CONTROL e2e: arnés automotriz sobre 8544.42.99 → el pase real elige 8544.30', async () => {
      const r = await compararEspecificaVsResidual({
        descripcion: 'arnés eléctrico automotriz para iluminación de vehículo M1, cobre con conectores plásticos',
        usoDestino: 'ensamble vehicular en planta armadora',
        codigoElegido: '85444299',
      });
      assert.equal(r.estado, 'reclasificada', `estado ${r.estado} — ${r.aviso} ${r.error ?? ''}`);
      assert.equal(r.ganadora, '85443099');
      assert.match(r.justificacion!, /RGI\s*6/i);
      assert.ok(r.descarte && r.descarte.length > 20, 'el descarte debe ir por escrito');
    });
  } else {
    console.log('  … omitido. Para correrlo:  RGI6_E2E=1 npm run test:rgi6  (necesita ANTHROPIC_API_KEY en server/.env)');
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} pasaron, ${failed} fallaron`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
