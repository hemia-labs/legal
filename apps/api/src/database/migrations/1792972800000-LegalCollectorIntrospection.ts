import { MigrationInterface, QueryRunner } from 'typeorm';

export class LegalCollectorIntrospection1792972800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE system_capabilities SET functions=(
      SELECT jsonb_agg(CASE WHEN fn->>'code'='collector' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(fn->'scopes') scope
        WHERE scope->>'audience'='identity-api' AND scope->>'code'='identity.tokens.introspect'
      ) THEN jsonb_set(fn,'{scopes}',(fn->'scopes') || '[{"audience":"identity-api","code":"identity.tokens.introspect"}]'::jsonb)
      ELSE fn END ORDER BY position)
      FROM jsonb_array_elements(functions) WITH ORDINALITY entries(fn,position)
    ),updated_at=now() WHERE code='legalAcceptances'`);
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Legal collector introspection migration is forward-only; restore code and database together.',
      ),
    );
  }
}
