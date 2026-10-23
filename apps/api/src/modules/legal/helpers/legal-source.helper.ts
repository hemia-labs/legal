import { createHash } from 'crypto';
import MarkdownIt from 'markdown-it';
import { BadRequestException } from '@nestjs/common';
import { filterXSS, getDefaultWhiteList } from 'xss';
import type { SourceKind } from '../../storage/types/storage.types';
import type {
  LegalSourceAnalysis,
  LegalSourceUpload,
} from '../types/legal-source.types';

export const MAX_LEGAL_SOURCE_SIZE = 10 * 1024 * 1024;

const markdown = new MarkdownIt();

export function analyzeLegalSource(
  file: LegalSourceUpload,
): LegalSourceAnalysis {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('Source file is required');
  }
  if (file.buffer.length > MAX_LEGAL_SOURCE_SIZE) {
    throw new BadRequestException('Source file exceeds the 10 MiB limit');
  }

  const kind = sourceKindForMime(file.mimetype);
  if (file.sourceKind && file.sourceKind !== kind) {
    throw new BadRequestException('Source kind does not match content type');
  }
  if (kind === 'pdf' && file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw new BadRequestException('Invalid PDF file');
  }

  const sourceHash = sha256(file.buffer);
  if (kind === 'pdf') {
    return {
      kind,
      contentType: 'application/pdf',
      fileName: safeFileName(file.originalname, 'source.pdf'),
      sourceHash,
      contentHash: sourceHash,
      canonicalBody: file.buffer,
    };
  }

  const text = file.buffer.toString('utf8');
  const html =
    kind === 'html'
      ? canonicalHtml(sanitizeHtml(text))
      : renderMarkdown(canonicalMarkdown(text));
  const canonicalBody = Buffer.from(html, 'utf8');

  return {
    kind,
    contentType: file.mimetype,
    fileName: safeFileName(
      file.originalname,
      `source.${kind === 'markdown' ? 'md' : 'html'}`,
    ),
    sourceHash,
    contentHash: sha256(canonicalBody),
    canonicalBody,
  };
}

export function sourceKindForMime(mimetype: string): SourceKind {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype === 'text/html') return 'html';
  if (mimetype === 'text/markdown') return 'markdown';
  throw new BadRequestException('Unsupported legal source format');
}

export function canonicalMarkdown(value: string) {
  return `${value.replace(/\r\n/g, '\n').trim()}\n`;
}

export function sanitizeHtml(value: string) {
  return filterXSS(value, {
    whiteList: Object.fromEntries(
      Object.entries(getDefaultWhiteList()).map(([tag, attributes]) => [
        tag,
        [
          'div',
          'span',
          'p',
          'h1',
          'h2',
          'h3',
          'ul',
          'ol',
          'li',
          'a',
          'strong',
        ].includes(tag)
          ? [...(attributes ?? []), 'style']
          : attributes,
      ]),
    ),
    css: {
      whiteList: Object.fromEntries(
        [
          'color',
          'background-color',
          'font-family',
          'font-size',
          'font-weight',
          'line-height',
          'letter-spacing',
          'text-align',
          'text-decoration',
          'padding',
          'margin',
          'border',
          'border-top',
          'border-bottom',
          'border-left',
          'border-color',
          'border-radius',
          'width',
          'max-width',
          'box-sizing',
          'overflow-wrap',
        ].map((property) => [property, true]),
      ),
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: [
      'head',
      'script',
      'style',
      'iframe',
      'object',
      'embed',
    ],
  });
}

export function canonicalHtml(value: string) {
  return `${value.replace(/\r\n/g, '\n').trim()}\n`;
}

export function renderMarkdown(value: string) {
  return canonicalHtml(sanitizeHtml(markdown.render(value)));
}

export type LegalHtmlSection = { id: string; label: string; level: number };

/** Adds stable ids to h1-h3 headings so the console can navigate the rendered document by section. */
export function extractHtmlSections(html: string): {
  html: string;
  sections: LegalHtmlSection[];
} {
  const sections: LegalHtmlSection[] = [];
  const body = html.replace(
    /<h([1-3])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (match: string, rawLevel: string, rawAttrs: string, inner: string) => {
      const label = decodeEntities(inner.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (!label) return match;
      const level = Number(rawLevel);
      const id = `legal-section-${sections.length + 1}`;
      sections.push({ id, label, level });
      const attrs = rawAttrs.replace(
        /\s+id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
        '',
      );
      return `<h${rawLevel}${attrs} id="${id}">${inner}</h${rawLevel}>`;
    },
  );
  return { html: body, sections };
}

const htmlEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string) {
  return value.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (entity: string, code: string) => {
      if (code.startsWith('#')) {
        const numeric = code[1]?.toLowerCase() === 'x';
        const point = Number.parseInt(
          numeric ? code.slice(2) : code.slice(1),
          numeric ? 16 : 10,
        );
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : entity;
      }
      return htmlEntities[code.toLowerCase()] ?? entity;
    },
  );
}

export function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeFileName(value: string | undefined, fallback: string) {
  const name = (value ?? fallback).split(/[\\/]/).pop() ?? fallback;
  const normalized = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.slice(0, 255) || fallback;
}
