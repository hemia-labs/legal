import { MigrationInterface, QueryRunner } from 'typeorm';
/** Reversible schema change. Never changes or deletes historical data. */
export class LegalOrganizationConsumerBoundary1790035200000 implements MigrationInterface {
  name = 'LegalOrganizationConsumerBoundary1790035200000';
  async up(q: QueryRunner): Promise<void> {
    if (!q.isTransactionActive)
      throw new Error('Organization cutover requires a transaction');
    for (const table of [
      'acceptance_rules',
      'acceptances',
      'notifications',
      'publications',
    ]) {
      await q.query(
        `DO $$ BEGIN IF EXISTS(SELECT 1 FROM ${table} r WHERE r.product_tenant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_tenants t WHERE t.id::text=r.product_tenant_id AND t.organization_id=r.organization_id)) THEN RAISE EXCEPTION 'Ambiguous historical tenant/organization relation in ${table}: explicit remediation required'; END IF; END $$`,
      );
    }
    await q.query(
      `CREATE UNIQUE INDEX "IDX_legal_acceptances_identity_org_version_rule" ON acceptances(identity_issuer,subject_id,organization_id,document_version_id,acceptance_rule_id) WHERE organization_id IS NOT NULL`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP INDEX "IDX_legal_acceptances_identity_org_version_rule"',
    );
  }
}
