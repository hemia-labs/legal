import {
  buildEvidenceKey,
  buildPublicationArtifactKey,
  buildPublicationSourceKey,
} from '../../../src/modules/storage/types/storage.types';

describe('storage keys', () => {
  it('builds deterministic publication keys with metadata.json', () => {
    expect(
      buildPublicationArtifactKey(
        {
          issuerId: 'Issuer',
          productId: 'Loop',
          locale: 'es-MX',
          organizationId: null,
          tenantId: 'Tenant 1',
          documentKey: 'privacy_policy',
          version: '1.0.0',
        },
        'json',
      ),
    ).toBe(
      'documents/issuer/loop/es-mx/global/tenant-1/privacy_policy/1.0.0/metadata.json',
    );
  });

  it('rejects traversal and path injection', () => {
    expect(() =>
      buildPublicationArtifactKey(
        {
          issuerId: '../terms',
          productId: 'loop',
          locale: 'es-MX',
          documentKey: 'terms',
          version: '1.0.0',
        },
        'html',
      ),
    ).toThrow();
    expect(buildEvidenceKey('issuer', 'application', 'acceptance')).toBe(
      'evidence/issuer/application/global/global/acceptance/evidence.json',
    );
  });

  it('isolates source keys by issuer, application, locale and version', () => {
    const key = buildPublicationSourceKey(
      {
        issuerId: 'issuer-1',
        productId: 'application-1',
        locale: 'es-MX',
        documentKey: 'terms',
        version: '1.0.0',
      },
      'html',
      'a'.repeat(64),
    );

    expect(key).toBe(
      'documents/issuer-1/application-1/es-mx/global/global/terms/1.0.0/source/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html',
    );
  });
});
