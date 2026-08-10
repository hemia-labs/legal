import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationDeletedAt1786300000000 implements MigrationInterface {
  name = 'AddApplicationDeletedAt1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" ADD "deleted_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_applications_issuer_key_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_applications_issuer_key_unique" ON "applications" ("issuer_id", "key") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_applications_issuer_key_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_applications_issuer_key_unique" ON "applications" ("issuer_id", "key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP COLUMN "deleted_at"`,
    );
  }
}
