import { MigrationInterface, QueryRunner } from 'typeorm';
export class LegalServiceClients1791345600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE legal_service_clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      oauth_issuer varchar(2048) NOT NULL,
      client_id varchar(120) NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      policy jsonb NOT NULL CHECK (jsonb_typeof(policy)='object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    ); CREATE UNIQUE INDEX "IDX_legal_service_clients_identity" ON legal_service_clients(oauth_issuer,client_id);`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE legal_service_clients');
  }
}
