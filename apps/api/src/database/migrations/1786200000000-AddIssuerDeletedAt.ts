import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssuerDeletedAt1786200000000 implements MigrationInterface {
  name = 'AddIssuerDeletedAt1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issuers" ADD "deleted_at" TIMESTAMP`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_issuers_key_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_issuers_key_unique" ON "issuers" ("key") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_issuers_key_unique"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_issuers_key_unique" ON "issuers" ("key")`,
    );
    await queryRunner.query(`ALTER TABLE "issuers" DROP COLUMN "deleted_at"`);
  }
}
