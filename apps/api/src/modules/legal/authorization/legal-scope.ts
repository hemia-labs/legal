import { Raw } from 'typeorm';
import type {
  LegalAuthorization,
  LegalAssignment,
} from './legal-authorization';
import { grantsFor } from './legal-authorization';

export type LegalTable =
  | 'issuers'
  | 'applications'
  | 'documents'
  | 'acceptances'
  | 'notifications'
  | 'audit_events';
/** One disjunct per assignment: resource and consumer scopes may never be cross-joined. */
export function scopePredicate(
  auth: LegalAuthorization | undefined,
  permission: string,
  table: LegalTable,
  options = false,
) {
  const grants = grantsFor(auth, permission);
  const parameters: Record<string, string[]> = {};
  const issuer = table === 'issuers' ? 't.id' : 't.issuer_id';
  const application = table === 'applications' ? 't.id' : 't.application_id';
  const historical =
    permission.endsWith('.view') ||
    permission.endsWith('.export') ||
    permission.endsWith('.cancel');
  const parts = grants.map((grant, index) => {
    const r = grant.resource_scope;
    const managesCatalog = grant.role_code === 'legal.catalog_manager';
    const issuerState =
      historical || managesCatalog ? '' : " AND si.status = 'active'";
    const applicationState =
      historical || managesCatalog ? '' : " AND sa.status = 'active'";
    parameters[`lr${index}`] = r.ids;
    parameters[`lc${index}`] = grant.consumer_scope.organization_ids;
    let resource: string;
    if (r.type === 'legal_global') resource = 'TRUE';
    else if (r.type === 'issuers')
      resource = `${issuer} = ANY(CAST(:lr${index} AS uuid[])) AND EXISTS (SELECT 1 FROM issuers si WHERE si.id = ${issuer} AND si.deleted_at IS NULL ${issuerState})`;
    else if (table === 'issuers')
      resource = options
        ? `EXISTS (SELECT 1 FROM applications sa WHERE sa.issuer_id = t.id AND sa.id = ANY(CAST(:lr${index} AS uuid[])) AND sa.deleted_at IS NULL ${applicationState})`
        : 'FALSE';
    else
      resource = `${application} = ANY(CAST(:lr${index} AS uuid[])) AND EXISTS (SELECT 1 FROM applications sa JOIN issuers si ON si.id = sa.issuer_id WHERE sa.id = ${application} AND sa.issuer_id = ${issuer} AND sa.deleted_at IS NULL ${applicationState} AND si.deleted_at IS NULL ${issuerState})`;
    let consumer = 'TRUE';
    if (table === 'acceptances' || table === 'notifications')
      consumer =
        consumerPredicate(grant, index, 't') +
        (permission === 'legal.notifications.retry'
          ? " AND EXISTS (SELECT 1 FROM applications live_app JOIN issuers live_issuer ON live_issuer.id = live_app.issuer_id WHERE live_app.id = t.application_id AND live_app.issuer_id = t.issuer_id AND live_app.status = 'active' AND live_issuer.status = 'active')"
          : '');
    if (table === 'audit_events') {
      // Only evidence with verifiable provenance is exposed. Never trust arbitrary metadata.
      consumer = `((t.entity_type = 'legal_issuer' AND t.entity_id = t.issuer_id AND t.action IN ('legal.issuer.create','legal.issuer.edit','legal.issuer.archive','legal.issuer.unarchive','legal.issuer.delete','legal.issuer.status_change') AND EXISTS (SELECT 1 FROM issuers ai WHERE ai.id = t.issuer_id)) OR
(t.entity_type = 'legal_application' AND t.entity_id = t.application_id AND t.action IN ('legal.application.create','legal.application.edit','legal.application.archive','legal.application.unarchive','legal.application.delete','legal.application.status_change') AND EXISTS (SELECT 1 FROM applications aa WHERE aa.id = t.application_id AND aa.issuer_id = t.issuer_id)) OR
(t.entity_type = 'legal_document' AND t.action IN ('legal.document.create','legal.document.edit','legal.document.archive','legal.document.delete') AND EXISTS (SELECT 1 FROM documents ad WHERE ad.id = t.entity_id AND ad.application_id = t.application_id AND ad.issuer_id = t.issuer_id)) OR
(t.entity_type = 'legal_document_version' AND t.action IN ('legal.version.draft_create','legal.version.draft_edit','legal.version.publish') AND EXISTS (SELECT 1 FROM document_versions av JOIN documents ad ON ad.id = av.document_id WHERE av.id = t.entity_id AND ad.application_id = t.application_id AND ad.issuer_id = t.issuer_id)) OR
(t.entity_type = 'legal_publication' AND t.action IN ('legal.publication.request','legal.publication.retry') AND EXISTS (SELECT 1 FROM publications ap WHERE ap.id = t.entity_id AND ap.application_id = t.application_id AND ap.issuer_id = t.issuer_id)) OR
(t.entity_type='legal_service_client' AND t.action='legal.service_client.save' AND EXISTS (SELECT 1 FROM applications sca WHERE sca.id=t.application_id AND sca.issuer_id=t.issuer_id)) OR
(t.entity_type='external_identity_source' AND t.action IN ('legal.integration.create','legal.integration.edit','legal.integration.disable') AND EXISTS (SELECT 1 FROM external_identity_sources es WHERE es.id=t.entity_id AND es.issuer_id=t.issuer_id AND es.application_id=t.application_id)) OR
EXISTS (SELECT 1 FROM acceptances ev WHERE t.entity_type = 'legal_acceptance' AND ev.id = t.entity_id AND ev.issuer_id = t.issuer_id AND ev.application_id = t.application_id AND ${consumerPredicate(grant, index, 'ev')}) OR EXISTS (SELECT 1 FROM notifications ev WHERE t.entity_type = 'legal_notification' AND ev.id = t.entity_id AND ev.issuer_id = t.issuer_id AND ev.application_id = t.application_id AND ${consumerPredicate(grant, index, 'ev')}))`;
    }
    return `((${resource}) AND (${consumer}))`;
  });
  const live = ['issuers', 'applications', 'documents'].includes(table)
    ? 't.deleted_at IS NULL AND '
    : '';
  const relation =
    table === 'applications'
      ? 'EXISTS (SELECT 1 FROM issuers parent WHERE parent.id = t.issuer_id AND parent.deleted_at IS NULL) AND '
      : table === 'documents'
        ? 'EXISTS (SELECT 1 FROM applications parent JOIN issuers grandparent ON grandparent.id = parent.issuer_id WHERE parent.id = t.application_id AND parent.issuer_id = t.issuer_id AND parent.deleted_at IS NULL AND grandparent.deleted_at IS NULL) AND '
        : '';
  return { sql: `${live}${relation}(${parts.join(' OR ')})`, parameters };
}
// Scope filtering remains in SQL; LegalConsumerAccessService verifies every returned organization with Access before serialization or notification mutations.
function consumerPredicate(
  grant: LegalAssignment,
  index: number,
  alias: string,
) {
  const scope = grant.consumer_scope;
  if (!['organizations', 'all_organizations'].includes(scope.type))
    return 'FALSE';
  const selected =
    scope.type === 'organizations'
      ? `${alias}.organization_id = ANY(CAST(:lc${index} AS text[])) AND `
      : '';
  return `${selected}${alias}.organization_id IS NOT NULL AND EXISTS (SELECT 1 FROM applications ca JOIN issuers ci ON ci.id = ca.issuer_id WHERE ca.id = ${alias}.application_id AND ca.issuer_id = ${alias}.issuer_id AND ca.deleted_at IS NULL AND ci.deleted_at IS NULL)`;
}
export function scopedId(
  auth: LegalAuthorization | undefined,
  permission: string,
  table: LegalTable,
  options = false,
) {
  const { sql, parameters } = scopePredicate(auth, permission, table, options);
  return Raw(
    (column) => `${column} IN (SELECT t.id FROM ${table} t WHERE ${sql})`,
    parameters,
  );
}
