import type { SourceKind } from '../../storage/types/storage.types';

export type LegalSourceUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size?: number;
  sourceKind?: SourceKind;
};

export type LegalSourceAnalysis = {
  kind: SourceKind;
  contentType: string;
  fileName: string;
  sourceHash: string;
  contentHash: string;
  canonicalBody: Buffer;
};
