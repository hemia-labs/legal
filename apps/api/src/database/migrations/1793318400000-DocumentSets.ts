import { MigrationInterface, QueryRunner } from 'typeorm';
export class DocumentSets1793318400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE system_capabilities SET schema=jsonb_set(schema,'{fields}',
      (SELECT jsonb_agg(CASE WHEN field->>'key'='contextService' THEN field || '{"required":false}'::jsonb ELSE field END ORDER BY position)
       FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS fields(field,position))),updated_at=now() WHERE code='legalAcceptances';
    CREATE TABLE legal_document_sets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES applications(id),
      source_id uuid NOT NULL REFERENCES external_identity_sources(id), key varchar(80) NOT NULL,
      revision uuid NOT NULL DEFAULT gen_random_uuid(), name varchar(200) NOT NULL, enabled boolean NOT NULL,
      configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'), effective_from timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,key));
    CREATE TABLE legal_document_set_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), set_id uuid NOT NULL REFERENCES legal_document_sets(id),
      source_id uuid NOT NULL REFERENCES external_identity_sources(id), application_id uuid NOT NULL REFERENCES applications(id),
      set_key varchar(80) NOT NULL, set_revision uuid NOT NULL, locale varchar(12) NOT NULL,
      fingerprint char(64) NOT NULL, configuration jsonb NOT NULL, documents jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
      UNIQUE(set_id,fingerprint,expires_at), CHECK(jsonb_typeof(documents)='array' AND jsonb_array_length(documents) BETWEEN 1 AND 100));
    CREATE INDEX idx_legal_snapshots_live ON legal_document_set_snapshots(set_id,fingerprint,expires_at);
    CREATE TABLE legal_evidence_receipts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_id uuid NOT NULL REFERENCES legal_document_set_snapshots(id),
      source_id uuid NOT NULL REFERENCES external_identity_sources(id), client_id uuid NOT NULL,
      idempotency_key uuid NOT NULL, payload_hash char(64) NOT NULL, identity_issuer varchar(120) NOT NULL,
      subject_id varchar(160) NOT NULL, organization_id varchar(120), session_id varchar(160),
      authentication_method varchar(80) NOT NULL, assurance jsonb NOT NULL,
      occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), confirmations jsonb NOT NULL,
      UNIQUE(source_id,client_id,idempotency_key), FOREIGN KEY(client_id,source_id) REFERENCES external_identity_source_clients(id,source_id),
      CHECK(jsonb_typeof(confirmations)='array' AND jsonb_array_length(confirmations) BETWEEN 1 AND 100));
    CREATE INDEX idx_legal_receipts_subject ON legal_evidence_receipts(source_id,subject_id,organization_id);
    CREATE FUNCTION legal_document_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Legal evidence is immutable'; END $$;
    CREATE TRIGGER legal_snapshots_immutable BEFORE UPDATE OR DELETE ON legal_document_set_snapshots FOR EACH ROW EXECUTE FUNCTION legal_document_evidence_immutable();
    CREATE TRIGGER legal_receipts_immutable BEFORE UPDATE OR DELETE ON legal_evidence_receipts FOR EACH ROW EXECUTE FUNCTION legal_document_evidence_immutable();`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TABLE legal_evidence_receipts; DROP TABLE legal_document_set_snapshots; DROP FUNCTION legal_document_evidence_immutable(); DROP TABLE legal_document_sets;
      UPDATE system_capabilities SET schema=jsonb_set(schema,'{fields}',
      (SELECT jsonb_agg(CASE WHEN field->>'key'='contextService' THEN field || '{"required":true}'::jsonb ELSE field END ORDER BY position)
       FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS fields(field,position))),updated_at=now() WHERE code='legalAcceptances';`,
    );
  }
}
