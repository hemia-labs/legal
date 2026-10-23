import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentDeletedAt1786500000000 implements MigrationInterface {
  name = 'AddDocumentDeletedAt1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" ADD "deleted_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_documents_context_key_locale_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_documents_context_key_locale_unique" ON "documents" ("issuer_id", "application_id", "key", "locale") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_documents_context_key_locale_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_documents_context_key_locale_unique" ON "documents" ("issuer_id", "application_id", "key", "locale")`,
    );
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "deleted_at"`);
  }
}
