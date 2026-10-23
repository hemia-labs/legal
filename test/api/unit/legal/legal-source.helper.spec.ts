import { BadRequestException } from '@nestjs/common';
import {
  analyzeLegalSource,
  canonicalMarkdown,
  extractHtmlSections,
  sanitizeHtml,
} from '../../../../apps/api/src/modules/legal/helpers/legal-source.helper';

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

  it('preserves legal document typography while blocking executable CSS and HTML', () => {
    const html = sanitizeHtml(
      '<head><title>Hidden title</title></head><div style="color:#0f5f68;padding:24px;position:fixed;background-image:url(https://evil.test/track)"><h1 style="font-size:32px">Términos</h1><span style="color:expression(alert(1))" onclick="alert(1)">Texto</span><script>alert(1)</script></div>',
    );
    expect(html).toContain('color:#0f5f68');
    expect(html).toContain('padding:24px');
    expect(html).toContain('font-size:32px');
    expect(html).toContain('Términos');
    expect(html).not.toMatch(
      /Hidden title|position|background-image|expression|onclick|<script/,
    );
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

  it('adds stable ids to headings so the console can navigate by section', () => {
    const { html, sections } = extractHtmlSections(
      '<h1>Introducción</h1><p>Texto</p><h2 id="old">Uso &amp; condiciones</h2><h3></h3>',
    );

    expect(sections).toEqual([
      { id: 'legal-section-1', label: 'Introducción', level: 1 },
      { id: 'legal-section-2', label: 'Uso & condiciones', level: 2 },
    ]);
    expect(html).toContain('<h1 id="legal-section-1">Introducción</h1>');
    expect(html).toContain(
      '<h2 id="legal-section-2">Uso &amp; condiciones</h2>',
    );
    expect(html).not.toContain('id="old"');
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
    expect(sanitizeHtml('<iframe src="evil"></iframe>')).not.toContain(
      'iframe',
    );
    expect(() =>
      analyzeLegalSource({
        buffer: Buffer.from('docx'),
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: 'terms.docx',
      }),
    ).toThrow(BadRequestException);
  });
});
