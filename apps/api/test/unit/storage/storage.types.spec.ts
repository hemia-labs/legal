import {
  buildEvidenceKey,
  buildPublicationArtifactKey,
} from '../../../src/modules/storage/storage.types';

describe('storage keys', () => {
  it('builds deterministic publication keys with metadata.json', () => {
    expect(
      buildPublicationArtifactKey(
        {
          documentType: 'Terms & Conditions',
          productId: 'Loop',
          organizationId: null,
          tenantId: 'Tenant 1',
          documentKey: 'privacy_policy',
          version: '1.0.0',
        },
        'json',
      ),
    ).toBe(
      'documents/terms-conditions/loop/global/tenant-1/privacy_policy/1.0.0/metadata.json',
    );
  });

  it('rejects traversal and path injection', () => {
    expect(() =>
      buildPublicationArtifactKey(
        {
          documentType: '../terms',
          productId: 'loop',
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
});
