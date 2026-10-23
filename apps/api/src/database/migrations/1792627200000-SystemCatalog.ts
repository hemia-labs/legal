import { MigrationInterface, QueryRunner } from 'typeorm';
const legalAcceptanceSchema = {
  fields: [
    {
      key: 'identityIssuer',
      label: 'Identidad de origen',
      type: 'string',
      required: true,
      format: 'identity-issuer',
      maxLength: 91,
    },
    {
      key: 'productCode',
      label: 'Producto',
      type: 'string',
      required: true,
      format: 'code',
      maxLength: 80,
    },
    {
      key: 'contextUrl',
      label: 'Servicio de verificación',
      type: 'string',
      required: true,
      format: 'uri',
      maxLength: 1024,
    },
  ],
};
export class SystemCatalog1792627200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE system_capabilities (
      code varchar(80) PRIMARY KEY, name varchar(200) NOT NULL, schema jsonb NOT NULL CHECK(jsonb_typeof(schema)='object'),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE systems (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(80) NOT NULL UNIQUE, name varchar(200) NOT NULL,
      enabled boolean NOT NULL DEFAULT true, configuration jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(configuration)='object'),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE UNIQUE INDEX systems_legal_identity_unique ON systems((configuration->'legalAcceptances'->>'identityIssuer')) WHERE configuration ? 'legalAcceptances';
    CREATE TABLE system_clients (
      system_id uuid NOT NULL REFERENCES systems(id), oauth_issuer varchar(120) NOT NULL, client_id varchar(160) NOT NULL,
      role varchar(20) NOT NULL CHECK(role IN ('collector','validator')), enabled boolean NOT NULL DEFAULT true,
      PRIMARY KEY(system_id,oauth_issuer,client_id));`);
    await q.query(
      'INSERT INTO system_capabilities(code,name,schema) VALUES($1,$2,$3::jsonb)',
      [
        'legalAcceptances',
        'Aceptaciones legales',
        JSON.stringify(legalAcceptanceSchema),
      ],
    );
    await q.query(`LOCK TABLE external_identity_sources, external_identity_source_clients IN ACCESS EXCLUSIVE MODE;
    INSERT INTO systems(id,code,name,enabled,configuration,created_at,updated_at)
      SELECT id,code,name,enabled,jsonb_build_object('legalAcceptances',jsonb_build_object('identityIssuer',identity_issuer,'productCode',product_code,'contextUrl',context_url)),created_at,updated_at FROM external_identity_sources;
    INSERT INTO system_clients(system_id,oauth_issuer,client_id,role,enabled) SELECT source_id,oauth_issuer,client_id,role,enabled FROM external_identity_source_clients;
    ALTER TABLE external_identity_sources ADD COLUMN system_id uuid REFERENCES systems(id);
    UPDATE external_identity_sources SET system_id=id;
    ALTER TABLE external_identity_sources ALTER COLUMN system_id SET NOT NULL, ADD UNIQUE(system_id), DROP COLUMN identity_issuer, DROP COLUMN product_code, DROP COLUMN context_url;`);
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'System catalog migration is forward-only; restore a verified backup to preserve configurations.',
      ),
    );
  }
}
