import DOMPurify from 'dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'table', 'thead',
      'tbody', 'tr', 'td', 'th', 'pre', 'code', 'blockquote', 'div',
      'span', 'hr', 'dl', 'dt', 'dd', 'sup', 'sub', 's', 'u',
    ],
    ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'class', 'style', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
  });
}
