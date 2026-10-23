import { MigrationInterface, QueryRunner } from 'typeorm';
export class VerificationServiceApproval1792627202000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE systems SET services=COALESCE((SELECT jsonb_agg(service || jsonb_build_object(
      'verificationAllowed', COALESCE(service->>'code'=systems.configuration->'legalAcceptances'->>'contextService',false)) ORDER BY position)
      FROM jsonb_array_elements(systems.services) WITH ORDINALITY AS entries(service,position)), '[]'::jsonb);`);
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Verification approval migration is forward-only; restore a verified backup to preserve authorizations.',
      ),
    );
  }
}
