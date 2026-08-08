import { AppDataSource } from '../../../data-source';

const permissions = [
  'legal.issuers.view',
  'legal.issuers.create',
  'legal.issuers.edit',
  'legal.issuers.archive',
  'legal.applications.view',
  'legal.applications.create',
  'legal.applications.edit',
  'legal.applications.archive',
  'legal.documents.view',
  'legal.documents.create',
  'legal.documents.edit',
  'legal.documents.archive',
  'legal.versions.view',
  'legal.versions.create',
  'legal.versions.edit',
  'legal.versions.publish',
  'legal.pending.view',
  'legal.pending.evaluate',
  'legal.acceptances.create',
  'legal.acceptances.export',
  'legal.acceptances.view',
  'legal.notifications.view',
  'legal.notifications.manage',
  'legal.audit.view',
] as const;

const roles = [
  ['legal.admin', 'Legal administrator'],
  ['legal.viewer', 'Legal viewer'],
  ['legal.editor', 'Legal editor'],
  ['legal.publisher', 'Legal publisher'],
] as const;

const viewerPermissions = permissions.filter((permission) =>
  permission.endsWith('.view'),
);

const rolePermissions: Record<string, readonly string[]> = {
  'legal.admin': permissions,
  'legal.viewer': viewerPermissions,
  'legal.editor': [
    ...viewerPermissions,
    'legal.issuers.create',
    'legal.issuers.edit',
    'legal.applications.create',
    'legal.applications.edit',
    'legal.documents.create',
    'legal.documents.edit',
    'legal.versions.create',
    'legal.versions.edit',
    'legal.pending.evaluate',
    'legal.acceptances.create',
    'legal.notifications.manage',
  ],
  'legal.publisher': [...viewerPermissions, 'legal.versions.publish'],
};

async function seed() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const roleIds = new Map<string, string>();

      for (const [code, name] of roles) {
        const [role] = await manager.query(
          `INSERT INTO roles (code, name, is_system)
           VALUES ($1, $2, true)
           ON CONFLICT (code) DO UPDATE
             SET name = EXCLUDED.name, is_system = true, updated_at = now()
           RETURNING id`,
          [code, name],
        );
        roleIds.set(code, role.id);
      }

      for (const [roleCode, rolePermissionCodes] of Object.entries(
        rolePermissions,
      )) {
        for (const permissionCode of rolePermissionCodes) {
          await manager.query(
            `INSERT INTO role_permissions (role_id, permission_code)
             VALUES ($1, $2)
             ON CONFLICT (role_id, permission_code) DO NOTHING`,
            [roleIds.get(roleCode), permissionCode],
          );
        }
      }
    });
  } finally {
    await AppDataSource.destroy();
  }
}

void seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
