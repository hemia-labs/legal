import { MigrationInterface, QueryRunner } from 'typeorm';
/** Schema only: intentionally refuses existing integrations instead of converting data. */
export class DynamicIntegrationDocuments1791356400000 implements MigrationInterface {
  private async requireEmpty(q: QueryRunner) {
    await q.query(
      'LOCK TABLE external_identity_sources IN ACCESS EXCLUSIVE MODE',
    );
    const rows: { present: boolean }[] = (await q.query(
      'SELECT EXISTS(SELECT 1 FROM external_identity_sources) AS present',
    )) as { present: boolean }[];
    if (rows[0].present)
      throw new Error(
        'Dynamic document schema requires an empty integration registry; no data conversion is included',
      );
  }
  async up(q: QueryRunner): Promise<void> {
    await this.requireEmpty(q);
    await q.query(`CREATE TABLE external_identity_source_documents (
      source_id uuid NOT NULL REFERENCES external_identity_sources(id),
      document_id uuid NOT NULL REFERENCES documents(id),
      position smallint NOT NULL CHECK(position BETWEEN 0 AND 99),
      PRIMARY KEY(source_id,document_id), UNIQUE(source_id,position)
    );
    ALTER TABLE external_identity_sources DROP COLUMN terms_document_id, DROP COLUMN privacy_document_id, DROP COLUMN refund_policy_document_id;`);
  }
  async down(q: QueryRunner): Promise<void> {
    await this.requireEmpty(q);
    await q.query(`DROP TABLE external_identity_source_documents;
    ALTER TABLE external_identity_sources
      ADD COLUMN terms_document_id uuid NOT NULL REFERENCES documents(id),
      ADD COLUMN privacy_document_id uuid NOT NULL REFERENCES documents(id),
      ADD COLUMN refund_policy_document_id uuid NOT NULL REFERENCES documents(id),
      ADD CHECK(terms_document_id<>privacy_document_id AND terms_document_id<>refund_policy_document_id AND privacy_document_id<>refund_policy_document_id);`);
  }
}
