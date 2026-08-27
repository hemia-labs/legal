import {
  buildPublicationArtifactKey,
  buildPublicationSourceKey,
} from '../../../src/modules/storage/types/storage.types';

describe('storage keys', () => {
  it('builds deterministic publication artifact keys by document and version', () => {
    expect(
      buildPublicationArtifactKey(
        {
          documentId: 'Document 1',
          version: '1.0.0',
        },
        'html',
      ),
    ).toBe(
      'legal/documents/document-1/versions/1.0.0/html.html',
    );
  });

  it('rejects traversal and path injection', () => {
    expect(() =>
      buildPublicationArtifactKey(
        {
          documentId: '../terms',
          version: '1.0.0',
        },
        'html',
      ),
    ).toThrow();
  });

  it('builds draft source keys separately from published versions', () => {
    const key = buildPublicationSourceKey(
      {
        documentId: 'document-1',
        version: '1.0.0',
      },
      'html',
      'a'.repeat(64),
    );

    expect(key).toBe(
      'legal/documents/document-1/versions/1.0.0/source/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html',
    );

    expect(
      buildPublicationSourceKey(
        { documentId: 'document-1', version: 'draft' },
        'markdown',
        'b'.repeat(64),
      ),
    ).toBe(
      'legal/documents/document-1/draft/source/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.md',
    );
  });
});
