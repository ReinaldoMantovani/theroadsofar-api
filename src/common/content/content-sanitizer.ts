import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import {
  ALLOWED_ATTRIBUTES, ALLOWED_IFRAME_HOSTS, ALLOWED_MARK_TYPES, ALLOWED_NODE_TYPES, ALLOWED_STYLES, ALLOWED_TAGS,
  CONTENT_SCHEMA, CONTENT_VERSION, MAX_CONTENT_JSON_BYTES, MAX_DOC_DEPTH, SAFE_URL,
} from './content-policy';

/** Sanitiza o HTML de um artigo com a política de conteúdo */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'], video: ['http', 'https'], audio: ['http', 'https'], source: ['http', 'https'] },
    allowProtocolRelative: false,
    allowedIframeHostnames: ALLOWED_IFRAME_HOSTS,
    allowIframeRelativeUrls: false,
    transformTags: {
      // links externos abrem em nova aba sem vazar referer
      a: (tagName, attribs) => {
        const external = /^https?:\/\//i.test(attribs.href || '');
        return {
          tagName,
          attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } : attribs,
        };
      },
      // o único input permitido é o checkbox desabilitado das checklists
      input: (tagName, attribs) => ({ tagName, attribs: { type: 'checkbox', disabled: 'disabled', ...(attribs.checked !== undefined ? { checked: 'checked' } : {}) } }),
    },
    exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox',
  });
}

export interface ContentDocument { schema: string; version: number; doc: TiptapNode }
interface TiptapNode { type: string; attrs?: Record<string, unknown>; content?: TiptapNode[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string }

const URL_ATTRS = new Set(['src', 'href', 'url', 'poster', 'coverUrl', 'imageUrl', 'beforeSrc', 'afterSrc']);

/**
 * Valida o documento do editor: esquema/versão, tipos permitidos, profundidade, tamanho e URLs.
 * Retorna o documento normalizado (atributos com URL insegura são removidos).
 */
export function validateContentJson(input: unknown): ContentDocument | null {
  if (input === null || input === undefined) return null;
  const raw = JSON.stringify(input);
  if (raw.length > MAX_CONTENT_JSON_BYTES) throw new BadRequestException('Conteúdo do editor excede 3 MB');

  const value = input as Partial<ContentDocument>;
  if (value.schema !== CONTENT_SCHEMA) throw new BadRequestException(`contentJson.schema deve ser "${CONTENT_SCHEMA}"`);
  if (value.version !== CONTENT_VERSION) throw new BadRequestException(`Versão de conteúdo não suportada: ${value.version}`);
  if (!value.doc || value.doc.type !== 'doc') throw new BadRequestException('contentJson.doc deve ser um documento');

  const walk = (node: TiptapNode, depth: number): TiptapNode => {
    if (depth > MAX_DOC_DEPTH) throw new BadRequestException('Conteúdo aninhado demais');
    if (!node || typeof node.type !== 'string' || !ALLOWED_NODE_TYPES.has(node.type)) {
      throw new BadRequestException(`Bloco não permitido: ${node?.type ?? '(vazio)'}`);
    }
    const out: TiptapNode = { type: node.type };
    if (node.attrs && typeof node.attrs === 'object') {
      const attrs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node.attrs)) {
        if (URL_ATTRS.has(k) && typeof v === 'string' && v && !SAFE_URL.test(v)) continue; // URL insegura: descarta
        attrs[k] = v;
      }
      out.attrs = attrs;
    }
    if (typeof node.text === 'string') out.text = node.text;
    if (Array.isArray(node.marks)) {
      out.marks = node.marks.filter((m) => {
        if (!ALLOWED_MARK_TYPES.has(m?.type)) throw new BadRequestException(`Formatação não permitida: ${m?.type}`);
        if (m.type === 'link' && m.attrs && typeof m.attrs.href === 'string' && !SAFE_URL.test(m.attrs.href)) return false;
        return true;
      });
    }
    if (Array.isArray(node.content)) out.content = node.content.map((c) => walk(c, depth + 1));
    return out;
  };

  return { schema: CONTENT_SCHEMA, version: CONTENT_VERSION, doc: walk(value.doc as TiptapNode, 0) };
}

/** Texto puro do HTML (para tempo de leitura, busca, SEO) */
export function htmlToText(html: string): string {
  return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

export function estimateReadTime(html: string): number {
  const words = htmlToText(html).split(' ').filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
