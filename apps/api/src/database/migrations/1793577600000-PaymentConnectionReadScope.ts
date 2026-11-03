import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentConnectionReadScope1793577600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE system_capabilities capability
       SET functions = (
         SELECT jsonb_agg(
           CASE WHEN COALESCE(fn->'scopes', '[]'::jsonb) @> $1::jsonb
             THEN fn
             ELSE jsonb_set(fn, '{scopes}', COALESCE(fn->'scopes', '[]'::jsonb) || $1::jsonb)
           END ORDER BY position
         )
         FROM jsonb_array_elements(capability.functions) WITH ORDINALITY AS entries(fn, position)
       ), updated_at = now()
       WHERE capability.code = 'payments' AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(capability.functions) fn
         WHERE NOT (COALESCE(fn->'scopes', '[]'::jsonb) @> $1::jsonb)
       )`,
      [
        JSON.stringify([
          {
            audience: 'billing-api',
            code: 'billing.integration.connections.read',
          },
        ]),
      ],
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Review configured connections before removing their catalog permission.',
      ),
    );
  }
}
