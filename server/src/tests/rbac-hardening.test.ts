/**
 * P1-7 — endurecimiento RBAC (funciones puras, sin DB).
 *
 * Ejecutar: npm run test:rbac
 */

import { strict as assert } from 'node:assert';
import {
  SYSTEM_ROLES,
  hasPermission,
  rolePermissionsSchema,
  validateRolePermissions,
  type RolePermissions,
} from '../services/permissions';

function assertInvalidPermissions(input: unknown, description: string): void {
  assert.throws(
    () => rolePermissionsSchema.parse(input),
    `El schema debía rechazar: ${description}`,
  );
}

async function main(): Promise<void> {
  const escalatedViaModule = {
    modules: { classifier: { settings: true } },
    features: {},
  } as unknown as RolePermissions;
  assert.equal(hasPermission(escalatedViaModule, 'classifier', 'settings'), false);
  console.log('  ✓ settings dentro de modules.classifier no concede la feature administrativa');

  const settingsGranted: RolePermissions = { modules: {}, features: { settings: true } };
  const settingsDenied: RolePermissions = { modules: {}, features: { settings: false } };
  const settingsAbsent: RolePermissions = { modules: {}, features: {} };
  assert.equal(hasPermission(settingsGranted, 'classifier', 'settings'), true);
  assert.equal(hasPermission(settingsDenied, 'classifier', 'settings'), false);
  assert.equal(hasPermission(settingsAbsent, 'classifier', 'settings'), false);
  console.log('  ✓ settings se concede solo con features.settings=true; false o ausente deniegan');

  assertInvalidPermissions(
    { modules: { classifier: { settings: true } }, features: {} },
    'acción feature dentro de un módulo',
  );
  assertInvalidPermissions(
    { modules: { hacking: { view: true } }, features: {} },
    'módulo inexistente',
  );
  assertInvalidPermissions(
    { modules: {}, features: { superuser: true } },
    'feature inexistente',
  );
  assertInvalidPermissions(
    { modules: {}, features: {}, limits: { classificationsPerDay: 10, bypass: true } },
    'clave extra en limits',
  );
  console.log('  ✓ el schema estricto rechaza acciones, módulos, features y límites inventados');

  assert.ok(SYSTEM_ROLES.length >= 6);
  for (const role of SYSTEM_ROLES) {
    assert.deepEqual(validateRolePermissions(role.permissions), role.permissions, role.code);
  }
  console.log(`  ✓ los ${SYSTEM_ROLES.length} SYSTEM_ROLES validan con rolePermissionsSchema`);

  const modulePermissions: RolePermissions = {
    modules: { classifier: { view: true, create: true, approve: true } },
    features: {},
  };
  assert.equal(hasPermission(modulePermissions, 'classifier', 'view'), true);
  assert.equal(hasPermission(modulePermissions, 'classifier', 'create'), true);
  assert.equal(hasPermission(modulePermissions, 'classifier', 'approve'), true);
  assert.equal(hasPermission(modulePermissions, 'quoter', 'view'), false);
  console.log('  ✓ view/create/approve siguen resolviéndose exclusivamente contra el módulo');

  console.log('\nResumen: 5/5 grupos de pruebas pasaron.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
