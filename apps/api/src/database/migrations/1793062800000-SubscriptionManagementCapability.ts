import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionManagementCapability1793062800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE system_capabilities
      SET functions=functions || $1::jsonb,
          schema=jsonb_set(schema,'{fields}',
            (SELECT COALESCE(jsonb_agg(
              CASE WHEN field->>'key' IN ('productCode','successUrl','cancelUrl') THEN jsonb_set(field,'{functions}',
                COALESCE(field->'functions','[]'::jsonb) || '["subscriptions"]'::jsonb)
              ELSE field END ORDER BY position),'[]'::jsonb)
             FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS entries(field,position))),
          updated_at=now()
      WHERE code='payments' AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(functions) fn WHERE fn->>'code'='subscriptions')`,
      [
        JSON.stringify([
          {
            code: 'subscriptions',
            name: 'Cambiar y cancelar suscripciones',
            scopes: [
              { audience: 'billing-api', code: 'billing.subscriptions.manage' },
              {
                audience: 'billing-api',
                code: 'billing.integration.catalog.read',
              },
              {
                audience: 'billing-api',
                code: 'billing.integration.checkout.read',
              },
            ],
          },
        ]),
      ],
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Subscription management capability is forward-only; restore a verified backup to preserve configured scopes.',
      ),
    );
  }
}
