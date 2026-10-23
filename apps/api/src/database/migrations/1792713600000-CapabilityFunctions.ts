import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CapabilityFunctions1792713600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE system_capabilities ADD COLUMN functions jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(functions)='array');
      ALTER TABLE system_clients ADD COLUMN capability_code varchar(80) REFERENCES system_capabilities(code);
      UPDATE system_clients SET capability_code='legalAcceptances';
      ALTER TABLE system_clients ALTER COLUMN capability_code SET NOT NULL;
      ALTER TABLE system_clients DROP CONSTRAINT system_clients_role_check;
      ALTER TABLE system_clients ALTER COLUMN role TYPE varchar(80);`);
    await q.query(
      'UPDATE system_capabilities SET functions=$1::jsonb WHERE code=$2',
      [
        JSON.stringify([
          {
            code: 'collector',
            name: 'Registrar aceptaciones',
            scopes: [
              {
                audience: 'legal-api',
                code: 'legal.integration.acceptances.prepare',
              },
              {
                audience: 'legal-api',
                code: 'legal.integration.acceptances.create',
              },
            ],
          },
          {
            code: 'validator',
            name: 'Validar evidencia',
            scopes: [
              {
                audience: 'legal-api',
                code: 'legal.integration.acceptances.validate',
              },
            ],
          },
        ]),
        'legalAcceptances',
      ],
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Capability functions migration is forward-only; restore a verified backup to preserve capability client assignments.',
      ),
    );
  }
}
