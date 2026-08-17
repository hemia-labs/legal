export const LEGAL_DOCUMENT_TYPES = [
  {
    code: 'terms_and_conditions',
    name: 'Términos y condiciones',
  },
  {
    code: 'privacy_notice',
    name: 'Aviso de privacidad',
  },
  {
    code: 'acceptable_use_policy',
    name: 'Política de uso aceptable',
  },
  {
    code: 'ai_usage_policy',
    name: 'Política de uso de IA',
  },
  {
    code: 'cookie_policy',
    name: 'Política de cookies',
  },
  {
    code: 'security_policy',
    name: 'Política de seguridad',
  },
  {
    code: 'data_processing_agreement',
    name: 'Acuerdo de tratamiento de datos',
  },
  {
    code: 'saas_agreement',
    name: 'Contrato SaaS',
  },
  {
    code: 'nda',
    name: 'Acuerdo de confidencialidad',
  },
  {
    code: 'custom_policy',
    name: 'Política personalizada',
  },
  {
    code: 'terms',
    name: 'Términos y condiciones (legado)',
  },
] as const;

export const LEGAL_DOCUMENT_TYPE_CODES = LEGAL_DOCUMENT_TYPES.map(
  ({ code }) => code,
);
