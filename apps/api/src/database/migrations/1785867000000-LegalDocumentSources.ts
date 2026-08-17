import { MigrationInterface, QueryRunner } from 'typeorm';

export class LegalDocumentSources1785867000000 implements MigrationInterface {
  name = 'LegalDocumentSources1785867000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "document_versions" ALTER COLUMN "content_markdown" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_kind" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_content_type" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_file_name" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_size_bytes" bigint`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_hash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_s3_bucket" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_s3_object_key" character varying(1024)`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_s3_version_id" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "document_versions" ADD "source_s3_etag" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "publications" ALTER COLUMN "content_markdown" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "publications" ALTER COLUMN "content_html" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "publications" ADD "source_kind" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "publications" ADD "source_hash" character varying(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "publications" DROP COLUMN "source_hash"`);
    await queryRunner.query(`ALTER TABLE "publications" DROP COLUMN "source_kind"`);
    await queryRunner.query(`ALTER TABLE "publications" ALTER COLUMN "content_html" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "publications" ALTER COLUMN "content_markdown" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_s3_etag"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_s3_version_id"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_s3_object_key"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_s3_bucket"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_hash"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_size_bytes"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_file_name"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_content_type"`);
    await queryRunner.query(`ALTER TABLE "document_versions" DROP COLUMN "source_kind"`);
    await queryRunner.query(`ALTER TABLE "document_versions" ALTER COLUMN "content_markdown" SET NOT NULL`);
  }
}
