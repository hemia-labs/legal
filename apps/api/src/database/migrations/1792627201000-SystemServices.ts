import { MigrationInterface, QueryRunner } from 'typeorm';
export class SystemServices1792627201000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE systems ADD COLUMN services jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(services)='array');
      UPDATE systems SET services=jsonb_build_array(jsonb_build_object(
        'code','legal-context','name','Verificación de aceptaciones','url',configuration->'legalAcceptances'->>'contextUrl','enabled',true)),
        configuration=jsonb_set(configuration,'{legalAcceptances}',
          ((configuration->'legalAcceptances') - 'contextUrl') || jsonb_build_object('contextService','legal-context'))
      WHERE configuration ? 'legalAcceptances';
      UPDATE system_capabilities SET schema=jsonb_set(schema,'{fields}',
        (SELECT jsonb_agg(CASE WHEN field->>'key'='contextUrl'
          THEN (field - 'options') || jsonb_build_object('key','contextService','format','service','maxLength',80)
          ELSE field END ORDER BY position)
         FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS fields(field,position)))
      WHERE code='legalAcceptances';`);
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'System services migration is forward-only; restore a verified backup to preserve configurations.',
      ),
    );
  }
}
