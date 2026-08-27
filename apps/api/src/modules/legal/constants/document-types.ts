import type { SourceKind } from '../../storage/types/storage.types';

export type LegalDocumentWorkflow = 'public' | 'internal';
export type LegalDocumentVariant = 'standard' | 'integral' | 'simplified' | 'short';
export type AcceptancePolicy = 'required' | 'optional' | 'configurable';

export type LegalDocumentPolicy = {
  name: string;
  workflow: LegalDocumentWorkflow;
  allowedSourceKinds: readonly SourceKind[];
  requiresHtml: boolean;
  acceptance: AcceptancePolicy;
  variants: readonly LegalDocumentVariant[];
};

const publicPolicy = (
  name: string,
  acceptance: AcceptancePolicy = 'configurable',
) => ({
  name,
  workflow: 'public' as const,
  allowedSourceKinds: ['markdown', 'html'] as const,
  requiresHtml: true,
  acceptance,
  variants: ['standard'] as const,
});

export const LEGAL_DOCUMENT_POLICIES: Record<string, LegalDocumentPolicy> = {
  terms_and_conditions: publicPolicy('Términos y condiciones', 'required'),
  privacy_notice: {
    ...publicPolicy('Aviso de privacidad'),
    variants: ['integral', 'simplified', 'short'],
  },
  acceptable_use_policy: publicPolicy('Política de uso aceptable'),
  ai_usage_policy: publicPolicy('Política de uso de IA'),
  cookie_policy: publicPolicy('Política de cookies'),
  security_policy: publicPolicy('Política de seguridad'),
  custom_policy: publicPolicy('Política personalizada'),
  data_processing_agreement: {
    name: 'Acuerdo de tratamiento de datos',
    workflow: 'internal',
    allowedSourceKinds: ['pdf', 'markdown', 'html'],
    requiresHtml: false,
    acceptance: 'optional',
    variants: ['standard'],
  },
  saas_agreement: {
    name: 'Contrato SaaS',
    workflow: 'internal',
    allowedSourceKinds: ['pdf', 'markdown', 'html'],
    requiresHtml: false,
    acceptance: 'optional',
    variants: ['standard'],
  },
  nda: {
    name: 'Acuerdo de confidencialidad',
    workflow: 'internal',
    allowedSourceKinds: ['pdf', 'markdown', 'html'],
    requiresHtml: false,
    acceptance: 'optional',
    variants: ['standard'],
  },
};

export const LEGAL_DOCUMENT_TYPES = Object.entries(LEGAL_DOCUMENT_POLICIES).map(
  ([code, policy]) => ({ code, ...policy }),
);

export const LEGAL_DOCUMENT_TYPE_CODES = Object.keys(LEGAL_DOCUMENT_POLICIES);

export function documentPolicy(documentType: string) {
  return LEGAL_DOCUMENT_POLICIES[documentType];
}
