import DOMPurify from 'dompurify';

// Enforce rel="noopener noreferrer" on all links to prevent reverse tabnabbing
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'b',
      'i',
      'em',
      'strong',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'pre',
      'code',
      'blockquote',
      'div',
      'span',
      'hr',
      'dl',
      'dt',
      'dd',
      'sup',
      'sub',
      's',
      'u',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
  });
}
