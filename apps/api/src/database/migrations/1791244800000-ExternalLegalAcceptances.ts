import { MigrationInterface, QueryRunner } from 'typeorm';
export class ExternalLegalAcceptances1791244800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE external_identity_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(80) NOT NULL UNIQUE, name varchar(200) NOT NULL,
 identity_issuer varchar(120) NOT NULL UNIQUE, issuer_id uuid NOT NULL REFERENCES issuers(id),
 application_id uuid NOT NULL REFERENCES applications(id), product_code varchar(80) NOT NULL,
 context_url varchar(1024) NOT NULL, enabled boolean NOT NULL DEFAULT true,
 terms_document_id uuid NOT NULL REFERENCES documents(id), privacy_document_id uuid NOT NULL REFERENCES documents(id), refund_policy_document_id uuid NOT NULL REFERENCES documents(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(terms_document_id<>privacy_document_id AND terms_document_id<>refund_policy_document_id AND privacy_document_id<>refund_policy_document_id));
 CREATE TABLE external_identity_source_clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES external_identity_sources(id),
 oauth_issuer varchar(120) NOT NULL, client_id varchar(160) NOT NULL, role varchar(20) NOT NULL CHECK(role IN ('collector','validator')),
 enabled boolean NOT NULL DEFAULT true, UNIQUE(source_id,oauth_issuer,client_id), UNIQUE(id,source_id));
 CREATE INDEX idx_external_clients_authenticated ON external_identity_source_clients(oauth_issuer,client_id,role) WHERE enabled;
 CREATE TABLE external_identity_source_organizations (
 source_id uuid NOT NULL REFERENCES external_identity_sources(id), organization_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT true, PRIMARY KEY(source_id,organization_id));
 CREATE TABLE external_acceptance_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES external_identity_sources(id),
 client_id uuid NOT NULL, subject_id uuid NOT NULL, organization_id uuid NOT NULL, session_id uuid NOT NULL,
 preparation_key uuid NOT NULL, documents jsonb NOT NULL CHECK(CASE WHEN jsonb_typeof(documents)='array' THEN jsonb_array_length(documents) BETWEEN 1 AND 100 ELSE false END),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', created_at timestamptz NOT NULL DEFAULT now(),
 idempotency_key uuid, payload_hash varchar(64), result jsonb,
 FOREIGN KEY(client_id,source_id) REFERENCES external_identity_source_clients(id,source_id),
 UNIQUE(source_id,client_id,preparation_key), UNIQUE(source_id,client_id,idempotency_key),
 CHECK((idempotency_key IS NULL AND payload_hash IS NULL AND result IS NULL) OR (idempotency_key IS NOT NULL AND payload_hash IS NOT NULL AND result IS NOT NULL)));
 ALTER TABLE acceptances ADD COLUMN external_identity_source_id uuid REFERENCES external_identity_sources(id), ADD COLUMN registering_client_id uuid,
 ADD CONSTRAINT fk_acceptances_external_client FOREIGN KEY(registering_client_id,external_identity_source_id) REFERENCES external_identity_source_clients(id,source_id),
 ADD CONSTRAINT ck_acceptances_external_provenance CHECK((external_identity_source_id IS NULL)=(registering_client_id IS NULL));
 CREATE INDEX idx_acceptances_external_source ON acceptances(external_identity_source_id,subject_id,organization_id);`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE acceptances DROP CONSTRAINT ck_acceptances_external_provenance, DROP CONSTRAINT fk_acceptances_external_client, DROP COLUMN registering_client_id, DROP COLUMN external_identity_source_id;
 DROP TABLE external_acceptance_requests; DROP TABLE external_identity_source_organizations; DROP TABLE external_identity_source_clients; DROP TABLE external_identity_sources;`);
  }
}
