import { BadRequestException } from '@nestjs/common';
import {
  analyzeLegalSource,
  canonicalMarkdown,
  sanitizeHtml,
} from '../../../src/modules/legal/helpers/legal-source.helper';

describe('legal source helper', () => {
  it('hashes original HTML bytes separately from sanitized consumed content', () => {
    const source = Buffer.from('<h1>Terms</h1><script>alert(1)</script>\r\n');
    const result = analyzeLegalSource({
      buffer: source,
      mimetype: 'text/html',
      originalname: 'terms.html',
    });

    expect(result.kind).toBe('html');
    expect(result.sourceHash).not.toBe(result.contentHash);
    expect(result.canonicalBody.toString()).not.toContain('<script>');
    expect(result.fileName).toBe('terms.html');
  });

  it('uses PDF bytes as both source and consumed content', () => {
    const result = analyzeLegalSource({
      buffer: Buffer.from('%PDF-1.7 legal'),
      mimetype: 'application/pdf',
      originalname: '../terms.pdf',
    });

    expect(result.sourceHash).toBe(result.contentHash);
    expect(result.fileName).toBe('terms.pdf');
  });

  it('renders Markdown to sanitized HTML and rejects unsupported formats', () => {
    const result = analyzeLegalSource({
      buffer: Buffer.from('# Terms\r\n\n<script>alert(1)</script>'),
      mimetype: 'text/markdown',
      originalname: 'terms.md',
    });

    expect(result.canonicalBody.toString()).toContain('<h1>Terms</h1>');
    expect(result.canonicalBody.toString()).not.toContain('<script>');
    expect(canonicalMarkdown('# Terms\r\n')).toBe('# Terms\n');
    expect(sanitizeHtml('<iframe src="evil"></iframe>')).not.toContain('iframe');
    expect(() => analyzeLegalSource({
      buffer: Buffer.from('docx'),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      originalname: 'terms.docx',
    })).toThrow(BadRequestException);
  });
});
