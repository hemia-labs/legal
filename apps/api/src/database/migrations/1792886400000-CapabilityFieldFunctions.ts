import { MigrationInterface, QueryRunner } from 'typeorm';

export class CapabilityFieldFunctions1792886400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const applicability: Record<string, Record<string, string[]>> = {
      payments: {
        productCode: ['catalog', 'checkout', 'licenses', 'receiver'],
        successUrl: ['checkout'],
        cancelUrl: ['checkout'],
        receiverService: ['receiver'],
        checkService: ['checkout'],
      },
      legalAcceptances: {
        identityIssuer: ['collector'],
        productCode: ['collector'],
        contextService: ['collector'],
      },
    };
    for (const [capability, fields] of Object.entries(applicability)) {
      await q.query(
        `UPDATE system_capabilities SET schema=jsonb_set(schema,'{fields}',
          (SELECT COALESCE(jsonb_agg(CASE WHEN $2::jsonb ? (field->>'key')
           THEN field || jsonb_build_object('functions',$2::jsonb->(field->>'key')) ELSE field END ORDER BY position),'[]'::jsonb)
           FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS entries(field,position))),updated_at=now()
          WHERE code=$1`,
        [capability, JSON.stringify(fields)],
      );
    }
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Capability field functions migration is forward-only; restore code and database together.',
      ),
    );
  }
}
