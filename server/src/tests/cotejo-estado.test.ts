/**
 * TABLERO DE DEUDA DE COTEJO (Operación 2026-08, prioridad 2).
 *
 * Lo que se prueba:
 *  1. `construirMetrica` (puro): porcentaje, estado y envejecimiento a 90 días.
 *  2. El tablero cuenta de verdad en un tenant sembrado: cuotas con y sin
 *     cotejadoAt, precedentes con y sin fuente, fracciones con y sin PROSEC.
 *  3. "Fracciones más usadas" sale del historial REAL y respeta el tenant
 *     (las clasificaciones del tenant B no aparecen en el tablero del A) y
 *     excluye las sembradas para demo.
 *  4. Los cargadores RECHAZAN la fila sin cotejadoPor/fuenteUrl y ACEPTAN la
 *     que sí los trae — en los cuatro nuevos y en los tres delegados.
 *  5. El Excel del tablero trae sus cuatro hojas.
 *  6. La alerta de deuda envejecida se crea, es idempotente y se resuelve sola.
 *
 * Las tablas de catálogo (cuotas, precedentes, PROSEC) son globales: cada
 * comprobación mide un DELTA contra la base sembrada, nunca un absoluto.
 * Ejecutar: npm run test:cotejo
 */
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import {
  construirMetrica, estadoDeCotejo, fraccionesMasUsadas, lotesCorpusDelRepo,
  sincronizarAlertasDeDeuda, tableroAXlsx, HOJAS_TABLERO, TIPO_ALERTA_DEUDA,
  UMBRAL_ENVEJECIMIENTO_DIAS, type Metrica, type TableroCotejo,
} from '../services/cotejo-estado';
import {
  CARGADORES, MATCH_ANEXO21, MATCH_CORRELATIVA, TIPO_REG_ANEXO21, TIPO_REG_CORRELATIVA,
  TIPOS_CARGA, importarCarga, plantillaCargaXlsx, validarAtestacion, validarFilaCarga,
} from '../services/cotejo-cargadores';

let ok = 0;
function check(cond: boolean, msg: string) { assert.ok(cond, msg); ok++; console.log(`  ✓ ${msg}`); }

const HOY = new Date('2026-08-27T12:00:00.000Z');
const hace = (dias: number) => new Date(HOY.getTime() - dias * 86_400_000);

/** Excel base64 a partir de filas (lo que sube la pantalla). */
function xlsxBase64(filas: Record<string, unknown>[]): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'datos');
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
}

/** Marca de las filas de esta suite (permite barrer huérfanas de una corrida muerta). */
const MARCA_TEST = '__cotejo_test__';
const PREFIJO_TENANT = '__cotejo_test_';
/** Fracciones inventadas: no existen en el catálogo real, nada colisiona. */
const FRACCIONES = ['99999801', '99999802', '99999803'];

const metricaBase = {
  clave: 'x', bloque: 'cuotas' as const, titulo: 'X', ambito: 'producto' as const,
  consulta: 'c', queFalta: 'q', fuenteOficial: 'f',
};

async function main() {
  const nonce = Date.now().toString(36);
  const [FRAC_CON, FRAC_SIN, FRAC_CARGA] = FRACCIONES as [string, string, string];
  // FRAC_CON recibe PROSEC/Anexo 21/correlativa; FRAC_SIN se queda sin nada;
  // FRAC_CARGA solo lo tocan los cargadores.

  const marca = `${MARCA_TEST}${nonce}`;

  // Limpieza por MARCA, no por id: si una corrida anterior murió a medias
  // (p. ej. `| head` cerrando el pipe) sus filas huérfanas envenenan los
  // conteos de la siguiente. Se barre antes y después.
  const barrer = async () => {
    await prisma.classification.deleteMany({ where: { tenant: { name: { startsWith: PREFIJO_TENANT } } } }).catch(() => {});
    await prisma.alert.deleteMany({ where: { tenant: { name: { startsWith: PREFIJO_TENANT } } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenant: { name: { startsWith: PREFIJO_TENANT } } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenant: { name: { startsWith: PREFIJO_TENANT } } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { name: { startsWith: PREFIJO_TENANT } } }).catch(() => {});
    await prisma.legalPrecedent.deleteMany({ where: { title: { startsWith: MARCA_TEST } } }).catch(() => {});
    await prisma.pROSECEligibility.deleteMany({ where: { fractionCode: { in: FRACCIONES } } }).catch(() => {});
    await prisma.antidumpingDuty.deleteMany({ where: { fractionCode: { in: FRACCIONES } } }).catch(() => {});
    await prisma.estimatedPrice.deleteMany({ where: { fractionCode: { in: FRACCIONES } } }).catch(() => {});
    await prisma.fractionRegulation.deleteMany({ where: { fractionCode: { in: FRACCIONES } } }).catch(() => {});
  };
  await barrer();

  const tA = await prisma.tenant.create({ data: { name: `${PREFIJO_TENANT}A ${nonce}` } });
  const tB = await prisma.tenant.create({ data: { name: `${PREFIJO_TENANT}B ${nonce}` } });
  const uA = await prisma.user.create({ data: { email: `cotejo-a-${nonce}@test.local`, password: 'x', name: 'Tester A', tenantId: tA.id } });
  const uB = await prisma.user.create({ data: { email: `cotejo-b-${nonce}@test.local`, password: 'x', name: 'Tester B', tenantId: tB.id } });

  try {
    // ── 1. construirMetrica (puro) ────────────────────────────────────────
    console.log('— construirMetrica —');
    const cerrada = construirMetrica({ ...metricaBase, universo: 10, conDato: 10, desde: hace(400) }, HOY);
    check(cerrada.estado === 'cerrada' && cerrada.faltan === 0 && cerrada.porcentaje === 100 && !cerrada.envejecida,
      'universo cubierto → cerrada, 100 % y NUNCA envejecida (aunque la fila sea vieja)');

    const vacia = construirMetrica({ ...metricaBase, universo: 0, conDato: 0 }, HOY);
    check(vacia.estado === 'sin_universo' && vacia.porcentaje === null,
      'universo 0 → "sin_universo" y porcentaje null (no se inventa un 100 %)');

    const nueva = construirMetrica({ ...metricaBase, universo: 10, conDato: 0, desde: hace(3) }, HOY);
    check(nueva.estado === 'sin_empezar' && !nueva.envejecida && nueva.diasDeDeuda === 3,
      'deuda de 3 días → sin_empezar pero no envejecida');

    const vieja = construirMetrica({ ...metricaBase, universo: 10, conDato: 0, desde: hace(200) }, HOY);
    check(vieja.envejecida && vieja.diasDeDeuda === 200,
      `deuda de 200 días sin un solo cotejo → envejecida (umbral ${UMBRAL_ENVEJECIMIENTO_DIAS})`);

    const reciente = construirMetrica({ ...metricaBase, universo: 10, conDato: 4, desde: hace(400), ultimoMovimiento: hace(10) }, HOY);
    check(!reciente.envejecida && reciente.estado === 'en_curso' && reciente.diasDeDeuda === 10,
      'un cotejo hace 10 días desenvejece la métrica aunque la deuda sea de hace 400');

    const sinTabla = construirMetrica({ ...metricaBase, universo: 5, conDato: 0, sinEstructura: true, desde: hace(200) }, HOY);
    check(sinTabla.estado === 'sin_estructura', 'sin tabla en el esquema → estado propio, no "0 %" a secas');

    // ── 2. Datos sembrados ────────────────────────────────────────────────
    console.log('\n— siembra —');
    const c1 = await prisma.antidumpingDuty.create({
      data: {
        resolutionNumber: `RES-${nonce}-A`, fractionCode: FRAC_CON, countryOfOrigin: 'CN',
        rateType: 'percentage', rate: 10, rateUnit: '%', notes: marca,
        cotejadoAt: hace(5), fuenteUrl: 'https://www.dof.gob.mx/x', createdAt: hace(300),
      },
    });
    const c2 = await prisma.antidumpingDuty.create({
      data: {
        resolutionNumber: `RES-${nonce}-B`, fractionCode: FRAC_CON, countryOfOrigin: 'VN',
        rateType: 'percentage', rate: 20, rateUnit: '%', notes: marca, createdAt: hace(300),
      },
    });

    const p1 = await prisma.legalPrecedent.create({
      data: {
        type: 'TFJA', reference: `TEST-${nonce}-CON`, title: marca, topic: 'clasificación',
        summary: marca, ruling: marca, reasoning: marca, yearPublished: 2024,
        source: 'https://www.tfja.gob.mx/x',
      },
    });
    const p2 = await prisma.legalPrecedent.create({
      data: {
        type: 'TFJA', reference: `TEST-${nonce}-SIN`, title: marca, topic: 'clasificación',
        summary: marca, ruling: marca, reasoning: marca, yearPublished: 2024, source: null,
      },
    });

    const ps = await prisma.pROSECEligibility.create({
      data: { fractionCode: FRAC_CON, matchType: 'exact', sector: `test-${nonce}`, prosecRate: 5, effectiveDate: hace(500), fechaCotejo: hace(200), notes: marca },
    });

    const a21 = await prisma.fractionRegulation.create({
      data: { fractionCode: FRAC_CON, matchType: MATCH_ANEXO21.exact, type: TIPO_REG_ANEXO21, authority: 'SAT', code: '24', description: `Aduana 24: ${marca}`, required: true },
    });
    const corr = await prisma.fractionRegulation.create({
      data: { fractionCode: FRAC_CON, matchType: MATCH_CORRELATIVA, type: TIPO_REG_CORRELATIVA, authority: 'SE/SNICE', code: `2020>2022:${FRAC_SIN}`, description: marca, required: false },
    });

    // Historial: FRAC_CON 3 veces, FRAC_SIN 1 vez (tenant A) + una demo que NO cuenta.
    await prisma.classification.createMany({
      data: [
        { tenantId: tA.id, userId: uA.id, inputDescription: `${marca} 1`, fractionCode: FRAC_CON, confidence: 90, griApplied: ['1'] },
        { tenantId: tA.id, userId: uA.id, inputDescription: `${marca} 2`, fractionCode: FRAC_CON, confidence: 90, griApplied: ['1'] },
        { tenantId: tA.id, userId: uA.id, inputDescription: `${marca} 3`, fractionCode: FRAC_CON, confidence: 90, griApplied: ['1'] },
        { tenantId: tA.id, userId: uA.id, inputDescription: `${marca} 4`, fractionCode: FRAC_SIN, confidence: 90, griApplied: ['1'] },
        { tenantId: tA.id, userId: uA.id, inputDescription: `${marca} demo`, fractionCode: '99999899', confidence: 90, griApplied: ['1'], isDemoData: true },
        { tenantId: tB.id, userId: uB.id, inputDescription: `${marca} B`, fractionCode: '99999888', confidence: 90, griApplied: ['1'] },
      ],
    });

    // ── 3. Fracciones más usadas: historial real y aislamiento de tenant ──
    console.log('\n— fracciones más usadas —');
    const usosA = await fraccionesMasUsadas({ tenantId: tA.id, top: 50 });
    check(usosA[0]?.fractionCode === FRAC_CON && usosA[0]?.usos === 3, 'la más usada del tenant A es la que más aparece en SU historial (3 usos)');
    check(usosA.some(u => u.fractionCode === FRAC_SIN), 'la segunda fracción del historial también entra');
    check(!usosA.some(u => u.fractionCode === '99999899'), 'las clasificaciones marcadas como demo NO cuentan');
    check(!usosA.some(u => u.fractionCode === '99999888'), 'la fracción del tenant B no aparece en el tablero del tenant A');
    const usosB = await fraccionesMasUsadas({ tenantId: tB.id, top: 50 });
    check(usosB.length === 1 && usosB[0]!.fractionCode === '99999888', 'el tenant B solo ve la suya');

    // ── 4. Tablero ────────────────────────────────────────────────────────
    console.log('\n— tablero —');
    const t = await estadoDeCotejo({ tenantId: tA.id, top: 50, ahora: HOY });
    const m = (clave: string): Metrica => {
      const x = t.metricas.find(y => y.clave === clave);
      assert.ok(x, `falta la métrica ${clave}`);
      return x;
    };

    const fCon = t.topFracciones.find(f => f.fractionCode === FRAC_CON)!;
    const fSin = t.topFracciones.find(f => f.fractionCode === FRAC_SIN)!;
    check(fCon.prosec && fCon.prosecCotejada && fCon.anexo21 && fCon.correlativa && fCon.cuotas === 2 && fCon.cuotasCotejadas === 1,
      'la fracción sembrada reporta PROSEC cotejado, Anexo 21, correlativa y 2 cuotas (1 cotejada)');
    check(!fSin.prosec && !fSin.anexo21 && fSin.cuotas === 0 && fSin.faltantes.includes('PROSEC'),
      'la fracción sin datos dice exactamente qué le falta');
    check(fSin.correlativa, 'una fracción que es DESTINO de una correlativa también cuenta como cubierta');

    check(m('top_prosec').universo === t.topFracciones.length && m('top_prosec').conDato === 1,
      'top_prosec: 1 de las fracciones del historial tiene PROSEC cargado');
    check(m('top_prosec_cotejada').conDato === 1, 'top_prosec_cotejada cuenta solo las que traen fechaCotejo');
    check(m('top_anexo21').conDato === 1, 'top_anexo21 lee el hogar provisional del Anexo 21');
    check(m('top_cuota_cotejada').universo === 1 && m('top_cuota_cotejada').conDato === 1,
      'top_cuota_cotejada mide solo las fracciones que TIENEN cuota (no castiga a las que no aplican)');

    const cuotasM = m('cuotas_cotejadas');
    check(cuotasM.universo >= 2 && cuotasM.conDato >= 1 && cuotasM.faltan >= 1,
      'cuotas_cotejadas ve las dos sembradas y solo cuenta como cotejada la que tiene cotejadoAt');
    check(cuotasM.consulta.includes('cotejadoAt') && cuotasM.fuenteOficial.includes('UPCI'),
      'cada métrica publica su consulta y la fuente oficial que hace falta');

    // Delta de precedentes: la tabla es global, se compara contra la base.
    const precTotal = await prisma.legalPrecedent.count();
    const precConFuente = await prisma.legalPrecedent.count({ where: { source: { startsWith: 'http' } } });
    const precM = m('precedentes_con_fuente');
    check(precM.universo === precTotal && precM.conDato === precConFuente,
      'precedentes_con_fuente cuadra con la consulta directa (source http)');
    check(!!precM.nota && precM.nota.includes('PRECEDENT_CORPUS_VERIFIED'),
      'el tablero avisa que el interruptor global sigue apagado aunque haya filas con fuente');

    check(m('cuotas_antielusion').universo === cuotasM.universo, 'antielusión se mide contra el mismo universo de cuotas');
    check(t.resumen.metricas === t.metricas.length && t.resumen.filasPendientes > 0, 'el resumen suma las filas pendientes de todas las métricas');
    check(t.metricas.every((x, i) => i === 0 || t.metricas[i - 1]!.impacto >= x.impacto),
      'las métricas salen ordenadas por impacto sobre las fracciones más usadas');

    // Precios estimados: el seed histórico marca la mayoría como 'internal'.
    const preciosTotal = await prisma.estimatedPrice.count({ where: { active: true } });
    const preciosOficiales = await prisma.estimatedPrice.count({ where: { active: true, source: { in: ['DOF', 'SAT'] } } });
    const preciosM = m('precios_estimados_oficiales');
    check(preciosM.universo === preciosTotal && preciosM.conDato === preciosOficiales,
      `precios_estimados_oficiales separa lo publicado en DOF/SAT (${preciosOficiales}) de la estimación interna (${preciosTotal - preciosOficiales})`);
    check(preciosM.queFalta.includes('estimación interna'),
      'la métrica explica que una estimación interna no es el precio estimado del 84-A');

    const prosecM = m('prosec_cotejadas');
    check(prosecM.conDato === await prisma.pROSECEligibility.count({ where: { active: true, fechaCotejo: { not: null } } }),
      'prosec_cotejadas cuadra con las filas que tienen fechaCotejo');

    // Corpus del repo: es un resultado válido que el material ya cotejado esté
    // versionado y sin cargar; el tablero lo cuenta en vez de esconderlo.
    const lotes = lotesCorpusDelRepo();
    const corpusRepo = m('corpus_lotes_repo');
    check(corpusRepo.universo === new Set(lotes.flatMap(l => l.referencias)).size,
      `corpus_lotes_repo mide los ${corpusRepo.universo} artículos verbatim versionados en prisma/seed/corpus-integro`);

    // ── 5. Export Excel ───────────────────────────────────────────────────
    console.log('\n— Excel —');
    const wb = XLSX.read(tableroAXlsx(t), { type: 'buffer' });
    check(HOJAS_TABLERO.every(h => wb.SheetNames.includes(h)), `el Excel trae las hojas ${HOJAS_TABLERO.join(', ')}`);
    const hojaM = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[HOJAS_TABLERO[1]]!);
    check(hojaM.length === t.metricas.length && 'que_falta' in hojaM[0]! && 'fuente_oficial' in hojaM[0]!,
      'la hoja de métricas lleva una fila por métrica con "qué falta" y la fuente oficial');
    const hojaF = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[HOJAS_TABLERO[2]]!);
    check(hojaF.length === t.topFracciones.length, 'la hoja de fracciones lleva una fila por fracción del historial');

    // ── 6. Cargadores: atestación obligatoria ─────────────────────────────
    console.log('\n— cargadores: atestación —');
    const erroresSin: string[] = [];
    check(validarAtestacion({ cotejadoPor: '', fuenteUrl: '' }, erroresSin, HOY) === null && erroresSin.length === 2,
      'validarAtestacion sin cotejadoPor ni fuenteUrl → dos errores y nada de atestación');
    const erroresFuturo: string[] = [];
    validarAtestacion({ cotejadoPor: 'Ana', fuenteUrl: 'https://dof.gob.mx/x', fechaCotejo: '2099-01-01' }, erroresFuturo, HOY);
    check(erroresFuturo.some(e => e.includes('futuro')), 'una fechaCotejo en el futuro se rechaza');
    const erroresUrl: string[] = [];
    validarAtestacion({ cotejadoPor: 'Ana', fuenteUrl: 'dof.gob.mx' }, erroresUrl, HOY);
    check(erroresUrl.some(e => e.includes('http')), 'la fuente debe ser una URL http(s), no un texto suelto');

    const filaProsecSin = { fractionCode: FRAC_CARGA, sector: 'prueba', prosecRate: 5, effectiveDate: '2026-01-01' };
    const filaProsecCon = { ...filaProsecSin, fuenteUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=1', cotejadoPor: 'Ana Pérez', fechaCotejo: '2026-08-01' };
    check(!validarFilaCarga('prosec', filaProsecSin, 2, HOY).ok, 'prosec: fila sin cotejadoPor/fuenteUrl → RECHAZADA');
    check(validarFilaCarga('prosec', filaProsecCon, 2, HOY).ok, 'prosec: la misma fila con atestación → aceptada');

    for (const tipo of TIPOS_CARGA) {
      const v = validarFilaCarga(tipo, { fractionCode: FRAC_CARGA }, 2, HOY);
      check(!v.ok && v.errores.some(e => e.includes('cotejadoPor')),
        `${tipo}: sin atestación la fila se rechaza citando cotejadoPor`);
    }

    // Reglas de negocio propias de cada cargador nuevo.
    const att = { fuenteUrl: 'https://www.dof.gob.mx/x', cotejadoPor: 'Ana Pérez', fechaCotejo: '2026-08-01' };
    check(validarFilaCarga('precios-estimados', { ...att, fractionCode: FRAC_CARGA, estimatedValue: 3, unit: 'USD/kg', source: 'internal', decree: 'X', publishDate: '2026-01-01' }, 2, HOY)
      .errores.some(e => e.includes('DOF o SAT')),
      'precios estimados: se rechaza source=internal (el 84-A exige precio publicado)');
    check(validarFilaCarga('anexo21', { ...att, fractionCode: FRAC_CARGA, aduanaClave: '99', mercancia: 'x' }, 2, HOY)
      .errores.some(e => e.includes('Apéndice 1')),
      'anexo 21: la clave de aduana se valida contra el Apéndice 1 del Anexo 22');
    check(validarFilaCarga('correlativas', { ...att, origenCode: FRAC_CARGA, origenVersion: '2020', destinoVersion: '2020', destinoCode: FRAC_CON, tipoCorrelativa: 'uno_a_uno' }, 2, HOY)
      .errores.some(e => e.includes('no pueden ser la misma')),
      'correlativas: origen y destino no pueden ser la misma versión de la LIGIE');

    // ── 7. Import real: rechaza la mala, escribe la buena ─────────────────
    console.log('\n— cargadores: importación —');
    const base64 = xlsxBase64([
      { fractionCode: FRAC_CARGA, sector: `test-${nonce}`, prosecRate: 5, effectiveDate: '2026-01-01', decree: 'Decreto PROSEC', ...att },
      { fractionCode: FRAC_CARGA, sector: `test-${nonce}-mala`, prosecRate: 5, effectiveDate: '2026-01-01' },
    ]);
    const seco = await importarCarga('prosec', { archivoBase64: base64, nombreArchivo: 'p.xlsx', dryRun: true, ahora: HOY });
    check(seco.total === 2 && seco.aceptadas === 1 && seco.rechazadas === 1 && seco.creadas === 0,
      'dry run: acepta 1, rechaza 1 y no escribe nada');
    check(seco.filas.find(f => !f.ok)!.errores.some(e => e.includes('cotejadoPor')), 'el reporte dice por fila qué le faltó');
    check((await prisma.pROSECEligibility.count({ where: { fractionCode: FRAC_CARGA } })) === 0, 'tras el dry run la tabla sigue igual');

    const real = await importarCarga('prosec', { archivoBase64: base64, nombreArchivo: 'p.xlsx', ahora: HOY });
    check(real.aceptadas === 1 && real.creadas === 1 && real.rechazadas === 1, 'import real: crea solo la fila cotejada');
    const guardada = await prisma.pROSECEligibility.findFirst({ where: { fractionCode: FRAC_CARGA } });
    check(!!guardada?.fechaCotejo && (guardada.notes ?? '').includes('cotejadoPor: Ana Pérez'),
      'la fila guardada lleva fechaCotejo real y quién cotejó (marcador trazable)');
    check((await prisma.pROSECEligibility.count({ where: { fractionCode: FRAC_CARGA } })) === 1, 'la fila sin atestación NO se guardó');

    const repetido = await importarCarga('prosec', { archivoBase64: base64, nombreArchivo: 'p.xlsx', ahora: HOY });
    check(repetido.creadas === 0 && repetido.actualizadas === 1, 'reimportar el mismo archivo actualiza, no duplica');

    const dup = await importarCarga('prosec', {
      archivoBase64: xlsxBase64([
        { fractionCode: FRAC_CARGA, sector: `test-${nonce}-dup`, prosecRate: 5, effectiveDate: '2026-01-01', ...att },
        { fractionCode: FRAC_CARGA, sector: `test-${nonce}-dup`, prosecRate: 7, effectiveDate: '2026-01-01', ...att },
      ]),
      nombreArchivo: 'p.xlsx', dryRun: true, ahora: HOY,
    });
    check(dup.duplicadasEnArchivo === 1 && dup.rechazadas === 1, 'dos filas con la misma clave en un archivo: la segunda se rechaza');

    // Delegado: cuotas UPCI por la puerta estricta.
    const cuotaBase64 = xlsxBase64([
      { resolutionNumber: `RES-${nonce}-IMP`, fractionCode: FRAC_CARGA, countryOfOrigin: 'CN', rateType: 'percentage', rate: 12, rateUnit: '%', ...att },
      { resolutionNumber: `RES-${nonce}-IMP2`, fractionCode: FRAC_CARGA, countryOfOrigin: 'VN', rateType: 'percentage', rate: 12, rateUnit: '%' },
    ]);
    const impCuotas = await importarCarga('cuotas-upci', { archivoBase64: cuotaBase64, nombreArchivo: 'c.xlsx', ahora: HOY });
    check(impCuotas.aceptadas === 1 && impCuotas.rechazadas === 1 && impCuotas.creadas === 1,
      'cuotas UPCI: por esta ruta la fila sin atestación se rechaza (la ruta histórica la dejaría "pendiente")');
    const cuotaGuardada = await prisma.antidumpingDuty.findFirst({ where: { fractionCode: FRAC_CARGA } });
    check(!!cuotaGuardada?.cotejadoAt, 'la cuota importada por la puerta estricta queda COTEJADA, no pendiente');

    // ── 8. Plantillas ─────────────────────────────────────────────────────
    console.log('\n— plantillas —');
    for (const tipo of TIPOS_CARGA) {
      const p = XLSX.read(plantillaCargaXlsx(tipo), { type: 'buffer' });
      const hojas = p.SheetNames.join(' ');
      check(p.SheetNames.length >= 2 && /instrucciones|cotejo_estricto/.test(hojas),
        `plantilla ${tipo}: hoja de datos + hoja de instrucciones (${hojas})`);
    }
    const pAnexo = XLSX.read(plantillaCargaXlsx('anexo21'), { type: 'buffer' });
    const cabecera = XLSX.utils.sheet_to_json<string[]>(pAnexo.Sheets['anexo21']!, { header: 1 })[0] ?? [];
    check(cabecera.includes('cotejadoPor') && cabecera.includes('fuenteUrl'),
      'la plantilla trae las columnas de atestación en la hoja de datos');
    check(!!CARGADORES.anexo21.schemaRequerido && CARGADORES.anexo21.schemaRequerido.includes('model AduanaAnexo21'),
      'el cargador sin tabla propia publica su fragmento Prisma (SCHEMA REQUERIDO)');

    // ── 9. Alerta de deuda envejecida ─────────────────────────────────────
    console.log('\n— alerta de deuda —');
    const tableroFalso = (metricas: Metrica[]): TableroCotejo => ({
      generadoAt: HOY.toISOString(), tenantId: tA.id, clienteId: null, umbralDias: UMBRAL_ENVEJECIMIENTO_DIAS,
      topFracciones: [], metricas,
      resumen: { metricas: metricas.length, cerradas: 0, conDeuda: metricas.length, envejecidas: metricas.filter(x => x.envejecida).length, filasPendientes: 0, porcentajeGlobal: 0 },
    });
    const vencida = construirMetrica({ ...metricaBase, clave: `test_deuda_${nonce}`, universo: 10, conDato: 0, desde: hace(200), cargador: 'cuotas-upci' }, HOY);
    const r1 = await sincronizarAlertasDeDeuda(tA.id, tableroFalso([vencida]), HOY);
    check(r1.creadas === 1 && r1.metricas.includes(vencida.clave), 'una métrica parada >90 días genera su alerta interna');
    const alerta = await prisma.alert.findFirst({ where: { tenantId: tA.id, type: TIPO_ALERTA_DEUDA } });
    check(!!alerta && alerta.content.includes('200 días') && (alerta.actionRequired ?? '').includes('cuotas-upci'),
      'la alerta dice cuántos días lleva parada y con qué plantilla se cierra');

    const r2 = await sincronizarAlertasDeDeuda(tA.id, tableroFalso([vencida]), HOY);
    check(r2.creadas === 0 && r2.actualizadas === 1, 'volver a sincronizar no duplica la alerta (fingerprint)');

    const alDia = construirMetrica({ ...metricaBase, clave: vencida.clave, universo: 10, conDato: 10, desde: hace(200) }, HOY);
    const r3 = await sincronizarAlertasDeDeuda(tA.id, tableroFalso([alDia]), HOY);
    check(r3.resueltas === 1, 'cuando la métrica se cierra, la alerta se resuelve sola (queda el rastro)');
    check((await prisma.alert.count({ where: { tenantId: tA.id, type: TIPO_ALERTA_DEUDA, resolvedAt: null } })) === 0,
      'no quedan alertas de deuda abiertas para una métrica cerrada');
  } finally {
    await barrer();
    await prisma.$disconnect();
  }
  console.log(`\n${ok} comprobaciones OK`);
}

main().catch(e => { console.error(e); process.exit(1); });
