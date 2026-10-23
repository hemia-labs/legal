import { MigrationInterface, QueryRunner } from 'typeorm';
export class SystemConnectionFunctions1792800000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE system_clients ADD COLUMN roles text[];
      UPDATE system_clients SET roles=ARRAY[role];
      ALTER TABLE system_clients ALTER COLUMN roles SET NOT NULL, ADD CHECK(cardinality(roles) BETWEEN 1 AND 30), DROP COLUMN role;
      ALTER TABLE system_clients DROP CONSTRAINT system_clients_pkey;
      ALTER TABLE system_clients ADD PRIMARY KEY(system_id,oauth_issuer,client_id,capability_code);
      ALTER TABLE external_identity_source_clients ADD COLUMN roles text[];
      UPDATE external_identity_source_clients SET roles=ARRAY[role];
      ALTER TABLE external_identity_source_clients ALTER COLUMN roles SET NOT NULL, ADD CHECK(cardinality(roles) BETWEEN 1 AND 2 AND roles <@ ARRAY['collector','validator']::text[]), DROP COLUMN role;
      CREATE INDEX idx_external_clients_authenticated ON external_identity_source_clients(oauth_issuer,client_id) WHERE enabled;
      UPDATE systems SET services=COALESCE((SELECT jsonb_agg((service - 'verificationAllowed') || jsonb_build_object(
        'audience',COALESCE(service->>'audience',''),
        'resource',substring(service->>'url' from '^https?://[^/]+'),
        'enabled',COALESCE((service->>'enabled')::boolean,false)) ORDER BY position)
        FROM jsonb_array_elements(systems.services) WITH ORDINALITY AS entries(service,position)), '[]'::jsonb);
    `);
    await q.query(
      `INSERT INTO system_capabilities(code,name,schema,functions) VALUES('payments','Pagos',$1::jsonb,$2::jsonb) ON CONFLICT(code) DO NOTHING`,
      [
        JSON.stringify({
          fields: [
            {
              key: 'productCode',
              label: 'Producto',
              type: 'string',
              format: 'code',
              maxLength: 80,
            },
            {
              key: 'successUrl',
              label: 'Retorno al completar',
              type: 'string',
              format: 'uri',
              maxLength: 2048,
            },
            {
              key: 'cancelUrl',
              label: 'Retorno al cancelar',
              type: 'string',
              format: 'uri',
              maxLength: 2048,
            },
            {
              key: 'receiverService',
              label: 'Receptor de licencias',
              type: 'string',
              format: 'service',
            },
            {
              key: 'checkService',
              label: 'Comprobación de pagos',
              type: 'string',
              format: 'service',
            },
          ],
        }),
        JSON.stringify([
          {
            code: 'receiver',
            name: 'Verificar notificaciones',
            scopes: [
              { audience: 'identity-api', code: 'identity.tokens.introspect' },
            ],
          },
          {
            code: 'catalog',
            name: 'Consultar planes',
            scopes: [
              {
                audience: 'billing-api',
                code: 'billing.integration.catalog.read',
              },
            ],
          },
          {
            code: 'checkout',
            name: 'Crear y consultar cobros',
            scopes: [
              {
                audience: 'billing-api',
                code: 'billing.integration.checkout.create',
              },
              {
                audience: 'billing-api',
                code: 'billing.integration.checkout.read',
              },
            ],
          },
          {
            code: 'licenses',
            name: 'Consultar licencias',
            scopes: [
              {
                audience: 'billing-api',
                code: 'billing.integration.licenses.read',
              },
            ],
          },
        ]),
      ],
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Connection functions cut is forward-only; restore development code and database together.',
      ),
    );
  }
}
