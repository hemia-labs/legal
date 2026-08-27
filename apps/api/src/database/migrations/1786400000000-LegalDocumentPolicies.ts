import { MigrationInterface, QueryRunner } from 'typeorm';

export class LegalDocumentPolicies1786400000000 implements MigrationInterface {
  name = 'LegalDocumentPolicies1786400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" ADD "document_variant" character varying(20) NOT NULL DEFAULT 'standard'`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD "parent_document_id" uuid`,
    );
    await queryRunner.query(
      `UPDATE "documents" SET "document_type" = 'terms_and_conditions' WHERE "document_type" = 'terms'`,
    );
    await queryRunner.query(
      `UPDATE "documents" SET "document_variant" = 'integral' WHERE "document_type" = 'privacy_notice'`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ALTER COLUMN "document_type" SET DEFAULT 'terms_and_conditions'`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptances" RENAME COLUMN "evidence_metadata" TO "metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_legal_documents_parent" FOREIGN KEY ("parent_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_documents_parent_variant_locale_unique" ON "documents" ("parent_document_id", "document_variant", "locale") WHERE "parent_document_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "publications" DROP COLUMN "manifest_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "publications" DROP COLUMN "content_markdown"`,
    );
    await queryRunner.query(
      `ALTER TABLE "publications" DROP COLUMN "content_html"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" DROP COLUMN "content_markdown"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" DROP COLUMN "content_html"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence" DROP CONSTRAINT "FK_2edab1bbc0e69b4dd06cab9aef3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_evidence_acceptance_unique"`,
    );
    await queryRunner.query(`DROP TABLE "evidence"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "acceptances" RENAME COLUMN "metadata" TO "evidence_metadata"`,
    );
    await queryRunner.query(
      `CREATE TABLE "evidence" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "acceptance_id" uuid NOT NULL, "document_version_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "s3_bucket" character varying(255), "s3_object_key" character varying(1024), "s3_version_id" character varying(255), "content_type" character varying(120) NOT NULL DEFAULT 'application/json', "size_bytes" bigint, "sha256" character varying(64), "failure_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b864cb5d49854f89917fc0b44b9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_evidence_acceptance_unique" ON "evidence" ("acceptance_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence" ADD CONSTRAINT "FK_2edab1bbc0e69b4dd06cab9aef3" FOREIGN KEY ("acceptance_id") REFERENCES "acceptances"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "publications" ADD "manifest_hash" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" ADD "content_html" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" ADD "content_markdown" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "publications" ADD "content_html" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "publications" ADD "content_markdown" text`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_documents_parent_variant_locale_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_legal_documents_parent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP COLUMN "parent_document_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP COLUMN "document_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ALTER COLUMN "document_type" SET DEFAULT 'terms'`,
    );
  }
}
