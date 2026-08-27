/**
 * Ola 3 — Vista Defensa: el paquete se arma con datos reales del tenant y el
 * hash de la bitácora coincide con la cadena de AuditLog.
 *
 * Tenant propio (borrado al final). Verifica:
 *  - el paquete trae versiones usadas, reglas, aprobaciones y bitácora con fuente;
 *  - bitacora.ultimoHash == hash del último AuditLog de la entidad y la cadena
 *    del tenant es válida (verifyChain);
 *  - certificado: folio, hashPaquete reproducible, leyenda NOM-151 matizada;
 *  - cross-tenant → null; tipo inválido → error;
 *  - infraInfo: cifrado en reposo y región marcados como pendientes (sin inventar).
 *
 *   npm run test:defensa   (solo DB local)
 */
import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { recordAudit, verifyChain } from '../services/audit-service';
import { armarPaqueteDefensa, hashPaquete, listarEntidadesDefensa, NOM151_LEYENDA } from '../services/defensa';
import { infraInfo } from '../lib/infra-info';

let pasan = 0, fallan = 0;
async function caso(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); pasan++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallan++; console.log(`  ✗ ${nombre}\n    ${(e as Error).message}`); }
}
function soloLocal(): void {
  let host = '';
  try { host = new URL(process.env.DATABASE_URL ?? '').hostname; } catch { /* */ }
  if (!/^(localhost|127\.0\.0\.1)$/.test(host)) throw new Error(`REFUSED: solo DB local (host=${host || '?'})`);
}

async function main() {
  soloLocal();
  console.log('Defensa — paquete + certificado de integridad');
  const nonce = `${Date.now()}`;
  let tenantId: string | undefined, otroTenantId: string | undefined;
  try {
    const tenant = await prisma.tenant.create({ data: { name: `__ola3_defensa_test__ ${nonce}`, rfc: 'XAXX010101000' } });
    tenantId = tenant.id;
    const otro = await prisma.tenant.create({ data: { name: `__ola3_defensa_otro__ ${nonce}` } });
    otroTenantId = otro.id;
    const junior = await prisma.user.create({ data: { email: `ola3-def-j-${nonce}@test.local`, password: 'x', name: 'Junior', tenantId } });
    const patente = await prisma.user.create({ data: { email: `ola3-def-p-${nonce}@test.local`, password: 'x', name: 'Patente', tenantId } });
    const cls = await prisma.classification.create({ data: {
      tenantId, userId: junior.id, fractionCode: '84713001', inputDescription: 'laptop de prueba', confidence: 88,
      griApplied: ['1', '6'], tigieVersion: 'TIGIE-prueba-2026', ligieVersion: 'LIGIE-prueba', status: 'approved', approvedAt: new Date(), approvedById: patente.id,
    } });
    const ev1 = await recordAudit({ tenantId, userId: junior.id, action: 'CREATE', entity: 'Classification', entityId: cls.id, method: 'POST', endpoint: '/api/classify' });
    const ev2 = await recordAudit({ tenantId, userId: patente.id, action: 'APPROVE', entity: 'Classification', entityId: cls.id, method: 'POST', endpoint: `/api/classify/${cls.id}/approve` });
    assert.ok(ev1 && ev2, 'recordAudit debe devolver id/hash');
    const risk = await prisma.riskAssessment.create({ data: { tenantId, userId: junior.id, input: {}, exposicion: 42, escudoPct: 60, banda: 'AMARILLO', detalle: { reglas: [] }, checklist: {}, rulesVersion: 'v-prueba', pesosSnapshot: { VALOR: 10 } } });

    const p = await armarPaqueteDefensa({ tenantId, tipo: 'classification', id: cls.id, baseUrl: 'https://app.test' });
    assert.ok(p, 'paquete nulo');

    await caso('versiones usadas vienen de la clasificación y traen fuente + vigentes hoy', () => {
      assert.equal(p!.versiones.usadas.tigie, 'TIGIE-prueba-2026');
      assert.equal(p!.versiones.usadas.ligie, 'LIGIE-prueba');
      assert.ok(p!.versiones.vigentesHoy.tigie.length > 5);
      assert.equal(p!.versiones.desactualizada, true, 'versión de prueba ≠ vigente → desactualizada');
      assert.match(p!.versiones.fuente, /VersionSnapshot/);
    });
    await caso('reglas que corrieron: GRI aplicadas con fuente', () => {
      assert.deepEqual((p!.reglas.datos as { griApplied: string[] }).griApplied, ['1', '6']);
      assert.match(p!.reglas.fuente, /griApplied/);
    });
    await caso('quién aprobó qué y cuándo', () => {
      assert.equal(p!.aprobaciones.status, 'approved');
      assert.equal(p!.aprobaciones.creadoPor?.id, junior.id);
      assert.equal(p!.aprobaciones.aprobadoPor?.id, patente.id);
      assert.ok(p!.aprobaciones.approvedAt);
    });
    await caso('bitácora: 2 eventos de la entidad, último hash == hash de la cadena, cadena válida', async () => {
      assert.equal(p!.bitacora.eventos.length, 2);
      assert.equal(p!.bitacora.eventos[0]!.hash, ev1!.hash);
      assert.equal(p!.bitacora.eventos[1]!.prevHash, ev1!.hash, 'encadenado');
      assert.equal(p!.bitacora.ultimoHash, ev2!.hash);
      assert.equal(p!.bitacora.ultimoHashTenant, ev2!.hash);
      const ult = await prisma.auditLog.findFirst({ where: { tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      assert.equal(p!.bitacora.ultimoHash, ult!.hash);
      assert.deepEqual(p!.bitacora.cadena, await verifyChain(tenantId!));
      assert.equal(p!.bitacora.cadena.valid, true);
    });
    await caso('certificado: folio, hash reproducible, URLs de verificación y NOM-151 matizada', () => {
      const { certificado, ...resto } = p!;
      assert.match(certificado.folio, /^DEF-CLA-[A-Z0-9]{8}-\d{8}$/);
      assert.equal(certificado.hashPaquete, hashPaquete(resto));
      assert.match(certificado.hashPaquete, /^[a-f0-9]{64}$/);
      assert.equal(certificado.verifyAuditUrl, `https://app.test/verify/audit/${ev2!.hash}`);
      assert.equal(certificado.verifyConsultUrl, null, 'sin consultHash → sin URL de consulta');
      assert.equal(certificado.nom151, NOM151_LEYENDA);
      assert.match(certificado.nom151, /no integrada/);
    });
    await caso('tipo risk: rulesVersion + pesosSnapshot', async () => {
      const r = await armarPaqueteDefensa({ tenantId: tenantId!, tipo: 'risk', id: risk.id, baseUrl: 'https://app.test' });
      assert.ok(r);
      const d = r!.reglas.datos as { rulesVersion: string; pesosSnapshot: unknown };
      assert.equal(d.rulesVersion, 'v-prueba'); assert.deepEqual(d.pesosSnapshot, { VALOR: 10 });
      assert.equal(r!.bitacora.eventos.length, 0, 'sin eventos ligados → vacío honesto');
      assert.equal(r!.certificado.verifyAuditUrl, null);
    });
    await caso('cross-tenant → null; tipo inválido → error', async () => {
      assert.equal(await armarPaqueteDefensa({ tenantId: otroTenantId!, tipo: 'classification', id: cls.id, baseUrl: 'x' }), null);
      await assert.rejects(() => armarPaqueteDefensa({ tenantId: tenantId!, tipo: 'pedimento', id: cls.id, baseUrl: 'x' }), /tipo inválido/);
    });
    await caso('listado para el selector: solo mi tenant', async () => {
      const mios = await listarEntidadesDefensa(tenantId!, 'classification', undefined);
      assert.equal(mios.length, 1); assert.equal(mios[0]!.id, cls.id);
      assert.equal((await listarEntidadesDefensa(otroTenantId!, 'classification', undefined)).length, 0);
    });
    await caso('infraInfo: tránsito verificado; reposo, región y backups pendientes; SOC 2 en evaluación; NOM-151 no integrada', () => {
      const i = infraInfo();
      const por = (k: string) => i.afirmaciones.find(a => a.clave === k)!;
      assert.equal(por('transito').estado, 'verificado');
      assert.equal(por('reposo').estado, 'pendiente'); assert.match(por('reposo').detalle, /pendiente de confirmar/i);
      assert.equal(por('backups').estado, 'pendiente');
      assert.equal(por('soc2').estado, 'en_evaluacion'); assert.doesNotMatch(por('soc2').detalle, /20\d\d/, 'sin fechas inventadas');
      assert.equal(por('nom151').estado, 'no_integrado');
      assert.equal(i.proveedor.regionEstado, 'pendiente');
      assert.equal(i.enlaces.avisoPrivacidad, '/privacidad');
      for (const a of i.afirmaciones) assert.ok(a.evidencia.length > 10, `${a.clave} sin evidencia`);
    });
  } finally {
    for (const t of [tenantId, otroTenantId]) {
      if (!t) continue;
      await prisma.riskAssessment.deleteMany({ where: { tenantId: t } });
      await prisma.classification.deleteMany({ where: { tenantId: t } });
      await prisma.auditLog.deleteMany({ where: { tenantId: t } });
      await prisma.user.deleteMany({ where: { tenantId: t } });
      await prisma.tenant.delete({ where: { id: t } });
    }
    await prisma.$disconnect();
  }
  console.log(`\n${pasan} passed, ${fallan} failed`);
  if (fallan > 0) process.exit(1);
}

void main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
