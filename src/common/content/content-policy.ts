/**
 * POLÍTICA DE CONTEÚDO DOS ARTIGOS (trsf-blocks v1)
 *
 * Fonte única do que o editor pode salvar e o blog pode renderizar.
 * O admin (Tiptap) gera:
 *   - contentJson: { schema: 'trsf-blocks', version: 1, doc: <documento Tiptap> }
 *   - contentHtml: HTML renderizado pelos próprios blocos
 * O backend valida o JSON (tipos de bloco permitidos) e sanitiza o HTML com a lista abaixo.
 * O blog público usa a MESMA lista no seu sanitizador (frontend/src/utils/htmlSanitizer.ts).
 */

export const CONTENT_SCHEMA = 'trsf-blocks';
export const CONTENT_VERSION = 1;

/** Tipos de nó aceitos no JSON do editor */
export const ALLOWED_NODE_TYPES = new Set([
  'doc', 'paragraph', 'text', 'heading', 'hardBreak', 'horizontalRule',
  'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem',
  'blockquote', 'codeBlock',
  'table', 'tableRow', 'tableHeader', 'tableCell',
  // mídia
  'figureImage', 'gallery', 'videoBlock', 'audioBlock', 'youtube', 'pdfEmbed', 'imageCompare', 'mediaText', 'mediaTextBody',
  // layout
  'columns', 'column', 'spacer', 'card', 'accordion', 'accordionTitle', 'accordionContent',
  'buttonLink', 'callout', 'relatedLinks', 'pullQuote', 'footnotes',
  // The Road So Far
  'dossier', 'evidence', 'timeline', 'witness', 'confidential', 'caseMap',
]);

export const ALLOWED_MARK_TYPES = new Set([
  'bold', 'italic', 'underline', 'strike', 'code', 'link', 'highlight', 'censored', 'superscript', 'subscript', 'textStyle',
]);

/** Tags HTML permitidas no conteúdo publicado */
export const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'mark', 'sup', 'sub', 'small',
  'a', 'blockquote', 'cite', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
  'figure', 'figcaption', 'img', 'video', 'audio', 'source', 'iframe',
  'div', 'span', 'section', 'aside', 'header', 'footer', 'details', 'summary', 'time', 'dl', 'dt', 'dd', 'label', 'input',
];

/** Atributos data-* usados pelos blocos (todos os outros são removidos) */
export const ALLOWED_DATA_ATTRS = [
  'data-type', 'data-checked', 'data-variant', 'data-columns', 'data-align', 'data-width', 'data-reveal',
  'data-case-slug', 'data-classification', 'data-status', 'data-kind', 'data-footnote', 'data-height', 'data-layout',
];

export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'target', 'rel', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  video: ['src', 'controls', 'preload', 'poster', 'playsinline', 'muted', 'loop'],
  audio: ['src', 'controls', 'preload', 'loop'],
  source: ['src', 'type'],
  iframe: ['src', 'title', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy', 'frameborder'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  ol: ['start'],
  time: ['datetime'],
  input: ['type', 'checked', 'disabled'],
  details: ['open'],
  '*': ['class', 'id', 'style', 'role', 'aria-label', 'aria-hidden', ...ALLOWED_DATA_ATTRS],
};

/** Únicos estilos inline aceitos (largura de imagem, alinhamento de texto) */
export const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  '*': {
    width: [/^\d{1,3}(\.\d+)?%$/],
    'text-align': [/^(left|right|center|justify)$/],
    height: [/^\d{1,4}px$/],
  },
};

/** Iframes só do YouTube (versão sem cookies) */
export const ALLOWED_IFRAME_HOSTS = ['www.youtube-nocookie.com', 'www.youtube.com'];

/** URLs aceitas em src/href: http(s), uploads locais, âncoras e mailto */
export const SAFE_URL = /^(https?:\/\/|\/uploads\/|\/artigo\/|\/mapa\/|#|mailto:)/i;

export const MAX_CONTENT_JSON_BYTES = 3 * 1024 * 1024;
export const MAX_DOC_DEPTH = 24;
