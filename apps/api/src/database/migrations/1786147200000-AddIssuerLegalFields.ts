import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssuerLegalFields1786147200000 implements MigrationInterface {
  name = 'AddIssuerLegalFields1786147200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issuers" ADD "legal_name" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "issuers" ADD "tax_id" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "issuers" ADD "country_code" character varying(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "issuers" ADD "default_locale" character varying(12)`,
    );
    await queryRunner.query(
      `UPDATE "issuers" SET "legal_name" = "name", "country_code" = 'MX', "default_locale" = 'es-MX'`,
    );
    await queryRunner.query(
      `ALTER TABLE "issuers" ALTER COLUMN "legal_name" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "issuers" ALTER COLUMN "country_code" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "issuers" ALTER COLUMN "default_locale" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issuers" DROP COLUMN "default_locale"`,
    );
    await queryRunner.query(`ALTER TABLE "issuers" DROP COLUMN "country_code"`);
    await queryRunner.query(`ALTER TABLE "issuers" DROP COLUMN "tax_id"`);
    await queryRunner.query(`ALTER TABLE "issuers" DROP COLUMN "legal_name"`);
  }
}
