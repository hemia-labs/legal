import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1785866242350 implements MigrationInterface {
  name = 'Migration1785866242350';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "issuer_id" uuid, "application_id" uuid, "trace_id" character varying(80) NOT NULL, "actor_identity_issuer" character varying(120) NOT NULL, "actor_subject_id" character varying(160) NOT NULL, "actor_type" character varying(40) NOT NULL, "action" character varying(120) NOT NULL, "entity_type" character varying(80) NOT NULL, "entity_id" uuid, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_audit_context" ON "audit_events"  ("issuer_id", "application_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "issuers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(80) NOT NULL, "name" character varying(160) NOT NULL, "type" character varying(40) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_36d87e2e6d1edfcbdc561deeaf9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_issuers_key_unique" ON "issuers"  ("key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "issuer_id" uuid NOT NULL, "key" character varying(80) NOT NULL, "name" character varying(160) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_938c0a27255637bde919591888f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_applications_issuer_key_unique" ON "applications"  ("issuer_id", "key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "issuer_id" uuid NOT NULL, "application_id" uuid NOT NULL, "key" character varying(80) NOT NULL, "document_type" character varying(40) NOT NULL DEFAULT 'terms', "locale" character varying(12) NOT NULL, "title" character varying(200) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_documents_context_key_locale_unique" ON "documents"  ("issuer_id", "application_id", "key", "locale") `,
    );
    await queryRunner.query(
      `CREATE TABLE "document_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "document_id" uuid NOT NULL, "version" character varying(40) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'draft', "content_markdown" text NOT NULL, "content_html" text, "content_hash" character varying(64), "effective_from" TIMESTAMP WITH TIME ZONE, "effective_until" TIMESTAMP WITH TIME ZONE, "acceptance_deadline" TIMESTAMP WITH TIME ZONE, "grace_period_days" integer NOT NULL DEFAULT '0', "published_at" TIMESTAMP WITH TIME ZONE, "published_by_identity_issuer" character varying(120), "published_by_subject_id" character varying(160), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_baf26dab035c6d6fc433f9dc6a2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_versions_document_version_unique" ON "document_versions"  ("document_id", "version") `,
    );
    await queryRunner.query(
      `CREATE TABLE "acceptance_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "document_id" uuid NOT NULL, "version_id" uuid NOT NULL, "issuer_id" uuid NOT NULL, "application_id" uuid NOT NULL, "organization_id" character varying(120), "product_tenant_id" character varying(120), "role" character varying(120), "acceptance_mode" character varying(40) NOT NULL, "is_blocking" boolean NOT NULL DEFAULT true, "starts_at" TIMESTAMP WITH TIME ZONE, "ends_at" TIMESTAMP WITH TIME ZONE, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2f50eb811f7fce56897fb96c1e0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_rules_document_context" ON "acceptance_rules"  ("document_id", "application_id", "organization_id", "product_tenant_id", "role", "acceptance_mode") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_rules_version" ON "acceptance_rules"  ("version_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "acceptances" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "issuer_id" uuid NOT NULL, "application_id" uuid NOT NULL, "organization_id" character varying(120), "product_tenant_id" character varying(120), "identity_issuer" character varying(120) NOT NULL, "subject_id" character varying(160) NOT NULL, "document_id" uuid NOT NULL, "document_version_id" uuid NOT NULL, "acceptance_rule_id" uuid NOT NULL, "accepted_by_identity_issuer" character varying(120) NOT NULL, "accepted_by_subject_id" character varying(160) NOT NULL, "acceptance_mode" character varying(40) NOT NULL, "role_at_acceptance" character varying(120), "ip_address" character varying(80), "user_agent" text, "session_id" character varying(160), "authentication_method" character varying(80), "locale" character varying(12), "content_hash" character varying(64) NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "evidence_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6840f857db91deb6c376da14c19" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_acceptances_context" ON "acceptances"  ("issuer_id", "application_id", "organization_id", "product_tenant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_acceptances_actor" ON "acceptances"  ("identity_issuer", "subject_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "consumed_access_events" ("event_id" character varying(160) NOT NULL, "consumer_name" character varying(120) NOT NULL, "event_type" character varying(160) NOT NULL, "consumed_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dd7f6f842b9febde9a2c7ae4bdd" PRIMARY KEY ("event_id", "consumer_name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_consumed_access_events_unique" ON "consumed_access_events"  ("event_id", "consumer_name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "evidence" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "acceptance_id" uuid NOT NULL, "document_version_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "s3_bucket" character varying(255), "s3_object_key" character varying(1024), "s3_version_id" character varying(255), "content_type" character varying(120) NOT NULL DEFAULT 'application/json', "size_bytes" bigint, "sha256" character varying(64), "failure_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b864cb5d49854f89917fc0b44b9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_evidence_acceptance_unique" ON "evidence"  ("acceptance_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "trace_id" character varying(80) NOT NULL, "correlation_id" character varying(160), "trace_parent" character varying(160), "subject" character varying(240), "event_type" character varying(120) NOT NULL, "payload" jsonb NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "attempt_count" integer NOT NULL DEFAULT '0', "next_run_at" TIMESTAMP WITH TIME ZONE, "processed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6689a16c00d09b8089f6237f1d2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_outbox_status_created_at" ON "outbox_events"  ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source_event_id" uuid, "issuer_id" uuid NOT NULL, "application_id" uuid NOT NULL, "document_id" uuid, "document_version_id" uuid, "acceptance_rule_id" uuid, "organization_id" character varying(120), "product_tenant_id" character varying(120), "channel" character varying(20) NOT NULL, "recipient_logical_id" character varying(320) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "attempt_count" integer NOT NULL DEFAULT '0', "last_error" text, "next_run_at" TIMESTAMP WITH TIME ZONE, "sent_at" TIMESTAMP WITH TIME ZONE, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_notifications_source_recipient_unique" ON "notifications"  ("source_event_id", "channel", "recipient_logical_id") WHERE "source_event_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_notifications_context" ON "notifications"  ("issuer_id", "application_id", "document_version_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_notifications_status_next_run" ON "notifications"  ("status", "next_run_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("role_id" uuid NOT NULL, "permission_code" character varying(120) NOT NULL, CONSTRAINT "PK_0938f91f02174dc620f8cdfed89" PRIMARY KEY ("role_id", "permission_code"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_role_permissions_unique" ON "role_permissions"  ("role_id", "permission_code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(80) NOT NULL, "name" character varying(160) NOT NULL, "is_system" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_roles_code_unique" ON "roles"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "identity_issuer" character varying(120) NOT NULL, "subject_id" character varying(160) NOT NULL, "role_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_706d16104745b32d75df5836135" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_memberships_identity_tenant_unique" ON "tenant_memberships"  ("tenant_id", "identity_issuer", "subject_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "product_tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" character varying(120) NOT NULL, "external_tenant_id" character varying(160), "code" character varying(120) NOT NULL, "name" character varying(160) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_274baaea1764e7922c1990b0492" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_product_tenants_external_unique" ON "product_tenants"  ("external_tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_product_tenants_organization_unique" ON "product_tenants"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "publication_assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "publication_id" uuid NOT NULL, "kind" character varying(20) NOT NULL, "s3_bucket" character varying(255) NOT NULL, "s3_object_key" character varying(1024) NOT NULL, "s3_version_id" character varying(255), "content_type" character varying(120) NOT NULL, "size_bytes" bigint NOT NULL, "sha256" character varying(64) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_780eb963656e062b5db8b71b450" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_publication_assets_publication_kind_unique" ON "publication_assets"  ("publication_id", "kind") `,
    );
    await queryRunner.query(
      `CREATE TABLE "publications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "document_id" uuid NOT NULL, "document_version_id" uuid NOT NULL, "issuer_id" uuid NOT NULL, "application_id" uuid NOT NULL, "document_type" character varying(40) NOT NULL, "product_id" character varying(120) NOT NULL, "organization_id" character varying(120), "product_tenant_id" character varying(120), "documentKey" character varying(80) NOT NULL, "version" character varying(40) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL, "effective_until" TIMESTAMP WITH TIME ZONE, "acceptance_deadline" TIMESTAMP WITH TIME ZONE, "grace_period_days" integer NOT NULL DEFAULT '0', "rules_snapshot" jsonb NOT NULL, "content_markdown" text NOT NULL, "content_html" text NOT NULL, "content_hash" character varying(64) NOT NULL, "manifest_hash" character varying(64), "requested_by_identity_issuer" character varying(120) NOT NULL, "requested_by_subject_id" character varying(160) NOT NULL, "published_by_identity_issuer" character varying(120), "published_by_subject_id" character varying(160), "published_at" TIMESTAMP WITH TIME ZONE, "failure_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2c4e732b044e09139d2f1065fae" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_legal_publications_version_unique" ON "publications"  ("document_id", "version") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_publications_document_status" ON "publications"  ("document_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "widgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_da23136dbcfc91424451e24b725" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "FK_d6a93327a49d65e53e10dce5ca3" FOREIGN KEY ("issuer_id") REFERENCES "issuers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_ea0726107b056eba7d50559e15e" FOREIGN KEY ("issuer_id") REFERENCES "issuers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_723c3078829240efb0f35eb4c9d" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" ADD CONSTRAINT "FK_ac75577bca976d6d581b0f459b6" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptance_rules" ADD CONSTRAINT "FK_13badd62b75fc88c7fd9bd55dbd" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptance_rules" ADD CONSTRAINT "FK_ce52ca8c2869b0863a2fa359949" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptances" ADD CONSTRAINT "FK_0bf678620b6adeac6728bd96db7" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptances" ADD CONSTRAINT "FK_3c44e6df00834b63559cb3e8b49" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptances" ADD CONSTRAINT "FK_627726fda7371d73b3f8c5990d6" FOREIGN KEY ("acceptance_rule_id") REFERENCES "acceptance_rules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence" ADD CONSTRAINT "FK_2edab1bbc0e69b4dd06cab9aef3" FOREIGN KEY ("acceptance_id") REFERENCES "acceptances"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_b283fae5224c695e227e3e62896" FOREIGN KEY ("source_event_id") REFERENCES "outbox_events"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_memberships" ADD CONSTRAINT "FK_d22937ebccd641b5090849e51f7" FOREIGN KEY ("tenant_id") REFERENCES "product_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_memberships" ADD CONSTRAINT "FK_fa9ba14be22683296a780a57c6f" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "publications" ADD CONSTRAINT "FK_1403f438d3d5294d12e00cf8bc5" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "publications" DROP CONSTRAINT "FK_1403f438d3d5294d12e00cf8bc5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_memberships" DROP CONSTRAINT "FK_fa9ba14be22683296a780a57c6f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_memberships" DROP CONSTRAINT "FK_d22937ebccd641b5090849e51f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_b283fae5224c695e227e3e62896"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence" DROP CONSTRAINT "FK_2edab1bbc0e69b4dd06cab9aef3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptances" DROP CONSTRAINT "FK_627726fda7371d73b3f8c5990d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptances" DROP CONSTRAINT "FK_3c44e6df00834b63559cb3e8b49"`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptances" DROP CONSTRAINT "FK_0bf678620b6adeac6728bd96db7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptance_rules" DROP CONSTRAINT "FK_ce52ca8c2869b0863a2fa359949"`,
    );
    await queryRunner.query(
      `ALTER TABLE "acceptance_rules" DROP CONSTRAINT "FK_13badd62b75fc88c7fd9bd55dbd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" DROP CONSTRAINT "FK_ac75577bca976d6d581b0f459b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_723c3078829240efb0f35eb4c9d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_ea0726107b056eba7d50559e15e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "FK_d6a93327a49d65e53e10dce5ca3"`,
    );
    await queryRunner.query(`DROP TABLE "widgets"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_publications_document_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_publications_version_unique"`,
    );
    await queryRunner.query(`DROP TABLE "publications"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_publication_assets_publication_kind_unique"`,
    );
    await queryRunner.query(`DROP TABLE "publication_assets"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_product_tenants_organization_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_product_tenants_external_unique"`,
    );
    await queryRunner.query(`DROP TABLE "product_tenants"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_memberships_identity_tenant_unique"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_memberships"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_roles_code_unique"`,
    );
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_role_permissions_unique"`,
    );
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_notifications_status_next_run"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_notifications_context"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_notifications_source_recipient_unique"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_outbox_status_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_evidence_acceptance_unique"`,
    );
    await queryRunner.query(`DROP TABLE "evidence"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_consumed_access_events_unique"`,
    );
    await queryRunner.query(`DROP TABLE "consumed_access_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_acceptances_actor"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_acceptances_context"`,
    );
    await queryRunner.query(`DROP TABLE "acceptances"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_legal_rules_version"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_rules_document_context"`,
    );
    await queryRunner.query(`DROP TABLE "acceptance_rules"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_versions_document_version_unique"`,
    );
    await queryRunner.query(`DROP TABLE "document_versions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_documents_context_key_locale_unique"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_applications_issuer_key_unique"`,
    );
    await queryRunner.query(`DROP TABLE "applications"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_legal_issuers_key_unique"`,
    );
    await queryRunner.query(`DROP TABLE "issuers"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_legal_audit_context"`);
    await queryRunner.query(`DROP TABLE "audit_events"`);
  }
}
